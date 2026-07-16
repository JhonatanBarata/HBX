package br.com.hbxsystem.entrega

/**
 * Pendência e rejeição são estados não resolvidos. Logout/troca de rota não pode
 * apagar a única evidência local de uma entrega ou comprovante.
 */
fun OperationalStore.hasUnresolvedOperationalData(): Boolean {
    readableDatabase.rawQuery(
        """
        SELECT 1
        FROM operation_outbox
        WHERE state IN ('PENDING', 'REJECTED')
        UNION ALL
        SELECT 1
        FROM proof_outbox
        WHERE state IN ('PENDING', 'REJECTED')
        LIMIT 1
        """.trimIndent(),
        null,
    ).use { return it.moveToFirst() }
}
