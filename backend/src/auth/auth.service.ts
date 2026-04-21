import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
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
  private readonly logger = new Logger(AuthService.name);

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

  private normalizeTrialModuleSelection(value: string | undefined): 'vendas' | null {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'vendas' ? normalized : null;
  }

  private resolveTrialEnabledModuleKeys(trialModuleSelection: 'vendas' | null) {
    if (trialModuleSelection === 'vendas') {
      return ['atendimento', 'vendas', 'webscraping'];
    }

    return [] as string[];
  }

  private normalizeAcquisitionSource(value: string | undefined) {
    const normalized = String(value || '').trim().toLowerCase();
    return ['google', 'instagram', 'youtube', 'indicacao', 'parceiro', 'outro'].includes(normalized)
      ? normalized
      : null;
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

  private escapeHtml(value: string) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private buildEmailConfirmationHtml(input: {
    username: string;
    companyName: string;
    confirmationLink: string;
  }) {
    const username = this.escapeHtml(input.username);
    const companyName = this.escapeHtml(input.companyName);
    const confirmationLink = this.escapeHtml(input.confirmationLink);

    return [
      '<!DOCTYPE html>',
      '<html lang="pt-BR">',
      '  <body style="margin:0;padding:24px;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#10213a;">',
      '    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #dbe4f0;">',
      '      <tr>',
      '        <td style="padding:24px 28px;background:linear-gradient(135deg,#163b7a,#26428c);color:#ffffff;">',
      '          <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.78;">HBX</div>',
      '          <h1 style="margin:12px 0 0;font-size:26px;line-height:1.2;">Confirme seu e-mail</h1>',
      '          <p style="margin:10px 0 0;font-size:14px;line-height:1.6;opacity:.92;">Seu acesso está quase pronto. Falta só validar o endereço para liberar o trial.</p>',
      '        </td>',
      '      </tr>',
      '      <tr>',
      '        <td style="padding:28px;">',
      `          <p style="margin:0 0 12px;font-size:16px;line-height:1.7;">Olá, <strong>${username}</strong>.</p>`,
      `          <p style="margin:0 0 12px;font-size:15px;line-height:1.7;">O cadastro de <strong>${companyName}</strong> foi criado no HBX.</p>`,
      '          <p style="margin:0 0 24px;font-size:15px;line-height:1.7;">Confirme seu e-mail no botão abaixo para ativar o free trial de 30 dias.</p>',
      `          <a href="${confirmationLink}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:#c9473d;color:#ffffff;text-decoration:none;font-weight:700;">Confirmar e-mail</a>`,
      '          <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#4f647e;">Se o botão não abrir, copie e cole este link no navegador:</p>',
      `          <p style="margin:8px 0 0;word-break:break-all;font-size:13px;line-height:1.7;"><a href="${confirmationLink}" style="color:#26428c;">${confirmationLink}</a></p>`,
      '        </td>',
      '      </tr>',
      '      <tr>',
      '        <td style="padding:0 28px 28px;">',
      '          <div style="padding:16px 18px;border-radius:14px;background:#f5f7fb;border:1px solid #e1e8f2;">',
      '            <p style="margin:0 0 8px;font-size:13px;line-height:1.6;"><strong>Importante:</strong> enquanto o e-mail não for confirmado, o acesso continua bloqueado.</p>',
      '            <p style="margin:0;font-size:13px;line-height:1.6;color:#4f647e;">Se você não solicitou esse cadastro, ignore esta mensagem.</p>',
      '          </div>',
      '        </td>',
      '      </tr>',
      '    </table>',
      '  </body>',
      '</html>',
    ].join('');
  }

  private isProduction() {
    return String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
  }

  private useEtherealAuto() {
    return !this.isProduction() && String(process.env.ETHEREAL_AUTO || '').trim().toLowerCase() === 'true';
  }

  private hasConfiguredTransactionalMailTransport() {
    return this.mail.getConfigurationSummary().ready;
  }

  private canUseLocalEmailConfirmationFallback() {
    const summary = this.mail.getConfigurationSummary();
    return !this.isProduction() && summary.mode === 'log';
  }

  private shouldExposeEmailConfirmationDebugLink() {
    const debugEnabled = String(process.env.AUTH_DEBUG_CONFIRMATION_LINK || '').trim().toLowerCase() === 'true';
    return debugEnabled && !this.isProduction();
  }

  private shouldExposePasswordResetDebugLink() {
    const debugEnabled = String(process.env.AUTH_DEBUG_RESET_LINK || '').trim().toLowerCase() === 'true';
    return debugEnabled && !this.isProduction();
  }

  private canDeliverEmailConfirmation() {
    return this.hasConfiguredTransactionalMailTransport()
      || this.useEtherealAuto()
      || this.shouldExposeEmailConfirmationDebugLink()
      || this.canUseLocalEmailConfirmationFallback();
  }

  private canDeliverPasswordReset() {
    return this.hasConfiguredTransactionalMailTransport() || this.useEtherealAuto() || this.shouldExposePasswordResetDebugLink();
  }

  private ensureEmailConfirmationDeliveryAvailable() {
    if (!this.canDeliverEmailConfirmation()) {
      throw new ServiceUnavailableException({
        code: 'EMAIL_CONFIRMATION_UNAVAILABLE',
        message: 'Cadastro temporariamente indisponível. O envio de confirmação por e-mail não está operacional.',
      });
    }
  }

  private ensurePasswordResetDeliveryAvailable() {
    if (!this.canDeliverPasswordReset()) {
      throw new ServiceUnavailableException({
        code: 'PASSWORD_RESET_UNAVAILABLE',
        message: 'Recuperação de senha temporariamente indisponível. Tente novamente em alguns minutos.',
      });
    }
  }

  private emailConfirmationDeliveryFailureMessage() {
    return 'Cadastro criado, mas não conseguimos enviar o e-mail de confirmação agora. Reenvie a confirmação para liberar o trial.';
  }

  private resendConfirmationDeliveryFailureMessage() {
    return 'Conta localizada, mas não conseguimos enviar o novo e-mail de confirmação agora. Tente reenviar novamente em alguns minutos.';
  }

  private passwordResetQueuedMessage() {
    return 'Se o e-mail existir, enviaremos um link de redefinição.';
  }

  private passwordResetDeliveryDelayedMessage() {
    return 'Se o e-mail existir, tentaremos reenviar o link assim que o serviço de e-mail estabilizar.';
  }

  private buildPendingEmailConfirmationResponse(input: {
    email: string;
    username: string;
    companyName: string;
    entityType: 'PF' | 'PJ' | null;
    trialModuleSelection: 'vendas' | null;
    acquisitionSource: string | null;
    warnings: string[];
    message?: string;
    previewUrl?: string | null;
    confirmUrl?: string | null;
    deliveryFailed?: boolean;
    deliveryErrorCode?: string | null;
    deliveryErrorMessage?: string | null;
  }) {
    return {
      ok: true,
      status: 'pending_email_confirmation',
      message: input.message || 'Cadastro criado. Confirme seu e-mail para liberar o trial.',
      email: input.email,
      username: input.username,
      companyName: input.companyName,
      entityType: input.entityType,
      trialModuleSelection: input.trialModuleSelection,
      acquisitionSource: input.acquisitionSource,
      warnings: input.warnings,
      canResendConfirmation: true,
      delivery: {
        previewUrl: input.previewUrl || null,
        confirmUrl: input.confirmUrl || null,
        failed: Boolean(input.deliveryFailed),
        errorCode: input.deliveryErrorCode || null,
        errorMessage: input.deliveryErrorMessage || null,
      },
    };
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

  private async syncTrialSelectedModulesTx(
    tx: any,
    companyId: number,
    trialModuleSelection: 'vendas' | null,
  ) {
    if (!trialModuleSelection) return;

    const enabledKeys = this.resolveTrialEnabledModuleKeys(trialModuleSelection);
    const enabledModuleRows = enabledKeys.length
      ? await tx.systemModule.findMany({
          where: {
            companyAssignable: true,
            key: { in: enabledKeys },
          },
          select: { id: true },
        })
      : [];

    await tx.companyModule.updateMany({
      where: { companyId },
      data: { enabled: false },
    });

    if (!enabledModuleRows.length) return;

    await tx.companyModule.updateMany({
      where: {
        companyId,
        moduleId: { in: enabledModuleRows.map((moduleRow: { id: number }) => moduleRow.id) },
      },
      data: { enabled: true },
    });
  }

  private async activateConfirmedTrialTx(tx: any, companyId: number, activatedAt: Date) {
    const trialEndsAt = this.addDays(activatedAt, 30);
    const company = await tx.company.findUnique({
      where: { id: companyId },
      select: { trialModuleSelection: true },
    });
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
    await this.syncTrialSelectedModulesTx(
      tx,
      companyId,
      this.normalizeTrialModuleSelection(company?.trialModuleSelection || undefined),
    );
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
      html: this.buildEmailConfirmationHtml({
        username: input.username,
        companyName: input.companyName,
        confirmationLink,
      }),
    });

    return {
      previewUrl: mailResult?.previewUrl || null,
      confirmUrl: this.shouldExposeEmailConfirmationDebugLink() ? confirmationLink : null,
      failed: !mailResult.ok,
      errorCode: mailResult.errorCode || null,
      errorMessage: mailResult.errorMessage || null,
    };
  }

  private async dispatchEmailConfirmation(input: {
    email: string;
    username: string;
    companyName: string;
    rawToken: string;
  }) {
    try {
      return await this.sendEmailConfirmationMail({
        to: input.email,
        username: input.username,
        companyName: input.companyName,
        rawToken: input.rawToken,
      });
    } catch (error) {
      this.logger.error(`Failed to send confirmation email to ${input.email}`, error instanceof Error ? error.stack : undefined);
      return {
        previewUrl: null,
        confirmUrl: this.shouldExposeEmailConfirmationDebugLink()
          ? this.buildEmailConfirmationLink(input.rawToken)
          : null,
        failed: true,
        errorCode: 'EMAIL_CONFIRMATION_DELIVERY_FAILED',
        errorMessage: error instanceof Error ? error.message : 'Falha no envio do e-mail de confirmação.',
      };
    }
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
        code: 'EMAIL_CONFIRMATION_REQUIRED',
        needsEmailConfirmation: true,
        email: user.email || null,
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
    trialModuleSelection?: 'vendas';
    acquisitionSource?: 'google' | 'instagram' | 'youtube' | 'indicacao' | 'parceiro' | 'outro';
    acquisitionSourceDetail?: string;
    referralReferrerName?: string;
    referralCode?: string;
    username?: string;
    email: string;
    password: string;
  }) {
    const email = String(data.email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) throw new BadRequestException('E‑mail inválido. Informe um endereço de e‑mail válido para recuperação.');

    const username = String(data.username || email).trim().toLowerCase();

    const existingUsername = await this.usersService.findByUsername(username);
    // If username exists, allow completing registration only when there is no email yet.
    if (existingUsername) {
      if (existingUsername.email) {
        // User already has an email: do not change it via signup.
        throw new ConflictException('Email já cadastrado. Envie uma solicitação para o email registrado ou entre em contato com o administrador.');
      }
      // existing user without email: proceed to attach email/password (below)
    }

    const existingEmail = await this.usersService.findByEmail(email);
    if (existingEmail) throw new ConflictException('Já existe uma conta com este E‑mail. Caso seja sua, use a recuperação de senha.');

    const password = String(data.password || '');
    assertPasswordPolicy(password);

    const normalizedCompanyName = String(data.companyName || '').trim();
    const normalizedName = String(data.name || '').trim();
    const resolvedName = normalizedName || normalizedCompanyName || username;
    const hashed = await bcrypt.hash(password, 12);
    const entityType = this.normalizeEntityType(data.entityType) || 'PF';
    const trialModuleSelection = this.normalizeTrialModuleSelection(data.trialModuleSelection) || 'vendas';
    const acquisitionSource = this.normalizeAcquisitionSource(data.acquisitionSource);
    const acquisitionSourceDetail = String(data.acquisitionSourceDetail || '').trim() || null;
    const referralReferrerName = String(data.referralReferrerName || '').trim() || null;
    const referralCode = String(data.referralCode || '').trim() || null;
    const usesPublicEmail = entityType === 'PJ' ? this.isPublicEmailDomain(email) : false;
    const displayName = this.companyDisplayName(normalizedCompanyName || resolvedName, username);
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
            name: resolvedName,
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
            acquisitionSource,
            acquisitionSourceDetail,
            referralReferrerName,
            referralCode,
            primaryContactName: resolvedName,
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
        await this.syncTrialSelectedModulesTx(tx, company.id, trialModuleSelection);
        await tx.user.update({
          where: { id: existingUsername.id },
          data: {
            email,
            password: hashed,
            name: resolvedName,
            role: 'ADMIN',
            companyId: company.id,
            emailConfirmedAt: null,
            emailConfirmationToken: tokenHash,
            emailConfirmationSentAt: new Date(),
            emailConfirmationExpiresAt: confirmationExpiresAt,
          },
        });
        return { companyName: company.name };
      });

      const delivery = await this.dispatchEmailConfirmation({
        email,
        username,
        companyName: createdPending.companyName,
        rawToken,
      });

      return this.buildPendingEmailConfirmationResponse({
        email,
        username,
        companyName: createdPending.companyName,
        entityType,
        trialModuleSelection,
        acquisitionSource,
        warnings,
        message: delivery.failed
          ? this.emailConfirmationDeliveryFailureMessage()
          : 'Cadastro criado. Confirme seu e-mail para liberar nosso trial:',
        previewUrl: delivery.previewUrl,
        confirmUrl: delivery.confirmUrl,
        deliveryFailed: delivery.failed,
        deliveryErrorCode: delivery.errorCode,
        deliveryErrorMessage: delivery.errorMessage,
      });
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
          acquisitionSource,
          acquisitionSourceDetail,
          referralReferrerName,
          referralCode,
          primaryContactName: resolvedName,
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
      await this.syncTrialSelectedModulesTx(tx, company.id, trialModuleSelection);

      const user = await tx.user.create({
        data: {
          username,
          email,
          password: hashed,
          name: resolvedName,
          role: 'ADMIN',
          companyId: company.id,
          emailConfirmedAt: null,
          emailConfirmationToken: tokenHash,
          emailConfirmationSentAt: new Date(),
          emailConfirmationExpiresAt: confirmationExpiresAt,
        },
      });

      return { companyName: company.name };
    });

    const delivery = await this.dispatchEmailConfirmation({
      email,
      username,
      companyName: created.companyName,
      rawToken,
    });

    return this.buildPendingEmailConfirmationResponse({
      email,
      username,
      companyName: created.companyName,
      entityType,
      trialModuleSelection,
      acquisitionSource,
      warnings,
      message: delivery.failed
        ? this.emailConfirmationDeliveryFailureMessage()
        : 'Cadastro criado. Confirme seu e-mail para liberar o trial.',
      previewUrl: delivery.previewUrl,
      confirmUrl: delivery.confirmUrl,
      deliveryFailed: delivery.failed,
      deliveryErrorCode: delivery.errorCode,
      deliveryErrorMessage: delivery.errorMessage,
    });
  }

  async confirmEmail(token: string) {
    const rawToken = String(token || '').trim();
    if (!rawToken) {
      throw new BadRequestException({ code: 'EMAIL_CONFIRMATION_INVALID', message: 'Token de confirmação inválido.' });
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
      throw new BadRequestException({
        code: 'EMAIL_CONFIRMATION_INVALID',
        message: 'Link de confirmação inválido ou já utilizado.',
      });
    }

    if (!user.emailConfirmationExpiresAt || user.emailConfirmationExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException({
        code: 'EMAIL_CONFIRMATION_EXPIRED',
        message: 'Link de confirmação expirado. Solicite um novo envio para continuar.',
      });
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

  async resendEmailConfirmation(email: string) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!normalizedEmail || !emailRegex.test(normalizedEmail)) {
      throw new BadRequestException('Informe um e-mail válido para reenviar a confirmação.');
    }

    const user = await this.prisma.user.findFirst({
      where: { email: normalizedEmail },
      select: {
        id: true,
        username: true,
        email: true,
        emailConfirmedAt: true,
        companyId: true,
        company: {
          select: {
            name: true,
            onboardingStatus: true,
            entityType: true,
            trialModuleSelection: true,
            acquisitionSource: true,
          },
        },
      },
    });

    if (!user || user.emailConfirmedAt || String(user.company?.onboardingStatus || '').trim().toLowerCase() !== 'pending_email_confirmation') {
      return {
        ok: true,
        status: 'confirmation_resent_if_pending',
        message: 'Se existir uma conta com confirmação pendente, enviaremos um novo link em instantes.',
      };
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.sha256(rawToken);
    const confirmationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailConfirmationToken: tokenHash,
        emailConfirmationSentAt: new Date(),
        emailConfirmationExpiresAt: confirmationExpiresAt,
      },
    });

    const delivery = await this.dispatchEmailConfirmation({
      email: normalizedEmail,
      username: user.username || normalizedEmail,
      companyName: user.company?.name || user.username || normalizedEmail,
      rawToken,
    });

    return {
      ok: true,
      status: 'pending_email_confirmation',
      message: delivery.failed
        ? this.resendConfirmationDeliveryFailureMessage()
        : 'Novo link de confirmação enviado. Verifique sua caixa de entrada.',
      email: normalizedEmail,
      canResendConfirmation: true,
      delivery: {
        previewUrl: delivery.previewUrl || null,
        confirmUrl: delivery.confirmUrl || null,
        failed: Boolean(delivery.failed),
        errorCode: delivery.errorCode || null,
        errorMessage: delivery.errorMessage || null,
      },
    };
  }

  private sha256(input: string) {
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  // PASSWORD RECOVERY
  // - User provides email (not username) to avoid linking login identifier to recovery.
  // - We do not leak whether the email exists.
  async requestPasswordResetLinkByEmail(email: string) {
    this.ensurePasswordResetDeliveryAvailable();

    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return { ok: true, message: this.passwordResetQueuedMessage() };

    const user = await this.usersService.findByEmail(normalizedEmail);
    if (!user) return { ok: true, message: this.passwordResetQueuedMessage() };

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

    try {
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

      if (this.shouldExposePasswordResetDebugLink()) {
        return {
          ok: true,
          message: mailResult.ok
            ? 'Link de redefinição gerado para este ambiente de teste.'
            : this.passwordResetDeliveryDelayedMessage(),
          previewLink: link,
          mailPreviewUrl: mailResult?.previewUrl || null,
        };
      }

      return {
        ok: true,
        message: mailResult.ok
          ? this.passwordResetQueuedMessage()
          : this.passwordResetDeliveryDelayedMessage(),
      };
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${user.email}`, error instanceof Error ? error.stack : undefined);

      if (this.shouldExposePasswordResetDebugLink()) {
        return {
          ok: true,
          message: 'Link de redefinição gerado, mas o envio real falhou neste ambiente.',
          previewLink: link,
          mailPreviewUrl: null,
        };
      }

      return {
        ok: true,
        message: this.passwordResetDeliveryDelayedMessage(),
      };
    }
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
