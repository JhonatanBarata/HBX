import * as crypto from 'crypto';

// Verificação da assinatura de webhook do Mercado Pago.
// Padrão oficial MP: header `x-signature: ts=<ts>,v1=<hmacSha256Hex>` + header
// `x-request-id` + `data.id` (query). O manifesto assinado é
//   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
// e o HMAC-SHA256(secret) sobre esse manifesto tem que bater com o v1.
//
// É OPT-IN: só liga quando MERCADO_PAGO_WEBHOOK_SECRET está configurado. Sem
// segredo, devolve { configured:false } e o caller segue o fluxo (a re-busca do
// pagamento na API do MP já impede forja de status/valor — isto é defense-in-depth
// contra abuso/replay do endpoint público).

export interface MercadoPagoSignatureInput {
  signatureHeader?: string | null;
  requestId?: string | null;
  dataId?: string | number | null;
  secret?: string | null;
}

export interface MercadoPagoSignatureResult {
  configured: boolean;
  valid: boolean;
  reason?: string;
}

function parseSignatureHeader(header: string): { ts?: string; v1?: string } {
  const out: { ts?: string; v1?: string } = {};
  for (const part of String(header || '').split(',')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim();
    if (key === 'ts') out.ts = value;
    else if (key === 'v1') out.v1 = value;
  }
  return out;
}

function safeHexEqual(a: string, b: string): boolean {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function getMercadoPagoWebhookSecret(): string {
  return String(process.env.MERCADO_PAGO_WEBHOOK_SECRET || '').trim();
}

export function verifyMercadoPagoWebhookSignature(
  input: MercadoPagoSignatureInput,
): MercadoPagoSignatureResult {
  const secret = String(input.secret ?? getMercadoPagoWebhookSecret()).trim();
  if (!secret) return { configured: false, valid: false, reason: 'secret_not_configured' };

  const { ts, v1 } = parseSignatureHeader(String(input.signatureHeader || ''));
  if (!ts || !v1) return { configured: true, valid: false, reason: 'missing_ts_or_v1' };

  // data.id alfanumérico deve ir em minúsculo (regra do MP); para id numérico é no-op.
  const dataId = String(input.dataId ?? '').toLowerCase();
  const requestId = String(input.requestId ?? '').trim();

  const segments: string[] = [];
  if (dataId) segments.push(`id:${dataId};`);
  if (requestId) segments.push(`request-id:${requestId};`);
  segments.push(`ts:${ts};`);
  const manifest = segments.join('');

  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  if (safeHexEqual(expected, v1)) return { configured: true, valid: true };

  // 22/08 (medido em produção com o 1º Pix de recarga): a notificação IPN pra
  // `notification_url` (`?topic=payment&id=…`, sem `data.id`) chegou assinada e NÃO bateu
  // com o manifesto acima. O manifesto oficial é `id:<data.id>;request-id:…;ts:…;` — quando
  // não há `data.id` na query, a hipótese é que o MP assine SEM o segmento `id:`. Tentar a
  // variante custa um HMAC e continua exigindo o MESMO segredo: não afrouxa nada, só deixa
  // de rejeitar uma assinatura legítima por diferença de manifesto.
  if (dataId) {
    const semId = [requestId ? `request-id:${requestId};` : '', `ts:${ts};`].join('');
    const expectedSemId = crypto.createHmac('sha256', secret).update(semId).digest('hex');
    if (safeHexEqual(expectedSemId, v1)) return { configured: true, valid: true, reason: 'matched_without_id_segment' };
  }
  return { configured: true, valid: false, reason: 'signature_mismatch' };
}

// Modo de aplicação da assinatura, controlado por MP_WEBHOOK_SIGNATURE_MODE:
//   - `log` (default): valida quando há segredo, loga válido/inválido, mas NUNCA rejeita.
//     Serve para observar webhooks reais antes de endurecer (evita derrubar pagamento
//     legítimo por um descasamento de manifesto que só aparece com tráfego real).
//   - `enforce`: rejeita assinatura inválida E rejeita quando não há segredo (fail-closed).
// Rollout seguro = subir em `log`, confirmar ~48h de assinatura válida, então `enforce`.
export type MpWebhookSignatureMode = 'log' | 'enforce';

export function getMercadoPagoWebhookSignatureMode(): MpWebhookSignatureMode {
  const raw = String(process.env.MP_WEBHOOK_SIGNATURE_MODE || '').trim().toLowerCase();
  return raw === 'enforce' ? 'enforce' : 'log';
}

export interface MpWebhookGateInput {
  signatureHeader?: string | null;
  requestId?: string | null;
  query?: Record<string, any>;
}

export interface MpWebhookGateResult {
  allow: boolean;
  mode: MpWebhookSignatureMode;
  configured: boolean;
  valid: boolean;
  reason?: string;
}

// Decisão única de aceitar/rejeitar um webhook do Mercado Pago, compartilhada pelos
// controllers (recovery e financeiro). Mantém a lógica de modo em um só lugar.
export function evaluateMercadoPagoWebhookSignature(input: MpWebhookGateInput): MpWebhookGateResult {
  const mode = getMercadoPagoWebhookSignatureMode();
  const configured = Boolean(getMercadoPagoWebhookSecret());

  if (!configured) {
    return {
      allow: mode !== 'enforce',
      mode,
      configured: false,
      valid: false,
      reason: 'secret_not_configured',
    };
  }

  const check = verifyMercadoPagoWebhookSignature({
    signatureHeader: input.signatureHeader,
    requestId: input.requestId,
    dataId: extractWebhookDataId(input.query),
  });

  if (check.valid) {
    return { allow: true, mode, configured: true, valid: true };
  }
  return {
    allow: mode !== 'enforce',
    mode,
    configured: true,
    valid: false,
    reason: check.reason,
  };
}

// Lê o data.id do query do webhook, tolerando as variações que o MP manda
// (`data.id` na notificação v2, `id` em formatos legados/IPN).
export function extractWebhookDataId(query: Record<string, any> | undefined): string {
  if (!query) return '';
  const candidate =
    query['data.id'] ??
    (query.data && typeof query.data === 'object' ? (query.data as any).id : undefined) ??
    query['id'] ??
    query['resource'];
  return String(candidate ?? '').trim();
}
