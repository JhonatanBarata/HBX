import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InboxService } from '../inbox/inbox.service';
import { WebwhatsBridgeService } from '../messaging/webwhats-bridge.service';
import { normalizeBrPhoneDigits, normalizeBrPhoneE164 } from '../messaging/whatsapp-channel';
import { buildMotorStateByCompanyUser, isMetaConnected } from '../messaging/whatsapp-connection-state';
import { PrismaService } from '../prisma/prisma.service';
import { resolveVendasAccessContext, type VendasAccessContext } from '../team/team-access-runtime';
import { VendasLeadCockpitProjectorService } from './vendas-lead-cockpit-projector.service';

type AccessibleLead = {
  id: string;
  companyId: number;
  assignedUserId: number | null;
  createdByUserId: number | null;
  name: string | null;
  phone: string | null;
  phoneNormalized: string | null;
};

type ResolvedConversation = {
  row: any;
  source: 'canonical' | 'projection' | 'automation_job' | 'explicit_metadata' | 'exact_phone';
};

const MESSAGE_SELECT = {
  id: true,
  direction: true,
  messageType: true,
  body: true,
  senderType: true,
  status: true,
  error: true,
  timestamp: true,
  sourceModule: true,
  outboundMessageId: true,
  providerMessageId: true,
} as const;

@Injectable()
export class VendasConversationService {
  private readonly logger = new Logger(VendasConversationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inboxService: InboxService,
    private readonly cockpitProjector: VendasLeadCockpitProjectorService,
    private readonly webwhatsBridge: WebwhatsBridgeService,
  ) {}

  private buildLeadAccessWhere(context: VendasAccessContext, leadId: string) {
    const base = { companyId: context.companyId, id: leadId };
    if (context.canViewCompanyCards) return base;
    if (!context.canViewOwnCards) {
      return { ...base, id: { in: [] as string[] } };
    }
    return { ...base, assignedUserId: context.userId };
  }

  private async getAccessibleLead(user: any, leadIdRaw: string) {
    const context = await resolveVendasAccessContext(this.prisma, user);
    const leadId = String(leadIdRaw || '').trim();
    if (!leadId) throw new BadRequestException('Lead invalido.');

    const lead = await this.prisma.vendasLead.findFirst({
      where: this.buildLeadAccessWhere(context, leadId),
      select: {
        id: true,
        companyId: true,
        assignedUserId: true,
        createdByUserId: true,
        name: true,
        phone: true,
        phoneNormalized: true,
      },
    });
    if (!lead) throw new NotFoundException('Lead nao encontrado.');
    return { context, lead: lead as AccessibleLead };
  }

  private readMetadataLeadId(raw: unknown) {
    if (!raw) return null;
    try {
      const metadata = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
      const candidates = [
        (metadata as any).vendasLeadId,
        (metadata as any).leadId,
        (metadata as any).vendasAgendaQueue?.leadId,
        (metadata as any).vendasAutomation?.leadId,
        (metadata as any).vendasProspeccao?.leadId,
      ];
      return candidates.map((value) => String(value || '').trim()).find(Boolean) || null;
    } catch {
      return null;
    }
  }

  private async resolveConversation(companyId: number, lead: AccessibleLead): Promise<ResolvedConversation | null> {
    const canonical = await this.prisma.companyConversation.findFirst({
      where: { companyId, channel: 'whatsapp', vendasLeadId: lead.id },
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
    });
    if (canonical) return { row: canonical, source: 'canonical' };

    const projected = await this.prisma.vendasLeadCockpitState.findUnique({
      where: { leadId: lead.id },
      select: { conversationId: true },
    });
    if (projected?.conversationId) {
      const conversation = await this.prisma.companyConversation.findFirst({
        where: { id: projected.conversationId, companyId, channel: 'whatsapp' },
      });
      if (conversation) return { row: conversation, source: 'projection' };
    }

    const job = await this.prisma.vendasAutomationJob.findFirst({
      where: { companyId, leadId: lead.id, conversationId: { not: null } },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: { conversationId: true },
    });
    if (job?.conversationId) {
      const conversation = await this.prisma.companyConversation.findFirst({
        where: { id: job.conversationId, companyId, channel: 'whatsapp' },
      });
      if (conversation) return { row: conversation, source: 'automation_job' };
    }

    const explicitCandidates = await this.prisma.companyConversation.findMany({
      where: {
        companyId,
        channel: 'whatsapp',
        OR: [
          { metadata: { contains: `\"leadId\":\"${lead.id}\"` } },
          { metadata: { contains: `\"vendasLeadId\":\"${lead.id}\"` } },
        ],
      },
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
      take: 8,
    });
    const explicit = explicitCandidates.find(
      (conversation) => this.readMetadataLeadId(conversation.metadata) === lead.id,
    );
    if (explicit) return { row: explicit, source: 'explicit_metadata' };

    const phoneDigits = normalizeBrPhoneDigits(lead.phoneNormalized || lead.phone);
    if (!phoneDigits) return null;
    const phoneOwners = await this.prisma.vendasLead.findMany({
      where: { companyId, phoneNormalized: phoneDigits },
      select: { id: true },
      take: 2,
    });
    if (phoneOwners.length !== 1 || phoneOwners[0].id !== lead.id) return null;
    const contacts = Array.from(new Set([
      `+${phoneDigits}`,
      phoneDigits,
      ...(phoneDigits.startsWith('55') ? [`+${phoneDigits.slice(2)}`, phoneDigits.slice(2)] : []),
    ]));
    const exactMatches = await this.prisma.companyConversation.findMany({
      where: { companyId, channel: 'whatsapp', contact: { in: contacts } },
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
      take: 3,
    });
    if (exactMatches.length !== 1) return null;
    if (exactMatches[0].vendasLeadId && exactMatches[0].vendasLeadId !== lead.id) return null;
    return { row: exactMatches[0], source: 'exact_phone' };
  }

