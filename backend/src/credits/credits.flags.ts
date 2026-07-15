// CRÉDITOS S3-PARTE1 — flag mestra do módulo. Default OFF: com a flag desligada,
// os endpoints HTTP respondem neutro/404 e nada de crédito é ativo no runtime.
export function isCreditsFeatureEnabled(): boolean {
  return ['true', '1', 'yes', 'on'].includes(String(process.env.HBX_CREDITS_ENABLED || '').trim().toLowerCase());
}

// CRÉDITOS F2 (docs/PLANEJAMENTOS/CREDITOS/CONFIRMACAO-TELEFONE.md) — brinde de
// boas-vindas amarrado ao TELEFONE VERIFICADO. Default OFF: o brinde segue liberado
// só com a identidade confirmada (comportamento atual). ON: além do e-mail/identidade,
// o telefone do cadastro precisa ter sido VERIFICADO por código (Company.
// contactPhoneVerifiedAt) pra soltar os 50 créditos — e o dedup anti-farra passa a
// comparar telefone PROVADO (não digitado). Gmail infinito existe; nº de WhatsApp não.
export function isVerifiedPhoneRequiredForWelcome(): boolean {
  return ['true', '1', 'yes', 'on'].includes(String(process.env.HBX_CREDITS_REQUIRE_VERIFIED_PHONE || '').trim().toLowerCase());
}
