import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'path';
import PDFDocument from 'pdfkit';
import { isTenantCompany } from '../common/company-kind';
import { CompanyEmailSettingsService } from '../mail/company-email-settings.service';
import { CompanyEmailTemplateService } from '../mail/company-email-template.service';
import { COMPANY_EMAIL_NOT_CONFIGURED, CompanyMailerService } from '../mail/company-mailer.service';
import { MailService, type MailAttachment } from '../mail/mail.service';
import { EmailTemplateService } from '../mail/email-template.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_SELLER_PARTNER_CONTRACT_TEMPLATE,
  renderSellerPartnerContractTemplate,
  SELLER_CONTRACT_VERSION,
} from './seller-contract-template';

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
  canRecruitSellers?: unknown;
  sellerReferralCommissionPercent?: unknown;
  referredByUserId?: unknown;
  referredByCommissionPercentSnapshot?: unknown;
  archiveEmail?: unknown;
  metadataJson?: unknown;
  contractTextSnapshot?: unknown;
};

type SendOnboardingEmailOptions = {
  allowMissingRequiredAttachments?: boolean;
  confirmationLink?: string | null;
  includeConfirmationLink?: boolean;
};

const ONBOARDING_DOCUMENT_SLOTS = [
  { kind: 'photo_id', label: 'Documento com foto', defaultRequired: true },
  { kind: 'curriculum', label: 'Currículo', defaultRequired: false },
  { kind: 'contract_pdf', label: 'Contrato assinado', defaultRequired: false },
  { kind: 'other', label: 'Outro documento', defaultRequired: false },
] as const;

const GENERATED_CONTRACT_KIND = 'generated_contract';
const SIGNED_CONTRACT_KIND = 'signed_contract';

function formatCpf(value: string) {
  const d = String(value || '').replace(/\D/g, '').slice(0, 11);
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d;
}
const CONTRACT_SIGNATURE_INSTRUCTION = 'Assine pelo gov.br ou por assinatura digital de sua preferência.';
const ONBOARDING_ATTACHMENT_RETENTION_DAYS = 7;
const SELLER_ONBOARDING_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SELLER_ONBOARDING_INCLUDE = {
  user: { select: { emailConfirmedAt: true, email: true } },
  attachments: { orderBy: { createdAt: 'desc' as const } },
};

