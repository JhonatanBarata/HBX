import { Injectable, UnauthorizedException, BadRequestException, ConflictException, NotFoundException, OnModuleInit } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import * as crypto from 'crypto';
import { assertPasswordPolicy } from './password-policy';
import { buildImportacaoPermissaoRows } from '../bootstrap/company-structural-defaults';

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
    return String(process.env.SYSTEM_MASTER_USERNAME || 'jhonatan.barata').trim();
  }

  private masterEmail() {
    return String(process.env.SYSTEM_MASTER_EMAIL || 'master@hbx.local').trim();
  }

  private masterPassword() {
    const configured = String(process.env.SYSTEM_MASTER_PASSWORD || '').trim();
    if (configured) {
      return configured;
    }

    const nodeEnv = String(process.env.NODE_ENV || 'development').trim().toLowerCase();
    if (nodeEnv === 'production' && this.shouldBootstrapSystemMaster()) {
      throw new Error('SYSTEM_MASTER_PASSWORD is required when BOOTSTRAP_SYSTEM_MASTER=true in production');
    }

    return 'master4961';
  }

  private shouldBootstrapSystemMaster() {
    const raw = process.env.BOOTSTRAP_SYSTEM_MASTER;
    if (raw == null) {
      return false;
    }

    return String(raw).trim().toLowerCase() === 'true';
  }

  private companyDisplayName(companyName: string | undefined, username: string) {
    const normalized = String(companyName || '').trim();
    return normalized || username;
  }

  private addDays(date: Date, days: number) {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private normalizeEntityType(value: string | undefined) {
    const normalized = String(value || '').trim().toUpperCase();
    return normalized === 'PF' ? 'PF' : normalized === 'PJ' ? 'PJ' : null;
  }

  private normalizeTrialModuleSelection(value: string | undefined) {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'vendas' || normalized === 'recovery' ? normalized : null;
  }

  private isPublicEmailDomain(email: string) {
    const normalized = String(email || '').trim().toLowerCase();
    const domain = normalized.split('@')[1] || '';
    const publicDomains = new Set([
      'gmail.com',
      'googlemail.com',
      'hotmail.com',
      'outlook.com',
      'outlook.com.br',
      'live.com',
      'live.com.br',
      'msn.com',
      'icloud.com',
      'me.com',
      'mac.com',
      'yahoo.com',
      'yahoo.com.br',
      'bol.com.br',
      'uol.com.br',
      'terra.com.br',
      'ig.com.br',
      'proton.me',
      'protonmail.com',
      'aol.com',
      'mail.com',
    ]);
    return publicDomains.has(domain);
  }

  private buildAppUrl() {
    return String(process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:3001').replace(/\/$/, '');
  }

  private buildEmailConfirmationLink(rawToken: string) {
    return `${this.buildAppUrl()}/confirm-email?token=${encodeURIComponent(rawToken)}`;
  }

  private shouldExposeEmailConfirmationDebugLink() {
    const debugEnabled = String(process.env.AUTH_DEBUG_CONFIRMATION_LINK || '').trim().toLowerCase() === 'true';
    const isProd = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
    return debugEnabled && !isProd;
  }

  private async seedDefaultCompanyModulesTx(tx: any, companyId: number) {
    const moduleRows = await tx.systemModule.findMany({
      where: { companyAssignable: true },
      select: { id: true, defaultEnabled: true },
    });

    if (!moduleRows.length) return;

    await tx.companyModule.createMany({
      data: moduleRows.map((moduleRow: { id: number; defaultEnabled: boolean }) => ({
        companyId,
        moduleId: moduleRow.id,
        enabled: Boolean(moduleRow.defaultEnabled),
      })),
      skipDuplicates: true,
    });
  }

  private async activateConfirmedTrialTx(tx: any, companyId: number, activatedAt: Date) {
    const trialEndsAt = this.addDays(activatedAt, 30);
    await tx.company.update({
      where: { id: companyId },
      data: {
        onboardingStatus: 'active_trial',
        isActive: true,
        paymentStatus: 'TRIAL',
        subscriptionStatus: 'trialing',
        premiumAccess: true,
        trialStartsAt: activatedAt,
        trialEndsAt,
        subscriptionCurrentPeriodStart: null,
        subscriptionCurrentPeriodEnd: null,
        deactivatedAt: null,
      },
    });
    await tx.companyModule.updateMany({
      where: { companyId },
      data: { enabled: true },
    });
    return trialEndsAt;
  }

  private async sendEmailConfirmationMail(input: {
    to: string;
    username: string;
    companyName: string;
    rawToken: string;
  }) {
    const confirmationLink = this.buildEmailConfirmationLink(input.rawToken);
    const mailResult = await this.mail.sendMail({
      to: input.to,
      subject: 'Confirme seu e-mail para ativar o trial HBX',
      text: [
        `Olá, ${input.username}!`,
        '',
        `Seu cadastro da ${input.companyName} foi criado no HBX.`,
        'Confirme seu e-mail no link abaixo para ativar o free trial de 30 dias:',
        confirmationLink,
        '',
        'Enquanto o e-mail não for confirmado, o acesso continua bloqueado.',
        'Se você não solicitou esse cadastro, ignore esta mensagem.',
      ].join('\n'),
    });

    return {
      previewUrl: mailResult?.previewUrl || null,
      confirmUrl: this.shouldExposeEmailConfirmationDebugLink() ? confirmationLink : null,
    };
  }

  private async ensureSystemMasterUser() {
    if (!this.shouldBootstrapSystemMaster()) {
      return;
    }

    const username = this.masterUsername();
    const email = this.masterEmail();
    const passwordHash = await bcrypt.hash(this.masterPassword(), 12);

    const existing = await this.prisma.user.findUnique({ where: { username } });
    if (existing) {
      await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          isSystemMaster: true,
          isActive: true,
          deactivatedAt: null,
          retentionUntil: null,
          role: 'ADMIN',
          name: existing.name || 'System Master',
          email: existing.email || email,
          password: existing.password || passwordHash,
        },
      });
      return;
    }

    await this.prisma.user.create({
      data: {
        username,
        email,
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

    const onboardingStatus = String(user?.company?.onboardingStatus || '').trim().toLowerCase();
    if (!Boolean(user?.isSystemMaster) && onboardingStatus === 'pending_email_confirmation') {
      throw new UnauthorizedException({
        needsEmailConfirmation: true,
        message: 'Confirme seu e-mail antes de entrar.',
      });
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
  async signup(data: {
    entityType?: 'PF' | 'PJ';
    companyName?: string;
    name?: string;
    trialModuleSelection?: 'vendas' | 'recovery';
    username: string;
    email: string;
    password: string;
  }) {
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

    const name = String(data.name || '').trim();
    if (!name) {
      throw new BadRequestException('O campo Nome é obrigatório.');
    }

    const hashed = await bcrypt.hash(password, 12);
    const entityType = this.normalizeEntityType(data.entityType);
    const normalizedCompanyName = String(data.companyName || '').trim();
    const trialModuleSelection = this.normalizeTrialModuleSelection(data.trialModuleSelection);
    const usesPublicEmail = entityType === 'PJ' ? this.isPublicEmailDomain(email) : false;
    if (!existingUsername?.companyId && !entityType) {
      throw new BadRequestException('Selecione PF ou PJ.');
    }
    if (!existingUsername?.companyId && !trialModuleSelection) {
      throw new BadRequestException('Selecione o módulo inicial do trial.');
    }
    if (!existingUsername?.companyId && entityType === 'PJ' && !normalizedCompanyName) {
      throw new BadRequestException('O campo Empresa é obrigatório.');
    }
    const displayName = entityType === 'PF' ? normalizedCompanyName || name : this.companyDisplayName(normalizedCompanyName, username);
    const warnings = usesPublicEmail
      ? ['Conta PJ cadastrada com e-mail público. Recomendamos usar um domínio corporativo.']
      : [];

    // Create a non-guessable slug to avoid tenant enumeration.
    const slug = `co_${crypto.randomBytes(9).toString('hex')}`;

    if (existingUsername) {
      // existing user without email: update with provided email/password
      // If they already belong to a company, keep it. Otherwise create a new company.
      if (existingUsername.companyId) {
        const companyId = Number(existingUsername.companyId);
        const updated = await this.prisma.user.update({
          where: { id: existingUsername.id },
          data: {
            email,
            password: hashed,
            name,
            emailConfirmedAt: existingUsername.emailConfirmedAt || new Date(),
            emailConfirmationToken: null,
            emailConfirmationSentAt: null,
            emailConfirmationExpiresAt: null,
            companyId,
          },
        });
        return this.login(updated, { companyId });
      }

      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = this.sha256(rawToken);
      const confirmationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const createdPending = await this.prisma.$transaction(async (tx) => {
        const company = await tx.company.create({
          data: {
            slug,
            name: displayName,
            entityType: entityType || 'PJ',
            trialModuleSelection,
            signupUsesPublicEmail: usesPublicEmail,
            primaryContactName: name,
            contactEmail: email,
            onboardingStatus: 'pending_email_confirmation',
            isActive: false,
            paymentStatus: 'PENDING',
            subscriptionStatus: 'canceled',
            premiumAccess: false,
            trialStartsAt: null,
            trialEndsAt: null,
            deactivatedAt: new Date(),
          },
        });
        await tx.importacaoPermissao.createMany({
          data: buildImportacaoPermissaoRows(company.id),
          skipDuplicates: true,
        });
        await this.seedDefaultCompanyModulesTx(tx, company.id);
        await tx.user.update({
          where: { id: existingUsername.id },
          data: {
            email,
            password: hashed,
            name,
            companyId: company.id,
            emailConfirmedAt: null,
            emailConfirmationToken: tokenHash,
            emailConfirmationSentAt: new Date(),
            emailConfirmationExpiresAt: confirmationExpiresAt,
          },
        });
        return { companyName: company.name };
      });

      const delivery = await this.sendEmailConfirmationMail({
        to: email,
        username,
        companyName: createdPending.companyName,
        rawToken,
      });

      return {
        ok: true,
        status: 'pending_email_confirmation',
        message: 'Cadastro criado. Confirme seu e-mail para liberar o trial.',
        email,
        username,
        companyName: createdPending.companyName,
        entityType,
        trialModuleSelection,
        warnings,
        delivery,
      };
    }

    // New account: create company + user atomically.
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.sha256(rawToken);
    const confirmationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const created = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          slug,
          name: displayName,
          entityType: entityType || 'PJ',
          trialModuleSelection,
          signupUsesPublicEmail: usesPublicEmail,
          primaryContactName: name,
          contactEmail: email,
          onboardingStatus: 'pending_email_confirmation',
          isActive: false,
          paymentStatus: 'PENDING',
          subscriptionStatus: 'canceled',
          premiumAccess: false,
          trialStartsAt: null,
          trialEndsAt: null,
          deactivatedAt: new Date(),
        },
      });

      await tx.importacaoPermissao.createMany({
        data: buildImportacaoPermissaoRows(company.id),
        skipDuplicates: true,
      });
      await this.seedDefaultCompanyModulesTx(tx, company.id);

      const user = await tx.user.create({
        data: {
          username,
          email,
          password: hashed,
          name,
          companyId: company.id,
          emailConfirmedAt: null,
          emailConfirmationToken: tokenHash,
          emailConfirmationSentAt: new Date(),
          emailConfirmationExpiresAt: confirmationExpiresAt,
        },
      });

      return { companyName: company.name };
    });

    const delivery = await this.sendEmailConfirmationMail({
      to: email,
      username,
      companyName: created.companyName,
      rawToken,
    });

    return {
      ok: true,
      status: 'pending_email_confirmation',
      message: 'Cadastro criado. Confirme seu e-mail para liberar o trial.',
      email,
      username,
      companyName: created.companyName,
      entityType,
      trialModuleSelection,
      warnings,
      delivery,
    };
  }

  async confirmEmail(token: string) {
    const rawToken = String(token || '').trim();
    if (!rawToken) {
      throw new BadRequestException('Token de confirmação inválido.');
    }

    const tokenHash = this.sha256(rawToken);
    const user = await this.prisma.user.findFirst({
      where: { emailConfirmationToken: tokenHash },
      select: {
        id: true,
        username: true,
        email: true,
        companyId: true,
        emailConfirmationExpiresAt: true,
      },
    });

    if (!user) {
      throw new BadRequestException('Link de confirmação inválido ou já utilizado.');
    }

    if (!user.emailConfirmationExpiresAt || user.emailConfirmationExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Link de confirmação expirado. Solicite um novo cadastro.');
    }

    const confirmedAt = new Date();
    let trialEndsAt: Date | null = null;

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          emailConfirmedAt: confirmedAt,
          emailConfirmationToken: null,
          emailConfirmationSentAt: null,
          emailConfirmationExpiresAt: null,
        },
      });

      if (user.companyId) {
        trialEndsAt = await this.activateConfirmedTrialTx(tx, Number(user.companyId), confirmedAt);
      }
    });

    return {
      ok: true,
      status: user.companyId ? 'active_trial' : 'confirmed',
      message: user.companyId
        ? 'E-mail confirmado. O free trial de 30 dias já está ativo.'
        : 'E-mail confirmado com sucesso.',
      trialStartsAt: user.companyId ? confirmedAt.toISOString() : null,
      trialEndsAt: trialEndsAt ? trialEndsAt.toISOString() : null,
      next: '/login',
    };
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
