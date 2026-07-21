import { Injectable, Logger } from '@nestjs/common';
import { callOllamaChat, OllamaGatewayRefusedError } from '../../ai-gateway/ollama-client';
import { classifyProspectingAutoReply, classifyProspectingIntent } from '../../vendas/prospecting-safety';
import type {
  ProspectingAutoReplyClassification,
  ProspectingIntentClassification,
  ProspectingIntentKind,
} from '../../vendas/prospecting-safety';

/**
 * Classificador de intenção por IA (LLM local via Ollama / endpoint compatível).
 *
 * ETAPA 1 — serviço ISOLADO: ainda NÃO é chamado pelo fluxo do bot. Fica dormente
 * (default desligado por `HBX_LLM_CLASSIFIER_ENABLED`) até a Etapa 2 plugar com
 * fallback para as palavras-chave atuais (`classifyProspectingIntent`).
 *
 * Endpoint-agnóstico de propósito: roda contra o Ollama do host em dev
 * (`http://host.docker.internal:11434`) e contra qualquer outro endereço em
 * produção só trocando a env — sem mexer no código.
 *
 * S05B (docs/PLANEJAMENTOS/PR20072026-MOTOR-UNICO/S05B-fundacao-ia-unica.md):
 * o fetch ao Ollama foi extraído para o cliente ÚNICO (`ai-gateway/ollama-client.ts`,
 * hardening herdado do concierge). Cadeia de env e comportamento em erro
 * (SEMPRE cai no keyword, nunca lança pro chamador) continuam exatamente os
 * mesmos; o texto de log da recusa cedo do governor também foi preservado
 * (`OllamaGatewayRefusedError`). ⚠️ Único detalhe cosmético: a distinção entre
 * "HTTP não-ok" e "rede/timeout" no texto de log se fundiu num único catch
 * genérico (`classificador IA indisponível (<msg>)`) — comportamento
 * observável (retorna null, cai no keyword) é idêntico, só a frase de log varia.
 */

function envStr(name: string, fallback: string) {
  const value = String(process.env[name] || '').trim();
  return value || fallback;
}

