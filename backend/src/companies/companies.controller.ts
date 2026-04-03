import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Admin } from '../auth/admin.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UsersService } from '../users/users.service';
import { FeatureGuard } from '../plans/feature.guard';
import { Feature } from '../plans/feature.decorator';
import { WhatsAppStatusService } from '../messaging/whatsapp-status.service';
import { MasterGuard } from '../auth/guards/master.guard';
import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { MercadoPagoClientService } from '../payments/mercado-pago-client.service';
import { MasterContextService } from '../master-context/master-context.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  getMasterGlobalIntegrationConfig,
  pickMasterMercadoPagoCredential,
  pickMasterWhatsAppCredential,
} from '../modules/master-global-integrations.util';
import {
  CompaniesService,
  MASTER_HARD_DELETE_CONFIRMATION_INVALID_MESSAGE,
  MASTER_HARD_DELETE_DISABLED_MESSAGE,
} from './companies.service';

class MasterCreateCompanyDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;
}

class MasterUpdateCompanyWhatsAppDto {
  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  @IsOptional()
  @IsString()
  whatsappPhoneNumberId?: string;

  @IsOptional()
  @IsString()
  whatsappWabaId?: string;

  @IsOptional()
  @IsString()
  whatsappAccessToken?: string;
}

class MasterCompanyWhatsAppEndpointDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  moduleKey?: string;

  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  @IsOptional()
  @IsString()
  whatsappPhoneNumberId?: string;

  @IsOptional()
  @IsString()
  whatsappWabaId?: string;

  @IsOptional()
  @IsString()
  whatsappAccessToken?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isPrimary?: boolean;
}

class ReplaceMasterCompanyWhatsAppEndpointsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MasterCompanyWhatsAppEndpointDto)
  endpoints!: MasterCompanyWhatsAppEndpointDto[];
}

class MasterUpdateCompanyMercadoPagoDto {
  @IsOptional()
  @IsString()
  mercadoPagoAccessToken?: string;
}

class MasterArchiveCompanyDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

class UpdateMyWhatsAppCenterDto {
  @IsString()
  @IsNotEmpty()
  mode!: string;
}

class RegisterWhatsAppMigrationInterestDto {
  @IsOptional()
  @IsString()
  source?: string;
}

class UpdateMasterWhatsAppMigrationWorkflowDto {
  @IsString()
  @IsNotEmpty()
  status!: string;

  @IsOptional()
  @IsString()
  internalNote?: string;

  @IsOptional()
  @IsString()
  lastContactAt?: string;
}

class MasterHardDeleteCompanyDto {
  @IsOptional()
  @IsString()
  confirmText?: string;
}

type OperationalTone = 'green' | 'yellow' | 'red';

type OperationalStatusChip = {
  key: 'token' | 'meta' | 'webwhats' | 'payment' | 'access';
  label: string;
  shortLabel: string;
  tone: OperationalTone;
  value: string;
  detail: string;
  href: string;
  quality: 'real' | 'partial';
  source: string[];
  updatedAt: string | null;
};

@Controller('companies')
export class CompaniesController {
  constructor(
    private readonly companiesService: CompaniesService,
    private readonly usersService: UsersService,
    private readonly whatsappStatus: WhatsAppStatusService,
    private readonly mercadoPagoClient: MercadoPagoClientService,
    private readonly masterContextService: MasterContextService,
    private readonly prisma: PrismaService,
  ) {}

  // NOTE: We intentionally do not provide a public company lookup endpoint.
  // Public company discovery enables tenant enumeration (competitor inference).

  private async buildWhatsAppPayloadForMaster(companyId: number, opts?: { refresh?: boolean }) {
    const company: any = await this.companiesService.findByIdForMaster(companyId);
    const status = await this.whatsappStatus.getStatusForCompany(companyId, { refresh: Boolean(opts?.refresh) });

    return {
      companyId,
      whatsappNumber: company?.whatsappNumber || null,
      whatsappPhoneNumberId: company?.whatsappPhoneNumberId || null,
      whatsappWabaId: company?.whatsappWabaId || null,
      accessTokenConfigured: Boolean(company?.whatsappAccessToken),
      accessTokenPreview: company?.whatsappAccessToken || null,
      status: status.status,
      connected: Boolean(status.connected),
      displayNumber: status.displayNumber || null,
      statusError: company?.whatsappStatusError || null,
      lastValidatedAt: company?.whatsappStatusUpdatedAt || null,
    };
  }