  private serializeConversation(row: any) {
    if (!row) return null;
    return {
      id: String(row.id),
      exists: true,
      contact: row.contact ? String(row.contact) : null,
      channel: String(row.channel || 'whatsapp'),
      linkedAt: row.vendasLeadLinkedAt instanceof Date ? row.vendasLeadLinkedAt.toISOString() : null,
    };
  }

  private emptySnapshot() {
    return {
      conversation: null,
      engagement: {
        state: 'no_conversation',
        hasSuccessfulOutbound: false,
        hasInboundMessage: false,
        hasInboundReply: false,
        firstSuccessfulOutboundAt: null,
        lastOutboundAt: null,
        lastOutboundStatus: null,
        lastInboundAt: null,
        lastMessageAt: null,
        lastMessageDirection: null,
        lastMessageStatus: null,
        lastMessagePreview: null,
        failureReason: null,
      },
    };
  }

  private async buildSnapshot(companyId: number, lead: AccessibleLead, resolved?: ResolvedConversation | null) {
    const conversation = resolved === undefined
      ? await this.resolveConversation(companyId, lead)
      : resolved;
    if (!conversation) return this.emptySnapshot();

    const states = await this.cockpitProjector.getCockpitStatesForLeads(companyId, [lead.id]);
    const projected = states.get(lead.id);
    if (projected && String(projected?.conversation?.id || '') === String(conversation.row.id)) {
      return projected;
    }

    // O GET do cockpit precisa ser uma leitura pura. A projeção é atualizada nos
    // writers (criação, outbox, confirmação/falha e inbound), nunca ao abrir o card.
    // Se a projeção persistida estiver ausente/obsoleta, deriva os fatos atuais sem
    // upsert para não esconder envio, resposta ou falha de uma conversa já existente.
    const derived = await this.cockpitProjector.getCockpitStateForLeadReadOnly(
      companyId,
      lead.id,
      Number(conversation.row.id),
    );
    return {
      ...derived,
      conversation: {
        ...this.serializeConversation(conversation.row),
        ...derived.conversation,
      },
    };
  }

  async getConversationForUser(user: any, leadId: string) {
    const { context, lead } = await this.getAccessibleLead(user, leadId);
    return this.buildSnapshot(context.companyId, lead);
  }

