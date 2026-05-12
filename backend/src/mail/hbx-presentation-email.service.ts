import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { existsSync } from 'fs';
import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import { join } from 'path';
import { EmailTemplateService } from './email-template.service';
import { MailAttachment, MailSendResult, MailService } from './mail.service';
import { isValidHbxEmail, normalizeHbxEmail } from './hbx-email-intent.util';
import { PrismaService } from '../prisma/prisma.service';

export const ATTACHMENT_DIR = join(process.cwd(), 'storage', 'master-email');
export const ATTACHMENT_PATH = join(ATTACHMENT_DIR, 'apresentacao-hbx.pptx');
export const ATTACHMENT_META_PATH = join(ATTACHMENT_DIR, 'apresentacao-hbx.json');
export const BUSINESS_CARD_PATH = join(ATTACHMENT_DIR, 'cartao-visitas');
export const BUSINESS_CARD_META_PATH = join(ATTACHMENT_DIR, 'cartao-visitas.json');
export const BUSINESS_CARD_CID = 'hbx-business-card';
export const MASTER_EMAIL_COPY_RECIPIENT = 'barataimports@gmail.com';
export const PRESENTATION_ASSET_KEY = 'presentation_pptx';
export const BUSINESS_CARD_ASSET_KEY = 'business_card';
export const PRESENTATION_PPTX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export type AttachmentMeta = {
  originalName: string;
  uploadedAt: string;
  size: number;
  mimeType?: string;
  previewDataUrl?: string;
};

export type SendHbxPresentationInput = {
  companyId?: number | null;
  userId?: number | null;
  conversationId?: number | null;
  customerProfileId?: string | null;
  recipientName: string;
  recipientEmail: string;
  companyName?: string | null;
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  source: 'bot' | 'master' | 'manual';
};

export type HbxPresentationEmailResult = {
  ok: boolean;
  sentAt: string;
  recipientName: string;
  recipientEmail: string;
  subject: string;
  attachment: AttachmentMeta | null;
  businessCard: AttachmentMeta | null;
  copyRecipients: string[];
  delivery: MailSendResult;
  sentBy: number | null;
  source: SendHbxPresentationInput['source'];
};

export type HbxPresentationEmailPreview = {
  recipientName: string;
  recipientEmail: string;
  subject: string;
  text: string;
  html: string;
  attachment: AttachmentMeta | null;
  businessCard: AttachmentMeta | null;
  senderSummary: ReturnType<MailService['getConfigurationSummary']>;
  warnings: string[];
};

export type StoredEmailAsset = {
  meta: AttachmentMeta;
  content: Buffer;
  contentType: string;
};

@Injectable()
export class HbxPresentationEmailService {
  private readonly logger = new Logger(HbxPresentationEmailService.name);
  private legacyAssetMigrationChecked = false;

  constructor(
    private readonly mailService: MailService,
    private readonly emailTemplates: EmailTemplateService,
    private readonly prisma: PrismaService,
  ) {}

  normalizeName(value: unknown) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  normalizeUploadedOriginalName(value: unknown, fallback: string) {
    const raw = String(value || fallback || '')
      .replace(/[\\/]/g, '')
      .replace(/\s+/g, ' ')
      .trim() || fallback;
    if (!/[ÃÂ]/.test(raw)) return raw;

    const decoded = Buffer.from(raw, 'latin1').toString('utf8').trim();
    return decoded && !decoded.includes('�') ? decoded : raw;
  }

  buildBusinessCardHtml() {
    return `<img src="cid:${BUSINESS_CARD_CID}" alt="Cartao de visitas" style="display:block;max-width:100%;width:auto;height:auto;border:0;outline:none;text-decoration:none">`;
  }

  getConfigurationSummary() {
    return this.mailService.getConfigurationSummary();
  }

  async readAttachmentMeta() {
    if (await this.canUseDatabaseAssetStorage()) {
      await this.migrateLegacyAssetsToDatabase();
      return this.readDatabaseAssetMeta(PRESENTATION_ASSET_KEY, 'apresentacao-hbx.pptx');
    }
    return this.readLegacyAttachmentMeta();
  }

  async readBusinessCardMeta(includePreview = false) {
    if (await this.canUseDatabaseAssetStorage()) {
      await this.migrateLegacyAssetsToDatabase();
      return this.readDatabaseAssetMeta(BUSINESS_CARD_ASSET_KEY, 'cartao-visitas.png', includePreview);
    }
    return this.readLegacyBusinessCardMeta(includePreview);
  }

