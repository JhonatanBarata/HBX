import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomerProfileService } from '../customer-profile/customer-profile.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateManualVendasLeadDto,
  ImportWebscrapingLeadsDto,
  UpdateVendasLeadDto,
} from './dto/vendas.dto';

type VendasLeadStatus = 'novo' | 'contato' | 'retorno' | 'qualificado' | 'encerrado';

type LeadBlockKey = 'today' | 'overdue' | 'scheduled' | 'closed';

type TimelineEventInput = {
  eventType: string;
  title: string;
  description?: string | null;
  sourceType?: string | null;
  statusFrom?: string | null;
  statusTo?: string | null;
  resultLabel?: string | null;
  returnAt?: Date | null;
  createdByUserId?: number | null;
};

type TimelineEventRecord = {
  eventType: string;
  title: string;
  description: string | null;
  sourceType: string | null;
  statusFrom: string | null;
  statusTo: string | null;
  resultLabel: string | null;
  returnAt: Date | null;
  createdByUserId: number | null;
};

@Injectable()
export class VendasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerProfileService: CustomerProfileService,
  ) {}

  private normalizeText(value: unknown) {
    const normalized = String(value || '').trim();
    return normalized || null;
  }

  private normalizePhone(value: unknown) {
    const digits = this.customerProfileService.normalizePhone(value);
    return digits || null;
  }

  private normalizeEmail(value: unknown) {
    return this.customerProfileService.normalizeEmail(value);
  }

  private normalizeStatus(value: unknown): VendasLeadStatus {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'contato') return 'contato';
    if (normalized === 'retorno') return 'retorno';
    if (normalized === 'qualificado') return 'qualificado';
    if (normalized === 'encerrado') return 'encerrado';
    return 'novo';
  }

  private parseDate(value: unknown) {
    const normalized = this.normalizeText(value);
    if (!normalized) return null;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private startOfToday(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  }

  private startOfTomorrow(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);
  }

  private isClosedLead(row: any) {
    return this.normalizeStatus(row?.status) === 'encerrado' || Boolean(row?.closedAt);
  }

  private classifyLeadBlock(row: any): LeadBlockKey {
    if (this.isClosedLead(row)) return 'closed';

    const now = new Date();
    const startToday = this.startOfToday(now);
    const startTomorrow = this.startOfTomorrow(now);
    const returnAt = row?.returnAt instanceof Date ? row.returnAt : this.parseDate(row?.returnAt);

    if (!returnAt) return 'today';
    if (returnAt.getTime() < startToday.getTime()) return 'overdue';
    if (returnAt.getTime() >= startTomorrow.getTime()) return 'scheduled';
    return 'today';
  }

  private formatStatusLabel(status: VendasLeadStatus) {
    switch (status) {
      case 'contato':
        return 'Em contato';
      case 'retorno':
        return 'Retorno';
      case 'qualificado':
        return 'Qualificado';
      case 'encerrado':
        return 'Encerrado';
      default:
        return 'Novo lead';
    }
  }

  private formatSourceLabel(sourceType: unknown) {
    return String(sourceType || '').trim().toLowerCase() === 'webscraping' ? 'Webscraping' : 'Manual';
  }

  private hasPreviousContact(row: any) {
    return Boolean(row?.lastContactAt) || Number(row?.attemptCount || 0) > 0;
  }

  private buildSignalState(row: any) {
    const sourceType = String(row?.sourceType || 'manual').trim().toLowerCase();
    const primarySource = String(row?.primarySource || sourceType || 'manual').trim().toLowerCase();
    const wasClosedBefore = Boolean(row?.wasClosedBefore) || Boolean(row?.closedAt);
    return {
      alreadyExisted: Number(row?.timesSeen || 0) > 1,
      cameFromWebscraping: sourceType === 'webscraping' || primarySource === 'webscraping',
      hadPreviousContact: this.hasPreviousContact(row),
      wasClosedBefore,
    };
  }

  private buildLeadPayload(row: any) {
    const status = this.normalizeStatus(row?.status);
    const block = this.classifyLeadBlock(row);
    const primarySource = String(row?.primarySource || row?.sourceType || 'manual');
    const signals = this.buildSignalState(row);
    const timeline = Array.isArray(row?.timelineEvents)
      ? row.timelineEvents.map((event: any) => ({
          id: String(event?.id || ''),
          eventType: String(event?.eventType || 'generic'),
          title: String(event?.title || 'Atualizacao comercial'),
          description: event?.description ? String(event.description) : null,
          sourceType: event?.sourceType ? String(event.sourceType) : null,
          statusFrom: event?.statusFrom ? String(event.statusFrom) : null,
          statusTo: event?.statusTo ? String(event.statusTo) : null,
          resultLabel: event?.resultLabel ? String(event.resultLabel) : null,
          returnAt: event?.returnAt instanceof Date ? event.returnAt.toISOString() : null,
          createdAt: event?.createdAt instanceof Date ? event.createdAt.toISOString() : null,
        }))
      : [];
    return {
      id: String(row?.id || ''),
      customerProfileId: row?.customerProfileId ? String(row.customerProfileId) : null,
      sourceType: String(row?.sourceType || 'manual'),
      primarySource,
      sourceHistoryId: row?.sourceHistoryId ? String(row.sourceHistoryId) : null,
      sourceSignature: row?.sourceSignature ? String(row.sourceSignature) : null,
      timesSeen: Math.max(1, Math.trunc(Number(row?.timesSeen || 0) || 1)),
      name: row?.name ? String(row.name) : null,
      phone: row?.phone ? String(row.phone) : null,
      phoneNormalized: row?.phoneNormalized ? String(row.phoneNormalized) : null,
      email: row?.email ? String(row.email) : null,
      city: row?.city ? String(row.city) : null,
      segment: row?.segment ? String(row.segment) : null,
      status,
      statusLabel: this.formatStatusLabel(status),
      nextAction: row?.nextAction ? String(row.nextAction) : null,
      returnAt: row?.returnAt instanceof Date ? row.returnAt.toISOString() : null,
      shortNote: row?.shortNote ? String(row.shortNote) : null,
      lastContactAt: row?.lastContactAt instanceof Date ? row.lastContactAt.toISOString() : null,
      attemptCount: Math.max(0, Math.trunc(Number(row?.attemptCount || 0) || 0)),
      lastResult: row?.lastResult ? String(row.lastResult) : null,
      wasClosedBefore: signals.wasClosedBefore,
      closedAt: row?.closedAt instanceof Date ? row.closedAt.toISOString() : null,
      createdAt: row?.createdAt instanceof Date ? row.createdAt.toISOString() : null,
      updatedAt: row?.updatedAt instanceof Date ? row.updatedAt.toISOString() : null,
      signals,
      timeline,
      block,
      quickActions:
        block === 'closed'
          ? ['reabrir']
          : ['hoje', 'amanha', 'encerrar'],
    };
  }

  private resolveUserContext(user: any) {
    const masterContextCompanyId = Number(user?.masterContext?.active ? user?.masterContext?.companyId : 0);
    const companyId = masterContextCompanyId || Number(user?.companyId || 0);
    const userId = Number(user?.id || 0);
    if (!companyId) throw new ForbiddenException('Empresa nao identificada.');
    if (!userId) throw new ForbiddenException('Usuario nao identificado.');
    return { companyId, userId };
  }

  private async ensureCustomerProfile(input: {
    companyId: number;
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    sourceType: 'manual' | 'webscraping';
    shortNote?: string | null;
  }) {
    const hasIdentity = Boolean(input.name || input.phone || input.email);
    if (!hasIdentity) return null;

    const profile = await this.customerProfileService.upsertProfile({
      companyId: input.companyId,
      name: input.name || null,
      phone: input.phone || null,
      email: input.email || null,
      externalSource: input.sourceType,
      status: 'active',
      notes: input.shortNote || null,
    });

    return profile?.id ? String(profile.id) : null;
  }

  private buildImportedLeadNote(input: {
    city?: string | null;
    segment?: string | null;
    shortNote?: string | null;
  }) {
    const base = this.normalizeText(input.shortNote);
    if (base) return base;

    const city = this.normalizeText(input.city);
    const segment = this.normalizeText(input.segment);
    if (!city && !segment) return 'Lead herdado do webscraping.';
    return `Lead herdado do webscraping${segment ? ` para ${segment}` : ''}${city ? ` em ${city}` : ''}.`;
  }

  private buildTimelineEvent(input: TimelineEventInput): TimelineEventRecord {
    return {
      eventType: String(input.eventType || 'generic').trim(),
      title: String(input.title || 'Atualizacao comercial').trim(),
      description: this.normalizeText(input.description),
      sourceType: this.normalizeText(input.sourceType),
      statusFrom: this.normalizeText(input.statusFrom),
      statusTo: this.normalizeText(input.statusTo),
      resultLabel: this.normalizeText(input.resultLabel),
      returnAt: input.returnAt || null,
      createdByUserId: Number(input.createdByUserId || 0) || null,
    };
  }

  private buildImportPreviewPayload(row: any, phoneDigits: string) {
    const payload = row ? this.buildLeadPayload(row) : null;
    return {
      phoneDigits,
      existsInCrm: Boolean(payload),
      leadId: payload?.id || null,
      leadName: payload?.name || null,
      status: payload?.status || null,
      statusLabel: payload?.statusLabel || null,
      signals: payload?.signals || {
        alreadyExisted: false,
        cameFromWebscraping: false,
        hadPreviousContact: false,
        wasClosedBefore: false,
      },
      attemptCount: payload?.attemptCount || 0,
      lastContactAt: payload?.lastContactAt || null,
      lastResult: payload?.lastResult || null,
      timesSeen: payload?.timesSeen || 0,
      sourceType: payload?.sourceType || null,
      primarySource: payload?.primarySource || null,
    };
  }

  private async createOrUpdateLead(input: {
    companyId: number;
    userId: number;
    sourceType: 'manual' | 'webscraping';
    sourceHistoryId?: string | null;
    sourceSignature?: string | null;
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    city?: string | null;
    segment?: string | null;
    status?: string | null;
    nextAction?: string | null;
    returnAt?: Date | null;
    shortNote?: string | null;
  }) {
    const phoneNormalized = this.normalizePhone(input.phone);
    const email = this.normalizeEmail(input.email);
    const name = this.normalizeText(input.name);
    const shortNote = this.normalizeText(input.shortNote);
    const nextAction = this.normalizeText(input.nextAction) || 'Primeiro contato';
    const status = this.normalizeStatus(input.status);
    const returnAt = input.returnAt || new Date();
    const customerProfileId = await this.ensureCustomerProfile({
      companyId: input.companyId,
      name,
      phone: input.phone || null,
      email,
      sourceType: input.sourceType,
      shortNote,
    });

    const baseData: any = {
      customerProfileId,
      sourceType: input.sourceType,
      primarySource: input.sourceType,
      sourceHistoryId: this.normalizeText(input.sourceHistoryId),
      sourceSignature: this.normalizeText(input.sourceSignature),
      timesSeen: 1,
      name,
      phone: this.normalizeText(input.phone),
      phoneNormalized,
      email,
      city: this.normalizeText(input.city),
      segment: this.normalizeText(input.segment),
      status,
      nextAction,
      returnAt,
      shortNote,
      lastContactAt: null,
      attemptCount: 0,
      lastResult: null,
      wasClosedBefore: status === 'encerrado',
      closedAt: status === 'encerrado' ? new Date() : null,
      createdByUserId: input.userId,
    };

    if (phoneNormalized) {
      const existing = await this.prisma.vendasLead.findUnique({
        where: {
          companyId_phoneNormalized: {
            companyId: input.companyId,
            phoneNormalized,
          },
        },
      });

      if (existing) {
        const nextStatus = status === 'encerrado' ? 'encerrado' : this.normalizeStatus(existing.status || status);
        const wasClosedBefore = Boolean(existing.wasClosedBefore) || Boolean(existing.closedAt) || String(existing.status || '') === 'encerrado';
        const updateData: any = {
          customerProfileId: customerProfileId || existing.customerProfileId,
          sourceType: input.sourceType,
          primarySource: existing.primarySource || existing.sourceType || input.sourceType,
          sourceHistoryId: baseData.sourceHistoryId || existing.sourceHistoryId,
          sourceSignature: baseData.sourceSignature || existing.sourceSignature,
          timesSeen: Math.max(1, Math.trunc(Number(existing.timesSeen || 0) || 1)) + 1,
          name: baseData.name || existing.name,
          phone: baseData.phone || existing.phone,
          email: baseData.email || existing.email,
          city: baseData.city || existing.city,
          segment: baseData.segment || existing.segment,
          nextAction: baseData.nextAction || existing.nextAction,
          returnAt: baseData.returnAt || existing.returnAt,
          shortNote: baseData.shortNote || existing.shortNote,
          status: nextStatus,
          wasClosedBefore: wasClosedBefore || nextStatus === 'encerrado',
          closedAt:
            nextStatus === 'encerrado'
              ? existing.closedAt || new Date()
              : existing.closedAt && wasClosedBefore
                ? null
                : null,
        };

        const updated = await this.prisma.$transaction(async (tx) => {
          await tx.vendasLead.update({
            where: { id: existing.id },
            data: updateData,
          });

          await tx.vendasLeadTimelineEvent.create({
            data: {
              leadId: existing.id,
              ...this.buildTimelineEvent({
                eventType: 'lead_reused',
                title: 'Lead reaproveitado por deduplicacao',
                description: `Um novo envio via ${this.formatSourceLabel(input.sourceType)} encontrou este telefone e atualizou o card existente.`,
                sourceType: input.sourceType,
                createdByUserId: input.userId,
              }),
            },
          });

          return tx.vendasLead.findUniqueOrThrow({
            where: { id: existing.id },
            include: {
              timelineEvents: {
                orderBy: [{ createdAt: 'desc' }],
                take: 12,
              },
            },
          });
        });

        return {
          action: 'updated',
          reusedExisting: true,
          lead: this.buildLeadPayload(updated),
        };
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.vendasLead.create({
        data: {
          companyId: input.companyId,
          ...baseData,
        },
      });

      await tx.vendasLeadTimelineEvent.createMany({
        data: [
          {
            leadId: row.id,
            ...this.buildTimelineEvent({
              eventType: 'lead_created',
              title: 'Lead criado',
              description: 'O lead entrou no CRM de Vendas e passou a fazer parte da agenda viva.',
              createdByUserId: input.userId,
            }),
          },
          {
            leadId: row.id,
            ...this.buildTimelineEvent({
              eventType: 'origin_registered',
              title: 'Origem registrada',
              description: `Origem principal definida como ${this.formatSourceLabel(input.sourceType)}.`,
              sourceType: input.sourceType,
              createdByUserId: input.userId,
            }),
          },
          ...(input.sourceType === 'manual' && returnAt
            ? [
                {
                  leadId: row.id,
                  ...this.buildTimelineEvent({
                    eventType: 'return_scheduled',
                    title: 'Retorno agendado',
                    description: `Primeira proxima acao definida como "${nextAction}".`,
                    returnAt,
                    createdByUserId: input.userId,
                  }),
                },
              ]
            : []),
        ],
      });

      return tx.vendasLead.findUniqueOrThrow({
        where: { id: row.id },
        include: {
          timelineEvents: {
            orderBy: [{ createdAt: 'desc' }],
            take: 12,
          },
        },
      });
    });

    return {
      action: 'created',
      reusedExisting: false,
      lead: this.buildLeadPayload(created),
    };
  }

  async previewWebscrapingImportForUser(user: any, dto: ImportWebscrapingLeadsDto) {
    const context = this.resolveUserContext(user);
    const incomingLeads = Array.isArray(dto?.leads) ? dto.leads : [];
    const phoneNormalizeds = incomingLeads
      .map((item) => this.normalizePhone(item?.phone || item?.phoneDigits || null))
      .filter(Boolean) as string[];

    if (!phoneNormalizeds.length) {
      return { items: [] };
    }

    const rows = await this.prisma.vendasLead.findMany({
      where: {
        companyId: context.companyId,
        phoneNormalized: { in: phoneNormalizeds },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });

    const byPhone = new Map<string, any>();
    for (const row of rows) {
      const key = String(row?.phoneNormalized || '').trim();
      if (!key || byPhone.has(key)) continue;
      byPhone.set(key, row);
    }

    return {
      items: phoneNormalizeds.map((phoneDigits) =>
        this.buildImportPreviewPayload(byPhone.get(phoneDigits) || null, phoneDigits),
      ),
    };
  }

  async getBoardForUser(user: any) {
    const context = this.resolveUserContext(user);
    const rows = await this.prisma.vendasLead.findMany({
      where: { companyId: context.companyId },
      orderBy: [{ returnAt: 'asc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 240,
      include: {
        timelineEvents: {
          orderBy: [{ createdAt: 'desc' }],
          take: 12,
        },
      },
    });

    const blocks = {
      today: [] as any[],
      overdue: [] as any[],
      scheduled: [] as any[],
      closed: [] as any[],
    };

    for (const row of rows) {
      const payload = this.buildLeadPayload(row);
      blocks[payload.block].push(payload);
    }

    return {
      summary: {
        total: rows.length,
        today: blocks.today.length,
        overdue: blocks.overdue.length,
        scheduled: blocks.scheduled.length,
        closed: blocks.closed.length,
      },
      blocks,
    };
  }

  async createManualLeadForUser(user: any, dto: CreateManualVendasLeadDto) {
    const context = this.resolveUserContext(user);
    if (!this.normalizeText(dto?.name) && !this.normalizeText(dto?.phone) && !this.normalizeText(dto?.email)) {
      throw new BadRequestException('Informe ao menos nome, telefone ou e-mail para criar o lead.');
    }

    const result = await this.createOrUpdateLead({
      companyId: context.companyId,
      userId: context.userId,
      sourceType: 'manual',
      name: dto?.name || null,
      phone: dto?.phone || null,
      email: dto?.email || null,
      status: dto?.status || 'novo',
      nextAction: dto?.nextAction || 'Primeiro contato',
      returnAt: this.parseDate(dto?.returnAt) || new Date(),
      shortNote: dto?.shortNote || null,
    });

    return {
      ok: true,
      ...result,
    };
  }

  async importWebscrapingLeadsForUser(user: any, dto: ImportWebscrapingLeadsDto) {
    const context = this.resolveUserContext(user);
    const incomingLeads = Array.isArray(dto?.leads) ? dto.leads : [];
    if (!incomingLeads.length) {
      throw new BadRequestException('Nenhum lead do webscraping foi enviado para o CRM.');
    }

    let createdCount = 0;
    let updatedCount = 0;
    const importedLeads: any[] = [];

    for (const item of incomingLeads) {
      if (!this.normalizeText(item?.phone) && !this.normalizeText(item?.phoneDigits)) {
        continue;
      }

      const result = await this.createOrUpdateLead({
        companyId: context.companyId,
        userId: context.userId,
        sourceType: 'webscraping',
        sourceHistoryId: this.normalizeText(item?.sourceHistoryId) || this.normalizeText(dto?.sourceHistoryId),
        sourceSignature: [this.normalizeText(item?.segment), this.normalizeText(item?.city)].filter(Boolean).join('|') || null,
        name: item?.name || null,
        phone: item?.phone || item?.phoneDigits || null,
        email: item?.email || null,
        city: item?.city || null,
        segment: item?.segment || null,
        status: 'novo',
        nextAction: 'Primeiro contato',
        returnAt: new Date(),
        shortNote: this.buildImportedLeadNote({
          city: item?.city || null,
          segment: item?.segment || null,
          shortNote: item?.shortNote || null,
        }),
      });

      if (result.action === 'created') {
        createdCount += 1;
      } else {
        updatedCount += 1;
      }
      importedLeads.push(result.lead);
    }

    return {
      ok: true,
      createdCount,
      updatedCount,
      leads: importedLeads,
      message:
        createdCount && updatedCount
          ? `${createdCount} lead(s) novos e ${updatedCount} atualizado(s) no CRM de Vendas.`
          : createdCount
            ? `${createdCount} lead(s) enviados ao CRM de Vendas.`
            : `${updatedCount} lead(s) já existentes foram atualizados no CRM de Vendas.`,
    };
  }

  async updateLeadForUser(user: any, leadId: string, dto: UpdateVendasLeadDto) {
    const context = this.resolveUserContext(user);
    const existing = await this.prisma.vendasLead.findFirst({
      where: {
        id: String(leadId || '').trim(),
        companyId: context.companyId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Lead comercial nao encontrado.');
    }

    const nextStatus = dto?.status ? this.normalizeStatus(dto.status) : this.normalizeStatus(existing.status);
    const returnAt = dto?.returnAt !== undefined
      ? (this.parseDate(dto.returnAt) || null)
      : existing.returnAt;
    const phone = dto?.phone !== undefined ? this.normalizeText(dto.phone) : existing.phone;
    const email = dto?.email !== undefined ? this.normalizeEmail(dto.email) : existing.email;
    const name = dto?.name !== undefined ? this.normalizeText(dto.name) : existing.name;
    const shortNote = dto?.shortNote !== undefined ? this.normalizeText(dto.shortNote) : existing.shortNote;
    const nextAction = dto?.nextAction !== undefined ? this.normalizeText(dto.nextAction) : existing.nextAction;
    const phoneNormalized = this.normalizePhone(phone);
    const duplicateLead = phoneNormalized
      ? await this.prisma.vendasLead.findFirst({
          where: {
            companyId: context.companyId,
            phoneNormalized,
            id: { not: existing.id },
          },
          select: { id: true, name: true },
        })
      : null;

    if (duplicateLead) {
      throw new BadRequestException(
        `Já existe um lead para este telefone no CRM: ${String(duplicateLead.name || duplicateLead.id)}.`,
      );
    }

    const customerProfileId =
      (await this.ensureCustomerProfile({
        companyId: context.companyId,
        name,
        phone,
        email,
        sourceType: existing.sourceType === 'webscraping' ? 'webscraping' : 'manual',
        shortNote,
      })) || existing.customerProfileId;
    const statusChanged = this.normalizeStatus(existing.status) !== nextStatus;
    const shouldRegisterContact = statusChanged && nextStatus !== 'novo';
    const nextAttemptCount = Math.max(0, Math.trunc(Number(existing.attemptCount || 0) || 0)) + (shouldRegisterContact ? 1 : 0);
    const nextLastContactAt = shouldRegisterContact ? new Date() : existing.lastContactAt;
    const nextLastResult = shouldRegisterContact ? this.formatStatusLabel(nextStatus) : existing.lastResult;
    const wasClosedBefore = Boolean(existing.wasClosedBefore) || Boolean(existing.closedAt) || String(existing.status || '') === 'encerrado' || nextStatus === 'encerrado';

    const timelineEvents: TimelineEventRecord[] = [];
    const existingReturnAt = existing.returnAt instanceof Date ? existing.returnAt : null;
    const returnChanged =
      (existingReturnAt?.getTime() || 0) !== (returnAt instanceof Date ? returnAt.getTime() : 0);

    if (statusChanged) {
      timelineEvents.push(
        this.buildTimelineEvent({
          eventType: 'status_changed',
          title: 'Status alterado',
          description: `O lead saiu de ${this.formatStatusLabel(this.normalizeStatus(existing.status))} para ${this.formatStatusLabel(nextStatus)}.`,
          statusFrom: this.normalizeStatus(existing.status),
          statusTo: nextStatus,
          createdByUserId: context.userId,
        }),
      );
    }

    if (shouldRegisterContact) {
      timelineEvents.push(
        this.buildTimelineEvent({
          eventType: 'contact_made',
          title: 'Contato realizado',
          description: nextAction
            ? `A proxima acao registrada foi "${nextAction}".`
            : 'Um novo movimento comercial foi registrado neste lead.',
          statusTo: nextStatus,
          createdByUserId: context.userId,
        }),
      );
      timelineEvents.push(
        this.buildTimelineEvent({
          eventType: 'result_recorded',
          title: 'Resultado informado',
          description: `Resultado atual marcado como ${this.formatStatusLabel(nextStatus)}.`,
          resultLabel: this.formatStatusLabel(nextStatus),
          statusTo: nextStatus,
          createdByUserId: context.userId,
        }),
      );
    }

    if (returnChanged && returnAt) {
      timelineEvents.push(
        this.buildTimelineEvent({
          eventType: 'return_scheduled',
          title: 'Retorno agendado',
          description: nextAction
            ? `Retorno reposicionado com a acao "${nextAction}".`
            : 'A agenda deste lead recebeu um novo retorno.',
          returnAt,
          createdByUserId: context.userId,
        }),
      );
    }

    if (nextStatus === 'encerrado' && this.normalizeStatus(existing.status) !== 'encerrado') {
      timelineEvents.push(
        this.buildTimelineEvent({
          eventType: 'lead_closed',
          title: 'Lead encerrado',
          description: shortNote
            ? `Encerramento registrado com observacao: "${shortNote}".`
            : 'O lead saiu da agenda ativa e foi movido para encerrados.',
          statusTo: nextStatus,
          createdByUserId: context.userId,
        }),
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.vendasLead.update({
        where: { id: existing.id },
        data: {
          customerProfileId,
          name,
          phone,
          phoneNormalized,
          email,
          status: nextStatus,
          nextAction,
          returnAt,
          shortNote,
          lastContactAt: nextLastContactAt,
          attemptCount: nextAttemptCount,
          lastResult: nextLastResult,
          wasClosedBefore,
          closedAt: nextStatus === 'encerrado' ? existing.closedAt || new Date() : null,
        },
      });

      if (timelineEvents.length) {
        await tx.vendasLeadTimelineEvent.createMany({
          data: timelineEvents.map((event) => ({
            leadId: existing.id,
            ...event,
          })),
        });
      }

      return tx.vendasLead.findUniqueOrThrow({
        where: { id: row.id },
        include: {
          timelineEvents: {
            orderBy: [{ createdAt: 'desc' }],
            take: 12,
          },
        },
      });
    });

    return {
      ok: true,
      lead: this.buildLeadPayload(updated),
    };
  }
}
