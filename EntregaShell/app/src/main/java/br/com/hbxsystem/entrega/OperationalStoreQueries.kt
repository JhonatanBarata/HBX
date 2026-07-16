package br.com.hbxsystem.entrega

import android.content.ContentValues
import org.json.JSONObject

private const val OPERATIONAL_SYNC_GRACE_MS = 7L * 24 * 60 * 60 * 1000

/**
 * A autorização expirada não permite nova ação, mas continua autenticando o envio
 * de fatos já capturados durante uma janela curta de recuperação.
 */
fun OperationalStore.grantForSync(routeId: String, nowMs: Long = System.currentTimeMillis()): String? {
    readableDatabase.query(
        "route_snapshot",
        arrayOf("grant_token", "grant_expires_at_ms"),
        "route_id = ?",
        arrayOf(routeId),
        null,
        null,
        null,
        "1",
    ).use { cursor ->
        if (!cursor.moveToFirst() || cursor.isNull(0) || cursor.isNull(1)) return null
        val expiresAt = cursor.getLong(1)
        if (expiresAt + OPERATIONAL_SYNC_GRACE_MS <= nowMs) return null
        return cursor.getString(0)?.takeIf(String::isNotBlank)
    }
}

fun OperationalStore.pendingOperationalRouteIds(): List<String> {
    val result = linkedSetOf<String>()
    readableDatabase.rawQuery(
        """
        SELECT route_id FROM operation_outbox WHERE state = 'PENDING'
        UNION
        SELECT route_id FROM proof_outbox WHERE state = 'PENDING'
        """.trimIndent(),
        null,
    ).use { cursor ->
        while (cursor.moveToNext()) cursor.getString(0)?.takeIf(String::isNotBlank)?.let(result::add)
    }
    grantCandidate()?.routeId?.let(result::add)
    return result.toList()
}

/**
 * Só enfileira FINALIZE_ROUTE quando todas as paradas locais já são terminais.
 * Pausar a rota com entregas abertas nunca libera reserva nem encerra o contrato.
 */
fun OperationalStore.enqueueFinalizeIfComplete(nowMs: Long = System.currentTimeMillis()): Boolean {
    readableDatabase.query(
        "route_snapshot",
        arrayOf("route_id", "payload_json", "grant_token", "grant_expires_at_ms"),
        null,
        null,
        null,
        null,
        "updated_at_ms DESC",
        "1",
    ).use { cursor ->
        if (!cursor.moveToFirst() || cursor.isNull(2) || cursor.isNull(3)) return false
        val routeId = cursor.getString(0)?.trim().orEmpty()
        if (routeId.isBlank()) return false
        val expiresAt = cursor.getLong(3)
        if (!OperationalPolicy.isGrantUsable(expiresAt, nowMs)) return false
        val route = runCatching { JSONObject(cursor.getString(1)) }.getOrNull() ?: return false
        val items = route.optJSONArray("items") ?: return false
        if (items.length() == 0) return false
        for (index in 0 until items.length()) {
            val status = items.optJSONObject(index)?.optString("status")?.lowercase().orEmpty()
            if (status == "agendada" || status == "em_rota") return false
        }
        val commandId = "finalize:$routeId"
        val inserted = writableDatabase.insertWithOnConflict(
            "operation_outbox",
            null,
            ContentValues().apply {
                put("command_id", commandId)
                put("route_id", routeId)
                put("delivery_id", routeId)
                put("operation_type", "FINALIZE_ROUTE")
                put("idempotency_key", commandId)
                put("payload_json", JSONObject().put("routeId", routeId).toString())
                put("captured_at_ms", nowMs)
                put("state", "PENDING")
                put("attempts", 0)
                put("next_attempt_at_ms", 0)
                put("created_at_ms", nowMs)
            },
            android.database.sqlite.SQLiteDatabase.CONFLICT_IGNORE,
        )
        if (inserted != -1L) return true
        return readableDatabase.query(
            "operation_outbox",
            arrayOf("1"),
            "command_id = ? AND state IN ('PENDING', 'ACKED')",
            arrayOf(commandId),
            null,
            null,
            null,
            "1",
        ).use { it.moveToFirst() }
    }
}
