package br.com.hbxsystem.entrega

import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.content.Context
import org.json.JSONArray
import java.time.Instant
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

data class OperationalFlushResult(
    val pending: Boolean,
    val retry: Boolean,
)

/** Dreno único: prepara a cápsula, envia comprovantes e só depois confirma entregas. */
object OperationalSync {
    private const val JOB_ID = 0x48425832
    private val executor = Executors.newSingleThreadExecutor()
    private val queued = AtomicBoolean(false)
    private val flushLock = Any()

    fun requestFlush(context: Context) {
        val app = context.applicationContext
        scheduleFallbackIfNeeded(app)
        if (!queued.compareAndSet(false, true)) return
        executor.execute {
            try {
                val result = flushBlocking(app)
                if (result.pending && result.retry) scheduleFallback(app) else scheduleFallbackIfNeeded(app)
            } finally {
                queued.set(false)
                scheduleFallbackIfNeeded(app)
            }
        }
    }

    fun rescheduleIfPending(context: Context) = scheduleFallbackIfNeeded(context.applicationContext)

    fun flushBlocking(context: Context): OperationalFlushResult = synchronized(flushLock) {
        val app = context.applicationContext
        val store = OperationalStore(app)
        val network = OperationalNetwork.current(app)
        if (!network.validated) return@synchronized OperationalFlushResult(store.hasPending() || needsGrant(store), retry = true)
        val api = OperationalApiClient(app)
        var retry = false

        val candidate = store.grantCandidate()
        if (candidate != null && !OperationalPolicy.isGrantUsable(candidate.grantExpiresAtMs, System.currentTimeMillis())) {
            try {
                val response = api.prepareRoute(candidate.routeId)
                val token = response.optString("grant").trim()
                val expiresAt = response.optString("expiresAt").trim()
                val expiresAtMs = runCatching { Instant.parse(expiresAt).toEpochMilli() }.getOrNull()
                    ?: OperationalPolicy.routeExpiryMs(candidate.routeDate)
                    ?: throw IllegalStateException("O VPS não devolveu a validade da rota offline.")
                if (token.isBlank()) throw IllegalStateException("O VPS não devolveu a cápsula da rota.")
                store.saveGrant(candidate.routeId, token, response.optString("grantId").trim().ifBlank { null }, expiresAtMs)
            } catch (error: Throwable) {
                store.saveGrantError(candidate.routeId, error.message ?: "Não foi possível preparar a rota offline.")
                retry = isRetryable(error)
            }
        }

        val proofAllowed = OperationalPolicy.proofUploadAllowed(
            wifiOnly = store.proofWifiOnly(),
            validated = network.validated,
            unmetered = network.unmetered,
        )
        val routeIds = store.pendingOperationalRouteIds()
        for (routeId in routeIds) {
            val grant = store.grantForSync(routeId)
            if (grant == null) {
                if (store.pendingCommands().any { it.routeId == routeId } || store.pendingProofs().any { it.routeId == routeId }) {
                    retry = true
                }
                continue
            }

            if (proofAllowed) {
                for (proof in store.pendingProofs(limit = 20).filter { it.routeId == routeId }) {
                    try {
                        val response = api.uploadProof(grant, proof)
                        val remoteId = listOf("id", "comprovanteId", "proofId")
                            .asSequence()
                            .map { response.optString(it).trim() }
                            .firstOrNull(String::isNotEmpty)
                            ?: throw IllegalStateException("O VPS recebeu o arquivo sem devolver o identificador.")
                        store.markProofUploaded(proof, remoteId, deleteLocalFile = !store.retainProofAfterUpload())
                    } catch (error: Throwable) {
                        if (isPermanent(error)) store.markProofRejected(proof.id, error.message ?: "Comprovante rejeitado.")
                        else {
                            store.markProofRetry(proof.id, proof.attempts + 1, error.message ?: "Falha ao enviar comprovante.")
                            retry = true
                        }
                    }
                }
            } else if (store.pendingProofs(limit = 1).any { it.routeId == routeId }) {
                retry = true
            }

            val commands = store.pendingCommands(limit = 50).filter { it.routeId == routeId }
            val sendable = commands.filter { store.resolvedCommandPayload(it) != null }
            if (sendable.isNotEmpty()) {
                try {
                    val response = api.sync(grant, sendable, store)
                    val results = response.optJSONArray("results") ?: JSONArray()
                    val byId = sendable.associateBy { it.commandId }
                    val answered = mutableSetOf<String>()
                    for (index in 0 until results.length()) {
                        val item = results.optJSONObject(index) ?: continue
                        val id = item.optString("commandId").trim()
                        val command = byId[id] ?: continue
                        answered += id
                        when (item.optString("status").uppercase()) {
                            "ACK", "DUPLICATE" -> store.markCommandAck(command)
                            "REJECTED", "CONFLICT" -> store.markCommandRejected(
                                command,
                                item.optString("message", "Operação rejeitada pelo HBX."),
                            )
                            else -> {
                                store.markCommandRetry(command, item.optString("message", "Operação aguardando nova tentativa."))
                                retry = true
                            }
                        }
                    }
                    sendable.filterNot { it.commandId in answered }.forEach {
                        store.markCommandRetry(it, "O VPS não confirmou este comando no lote.")
                        retry = true
                    }
                } catch (error: Throwable) {
                    for (command in sendable) {
                        if (isPermanent(error)) store.markCommandRejected(command, error.message ?: "Operação rejeitada.")
                        else store.markCommandRetry(command, error.message ?: "Falha ao sincronizar operação.")
                    }
                    retry = retry || !isPermanent(error)
                }
            }
            if (commands.size > sendable.size) retry = true
        }

        OperationalFlushResult(pending = store.hasPending() || needsGrant(store), retry = retry)
    }

