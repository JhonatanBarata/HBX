// S4 SCORE-DE-FIADO (11/07) — flag MESTRA do score de pontualidade do cliente
// final ("esse cliente merece fiado?"). Mesmo padrão booleano de
// HBX_CREDITS_ENABLED em credits/credits.flags.ts. Default OFF: com a flag
// desligada o deploy é 100% inerte — GET /logistica/clientes/:id/score responde
// 404 ANTES de tocar o serviço (zero query nova) e a ficha fica sem selo (o
// front engole o 404 em silêncio). Sem migration, sem persistência: o score é
// computado on-the-fly de FinanceiroCharge quando (e só quando) a flag ligar.
export function isScoreFiadoEnabled(): boolean {
  return ['true', '1', 'yes', 'on'].includes(String(process.env.HBX_SCORE_FIADO_ENABLED || '').trim().toLowerCase());
}
