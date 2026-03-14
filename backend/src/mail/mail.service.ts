import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async sendMail(input: { to: string; subject: string; text: string }) {
    // Minimal, safe default: log email content unless SMTP is configured.
    // If you want real email sending, set SMTP env vars and add a provider.
    const host = process.env.SMTP_HOST;
    if (!host) {
      // No SMTP configured: support Ethereal auto-send for local testing when enabled.
      const useEthereal = String(process.env.ETHEREAL_AUTO || '').toLowerCase() === 'true';
      if (!useEthereal) {
        this.logger.warn(`SMTP not configured. Would send to=${input.to} subject=${input.subject}`);
        this.logger.log(input.text);
        return { queued: false };
      }

      // Lazy-load nodemailer
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
        from: process.env.MAIL_FROM || testAccount.user,
        to: input.to,
        subject: input.subject,
        text: input.text,
      });

      const previewUrl = nodemailer.getTestMessageUrl(info) || null;
      this.logger.log(`Ethereal preview URL: ${previewUrl}`);
      return { queued: true, previewUrl };
    }

    // Lazy-load nodemailer only when configured.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodemailer = require('nodemailer');

    const port = Number(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.MAIL_FROM || user;

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });

    await transporter.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
    });

    return { queued: true };
  }
}
