import { Injectable, Logger } from '@nestjs/common';
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
    const result = await this.aiIntentClassifier.classifyIntentWithFallback(input);
    const latencyMs = Date.now() - startedAt;

    if (context) {
      await this.recordDecision(input, result, context, latencyMs);
    }

    return result;
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
