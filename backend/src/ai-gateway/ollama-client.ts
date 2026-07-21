// ============================================================================
// CLIENTE OLLAMA ÚNICO (S05B — docs/PLANEJAMENTOS/PR20072026-MOTOR-UNICO/
// S05B-fundacao-ia-unica.md). Antes desta sprint, 3 arquivos reimplementavam o
// MESMO fetch a `${baseUrl}/api/chat` + a MESMA passagem pelo GOVERNOR-IA
// (AiGatewayService): concierge-ollama.ts, assistente-ollama.ts (sandbox +
// Copiloto) e bot/intent/ai-intent-classifier.service.ts. Este módulo é agora
// o ÚNICO ponto do backend que faz esse fetch — critério de aceite da S05B
// ("1 único fetch ao Ollama, grep prova"), sem contar `intent-engine.service.ts`
// (`classifyAtendimentoAction`), que NÃO está no vocabulário da S05B (CONTRATO
// §5.2 lista só os 3 acima) e por isso não foi tocado nesta sprint.
//
// REGRA DE OURO (README da frente MOTOR-ÚNICO, "separação de CONTEXTO, não de
// motor"): este cliente é CEGO a quem chama — não sabe o que é concierge,
// assistente ou classificador, não decide model/timeout/temperatura, não
// aplica guarda nenhuma de prompt. Cada CALLER resolve sua PRÓPRIA cadeia de
// env (preservada intacta, ver cada wrapper) e decide o fallback em caso de
// erro; este arquivo só faz o fetch + o governor, byte a byte igual aos 3
// arquivos que ele substitui.
//
// Contrato de erro (idêntico aos 3 originais): LANÇA quando o governor recusa
// (fila cheia/orçamento estourado — `OllamaGatewayRefusedError`, subclasse de
// `Error`, para o caller distinguir "recusa cedo" de "HTTP ruim"/"rede caiu"
// se precisar, como o classificador do bot já fazia) ou a resposta HTTP não é
// ok. Erro de rede/timeout do próprio fetch propaga como sempre — o
// `AiGatewayService.run` não engole exceção do `fn`. O CALLER sempre decide o
// fallback (concierge → chips; assistente → roteiro; classificador → keyword).
// ============================================================================

import { AiGatewayService, AiGatewayLane } from './ai-gateway.service';

export type OllamaMessage = { role: string; content: string };

/** Recusa cedo do GOVERNOR-IA (fila cheia ou espera prevista estoura o orçamento do caller). */
export class OllamaGatewayRefusedError extends Error {
  constructor(message = 'governor recusou a chamada de IA (fila cheia) — caindo no fallback') {
    super(message);
    this.name = 'OllamaGatewayRefusedError';
  }
}

export type OllamaChatOptions = {
  /** Base URL já resolvida pelo caller (ex.: HBX_LLM_CLASSIFIER_URL). Barra final é removida aqui. */
  baseUrl: string;
  /** Modelo já resolvido pela cadeia de env PRÓPRIA do caller. */
  model: string;
  /** Timeout (ms) já resolvido pelo caller — vira o orçamento do governor E o AbortSignal do fetch. */
  timeoutMs: number;
  messages: OllamaMessage[];
  /** Faixa do GOVERNOR-IA. Default 'realtime' — os 3 chamadores de hoje só usam realtime. */
  lane?: AiGatewayLane;
  /** 'json' quando o caller precisa de saída estruturada (concierge/classificador). Omitido = sem o campo `format` no body (assistente/Copiloto nunca mandavam). */
  format?: 'json';
  temperature: number;
  numPredict: number;
  /** Sempre false nos 3 originais. Parametrizável só por precaução. */
  think?: boolean;
  /** Empresa dona da chamada — autorização `ai_realtime` do CRÉDITO UNIVERSAL. */
  companyId?: number | null;
  actionKey?: string;
  /** Texto da exceção quando o governor recusa — cada wrapper preserva sua própria frase (log/UX de hoje). */
  refusedMessage?: string;
};

/**
 * UMA chamada de chat ao Ollama LOCAL, passando pelo GOVERNOR-IA. Byte a byte
 * o mesmo `fetch` que concierge-ollama.ts / assistente-ollama.ts /
 * ai-intent-classifier.service.ts faziam cada um por conta própria.
 */
export async function callOllamaChat(opts: OllamaChatOptions): Promise<string> {
  const baseUrl = String(opts.baseUrl || '').replace(/\/+$/, '');
  const lane: AiGatewayLane = opts.lane || 'realtime';
  const timeoutMs = opts.timeoutMs;

  const gw = await AiGatewayService.run(
    lane,
    timeoutMs,
    () =>
      fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: opts.model,
          stream: false,
          think: opts.think ?? false,
          ...(opts.format ? { format: opts.format } : {}),
          options: { temperature: opts.temperature, num_predict: opts.numPredict },
          messages: opts.messages,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      }),
    { companyId: opts.companyId, actionKey: opts.actionKey || 'ai_realtime' },
  );
  if (gw.refused) {
    throw new OllamaGatewayRefusedError(opts.refusedMessage);
  }
  const response = gw.value;
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
  const data = (await response.json()) as { message?: { content?: string } };
  return String(data?.message?.content || '');
}
