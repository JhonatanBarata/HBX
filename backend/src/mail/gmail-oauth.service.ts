import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationSecretsService } from '../integrations/integration-secrets.service';
import { ModulesService } from '../modules/modules.service';
import { hasEffectiveTeamAccess } from '../team/team-access-runtime';

const GMAIL_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.send'];

@Injectable()
export class GmailOAuthService {
  private readonly logger = new Logger(GmailOAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: IntegrationSecretsService,
    private readonly modulesService: ModulesService,
  ) {}

  isConfigured(): boolean {
    return Boolean(
      process.env.GMAIL_OAUTH_CLIENT_ID &&
      process.env.GMAIL_OAUTH_CLIENT_SECRET &&
      process.env.GMAIL_OAUTH_REDIRECT_URI,
    );
  }

  private getOAuthClient() {
    // Lazy import to avoid crashing at startup when google-auth-library is not installed
    // (already used by auth.service.ts so it will be available)
    const { OAuth2Client } = require('google-auth-library');
    return new OAuth2Client(
      process.env.GMAIL_OAUTH_CLIENT_ID,
      process.env.GMAIL_OAUTH_CLIENT_SECRET,
      process.env.GMAIL_OAUTH_REDIRECT_URI,
    );
  }

  // ── State HMAC ────────────────────────────────────────────────────────────
  private stateSecret(): string {
    return String(process.env.INTEGRATION_SECRET_KEY || process.env.JWT_SECRET || '').trim();
  }

  buildState(userId: number, companyId: number): string {
    const payload = `${userId}:${companyId}:${Date.now()}`;
    const sig = createHmac('sha256', this.stateSecret())
      .update(payload)
      .digest('hex');
    return Buffer.from(`${payload}|${sig}`).toString('base64url');
  }

  verifyState(state: string): { userId: number; companyId: number } {
    let raw: string;
    try {
      raw = Buffer.from(state, 'base64url').toString('utf8');
    } catch {
      throw new ForbiddenException('State OAuth invalido.');
    }
    const lastPipe = raw.lastIndexOf('|');
    if (lastPipe === -1) throw new ForbiddenException('State OAuth invalido.');
    const payload = raw.slice(0, lastPipe);
    const sig = raw.slice(lastPipe + 1);
    const expected = createHmac('sha256', this.stateSecret())
      .update(payload)
      .digest('hex');
    if (!timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
      throw new ForbiddenException('Assinatura do state invalida.');
    }
    const parts = payload.split(':');
    if (parts.length < 3) throw new ForbiddenException('State OAuth malformado.');
    const userId = Math.trunc(Number(parts[0]));
    const companyId = Math.trunc(Number(parts[1]));
    if (!userId || !companyId) throw new ForbiddenException('State OAuth: userId/companyId invalido.');
    return { userId, companyId };
  }

  // ── Auth URL ──────────────────────────────────────────────────────────────
  generateAuthUrl(userId: number, companyId: number): string {
    const client = this.getOAuthClient();
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: true,
      scope: GMAIL_SCOPES,
      state: this.buildState(userId, companyId),
    });
  }

  // ── Callback: exchange code → store tokens ────────────────────────────────
  async handleCallback(code: string, state: string): Promise<void> {
    const { userId, companyId } = this.verifyState(state);
    const client = this.getOAuthClient();

    const tokenResponse = await client.getToken(code);
    const tokens = tokenResponse.tokens;

    // Decode id_token to get email (openid scope was requested)
    let email: string | null = null;
    if (tokens.id_token) {
      try {
        const ticket = await client.verifyIdToken({
          idToken: tokens.id_token,
          audience: process.env.GMAIL_OAUTH_CLIENT_ID!,
        });
        email = ticket.getPayload()?.email || null;
      } catch (err) {
        this.logger.warn(`GmailOAuth: nao foi possivel verificar id_token: ${err}`);
        // Fallback: decode JWT payload without verification (not sensitive — just for display)
        try {
          const [, payloadB64] = tokens.id_token.split('.');
          const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
          email = decoded.email || null;
        } catch {
          // leave email null
        }
      }
    }

    const refreshTokenCiphertext = tokens.refresh_token
      ? this.secrets.encryptSecret(tokens.refresh_token)
      : null;

    const scope = tokens.scope || null;

    await this.prisma.gmailConnection.upsert({
      where: { userId },
      create: {
        userId,
        companyId,
        email,
        refreshTokenCiphertext,
        scope,
        status: 'connected',
        lastError: null,
      },
      update: {
        companyId,
        email,
        ...(refreshTokenCiphertext ? { refreshTokenCiphertext } : {}),
        scope,
        status: 'connected',
        lastError: null,
      },
    });
  }

  // ── Disconnect ────────────────────────────────────────────────────────────
  async disconnect(userId: number): Promise<void> {
    const existing = await this.prisma.gmailConnection.findUnique({ where: { userId } });
    if (!existing) return;

    // Attempt best-effort revocation on Google side
    if (existing.refreshTokenCiphertext) {
      try {
        const refreshToken = this.secrets.decryptSecret(existing.refreshTokenCiphertext);
        if (refreshToken) {
          const client = this.getOAuthClient();
          await client.revokeToken(refreshToken);
        }
      } catch (err) {
        this.logger.warn(`GmailOAuth: revocacao no Google falhou (ignorado): ${err}`);
      }
    }

    await this.prisma.gmailConnection.update({
      where: { userId },
      data: { status: 'revoked', refreshTokenCiphertext: null },
    });
  }

  // ── Status ────────────────────────────────────────────────────────────────
  async getStatus(userId: number): Promise<{ configured: boolean; connected: boolean; email: string | null }> {
    const configured = this.isConfigured();
    const row = await this.prisma.gmailConnection.findUnique({
      where: { userId },
      select: { status: true, email: true },
    });
    const connected = Boolean(row && row.status !== 'revoked');
    return { configured, connected, email: connected ? (row?.email ?? null) : null };
  }

  // ── Guard helpers ─────────────────────────────────────────────────────────
  async assertCanConnect(userId: number): Promise<void> {
    const hasModule = await this.modulesService.canUserAccessModule(userId, 'email');
    if (!hasModule) throw new ForbiddenException('Modulo e-mail nao disponivel.');

    const user = { id: userId };
    const hasPerm = await hasEffectiveTeamAccess(this.prisma, user, 'communication.email.gmailConnect');
    if (!hasPerm) throw new ForbiddenException('Sem permissao para conectar Gmail (communication.email.gmailConnect).');
  }
}