  async readAttachmentContent(): Promise<StoredEmailAsset | null> {
    if (await this.canUseDatabaseAssetStorage()) {
      await this.migrateLegacyAssetsToDatabase();
      return this.readDatabaseAssetContent(PRESENTATION_ASSET_KEY, 'apresentacao-hbx.pptx', PRESENTATION_PPTX_MIME_TYPE);
    }

    if (!existsSync(ATTACHMENT_PATH)) return null;
    const meta = await this.readLegacyAttachmentMeta();
    return {
      meta: meta || {
        originalName: 'apresentacao-hbx.pptx',
        uploadedAt: new Date().toISOString(),
        size: 0,
      },
      content: await readFile(ATTACHMENT_PATH),
      contentType: PRESENTATION_PPTX_MIME_TYPE,
    };
  }

  async readBusinessCardContent(): Promise<StoredEmailAsset | null> {
    if (await this.canUseDatabaseAssetStorage()) {
      await this.migrateLegacyAssetsToDatabase();
      return this.readDatabaseAssetContent(BUSINESS_CARD_ASSET_KEY, 'cartao-visitas.png', 'image/png');
    }

    if (!existsSync(BUSINESS_CARD_PATH)) return null;
    const meta = await this.readLegacyBusinessCardMeta(false);
    return {
      meta: meta || {
        originalName: 'cartao-visitas.png',
        uploadedAt: new Date().toISOString(),
        size: 0,
        mimeType: 'image/png',
      },
      content: await readFile(BUSINESS_CARD_PATH),
      contentType: meta?.mimeType || 'image/png',
    };
  }

  async savePresentationAttachment(buffer: Buffer, originalName: string) {
    const uploadedAt = new Date();
    const meta: AttachmentMeta = {
      originalName,
      uploadedAt: uploadedAt.toISOString(),
      size: Number(buffer.length || 0),
      mimeType: PRESENTATION_PPTX_MIME_TYPE,
    };

    if (await this.canUseDatabaseAssetStorage()) {
      await this.migrateLegacyAssetsToDatabase();
      await this.prisma.masterEmailAsset.upsert({
        where: { key: PRESENTATION_ASSET_KEY },
        create: {
          key: PRESENTATION_ASSET_KEY,
          originalName: meta.originalName,
          mimeType: PRESENTATION_PPTX_MIME_TYPE,
          size: meta.size,
          fileData: buffer,
          uploadedAt,
        },
        update: {
          originalName: meta.originalName,
          mimeType: PRESENTATION_PPTX_MIME_TYPE,
          size: meta.size,
          fileData: buffer,
          uploadedAt,
        },
      });
      return this.readAttachmentMeta();
    }

    await mkdir(ATTACHMENT_DIR, { recursive: true });
    await writeFile(ATTACHMENT_PATH, buffer);
    await writeFile(ATTACHMENT_META_PATH, JSON.stringify(meta, null, 2), 'utf8');
    return this.readAttachmentMeta();
  }

  async saveBusinessCard(buffer: Buffer, input: { originalName: string; mimeType: string }) {
    const uploadedAt = new Date();
    const meta: AttachmentMeta = {
      originalName: input.originalName,
      uploadedAt: uploadedAt.toISOString(),
      size: Number(buffer.length || 0),
      mimeType: input.mimeType,
    };

    if (await this.canUseDatabaseAssetStorage()) {
      await this.migrateLegacyAssetsToDatabase();
      await this.prisma.masterEmailAsset.upsert({
        where: { key: BUSINESS_CARD_ASSET_KEY },
        create: {
          key: BUSINESS_CARD_ASSET_KEY,
          originalName: meta.originalName,
          mimeType: meta.mimeType || 'image/png',
          size: meta.size,
          fileData: buffer,
          uploadedAt,
        },
        update: {
          originalName: meta.originalName,
          mimeType: meta.mimeType || 'image/png',
          size: meta.size,
          fileData: buffer,
          uploadedAt,
        },
      });
      return this.readBusinessCardMeta(true);
    }

    await mkdir(ATTACHMENT_DIR, { recursive: true });
    await writeFile(BUSINESS_CARD_PATH, buffer);
    await writeFile(BUSINESS_CARD_META_PATH, JSON.stringify(meta, null, 2), 'utf8');
    return this.readBusinessCardMeta(true);
  }

