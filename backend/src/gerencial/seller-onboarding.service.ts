import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import { isMasterOperationalCompanySlug } from '../commercial-plans/seat-billing.util';
import { MailService, type MailAttachment } from '../mail/mail.service';
import { EmailTemplateService } from '../mail/email-template.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildSellerPartnerContract, SELLER_CONTRACT_VERSION } from './seller-contract-template';

type UpdateDraftInput = {
  partnerType?: unknown;
  legalName?: unknown;
  email?: unknown;
  phone?: unknown;
  cpf?: unknown;
  declaredAddress?: unknown;
  commissionPercent?: unknown;
  commissionRecurring?: unknown;
  commissionDueBusinessDays?: unknown;
  canRegisterHbxSellers?: unknown;
  sellerReferralCommissionPercent?: unknown;
  referredByUserId?: unknown;
  referredByCommissionPercentSnapshot?: unknown;
  archiveEmail?: unknown;
  metadataJson?: unknown;
};

const ONBOARDING_DOCUMENT_SLOTS = [
  { kind: 'photo_id', label: 'Documento com foto', defaultRequired: true },
  { kind: 'curriculum', label: 'Currículo', defaultRequired: false },
  { kind: 'contract_pdf', label: 'Contrato assinado', defaultRequired: true },
  { kind: 'other', label: 'Outro documento', defaultRequired: false },
] as const;

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
  return Math.min(30, Math.max(1, numeric));
}

function sha256Text(text: string) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function parseMetadataJson(raw?: string | null): Record<string, any> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function stringifyMetadataJson(metadata: Record<string, any>) {
  return JSON.stringify(metadata).slice(0, 5000);
}

function partnerTypeFor(user: any) {
  if (Number(user?.referredByUserId || 0) > 0) return 'hbx_heir';
  return 'hbx_partner';
}

