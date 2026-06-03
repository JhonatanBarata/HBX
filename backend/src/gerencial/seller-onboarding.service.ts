import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { basename, extname, join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { MailAttachment, MailService } from '../mail/mail.service';
import {
  renderSellerContractTemplate,
  SELLER_CONTRACT_VERSION,
} from './seller-contract-template';

type UploadFileLike = {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
};

type UpdateDraftInput = {
  legalName?: unknown;
  email?: unknown;
  phone?: unknown;
  cpf?: unknown;
  declaredAddress?: unknown;
  commissionPercent?: unknown;
  commissionRecurring?: unknown;
  commissionDueBusinessDays?: unknown;
  archiveEmail?: unknown;
  metadataJson?: unknown;
};

const DEFAULT_UPLOAD_DIR = join(process.cwd(), 'storage', 'seller-onboarding-temp');
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const ALLOWED_KINDS = new Set(['photo_id', 'curriculum', 'contract_pdf', 'other']);
const ALLOWED_CONTENT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']);
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png']);

function requireCompanyIdFromUser(user: any) {
  const companyId = Number(user?.companyId);
  if (!companyId) throw new ForbiddenException('Company context required');
  return companyId;
}

function normalizeText(value: unknown, max = 500) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function normalizePercent(value: unknown, fallback = 20) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(100, Math.max(0, numeric));
}

function normalizeDueDays(value: unknown, fallback = 3) {
  const numeric = Math.trunc(Number(value));
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(30, Math.max(0, numeric));
}

