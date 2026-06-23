import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Post,
  Query,
  Redirect,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GmailOAuthService } from './gmail-oauth.service';

function buildAppUrl(): string {
  return String(process.env.APP_URL || process.env.FRONTEND_URL || '/').replace(/\/$/, '');
}

@Controller('company-email/gmail')
@UseGuards(JwtAuthGuard)
export class GmailOAuthController {
  constructor(private readonly gmailOAuth: GmailOAuthService) {}

  private userIdOf(req: any): number {
    const id = Math.trunc(Number(req?.user?.id || req?.user?.userId || 0));
    if (!id) throw new ForbiddenException('Usuario nao identificado.');
    return id;
  }

  private companyIdOf(req: any): number {
    const id = Math.trunc(Number(req?.user?.companyId || 0));
    if (!id) throw new ForbiddenException('Contexto de empresa obrigatorio.');
    return id;
  }

  /**
   * GET /company-email/gmail/connect
   * Returns { configured: false } when env vars are missing (mock-first).
   * Returns { configured: true, url } when all vars are present.
   * 403 when user lacks module or permission.
   */
  @Get('connect')
  async connect(@Req() req: any) {
    const userId = this.userIdOf(req);
    const companyId = this.companyIdOf(req);

    // Gate: module + permission (throws 403 if lacking)
    await this.gmailOAuth.assertCanConnect(userId);

    if (!this.gmailOAuth.isConfigured()) {
      return { configured: false };
    }

    const url = this.gmailOAuth.generateAuthUrl(userId, companyId);
    return { configured: true, url };
  }

  /**
   * GET /company-email/gmail/callback?code=...&state=...
   * Called by Google after consent. Validates state, exchanges code, stores tokens.
   * Redirects to frontend with gmail=ok or gmail=erro.
   */
  @Get('callback')
  @Redirect()
  async callback(@Query('code') code: string, @Query('state') state: string) {
    const base = `${buildAppUrl()}/configuracoes?sec=E-mail`;
    try {
      if (!code || !state) throw new Error('code e state sao obrigatorios.');
      await this.gmailOAuth.handleCallback(code, state);
      return { url: `${base}&gmail=ok`, statusCode: 302 };
    } catch (err: any) {
      return { url: `${base}&gmail=erro`, statusCode: 302 };
    }
  }

  /**
   * POST /company-email/gmail/disconnect
   * Marks connection as revoked and attempts best-effort Google revocation.
   */
  @Post('disconnect')
  async disconnect(@Req() req: any) {
    const userId = this.userIdOf(req);
    await this.gmailOAuth.disconnect(userId);
    return { ok: true };
  }

  /**
   * GET /company-email/gmail/status
   * Returns { configured, connected, email } — never exposes refresh token.
   */
  @Get('status')
  async status(@Req() req: any) {
    const userId = this.userIdOf(req);
    return this.gmailOAuth.getStatus(userId);
  }
}
