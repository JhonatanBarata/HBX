package br.com.hbxsystem.entrega

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class OperationalPolicyTest {
    @Test
    fun `a rota expira as seis do dia seguinte em Sao Paulo`() {
        assertEquals(
            Instant.parse("2026-07-17T09:00:00Z").toEpochMilli(),
            OperationalPolicy.routeExpiryMs("2026-07-16"),
        )
    }

    @Test
    fun `somente confirmar e cancelar de uma entrega viram mutacao local`() {
        assertEquals(
            "entrega-1",
            OperationalPolicy.deliveryIdForMutation("POST", "/logistica/entregas/entrega-1/confirmar"),
        )
        assertEquals(
            "CANCEL_DELIVERY",
            OperationalPolicy.mutationType("/logistica/entregas/entrega-1/cancelar?source=app"),
        )
        assertNull(OperationalPolicy.deliveryIdForMutation("GET", "/logistica/entregas/entrega-1/confirmar"))
        assertNull(OperationalPolicy.deliveryIdForMutation("POST", "/logistica/rota/iniciar"))
    }

    @Test
    fun `a rota antiga e a rota mobile contam como leitura de rota`() {
        assertTrue(OperationalPolicy.isRouteRead("GET", "/logistica/rota"))
        assertTrue(OperationalPolicy.isRouteRead("GET", "/logistica/mobile/route"))
        assertTrue(OperationalPolicy.isRouteRead("GET", "/logistica/mobile/route?date=2026-07-18"))
        assertFalse(OperationalPolicy.isRouteRead("POST", "/logistica/mobile/route"))
    }

    @Test
    fun `wifi only exige rede validada e nao tarifada`() {
        assertFalse(OperationalPolicy.proofUploadAllowed(wifiOnly = true, validated = true, unmetered = false))
        assertTrue(OperationalPolicy.proofUploadAllowed(wifiOnly = true, validated = true, unmetered = true))
        assertTrue(OperationalPolicy.proofUploadAllowed(wifiOnly = false, validated = true, unmetered = false))
        assertFalse(OperationalPolicy.proofUploadAllowed(wifiOnly = false, validated = false, unmetered = true))
    }

    @Test
    fun `grant vencido nunca autoriza nova acao local`() {
        assertTrue(OperationalPolicy.isGrantUsable(expiresAtMs = 2_000, nowMs = 1_999))
        assertFalse(OperationalPolicy.isGrantUsable(expiresAtMs = 2_000, nowMs = 2_000))
        assertFalse(OperationalPolicy.isGrantUsable(expiresAtMs = null, nowMs = 1_000))
    }
}