  private async resolveCreationSession(context: VendasAccessContext, lead: AccessibleLead) {
    const company = await this.prisma.company.findUnique({
      where: { id: context.companyId },
      select: {
        whatsappAttendanceMode: true,
        whatsappStatus: true,
        currentWhatsappConnectionSessionId: true,
      },
    });
    if (!company) throw new NotFoundException('Empresa nao encontrada.');

    const shared = String(company.whatsappAttendanceMode || '').trim().toLowerCase() === 'shared';
    const targetUserId = Number(lead.assignedUserId || context.userId || 0) || null;
    const preferredId = shared ? String(company.currentWhatsappConnectionSessionId || '').trim() : '';
    const session = preferredId
      ? await this.prisma.whatsAppConnectionSession.findFirst({
          where: { id: preferredId, companyId: context.companyId, provider: 'webwhats', status: 'active' },
        })
      : await this.prisma.whatsAppConnectionSession.findFirst({
          where: {
            companyId: context.companyId,
            provider: 'webwhats',
            status: 'active',
            ...(shared ? {} : { userId: targetUserId }),
          },
          orderBy: [{ connectedAt: 'desc' }, { createdAt: 'desc' }],
        });

    // PR20072026-CHIP (A4): em modo INDIVIDUAL, `company.whatsappStatus` (flag legado no
    // nível da empresa) NÃO representa o chip do VENDEDOR — foi essa brecha que deixou criar
    // shell órfã (sem sessão) pra prospecção manual da Gabriele (20/07), que depois vazou no
    // envio (fallback cego pro chip mais recente). Sem sessão do vendedor resolvível no banco,
    // confere o MOTOR AO VIVO antes de recusar (a causa raiz real foi drift banco×motor: a
    // sessão dela estava 'open' no motor mas não 'active' no banco). Motor confirma → tolera
    // (cria sem sessão; o 1º envio resolve/carimba via inbox.service#sendMessage). Nem banco
    // nem motor confirmam → FALHA FECHADO, não cria shell órfã.
    if (!session && !shared) {
      const motorInstances = await this.webwhatsBridge.listMotorInstances();
      const motorStateByUser = buildMotorStateByCompanyUser(motorInstances);
      const motorOpen = targetUserId ? motorStateByUser.get(`${context.companyId}:${targetUserId}`) === 'open' : false;
      if (!motorOpen) {
        throw new ServiceUnavailableException('Chip do vendedor não conectado — conecte antes de abrir esta conversa.');
      }
      return null;
    }
    if (!session && !isMetaConnected(company.whatsappStatus)) {
      throw new ServiceUnavailableException('Conecte o WhatsApp antes de abrir uma nova conversa.');
    }
    return session;
  }

  private async persistCanonicalLink(
    companyId: number,
    leadId: string,
    resolved: ResolvedConversation,
  ) {
    const currentLeadId = String(resolved.row?.vendasLeadId || '').trim();
    if (currentLeadId && currentLeadId !== leadId) {
      throw new ConflictException('Esta conversa ja esta vinculada a outro lead.');
    }
    if (currentLeadId === leadId) return resolved.row;

    return this.prisma.companyConversation.update({
      where: { id: resolved.row.id },
      data: {
        vendasLeadId: leadId,
        vendasLeadLinkedAt: new Date(),
        vendasLeadLinkSource: resolved.source,
      },
    });
  }

