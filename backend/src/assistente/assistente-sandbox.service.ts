import { Injectable, Logger } from '@nestjs/common';
import { assistenteModel, callAssistenteOllama } from './assistente-ollama';
import {
  compileSystemPrompt,
  compileConditions,
  resolveVariaveis,
  type AssistenteConfigShape,
} from './assistente-flow';
import { wrapUntrustedUserText } from '../ai-gateway/prompt-guards';

// ============================================================================
// WORM-14 — SANDBOX "Teste sua IA".
//
// ⚠️ SEGURANCA (o ponto que faz este modulo valer ouro): este servico NAO PODE
// TOCAR O WEBWHATS NEM CHIP NENHUM. E um chat interno que roda o MESMO Ollama
// local do classificador do bot (/api/chat), mas com env de MODELO/TIMEOUT
// PROPRIA do assistente (HBX_ASSISTENTE_MODEL / HBX_ASSISTENTE_TIMEOUT_MS —
// fallback pra env do classificador, depois pro default 'qwen2.5:7b'/12000).
// Isso permite bot e assistente usarem modelos diferentes sem mexer em codigo
// (bench 4b x 7b por frente). URL e flag liga/desliga seguem compartilhadas
// (1 Ollama so). Zero socket, zero API de motor, zero numero.
//
// Por construcao ele NAO importa ConversationsService, MessagingModule, nem
// nenhum client do Webwhats. A UNICA saida de rede e a chamada ao Ollama LOCAL
// (mesmo host/env do classificador do bot). O teste `assistente-sandbox.service
// .test.ts` prova que nenhuma dependencia de envio existe aqui.
//
// Publicar o assistente NO CHIP e outro caminho (flag HBX_ASSISTENTE_PUBLISH_
// ENABLED, default OFF) — o sandbox NUNCA publica.
// ============================================================================

// Envs/modelo/timeout/URL da frente assistente + a chamada real ao Ollama LOCAL
// vivem em ./assistente-ollama (compartilhado com o Copiloto do lead — mesma IA,
// mesma faixa realtime do GOVERNOR-IA, zero Webwhats).

export type SandboxTurn = { role: 'user' | 'assistant'; content: string };

export type SandboxReplyResult = {
  reply: string;
  source: 'ia' | 'roteiro' | 'fallback';
  matchedCondicaoId: string | null;
  model: string;
  latencyMs: number;
};

// Assinatura injetavel do "chamador de IA" — permite ao teste substituir por um
// fake (provando que nada real e enviado) e ao runtime usar o Ollama local.
export type OllamaChat = (messages: Array<{ role: string; content: string }>) => Promise<string>;

@Injectable()
export class AssistenteSandboxService {
  private readonly logger = new Logger(AssistenteSandboxService.name);

  /** Ganchos de teste: contadores para provar que NADA real foi disparado.
   *  `realDispatchCalls` DEVE ficar sempre 0 — nenhum caminho aqui envia msg. */
  readonly guard = { ollamaCalls: 0, realDispatchCalls: 0 };

