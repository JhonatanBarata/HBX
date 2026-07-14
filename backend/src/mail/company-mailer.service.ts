import { Injectable, Logger } from '@nestjs/common';
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
  // Automações não podem tentar outro transporte após um resultado SMTP
  // incerto, pois isso pode duplicar a mensagem já aceita pelo provedor.
  disableTransportFallback?: boolean;
};

export const COMPANY_EMAIL_NOT_CONFIGURED = 'COMPANY_EMAIL_NOT_CONFIGURED';
export const COMPANY_EMAIL_RECIPIENT_REJECTED = 'COMPANY_EMAIL_RECIPIENT_REJECTED';

@Injectable()
export class CompanyMailerService {
  private readonly logger = new Logger(CompanyMailerService.name);

  constructor(
    private readonly settingsService: CompanyEmailSettingsService,
    private readonly mailService: MailService,
  ) {}

  async isReadyForCompany(companyId: number) {
    const settings = await this.settingsService.getRaw(companyId);
    const sender = await this.settingsService.buildSenderSummary(companyId, settings);
    const enabled = Boolean(settings?.enabled);
    return { enabled, ready: sender.ready, usable: enabled && sender.ready, sender };
  }

  async sendForCompany(companyId: number, message: CompanyMailMessage): Promise<MailSendResult> {
    const settings = await this.settingsService.getRaw(companyId);
    const sender = await this.settingsService.buildSenderSummary(companyId, settings);

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

    if (await this.settingsService.isHbxSharedCompany(companyId)) {
      // único privilégio do HBX admin: o transporte do Master
      const result = await this.mailService.sendMail({
        to: message.to,
        cc: message.cc || undefined,
        replyTo: message.replyTo || undefined,
        subject: message.subject,
        text: message.text,
        html: message.html || undefined,
        attachments: message.attachments,
        disableTransportFallback: message.disableTransportFallback,
      });
      if (result.ok && result.accepted.length === 0 && result.rejected.length > 0) {
        return {
          ...result,
          ok: false,
          queued: false,
          errorCode: COMPANY_EMAIL_RECIPIENT_REJECTED,
          errorMessage: 'O provedor recusou o destinatário.',
        };
      }
      return result;
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
    const effectiveAttempts = message.disableTransportFallback ? attempts.slice(0, 1) : attempts;

    let lastError: unknown = null;
    for (let index = 0; index < effectiveAttempts.length; index += 1) {
      const port = effectiveAttempts[index];
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
        const accepted = Array.isArray(info?.accepted) ? info.accepted.map((item: unknown) => String(item)) : [];
        const rejected = Array.isArray(info?.rejected) ? info.rejected.map((item: unknown) => String(item)) : [];
        if (accepted.length === 0 && rejected.length > 0) {
          return {
            ok: false,
            queued: false,
            transport: 'smtp',
            previewUrl: null,
            messageId: String(info?.messageId || '').trim() || null,
            accepted,
            rejected,
            from: sender.from,
            replyTo: sender.replyTo,
            errorCode: COMPANY_EMAIL_RECIPIENT_REJECTED,
            errorMessage: 'O provedor recusou o destinatário.',
          };
        }
        return {
          ok: true,
          queued: true,
          transport: 'smtp',
          previewUrl: null,
          messageId: String(info?.messageId || '').trim() || null,
          accepted,
          rejected,
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
        if (index >= effectiveAttempts.length - 1 || !retryable) {
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
