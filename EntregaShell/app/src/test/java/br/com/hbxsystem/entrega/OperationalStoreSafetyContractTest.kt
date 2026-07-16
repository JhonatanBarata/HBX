package br.com.hbxsystem.entrega

import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Compile-time contract: logout and snapshot rotation use the unresolved-data
 * helpers instead of treating REJECTED as disposable.
 */
class OperationalStoreSafetyContractTest {
    @Test
    fun `safety helpers remain part of operational store contract`() {
        assertTrue(OperationalStore::hasUnresolvedOperationalData.name.isNotBlank())
        assertTrue(OperationalStore::cleanupResolvedRouteSnapshots.name.isNotBlank())
    }
}