  async createOrLinkConversationForUser(user: any, leadId: string) {
    const { context, lead } = await this.getAccessibleLead(user, leadId);
    if (!context.canSendWhatsappManual) {
      throw new ForbiddenException('Acesso para enviar WhatsApp bloqueado pela politica da equipe.');
    }

    let resolved = await this.resolveConversation(context.companyId, lead);
    if (resolved) {
      const linked = await this.persistCanonicalLink(context.companyId, lead.id, resolved);
      resolved = { row: linked, source: 'canonical' };
    } else {
      const contact = normalizeBrPhoneE164(lead.phoneNormalized || lead.phone);
      if (!contact) throw new BadRequestException('Lead sem telefone valido para WhatsApp.');
      const session = await this.resolveCreationSession(context, lead);
      const existing = await this.prisma.companyConversation.findFirst({
        where: {
          companyId: context.companyId,
          channel: 'whatsapp',
          contact,
          whatsappConnectionSessionId: session?.id || null,
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      });

      if (existing) {
        resolved = {
          row: await this.persistCanonicalLink(context.companyId, lead.id, { row: existing, source: 'exact_phone' }),
          source: 'canonical',
        };
      } else {
        const now = new Date();
        const created = await this.prisma.companyConversation.create({
          data: {
            companyId: context.companyId,
            channel: 'whatsapp',
            contact,
            currentFlow: 'vendas_manual',
            currentStep: 'novo',
            botActive: false,
            humanAssigned: false,
            assignedUserId: null,
            vendasLeadId: lead.id,
            vendasLeadLinkedAt: now,
            vendasLeadLinkSource: 'explicit_create',
            metadata: JSON.stringify({
              sourceModule: 'vendas',
              vendasLeadId: lead.id,
              vendasLeadLinkedAt: now.toISOString(),
            }),
            ...(session
              ? {
                  whatsappConnectionSessionId: session.id,
                  sourcePhoneNormalized: session.phoneNormalized || undefined,
                  sourceTenantKey: session.tenantKey || undefined,
                }
              : {}),
          },
        });
        resolved = { row: created, source: 'canonical' };
      }
    }

    await this.cockpitProjector.rebuildLead(context.companyId, lead.id, resolved.row.id);
    return this.buildSnapshot(context.companyId, lead, resolved);
  }

  private serializeMessage(message: any) {
    return {
      id: String(message.id),
      direction: String(message.direction || '').trim().toLowerCase(),
      content: String(message.body || ''),
      createdAt: message.timestamp instanceof Date ? message.timestamp.toISOString() : null,
      messageType: String(message.messageType || 'text').trim().toLowerCase(),
      senderType: String(message.senderType || 'system').trim().toLowerCase(),
      status: String(message.status || 'RECEIVED').trim().toUpperCase(),
      sourceModule: message.sourceModule ? String(message.sourceModule).trim().toLowerCase() : null,
      error: message.error ? String(message.error) : null,
      outboundMessageId: message.outboundMessageId ? Number(message.outboundMessageId) : null,
      providerMessageId: message.providerMessageId ? String(message.providerMessageId) : null,
    };
  }

  async listMessagesForUser(
    user: any,
    leadId: string,
    options?: { limit?: number | string | null; before?: string | null },
  ) {
    const { context, lead } = await this.getAccessibleLead(user, leadId);
    const resolved = await this.resolveConversation(context.companyId, lead);
    if (!resolved) return { ...this.emptySnapshot(), messages: [], hasMore: false, nextBefore: null };

    const limit = Math.min(Math.max(Math.trunc(Number(options?.limit || 60)) || 60, 1), 200);
    const beforeDate = options?.before ? new Date(String(options.before)) : null;
    const before = beforeDate && Number.isFinite(beforeDate.getTime()) ? beforeDate : null;
    const rows = await this.prisma.companyMessage.findMany({
      where: {
        companyId: context.companyId,
        conversationId: resolved.row.id,
        ...(before ? { timestamp: { lt: before } } : {}),
      },
      select: MESSAGE_SELECT,
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    const snapshot = await this.buildSnapshot(context.companyId, lead, resolved);
    return {
      ...snapshot,
      messages: [...rows].reverse().map((message) => this.serializeMessage(message)),
      hasMore: rows.length === limit,
      nextBefore: rows.length ? rows[rows.length - 1].timestamp.toISOString() : null,
    };
  }

  async sendMessageForUser(user: any, leadId: string, bodyRaw: unknown) {
    const { context, lead } = await this.getAccessibleLead(user, leadId);
    if (!context.canSendWhatsappManual) {
      throw new ForbiddenException('Acesso para enviar WhatsApp bloqueado pela politica da equipe.');
    }
    const body = String(bodyRaw || '').trim();
    if (!body) throw new BadRequestException('Digite uma mensagem.');
    if (body.length > 4_000) throw new BadRequestException('Mensagem muito longa.');

    const resolved = await this.resolveConversation(context.companyId, lead);
    if (!resolved) throw new NotFoundException('Abra a conversa antes de enviar a mensagem.');
    const linked = await this.persistCanonicalLink(context.companyId, lead.id, resolved);

    // CRÍTICO E IRREVERSÍVEL: a partir daqui a mensagem já saiu no WhatsApp do cliente.
    // Se ISTO falhar, o envio de fato não aconteceu → 500 legítimo (o front marca FAILED).
    await this.inboxService.sendMessage({ ...user, companyId: context.companyId }, linked.id, body, {
      sourceModule: 'vendas_human',
      variables: {
        vendasLeadId: lead.id,
        purpose: 'human_reply',
      },
    });

    // Pós-envio: bookkeeping derivado. NUNCA pode transformar um envio bem-sucedido em 500
    // (senão o cliente recebe a mensagem e o vendedor vê "falhou" → reenvio → mensagem duplicada).
    // rebuildLead é projeção do cockpit (também é refeita no webhook de entrada); o front
    // repolla o thread em 1,5s, então uma falha aqui só perde o refresh imediato da resposta.
    try {
      await this.cockpitProjector.rebuildLead(context.companyId, lead.id, linked.id);
    } catch (err) {
      this.logger.warn(
        `[vendas-send] rebuildLead pós-envio falhou (lead=${lead.id}, conversation=${linked.id}): ${err instanceof Error ? err.message : err}`,
      );
    }
    try {
      return await this.listMessagesForUser(user, lead.id);
    } catch (err) {
      this.logger.warn(
        `[vendas-send] listMessages pós-envio falhou (lead=${lead.id}, conversation=${linked.id}): ${err instanceof Error ? err.message : err}`,
      );
      // Envio OK: devolve sucesso SEM o campo `messages` — o front preserva a mensagem
      // otimista na tela (não zera o thread) e o poll periódico reconcilia o estado real.
      return { conversation: { id: String(linked.id), exists: true } };
    }
  }
}
