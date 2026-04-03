import { Body, Controller, Get, Headers, Param, Post, BadRequestException, ForbiddenException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcryptjs';
import { assertPasswordPolicy } from './password-policy';

class ResetPasswordDto {
  password: string;
}

class TransactionalEmailTestDto {
  to: string;
}

@Controller('internal')
export class InternalController {
  constructor(
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
  ) {}

  private assertInternalSecret(secret?: string) {
    const expected = process.env.INTERNAL_SECRET;
    if (!expected) throw new BadRequestException('INTERNAL_SECRET not configured');
    if (!secret || secret !== expected) throw new ForbiddenException('invalid internal secret');
  }

  @Get('mail/config-summary')
  getTransactionalMailConfigSummary(@Headers('x-internal-secret') secret?: string) {
    this.assertInternalSecret(secret);

    const config = this.mailService.getConfigurationSummary();
    return {
      ok: Boolean(config.smtpConfigured && config.smtpReady),
      code: !config.smtpConfigured ? 'SMTP_NOT_CONFIGURED' : config.smtpReady ? 'SMTP_READY' : 'SMTP_CONFIG_INCOMPLETE',
      config,
    };
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