    private fun needsGrant(store: OperationalStore): Boolean {
        val candidate = store.grantCandidate() ?: return false
        return !OperationalPolicy.isGrantUsable(candidate.grantExpiresAtMs, System.currentTimeMillis())
    }

    private fun isPermanent(error: Throwable): Boolean {
        val status = (error as? OperationalApiClient.ApiException)?.statusCode ?: return false
        return status in 400..499 && status !in setOf(402, 408, 409, 425, 429)
    }

    private fun isRetryable(error: Throwable): Boolean = !isPermanent(error)

    private fun scheduleFallbackIfNeeded(context: Context) {
        val store = OperationalStore(context)
        if (!store.hasPending() && !needsGrant(store)) {
            cancelFallback(context)
            return
        }
        scheduleFallback(context)
    }

    private fun scheduleFallback(context: Context) {
        val scheduler = context.getSystemService(Context.JOB_SCHEDULER_SERVICE) as? JobScheduler ?: return
        val store = OperationalStore(context)
        val requiredNetwork = if (!store.hasPendingCommands() && store.hasPendingProofs() && store.proofWifiOnly()) {
            JobInfo.NETWORK_TYPE_UNMETERED
        } else {
            JobInfo.NETWORK_TYPE_ANY
        }
        val current = scheduler.getPendingJob(JOB_ID)
        if (current != null && current.networkType == requiredNetwork) return
        if (current != null) scheduler.cancel(JOB_ID)
        scheduler.schedule(
            JobInfo.Builder(JOB_ID, ComponentName(context, OperationalUploadJobService::class.java))
                .setRequiredNetworkType(requiredNetwork)
                .setPersisted(true)
                .setBackoffCriteria(30_000L, JobInfo.BACKOFF_POLICY_EXPONENTIAL)
                .build(),
        )
    }

    private fun cancelFallback(context: Context) {
        (context.getSystemService(Context.JOB_SCHEDULER_SERVICE) as? JobScheduler)?.cancel(JOB_ID)
    }
}
