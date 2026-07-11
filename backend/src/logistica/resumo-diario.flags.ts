// S3 RESUMO-DIÁRIO (11/07) — flag MESTRA do resumo diário do dono no WhatsApp
// (entregas de hoje/ontem + recebido/em aberto, 1 msg/empresa/dia no telefone
// VERIFICADO do cadastro). Mesmo padrão booleano de HBX_COBRANCA_WHATS_ENABLED
// em logistica-cobranca.flags.ts. Default OFF: com a flag desligada o deploy é
// 100% inerte — o scheduler nem arma o timer, o tick é no-op imediato e o GET
// /logistica/config devolve resumoDiarioDisponivel=false (a UI esconde o card).
// Gate em 2 chaves (padrão canônico do módulo): esta env (global) E
// LogisticaConfig.resumoDiarioAtivo (por tenant, default false) precisam estar
// ON — qualquer uma OFF = nada sai.
export function isResumoDiarioEnabled(): boolean {
  return ['true', '1', 'yes', 'on'].includes(String(process.env.HBX_RESUMO_DIARIO_ENABLED || '').trim().toLowerCase());
}
