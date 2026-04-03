import { Injectable, Logger } from '@nestjs/common';

export type MailTransportMode = 'smtp' | 'ethereal' | 'log';

export type MailConfigurationSummary = {
  mode: MailTransportMode;
  smtpConfigured: boolean;
  smtpReady: boolean;
  useEthereal: boolean;
  host: string | null;
  port: number | null;
  user: string | null;
  from: string | null;
  replyTo: string | null;
  missing: string[];
};

export type MailSendResult = {
  ok: boolean;
  queued: boolean;
  transport: MailTransportMode;
  previewUrl: string | null;
  messageId: string | null;
  accepted: string[];
  rejected: string[];
  from: string | null;
  replyTo: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private isProduction() {
    return String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
  }

  private useEtherealAuto() {
    return String(process.env.ETHEREAL_AUTO || '').trim().toLowerCase() === 'true';
  }

  private parsePort(value: string | undefined) {
    const normalized = String(value || '').trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private buildFromAddress() {
    const explicitFrom = String(process.env.MAIL_FROM || '').trim();
    if (explicitFrom) {
      return explicitFrom;
    }

    const fromName = String(process.env.MAIL_FROM_NAME || '').trim();
    const smtpUser = String(process.env.SMTP_USER || '').trim();
    if (!smtpUser) {
      return null;
    }

    return fromName ? `${fromName} <${smtpUser}>` : smtpUser;
  }

  private buildReplyToAddress(explicitReplyTo?: string | null) {
    const directReplyTo = String(explicitReplyTo || '').trim();
    if (directReplyTo) {
      return directReplyTo;
    }

    const configuredReplyTo = String(process.env.MAIL_REPLY_TO || '').trim();
    return configuredReplyTo || null;
  }

  private normalizeEnvelopeList(values: unknown) {
    if (!Array.isArray(values)) {
      return [];
    }

    return values
      .map((value) => String(value || '').trim())
      .filter(Boolean);
  }

  getConfigurationSummary(): MailConfigurationSummary {
    const host = String(process.env.SMTP_HOST || '').trim();
    const port = this.parsePort(process.env.SMTP_PORT);
    const user = String(process.env.SMTP_USER || '').trim();
    const pass = String(process.env.SMTP_PASS || '').trim();
    const from = this.buildFromAddress();
    const replyTo = this.buildReplyToAddress();
    const useEthereal = this.useEtherealAuto();
    const missing: string[] = [];

    if (host) {
      if (!port) missing.push('SMTP_PORT');
      if (!user) missing.push('SMTP_USER');
      if (!pass) missing.push('SMTP_PASS');
      if (!from) missing.push('MAIL_FROM or MAIL_FROM_NAME');
    }

    return {
      mode: host ? 'smtp' : useEthereal ? 'ethereal' : 'log',
      smtpConfigured: Boolean(host),
      smtpReady: Boolean(host && port && user && pass && from),
      useEthereal,
      host: host || null,
      port,
      user: user || null,
      from,
      replyTo,
      missing,
    };
  }

  async sendMail(input: { to: string; subject: string; text: string; from?: string | null; replyTo?: string | null }): Promise<MailSendResult> {
    const summary = this.getConfigurationSummary();
    const from = String(input.from || '').trim() || summary.from;
    const replyTo = this.buildReplyToAddress(input.replyTo);

    if (summary.mode === 'log') {
      if (this.isProduction()) {
        throw new Error('SMTP not configured for transactional email in production.');
      }

      this.logger.warn(`SMTP not configured. Logging transactional email locally to=${input.to} subject=${input.subject}`);
      this.logger.log(input.text);
      return {
        ok: false,
        queued: false,
        transport: 'log',
        previewUrl: null,
        messageId: null,
        accepted: [],
        rejected: [],
        from: from || null,
        replyTo,
        errorCode: 'MAIL_DISABLED_LOCALLY',
        errorMessage: 'SMTP not configured. Email logged locally.',
      };
    }

    // Lazy-load nodemailer only when we are actually sending.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodemailer = require('nodemailer');

    if (summary.mode === 'ethereal') {
      this.logger.log('Creating Ethereal test account for local email preview');
      const testAccount = await nodemailer.createTestAccount();
      const transporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });

      const info = await transporter.sendMail({
        from: from || testAccount.user,
        replyTo: replyTo || undefined,
        to: input.to,
        subject: input.subject,
        text: input.text,
      });

      const previewUrl = nodemailer.getTestMessageUrl(info) || null;
      this.logger.log(`Ethereal preview URL: ${previewUrl}`);
      return {
        ok: true,
        queued: true,
        transport: 'ethereal',
        previewUrl,
        messageId: String(info?.messageId || '').trim() || null,
        accepted: this.normalizeEnvelopeList(info?.accepted),
        rejected: this.normalizeEnvelopeList(info?.rejected),
        from: from || testAccount.user,
        replyTo,
        errorCode: null,
        errorMessage: null,
      };
    }

    if (!summary.smtpReady) {
      throw new Error(`SMTP configuration incomplete. Missing: ${summary.missing.join(', ')}`);
    }

    const pass = String(process.env.SMTP_PASS || '').trim();
    const transporter = nodemailer.createTransport({
      host: summary.host,
      port: summary.port,
      secure: summary.port === 465,
      auth: { user: summary.user, pass },
    });

    const info = await transporter.sendMail({
      from: from || summary.user || undefined,
      replyTo: replyTo || undefined,
      to: input.to,
      subject: input.subject,
      text: input.text,
    });

    return {
      ok: true,
      queued: true,
      transport: 'smtp',
      previewUrl: null,
      messageId: String(info?.messageId || '').trim() || null,
      accepted: this.normalizeEnvelopeList(info?.accepted),
      rejected: this.normalizeEnvelopeList(info?.rejected),
      from: from || summary.user || null,
      replyTo,
      errorCode: null,
      errorMessage: null,
    };
  }

  async sendOperationalTestEmail(input: { to: string }) {
    const summary = this.getConfigurationSummary();

    if (!summary.smtpConfigured) {
      return {
        ok: false,
        attempted: false,
        code: 'SMTP_NOT_CONFIGURED',
        message: 'SMTP_HOST não está configurado para envio transacional real.',
        config: summary,
      };
    }

    if (!summary.smtpReady) {
      return {
        ok: false,
        attempted: false,
        code: 'SMTP_CONFIG_INCOMPLETE',
        message: `Configuração SMTP incompleta. Ajuste: ${summary.missing.join(', ')}`,
        config: summary,
      };
    }

    try {
      // Lazy-load nodemailer only when running the real SMTP test.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: summary.host,
        port: summary.port,
        secure: summary.port === 465,
        auth: {
          user: summary.user,
          pass: String(process.env.SMTP_PASS || '').trim(),
        },
      });

      await transporter.verify();
      const delivery = await this.sendMail({
        to: input.to,
        subject: 'HBX - teste operacional de e-mail transacional',
        text: [
          'Este é um teste operacional do fluxo transacional de e-mail do HBX.',
          '',
          `Destino validado: ${input.to}`,
          `Horário: ${new Date().toISOString()}`,
          '',
          'Se esta mensagem chegou, o SMTP real está operacional.',
        ].join('\n'),
      });

      return {
        ok: delivery.ok,
        attempted: true,
        code: delivery.ok ? 'SMTP_TEST_OK' : delivery.errorCode || 'SMTP_TEST_FAILED',
        message: delivery.ok
          ? 'E-mail transacional enviado com sucesso.'
          : delivery.errorMessage || 'Falha no envio do teste transacional.',
        config: summary,
        delivery,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Transactional email operational test failed for ${input.to}`, error instanceof Error ? error.stack : undefined);
      return {
        ok: false,
        attempted: true,
        code: 'SMTP_TEST_FAILED',
        message,
        config: summary,
      };
    }
  }
}
