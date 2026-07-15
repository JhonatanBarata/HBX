package br.com.hbxsystem.entrega

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeApiClientPathPolicyTest {
    @Test
    fun logisticaAllowsOnlyTheCanonicalClientEndpointsFromNucleo() {
        assertTrue(isMobileEndpointAllowed("logistica", "/nucleo/clientes"))
        assertTrue(isMobileEndpointAllowed("logistica", "/nucleo/contas"))
        assertFalse(isMobileEndpointAllowed("logistica", "/nucleo/empresas"))
        assertFalse(isMobileEndpointAllowed("logistica", "/nucleo/clientes/cliente-1"))
    }

    @Test
    fun vendasCannotAccessNucleoOrLogistica() {
        assertTrue(isMobileEndpointAllowed("vendas", "/vendas/board"))
        assertFalse(isMobileEndpointAllowed("vendas", "/nucleo/clientes"))
        assertFalse(isMobileEndpointAllowed("vendas", "/logistica/rota"))
    }
}
