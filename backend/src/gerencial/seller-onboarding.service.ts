import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import PDFDocument from 'pdfkit';
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
  { kind: 'contract_pdf', label: 'Contrato assinado', defaultRequired: false },
  { kind: 'other', label: 'Outro documento', defaultRequired: false },
] as const;

const GENERATED_CONTRACT_KIND = 'generated_contract';
const CONTRACT_SIGNATURE_INSTRUCTION = 'Assine pelo gov.br ou por assinatura digital de sua preferência.';
const ONBOARDING_ATTACHMENT_RETENTION_DAYS = 7;

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

function sha256Buffer(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function sellerOnboardingUploadDir() {
  return process.env.SELLER_ONBOARDING_UPLOAD_DIR || join(process.cwd(), 'storage', 'seller-onboarding-temp');
}

function isContractSectionTitle(line: string) {
  return /^(CONTRATANTE|PARCEIRO COMERCIAL):$/i.test(line) || /^\d+\.\s+/.test(line);
}

function addContractParagraph(doc: PDFKit.PDFDocument, line: string) {
  if (isContractSectionTitle(line)) {
    doc.moveDown(0.65);
    doc.font('Helvetica-Bold').fontSize(11.5).fillColor('#064e3b').text(line, { align: 'left' });
    doc.moveDown(0.25);
    return;
  }

  const fieldMatch = line.match(/^([^:]{2,44}):\s*(.*)$/);
  if (fieldMatch) {
    doc.font('Helvetica-Bold').fontSize(10.6).fillColor('#111827').text(`${fieldMatch[1]}: `, { continued: true });
    doc.font('Helvetica').fontSize(10.6).fillColor('#1f2937').text(fieldMatch[2] || '-', { align: 'left' });
    doc.moveDown(0.24);
    return;
  }

  doc.font('Helvetica').fontSize(10.6).fillColor('#1f2937').text(line, {
    align: 'justify',
    lineGap: 2,
  });
  doc.moveDown(0.36);
}

async function buildContractPdfBuffer(contractText: string) {
  const lines = contractText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const title = lines[0] || 'CONTRATO DE PARCERIA COMERCIAL AUTÔNOMA E INDICAÇÃO COMISSIONADA';
  const signatureStart = lines.lastIndexOf('HBX SYSTEM');
  const contentLines = signatureStart > 0 ? lines.slice(1, signatureStart) : lines.slice(1);
  const partnerSignature = signatureStart >= 0 ? lines[signatureStart + 1] || 'Parceiro HBX' : 'Parceiro HBX';

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 56, right: 64, bottom: 56, left: 64 },
      bufferPages: true,
      info: {
        Title: title,
        Author: 'HBX SYSTEM',
        Subject: 'Contrato de parceria comercial',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    doc.font('Helvetica-Bold').fontSize(15).fillColor('#0f172a').text(title, {
      align: 'center',
      lineGap: 2,
    });
    doc.moveDown(0.55);
    doc.strokeColor('#0f766e').lineWidth(1).moveTo(64, doc.y).lineTo(doc.page.width - 64, doc.y).stroke();
    doc.moveDown(1.05);

    for (const line of contentLines) {
      addContractParagraph(doc, line);
    }

    if (doc.y > doc.page.height - 170) doc.addPage();
    doc.moveDown(2.1);
    const startY = doc.y;
    const gap = 34;
    const columnWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right - gap) / 2;
    const leftX = doc.page.margins.left;
    const rightX = leftX + columnWidth + gap;
    doc.strokeColor('#111827').lineWidth(0.8);
    doc.moveTo(leftX, startY).lineTo(leftX + columnWidth, startY).stroke();
    doc.moveTo(rightX, startY).lineTo(rightX + columnWidth, startY).stroke();
    doc.font('Helvetica-Bold').fontSize(10.4).fillColor('#111827');
    doc.text('HBX SYSTEM', leftX, startY + 8, { width: columnWidth, align: 'center' });
    doc.text(partnerSignature, rightX, startY + 8, { width: columnWidth, align: 'center' });
    doc.font('Helvetica').fontSize(9.4).fillColor('#4b5563');
    doc.text('Contratante', leftX, startY + 23, { width: columnWidth, align: 'center' });
    doc.text('Parceiro Comercial', rightX, startY + 23, { width: columnWidth, align: 'center' });

    doc.end();
  });
}

