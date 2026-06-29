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
  const valid = safeHexEqual(expected, v1);
  return { configured: true, valid, reason: valid ? undefined : 'signature_mismatch' };
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
