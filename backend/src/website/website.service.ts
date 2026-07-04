import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MasterContextService } from '../master-context/master-context.service';
import { ModulesService } from '../modules/modules.service';
import { UpdateCompanyWebsiteConfigDto } from './dto/update-company-website-config.dto';
import { WebsiteAdminExchangeDto } from './dto/website-admin-exchange.dto';
import { WebsiteAdminVerifyDto } from './dto/website-admin-verify.dto';
import { WebsiteFirebaseMintService } from './website-firebase-mint.service';
import {
  CompanyWebsiteConfigRecord,
  consumeWebsiteAdminEntryTokenRecord,
  createWebsiteAdminEntryTokenRecord,
  deleteExpiredWebsiteAdminEntryTokens,
  ensureWebsiteCaptureToken,
  ensureWebsiteRuntimeSchema,
  getCompanyWebsiteConfig,
  getWebsiteAdminEntryTokenRecord,
  rotateWebsiteCaptureToken,
  upsertCompanyWebsiteConfig,
} from './website-runtime';

// Cron de limpeza (Sprint 2 / T3, 02/07): WebsiteAdminEntryToken só recebia
// INSERT/UPDATE e nunca era limpo (1 linha por launch, cresce pra sempre).
// Padrão igual ao FinanceiroService/NightFactoryWorker (setInterval interno,
// sem @nestjs/schedule no projeto): sweep diário + 1 passada no boot.
const WEBSITE_ENTRY_TOKEN_SWEEP_MS = 24 * 60 * 60 * 1000;
const WEBSITE_ENTRY_TOKEN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

type LaunchTarget = 'public' | 'admin';

type WebsitePortalPayload = {
  companyId: number | null;
  companyName: string | null;
  companySlug: string | null;
  configured: boolean;
  websiteEnabled: boolean;
  websitePublicUrl: string | null;
  websiteAdminUrl: string | null;
  websiteProjectId: string | null;
  websiteAdminEnabled: boolean;
  websiteLaunchMode: 'public' | 'admin';
  adminAllowed: boolean;
  launchTarget: LaunchTarget | null;
  launchUrl: string | null;
  message: string | null;
};