function friendlyMailDeliveryError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  const normalized = message.toLowerCase();
  if (normalized.includes('application-specific password required') || normalized.includes('invalidsecondfactor')) {
    return 'Falha ao enviar e-mail: o Gmail exige uma senha de app no SMTP. Atualize SMTP_PASS com uma senha de app do Google.';
  }
  if (normalized.includes('invalid login') || normalized.includes('authentication')) {
    return 'Falha ao enviar e-mail: login SMTP inválido. Verifique SMTP_USER e SMTP_PASS.';
  }
  if (normalized.includes('configuration incomplete') || normalized.includes('not configured')) {
    return 'Falha ao enviar e-mail: provedor transacional não configurado. Verifique SMTP/Resend.';
  }
  return 'Falha ao enviar e-mail. Verifique a configuração SMTP/Resend e tente novamente.';
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

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
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

  private contractDownloadPath(userId: number, attachmentId: string) {
    return `/gerencial/hbx-partners/${Number(userId)}/onboarding/attachments/${attachmentId}/download`;
  }

  private async upsertGeneratedPartnerContract(userId: number, attachmentId: string) {
    const partnerId = Number(userId);
    const contractPdfUrl = this.contractDownloadPath(partnerId, attachmentId);
    return this.prisma.partnerContract.upsert({
      where: { partnerId },
      create: {
        partnerId,
        contractPdfUrl,
        signedPdfUrl: null,
        status: 'generated',
        sentAt: null,
        uploadedAt: null,
        approvedAt: null,
        approvedBy: null,
      },
      update: {
        contractPdfUrl,
        signedPdfUrl: null,
        status: 'generated',
        sentAt: null,
        uploadedAt: null,
        approvedAt: null,
        approvedBy: null,
      },
    });
  }

  private async ensurePartnerContractForGeneratedAttachment(userId: number, attachment: any, onboarding: any) {
    if (!attachment?.id) return null;
    const partnerId = Number(userId);
    const contractPdfUrl = this.contractDownloadPath(partnerId, attachment.id);
    const existing = await this.prisma.partnerContract.findUnique({ where: { partnerId } });
    if (existing) {
      if (existing.contractPdfUrl !== contractPdfUrl) {
        return this.prisma.partnerContract.update({
          where: { partnerId },
          data: { contractPdfUrl },
        });
      }
      return existing;
    }
    const sentAt = onboarding?.emailSentAt || null;
    return this.prisma.partnerContract.create({
      data: {
        partnerId,
        contractPdfUrl,
        status: sentAt ? 'sent' : 'generated',
        sentAt,
      },
    });
  }

  private async markPartnerContractSent(userId: number, sentAt: Date) {
    const partnerId = Number(userId);
    const existing = await this.prisma.partnerContract.findUnique({ where: { partnerId } });
    if (!existing) {
      return this.prisma.partnerContract.create({
        data: { partnerId, status: 'sent', sentAt },
      });
    }
    if (existing.status === 'uploaded' || existing.status === 'approved') {
      return this.prisma.partnerContract.update({
        where: { partnerId },
        data: { sentAt },
      });
    }
    return this.prisma.partnerContract.update({
      where: { partnerId },
      data: { status: 'sent', sentAt },
    });
  }

  private async markPartnerContractUploaded(userId: number, attachmentId: string) {
    const partnerId = Number(userId);
    const signedPdfUrl = this.contractDownloadPath(partnerId, attachmentId);
    return this.prisma.partnerContract.upsert({
      where: { partnerId },
      create: {
        partnerId,
        signedPdfUrl,
        status: 'uploaded',
        uploadedAt: new Date(),
      },
      update: {
        signedPdfUrl,
        status: 'uploaded',
        uploadedAt: new Date(),
        approvedAt: null,
        approvedBy: null,
      },
    });
  }

  private async markPartnerContractSignedRemoved(userId: number) {
    const partnerId = Number(userId);
    const existing = await this.prisma.partnerContract.findUnique({ where: { partnerId } });
    if (!existing) return null;
    return this.prisma.partnerContract.update({
      where: { partnerId },
      data: {
        signedPdfUrl: null,
        uploadedAt: null,
        approvedAt: null,
        approvedBy: null,
        status: existing.sentAt ? 'sent' : 'generated',
      },
    });
  }

  private async markPartnerContractApproved(userId: number, approvedByUserId?: number | null) {
    const partnerId = Number(userId);
    const approvedBy = Number(approvedByUserId || 0) || null;
    return this.prisma.partnerContract.upsert({
      where: { partnerId },
      create: {
        partnerId,
        status: 'approved',
        approvedAt: new Date(),
        approvedBy,
      },
      update: {
        status: 'approved',
        approvedAt: new Date(),
        approvedBy,
      },
    });
  }

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
    const buffer = await buildContractPdfBuffer(contractText);
    const uploadDir = sellerOnboardingUploadDir();
    await mkdir(uploadDir, { recursive: true });

    const previousGenerated = (onboarding.attachments || []).filter((attachment: any) => {
      return attachment.status !== 'deleted' && attachment.kind === GENERATED_CONTRACT_KIND;
    });
    for (const attachment of previousGenerated as any[]) {
      try {
        if (attachment.storagePath) await unlink(attachment.storagePath);
      } catch {}
      await this.prisma.sellerOnboardingAttachment.update({
        where: { id: attachment.id },
        data: { status: 'deleted', deletedAt: new Date() },
      });
    }

    const storedFilename = `${onboarding.id}-${GENERATED_CONTRACT_KIND}-${randomUUID()}.pdf`;
    const storagePath = join(uploadDir, storedFilename);
    await writeFile(storagePath, buffer);

    const updated = await this.prisma.sellerOnboarding.update({
      where: { id: onboarding.id },
      data: {
        status: 'ready_to_send',
        contractVersion: SELLER_CONTRACT_VERSION,
        contractTextSnapshot: contractText,
        contractSha256: sha256Text(contractText),
      },
    });
    const attachment = await this.prisma.sellerOnboardingAttachment.create({
      data: {
        onboardingId: onboarding.id,
        kind: GENERATED_CONTRACT_KIND,
        originalFilename: 'contrato-parceria-hbx.pdf',
        storedFilename,
        storagePath,
        contentType: 'application/pdf',
        byteSize: buffer.length,
        sha256: sha256Buffer(buffer),
        required: false,
        status: 'temporary',
      },
    });
    await this.upsertGeneratedPartnerContract(userId, attachment.id);
    const refreshed = await this.prisma.sellerOnboarding.findUnique({
      where: { id: updated.id },
      include: { attachments: { orderBy: { createdAt: 'desc' } } },
    });
    if (!refreshed) throw new NotFoundException('Cadastro do parceiro não encontrado após gerar contrato.');
    return {
      ok: true,
      onboarding: refreshed,
      attachment,
      attachments: refreshed.attachments || [],
      readiness: this.buildReadiness(refreshed),
    };
  }

  async listAttachments(companyId: number, userId: number) {
    let onboarding = await this.getOrCreateForUser(companyId, userId, null);
    const activeGeneratedContracts = (onboarding.attachments || []).filter((attachment: any) => {
      return attachment.status !== 'deleted' && attachment.kind === GENERATED_CONTRACT_KIND;
    });
    const outdatedGeneratedContracts = activeGeneratedContracts.filter((attachment: any) => {
      return attachment.contentType !== 'application/pdf' || !String(attachment.originalFilename || '').toLowerCase().endsWith('.pdf');
    });
    for (const attachment of outdatedGeneratedContracts as any[]) {
      try {
        if (attachment.storagePath) await unlink(attachment.storagePath);
      } catch {}
      await this.prisma.sellerOnboardingAttachment.update({
        where: { id: attachment.id },
        data: { status: 'deleted', deletedAt: new Date() },
      });
    }
    if (outdatedGeneratedContracts.length) {
      const refreshed = await this.prisma.sellerOnboarding.findUnique({
        where: { id: onboarding.id },
        include: { attachments: { orderBy: { createdAt: 'desc' } } },
      });
      if (refreshed) onboarding = refreshed;
    }
    const hasGeneratedContract = (onboarding.attachments || []).some((attachment: any) => {
      return attachment.status !== 'deleted' && attachment.kind === GENERATED_CONTRACT_KIND && attachment.contentType === 'application/pdf';
    });
    if (onboarding.contractTextSnapshot && !hasGeneratedContract) {
      const buffer = await buildContractPdfBuffer(onboarding.contractTextSnapshot);
      const uploadDir = sellerOnboardingUploadDir();
      await mkdir(uploadDir, { recursive: true });
      const storedFilename = `${onboarding.id}-${GENERATED_CONTRACT_KIND}-${randomUUID()}.pdf`;
      const storagePath = join(uploadDir, storedFilename);
      await writeFile(storagePath, buffer);
      const attachment = await this.prisma.sellerOnboardingAttachment.create({
        data: {
          onboardingId: onboarding.id,
          kind: GENERATED_CONTRACT_KIND,
          originalFilename: 'contrato-parceria-hbx.pdf',
          storedFilename,
          storagePath,
          contentType: 'application/pdf',
          byteSize: buffer.length,
          sha256: sha256Buffer(buffer),
          required: false,
          status: 'temporary',
        },
      });
      await this.ensurePartnerContractForGeneratedAttachment(userId, attachment, onboarding);
      const refreshed = await this.prisma.sellerOnboarding.findUnique({
        where: { id: onboarding.id },
        include: { attachments: { orderBy: { createdAt: 'desc' } } },
      });
      if (refreshed) onboarding = refreshed;
    }
    const generatedContract = (onboarding.attachments || []).find((attachment: any) => {
      return attachment.status !== 'deleted' && attachment.kind === GENERATED_CONTRACT_KIND;
    });
    if (generatedContract) {
      await this.ensurePartnerContractForGeneratedAttachment(userId, generatedContract, onboarding);
    }
    return {
      onboardingId: onboarding.id,
      attachments: onboarding.attachments || [],
      readiness: this.buildReadiness(onboarding),
    };
  }

  async updateDocumentRequirement(companyId: number, userId: number, kindValue: unknown, requiredValue: unknown) {
    const onboarding = await this.getOrCreateForUser(companyId, userId, null);
    const kind = this.normalizeAttachmentKind(kindValue);
    if (kind === 'contract_pdf' && !this.normalizeBoolean(requiredValue)) {
      throw new BadRequestException('Contrato assinado é obrigatório para aprovar o parceiro.');
    }
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
    if (kind === 'contract_pdf' && extension !== '.pdf') {
      throw new BadRequestException('Contrato assinado precisa ser PDF.');
    }
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
    if (kind === 'contract_pdf') {
      await this.markPartnerContractUploaded(userId, attachment.id);
    }
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
    const removedKind = attachment.kind;
    try {
      if (attachment.storagePath) await unlink(attachment.storagePath);
    } catch {}
    await this.prisma.sellerOnboardingAttachment.update({
      where: { id: attachment.id },
      data: { status: 'deleted', deletedAt: new Date() },
    });
    if (removedKind === 'contract_pdf') {
      await this.markPartnerContractSignedRemoved(userId);
    }
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

  async getAttachmentFile(companyId: number, userId: number, attachmentId: string) {
    const onboarding = await this.getOrCreateForUser(companyId, userId, null);
    const attachment = await this.prisma.sellerOnboardingAttachment.findFirst({
      where: {
        id: String(attachmentId || ''),
        onboardingId: onboarding.id,
        status: { not: 'deleted' },
      },
    });
    if (!attachment) throw new NotFoundException('Anexo não encontrado.');
    let content: Buffer;
    try {
      content = await readFile(attachment.storagePath);
    } catch {
      throw new NotFoundException('Arquivo do anexo não encontrado.');
    }
    return {
      content,
      filename: attachment.originalFilename || attachment.storedFilename || 'anexo',
      contentType: attachment.contentType || 'application/octet-stream',
      byteSize: attachment.byteSize || content.length,
    };
  }

  async sendOnboardingEmail(companyId: number, userId: number, createdByUserId?: number | null) {
    let onboarding = await this.getOrCreateForUser(companyId, userId, createdByUserId);
    if (!onboarding.email) throw new BadRequestException('Informe o e-mail do parceiro antes de enviar.');
    if (!onboarding.contractTextSnapshot) {
      const generated = await this.generateContract(companyId, userId, createdByUserId);
      onboarding = generated.onboarding;
    }

    let activeAttachments = (onboarding.attachments || []).filter((item: any) => item.status !== 'deleted');
    if (!activeAttachments.some((item: any) => item.kind === GENERATED_CONTRACT_KIND)) {
      const generated = await this.generateContract(companyId, userId, createdByUserId);
      onboarding = generated.onboarding;
      activeAttachments = (onboarding.attachments || []).filter((item: any) => item.status !== 'deleted');
    }
    const readiness = this.buildReadiness(onboarding);
    const missingRequiredAttachments = readiness.missingRequiredDocuments.map((item) => ({
      kind: item.kind,
      label: item.label,
    }));
    if (missingRequiredAttachments.length) {
      const labels = missingRequiredAttachments.map((item) => item.label).join(', ');
      throw new BadRequestException({
        message: `Pendências obrigatórias antes do envio: ${labels}.`,
        missingRequiredAttachments,
      });
    }
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
      instrucaoAssinatura: CONTRACT_SIGNATURE_INSTRUCTION,
    });
    let result: Awaited<ReturnType<MailService['sendMail']>>;
    try {
      result = await this.mailService.sendMail({
        to: onboarding.email,
        cc: normalizeText(onboarding.archiveEmail, 180) || undefined,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        attachments,
      });
    } catch (mailError) {
      await this.prisma.sellerOnboarding.update({
        where: { id: onboarding.id },
        data: {
          emailStatus: 'email_failed',
          emailMessageId: null,
          emailSentAt: null,
        },
      });
      throw new BadRequestException(friendlyMailDeliveryError(mailError));
    }

    const sentAt = result.ok ? new Date() : null;
    const attachmentsDeleteAfter = sentAt ? addDays(sentAt, ONBOARDING_ATTACHMENT_RETENTION_DAYS) : null;
    let userActivated = false;
    if (sentAt && attachmentsDeleteAfter) {
      await this.markPartnerContractSent(userId, sentAt);
      await this.prisma.sellerOnboardingAttachment.updateMany({
        where: { onboardingId: onboarding.id, status: { not: 'deleted' } },
        data: { deleteAfter: attachmentsDeleteAfter },
      });
      await this.prisma.user.update({
        where: { id: Number(userId) },
        data: {
          isActive: true,
          deactivatedAt: null,
          retentionUntil: null,
        },
      });
      userActivated = true;
    }

    const updated = await this.prisma.sellerOnboarding.update({
      where: { id: onboarding.id },
      data: {
        emailStatus: result.ok ? 'sent' : 'email_failed',
        emailMessageId: result.messageId,
        emailSentAt: sentAt,
        status: result.ok ? 'approved' : onboarding.status,
        ...(attachmentsDeleteAfter ? { attachmentsDeleteAfter } : {}),
      },
      include: { attachments: { orderBy: { createdAt: 'desc' } } },
    });
    return {
      ok: result.ok,
      emailStatus: updated.emailStatus,
      userActivated,
      missingRequiredAttachments,
      messageId: result.messageId,
      delivery: result,
      onboarding: updated,
      readiness: this.buildReadiness(updated),
    };
  }

  async assertCanActivatePartner(companyId: number, userId: number, approvedByUserId?: number | null) {
    const onboarding = await this.getOrCreateForUser(companyId, userId, null);
    const readiness = this.buildReadiness(onboarding);
    if (!readiness.complete) {
      const missing = readiness.missingRequiredDocuments.map((item) => item.label).join(', ');
      throw new BadRequestException(`Parceiro ainda não pode ser liberado. Pendências obrigatórias: ${missing || 'documentação'}.`);
    }
    await this.markPartnerContractApproved(userId, approvedByUserId);
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
    if (['photo_id', 'curriculum', 'contract_pdf', GENERATED_CONTRACT_KIND, 'other'].includes(kind)) return kind;
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
    if (kind === 'contract_pdf') {
      const hasGeneratedContract = Boolean(
        onboarding?.contractTextSnapshot
        || (onboarding?.attachments || []).some((item: any) => item.status !== 'deleted' && item.kind === GENERATED_CONTRACT_KIND),
      );
      return override === true || hasGeneratedContract;
    }
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
