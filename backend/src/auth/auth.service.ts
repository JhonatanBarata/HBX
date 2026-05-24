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
import { EmailTemplateService } from '../mail/email-template.service';
import { MailService } from '../mail/mail.service';
import * as crypto from 'crypto';
import { assertPasswordPolicy } from './password-policy';
import {
  COMMERCIAL_ENTITLEMENT_KEYS,
  COMMERCIAL_PLAN_ENTITLEMENT_KEYS,
  COMMERCIAL_PLAN_KEYS,
  COMMERCIAL_PLAN_MODULE_KEYS,
  PENDING_COMMERCIAL_ENTITLEMENT_STATUS,
  buildCommercialPlansCatalog,
  normalizeCommercialPlanKey,
  type ActiveCommercialPlanKey,
  type CommercialPlanKey,
} from '../commercial-plans/commercial-plan-catalog';
import { HbxCommissionSyncService } from '../commissions/hbx-commission-sync.service';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private readonly sessionTtlMs = 15 * 60 * 1000;

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private prisma: PrismaService,
    private mail: MailService,
    private emailTemplates: EmailTemplateService,
    private hbxCommissionSync: HbxCommissionSyncService,
  ) {}

  async onModuleInit() {
    await this.ensureSystemMasterUser();
    await this.repairBillingGraceCompanyStates().catch((error) => {
      this.logger.error(
        'Failed to repair billing grace company states',
        error instanceof Error ? error.stack : undefined,
      );
    });
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

    if (this.shouldBootstrapSystemMaster()) {
      throw new Error('SYSTEM_MASTER_PASSWORD is required when BOOTSTRAP_SYSTEM_MASTER=true');
    }

    return crypto.randomBytes(32).toString('base64url');
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

  private async findCompanyByDisplayNameTx(tx: any, displayName: string) {
    const name = String(displayName || '').trim();
    if (!name) return null;

    return tx.company.findFirst({
      where: {
        name: {
          equals: name,
          mode: 'insensitive',
        },
      },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        onboardingStatus: true,
        _count: {
          select: { users: true },
        },
      },
    });
  }

  private addDays(date: Date, days: number) {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private normalizeText(value: unknown) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  private normalizeDigits(value: unknown) {
    return String(value || '').replace(/\D/g, '');
  }

  private hasRepeatedDigits(value: string) {
    return /^(\d)\1+$/.test(value);
  }

  private isValidCpf(value: unknown) {
    const digits = this.normalizeDigits(value);
    if (digits.length !== 11 || this.hasRepeatedDigits(digits)) return false;
    const calculate = (length: number) => {
      let sum = 0;
      for (let index = 0; index < length; index += 1) {
        sum += Number(digits[index]) * (length + 1 - index);
      }
      const mod = (sum * 10) % 11;
      return mod === 10 ? 0 : mod;
    };
    return calculate(9) === Number(digits[9]) && calculate(10) === Number(digits[10]);
  }

  private normalizeBrazilPhone(value: unknown) {
    const digits = this.normalizeDigits(value);
    const withoutCountry = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
    return withoutCountry.slice(0, 11);
  }

  private validateSignupTrialProfile(data: {
    trialContactName?: string | null;
    trialTaxDocument?: string | null;
    trialContactPhone?: string | null;
    acceptedTerms?: boolean | null;
  }) {
    const contactName = this.normalizeText(data.trialContactName);
    const contactPhone = this.normalizeBrazilPhone(data.trialContactPhone);
    const taxDocument = this.normalizeDigits(data.trialTaxDocument).slice(0, 11);
    if (!contactName || contactName.length < 3) {
      throw new BadRequestException({
        code: 'TRIAL_CONTACT_NAME_REQUIRED',
        message: 'Informe seu nome completo para iniciar o trial.',
      });
    }
    if (!contactPhone || contactPhone.length < 10) {
      throw new BadRequestException({
        code: 'TRIAL_CONTACT_PHONE_REQUIRED',
        message: 'Informe um telefone de contato válido para iniciar o trial.',
      });
    }
    if (!this.isValidCpf(taxDocument)) {
      throw new BadRequestException({
        code: 'TRIAL_TAX_DOCUMENT_INVALID',
        message: 'Informe um CPF válido para iniciar o trial.',
      });
    }
    if (data.acceptedTerms !== true) {
      throw new BadRequestException({
        code: 'TRIAL_TERMS_REQUIRED',
        message: 'Aceite os termos do trial para continuar.',
      });
    }
    return { contactName, contactPhone, taxDocument };
  }

  private async ensureTrialPhoneAvailableTx(
    tx: any,
    companyId: number,
    phoneNormalized: string,
    mode: 'reserve' | 'activate',
  ) {
    const existingPhoneTrial = await tx.trialPhoneUsage.findUnique({
      where: { phoneNormalized },
    });
    if (!existingPhoneTrial) return null;
    if (!existingPhoneTrial.companyId || Number(existingPhoneTrial.companyId) === Number(companyId)) {
      return existingPhoneTrial;
    }

    const trialCompany = await tx.company.findUnique({
      where: { id: Number(existingPhoneTrial.companyId) },
      select: { id: true },
    });
    if (!trialCompany) return existingPhoneTrial;

    throw new ConflictException({
      code: 'TRIAL_PHONE_ALREADY_USED',
      message: mode === 'activate'
        ? 'Este telefone já utilizou o trial HBX. Escolha um plano pago para continuar.'
        : 'Este telefone já utilizou o trial HBX. Use outro telefone ou escolha um plano pago para continuar.',
    });
  }

  private async reserveSignupTrialPhoneTx(
    tx: any,
    companyId: number,
    profile: { contactName: string; contactPhone: string; taxDocument: string },
    selectedPlanKey: ActiveCommercialPlanKey,
    selectedByUserId?: number | null,
  ) {
    const now = new Date();
    const existing = await this.ensureTrialPhoneAvailableTx(tx, companyId, profile.contactPhone, 'reserve');
    const data = {
      companyId,
      firstTrialStartsAt: null,
      firstTrialEndsAt: null,
      source: 'signup_pending',
      metadataJson: JSON.stringify({
        acceptedTerms: true,
        acceptedTermsAt: now.toISOString(),
        contactName: profile.contactName,
        taxDocumentProvided: Boolean(profile.taxDocument),
        selectedPlanKey,
        selectedByUserId: Number(selectedByUserId || 0) || null,
      }),
    };
    if (existing) {
      return tx.trialPhoneUsage.update({
        where: { id: existing.id },
        data,
      });
    }
    return tx.trialPhoneUsage.create({
      data: {
        phoneNormalized: profile.contactPhone,
        ...data,
      },
    });
  }

  private addSessionTtl(date: Date) {
    return new Date(date.getTime() + this.sessionTtlMs);
  }

  private hashIp(ip: string | undefined) {
    const normalized = String(ip || '').trim();
    if (!normalized) return null;

    const secret = String(process.env.SESSION_IP_HASH_SECRET || process.env.JWT_SECRET || '').trim();
    return crypto.createHmac('sha256', secret || 'hbx-session-ip').update(normalized).digest('hex');
  }

  private normalizeUserAgent(userAgent: string | undefined) {
    const normalized = String(userAgent || '').trim();
    return normalized ? normalized.slice(0, 512) : null;
  }

  private normalizeEntityType(value: string | undefined) {
    const normalized = String(value || '').trim().toUpperCase();
    return normalized === 'PF' ? 'PF' : normalized === 'PJ' ? 'PJ' : null;
  }

  private normalizeTrialModuleSelection(value: string | undefined): 'vendas' | null {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'vendas' ? normalized : null;
  }

  private normalizeSelectedPlanKey(value: string | undefined): ActiveCommercialPlanKey {
    return normalizeCommercialPlanKey(value);
  }

  private normalizePublicSelectedPlanKey(value: string | undefined): ActiveCommercialPlanKey {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === COMMERCIAL_PLAN_KEYS.LITE) return COMMERCIAL_PLAN_KEYS.LITE;
    if (normalized === COMMERCIAL_PLAN_KEYS.PADRAO) return COMMERCIAL_PLAN_KEYS.PADRAO;
    if (normalized === COMMERCIAL_PLAN_KEYS.MELHOR) return COMMERCIAL_PLAN_KEYS.MELHOR;
    return COMMERCIAL_PLAN_KEYS.LITE;
  }

  private resolveTrialModuleForPlan(planKey: ActiveCommercialPlanKey): 'vendas' | null {
    return (
      planKey === COMMERCIAL_PLAN_KEYS.LITE ||
      planKey === COMMERCIAL_PLAN_KEYS.PADRAO ||
      planKey === COMMERCIAL_PLAN_KEYS.MELHOR
    )
      ? 'vendas'
      : null;
  }

  private getPublicTrialDaysForPlan(planKey: ActiveCommercialPlanKey) {
    if (planKey === COMMERCIAL_PLAN_KEYS.PADRAO) return 14;
    return 0;
  }

  private resolveTrialEnabledModuleKeys(trialModuleSelection: 'vendas' | null) {
    if (trialModuleSelection === 'vendas') {
      return ['atendimento', 'vendas', 'webscraping'];
    }

    return [] as string[];
  }

  private resolvePlanModuleKeys(planKey: ActiveCommercialPlanKey) {
    return COMMERCIAL_PLAN_MODULE_KEYS[planKey] || [];
  }

  private normalizeAcquisitionSource(value: string | undefined) {
    const normalized = String(value || '').trim().toLowerCase();
    return ['google', 'instagram', 'youtube', 'indicacao', 'parceiro', 'outro'].includes(normalized)
      ? normalized
      : null;
  }

  private hasHbxSalesLeadReferral(...values: Array<string | null | undefined>) {
    return values.some((value) => /^hbx-vendas-lead:[a-z0-9_-]{6,120}$/i.test(String(value || '').trim()));
  }

  private async syncHbxSalesReferralCompany(companyId: unknown, source: string, enabled: boolean) {
    if (!enabled) return;
    const normalizedCompanyId = Math.trunc(Number(companyId || 0));
    if (!normalizedCompanyId) return;
    await this.hbxCommissionSync.syncActivatedCompany(normalizedCompanyId, { source }).catch((error: any) => {
      this.logger.warn(`commission_sync_signup_referral_failed company=${normalizedCompanyId} error=${String(error?.message || error)}`);
    });
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

  private createEmailConfirmationToken() {
    return crypto.randomBytes(32).toString('base64url');
  }

  private preCheckoutNextPath(reason: 'pending_checkout' | 'trial_expired' | 'payment_failed' = 'pending_checkout') {
    return `/pre-checkout?reason=${reason}`;
  }

  private pendingCheckoutNextPath() {
    return this.preCheckoutNextPath('pending_checkout');
  }

  private pendingTrialActivationNextPath() {
    return '/register?start=trial';
  }

  private buildEmailConfirmationPollToken(userId: number) {
    return this.jwtService.sign(
      {
        sub: Number(userId),
        purpose: 'email_confirmation_poll',
      },
      { expiresIn: '1d' },
    );
  }

  private verifyEmailConfirmationPollToken(token: string) {
    const raw = String(token || '').trim();
    if (!raw) {
      throw new BadRequestException({ code: 'EMAIL_CONFIRMATION_STATUS_INVALID', message: 'Acompanhamento de confirmação inválido.' });
    }

    try {
      const payload = this.jwtService.verify(raw) as { sub?: unknown; purpose?: unknown };
      const userId = Number(payload?.sub);
      if (payload?.purpose !== 'email_confirmation_poll' || !Number.isInteger(userId) || userId <= 0) {
        throw new Error('invalid poll token');
      }
      return userId;
    } catch {
      throw new BadRequestException({ code: 'EMAIL_CONFIRMATION_STATUS_INVALID', message: 'Acompanhamento de confirmação expirado ou inválido.' });
    }
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
      '          <p style="margin:10px 0 0;font-size:14px;line-height:1.6;opacity:.92;">Seu acesso está quase pronto. Falta só validar o endereço para continuar.</p>',
      '        </td>',
      '      </tr>',
      '      <tr>',
      '        <td style="padding:28px;">',
      `          <p style="margin:0 0 12px;font-size:16px;line-height:1.7;">Olá, <strong>${username}</strong>.</p>`,
      `          <p style="margin:0 0 12px;font-size:15px;line-height:1.7;">O cadastro de <strong>${companyName}</strong> foi criado no HBX.</p>`,
      '          <p style="margin:0 0 24px;font-size:15px;line-height:1.7;">Confirme seu e-mail no botão abaixo para continuar o onboarding da conta.</p>',
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

  private isLocalMockSignupFlow() {
    return (
      !this.isProduction() &&
      String(process.env.NODE_ENV || '').trim().toLowerCase() === 'development' &&
      String(process.env.PAYMENTS_PROVIDER || '').trim().toLowerCase() === 'mock'
    );
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
    return 'Cadastro criado, mas não conseguimos enviar o e-mail de confirmação agora. Reenvie a confirmação para continuar.';
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
    userId: number;
    email: string;
    username: string;
    companyName: string;
    entityType: 'PF' | 'PJ' | null;
    trialModuleSelection: 'vendas' | null;
    selectedPlanKey: CommercialPlanKey;
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
      selectedPlanKey: input.selectedPlanKey,
      acquisitionSource: input.acquisitionSource,
      warnings: input.warnings,
      confirmationPollToken: this.buildEmailConfirmationPollToken(input.userId),
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

  private pendingConfirmationSuccessMessage(planKey: CommercialPlanKey) {
    const trialDays = this.getPublicTrialDaysForPlan(normalizeCommercialPlanKey(planKey));
    if (trialDays > 0) {
      return `Cadastro criado. Confirme seu e-mail para começar o trial gratuito de ${trialDays} dias.`;
    }
    return 'Cadastro criado. Confirme seu e-mail para seguir para o checkout no Financeiro.';
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

    for (const moduleRow of enabledModuleRows) {
      await tx.companyModule.upsert({
        where: {
          companyId_moduleId: {
            companyId,
            moduleId: moduleRow.id,
          },
        },
        update: { enabled: true },
        create: { companyId, moduleId: moduleRow.id, enabled: true },
      });
    }
  }

  private async syncPlanModulesTx(tx: any, companyId: number, planKey: ActiveCommercialPlanKey) {
    const enabledKeys = this.resolvePlanModuleKeys(planKey);
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

    for (const moduleRow of enabledModuleRows) {
      await tx.companyModule.upsert({
        where: {
          companyId_moduleId: {
            companyId,
            moduleId: moduleRow.id,
          },
        },
        update: { enabled: true },
        create: { companyId, moduleId: moduleRow.id, enabled: true },
      });
    }
  }

  private async upsertEntitlementTx(
    tx: any,
    companyId: number,
    key: string,
    status: string,
    source: string,
    periodStart: Date | null,
    periodEnd: Date | null,
    metadata: Record<string, unknown>,
  ) {
    await tx.companyCommercialEntitlement.upsert({
      where: {
        companyId_key: {
          companyId,
          key,
        },
      },
      update: {
        status,
        source,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        metadataJson: JSON.stringify(metadata),
      },
      create: {
        companyId,
        key,
        status,
        source,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        metadataJson: JSON.stringify(metadata),
      },
    });
  }

  private async createPendingCheckoutEntitlementsTx(
    tx: any,
    companyId: number,
    planKey: ActiveCommercialPlanKey,
    selectedAt: Date,
  ) {
    const metadata = {
      selectedPlanKey: planKey,
      selectedAt: selectedAt.toISOString(),
      state: 'pending_checkout',
    };
    const activeKeys = new Set(COMMERCIAL_PLAN_ENTITLEMENT_KEYS[planKey] || []);
    const allKeys = Object.values(COMMERCIAL_ENTITLEMENT_KEYS);

    for (const key of allKeys) {
      await this.upsertEntitlementTx(
        tx,
        companyId,
        key,
        activeKeys.has(key) ? PENDING_COMMERCIAL_ENTITLEMENT_STATUS : 'canceled',
        activeKeys.has(key) ? 'checkout' : 'plan_change',
        null,
        null,
        key === COMMERCIAL_ENTITLEMENT_KEYS.BOT_IA
          ? { ...metadata, botRelease: 'after_payment' }
          : metadata,
      );
    }
  }

  private async repairBillingGraceCompanyStates() {
    const companies = await this.prisma.company.findMany({
      where: {
        billingGraceReason: 'initial_access',
        subscriptionStatus: 'grace',
        paymentStatus: 'PENDING',
      },
      select: {
        id: true,
        selectedPlanKey: true,
      },
    });

    const now = new Date();
    for (const company of companies) {
      const selectedPlanKey = this.normalizeSelectedPlanKey(company.selectedPlanKey || undefined);
      await this.prisma.$transaction(async (tx) => {
        await tx.company.update({
          where: { id: company.id },
          data: {
            selectedPlanKey,
            trialModuleSelection: null,
            onboardingStatus: 'pending_checkout',
            isActive: false,
            paymentStatus: 'PENDING',
            subscriptionStatus: 'pending_checkout',
            premiumAccess: false,
            trialStartsAt: null,
            trialEndsAt: null,
            subscriptionCurrentPeriodStart: null,
            subscriptionCurrentPeriodEnd: null,
            billingGraceStartedAt: null,
            billingGraceEndsAt: null,
            billingGraceReason: null,
            billingGraceEmailStage: 0,
            billingGraceLastEmailAt: null,
            billingGraceLastFailureAt: null,
            deactivatedAt: now,
          },
        });
        await this.syncPlanModulesTx(tx, company.id, selectedPlanKey);
        await tx.companyModule.updateMany({ where: { companyId: company.id }, data: { enabled: false } });
        await this.createPendingCheckoutEntitlementsTx(tx, company.id, selectedPlanKey, now);
      });
    }

    if (companies.length > 0) {
      this.logger.warn(`Reverted ${companies.length} initial access grace companies to pending checkout.`);
    }

    const providerPending = await this.prisma.company.updateMany({
      where: {
        billingGraceReason: 'provider_pending',
        subscriptionStatus: 'grace',
        paymentStatus: 'PENDING',
        billingGraceEndsAt: { gt: now },
      },
      data: {
        paymentStatus: 'AUTHORIZED',
      },
    });

    if (providerPending.count > 0) {
      this.logger.warn(`Normalized ${providerPending.count} provider pending grace companies for login access.`);
    }
  }

  private async activateConfirmedTrialTx(tx: any, companyId: number, activatedAt: Date): Promise<Date | null> {
    const company = await tx.company.findUnique({
      where: { id: companyId },
      select: {
        selectedPlanKey: true,
        trialModuleSelection: true,
        primaryContactName: true,
        contactPhone: true,
        taxDocument: true,
      },
    });
    const selectedPlanKey = this.normalizeSelectedPlanKey(company?.selectedPlanKey || undefined);

    const trialDays = this.getPublicTrialDaysForPlan(selectedPlanKey);
    if (trialDays <= 0) {
      await tx.company.update({
        where: { id: companyId },
        data: {
          selectedPlanKey,
          trialModuleSelection: null,
          onboardingStatus: 'pending_checkout',
          isActive: false,
          paymentStatus: 'PENDING',
          subscriptionStatus: 'pending_checkout',
          premiumAccess: false,
          trialStartsAt: null,
          trialEndsAt: null,
          subscriptionCurrentPeriodStart: null,
          subscriptionCurrentPeriodEnd: null,
          deactivatedAt: activatedAt,
        },
      });
      await this.syncPlanModulesTx(tx, companyId, selectedPlanKey);
      await tx.companyModule.updateMany({ where: { companyId }, data: { enabled: false } });
      await this.createPendingCheckoutEntitlementsTx(tx, companyId, selectedPlanKey, activatedAt);
      return null;
    }

    const trialEndsAt = this.addDays(activatedAt, trialDays);
    const trialPhone = this.normalizeBrazilPhone(company?.contactPhone);
    if (!trialPhone || trialPhone.length < 10) {
      throw new BadRequestException({
        code: 'TRIAL_CONTACT_PHONE_REQUIRED',
        message: 'Informe um telefone de contato válido para iniciar o trial.',
      });
    }
    const existingTrialPhone = await this.ensureTrialPhoneAvailableTx(tx, companyId, trialPhone, 'activate');
    const trialPhoneMetadata = {
      acceptedTerms: true,
      activatedBy: 'email_confirmation',
      activatedAt: activatedAt.toISOString(),
      contactName: this.normalizeText(company?.primaryContactName),
      taxDocumentProvided: Boolean(this.normalizeDigits(company?.taxDocument)),
      selectedPlanKey,
    };
    if (existingTrialPhone) {
      await tx.trialPhoneUsage.update({
        where: { id: existingTrialPhone.id },
        data: {
          companyId,
          firstTrialStartsAt: activatedAt,
          firstTrialEndsAt: trialEndsAt,
          source: 'signup_trial',
          metadataJson: JSON.stringify(trialPhoneMetadata),
        },
      });
    } else {
      await tx.trialPhoneUsage.create({
        data: {
          phoneNormalized: trialPhone,
          companyId,
          firstTrialStartsAt: activatedAt,
          firstTrialEndsAt: trialEndsAt,
          source: 'signup_trial',
          metadataJson: JSON.stringify(trialPhoneMetadata),
        },
      });
    }
    await tx.company.update({
      where: { id: companyId },
      data: {
        selectedPlanKey,
        trialModuleSelection: this.resolveTrialModuleForPlan(selectedPlanKey),
        onboardingStatus: 'active_trial',
        isActive: true,
        paymentStatus: 'TRIAL',
        subscriptionStatus: 'trialing',
        premiumAccess: true,
        assistedSetupRequired: selectedPlanKey === COMMERCIAL_PLAN_KEYS.MELHOR,
        assistedSetupStatus: selectedPlanKey === COMMERCIAL_PLAN_KEYS.MELHOR ? 'pending' : 'not_required',
        assistedSetupCompletedAt: null,
        assistedSetupCompletedByUserId: null,
        assistedSetupNote: selectedPlanKey === COMMERCIAL_PLAN_KEYS.MELHOR
          ? 'Implantação assistida pendente para liberar automação completa.'
          : null,
        trialStartsAt: activatedAt,
        trialEndsAt,
        subscriptionCurrentPeriodStart: null,
        subscriptionCurrentPeriodEnd: null,
        deactivatedAt: null,
      },
    });
    await this.syncPlanModulesTx(tx, companyId, selectedPlanKey);
    for (const entitlementKey of COMMERCIAL_PLAN_ENTITLEMENT_KEYS[selectedPlanKey]) {
      await this.upsertEntitlementTx(
        tx,
        companyId,
        entitlementKey,
        'trialing',
        'trial',
        activatedAt,
        trialEndsAt,
        {
          selectedPlanKey,
          activatedBy: 'email_confirmation',
          activatedAt: activatedAt.toISOString(),
        },
      );
    }
    return trialEndsAt;
  }

  private async sendEmailConfirmationMail(input: {
    to: string;
    username: string;
    companyName: string;
    rawToken: string;
  }) {
    const confirmationLink = this.buildEmailConfirmationLink(input.rawToken);
    const template = await this.emailTemplates.getTemplateSafe('email_confirmation');
    const rendered = this.emailTemplates.renderTemplate(template, {
      nome: input.username,
      empresa: input.companyName,
      email: input.to,
      linkConfirmacao: confirmationLink,
      ano: new Date().getFullYear(),
    });
    const mailResult = await this.mail.sendMail({
      to: input.to,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
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
          role: 'USERMASTER',
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
        role: 'USERMASTER',
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

  async login(user: any, opts?: { companyId?: number; userAgent?: string; ip?: string }) {
    const now = new Date();
    const expiresAt = this.addSessionTtl(now);
    const sessionContext = await this.prisma.$transaction(async (tx) => {
      await tx.authSession.updateMany({
        where: {
          userId: Number(user.id),
          revokedAt: null,
        },
        data: {
          revokedAt: now,
          revokedReason: 'replaced_by_login',
        },
      });

      const updatedUser = await tx.user.update({
        where: { id: Number(user.id) },
        data: {
          currentSessionId: null,
          sessionVersion: { increment: 1 },
        },
        select: {
          id: true,
          email: true,
          companyId: true,
          isSystemMaster: true,
          sessionVersion: true,
        },
      });

      const session = await tx.authSession.create({
        data: {
          userId: updatedUser.id,
          lastSeenAt: now,
          expiresAt,
          userAgent: this.normalizeUserAgent(opts?.userAgent),
          ipHash: this.hashIp(opts?.ip),
        },
        select: { id: true },
      });

      await tx.user.update({
        where: { id: updatedUser.id },
        data: { currentSessionId: session.id },
      });

      return { user: updatedUser, sessionId: session.id };
    });

    const companyId = opts?.companyId ?? sessionContext.user.companyId ?? undefined;
    const payload = {
      sub: sessionContext.user.id,
      email: sessionContext.user.email,
      companyId,
      sid: sessionContext.sessionId,
      sv: sessionContext.user.sessionVersion,
    };
    const company = !Boolean(sessionContext.user?.isSystemMaster) && companyId
      ? await this.prisma.company.findUnique({
          where: { id: Number(companyId) },
          select: {
            onboardingStatus: true,
            subscriptionStatus: true,
            paymentStatus: true,
            premiumAccess: true,
            trialEndsAt: true,
          },
        })
      : null;
    const accessReleased =
      ['active', 'authorized', 'manual'].includes(String(company?.subscriptionStatus || '').trim().toLowerCase()) ||
      ['PAID', 'MANUAL'].includes(String(company?.paymentStatus || '').trim().toUpperCase()) ||
      Boolean(company?.premiumAccess);
    const pendingTrialActivation =
      !accessReleased &&
      (
        String(company?.onboardingStatus || '').trim().toLowerCase() === 'pending_trial_activation' ||
        String(company?.subscriptionStatus || '').trim().toLowerCase() === 'pending_trial_activation'
      );
    const pendingCheckout =
      !accessReleased &&
      !pendingTrialActivation &&
      (
        String(company?.onboardingStatus || '').trim().toLowerCase() === 'pending_checkout' ||
        String(company?.subscriptionStatus || '').trim().toLowerCase() === 'pending_checkout' ||
        String(company?.paymentStatus || '').trim().toUpperCase() === 'PENDING'
      );
    const paymentFailed =
      !accessReleased &&
      !pendingTrialActivation &&
      (
        String(company?.paymentStatus || '').trim().toUpperCase() === 'DISABLED' ||
        String(company?.paymentStatus || '').trim().toUpperCase() === 'OVERDUE' ||
        String(company?.subscriptionStatus || '').trim().toLowerCase() === 'past_due' ||
        String(company?.onboardingStatus || '').trim().toLowerCase() === 'suspended'
      );
    const trialExpired =
      !accessReleased &&
      !pendingTrialActivation &&
      (
        String(company?.paymentStatus || '').trim().toUpperCase() === 'EXPIRED' ||
        String(company?.subscriptionStatus || '').trim().toLowerCase() === 'expired' ||
        (
          company?.trialEndsAt instanceof Date &&
          company.trialEndsAt.getTime() < Date.now() &&
          (
            String(company?.paymentStatus || '').trim().toUpperCase() === 'TRIAL' ||
            String(company?.subscriptionStatus || '').trim().toLowerCase() === 'trialing' ||
            String(company?.onboardingStatus || '').trim().toLowerCase() === 'active_trial'
          )
        )
      );
    const commercialConversionNext = this.preCheckoutNextPath(
      trialExpired ? 'trial_expired' : paymentFailed ? 'payment_failed' : 'pending_checkout',
    );

    return {
      access_token: this.jwtService.sign(payload),
      next: Boolean(sessionContext.user?.isSystemMaster)
        ? '/dashboard/master'
        : pendingTrialActivation
          ? this.pendingTrialActivationNextPath()
          : trialExpired || paymentFailed || pendingCheckout
          ? commercialConversionNext
          : '/dashboard',
      requiresCheckout: trialExpired || paymentFailed || pendingCheckout,
      requiresTrialActivation: pendingTrialActivation,
    };
  }

  // LOGIN (SaaS tenant-safe)
  // - Client sends only username + password.
  // - We resolve tenant internally from the authenticated user record (user.companyId).
  // - We intentionally do not allow choosing company or providing companyId/companySlug.
  async loginWithUsername(username: string, password: string, opts?: { forceSession?: boolean; userAgent?: string; ip?: string }) {
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
    if (!Boolean(user?.isSystemMaster) && onboardingStatus === 'pending_email_confirmation' && !this.isLocalMockSignupFlow()) {
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

    if (!isSystemMaster && companyId && onboardingStatus === 'pending_email_confirmation' && this.isLocalMockSignupFlow()) {
      const confirmedAt = new Date();
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
        const selectedCompany = await tx.company.findUnique({
          where: { id: companyId },
          select: { selectedPlanKey: true },
        });
        const selectedPlanKey = this.normalizeSelectedPlanKey(selectedCompany?.selectedPlanKey || undefined);
        if (this.getPublicTrialDaysForPlan(selectedPlanKey) > 0) {
          await tx.company.update({
            where: { id: companyId },
            data: {
              selectedPlanKey,
              trialModuleSelection: this.resolveTrialModuleForPlan(selectedPlanKey),
              onboardingStatus: 'pending_trial_activation',
              isActive: false,
              paymentStatus: 'PENDING',
              subscriptionStatus: 'pending_trial_activation',
              premiumAccess: false,
              trialStartsAt: null,
              trialEndsAt: null,
              subscriptionCurrentPeriodStart: null,
              subscriptionCurrentPeriodEnd: null,
              deactivatedAt: confirmedAt,
            },
          });
          await tx.companyModule.updateMany({ where: { companyId }, data: { enabled: false } });
        } else {
          await this.activateConfirmedTrialTx(tx, companyId, confirmedAt);
        }
      });
    }

    if (!opts?.forceSession && !this.isLocalMockSignupFlow() && user.currentSessionId) {
      const activeSession = await this.prisma.authSession.findFirst({
        where: {
          id: user.currentSessionId,
          userId: user.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: {
          id: true,
          createdAt: true,
          lastSeenAt: true,
          expiresAt: true,
          userAgent: true,
        },
      });

      if (activeSession) {
        throw new ConflictException({
          code: 'SESSION_ALREADY_ACTIVE',
          message: 'Usuário conectado em outra máquina.',
          forceAvailable: true,
          activeSession: {
            createdAt: activeSession.createdAt,
            lastSeenAt: activeSession.lastSeenAt,
            expiresAt: activeSession.expiresAt,
            userAgent: activeSession.userAgent,
          },
        });
      }
    }

    return this.login(user, { companyId: companyId || undefined, userAgent: opts?.userAgent, ip: opts?.ip });
  }

  async logoutCurrentSession(user: any) {
    const userId = Number(user?.id || 0);
    const sessionId = String(user?.sessionId || user?.authSessionId || '').trim();
    if (!userId || !sessionId) {
      throw new UnauthorizedException('Sessão inválida');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.authSession.updateMany({
        where: {
          id: sessionId,
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
          revokedReason: 'logout',
        },
      });

      await tx.user.updateMany({
        where: {
          id: userId,
          currentSessionId: sessionId,
        },
        data: {
          currentSessionId: null,
        },
      });
    });

    return { ok: true };
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
    selectedPlanKey?: CommercialPlanKey;
    acquisitionSource?: 'google' | 'instagram' | 'youtube' | 'indicacao' | 'parceiro' | 'outro';
    acquisitionSourceDetail?: string;
    referralReferrerName?: string;
    referralCode?: string;
    trialContactName?: string;
    trialTaxDocument?: string;
    trialContactPhone?: string;
    acceptedTerms?: boolean;
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
    const selectedPlanKey = this.normalizePublicSelectedPlanKey(data.selectedPlanKey);
    const trialModuleSelection = this.getPublicTrialDaysForPlan(selectedPlanKey) > 0
      ? this.resolveTrialModuleForPlan(selectedPlanKey)
      : null;
    const signupTrialProfile = null as { contactName: string; contactPhone: string; taxDocument: string } | null;
    const acquisitionSource = this.normalizeAcquisitionSource(data.acquisitionSource);
    const acquisitionSourceDetail = String(data.acquisitionSourceDetail || '').trim() || null;
    const referralReferrerName = String(data.referralReferrerName || '').trim() || null;
    const referralCode = String(data.referralCode || '').trim() || null;
    const hasHbxSalesReferral = this.hasHbxSalesLeadReferral(acquisitionSourceDetail, referralCode);
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
        const companyUsers = await this.prisma.user.count({ where: { companyId } });
        const updated = await this.prisma.user.update({
          where: { id: existingUsername.id },
          data: {
            email,
            password: hashed,
            name: resolvedName,
            role: companyUsers <= 1 ? 'ADMIN' : existingUsername.role,
            emailConfirmedAt: existingUsername.emailConfirmedAt || new Date(),
            emailConfirmationToken: null,
            emailConfirmationSentAt: null,
            emailConfirmationExpiresAt: null,
            companyId,
          },
        });
        return this.login(updated, { companyId });
      }

      const rawToken = this.createEmailConfirmationToken();
      const tokenHash = this.sha256(rawToken);
      const confirmationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const createdPending = await this.prisma.$transaction(async (tx) => {
        const existingCompany = await this.findCompanyByDisplayNameTx(tx, displayName);
        if (existingCompany) {
          const pendingEmailConfirmation =
            String(existingCompany.onboardingStatus || '').trim().toLowerCase() === 'pending_email_confirmation';
          if (Number(existingCompany._count?.users || 0) > 0) {
            throw new ConflictException('Empresa já cadastrada. Usuários comuns devem ser criados pelo ADMIN no Gerencial.');
          }
          const updated = await tx.user.update({
            where: { id: existingUsername.id },
            data: {
              email,
              password: hashed,
              name: resolvedName,
              role: 'ADMIN',
              companyId: existingCompany.id,
              emailConfirmedAt: pendingEmailConfirmation ? null : existingUsername.emailConfirmedAt || new Date(),
              emailConfirmationToken: pendingEmailConfirmation ? tokenHash : null,
              emailConfirmationSentAt: pendingEmailConfirmation ? new Date() : null,
              emailConfirmationExpiresAt: pendingEmailConfirmation ? confirmationExpiresAt : null,
            },
          });
          if (signupTrialProfile) {
            await tx.company.update({
              where: { id: existingCompany.id },
              data: {
                primaryContactName: signupTrialProfile.contactName,
                contactPhone: signupTrialProfile.contactPhone,
                taxDocument: signupTrialProfile.taxDocument || null,
              },
            });
            await this.reserveSignupTrialPhoneTx(tx, existingCompany.id, signupTrialProfile, selectedPlanKey, updated.id);
          }
          if (hasHbxSalesReferral) {
            await tx.company.update({
              where: { id: existingCompany.id },
              data: {
                acquisitionSource: acquisitionSource || 'indicacao',
                acquisitionSourceDetail,
                referralReferrerName,
                referralCode,
              },
            });
          }
          return {
            attachedToExistingCompany: true,
            companyId: existingCompany.id,
            companyName: existingCompany.name,
            pendingEmailConfirmation,
            user: updated,
          };
        }

        const company = await tx.company.create({
          data: {
            slug,
            name: displayName,
            entityType: entityType || 'PJ',
            trialModuleSelection,
            selectedPlanKey,
            assistedSetupRequired: selectedPlanKey === COMMERCIAL_PLAN_KEYS.MELHOR,
            assistedSetupStatus: selectedPlanKey === COMMERCIAL_PLAN_KEYS.MELHOR ? 'pending' : 'not_required',
            assistedSetupCompletedAt: null,
            assistedSetupCompletedByUserId: null,
            assistedSetupNote: selectedPlanKey === COMMERCIAL_PLAN_KEYS.MELHOR
              ? 'Implantação assistida pendente para liberar automação completa.'
              : null,
            signupUsesPublicEmail: usesPublicEmail,
            acquisitionSource,
            acquisitionSourceDetail,
            referralReferrerName,
            referralCode,
            primaryContactName: signupTrialProfile?.contactName || resolvedName,
            contactEmail: email,
            contactPhone: signupTrialProfile?.contactPhone || null,
            taxDocument: signupTrialProfile?.taxDocument || null,
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
        await this.seedDefaultCompanyModulesTx(tx, company.id);
        await this.syncPlanModulesTx(tx, company.id, selectedPlanKey);
        const updated = await tx.user.update({
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
        if (signupTrialProfile) {
          await this.reserveSignupTrialPhoneTx(tx, company.id, signupTrialProfile, selectedPlanKey, updated.id);
        }
        return { attachedToExistingCompany: false, companyId: company.id, companyName: company.name, user: updated };
      });

      await this.syncHbxSalesReferralCompany(
        (createdPending as any).companyId || (createdPending as any).user?.companyId,
        'auth_signup_pending_hbx_lead',
        hasHbxSalesReferral,
      );

      if ((createdPending as any).attachedToExistingCompany && !(createdPending as any).pendingEmailConfirmation) {
        return this.login((createdPending as any).user, { companyId: (createdPending as any).companyId });
      }

      if (this.isLocalMockSignupFlow()) {
        return this.confirmEmail(rawToken);
      }

      const delivery = await this.dispatchEmailConfirmation({
        email,
        username,
        companyName: createdPending.companyName,
        rawToken,
      });

      return this.buildPendingEmailConfirmationResponse({
        userId: Number((createdPending as any).user?.id || existingUsername.id),
        email,
        username,
        companyName: createdPending.companyName,
        entityType,
        trialModuleSelection,
        selectedPlanKey,
        acquisitionSource,
        warnings,
        message: delivery.failed
          ? this.emailConfirmationDeliveryFailureMessage()
          : this.pendingConfirmationSuccessMessage(selectedPlanKey),
        previewUrl: delivery.previewUrl,
        confirmUrl: delivery.confirmUrl,
        deliveryFailed: delivery.failed,
        deliveryErrorCode: delivery.errorCode,
        deliveryErrorMessage: delivery.errorMessage,
      });
    }

    // New account: create company + user atomically.
    const rawToken = this.createEmailConfirmationToken();
    const tokenHash = this.sha256(rawToken);
    const confirmationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const created = await this.prisma.$transaction(async (tx) => {
      const existingCompany = await this.findCompanyByDisplayNameTx(tx, displayName);
      if (existingCompany) {
        const pendingEmailConfirmation =
          String(existingCompany.onboardingStatus || '').trim().toLowerCase() === 'pending_email_confirmation';
          if (Number(existingCompany._count?.users || 0) > 0) {
            throw new ConflictException('Empresa já cadastrada. Usuários comuns devem ser criados pelo ADMIN no Gerencial.');
          }
          const user = await tx.user.create({
            data: {
            username,
            email,
            password: hashed,
            name: resolvedName,
            role: 'ADMIN',
            companyId: existingCompany.id,
            emailConfirmedAt: pendingEmailConfirmation ? null : new Date(),
            emailConfirmationToken: pendingEmailConfirmation ? tokenHash : null,
            emailConfirmationSentAt: pendingEmailConfirmation ? new Date() : null,
            emailConfirmationExpiresAt: pendingEmailConfirmation ? confirmationExpiresAt : null,
          },
        });
        if (signupTrialProfile) {
          await tx.company.update({
            where: { id: existingCompany.id },
            data: {
              primaryContactName: signupTrialProfile.contactName,
              contactPhone: signupTrialProfile.contactPhone,
              taxDocument: signupTrialProfile.taxDocument || null,
            },
          });
          await this.reserveSignupTrialPhoneTx(tx, existingCompany.id, signupTrialProfile, selectedPlanKey, user.id);
        }
        if (hasHbxSalesReferral) {
          await tx.company.update({
            where: { id: existingCompany.id },
            data: {
              acquisitionSource: acquisitionSource || 'indicacao',
              acquisitionSourceDetail,
              referralReferrerName,
              referralCode,
            },
          });
        }

        return {
          attachedToExistingCompany: true,
          companyId: existingCompany.id,
          companyName: existingCompany.name,
          pendingEmailConfirmation,
          user,
        };
      }

      const company = await tx.company.create({
        data: {
          slug,
          name: displayName,
          entityType: entityType || 'PJ',
          trialModuleSelection,
          selectedPlanKey,
          assistedSetupRequired: selectedPlanKey === COMMERCIAL_PLAN_KEYS.MELHOR,
          assistedSetupStatus: selectedPlanKey === COMMERCIAL_PLAN_KEYS.MELHOR ? 'pending' : 'not_required',
          assistedSetupCompletedAt: null,
          assistedSetupCompletedByUserId: null,
          assistedSetupNote: selectedPlanKey === COMMERCIAL_PLAN_KEYS.MELHOR
            ? 'Implantação assistida pendente para liberar automação completa.'
            : null,
          signupUsesPublicEmail: usesPublicEmail,
          acquisitionSource,
          acquisitionSourceDetail,
        referralReferrerName,
        referralCode,
        primaryContactName: signupTrialProfile?.contactName || resolvedName,
        contactEmail: email,
        contactPhone: signupTrialProfile?.contactPhone || null,
        taxDocument: signupTrialProfile?.taxDocument || null,
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

      await this.seedDefaultCompanyModulesTx(tx, company.id);
      await this.syncPlanModulesTx(tx, company.id, selectedPlanKey);

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
      if (signupTrialProfile) {
        await this.reserveSignupTrialPhoneTx(tx, company.id, signupTrialProfile, selectedPlanKey, user.id);
      }

      return { attachedToExistingCompany: false, companyId: company.id, companyName: company.name, user };
    });

    await this.syncHbxSalesReferralCompany(
      (created as any).companyId || (created as any).user?.companyId,
      'auth_signup_pending_hbx_lead',
      hasHbxSalesReferral,
    );

    if ((created as any).attachedToExistingCompany && !(created as any).pendingEmailConfirmation) {
      return this.login((created as any).user, { companyId: (created as any).companyId });
    }

    if (this.isLocalMockSignupFlow()) {
      return this.confirmEmail(rawToken);
    }

    const delivery = await this.dispatchEmailConfirmation({
      email,
      username,
      companyName: created.companyName,
      rawToken,
    });

    return this.buildPendingEmailConfirmationResponse({
      userId: Number((created as any).user?.id || 0),
      email,
      username,
      companyName: created.companyName,
      entityType,
      trialModuleSelection,
      selectedPlanKey,
      acquisitionSource,
      warnings,
      message: delivery.failed
        ? this.emailConfirmationDeliveryFailureMessage()
        : this.pendingConfirmationSuccessMessage(selectedPlanKey),
      previewUrl: delivery.previewUrl,
      confirmUrl: delivery.confirmUrl,
      deliveryFailed: delivery.failed,
      deliveryErrorCode: delivery.errorCode,
      deliveryErrorMessage: delivery.errorMessage,
    });
  }

  async confirmEmail(token: string, opts?: { userAgent?: string; ip?: string }) {
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
        role: true,
        isSystemMaster: true,
        emailConfirmationExpiresAt: true,
        company: {
          select: {
            selectedPlanKey: true,
          },
        },
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
    const selectedPlanKey = this.normalizeSelectedPlanKey(user.company?.selectedPlanKey || undefined);
    const requiresTrialActivation = Boolean(user.companyId && this.getPublicTrialDaysForPlan(selectedPlanKey) > 0);

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
        if (requiresTrialActivation) {
          await tx.company.update({
            where: { id: Number(user.companyId) },
            data: {
              selectedPlanKey,
              trialModuleSelection: this.resolveTrialModuleForPlan(selectedPlanKey),
              onboardingStatus: 'pending_trial_activation',
              isActive: false,
              paymentStatus: 'PENDING',
              subscriptionStatus: 'pending_trial_activation',
              premiumAccess: false,
              trialStartsAt: null,
              trialEndsAt: null,
              subscriptionCurrentPeriodStart: null,
              subscriptionCurrentPeriodEnd: null,
              deactivatedAt: confirmedAt,
            },
          });
          await this.syncPlanModulesTx(tx, Number(user.companyId), selectedPlanKey);
          await tx.companyModule.updateMany({ where: { companyId: Number(user.companyId) }, data: { enabled: false } });
        } else {
          trialEndsAt = await this.activateConfirmedTrialTx(tx, Number(user.companyId), confirmedAt);
        }
      }
    });

    if (user.companyId) {
      await this.hbxCommissionSync.syncActivatedCompany(Number(user.companyId), {
        source: requiresTrialActivation ? 'auth_email_confirmed_pending_trial' : 'auth_email_confirmed',
      }).catch((error: any) => {
        this.logger.warn(`commission_sync_confirm_email_failed company=${user.companyId} error=${String(error?.message || error)}`);
      });
    }

    const loginPayload = user.companyId
      ? await this.login(
          {
            id: user.id,
            email: user.email,
            companyId: user.companyId,
            role: user.role,
            isSystemMaster: user.isSystemMaster,
          },
          { companyId: Number(user.companyId), userAgent: opts?.userAgent, ip: opts?.ip },
        )
      : null;
    const next = loginPayload?.next || (requiresTrialActivation ? this.pendingTrialActivationNextPath() : trialEndsAt ? '/dashboard' : this.pendingCheckoutNextPath());

    return {
      ok: true,
      status: user.companyId ? (requiresTrialActivation ? 'pending_trial_activation' : trialEndsAt ? 'active_trial' : 'pending_checkout') : 'confirmed',
      email: user.email || null,
      message: user.companyId
        ? requiresTrialActivation
          ? 'E-mail confirmado. Agora ative seu trial gratuito de 14 dias.'
          : trialEndsAt
          ? `E-mail confirmado. O trial gratuito está ativo até ${trialEndsAt.toLocaleDateString('pt-BR')}.`
          : 'E-mail confirmado. Finalize o pagamento no Financeiro para liberar o plano.'
        : 'E-mail confirmado com sucesso.',
      trialStartsAt: user.companyId ? confirmedAt.toISOString() : null,
      trialEndsAt: trialEndsAt ? trialEndsAt.toISOString() : null,
      access_token: loginPayload?.access_token || null,
      next,
      loginNext: loginPayload?.access_token
        ? next
        : requiresTrialActivation
        ? `/login?next=${encodeURIComponent(this.pendingTrialActivationNextPath())}`
        : trialEndsAt
        ? '/login?next=/dashboard'
        : `/login?next=${encodeURIComponent(this.pendingCheckoutNextPath())}`,
      requiresCheckout: Boolean(loginPayload?.requiresCheckout),
      requiresTrialActivation,
    };
  }

  async activateTrialAfterEmailConfirmation(user: any, data: {
    trialContactName?: string | null;
    trialTaxDocument?: string | null;
    trialContactPhone?: string | null;
    acceptedTerms?: boolean | null;
  }) {
    const userId = Number(user?.id || 0);
    const companyId = Number(user?.companyId || 0);
    if (!userId || !companyId) {
      throw new UnauthorizedException('Sessão inválida para ativar trial.');
    }

    const trialProfile = this.validateSignupTrialProfile(data);
    const now = new Date();
    let trialEndsAt: Date | null = null;

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        selectedPlanKey: true,
        onboardingStatus: true,
        subscriptionStatus: true,
        paymentStatus: true,
        premiumAccess: true,
        trialEndsAt: true,
        users: {
          where: { id: userId },
          select: { id: true, emailConfirmedAt: true },
          take: 1,
        },
      },
    });

    if (!company || !company.users?.length) {
      throw new UnauthorizedException('Empresa inválida para ativar trial.');
    }
    if (!company.users[0].emailConfirmedAt) {
      throw new BadRequestException({
        code: 'EMAIL_CONFIRMATION_REQUIRED',
        message: 'Confirme seu e-mail antes de ativar o trial.',
      });
    }

    const selectedPlanKey = this.normalizeSelectedPlanKey(company.selectedPlanKey || undefined);
    if (this.getPublicTrialDaysForPlan(selectedPlanKey) <= 0) {
      throw new BadRequestException({
        code: 'TRIAL_NOT_AVAILABLE_FOR_PLAN',
        message: 'Este plano nao possui trial gratuito. Finalize o pagamento para liberar o acesso.',
      });
    }

    const subscriptionStatus = String(company.subscriptionStatus || '').trim().toLowerCase();
    const paymentStatus = String(company.paymentStatus || '').trim().toUpperCase();
    if (
      company.premiumAccess &&
      (subscriptionStatus === 'trialing' || paymentStatus === 'TRIAL') &&
      company.trialEndsAt &&
      company.trialEndsAt.getTime() > now.getTime()
    ) {
      return {
        ok: true,
        status: 'active_trial',
        message: `Trial ja ativo ate ${company.trialEndsAt.toLocaleDateString('pt-BR')}.`,
        trialStartsAt: null,
        trialEndsAt: company.trialEndsAt.toISOString(),
        next: '/boasvindas',
      };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id: companyId },
        data: {
          selectedPlanKey,
          primaryContactName: trialProfile.contactName,
          contactPhone: trialProfile.contactPhone,
          taxDocument: trialProfile.taxDocument || null,
        },
      });
      trialEndsAt = await this.activateConfirmedTrialTx(tx, companyId, now);
    });

    await this.hbxCommissionSync.syncActivatedCompany(companyId, { source: 'auth_trial_started' }).catch((error: any) => {
      this.logger.warn(`commission_sync_trial_failed company=${companyId} error=${String(error?.message || error)}`);
    });

    return {
      ok: true,
      status: 'active_trial',
      message: trialEndsAt
        ? `Trial gratuito ativo ate ${trialEndsAt.toLocaleDateString('pt-BR')}.`
        : 'Trial ativado.',
      trialStartsAt: now.toISOString(),
      trialEndsAt: trialEndsAt ? trialEndsAt.toISOString() : null,
      next: '/boasvindas',
    };
  }

  async emailConfirmationStatus(pollToken: string) {
    const userId = this.verifyEmailConfirmationPollToken(pollToken);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        emailConfirmedAt: true,
        company: {
          select: {
            onboardingStatus: true,
            subscriptionStatus: true,
            paymentStatus: true,
            premiumAccess: true,
            selectedPlanKey: true,
          },
        },
      },
    });

    if (!user) {
      throw new BadRequestException({ code: 'EMAIL_CONFIRMATION_STATUS_INVALID', message: 'Acompanhamento de confirmação inválido.' });
    }

    const onboardingStatus = String(user.company?.onboardingStatus || '').trim().toLowerCase();
    const subscriptionStatus = String(user.company?.subscriptionStatus || '').trim().toLowerCase();
    const paymentStatus = String(user.company?.paymentStatus || '').trim().toUpperCase();
    const pendingEmailConfirmation = !user.emailConfirmedAt || onboardingStatus === 'pending_email_confirmation';
    const pendingTrialActivation =
      !pendingEmailConfirmation &&
      (onboardingStatus === 'pending_trial_activation' || subscriptionStatus === 'pending_trial_activation');
    const accessReleased =
      ['active', 'authorized', 'manual'].includes(subscriptionStatus) ||
      paymentStatus === 'PAID' ||
      paymentStatus === 'MANUAL' ||
      Boolean(user.company?.premiumAccess);
    const trialExpired =
      !pendingEmailConfirmation &&
      !pendingTrialActivation &&
      !accessReleased &&
      (paymentStatus === 'EXPIRED' || subscriptionStatus === 'expired');
    const pendingCheckout =
      !pendingEmailConfirmation &&
      !pendingTrialActivation &&
      !accessReleased &&
      (onboardingStatus === 'pending_checkout' || subscriptionStatus === 'pending_checkout' || paymentStatus === 'PENDING');
    const paymentFailed =
      !pendingEmailConfirmation &&
      !pendingTrialActivation &&
      !accessReleased &&
      (onboardingStatus === 'suspended' || subscriptionStatus === 'past_due' || paymentStatus === 'DISABLED' || paymentStatus === 'OVERDUE');
    const status = pendingEmailConfirmation
      ? 'pending_email_confirmation'
      : pendingTrialActivation
        ? 'pending_trial_activation'
      : trialExpired
        ? 'pending_checkout'
      : paymentFailed
        ? 'pending_checkout'
      : pendingCheckout
        ? 'pending_checkout'
        : 'active_trial';
    const next = pendingTrialActivation
      ? this.pendingTrialActivationNextPath()
      : trialExpired
        ? this.preCheckoutNextPath('trial_expired')
      : paymentFailed
        ? this.preCheckoutNextPath('payment_failed')
      : pendingCheckout
        ? this.pendingCheckoutNextPath()
        : '/dashboard';

    return {
      ok: true,
      status,
      confirmed: !pendingEmailConfirmation,
      email: user.email || null,
      next,
      loginNext: pendingTrialActivation
        ? `/login?next=${encodeURIComponent(this.pendingTrialActivationNextPath())}`
        : trialExpired
          ? `/login?next=${encodeURIComponent(this.preCheckoutNextPath('trial_expired'))}`
        : paymentFailed
          ? `/login?next=${encodeURIComponent(this.preCheckoutNextPath('payment_failed'))}`
        : pendingCheckout ? `/login?next=${encodeURIComponent(this.pendingCheckoutNextPath())}` : '/login?next=/dashboard',
      requiresTrialActivation: pendingTrialActivation,
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

    const rawToken = this.createEmailConfirmationToken();
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
      confirmationPollToken: this.buildEmailConfirmationPollToken(user.id),
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
      const template = await this.emailTemplates.getTemplateSafe('password_reset');
      const rendered = this.emailTemplates.renderTemplate(template, {
        nome: String(user.name || user.username || user.email || 'cliente'),
        email: user.email,
        linkRecuperacao: link,
        ano: new Date().getFullYear(),
      });
      const mailResult = await this.mail.sendMail({
        to: user.email,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
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
