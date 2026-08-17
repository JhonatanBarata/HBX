import { ConflictException } from '@nestjs/common';

/**
 * 🔴 O 409 QUE VIROU LOOP ETERNO (17/08/2026 — print do dono, apurado no VPS:
 *    5119 respostas 409 num dia, 26 sessões de rastreamento presas, ~440
 *    tentativas cada, ainda rodando na hora da coleta).
 *
 *    O APK só sabia desistir de 403 e 404 (`isTerminalTrackingHttpStatus`). Um
 *    409 "esta execução já foi encerrada" — que é DEFINITIVO, a sessão nunca
 *    reabre — caía no `else { needsRetry = true }` e era retentado para sempre:
 *    bateria do entregador, dados móveis e, pior, a fila serial da outbox
 *    entupida por lixo velho na frente do evento novo que precisava subir.
 *
 *    A armadilha: NEM TODO 409 do rastreamento é definitivo. "Ainda existem
 *    entregas abertas nesta rota" é o servidor dizendo ESPERA — o APK tem que
 *    continuar tentando, senão o END nunca fecha a rota. Tratar 409 cru como
 *    terminal trocaria um loop por um bug pior: rota que não encerra.
 *
 *    Por isso o 409 passou a viajar com CÓDIGO, não só com frase. Comparar
 *    texto quebra no dia que alguém corrigir uma vírgula; o código é contrato.
 *    Quem lê do outro lado: `trackingConflictAction` em `TrackingModels.kt`.
 *
 *    A frase continua em `message` — o `HttpException` do Nest promove
 *    `response.message` a `error.message`, então log e teste que casam por
 *    texto seguem valendo.
 */
export const TRACKING_CONFLICT = {
  /** Sessão/rota morta. Nunca reabre: o app desiste e para de capturar. */
  SESSAO_ENCERRADA: 'SESSAO_ENCERRADA',
  /** Outro aparelho assumiu a rota. Terminal para ESTE aparelho. */
  APARELHO_TROCADO: 'APARELHO_TROCADO',
  /** Rota em FAILED/REFUNDING — não volta a aceitar rastreamento. */
  ROTA_INDISPONIVEL: 'ROTA_INDISPONIVEL',
  /** TRANSITÓRIO: resolve sozinho quando as entregas fecharem. Retentar é o certo. */
  ENTREGAS_ABERTAS: 'ENTREGAS_ABERTAS',
  /** Corrida ainda não inicializada — conservador, o app tenta de novo. */
  SESSAO_NAO_INICIALIZADA: 'SESSAO_NAO_INICIALIZADA',
  /** Mesmo eventId com outro conteúdo: erro de dado, vai pra quarentena. */
  EVENTO_REUSADO: 'EVENTO_REUSADO',
  /** Mais de uma rota ativa: o app precisa dizer qual. */
  ROTA_AMBIGUA: 'ROTA_AMBIGUA',
} as const;

export type TrackingConflictCode = (typeof TRACKING_CONFLICT)[keyof typeof TRACKING_CONFLICT];

/** Todo 409 do rastreamento nasce aqui — código pro app, frase pro humano. */
export function conflitoRastreamento(
  code: TrackingConflictCode,
  message: string,
): ConflictException {
  return new ConflictException({ code, message });
}
