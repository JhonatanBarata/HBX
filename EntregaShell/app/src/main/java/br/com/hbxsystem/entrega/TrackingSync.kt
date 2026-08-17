package br.com.hbxsystem.entrega

import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

data class TrackingFlushResult(
    val pending: Boolean,
    val retry: Boolean,
)

/** Um único dreno serial para o serviço, o heartbeat e o JobScheduler. */
object TrackingSync {
    private const val JOB_ID = 0x48425831
    private const val MAX_BATCHES_PER_RUN = 20

    /** Motivo gravado quando o disjuntor do teto de tentativas desarma. */
    private const val TETO = "teto_de_tentativas"
    private val executor = Executors.newSingleThreadExecutor()
    private val queued = AtomicBoolean(false)
    private val flushLock = Any()

    fun ensureRoute(context: Context, routeId: String, hintedSessionId: String? = null) {
        if (routeId.isBlank()) return
        val app = context.applicationContext
        val outbox = TrackingOutbox.get(app)
        outbox.ensureRoute(routeId, hintedSessionId)
        requestFlush(app)
    }

    fun requestFlush(context: Context) {
        val app = context.applicationContext
        scheduleFallbackIfPending(app)
        if (!queued.compareAndSet(false, true)) return
        executor.execute {
            try {
                val result = flushBlocking(app)
                if (result.pending && result.retry) scheduleFallback(app) else cancelFallback(app)
            } finally {
                queued.set(false)
                // Um ponto pode ter entrado depois do último SELECT e antes do
                // reset da flag; mantém o job como rede de segurança. Sem token,
                // aguarda novo pareamento em vez de martelar 401 em background.
                if (DeviceCredentialStore(app).readDeviceToken().isNullOrBlank()) {
                    cancelFallback(app)
                } else {
                    scheduleFallbackIfPending(app)
                }
            }
        }
    }

    fun rescheduleIfPending(context: Context) {
        scheduleFallbackIfPending(context.applicationContext)
    }

