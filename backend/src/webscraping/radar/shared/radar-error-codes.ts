export const RADAR_DELIVERY_BLOCKING_ERROR_CODES = [
  'permission_denied',
  'quota_exceeded',
  'invalid_input',
  'protected_negative',
  'duplicate_real',
  'persistence_required',
  'duplicate_lead',
  'negative_or_protected_lead',
  'missing_minimum_contact',
  'quality_below_minimum',
  'persistence_failed',
] as const;

export const RADAR_NON_BLOCKING_ERROR_CODES = [
  'enrichment_failed',
  'social_lookup_failed',
  'email_failed',
  'email_enrichment_failed',
  'whatsapp_failed',
  'whatsapp_check_failed',
  'site_failed',
  'site_enrichment_failed',
  'post_delivery_update_failed',
  'presentation_failed',
  'vendas_sync_failed',
  'optional_provider_failed',
  'secondary_provider_failed',
  'cache_failed',
  'history_failed',
  'campaign_failed',
  'factory_failed',
  'campaign_factory_failed',
] as const;

export type RadarDeliveryBlockingErrorCode = typeof RADAR_DELIVERY_BLOCKING_ERROR_CODES[number];
export type RadarNonBlockingErrorCode = typeof RADAR_NON_BLOCKING_ERROR_CODES[number];
export type RadarErrorCode = RadarDeliveryBlockingErrorCode | RadarNonBlockingErrorCode | string;

export function normalizeRadarErrorCode(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function isRadarDeliveryBlockingErrorCode(value: unknown): value is RadarDeliveryBlockingErrorCode {
  const normalized = normalizeRadarErrorCode(value);
  return (RADAR_DELIVERY_BLOCKING_ERROR_CODES as readonly string[]).includes(normalized);
}

export function isRadarNonBlockingErrorCode(value: unknown): value is RadarNonBlockingErrorCode {
  const normalized = normalizeRadarErrorCode(value);
  return (RADAR_NON_BLOCKING_ERROR_CODES as readonly string[]).includes(normalized);
}
