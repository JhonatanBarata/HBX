import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeAssistenteConfig } from './assistente-flow';
import { AssistenteSandboxService, type SandboxTurn } from './assistente-sandbox.service';

const PUBLISH_FLAG = 'HBX_ASSISTENTE_PUBLISH_ENABLED';

function isEnabled(value: unknown): boolean {
  return ['true', '1', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

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
    return isEnabled(process.env[PUBLISH_FLAG]);
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

    const [configRow, company, conversation] = await Promise.all([
      this.prisma.assistenteConfig.findUnique({ where: { companyId } }),
      this.prisma.company.findUnique({ where: { id: companyId }, select: { botArmedAt: true } }),
      this.prisma.companyConversation.findFirst({
        where: { id: conversationId, companyId },
        select: { id: true, botActive: true, humanAssigned: true, vendasLeadId: true },
      }),
    ]);
    if (!configRow?.published) return { handled: false, reason: 'assistant_not_published' };
    if (!company?.botArmedAt) return { handled: false, reason: 'assistant_not_entitled' };
    if (!conversation || conversation.botActive !== true || conversation.humanAssigned === true) {
      return { handled: false, reason: 'assistant_conversation_inactive' };
    }

    let run: any;
    try {
      run = await this.prisma.conversationAssistantRun.create({
        data: {
          companyId,
          conversationId,
          inboundMessageId,
          vendasLeadId: conversation.vendasLeadId || null,
          status: 'claimed',
          publicNameSnapshot: configRow.nome,
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
      let fluxo: unknown = {};
      try {
        fluxo = JSON.parse(configRow.fluxoJson || '{}');
      } catch {
        fluxo = {};
      }
      const config = sanitizeAssistenteConfig({
        nome: configRow.nome,
        tom: configRow.tom,
        perfil: configRow.perfil,
        produtos: configRow.produtos || '',
        empresaNome: configRow.empresaNome || '',
        fluxo,
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
        publicName: String(configRow.nome || 'Assistente'),
        reason: 'assistant_generation_failed',
      };
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