  /**
   * Gera a resposta do assistente para UMA mensagem do usuario de teste, rodando
   * o mesmo pipeline do bot. Ordem:
   *   1. Se for o inicio da conversa (sem historico), abre com o passo de entrada
   *      do fluxo (mensagem-roteiro) — deterministico, sem IA.
   *   2. Caso contrario, chama o Ollama LOCAL com o prompt-sistema compilado +
   *      historico. Se a IA estiver off/indisponivel, cai no proximo passo do
   *      roteiro (fallback), NUNCA num envio real.
   *
   * `chat` e injetavel; se ausente, usa o Ollama local (mesmo do classificador).
   */
  async reply(
    config: AssistenteConfigShape,
    history: SandboxTurn[],
    userMessage: string,
    chat?: OllamaChat,
    // CRÉDITO UNIVERSAL (PR10072026): empresa dona do teste — repassada ao gateway de IA
    // para autorização `ai_realtime`. Opcional em testes/fakes.
    meta?: { companyId?: number | null },
  ): Promise<SandboxReplyResult> {
    const startedAt = Date.now();
    const model = assistenteModel();
    const empresa = config.empresaNome || 'a empresa';
    const vars = { empresa, assistente: config.nome };

    const text = String(userMessage || '').trim();

    // Passo 1 — abertura deterministica pelo roteiro (sem IA, sem rede).
    const isConversationStart = history.filter((t) => t.role === 'assistant').length === 0;
    const entrada = config.fluxo.passos.find((p) => p.id === config.fluxo.entradaPassoId) ?? config.fluxo.passos[0];
    if (isConversationStart && entrada) {
      return {
        reply: resolveVariaveis(entrada.texto, vars),
        source: 'roteiro',
        matchedCondicaoId: null,
        model,
        latencyMs: Date.now() - startedAt,
      };
    }

    // Passo 2 — resposta via IA LOCAL (mesmo pipeline do bot). Chamada injetavel.
    const caller = chat ?? ((messages: Array<{ role: string; content: string }>) => this.defaultOllamaChat(messages, meta));
    const systemPrompt = compileSystemPrompt(config);
    // S05B: a mensagem NOVA do cliente (o texto que ele acabou de digitar — o
    // ponto de maior risco de injecao) e delimitada com a MESMA guarda do
    // Concierge (`<msg_cliente>`, ver prompt-guards.ts). O systemPrompt ja
    // instrui o modelo a tratar o conteudo dentro da tag como DADO, nunca
    // comando. `guessCondicao` abaixo usa o `text` CRU (nao o delimitado) —
    // a delimitacao e so para o modelo, nao muda o casamento de few-shots.
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...history.map((t) => ({ role: t.role, content: t.content })),
      { role: 'user', content: wrapUntrustedUserText(text, { tag: 'msg_cliente' }) },
    ];

    try {
      const raw = (await caller(messages)).trim();
      if (raw) {
        return {
          reply: raw.slice(0, 1500),
          source: 'ia',
          matchedCondicaoId: this.guessCondicao(config, text),
          model,
          latencyMs: Date.now() - startedAt,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`sandbox: IA indisponivel (${message}) — caindo no roteiro`);
    }

    // Fallback — proximo passo do roteiro OU mensagem neutra. NUNCA envio real.
    const proximo = config.fluxo.passos[1] ?? entrada;
    return {
      reply: proximo
        ? resolveVariaveis(proximo.texto, vars)
        : 'Certo! Um atendente vai continuar com voce por aqui.',
      source: 'fallback',
      matchedCondicaoId: this.guessCondicao(config, text),
      model,
      latencyMs: Date.now() - startedAt,
    };
  }

  // Casa a mensagem do lead com uma condicao pelos few-shots (substring simples,
  // so para marcar o transcript — a resposta real vem da IA). Sem rede.
  private guessCondicao(config: AssistenteConfigShape, text: string): string | null {
    const lower = text.toLowerCase();
    for (const c of compileConditions(config)) {
      if (c.exemplos.some((ex) => lower.includes(ex.toLowerCase()))) return c.id;
    }
    return null;
  }

  // Chamada REAL ao Ollama LOCAL — mesmo /api/chat, host e model do classificador
  // do bot. NAO e Webwhats: e o motor de IA local (:11434, OpenAI/Ollama-compat).
  // A montagem/chamada (envs proprias + faixa realtime do GOVERNOR-IA) vive no
  // helper compartilhado ./assistente-ollama; aqui so contamos o guard anti-chip.
  private async defaultOllamaChat(
    messages: Array<{ role: string; content: string }>,
    meta?: { companyId?: number | null },
  ): Promise<string> {
    this.guard.ollamaCalls += 1;
    // Contexto canônico da ação de crédito `ai_realtime`.
    return callAssistenteOllama(messages, { companyId: meta?.companyId, actionKey: 'ai_realtime' });
  }
}
