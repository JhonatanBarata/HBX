package br.com.hbxsystem.entrega

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 🔴 O 409 QUE VIROU LOOP ETERNO (17/08/2026). Apurado no VPS: 5119 respostas
 *    409 num dia, 26 sessões de rastreamento presas, ~440 tentativas cada,
 *    ainda rodando na hora da coleta. O APK só sabia desistir de 403 e 404, e
 *    o 409 "esta execução já foi encerrada" era retentado para sempre.
 *
 *    Estes testes travam as DUAS metades da lei. A segunda é a que quase virou
 *    um bug pior que o original.
 */
class TrackingConflictPolicyTest {

    @Test
    fun `sessao encerrada e porta fechada — o app desiste`() {
        assertEquals(
            TrackingConflictAction.TERMINAL,
            trackingConflictAction("SESSAO_ENCERRADA"),
        )
    }

    @Test
    fun `aparelho trocado e rota indisponivel tambem sao terminais`() {
        assertEquals(TrackingConflictAction.TERMINAL, trackingConflictAction("APARELHO_TROCADO"))
        assertEquals(TrackingConflictAction.TERMINAL, trackingConflictAction("ROTA_INDISPONIVEL"))
    }

    /**
     * A ARMADILHA: este 409 é o servidor dizendo ESPERA, não ACABOU. Se ele
     * virar TERMINAL, o END é descartado e a rota nunca encerra — troca de um
     * loop por um bug pior. O par server-side mora em
     * `logistica-tracking.service.test.ts` ("END retorna 409 com stop aberto").
     */
    @Test
    fun `entregas abertas NUNCA e terminal — o END precisa continuar tentando`() {
        assertEquals(
            TrackingConflictAction.RETRY,
            trackingConflictAction("ENTREGAS_ABERTAS"),
        )
    }

    @Test
    fun `evento reusado vai pra quarentena, nao trava a fila`() {
        assertEquals(
            TrackingConflictAction.QUARANTINE,
            trackingConflictAction("EVENTO_REUSADO"),
        )
    }

    /**
     * Backend antigo não manda código. A resposta segue sendo a de sempre
     * (RETRY) — quem impede o eterno aqui é o teto de tentativas da outbox,
     * que não depende deste mapa estar completo.
     */
    @Test
    fun `sem codigo o app continua conservador`() {
        assertEquals(TrackingConflictAction.RETRY, trackingConflictAction(null))
        assertEquals(TrackingConflictAction.RETRY, trackingConflictAction(""))
        assertEquals(TrackingConflictAction.RETRY, trackingConflictAction("   "))
        assertEquals(TrackingConflictAction.RETRY, trackingConflictAction("CODIGO_QUE_NINGUEM_MAPEOU"))
    }

    @Test
    fun `codigo chega em qualquer caixa e com espaco sobrando`() {
        assertEquals(TrackingConflictAction.TERMINAL, trackingConflictAction("  sessao_encerrada  "))
        assertEquals(TrackingConflictAction.RETRY, trackingConflictAction("entregas_abertas"))
    }

    /** 403 e 404 continuam terminais — o freio novo não afrouxou o antigo. */
    @Test
    fun `o disjuntor antigo continua de pe`() {
        assertEquals(true, isTerminalTrackingHttpStatus(403))
        assertEquals(true, isTerminalTrackingHttpStatus(404))
        assertEquals(false, isTerminalTrackingHttpStatus(409))
        assertEquals(false, isTerminalTrackingHttpStatus(500))
    }
}