@Injectable()
export class WebsiteService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebsiteService.name);
  private entryTokenSweepHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly modulesService: ModulesService,
    private readonly masterContextService: MasterContextService,
    private readonly firebaseMintService: WebsiteFirebaseMintService,
  ) {}

  onModuleInit() {
    // Fail-hard (Sprint 2 / T2, 02/07): em produção os secrets dedicados da
    // ponte Website são OBRIGATÓRIOS no boot — nunca mais silenciosamente caem
    // pro JWT_SECRET do app (a fronteira era segura por ACIDENTE, não desenho:
    // ver docs/PLANEJAMENTOS/WEBSITE-KIT/WEBSITE-KIT-SPRINT2.md). Em dev/test o
    // fallback pro JWT_SECRET continua liberado pra não travar onboarding local.
    if (process.env.NODE_ENV === 'production') {
      const missing: string[] = [];
      if (!String(process.env.WEBSITE_ENTRY_TOKEN_SECRET || '').trim()) missing.push('WEBSITE_ENTRY_TOKEN_SECRET');
      if (!String(process.env.WEBSITE_ADMIN_SESSION_SECRET || '').trim()) missing.push('WEBSITE_ADMIN_SESSION_SECRET');

      if (missing.length) {
        throw new Error(
          `[website] Boot abortado em producao: variavel(is) obrigatoria(s) ausente(s): ${missing.join(', ')}. ` +
            'Gere segredos dedicados (nao reaproveitar JWT_SECRET) e configure no .env da VPS antes do deploy.',
        );
      }
    }

    this.entryTokenSweepHandle = setInterval(() => {
      void this.sweepExpiredEntryTokens('interval');
    }, WEBSITE_ENTRY_TOKEN_SWEEP_MS);

    setTimeout(() => {
      void this.sweepExpiredEntryTokens('startup');
    }, 5000);
  }

  onModuleDestroy() {
    if (this.entryTokenSweepHandle) clearInterval(this.entryTokenSweepHandle);
    this.entryTokenSweepHandle = null;
  }

  private async sweepExpiredEntryTokens(trigger: 'startup' | 'interval') {
    try {
      const cutoff = new Date(Date.now() - WEBSITE_ENTRY_TOKEN_RETENTION_MS);
      const deletedCount = await deleteExpiredWebsiteAdminEntryTokens(this.prisma, cutoff);
      if (deletedCount > 0) {
        this.websiteLog('WEBSITE_ADMIN_ENTRY_TOKEN_SWEEP', { trigger, deletedCount, cutoff: cutoff.toISOString() });
      }
    } catch (error: any) {
      this.logger.warn(
        `WEBSITE_ADMIN_ENTRY_TOKEN_SWEEP_FAILED trigger=${trigger} error=${String(error?.message || error)}`,
      );
    }
  }

  private requireWebsiteSecret(primary: unknown, fallback: unknown, primaryName: string, fallbackName: string) {
    const primarySecret = String(primary || '').trim();
    if (primarySecret) return primarySecret;

    const fallbackSecret = String(fallback || '').trim();
    if (fallbackSecret) return fallbackSecret;

    throw new Error(`${primaryName} or ${fallbackName} must be configured`);
  }

  private websiteEntrySecret() {
    return this.requireWebsiteSecret(
      process.env.WEBSITE_ENTRY_TOKEN_SECRET,
      process.env.JWT_SECRET,
      'WEBSITE_ENTRY_TOKEN_SECRET',
      'JWT_SECRET',
    );
  }

  private websiteEntrySecretSource() {
    if (process.env.WEBSITE_ENTRY_TOKEN_SECRET) return 'WEBSITE_ENTRY_TOKEN_SECRET';
    if (process.env.JWT_SECRET) return 'JWT_SECRET';
    return 'unconfigured';
  }

  private websiteSessionSecret() {
    return this.requireWebsiteSecret(
      process.env.WEBSITE_ADMIN_SESSION_SECRET,
      process.env.JWT_SECRET,
      'WEBSITE_ADMIN_SESSION_SECRET',
      'JWT_SECRET',
    );
  }

  private websiteSessionSecretSource() {
    if (process.env.WEBSITE_ADMIN_SESSION_SECRET) return 'WEBSITE_ADMIN_SESSION_SECRET';
    if (process.env.JWT_SECRET) return 'JWT_SECRET';
    return 'unconfigured';
  }

  private websiteEntryTtlSeconds() {
    const configured = Number(process.env.WEBSITE_ENTRY_TOKEN_TTL_SECONDS || 90);
    return Math.max(30, Math.min(300, Number.isFinite(configured) ? configured : 90));
  }

  private websiteSessionTtlSeconds() {
    const configured = Number(process.env.WEBSITE_ADMIN_SESSION_TTL_SECONDS || 28800);
    return Math.max(300, Math.min(86400, Number.isFinite(configured) ? configured : 28800));
  }

  private normalizeOptionalString(value: unknown) {
    const normalized = String(value || '').trim();
    return normalized || null;
  }

  private normalizeLaunchMode(value: unknown): 'public' | 'admin' {
    return String(value || '').trim().toLowerCase() === 'admin' ? 'admin' : 'public';
  }

  private normalizePortalTarget(value: unknown): 'auto' | LaunchTarget {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'admin') return 'admin';
    if (normalized === 'public') return 'public';
    return 'auto';
  }

  private requireValidUrl(value: string | null, fieldName: string) {
    const normalized = this.normalizeOptionalString(value);
    if (!normalized) return null;
    try {
      const parsed = new URL(normalized);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('invalid protocol');
      }
      return parsed.toString();
    } catch {
      throw new BadRequestException(`${fieldName} precisa ser uma URL http(s) valida.`);
    }
  }

  private appendQueryValue(url: string, key: string, value: string) {
    const parsed = new URL(url);
    parsed.searchParams.set(key, value);
    return parsed.toString();
  }

  private websiteLog(event: string, payload: Record<string, unknown>) {
    this.logger.log(`${event} ${JSON.stringify(payload)}`);
  }

  private websiteWarn(event: string, payload: Record<string, unknown>) {
    this.logger.warn(`${event} ${JSON.stringify(payload)}`);
  }

  private async canUserOpenWebsiteAdmin(user: any, companyId: number) {
    const userId = Number(user?.id || 0);
    if (!userId) return false;
    if (user?.isActive === false) return false;
    if (Boolean(user?.isSystemMaster)) return true;
    if (Number(user?.companyId || 0) !== Number(companyId)) return false;

    return this.modulesService.canUserAccessModule(userId, 'website');
  }

  private async resolveCompanyFromRuntimeUser(user: any) {
    const companyId = Number(user?.companyId || 0);
    if (!companyId) {
      return null;
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, slug: true },
    });
    if (!company) {
      throw new NotFoundException('Empresa nao encontrada para o modulo Website.');
    }
    return company;
  }

  private async assertMasterUser(masterUserId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: Number(masterUserId) },
      select: { id: true, isSystemMaster: true },
    });
    if (!user?.isSystemMaster) {
      throw new ForbiddenException('Acesso exclusivo do MASTER.');
    }
  }

  private async assertWebsiteAdminAccess(userId: number, companyId: number) {
    const user: any = await this.prisma.user.findUnique({
      where: { id: Number(userId) },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        email: true,
        isActive: true,
        isSystemMaster: true,
        companyId: true,
      },
    });
    if (!user) throw new ForbiddenException('Usuario nao encontrado.');
    if (user.isActive === false) throw new ForbiddenException('Usuario desativado.');
    if (!user.isSystemMaster && Number(user.companyId || 0) !== Number(companyId)) {
      throw new ForbiddenException('Usuario fora da empresa configurada para este website.');
    }
    const allowed = await this.canUserOpenWebsiteAdmin(user, companyId);
    if (!allowed) {
      throw new ForbiddenException('Usuario sem acesso ao admin do website.');
    }
    return user;
  }

  private buildPortalPayload(
    company: { id: number; name: string; slug: string | null } | null,
    config: CompanyWebsiteConfigRecord | null,
    extra?: Partial<WebsitePortalPayload>,
  ): WebsitePortalPayload {
    return {
      companyId: company?.id || null,
      companyName: company?.name || null,
      companySlug: company?.slug || null,
      configured: Boolean(config?.websiteEnabled && config?.websitePublicUrl),
      websiteEnabled: Boolean(config?.websiteEnabled),
      websitePublicUrl: config?.websitePublicUrl || null,
      websiteAdminUrl: config?.websiteAdminUrl || null,
      websiteProjectId: config?.websiteProjectId || null,
      websiteAdminEnabled: Boolean(config?.websiteAdminEnabled),
      websiteLaunchMode: config?.websiteLaunchMode || 'public',
      adminAllowed: false,
      launchTarget: null,
      launchUrl: null,
      message: null,
      ...extra,
    };
  }

  private async buildAdminLaunchUrl(user: any, company: { id: number; name: string; slug: string | null }, config: CompanyWebsiteConfigRecord) {
    if (!config.websiteAdminEnabled || !config.websiteAdminUrl || !config.websiteProjectId) {
      throw new BadRequestException('Admin do website nao esta configurado para esta empresa.');
    }

    await this.assertWebsiteAdminAccess(Number(user?.id), company.id);

    const entryId = randomUUID();
    const expiresAt = new Date(Date.now() + this.websiteEntryTtlSeconds() * 1000);
    await createWebsiteAdminEntryTokenRecord(this.prisma, {
      id: entryId,
      companyId: company.id,
      userId: Number(user.id),
      websiteProjectId: config.websiteProjectId,
      expiresAt,
    });

    const entryToken = await this.jwtService.signAsync(
      {
        sub: Number(user.id),
        companyId: company.id,
        websiteProjectId: config.websiteProjectId,
        tokenType: 'website-admin-entry',
      },
      {
        secret: this.websiteEntrySecret(),
        issuer: 'hbx-website',
        audience: 'hbx-website-admin-entry',
        expiresIn: this.websiteEntryTtlSeconds(),
        jwtid: entryId,
      },
    );

    this.websiteLog('WEBSITE_ADMIN_LAUNCH_URL_GENERATED', {
      companyId: company.id,
      companySlug: company.slug || null,
      userId: Number(user?.id || 0),
      websiteProjectId: config.websiteProjectId,
      websiteAdminUrl: config.websiteAdminUrl,
      entryId,
      entryTtlSeconds: this.websiteEntryTtlSeconds(),
      entrySecretSource: this.websiteEntrySecretSource(),
      transport: 'query+hbxSessionStorage',
      cookieBypassUsed: false,
    });

    return this.appendQueryValue(config.websiteAdminUrl, 'hbx_entry', entryToken);
  }

  async getPortal(user: any, target?: string) {
    const company = await this.resolveCompanyFromRuntimeUser(user);
    if (!company) {
      return this.buildPortalPayload(null, null, {
        message: 'Selecione uma empresa no MASTER para abrir o Website.',
      });
    }

    const config = await getCompanyWebsiteConfig(this.prisma, company.id);
    if (!config?.websiteEnabled || !config.websitePublicUrl) {
      return this.buildPortalPayload(company, config, {
        configured: false,
        message: 'Website nao configurado para esta empresa.',
      });
    }

    const adminAllowed = Boolean(
      config.websiteAdminEnabled &&
        config.websiteAdminUrl &&
        config.websiteProjectId &&
        (await this.canUserOpenWebsiteAdmin(user, company.id)),
    );
    const requestedTarget = this.normalizePortalTarget(target);
    const effectiveTarget: LaunchTarget =
      requestedTarget === 'admin'
        ? 'admin'
        : requestedTarget === 'public'
          ? 'public'
          : config.websiteLaunchMode === 'admin' && adminAllowed
            ? 'admin'
            : 'public';

    if (effectiveTarget === 'admin') {
      if (!adminAllowed) {
        return this.buildPortalPayload(company, config, {
          configured: true,
          adminAllowed: false,
          launchTarget: null,
          launchUrl: null,
          message: 'Admin do website indisponivel para este usuario.',
        });
      }
      const launchUrl = await this.buildAdminLaunchUrl(user, company, config);
      return this.buildPortalPayload(company, config, {
        configured: true,
        adminAllowed: true,
        launchTarget: 'admin',
        launchUrl,
        message: null,
      });
    }

    return this.buildPortalPayload(company, config, {
      configured: true,
      adminAllowed,
      launchTarget: 'public',
      launchUrl: config.websitePublicUrl,
      message: null,
    });
  }

  async getPortalForCompanyByMaster(masterUserId: number, companyId: number, target?: string) {
    await this.assertMasterUser(masterUserId);

    const [masterUser, company] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: Number(masterUserId) },
        select: {
          id: true,
          username: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          isSystemMaster: true,
          companyId: true,
        },
      }),
      this.prisma.company.findUnique({
        where: { id: Number(companyId) },
        select: { id: true, name: true, slug: true },
      }),
    ]);

    if (!masterUser?.isSystemMaster) {
      throw new ForbiddenException('Acesso exclusivo do MASTER.');
    }
    if (!company) {
      throw new NotFoundException('Empresa nao encontrada.');
    }

    const config = await getCompanyWebsiteConfig(this.prisma, company.id);
    if (!config?.websiteEnabled || !config.websitePublicUrl) {
      return this.buildPortalPayload(company, config, {
        configured: false,
        message: 'Website nao configurado para esta empresa.',
      });
    }

    const adminAllowed = Boolean(
      config.websiteAdminEnabled &&
        config.websiteAdminUrl &&
        config.websiteProjectId &&
        (await this.canUserOpenWebsiteAdmin(masterUser, company.id)),
    );
    const requestedTarget = this.normalizePortalTarget(target);
    const effectiveTarget: LaunchTarget =
      requestedTarget === 'admin'
        ? 'admin'
        : requestedTarget === 'public'
          ? 'public'
          : config.websiteLaunchMode === 'admin' && adminAllowed
            ? 'admin'
            : 'public';

    if (effectiveTarget === 'admin') {
      if (!adminAllowed) {
        return this.buildPortalPayload(company, config, {
          configured: true,
          adminAllowed: false,
          launchTarget: null,
          launchUrl: null,
          message: 'Admin do website indisponivel para esta empresa.',
        });
      }

      const launchUrl = await this.buildAdminLaunchUrl(masterUser, company, config);
      return this.buildPortalPayload(company, config, {
        configured: true,
        adminAllowed: true,
        launchTarget: 'admin',
        launchUrl,
      });
    }

    return this.buildPortalPayload(company, config, {
      configured: true,
      adminAllowed,
      launchTarget: 'public',
      launchUrl: config.websitePublicUrl,
    });
  }

  async updateCompanyConfigByMaster(
    masterUserId: number,
    companyId: number,
    input: UpdateCompanyWebsiteConfigDto,
  ) {
    await this.assertMasterUser(masterUserId);

    const company = await this.prisma.company.findUnique({
      where: { id: Number(companyId) },
      select: { id: true, name: true, slug: true },
    });
    if (!company) throw new NotFoundException('Empresa nao encontrada.');

    const websiteEnabled = Boolean(input?.websiteEnabled);
    const websiteAdminEnabled = Boolean(input?.websiteAdminEnabled);
    const websitePublicUrl = this.requireValidUrl(input?.websitePublicUrl || null, 'websitePublicUrl');
    const websiteAdminUrl = this.requireValidUrl(input?.websiteAdminUrl || null, 'websiteAdminUrl');
    const websiteProjectId = this.normalizeOptionalString(input?.websiteProjectId);
    const websiteLaunchMode = this.normalizeLaunchMode(input?.websiteLaunchMode);

    if (websiteEnabled && !websitePublicUrl) {
      throw new BadRequestException('websitePublicUrl e obrigatorio quando websiteEnabled=true.');
    }
    if (websiteAdminEnabled && !websiteAdminUrl) {
      throw new BadRequestException('websiteAdminUrl e obrigatorio quando websiteAdminEnabled=true.');
    }
    if (websiteAdminEnabled && !websiteProjectId) {
      throw new BadRequestException('websiteProjectId e obrigatorio quando websiteAdminEnabled=true.');
    }
    if (websiteLaunchMode === 'admin' && !websiteAdminEnabled) {
      throw new BadRequestException('websiteLaunchMode=admin exige websiteAdminEnabled=true.');
    }

    const saved = await upsertCompanyWebsiteConfig(this.prisma, {
      companyId: company.id,
      websiteEnabled,
      websitePublicUrl,
      websiteAdminUrl,
      websiteProjectId,
      websiteAdminEnabled,
      websiteLaunchMode,
    });

    await this.masterContextService.registerSupportAction({
      masterUserId,
      companyId: company.id,
      scope: 'master_website',
      action: 'WEBSITE_CONFIG_UPDATED',
      metadata: {
        websiteEnabled,
        websiteAdminEnabled,
        websitePublicUrl,
        websiteAdminUrl,
        websiteProjectId,
        websiteLaunchMode,
      },
    });

    return this.buildPortalPayload(company, saved, {
      configured: Boolean(saved?.websiteEnabled && saved?.websitePublicUrl),
      adminAllowed: Boolean(saved?.websiteAdminEnabled && saved?.websiteAdminUrl && saved?.websiteProjectId),
    });
  }

  async exchangeAdminEntry(dto: WebsiteAdminExchangeDto, ip?: string) {
    const entryToken = String(dto?.entryToken || '').trim();
    if (!entryToken) {
      this.websiteWarn('WEBSITE_ADMIN_ENTRY_EXCHANGE_REJECTED', {
        reason: 'missing_entry_token',
        ip: ip || null,
      });
      throw new BadRequestException('entryToken e obrigatorio.');
    }

    this.websiteLog('WEBSITE_ADMIN_ENTRY_EXCHANGE_RECEIVED', {
      hasEntryToken: true,
      entryTokenPreview: `${entryToken.slice(0, 8)}...${entryToken.slice(-6)}`,
      ip: ip || null,
      entrySecretSource: this.websiteEntrySecretSource(),
      entryTtlSeconds: this.websiteEntryTtlSeconds(),
      transport: 'query+hbxSessionStorage',
    });

    let claims: any;
    try {
      claims = await this.jwtService.verifyAsync(entryToken, {
        secret: this.websiteEntrySecret(),
        issuer: 'hbx-website',
        audience: 'hbx-website-admin-entry',
      });
    } catch (error: any) {
      this.websiteWarn('WEBSITE_ADMIN_ENTRY_EXCHANGE_REJECTED', {
        reason: 'entry_token_verify_failed',
        ip: ip || null,
        errorName: error?.name || 'UnknownError',
        errorMessage: error?.message || 'unknown',
        entrySecretSource: this.websiteEntrySecretSource(),
      });
      throw new ForbiddenException('Token temporario do admin invalido ou expirado.');
    }

    const entryId = String(claims?.jti || '');
    if (!entryId) {
      this.websiteWarn('WEBSITE_ADMIN_ENTRY_EXCHANGE_REJECTED', {
        reason: 'entry_token_missing_jti',
        ip: ip || null,
      });
      throw new ForbiddenException('Token temporario sem identificador.');
    }

    const entryRecord = await getWebsiteAdminEntryTokenRecord(this.prisma, entryId);
    if (!entryRecord || entryRecord.usedAt || entryRecord.expiresAt.getTime() <= Date.now()) {
      this.websiteWarn('WEBSITE_ADMIN_ENTRY_EXCHANGE_REJECTED', {
        reason: 'entry_token_record_unavailable',
        entryId,
        ip: ip || null,
        entryRecordFound: Boolean(entryRecord),
        entryRecordUsedAt: entryRecord?.usedAt?.toISOString() || null,
        entryRecordExpiresAt: entryRecord?.expiresAt?.toISOString() || null,
      });
      throw new ForbiddenException('Token temporario indisponivel para uso.');
    }

    const companyId = Number(claims?.companyId || 0);
    const userId = Number(claims?.sub || 0);
    const websiteProjectId = String(claims?.websiteProjectId || '');
    if (
      companyId !== entryRecord.companyId ||
      userId !== entryRecord.userId ||
      websiteProjectId !== entryRecord.websiteProjectId
    ) {
      this.websiteWarn('WEBSITE_ADMIN_ENTRY_EXCHANGE_REJECTED', {
        reason: 'entry_token_record_mismatch',
        entryId,
        ip: ip || null,
        companyId,
        userId,
        websiteProjectId,
        recordCompanyId: entryRecord.companyId,
        recordUserId: entryRecord.userId,
        recordWebsiteProjectId: entryRecord.websiteProjectId,
      });
      throw new ForbiddenException('Token temporario inconsistente.');
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, slug: true },
    });
    if (!company) throw new NotFoundException('Empresa nao encontrada.');

    const config = await getCompanyWebsiteConfig(this.prisma, companyId);
    if (!config?.websiteEnabled || !config.websiteAdminEnabled || !config.websiteAdminUrl || !config.websiteProjectId) {
      this.websiteWarn('WEBSITE_ADMIN_ENTRY_EXCHANGE_REJECTED', {
        reason: 'website_admin_not_configured',
        entryId,
        companyId,
        websiteProjectId,
      });
      throw new ForbiddenException('Admin do website nao esta configurado para esta empresa.');
    }
    if (config.websiteProjectId !== websiteProjectId) {
      this.websiteWarn('WEBSITE_ADMIN_ENTRY_EXCHANGE_REJECTED', {
        reason: 'website_project_id_mismatch',
        entryId,
        companyId,
        claimedWebsiteProjectId: websiteProjectId,
        configuredWebsiteProjectId: config.websiteProjectId,
      });
      throw new ForbiddenException('Projeto do website divergente da configuracao atual.');
    }

    const user = await this.assertWebsiteAdminAccess(userId, companyId);
    const consumed = await consumeWebsiteAdminEntryTokenRecord(this.prisma, entryId, ip);
    if (!consumed) {
      this.websiteWarn('WEBSITE_ADMIN_ENTRY_EXCHANGE_REJECTED', {
        reason: 'entry_token_already_used',
        entryId,
        companyId,
        userId,
        ip: ip || null,
      });
      throw new ForbiddenException('Token temporario ja foi utilizado.');
    }

    const sessionExpiresIn = this.websiteSessionTtlSeconds();
    const sessionToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        companyId: company.id,
        websiteProjectId: config.websiteProjectId,
        role: user.role,
        tokenType: 'website-admin-session',
      },
      {
        secret: this.websiteSessionSecret(),
        issuer: 'hbx-website',
        audience: 'hbx-website-admin-session',
        expiresIn: sessionExpiresIn,
        jwtid: randomUUID(),
      },
    );

    this.websiteLog('WEBSITE_ADMIN_ENTRY_EXCHANGE_ACCEPTED', {
      entryId,
      companyId: company.id,
      userId: user.id,
      websiteProjectId: config.websiteProjectId,
      sessionTtlSeconds: sessionExpiresIn,
      sessionSecretSource: this.websiteSessionSecretSource(),
      ip: ip || null,
    });

    return {
      ok: true,
      sessionToken,
      expiresAt: new Date(Date.now() + sessionExpiresIn * 1000).toISOString(),
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug || null,
      },
      website: {
        projectId: config.websiteProjectId,
        publicUrl: config.websitePublicUrl,
        adminUrl: config.websiteAdminUrl,
      },
      user: {
        id: user.id,
        username: user.username || null,
        name: user.name || null,
        role: user.role || null,
      },
    };
  }

  /**
   * Nucleo de validacao da sessao do admin do website — extraido em 02/07
   * (Sprint 3 / T3) para ser reaproveitado tal e qual por `verifyAdminSession`
   * (endpoint existente) e `mintFirebaseTokenForAdmin` (endpoint novo do mint
   * central). Mesma lógica, mesmos eventos de log, mesma rejeicao — o mint
   * central NUNCA aceita uma sessao que o verify recusaria.
   */
  private async resolveVerifiedAdminSession(sessionToken: string, ip: string | undefined, logPrefix: string) {
    if (!sessionToken) {
      this.websiteWarn(`${logPrefix}_REJECTED`, {
        reason: 'missing_session_token',
        ip: ip || null,
      });
      throw new BadRequestException('sessionToken e obrigatorio.');
    }

    this.websiteLog(`${logPrefix}_RECEIVED`, {
      hasSessionToken: true,
      sessionTokenPreview: `${sessionToken.slice(0, 8)}...${sessionToken.slice(-6)}`,
      ip: ip || null,
      sessionSecretSource: this.websiteSessionSecretSource(),
      sessionTtlSeconds: this.websiteSessionTtlSeconds(),
      transport: 'query+hbxSessionStorage',
    });

    let claims: any;
    try {
      claims = await this.jwtService.verifyAsync(sessionToken, {
        secret: this.websiteSessionSecret(),
        issuer: 'hbx-website',
        audience: 'hbx-website-admin-session',
      });
    } catch (error: any) {
      this.websiteWarn(`${logPrefix}_REJECTED`, {
        reason: 'session_token_verify_failed',
        ip: ip || null,
        errorName: error?.name || 'UnknownError',
        errorMessage: error?.message || 'unknown',
        sessionSecretSource: this.websiteSessionSecretSource(),
      });
      throw new ForbiddenException('Sessao do admin invalida ou expirada.');
    }

    const companyId = Number(claims?.companyId || 0);
    const userId = Number(claims?.sub || 0);
    const websiteProjectId = String(claims?.websiteProjectId || '');
    if (!companyId || !userId || !websiteProjectId) {
      this.websiteWarn(`${logPrefix}_REJECTED`, {
        reason: 'session_token_incomplete_claims',
        ip: ip || null,
        companyId,
        userId,
        websiteProjectId,
      });
      throw new ForbiddenException('Sessao do admin incompleta.');
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, slug: true },
    });
    if (!company) throw new NotFoundException('Empresa nao encontrada.');

    const config = await getCompanyWebsiteConfig(this.prisma, companyId);
    if (!config?.websiteEnabled || !config.websiteAdminEnabled || config.websiteProjectId !== websiteProjectId) {
      this.websiteWarn(`${logPrefix}_REJECTED`, {
        reason: 'website_config_mismatch',
        ip: ip || null,
        companyId,
        userId,
        claimedWebsiteProjectId: websiteProjectId,
        configuredWebsiteProjectId: config?.websiteProjectId || null,
        websiteEnabled: Boolean(config?.websiteEnabled),
        websiteAdminEnabled: Boolean(config?.websiteAdminEnabled),
      });
      throw new ForbiddenException('Configuracao atual do website nao permite esta sessao.');
    }

    const user = await this.assertWebsiteAdminAccess(userId, companyId);
    this.websiteLog(`${logPrefix}_ACCEPTED`, {
      companyId,
      userId,
      websiteProjectId,
      ip: ip || null,
    });

    return { company, config, user };
  }

  async verifyAdminSession(dto: WebsiteAdminVerifyDto, _ip?: string) {
    const sessionToken = String(dto?.sessionToken || '').trim();
    const { company, config, user } = await this.resolveVerifiedAdminSession(
      sessionToken,
      _ip,
      'WEBSITE_ADMIN_SESSION_VERIFY',
    );

    return {
      ok: true,
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug || null,
      },
      website: {
        projectId: config.websiteProjectId,
        publicUrl: config.websitePublicUrl,
        adminUrl: config.websiteAdminUrl,
      },
      user: {
        id: user.id,
        username: user.username || null,
        name: user.name || null,
        role: user.role || null,
      },
    };
  }

  // COLD-22: token opaco pro form do site apontar o POST público de captura de lead — nunca
  // expor companyId cru na URL pública. Idempotente: emite se a empresa ainda não tiver um.
  async getOrCreateCaptureTokenByMaster(masterUserId: number, companyId: number) {
    await this.assertMasterUser(masterUserId);
    const company = await this.prisma.company.findUnique({
      where: { id: Number(companyId) },
      select: { id: true, name: true, slug: true },
    });
    if (!company) throw new NotFoundException('Empresa nao encontrada.');

    const captureToken = await ensureWebsiteCaptureToken(this.prisma, company.id);
    return {
      companyId: company.id,
      companyName: company.name,
      captureToken,
      captureEndpoint: `/public/lead-capture/${captureToken}`,
    };
  }

  async rotateCaptureTokenByMaster(masterUserId: number, companyId: number) {
    await this.assertMasterUser(masterUserId);
    const company = await this.prisma.company.findUnique({
      where: { id: Number(companyId) },
      select: { id: true, name: true, slug: true },
    });
    if (!company) throw new NotFoundException('Empresa nao encontrada.');

    const captureToken = await rotateWebsiteCaptureToken(this.prisma, company.id);
    await this.masterContextService.registerSupportAction({
      masterUserId,
      companyId: company.id,
      scope: 'master_website',
      action: 'WEBSITE_CAPTURE_TOKEN_ROTATED',
      metadata: { companyId: company.id },
    });

    this.websiteWarn('WEBSITE_CAPTURE_TOKEN_ROTATED', { companyId: company.id, masterUserId });
    return {
      companyId: company.id,
      companyName: company.name,
      captureToken,
      captureEndpoint: `/public/lead-capture/${captureToken}`,
    };
  }

  /**
   * Mint central do Firebase Custom Token (Sprint 3 / T3, 02/07) — mata a
   * necessidade de Cloud Function (`hbx-auth-flow.js`) por projeto de cliente.
   * Valida a sessao com a MESMA logica do verify (`resolveVerifiedAdminSession`)
   * e so entao pede o custom token ao `WebsiteFirebaseMintService`.
   *
   * Atras de flag (`WEBSITE_TOKEN_MINT_ENABLED`, ver WebsiteFirebaseMintService)
   * — desligado por default. Quando desligado, lanca ServiceUnavailableException
   * com mensagem clara; o `hbx-admin-auth.js` do template trata isso como sinal
   * pra cair no fallback da Function antiga (`/api/admin/hbx-auth`), nunca como
   * bloqueio pro usuario final.
   */
  async mintFirebaseTokenForAdmin(sessionToken: string, ip?: string) {
    const normalizedToken = String(sessionToken || '').trim();
    const { company, config, user } = await this.resolveVerifiedAdminSession(
      normalizedToken,
      ip,
      'WEBSITE_ADMIN_FIREBASE_TOKEN',
    );

    if (!config.websiteProjectId) {
      throw new BadRequestException('websiteProjectId nao configurado para esta empresa.');
    }

    // uid no MESMO formato que a Function antiga (hbx-auth-flow.js:
    // buildFirebaseUid) sempre gerou — trocar de mecanismo (Function -> mint
    // central) NUNCA pode trocar o uid de um admin ja existente, ou regras do
    // Firestore/Storage baseadas em request.auth.uid do site do cliente
    // quebram silenciosamente na migracao.
    const uid = `hbx-${config.websiteProjectId}-${company.id}-${user.id}`.slice(0, 128);
    const minted = await this.firebaseMintService.mintCustomToken({
      firebaseProjectId: config.websiteProjectId,
      uid,
      claims: {
        hbxCompanyId: company.id,
        hbxUserId: user.id,
        hbxRole: user.role || null,
        hbxWebsiteProjectId: config.websiteProjectId,
        hbxSource: 'hbx-website-admin',
      },
    });

    this.websiteLog('WEBSITE_ADMIN_FIREBASE_TOKEN_MINTED', {
      companyId: company.id,
      userId: user.id,
      websiteProjectId: config.websiteProjectId,
      expiresInSeconds: minted.expiresInSeconds,
      ip: ip || null,
    });

    return {
      ok: true,
      firebaseCustomToken: minted.customToken,
      expiresInSeconds: minted.expiresInSeconds,
      website: {
        projectId: config.websiteProjectId,
      },
    };
  }
}
