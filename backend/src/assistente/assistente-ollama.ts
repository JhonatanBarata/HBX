import { callOllamaChat } from '../ai-gateway/ollama-client';

// ============================================================================
// Cliente Ollama LOCAL da FRENTE "assistente" (reuso, NAO IA nova).
//
// Extraido do AssistenteSandboxService pra ser compartilhado entre o sandbox
// ("Teste sua IA") e o Copiloto do lead (LEADS-FINAL/05) — os dois falam com o
// MESMO Ollama local (:11434, /api/chat) usando as MESMAS envs da frente
// assistente (modelo/timeout PROPRIOS, desacoplados do classificador do bot),
// e passam pela MESMA faixa realtime do GOVERNOR-IA (AiGatewayService).
//
// S05B (docs/PLANEJAMENTOS/PR20072026-MOTOR-UNICO/S05B-fundacao-ia-unica.md):
// este arquivo virou WRAPPER FINO sobre o cliente Ollama UNICO
// (`ai-gateway/ollama-client.ts`, hardening extraido do concierge-ollama.ts —
// o mais maduro). Cadeia de env, exports e comportamento em erro CONTINUAM
// EXATAMENTE os mesmos (Copiloto incluso) — so o fetch em si foi extraido.
//
// ⚠️ SEGURANCA: este arquivo NAO importa nem toca Webwhats/Conversations/
// Messaging/socket. A UNICA saida de rede aqui e o fetch ao Ollama LOCAL (agora
// dentro de ai-gateway/ollama-client.ts). Nada aqui envia WhatsApp, conecta
// chip ou reconecta motor.
//
// Cadeia de fallback (identica a que o sandbox ja usava em prod):
//   HBX_ASSISTENTE_MODEL      -> HBX_LLM_CLASSIFIER_MODEL      -> 'qwen2.5:7b'
//   HBX_ASSISTENTE_TIMEOUT_MS -> HBX_LLM_CLASSIFIER_TIMEOUT_MS -> 12000
// URL e flag liga/desliga continuam compartilhadas (1 Ollama so, 1 ambiente de
// IA so): HBX_LLM_CLASSIFIER_URL / HBX_LLM_CLASSIFIER_ENABLED.
// ============================================================================

export type OllamaMessage = { role: string; content: string };

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

// Mesmo endpoint/host do classificador do bot (ai-intent-classifier.service.ts).
export function assistenteOllamaBaseUrl() {
  return envStr('HBX_LLM_CLASSIFIER_URL', 'http://host.docker.internal:11434').replace(/\/+$/, '');
}

export function assistenteModel() {
  const own = String(process.env.HBX_ASSISTENTE_MODEL || '').trim();
  if (own) return own;
  return envStr('HBX_LLM_CLASSIFIER_MODEL', 'qwen2.5:7b');
}

export function assistenteTimeoutMs() {
  const own = Number.parseInt(String(process.env.HBX_ASSISTENTE_TIMEOUT_MS || ''), 10);
  if (Number.isFinite(own) && own > 0) return own;
  return envInt('HBX_LLM_CLASSIFIER_TIMEOUT_MS', 12000);
}

/** IA local ligada neste ambiente? (mesma flag do classificador — 1 Ollama so). */
export function assistenteOllamaEnabled() {
  return envOn('HBX_LLM_CLASSIFIER_ENABLED');
}

export type AssistenteOllamaOptions = {
  // Empresa dona da chamada para autorização `ai_realtime`.
  companyId?: number | null;
  // Sobrescreve o timeout da frente assistente (default = assistenteTimeoutMs()).
  timeoutMs?: number;
  actionKey?: string;
  numPredict?: number;
  temperature?: number;
};

/**
 * Chamada REAL ao Ollama LOCAL (mesmo /api/chat do classificador do bot). Passa
 * pela faixa `realtime` do GOVERNOR-IA (prioridade absoluta; recusa cedo cai no
 * fallback do caller). LANCA quando: IA desligada, governor recusou, HTTP nao-ok
 * ou rede/timeout — o caller SEMPRE trata (nunca ha envio real como consequencia).
 * Wrapper fino sobre `callOllamaChat` (cliente unico) — mesma cadeia de env e
 * mesmo contrato de erro de sempre (usado pelo sandbox E pelo Copiloto).
 */
export async function callAssistenteOllama(
  messages: OllamaMessage[],
  opts: AssistenteOllamaOptions = {},
): Promise<string> {
  if (!assistenteOllamaEnabled()) {
    throw new Error('classificador IA desligado (HBX_LLM_CLASSIFIER_ENABLED)');
  }
  const timeoutMs = opts.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : assistenteTimeoutMs();

  return callOllamaChat({
    baseUrl: assistenteOllamaBaseUrl(),
    model: assistenteModel(),
    timeoutMs,
    messages,
    temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.4,
    numPredict: opts.numPredict && opts.numPredict > 0 ? opts.numPredict : 220,
    companyId: opts.companyId,
    actionKey: opts.actionKey || 'ai_realtime',
    refusedMessage: 'governor recusou a chamada de IA (fila cheia) — caindo no fallback',
  });
}
