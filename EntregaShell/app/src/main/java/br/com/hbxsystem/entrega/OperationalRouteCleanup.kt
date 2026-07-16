package br.com.hbxsystem.entrega

/**
 * Limpa somente snapshots antigos sem qualquer fila pendente/rejeitada. Esta
 * função é chamada após gravar a rota mais recente e preserva a recuperação de
 * uma rota anterior caso a operação ainda não tenha sido resolvida.
 */
fun OperationalStore.cleanupResolvedRouteSnapshots(currentRouteId: String) {
    writableDatabase.execSQL(
        """
        DELETE FROM route_snapshot
        WHERE route_id <> ?
          AND NOT EXISTS (
            SELECT 1 FROM operation_outbox o
            WHERE o.route_id = route_snapshot.route_id
              AND o.state IN ('PENDING', 'REJECTED')
          )
          AND NOT EXISTS (
            SELECT 1 FROM proof_outbox p
            WHERE p.route_id = route_snapshot.route_id
              AND p.state IN ('PENDING', 'REJECTED')
          )
        """.trimIndent(),
        arrayOf(currentRouteId),
    )
}
