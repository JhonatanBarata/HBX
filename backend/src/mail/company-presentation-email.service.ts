import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CompanyEmailSettingsService, CompanySenderSummary } from './company-email-settings.service';
import { COMPANY_EMAIL_NOT_CONFIGURED, CompanyMailerService } from './company-mailer.service';
import { EmailTemplateService } from './email-template.service';
import { BUSINESS_CARD_CID, HbxPresentationEmailService, SendHbxPresentationInput } from './hbx-presentation-email.service';
import { isValidHbxEmail, normalizeHbxEmail } from './hbx-email-intent.util';
import { MailAttachment, MailSendResult } from './mail.service';

// PR12062026005: apresentação comercial do VENDAS enviada pelo e-mail DA
// EMPRESA. Anexos (PPTX/cartão) vêm do CompanyEmailAsset da própria empresa e
// o transporte é o CompanyMailerService — SMTP do tenant; a empresa HBX
// compartilha só o transporte do Master (decisão interna do mailer). Nenhuma
// cópia vai pro Master. O fluxo do Master (master/email/send →
// HbxPresentationEmailService) segue intocado.

export const COMPANY_EMAIL_CONFIG_HINT = 'Ative e configure em Configurações → E-mail.';

export type CompanyEmailAssetMetaPayload = {
  originalName: string;
  mimeType: string | null;
  size: number;
  uploadedAt: string | null;
  previewDataUrl?: string;
};

export type CompanyPresentationSenderSummary = CompanySenderSummary & {
  enabled: boolean;
  usable: boolean;
};

export type CompanyPresentationEmailPreview = {
  recipientName: string;
  recipientEmail: string;
  subject: string;
  text: string;
  html: string;
  attachment: CompanyEmailAssetMetaPayload | null;
  businessCard: CompanyEmailAssetMetaPayload | null;
  senderSummary: CompanyPresentationSenderSummary;
  warnings: string[];
};

export type CompanyPresentationEmailResult = {
  ok: boolean;
  sentAt: string;
  recipientName: string;
  recipientEmail: string;
  subject: string;
  attachment: CompanyEmailAssetMetaPayload | null;
  businessCard: CompanyEmailAssetMetaPayload | null;
  copyRecipients: string[];
  delivery: MailSendResult;
  sentBy: number | null;
  source: SendHbxPresentationInput['source'];
};

@Injectable()
export class CompanyPresentationEmailService {
  private readonly logger = new Logger(CompanyPresentationEmailService.name);

  constructor(
    private readonly companyMailer: CompanyMailerService,
    private readonly settingsService: CompanyEmailSettingsService,
    private readonly emailTemplates: EmailTemplateService,
    private readonly hbxPresentationEmails: HbxPresentationEmailService,
  ) {}

  private normalizeCompanyId(companyId?: number | null) {
    const normalized = Math.trunc(Number(companyId || 0));
    if (!normalized || normalized <= 0) {
      throw new BadRequestException('Contexto de empresa obrigatório para enviar e-mail.');
    }
    return normalized;
  }

  private buildVariables(input: SendHbxPresentationInput, recipientName: string, recipientEmail: string) {
    return {
      nome: recipientName,
      email: recipientEmail,
      empresa: String(input.companyName || '').trim(),
      ano: new Date().getFullYear(),
    };
  }

  private buildNotConfiguredWarning(readiness: Awaited<ReturnType<CompanyMailerService['isReadyForCompany']>>) {
    if (!readiness.enabled) {
      return `E-mail da empresa desativado. ${COMPANY_EMAIL_CONFIG_HINT}`;
    }
    const missing = readiness.sender.missing.filter(Boolean).join(', ');
    return missing
      ? `E-mail da empresa incompleto (falta: ${missing}). ${COMPANY_EMAIL_CONFIG_HINT}`
      : `E-mail da empresa não configurado. ${COMPANY_EMAIL_CONFIG_HINT}`;
  }

  private async readBusinessCardMeta(companyId: number, includePreview = false): Promise<CompanyEmailAssetMetaPayload | null> {
    const meta = await this.settingsService.readAssetMeta(companyId, 'business_card');
    if (!meta) return null;
    if (!includePreview) return meta;
    const asset = await this.settingsService.readAssetContent(companyId, 'business_card');
    if (!asset) return meta;
    return {
      ...meta,
      previewDataUrl: `data:${asset.contentType};base64,${asset.content.toString('base64')}`,
    };
  }