    fun flushBlocking(context: Context): TrackingFlushResult = synchronized(flushLock) {
        val app = context.applicationContext
        val outbox = TrackingOutbox.get(app)
        val sessionStore = TrackingSessionStore(app)
        val api = TrackingApiClient(app)
        var needsRetry = false
        var blockedByPairing = false

        routes@ for (routeId in outbox.pendingRouteIds()) {
            val sessionId = try {
                ensureSession(api, outbox, sessionStore, routeId)
            } catch (error: Throwable) {
                if (isPairingBlocked(error)) {
                    sessionStore.markAuthBlocked()
                    blockedByPairing = true
                    break@routes
                }
                val apiError = error as? TrackingApiClient.ApiException
                val status = apiError?.statusCode
                if (status != null && isTerminalTrackingHttpStatus(status)) {
                    markRouteTerminal(app, outbox, sessionStore, routeId, "http_$status")
                    continue
                }
                if (status == 409 && trackingConflictAction(apiError.code) != TrackingConflictAction.RETRY) {
                    markRouteTerminal(app, outbox, sessionStore, routeId, conflictReason(apiError))
                    continue
                }
                if (isPermanent(error)) {
                    outbox.quarantine("route", routeId, rejectionCode(error), null)
                    markRouteTerminal(app, outbox, sessionStore, routeId, rejectionCode(error))
                    continue
                }
                if (outbox.bumpRouteAttempts(routeId)) {
                    outbox.quarantine("route", routeId, TETO, null)
                    markRouteTerminal(app, outbox, sessionStore, routeId, TETO)
                    continue
                }
                needsRetry = true
                continue
            }
            var batches = 0
            var routeTerminal = false
            routeLoop@ while (batches < MAX_BATCHES_PER_RUN) {
                val points = outbox.points(routeId, 100)
                if (points.isEmpty()) break
                val response = try {
                    api.uploadPoints(sessionId, points)
                } catch (error: Throwable) {
                    val apiError = error as? TrackingApiClient.ApiException
                    val status = apiError?.statusCode
                    if (isPairingBlocked(error)) {
                        sessionStore.markAuthBlocked()
                        blockedByPairing = true
                    } else if (status != null && isTerminalTrackingHttpStatus(status)) {
                        markRouteTerminal(app, outbox, sessionStore, routeId, "http_$status")
                        routeTerminal = true
                    } else if (
                        status == 409 &&
                        trackingConflictAction(apiError.code) != TrackingConflictAction.RETRY
                    ) {
                        markRouteTerminal(app, outbox, sessionStore, routeId, conflictReason(apiError))
                        routeTerminal = true
                    } else if (outbox.bumpRouteAttempts(routeId)) {
                        outbox.quarantine("route", routeId, TETO, null)
                        markRouteTerminal(app, outbox, sessionStore, routeId, TETO)
                        routeTerminal = true
                    } else {
                        needsRetry = true
                    }
                    break@routeLoop
                }
                if (sessionStore.isAuthBlocked()) sessionStore.clearAuthBlocked()
                /* O teto só zera com PROGRESSO REAL — uma resposta do VPS.
                   Zerar no `ensureSession` seria enganação: ele devolve a sessão
                   do cache sem tocar a rede, então o contador nunca acumularia e
                   o disjuntor nunca desarmaria. */
                outbox.resetRouteAttempts(routeId)
                val accepted = response.stringArray("accepted")
                val duplicates = response.stringArray("duplicates")
                val rejected = response.optJSONArray("rejected") ?: JSONArray()
                var terminalRejectionCode: String? = null
                val rejectedIds = mutableListOf<String>()
                for (index in 0 until rejected.length()) {
                    val item = rejected.optJSONObject(index) ?: continue
                    val id = item.optString("clientPointId").trim()
                    if (id.isBlank()) continue
                    rejectedIds.add(id)
                    val original = points.firstOrNull { it.clientPointId == id }
                    val code = item.optString("code", "rejected")
                    if (isTerminalTrackingRejection(code)) terminalRejectionCode = code
                    outbox.quarantine(
                        "point",
                        id,
                        code,
                        original?.toApiJson(),
                    )
                }
                val authority = response.captureAuthority()
                val ackPlan = buildTrackingAckPlan(accepted, duplicates, rejectedIds, authority)
                if (ackPlan.acknowledgedIds.isEmpty() && terminalRejectionCode == null && !ackPlan.stopAfterAcknowledgement) {
                    needsRetry = true
                    break@routeLoop
                }
                // Ordem é deliberada: remove somente IDs confirmados pelo VPS;
                // qualquer backlog sem ACK permanece diagnóstico/idempotente.
                outbox.deletePoints(ackPlan.acknowledgedIds)
                if (terminalRejectionCode != null || ackPlan.stopAfterAcknowledgement) {
                    val reason = terminalRejectionCode ?: authority.terminalReason()
                    markRouteTerminal(app, outbox, sessionStore, routeId, reason)
                    routeTerminal = true
                    break@routeLoop
                }
                batches += 1
            }
            if (blockedByPairing) break@routes
            if (routeTerminal) continue@routes
            if (batches >= MAX_BATCHES_PER_RUN && outbox.points(routeId, 1).isNotEmpty()) {
                needsRetry = true
                continue
            }

            for (event in outbox.events(routeId)) {
                val response = try {
                    api.sendEvent(sessionId, event)
                } catch (error: Throwable) {
                    if (isPairingBlocked(error)) {
                        sessionStore.markAuthBlocked()
                        blockedByPairing = true
                        break
                    }
                    val apiError = error as? TrackingApiClient.ApiException
                    val status = apiError?.statusCode
                    if (status != null && isTerminalTrackingHttpStatus(status)) {
                        markRouteTerminal(app, outbox, sessionStore, routeId, "http_$status")
                        routeTerminal = true
                        break
                    }
                    /* Conta a falha e diz se ainda pode tentar. Todo caminho que
                       termina em "tenta de novo" passa por aqui — é o que impede
                       um erro que ninguém mapeou de virar loop eterno outra vez.
                       Estourado o teto, o marco vai pra quarentena: a prova fica
                       guardada em `tracking_rejected` e a fila destrava. */
                    fun aguentaMaisUma(): Boolean {
                        if (!outbox.bumpEventAttempts(event.eventId)) return true
                        outbox.quarantine("event", event.eventId, TETO, event.pointJson)
                        outbox.deleteEvent(event.eventId)
                        return false
                    }
                    /* 🔴 O 409 SÓ AGORA TEM NOME (17/08). Antes ele escapava por
                       baixo de tudo isto e voltava pra sempre. TERMINAL aqui é
                       seguro inclusive pro END, e é a única exceção honesta à lei
                       "END nunca vira descarte": a lei existe pra não deixar
                       sessão aberta no VPS — se o servidor está dizendo que ela
                       JÁ fechou, não há mais nada pro END fechar. ENTREGAS_ABERTAS
                       continua caindo no RETRY logo abaixo, como sempre foi. */
                    val conflito = if (status == 409) trackingConflictAction(apiError.code) else null
                    if (conflito == TrackingConflictAction.TERMINAL) {
                        outbox.quarantine("event", event.eventId, conflictReason(apiError), event.pointJson)
                        outbox.deleteEvent(event.eventId)
                        markRouteTerminal(app, outbox, sessionStore, routeId, conflictReason(apiError))
                        routeTerminal = true
                        break
                    }
                    if (conflito == TrackingConflictAction.QUARANTINE) {
                        outbox.quarantine("event", event.eventId, conflictReason(apiError), event.pointJson)
                        outbox.deleteEvent(event.eventId)
                        continue
                    }
                    val validationAction = status?.let {
                        trackingEventValidationFailureAction(event.type, it, event.pointJson != null)
                    }
                    if (validationAction != null) {
                        when (validationAction) {
                            TrackingEventFailureAction.RETRY_WITHOUT_POINT -> {
                                // O timestamp do GPS não é fabricado: remove só o
                                // fix rejeitado e tenta o mesmo marco novamente.
                                outbox.clearEventPoint(event.eventId)
                                if (!aguentaMaisUma()) continue
                                needsRetry = true
                                break
                            }
                            TrackingEventFailureAction.RETRY -> {
                                // END é durável e nunca vira descarte terminal.
                                if (!aguentaMaisUma()) continue
                                needsRetry = true
                                break
                            }
                            TrackingEventFailureAction.QUARANTINE_AND_CONTINUE -> {
                                // ARRIVAL já rejeitado sem point não pode impedir
                                // que o END posterior encerre a sessão.
                                outbox.quarantine(
                                    "event",
                                    event.eventId,
                                    "http_$status",
                                    null,
                                )
                                outbox.deleteEvent(event.eventId)
                                continue
                            }
                        }
                    }
                    if (event.type == TrackingPointEvent.END.name && status != null) {
                        // END nunca vira descarte terminal no aparelho: manter a
                        // sessão aberta no VPS seria pior do que aguardar correção.
                        // Só o teto o tira da fila, e ainda assim pra quarentena.
                        if (!aguentaMaisUma()) continue
                        needsRetry = true
                        break
                    }
                    if (isPermanentEvent(error)) {
                        outbox.quarantine("event", event.eventId, rejectionCode(error), event.pointJson)
                        outbox.deleteEvent(event.eventId)
                        continue
                    }
                    if (!aguentaMaisUma()) continue
                    needsRetry = true
                    break
                }
                if (sessionStore.isAuthBlocked()) sessionStore.clearAuthBlocked()
                outbox.resetRouteAttempts(routeId)
                val authority = response.captureAuthority()
                val endAcknowledged = event.type == TrackingPointEvent.END.name &&
                    (authority.mustStop || response.optString("status").equals("ENDED", ignoreCase = true))
                if (event.type == TrackingPointEvent.END.name && !endAcknowledged) {
                    // 2xx sem estado autoritativo de encerramento não remove o
                    // END: o mesmo eventId pode ser refeito com segurança.
                    // Mas CONTA: um 200 que nunca confirma é loop igual ao 409 —
                    // sucesso aparente que não anda é a versão silenciosa do
                    // mesmo bug, e o disjuntor vale pros dois.
                    if (outbox.bumpEventAttempts(event.eventId)) {
                        outbox.quarantine("event", event.eventId, TETO, event.pointJson)
                        outbox.deleteEvent(event.eventId)
                        continue
                    }
                    needsRetry = true
                    break
                }
                outbox.deleteEvent(event.eventId)
                if (endAcknowledged) {
                    sessionStore.markEnded(routeId)
                    outbox.cleanupRouteIfEmpty(routeId)
                    break
                }
                if (authority.mustStop) {
                    markRouteTerminal(app, outbox, sessionStore, routeId, authority.terminalReason())
                    routeTerminal = true
                    break
                }
            }
            if (blockedByPairing) break@routes
            if (routeTerminal) continue@routes
        }
        TrackingFlushResult(pending = outbox.hasPending(), retry = needsRetry && !blockedByPairing)
    }

