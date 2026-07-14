// ============================================================================
// CONCIERGE IA — chamada ao Ollama LOCAL do extrator de slots (Missão F §2.5).
//
// REUSO, não IA nova: mesmo /api/chat, mesmo host e mesma faixa `realtime` do
// GOVERNOR-IA que o classificador do bot e o assistente já usam em prod. Saída
// estruturada com `format:'json'` (precedente: ai-intent-classifier.service.ts).
//
// Cadeia de env (bench sem código, igual o assistente fez):
//   HBX_AI_CONCIERGE_MODEL      -> HBX_LLM_CLASSIFIER_MODEL      -> 'qwen2.5:7b'
//   HBX_AI_CONCIERGE_TIMEOUT_MS -> HBX_LLM_CLASSIFIER_TIMEOUT_MS -> 12000
// URL e liga/desliga da IA compartilhados (1 Ollama só):
//   HBX_LLM_CLASSIFIER_URL / HBX_LLM_CLASSIFIER_ENABLED.
// Flag da FEATURE (default OFF): HBX_AI_CONCIERGE_ENABLED.
//
// ⚠️ SEGURANÇA: zero Webwhats/Messaging/socket — a única saída de rede é o
// fetch ao Ollama local. LANÇA em recusa do governor/HTTP/rede — o caller cai
// no fallback determinístico (chips), nunca trava a feature.
// ============================================================================

import { AiGatewayService } from '../ai-gateway/ai-gateway.service';

function envStr(name: string, fallback: string) {
  const value = String(process.env[name] || '').trim();
  return value || fallback;
}
function envInt(name: string, fallback: number) {
  const parsed = Number.parseInt(String(process.env[name] || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function envOn(name: string) {
  return ['true', '1', 'yes', 'on', 'sim'].includes(String(process.env[name] || '').trim().toLowerCase());
}

/** Flag da FEATURE — default OFF (§2.6): endpoints respondem feature_disabled. */
export function conciergeFeatureEnabled() {
  return envOn('HBX_AI_CONCIERGE_ENABLED');
}

/** IA local ligada neste ambiente? (mesma flag do classificador — 1 Ollama só). */
export function conciergeAiEnabled() {
  return envOn('HBX_LLM_CLASSIFIER_ENABLED');
}

export function conciergeOllamaBaseUrl() {
  return envStr('HBX_LLM_CLASSIFIER_URL', 'http://host.docker.internal:11434').replace(/\/+$/, '');
}

export function conciergeModel() {
  const own = String(process.env.HBX_AI_CONCIERGE_MODEL || '').trim();
  if (own) return own;
  return envStr('HBX_LLM_CLASSIFIER_MODEL', 'qwen2.5:7b');
}

export function conciergeTimeoutMs() {
  const own = Number.parseInt(String(process.env.HBX_AI_CONCIERGE_TIMEOUT_MS || ''), 10);
  if (Number.isFinite(own) && own > 0) return own;
  return envInt('HBX_LLM_CLASSIFIER_TIMEOUT_MS', 12000);
}

/**
 * UMA chamada de extração: faixa realtime + budget do Concierge + autorização
 * da ação `ai_realtime` por empresa.
 */
export async function callConciergeExtractor(
  messages: Array<{ role: string; content: string }>,
  opts: { companyId?: number | null } = {},
): Promise<string> {
  if (!conciergeAiEnabled()) {
    throw new Error('IA local desligada (HBX_LLM_CLASSIFIER_ENABLED)');
  }
  const baseUrl = conciergeOllamaBaseUrl();
  const model = conciergeModel();
  const timeoutMs = conciergeTimeoutMs();

  const gw = await AiGatewayService.run(
    'realtime',
    timeoutMs,
    () =>
      fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          think: false,
          format: 'json',
          options: { temperature: 0.1, num_predict: 220 },
          messages,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      }),
    { companyId: opts.companyId, actionKey: 'ai_realtime' },
  );
  if (gw.refused) {
    throw new Error('governor recusou a chamada de IA (fila cheia) — caindo no fluxo por chips');
  }
  const response = gw.value;
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
  const data = (await response.json()) as { message?: { content?: string } };
  return String(data?.message?.content || '');
}
