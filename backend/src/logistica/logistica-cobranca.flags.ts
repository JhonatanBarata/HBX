// S2 COBRANÇA-WHATS (11/07) — flag MESTRA da cobrança por WhatsApp (aviso ao lançar
// + lembrete de vencimento com Pix copia-e-cola). Mesmo padrão booleano de
// HBX_CREDITS_ENABLED em credits/credits.flags.ts. Default OFF: com a flag desligada
// o deploy é 100% inerte — o scheduler nem arma o timer, os hooks de lançamento são
// no-op imediato e o GET /logistica/config devolve cobrancaWhatsDisponivel=false
// (a UI esconde o toggle). Gate em 2 chaves (padrão canônico do módulo,
// logistica.service.ts:196): esta env (global) E LogisticaConfig.cobrancaWhatsAtiva
// (por tenant, default false) precisam estar ON — qualquer uma OFF = nada sai.
export function isCobrancaWhatsEnabled(): boolean {
  return ['true', '1', 'yes', 'on'].includes(String(process.env.HBX_COBRANCA_WHATS_ENABLED || '').trim().toLowerCase());
}