  private async buildMercadoPagoPayloadForMaster(companyId: number) {
    const company: any = await this.companiesService.findByIdForMaster(companyId);
    return {
      companyId,
      accessTokenConfigured: Boolean(company?.mercadoPagoAccessToken),
      accessTokenPreview: company?.mercadoPagoAccessToken ? `***${String(company.mercadoPagoAccessToken).slice(-6)}` : null,
      status: String(company?.mercadoPagoStatus || 'DISCONNECTED'),
      statusError: company?.mercadoPagoStatusError || null,
      accountEmail: company?.mercadoPagoAccountEmail || null,
      accountUserId: company?.mercadoPagoUserId || null,
      lastValidatedAt: company?.mercadoPagoStatusUpdatedAt || null,
    };
  }

  private mapTrialRemainingDays(trialEndsAt?: Date | string | null) {
    if (!trialEndsAt) return null;
    const parsed = trialEndsAt instanceof Date ? trialEndsAt : new Date(String(trialEndsAt));
    if (Number.isNaN(parsed.getTime())) return null;
    return Math.ceil((parsed.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  }

  private buildOperationalChip(
    input: OperationalStatusChip,
  ): OperationalStatusChip {
    return input;
  }

  private async resolveOperationalContext(req: any) {
    const runtimeContext = await this.masterContextService.resolveRuntimeContext(req.user);
    const effectiveCompanyId = runtimeContext.effectiveCompanyId || Number(req.user?.companyId || 0) || null;

    if (!effectiveCompanyId) {
      return {
        effectiveCompanyId: null,
        company: null,
        masterContext: runtimeContext.masterContext,
      };
    }

    const company = await this.companiesService.findByIdForMaster(effectiveCompanyId);
    return {
      effectiveCompanyId,
      company,
      masterContext: runtimeContext.masterContext,
    };
  }

  private async resolveOperationalCompanyIdOrThrow(req: any) {
    const context = await this.resolveOperationalContext(req);
    const companyId = Number(context.effectiveCompanyId || 0);
    if (!companyId) {
      throw new BadRequestException('Nenhuma empresa operacional selecionada para este contexto.');
    }
    return companyId;
  }

  private async buildOperationalStatusPayload(req: any, opts?: { refresh?: boolean }) {
    const context = await this.resolveOperationalContext(req);
    if (!context.effectiveCompanyId || !context.company) {
      return {
        generatedAt: new Date().toISOString(),
        context: {
          available: false,
          companyId: null,
          companyName: null,
          mode:
            req?.user?.isSystemMaster && !context.masterContext?.active
              ? 'master_puro'
              : 'sem_empresa',
          masterContext: context.masterContext,
        },
        statuses: [] as OperationalStatusChip[],
      };
    }

    const companyId = Number(context.effectiveCompanyId);
    const company: any = context.company;
    const refresh = Boolean(opts?.refresh);
    if (refresh) {
      await this.whatsappStatus.getStatusForCompany(companyId, { refresh: true });
    }

    const freshCompany: any = await this.companiesService.findByIdForMaster(companyId);
    const masterConfig =
      freshCompany?.useMasterMercadoPagoToken || freshCompany?.useMasterWhatsAppToken
        ? await getMasterGlobalIntegrationConfig(this.prisma)
        : null;
    const selectedWhatsAppCredential = freshCompany?.useMasterWhatsAppToken
      ? pickMasterWhatsAppCredential(masterConfig, freshCompany?.masterWhatsAppCredentialKey)
      : null;
    const selectedMercadoPagoCredential = freshCompany?.useMasterMercadoPagoToken
      ? pickMasterMercadoPagoCredential(masterConfig, freshCompany?.masterMercadoPagoCredentialKey)
      : null;
    const whatsappCenter = await this.companiesService.getWhatsAppCenterForCompany(companyId, {
      refreshTemporary: refresh,
    });

    const officialConfigured = Boolean(whatsappCenter?.center?.official?.configured);
    const officialConnected = Boolean(whatsappCenter?.center?.official?.connected);
    const officialStatus = String(whatsappCenter?.center?.official?.status || '').trim().toUpperCase();
    const temporaryAvailable = Boolean(whatsappCenter?.center?.temporary?.available);
    const temporaryLiveStatus = String(whatsappCenter?.center?.temporary?.liveStatus || '').trim().toLowerCase();
    const temporaryStatus = String(whatsappCenter?.center?.temporary?.status || '').trim().toUpperCase();

    const tokenChip = officialConnected
      ? this.buildOperationalChip({
          key: 'token',
          label: 'Token ativo',
          shortLabel: 'Token',
          tone: 'green',
          value: 'Ativo',
          detail: 'Token oficial validado com phone number pronto para operar na Meta.',
          href: '/dashboard/whatsapp?focus=official',
          quality: 'real',
          source: freshCompany?.useMasterWhatsAppToken
            ? ['master.whatsappCredential', 'company.whatsappStatus']
            : ['company.whatsappAccessToken', 'company.whatsappPhoneNumberId', 'company.whatsappStatus'],
          updatedAt:
            freshCompany?.whatsappStatusUpdatedAt instanceof Date
              ? freshCompany.whatsappStatusUpdatedAt.toISOString()
              : null,
        })
      : officialConfigured
        ? this.buildOperationalChip({
            key: 'token',
            label: 'Token ativo',
            shortLabel: 'Token',
            tone: officialStatus === 'ERROR' ? 'red' : 'yellow',
            value: officialStatus === 'ERROR' ? 'Falha' : 'Pendente',
            detail:
              officialStatus === 'ERROR'
                ? String(freshCompany?.whatsappStatusError || 'Falha ao validar o token oficial da Meta.')
                : 'Credencial oficial configurada, mas ainda sem operação confirmada na Meta.',
            href: '/dashboard/whatsapp?focus=official',
            quality: officialStatus === 'ERROR' ? 'real' : 'partial',
            source: freshCompany?.useMasterWhatsAppToken
              ? ['master.whatsappCredential', 'company.whatsappStatus']
              : ['company.whatsappAccessToken', 'company.whatsappPhoneNumberId', 'company.whatsappStatus'],
            updatedAt:
              freshCompany?.whatsappStatusUpdatedAt instanceof Date
                ? freshCompany.whatsappStatusUpdatedAt.toISOString()
                : null,
          })
        : this.buildOperationalChip({
            key: 'token',
            label: 'Token ativo',
            shortLabel: 'Token',
            tone: 'red',
            value: 'Ausente',
            detail: 'Falta token oficial e/ou phone number ID para operar pela Meta.',
            href: '/dashboard/whatsapp?focus=official',
            quality: 'real',
            source: freshCompany?.useMasterWhatsAppToken
              ? ['master.whatsappCredential']
              : ['company.whatsappAccessToken', 'company.whatsappPhoneNumberId'],
            updatedAt: null,
          });

    const metaChip = officialConnected
      ? this.buildOperationalChip({
          key: 'meta',
          label: 'Meta ativo',
          shortLabel: 'Meta',
          tone: 'green',
          value: 'Online',
          detail: 'Integração oficial da Meta conectada e pronta para operação.',
          href: '/dashboard/whatsapp?focus=official',
          quality: 'real',
          source: ['company.whatsappStatus', 'company.whatsappDisplayNumber'],
          updatedAt:
            freshCompany?.whatsappStatusUpdatedAt instanceof Date
              ? freshCompany.whatsappStatusUpdatedAt.toISOString()
              : null,
        })
      : officialConfigured
        ? this.buildOperationalChip({
            key: 'meta',
            label: 'Meta ativo',
            shortLabel: 'Meta',
            tone: officialStatus === 'ERROR' ? 'red' : 'yellow',
            value: officialStatus === 'ERROR' ? 'Falha' : 'Pendente',
            detail:
              officialStatus === 'ERROR'
                ? String(freshCompany?.whatsappStatusError || 'Integração oficial com falha.')
                : 'Integração oficial configurada, mas ainda sem conexão operacional completa.',
            href: '/dashboard/whatsapp?focus=official',
            quality: officialStatus === 'ERROR' ? 'real' : 'partial',
            source: ['company.whatsappStatus', 'company.whatsappStatusError'],
            updatedAt:
              freshCompany?.whatsappStatusUpdatedAt instanceof Date
                ? freshCompany.whatsappStatusUpdatedAt.toISOString()
                : null,
          })
        : this.buildOperationalChip({
            key: 'meta',
            label: 'Meta ativo',
            shortLabel: 'Meta',
            tone: 'red',
            value: 'Off',
            detail: 'A trilha oficial da Meta ainda não foi configurada.',
            href: '/dashboard/whatsapp?focus=official',
            quality: 'real',
            source: ['company.whatsappAccessToken', 'company.whatsappPhoneNumberId'],
            updatedAt: null,
          });

    const webWhatsChip =
      temporaryAvailable && temporaryLiveStatus === 'connected'
        ? this.buildOperationalChip({
            key: 'webwhats',
            label: 'WebWhats ativo',
            shortLabel: 'WebWhats',
            tone: 'green',
            value: 'Conect.',
            detail: 'Conexão temporária ativa e operando via WebWhats.',
            href: '/dashboard/whatsapp?focus=temporary',
            quality: 'real',
            source: ['company.whatsappTemporaryStatus', 'company.whatsappTemporaryConnectedAt'],
            updatedAt:
              freshCompany?.whatsappTemporaryLastSyncAt instanceof Date
                ? freshCompany.whatsappTemporaryLastSyncAt.toISOString()
                : null,
          })
        : temporaryAvailable && (temporaryLiveStatus === 'qr_ready' || temporaryStatus === 'ATTENTION')
          ? this.buildOperationalChip({
              key: 'webwhats',
              label: 'WebWhats ativo',
              shortLabel: 'WebWhats',
              tone: 'yellow',
              value: temporaryLiveStatus === 'qr_ready' ? 'QR' : 'Atenção',
              detail:
                temporaryLiveStatus === 'qr_ready'
                  ? 'QR disponível para concluir a conexão temporária.'
                  : String(whatsappCenter?.center?.temporary?.errorMessage || 'Conexão temporária precisa de atenção.'),
              href: '/dashboard/whatsapp?focus=temporary',
              quality: 'real',
              source: ['company.whatsappTemporaryStatus', 'company.whatsappTemporaryPairingCode'],
              updatedAt:
                freshCompany?.whatsappTemporaryLastSyncAt instanceof Date
                  ? freshCompany.whatsappTemporaryLastSyncAt.toISOString()
                  : null,
            })
          : temporaryAvailable
            ? this.buildOperationalChip({
                key: 'webwhats',
                label: 'WebWhats ativo',
                shortLabel: 'WebWhats',
                tone: 'red',
                value: 'Off',
                detail: 'A trilha temporária está disponível, mas ainda não foi conectada.',
                href: '/dashboard/whatsapp?focus=temporary',
                quality: 'real',
                source: ['company.whatsappTemporaryStatus'],
                updatedAt:
                  freshCompany?.whatsappTemporaryLastSyncAt instanceof Date
                    ? freshCompany.whatsappTemporaryLastSyncAt.toISOString()
                    : null,
              })
            : this.buildOperationalChip({
                key: 'webwhats',
                label: 'WebWhats ativo',
                shortLabel: 'WebWhats',
                tone: 'red',
                value: 'Indisp.',
                detail: 'O motor temporário/WebWhats não está configurado neste ambiente.',
                href: '/dashboard/whatsapp?focus=temporary',
                quality: 'real',
                source: ['env.WHATSAPP_TEMPORARY_API_URL', 'env.WHATSAPP_TEMPORARY_API_KEY'],
                updatedAt: null,
              });

    const effectiveMercadoPagoToken = freshCompany?.useMasterMercadoPagoToken
      ? String(selectedMercadoPagoCredential?.accessToken || '').trim()
      : String(freshCompany?.mercadoPagoAccessToken || '').trim();
    let paymentHref = '/dashboard/financeiro?focus=preferences';
    let paymentTone: OperationalTone = 'red';
    let paymentValue = 'Ausente';
    let paymentDetail = freshCompany?.useMasterMercadoPagoToken
      ? 'Nenhuma credencial MASTER de pagamento foi selecionada para a empresa.'
      : 'Token do Mercado Pago não configurado para esta empresa.';
    let paymentQuality: 'real' | 'partial' = 'real';
    let paymentUpdatedAt =
      freshCompany?.mercadoPagoStatusUpdatedAt instanceof Date
        ? freshCompany.mercadoPagoStatusUpdatedAt.toISOString()
        : null;

    if (effectiveMercadoPagoToken) {
      if (refresh) {
        try {
          const paymentProfile = await this.mercadoPagoClient.validateAccessToken(effectiveMercadoPagoToken);
          paymentTone = 'green';
          paymentValue = 'Ativo';
          paymentHref = '/dashboard/financeiro?focus=payment';
          paymentDetail = freshCompany?.useMasterMercadoPagoToken
            ? `Credencial MASTER validada${paymentProfile?.email ? ` para ${String(paymentProfile.email)}` : ''}.`
            : `Motor de pagamento validado${paymentProfile?.email ? ` para ${String(paymentProfile.email)}` : ''}.`;
          paymentQuality = 'real';
          paymentUpdatedAt = new Date().toISOString();
        } catch (error: any) {
          paymentTone = 'red';
          paymentValue = 'Falha';
          paymentDetail = String(error?.message || 'Falha ao validar o token de pagamento.');
          paymentQuality = 'real';
          paymentUpdatedAt = new Date().toISOString();
        }
      } else {
        const mercadoPagoStatus = String(freshCompany?.mercadoPagoStatus || '').trim().toUpperCase();
        if (mercadoPagoStatus === 'CONNECTED') {
          paymentTone = 'green';
          paymentValue = 'Ativo';
          paymentHref = '/dashboard/financeiro?focus=payment';
          paymentDetail = 'Última validação do motor de pagamento está saudável.';
          paymentQuality = 'real';
        } else if (mercadoPagoStatus === 'ERROR') {
          paymentTone = 'red';
          paymentValue = 'Falha';
          paymentHref = '/dashboard/financeiro?focus=preferences';
          paymentDetail = String(freshCompany?.mercadoPagoStatusError || 'Falha no motor de pagamento.');
          paymentQuality = 'real';
        } else {
          paymentTone = 'yellow';
          paymentValue = freshCompany?.useMasterMercadoPagoToken ? 'Master' : 'Pendente';
          paymentHref = '/dashboard/financeiro?focus=preferences';
          paymentDetail = freshCompany?.useMasterMercadoPagoToken
            ? 'Credencial MASTER configurada. Validação operacional ao vivo ainda pendente.'
            : 'Token configurado, mas sem validação operacional recente.';
          paymentQuality = 'partial';
        }
      }
    }

    const paymentChip = this.buildOperationalChip({
      key: 'payment',
      label: 'Pagamento ativo',
      shortLabel: 'Pagamento',
      tone: paymentTone,
      value: paymentValue,
      detail: paymentDetail,
      href: paymentHref,
      quality: paymentQuality,
      source: freshCompany?.useMasterMercadoPagoToken
        ? ['master.mercadoPagoCredential', 'mercadopago.validateAccessToken']
        : ['company.mercadoPagoAccessToken', 'company.mercadoPagoStatus'],
      updatedAt: paymentUpdatedAt,
    });

    const paymentStatus = String(freshCompany?.paymentStatus || '').trim().toUpperCase();
    const subscriptionStatus = String(freshCompany?.subscriptionStatus || '').trim().toLowerCase();
    const trialRemainingDays = this.mapTrialRemainingDays(freshCompany?.trialEndsAt);
    let accessTone: OperationalTone = 'red';
    let accessValue = 'Bloq.';
    let accessDetail = 'A empresa está sem acesso operacional liberado.';
    let accessHref = '/dashboard/financeiro?focus=payment';
    if (Boolean(freshCompany?.isActive) && (paymentStatus === 'PAID' || subscriptionStatus === 'active')) {
      accessTone = 'green';
      accessValue = 'Pago';
      accessDetail = 'Acesso pago ativo e liberado para operação.';
      accessHref = '/dashboard/financeiro?focus=access';
    } else if (
      Boolean(freshCompany?.isActive)
      && (paymentStatus === 'TRIAL' || subscriptionStatus === 'trialing')
      && (trialRemainingDays === null || trialRemainingDays >= 0)
    ) {
      accessTone = 'yellow';
      accessValue = trialRemainingDays === null ? 'Trial' : `Trial ${trialRemainingDays}d`;
      accessDetail =
        trialRemainingDays === null
          ? 'Free trial ativo.'
          : trialRemainingDays <= 3
            ? `Free trial ativo com ${trialRemainingDays} dia(s) restante(s).`
            : `Free trial ativo com ${trialRemainingDays} dia(s) restante(s).`;
      accessHref = '/dashboard/financeiro?focus=access';
    } else if (paymentStatus === 'OVERDUE' || paymentStatus === 'PENDING' || subscriptionStatus === 'past_due') {
      accessTone = 'red';
      accessValue = 'Atraso';
      accessDetail = 'A cobrança está pendente ou em atraso, então o acesso comercial está bloqueado.';
    } else if (paymentStatus === 'EXPIRED' || paymentStatus === 'DISABLED' || subscriptionStatus === 'expired' || subscriptionStatus === 'canceled') {
      accessTone = 'red';
      accessValue = 'Sem acesso';
      accessDetail = 'O trial expirou ou a empresa foi desativada.';
    }

    const accessChip = this.buildOperationalChip({
      key: 'access',
      label: 'Trial/Acesso',
      shortLabel: 'Acesso',
      tone: accessTone,
      value: accessValue,
      detail: accessDetail,
      href: accessHref,
      quality: 'real',
      source: ['company.isActive', 'company.paymentStatus', 'company.subscriptionStatus', 'company.trialEndsAt'],
      updatedAt:
        freshCompany?.trialEndsAt instanceof Date
          ? freshCompany.trialEndsAt.toISOString()
          : null,
    });

    return {
      generatedAt: new Date().toISOString(),
      context: {
        available: true,
        companyId,
        companyName: String(freshCompany?.name || '').trim() || null,
        mode: context.masterContext?.active ? 'master_assumido' : 'empresa',
        masterContext: context.masterContext,
      },
      statuses: [tokenChip, metaChip, webWhatsChip, paymentChip, accessChip],
    };
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Req() req: any, @Body() dto: CreateCompanyDto) {
    const company = await this.companiesService.create(dto);
    // associate authenticated user with this company
    if (req.user && req.user.id) {
      await this.usersService.updateCompany(req.user.id, company.id);
    }
    return company;
  }

  @Post('master')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async createByMaster(@Req() req: any, @Body() dto: MasterCreateCompanyDto) {
    const created = await this.companiesService.createByMaster(dto);
    await this.masterContextService.registerSupportAction({
      masterUserId: Number(req.user?.id),
      companyId: Number(created?.id || 0) || null,
      scope: 'master_company',
      action: 'COMPANY_CREATED',
      metadata: {
        name: created?.name || null,
        slug: created?.slug || null,
      },
    });
    return created;
  }

  @Delete('master/:id')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async removeByMaster(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: MasterHardDeleteCompanyDto) {
    try {
      const payload = await this.companiesService.removeByMaster(Number(req.user?.id), id, dto || {});
      await this.masterContextService.registerSupportAction({
        masterUserId: Number(req.user?.id),
        companyId: Number(id),
        scope: 'master_company',
        action: 'COMPANY_DELETED',
        severity: 'WARN',
        metadata: {
          deletedCompany: payload?.deletedCompany || null,
        },
      });
      return payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === MASTER_HARD_DELETE_DISABLED_MESSAGE || message === MASTER_HARD_DELETE_CONFIRMATION_INVALID_MESSAGE) {
        await this.masterContextService.registerSupportAction({
          masterUserId: Number(req.user?.id),
          companyId: Number(id),
          scope: 'master_company',
          action: 'COMPANY_HARD_DELETE_BLOCKED',
          severity: 'WARN',
          metadata: {
            reason: message,
            confirmTextProvided: dto?.confirmText || null,
          },
        });
      }
      throw error;
    }
  }

  @Post('master/:id/archive')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async archiveByMaster(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MasterArchiveCompanyDto,
  ) {
    const payload = await this.companiesService.archiveByMaster(Number(req.user?.id), id, dto || {});
    await this.masterContextService.registerSupportAction({
      masterUserId: Number(req.user?.id),
      companyId: Number(id),
      scope: 'master_company',
      action: 'COMPANY_ARCHIVED',
      severity: 'WARN',
      metadata: {
        archivedCompany: payload?.archivedCompany || null,
        archive: payload?.archive || null,
      },
    });
    return payload;
  }

  @Get('master/:id/whatsapp')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async getWhatsAppForMaster(
    @Param('id', ParseIntPipe) id: number,
    @Query('refresh') refresh?: string,
  ) {
    const shouldRefresh = String(refresh || '').trim().toLowerCase() === 'true';
    return this.buildWhatsAppPayloadForMaster(id, { refresh: shouldRefresh });
  }

  @Patch('master/:id/whatsapp')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async updateWhatsAppForMaster(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MasterUpdateCompanyWhatsAppDto,
  ) {
    await this.companiesService.updateWhatsAppByMaster(id, dto);
    return this.buildWhatsAppPayloadForMaster(id, { refresh: false });
  }

  @Post('master/:id/whatsapp/validate')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async validateWhatsAppForMaster(@Param('id', ParseIntPipe) id: number) {
    await this.whatsappStatus.getStatusForCompany(id, { refresh: true });
    return this.buildWhatsAppPayloadForMaster(id, { refresh: false });
  }

  @Get('master/:id/whatsapp-endpoints')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async listWhatsAppEndpointsForMaster(@Param('id', ParseIntPipe) id: number) {
    const endpoints = await this.companiesService.listWhatsAppEndpointsByMaster(id);
    return { companyId: id, endpoints };
  }

  @Put('master/:id/whatsapp-endpoints')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async replaceWhatsAppEndpointsForMaster(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplaceMasterCompanyWhatsAppEndpointsDto,
  ) {
    const company = await this.companiesService.replaceWhatsAppEndpointsByMaster(
      id,
      dto?.endpoints || [],
    );
    return { companyId: id, endpoints: (company as any)?.whatsappEndpoints || [] };
  }

  @Post('master/:companyId/whatsapp-endpoints/:endpointId/validate')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async validateWhatsAppEndpointForMaster(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('endpointId') endpointId: string,
  ) {
    await this.whatsappStatus.getStatusForCompanyEndpoint(endpointId, { refresh: true });
    const endpoints = await this.companiesService.listWhatsAppEndpointsByMaster(companyId);
    return { companyId, endpoints };
  }

  @Patch('master/:id/whatsapp-migration-workflow')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async updateWhatsAppMigrationWorkflowForMaster(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMasterWhatsAppMigrationWorkflowDto,
  ) {
    await this.companiesService.updateWhatsAppMigrationWorkflowByMaster(Number(req.user?.id), id, dto || {});
    await this.masterContextService.registerSupportAction({
      masterUserId: Number(req.user?.id),
      companyId: Number(id),
      scope: 'master_whatsapp_center',
      action: 'WHATSAPP_MIGRATION_WORKFLOW_UPDATED',
      metadata: {
        status: String(dto?.status || '').trim().toUpperCase() || null,
        internalNote: dto?.internalNote ? String(dto.internalNote).slice(0, 240) : null,
        lastContactAt: dto?.lastContactAt || null,
      },
    });
    return this.companiesService.findByIdForMaster(id);
  }

  @Get('master/:id/mercadopago')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async getMercadoPagoForMaster(@Param('id', ParseIntPipe) id: number) {
    return this.buildMercadoPagoPayloadForMaster(id);
  }

  @Patch('master/:id/mercadopago')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async updateMercadoPagoForMaster(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MasterUpdateCompanyMercadoPagoDto,
  ) {
    await this.companiesService.updateMercadoPagoByMaster(id, {
      mercadoPagoAccessToken:
        dto?.mercadoPagoAccessToken !== undefined ? String(dto.mercadoPagoAccessToken || '').trim() : undefined,
      mercadoPagoStatus: 'DISCONNECTED',
      mercadoPagoStatusError: null,
      mercadoPagoAccountEmail: null,
      mercadoPagoUserId: null,
    });
    return this.buildMercadoPagoPayloadForMaster(id);
  }

  @Post('master/:id/mercadopago/validate')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async validateMercadoPagoForMaster(@Param('id', ParseIntPipe) id: number) {
    const company: any = await this.companiesService.findByIdForMaster(id);
    const accessToken = String(company?.mercadoPagoAccessToken || '').trim();
    if (!accessToken) {
      await this.companiesService.updateMercadoPagoByMaster(id, {
        mercadoPagoStatus: 'DISCONNECTED',
        mercadoPagoStatusError: 'Token Mercado Pago nao configurado.',
      });
      return this.buildMercadoPagoPayloadForMaster(id);
    }

    try {
      const profile = await this.mercadoPagoClient.validateAccessToken(accessToken);
      await this.companiesService.updateMercadoPagoByMaster(id, {
        mercadoPagoStatus: 'CONNECTED',
        mercadoPagoStatusError: null,
        mercadoPagoAccountEmail: profile?.email ? String(profile.email) : null,
        mercadoPagoUserId:
          profile?.id !== undefined && profile?.id !== null ? String(profile.id) : null,
      });
    } catch (error: any) {
      await this.companiesService.updateMercadoPagoByMaster(id, {
        mercadoPagoStatus: 'ERROR',
        mercadoPagoStatusError: String(error?.message || 'Falha ao validar token Mercado Pago'),
      });
    }

    return this.buildMercadoPagoPayloadForMaster(id);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@Req() req: any) {
    return this.companiesService.findAllForCompany(req.user?.companyId);
  }

  @Get('me/whatsapp-status')
  @UseGuards(JwtAuthGuard)
  async getMyWhatsAppStatus(@Req() req: any, @Query('refresh') refresh?: string) {
    const companyId = await this.resolveOperationalCompanyIdOrThrow(req);
    const doRefresh = String(refresh || '').toLowerCase() === 'true';
    const st = await this.whatsappStatus.getStatusForCompany(companyId, { refresh: doRefresh });
    return {
      connected: Boolean(st.connected),
      displayNumber: st.displayNumber,
      status: st.status,
    };
  }

  @Get('me/whatsapp-center')
  @UseGuards(JwtAuthGuard)
  async getMyWhatsAppCenter(@Req() req: any, @Query('refresh') refresh?: string) {
    const refreshTemporary = String(refresh || '').trim().toLowerCase() === 'true';
    const companyId = await this.resolveOperationalCompanyIdOrThrow(req);
    return this.companiesService.getWhatsAppCenterForCompany(companyId, {
      refreshTemporary,
    });
  }

  @Get('me/operational-status')
  @UseGuards(JwtAuthGuard)
  async getMyOperationalStatus(@Req() req: any, @Query('refresh') refresh?: string) {
    const doRefresh = String(refresh || '').trim().toLowerCase() === 'true';
    return this.buildOperationalStatusPayload(req, { refresh: doRefresh });
  }

  @Patch('me/whatsapp-center')
  @UseGuards(JwtAuthGuard)
  async updateMyWhatsAppCenter(@Req() req: any, @Body() dto: UpdateMyWhatsAppCenterDto) {
    const companyId = await this.resolveOperationalCompanyIdOrThrow(req);
    return this.companiesService.updateWhatsAppCenterForCompany(companyId, dto || {});
  }

  @Post('me/whatsapp-center/temporary/connect')
  @UseGuards(JwtAuthGuard)
  async startMyWhatsAppTemporaryConnection(@Req() req: any) {
    const companyId = await this.resolveOperationalCompanyIdOrThrow(req);
    return this.companiesService.startWhatsAppTemporaryConnection(companyId);
  }

  @Post('me/whatsapp-center/temporary/disconnect')
  @UseGuards(JwtAuthGuard)
  async disconnectMyWhatsAppTemporaryConnection(@Req() req: any) {
    const companyId = await this.resolveOperationalCompanyIdOrThrow(req);
    return this.companiesService.disconnectWhatsAppTemporaryConnection(companyId);
  }

  @Post('me/whatsapp-center/migration-interest')
  @UseGuards(JwtAuthGuard)
  async registerMyWhatsAppMigrationInterest(
    @Req() req: any,
    @Body() dto: RegisterWhatsAppMigrationInterestDto,
  ) {
    const companyId = await this.resolveOperationalCompanyIdOrThrow(req);
    return this.companiesService.registerWhatsAppMigrationInterest(companyId, dto || {});
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.companiesService.findOneForCompany(req.user?.companyId, id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, FeatureGuard, RolesGuard)
  @Feature('company_update')
  @Admin()
  update(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCompanyDto) {
    return this.companiesService.updateForCompany(req.user?.companyId, id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, FeatureGuard, RolesGuard)
  @Feature('company_delete')
  @Admin()
  remove(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.companiesService.removeForCompany(req.user?.companyId, id);
  }
}
