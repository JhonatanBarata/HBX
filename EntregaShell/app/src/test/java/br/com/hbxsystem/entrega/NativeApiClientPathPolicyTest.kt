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
        assertTrue(isMobileEndpointAllowed("logistica", "GET", "/nucleo/contas/por-endereco"))
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
    fun reverseGeocodePassaPelaPolitica() {
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

    /**
     * F4 (09/08, PR09082026-ROTA-SEIS-VERBOS/G1+G3) — LEITURA DE ROTA e ROTA
     * INDICADA foram ENTERRADAS: 17 sessões de leitura, todas canceladas, 0
     * paradas capturadas; 4 indicações na vida inteira. As telas saíram do app
     * e os endpoints saem do backend.
     *
     * Este teste é a LÁPIDE: allowlist é a única coisa que sobreviveria a uma
     * remoção pela metade (linha esquecida aqui = porta aberta pra um endpoint
     * que não existe mais, e o defeito só apareceria no aparelho).
     */
    @Test
    fun leituraDeRotaERotaIndicadaEstaoEnterradas() {
        assertFalse(isMobileEndpointAllowed("logistica", "POST", "/logistica/leitura/iniciar"))
        assertFalse(isMobileEndpointAllowed("logistica", "GET", "/logistica/leitura/atual"))
        assertFalse(isMobileEndpointAllowed("logistica", "POST", "/logistica/leitura/sessao-1/parada"))
        assertFalse(isMobileEndpointAllowed("logistica", "GET", "/logistica/leitura/sessao-1/resumo"))
        assertFalse(isMobileEndpointAllowed("logistica", "PATCH", "/logistica/leitura/sessao-1/parada/parada-1"))
        assertFalse(isMobileEndpointAllowed("logistica", "DELETE", "/logistica/leitura/sessao-1/parada/parada-1"))
        assertFalse(isMobileEndpointAllowed("logistica", "POST", "/logistica/leitura/sessao-1/finalizar"))
        assertFalse(isMobileEndpointAllowed("logistica", "POST", "/logistica/leitura/sessao-1/cancelar"))
        assertFalse(isMobileEndpointAllowed("logistica", "POST", "/logistica/leitura/sessao-1/trilha"))
        assertFalse(isMobileEndpointAllowed("logistica", "GET", "/logistica/rota-indicadas/pendentes"))
        assertFalse(isMobileEndpointAllowed("logistica", "POST", "/logistica/rota-indicadas/missao-1/responder"))
        assertFalse(isMobileEndpointAllowed("logistica", "POST", "/logistica/rota-indicadas/missao-1/aplicada"))
        assertFalse(isMobileEndpointAllowed("logistica", "POST", "/logistica/rota-indicadas/missao-1/alarme-armado"))
    }

    /**
     * 03/08 — O TESTE QUE GRITA PELO RECADO QUE NÃO CHEGAVA.
     *
     * O app.js chamava os três caminhos abaixo e o cliente nativo barrava ANTES
     * de sair do aparelho ("Esta operação não pertence ao logistica"): não havia
     * uma linha sequer com "recados" na allowlist. O sintoma no aparelho era
     * "recado não chega" e nada aparecia no log do backend — porque o pedido
     * nunca foi feito. Se alguém apagar as linhas de novo, é AQUI que quebra,
     * sem precisar de aparelho no cabo.
     */
    @Test
    fun logisticaAllowsTheRecadoContract() {
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/logistica/recados/puxar"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/logistica/recados/pendentes"))
        assertTrue(isMobileEndpointAllowed("logistica", "GET", "/logistica/recados/me"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/logistica/recados/recebidos"))
        assertTrue(isMobileEndpointAllowed("logistica", "GET", "/logistica/recados/portao"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/logistica/recados/visto"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/logistica/recados/responder"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/logistica/recados/recado-1/entendi"))
        // Método trocado não passa (a política é por método, não por caminho).
        assertFalse(isMobileEndpointAllowed("logistica", "GET", "/logistica/recados/puxar"))
        assertFalse(isMobileEndpointAllowed("logistica", "POST", "/logistica/recados/portao"))
        // Caminho incompleto e leitura avulsa continuam fora.
        assertFalse(isMobileEndpointAllowed("logistica", "POST", "/logistica/recados"))
        assertFalse(isMobileEndpointAllowed("logistica", "GET", "/logistica/recados/9"))
        // E nada disso vaza pro módulo de vendas.
        assertFalse(isMobileEndpointAllowed("vendas", "POST", "/logistica/recados/puxar"))
        assertFalse(isMobileEndpointAllowed("vendas", "GET", "/logistica/recados/portao"))
    }

    /**
     * FECHAMENTO DO DIA (04/08) e VER TELA (05/08) — o mesmo teste que gritou
     * pelo recado, agora pelos dois caminhos novos. Sem a linha da allowlist, o
     * painel do master ficaria "Aguardando o aparelho…" com o servidor 100% ok,
     * e a venda por toque morreria dentro do celular.
     *
     * 🔴 OS DOIS ENDEREÇOS SÃO COBRADOS AQUI (09/08). `fechamento/…` é o vivo;
     * `caderneta/…` é a porta velha do aparelho que ainda não atualizou.
     * (E a reticência não é estilo: comentário de bloco em Kotlin ANINHA, então
     * um `/` seguido de `*` dentro do texto abre um comentário que nunca fecha e
     * derruba o arquivo inteiro no compilador — foi o que aconteceu aqui.)
     * Testar
     * só o novo deixaria a remoção acidental da porta velha passar verde e
     * derrubar a venda de quem está na rua com o APK antigo.
     */
    @Test
    fun logisticaAllowsFechamentoAndEspelho() {
        assertTrue(isMobileEndpointAllowed("logistica", "GET", "/logistica/fechamento/resumo"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/logistica/fechamento/vender"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/logistica/fechamento/apagar-venda"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/logistica/fechamento/finalizar"))
        assertFalse(isMobileEndpointAllowed("vendas", "POST", "/logistica/fechamento/finalizar"))
        assertFalse(isMobileEndpointAllowed("vendas", "POST", "/logistica/fechamento/apagar-venda"))
        // A PORTA VELHA continua atendendo o APK instalado.
        assertTrue(isMobileEndpointAllowed("logistica", "GET", "/logistica/caderneta/resumo"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/logistica/caderneta/vender"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/logistica/caderneta/apagar-venda"))
        assertFalse(isMobileEndpointAllowed("vendas", "POST", "/logistica/caderneta/apagar-venda"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/logistica/caderneta/finalizar"))
        assertFalse(isMobileEndpointAllowed("vendas", "POST", "/logistica/caderneta/finalizar"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/logistica/espelho/quadro"))
        // Espelho é só ESCRITA do aparelho: quem lê é o master, pela web.
        assertFalse(isMobileEndpointAllowed("logistica", "GET", "/logistica/espelho/quadro"))
        assertFalse(isMobileEndpointAllowed("logistica", "POST", "/logistica/espelho"))
        assertFalse(isMobileEndpointAllowed("logistica", "POST", "/master/aparelhos/dev-1/espelho"))
        assertFalse(isMobileEndpointAllowed("vendas", "POST", "/logistica/espelho/quadro"))
    }

    /**
     * TUTORIAL OBRIGATÓRIO (09/08) — a mesma armadilha do recado, pela 3ª vez.
     *
     * Sem as duas linhas da allowlist o defeito seria MUDO nos dois lados: o app
     * trata "não sei" como "já viu" (de propósito, pra não prender ninguém 90 s
     * a cada falha de rede), então o tutorial simplesmente nunca abriria, e o
     * "visto" nunca gravaria. Backend verde, celular calado, nada no log.
     */
    @Test
    fun logisticaAllowsTheTutorialContract() {
        assertTrue(isMobileEndpointAllowed("logistica", "GET", "/logistica/tutorial"))
        assertTrue(isMobileEndpointAllowed("logistica", "POST", "/logistica/tutorial/visto"))
        // A política é por MÉTODO, não por caminho: trocar o verbo não passa.
        assertFalse(isMobileEndpointAllowed("logistica", "POST", "/logistica/tutorial"))
        assertFalse(isMobileEndpointAllowed("logistica", "GET", "/logistica/tutorial/visto"))
        // E nada disso vaza pro módulo de vendas.
        assertFalse(isMobileEndpointAllowed("vendas", "GET", "/logistica/tutorial"))
        assertFalse(isMobileEndpointAllowed("vendas", "POST", "/logistica/tutorial/visto"))
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
