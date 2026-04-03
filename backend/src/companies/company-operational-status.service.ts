import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppStatusService } from '../messaging/whatsapp-status.service';
import { MercadoPagoClientService } from '../payments/mercado-pago-client.service';
import { buildWhatsAppCenterSnapshot, type WhatsAppCenterSnapshot } from './whatsapp-center.util';
import { CompaniesService } from './companies.service';
import { WhatsAppTemporaryConnectionService } from './whatsapp-temporary-connection.service';
import {
  getMasterGlobalIntegrationConfig,
  pickMasterMercadoPagoCredential,
  pickMasterWhatsAppCredential,
} from '../modules/master-global-integrations.util';

export type OperationalTone = 'green' | 'yellow' | 'red';

export type OperationalStatusChip = {
  key: 'token' | 'meta' | 'webwhats' | 'payment' | 'access';
  label: string;
  shortLabel: string;
  tone: OperationalTone;
  value: string;
  detail: string;
  hint: string;
  href: string;
  quality: 'real' | 'partial';
  source: string[];
  updatedAt: string | null;
  active: boolean;
};

export type CompanyOperationalStatus = {
  companyId: number;
  companyName: string | null;
  statuses: OperationalStatusChip[];
  tokenActive: boolean;
  metaActive: boolean;
  webWhatsActive: boolean;
  paymentActive: boolean;
  accessActive: boolean;
  accessReason: string | null;
  accessSource: 'paid' | 'trial' | 'manual' | 'blocked';
  overallHealth: OperationalTone;
  overallHint: string;
  overallLabel: string;
  lastCheckedAt: string | null;
};

type PaymentValidationResult = {
  ok: boolean;
  email: string | null;
  error: string | null;
  checkedAt: string;
};

type MasterConfig = Awaited<ReturnType<typeof getMasterGlobalIntegrationConfig>>;