  private async readLegacyAttachmentMeta() {
    if (!existsSync(ATTACHMENT_PATH)) return null;
    const fileStat = await stat(ATTACHMENT_PATH);
    let meta: Partial<AttachmentMeta> = {};
    if (existsSync(ATTACHMENT_META_PATH)) {
      try {
        meta = JSON.parse(await readFile(ATTACHMENT_META_PATH, 'utf8'));
      } catch {
        meta = {};
      }
    }
    return {
      originalName: this.normalizeUploadedOriginalName(meta.originalName, 'apresentacao-hbx.pptx'),
      uploadedAt: String(meta.uploadedAt || fileStat.mtime.toISOString()),
      size: Number(meta.size || fileStat.size || 0),
    };
  }

  private async readLegacyBusinessCardMeta(includePreview = false) {
    if (!existsSync(BUSINESS_CARD_PATH)) return null;
    const fileStat = await stat(BUSINESS_CARD_PATH);
    let meta: Partial<AttachmentMeta> = {};
    if (existsSync(BUSINESS_CARD_META_PATH)) {
      try {
        meta = JSON.parse(await readFile(BUSINESS_CARD_META_PATH, 'utf8'));
      } catch {
        meta = {};
      }
    }
    const mimeType = String(meta.mimeType || 'image/png');
    const card: AttachmentMeta = {
      originalName: this.normalizeUploadedOriginalName(meta.originalName, 'cartao-visitas.png'),
      uploadedAt: String(meta.uploadedAt || fileStat.mtime.toISOString()),
      size: Number(meta.size || fileStat.size || 0),
      mimeType,
    };
    if (includePreview) {
      const content = await readFile(BUSINESS_CARD_PATH);
      card.previewDataUrl = `data:${mimeType};base64,${content.toString('base64')}`;
    }
    return card;
  }

  private async canUseDatabaseAssetStorage() {
    return this.prisma.hasTable('MasterEmailAsset');
  }

