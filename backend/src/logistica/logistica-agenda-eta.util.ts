// S4-AVISO-DE-HORARIO — função PURA (sem Prisma/tx), reusada pelo service de
// agenda pra somar o "chega ~10h35" de cada parada e comparar com a janela do
// cliente. v1 é chute honesto: soma tempo de parada + deslocamento fixo, SEM
// OSRM/distância real. Nunca decide sozinha nada que bloqueia — só informa.

/** Defaults nomeados (v1 simples, sem roteamento real — ver S4-AVISO-DE-HORARIO.md). */
export const AGENDA_ETA_HORA_SAIDA_PADRAO = '08:00';
export const AGENDA_ETA_DESLOCAMENTO_MIN_PADRAO = 5;
export const AGENDA_ETA_TEMPO_PARADA_MIN_PADRAO = 10;
/** Janela "apertada" = chega nos últimos N minutos antes do fim, mas ainda dentro dela. */
export const AGENDA_ETA_APERTADO_MARGEM_MIN = 15;

export type AgendaJanelaTipo = 'RIGIDA' | 'PREFERENCIAL';
export type AgendaAlertaJanela = 'CONFLITO' | 'APERTADO' | null;

export interface EtaParadaInput {
  /** Minutos previstos parado no cliente. Ausente (null/undefined) usa o default — 0 explícito é respeitado. */
  tempoParadaMin?: number | null;
  /** Fim da janela do cliente ("HH:MM"). Ausente = parada sem janela = NUNCA gera aviso (não inventar janela). */
  janelaFim?: string | null;
  janelaTipo?: AgendaJanelaTipo | null;
}

export interface EtaParadaResultado {
  eta: string;
  alertaJanela: AgendaAlertaJanela;
}

/**
 * eta[0] = horaSaida + deslocamento; eta[i] = eta[i-1] + tempoParada[i-1] + deslocamento.
 *
 * Virada de hora: a soma acumulada NUNCA é truncada/zerada no meio do cálculo — só na
 * hora de FORMATAR o relógio (`formatarMinutosComoHora`) é que o total "sobra" pro dia
 * seguinte (module 1440, sempre >=0 — nunca hora negativa). A comparação com `janelaFim`
 * usa o minuto ACUMULADO cru (pré-wrap): como `janelaFim` só existe entre 0 e 1439, uma
 * rota que estoura a meia-noite automaticamente fica CONFLITO (ou APERTADO se
 * PREFERENCIAL) em qualquer parada restante daquele dia — é o comportamento esperado
 * (chegar de madrugada nunca está dentro da janela de hoje).
 */
export function calcularEtas(
  paradas: EtaParadaInput[],
  horaSaidaInput?: string | null,
  deslocamentoMinInput?: number | null,
): EtaParadaResultado[] {
  const horaSaidaMin = parseHoraParaMinutos(horaSaidaInput)
    ?? parseHoraParaMinutos(AGENDA_ETA_HORA_SAIDA_PADRAO)
    ?? 8 * 60;
  const deslocamentoMin = resolveMinutosOuPadrao(deslocamentoMinInput, AGENDA_ETA_DESLOCAMENTO_MIN_PADRAO);

  const resultado: EtaParadaResultado[] = [];
  let etaAcumuladaMin = horaSaidaMin + deslocamentoMin;

  paradas.forEach((parada, index) => {
    if (index > 0) {
      const anterior = paradas[index - 1];
      const tempoParadaAnteriorMin = resolveMinutosOuPadrao(
        anterior.tempoParadaMin,
        AGENDA_ETA_TEMPO_PARADA_MIN_PADRAO,
      );
      etaAcumuladaMin += tempoParadaAnteriorMin + deslocamentoMin;
    }
    resultado.push({
      eta: formatarMinutosComoHora(etaAcumuladaMin),
      alertaJanela: calcularAlertaJanela(etaAcumuladaMin, parada),
    });
  });

  return resultado;
}

function calcularAlertaJanela(etaMinCru: number, parada: EtaParadaInput): AgendaAlertaJanela {
  const janelaFimMin = parseHoraParaMinutos(parada.janelaFim);
  if (janelaFimMin == null) return null; // sem janela = sem aviso, nunca inventar (Lei nº1)

  const estourou = etaMinCru > janelaFimMin;
  if (estourou) {
    // Janela PREFERENCIAL rebaixa CONFLITO→APERTADO — só a RÍGIDA bloqueia de verdade.
    return parada.janelaTipo === 'PREFERENCIAL' ? 'APERTADO' : 'CONFLITO';
  }
  const margemInicioMin = Math.max(0, janelaFimMin - AGENDA_ETA_APERTADO_MARGEM_MIN);
  if (etaMinCru >= margemInicioMin) return 'APERTADO';
  return null;
}

function parseHoraParaMinutos(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatarMinutosComoHora(minutosAcumulados: number): string {
  const minutosNoDia = ((Math.trunc(minutosAcumulados) % 1440) + 1440) % 1440;
  const horas = Math.floor(minutosNoDia / 60);
  const minutos = minutosNoDia % 60;
  return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
}

function resolveMinutosOuPadrao(value: number | null | undefined, fallback: number): number {
  if (value === null || value === undefined) return fallback; // "ausente" — 0 explícito NÃO cai aqui
  const num = Math.trunc(Number(value));
  return Number.isFinite(num) && num >= 0 ? num : fallback;
}
