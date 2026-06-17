// Espelho FRONT do ranking de planos do backend (commercial-plan-catalog.ts:
// getCommercialPlanRank/classifyPlanChange). Fonte da DIREÇÃO da troca —
// NUNCA adivinhar por preço (quebra no ciclo anual, em cortesia e em trial).
// List < Lead < Pro; Implantação (MELHOR) = contato, fora do ranking.

export const PLAN_KEYS = {
  LITE: "hbx_lite",
  PADRAO: "hbx_padrao",
  PRO: "hbx_pro",
  MELHOR: "hbx_melhor",
} as const;

export type PlanChangeDirection = "upgrade" | "downgrade" | "same" | "contact";

export function planRank(key: unknown): number {
  const k = String(key || "").trim().toLowerCase();
  if (k === PLAN_KEYS.LITE) return 1;
  if (k === PLAN_KEYS.PADRAO) return 2;
  if (k === PLAN_KEYS.PRO) return 3;
  return -1; // MELHOR / sem plano / desconhecido não entra no ranking self-service
}

// 'contact' = destino é Implantação (não é troca, é contato).
// from sem plano (rank -1) para qualquer plano pago = 'upgrade' (assinar do zero).
// from Implantação para plano self-service = sempre 'downgrade' (rank -1 é inferior a 1,2,3 numericamente mas Implantação é o topo).
export function classifyPlanChange(fromKey: unknown, toKey: unknown): PlanChangeDirection {
  const from = String(fromKey || "").trim().toLowerCase();
  const to = String(toKey || "").trim().toLowerCase();
  if (to === PLAN_KEYS.MELHOR) return "contact";
  if (from === PLAN_KEYS.MELHOR) return "downgrade";
  const fromRank = planRank(fromKey);
  const toRank = planRank(toKey);
  if (fromRank === toRank) return "same";
  return toRank > fromRank ? "upgrade" : "downgrade";
}