  private parseStoredDate(value: unknown) {
    const parsed = new Date(String(value || ''));
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  private async readDatabaseAssetMeta(key: string, fallbackName: string, includePreview = false) {
    const row = await this.prisma.masterEmailAsset.findUnique({
      where: { key },
      select: {
        originalName: true,
        mimeType: true,
        size: true,
        uploadedAt: true,
        fileData: includePreview,
      },
    });
    if (!row) return null;

    const mimeType = String(row.mimeType || (key === PRESENTATION_ASSET_KEY ? PRESENTATION_PPTX_MIME_TYPE : 'image/png'));
    const meta: AttachmentMeta = {
      originalName: this.normalizeUploadedOriginalName(row.originalName, fallbackName),
      uploadedAt: row.uploadedAt ? row.uploadedAt.toISOString() : new Date().toISOString(),
      size: Number(row.size || 0),
      mimeType,
    };
    if (includePreview && row.fileData) {
      meta.previewDataUrl = `data:${mimeType};base64,${Buffer.from(row.fileData).toString('base64')}`;
    }
    if (key === PRESENTATION_ASSET_KEY) {
      delete meta.mimeType;
    }
    return meta;
  }

  private async readDatabaseAssetContent(key: string, fallbackName: string, fallbackContentType: string): Promise<StoredEmailAsset | null> {
    const row = await this.prisma.masterEmailAsset.findUnique({
      where: { key },
      select: {
        originalName: true,
        mimeType: true,
        size: true,
        uploadedAt: true,
        fileData: true,
      },
    });
    if (!row?.fileData) return null;

    const contentType = String(row.mimeType || fallbackContentType);
    const meta: AttachmentMeta = {
      originalName: this.normalizeUploadedOriginalName(row.originalName, fallbackName),
      uploadedAt: row.uploadedAt ? row.uploadedAt.toISOString() : new Date().toISOString(),
      size: Number(row.size || Buffer.from(row.fileData).length || 0),
      mimeType: contentType,
    };
    if (key === PRESENTATION_ASSET_KEY) {
      delete meta.mimeType;
    }

    return {
      meta,
      content: Buffer.from(row.fileData),
      contentType,
    };
  }

  private async migrateLegacyAssetsToDatabase() {
    if (this.legacyAssetMigrationChecked) return;
    this.legacyAssetMigrationChecked = true;

    try {
      if (existsSync(ATTACHMENT_PATH)) {
        const existing = await this.prisma.masterEmailAsset.findUnique({
          where: { key: PRESENTATION_ASSET_KEY },
          select: { key: true },
        });
        if (!existing) {
          const legacyMeta = await this.readLegacyAttachmentMeta();
          const content = await readFile(ATTACHMENT_PATH);
          await this.prisma.masterEmailAsset.create({
            data: {
              key: PRESENTATION_ASSET_KEY,
              originalName: legacyMeta?.originalName || 'apresentacao-hbx.pptx',
              mimeType: PRESENTATION_PPTX_MIME_TYPE,
              size: Number(legacyMeta?.size || content.length || 0),
              fileData: content,
              uploadedAt: legacyMeta?.uploadedAt ? this.parseStoredDate(legacyMeta.uploadedAt) : new Date(),
            },
          });
        }
      }

      if (existsSync(BUSINESS_CARD_PATH)) {
        const existing = await this.prisma.masterEmailAsset.findUnique({
          where: { key: BUSINESS_CARD_ASSET_KEY },
          select: { key: true },
        });
        if (!existing) {
          const legacyMeta = await this.readLegacyBusinessCardMeta(false);
          const content = await readFile(BUSINESS_CARD_PATH);
          await this.prisma.masterEmailAsset.create({
            data: {
              key: BUSINESS_CARD_ASSET_KEY,
              originalName: legacyMeta?.originalName || 'cartao-visitas.png',
              mimeType: legacyMeta?.mimeType || 'image/png',
              size: Number(legacyMeta?.size || content.length || 0),
              fileData: content,
              uploadedAt: legacyMeta?.uploadedAt ? this.parseStoredDate(legacyMeta.uploadedAt) : new Date(),
            },
          });
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to migrate legacy master email assets: ${error instanceof Error ? error.message : error}`);
    }
  }

  private buildDeliveryErrorMessage(error: unknown) {
    const message = error instanceof Error ? error.message : String(error || '');
    const normalized = message.toLowerCase();
    if (normalized.includes('domain is not verified') || normalized.includes('verify your domain')) {
      return 'O provedor de e-mail recusou o remetente configurado. Use um dominio verificado no Resend ou ajuste MAIL_FROM no servidor.';
    }
    if (normalized.includes('too large') || normalized.includes('size') || normalized.includes('attachment')) {
      return 'O provedor de e-mail recusou o envio por tamanho de anexo. Reduza o PPTX ou use um link publico.';
    }
    if (normalized.includes('configuration') || normalized.includes('not configured') || normalized.includes('missing')) {
      return 'Configuracao de e-mail incompleta no servidor. Verifique SMTP/Resend antes de enviar.';
    }
    return 'Falha no provedor de e-mail. Verifique a configuracao SMTP/Resend e tente novamente.';
  }

  private async sendMasterMail(input: Parameters<MailService['sendMail']>[0]) {
    try {
      return await this.mailService.sendMail(input);
    } catch (error) {
      this.logger.error(
        `HBX presentation email delivery failed: ${error instanceof Error ? error.message : error}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BadGatewayException(this.buildDeliveryErrorMessage(error));
    }
  }

  async sendRawMail(input: Parameters<MailService['sendMail']>[0]) {
    return this.sendMasterMail(input);
  }

  async previewPresentationToContact(input: SendHbxPresentationInput): Promise<HbxPresentationEmailPreview> {
    const recipientName = this.normalizeName(input.recipientName) || 'cliente';
    const recipientEmail = normalizeHbxEmail(input.recipientEmail);
    const attachmentMeta = await this.readAttachmentMeta();
    const businessCardMeta = await this.readBusinessCardMeta(true);
    const hasBusinessCard = Boolean(businessCardMeta);
    const template = await this.emailTemplates.getTemplateSafe('normal');
    const variables = {
      nome: recipientName,
      email: recipientEmail,
      empresa: String(input.companyName || '').trim(),
      ano: new Date().getFullYear(),
    };
    const subjectSource = this.emailTemplates.normalizeSubject(input.subject) || template.subject;
    const textSource = this.emailTemplates.normalizeText(input.text) || template.text;
    const htmlSource =
      input.html === undefined
        ? template.html || null
        : this.emailTemplates.sanitizeHtml(String(input.html || '')) || null;
    const renderedText = this.emailTemplates.renderString(textSource, variables);
    const renderedSubject = this.emailTemplates.renderString(subjectSource, variables);
    const renderedHtml = htmlSource ? this.emailTemplates.renderString(htmlSource, variables) : null;
    const warnings: string[] = ['Envio manual por card. Não é disparo em massa.'];
    if (!recipientEmail) warnings.push('Preencha um e-mail de destino antes de enviar.');
    if (recipientEmail && !isValidHbxEmail(recipientEmail)) warnings.push('Revise o e-mail de destino antes de enviar.');
    if (!attachmentMeta) warnings.push('A apresentação PPTX ainda não foi configurada no Master.');

    return {
      recipientName,
      recipientEmail: recipientEmail || '',
      subject: renderedSubject,
      text: renderedText,
      html: this.emailTemplates.buildHtmlEmail(renderedText, {
        html: renderedHtml,
        appendHtml: hasBusinessCard ? this.buildBusinessCardHtml() : null,
      }),
      attachment: attachmentMeta,
      businessCard: businessCardMeta,
      senderSummary: this.getConfigurationSummary(),
      warnings,
    };
  }

  async sendPresentationToContact(input: SendHbxPresentationInput): Promise<HbxPresentationEmailResult> {
    const recipientName = this.normalizeName(input.recipientName) || 'cliente';
    const recipientEmail = normalizeHbxEmail(input.recipientEmail);
    if (!recipientName) throw new BadRequestException('Informe o nome do contato.');
    if (!recipientEmail) throw new BadRequestException('Informe o e-mail do contato.');
    if (!isValidHbxEmail(recipientEmail)) throw new BadRequestException('Informe um e-mail valido para o contato.');
    const attachmentFile = await this.readAttachmentContent();
    if (!attachmentFile) {
      throw new BadRequestException('Faca upload do PPTX antes de enviar.');
    }

    const attachmentMeta = attachmentFile.meta;
    const businessCardFile = await this.readBusinessCardContent();
    const businessCardMeta = businessCardFile?.meta || null;
    const hasBusinessCard = Boolean(businessCardFile);
    const attachments: MailAttachment[] = [
      {
        filename: attachmentMeta.originalName || 'apresentacao-hbx.pptx',
        content: attachmentFile.content,
        contentType: attachmentFile.contentType || PRESENTATION_PPTX_MIME_TYPE,
      },
    ];

    if (businessCardFile && businessCardMeta && hasBusinessCard) {
      attachments.push({
        filename: businessCardMeta.originalName || 'cartao-visitas.png',
        content: businessCardFile.content,
        contentType: businessCardFile.contentType || businessCardMeta.mimeType || 'image/png',
        cid: BUSINESS_CARD_CID,
      });
    }

    const template = await this.emailTemplates.getTemplateSafe('normal');
    const variables = {
      nome: recipientName,
      email: recipientEmail,
      empresa: String(input.companyName || '').trim(),
      ano: new Date().getFullYear(),
    };
    const subjectSource = this.emailTemplates.normalizeSubject(input.subject) || template.subject;
    const textSource = this.emailTemplates.normalizeText(input.text) || template.text;
    const htmlSource =
      input.html === undefined
        ? template.html || null
        : this.emailTemplates.sanitizeHtml(String(input.html || '')) || null;
    const renderedText = this.emailTemplates.renderString(textSource, variables);
    const renderedSubject = this.emailTemplates.renderString(subjectSource, variables);
    const renderedHtml = htmlSource ? this.emailTemplates.renderString(htmlSource, variables) : null;
    const delivery = await this.sendMasterMail({
      to: recipientEmail,
      cc: MASTER_EMAIL_COPY_RECIPIENT,
      subject: renderedSubject,
      text: renderedText,
      html: this.emailTemplates.buildHtmlEmail(renderedText, {
        html: renderedHtml,
        appendHtml: hasBusinessCard ? this.buildBusinessCardHtml() : null,
      }),
      attachments,
    });

    return {
      ok: delivery.ok,
      sentAt: new Date().toISOString(),
      recipientName,
      recipientEmail,
      subject: renderedSubject,
      attachment: attachmentMeta,
      businessCard: businessCardMeta,
      copyRecipients: [MASTER_EMAIL_COPY_RECIPIENT],
      delivery,
      sentBy: Number(input.userId || 0) || null,
      source: input.source,
    };
  }
}
