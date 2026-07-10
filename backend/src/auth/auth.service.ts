import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
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
import { SESSION_IDLE_TTL_MS } from './session-ttl';
import { withoutTenantScope } from '../prisma/tenant-context';
import {
  COMMERCIAL_ENTITLEMENT_KEYS,
  COMMERCIAL_PLAN_ENTITLEMENT_KEYS,
  COMMERCIAL_PLAN_MODULE_KEYS,
  PENDING_COMMERCIAL_ENTITLEMENT_STATUS,
  normalizeCommercialPlanKey,
  type ActiveCommercialPlanKey,
  type CommercialPlanKey,
} from '../commercial-plans/commercial-plan-catalog';
import * as TrialUsage from '../commercial-plans/trial-usage';
import { evaluateSignupRisk } from './signup-risk';
import { HbxCommissionSyncService } from '../commissions/hbx-commission-sync.service';
import { CreditsService } from '../credits/credits.service';
import { isCreditsFeatureEnabled } from '../credits/credits.flags';
import { isPlatformInfraCompany } from '../common/company-kind';
import { emitMasterEvent } from '../common/master-event';
import { resolveCompanyAccessState, normalizeCompanyAccountType } from '../modules/company-access-state';
import {
  ensureUserTeamPolicyForUser,
  loadUserTeamPolicyRuntime,
  resolveTeamPolicyAccessAllowed,
} from '../team/team-policy-persistence';
import {
  buildProvisioningLedger,
  seedTenantDefaultProductsTx,
  serializeProvisioningLedger,
} from '../master-provisioning/tenant-provisioning.pipeline';

