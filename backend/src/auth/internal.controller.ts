import { Body, Controller, Get, Headers, Param, Post, BadRequestException, ForbiddenException } from '@nestjs/common';
import { IsEmail, IsNotEmpty } from 'class-validator';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcryptjs';
import { assertPasswordPolicy } from './password-policy';

class ResetPasswordDto {
  @IsNotEmpty()
  password: string;
}

class TransactionalEmailTestDto {
  @IsEmail()
  to: string;
}

@Controller('internal')
export class InternalController {
  constructor(
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
  ) {}

  private assertInternalSecret(secret?: string) {
    const expected = String(process.env.INTERNAL_SECRET || process.env.PROD_INTERNAL_SECRET || '').trim();
    if (!expected) throw new BadRequestException('INTERNAL_SECRET or PROD_INTERNAL_SECRET not configured');
    if (!secret || secret !== expected) throw new ForbiddenException('invalid internal secret');
  }

  private getWhatsAppModalConfigSummary() {
    const enabled = ['1', 'true', 'yes', 'on'].includes(
      String(process.env.WHATSAPP_MODAL_ENABLED || '').trim().toLowerCase(),
    );
    const internalUrl = String(process.env.WHATSAPP_MODAL_INTERNAL_URL || '').trim().replace(/\/+$/, '');
    const apiKey = String(process.env.WHATSAPP_MODAL_API_KEY || '').trim();
    const timeoutMs = Number(process.env.WHATSAPP_MODAL_TIMEOUT_MS || 15000);
    const missing: string[] = [];

    if (enabled && !internalUrl) missing.push('WHATSAPP_MODAL_INTERNAL_URL');
    if (enabled && !apiKey) missing.push('WHATSAPP_MODAL_API_KEY');

    const configured = enabled && missing.length === 0;
    const code = !enabled
      ? 'WHATSAPP_MODAL_DISABLED'
      : configured
        ? 'WHATSAPP_MODAL_READY'
        : 'WHATSAPP_MODAL_CONFIG_INCOMPLETE';

    return {
      ok: !enabled || configured,
      code,
      config: {
        enabled,
        configured,
        internalUrl: internalUrl || null,
        apiKeyPresent: Boolean(apiKey),
        timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 15000,
        missing,
      },
    };
  }

  @Get('mail/config-summary')
  getTransactionalMailConfigSummary(@Headers('x-internal-secret') secret?: string) {
    this.assertInternalSecret(secret);

    const config = this.mailService.getConfigurationSummary();
    const code = config.ready
      ? config.mode === 'resend'
        ? 'RESEND_READY'
        : config.mode === 'smtp'
          ? 'SMTP_READY'
          : config.mode === 'ethereal'
            ? 'ETHEREAL_READY'
            : 'LOG_READY'
      : config.mode === 'resend'
        ? 'RESEND_CONFIG_INCOMPLETE'
        : config.mode === 'smtp'
          ? 'SMTP_CONFIG_INCOMPLETE'
          : 'TRANSACTIONAL_PROVIDER_NOT_CONFIGURED';

    return {
      ok: Boolean(config.ready),
      code,
      config,
    };
  }

  @Get('whatsapp-modal/config-summary')
  getWhatsAppModalConfig(@Headers('x-internal-secret') secret?: string) {
    this.assertInternalSecret(secret);
    return this.getWhatsAppModalConfigSummary();
  }

  @Post('users/:id/reset-password')
  async resetPassword(
    @Param('id') id: string,
    @Body() body: ResetPasswordDto,
    @Headers('x-internal-secret') secret?: string,
  ) {
    this.assertInternalSecret(secret);

    const userId = Number(id);
    if (!userId) throw new BadRequestException('invalid user id');
    if (!body || typeof body.password !== 'string' || body.password.trim().length === 0) {
      throw new BadRequestException('password required');
    }

    assertPasswordPolicy(body.password);

    const hashed = await bcrypt.hash(body.password, 12);
    const user = await this.usersService.setPassword(userId, hashed);
    return { ok: true, id: user.id, email: user.email };
  }

  @Post('mail/test-transactional-email')
  async testTransactionalEmail(
    @Body() body: TransactionalEmailTestDto,
    @Headers('x-internal-secret') secret?: string,
  ) {
    this.assertInternalSecret(secret);

    const to = String(body?.to || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!to || !emailRegex.test(to)) {
      throw new BadRequestException('target email required');
    }

    return this.mailService.sendOperationalTestEmail({ to });
  }
}
