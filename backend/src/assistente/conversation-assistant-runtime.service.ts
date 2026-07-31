import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeAssistenteConfig, type AssistenteConfigShape } from './assistente-flow';
import { AssistenteSandboxService, type SandboxTurn } from './assistente-sandbox.service';
import { AgentRuntimeResolver } from '../automation/agent-runtime.resolver';
import { automationFlag } from '../automation/automation-flags';
import { PersonaIaService } from '../vendas/persona-ia.service';

const PUBLISH_FLAG = 'HBX_ASSISTENTE_PUBLISH_ENABLED';
const PUBLISH_FLAG_NEW = 'HBX_AUTOMATION_IA_LIVE';

function isUniqueConstraint(error: any): boolean {
  return String(error?.code || '').trim().toUpperCase() === 'P2002';
}

@Injectable()
export class ConversationAssistantRuntimeService {
  private readonly logger = new Logger(ConversationAssistantRuntimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sandbox: AssistenteSandboxService,
  ) {}

  private get enabled(): boolean {
    // S20 (MOTOR-ÚNICO): lê HBX_AUTOMATION_IA_LIVE, fallback pra
    // HBX_ASSISTENTE_PUBLISH_ENABLED com warn de deprecado — mesma flag, novo
    // nome (automation/automation-flags.ts é a FONTE ÚNICA do fallback).
    return automationFlag(PUBLISH_FLAG_NEW, PUBLISH_FLAG);
  }

