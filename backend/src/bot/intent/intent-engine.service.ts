import { Injectable, Logger } from '@nestjs/common';
import { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AiIntentClassifierService } from './ai-intent-classifier.service';
import type {
  ProspectingAutoReplyClassification,
  ProspectingIntentClassification,
} from '../../vendas/prospecting-safety';

/**
 * INTENTENGINE — Sprint 1: motor de intenção ÚNICO.
 *
 * Envelopa o `AiIntentClassifierService` (IA → fallback keyword) e é o ponto de
 * entrada único de todos os fluxos que classificam a resposta de um lead/cliente.
 * A API pública é drop-in do classificador atual (`classifyIntentWithFallback`
 * com o MESMO retorno `{ intent, autoReply, source }`) — nada muda na ordem de
 * decisão nem no formato. O único acréscimo é o parâmetro OPCIONAL `context`,
 * que quando informado grava a decisão em `IntentDecision` de forma BEST-EFFORT
 * (falha no insert NUNCA quebra a classificação — só loga warn e segue).
 *
 * A persistência cria o dataset real (texto → rótulo → fonte ia/keyword) que
 * decide upgrade de modelo/GPU com dados em vez de achismo.
 */

export type IntentFlow = 'prospeccao' | 'atendimento' | 'simulador';

export type IntentEngineContext = {
  companyId: number;
  conversationId?: number | null;
  flow: IntentFlow;
};

export type AtendimentoActionCandidate = {
  actionId: string;
  title: string;
  description?: string;
};

export type AtendimentoActionClassification = {
  actionId: string;
  confidence: number;
};

function envStr(name: string, fallback: string) {
  const value = String(process.env[name] || '').trim();
  return value || fallback;
}

