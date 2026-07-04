// CRÉDITOS S3-PARTE1 — flag mestra do módulo (mesmo padrão booleano de
// HBX_AI_EXTRACTION_ENABLED em radar-fabrica.service.ts). Default OFF: com a flag desligada,
// os endpoints HTTP respondem neutro/404 e nada de crédito é ativo no runtime.
export function isCreditsFeatureEnabled(): boolean {
  return ['true', '1', 'yes', 'on'].includes(String(process.env.HBX_CREDITS_ENABLED || '').trim().toLowerCase());
}

// CRÉDITOS S2 — flag do shadow-debit (MEDIÇÃO, sem enforcement). Separada de
// HBX_CREDITS_ENABLED (S1/S3, liga o módulo/endpoints) e de HBX_CREDITS_ENFORCE (futuro R1,
// bloqueio real). Default OFF: com a flag desligada, recordShadowDebit é no-op imediato —
// nenhuma linha `debit_shadow` é gravada, nenhuma leitura ao banco é feita.
export function isCreditsShadowEnabled(): boolean {
  return ['true', '1', 'yes', 'on'].includes(String(process.env.HBX_CREDITS_SHADOW || '').trim().toLowerCase());
}