function envInt(name: string, fallback: number) {
  const parsed = Number.parseInt(String(process.env[name] || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function envOn(name: string) {
  return ['true', '1', 'yes', 'on'].includes(String(process.env[name] || '').trim().toLowerCase());
}

function classifierBaseUrl() {
  return envStr('HBX_LLM_CLASSIFIER_URL', 'http://host.docker.internal:11434').replace(/\/+$/, '');
}

const SYSTEM_PROMPT = [
  'Voce classifica a resposta de UM lead numa prospeccao B2B por WhatsApp no Brasil.',
  'Devolva SOMENTE um JSON valido, nada fora dele: {"remetente":"...","intencao":"..."}',
  '',
  'PASSO 1 - remetente: decida PRIMEIRO se a mensagem foi escrita por uma PESSOA ou',
  'por um SISTEMA AUTOMATICO (bot/atendimento automatico da empresa do lead).',
  'Responda "bot" quando houver QUALQUER sinal de automacao, por exemplo:',
  '- menu ou opcoes numeradas: "digite 1", "tecle 2", "1 - Vendas", "selecione uma opcao";',
  '- aviso de automacao: "mensagem automatica", "atendimento/assistente virtual",',
  '  "respondemos em ate", "fora do horario", "horario de atendimento";',
  '- saudacao institucional robotica: "Ola! Seja bem-vindo a EMPRESA", "Obrigado por',
  '  entrar em contato", "Em breve um atendente ira responder";',
  '- protocolo/URA: "seu protocolo e", "aguarde na fila", "para 2a via digite".',
  'Responda "humano" para qualquer resposta pessoal, curta ou informal',
  '(ex: "oi quem e", "que isso?", "to ocupado", "para de mandar").',
  'Na DUVIDA entre os dois, responda "humano".',
  '',
  'PASSO 2 - intencao: SO quando remetente="humano" (se for "bot", use "INDEFINIDO").',
  'Use EXATAMENTE um destes rotulos:',
  '- INTERESSE: quer saber mais, curioso, topa conversar/ligacao.',
  '- O_QUE_SERIA: nao entendeu, pergunta o que e / do que se trata.',
  '- RETORNE_DEPOIS: nao agora, mais tarde, ocupado.',
  '- NAO_INCOMODE: sem interesse, recusa educada.',
  '- REMOVER: pede para parar/remover/descadastrar/bloquear.',
  '- HUMANO: quer falar com pessoa/atendente/ligar.',
  '- INDEFINIDO: nao da para saber.',
  '',
  'Girias BR: dps=depois, vlw=valeu, blz=beleza, to=estou, vc=voce, pra=para,',
  'pfv=por favor, n=nao, kk=risada, fmz=firmeza, mds=meu deus.',
  '',
  'Exemplos:',
  'Lead: "Ola! Seja bem-vindo. Para Vendas digite 1, Suporte digite 2" => {"remetente":"bot","intencao":"INDEFINIDO"}',
  'Lead: "Esta e uma mensagem automatica, responderemos no horario comercial" => {"remetente":"bot","intencao":"INDEFINIDO"}',
  'Lead: "oi, quem ta falando?" => {"remetente":"humano","intencao":"O_QUE_SERIA"}',
  'Lead: "tenho sim, me explica melhor" => {"remetente":"humano","intencao":"INTERESSE"}',
  'Lead: "para de me mandar msg, me tira dai" => {"remetente":"humano","intencao":"REMOVER"}',
].join('\n');

const AI_INTENT_LABELS = [
  'INTERESSE',
  'O_QUE_SERIA',
  'RETORNE_DEPOIS',
  'NAO_INCOMODE',
  'REMOVER',
  'HUMANO',
  'INDEFINIDO',
] as const;

export type AiIntentLabel = (typeof AI_INTENT_LABELS)[number];

export type AiIntentResult = {
  source: 'ai';
  model: string;
  latencyMs: number;
  raw: string;
  /** quando a IA detecta resposta automática/bot (Etapa 2 usa para PARAR, não disparar variante) */
  bot: boolean;
  botKind: ProspectingAutoReplyClassification | null;
  /** classificação no MESMO formato do keyword (`classifyProspectingIntent`) — drop-in */
  intent: ProspectingIntentClassification | null;
};

function emptySignals(): ProspectingIntentClassification['signals'] {
  return {
    positive: false,
    negative: false,
    optOut: false,
    whatIsIt: false,
    delay: false,
    humanHandoff: false,
    neutral: false,
  };
}

function safeParseJson(raw: string): Record<string, unknown> | null {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

@Injectable()
export class AiIntentClassifierService {
  private readonly logger = new Logger(AiIntentClassifierService.name);

  /** Liga só quando a env está setada — dormente por padrão (Etapa 1). */
  isEnabled(): boolean {
    return envOn('HBX_LLM_CLASSIFIER_ENABLED');
  }

  /**
   * Classifica a resposta do lead pela IA local.
   * Retorna `null` quando a IA está desligada, indisponível, deu timeout, ou
   * respondeu INDEFINIDO — nesses casos o caller (Etapa 2) cai no keyword atual.
   */
  async classify(input: { text: string; companyId?: number | null }): Promise<AiIntentResult | null> {
    const text = String(input?.text || '').trim();
    if (!text) return null;
    if (!this.isEnabled()) return null;

    const baseUrl = classifierBaseUrl();
    const model = envStr('HBX_LLM_CLASSIFIER_MODEL', 'qwen2.5:7b');
    const timeoutMs = envInt('HBX_LLM_CLASSIFIER_TIMEOUT_MS', 9000);
    const startedAt = Date.now();

    try {
      // GOVERNOR-IA: faixa realtime (prioridade absoluta). Recusa cedo (fila cheia/espera condenada)
      // → cai no MESMO fallback keyword de sempre (return null aqui = caller usa keyword).
      // Contexto canônico da ação de crédito `ai_realtime`. Cliente único (S05B) —
      // `OllamaGatewayRefusedError` distingue a recusa cedo do governor de qualquer
      // outra falha (HTTP/rede), preservando os DOIS textos de log distintos que
      // este classificador já tinha antes da fusão.
      const raw = await callOllamaChat({
        baseUrl,
        model,
        timeoutMs,
        format: 'json',
        temperature: 0.1,
        numPredict: 80,
        think: false,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Resposta do lead: ${text}` },
        ],
        companyId: input?.companyId,
        actionKey: 'ai_realtime',
      });

      const parsed = safeParseJson(raw);
      if (!parsed) {
        this.logger.warn('classificador IA devolveu JSON inválido — caindo no keyword');
        return null;
      }

      const latencyMs = Date.now() - startedAt;
      const sender = String((parsed as any).remetente || '').toLowerCase();

      if (sender === 'bot') {
        return { source: 'ai', model, latencyMs, raw, bot: true, botKind: 'bot_menu_detected', intent: null };
      }

      const label = String((parsed as any).intencao || '').toUpperCase().trim();
      const intent = this.buildIntent(label);
      if (!intent) return null; // INDEFINIDO / rótulo desconhecido -> fallback keyword

      return { source: 'ai', model, latencyMs, raw, bot: false, botKind: null, intent };
    } catch (error) {
      if (error instanceof OllamaGatewayRefusedError) {
        this.logger.warn('classificador IA recusado cedo pelo governor (fila cheia) — caindo no keyword');
        return null;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`classificador IA indisponível (${message}) — caindo no keyword`);
      return null;
    }
  }

  /**
   * Orquestra IA → keyword. Tenta a IA primeiro; se ela estiver desligada,
   * indisponível, der timeout ou responder INDEFINIDO, cai no classificador por
   * palavra-chave atual (comportamento de hoje). Bot detectado pela IA vira
   * auto-reply (o handler já PARA nesse caso). Retorno é drop-in dos call-sites:
   * `{ intent, autoReply }`.
   */
  async classifyIntentWithFallback(input: {
    text: string;
    positiveKeywords: string[];
    negativeKeywords: string[];
    whatIsItKeywords: string[];
    neutralKeywords: string[];
    callbackKeywords?: string[];
    humanHandoffKeywords?: string[];
    /** Empresa dona da conversa para autorização da ação `ai_realtime`. */
    companyId?: number | null;
  }): Promise<{
    intent: ProspectingIntentClassification;
    autoReply: ProspectingAutoReplyClassification | null;
    source: 'ai' | 'keyword';
  }> {
    const text = String(input?.text || '');

    const ai = await this.classify({ text, companyId: input?.companyId });
    if (ai?.bot) {
      // IA detectou robô → trata como auto-reply; o handler já silencia nesse caso.
      return { source: 'ai', intent: this.neutralIntent('ai:bot'), autoReply: ai.botKind ?? classifyProspectingAutoReply(text) };
    }
    if (ai?.intent) {
      // IA classificou a intenção; a regex de auto-reply segue como defesa extra.
      return { source: 'ai', intent: ai.intent, autoReply: classifyProspectingAutoReply(text) };
    }

    // Fallback: classificação por palavra-chave (exatamente o comportamento atual).
    const intent = classifyProspectingIntent({
      text,
      positiveKeywords: input.positiveKeywords,
      negativeKeywords: input.negativeKeywords,
      whatIsItKeywords: input.whatIsItKeywords,
      neutralKeywords: input.neutralKeywords,
      callbackKeywords: input.callbackKeywords,
      humanHandoffKeywords: input.humanHandoffKeywords,
    });
    return { source: 'keyword', intent, autoReply: classifyProspectingAutoReply(text) };
  }

  private neutralIntent(reason: string): ProspectingIntentClassification {
    return { kind: 'neutral', confidence: 0.3, reasons: [reason], signals: emptySignals() };
  }

  /** Mapeia o rótulo da IA para o MESMO formato do keyword (`ProspectingIntentClassification`). */
  private buildIntent(label: string): ProspectingIntentClassification | null {
    const signals = emptySignals();
    const make = (kind: ProspectingIntentKind, confidence: number): ProspectingIntentClassification => ({
      kind,
      confidence,
      reasons: [`ai:${label.toLowerCase()}`],
      signals,
    });

    switch (label) {
      case 'INTERESSE':
        signals.positive = true;
        return make('positive', 0.9);
      case 'O_QUE_SERIA':
        signals.whatIsIt = true;
        return make('what_is_it', 0.86);
      case 'RETORNE_DEPOIS':
        signals.delay = true;
        return make('neutral', 0.8);
      case 'NAO_INCOMODE':
        signals.negative = true;
        return make('negative', 0.9);
      case 'REMOVER':
        signals.negative = true;
        signals.optOut = true;
        return make('opt_out', 0.95);
      case 'HUMANO':
        signals.humanHandoff = true;
        return make('human_requested', 0.82);
      default:
        return null; // INDEFINIDO ou rótulo fora do enum
    }
  }
}
