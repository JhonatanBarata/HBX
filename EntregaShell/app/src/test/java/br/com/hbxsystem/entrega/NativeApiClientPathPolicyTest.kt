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
        assertTrue(isMobileEndpointAllowed("logistica", "DELETE", "/nucleo/contas/cliente-1"))
        assertTrue(isMobileEndpointAllowed("logistica", "PATCH", "/nucleo/locais/local-1"))
        assertTrue(isMobileEndpointAllowed("logistica", "PATCH", "/nucleo/telefones/telefone-1"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/nucleo/clientes/cliente-1/locais"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/nucleo/clientes/cliente-1/telefones"))
        assertFalse(isMobileEndpointAllowed("logistica", "GET", "/nucleo/empresas"))
        assertFalse(isMobileEndpointAllowed("logistica", "DELETE", "/nucleo/clientes/cliente-1"))
        assertFalse(isMobileEndpointAllowed("logistica", "PATCH", "/nucleo/clientes/cliente-1/locais/local-2"))
    }

    @Test
    fun logisticaDoesNotExposeSalesEndpoints() {
        assertFalse(isMobileEndpointAllowed("logistica", "GET", "/vendas/board"))
        assertFalse(isMobileEndpointAllowed("logistica", "GET", "/webscraping/radar/leads"))
        assertFalse(isMobileEndpointAllowed("logistica", "POST", "/webscraping/radar/leads/lead-1/send-to-vendas"))
        assertFalse(isMobileEndpointAllowed("logistica", "PATCH", "/vendas/lead/lead-1"))
        assertFalse(isMobileEndpointAllowed("logistica", "DELETE", "/vendas/lead/lead-1"))
        assertFalse(isMobileEndpointAllowed("logistica", "POST", "/webscraping/radar/leads"))
        assertFalse(isMobileEndpointAllowed("logistica", "GET", "/webscraping/radar/admin"))
    }

    @Test
    fun logisticaEndpointsAlsoUseAnExactMethodPolicy() {
        assertTrue(isMobileEndpointAllowed("logistica", "GET", "/logistica/rota"))
        assertTrue(isMobileEndpointAllowed("logistica", "GET", "/logistica/mobile/route"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/logistica/mobile/materialize"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/logistica/rota/conferir"))
        assertTrue(isMobileEndpointAllowed("logistica", "GET", "/logistica/rota/custo-preview"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/logistica/rota/iniciar"))
        assertTrue(isMobileEndpointAllowed("logistica", "GET", "/logistica/admin-route/route"))
        assertTrue(isMobileEndpointAllowed("logistica", "GET", "/logistica/admin-route/adjustments"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/logistica/admin-route/prepare"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/logistica/admin-route/start"))
        assertTrue(isMobileEndpointAllowed("logistica", "PATCH", "/logistica/config"))
        assertTrue(isMobileEndpointAllowed("logistica", "DELETE", "/logistica/cliente-produtos/item-1"))
        assertFalse(isMobileEndpointAllowed("logistica", "POST", "/logistica/admin-route/route"))
        assertFalse(isMobileEndpointAllowed("logistica", "GET", "/logistica/admin-route/start"))
        assertFalse(isMobileEndpointAllowed("logistica", "DELETE", "/logistica/admin-route/prepare"))
        assertFalse(isMobileEndpointAllowed("logistica", "GET", "/logistica/admin-route/unknown"))
        assertFalse(isMobileEndpointAllowed("logistica", "DELETE", "/logistica/rota"))
        assertFalse(isMobileEndpointAllowed("logistica", "GET", "/logistica/rota/conferir"))
        assertFalse(isMobileEndpointAllowed("logistica", "POST", "/logistica/rota/custo-preview"))
        assertFalse(isMobileEndpointAllowed("logistica", "GET", "/logistica/admin"))
        assertFalse(isMobileEndpointAllowed("logistica", "POST", "/products/item-1"))
    }

    @Test
    fun pr18072026EndpointsFollowTheExactMethodPolicy() {
        assertTrue(isMobileEndpointAllowed("logistica", "GET", "/products"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/logistica/rota/limpar-dia"))
        assertTrue(isMobileEndpointAllowed("logistica", "GET", "/logistica/rota-modelos"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/logistica/rota-modelos"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/logistica/rota-modelos/modelo-1/gerar"))
        assertTrue(isMobileEndpointAllowed("logistica", "PATCH", "/logistica/rota-modelos/modelo-1"))
        assertTrue(isMobileEndpointAllowed("logistica", "DELETE", "/logistica/rota-modelos/modelo-1"))
        assertTrue(isMobileEndpointAllowed("logistica", "PATCH", "/logistica/produtos/produto-1"))
        assertFalse(isMobileEndpointAllowed("logistica", "DELETE", "/logistica/produtos/produto-1"))
        assertFalse(isMobileEndpointAllowed("logistica", "GET", "/logistica/rota-modelos/modelo-1"))
        assertFalse(isMobileEndpointAllowed("logistica", "POST", "/logistica/rota-modelos/modelo-1"))
        assertFalse(isMobileEndpointAllowed("vendas", "GET", "/logistica/rota-modelos"))
    }

    @Test
    fun reverseGeocodeDaLeituraPassaPelaPolitica() {
        assertTrue(isMobileEndpointAllowed("logistica", "GET", "/logistica/geo/reverse"))
        // R2 (27/07) — rota rápida: CEP+número → pino (CNEFE).
        assertTrue(isMobileEndpointAllowed("logistica", "GET", "/logistica/geo/cep"))
        // Só leitura: o app nunca escreve em /logistica/geo.
        assertFalse(isMobileEndpointAllowed("logistica", "POST", "/logistica/geo/reverse"))
        assertFalse(isMobileEndpointAllowed("logistica", "POST", "/logistica/geo/cep"))
        assertFalse(isMobileEndpointAllowed("logistica", "GET", "/logistica/geo"))
        assertFalse(isMobileEndpointAllowed("vendas", "GET", "/logistica/geo/reverse"))
    }

    @Test
    fun recargaExposesOnlyItsExactOwnerCheckoutEndpoints() {
        assertTrue(isMobileEndpointAllowed("logistica", "GET", "/credits/me"))
        assertTrue(isMobileEndpointAllowed("logistica", "GET", "/financeiro/payments-config"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/financeiro/credits/recharge"))
        assertFalse(isMobileEndpointAllowed("logistica", "GET", "/financeiro/credits/recharge"))
        assertFalse(isMobileEndpointAllowed("logistica", "POST", "/financeiro/payments-config"))
        assertTrue(isMobileEndpointAllowed("vendas", "GET", "/credits/me"))
        assertTrue(isMobileEndpointAllowed("vendas", "GET", "/financeiro/payments-config"))
        assertTrue(isMobileEndpointAllowed("vendas", "POST", "/financeiro/credits/recharge"))
    }

    @Test
    fun pr20072026LeituraDeRotaEndpointsFollowTheExactMethodPolicy() {
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/logistica/leitura/iniciar"))
        assertTrue(isMobileEndpointAllowed("logistica", "GET", "/logistica/leitura/atual"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/logistica/leitura/sessao-1/parada"))
        assertTrue(isMobileEndpointAllowed("logistica", "GET", "/logistica/leitura/sessao-1/resumo"))
        assertTrue(isMobileEndpointAllowed("logistica", "PATCH", "/logistica/leitura/sessao-1/parada/parada-1"))
        assertTrue(isMobileEndpointAllowed("logistica", "DELETE", "/logistica/leitura/sessao-1/parada/parada-1"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/logistica/leitura/sessao-1/finalizar"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/logistica/leitura/sessao-1/cancelar"))
        assertFalse(isMobileEndpointAllowed("logistica", "GET", "/logistica/leitura/sessao-1"))
        assertFalse(isMobileEndpointAllowed("logistica", "POST", "/logistica/leitura/sessao-1"))
        assertFalse(isMobileEndpointAllowed("logistica", "DELETE", "/logistica/leitura/sessao-1"))
        assertFalse(isMobileEndpointAllowed("logistica", "GET", "/logistica/leitura/sessao-1/parada/parada-1"))
        assertFalse(isMobileEndpointAllowed("logistica", "POST", "/logistica/leitura/sessao-1/parada/parada-1"))
        assertFalse(isMobileEndpointAllowed("vendas", "GET", "/logistica/leitura/atual"))
        assertFalse(isMobileEndpointAllowed("vendas", "POST", "/logistica/leitura/iniciar"))
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