  async prepareReply(input: {
    companyId: number;
    conversationId: number;
    inboundMessageId: number;
    text: string;
  }): Promise<
    | { handled: false; reason: string }
    | {
        handled: true;
        duplicate?: boolean;
        failed?: boolean;
        runId?: string;
        reply?: string;
        publicName?: string;
        source?: string;
        vendasLeadId?: string | null;
        reason?: string;
      }
  > {
    if (!this.enabled) return { handled: false, reason: 'assistant_runtime_disabled' };
    const companyId = Number(input.companyId || 0);
    const conversationId = Number(input.conversationId || 0);
    const inboundMessageId = Number(input.inboundMessageId || 0);
    const text = String(input.text || '').trim();
    if (!companyId || !conversationId || !inboundMessageId || !text) {
      return { handled: false, reason: 'assistant_input_ineligible' };
    }

    // S10 (MOTOR-ÚNICO): origem da config passa pelo AgentRuntimeResolver —
    // flag `HBX_AUTOMATION_AGENT` OFF (default), empresa sem AutomationAgent
    // migrado, ou erro qualquer devolve `{source:'legacy'}` e TODO o resto
    // deste método segue byte a byte igual ao pré-S10 (lê AssistenteConfig
    // direto). Instanciado sem DI (mesmo truque do InboundRouterService,
    // S06) — o resolver só depende de PrismaService (@Global()), evitando
    // que AssistenteModule precise importar AutomationModule de volta
    // (ciclo real: AutomationModule já importa AssistenteModule).
    const effective = await new AgentRuntimeResolver(this.prisma).effectiveFor(companyId);
    if (effective.source === 'agent' && effective.brain === 'roteiro') {
      // Regra de produto (S10.md item 2): agente no cérebro 'roteiro' não é
      // respondido pela IA — o atendimento de menu segue seu próprio
      // caminho (messaging.service.ts::getAtendimentoBotConfig, também
      // atrás do resolver). A assistente simplesmente não reivindica.
      return { handled: false, reason: 'assistant_agent_brain_roteiro' };
    }
    const agentIaConfig: AssistenteConfigShape | null =
      effective.source === 'agent' && effective.brain === 'ia' ? effective.ia : null;

    const [configRow, conversation] = await Promise.all([
      agentIaConfig ? Promise.resolve(null) : this.prisma.assistenteConfig.findUnique({ where: { companyId } }),
      this.prisma.companyConversation.findFirst({
        where: { id: conversationId, companyId },
        select: { id: true, botActive: true, humanAssigned: true, vendasLeadId: true },
      }),
    ]);
    // Guarda `published` IDÊNTICA (S10.md "claim/guards intocados") — só a
    // ORIGEM muda: `agent.published` quando o cérebro é o agente novo,
    // `AssistenteConfig.published` no legado (comportamento pré-S10).
    const published = agentIaConfig ? Boolean((effective as any).published) : Boolean(configRow?.published);
    if (!published) return { handled: false, reason: 'assistant_not_published' };
    // "Armar bot" morreu (31/07/2026): no MESMO ponto do pino antigo entra a
    // ENTREVISTA — IA só responde cliente se a empresa já disse o que faz, o
    // que vende e quem a IA é. Fail-closed: erro de leitura = não responde.
    const entrevistaOk = await new PersonaIaService(this.prisma)
      .getPerfil(companyId)
      .then((p) => p.entrevistaCompleta)
      .catch(() => false);
    if (!entrevistaOk) return { handled: false, reason: 'assistant_entrevista_incompleta' };
    if (!conversation || conversation.botActive !== true || conversation.humanAssigned === true) {
      return { handled: false, reason: 'assistant_conversation_inactive' };
    }

    const publicNameSnapshot = agentIaConfig ? agentIaConfig.nome : String(configRow!.nome);

    let run: any;
    try {
      run = await this.prisma.conversationAssistantRun.create({
        data: {
          companyId,
          conversationId,
          inboundMessageId,
          vendasLeadId: conversation.vendasLeadId || null,
          status: 'claimed',
          publicNameSnapshot,
        },
      });
    } catch (error: any) {
      if (isUniqueConstraint(error)) {
        // Outro processo já assumiu esta mensagem. Considera tratada para não
        // cair também no Bot legado e produzir uma segunda resposta.
        return { handled: true, duplicate: true, reason: 'assistant_reply_already_claimed' };
      }
      this.logger.warn(`Falha ao reivindicar resposta da assistente company=${companyId}: ${String(error?.message || error)}`);
      return { handled: false, reason: 'assistant_claim_failed' };
    }

    try {
      const config: AssistenteConfigShape =
        agentIaConfig ??
        sanitizeAssistenteConfig({
          nome: configRow!.nome,
          tom: configRow!.tom,
          perfil: configRow!.perfil,
          produtos: configRow!.produtos || '',
          empresaNome: configRow!.empresaNome || '',
          fluxo: this.parseLegacyFluxo(configRow!.fluxoJson),
        });
      const rows = await this.prisma.companyMessage.findMany({
        where: {
          companyId,
          conversationId,
          id: { lt: inboundMessageId },
          messageType: { in: ['text', 'button', 'interactive'] },
        },
        select: { direction: true, body: true },
        orderBy: { id: 'desc' },
        take: 16,
      });
      const history: SandboxTurn[] = [...rows]
        .reverse()
        .map((row) => ({
          role: String(row.direction || '').toUpperCase() === 'OUTBOUND' ? 'assistant' as const : 'user' as const,
          content: String(row.body || '').trim().slice(0, 2_000),
        }))
        .filter((turn) => Boolean(turn.content));
      const result = await this.sandbox.reply(config, history, text, undefined, { companyId });
      const reply = String(result.reply || '').trim();
      if (!reply) throw new Error('assistant_empty_reply');
      return {
        handled: true,
        runId: String(run.id),
        reply,
        publicName: config.nome,
        source: result.source,
        vendasLeadId: conversation.vendasLeadId || null,
      };
    } catch (error: any) {
      const errorMessage = String(error?.message || error).slice(0, 500);
      await this.prisma.conversationAssistantRun.updateMany({
        where: { id: run.id, companyId, status: 'claimed' },
        data: { status: 'failed', errorCode: 'assistant_generation_failed', errorMessage },
      }).catch(() => null);
      this.logger.warn(`Assistente não respondeu company=${companyId} conversation=${conversationId}: ${errorMessage}`);
      return {
        handled: true,
        failed: true,
        runId: String(run.id),
        publicName: publicNameSnapshot || 'Assistente',
        reason: 'assistant_generation_failed',
      };
    }
  }

  // S10: extraído do trecho que antes vivia inline no bloco legado do
  // `prepareReply` — mesmo comportamento (JSON quebrado nunca derruba o
  // runtime, cai em `{}`), só nomeado pra não duplicar o try/catch nos dois
  // ramos (config do agente já vem parseada pelo AgentRuntimeResolver).
  private parseLegacyFluxo(json: string | null | undefined): unknown {
    try {
      return JSON.parse(json || '{}');
    } catch {
      return {};
    }
  }

  async markQueued(input: { companyId: number; runId: string; outboundMessageId: number; source?: string | null }) {
    await this.prisma.conversationAssistantRun.updateMany({
      where: { id: input.runId, companyId: input.companyId, status: 'claimed' },
      data: {
        status: 'queued',
        outboundMessageId: input.outboundMessageId,
        responseSource: input.source || null,
        errorCode: null,
        errorMessage: null,
      },
    });
  }

  async markQueueFailed(input: { companyId: number; runId: string; error: unknown }) {
    await this.prisma.conversationAssistantRun.updateMany({
      where: { id: input.runId, companyId: input.companyId, status: 'claimed' },
      data: {
        status: 'failed',
        errorCode: 'assistant_outbox_failed',
        errorMessage: String((input.error as any)?.message || input.error).slice(0, 500),
      },
    });
  }
}
