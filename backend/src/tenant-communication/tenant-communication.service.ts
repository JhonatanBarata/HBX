import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { isPlatformInfraCompany } from '../common/company-kind';
import { PrismaService } from '../prisma/prisma.service';
import { hasTeamAccess } from '../team/team-access-catalog';
import {
  resolveEffectiveTeamAccess,
  type EffectiveTeamAccess,
} from '../team/team-access-runtime';

export type TenantCommunicationSettingsPatch = {
  supportEmail?: unknown;
  replyToEmail?: unknown;
  supportWhatsapp?: unknown;
  communicationSettingsJson?: unknown;
};

type TenantCommunicationCompany = {
  id: number;
  companyKind?: string | null;
  supportEmail?: string | null;
  replyToEmail?: string | null;
  supportWhatsapp?: string | null;
  communicationSettingsJson?: string | null;
};

function hasOwn(input: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

@Injectable()
export class TenantCommunicationService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeEmail(value: unknown) {
    const email = String(value || '').trim().toLowerCase();
    return email || null;
  }

  private normalizeText(value: unknown, max = 180) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text ? text.slice(0, max) : null;
  }

  private normalizeSettingsJson(value: unknown) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'string') {
      const raw = value.trim();
      if (!raw) return null;
      try {
        JSON.parse(raw);
      } catch {
        throw new BadRequestException('Configuracao de comunicacao deve ser um JSON valido.');
      }
      return raw;
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    throw new BadRequestException('Configuracao de comunicacao deve ser um JSON valido.');
  }

  private async resolveTenantContext(user: any) {
    const context = await resolveEffectiveTeamAccess(this.prisma, user);
    const activeMasterContext = Boolean(context.masterContext?.active);
    if (context.isSystemMaster && !activeMasterContext) {
      throw new ForbiddenException('Contexto de tenant obrigatorio para comunicacao da empresa.');
    }
    if (!activeMasterContext && isPlatformInfraCompany(context.company)) {
      throw new ForbiddenException('platform_infra não opera comunicação comercial de tenant.');
    }
    if (!context.companyId) {
      throw new ForbiddenException('Empresa nao identificada.');
    }

    const company = await (this.prisma.company as any).findFirst({
      where: { id: context.companyId },
      select: {
        id: true,
        companyKind: true,
        supportEmail: true,
        replyToEmail: true,
        supportWhatsapp: true,
        communicationSettingsJson: true,
      },
    });
    if (!company || isPlatformInfraCompany(company)) {
      throw new ForbiddenException('platform_infra não opera comunicação comercial de tenant.');
    }
    return { context, company: company as TenantCommunicationCompany };
  }

  private assertCanViewChannels(context: EffectiveTeamAccess) {
    if (!hasTeamAccess(context.accessMap, 'communication.support.viewCompanySupportChannels')) {
      throw new ForbiddenException('Acesso para ver canais de suporte bloqueado pela politica da equipe.');
    }
  }

  private assertCanManageSettings(context: EffectiveTeamAccess) {
    if (!hasTeamAccess(context.accessMap, 'team.access.manage')) {
      throw new ForbiddenException('Acesso para configurar comunicacao bloqueado pela politica da equipe.');
    }
  }

  private buildSettingsPayload(context: EffectiveTeamAccess, company: TenantCommunicationCompany) {
    return {
      companyId: company.id,
      supportEmail: company.supportEmail || null,
      replyToEmail: company.replyToEmail || null,
      supportWhatsapp: company.supportWhatsapp || null,
      communicationSettingsJson: company.communicationSettingsJson || null,
      canEdit: hasTeamAccess(context.accessMap, 'team.access.manage'),
      canUseCompanyReplyTo: hasTeamAccess(context.accessMap, 'communication.email.useCompanyReplyTo'),
    };
  }

  async getSettingsForUser(user: any) {
    const { context, company } = await this.resolveTenantContext(user);
    this.assertCanViewChannels(context);
    return this.buildSettingsPayload(context, company);
  }

  async updateSettingsForUser(user: any, patch: TenantCommunicationSettingsPatch) {
    const { context, company } = await this.resolveTenantContext(user);
    this.assertCanManageSettings(context);

    const input = patch && typeof patch === 'object' ? patch as Record<string, unknown> : {};
    const data: Record<string, unknown> = {};
    if (hasOwn(input, 'supportEmail')) data.supportEmail = this.normalizeEmail(input.supportEmail);
    if (hasOwn(input, 'replyToEmail')) data.replyToEmail = this.normalizeEmail(input.replyToEmail);
    if (hasOwn(input, 'supportWhatsapp')) data.supportWhatsapp = this.normalizeText(input.supportWhatsapp, 40);
    if (hasOwn(input, 'communicationSettingsJson')) {
      data.communicationSettingsJson = this.normalizeSettingsJson(input.communicationSettingsJson);
    }

    if (!Object.keys(data).length) {
      return this.buildSettingsPayload(context, company);
    }

    const updated = await (this.prisma.company as any).update({
      where: { id: company.id },
      data,
      select: {
        id: true,
        companyKind: true,
        supportEmail: true,
        replyToEmail: true,
        supportWhatsapp: true,
        communicationSettingsJson: true,
      },
    });

    return this.buildSettingsPayload(context, updated as TenantCommunicationCompany);
  }
}
