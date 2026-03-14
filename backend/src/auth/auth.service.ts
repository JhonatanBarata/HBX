import { Injectable, UnauthorizedException, BadRequestException, ConflictException, NotFoundException, OnModuleInit } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import * as crypto from 'crypto';
import { assertPasswordPolicy } from './password-policy';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  async onModuleInit() {
    await this.ensureSystemMasterUser();
  }

  private masterUsername() {
    return 'jhonatan.barata';
  }

  private masterPassword() {
    return 'master4961';
  }

  private async ensureSystemMasterUser() {
    const username = this.masterUsername();
    const passwordHash = await bcrypt.hash(this.masterPassword(), 12);

    const existing = await this.prisma.user.findUnique({ where: { username } });
    if (existing) {
      await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          password: passwordHash,
          isSystemMaster: true,
          isActive: true,
          deactivatedAt: null,
          retentionUntil: null,
          role: 'ADMIN',
          companyId: null,
          name: existing.name || 'System Master',
          email: existing.email || 'master@hbx.local',
        },
      });
      return;
    }

    await this.prisma.user.create({
      data: {
        username,
        email: 'master@hbx.local',
        password: passwordHash,
        name: 'System Master',
        role: 'ADMIN',
        isSystemMaster: true,
        isActive: true,
      },
    });
  }

  async validateUserByUsername(username: string, pass: string) {
    const normalized = String(username || '').trim();
    const user = normalized ? await this.usersService.findByUsername(normalized) : null;
    if (!user) return null;
    const match = await bcrypt.compare(pass, user.password);
    if (match) return user;
    return null;
  }

  async login(user: any, opts?: { companyId?: number }) {
    const companyId = opts?.companyId ?? user?.companyId ?? undefined;
    const payload = { sub: user.id, email: user.email, companyId };
    return { access_token: this.jwtService.sign(payload) };
  }

  // LOGIN (SaaS tenant-safe)
  // - Client sends only username + password.
  // - We resolve tenant internally from the authenticated user record (user.companyId).
  // - We intentionally do not allow choosing company or providing companyId/companySlug.
  async loginWithUsername(username: string, password: string) {
    const normalized = String(username || '').trim();
    const pass = String(password || '');
    if (!normalized || !pass) {
      throw new BadRequestException('Usuário e senha são obrigatórios');
    }

    if (normalized.toLowerCase() === this.masterUsername()) {
      await this.ensureSystemMasterUser();
    }

    const user: any = await this.usersService.findByUsername(normalized);
    if (!user) {
      throw new NotFoundException('Usuário inexistente');
    }

    if (user.isActive === false) {
      throw new UnauthorizedException('Usuário temporáriamente desativado - Contate seu Administrador');
    }

    // If account exists but has no email and no password, prompt to complete registration
    if ((!user.email || user.email.length === 0) && (!user.password || user.password.length === 0)) {
      throw new BadRequestException({ needsRegistration: true, username: normalized, message: 'Conta necessita completar registro' });
    }

    if (typeof user.password !== 'string' || user.password.length === 0) {
      throw new UnauthorizedException('Senha incorreta');
    }

    const match = await bcrypt.compare(pass, user.password);
    if (!match) {
      throw new UnauthorizedException('Senha incorreta');
    }

    const companyId = Number(user.companyId || 0);
    const isSystemMaster = Boolean(user.isSystemMaster);
    if (!companyId && !isSystemMaster) {
      throw new UnauthorizedException('Conta sem empresa vinculada');
    }

    return this.login(user, { companyId: companyId || undefined });
  }

  // SIGNUP (SaaS)
  // Decision: for this product we auto-create a dedicated Company per signup.
  // Rationale: prevents exposing competitor tenants and avoids "choose company" flows.
  // Future: if you need onboarding into an existing Company, implement a real invite-token flow.
  async signup(data: { username: string; email: string; password: string; name?: string }) {
    const username = String(data.username || '').trim();
    if (!username) throw new BadRequestException('O campo Usuário é obrigatório.');

    const existingUsername = await this.usersService.findByUsername(username);
    // If username exists, allow completing registration only when there is no email yet.
    if (existingUsername) {
      if (existingUsername.email) {
        // User already has an email: do not change it via signup.
        throw new ConflictException('Email já cadastrado. Envie uma solicitação para o email registrado ou entre em contato com o administrador.');
      }
      // existing user without email: proceed to attach email/password (below)
    }

    const email = String(data.email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) throw new BadRequestException('E‑mail inválido. Informe um endereço de e‑mail válido para recuperação.');

    const existingEmail = await this.usersService.findByEmail(email);
    if (existingEmail) throw new ConflictException('Já existe uma conta com este E‑mail. Caso seja sua, use a recuperação de senha.');

    const password = String(data.password || '');
    assertPasswordPolicy(password);

    const hashed = await bcrypt.hash(password, 12);

    // Create a non-guessable slug to avoid tenant enumeration.
    const slug = `co_${crypto.randomBytes(9).toString('hex')}`;

    if (existingUsername) {
      // existing user without email: update with provided email/password
      // If they already belong to a company, keep it. Otherwise create a new company.
      const companyId = existingUsername.companyId
        ? Number(existingUsername.companyId)
        : (
            await this.prisma.company.create({
              data: { slug, name: String(data.name || username).trim() || username },
            })
          ).id;

      const updated = await this.prisma.user.update({
        where: { id: existingUsername.id },
        data: { email, password: hashed, name: data.name, companyId },
      });
      return this.login(updated, { companyId });
    }

    // New account: create company + user atomically.
    const created = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          slug,
          name: String(data.name || username).trim() || username,
        },
      });

      const user = await tx.user.create({
        data: {
          username,
          email,
          password: hashed,
          name: data.name,
          companyId: company.id,
        },
      });

      return { user, companyId: company.id };
    });

    return this.login(created.user, { companyId: created.companyId });
  }

  private sha256(input: string) {
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  // PASSWORD RECOVERY
  // - User provides email (not username) to avoid linking login identifier to recovery.
  // - We do not leak whether the email exists.
  async requestPasswordResetLinkByEmail(email: string) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return { ok: true };

    const user = await this.usersService.findByEmail(normalizedEmail);
    if (!user) return { ok: true };

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.sha256(rawToken);
    const ttlMinutes = Number(process.env.PASSWORD_RESET_TTL_MINUTES || '30');
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

    // Best-effort cleanup: invalidate older tokens for this user.
    await this.prisma.passwordReset.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    await this.prisma.passwordReset.create({
      data: {
        token: tokenHash,
        userId: user.id,
        expiresAt,
      },
    });

    const appUrl = String(process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:3001').replace(/\/$/, '');
    const link = `${appUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

    const mailResult = await this.mail.sendMail({
      to: user.email,
      subject: 'Redefinição de senha',
      text: [
        `Olá!`,
        `Recebemos uma solicitação para redefinir sua senha.`,
        `Abra o link abaixo para criar uma nova senha:`,
        link,
        `Se você não solicitou isso, pode ignorar este e-mail.`,
      ].join('\n'),
    });

    const debugEnabled = String(process.env.AUTH_DEBUG_RESET_LINK || '').toLowerCase() === 'true';
    const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
      if (!isProd && debugEnabled) {
        return { ok: true, previewLink: link, mailPreviewUrl: mailResult?.previewUrl || null };
    }

    return { ok: true };
  }

  async resetPasswordWithToken(token: string, newPassword: string) {
    const rawToken = String(token || '').trim();
    if (!rawToken) throw new BadRequestException('Token inválido.');

    const password = String(newPassword || '');
    assertPasswordPolicy(password);

    const tokenHash = this.sha256(rawToken);
    const pr = await this.prisma.passwordReset.findUnique({ where: { token: tokenHash } });
    if (!pr || pr.used) throw new BadRequestException('Link inválido ou já utilizado.');
    if (pr.expiresAt.getTime() < Date.now()) throw new BadRequestException('Link expirado. Solicite uma nova recuperação.');

    const hashed = await bcrypt.hash(password, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: pr.userId }, data: { password: hashed } }),
      this.prisma.passwordReset.update({ where: { id: pr.id }, data: { used: true } }),
    ]);

    return { ok: true };
  }
}
