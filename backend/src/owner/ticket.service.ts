import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOwnerTicketDto, UpdateOwnerTicketDispatchDto } from './dto/owner-ticket.dto';

const OWNER_TICKET_STATUSES = new Set(['new', 'triage', 'waiting_codex', 'in_progress', 'done']);
const OWNER_JOB_STATUSES = new Set(['new', 'triage', 'waiting_codex', 'in_progress', 'done']);
const CODEX_DISPATCH_STATUSES = new Set([
  'not_dispatched',
  'prompt_copied',
  'dispatched',
  'running',
  'pr_open',
  'done',
  'failed',
]);
const HIGH_PRIORITY_TERMS = ['ticket', 'cliente', 'technical_support', 'whatsapp', 'p0', 'bug', 'erro', 'falha'];
const SENSITIVE_TERMS = ['deploy', 'publish', 'migration', 'migracao', 'migração', 'auth', 'billing', 'secrets', 'pagamento'];

type NormalizedTicketInput = {
  externalId: string | null;
  companyId: number | null;
  conversationId: number | null;
  source: string;
  origin: string;
  originChannel: string;
  branch: string;
  category: string;
  classification: string;
  status: string;
  priority: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  title: string;
  description: string;
  lastCustomerMessage: string | null;
  metadataJson: string | null;
};

@Injectable()
export class TicketService {
  constructor(private readonly prisma: PrismaService) {}