    private fun ensureSession(
        api: TrackingApiClient,
        outbox: TrackingOutbox,
        store: TrackingSessionStore,
        routeId: String,
    ): String {
        val confirmed = store.sessionId(routeId)
        val expected = outbox.hintedSessionId(routeId) ?: confirmed
        if (!outbox.isStartPending(routeId) && confirmed != null) {
            return confirmed
        }
        val session = try {
            api.startSession(routeId)
        } catch (error: TrackingApiClient.ApiException) {
            if (error.statusCode != 409) throw error
            api.currentSession()?.takeIf { it.routeId == routeId } ?: throw error
        }
        if (session.routeId != routeId) throw IllegalStateException("Sessão devolvida para outra rota.")
        if (expected != null && session.id != expected) {
            throw TrackingSessionMismatchException(expected, session.id)
        }
        store.saveSession(routeId, session.id)
        store.clearAuthBlocked()
        outbox.markSession(routeId, session.id)
        return session.id
    }

    private fun isPermanent(error: Throwable): Boolean {
        if (error is TrackingSessionMismatchException) return true
        val status = (error as? TrackingApiClient.ApiException)?.statusCode ?: return false
        return status in 400..499 && status !in setOf(401, 403, 404, 408, 409, 425, 429)
    }

    private fun isPermanentEvent(error: Throwable): Boolean {
        val status = (error as? TrackingApiClient.ApiException)?.statusCode ?: return false
        return status in 400..499 && status !in setOf(400, 401, 403, 404, 408, 409, 422, 425, 429)
    }