  async previewPresentationForCompany(companyId: number, input: SendHbxPresentationInput): Promise<CompanyPresentationEmailPreview> {
    const normalizedCompanyId = this.normalizeCompanyId(companyId);
    const recipientName = this.hbxPresentationEmails.normalizeName(input.recipientName) || 'cliente';
    const recipientEmail = normalizeHbxEmail(input.recipientEmail);
    const readiness = await this.companyMailer.isReadyForCompany(normalizedCompanyId);
    const attachmentMeta = await this.settingsService.readAssetMeta(normalizedCompanyId, 'presentation_pptx');
    const businessCardMeta = await this.readBusinessCardMeta(normalizedCompanyId, true);
    const hasBusinessCard = Boolean(businessCardMeta);

    const variables = this.buildVariables(input, recipientName, recipientEmail);
    const subjectSource = this.emailTemplates.normalizeSubject(input.subject);
    const textSource = this.emailTemplates.normalizeText(input.text);
    const htmlSource = input.html === undefined ? null : this.emailTemplates.sanitizeHtml(String(input.html || '')) || null;
    const renderedSubject = this.emailTemplates.renderString(subjectSource, variables);
    const renderedText = this.emailTemplates.renderString(textSource, variables);
    const renderedHtml = htmlSource ? this.emailTemplates.renderString(htmlSource, variables) : null;

    const warnings: string[] = [];
    if (!readiness.usable) warnings.push(this.buildNotConfiguredWarning(readiness));
    warnings.push('Envio manual por card. Não é disparo em massa.');
    if (!recipientEmail) warnings.push('Preencha um e-mail de destino antes de enviar.');
    if (recipientEmail && !isValidHbxEmail(recipientEmail)) warnings.push('Revise o e-mail de destino antes de enviar.');
    if (!attachmentMeta) warnings.push('A apresentação PPTX da empresa ainda não foi configurada (Configurações → E-mail).');

    return {
      recipientName,
      recipientEmail: recipientEmail || '',
      subject: renderedSubject,
      text: renderedText,
      html: this.emailTemplates.buildHtmlEmail(renderedText, {
        html: renderedHtml,
        appendHtml: hasBusinessCard ? this.hbxPresentationEmails.buildBusinessCardHtml() : null,
      }),
      attachment: attachmentMeta,
      businessCard: businessCardMeta,
      senderSummary: { ...readiness.sender, enabled: readiness.enabled, usable: readiness.usable },
      warnings,
    };
  }

  async sendPresentationForCompany(companyId: number, input: SendHbxPresentationInput): Promise<CompanyPresentationEmailResult> {
    const normalizedCompanyId = this.normalizeCompanyId(companyId);
    const recipientName = this.hbxPresentationEmails.normalizeName(input.recipientName) || 'cliente';
    const recipientEmail = normalizeHbxEmail(input.recipientEmail);
    if (!recipientEmail) throw new BadRequestException('Informe o e-mail do contato.');
    if (!isValidHbxEmail(recipientEmail)) throw new BadRequestException('Informe um e-mail valido para o contato.');

    const subjectSource = this.emailTemplates.normalizeSubject(input.subject);
    const textSource = this.emailTemplates.normalizeText(input.text);
    if (!subjectSource) throw new BadRequestException('Informe o assunto do e-mail.');
    if (!textSource) throw new BadRequestException('Informe o corpo do e-mail.');

    const readiness = await this.companyMailer.isReadyForCompany(normalizedCompanyId);
    if (!readiness.usable) {
      throw new BadRequestException(this.buildNotConfiguredWarning(readiness));
    }

    const attachmentFile = await this.settingsService.readAssetContent(normalizedCompanyId, 'presentation_pptx');
    if (!attachmentFile) {
      throw new BadRequestException(`Envie o PPTX da apresentação da empresa antes de enviar. ${COMPANY_EMAIL_CONFIG_HINT}`);
    }
    const businessCardFile = await this.settingsService.readAssetContent(normalizedCompanyId, 'business_card');
    const [attachmentMeta, businessCardMeta] = await Promise.all([
      this.settingsService.readAssetMeta(normalizedCompanyId, 'presentation_pptx'),
      this.settingsService.readAssetMeta(normalizedCompanyId, 'business_card'),
    ]);

    const attachments: MailAttachment[] = [
      {
        filename: attachmentFile.meta.originalName || 'apresentacao.pptx',
        content: attachmentFile.content,
        contentType: attachmentFile.contentType,
      },
    ];
    if (businessCardFile) {
      attachments.push({
        filename: businessCardFile.meta.originalName || 'cartao-visitas.png',
        content: businessCardFile.content,
        contentType: businessCardFile.contentType,
        cid: BUSINESS_CARD_CID,
      });
    }

    const variables = this.buildVariables(input, recipientName, recipientEmail);
    const htmlSource = input.html === undefined ? null : this.emailTemplates.sanitizeHtml(String(input.html || '')) || null;
    const renderedSubject = this.emailTemplates.renderString(subjectSource, variables);
    const renderedText = this.emailTemplates.renderString(textSource, variables);
    const renderedHtml = htmlSource ? this.emailTemplates.renderString(htmlSource, variables) : null;

    const delivery = await this.companyMailer.sendForCompany(normalizedCompanyId, {
      to: recipientEmail,
      replyTo: input.replyTo || null,
      subject: renderedSubject,
      text: renderedText,
      html: this.emailTemplates.buildHtmlEmail(renderedText, {
        html: renderedHtml,
        appendHtml: businessCardFile ? this.hbxPresentationEmails.buildBusinessCardHtml() : null,
      }),
      attachments,
    });

    if (!delivery.ok && delivery.errorCode === COMPANY_EMAIL_NOT_CONFIGURED) {
      throw new BadRequestException(delivery.errorMessage || `E-mail da empresa não configurado. ${COMPANY_EMAIL_CONFIG_HINT}`);
    }
    if (!delivery.ok) {
      this.logger.warn(`Company ${normalizedCompanyId} presentation email delivery failed for ${recipientEmail}: ${delivery.errorMessage || delivery.errorCode || 'erro desconhecido'}`);
      throw new BadGatewayException(
        `Falha no envio pelo e-mail da empresa${delivery.errorMessage ? `: ${delivery.errorMessage}` : '.'} Revise o SMTP em Configurações → E-mail.`,
      );
    }

    return {
      ok: delivery.ok,
      sentAt: new Date().toISOString(),
      recipientName,
      recipientEmail,
      subject: renderedSubject,
      attachment: attachmentMeta,
      businessCard: businessCardMeta,
      copyRecipients: [],
      delivery,
      sentBy: Number(input.userId || 0) || null,
      source: input.source,
    };
  }
}
