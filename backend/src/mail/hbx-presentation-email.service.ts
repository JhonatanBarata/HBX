import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { existsSync } from 'fs';
import { readFile, stat } from 'fs/promises';
import { join } from 'path';
import { EmailTemplateService } from './email-template.service';
import { MailAttachment, MailSendResult, MailService } from './mail.service';
import { isValidHbxEmail, normalizeHbxEmail } from './hbx-email-intent.util';

export const ATTACHMENT_DIR = join(process.cwd(), 'storage', 'master-email');
export const ATTACHMENT_PATH = join(ATTACHMENT_DIR, 'apresentacao-hbx.pptx');
export const ATTACHMENT_META_PATH = join(ATTACHMENT_DIR, 'apresentacao-hbx.json');
export const BUSINESS_CARD_PATH = join(ATTACHMENT_DIR, 'cartao-visitas');
export const BUSINESS_CARD_META_PATH = join(ATTACHMENT_DIR, 'cartao-visitas.json');
export const BUSINESS_CARD_CID = 'hbx-business-card';
export const MASTER_EMAIL_COPY_RECIPIENT = 'barataimports@gmail.com';

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

@Injectable()
export class HbxPresentationEmailService {
  private readonly logger = new Logger(HbxPresentationEmailService.name);

  constructor(
    private readonly mailService: MailService,
    private readonly emailTemplates: EmailTemplateService,
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

  async readBusinessCardMeta(includePreview = false) {
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

  async sendPresentationToContact(input: SendHbxPresentationInput): Promise<HbxPresentationEmailResult> {
    const recipientName = this.normalizeName(input.recipientName) || 'cliente';
    const recipientEmail = normalizeHbxEmail(input.recipientEmail);
    if (!recipientName) throw new BadRequestException('Informe o nome do contato.');
    if (!recipientEmail) throw new BadRequestException('Informe o e-mail do contato.');
    if (!isValidHbxEmail(recipientEmail)) throw new BadRequestException('Informe um e-mail valido para o contato.');
    if (!existsSync(ATTACHMENT_PATH)) {
      throw new BadRequestException('Faca upload do PPTX antes de enviar.');
    }

    const attachmentMeta = await this.readAttachmentMeta();
    const businessCardMeta = await this.readBusinessCardMeta(false);
    const hasBusinessCard = Boolean(businessCardMeta) && existsSync(BUSINESS_CARD_PATH);
    const attachments: MailAttachment[] = [
      {
        filename: attachmentMeta?.originalName || 'apresentacao-hbx.pptx',
        content: await readFile(ATTACHMENT_PATH),
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      },
    ];

    if (businessCardMeta && hasBusinessCard) {
      attachments.push({
        filename: businessCardMeta.originalName || 'cartao-visitas.png',
        content: await readFile(BUSINESS_CARD_PATH),
        contentType: businessCardMeta.mimeType || 'image/png',
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
