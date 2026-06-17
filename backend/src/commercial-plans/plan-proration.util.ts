// Proração de troca de plano (PR17062026043 / bloco B6). PURO e testável: dada a
// diferença de valor do ciclo e quanto falta do período pago, calcula:
//   - upgrade  → quanto cobrar AGORA (diferença proporcional aos dias restantes)
//   - downgrade → quanto gerar de CRÉDITO (sem cobrar nada agora)
// Regra de Ouro: nada de cobrar o ciclo inteiro de novo — só a fração que falta.

export type PlanProration = {
  // Fração do período pago que ainda falta (0..1). 1 = começo do período; 0 = fim.
  remainingRatio: number;
  // Upgrade: diferença proporcional a cobrar agora (>= 0). 0 em downgrade/igual.
  chargeNow: number;
  // Downgrade: crédito proporcional gerado (>= 0). 0 em upgrade/igual.
  creditGenerated: number;
};

function round2(value: number): number {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100) / 100;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function computeRemainingRatio(
  periodStart: Date | null | undefined,
  periodEnd: Date | null | undefined,
  now: Date = new Date(),
): number {
  const start = periodStart instanceof Date ? periodStart.getTime() : NaN;
  const end = periodEnd instanceof Date ? periodEnd.getTime() : NaN;
  // Sem período válido (empresa recém-ativada / dados ausentes): trata como período
  // cheio (ratio 1) — conservador, cobra/credita a diferença inteira.
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 1;
  const nowMs = now.getTime();
  if (nowMs <= start) return 1;
  if (nowMs >= end) return 0;
  const cycleMs = end - start;
  const remainingMs = end - nowMs;
  const ratio = remainingMs / cycleMs;
  return Math.min(1, Math.max(0, ratio));
}

export function computePlanProration(input: {
  fromCycleAmount: number;
  toCycleAmount: number;
  periodStart: Date | null | undefined;
  periodEnd: Date | null | undefined;
  now?: Date;
}): PlanProration {
  const now = input.now instanceof Date ? input.now : new Date();
  const remainingRatio = computeRemainingRatio(input.periodStart, input.periodEnd, now);
  const from = Math.max(0, Number(input.fromCycleAmount || 0) || 0);
  const to = Math.max(0, Number(input.toCycleAmount || 0) || 0);
  const delta = to - from;

  if (delta > 0) {
    return { remainingRatio, chargeNow: round2(delta * remainingRatio), creditGenerated: 0 };
  }
  if (delta < 0) {
    return { remainingRatio, chargeNow: 0, creditGenerated: round2(-delta * remainingRatio) };
  }
  return { remainingRatio, chargeNow: 0, creditGenerated: 0 };
}

// Dias inteiros restantes do período (pra mensagem ao cliente). >= 0.
export function remainingDays(
  periodEnd: Date | null | undefined,
  now: Date = new Date(),
): number {
  const end = periodEnd instanceof Date ? periodEnd.getTime() : NaN;
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.ceil((end - now.getTime()) / DAY_MS));
}
