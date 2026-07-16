package br.com.hbxsystem.entrega

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
