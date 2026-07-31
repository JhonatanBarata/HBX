// ============================================================================
// CONCIERGE IA — chamada ao Ollama LOCAL do extrator de slots (Missão F §2.5).
//
// REUSO, não IA nova: mesmo /api/chat, mesmo host e mesma faixa `realtime` do
// GOVERNOR-IA que o classificador do bot e o assistente já usam em prod. Saída
// estruturada com `format:'json'` (precedente: ai-intent-classifier.service.ts).
//
// S05B (docs/PLANEJAMENTOS/PR20072026-MOTOR-UNICO/S05B-fundacao-ia-unica.md):
// este arquivo virou WRAPPER FINO sobre o cliente Ollama ÚNICO
// (`ai-gateway/ollama-client.ts`, hardening extraído DESTE arquivo — era o
// mais maduro). Cadeia de env, exports e comportamento em erro CONTINUAM
// EXATAMENTE os mesmos — só o fetch em si foi extraído.
//
// Cadeia de env (bench sem código, igual o assistente fez):
//   HBX_AI_CONCIERGE_MODEL      -> HBX_LLM_CLASSIFIER_MODEL      -> 'qwen2.5:7b'
//   HBX_AI_CONCIERGE_TIMEOUT_MS -> HBX_LLM_CLASSIFIER_TIMEOUT_MS -> 12000
// URL e liga/desliga da IA compartilhados (1 Ollama só):
//   HBX_LLM_CLASSIFIER_URL / HBX_LLM_CLASSIFIER_ENABLED.
// Flag da FEATURE (default OFF): HBX_AI_CONCIERGE_ENABLED.
//
// ⚠️ SEGURANÇA: zero Webwhats/Messaging/socket — a única saída de rede é o
// fetch ao Ollama local (agora dentro de ai-gateway/ollama-client.ts). LANÇA
// em recusa do governor/HTTP/rede — o caller cai no fallback determinístico
// (chips), nunca trava a feature.
// ============================================================================

import { callOllamaChat } from '../ai-gateway/ollama-client';

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

// ── VOZ (degrau 2) — o redator ───────────────────────────────────────────────
// LIGADO por padrão (lei "entregar ligado"): quem quiser silenciar a voz e
// voltar ao texto 100% template põe HBX_AI_CONCIERGE_VOICE=off. Timeout CURTO
// de propósito: a voz é enfeite, os fatos são obrigação — se o modelo demorar,
// o cliente recebe a resposta oficial sem esperar por enfeite.
export function conciergeVoiceEnabled() {
  const raw = String(process.env.HBX_AI_CONCIERGE_VOICE || '').trim().toLowerCase();
  if (['false', '0', 'no', 'off', 'nao', 'não'].includes(raw)) return false;
  return conciergeAiEnabled();
}

export function conciergeVoiceTimeoutMs() {
  return envInt('HBX_AI_CONCIERGE_VOICE_TIMEOUT_MS', 6000);
}

/**
 * UMA frase de abertura escrita pela IA. Texto LIVRE (sem `format:'json'`) —
 * por isso a saída passa OBRIGATORIAMENTE por `sanitizeVoiceText` no caller:
 * frase reprovada vira null e a resposta sai só com os fatos do código.
 * Lança em qualquer erro; a voz é opcional e o caller já trata.
 */
export async function callConciergeWriter(
  messages: Array<{ role: string; content: string }>,
  opts: { companyId?: number | null } = {},
): Promise<string> {
  if (!conciergeVoiceEnabled()) throw new Error('voz do concierge desligada');
  return callOllamaChat({
    baseUrl: conciergeOllamaBaseUrl(),
    model: conciergeModel(),
    timeoutMs: conciergeVoiceTimeoutMs(),
    messages,
    temperature: 0.5,
    numPredict: 60,
    think: false,
    companyId: opts.companyId,
    actionKey: 'ai_realtime',
    refusedMessage: 'governor recusou a voz do concierge — respondendo só com os fatos',
  });
}

// ── REVISOR NOTURNO (degrau 3) ───────────────────────────────────────────────
// Faixa BATCH: cede a vez pro cliente ao vivo (GOVERNOR-IA) e pode usar modelo
// maior. Roda de madrugada, sem ninguém esperando — timeout generoso.
export function conciergeReviewEnabled() {
  const raw = String(process.env.HBX_AI_CONCIERGE_REVIEW || '').trim().toLowerCase();
  if (['false', '0', 'no', 'off', 'nao', 'não'].includes(raw)) return false;
  return conciergeFeatureEnabled() && conciergeAiEnabled();
}

export function conciergeReviewModel() {
  const own = String(process.env.HBX_AI_CONCIERGE_REVIEW_MODEL || '').trim();
  if (own) return own;
  const batch = String(process.env.HBX_LLM_BATCH_MODEL || '').trim();
  return batch || conciergeModel();
}

export async function callConciergeReviewer(
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  if (!conciergeAiEnabled()) throw new Error('IA local desligada (HBX_LLM_CLASSIFIER_ENABLED)');
  return callOllamaChat({
    baseUrl: conciergeOllamaBaseUrl(),
    model: conciergeReviewModel(),
    timeoutMs: envInt('HBX_AI_CONCIERGE_REVIEW_TIMEOUT_MS', 120000),
    messages,
    lane: 'batch',
    format: 'json',
    temperature: 0.1,
    numPredict: 260,
    think: false,
    companyId: null,
    actionKey: 'ai_batch',
    refusedMessage: 'governor recusou a revisão noturna do concierge — fica para o próximo ciclo',
  });
}

/**
 * UMA chamada de extração: faixa realtime + budget do Concierge + autorização
 * da ação `ai_realtime` por empresa. Wrapper fino sobre `callOllamaChat`
 * (cliente único) — model/timeout resolvidos por ESTA cadeia de env, erro
 * sempre lançado pro caller decidir o fallback (idêntico a antes da S05B).
 */
export async function callConciergeExtractor(
  messages: Array<{ role: string; content: string }>,
  opts: { companyId?: number | null } = {},
): Promise<string> {
  if (!conciergeAiEnabled()) {
    throw new Error('IA local desligada (HBX_LLM_CLASSIFIER_ENABLED)');
  }
  return callOllamaChat({
    baseUrl: conciergeOllamaBaseUrl(),
    model: conciergeModel(),
    timeoutMs: conciergeTimeoutMs(),
    messages,
    format: 'json',
    temperature: 0.1,
    numPredict: 220,
    think: false,
    companyId: opts.companyId,
    actionKey: 'ai_realtime',
    refusedMessage: 'governor recusou a chamada de IA (fila cheia) — caindo no fluxo por chips',
  });
}
