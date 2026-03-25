import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MasterContextService } from '../master-context/master-context.service';
import { ModulesService } from '../modules/modules.service';
import { UpdateCompanyWebsiteConfigDto } from './dto/update-company-website-config.dto';
import { WebsiteAdminExchangeDto } from './dto/website-admin-exchange.dto';
import { WebsiteAdminVerifyDto } from './dto/website-admin-verify.dto';
import {
  CompanyWebsiteConfigRecord,
  consumeWebsiteAdminEntryTokenRecord,
  createWebsiteAdminEntryTokenRecord,
  ensureWebsiteRuntimeSchema,
  getCompanyWebsiteConfig,
  getWebsiteAdminEntryTokenRecord,
  upsertCompanyWebsiteConfig,
} from './website-runtime';

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
export class WebsiteService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly modulesService: ModulesService,
    private readonly masterContextService: MasterContextService,
  ) {}

  async onModuleInit() {
    await ensureWebsiteRuntimeSchema(this.prisma);
  }

  private websiteEntrySecret() {
    return String(process.env.WEBSITE_ENTRY_TOKEN_SECRET || process.env.JWT_SECRET || 'secretKey');
  }

  private websiteSessionSecret() {
    return String(process.env.WEBSITE_ADMIN_SESSION_SECRET || process.env.JWT_SECRET || 'secretKey');
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
      throw new BadRequestException('entryToken e obrigatorio.');
    }

    let claims: any;
    try {
      claims = await this.jwtService.verifyAsync(entryToken, {
        secret: this.websiteEntrySecret(),
        issuer: 'hbx-website',
        audience: 'hbx-website-admin-entry',
      });
    } catch {
      throw new ForbiddenException('Token temporario do admin invalido ou expirado.');
    }

    const entryId = String(claims?.jti || '');
    if (!entryId) {
      throw new ForbiddenException('Token temporario sem identificador.');
    }

    const entryRecord = await getWebsiteAdminEntryTokenRecord(this.prisma, entryId);
    if (!entryRecord || entryRecord.usedAt || entryRecord.expiresAt.getTime() <= Date.now()) {
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
      throw new ForbiddenException('Token temporario inconsistente.');
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, slug: true },
    });
    if (!company) throw new NotFoundException('Empresa nao encontrada.');

    const config = await getCompanyWebsiteConfig(this.prisma, companyId);
    if (!config?.websiteEnabled || !config.websiteAdminEnabled || !config.websiteAdminUrl || !config.websiteProjectId) {
      throw new ForbiddenException('Admin do website nao esta configurado para esta empresa.');
    }
    if (config.websiteProjectId !== websiteProjectId) {
      throw new ForbiddenException('Projeto do website divergente da configuracao atual.');
    }

    const user = await this.assertWebsiteAdminAccess(userId, companyId);
    const consumed = await consumeWebsiteAdminEntryTokenRecord(this.prisma, entryId, ip);
    if (!consumed) {
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

  async verifyAdminSession(dto: WebsiteAdminVerifyDto, _ip?: string) {
    const sessionToken = String(dto?.sessionToken || '').trim();
    if (!sessionToken) {
      throw new BadRequestException('sessionToken e obrigatorio.');
    }

    let claims: any;
    try {
      claims = await this.jwtService.verifyAsync(sessionToken, {
        secret: this.websiteSessionSecret(),
        issuer: 'hbx-website',
        audience: 'hbx-website-admin-session',
      });
    } catch {
      throw new ForbiddenException('Sessao do admin invalida ou expirada.');
    }

    const companyId = Number(claims?.companyId || 0);
    const userId = Number(claims?.sub || 0);
    const websiteProjectId = String(claims?.websiteProjectId || '');
    if (!companyId || !userId || !websiteProjectId) {
      throw new ForbiddenException('Sessao do admin incompleta.');
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, slug: true },
    });
    if (!company) throw new NotFoundException('Empresa nao encontrada.');

    const config = await getCompanyWebsiteConfig(this.prisma, companyId);
    if (!config?.websiteEnabled || !config.websiteAdminEnabled || config.websiteProjectId !== websiteProjectId) {
      throw new ForbiddenException('Configuracao atual do website nao permite esta sessao.');
    }

    const user = await this.assertWebsiteAdminAccess(userId, companyId);
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
}
