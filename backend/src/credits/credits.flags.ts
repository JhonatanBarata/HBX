// CRÉDITOS S3-PARTE1 — flag mestra do módulo (mesmo padrão booleano de
// HBX_AI_EXTRACTION_ENABLED em radar-fabrica.service.ts). Default OFF: com a flag desligada,
// os endpoints HTTP respondem neutro/404 e nada de crédito é ativo no runtime.
export function isCreditsFeatureEnabled(): boolean {
  return ['true', '1', 'yes', 'on'].includes(String(process.env.HBX_CREDITS_ENABLED || '').trim().toLowerCase());
}

// CRÉDITOS R1 — flag MESTRA do enforcement real (débito que BLOQUEIA a entrega sem saldo).
// Gate em 2 chaves (R1-SPEC): esta env (global) E `Company.creditsEnforceEnabled` (por-tenant)
// precisam estar ON — qualquer uma OFF mantém o comportamento atual intocado. Default
// OFF: nenhuma empresa é afetada até o dono ligar as duas explicitamente (cutover por empresa).
export function isCreditsEnforceEnabled(): boolean {
  return ['true', '1', 'yes', 'on'].includes(String(process.env.HBX_CREDITS_ENFORCE || '').trim().toLowerCase());
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