function sha256Buffer(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function sha256Text(text: string) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

@Injectable()
export class SellerOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async getOrCreateForUser(companyId: number, userId: number, createdByUserId?: number | null) {
    const { user, company } = await this.requireSellerInCompany(companyId, userId);
    const dueBusinessDays = normalizeDueDays(company.commissionDueBusinessDays, 3);
    const existing = await this.prisma.sellerOnboarding.findUnique({
      where: { companyId_userId: { companyId, userId } },
      include: { attachments: { orderBy: { createdAt: 'desc' } } },
    });
    if (existing) return existing;

    return this.prisma.sellerOnboarding.create({
      data: {
        companyId,
        userId,
        createdByUserId: Number(createdByUserId || 0) || null,
        status: 'draft',
        legalName: user.name || null,
        email: user.email || user.username || null,
        phone: user.phone || null,
        commissionPercent: normalizePercent(user.commissionPercent, 20),
        commissionRecurring: true,
        commissionDueBusinessDays: dueBusinessDays,
        contractVersion: SELLER_CONTRACT_VERSION,
        archiveEmail: this.resolveArchiveEmail(),
      },
      include: { attachments: true },
    });
  }

  async getForUser(requestUser: any, userId: number) {
    const companyId = requireCompanyIdFromUser(requestUser);
    const onboarding = await this.getOrCreateForUser(companyId, userId, Number(requestUser?.id || 0) || null);
    return this.serialize(onboarding);
  }

  async updateDraft(requestUser: any, userId: number, input: UpdateDraftInput) {
    const companyId = requireCompanyIdFromUser(requestUser);
    const onboarding = await this.getOrCreateForUser(companyId, userId, Number(requestUser?.id || 0) || null);
    const nextDueDays = normalizeDueDays(input.commissionDueBusinessDays, onboarding.commissionDueBusinessDays);
    const updated = await this.prisma.sellerOnboarding.update({
      where: { id: onboarding.id },
      data: {
        legalName: normalizeText(input.legalName, 160) ?? onboarding.legalName,
        email: normalizeText(input.email, 180) ?? onboarding.email,
        phone: normalizeText(input.phone, 60) ?? onboarding.phone,
        cpf: normalizeText(input.cpf, 20) ?? onboarding.cpf,
        declaredAddress: normalizeText(input.declaredAddress, 500) ?? onboarding.declaredAddress,
        commissionPercent: normalizePercent(input.commissionPercent, onboarding.commissionPercent),
        commissionRecurring: typeof input.commissionRecurring === 'boolean' ? input.commissionRecurring : onboarding.commissionRecurring,
        commissionDueBusinessDays: nextDueDays,
        archiveEmail: normalizeText(input.archiveEmail, 180) ?? onboarding.archiveEmail ?? this.resolveArchiveEmail(),
        metadataJson: typeof input.metadataJson === 'string' ? input.metadataJson.slice(0, 5000) : onboarding.metadataJson,
      },
      include: { attachments: { orderBy: { createdAt: 'desc' } } },
    });
    await this.refreshStatus(updated.id);
    return this.getForUser(requestUser, userId);
  }

  async uploadAttachment(requestUser: any, userId: number, kindInput: unknown, file?: UploadFileLike | null) {
    const companyId = requireCompanyIdFromUser(requestUser);
    const onboarding = await this.getOrCreateForUser(companyId, userId, Number(requestUser?.id || 0) || null);
    const kind = String(kindInput || '').trim();
    if (!ALLOWED_KINDS.has(kind)) throw new BadRequestException('Tipo de anexo inválido.');
    if (!file?.buffer?.length) throw new BadRequestException('Envie um arquivo.');
    const originalFilename = this.sanitizeFilename(file.originalname || 'documento');
    const extension = extname(originalFilename).toLowerCase();
    const contentType = String(file.mimetype || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension) || !ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new BadRequestException('Anexo inválido. Use PDF, JPG, JPEG ou PNG.');
    }
    const buffer = Buffer.from(file.buffer);
    if (buffer.length > MAX_ATTACHMENT_BYTES) throw new BadRequestException('Arquivo maior que 5MB.');

    const uploadDir = await this.ensureUploadDir();
    const storedFilename = `${onboarding.id}-${kind}-${Date.now()}${extension}`;
    const storagePath = join(uploadDir, storedFilename);
    await writeFile(storagePath, buffer);
    await this.prisma.sellerOnboardingAttachment.create({
      data: {
        onboardingId: onboarding.id,
        kind,
        originalFilename,
        storedFilename,
        storagePath,
        contentType,
        byteSize: buffer.length,
        sha256: sha256Buffer(buffer),
        status: 'temporary',
      },
    });
    await this.refreshStatus(onboarding.id);
    return this.getForUser(requestUser, userId);
  }

  async generateContract(requestUser: any, userId: number) {
    const companyId = requireCompanyIdFromUser(requestUser);
    const onboarding = await this.getOrCreateForUser(companyId, userId, Number(requestUser?.id || 0) || null);
    const contractText = this.buildContractText(onboarding);
    const updated = await this.prisma.sellerOnboarding.update({
      where: { id: onboarding.id },
      data: {
        contractVersion: SELLER_CONTRACT_VERSION,
        contractTextSnapshot: contractText,
        contractSha256: sha256Text(contractText),
      },
      include: { attachments: { orderBy: { createdAt: 'desc' } } },
    });
    await this.refreshStatus(updated.id);
    return this.getForUser(requestUser, userId);
  }

  async sendOnboardingEmail(requestUser: any, userId: number) {
    const companyId = requireCompanyIdFromUser(requestUser);
    let onboarding = await this.getOrCreateForUser(companyId, userId, Number(requestUser?.id || 0) || null);
    if (!onboarding.contractTextSnapshot) {
      await this.generateContract(requestUser, userId);
      onboarding = await this.getOrCreateForUser(companyId, userId, Number(requestUser?.id || 0) || null);
    }
    const fresh = await this.prisma.sellerOnboarding.findUnique({
      where: { id: onboarding.id },
      include: { attachments: true, user: true },
    });
    if (!fresh) throw new NotFoundException('Onboarding não encontrado.');
    this.assertReadyToSend(fresh);

    const recipient = fresh.email || fresh.user.email || fresh.user.username;
    if (!recipient) throw new BadRequestException('Parceiro sem e-mail para envio.');
    const contractAttachment = this.contractAttachment(fresh.contractTextSnapshot || this.buildContractText(fresh));
    const archiveAttachments = [contractAttachment, ...(await this.loadFileAttachments(fresh.attachments || []))];
    const sellerDelivery = await this.mailService.sendMail({
      to: recipient,
      subject: 'Contrato de parceria comercial HBX',
      text: [
        `Olá ${fresh.legalName || fresh.user.name || 'parceiro'},`,
        '',
        'Segue em anexo o contrato de parceria comercial autônoma HBX.',
        'Após este envio, seu acesso comercial poderá ser liberado para trabalhar no Gerencial/Vendas.',
        '',
        'Equipe HBX',
      ].join('\n'),
      attachments: [contractAttachment],
    });
    const archiveEmail = fresh.archiveEmail || this.resolveArchiveEmail();
    const archiveDelivery = await this.mailService.sendMail({
      to: archiveEmail,
      subject: `Arquivo onboarding parceiro HBX - ${fresh.legalName || fresh.email || fresh.userId}`,
      text: 'Arquivo operacional do onboarding documental do parceiro comercial. Anexos temporários serão removidos em 7 dias.',
      attachments: archiveAttachments,
    });

    const ok = Boolean(sellerDelivery.ok && archiveDelivery.ok);
    const deleteAfter = ok ? new Date(Date.now() + RETENTION_MS) : null;
    const updated = await this.prisma.sellerOnboarding.update({
      where: { id: fresh.id },
      data: {
        emailStatus: ok ? 'sent' : 'email_failed',
        emailMessageId: sellerDelivery.messageId || archiveDelivery.messageId || null,
        emailSentAt: ok ? new Date() : null,
        attachmentsDeleteAfter: deleteAfter,
        archiveEmail,
        status: ok ? 'sent' : 'email_failed',
      },
      include: { attachments: true },
    });
    if (ok) {
      await this.prisma.sellerOnboardingAttachment.updateMany({
        where: { onboardingId: fresh.id, status: { not: 'deleted' } },
        data: { deleteAfter, status: 'temporary' },
      });
      await this.prisma.user.update({
        where: { id: userId },
        data: { isActive: true, deactivatedAt: null, retentionUntil: null },
      });
    }
    return { ok, onboarding: this.serialize(updated), delivery: { seller: sellerDelivery, archive: archiveDelivery } };
  }

  async purgeExpiredAttachments() {
    const now = new Date();
    const attachments = await this.prisma.sellerOnboardingAttachment.findMany({
      where: {
        status: { not: 'deleted' },
        deleteAfter: { not: null, lte: now },
      },
    });
    let deleted = 0;
    for (const attachment of attachments) {
      if (attachment.storagePath && existsSync(attachment.storagePath)) {
        await rm(attachment.storagePath, { force: true }).catch(() => undefined);
      }
      await this.prisma.sellerOnboardingAttachment.update({
        where: { id: attachment.id },
        data: { status: 'deleted', deletedAt: new Date() },
      });
      deleted += 1;
    }
    const onboardings = await this.prisma.sellerOnboarding.findMany({
      where: {
        attachmentsDeletedAt: null,
        attachmentsDeleteAfter: { not: null, lte: now },
      },
      include: { attachments: true },
    });
    for (const onboarding of onboardings) {
      if (onboarding.attachments.every((attachment) => attachment.status === 'deleted')) {
        await this.prisma.sellerOnboarding.update({
          where: { id: onboarding.id },
          data: { attachmentsDeletedAt: new Date() },
        });
      }
    }
    return { ok: true, deleted };
  }

  private async requireSellerInCompany(companyId: number, userId: number) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId },
      include: { company: { select: { id: true, name: true, commissionDueBusinessDays: true } } },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado na empresa.');
    if (String(user.role || '').toUpperCase() !== 'USER') throw new BadRequestException('Onboarding documental é apenas para parceiro vendedor USER.');
    return { user, company: user.company };
  }

  private assertReadyToSend(onboarding: any) {
    if (!onboarding.contractTextSnapshot) throw new BadRequestException('Gere o contrato antes de enviar.');
    const activeAttachments = (onboarding.attachments || []).filter((attachment: any) => attachment.status !== 'deleted');
    const hasPhoto = activeAttachments.some((attachment: any) => attachment.kind === 'photo_id');
    const hasCurriculum = activeAttachments.some((attachment: any) => attachment.kind === 'curriculum');
    if (!hasPhoto || !hasCurriculum) {
      throw new BadRequestException('Anexe documento com foto e currículo antes de enviar.');
    }
  }

  private async refreshStatus(onboardingId: string) {
    const onboarding = await this.prisma.sellerOnboarding.findUnique({
      where: { id: onboardingId },
      include: { attachments: true },
    });
    if (!onboarding || onboarding.emailStatus === 'sent') return;
    const activeAttachments = onboarding.attachments.filter((attachment) => attachment.status !== 'deleted');
    const hasPhoto = activeAttachments.some((attachment) => attachment.kind === 'photo_id');
    const hasCurriculum = activeAttachments.some((attachment) => attachment.kind === 'curriculum');
    const status = !hasPhoto || !hasCurriculum
      ? 'documents_pending'
      : onboarding.contractTextSnapshot
        ? 'ready_to_send'
        : 'draft';
    await this.prisma.sellerOnboarding.update({ where: { id: onboarding.id }, data: { status } });
  }

  private buildContractText(onboarding: any) {
    return renderSellerContractTemplate({
      sellerName: onboarding.legalName || onboarding.email || 'Parceiro HBX',
      sellerCpf: onboarding.cpf || 'não informado',
      sellerEmail: onboarding.email || 'não informado',
      sellerPhone: onboarding.phone || 'não informado',
      sellerAddress: onboarding.declaredAddress || 'não informado',
      commissionPercent: Number(onboarding.commissionPercent || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 }),
      commissionDueBusinessDays: String(normalizeDueDays(onboarding.commissionDueBusinessDays, 3)),
      contractDate: new Date().toLocaleDateString('pt-BR'),
    });
  }

  private contractAttachment(contractText: string): MailAttachment {
    return {
      filename: 'contrato-parceria-comercial-hbx.txt',
      content: Buffer.from(contractText, 'utf8'),
      contentType: 'text/plain; charset=utf-8',
    };
  }

  private async loadFileAttachments(attachments: any[]): Promise<MailAttachment[]> {
    const output: MailAttachment[] = [];
    for (const attachment of attachments || []) {
      if (attachment.status === 'deleted') continue;
      if (!attachment.storagePath || !existsSync(attachment.storagePath)) continue;
      output.push({
        filename: attachment.originalFilename,
        content: await readFile(attachment.storagePath),
        contentType: attachment.contentType || null,
      });
    }
    return output;
  }

  private async ensureUploadDir() {
    const dir = process.env.SELLER_ONBOARDING_UPLOAD_DIR || DEFAULT_UPLOAD_DIR;
    await mkdir(dir, { recursive: true });
    return dir;
  }

  private sanitizeFilename(value: string) {
    const clean = basename(String(value || 'documento'))
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
    return clean.slice(0, 120) || 'documento';
  }

  private resolveArchiveEmail() {
    return String(process.env.SELLER_ONBOARDING_ARCHIVE_EMAIL || 'barataimports@gmail.com').trim();
  }

  private serialize(onboarding: any) {
    return {
      ...onboarding,
      cpf: onboarding?.cpf ? `***.***.***-${String(onboarding.cpf).slice(-2)}` : null,
      attachments: (onboarding?.attachments || []).map((attachment: any) => this.serializeAttachment(attachment)),
    };
  }

  private serializeAttachment(attachment: any) {
    return {
      id: attachment.id,
      kind: attachment.kind,
      originalFilename: attachment.originalFilename,
      contentType: attachment.contentType,
      byteSize: attachment.byteSize,
      status: attachment.status,
      deleteAfter: attachment.deleteAfter,
      deletedAt: attachment.deletedAt,
      createdAt: attachment.createdAt,
    };
  }
}
