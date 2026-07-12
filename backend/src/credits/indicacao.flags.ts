// S5 INDICAÇÃO (docs/PLANEJAMENTOS/VISAO-FUTURO/S5-indicacao-com-creditos.md) — flag mestra
// do programa "indique e ganhe" (mesmo padrão booleano de credits.flags.ts). Default OFF:
// com a flag desligada os endpoints respondem 404, o signup IGNORA o ?ref= (não grava
// indicadaPorCompanyId) e NENHUM bônus é concedido — deploy 100% inerte sem a env.
export function isIndicacaoFeatureEnabled(): boolean {
  return ['true', '1', 'yes', 'on'].includes(String(process.env.HBX_INDICACAO_ENABLED || '').trim().toLowerCase());
}

// Quantidade do bônus de indicação (créditos PARA CADA lado: indicador e indicada), pago
// SÓ na 1ª recarga PAGA aprovada da empresa indicada — nunca no cadastro (anti-farm).
// CreditGlobalConfig não tem campo natural pra isso (welcomeCredits é o brinde de signup,
// outra semântica), então a quantidade vive AQUI, em UM lugar só — fácil do master mudar.
export const INDICACAO_BONUS_CREDITS = 25;