@Injectable()
export class CompanyOperationalStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companiesService: CompaniesService,
    private readonly whatsappStatus: WhatsAppStatusService,
    private readonly mercadoPagoClient: MercadoPagoClientService,
    private readonly whatsappTemporaryConnection: WhatsAppTemporaryConnectionService,
  ) {}

  private mapTrialRemainingDays(trialEndsAt?: Date | string | null) {
    if (!trialEndsAt) return null;
    const parsed = trialEndsAt instanceof Date ? trialEndsAt : new Date(String(trialEndsAt));
    if (Number.isNaN(parsed.getTime())) return null;
    return Math.ceil((parsed.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  }

  private normalizeDate(value?: Date | string | null) {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
  }

  private buildOperationalChip(input: OperationalStatusChip): OperationalStatusChip {
    return input;
  }

  private latestCheckedAt(values: Array<string | null | undefined>) {
    const sorted = values
      .map((value) => this.normalizeDate(value || null))
      .filter(Boolean)
      .sort((left, right) => new Date(right as string).getTime() - new Date(left as string).getTime());
    return sorted[0] || null;
  }

  private async resolveMasterConfig(companies: any[]) {
    const needsMasterConfig = companies.some(
      (company) => Boolean(company?.useMasterMercadoPagoToken) || Boolean(company?.useMasterWhatsAppToken),
    );
    if (!needsMasterConfig) return null;
    return getMasterGlobalIntegrationConfig(this.prisma);
  }

  private buildWhatsAppCenter(company: any, masterConfig: MasterConfig | null): WhatsAppCenterSnapshot {
    const selectedCredential = Boolean(company?.useMasterWhatsAppToken)
      ? pickMasterWhatsAppCredential(masterConfig, company?.masterWhatsAppCredentialKey)
      : null;
    const effectiveConfig = Boolean(company?.useMasterWhatsAppToken)
      ? {
          accessToken: selectedCredential?.accessToken || null,
          phoneNumberId: selectedCredential?.phoneNumberId || null,
          wabaId: selectedCredential?.wabaId || null,
          whatsappNumber: selectedCredential?.whatsappNumber || null,
          displayNumber: selectedCredential?.displayNumber || selectedCredential?.whatsappNumber || null,
        }
      : {
          accessToken: company?.whatsappAccessToken || null,
          phoneNumberId: company?.whatsappPhoneNumberId || null,
          wabaId: company?.whatsappWabaId || null,
          whatsappNumber: company?.whatsappNumber || null,
          displayNumber: company?.whatsappDisplayNumber || company?.whatsappNumber || null,
        };

    return buildWhatsAppCenterSnapshot({
      company,
      credential: selectedCredential,
      effectiveConfig,
      includeInternal: false,
      temporaryAvailable: this.whatsappTemporaryConnection.getAvailability().configured,
    });
  }

  private effectiveMercadoPagoToken(company: any, masterConfig: MasterConfig | null) {
    if (!company?.useMasterMercadoPagoToken) {
      return String(company?.mercadoPagoAccessToken || '').trim();
    }
    const selectedCredential = pickMasterMercadoPagoCredential(masterConfig, company?.masterMercadoPagoCredentialKey);
    return String(selectedCredential?.accessToken || '').trim();
  }

  private async buildPaymentValidationCache(
    companies: any[],
    masterConfig: MasterConfig | null,
    validatePayments: boolean,
  ) {
    const cache = new Map<string, PaymentValidationResult | null>();
    if (!validatePayments) return cache;

    const effectiveTokens = Array.from(
      new Set(
        companies
          .map((company) => this.effectiveMercadoPagoToken(company, masterConfig))
          .map((token) => String(token || '').trim())
          .filter(Boolean),
      ),
    );

    await Promise.all(
      effectiveTokens.map(async (token) => {
        try {
          const profile = await this.mercadoPagoClient.validateAccessToken(token);
          cache.set(token, {
            ok: true,
            email: profile?.email ? String(profile.email) : null,
            error: null,
            checkedAt: new Date().toISOString(),
          });
        } catch (error: any) {
          cache.set(token, {
            ok: false,
            email: null,
            error: String(error?.message || 'Falha ao validar o token de pagamento.'),
            checkedAt: new Date().toISOString(),
          });
        }
      }),
    );

    return cache;
  }

  private buildOverallHealth(input: {
    tokenChip: OperationalStatusChip;
    metaChip: OperationalStatusChip;
    webWhatsChip: OperationalStatusChip;
    paymentChip: OperationalStatusChip;
    accessChip: OperationalStatusChip;
  }) {
    const whatsappHealthy = input.metaChip.active || input.webWhatsChip.active;
    const officialError =
      input.tokenChip.value === 'Falha' ||
      input.metaChip.value === 'Falha';
    const whatsappAttention = !whatsappHealthy;
    const paymentError = input.paymentChip.value === 'Falha';
    const paymentAttention = !input.paymentChip.active && !paymentError;

    if (input.accessChip.tone === 'red') {
      return {
        overallHealth: 'red' as const,
        overallLabel: 'Bloqueado',
        overallHint: input.accessChip.hint,
      };
    }

    if (officialError || paymentError) {
      return {
        overallHealth: 'red' as const,
        overallLabel: 'Erro',
        overallHint: paymentError
          ? input.paymentChip.hint
          : input.metaChip.hint || input.tokenChip.hint,
      };
    }

    if (
      input.accessChip.tone === 'yellow' ||
      paymentAttention ||
      whatsappAttention
    ) {
      return {
        overallHealth: 'yellow' as const,
        overallLabel: 'Atenção',
        overallHint:
          input.accessChip.tone === 'yellow'
            ? input.accessChip.hint
            : paymentAttention
              ? input.paymentChip.hint
              : input.webWhatsChip.hint || input.metaChip.hint || input.tokenChip.hint,
      };
    }

    return {
      overallHealth: 'green' as const,
      overallLabel: 'Operando',
      overallHint: 'Motores críticos e acesso estão saudáveis.',
    };
  }

  private buildStatusFromCompany(
    company: any,
    masterConfig: MasterConfig | null,
    paymentValidationCache: Map<string, PaymentValidationResult | null>,
  ): CompanyOperationalStatus {
    const whatsappCenter = this.buildWhatsAppCenter(company, masterConfig);
    const officialConfigured = Boolean(whatsappCenter?.official?.configured);
    const officialConnected = Boolean(whatsappCenter?.official?.connected);
    const officialStatus = String(whatsappCenter?.official?.status || '').trim().toUpperCase();
    const temporaryAvailable = Boolean(whatsappCenter?.temporary?.available);
    const temporaryLiveStatus = String(whatsappCenter?.temporary?.liveStatus || '').trim().toLowerCase();
    const temporaryStatus = String(whatsappCenter?.temporary?.status || '').trim().toUpperCase();

    const tokenChip = officialConnected
      ? this.buildOperationalChip({
          key: 'token',
          label: 'Token ativo',
          shortLabel: 'Token',
          tone: 'green',
          value: 'Ativo',
          detail: 'Token oficial validado com phone number pronto para operar na Meta.',
          hint: 'Token oficial validado.',
          href: '/dashboard/whatsapp?focus=official',
          quality: 'real',
          source: company?.useMasterWhatsAppToken
            ? ['master.whatsappCredential', 'company.whatsappStatus']
            : ['company.whatsappAccessToken', 'company.whatsappPhoneNumberId', 'company.whatsappStatus'],
          updatedAt: this.normalizeDate(company?.whatsappStatusUpdatedAt),
          active: true,
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
                ? String(company?.whatsappStatusError || 'Falha ao validar o token oficial da Meta.')
                : 'Credencial oficial configurada, mas ainda sem operação confirmada na Meta.',
            hint:
              officialStatus === 'ERROR'
                ? 'Token oficial com falha.'
                : 'Token oficial aguardando conexão.',
            href: '/dashboard/whatsapp?focus=official',
            quality: officialStatus === 'ERROR' ? 'real' : 'partial',
            source: company?.useMasterWhatsAppToken
              ? ['master.whatsappCredential', 'company.whatsappStatus']
              : ['company.whatsappAccessToken', 'company.whatsappPhoneNumberId', 'company.whatsappStatus'],
            updatedAt: this.normalizeDate(company?.whatsappStatusUpdatedAt),
            active: false,
          })
        : this.buildOperationalChip({
            key: 'token',
            label: 'Token ativo',
            shortLabel: 'Token',
            tone: 'red',
            value: 'Ausente',
            detail: 'Falta token oficial e/ou phone number ID para operar pela Meta.',
            hint: 'Falta token oficial.',
            href: '/dashboard/whatsapp?focus=official',
            quality: 'real',
            source: company?.useMasterWhatsAppToken
              ? ['master.whatsappCredential']
              : ['company.whatsappAccessToken', 'company.whatsappPhoneNumberId'],
            updatedAt: null,
            active: false,
          });

    const metaChip = officialConnected
      ? this.buildOperationalChip({
          key: 'meta',
          label: 'Meta ativo',
          shortLabel: 'Meta',
          tone: 'green',
          value: 'Online',
          detail: 'Integração oficial da Meta conectada e pronta para operação.',
          hint: 'Meta conectada.',
          href: '/dashboard/whatsapp?focus=official',
          quality: 'real',
          source: ['company.whatsappStatus', 'company.whatsappDisplayNumber'],
          updatedAt: this.normalizeDate(company?.whatsappStatusUpdatedAt),
          active: true,
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
                ? String(company?.whatsappStatusError || 'Integração oficial com falha.')
                : 'Integração oficial configurada, mas ainda sem conexão operacional completa.',
            hint:
              officialStatus === 'ERROR'
                ? 'Meta com falha.'
                : 'Meta aguardando conexão.',
            href: '/dashboard/whatsapp?focus=official',
            quality: officialStatus === 'ERROR' ? 'real' : 'partial',
            source: ['company.whatsappStatus', 'company.whatsappStatusError'],
            updatedAt: this.normalizeDate(company?.whatsappStatusUpdatedAt),
            active: false,
          })
        : this.buildOperationalChip({
            key: 'meta',
            label: 'Meta ativo',
            shortLabel: 'Meta',
            tone: 'red',
            value: 'Off',
            detail: 'A trilha oficial da Meta ainda não foi configurada.',
            hint: 'Meta não configurada.',
            href: '/dashboard/whatsapp?focus=official',
            quality: 'real',
            source: ['company.whatsappAccessToken', 'company.whatsappPhoneNumberId'],
            updatedAt: null,
            active: false,
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
            hint: 'WebWhats conectado.',
            href: '/dashboard/whatsapp?focus=temporary',
            quality: 'real',
            source: ['company.whatsappTemporaryStatus', 'company.whatsappTemporaryConnectedAt'],
            updatedAt: this.normalizeDate(company?.whatsappTemporaryLastSyncAt),
            active: true,
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
                  : String(whatsappCenter?.temporary?.errorMessage || 'Conexão temporária precisa de atenção.'),
              hint:
                temporaryLiveStatus === 'qr_ready'
                  ? 'QR aguardando leitura.'
                  : 'WebWhats em atenção.',
              href: '/dashboard/whatsapp?focus=temporary',
              quality: 'real',
              source: ['company.whatsappTemporaryStatus', 'company.whatsappTemporaryPairingCode'],
              updatedAt: this.normalizeDate(company?.whatsappTemporaryLastSyncAt),
              active: false,
            })
          : temporaryAvailable
            ? this.buildOperationalChip({
                key: 'webwhats',
                label: 'WebWhats ativo',
                shortLabel: 'WebWhats',
                tone: 'red',
                value: 'Off',
                detail: 'A trilha temporária está disponível, mas ainda não foi conectada.',
                hint: 'WebWhats não conectado.',
                href: '/dashboard/whatsapp?focus=temporary',
                quality: 'real',
                source: ['company.whatsappTemporaryStatus'],
                updatedAt: this.normalizeDate(company?.whatsappTemporaryLastSyncAt),
                active: false,
              })
            : this.buildOperationalChip({
                key: 'webwhats',
                label: 'WebWhats ativo',
                shortLabel: 'WebWhats',
                tone: 'red',
                value: 'Indisp.',
                detail: 'O motor temporário/WebWhats não está configurado neste ambiente.',
                hint: 'WebWhats indisponível.',
                href: '/dashboard/whatsapp?focus=temporary',
                quality: 'real',
                source: ['env.WHATSAPP_TEMPORARY_API_URL', 'env.WHATSAPP_TEMPORARY_API_KEY'],
                updatedAt: null,
                active: false,
              });

    const effectiveMercadoPagoToken = this.effectiveMercadoPagoToken(company, masterConfig);
    const paymentValidation = effectiveMercadoPagoToken
      ? paymentValidationCache.get(effectiveMercadoPagoToken) || null
      : null;
    let paymentTone: OperationalTone = 'red';
    let paymentValue = 'Ausente';
    let paymentDetail = company?.useMasterMercadoPagoToken
      ? 'Nenhuma credencial MASTER de pagamento foi selecionada para a empresa.'
      : 'Token do Mercado Pago não configurado para esta empresa.';
    let paymentHint = company?.useMasterMercadoPagoToken
      ? 'Sem credencial MASTER.'
      : 'Sem token de pagamento.';
    let paymentQuality: 'real' | 'partial' = 'real';
    let paymentUpdatedAt = this.normalizeDate(company?.mercadoPagoStatusUpdatedAt);

    if (effectiveMercadoPagoToken) {
      if (paymentValidation) {
        if (paymentValidation.ok) {
          paymentTone = 'green';
          paymentValue = 'Ativo';
          paymentDetail = company?.useMasterMercadoPagoToken
            ? `Credencial MASTER validada${paymentValidation.email ? ` para ${paymentValidation.email}` : ''}.`
            : `Motor de pagamento validado${paymentValidation.email ? ` para ${paymentValidation.email}` : ''}.`;
          paymentHint = 'Pagamento validado.';
          paymentUpdatedAt = paymentValidation.checkedAt;
        } else {
          paymentTone = 'red';
          paymentValue = 'Falha';
          paymentDetail = paymentValidation.error || 'Falha ao validar o token de pagamento.';
          paymentHint = 'Pagamento com falha.';
          paymentUpdatedAt = paymentValidation.checkedAt;
        }
      } else {
        const mercadoPagoStatus = String(company?.mercadoPagoStatus || '').trim().toUpperCase();
        if (mercadoPagoStatus === 'CONNECTED') {
          paymentTone = 'green';
          paymentValue = 'Ativo';
          paymentDetail = 'Última validação do motor de pagamento está saudável.';
          paymentHint = 'Pagamento validado.';
        } else if (mercadoPagoStatus === 'ERROR') {
          paymentTone = 'red';
          paymentValue = 'Falha';
          paymentDetail = String(company?.mercadoPagoStatusError || 'Falha no motor de pagamento.');
          paymentHint = 'Pagamento com falha.';
        } else {
          paymentTone = 'yellow';
          paymentValue = company?.useMasterMercadoPagoToken ? 'Master' : 'Pendente';
          paymentDetail = company?.useMasterMercadoPagoToken
            ? 'Credencial MASTER configurada. Validação operacional ao vivo ainda pendente.'
            : 'Token configurado, mas sem validação operacional recente.';
          paymentHint = company?.useMasterMercadoPagoToken
            ? 'Pagamento via MASTER pendente.'
            : 'Pagamento aguardando validação.';
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
      hint: paymentHint,
      href: paymentTone === 'green' ? '/dashboard/financeiro?focus=payment' : '/dashboard/financeiro?focus=preferences',
      quality: paymentQuality,
      source: company?.useMasterMercadoPagoToken
        ? ['master.mercadoPagoCredential', 'mercadopago.validateAccessToken']
        : ['company.mercadoPagoAccessToken', 'company.mercadoPagoStatus'],
      updatedAt: paymentUpdatedAt,
      active: paymentTone === 'green',
    });

    const paymentStatus = String(company?.paymentStatus || '').trim().toUpperCase();
    const subscriptionStatus = String(company?.subscriptionStatus || '').trim().toLowerCase();
    const trialRemainingDays = this.mapTrialRemainingDays(company?.trialEndsAt);
    let accessTone: OperationalTone = 'red';
    let accessValue = 'Bloq.';
    let accessDetail = 'A empresa está sem acesso operacional liberado.';
    let accessHint = 'Acesso bloqueado.';
    let accessSource: 'paid' | 'trial' | 'manual' | 'blocked' = 'blocked';
    let accessHref = '/dashboard/financeiro?focus=payment';

    if (Boolean(company?.isActive) && (paymentStatus === 'PAID' || subscriptionStatus === 'active')) {
      accessTone = 'green';
      accessValue = 'Pago';
      accessDetail = 'Acesso pago ativo e liberado para operação.';
      accessHint = 'Acesso pago ativo.';
      accessSource = 'paid';
      accessHref = '/dashboard/financeiro?focus=access';
    } else if (
      Boolean(company?.isActive) &&
      (paymentStatus === 'TRIAL' || subscriptionStatus === 'trialing') &&
      (trialRemainingDays === null || trialRemainingDays >= 0)
    ) {
      accessTone = 'yellow';
      accessValue = trialRemainingDays === null ? 'Trial' : `Trial ${trialRemainingDays}d`;
      accessDetail =
        trialRemainingDays === null
          ? 'Free trial ativo.'
          : `Free trial ativo com ${trialRemainingDays} dia(s) restante(s).`;
      accessHint =
        trialRemainingDays === null
          ? 'Trial ativo.'
          : `Trial com ${trialRemainingDays} dia(s).`;
      accessSource = 'trial';
      accessHref = '/dashboard/financeiro?focus=access';
    } else if (Boolean(company?.isActive) && (paymentStatus === 'MANUAL' || subscriptionStatus === 'manual')) {
      accessTone = 'yellow';
      accessValue = 'Manual';
      accessDetail = 'Acesso premium liberado manualmente pelo MASTER, sem cobrança real gerada.';
      accessHint = 'Acesso administrativo excepcional.';
      accessSource = 'manual';
      accessHref = '/dashboard/financeiro?focus=access';
    } else if (paymentStatus === 'OVERDUE' || paymentStatus === 'PENDING' || subscriptionStatus === 'past_due') {
      accessTone = 'red';
      accessValue = 'Atraso';
      accessDetail = 'A cobrança está pendente ou em atraso, então o acesso comercial está bloqueado.';
      accessHint = 'Acesso bloqueado por atraso.';
    } else if (paymentStatus === 'EXPIRED' || paymentStatus === 'DISABLED' || subscriptionStatus === 'expired' || subscriptionStatus === 'canceled') {
      accessTone = 'red';
      accessValue = 'Sem acesso';
      accessDetail = 'O trial expirou ou a empresa foi desativada.';
      accessHint = 'Acesso expirado.';
    }

    const accessChip = this.buildOperationalChip({
      key: 'access',
      label: 'Trial/Acesso',
      shortLabel: 'Acesso',
      tone: accessTone,
      value: accessValue,
      detail: accessDetail,
      hint: accessHint,
      href: accessHref,
      quality: 'real',
      source: ['company.isActive', 'company.paymentStatus', 'company.subscriptionStatus', 'company.trialEndsAt'],
      updatedAt: this.normalizeDate(company?.trialEndsAt),
      active: accessTone !== 'red',
    });

    const overall = this.buildOverallHealth({
      tokenChip,
      metaChip,
      webWhatsChip,
      paymentChip,
      accessChip,
    });

    const statuses = [tokenChip, metaChip, webWhatsChip, paymentChip, accessChip];

    return {
      companyId: Number(company?.id || 0),
      companyName: String(company?.name || '').trim() || null,
      statuses,
      tokenActive: tokenChip.active,
      metaActive: metaChip.active,
      webWhatsActive: webWhatsChip.active,
      paymentActive: paymentChip.active,
      accessActive: accessChip.active,
      accessReason: accessChip.detail,
      accessSource,
      overallHealth: overall.overallHealth,
      overallHint: overall.overallHint,
      overallLabel: overall.overallLabel,
      lastCheckedAt: this.latestCheckedAt(statuses.map((chip) => chip.updatedAt)),
    };
  }

  async getOperationalStatusForCompany(companyId: number, opts?: { refresh?: boolean }) {
    const normalizedCompanyId = Number(companyId || 0);
    if (!normalizedCompanyId) return null;

    if (opts?.refresh) {
      await this.whatsappStatus.getStatusForCompany(normalizedCompanyId, { refresh: true });
      await this.whatsappTemporaryConnection.syncCompanyTemporaryConnection(normalizedCompanyId, {
        requestQr: false,
      });
    }

    const companies = await this.companiesService.listByIdsForMaster([normalizedCompanyId]);
    const company = companies[0];
    if (!company) return null;
    const masterConfig = await this.resolveMasterConfig([company]);
    const paymentValidationCache = await this.buildPaymentValidationCache(
      [company],
      masterConfig,
      Boolean(opts?.refresh),
    );
    return this.buildStatusFromCompany(company, masterConfig, paymentValidationCache);
  }

  async getOperationalStatusForCompanies(
    companyIds: number[],
    opts?: { validatePayments?: boolean },
  ) {
    const normalizedCompanyIds = Array.from(
      new Set(companyIds.map((companyId) => Number(companyId || 0)).filter((companyId) => companyId > 0)),
    );
    if (!normalizedCompanyIds.length) return [];

    const companies = await this.companiesService.listByIdsForMaster(normalizedCompanyIds);
    if (!companies.length) return [];
    const masterConfig = await this.resolveMasterConfig(companies);
    const paymentValidationCache = await this.buildPaymentValidationCache(
      companies,
      masterConfig,
      Boolean(opts?.validatePayments),
    );

    return companies.map((company) => this.buildStatusFromCompany(company, masterConfig, paymentValidationCache));
  }
}
