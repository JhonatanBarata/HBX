package br.com.hbxsystem.entrega

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeApiClientPathPolicyTest {
    @Test
    fun logisticaAllowsOnlyTheCanonicalClientEndpointsFromNucleo() {
        assertTrue(isMobileEndpointAllowed("logistica", "GET", "/nucleo/clientes"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/nucleo/contas"))
        assertTrue(isMobileEndpointAllowed("logistica", "GET", "/nucleo/clientes/cliente-1"))
        assertTrue(isMobileEndpointAllowed("logistica", "PATCH", "/nucleo/contas/cliente-1"))
        assertTrue(isMobileEndpointAllowed("logistica", "PATCH", "/nucleo/locais/local-1"))
        assertTrue(isMobileEndpointAllowed("logistica", "PATCH", "/nucleo/telefones/telefone-1"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/nucleo/clientes/cliente-1/locais"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/nucleo/clientes/cliente-1/telefones"))
        assertFalse(isMobileEndpointAllowed("logistica", "GET", "/nucleo/empresas"))
        assertFalse(isMobileEndpointAllowed("logistica", "DELETE", "/nucleo/clientes/cliente-1"))
        assertFalse(isMobileEndpointAllowed("logistica", "PATCH", "/nucleo/clientes/cliente-1/locais/local-2"))
    }

    @Test
    fun hbxMobileAllowsTheUsedSalesEndpointsWithTheirExactMethods() {
        assertTrue(isMobileEndpointAllowed("logistica", "GET", "/vendas/board"))
        assertTrue(isMobileEndpointAllowed("logistica", "GET", "/products"))
        assertTrue(isMobileEndpointAllowed("logistica", "GET", "/webscraping/radar/leads"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/webscraping/radar/leads/lead-1/send-to-vendas"))
        assertTrue(isMobileEndpointAllowed("logistica", "PATCH", "/vendas/lead/lead-1"))
        assertFalse(isMobileEndpointAllowed("logistica", "DELETE", "/vendas/lead/lead-1"))
        assertFalse(isMobileEndpointAllowed("logistica", "POST", "/webscraping/radar/leads"))
        assertFalse(isMobileEndpointAllowed("logistica", "GET", "/webscraping/radar/admin"))
    }

    @Test
    fun logisticaEndpointsAlsoUseAnExactMethodPolicy() {
        assertTrue(isMobileEndpointAllowed("logistica", "GET", "/logistica/rota"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/logistica/rota/iniciar"))
        assertTrue(isMobileEndpointAllowed("logistica", "PATCH", "/logistica/config"))
        assertTrue(isMobileEndpointAllowed("logistica", "DELETE", "/logistica/cliente-produtos/item-1"))
        assertFalse(isMobileEndpointAllowed("logistica", "DELETE", "/logistica/rota"))
        assertFalse(isMobileEndpointAllowed("logistica", "GET", "/logistica/admin"))
        assertFalse(isMobileEndpointAllowed("logistica", "POST", "/products/item-1"))
    }

    @Test
    fun vendasCannotAccessNucleoOrLogistica() {
        assertTrue(isMobileEndpointAllowed("vendas", "GET", "/vendas/board"))
        assertTrue(isMobileEndpointAllowed("vendas", "GET", "/products"))
        assertTrue(isMobileEndpointAllowed("vendas", "POST", "/vendas/lead/lead-1/attempt"))
        assertFalse(isMobileEndpointAllowed("vendas", "GET", "/nucleo/clientes"))
        assertFalse(isMobileEndpointAllowed("vendas", "GET", "/logistica/rota"))
    }
}
