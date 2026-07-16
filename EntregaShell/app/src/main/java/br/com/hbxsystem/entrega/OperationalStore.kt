package br.com.hbxsystem.entrega

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.net.TrafficStats
import android.os.Process
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID

data class OperationalLocalResponse(val status: Int, val body: String)

data class PendingOperationalCommand(
    val rowId: Long,
    val commandId: String,
    val routeId: String,
    val deliveryId: String,
    val type: String,
    val idempotencyKey: String,
    val payload: JSONObject,
    val capturedAtMs: Long,
    val attempts: Int,
)

data class PendingOperationalProof(
    val id: String,
    val routeId: String,
    val deliveryId: String,
    val type: String,
    val filePath: String,
    val filename: String,
    val mime: String,
    val byteSize: Long,
    val sha256: String,
    val remoteId: String?,
    val attempts: Int,
)

data class OfflineRouteGrantCandidate(
    val routeId: String,
    val routeDate: String,
    val routeStatus: String,
    val currentGrant: String?,
    val grantExpiresAtMs: Long?,
)

/**
 * Fonte local da rota em execução. O WebView nunca precisa inventar um estado:
 * respostas do VPS viram snapshot e comandos locais são sobrepostos até receber ACK.
 */
class OperationalStore(context: Context) : SQLiteOpenHelper(
    context.applicationContext,
    DATABASE_NAME,
    null,
    DATABASE_VERSION,
) {
    companion object {
        private const val DATABASE_NAME = "hbx_operational.db"
        private const val DATABASE_VERSION = 1
        private const val PREFS = "hbx_operational_preferences"
        private const val PREF_WIFI_ONLY = "proof_wifi_only"
        private const val PREF_RETAIN = "proof_retain_after_upload"
        private const val MAX_PENDING_COMMANDS = 500
        private const val MAX_REJECTED = 100
    }

    private val app = context.applicationContext
    private val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE route_snapshot (
                route_id TEXT PRIMARY KEY,
                route_date TEXT NOT NULL,
                route_status TEXT NOT NULL,
                route_mode TEXT,
                payload_json TEXT NOT NULL,
                expires_at_ms INTEGER NOT NULL,
                grant_token TEXT,
                grant_id TEXT,
                grant_expires_at_ms INTEGER,
                grant_error TEXT,
                last_server_at_ms INTEGER NOT NULL,
                updated_at_ms INTEGER NOT NULL,
                rx_start INTEGER NOT NULL DEFAULT 0,
                tx_start INTEGER NOT NULL DEFAULT 0
            )
            """.trimIndent(),
        )
        db.execSQL(
            """
            CREATE TABLE operation_outbox (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                command_id TEXT NOT NULL UNIQUE,
                route_id TEXT NOT NULL,
                delivery_id TEXT NOT NULL,
                operation_type TEXT NOT NULL,
                idempotency_key TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                captured_at_ms INTEGER NOT NULL,
                state TEXT NOT NULL DEFAULT 'PENDING',
                attempts INTEGER NOT NULL DEFAULT 0,
                next_attempt_at_ms INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                created_at_ms INTEGER NOT NULL
            )
            """.trimIndent(),
        )
        db.execSQL("CREATE INDEX operation_outbox_pending_idx ON operation_outbox(state, next_attempt_at_ms, id)")
        db.execSQL("CREATE INDEX operation_outbox_route_idx ON operation_outbox(route_id, delivery_id)")
        db.execSQL(
            """
            CREATE TABLE proof_outbox (
                id TEXT PRIMARY KEY,
                route_id TEXT NOT NULL,
                delivery_id TEXT NOT NULL,
                proof_type TEXT NOT NULL,
                file_path TEXT NOT NULL,
                filename TEXT NOT NULL,
                mime TEXT NOT NULL,
                byte_size INTEGER NOT NULL,
                sha256 TEXT NOT NULL,
                remote_id TEXT,
                state TEXT NOT NULL DEFAULT 'PENDING',
                attempts INTEGER NOT NULL DEFAULT 0,
                next_attempt_at_ms INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                created_at_ms INTEGER NOT NULL,
                uploaded_at_ms INTEGER
            )
            """.trimIndent(),
        )
        db.execSQL("CREATE INDEX proof_outbox_pending_idx ON proof_outbox(state, next_attempt_at_ms, created_at_ms)")
        db.execSQL("CREATE INDEX proof_outbox_route_idx ON proof_outbox(route_id, delivery_id)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    @Synchronized
    fun mergeAndStoreServerRoute(rawBody: String): String {
        val server = runCatching { JSONObject(rawBody) }.getOrNull() ?: return rawBody
        val routeId = server.optString("routeId").trim()
        val routeDate = server.optString("date").trim()
        if (routeId.isBlank() || routeDate.isBlank()) return rawBody

        val existing = routeRow(routeId)
        val merged = applyLocalOverlay(server, routeId)
        val now = System.currentTimeMillis()
        val routeStatus = merged.optString("routeStatus", "PLANNED").uppercase()
        val expiry = OperationalPolicy.routeExpiryMs(routeDate) ?: (now + 24 * 60 * 60 * 1000L)
        val sameRoute = existing != null
        val values = ContentValues().apply {
            put("route_id", routeId)
            put("route_date", routeDate)
            put("route_status", routeStatus)
            put("route_mode", if (merged.optBoolean("trackingRequired")) "TRACKED" else "ESSENTIAL")
            put("payload_json", merged.toString())
            put("expires_at_ms", expiry)
            if (sameRoute) {
                existing!!.grantToken?.let { put("grant_token", it) }
                existing.grantId?.let { put("grant_id", it) }
                existing.grantExpiresAtMs?.let { put("grant_expires_at_ms", it) }
                existing.grantError?.let { put("grant_error", it) }
                put("rx_start", existing.rxStart)
                put("tx_start", existing.txStart)
            } else {
                put("rx_start", uidRxBytes())
                put("tx_start", uidTxBytes())
            }
            put("last_server_at_ms", now)
            put("updated_at_ms", now)
        }
        writableDatabase.insertWithOnConflict("route_snapshot", null, values, SQLiteDatabase.CONFLICT_REPLACE)
        cleanupOldRoutes(routeId)
        return merged.toString()
    }

    @Synchronized
    fun routeFallback(): OperationalLocalResponse? {
        val row = latestRoute() ?: return null
        if (!routeVisible(row, System.currentTimeMillis())) return null
        return OperationalLocalResponse(200, applyLocalOverlay(JSONObject(row.payload), row.routeId).toString())
    }

    @Synchronized
    fun interceptMutation(method: String, path: String, body: String?): OperationalLocalResponse? {
        val deliveryId = OperationalPolicy.deliveryIdForMutation(method, path) ?: return null
        val type = OperationalPolicy.mutationType(path) ?: return null
        val row = latestRoute() ?: return null
        val now = System.currentTimeMillis()
        if (!routeVisible(row, now) || !OperationalPolicy.isGrantUsable(row.grantExpiresAtMs, now) || row.grantToken.isNullOrBlank()) {
            return null
        }
        val route = JSONObject(row.payload)
        if (findDelivery(route, deliveryId) == null) return null

        val payload = runCatching { JSONObject(body ?: "{}") }.getOrElse { JSONObject() }
        val idempotencyKey = payload.optString("idempotencyKey").trim().ifBlank { UUID.randomUUID().toString() }
        if (type == "CONFIRM_DELIVERY" && !payload.has("idempotencyKey")) {
            payload.put("idempotencyKey", idempotencyKey)
        }
        val capturedAtMs = now
        val commandId = if (type == "CONFIRM_DELIVERY") idempotencyKey else UUID.randomUUID().toString()
        val inserted = writableDatabase.insertWithOnConflict(
            "operation_outbox",
            null,
            ContentValues().apply {
                put("command_id", commandId)
                put("route_id", row.routeId)
                put("delivery_id", deliveryId)
                put("operation_type", type)
                put("idempotency_key", idempotencyKey)
                put("payload_json", payload.toString())
                put("captured_at_ms", capturedAtMs)
                put("state", "PENDING")
                put("attempts", 0)
                put("next_attempt_at_ms", 0)
                put("created_at_ms", now)
            },
            SQLiteDatabase.CONFLICT_IGNORE,
        )
        if (inserted != -1L || commandExists(commandId)) {
            applyOperation(route, type, deliveryId, payload, capturedAtMs)
            updateRoutePayload(row.routeId, route)
            trimOutbox()
            val response = JSONObject()
                .put("id", deliveryId)
                .put("status", if (type == "CONFIRM_DELIVERY") "entregue" else "cancelada")
                .put("offline", true)
                .put("pendingSync", true)
                .put("commandId", commandId)
            return OperationalLocalResponse(202, response.toString())
        }
        return null
    }

    @Synchronized
    fun enqueueProof(
        deliveryId: String,
        type: String,
        file: File,
        filename: String,
        mime: String,
    ): JSONObject {
        require(type == "foto" || type == "assinatura") { "Tipo de comprovante inválido." }
        val row = latestRoute() ?: throw IllegalStateException("Prepare a rota antes de anexar comprovantes offline.")
        if (!routeVisible(row, System.currentTimeMillis())) throw IllegalStateException("A rota local expirou.")
        val route = JSONObject(row.payload)
        if (findDelivery(route, deliveryId) == null) throw IllegalArgumentException("Entrega fora da rota preparada.")
        val id = UUID.randomUUID().toString()
        val bytes = file.readBytes()
        writableDatabase.insertOrThrow(
            "proof_outbox",
            null,
            ContentValues().apply {
                put("id", id)
                put("route_id", row.routeId)
                put("delivery_id", deliveryId)
                put("proof_type", type)
                put("file_path", file.absolutePath)
                put("filename", filename.take(160))
                put("mime", mime.take(80))
                put("byte_size", file.length())
                put("sha256", sha256(bytes))
                put("state", "PENDING")
                put("attempts", 0)
                put("next_attempt_at_ms", 0)
                put("created_at_ms", System.currentTimeMillis())
            },
        )
        applyProof(route, deliveryId, type, "local:$id", pending = true)
        updateRoutePayload(row.routeId, route)
        return JSONObject()
            .put("id", "local:$id")
            .put("status", "pendente")
            .put("offline", true)
            .put("pendingSync", true)
    }

    @Synchronized
    fun grantCandidate(): OfflineRouteGrantCandidate? {
        val row = latestRoute() ?: return null
        if (row.routeStatus != "ACTIVE" || row.expiresAtMs <= System.currentTimeMillis()) return null
        return OfflineRouteGrantCandidate(
            routeId = row.routeId,
            routeDate = row.routeDate,
            routeStatus = row.routeStatus,
            currentGrant = row.grantToken,
            grantExpiresAtMs = row.grantExpiresAtMs,
        )
    }

    @Synchronized
    fun saveGrant(routeId: String, token: String, grantId: String?, expiresAtMs: Long) {
        writableDatabase.update(
            "route_snapshot",
            ContentValues().apply {
                put("grant_token", token)
                grantId?.let { put("grant_id", it) }
                put("grant_expires_at_ms", expiresAtMs)
                putNull("grant_error")
                put("updated_at_ms", System.currentTimeMillis())
            },
            "route_id = ?",
            arrayOf(routeId),
        )
    }

    @Synchronized
    fun saveGrantError(routeId: String, error: String) {
        writableDatabase.update(
            "route_snapshot",
            ContentValues().apply {
                put("grant_error", error.take(400))
                put("updated_at_ms", System.currentTimeMillis())
            },
            "route_id = ?",
            arrayOf(routeId),
        )
    }

    @Synchronized
    fun grantForRoute(routeId: String): String? {
        val row = routeRow(routeId) ?: return null
        return row.grantToken?.takeIf { OperationalPolicy.isGrantUsable(row.grantExpiresAtMs, System.currentTimeMillis()) }
    }

    @Synchronized
    fun pendingCommands(limit: Int = 30): List<PendingOperationalCommand> {
        val result = mutableListOf<PendingOperationalCommand>()
        readableDatabase.query(
            "operation_outbox",
            null,
            "state = 'PENDING' AND next_attempt_at_ms <= ?",
            arrayOf(System.currentTimeMillis().toString()),
            null,
            null,
            "id ASC",
            limit.coerceIn(1, 50).toString(),
        ).use { cursor ->
            while (cursor.moveToNext()) {
                result += PendingOperationalCommand(
                    rowId = cursor.long("id"),
                    commandId = cursor.string("command_id"),
                    routeId = cursor.string("route_id"),
                    deliveryId = cursor.string("delivery_id"),
                    type = cursor.string("operation_type"),
                    idempotencyKey = cursor.string("idempotency_key"),
                    payload = runCatching { JSONObject(cursor.string("payload_json")) }.getOrElse { JSONObject() },
                    capturedAtMs = cursor.long("captured_at_ms"),
                    attempts = cursor.int("attempts"),
                )
            }
        }
        return result
    }

    @Synchronized
    fun pendingProofs(limit: Int = 10): List<PendingOperationalProof> {
        val result = mutableListOf<PendingOperationalProof>()
        readableDatabase.query(
            "proof_outbox",
            null,
            "state = 'PENDING' AND next_attempt_at_ms <= ?",
            arrayOf(System.currentTimeMillis().toString()),
            null,
            null,
            "created_at_ms ASC",
            limit.coerceIn(1, 20).toString(),
        ).use { cursor ->
            while (cursor.moveToNext()) {
                result += PendingOperationalProof(
                    id = cursor.string("id"),
                    routeId = cursor.string("route_id"),
                    deliveryId = cursor.string("delivery_id"),
                    type = cursor.string("proof_type"),
                    filePath = cursor.string("file_path"),
                    filename = cursor.string("filename"),
                    mime = cursor.string("mime"),
                    byteSize = cursor.long("byte_size"),
                    sha256 = cursor.string("sha256"),
                    remoteId = cursor.optionalString("remote_id"),
                    attempts = cursor.int("attempts"),
                )
            }
        }
        return result
    }

    @Synchronized
    fun resolvedCommandPayload(command: PendingOperationalCommand): JSONObject? {
        val payload = JSONObject(command.payload.toString())
        for (field in listOf("comprovanteFotoId", "comprovanteAssinaturaId")) {
            val value = payload.optString(field).trim()
            if (!value.startsWith("local:")) continue
            val remote = remoteProofId(value.removePrefix("local:")) ?: return null
            payload.put(field, remote)
        }
        return payload
    }

    @Synchronized
    fun markProofUploaded(proof: PendingOperationalProof, remoteId: String, deleteLocalFile: Boolean) {
        writableDatabase.update(
            "proof_outbox",
            ContentValues().apply {
                put("remote_id", remoteId)
                put("state", "UPLOADED")
                put("uploaded_at_ms", System.currentTimeMillis())
                putNull("last_error")
            },
            "id = ?",
            arrayOf(proof.id),
        )
        routeRow(proof.routeId)?.let { row ->
            val route = JSONObject(row.payload)
            applyProof(route, proof.deliveryId, proof.type, remoteId, pending = false)
            updateRoutePayload(proof.routeId, route)
        }
        if (deleteLocalFile) runCatching { File(proof.filePath).delete() }
    }

    @Synchronized
    fun markProofRetry(id: String, attempts: Int, error: String) {
        writableDatabase.update(
            "proof_outbox",
            retryValues(attempts, error),
            "id = ?",
            arrayOf(id),
        )
    }

    @Synchronized
    fun markProofRejected(id: String, error: String) {
        writableDatabase.update(
            "proof_outbox",
            ContentValues().apply { put("state", "REJECTED"); put("last_error", error.take(400)) },
            "id = ?",
            arrayOf(id),
        )
        trimRejected("proof_outbox")
    }

    @Synchronized
    fun markCommandAck(command: PendingOperationalCommand) {
        writableDatabase.delete("operation_outbox", "id = ?", arrayOf(command.rowId.toString()))
    }

    @Synchronized
    fun markCommandRetry(command: PendingOperationalCommand, error: String) {
        writableDatabase.update(
            "operation_outbox",
            retryValues(command.attempts + 1, error),
            "id = ?",
            arrayOf(command.rowId.toString()),
        )
    }

    @Synchronized
    fun markCommandRejected(command: PendingOperationalCommand, error: String) {
        writableDatabase.update(
            "operation_outbox",
            ContentValues().apply { put("state", "REJECTED"); put("last_error", error.take(400)) },
            "id = ?",
            arrayOf(command.rowId.toString()),
        )
        trimRejected("operation_outbox")
    }

    fun proofWifiOnly(): Boolean = prefs.getBoolean(PREF_WIFI_ONLY, false)
    fun retainProofAfterUpload(): Boolean = prefs.getBoolean(PREF_RETAIN, false)

    fun setPreferences(wifiOnly: Boolean, retainAfterUpload: Boolean) {
        prefs.edit()
            .putBoolean(PREF_WIFI_ONLY, wifiOnly)
            .putBoolean(PREF_RETAIN, retainAfterUpload)
            .apply()
    }

    @Synchronized
    fun hasPending(): Boolean = count("operation_outbox", "state = 'PENDING'") > 0 ||
        count("proof_outbox", "state = 'PENDING'") > 0

    @Synchronized
    fun hasPendingCommands(): Boolean = count("operation_outbox", "state = 'PENDING'") > 0

    @Synchronized
    fun hasPendingProofs(): Boolean = count("proof_outbox", "state = 'PENDING'") > 0

    @Synchronized
    fun hasOfflineResume(): Boolean {
        val row = latestRoute() ?: return false
        return routeVisible(row, System.currentTimeMillis())
    }

    @Synchronized
    fun statusJson(): String {
        val row = latestRoute()
        val now = System.currentTimeMillis()
        val rx = row?.let { (uidRxBytes() - it.rxStart).coerceAtLeast(0L) } ?: 0L
        val tx = row?.let { (uidTxBytes() - it.txStart).coerceAtLeast(0L) } ?: 0L
        return JSONObject()
            .put("hasRoute", row != null && routeVisible(row, now))
            .put("routeId", row?.routeId)
            .put("routeDate", row?.routeDate)
            .put("routeStatus", row?.routeStatus)
            .put("expiresAt", row?.expiresAtMs?.let(Instant::ofEpochMilli)?.toString())
            .put("grantReady", row?.let { OperationalPolicy.isGrantUsable(it.grantExpiresAtMs, now) && !it.grantToken.isNullOrBlank() } == true)
            .put("grantExpiresAt", row?.grantExpiresAtMs?.let(Instant::ofEpochMilli)?.toString())
            .put("grantError", row?.grantError)
            .put("pendingOperations", count("operation_outbox", "state = 'PENDING'"))
            .put("pendingProofs", count("proof_outbox", "state = 'PENDING'"))
            .put("rejected", count("operation_outbox", "state = 'REJECTED'") + count("proof_outbox", "state = 'REJECTED'"))
            .put("wifiOnly", proofWifiOnly())
            .put("retainAfterUpload", retainProofAfterUpload())
            .put("trafficBytes", rx + tx)
            .put("rxBytes", rx)
            .put("txBytes", tx)
            .toString()
    }

    @Synchronized
    fun clearAll(deleteProofFiles: Boolean = true) {
        if (deleteProofFiles) {
            readableDatabase.query("proof_outbox", arrayOf("file_path"), null, null, null, null, null).use { cursor ->
                while (cursor.moveToNext()) runCatching { File(cursor.getString(0)).delete() }
            }
        }
        writableDatabase.delete("operation_outbox", null, null)
        writableDatabase.delete("proof_outbox", null, null)
        writableDatabase.delete("route_snapshot", null, null)
    }

    private fun applyLocalOverlay(server: JSONObject, routeId: String): JSONObject {
        val route = JSONObject(server.toString())
        readableDatabase.query(
            "operation_outbox",
            arrayOf("operation_type", "delivery_id", "payload_json", "captured_at_ms"),
            "route_id = ? AND state = 'PENDING'",
            arrayOf(routeId),
            null,
            null,
            "id ASC",
        ).use { cursor ->
            while (cursor.moveToNext()) {
                applyOperation(
                    route,
                    cursor.string("operation_type"),
                    cursor.string("delivery_id"),
                    runCatching { JSONObject(cursor.string("payload_json")) }.getOrElse { JSONObject() },
                    cursor.long("captured_at_ms"),
                )
            }
        }
        readableDatabase.query(
            "proof_outbox",
            arrayOf("id", "delivery_id", "proof_type", "remote_id", "state"),
            "route_id = ? AND state <> 'REJECTED'",
            arrayOf(routeId),
            null,
            null,
            "created_at_ms ASC",
        ).use { cursor ->
            while (cursor.moveToNext()) {
                val remote = cursor.optionalString("remote_id")
                val state = cursor.string("state")
                applyProof(
                    route,
                    cursor.string("delivery_id"),
                    cursor.string("proof_type"),
                    remote ?: "local:${cursor.string("id")}",
                    pending = state == "PENDING",
                )
            }
        }
        return route
    }

    private fun applyOperation(route: JSONObject, type: String, deliveryId: String, payload: JSONObject, capturedAtMs: Long) {
        val delivery = findDelivery(route, deliveryId) ?: return
        if (type == "CONFIRM_DELIVERY") {
            delivery.put("status", "entregue")
            delivery.put("deliveredAt", Instant.ofEpochMilli(capturedAtMs).toString())
            val quantities = mutableMapOf<String, Int>()
            val sentItems = payload.optJSONArray("itens") ?: JSONArray()
            for (index in 0 until sentItems.length()) {
                val sent = sentItems.optJSONObject(index) ?: continue
                quantities[sent.optString("id")] = sent.optInt("qtdEntregue", 0)
            }
            val routeItems = delivery.optJSONArray("itens") ?: JSONArray()
            for (index in 0 until routeItems.length()) {
                val item = routeItems.optJSONObject(index) ?: continue
                quantities[item.optString("id")]?.let { item.put("qtdEntregue", it) }
            }
        } else if (type == "CANCEL_DELIVERY") {
            delivery.put("status", "cancelada")
            payload.optString("motivo").takeIf(String::isNotBlank)?.let { delivery.put("offlineCancelReason", it) }
        }
        delivery.put("offlinePending", true)
        delivery.put("syncState", "pending")
    }

    private fun applyProof(route: JSONObject, deliveryId: String, type: String, proofId: String, pending: Boolean) {
        val delivery = findDelivery(route, deliveryId) ?: return
        val proof = delivery.optJSONObject("comprovante") ?: JSONObject().also { delivery.put("comprovante", it) }
        proof.put(if (type == "foto") "fotoId" else "assinaturaId", proofId)
        proof.put(if (type == "foto") "fotoPending" else "assinaturaPending", pending)
    }

    private fun findDelivery(route: JSONObject, deliveryId: String): JSONObject? {
        val items = route.optJSONArray("items") ?: return null
        for (index in 0 until items.length()) {
            val item = items.optJSONObject(index) ?: continue
            if (item.optString("id") == deliveryId) return item
        }
        return null
    }

    private fun remoteProofId(id: String): String? {
        readableDatabase.query(
            "proof_outbox",
            arrayOf("remote_id"),
            "id = ? AND state = 'UPLOADED'",
            arrayOf(id),
            null,
            null,
            null,
            "1",
        ).use { cursor -> return if (cursor.moveToFirst()) cursor.optionalString("remote_id") else null }
    }

    private fun updateRoutePayload(routeId: String, route: JSONObject) {
        writableDatabase.update(
            "route_snapshot",
            ContentValues().apply {
                put("payload_json", route.toString())
                put("updated_at_ms", System.currentTimeMillis())
            },
            "route_id = ?",
            arrayOf(routeId),
        )
    }

    private fun retryValues(attempts: Int, error: String): ContentValues = ContentValues().apply {
        put("attempts", attempts)
        put("next_attempt_at_ms", System.currentTimeMillis() + retryDelayMs(attempts))
        put("last_error", error.take(400))
    }

    private fun retryDelayMs(attempts: Int): Long = when (attempts.coerceAtLeast(1)) {
        1 -> 15_000L
        2 -> 60_000L
        3 -> 5 * 60_000L
        4 -> 15 * 60_000L
        else -> 60 * 60_000L
    }

    private fun trimOutbox() {
        writableDatabase.execSQL(
            "DELETE FROM operation_outbox WHERE id NOT IN (SELECT id FROM operation_outbox ORDER BY id DESC LIMIT $MAX_PENDING_COMMANDS)",
        )
    }

    private fun trimRejected(table: String) {
        val order = if (table == "operation_outbox") "id" else "created_at_ms"
        writableDatabase.execSQL(
            "DELETE FROM $table WHERE state = 'REJECTED' AND $order NOT IN " +
                "(SELECT $order FROM $table WHERE state = 'REJECTED' ORDER BY $order DESC LIMIT $MAX_REJECTED)",
        )
    }

    private fun cleanupOldRoutes(currentRouteId: String) {
        writableDatabase.delete("route_snapshot", "route_id <> ?", arrayOf(currentRouteId))
    }

    private fun commandExists(commandId: String): Boolean = readableDatabase.query(
        "operation_outbox",
        arrayOf("1"),
        "command_id = ?",
        arrayOf(commandId),
        null,
        null,
        null,
        "1",
    ).use(Cursor::moveToFirst)

    private fun count(table: String, where: String): Int = readableDatabase.rawQuery(
        "SELECT COUNT(*) FROM $table WHERE $where",
        null,
    ).use { if (it.moveToFirst()) it.getInt(0) else 0 }

    private fun routeVisible(row: RouteRow, now: Long): Boolean =
        row.expiresAtMs > now && (row.routeStatus == "ACTIVE" || hasPending())

    private fun latestRoute(): RouteRow? = readableDatabase.query(
        "route_snapshot",
        null,
        null,
        null,
        null,
        null,
        "updated_at_ms DESC",
        "1",
    ).use { if (it.moveToFirst()) it.toRouteRow() else null }

    private fun routeRow(routeId: String): RouteRow? = readableDatabase.query(
        "route_snapshot",
        null,
        "route_id = ?",
        arrayOf(routeId),
        null,
        null,
        null,
        "1",
    ).use { if (it.moveToFirst()) it.toRouteRow() else null }

    private data class RouteRow(
        val routeId: String,
        val routeDate: String,
        val routeStatus: String,
        val payload: String,
        val expiresAtMs: Long,
        val grantToken: String?,
        val grantId: String?,
        val grantExpiresAtMs: Long?,
        val grantError: String?,
        val rxStart: Long,
        val txStart: Long,
    )

    private fun Cursor.toRouteRow(): RouteRow = RouteRow(
        routeId = string("route_id"),
        routeDate = string("route_date"),
        routeStatus = string("route_status"),
        payload = string("payload_json"),
        expiresAtMs = long("expires_at_ms"),
        grantToken = optionalString("grant_token"),
        grantId = optionalString("grant_id"),
        grantExpiresAtMs = optionalLong("grant_expires_at_ms"),
        grantError = optionalString("grant_error"),
        rxStart = long("rx_start"),
        txStart = long("tx_start"),
    )

    private fun Cursor.index(name: String): Int = getColumnIndexOrThrow(name)
    private fun Cursor.string(name: String): String = getString(index(name))
    private fun Cursor.optionalString(name: String): String? = index(name).let { if (isNull(it)) null else getString(it) }
    private fun Cursor.long(name: String): Long = getLong(index(name))
    private fun Cursor.optionalLong(name: String): Long? = index(name).let { if (isNull(it)) null else getLong(it) }
    private fun Cursor.int(name: String): Int = getInt(index(name))

    private fun uidRxBytes(): Long = TrafficStats.getUidRxBytes(Process.myUid()).takeIf { it >= 0 } ?: 0L
    private fun uidTxBytes(): Long = TrafficStats.getUidTxBytes(Process.myUid()).takeIf { it >= 0 } ?: 0L

    private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
        .digest(bytes)
        .joinToString("") { "%02x".format(it) }
}
