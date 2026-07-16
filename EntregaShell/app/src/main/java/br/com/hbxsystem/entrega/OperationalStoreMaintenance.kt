package br.com.hbxsystem.entrega

/** Maintenance entrypoint kept outside SQLiteOpenHelper internals for testability. */
fun OperationalStore.afterServerRouteStored(currentRouteId: String) {
    cleanupResolvedRouteSnapshots(currentRouteId)
}
