import { Injectable, Logger } from '@nestjs/common';
import { isHbxPlatformCompany } from '../common/hbx-platform-company';
import { CompanyEmailSettingsService } from './company-email-settings.service';
import { MailAttachment, MailSendResult, MailService } from './mail.service';

// PR12062026005: transporte de e-mail POR EMPRESA.
// Regra do dono: ninguém pega carona no SMTP do Master. A ÚNICA exceção é a
// empresa HBX (HBX admin), que compartilha o transporte da plataforma — e só
// o transporte. A decisão é interna (companyId), sem endpoint master.

type CompanyMailMessage = {
  to: string;
  cc?: string | string[] | null;
  // reply-to por mensagem (ex.: reply-to da empresa no Vendas); sem ele vale o replyTo dos settings
  replyTo?: string | null;
  subject: string;
  text: string;
  html?: string | null;
  attachments?: MailAttachment[];
};

export const COMPANY_EMAIL_NOT_CONFIGURED = 'COMPANY_EMAIL_NOT_CONFIGURED';

@Injectable()
export class CompanyMailerService {
  private readonly logger = new Logger(CompanyMailerService.name);

  constructor(
    private readonly settingsService: CompanyEmailSettingsService,
    private readonly mailService: MailService,
  ) {}

  async isReadyForCompany(companyId: number) {
    const settings = await this.settingsService.getRaw(companyId);
    const sender = this.settingsService.buildSenderSummary(companyId, settings);
    const enabled = Boolean(settings?.enabled);
    return { enabled, ready: sender.ready, usable: enabled && sender.ready, sender };
  }

  async sendForCompany(companyId: number, message: CompanyMailMessage): Promise<MailSendResult> {
    const settings = await this.settingsService.getRaw(companyId);
    const sender = this.settingsService.buildSenderSummary(companyId, settings);

    if (!settings?.enabled || !sender.ready) {
      return {
        ok: false,
        queued: false,
        transport: 'smtp',
        previewUrl: null,
        messageId: null,
        accepted: [],
        rejected: [],
        from: sender.from,
        replyTo: sender.replyTo,
        errorCode: COMPANY_EMAIL_NOT_CONFIGURED,
        errorMessage: 'E-mail da empresa não configurado. Ative e configure em Configurações → E-mail.',
      };
    }

    if (isHbxPlatformCompany(companyId)) {
      // único privilégio do HBX admin: o transporte do Master
      return this.mailService.sendMail({
        to: message.to,
        cc: message.cc || undefined,
        replyTo: message.replyTo || undefined,
        subject: message.subject,
        text: message.text,
        html: message.html || undefined,
        attachments: message.attachments,
      });
    }

    const pass = this.settingsService.decryptPass(settings);
    const host = String(settings.smtpHost || '').trim();
    const basePort = Math.trunc(Number(settings.smtpPort || 0));

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodemailer = require('nodemailer');

    const ports = [basePort];
    const isGmail = host === 'smtp.gmail.com' || host.endsWith('.gmail.com');
    if (isGmail) {
      if (basePort !== 465) ports.push(465);
      if (basePort !== 587) ports.push(587);
    }
    const attempts = Array.from(new Set(ports)).filter((port) => port > 0);

    let lastError: unknown = null;
    for (let index = 0; index < attempts.length; index += 1) {
      const port = attempts[index];
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        family: 4,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
        auth: { user: settings.smtpUser, pass },
        tls: { servername: host },
      });

      try {
        const info = await transporter.sendMail({
          from: sender.from || settings.smtpUser || undefined,
          replyTo: message.replyTo || sender.replyTo || undefined,
          to: message.to,
          cc: message.cc || undefined,
          subject: message.subject,
          text: message.text,
          html: message.html || undefined,
          attachments: message.attachments?.map((attachment) => ({
            filename: attachment.filename,
            content: attachment.content,
            contentType: attachment.contentType || undefined,
            cid: attachment.cid || undefined,
          })),
        });
        if (index > 0) {
          this.logger.warn(`Company ${companyId} SMTP fallback succeeded via ${host}:${port}`);
        }
        return {
          ok: true,
          queued: true,
          transport: 'smtp',
          previewUrl: null,
          messageId: String(info?.messageId || '').trim() || null,
          accepted: Array.isArray(info?.accepted) ? info.accepted.map((item: unknown) => String(item)) : [],
          rejected: Array.isArray(info?.rejected) ? info.rejected.map((item: unknown) => String(item)) : [],
          from: sender.from,
          replyTo: sender.replyTo,
          errorCode: null,
          errorMessage: null,
        };
      } catch (error) {
        lastError = error;
        const messageText = error instanceof Error ? error.message.toLowerCase() : '';
        const retryable = messageText.includes('timeout')
          || messageText.includes('timed out')
          || messageText.includes('econn')
          || messageText.includes('esocket')
          || messageText.includes('greeting never received');
        if (index >= attempts.length - 1 || !retryable) {
          break;
        }
        this.logger.warn(`Company ${companyId} SMTP attempt ${host}:${port} failed: ${messageText}. Retrying.`);
      }
    }

    const errorMessage = lastError instanceof Error ? lastError.message : 'Falha no envio pelo SMTP da empresa.';
    this.logger.warn(`Company ${companyId} SMTP delivery failed for ${message.to}: ${errorMessage}`);
    return {
      ok: false,
      queued: false,
      transport: 'smtp',
      previewUrl: null,
      messageId: null,
      accepted: [],
      rejected: [],
      from: sender.from,
      replyTo: sender.replyTo,
      errorCode: 'COMPANY_SMTP_DELIVERY_FAILED',
      errorMessage,
    };
  }
}