function envInt(name: string, fallback: number) {
  const parsed = Number.parseInt(String(process.env[name] || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function envFloat(name: string, fallback: number) {
  const parsed = Number.parseFloat(String(process.env[name] || ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envOn(name: string) {
  return ['true', '1', 'yes', 'on'].includes(String(process.env[name] || '').trim().toLowerCase());
}

function classifierBaseUrl() {
  return envStr('HBX_LLM_CLASSIFIER_URL', 'http://host.docker.internal:11434').replace(/\/+$/, '');
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

const ATENDIMENTO_NLU_SYSTEM_PROMPT = [
  'Voce roteia a mensagem de UM cliente final dentro de um bot de atendimento por WhatsApp no Brasil.',
  'Devolva SOMENTE um JSON valido, nada fora dele: {"acao":"<actionId>","confianca":0..1}',
  '',
  'Escolha "acao" EXATAMENTE igual a um dos actionId da lista de acoes disponiveis informada',
  'pelo usuario (nunca invente um actionId fora da lista). Se nenhuma acao da lista corresponder',
  'com clareza ao pedido do cliente, devolva a acao mais provavel mesmo assim, mas com',
  '"confianca" BAIXA (perto de 0). "confianca" deve refletir o quao certo voce esta de que essa',
  'e a acao correta para o texto do cliente (0 = nenhuma certeza, 1 = certeza total).',
  '',
  'Girias BR: dps=depois, vlw=valeu, blz=beleza, to=estou, vc=voce, pra=para,',
  'pfv=por favor, n=nao, kk=risada, fmz=firmeza, mds=meu deus, marca=agendar.',
].join('\n');

export type IntentEngineInput = {
  text: string;
  positiveKeywords: string[];
  negativeKeywords: string[];
  whatIsItKeywords: string[];
  neutralKeywords: string[];
  callbackKeywords?: string[];
  humanHandoffKeywords?: string[];
};

export type IntentEngineResult = {
  intent: ProspectingIntentClassification;
  autoReply: ProspectingAutoReplyClassification | null;
  source: 'ai' | 'keyword';
};

@Injectable()
export class IntentEngineService {
  private readonly logger = new Logger(IntentEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiIntentClassifier: AiIntentClassifierService,
  ) {}

  /**
   * Classifica a resposta do lead (IA → fallback keyword). Drop-in do
   * `AiIntentClassifierService.classifyIntentWithFallback` — mesmo retorno,
   * mesma ordem de decisão. Quando `context` é informado, grava a decisão em
   * `IntentDecision` best-effort (nunca quebra a classificação).
   */
  async classifyIntentWithFallback(
    input: IntentEngineInput,
    context?: IntentEngineContext,
  ): Promise<IntentEngineResult> {
    const startedAt = Date.now();
    // CRÉDITO UNIVERSAL (PR10072026): repassa a empresa dona da conversa pro classificador —
    // a chamada de IA é autorizada como `ai_realtime` no gateway.
    const result = await this.aiIntentClassifier.classifyIntentWithFallback({
      ...input,
      companyId: context?.companyId ?? null,
    });
    const latencyMs = Date.now() - startedAt;

    if (context) {
      await this.recordDecision(input, result, context, latencyMs);
    }

    return result;
  }

  /** Liga só quando a env está setada — dormente por padrão (Sprint 2). */
  isAtendimentoNluEnabled(): boolean {
    return envOn('HBX_ATENDIMENTO_NLU_ENABLED');
  }

  /**
   * INTENTENGINE — Sprint 2: NLU do bot de Atendimento com trava de confiança.
   *
   * Recebe o texto livre do cliente + a lista de ações JÁ HABILITADAS do tenant
   * (catálogo sanitizado por provider/plano — nunca a lista bruta) e devolve o
   * `actionId` escolhido pela IA quando a confiança bate o limiar mínimo.
   *
   * O LLM NUNCA gera mensagem — só ESCOLHE um `actionId` dentre os informados.
   * Qualquer rótulo fora da lista enviada, JSON inválido, timeout, erro de rede
   * ou flag desligada devolve `null` — o caller (Atendimento) cai no menu atual,
   * que é o piso de comportamento (fallback intacto).
   *
   * A decisão é gravada em `IntentDecision` com `flow='atendimento'`
   * best-effort — inclusive quando descartada por baixa confiança, pois é o
   * dataset usado depois para calibrar `HBX_ATENDIMENTO_NLU_MIN_CONF`.
   */
  async classifyAtendimentoAction(input: {
    text: string;
    actions: AtendimentoActionCandidate[];
    context: { companyId: number; conversationId?: number | null };
  }): Promise<AtendimentoActionClassification | null> {
    const text = String(input?.text || '').trim();
    const actions = Array.isArray(input?.actions) ? input.actions.filter((action) => action?.actionId) : [];
    if (!text || !actions.length) return null;
    if (!this.isAtendimentoNluEnabled()) return null;

    const baseUrl = classifierBaseUrl();
    const model = envStr('HBX_LLM_CLASSIFIER_MODEL', 'qwen2.5:7b');
    const timeoutMs = envInt('HBX_ATENDIMENTO_NLU_TIMEOUT_MS', 6000);
    const minConfidence = envFloat('HBX_ATENDIMENTO_NLU_MIN_CONF', 0.75);
    const startedAt = Date.now();

    const catalogPrompt = actions
      .map((action) => `- ${action.actionId}: ${action.title}${action.description ? ` (${action.description})` : ''}`)
      .join('\n');
    const validActionIds = new Set(actions.map((action) => String(action.actionId || '').trim().toLowerCase()));

    let classification: AtendimentoActionClassification | null = null;
    let latencyMs = 0;
    try {
      // GOVERNOR-IA: faixa realtime (bot de atendimento tem gate apertado, passa na frente).
      // Recusa cedo → cai no MESMO menu de sempre (classification fica null).
      // Contexto canônico da ação de crédito `ai_realtime`.
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
              options: { temperature: 0.1, num_predict: 60 },
              messages: [
                { role: 'system', content: ATENDIMENTO_NLU_SYSTEM_PROMPT },
                {
                  role: 'user',
                  content: `Acoes disponiveis:\n${catalogPrompt}\n\nMensagem do cliente: ${text}`,
                },
              ],
            }),
            signal: AbortSignal.timeout(timeoutMs),
          }),
        { companyId: input.context?.companyId, actionKey: 'ai_realtime' },
      );
      latencyMs = Date.now() - startedAt;

      if (gw.refused) {
        this.logger.warn('NLU atendimento recusado cedo pelo governor (fila cheia) — caindo no menu');
      } else if (!gw.value.ok) {
        this.logger.warn(`NLU atendimento respondeu HTTP ${gw.value.status} — caindo no menu`);
      } else {
        const response = gw.value;
        const data = (await response.json()) as { message?: { content?: string } };
        const raw = String(data?.message?.content || '');
        const parsed = safeParseJson(raw);
        const actionId = String((parsed as any)?.acao || '').trim().toLowerCase();
        const confidence = Number((parsed as any)?.confianca);

        if (!parsed || !actionId || !validActionIds.has(actionId) || !Number.isFinite(confidence)) {
          this.logger.warn('NLU atendimento devolveu JSON invalido ou acao fora do catalogo — caindo no menu');
        } else {
          classification = { actionId, confidence };
        }
      }
    } catch (error) {
      latencyMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`NLU atendimento indisponível (${message}) — caindo no menu`);
    }

    await this.recordAtendimentoDecision(text, classification, minConfidence, model, latencyMs, input.context);

    if (classification && classification.confidence >= minConfidence) {
      return classification;
    }
    return null;
  }

  /**
   * Grava a decisão do NLU de atendimento em `IntentDecision` (`flow='atendimento'`)
   * — BEST-EFFORT, inclusive as descartadas por confiança baixa (dataset de
   * calibração). Nunca lança: falha aqui só loga warn e segue.
   */
  private async recordAtendimentoDecision(
    text: string,
    classification: AtendimentoActionClassification | null,
    minConfidence: number,
    model: string,
    latencyMs: number,
    context: { companyId: number; conversationId?: number | null },
  ): Promise<void> {
    try {
      const textPreview = text.slice(0, 200);
      const accepted = Boolean(classification && classification.confidence >= minConfidence);
      await this.prisma.intentDecision.create({
        data: {
          companyId: context.companyId,
          conversationId: context.conversationId ?? null,
          flow: 'atendimento',
          textPreview,
          source: 'ai',
          label: classification ? `${classification.actionId}${accepted ? '' : ':descartado'}` : 'sem_match:descartado',
          confidence: classification?.confidence ?? 0,
          latencyMs,
          model,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`falha ao gravar IntentDecision atendimento (best-effort, seguindo): ${message}`);
    }
  }

  /**
   * Grava a decisão em `IntentDecision` — BEST-EFFORT. Qualquer falha (banco
   * indisponível, tabela ausente antes da migration, etc.) é engolida com warn:
   * a classificação já foi devolvida ao caller, log de decisão nunca a bloqueia.
   */
  private async recordDecision(
    input: IntentEngineInput,
    result: IntentEngineResult,
    context: IntentEngineContext,
    latencyMs: number,
  ): Promise<void> {
    try {
      const textPreview = String(input?.text || '').slice(0, 200);
      const model = this.aiIntentClassifier.isEnabled()
        ? String(process.env.HBX_LLM_CLASSIFIER_MODEL || 'qwen2.5:7b').trim() || 'qwen2.5:7b'
        : null;
      await this.prisma.intentDecision.create({
        data: {
          companyId: context.companyId,
          conversationId: context.conversationId ?? null,
          flow: context.flow,
          textPreview,
          source: result.source,
          label: result.intent.kind,
          confidence: result.intent.confidence,
          latencyMs,
          // Só faz sentido registrar o modelo quando a decisão veio da IA.
          model: result.source === 'ai' ? model : null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`falha ao gravar IntentDecision (best-effort, seguindo): ${message}`);
    }
  }
}