function normalizeText(value: unknown, max = 500) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function normalizeContractText(value: unknown, max = 30000) {
  const text = String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
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

function isAllowedAttachmentContent(buffer: Buffer, extension: string) {
  if (extension === '.pdf') {
    return buffer.subarray(0, 5).toString('utf8') === '%PDF-';
  }
  if (extension === '.png') {
    return buffer.length >= 8
      && buffer[0] === 0x89
      && buffer[1] === 0x50
      && buffer[2] === 0x4e
      && buffer[3] === 0x47
      && buffer[4] === 0x0d
      && buffer[5] === 0x0a
      && buffer[6] === 0x1a
      && buffer[7] === 0x0a;
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  return false;
}

function sellerOnboardingUploadDir() {
  return process.env.SELLER_ONBOARDING_UPLOAD_DIR || join(process.cwd(), 'storage', 'seller-onboarding-temp');
}

function sellerOnboardingContractTemplateDir() {
  return process.env.SELLER_ONBOARDING_CONTRACT_TEMPLATE_DIR || join(process.cwd(), 'storage', 'seller-onboarding-contract-templates');
}

function sellerOnboardingContractTemplatePath(companyId: number) {
  return join(sellerOnboardingContractTemplateDir(), `company-${Number(companyId)}.json`);
}

function sellerOnboardingCompanySignatureDir() {
  return process.env.SELLER_ONBOARDING_COMPANY_SIGNATURE_DIR || join(process.cwd(), 'storage', 'seller-onboarding-company-signatures');
}

function sellerOnboardingCompanySignaturePath(companyId: number) {
  return join(sellerOnboardingCompanySignatureDir(), `company-${Number(companyId)}.png`);
}

function sellerOnboardingAllowedUploadDirs() {
  return Array.from(new Set([
    resolve(sellerOnboardingUploadDir()),
    resolve(process.cwd(), 'storage', 'seller-onboarding-temp'),
  ]));
}

function isPathInsideDir(filePath: string, dirPath: string) {
  const relativePath = relative(dirPath, filePath);
  return Boolean(relativePath)
    && relativePath !== '..'
    && !relativePath.startsWith(`..${sep}`)
    && !isAbsolute(relativePath);
}

function hasPathTraversalSegment(rawPath: string) {
  return rawPath.replace(/\\/g, '/').split('/').some((segment) => segment === '..');
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

type ContractSignatureOptions = {
  companySignaturePng?: Buffer | null;
  partnerSignaturePng?: Buffer | null;
  consent?: { name: string; cpf: string; signedAt: string; ip: string; contractSha: string } | null;
};

async function buildContractPdfBuffer(contractText: string, options?: ContractSignatureOptions) {
  const lines = contractText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const title = lines[0] || 'CONTRATO DE PARCERIA COMERCIAL AUTÔNOMA E INDICAÇÃO COMISSIONADA';
  const signatureStart = lines.lastIndexOf('HBX SYSTEM');
  const contentLines = signatureStart > 0 ? lines.slice(1, signatureStart) : lines.slice(1);
  const signatureLines = signatureStart >= 0 ? lines.slice(signatureStart + 1) : [];
  const partnerSignature = [...signatureLines].reverse().find((line) => {
    return !/^assinatura\b/i.test(line) && !/^hbx system$/i.test(line) && !/^jhonatan barata$/i.test(line);
  }) || 'Vendedor';

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

    if (doc.y > doc.page.height - 200) doc.addPage();
    doc.moveDown(2.4);
    const startY = doc.y;
    const gap = 34;
    const columnWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right - gap) / 2;
    const leftX = doc.page.margins.left;
    const rightX = leftX + columnWidth + gap;
    // assinaturas desenhadas (quando houver), por cima da linha
    const drawSig = (png: Buffer | null | undefined, x: number) => {
      if (!png || !png.length) return;
      try { doc.image(png, x + columnWidth * 0.15, startY - 40, { fit: [columnWidth * 0.7, 36] }); } catch { /* png invalido: segue sem desenho */ }
    };
    drawSig(options?.companySignaturePng, leftX);
    drawSig(options?.partnerSignaturePng, rightX);
    doc.strokeColor('#111827').lineWidth(0.8);
    doc.moveTo(leftX, startY).lineTo(leftX + columnWidth, startY).stroke();
    doc.moveTo(rightX, startY).lineTo(rightX + columnWidth, startY).stroke();
    doc.font('Helvetica-Bold').fontSize(10.4).fillColor('#111827');
    doc.text('HBX SYSTEM', leftX, startY + 8, { width: columnWidth, align: 'center' });
    doc.text(partnerSignature, rightX, startY + 8, { width: columnWidth, align: 'center' });
    doc.font('Helvetica').fontSize(9.4).fillColor('#4b5563');
    doc.text('Contratante', leftX, startY + 23, { width: columnWidth, align: 'center' });
    doc.text('Parceiro Comercial', rightX, startY + 23, { width: columnWidth, align: 'center' });
    if (options?.consent) {
      const c = options.consent;
      doc.moveDown(3);
      doc.font('Helvetica').fontSize(7.6).fillColor('#6b7280').text(
        `Assinado eletronicamente por ${c.name} — CPF ${c.cpf} — em ${c.signedAt} (IP ${c.ip}). Integridade do contrato: SHA-256 ${c.contractSha}. Validade juridica nos termos da Lei 14.063/2020 e MP 2.200-2/2001.`,
        doc.page.margins.left,
        doc.y,
        { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'center', lineGap: 1.5 },
      );
    }

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
  private readonly logger = new Logger(SellerOnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly emailTemplates: EmailTemplateService,
    private readonly companyMailer: CompanyMailerService,
    private readonly companyEmailSettings: CompanyEmailSettingsService,
    private readonly companyEmailTemplates: CompanyEmailTemplateService,
  ) {}

  private buildAppUrl() {
    return String(process.env.APP_URL || process.env.FRONTEND_URL || 'https://hbxsystem.com.br').replace(/\/$/, '');
  }

  private buildEmailConfirmationLink(rawToken: string) {
    return `${this.buildAppUrl()}/hbx-vendedor/onboarding?token=${encodeURIComponent(rawToken)}`;
  }

  private async prepareEmailConfirmationLink(userId: number, email?: string | null) {
    const partnerId = Number(userId || 0);
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!partnerId || !normalizedEmail) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: partnerId },
      select: { email: true, emailConfirmedAt: true },
    });
    if (!user || user.emailConfirmedAt) return null;
    const rawToken = randomBytes(32).toString('base64url');
    await this.prisma.user.update({
      where: { id: partnerId },
      data: {
        emailConfirmationToken: createHash('sha256').update(rawToken).digest('hex'),
        emailConfirmationSentAt: new Date(),
        emailConfirmationExpiresAt: new Date(Date.now() + SELLER_ONBOARDING_LINK_TTL_MS),
      },
    });
    return this.buildEmailConfirmationLink(rawToken);
  }

  private async resolvePublicOnboardingToken(rawToken: unknown) {
    const token = String(rawToken || '').trim();
    if (!token) {
      throw new BadRequestException({
        code: 'SELLER_ONBOARDING_LINK_INVALID',
        message: 'Link de documentos inválido.',
      });
    }
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const user = await this.prisma.user.findFirst({
      where: { emailConfirmationToken: tokenHash },
      select: {
        id: true,
        companyId: true,
        role: true,
        email: true,
        username: true,
        name: true,
        isActive: true,
        emailConfirmedAt: true,
        emailConfirmationExpiresAt: true,
      },
    });
    if (!user) {
      throw new BadRequestException({
        code: 'SELLER_ONBOARDING_LINK_INVALID',
        message: 'Link de documentos inválido ou já utilizado.',
      });
    }
    if (!user.emailConfirmationExpiresAt || user.emailConfirmationExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException({
        code: 'SELLER_ONBOARDING_LINK_EXPIRED',
        message: 'Link de documentos expirado. Solicite um novo envio ao responsável.',
      });
    }
    const companyId = Number(user.companyId || 0);
    await this.assertSellerNetworkCompany(companyId);
    await this.requirePartnerUserInCompany(companyId, user.id);
    const onboarding = await this.getOrCreateForUser(companyId, user.id, null);
    return { user, companyId, onboarding };
  }

  private buildPublicOnboardingPayload(onboarding: any, message?: string | null) {
    const readiness = this.buildReadiness(onboarding);
    const activeAttachments = (onboarding?.attachments || []).filter((item: any) => item.status !== 'deleted');
    const documents = readiness.documents
      .filter((item) => item.required)
      .map((item) => {
        const attachment = activeAttachments.find((candidate: any) => String(candidate.kind || '') === String(item.kind));
        return {
          ...item,
          filename: attachment?.originalFilename || null,
        };
      });
    const documentsComplete = readiness.missingRequiredDocuments.length === 0;
    const emailConfirmed = Boolean(onboarding?.user?.emailConfirmedAt);
    return {
      ok: true,
      partner: {
        name: onboarding?.legalName || onboarding?.email || 'Vendedor',
        email: onboarding?.email || null,
      },
      documents,
      documentsComplete,
      emailConfirmed,
      missingRequiredDocuments: readiness.missingRequiredDocuments,
      message: message || (emailConfirmed
        ? 'Em breve chegará sua confirmação, com seu usuário e senha. '
        : documentsComplete
          ? 'Anexos aceitos. Clique em Enviar para confirmar seus documentos.'
          : 'Envie os documentos obrigatórios pendentes.'),
    };
  }

  private async createDocumentsConfirmedMasterNotice(onboarding: any) {
    const companyId = Number(onboarding?.companyId || 0);
    if (!companyId) return;
    const partnerName = normalizeText(onboarding?.legalName || onboarding?.email, 160) || 'Vendedor';
    const partnerEmail = normalizeText(onboarding?.email, 180) || 'sem e-mail';
    const now = new Date();
    await this.prisma.masterNotice.create({
      data: {
        companyId,
        audience: 'customer',
        title: 'Ticket aberto: documentos confirmados',
        body: `${partnerName} enviou todos os documentos obrigatórios do cadastro HBX. E-mail: ${partnerEmail}.`,
        tone: 'success',
        forceSeconds: 0,
        startsAt: now,
        expiresAt: addDays(now, 7),
      },
    });
  }

  async getPublicOnboarding(rawToken: unknown) {
    const { companyId, onboarding } = await this.resolvePublicOnboardingToken(rawToken);
    const payload = this.buildPublicOnboardingPayload(onboarding);
    const contractText = normalizeContractText(onboarding?.contractTextSnapshot)
      || await this.buildContractTextFromOnboarding(onboarding).catch(() => '');
    let companySignature: string | null = null;
    try {
      const sig = await readFile(sellerOnboardingCompanySignaturePath(companyId));
      if (sig.length) companySignature = `data:image/png;base64,${sig.toString('base64')}`;
    } catch { /* empresa ainda nao desenhou a assinatura */ }
    const signed = (onboarding?.attachments || []).some((a: any) => a.status !== 'deleted' && a.kind === SIGNED_CONTRACT_KIND);
    return { ...payload, contract: { text: contractText || '', companySignature, signed } };
  }

  // Vendedor assina o contrato pelo link publico (token): desenho + consentimento
  // (CPF + aceite + IP + data) -> PDF assinado com as DUAS assinaturas, salvo no
  // backend. Cópia opcional por e-mail. Validade pela trilha de consentimento.
  async signContractPublic(rawToken: unknown, body: { signatureDataUrl?: unknown; cpf?: unknown; accepted?: unknown; wantsCopy?: unknown }, ip?: string) {
    const { companyId, onboarding } = await this.resolvePublicOnboardingToken(rawToken);
    if (!body?.accepted) throw new BadRequestException('Marque que leu e aceita os termos do contrato.');
    const cpfDigits = String(body?.cpf || '').replace(/\D/g, '');
    if (cpfDigits.length !== 11) throw new BadRequestException('Informe um CPF valido (11 digitos).');
    const sigMatch = String(body?.signatureDataUrl || '').trim().match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
    if (!sigMatch) throw new BadRequestException('Desenhe sua assinatura antes de assinar.');
    const partnerSig = Buffer.from(sigMatch[1], 'base64');
    if (!partnerSig.length || partnerSig.length > 2 * 1024 * 1024) throw new BadRequestException('Assinatura invalida.');

    const contractText = normalizeContractText(onboarding.contractTextSnapshot) || await this.buildContractTextFromOnboarding(onboarding);
    if (!contractText) throw new BadRequestException('Contrato indisponivel para assinatura — avise o responsavel.');
    let companySig: Buffer | null = null;
    try { companySig = await readFile(sellerOnboardingCompanySignaturePath(companyId)); } catch { /* empresa ainda nao assinou */ }

    const signedAt = new Date();
    const consent = {
      name: normalizeText(onboarding.legalName || onboarding.email, 160) || 'Vendedor',
      cpf: formatCpf(cpfDigits),
      signedAt: signedAt.toLocaleString('pt-BR'),
      ip: String(ip || '-').slice(0, 60),
      contractSha: sha256Text(contractText).slice(0, 16),
    };
    const buffer = await buildContractPdfBuffer(contractText, { companySignaturePng: companySig, partnerSignaturePng: partnerSig, consent });

    const uploadDir = sellerOnboardingUploadDir();
    await mkdir(uploadDir, { recursive: true });
    for (const att of ((onboarding.attachments || []) as any[]).filter((a) => a.status !== 'deleted' && a.kind === SIGNED_CONTRACT_KIND)) {
      try { if (att.storagePath) await unlink(att.storagePath); } catch { /* ok */ }
      await this.prisma.sellerOnboardingAttachment.update({ where: { id: att.id }, data: { status: 'deleted', deletedAt: new Date() } });
    }
    const storedFilename = `${onboarding.id}-${SIGNED_CONTRACT_KIND}-${randomUUID()}.pdf`;
    const storagePath = join(uploadDir, storedFilename);
    await writeFile(storagePath, buffer);
    await this.prisma.sellerOnboardingAttachment.create({
      data: {
        onboardingId: onboarding.id,
        kind: SIGNED_CONTRACT_KIND,
        originalFilename: 'contrato-assinado.pdf',
        storedFilename,
        storagePath,
        contentType: 'application/pdf',
        byteSize: buffer.length,
        sha256: sha256Buffer(buffer),
        required: false,
        status: 'permanent',
      },
    });

    let copySent = false;
    if (body?.wantsCopy && onboarding.email) {
      try {
        await this.companyMailer.sendForCompany(companyId, {
          to: onboarding.email,
          subject: 'Sua copia do contrato de parceria assinado — HBX',
          text: `Ola ${consent.name},\n\nSegue em anexo a sua copia do contrato de parceria assinado eletronicamente em ${consent.signedAt}.\n\nEquipe HBX`,
          attachments: [{ filename: 'contrato-assinado.pdf', content: buffer, contentType: 'application/pdf' }],
        });
        copySent = true;
      } catch { /* a copia e conveniencia: nao derruba a assinatura */ }
    }

    return { ok: true, signedAt: signedAt.toISOString(), copySent };
  }

  async uploadPublicAttachment(rawToken: unknown, file: any, dto: { kind?: unknown }) {
    const { user, companyId, onboarding } = await this.resolvePublicOnboardingToken(rawToken);
    const kind = this.normalizeAttachmentKind(dto?.kind);
    const readiness = this.buildReadiness(onboarding);
    const slot = readiness.documents.find((item) => item.kind === kind);
    if (!slot?.required) {
      throw new BadRequestException('Este anexo não está pendente como obrigatório neste link.');
    }
    if (slot.present) {
      throw new BadRequestException('Este documento já foi recebido.');
    }

    await this.uploadAttachment(companyId, user.id, file, { kind, required: true });
    const refreshed = await this.getOrCreateForUser(companyId, user.id, null);
    return this.buildPublicOnboardingPayload(refreshed);
  }

  async removePublicAttachment(rawToken: unknown, kindValue: unknown) {
    const { user, companyId, onboarding } = await this.resolvePublicOnboardingToken(rawToken);
    const kind = this.normalizeAttachmentKind(kindValue);
    const readiness = this.buildReadiness(onboarding);
    const slot = readiness.documents.find((item) => item.kind === kind);
    if (!slot?.required) {
      throw new BadRequestException('Este anexo não está neste checklist.');
    }
    const attachment = (onboarding.attachments || []).find((item: any) => {
      return item.status !== 'deleted' && String(item.kind || '') === kind;
    });
    if (!attachment) throw new BadRequestException('Nenhum anexo recebido para remover.');
    await this.deleteAttachment(companyId, user.id, attachment.id);
    const refreshed = await this.getOrCreateForUser(companyId, user.id, null);
    return this.buildPublicOnboardingPayload(refreshed, 'Anexo removido. Envie o arquivo correto para continuar.');
  }

  async completePublicOnboarding(rawToken: unknown) {
    const { user, onboarding } = await this.resolvePublicOnboardingToken(rawToken);
    const readiness = this.buildReadiness(onboarding);
    if (readiness.missingRequiredDocuments.length) {
      const missing = readiness.missingRequiredDocuments.map((item) => item.label).join(', ');
      throw new BadRequestException(`Ainda falta enviar: ${missing}.`);
    }
    const confirmedAt = new Date();
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailConfirmedAt: confirmedAt,
        emailConfirmationToken: null,
        emailConfirmationSentAt: null,
        emailConfirmationExpiresAt: null,
      },
    });
    const updated = await this.prisma.sellerOnboarding.update({
      where: { id: onboarding.id },
      data: { status: 'documents_received' },
      include: SELLER_ONBOARDING_INCLUDE,
    });
    const confirmed = {
      ...updated,
      user: { ...(updated.user || {}), emailConfirmedAt: confirmedAt },
    };
    await this.createDocumentsConfirmedMasterNotice(confirmed).catch((error) => {
      this.logger.warn(`seller_onboarding_master_notice_failed userId=${user.id} error=${String(error?.message || error)}`);
    });
    return this.buildPublicOnboardingPayload(
      confirmed,
      'Em breve chegará sua confirmação, com seu usuário e senha. ',
    );
  }

  private contractDownloadPath(userId: number, attachmentId: string) {
    return `/gerencial/hbx-partners/${Number(userId)}/onboarding/attachments/${attachmentId}/download`;
  }

  // Teto de comissão (PR13062026007): lê do VENDEDOR ao vivo (o teto é editado no
  // gerenciar-vendedor depois do onboarding, então snapshot na criação ficaria stale).
  private async loadSellerCapsForOnboarding(onboarding: any): Promise<{ monthlyCap: number; setupCap: number }> {
    const userId = Math.trunc(Number(onboarding?.userId || 0));
    if (!userId) return { monthlyCap: 0, setupCap: 0 };
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId: Number(onboarding?.companyId || 0) },
      select: { commissionMonthlyCap: true, setupCommissionCap: true },
    }).catch(() => null);
    return {
      monthlyCap: Math.max(0, Number(user?.commissionMonthlyCap || 0) || 0),
      setupCap: Math.max(0, Number(user?.setupCommissionCap || 0) || 0),
    };
  }

  private buildContractInputFromOnboarding(onboarding: any, caps?: { monthlyCap: number; setupCap: number }) {
    return {
      sellerName: onboarding.legalName || onboarding.email || 'Vendedor',
      sellerCpf: onboarding.cpf || null,
      sellerEmail: onboarding.email || null,
      sellerPhone: onboarding.phone || null,
      sellerAddress: onboarding.declaredAddress || null,
      commissionPercent: onboarding.commissionPercent,
      commissionDueBusinessDays: onboarding.commissionDueBusinessDays,
      commissionMonthlyCap: caps?.monthlyCap ?? 0,
      setupCommissionCap: caps?.setupCap ?? 0,
      contractDate: new Date().toLocaleDateString('pt-BR'),
      canRecruitSellers: onboarding.canRegisterHbxSellers,
      sellerReferralCommissionPercent: onboarding.sellerReferralCommissionPercent,
      referredByName: onboarding.referredByNameSnapshot,
    };
  }

  private async readCompanyContractTemplate(companyId: number) {
    try {
      const parsed = JSON.parse(await readFile(sellerOnboardingContractTemplatePath(companyId), 'utf8'));
      return normalizeContractText(parsed?.template, 30000) || DEFAULT_SELLER_PARTNER_CONTRACT_TEMPLATE;
    } catch {
      return DEFAULT_SELLER_PARTNER_CONTRACT_TEMPLATE;
    }
  }

  private async buildContractTextFromOnboarding(onboarding: any) {
    const template = await this.readCompanyContractTemplate(Number(onboarding.companyId || 0));
    const caps = await this.loadSellerCapsForOnboarding(onboarding);
    return renderSellerPartnerContractTemplate(template, this.buildContractInputFromOnboarding(onboarding, caps))
      .split('\n')
      .filter((line) => line.trim() !== '')
      .join('\n');
  }

  private async withContractDraft<T extends Record<string, any> | null>(onboarding: T): Promise<T> {
    if (!onboarding) return onboarding;
    return {
      ...onboarding,
      contractTextDraft: normalizeContractText(onboarding.contractTextSnapshot) || await this.buildContractTextFromOnboarding(onboarding),
    };
  }

  // Assinatura da PRÓPRIA empresa no contrato (PNG desenhado pelo admin, 1 por
  // empresa). Reusada em todo contrato gerado — "só falta a do vendedor".
  async getCompanySignature(companyId: number) {
    await this.assertSellerNetworkCompany(companyId);
    try {
      const buffer = await readFile(sellerOnboardingCompanySignaturePath(companyId));
      return { hasSignature: buffer.length > 0, dataUrl: `data:image/png;base64,${buffer.toString('base64')}` };
    } catch {
      return { hasSignature: false, dataUrl: null as string | null };
    }
  }

  async saveCompanySignature(companyId: number, dataUrl: unknown) {
    await this.assertSellerNetworkCompany(companyId);
    const match = String(dataUrl || '').trim().match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw new BadRequestException('Assinatura invalida — desenhe e envie um PNG.');
    const buffer = Buffer.from(match[1], 'base64');
    if (!buffer.length) throw new BadRequestException('Assinatura vazia.');
    if (buffer.length > 2 * 1024 * 1024) throw new BadRequestException('Assinatura muito grande (max 2MB).');
    await mkdir(sellerOnboardingCompanySignatureDir(), { recursive: true });
    await writeFile(sellerOnboardingCompanySignaturePath(companyId), buffer);
    return { ok: true, hasSignature: true };
  }

  async deleteCompanySignature(companyId: number) {
    await this.assertSellerNetworkCompany(companyId);
    try {
      await unlink(sellerOnboardingCompanySignaturePath(companyId));
    } catch {
      /* ja nao existe */
    }
    return { ok: true, hasSignature: false };
  }

  async getContractTemplate(companyId: number) {
    await this.assertSellerNetworkCompany(companyId);
    return {
      template: await this.readCompanyContractTemplate(companyId),
      defaultTemplate: DEFAULT_SELLER_PARTNER_CONTRACT_TEMPLATE,
      variables: [
        '{sellerName}',
        '{sellerCpf}',
        '{sellerEmail}',
        '{sellerPhone}',
        '{sellerAddress}',
        '{commissionPercent}',
        '{commissionDueBusinessDays}',
        '{contractDate}',
        '{networkClause}',
        '{inheritedCommissionClause}',
        '{referredByClause}',
      ],
    };
  }

  async updateContractTemplate(companyId: number, dto: { template?: unknown }) {
    await this.assertSellerNetworkCompany(companyId);
    const template = normalizeContractText(dto?.template, 30000);
    if (!template) throw new BadRequestException('Informe o modelo do contrato.');
    await mkdir(sellerOnboardingContractTemplateDir(), { recursive: true });
    await writeFile(sellerOnboardingContractTemplatePath(companyId), JSON.stringify({
      template,
      updatedAt: new Date().toISOString(),
    }, null, 2), 'utf8');
    return {
      ok: true,
      template,
      defaultTemplate: DEFAULT_SELLER_PARTNER_CONTRACT_TEMPLATE,
    };
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
    await this.assertSellerNetworkCompany(companyId);
    const { user, company } = await this.requirePartnerUserInCompany(companyId, userId);
    const existing = await this.prisma.sellerOnboarding.findUnique({
      where: { companyId_userId: { companyId, userId } },
      include: SELLER_ONBOARDING_INCLUDE,
    });
    if (existing) return this.withContractDraft(existing);

    const referredByNameSnapshot = await this.resolveReferredByNameSnapshot(companyId, user.referredByUserId);
    const created = await this.prisma.sellerOnboarding.create({
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
      include: SELLER_ONBOARDING_INCLUDE,
    });
    return this.withContractDraft(created);
  }

  async hasOnboardingForUser(companyId: number, userId: number) {
    const normalizedCompanyId = Number(companyId || 0);
    const normalizedUserId = Number(userId || 0);
    if (!normalizedCompanyId || !normalizedUserId) return false;
    const count = await this.prisma.sellerOnboarding.count({
      where: { companyId: normalizedCompanyId, userId: normalizedUserId },
    });
    return count > 0;
  }

  async updateDraft(companyId: number, userId: number, dto: UpdateDraftInput) {
    await this.assertSellerNetworkCompany(companyId);
    const onboarding = await this.getOrCreateForUser(companyId, userId, null);
    const referrerId = Number(dto.referredByUserId ?? onboarding.referredByUserId ?? 0) || null;
    const referredByNameSnapshot = referrerId
      ? await this.resolveReferredByNameSnapshot(companyId, referrerId)
      : null;
    const partnerType = normalizeText(dto.partnerType, 40)
      || (referrerId ? 'hbx_heir' : 'hbx_partner');
    const hasContractText = Object.prototype.hasOwnProperty.call(dto || {}, 'contractTextSnapshot');
    const contractTextSnapshot = hasContractText ? normalizeContractText(dto.contractTextSnapshot) : undefined;
    const contractChanged = hasContractText && contractTextSnapshot !== normalizeContractText(onboarding.contractTextSnapshot);
    if (contractChanged) {
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
    }

    const updated = await this.prisma.sellerOnboarding.update({
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
        canRegisterHbxSellers: typeof dto.canRecruitSellers === 'boolean'
          ? dto.canRecruitSellers
          : onboarding.canRegisterHbxSellers,
        sellerReferralCommissionPercent: normalizePercent(dto.sellerReferralCommissionPercent, onboarding.sellerReferralCommissionPercent),
        referredByUserId: referrerId,
        referredByNameSnapshot,
        referredByCommissionPercentSnapshot: normalizePercent(dto.referredByCommissionPercentSnapshot, onboarding.referredByCommissionPercentSnapshot),
        archiveEmail: normalizeText(dto.archiveEmail, 180) ?? onboarding.archiveEmail,
        metadataJson: typeof dto.metadataJson === 'string' ? dto.metadataJson.slice(0, 5000) : onboarding.metadataJson,
        ...(hasContractText
          ? {
              contractVersion: SELLER_CONTRACT_VERSION,
              contractTextSnapshot,
              contractSha256: contractTextSnapshot ? sha256Text(contractTextSnapshot) : null,
              status: contractTextSnapshot ? 'ready_to_send' : onboarding.status,
            }
          : {}),
      },
      include: SELLER_ONBOARDING_INCLUDE,
    });
    return this.withContractDraft(updated);
  }

  async generateContract(companyId: number, userId: number, createdByUserId?: number | null) {
    const onboarding = await this.getOrCreateForUser(companyId, userId, createdByUserId);
    const contractText = normalizeContractText(onboarding.contractTextSnapshot)
      || await this.buildContractTextFromOnboarding(onboarding);
    if (!contractText) throw new BadRequestException('Informe o texto do contrato antes de gerar o PDF.');
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
        originalFilename: 'contrato-parceria-vendedor.pdf',
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
      include: SELLER_ONBOARDING_INCLUDE,
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
        include: SELLER_ONBOARDING_INCLUDE,
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
        include: SELLER_ONBOARDING_INCLUDE,
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
      include: SELLER_ONBOARDING_INCLUDE,
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
    // Ordem do dono (12/06/2026): contrato assinado aceita qualquer documento
    // do conjunto permitido — sem trava especial de "só PDF".
    if (!['.pdf', '.jpg', '.jpeg', '.png'].includes(extension)) {
      throw new BadRequestException('Anexo precisa ser PDF, JPG ou PNG.');
    }
    if (Number(file.size || file.buffer.length || 0) > 5 * 1024 * 1024) {
      throw new BadRequestException('Anexo deve ter no máximo 5MB.');
    }
    const buffer = Buffer.from(file.buffer);
    if (!isAllowedAttachmentContent(buffer, extension)) {
      throw new BadRequestException('Arquivo inválido. Envie um PDF, JPG ou PNG real.');
    }

    const uploadDir = process.env.SELLER_ONBOARDING_UPLOAD_DIR || join(process.cwd(), 'storage', 'seller-onboarding-temp');
    await mkdir(uploadDir, { recursive: true });
    const storedFilename = `${onboarding.id}-${kind}-${randomUUID()}${extension}`;
    const storagePath = join(uploadDir, storedFilename);
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
      include: SELLER_ONBOARDING_INCLUDE,
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
      include: SELLER_ONBOARDING_INCLUDE,
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

  async sendOnboardingEmail(
    companyId: number,
    userId: number,
    createdByUserId?: number | null,
    options?: SendOnboardingEmailOptions,
  ) {
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
    if (missingRequiredAttachments.length && !options?.allowMissingRequiredAttachments) {
      const labels = missingRequiredAttachments.map((item) => item.label).join(', ');
      throw new BadRequestException({
        message: `Pendências obrigatórias antes do envio: ${labels}.`,
        missingRequiredAttachments,
      });
    }
    const receivedLabels = readiness.receivedDocuments.map((item) => item.label);
    const missingLabels = readiness.missingRequiredDocuments.map((item) => item.label);
    const confirmationLink = options?.confirmationLink || (options?.includeConfirmationLink
      ? await this.prepareEmailConfirmationLink(userId, onboarding.email)
      : '');

    const attachments: MailAttachment[] = [];
    for (const attachment of activeAttachments as any[]) {
      // O contrato vai pelo LINK de assinatura (não anexo): anexo de remetente
      // novo é bloqueado/spam (Outlook). O vendedor lê e assina no link.
      if (attachment.kind === GENERATED_CONTRACT_KIND || attachment.kind === SIGNED_CONTRACT_KIND) continue;
      attachments.push({
        filename: attachment.originalFilename,
        content: await readFile(attachment.storagePath),
        contentType: attachment.contentType || undefined,
      });
    }

    // PR12062026005: o disparo sai pelo e-mail DA EMPRESA, com o template que
    // ela escolheu em Configurações → E-mail (HBX: cópia semeada do kind).
    const companySettings = await this.companyEmailSettings.getRaw(companyId);
    const onboardingTemplateKind = String(companySettings?.onboardingTemplateKind || '').trim()
      || (await this.companyEmailSettings.isHbxSharedCompany(companyId) ? 'seller_onboarding_request' : '');
    if (!onboardingTemplateKind) {
      throw new BadRequestException('Escolha o template de onboarding (solicitar documentos) em Configurações → E-mail.');
    }
    let companyTemplateRow: { kind: string; label: string; subject: string; text: string; html: string | null };
    try {
      companyTemplateRow = await this.companyEmailTemplates.getSafe(companyId, onboardingTemplateKind);
    } catch {
      throw new BadRequestException(`Template de onboarding "${onboardingTemplateKind}" não existe mais — escolha outro em Configurações → E-mail.`);
    }
    const rendered = this.companyEmailTemplates.renderRow(companyTemplateRow, {
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
      contrato: '',
      instrucaoAssinatura: CONTRACT_SIGNATURE_INSTRUCTION,
      linkConfirmacao: confirmationLink,
    });
    let result: Awaited<ReturnType<MailService['sendMail']>>;
    try {
      result = await this.companyMailer.sendForCompany(companyId, {
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
    if (!result.ok && result.errorCode === COMPANY_EMAIL_NOT_CONFIGURED) {
      await this.prisma.sellerOnboarding.update({
        where: { id: onboarding.id },
        data: { emailStatus: 'email_failed', emailMessageId: null, emailSentAt: null },
      });
      throw new BadRequestException(result.errorMessage || 'E-mail da empresa não configurado.');
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
    }

    const updated = await this.prisma.sellerOnboarding.update({
      where: { id: onboarding.id },
      data: {
        emailStatus: result.ok ? 'sent' : 'email_failed',
        emailMessageId: result.messageId,
        emailSentAt: sentAt,
        status: result.ok ? 'sent' : onboarding.status,
        ...(attachmentsDeleteAfter ? { attachmentsDeleteAfter } : {}),
      },
      include: SELLER_ONBOARDING_INCLUDE,
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
    const { user } = await this.requirePartnerUserInCompany(companyId, userId);
    // Só exige confirmação quando há e-mail. Vendedor de cadastro simples (usuário+senha,
    // sem e-mail) não tem o que confirmar — a credencial é entregue na tela/mão.
    if (user.email && !user.emailConfirmedAt) {
      throw new BadRequestException({
        code: 'HBX_PARTNER_EMAIL_CONFIRMATION_PENDING',
        message: 'Vendedor ainda não pode ser liberado. Faltou confirmar o e-mail do pré-boas-vindas.',
        missingActivationRequirements: [
          { code: 'email_confirmation', label: 'Confirmar e-mail do pré-boas-vindas' },
        ],
      });
    }
    const onboarding = await this.getOrCreateForUser(companyId, userId, null);
    const readiness = this.buildReadiness(onboarding);
    if (!readiness.complete) {
      const missing = [
        ...readiness.missingRequiredDocuments.map((item) => item.label),
        ...readiness.missingActivationRequirements.map((item) => item.label),
      ].join(', ');
      throw new BadRequestException({
        code: 'HBX_PARTNER_ONBOARDING_PENDING',
        message: `Vendedor ainda não pode ser liberado. Faltou: ${missing || 'documentação'}.`,
        missingRequiredDocuments: readiness.missingRequiredDocuments,
        missingActivationRequirements: readiness.missingActivationRequirements,
      });
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
    let deletedCount = 0;
    let missingFileCount = 0;
    let skippedUnsafePathCount = 0;
    let failedDeleteCount = 0;
    for (const attachment of attachments as any[]) {
      const safeStoragePath = this.resolveSafeAttachmentStoragePath(attachment.storagePath);
      if (!safeStoragePath) {
        skippedUnsafePathCount += 1;
        continue;
      }
      try {
        await unlink(safeStoragePath);
      } catch (error: any) {
        if (error?.code === 'ENOENT') {
          missingFileCount += 1;
        } else {
          failedDeleteCount += 1;
          continue;
        }
      }
      await this.prisma.sellerOnboardingAttachment.update({
        where: { id: attachment.id },
        data: { status: 'deleted', deletedAt: now },
      });
      deletedCount += 1;
    }
    this.logger.log(
      `seller_onboarding_attachment_purge companyId=${Number(companyId || 0) || 'all'} scanned=${attachments.length} deleted=${deletedCount} missing=${missingFileCount} unsafe=${skippedUnsafePathCount} failed=${failedDeleteCount}`,
    );
    return {
      ok: true,
      scannedCount: attachments.length,
      deletedCount,
      missingFileCount,
      skippedUnsafePathCount,
      failedDeleteCount,
    };
  }

  private resolveSafeAttachmentStoragePath(storagePath?: string | null) {
    const rawPath = String(storagePath || '').trim();
    if (!rawPath || rawPath.includes('\0') || hasPathTraversalSegment(rawPath)) return null;
    const resolvedPath = resolve(rawPath);
    const allowedDirs = sellerOnboardingAllowedUploadDirs();
    return allowedDirs.some((allowedDir) => isPathInsideDir(resolvedPath, allowedDir))
      ? resolvedPath
      : null;
  }

  private async assertSellerNetworkCompany(companyId: number) {
    const company = await this.prisma.company.findUnique({
      where: { id: Number(companyId) },
      select: { companyKind: true },
    });
    if (!company || !isTenantCompany(company)) {
      throw new BadRequestException('Onboarding de vendedor está disponível apenas para empresas tenant.');
    }
  }

  private async requirePartnerUserInCompany(companyId: number, userId: number) {
    const user = await this.prisma.user.findFirst({
      where: { id: Number(userId), companyId: Number(companyId) },
      include: { company: { select: { id: true, commissionDueBusinessDays: true } } },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado na empresa.');
    if (String(user.role || '').toUpperCase() !== 'USER') {
      throw new BadRequestException('Onboarding com documentos é apenas para vendedores.');
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
    if (typeof override === 'boolean') return override;
    if (kind === 'contract_pdf') {
      const hasGeneratedContract = Boolean(
        onboarding?.contractTextSnapshot
        || (onboarding?.attachments || []).some((item: any) => item.status !== 'deleted' && item.kind === GENERATED_CONTRACT_KIND),
      );
      return hasGeneratedContract;
    }
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
    const emailConfirmed = Boolean(onboarding?.user?.emailConfirmedAt);
    // Confirmação de e-mail só faz sentido se há e-mail (cadastro simples = usuário+senha
    // não tem e-mail pra confirmar). Sem e-mail, a credencial é entregue na tela/mão.
    const hasEmail = Boolean(onboarding?.user?.email || onboarding?.email);
    const missingActivationRequirements = !hasEmail || emailConfirmed
      ? []
      : [{ code: 'email_confirmation', label: 'Confirmar e-mail do pré-boas-vindas' }];
    return {
      complete: missingRequiredDocuments.length === 0 && missingActivationRequirements.length === 0,
      emailConfirmed,
      documents,
      receivedDocuments: documents.filter((item) => item.present),
      missingRequiredDocuments,
      missingActivationRequirements,
    };
  }
}