@Injectable()
export class SellerOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly emailTemplates: EmailTemplateService,
  ) {}

  async getOrCreateForUser(companyId: number, userId: number, createdByUserId?: number | null) {
    await this.assertHbxSellerNetworkCompany(companyId);
    const { user, company } = await this.requirePartnerUserInCompany(companyId, userId);
    const existing = await this.prisma.sellerOnboarding.findUnique({
      where: { companyId_userId: { companyId, userId } },
      include: { attachments: { orderBy: { createdAt: 'desc' } } },
    });
    if (existing) return existing;

    const referredByNameSnapshot = await this.resolveReferredByNameSnapshot(companyId, user.referredByUserId);
    return this.prisma.sellerOnboarding.create({
      data: {
        companyId,
        userId,
        createdByUserId: Number(createdByUserId || 0) || null,
        status: 'draft',
        partnerType: partnerTypeFor(user),
        legalName: user.name || null,
        email: user.email || user.username || null,
        phone: user.phone || null,
        commissionPercent: normalizePercent(user.commissionPercent, 20),
        commissionRecurring: true,
        commissionDueBusinessDays: normalizeDueDays(company.commissionDueBusinessDays, 3),
        canRegisterHbxSellers: Boolean(user.canRegisterHbxSellers),
        sellerReferralCommissionPercent: normalizePercent(user.sellerReferralCommissionPercent, 0),
        referredByUserId: user.referredByUserId || null,
        referredByNameSnapshot,
        referredByCommissionPercentSnapshot: normalizePercent(user.referredByCommissionPercentSnapshot, 0),
        contractVersion: SELLER_CONTRACT_VERSION,
      },
      include: { attachments: { orderBy: { createdAt: 'desc' } } },
    });
  }

  async updateDraft(companyId: number, userId: number, dto: UpdateDraftInput) {
    await this.assertHbxSellerNetworkCompany(companyId);
    const onboarding = await this.getOrCreateForUser(companyId, userId, null);
    const referrerId = Number(dto.referredByUserId ?? onboarding.referredByUserId ?? 0) || null;
    const referredByNameSnapshot = referrerId
      ? await this.resolveReferredByNameSnapshot(companyId, referrerId)
      : null;
    const partnerType = normalizeText(dto.partnerType, 40)
      || (referrerId ? 'hbx_heir' : 'hbx_partner');

    return this.prisma.sellerOnboarding.update({
      where: { id: onboarding.id },
      data: {
        partnerType,
        legalName: normalizeText(dto.legalName, 160) ?? onboarding.legalName,
        email: normalizeText(dto.email, 180) ?? onboarding.email,
        phone: normalizeText(dto.phone, 60) ?? onboarding.phone,
        cpf: normalizeText(dto.cpf, 20) ?? onboarding.cpf,
        declaredAddress: normalizeText(dto.declaredAddress, 500) ?? onboarding.declaredAddress,
        commissionPercent: normalizePercent(dto.commissionPercent, onboarding.commissionPercent),
        commissionRecurring: typeof dto.commissionRecurring === 'boolean' ? dto.commissionRecurring : onboarding.commissionRecurring,
        commissionDueBusinessDays: normalizeDueDays(dto.commissionDueBusinessDays, onboarding.commissionDueBusinessDays),
        canRegisterHbxSellers: false,
        sellerReferralCommissionPercent: normalizePercent(dto.sellerReferralCommissionPercent, onboarding.sellerReferralCommissionPercent),
        referredByUserId: referrerId,
        referredByNameSnapshot,
        referredByCommissionPercentSnapshot: normalizePercent(dto.referredByCommissionPercentSnapshot, onboarding.referredByCommissionPercentSnapshot),
        archiveEmail: normalizeText(dto.archiveEmail, 180) ?? onboarding.archiveEmail,
        metadataJson: typeof dto.metadataJson === 'string' ? dto.metadataJson.slice(0, 5000) : onboarding.metadataJson,
      },
      include: { attachments: { orderBy: { createdAt: 'desc' } } },
    });
  }

  async generateContract(companyId: number, userId: number, createdByUserId?: number | null) {
    const onboarding = await this.getOrCreateForUser(companyId, userId, createdByUserId);
    const contractText = buildSellerPartnerContract({
      sellerName: onboarding.legalName || onboarding.email || 'Parceiro HBX',
      sellerCpf: onboarding.cpf || null,
      sellerEmail: onboarding.email || null,
      sellerPhone: onboarding.phone || null,
      sellerAddress: onboarding.declaredAddress || null,
      commissionPercent: onboarding.commissionPercent,
      commissionDueBusinessDays: onboarding.commissionDueBusinessDays,
      contractDate: new Date().toLocaleDateString('pt-BR'),
      canRegisterHbxSellers: onboarding.canRegisterHbxSellers,
      sellerReferralCommissionPercent: onboarding.sellerReferralCommissionPercent,
      referredByName: onboarding.referredByNameSnapshot,
    });

    const updated = await this.prisma.sellerOnboarding.update({
      where: { id: onboarding.id },
      data: {
        status: 'ready_to_send',
        contractVersion: SELLER_CONTRACT_VERSION,
        contractTextSnapshot: contractText,
        contractSha256: sha256Text(contractText),
      },
      include: { attachments: { orderBy: { createdAt: 'desc' } } },
    });
    return {
      ok: true,
      onboarding: updated,
      attachments: updated.attachments || [],
      readiness: this.buildReadiness(updated),
    };
  }

  async listAttachments(companyId: number, userId: number) {
    const onboarding = await this.getOrCreateForUser(companyId, userId, null);
    return {
      onboardingId: onboarding.id,
      attachments: onboarding.attachments || [],
      readiness: this.buildReadiness(onboarding),
    };
  }

  async updateDocumentRequirement(companyId: number, userId: number, kindValue: unknown, requiredValue: unknown) {
    const onboarding = await this.getOrCreateForUser(companyId, userId, null);
    const kind = this.normalizeAttachmentKind(kindValue);
    const metadata = parseMetadataJson(onboarding.metadataJson);
    const existingRequirements =
      metadata.documentRequirements && typeof metadata.documentRequirements === 'object'
        ? metadata.documentRequirements
        : {};
    const documentRequirements = {
      ...existingRequirements,
      [kind]: this.normalizeBoolean(requiredValue),
    };
    const updated = await this.prisma.sellerOnboarding.update({
      where: { id: onboarding.id },
      data: {
        metadataJson: stringifyMetadataJson({
          ...metadata,
          documentRequirements,
        }),
      },
      include: { attachments: { orderBy: { createdAt: 'desc' } } },
    });
    return {
      ok: true,
      onboarding: updated,
      readiness: this.buildReadiness(updated),
    };
  }

  async uploadAttachment(companyId: number, userId: number, file: any, dto: { kind?: unknown; required?: unknown }) {
    const onboarding = await this.getOrCreateForUser(companyId, userId, null);
    if (!file?.buffer?.length) throw new BadRequestException('Envie um arquivo.');
    const kind = this.normalizeAttachmentKind(dto.kind);
    const originalFilename = normalizeText(file.originalname, 180) || `${kind}${extname(String(file.originalname || '')) || '.pdf'}`;
    const extension = extname(originalFilename).toLowerCase();
    if (!['.pdf', '.jpg', '.jpeg', '.png'].includes(extension)) {
      throw new BadRequestException('Anexo precisa ser PDF, JPG ou PNG.');
    }
    if (Number(file.size || file.buffer.length || 0) > 5 * 1024 * 1024) {
      throw new BadRequestException('Anexo deve ter no máximo 5MB.');
    }

    const uploadDir = process.env.SELLER_ONBOARDING_UPLOAD_DIR || join(process.cwd(), 'storage', 'seller-onboarding-temp');
    await mkdir(uploadDir, { recursive: true });
    const storedFilename = `${onboarding.id}-${kind}-${randomUUID()}${extension}`;
    const storagePath = join(uploadDir, storedFilename);
    const buffer = Buffer.from(file.buffer);
    await writeFile(storagePath, buffer);

    const attachment = await this.prisma.sellerOnboardingAttachment.create({
      data: {
        onboardingId: onboarding.id,
        kind,
        originalFilename,
        storedFilename,
        storagePath,
        contentType: normalizeText(file.mimetype, 120),
        byteSize: buffer.length,
        sha256: createHash('sha256').update(buffer).digest('hex'),
        required: this.normalizeBoolean(dto.required),
        status: 'temporary',
      },
    });
    const updated = await this.prisma.sellerOnboarding.findUnique({
      where: { id: onboarding.id },
      include: { attachments: { orderBy: { createdAt: 'desc' } } },
    });
    return { ok: true, attachment, readiness: this.buildReadiness(updated || onboarding) };
  }

  async deleteAttachment(companyId: number, userId: number, attachmentId: string) {
    const onboarding = await this.getOrCreateForUser(companyId, userId, null);
    const attachment = await this.prisma.sellerOnboardingAttachment.findFirst({
      where: {
        id: String(attachmentId || ''),
        onboardingId: onboarding.id,
        status: { not: 'deleted' },
      },
    });
    if (!attachment) throw new NotFoundException('Anexo não encontrado.');
    try {
      if (attachment.storagePath) await unlink(attachment.storagePath);
    } catch {}
    await this.prisma.sellerOnboardingAttachment.update({
      where: { id: attachment.id },
      data: { status: 'deleted', deletedAt: new Date() },
    });
    const updated = await this.prisma.sellerOnboarding.findUnique({
      where: { id: onboarding.id },
      include: { attachments: { orderBy: { createdAt: 'desc' } } },
    });
    return {
      ok: true,
      readiness: this.buildReadiness(updated || onboarding),
      attachments: updated?.attachments || [],
    };
  }

  async sendOnboardingEmail(companyId: number, userId: number, createdByUserId?: number | null) {
    let onboarding = await this.getOrCreateForUser(companyId, userId, createdByUserId);
    if (!onboarding.email) throw new BadRequestException('Informe o e-mail do parceiro antes de enviar.');
    if (!onboarding.contractTextSnapshot) {
      const generated = await this.generateContract(companyId, userId, createdByUserId);
      onboarding = generated.onboarding;
    }

    const activeAttachments = (onboarding.attachments || []).filter((item: any) => item.status !== 'deleted');
    const readiness = this.buildReadiness(onboarding);
    const receivedLabels = readiness.receivedDocuments.map((item) => item.label);
    const missingLabels = readiness.missingRequiredDocuments.map((item) => item.label);

    const attachments: MailAttachment[] = [];
    for (const attachment of activeAttachments as any[]) {
      attachments.push({
        filename: attachment.originalFilename,
        content: await readFile(attachment.storagePath),
        contentType: attachment.contentType || undefined,
      });
    }

    const template = await this.emailTemplates.getTemplateSafe('seller_onboarding_request');
    const rendered = this.emailTemplates.renderTemplate(template, {
      nome: onboarding.legalName || onboarding.email,
      email: onboarding.email,
      vendedor: onboarding.legalName || onboarding.email,
      sellerName: onboarding.legalName || onboarding.email,
      sellerCpf: onboarding.cpf || '-',
      sellerEmail: onboarding.email || '-',
      sellerPhone: onboarding.phone || '-',
      sellerAddress: onboarding.declaredAddress || '-',
      commissionPercent: onboarding.commissionPercent,
      commissionDueBusinessDays: onboarding.commissionDueBusinessDays,
      contractDate: new Date().toLocaleDateString('pt-BR'),
      documentosConfirmados: receivedLabels.length ? `Documentos confirmados:\n${receivedLabels.join(', ')}` : '',
      documentosRecebidos: receivedLabels.length ? receivedLabels.join(', ') : '',
      documentosPendentes: missingLabels.length ? missingLabels.join(', ') : 'nenhuma pendência obrigatória',
      documentosFaltantes: missingLabels.length ? missingLabels.join(', ') : 'nenhuma pendência obrigatória',
      contrato: onboarding.contractTextSnapshot || '',
    });
    const result = await this.mailService.sendMail({
      to: onboarding.email,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      attachments,
    });

    const updated = await this.prisma.sellerOnboarding.update({
      where: { id: onboarding.id },
      data: {
        emailStatus: result.ok ? 'sent' : 'email_failed',
        emailMessageId: result.messageId,
        emailSentAt: result.ok ? new Date() : null,
        status: result.ok ? (readiness.complete ? 'ready_to_activate' : 'waiting_documents') : onboarding.status,
        attachmentsDeleteAfter: null,
      },
      include: { attachments: { orderBy: { createdAt: 'desc' } } },
    });
    return { ok: result.ok, delivery: result, onboarding: updated, readiness: this.buildReadiness(updated) };
  }

  async assertCanActivatePartner(companyId: number, userId: number) {
    const onboarding = await this.getOrCreateForUser(companyId, userId, null);
    const readiness = this.buildReadiness(onboarding);
    if (!readiness.complete) {
      const missing = readiness.missingRequiredDocuments.map((item) => item.label).join(', ');
      throw new BadRequestException(`Parceiro ainda não pode ser liberado. Pendências obrigatórias: ${missing || 'documentação'}.`);
    }
    await this.prisma.sellerOnboarding.update({
      where: { id: onboarding.id },
      data: { status: 'approved' },
    });
    return readiness;
  }

  async purgeExpiredAttachments(companyId?: number | null) {
    const now = new Date();
    const attachments = await this.prisma.sellerOnboardingAttachment.findMany({
      where: {
        status: { not: 'deleted' },
        deleteAfter: { lte: now },
        onboarding: companyId ? { companyId: Number(companyId) } : undefined,
      },
    });
    for (const attachment of attachments as any[]) {
      try {
        if (attachment.storagePath) await unlink(attachment.storagePath);
      } catch {}
      await this.prisma.sellerOnboardingAttachment.update({
        where: { id: attachment.id },
        data: { status: 'deleted', deletedAt: now },
      });
    }
    return { ok: true, deletedCount: attachments.length };
  }

  private async assertHbxSellerNetworkCompany(companyId: number) {
    const company = await this.prisma.company.findUnique({
      where: { id: Number(companyId) },
      select: { slug: true },
    });
    if (!company || !isMasterOperationalCompanySlug(company.slug)) {
      throw new BadRequestException('Onboarding de parceiro HBX só existe na operação HBX.');
    }
  }

  private async requirePartnerUserInCompany(companyId: number, userId: number) {
    const user = await this.prisma.user.findFirst({
      where: { id: Number(userId), companyId: Number(companyId) },
      include: { company: { select: { id: true, commissionDueBusinessDays: true } } },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado na empresa.');
    if (String(user.role || '').toUpperCase() !== 'USER') {
      throw new BadRequestException('Onboarding de parceiro HBX é apenas para USER da operação HBX.');
    }
    return { user, company: user.company };
  }

  private async resolveReferredByNameSnapshot(companyId: number, referredByUserId?: number | null) {
    const referrerId = Number(referredByUserId || 0);
    if (!referrerId) return null;
    const referrer = await this.prisma.user.findFirst({
      where: { id: referrerId, companyId: Number(companyId) },
      select: { name: true, email: true, username: true },
    });
    return referrer?.name || referrer?.email || referrer?.username || null;
  }

  private normalizeAttachmentKind(value: unknown) {
    const kind = String(value || '').trim().toLowerCase();
    if (['photo_id', 'curriculum', 'contract_pdf', 'other'].includes(kind)) return kind;
    return 'other';
  }

  private normalizeBoolean(value: unknown) {
    if (typeof value === 'boolean') return value;
    return ['true', '1', 'yes', 'sim'].includes(String(value || '').trim().toLowerCase());
  }

  private isDocumentRequired(onboarding: any, kind: string) {
    const slot = ONBOARDING_DOCUMENT_SLOTS.find((item) => item.kind === kind);
    const metadata = parseMetadataJson(onboarding?.metadataJson);
    const override = metadata?.documentRequirements?.[kind];
    if (typeof override === 'boolean') return override;
    return Boolean(slot?.defaultRequired);
  }

  private buildReadiness(onboarding: any) {
    const activeAttachments = (onboarding?.attachments || []).filter((item: any) => item.status !== 'deleted');
    const receivedKinds = new Set(activeAttachments.map((item: any) => String(item.kind || '').toLowerCase()));
    const documents = ONBOARDING_DOCUMENT_SLOTS.map((slot) => ({
      kind: slot.kind,
      label: slot.label,
      required: this.isDocumentRequired(onboarding, slot.kind),
      present: receivedKinds.has(slot.kind),
    }));
    const missingRequiredDocuments = documents.filter((item) => item.required && !item.present);
    return {
      complete: missingRequiredDocuments.length === 0,
      documents,
      receivedDocuments: documents.filter((item) => item.present),
      missingRequiredDocuments,
    };
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
