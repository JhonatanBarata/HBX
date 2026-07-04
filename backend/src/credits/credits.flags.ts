// CRÉDITOS S3-PARTE1 — flag mestra do módulo (mesmo padrão booleano de
// HBX_AI_EXTRACTION_ENABLED em radar-fabrica.service.ts). Default OFF: com a flag desligada,
// os endpoints HTTP respondem neutro/404 e nada de crédito é ativo no runtime.
export function isCreditsFeatureEnabled(): boolean {
  return ['true', '1', 'yes', 'on'].includes(String(process.env.HBX_CREDITS_ENABLED || '').trim().toLowerCase());
}