// FIX-SEG (07/07) anti-enumeração/anti-timing no login: quando o usuário NÃO
// existe, rodamos um bcrypt.compare descartável contra este hash constante (de
// uma senha aleatória) só pra nivelar o tempo de resposta com o caminho de
// "senha errada". Sem isso, "não existe" respondia na hora e "senha incorreta"
// gastava o custo do bcrypt → dava pra enumerar contas válidas pelo relógio.
const DUMMY_BCRYPT_HASH = '$2a$10$Z5odsAC5lWgj5GYLv8fiy.8.xqaBujYYXk7Khufb8pSqG7JWLUoEK';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private readonly sessionTtlMs = SESSION_IDLE_TTL_MS;

  // FIX-SEG (07/07) OTP WhatsApp: store server-side do desafio. O código NUNCA
  // mais viaja no token. Antes o `ch = sha256(code)` ia DENTRO do JWT devolvido
  // ao cliente → dava pra rodar sha256 de 000000..999999 (1M hashes, segundos)
  // e quebrar o código OFFLINE, sem chutar no endpoint (rate-limit não protegia).
  // Agora o token carrega só um `cid` opaco e o hash do código vive AQUI, na
  // memória do servidor, com teto de tentativas.
  // TRADEOFF: memória perde estado no restart do container e não é compartilhada
  // entre instâncias — aceitável p/ OTP de 10min (basta pedir novo código; o app
  // roda em container único). Evita migration/risco de boot. Se um dia virar
  // multi-instância, migrar p/ tabela/cache.
  private readonly whatsappChallenges = new Map<
    string,
    { userId: number; phone: string; codeHash: string; attempts: number; expiresAt: number }
  >();

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private prisma: PrismaService,
    private mail: MailService,
    private emailTemplates: EmailTemplateService,
    private hbxCommissionSync: HbxCommissionSyncService,
    private credits: CreditsService,
  ) {}

  // CRÉDITOS A3 (docs/PLANEJAMENTOS/CREDITOS/A3-RESULTADO.md) — lote grátis de boas-vindas.
  // Chamado FORA da transação de criação da Company (nunca acopla erro de crédito ao rollback
  // do signup) nos 2 choke points de nascimento de empresa TENANT self-service
  // (signupWithGoogle / signup). Best-effort puro: grantWelcomeBatch já engole qualquer erro
  // e respeita HBX_CREDITS_ENABLED — este wrapper só existe pra documentar o contrato no
  // ponto de chamada (nunca lança, nunca é `await`ado de forma bloqueante-crítica).
  private grantWelcomeCreditsBatch(companyId: number | null | undefined) {
    const companyIdNum = Number(companyId || 0);
    if (!companyIdNum) return;
    this.credits.grantWelcomeBatch(companyIdNum).catch((error: any) => {
      this.logger.warn(`welcome_batch_grant_unexpected_throw company=${companyIdNum} error=${String(error?.message || error)}`);
    });
  }

  // CRÉDITOS (cutover 06/07) — grant dos 50 créditos grátis DEPOIS da identidade confirmada
  // (email OU código WhatsApp/F6), com DEDUP anti-farra por telefone/CPF (regra do dono 06/07:
  // "confirmar repetição de CPF ou telefone"). Se a mesma identidade já existe em OUTRA empresa,
  // a conta é criada normalmente mas NÃO recebe o brinde de novo (resposta do dono: não bloquear,
  // só não dar). Best-effort e gated por HBX_CREDITS_ENABLED — com a chavinha OFF é no-op (o
  // grantWelcomeBatch também no-opa). Fail-CLOSED do brinde: se a checagem de dedup falhar, NÃO
  // concede (evita farra às cegas) — nunca trava a confirmação em si.
  private async maybeGrantWelcomeAfterConfirm(companyId: number | null | undefined) {
    const id = Number(companyId || 0);
    if (!id || !isCreditsFeatureEnabled()) return;
    try {
      const company = await this.prisma.company.findUnique({
        where: { id },
        select: { status: true, accountType: true, contactPhone: true, taxDocument: true },
      });
      // O welcome é brinde de NASCIMENTO self-service (MASTER-REFAB S6 10/07 noite: a conta
      // ativada na confirmação/Google nasce direto `active`, não mais `courtesy` — o filtro por
      // STATUS cru ficou errado pra distinguir "tenant de crédito novo" de "tenant pago antigo
      // que também está com status=active"). Filtro correto agora é o TIPO: só accountType
      // 'credit' ganha lote — tenant enterprise (cobrança manual/MP) NUNCA ganha, senão todo
      // tenant pago antigo ganharia 50 créditos de graça no primeiro confirm pós-chavinha.
      // (usageKey welcome:<id> já dedupa por empresa, mas o filtro evita a tentativa à toa.)
      const accountType = normalizeCompanyAccountType(company?.accountType);
      if (accountType !== 'credit') {
        this.logger.log(`welcome_batch_skipped_account_type company=${id} accountType=${accountType}`);
        return;
      }
      const companyStatus = String(company?.status || '').trim().toLowerCase();
      if (companyStatus === 'suspended') {
        this.logger.log(`welcome_batch_skipped_status company=${id} status=${companyStatus}`);
        return;
      }
      const phone = this.normalizeBrazilPhone(company?.contactPhone) || null;
      const taxDoc = (this.normalizeDigits(company?.taxDocument || '') || '').slice(0, 14) || null;
      if (phone || taxDoc) {
        const clash = await this.prisma.company.findFirst({
          where: {
            id: { not: id },
            OR: [
              ...(phone ? [{ contactPhone: phone }] : []),
              ...(taxDoc ? [{ taxDocument: taxDoc }] : []),
            ],
          },
          select: { id: true },
        });
        if (clash) {
          this.logger.warn(`welcome_batch_skipped_duplicate_identity company=${id} clashWith=${clash.id}`);
          return;
        }
      }
    } catch (error: any) {
      this.logger.warn(`welcome_dedup_check_failed company=${id} error=${String(error?.message || error)}`);
      return; // fail-closed do brinde
    }
    this.grantWelcomeCreditsBatch(id);
  }

  async onModuleInit() {
    await this.ensureSystemMasterUser();
  }

  private masterUsername() {
    return String(process.env.SYSTEM_MASTER_USERNAME || 'jhonatan.barata').trim();
  }

  private masterEmail() {
    const raw = process.env.SYSTEM_MASTER_EMAIL;
    if (raw == null) return null;
    return String(raw).trim() || null;
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
        status: true,
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

  private normalizeBrazilPhone(value: unknown) {
    const digits = this.normalizeDigits(value);
    const withoutCountry = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
    return withoutCountry.slice(0, 11);
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

  private normalizeSelectedPlanKey(value: string | undefined): ActiveCommercialPlanKey {
    return normalizeCommercialPlanKey(value);
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

  // Gera/renova o token de confirmação de e-mail de um usuário e devolve o
  // rawToken pra dispatch. Fonte única usada pelo reenvio e pelo re-cadastro
  // (F4) — nada de duplicar a renovação de token em dois lugares.
  private async refreshEmailConfirmationToken(userId: number): Promise<string> {
    const rawToken = this.createEmailConfirmationToken();
    const tokenHash = this.sha256(rawToken);
    const confirmationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailConfirmationToken: tokenHash,
        emailConfirmationSentAt: new Date(),
        emailConfirmationExpiresAt: confirmationExpiresAt,
      },
    });
    return rawToken;
  }

  private preCheckoutNextPath(_reason: 'pending_checkout' | 'trial_expired' | 'payment_failed' = 'pending_checkout') {
    // F8 (19/06): rota /pre-checkout era alias redirect-only para /dashboard.
    // Aponta direto: o bloqueio-gate captura o pending_checkout em /dashboard.
    // O parâmetro _reason foi preservado na assinatura para não quebrar os callers.
    return `/dashboard`;
  }

  private pendingCheckoutNextPath() {
    return this.preCheckoutNextPath('pending_checkout');
  }

  // ── Máquina de estados do onboarding (F4 19/06 — fonte ÚNICA) ─────────────
  // O passo NÃO é coluna nova: deriva de emailConfirmedAt (fato do usuário) +
  // company.status (via resolveCompanyAccessState). Todas as superfícies
  // (funil, login, re-cadastro, reload) leem ESTE derivador — nunca recalculam.
  private deriveOnboardingStep(input: {
    emailConfirmedAt?: Date | null;
    company?: any | null;
  }): 'awaiting_email' | 'awaiting_payment' | 'done' {
    if (!input.emailConfirmedAt) return 'awaiting_email';
    const access = resolveCompanyAccessState(input.company);
    if (access.canUse && access.state !== 'platform_infra') return 'done';
    return 'awaiting_payment';
  }

  // Cooldown do reenvio (60s): o front mostra a contagem, mas a VERDADE do
  // "próximo permitido em" vem daqui (sobrevive a reload/relogin).
  private static readonly EMAIL_RESEND_COOLDOWN_MS = 60_000;
  private resendAvailableAtFrom(sentAt?: Date | null): string | null {
    if (!sentAt) return null;
    return new Date(sentAt.getTime() + AuthService.EMAIL_RESEND_COOLDOWN_MS).toISOString();
  }

  // Resume payload comum (funil + login bloqueado): onde a pessoa parou.
  private buildOnboardingResume(input: {
    email?: string | null;
    emailConfirmedAt?: Date | null;
    emailConfirmationSentAt?: Date | null;
    company?: any | null;
  }) {
    const step = this.deriveOnboardingStep(input);
    return {
      step,
      planKey: input.company?.selectedPlanKey || null,
      email: input.email || null,
      resendAvailableAt: step === 'awaiting_email'
        ? this.resendAvailableAtFrom(input.emailConfirmationSentAt)
        : null,
    };
  }

  private assertOperationalWorkspaceCompany(company?: any | null) {
    if (isPlatformInfraCompany(company)) {
      throw new UnauthorizedException('Empresa de infraestrutura nao possui workspace operacional.');
    }
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
    // P0.2 (PR10072026 W1): plano morreu no signup público. Os dois campos
    // ficam no payload SÓ por compat com clients velhos em cache — conta nova
    // responde sempre null (o resume de conta legada repassa o valor gravado).
    trialModuleSelection: 'vendas' | null;
    selectedPlanKey: string | null;
    acquisitionSource: string | null;
    warnings: string[];
    message?: string;
    previewUrl?: string | null;
    confirmUrl?: string | null;
    deliveryFailed?: boolean;
    deliveryErrorCode?: string | null;
    deliveryErrorMessage?: string | null;
    checkoutToken?: string | null;
  }) {
    return {
      ok: true,
      status: 'pending_email_confirmation',
      message: input.message || 'Cadastro criado. Confirme seu e-mail para ativar sua conta.',
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
      // Sessão de escopo restrito (pending_checkout): permite que o front mostre
      // o checkout na mesma cena sem aguardar confirmação de e-mail. A empresa fica
      // em pending_checkout; nenhum módulo é liberado até o checkout com cartão.
      checkout_token: input.checkoutToken || null,
      delivery: {
        previewUrl: input.previewUrl || null,
        confirmUrl: input.confirmUrl || null,
        failed: Boolean(input.deliveryFailed),
        errorCode: input.deliveryErrorCode || null,
        errorMessage: input.deliveryErrorMessage || null,
      },
    };
  }

  private pendingConfirmationSuccessMessage() {
    // P0.2 (PR10072026 W1): sem plano no cadastro não existe mais mensagem de
    // trial/checkout — a confirmação de e-mail é o único próximo passo.
    return 'Cadastro criado. Confirme seu e-mail para ativar sua conta.';
  }

  private async seedDefaultCompanyModulesTx(_tx: any, _companyId: number) {
    // Post-it (PR13062026007 PB2): a empresa NÃO nasce com cópia de módulos.
    // Ela segue a "caixa do plano" (ao vivo); CompanyModule passa a guardar só
    // post-it (exceção explícita do master, no Full). Sem seed = sem cópia
    // congelada que ignoraria as edições do plano.
  }

  private async seedDefaultTenantProductsTx(tx: any, companyId: number) {
    // Pipeline único de nascimento (multi-tenancy S4), preset self_service: a
    // semente default aqui é a MESMA das portas do master (produtos default,
    // rascunho). Comportamento idêntico ao inline anterior — só converge para a
    // fonte única para que o signup não divirja do provisionamento.
    return seedTenantDefaultProductsTx(tx, companyId, { source: 'auth_signup' });
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
        metadata,
      );
    }
  }

  private async activateConfirmedTrialTx(tx: any, companyId: number, activatedAt: Date): Promise<Date | null> {
    // SEGURANCA / regra travada do dono (16/06): o TRIAL EXIGE CARTAO. A
    // confirmacao de e-mail NAO concede mais trial nenhum — ela so confirma o
    // e-mail e deixa a empresa em `pending_checkout`. O trial (e qualquer
    // acesso) so nasce no checkout, quando o cartao e capturado
    // (financeiro.service.createSubscriptionForUser / createMockSubscriptionForUser,
    // que exigem cardTokenId). Antes daqui se liberava trial SEM cartao —
    // furo que vazou pra VPS. NUNCA reintroduzir a concessao de trial neste
    // ponto sem passar pelo checkout. (Nome mantido por compatibilidade dos
    // chamadores; hoje so prepara o pending_checkout.)
    // CRÉDITOS (cutover 06/07; MASTER-REFAB S6 10/07 noite — cortesia morre como conceito) —
    // modelo GRÁTIS pré-pago: confirmar identidade ATIVA a conta `credit` (accountType nasce
    // 'credit' por default da coluna — nada a setar aqui) direto como `active` (estado 'exempt'
    // na leitura = liberado, módulos default-on pelo kill-switch; ver company-access-state.ts).
    // Era `status: 'courtesy'` — cortesia NUNCA MAIS é atribuída a conta nova (ordem literal do
    // dono). NÃO reabre o furo do "trial sem cartão" travado em 16/06: aquilo era acesso
    // TEMPORÁRIO por TEMPO sem pagar; aqui o acesso é do modelo grátis e o LIMITE real é o
    // SALDO de crédito (gate S2/R1), não o relógio. NÃO desabilita companyModule (o path
    // pending_checkout abaixo faz isso, o que no kill-switch apagaria os módulos do grátis). Gated
    // pela chavinha — com ela OFF, cai no fluxo pending_checkout de sempre (regressão zero).
    if (isCreditsFeatureEnabled()) {
      await tx.company.update({
        where: { id: companyId },
        data: {
          status: 'active',
          statusChangedAt: activatedAt,
          courtesyEndsAt: null,
          trialModuleSelection: null,
          isActive: true,
          trialStartsAt: null,
          trialEndsAt: null,
          deactivatedAt: null,
        },
      });
      return null;
    }

    const company = await tx.company.findUnique({
      where: { id: companyId },
      select: { selectedPlanKey: true },
    });
    // P0.2 (PR10072026 W1): signup público nasce NEUTRO (selectedPlanKey null).
    // Sem plano gravado NÃO se ressuscita hbx_padrao pelo normalize: mantém o
    // pending_checkout sem gravar plano, sem post-it de módulo e sem entitlement
    // de plano. Só conta LEGADA com plano já gravado segue o fluxo antigo.
    const rawSelectedPlanKey = String(company?.selectedPlanKey || '').trim();
    const selectedPlanKey = rawSelectedPlanKey
      ? this.normalizeSelectedPlanKey(rawSelectedPlanKey)
      : null;

    await tx.company.update({
      where: { id: companyId },
      data: {
        status: 'pending_checkout',
        statusChangedAt: activatedAt,
        ...(selectedPlanKey ? { selectedPlanKey } : {}),
        trialModuleSelection: null,
        isActive: false,
        trialStartsAt: null,
        trialEndsAt: null,
        subscriptionCurrentPeriodStart: null,
        subscriptionCurrentPeriodEnd: null,
        deactivatedAt: activatedAt,
      },
    });
    if (!selectedPlanKey) {
      await tx.companyModule.updateMany({ where: { companyId }, data: { enabled: false } });
      // FIXER PR10072026 — com HBX_CREDITS_ENABLED OFF (kill-switch de emergência), conta
      // nova confirma o e-mail e fica pending_checkout SEM plano, SEM módulo e SEM rota de
      // checkout self-service (subscription/create aposentado, 410): só o master destrava.
      // Alerta action_required pra conta não morrer invisível durante o incidente.
      await emitMasterEvent(this.prisma, {
        type: 'auth.signup_stranded_credits_off',
        severity: 'action_required',
        companyId,
        dedupKey: `signup-stranded-credits-off:${companyId}`,
        payload: { state: 'pending_checkout_sem_plano', companyId },
      });
      return null;
    }
    await this.syncPlanModulesTx(tx, companyId, selectedPlanKey);
    await tx.companyModule.updateMany({ where: { companyId }, data: { enabled: false } });
    await this.createPendingCheckoutEntitlementsTx(tx, companyId, selectedPlanKey, activatedAt);
    return null;
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
    const rawPassword = this.masterPassword();
    if (!username) {
      throw new Error('SYSTEM_MASTER_USERNAME is required when BOOTSTRAP_SYSTEM_MASTER=true');
    }
    const existing = await this.prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        password: true,
        name: true,
        companyId: true,
        role: true,
        isSystemMaster: true,
        isActive: true,
        currentSessionId: true,
      },
    });
    const passwordMatches = existing?.password
      ? await bcrypt.compare(rawPassword, existing.password).catch(() => false)
      : false;
    const passwordHash = passwordMatches ? null : await bcrypt.hash(rawPassword, 12);
    const now = new Date();

    const master = await this.prisma.$transaction(async (tx) => {
      if (email) {
        const emailConflict = await tx.user.findUnique({
          where: { email },
          select: { id: true, isSystemMaster: true, role: true },
        });
        if (emailConflict && emailConflict.id !== existing?.id) {
          if (emailConflict.isSystemMaster || emailConflict.role === 'USERMASTER') {
            await tx.user.update({
              where: { id: emailConflict.id },
              data: { email: null },
            });
          } else {
            throw new Error('SYSTEM_MASTER_EMAIL already belongs to a non-master user');
          }
        }
      }

      if (existing) {
        const shouldRevokeSessions =
          !passwordMatches ||
          Boolean(existing.companyId) ||
          !existing.isSystemMaster ||
          existing.role !== 'USERMASTER' ||
          existing.isActive === false;
        if (shouldRevokeSessions) {
          await tx.authSession.updateMany({
            where: { userId: existing.id, revokedAt: null },
            data: { revokedAt: now, revokedReason: 'system_master_bootstrap' },
          });
        }
        const updated = await tx.user.update({
          where: { id: existing.id },
          data: {
            username,
            email,
            ...(passwordHash ? { password: passwordHash } : {}),
            name: existing.name || 'System Master',
            role: 'USERMASTER',
            isSystemMaster: true,
            isActive: true,
            companyId: null,
            mustChangePassword: false,
            ...(shouldRevokeSessions ? {
              currentSessionId: null,
              sessionVersion: { increment: 1 },
            } : {}),
            deactivatedAt: null,
            retentionUntil: null,
          },
          select: { id: true },
        });
        return updated;
      }

      return tx.user.create({
        data: {
          username,
          email,
          password: passwordHash as string,
          name: 'System Master',
          role: 'USERMASTER',
          isSystemMaster: true,
          isActive: true,
          companyId: null,
          mustChangePassword: false,
        },
        select: { id: true },
      });
    });

    await this.prisma.$transaction([
      this.prisma.user.updateMany({
        where: {
          id: { not: master.id },
          OR: [{ isSystemMaster: true }, { role: 'USERMASTER' }],
        },
        data: {
          isSystemMaster: false,
          role: 'USER',
        },
      }),
      this.prisma.userTeamPolicy.deleteMany({ where: { userId: master.id } }),
    ]);
  }

  async validateUserByUsername(username: string, pass: string) {
    const normalized = String(username || '').trim();
    const user = normalized ? await this.usersService.findByLoginIdentifier(normalized) : null;
    if (!user) return null;
    const match = await bcrypt.compare(pass, user.password);
    if (match) return user;
    return null;
  }

  async login(user: any, opts?: { companyId?: number; userAgent?: string; ip?: string }) {
    const now = new Date();
    const expiresAt = this.addSessionTtl(now);
    const requestedCompanyId = opts?.companyId ?? user.companyId ?? undefined;
    const isSystemMaster = Boolean(user?.isSystemMaster);
    let company = !isSystemMaster && requestedCompanyId
      ? await this.prisma.company.findUnique({
          where: { id: Number(requestedCompanyId) },
          select: {
            companyKind: true,
            accountType: true,
            status: true,
            isActive: true,
            trialEndsAt: true,
            billingGraceEndsAt: true,
            courtesyEndsAt: true,
            courtesyReason: true,
          },
        })
      : null;
    if (!isSystemMaster) {
      this.assertOperationalWorkspaceCompany(company);
    }

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
          role: true,
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

    const companyId = requestedCompanyId ?? sessionContext.user.companyId ?? undefined;
    if (!Boolean(sessionContext.user?.isSystemMaster) && !company && companyId) {
      company = await this.prisma.company.findUnique({
        where: { id: Number(companyId) },
        select: {
          companyKind: true,
          accountType: true,
          status: true,
          isActive: true,
          trialEndsAt: true,
          billingGraceEndsAt: true,
          courtesyEndsAt: true,
          courtesyReason: true,
        },
      });
      this.assertOperationalWorkspaceCompany(company);
    }

    const payload = {
      sub: sessionContext.user.id,
      email: sessionContext.user.email,
      companyId,
      sid: sessionContext.sessionId,
      sv: sessionContext.user.sessionVersion,
    };
    // Gate canonico (PR-002 C.1b): o destino pos-login e projecao do
    // resolveCompanyAccessState — nada de re-derivar campos legados aqui.
    const access = resolveCompanyAccessState(company);
    const requiresCheckout = Boolean(company) && !access.canUse && access.state !== 'platform_infra';
    const checkoutReason =
      access.detailCode === 'trial_expired'
        ? ('trial_expired' as const)
        : access.state === 'pending_checkout'
          ? ('pending_checkout' as const)
          : ('payment_failed' as const);

    // Cobranca e assunto do contratante (PR-002 D.2): vendedor nunca recebe
    // destino nem flag de checkout — empresa irregular vira tela neutra no
    // app. Login regular do vendedor cai direto em Vendas, a menos que a
    // policy da equipe negue o modulo explicitamente.
    const sessionRole = String(sessionContext.user?.role || '').trim().toUpperCase();
    const isSeller = !Boolean(sessionContext.user?.isSystemMaster) && sessionRole === 'USER';
    if (isSeller) {
      const policy = await loadUserTeamPolicyRuntime(this.prisma, sessionContext.user.id).catch(() => null);
      const vendasDenied = resolveTeamPolicyAccessAllowed(policy, 'vendas.access') === false;
      return {
        access_token: this.jwtService.sign(payload),
        next: vendasDenied ? '/dashboard' : '/vendas',
        requiresCheckout: false,
      };
    }

    return {
      access_token: this.jwtService.sign(payload),
      next: Boolean(sessionContext.user?.isSystemMaster)
        ? '/master'
        : requiresCheckout
          ? this.preCheckoutNextPath(checkoutReason)
          : '/dashboard',
      requiresCheckout,
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

    if (normalized.toLowerCase() === this.masterUsername().toLowerCase()) {
      await this.ensureSystemMasterUser();
    }

    const user: any = await this.usersService.findByLoginIdentifier(normalized);
    if (!user) {
      // Anti-enumeração + anti-timing: nivela o tempo com um bcrypt.compare
      // descartável e devolve a MESMA mensagem genérica do caminho de senha
      // errada — "não existe" e "senha incorreta" ficam indistinguíveis.
      await bcrypt.compare(pass, DUMMY_BCRYPT_HASH);
      throw new UnauthorizedException('Usuário ou senha inválidos');
    }

    // isActive movido pra DEPOIS da prova de senha (ver logo abaixo do
    // bcrypt.compare): checar aqui vazava a existência da conta a quem nem
    // sabia a senha.

    // Confirmacao de e-mail pendente e fato do USUARIO (token vivo, sem
    // confirmacao) — nao um estado da empresa (PR-002 C.1).
    const requiresEmailConfirmation = Boolean(user?.emailConfirmationToken) && !user?.emailConfirmedAt;
    if (!Boolean(user?.isSystemMaster) && requiresEmailConfirmation && !this.isLocalMockSignupFlow()) {
      // F4 (19/06): login deixou de ser beco. A confirmação pendente é fato do
      // usuário — em vez de pintar string morta, devolvemos um destino de
      // RETOMADA pro funil (/?ver=planos&resume=1), no passo exato. Anti-
      // enumeração: o detalhe do passo (plano, token de retomada) só sai DEPOIS
      // de a senha provar posse; quem não prova recebe mensagem genérica.
      const ownsAccount = typeof user.password === 'string'
        && user.password.length > 0
        && (await bcrypt.compare(pass, user.password));
      if (ownsAccount) {
        throw new UnauthorizedException({
          code: 'EMAIL_CONFIRMATION_REQUIRED',
          needsEmailConfirmation: true,
          email: user.email || null,
          message: 'Confirme seu cadastro para continuar.',
          next: '/?ver=planos&resume=1',
          resume: this.buildOnboardingResume(user),
          confirmationPollToken: this.buildEmailConfirmationPollToken(user.id),
        });
      }
      throw new UnauthorizedException({
        code: 'EMAIL_CONFIRMATION_REQUIRED',
        needsEmailConfirmation: true,
        email: user.email || null,
        message: 'Confirme seu cadastro para continuar.',
      });
    }

    if (typeof user.password !== 'string' || user.password.length === 0) {
      // Conta criada por convite (PR-002 C.1c/C.3): a senha e definida pelo
      // link enviado por e-mail, nunca aqui.
      throw new UnauthorizedException({
        code: 'INVITE_PASSWORD_PENDING',
        message: 'Defina sua senha pelo link de convite enviado por e-mail antes de entrar.',
      });
    }

    const match = await bcrypt.compare(pass, user.password);
    if (!match) {
      // Mesma mensagem genérica do caminho "não existe" (anti-enumeração).
      throw new UnauthorizedException('Usuário ou senha inválidos');
    }

    // isActive só é revelado DEPOIS da prova de senha (decisão W1 07/07): quem
    // provou posse pode saber que a conta está desativada; quem não provou não
    // consegue distinguir "desativada" de "não existe".
    if (user.isActive === false) {
      throw new UnauthorizedException('Usuário temporáriamente desativado - Contate seu Administrador');
    }

    const companyId = Number(user.companyId || 0);
    const isSystemMaster = Boolean(user.isSystemMaster);
    if (!companyId && !isSystemMaster) {
      throw new UnauthorizedException('Conta sem empresa vinculada');
    }
    if (!isSystemMaster) {
      this.assertOperationalWorkspaceCompany(user.company);
    }

    if (!isSystemMaster && companyId && requiresEmailConfirmation && this.isLocalMockSignupFlow()) {
      // Fluxo mock local: confirma na hora e segue a mesma maquina nativa
      // (trial direto ou pending_checkout).
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
        await this.activateConfirmedTrialTx(tx, companyId, confirmedAt);
      });
    }

    // Login único SEM aviso (decisão do dono 07/07/2026, junto com a janela de 30d
    // em session-ttl.ts): logar sempre substitui a sessão anterior — o login() revoga
    // todas as sessões vivas na mesma transação (replaced_by_login) e o jwt.strategy
    // derruba o aparelho antigo na próxima request. Com a janela longa, a sessão
    // abandonada não expira mais "sozinha em 15min", então o antigo 409
    // SESSION_ALREADY_ACTIVE viraria atrito em TODA troca de aparelho (estilo
    // Mercado Livre: entra direto). O campo forceSession do DTO segue aceito por
    // compatibilidade, agora sem efeito.
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

      // Fixa a PRÓPRIA linha por PK (id vem do JWT validado) — cross-tenant é
      // impossível por construção. Escopar por companyId aqui quebraria o master
      // (linha com companyId NULL, mas store com a empresa assumida), então o
      // contrato com o tenant-guard é o bypass explícito, não o where.
      await withoutTenantScope(
        'logout: limpa currentSessionId do próprio usuário (PK do JWT)',
        () =>
          tx.user.updateMany({
            where: {
              id: userId,
              currentSessionId: sessionId,
            },
            data: {
              currentSessionId: null,
            },
          }),
      );
    });

    return { ok: true };
  }

  // GOOGLE OAUTH — verifica id_token, acha/cria user+empresa, devolve JWT
  async googleLoginOrSignup(idToken: string, opts?: { companyName?: string; userAgent?: string; ip?: string }) {
    const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
    if (!clientId) throw new ServiceUnavailableException('Login com Google não está configurado neste ambiente.');

    let payload: { sub: string; email: string; name?: string; email_verified?: boolean };
    try {
      const { OAuth2Client } = await import('google-auth-library');
      const client = new OAuth2Client(clientId);
      const ticket = await client.verifyIdToken({ idToken, audience: clientId });
      const p = ticket.getPayload();
      if (!p) throw new Error('Payload vazio');
      payload = { sub: p.sub, email: p.email || '', name: p.name, email_verified: p.email_verified };
    } catch {
      throw new UnauthorizedException('Token Google inválido ou expirado. Tente novamente.');
    }

    const googleId = payload.sub;
    const email = payload.email.toLowerCase().trim();
    if (!email) throw new BadRequestException('Google não retornou e-mail válido.');

    // 1. Busca por googleId
    let user: any = await this.prisma.user.findUnique({ where: { googleId }, include: { company: true } });

    // 2. Busca por e-mail e vincula
    if (!user) {
      user = await this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, include: { company: true } });
      if (user) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { googleId, emailConfirmedAt: user.emailConfirmedAt || new Date() },
          include: { company: true },
        });
      }
    }

    // 3. Login da conta existente
    if (user) {
      if (user.isActive === false) throw new UnauthorizedException('Conta desativada. Contate seu Administrador.');
      if (!user.companyId && !user.isSystemMaster) throw new UnauthorizedException('Conta sem empresa vinculada.');
      // Google é login federado (sem senha): a identidade já está provada pelo
      // token. Forçar "troque a senha temporária" para quem entrou por Google é
      // contradição — e a pessoa pode nem ter senha local. Limpa a trava.
      if (user.mustChangePassword) {
        await this.prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: false } });
      }
      return this.login(user, { companyId: user.companyId || undefined, userAgent: opts?.userAgent, ip: opts?.ip });
    }

    // 4. Cadastro novo via Google
    return this.signupWithGoogle({ email, name: payload.name || email, googleId, companyName: opts?.companyName });
  }

  private async signupWithGoogle(data: { email: string; name: string; googleId: string; companyName?: string }) {
    const { email, name, googleId } = data;
    const username = email;
    const normalizedCompanyName = String(data.companyName || '').trim();
    const displayName = this.companyDisplayName(normalizedCompanyName || name, username);
    const slug = `co_${crypto.randomBytes(9).toString('hex')}`;
    const randomPassword = crypto.randomBytes(32).toString('hex');
    const hashed = await bcrypt.hash(randomPassword, 12);
    const now = new Date();
    // CRÉDITOS (cutover 06/07; MASTER-REFAB S6 10/07 noite) — Google JÁ É identidade confirmada
    // (nunca passa pelo confirmEmail → activateConfirmedTrialTx nunca roda pra ele). Com a
    // chavinha ON, a empresa nasce direto `active` (accountType 'credit' por default da coluna
    // — mesmo estado que a confirmação de email produz no modelo grátis, era `courtesy`); sem
    // isso o usuário Google ganharia os 50 créditos mas ficaria PRESO no pending_checkout.
    // Chavinha OFF → fluxo de sempre (pending_checkout), regressão zero.
    const creditsFreeGoogle = isCreditsFeatureEnabled();

    const created = await this.prisma.$transaction(async (tx) => {
      // P0.2 (PR10072026 W1): empresa NEUTRA — sem plano, sem trial derivado de
      // plano, sem post-it de CompanyModule (módulo vem do default/kill-switch
      // do master). Estruturalmente IGUAL ao signup por e-mail; a diferença dos
      // dois fluxos é só identidade/verificação (Google já chega confirmado).
      const company = await tx.company.create({
        data: {
          slug,
          name: displayName,
          entityType: 'PF',
          trialModuleSelection: null,
          selectedPlanKey: null,
          assistedSetupRequired: false,
          assistedSetupStatus: 'not_required',
          assistedSetupCompletedAt: null,
          assistedSetupCompletedByUserId: null,
          assistedSetupNote: null,
          signupUsesPublicEmail: false,
          status: creditsFreeGoogle ? 'active' : 'pending_checkout',
          statusChangedAt: now,
          isActive: creditsFreeGoogle,
          courtesyEndsAt: null,
          contactEmail: email,
          primaryContactName: name,
          deactivatedAt: creditsFreeGoogle ? null : now,
          trialStartsAt: null,
          trialEndsAt: null,
        },
      });

      await this.seedDefaultCompanyModulesTx(tx, company.id);
      await this.seedDefaultTenantProductsTx(tx, company.id);

      const user = await tx.user.create({
        data: {
          username,
          email,
          password: hashed,
          googleId,
          name,
          role: 'ADMIN',
          companyId: company.id,
          emailConfirmedAt: now,
          emailConfirmationToken: null,
          emailConfirmationSentAt: null,
          emailConfirmationExpiresAt: null,
        },
      });

      return { company, user };
    });

    await ensureUserTeamPolicyForUser(this.prisma, created.user.id, { source: 'auth_google_signup' });

    // CRÉDITOS (cutover 06/07) — Google já nasce com email verificado (= "email confirmado"),
    // então o brinde de 50 créditos pode nascer aqui mesmo, mas via o caminho com DEDUP por
    // telefone/CPF (não concede 2x pra mesma identidade). platform_infra nunca nasce por aqui.
    await this.maybeGrantWelcomeAfterConfirm(created.company.id);

    return this.login(created.user, { companyId: created.company.id });
  }

  // SIGNUP (SaaS)
  // Decision: for this product we auto-create a dedicated Company per signup.
  // Rationale: prevents exposing competitor tenants and avoids "choose company" flows.
  // Future: if you need onboarding into an existing Company, implement a real invite-token flow.
  async signup(data: {
    entityType?: 'PF' | 'PJ';
    companyName?: string;
    name?: string;
    // P0.2 (PR10072026 W1): plano/trial morreram na porta de entrada. Os dois
    // campos abaixo seguem ACEITOS (clients velhos em cache e chamadores
    // internos ainda mandam) mas são IGNORADOS — empresa nasce neutra.
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
  }, opts?: { ip?: string | null; userAgent?: string | null }) {
    const email = String(data.email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) throw new BadRequestException('E‑mail inválido. Informe um endereço de e‑mail válido para recuperação.');

    const username = String(data.username || email).trim().toLowerCase();

    // Cadastro self-service nunca reivindica um username existente: contas sem
    // e-mail nascem por convite (token de definir senha — C.1c/C.3) ou são o
    // system master. Morreu o branch de "completar registro" por username
    // conhecido (vetor de takeover) no DROP do PR-002.
    // Conflito também caixa-insensível: se "Henrique" legado existe, ninguém
    // registra "henrique" (colidiriam no login normalizado).
    const existingUsername = await this.usersService.findByLoginIdentifier(username);
    if (existingUsername) {
      throw new ConflictException('Identificador já cadastrado. Caso seja sua conta, use a recuperação de senha.');
    }

    const password = String(data.password || '');
    assertPasswordPolicy(password);

    const existingEmail = await this.usersService.findByEmail(email);
    if (existingEmail) {
      // F4 (19/06): re-cadastro do mesmo e-mail deixou de ser beco. Se a conta
      // existe, está com confirmação PENDENTE e a senha informada PROVA posse
      // → renova o link e devolve a tela de espera (continuidade). Sem prova de
      // senha (ou já confirmada) → mensagem genérica (anti-enumeração / sem
      // takeover; quem confirmou usa o login/recuperação).
      const stillPending = !(existingEmail as any).emailConfirmedAt && Boolean((existingEmail as any).emailConfirmationToken);
      const ownsAccount = stillPending
        && typeof (existingEmail as any).password === 'string'
        && (existingEmail as any).password.length > 0
        && (await bcrypt.compare(password, (existingEmail as any).password));
      if (ownsAccount) {
        return this.resumePendingEmailConfirmation((existingEmail as any).id);
      }
      throw new ConflictException('Já existe uma conta com este E‑mail. Caso seja sua, use a recuperação de senha.');
    }

    const normalizedCompanyName = String(data.companyName || '').trim();
    const normalizedName = String(data.name || '').trim();
    const resolvedName = normalizedName || normalizedCompanyName || username;
    const hashed = await bcrypt.hash(password, 12);
    const entityType = this.normalizeEntityType(data.entityType) || 'PF';
    // CRÉDITOS (cutover 06/07) — modelo grátis pré-pago: com a chavinha ON, o cadastro é direto
    // (sem plano) e EXIGE telefone (verificável por código; base do dedup anti-farra dos 50
    // créditos — regra do dono 06/07). CPF opcional. Fora do modelo grátis nada muda.
    const creditsFreeSignup = isCreditsFeatureEnabled();
    const freeContactPhone = creditsFreeSignup ? this.normalizeBrazilPhone(data.trialContactPhone) : null;
    if (creditsFreeSignup && !freeContactPhone) {
      throw new BadRequestException('Informe um telefone válido — usamos ele para confirmar sua conta e liberar seus créditos.');
    }
    const freeTaxDocument = creditsFreeSignup
      ? (this.normalizeDigits(data.trialTaxDocument || '').slice(0, 14) || null)
      : null;
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


    // New account: create company + user atomically.
    const rawToken = this.createEmailConfirmationToken();
    const tokenHash = this.sha256(rawToken);
    const confirmationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const created = await this.prisma.$transaction(async (tx) => {
      const existingCompany = await this.findCompanyByDisplayNameTx(tx, displayName);
      if (existingCompany) {
          if (Number(existingCompany._count?.users || 0) > 0) {
            throw new ConflictException('Empresa já cadastrada. Usuários comuns devem ser criados pelo ADMIN no Gerencial.');
          }
          // Reivindicar empresa existente sem usuarios SEMPRE exige confirmar
          // o e-mail (PR-002 C.1) — sem atalho de login instantaneo por
          // colisao de nome; o convite por token (C.1c/C.3) cobre o resto.
          const user = await tx.user.create({
            data: {
            username,
            email,
            password: hashed,
            name: resolvedName,
            role: 'ADMIN',
            companyId: existingCompany.id,
            emailConfirmedAt: null,
            emailConfirmationToken: tokenHash,
            emailConfirmationSentAt: new Date(),
            emailConfirmationExpiresAt: confirmationExpiresAt,
          },
        });
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
          pendingEmailConfirmation: true,
          user,
        };
      }

      // P0.2 (PR10072026 W1): empresa NEUTRA — sem plano, sem trial derivado de
      // plano, sem post-it de CompanyModule (módulo vem do default/kill-switch
      // do master). Estruturalmente IGUAL ao signupWithGoogle; a diferença dos
      // dois fluxos é só identidade/verificação (aqui o e-mail confirma depois).
      const company = await tx.company.create({
        data: {
          slug,
          name: displayName,
          entityType: entityType || 'PJ',
          trialModuleSelection: null,
          selectedPlanKey: null,
          assistedSetupRequired: false,
          assistedSetupStatus: 'not_required',
          assistedSetupCompletedAt: null,
          assistedSetupCompletedByUserId: null,
          assistedSetupNote: null,
          signupUsesPublicEmail: usesPublicEmail,
          acquisitionSource,
          acquisitionSourceDetail,
          referralReferrerName,
          referralCode,
          primaryContactName: resolvedName,
          contactEmail: email,
          contactPhone: freeContactPhone || null,
          taxDocument: freeTaxDocument || null,
          // Estado unico nativo (PR-002 C.1): empresa nasce pending_checkout;
          // "aguardando confirmacao de e-mail" e um fato do USUARIO (token
          // pendente), nao um estado da empresa (DROP — sem espelho legado).
          status: 'pending_checkout',
          statusChangedAt: new Date(),
          isActive: false,
          trialStartsAt: null,
          trialEndsAt: null,
          deactivatedAt: new Date(),
        },
      });

      await this.seedDefaultCompanyModulesTx(tx, company.id);
      const seededProducts = await this.seedDefaultTenantProductsTx(tx, company.id);

      // Trilha de nascimento (multi-tenancy S4), preset self_service. A trilha
      // só REGISTRA como nasceu, sem mudar o comportamento do cadastro.
      const signupLedger = buildProvisioningLedger('self_service', 'auth_signup', [
        { key: 'create_tenant', status: 'done' },
        {
          key: 'prepare_initial_products',
          status: (seededProducts?.length ?? 0) ? 'done' : 'skipped',
        },
      ]);
      await tx.company.update({
        where: { id: company.id },
        data: { provisioningLedgerJson: serializeProvisioningLedger(signupLedger) },
      });

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
      return { attachedToExistingCompany: false, companyId: company.id, companyName: company.name, user };
    });

    await ensureUserTeamPolicyForUser(this.prisma, (created as any).user?.id, { source: 'auth_signup' });

    // CRÉDITOS (cutover 06/07) — o brinde NÃO é mais concedido no signup: passou a nascer na
    // CONFIRMAÇÃO da identidade (email/F6), com dedup por telefone/CPF (regra do dono 06/07 —
    // "50 créditos apenas para email confirmados"). Ver maybeGrantWelcomeAfterConfirm, chamado
    // de finalizeConfirmedIdentity. Com a chavinha OFF nada muda (grantWelcomeBatch já no-opava).

    await this.syncHbxSalesReferralCompany(
      (created as any).companyId || (created as any).user?.companyId,
      'auth_signup_pending_hbx_lead',
      hasHbxSalesReferral,
    );

    if (this.isLocalMockSignupFlow()) {
      return this.confirmEmail(rawToken);
    }

    const delivery = await this.dispatchEmailConfirmation({
      email,
      username: resolvedName,
      companyName: created.companyName,
      rawToken,
    });

    // F8 (19/06): gancho de verificação por risco (default DESLIGADO). Só desafia
    // por telefone quando um sinal acende (e-mail descartável hoje; IP/fingerprint
    // depois). Sem flag → never fires; resposta inalterada.
    const riskDecision = evaluateSignupRisk({ email, ip: opts?.ip, userAgent: opts?.userAgent });

    // F3/F4 (19/06): o signup NÃO emite mais checkout_token. Ordem certa do
    // funil = confirma a identidade ANTES de pedir cartão. A sessão restrita de
    // checkout nasce na CONFIRMAÇÃO (confirmEmail / confirmação-WhatsApp), nunca
    // no cadastro. Pré-confirmação o funil cai na tela "aguardando confirmação".
    const pendingResponse = this.buildPendingEmailConfirmationResponse({
      userId: Number((created as any).user?.id || 0),
      email,
      username,
      companyName: created.companyName,
      entityType,
      trialModuleSelection: null,
      selectedPlanKey: null,
      acquisitionSource,
      warnings,
      message: delivery.failed
        ? this.emailConfirmationDeliveryFailureMessage()
        : this.pendingConfirmationSuccessMessage(),
      previewUrl: delivery.previewUrl,
      confirmUrl: delivery.confirmUrl,
      deliveryFailed: delivery.failed,
      deliveryErrorCode: delivery.errorCode,
      deliveryErrorMessage: delivery.errorMessage,
      checkoutToken: null,
    });
    return riskDecision.requiresPhoneChallenge
      ? { ...pendingResponse, riskChallenge: riskDecision }
      : pendingResponse;
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
        isActive: true,
        isSystemMaster: true,
        emailConfirmationExpiresAt: true,
        company: {
          select: {
            companyKind: true,
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

    return this.finalizeConfirmedIdentity(user, {
      userAgent: opts?.userAgent,
      ip: opts?.ip,
      source: 'auth_email_confirmed',
      identityLabel: 'E-mail',
    });
  }

  // Completa a confirmação de identidade — DEPOIS de o canal já ter sido provado
  // (link de e-mail OU código de WhatsApp/F6). Fonte única: confirma o usuário,
  // mantém a empresa em pending_checkout (trial só nasce no checkout, regra do
  // dono 16/06), sincroniza comissão e devolve o destino do papel. companyData
  // permite gravar dado do canal (ex.: telefone do WhatsApp) no mesmo passo.
  private async finalizeConfirmedIdentity(
    user: { id: number; email: string | null; companyId: number | null; role?: string | null; isSystemMaster?: boolean | null; company?: { companyKind?: string | null } | null },
    opts?: { userAgent?: string; ip?: string; source?: string; identityLabel?: string; companyData?: Record<string, unknown> },
  ) {
    const confirmedAt = new Date();
    let trialEndsAt: Date | null = null;
    const platformInfraCompany = isPlatformInfraCompany(user.company);
    if (user.companyId && platformInfraCompany && !user.isSystemMaster) {
      throw new BadRequestException({
        code: 'PLATFORM_INFRA_COMPANY_NOT_COMMERCIAL',
        message: 'Empresa de infraestrutura nao possui fluxo comercial de confirmação.',
      });
    }
    const identityLabel = opts?.identityLabel || 'E-mail';

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

      if (user.companyId && !platformInfraCompany) {
        if (opts?.companyData && Object.keys(opts.companyData).length > 0) {
          await tx.company.update({ where: { id: Number(user.companyId) }, data: opts.companyData });
        }
        // Confirmar identidade NÃO ativa trial (regra travada do dono 16/06:
        // trial exige cartao). So confirma e deixa a empresa em pending_checkout;
        // o trial nasce no checkout (financeiro). trialEndsAt fica null aqui.
        trialEndsAt = await this.activateConfirmedTrialTx(tx, Number(user.companyId), confirmedAt);
      }
    });

    if (user.companyId) {
      await this.hbxCommissionSync.syncActivatedCompany(Number(user.companyId), {
        source: opts?.source || 'auth_email_confirmed',
      }).catch((error: any) => {
        this.logger.warn(`commission_sync_confirm_failed company=${user.companyId} error=${String(error?.message || error)}`);
      });
      // CRÉDITOS (cutover 06/07) — identidade confirmada = hora do brinde de 50 créditos, com
      // dedup por telefone/CPF. Best-effort (nunca trava a confirmação); no-op se a chavinha OFF.
      await this.maybeGrantWelcomeAfterConfirm(Number(user.companyId));
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
    const next = loginPayload?.next || this.pendingCheckoutNextPath();

    // CRÉDITOS (cutover 06/07) — no modelo grátis a empresa já saiu como `courtesy` (ativada acima),
    // então a confirmação NÃO manda pro checkout: anuncia a conta ativa + os créditos liberados.
    const creditsFreeConfirm = isCreditsFeatureEnabled();
    return {
      ok: true,
      status: user.companyId ? (trialEndsAt ? 'active_trial' : creditsFreeConfirm ? 'active' : 'pending_checkout') : 'confirmed',
      email: user.email || null,
      message: user.companyId
        ? trialEndsAt
          ? `${identityLabel} confirmado. O trial gratuito está ativo até ${trialEndsAt.toLocaleDateString('pt-BR')}.`
          : creditsFreeConfirm
            ? `${identityLabel} confirmado! Sua conta está ativa e seus créditos de boas-vindas já estão liberados.`
            : `${identityLabel} confirmado. Finalize o pagamento no Financeiro para liberar o plano.`
        : `${identityLabel} confirmado com sucesso.`,
      trialStartsAt: trialEndsAt ? confirmedAt.toISOString() : null,
      trialEndsAt: trialEndsAt ? trialEndsAt.toISOString() : null,
      access_token: loginPayload?.access_token || null,
      next,
      loginNext: loginPayload?.access_token
        ? next
        : `/login?next=${encodeURIComponent(next)}`,
      requiresCheckout: Boolean(loginPayload?.requiresCheckout),
    };
  }

  // ── F6 (19/06): confirmação de identidade por WhatsApp (do Master) ──────────
  // Outro jeito de satisfazer "awaiting_email": em vez do link de e-mail, um
  // código de 6 dígitos pelo WhatsApp do Master. Desenho SEM coluna nova: o
  // desafio vive num JWT efêmero (carrega só o HASH do código, nunca o código).
  // GUARDRAIL: disparar WhatsApp real é ação LIVE — mock-first (dev: código no
  // log/preview), envio live GATED (LIVE_WHATSAPP_CONFIRM_TODO). Não disparo só.
  private buildWhatsappConfirmChallengeToken(input: { userId: number; challengeId: string }) {
    // O token carrega SÓ um ponteiro opaco (`cid`) pro desafio guardado no
    // servidor — nunca o hash do código nem o telefone (era o furo que deixava
    // o OTP quebrável offline).
    return this.jwtService.sign(
      { sub: Number(input.userId), cid: input.challengeId, purpose: 'whatsapp_confirm' },
      { expiresIn: '10m' },
    );
  }

  private verifyWhatsappConfirmChallengeToken(token: string): { userId: number; challengeId: string } {
    const raw = String(token || '').trim();
    if (!raw) {
      throw new BadRequestException({ code: 'WHATSAPP_CONFIRM_INVALID', message: 'Desafio de confirmação inválido.' });
    }
    try {
      const payload = this.jwtService.verify(raw) as { sub?: unknown; cid?: unknown; purpose?: unknown };
      const userId = Number(payload?.sub);
      const challengeId = String(payload?.cid || '');
      if (payload?.purpose !== 'whatsapp_confirm' || !Number.isInteger(userId) || userId <= 0 || !challengeId) {
        throw new Error('invalid whatsapp challenge');
      }
      return { userId, challengeId };
    } catch {
      throw new BadRequestException({ code: 'WHATSAPP_CONFIRM_EXPIRED', message: 'Código expirado. Peça um novo código.' });
    }
  }

  // Limpeza oportunista dos desafios de WhatsApp expirados (varre e deleta).
  // Chamada no start/confirm — sem timer, custo zero com o Map vazio.
  private sweepExpiredWhatsappChallenges() {
    const now = Date.now();
    for (const [id, entry] of this.whatsappChallenges) {
      if (entry.expiresAt <= now) this.whatsappChallenges.delete(id);
    }
  }

  // Comparação em tempo constante de dois hashes hex de mesmo tamanho (sha256).
  // Evita side-channel por tempo no confronto do código; cai pra === se por
  // algum motivo os tamanhos diferirem (não deveria — sha256 é sempre 64 hex).
  private timingSafeEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch {
      return a === b;
    }
  }

  // Envio GATED do código. Dev/mock → log + preview (igual previewUrl do e-mail).
  // Live → NÃO dispara; devolve TODO. Pendurar no Webwhats do Master
  // (instância de automação company-{master}) é passo do dono na VPS.
  private async dispatchWhatsappConfirmationCode(input: { phone: string; code: string }): Promise<{ delivered: 'mock' | 'todo'; previewCode: string | null }> {
    if (!this.isProduction()) {
      this.logger.log(`[whatsapp-confirm][mock] phone=${input.phone} code=${input.code}`);
      return { delivered: 'mock', previewCode: input.code };
    }
    // TODO(F6 live / VPS): enviar pela mensageria do Master (Outbox/Webwhats,
    // instância de automação). NÃO disparar daqui sem ordem do dono (guardrail).
    this.logger.warn(`[whatsapp-confirm][LIVE_WHATSAPP_CONFIRM_TODO] envio real gated phone=${input.phone}`);
    return { delivered: 'todo', previewCode: null };
  }

  async startWhatsappConfirmation(pollToken: string, rawPhone: string) {
    const userId = this.verifyEmailConfirmationPollToken(pollToken);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, emailConfirmedAt: true, companyId: true },
    });
    if (!user) {
      throw new BadRequestException({ code: 'WHATSAPP_CONFIRM_INVALID', message: 'Cadastro não encontrado.' });
    }
    if (user.emailConfirmedAt) {
      return { ok: true, alreadyConfirmed: true, message: 'Identidade já confirmada — entre para continuar.' };
    }
    const phone = this.normalizeBrazilPhone(rawPhone);
    if (!phone) {
      throw new BadRequestException({ code: 'WHATSAPP_CONFIRM_PHONE_INVALID', message: 'Informe um número de WhatsApp válido (DDD + número).' });
    }
    // Anti-abuso (mesma regra do checkout): telefone que já usou trial em OUTRA
    // empresa viva bloqueia cedo. Não reserva aqui — só checa (trial nasce no checkout).
    if (user.companyId) {
      await TrialUsage.ensureTrialPhoneAvailableTx(this.prisma, Number(user.companyId), phone, 'reserve');
    }
    // Código de 6 dígitos com RNG CRIPTOGRÁFICO (era Math.random(), previsível).
    const code = String(crypto.randomInt(100000, 1000000));
    this.sweepExpiredWhatsappChallenges();
    // O desafio (hash do código + telefone + teto de tentativas) fica no servidor;
    // o cliente só leva o `challengeId` opaco embrulhado no token.
    const challengeId = crypto.randomUUID();
    this.whatsappChallenges.set(challengeId, {
      userId,
      phone,
      codeHash: this.sha256(code),
      attempts: 0,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10min — mesma janela do JWT
    });
    const challengeToken = this.buildWhatsappConfirmChallengeToken({ userId, challengeId });
    const dispatch = await this.dispatchWhatsappConfirmationCode({ phone, code });
    return {
      ok: true,
      challengeToken,
      phone,
      sentVia: dispatch.delivered === 'mock' ? 'mock' : 'whatsapp',
      liveDispatch: dispatch.delivered === 'todo' ? 'LIVE_WHATSAPP_CONFIRM_TODO' : null,
      // previewCode só existe em dev/mock (nunca em produção).
      previewCode: dispatch.previewCode,
      message: dispatch.delivered === 'mock'
        ? 'Código gerado (ambiente de teste). Use o código exibido para confirmar.'
        : 'Enviamos um código pelo WhatsApp. Digite-o aqui para confirmar.',
    };
  }

  async confirmWhatsappCode(challengeToken: string, rawCode: string, opts?: { userAgent?: string; ip?: string }) {
    const { userId, challengeId } = this.verifyWhatsappConfirmChallengeToken(challengeToken);
    this.sweepExpiredWhatsappChallenges();
    const challenge = this.whatsappChallenges.get(challengeId);
    // Não existe (restart do container / uso único já consumido) ou já expirou →
    // peça um novo código.
    if (!challenge || challenge.userId !== userId || challenge.expiresAt <= Date.now()) {
      if (challenge) this.whatsappChallenges.delete(challengeId);
      throw new BadRequestException({ code: 'WHATSAPP_CONFIRM_EXPIRED', message: 'Código expirado. Peça um novo código.' });
    }
    // Trava anti-brute: a partir do 6º palpite (attempts já em 5) apaga o desafio
    // e corta — força pedir um código novo em vez de deixar chutar à vontade.
    if (challenge.attempts >= 5) {
      this.whatsappChallenges.delete(challengeId);
      throw new BadRequestException({ code: 'WHATSAPP_CONFIRM_CODE_INVALID', message: 'Código incorreto. Confira e tente novamente.' });
    }
    const code = String(rawCode || '').replace(/\D/g, '').slice(0, 6);
    if (!code || !this.timingSafeEqualHex(this.sha256(code), challenge.codeHash)) {
      challenge.attempts += 1;
      throw new BadRequestException({ code: 'WHATSAPP_CONFIRM_CODE_INVALID', message: 'Código incorreto. Confira e tente novamente.' });
    }
    // Acertou → uso único: apaga o desafio antes de finalizar (o telefone segue
    // vindo do store, nunca do cliente).
    this.whatsappChallenges.delete(challengeId);
    const phone = challenge.phone;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        emailConfirmedAt: true,
        companyId: true,
        role: true,
        isSystemMaster: true,
        company: { select: { companyKind: true, selectedPlanKey: true } },
      },
    });
    if (!user) {
      throw new BadRequestException({ code: 'WHATSAPP_CONFIRM_INVALID', message: 'Cadastro não encontrado.' });
    }
    return this.finalizeConfirmedIdentity(user, {
      userAgent: opts?.userAgent,
      ip: opts?.ip,
      source: 'auth_whatsapp_confirmed',
      identityLabel: 'Número',
      companyData: { contactPhone: phone },
    });
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
            companyKind: true,
            accountType: true,
            status: true,
            isActive: true,
            selectedPlanKey: true,
            trialEndsAt: true,
            billingGraceEndsAt: true,
            courtesyEndsAt: true,
            courtesyReason: true,
          },
        },
      },
    });

    if (!user) {
      throw new BadRequestException({ code: 'EMAIL_CONFIRMATION_STATUS_INVALID', message: 'Acompanhamento de confirmação inválido.' });
    }

    // Projecao do estado unico (PR-002 C.1): confirmacao pendente e fato do
    // usuario; o destino comercial vem do resolveCompanyAccessState.
    const pendingEmailConfirmation = !user.emailConfirmedAt;
    const platformInfraBlocked = !pendingEmailConfirmation && isPlatformInfraCompany(user.company);
    const access = resolveCompanyAccessState(user.company);
    const released = access.canUse && access.state !== 'platform_infra';
    const checkoutReason =
      access.detailCode === 'trial_expired'
        ? ('trial_expired' as const)
        : access.state === 'pending_checkout'
          ? ('pending_checkout' as const)
          : ('payment_failed' as const);

    const status = pendingEmailConfirmation
      ? 'pending_email_confirmation'
      : platformInfraBlocked
        ? 'platform_infra_company'
        : released
          ? 'active_trial'
          : 'pending_checkout';
    const next = platformInfraBlocked
      ? '/login'
      : !pendingEmailConfirmation && !released && user.company
        ? this.preCheckoutNextPath(checkoutReason)
        : '/dashboard';

    return {
      ok: true,
      status,
      confirmed: !pendingEmailConfirmation,
      email: user.email || null,
      next,
      loginNext: platformInfraBlocked ? '/login' : `/login?next=${encodeURIComponent(next)}`,
    };
  }

  // RESUME do onboarding (F4 19/06) — continuidade do funil.
  // Identifica a pessoa pelo token de acompanhamento já emitido no cadastro/
  // reenvio (sessão restrita): prova posse sem expor sessão plena. Sem token
  // válido → erro genérico (anti-enumeração: nunca revela passo/plano só pelo
  // e-mail). Devolve ONDE a pessoa parou pro funil renderizar aquele passo.
  async resolveOnboardingResume(pollToken: string) {
    const userId = this.verifyEmailConfirmationPollToken(pollToken);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        emailConfirmedAt: true,
        emailConfirmationSentAt: true,
        company: {
          select: {
            companyKind: true,
            accountType: true,
            status: true,
            isActive: true,
            selectedPlanKey: true,
            trialEndsAt: true,
            billingGraceEndsAt: true,
            courtesyEndsAt: true,
            courtesyReason: true,
          },
        },
      },
    });
    if (!user) {
      throw new BadRequestException({
        code: 'ONBOARDING_RESUME_INVALID',
        message: 'Não foi possível retomar o cadastro. Recomece pelo início.',
      });
    }
    return { ok: true, ...this.buildOnboardingResume(user) };
  }

  // Re-cadastro do mesmo e-mail com confirmação pendente (F4): em vez de
  // ConflictException seca, renova o link e devolve a tela de espera (resume).
  // O caller (signup) só chega aqui DEPOIS de a senha provar posse.
  private async resumePendingEmailConfirmation(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        company: {
          select: {
            name: true,
            entityType: true,
            trialModuleSelection: true,
            selectedPlanKey: true,
            acquisitionSource: true,
          },
        },
      },
    });
    if (!user) {
      throw new ConflictException('Já existe uma conta com este E‑mail. Caso seja sua, use a recuperação de senha.');
    }
    const email = String(user.email || '').trim().toLowerCase();
    const rawToken = await this.refreshEmailConfirmationToken(user.id);
    const delivery = await this.dispatchEmailConfirmation({
      email,
      username: user.name || user.username || email,
      companyName: user.company?.name || user.username || email,
      rawToken,
    });
    return this.buildPendingEmailConfirmationResponse({
      userId: user.id,
      email,
      username: user.username || email,
      companyName: user.company?.name || email,
      entityType: (user.company?.entityType as 'PF' | 'PJ' | null) ?? null,
      trialModuleSelection: (user.company?.trialModuleSelection as 'vendas' | null) ?? null,
      // P0.2 (PR10072026 W1): repassa o que está gravado (legado) sem ressuscitar
      // plano por normalize — conta neutra segue null.
      selectedPlanKey: (user.company?.selectedPlanKey as string | null) ?? null,
      acquisitionSource: user.company?.acquisitionSource || null,
      warnings: [],
      message: delivery.failed
        ? this.resendConfirmationDeliveryFailureMessage()
        : 'Reenviamos o link de confirmação. Continue de onde parou.',
      previewUrl: delivery.previewUrl,
      confirmUrl: delivery.confirmUrl,
      deliveryFailed: delivery.failed,
      deliveryErrorCode: delivery.errorCode,
      deliveryErrorMessage: delivery.errorMessage,
      checkoutToken: null,
    });
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
        name: true,
        username: true,
        email: true,
        emailConfirmedAt: true,
        emailConfirmationToken: true,
        companyId: true,
        company: {
          select: {
            name: true,
            companyKind: true,
            entityType: true,
            trialModuleSelection: true,
            acquisitionSource: true,
          },
        },
      },
    });

    // Confirmacao de e-mail pendente e fato do USUARIO (token vivo, sem
    // confirmacao) — nao um estado da empresa (PR-002 C.1 / DROP).
    const canResendConfirmation = Boolean(
      user && !user.emailConfirmedAt && user.emailConfirmationToken,
    );

    if (!canResendConfirmation) {
      return {
        ok: true,
        status: 'confirmation_resent_if_pending',
        message: 'Se existir uma conta com confirmação pendente, enviaremos um novo link em instantes.',
      };
    }

    const rawToken = await this.refreshEmailConfirmationToken(user.id);

    const delivery = await this.dispatchEmailConfirmation({
      email: normalizedEmail,
      username: user.name || user.username || normalizedEmail,
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
      this.prisma.user.update({ where: { id: pr.userId }, data: { password: hashed, mustChangePassword: false } }),
      // Receber o link no e-mail prova a caixa: vale como confirmacao para
      // contas convidadas que ainda nao confirmaram (PR-002 C.1c).
      this.prisma.user.updateMany({
        where: { id: pr.userId, emailConfirmedAt: null },
        data: { emailConfirmedAt: new Date(), emailConfirmationToken: null },
      }),
      this.prisma.passwordReset.update({ where: { id: pr.id }, data: { used: true } }),
    ]);

    return { ok: true };
  }
}