    private fun isPairingBlocked(error: Throwable): Boolean =
        error is UnpairedDeviceException || (error as? TrackingApiClient.ApiException)?.statusCode == 401

    /** Guarda POR QUE a rota morreu — o código do VPS quando veio, 409 cru quando não. */
    private fun conflictReason(error: TrackingApiClient.ApiException?): String =
        error?.code?.trim()?.takeIf(String::isNotEmpty)?.let { "conflito_$it" } ?: "http_409"

    private fun rejectionCode(error: Throwable): String =
        (error as? TrackingApiClient.ApiException)?.statusCode?.let { "http_$it" }
            ?: if (error is TrackingSessionMismatchException) "session_mismatch" else "invalid_session"

    private fun markRouteTerminal(
        context: Context,
        outbox: TrackingOutbox,
        store: TrackingSessionStore,
        routeId: String,
        reason: String,
    ) {
        // Tombstone primeiro: mesmo que o processo morra antes do intent, a
        // próxima abertura não volta a capturar esta rota.
        store.markTerminal(routeId)
        outbox.markRouteTerminal(routeId, reason)
        RotaService.stopTerminal(context, routeId)
    }

    private fun JSONObject.stringArray(key: String): List<String> {
        val array = optJSONArray(key) ?: return emptyList()
        return buildList {
            for (index in 0 until array.length()) {
                array.optString(index).trim().takeIf(String::isNotEmpty)?.let(::add)
            }
        }
    }

    private fun JSONObject.captureAuthority(): TrackingCaptureAuthority {
        val explicitStatus = optString("sessionStatus", "").trim().takeIf(String::isNotEmpty)
            ?: optString("status", "").trim().takeIf(String::isNotEmpty)
        return TrackingCaptureAuthority(
            sessionStatus = explicitStatus,
            routeActive = if (has("routeActive")) optBoolean("routeActive") else null,
            captureAllowed = if (has("captureAllowed")) optBoolean("captureAllowed") else null,
        )
    }

    private fun TrackingCaptureAuthority.terminalReason(): String = buildString {
        append("server_capture_disallowed")
        sessionStatus?.let { append(":").append(it.take(24)) }
    }

    private fun scheduleFallbackIfPending(context: Context) {
        if (!DeviceCredentialStore(context).readDeviceToken().isNullOrBlank() && TrackingOutbox.get(context).hasPending()) {
            scheduleFallback(context)
        }
    }

    private fun scheduleFallback(context: Context) {
        val scheduler = context.getSystemService(Context.JOB_SCHEDULER_SERVICE) as? JobScheduler ?: return
        if (scheduler.getPendingJob(JOB_ID) != null) return
        val job = JobInfo.Builder(JOB_ID, ComponentName(context, TrackingUploadJobService::class.java))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPersisted(true)
            .setBackoffCriteria(30_000L, JobInfo.BACKOFF_POLICY_EXPONENTIAL)
            .build()
        runCatching { scheduler.schedule(job) }
    }

    private fun cancelFallback(context: Context) {
        val scheduler = context.getSystemService(Context.JOB_SCHEDULER_SERVICE) as? JobScheduler ?: return
        runCatching { scheduler.cancel(JOB_ID) }
    }
}

private class TrackingSessionMismatchException(expected: String, actual: String) :
    IllegalStateException("Sessão inesperada: esperado=$expected atual=$actual")
