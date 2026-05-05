import { Injectable, Logger } from '@nestjs/common';

export type MailTransportMode = 'resend' | 'smtp' | 'ethereal' | 'log';

export type MailConfigurationSummary = {
  mode: MailTransportMode;
  ready: boolean;
  resendConfigured: boolean;
  resendReady: boolean;
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

export type MailAttachment = {
  filename: string;
  content: Buffer | string;
  contentType?: string | null;
  cid?: string | null;
};

type SmtpAttempt = {
  host: string;
  port: number;
  secure: boolean;
  label: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private normalizeEnvValue(value: unknown) {
    const normalized = String(value || '').trim();
    if (!normalized) {
      return '';
    }

    const wrappedInDoubleQuotes = normalized.startsWith('"') && normalized.endsWith('"');
    const wrappedInSingleQuotes = normalized.startsWith("'") && normalized.endsWith("'");
    if (wrappedInDoubleQuotes || wrappedInSingleQuotes) {
      return normalized.slice(1, -1).trim();
    }

    return normalized;
  }

  private readEnv(key: string) {
    return this.normalizeEnvValue(process.env[key]);
  }

  private getSmtpPassword() {
    return this.readEnv('SMTP_PASS');
  }

  private getResendApiKey() {
    return this.readEnv('RESEND_API_KEY');
  }

  private isProduction() {
    return this.readEnv('NODE_ENV').toLowerCase() === 'production';
  }

  private useEtherealAuto() {
    return this.readEnv('ETHEREAL_AUTO').toLowerCase() === 'true';
  }

  private parsePort(value: string | undefined) {
    const normalized = this.normalizeEnvValue(value);
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private getConfiguredMailFrom() {
    return this.readEnv('MAIL_FROM');
  }

  private buildSmtpFromAddress() {
    const explicitFrom = this.getConfiguredMailFrom();
    if (explicitFrom) {
      return explicitFrom;
    }

    const fromName = this.readEnv('MAIL_FROM_NAME');
    const smtpUser = this.readEnv('SMTP_USER');
    if (!smtpUser) {
      return null;
    }

    return fromName ? `${fromName} <${smtpUser}>` : smtpUser;
  }

  private buildReplyToAddress(explicitReplyTo?: string | null) {
    const directReplyTo = this.normalizeEnvValue(explicitReplyTo);
    if (directReplyTo) {
      return directReplyTo;
    }

    const configuredReplyTo = this.readEnv('MAIL_REPLY_TO');
    return configuredReplyTo || null;
  }

  private buildConfigurationIncompleteError(summary: MailConfigurationSummary) {
    if (summary.mode === 'resend') {
      return `Resend configuration incomplete. Missing: ${summary.missing.join(', ')}`;
    }
    if (summary.mode === 'smtp') {
      return `SMTP configuration incomplete. Missing: ${summary.missing.join(', ')}`;
    }
    return 'Transactional email provider not configured.';
  }

  private buildOperationalReadinessFailure(summary: MailConfigurationSummary) {
    if (summary.mode === 'resend') {
      return {
        code: 'RESEND_CONFIG_INCOMPLETE',
        message: `Configuração Resend incompleta. Ajuste: ${summary.missing.join(', ')}`,
      };
    }

    if (summary.mode === 'smtp') {
      return {
        code: 'SMTP_CONFIG_INCOMPLETE',
        message: `Configuração SMTP incompleta. Ajuste: ${summary.missing.join(', ')}`,
      };
    }

    return {
      code: 'TRANSACTIONAL_PROVIDER_NOT_CONFIGURED',
      message: 'Nenhum provedor transacional configurado. Configure RESEND_API_KEY ou SMTP.',
    };
  }

  private normalizeEnvelopeList(values: unknown) {
    if (!Array.isArray(values)) {
      return [];
    }

    return values
      .map((value) => String(value || '').trim())
      .filter(Boolean);
  }

  private isGmailHost(host: string | null | undefined) {
    const normalized = String(host || '').trim().toLowerCase();
    return normalized === 'smtp.gmail.com' || normalized.endsWith('.gmail.com');
  }

  private buildSmtpAttempts(summary: MailConfigurationSummary): SmtpAttempt[] {
    const host = String(summary.host || '').trim();
    const basePort = Number(summary.port || 0);
    if (!host || !basePort) {
      return [];
    }

    const ports = [basePort];
    if (this.isGmailHost(host)) {
      if (basePort !== 465) ports.push(465);
      if (basePort !== 587) ports.push(587);
    }

    return Array.from(new Set(ports)).map((port) => ({
      host,
      port,
      secure: port === 465,
      label: `${host}:${port}`,
    }));
  }

  private isRetryableSmtpError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error || '');
    const normalized = message.toLowerCase();
    return (
      normalized.includes('connection timeout')
      || normalized.includes('timed out')
      || normalized.includes('etimedout')
      || normalized.includes('econnection')
      || normalized.includes('esocket')
      || normalized.includes('greeting never received')
    );
  }

  private createSmtpTransport(nodemailer: any, summary: MailConfigurationSummary, attempt: SmtpAttempt) {
    return nodemailer.createTransport({
      host: attempt.host,
      port: attempt.port,
      secure: attempt.secure,
      family: 4,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      auth: { user: summary.user, pass: this.getSmtpPassword() },
      tls: {
        servername: attempt.host,
      },
    });
  }

  private async deliverWithResend(
    summary: MailConfigurationSummary,
    message: { from?: string; replyTo?: string; to: string; subject: string; text: string; html?: string | null; attachments?: MailAttachment[] },
  ) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Resend } = require('resend');

    const resend = new Resend(this.getResendApiKey());
    const response = await resend.emails.send({
      from: message.from || summary.from || undefined,
      replyTo: message.replyTo || undefined,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html || undefined,
      attachments: message.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content:
          typeof attachment.content === 'string'
            ? Buffer.from(attachment.content).toString('base64')
            : attachment.content.toString('base64'),
        contentType: attachment.contentType || undefined,
      })),
    });

    if (response?.error) {
      throw new Error(String(response.error.message || response.error.name || 'Resend delivery failed'));
    }

    return {
      id: response?.data?.id ? String(response.data.id) : null,
    };
  }

  private async deliverWithSmtpFallback(
    nodemailer: any,
    summary: MailConfigurationSummary,
    message: { from?: string; replyTo?: string; to: string; subject: string; text: string; html?: string | null; attachments?: MailAttachment[] },
  ) {
    const attempts = this.buildSmtpAttempts(summary);
    let lastError: unknown = null;

    for (let index = 0; index < attempts.length; index += 1) {
      const attempt = attempts[index];
      const transporter = this.createSmtpTransport(nodemailer, summary, attempt);

      try {
        const info = await transporter.sendMail(message);
        if (index > 0) {
          this.logger.warn(`SMTP fallback succeeded via ${attempt.label} for ${message.to}`);
        }
        return info;
      } catch (error) {
        lastError = error;
        const shouldRetry = index < attempts.length - 1 && this.isRetryableSmtpError(error);
        if (!shouldRetry) {
          throw error;
        }
        this.logger.warn(`SMTP attempt ${attempt.label} failed for ${message.to}: ${error instanceof Error ? error.message : error}. Retrying with next configuration.`);
      }
    }

    throw lastError instanceof Error ? lastError : new Error('SMTP delivery failed');
  }

  getConfigurationSummary(): MailConfigurationSummary {
    const resendApiKey = this.getResendApiKey();
    const host = this.readEnv('SMTP_HOST');
    const port = this.parsePort(process.env.SMTP_PORT);
    const user = this.readEnv('SMTP_USER');
    const pass = this.getSmtpPassword();
    const configuredMailFrom = this.getConfiguredMailFrom();
    const smtpFrom = this.buildSmtpFromAddress();
    const replyTo = this.buildReplyToAddress();
    const useEthereal = !this.isProduction() && this.useEtherealAuto();
    const missing: string[] = [];

    const resendConfigured = Boolean(resendApiKey);
    const resendReady = Boolean(resendApiKey && configuredMailFrom);
    const smtpConfigured = Boolean(host);
    const smtpReady = Boolean(host && port && user && pass && smtpFrom);

    let mode: MailTransportMode = 'log';
    if (resendConfigured) {
      mode = 'resend';
      if (!configuredMailFrom) missing.push('MAIL_FROM');
    } else if (smtpConfigured) {
      mode = 'smtp';
      if (!port) missing.push('SMTP_PORT');
      if (!user) missing.push('SMTP_USER');
      if (!pass) missing.push('SMTP_PASS');
      if (!smtpFrom) missing.push('MAIL_FROM or MAIL_FROM_NAME');
    } else if (useEthereal) {
      mode = 'ethereal';
    }

    const ready = mode === 'resend'
      ? resendReady
      : mode === 'smtp'
        ? smtpReady
        : mode === 'ethereal';

    return {
      mode,
      ready,
      resendConfigured,
      resendReady,
      smtpConfigured,
      smtpReady,
      useEthereal,
      host: host || null,
      port,
      user: user || null,
      from: mode === 'resend'
        ? configuredMailFrom || null
        : mode === 'smtp'
          ? smtpFrom
          : configuredMailFrom || smtpFrom,
      replyTo,
      missing,
    };
  }

  async sendMail(input: { to: string; subject: string; text: string; html?: string | null; from?: string | null; replyTo?: string | null; attachments?: MailAttachment[] }): Promise<MailSendResult> {
    const summary = this.getConfigurationSummary();
    const from = this.normalizeEnvValue(input.from) || summary.from;
    const replyTo = this.buildReplyToAddress(input.replyTo);

    if (summary.mode === 'log') {
      if (this.isProduction()) {
        throw new Error('Transactional email provider not configured in production. Configure RESEND_API_KEY or SMTP.');
      }

      this.logger.warn(`Transactional provider not configured. Logging email locally to=${input.to} subject=${input.subject}`);
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
        errorMessage: 'Transactional provider not configured. Email logged locally.',
      };
    }

    if (summary.mode === 'ethereal') {
      // Lazy-load nodemailer only when we are actually sending.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nodemailer = require('nodemailer');

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
        html: input.html || undefined,
        attachments: input.attachments?.map((attachment) => ({
          filename: attachment.filename,
          content: attachment.content,
          contentType: attachment.contentType || undefined,
          cid: attachment.cid || undefined,
        })),
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

    if (!summary.ready) {
      throw new Error(this.buildConfigurationIncompleteError(summary));
    }

    if (summary.mode === 'resend') {
      const delivery = await this.deliverWithResend(summary, {
        from: from || undefined,
        replyTo: replyTo || undefined,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html || undefined,
        attachments: input.attachments,
      });

      return {
        ok: true,
        queued: true,
        transport: 'resend',
        previewUrl: null,
        messageId: delivery.id,
        accepted: [input.to],
        rejected: [],
        from: from || summary.from || null,
        replyTo,
        errorCode: null,
        errorMessage: null,
      };
    }

    // Lazy-load nodemailer only when we are actually sending.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodemailer = require('nodemailer');

    const info = await this.deliverWithSmtpFallback(nodemailer, summary, {
      from: from || summary.user || undefined,
      replyTo: replyTo || undefined,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html || undefined,
      attachments: input.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType || undefined,
        cid: attachment.cid || undefined,
      })),
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

    if (!summary.ready) {
      const failure = this.buildOperationalReadinessFailure(summary);
      return {
        ok: false,
        attempted: false,
        code: failure.code,
        message: failure.message,
        config: summary,
      };
    }

    try {
      const delivery = await this.sendMail({
        to: input.to,
        subject: 'HBX - teste operacional de e-mail transacional',
        text: [
          'Este é um teste operacional do fluxo transacional de e-mail do HBX.',
          '',
          `Destino validado: ${input.to}`,
          `Horário: ${new Date().toISOString()}`,
          '',
          'Se esta mensagem chegou, o envio transacional real está operacional.',
        ].join('\n'),
      });

      return {
        ok: delivery.ok,
        attempted: true,
        code: delivery.ok
          ? delivery.transport === 'resend'
            ? 'RESEND_TEST_OK'
            : 'SMTP_TEST_OK'
          : delivery.errorCode || (summary.mode === 'resend' ? 'RESEND_TEST_FAILED' : 'SMTP_TEST_FAILED'),
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
        code: summary.mode === 'resend' ? 'RESEND_TEST_FAILED' : 'SMTP_TEST_FAILED',
        message,
        config: summary,
      };
    }
  }
}