  async createOwnerTicket(dto: CreateOwnerTicketDto) {
    const normalized = await this.normalizeTicketInput(dto);

    if (normalized.externalId) {
      const existing = await this.prisma.hbxSupportTicket.findUnique({
        where: { externalId: normalized.externalId },
        include: { jobs: { orderBy: { createdAt: 'asc' } } },
      });
      if (existing) {
        return this.presentTicket(existing, { existing: true });
      }
    }

    const prefix = `HBX-${new Date().getFullYear()}-`;
    const currentCount = await this.prisma.hbxSupportTicket.count({
      where: { ticketCode: { startsWith: prefix } },
    });

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const ticketCode = `${prefix}${String(currentCount + attempt).padStart(6, '0')}`;
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          const ticket = await tx.hbxSupportTicket.create({
            data: {
              ticketCode,
              externalId: normalized.externalId,
              companyId: normalized.companyId,
              conversationId: normalized.conversationId,
              source: normalized.source,
              origin: normalized.origin,
              originChannel: normalized.originChannel,
              branch: normalized.branch,
              category: normalized.category,
              classification: normalized.classification,
              status: normalized.status,
              priority: normalized.priority,
              customerName: normalized.customerName,
              customerPhone: normalized.customerPhone,
              customerEmail: normalized.customerEmail,
              title: normalized.title,
              description: normalized.description,
              lastCustomerMessage: normalized.lastCustomerMessage,
              metadataJson: normalized.metadataJson,
              jobs: {
                create: {
                  companyId: normalized.companyId,
                  type: 'codex_task',
                  status: this.initialJobStatus(normalized),
                  branch: normalized.branch,
                  title: `Criar task Codex para ${ticketCode}`,
                  payloadJson: JSON.stringify({
                    ticketCode,
                    branch: normalized.branch,
                    category: normalized.category,
                    classification: normalized.classification,
                    title: normalized.title,
                    priority: normalized.priority,
                    source: normalized.source,
                    origin: normalized.origin,
                    originChannel: normalized.originChannel,
                  }),
                },
              },
            },
            include: { jobs: { orderBy: { createdAt: 'asc' } } },
          });
          return ticket;
        });

        return this.presentTicket(created, { existing: false });
      } catch (error) {
        if (this.isUniqueTicketCodeError(error)) {
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException('não foi possível gerar código único para o ticket');
  }

  async listOwnerTickets(input: { status?: string; take?: string | number } = {}) {
    const status = this.normalizeStatus(input.status, '', false, true);
    const take = Math.min(Math.max(Number(input.take || 50) || 50, 1), 100);
    const rows = await this.prisma.hbxSupportTicket.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take,
      include: { jobs: { orderBy: { createdAt: 'asc' } } },
    });
    return { ok: true, tickets: rows.map((row) => this.presentTicket(row, { nested: true }).ticket) };
  }

  async updateOwnerTicketDispatch(ticketCode: string, dto: UpdateOwnerTicketDispatchDto) {
    const code = this.cleanText(ticketCode, 120);
    if (!code) throw new BadRequestException('ticketCode obrigatório');

    const existing = await this.prisma.hbxSupportTicket.findFirst({
      where: {
        OR: [{ ticketCode: code }, { id: code }],
      },
      include: { jobs: { orderBy: { createdAt: 'asc' } } },
    });
    if (!existing) throw new NotFoundException('ticket não encontrado');

    const dispatchStatus = this.normalizeDispatchStatus(dto.codexDispatchStatus, dto);
    const ticketStatus = this.deriveTicketStatusFromDispatch(dispatchStatus, dto.status, existing.status);
    const githubPrNumber = this.parsePositiveInt(dto.githubPrNumber);
    const dispatchPayload = {
      codexDispatchStatus: dispatchStatus,
      codexRunId: this.cleanOptional(dto.codexRunId, 180),
      codexRunUrl: this.cleanOptional(dto.codexRunUrl, 600),
      githubIssueUrl: this.cleanOptional(dto.githubIssueUrl, 600),
      githubPrNumber,
      githubBranch: this.cleanOptional(dto.githubBranch, 240),
      status: ticketStatus,
      note: this.cleanOptional(dto.note, 1000),
      updatedAt: new Date().toISOString(),
    };

    const updated = await this.prisma.$transaction(async (tx) => {
      const ticket = await tx.hbxSupportTicket.update({
        where: { id: existing.id },
        data: {
          codexDispatchStatus: dispatchPayload.codexDispatchStatus,
          codexRunId: dispatchPayload.codexRunId,
          codexRunUrl: dispatchPayload.codexRunUrl,
          githubIssueUrl: dispatchPayload.githubIssueUrl,
          githubPrNumber: dispatchPayload.githubPrNumber,
          githubBranch: dispatchPayload.githubBranch,
          status: ticketStatus,
        },
        include: { jobs: { orderBy: { createdAt: 'asc' } } },
      });

      const firstJob = existing.jobs[0];
      const jobStatus = this.deriveJobStatusFromDispatch(dispatchStatus, ticketStatus);
      if (firstJob) {
        await tx.hbxJob.update({
          where: { id: firstJob.id },
          data: {
            status: jobStatus,
            resultJson: JSON.stringify({
              ...(this.parseJsonObject(firstJob.resultJson) || {}),
              dispatch: dispatchPayload,
            }),
            startedAt: ['dispatched', 'running', 'pr_open'].includes(dispatchStatus)
              ? firstJob.startedAt || new Date()
              : firstJob.startedAt,
            finishedAt: ['done', 'failed'].includes(dispatchStatus) ? new Date() : firstJob.finishedAt,
          },
        });
      }

      return tx.hbxSupportTicket.findUnique({
        where: { id: ticket.id },
        include: { jobs: { orderBy: { createdAt: 'asc' } } },
      });
    });

    return this.presentTicket(updated, { existing: true });
  }

  private async normalizeTicketInput(dto: CreateOwnerTicketDto): Promise<NormalizedTicketInput> {
    const source = this.cleanKey(dto.source, 'owner');
    const origin = this.cleanText(dto.origin || source, 80) || 'owner';
    const originChannel = this.cleanText(dto.originChannel || 'manual', 40) || 'manual';
    const branch = this.cleanKey(dto.branch, 'technical_support');
    const category = this.cleanKey(dto.category, branch === 'technical_support' ? 'technical_support' : 'support');
    const description = this.cleanText(dto.description || dto.message || dto.lastCustomerMessage || '', 8000);
    const lastCustomerMessage = this.cleanText(dto.lastCustomerMessage || dto.message || '', 4000);
    const title = this.buildTitle(dto, description);
    const evidenceText = [
      title,
      description,
      lastCustomerMessage,
      category,
      branch,
      dto.classification,
      dto.priority,
    ].join(' ');
    const sensitive = this.hasAnyTerm(evidenceText, SENSITIVE_TERMS);
    const classification = this.normalizeClassification(dto.classification, evidenceText, sensitive);
    const status = this.normalizeStatus(dto.status, evidenceText, sensitive, false);
    const priority = this.normalizePriority(dto.priority, evidenceText, sensitive);
    const company = await this.resolveCompany(dto);
    const conversationId = await this.resolveConversationId(dto, company?.id || null);

    if (!title || !description) {
      throw new BadRequestException('title e description/message são obrigatórios para criar ticket');
    }

    return {
      externalId: this.cleanOptional(dto.externalId, 180),
      companyId: company?.id || null,
      conversationId,
      source,
      origin,
      originChannel,
      branch,
      category,
      classification,
      status,
      priority,
      customerName: this.cleanOptional(dto.customerName, 140),
      customerPhone: this.cleanOptional(dto.customerPhone, 40),
      customerEmail: this.cleanOptional(dto.customerEmail, 180),
      title,
      description,
      lastCustomerMessage: lastCustomerMessage || null,
      metadataJson: this.stringifyMetadata(dto.metadata),
    };
  }

  private async resolveCompany(dto: CreateOwnerTicketDto) {
    const rawCompanyId = Number(dto.companyId || 0);
    if (Number.isFinite(rawCompanyId) && rawCompanyId > 0) {
      const company = await this.prisma.company.findUnique({ where: { id: rawCompanyId } });
      if (!company) throw new NotFoundException('companyId não encontrado');
      return company;
    }

    const slug = this.cleanOptional(dto.companySlug, 120);
    if (!slug) return null;

    const company = await this.prisma.company.findUnique({ where: { slug } });
    if (!company) throw new NotFoundException('companySlug não encontrado');
    return company;
  }

  private async resolveConversationId(dto: CreateOwnerTicketDto, companyId: number | null) {
    const conversationId = Number(dto.conversationId || 0);
    if (!Number.isFinite(conversationId) || conversationId <= 0) return null;

    const conversation = await this.prisma.companyConversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw new NotFoundException('conversationId não encontrado');
    if (companyId && conversation.companyId !== companyId) {
      throw new BadRequestException('conversationId não pertence à empresa informada');
    }
    return conversation.id;
  }

  private buildTitle(dto: CreateOwnerTicketDto, description: string) {
    const explicit = this.cleanText(dto.title || '', 180);
    if (explicit) return explicit;

    const fallback = description.split(/\r?\n/).find((line) => line.trim()) || description;
    const compact = fallback.replace(/\s+/g, ' ').trim();
    if (!compact) return '';
    return compact.length > 160 ? `${compact.slice(0, 157).trim()}...` : compact;
  }

  private normalizeClassification(value: unknown, text: string, sensitive: boolean) {
    const raw = this.cleanKey(value, '');
    if (raw) return raw.toUpperCase();
    if (sensitive) return 'BUG_BLOCKED';
    if (this.hasAnyTerm(text, ['bug', 'erro', 'falha', 'technical_support', 'suporte'])) return 'BUG_SAFE';
    return 'TRIAGE';
  }

  private normalizeStatus(value: unknown, text: string, sensitive: boolean, allowEmpty: boolean) {
    const raw = this.cleanKey(value, '');
    if (raw && OWNER_TICKET_STATUSES.has(raw)) return raw;
    if (allowEmpty) return '';
    if (sensitive) return 'triage';
    if (this.hasAnyTerm(text, ['technical_support', 'bug', 'p0', 'erro', 'falha'])) return 'waiting_codex';
    return 'new';
  }

  private normalizePriority(value: unknown, text: string, sensitive: boolean) {
    const raw = this.cleanText(String(value || ''), 20).toLowerCase();
    if (['crítica', 'critica', 'alta', 'média', 'media', 'baixa'].includes(raw)) {
      if (raw === 'critica') return 'Crítica';
      if (raw === 'media') return 'Média';
      return raw.charAt(0).toUpperCase() + raw.slice(1);
    }
    if (sensitive || this.hasAnyTerm(text, HIGH_PRIORITY_TERMS)) return 'Alta';
    return 'Média';
  }

  private normalizeDispatchStatus(value: unknown, dto: UpdateOwnerTicketDispatchDto) {
    const raw = this.cleanKey(value, '');
    if (raw && CODEX_DISPATCH_STATUSES.has(raw)) return raw;
    if (this.cleanOptional(dto.githubPrNumber, 40) || this.cleanOptional(dto.githubIssueUrl, 600)) return 'pr_open';
    if (this.cleanOptional(dto.codexRunId, 180) || this.cleanOptional(dto.codexRunUrl, 600)) return 'dispatched';
    if (this.cleanOptional(dto.githubBranch, 240)) return 'dispatched';
    return 'prompt_copied';
  }

  private deriveTicketStatusFromDispatch(dispatchStatus: string, requestedStatus: unknown, currentStatus: string) {
    const requested = this.normalizeStatus(requestedStatus, '', false, true);
    if (requested) return requested;
    if (dispatchStatus === 'done') return 'done';
    if (dispatchStatus === 'failed') return 'triage';
    if (['dispatched', 'running', 'pr_open'].includes(dispatchStatus)) return 'in_progress';
    if (dispatchStatus === 'prompt_copied') return 'waiting_codex';
    return currentStatus || 'waiting_codex';
  }

  private deriveJobStatusFromDispatch(dispatchStatus: string, ticketStatus: string) {
    if (dispatchStatus === 'done') return 'done';
    if (dispatchStatus === 'failed') return 'triage';
    if (['dispatched', 'running', 'pr_open'].includes(dispatchStatus)) return 'in_progress';
    if (OWNER_JOB_STATUSES.has(ticketStatus)) return ticketStatus;
    return 'waiting_codex';
  }

  private initialJobStatus(ticket: NormalizedTicketInput) {
    if (OWNER_JOB_STATUSES.has(ticket.status) && ticket.status !== 'new') return ticket.status;
    if (ticket.classification === 'BUG_BLOCKED') return 'triage';
    return ticket.branch === 'technical_support' ? 'waiting_codex' : 'new';
  }

  private presentTicket(row: any, options: { existing?: boolean; nested?: boolean } = {}) {
    const firstJob = Array.isArray(row.jobs) ? row.jobs[0] || null : null;
    const ticket = {
      id: row.id,
      ticketCode: row.ticketCode,
      externalId: row.externalId,
      companyId: row.companyId,
      conversationId: row.conversationId,
      source: row.source,
      origin: row.origin,
      originChannel: row.originChannel,
      branch: row.branch,
      category: row.category,
      classification: row.classification,
      status: row.status,
      priority: row.priority,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      customerEmail: row.customerEmail,
      title: row.title,
      description: row.description,
      lastCustomerMessage: row.lastCustomerMessage,
      codexDispatchStatus: row.codexDispatchStatus,
      codexRunId: row.codexRunId,
      codexRunUrl: row.codexRunUrl,
      githubIssueUrl: row.githubIssueUrl,
      githubPrNumber: row.githubPrNumber,
      githubBranch: row.githubBranch,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      jobs: Array.isArray(row.jobs)
        ? row.jobs.map((job) => ({
            id: job.id,
            type: job.type,
            status: job.status,
            branch: job.branch,
            title: job.title,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
          }))
        : [],
    };
    if (options.nested) return { ticket };
    return {
      ok: true,
      existing: Boolean(options.existing),
      ticket,
      job: firstJob
        ? {
            id: firstJob.id,
            type: firstJob.type,
            status: firstJob.status,
            branch: firstJob.branch,
            title: firstJob.title,
          }
        : null,
    };
  }

  private stringifyMetadata(metadata: unknown) {
    if (metadata === undefined || metadata === null || metadata === '') return null;
    try {
      return JSON.stringify(metadata).slice(0, 12000);
    } catch {
      return JSON.stringify({ value: String(metadata) }).slice(0, 12000);
    }
  }

  private cleanOptional(value: unknown, maxLength: number) {
    const clean = this.cleanText(String(value || ''), maxLength);
    return clean || null;
  }

  private cleanText(value: unknown, maxLength: number) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
  }

  private parsePositiveInt(value: unknown) {
    const parsed = Number(String(value || '').replace(/[^\d]+/g, ''));
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
  }

  private parseJsonObject(value: unknown) {
    if (!value) return null;
    try {
      const parsed = JSON.parse(String(value));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private cleanKey(value: unknown, fallback: string) {
    const clean = String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80);
    return clean || fallback;
  }

  private hasAnyTerm(text: string, terms: string[]) {
    const normalized = String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_');
    return terms.some((term) => normalized.includes(this.cleanKey(term, '')));
  }

  private isUniqueTicketCodeError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      Array.isArray(error.meta?.target) &&
      error.meta.target.includes('ticketCode')
    );
  }
}
