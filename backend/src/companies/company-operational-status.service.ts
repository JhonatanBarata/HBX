import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppStatusService } from '../messaging/whatsapp-status.service';
import { MercadoPagoClientService } from '../payments/mercado-pago-client.service';
import { buildWhatsAppCenterSnapshot, type WhatsAppCenterSnapshot } from './whatsapp-center.util';
import { CompaniesService } from './companies.service';
import { WhatsAppModalService } from './whatsapp-modal.service';
import {
  getMasterGlobalIntegrationConfig,
  pickMasterMercadoPagoCredential,
  pickMasterWhatsAppCredential,
} from '../modules/master-global-integrations.util';

export type OperationalTone = 'green' | 'yellow' | 'red';
export type OperationalStatusQuality = 'real' | 'partial' | 'stale';

export type OperationalStatusChip = {
  key: 'token' | 'meta' | 'webwhats' | 'payment' | 'access';
  label: string;
  shortLabel: string;
  tone: OperationalTone;
  value: string;
  detail: string;
  hint: string;
  href: string;
  quality: OperationalStatusQuality;
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

type TimedOperationResult = {
  ok: boolean;
  timedOut: boolean;
  error: string | null;
};

type PaymentValidationCacheResult = {
  cache: Map<string, PaymentValidationResult | null>;
  stale: boolean;
};

@Injectable()
export class CompanyOperationalStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companiesService: CompaniesService,
    private readonly whatsappStatus: WhatsAppStatusService,
    private readonly mercadoPagoClient: MercadoPagoClientService,
    private readonly whatsappModalService: WhatsAppModalService,
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

  private resolveRefreshTimeoutMs() {
    const raw = Number(process.env.OPERATIONAL_STATUS_REFRESH_TIMEOUT_MS || '2000');
    if (!Number.isFinite(raw)) return 2000;
    return Math.min(5000, Math.max(500, Math.trunc(raw)));
  }

  private async waitForTimedOperation<T>(
    label: string,
    operation: Promise<T>,
    timeoutMs: number,
  ): Promise<TimedOperationResult> {
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const guardedOperation = operation
      .then((): TimedOperationResult => ({ ok: true, timedOut: false, error: null }))
      .catch((error: any): TimedOperationResult => ({
        ok: false,
        timedOut: false,
        error: String(error?.message || `${label} falhou.`),
      }));

    const timeoutOperation = new Promise<TimedOperationResult>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({
          ok: false,
          timedOut: true,
          error: `${label} excedeu ${timeoutMs}ms.`,
        });
      }, timeoutMs);
    });

    const result = await Promise.race([guardedOperation, timeoutOperation]);
    if (timeoutHandle) clearTimeout(timeoutHandle);
    if (result.timedOut) {
      operation.catch(() => undefined);
    }
    return result;
  }

  private markStatusAsStale(status: CompanyOperationalStatus): CompanyOperationalStatus {
    const statuses = status.statuses.map((chip) => ({
      ...chip,
      quality: 'stale' as OperationalStatusQuality,
      detail: chip.detail.includes('Ultimo status salvo')
        ? chip.detail
        : `${chip.detail} Ultimo status salvo usado porque uma validacao externa demorou demais.`,
      hint: chip.hint.includes('Status salvo')
        ? chip.hint
        : `${chip.hint} Status salvo.`,
      source: Array.from(new Set([...chip.source, 'refresh.timeout'])),
    }));

    return {
      ...status,
      statuses,
      overallLabel: status.overallLabel === 'Operando' ? 'Parcial' : status.overallLabel,
      overallHint: `${status.overallHint} Resposta parcial com ultimo status salvo apos timeout de validacao externa.`,
    };
  }

  private normalizeText(value?: unknown) {
    const normalized = String(value || '').trim();
    return normalized || null;
  }

  private modalAvailable() {
    const enabled = ['1', 'true', 'yes', 'on'].includes(
      String(process.env.WHATSAPP_MODAL_ENABLED || '').trim().toLowerCase(),
    );
    const internalUrl = String(process.env.WHATSAPP_MODAL_INTERNAL_URL || '').trim();
    return Boolean(enabled && internalUrl);
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
      temporaryAvailable: false,
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
  ): Promise<PaymentValidationCacheResult> {
    const cache = new Map<string, PaymentValidationResult | null>();
    let stale = false;
    if (!validatePayments) return { cache, stale };
    const timeoutMs = this.resolveRefreshTimeoutMs();

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
          const validation = this.mercadoPagoClient.validateAccessToken(token);
          const result = await this.waitForTimedOperation('Validacao Mercado Pago', validation, timeoutMs);
          if (result.timedOut) {
            stale = true;
            cache.set(token, null);
            return;
          }
          if (!result.ok) {
            cache.set(token, {
              ok: false,
              email: null,
              error: result.error || 'Falha ao validar o token de pagamento.',
              checkedAt: new Date().toISOString(),
            });
            return;
          }
          const profile = await validation;
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

    return { cache, stale };
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
    const whatsappAttention = !whatsappHealthy || input.webWhatsChip.value === 'Reconect.';
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
    const modalAvailable = this.modalAvailable();
    const modalStatus = String(company?.whatsappModalStatus || '').trim().toUpperCase();
    const modalPhone = this.normalizeText(company?.whatsappModalPhone);
    const modalLastError = this.normalizeText(company?.whatsappModalLastError);
    const modalUpdatedAt = this.normalizeDate(company?.whatsappModalUpdatedAt);

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
      modalAvailable && modalStatus === 'CONNECTED'
        ? this.buildOperationalChip({
            key: 'webwhats',
            label: 'WebWhats ativo',
            shortLabel: 'WebWhats',
            tone: 'green',
            value: 'Conect.',
            detail: modalPhone
              ? `Conexão rápida por QR ativa no modal WhatsApp com ${modalPhone}.`
              : 'Conexão rápida por QR ativa no modal WhatsApp.',
            hint: 'WebWhats conectado.',
            href: '/dashboard/whatsapp?focus=qr',
            quality: 'real',
            source: ['company.whatsappModalStatus', 'company.whatsappModalPhone'],
            updatedAt: modalUpdatedAt,
            active: true,
          })
        : modalAvailable && ['WAITING_QR', 'STARTING', 'RECONNECTING', 'ERROR'].includes(modalStatus)
          ? this.buildOperationalChip({
              key: 'webwhats',
              label: 'WebWhats ativo',
              shortLabel: 'WebWhats',
              tone: 'yellow',
              value: modalStatus === 'WAITING_QR'
                ? 'QR'
                : modalStatus === 'STARTING'
                  ? 'Iniciando'
                  : modalStatus === 'RECONNECTING'
                    ? 'Reconect.'
                    : 'Atenção',
              detail:
                modalStatus === 'WAITING_QR'
                  ? 'QR disponível para concluir a conexão rápida.'
                  : modalStatus === 'STARTING'
                    ? 'Sessão do modal WhatsApp em inicialização.'
                    : modalStatus === 'RECONNECTING'
                      ? String(modalLastError || 'WebWhats instável. Aguardando reconexão sem derrubar a sessão.')
                      : String(modalLastError || 'Conexão rápida por QR precisa de atenção.'),
              hint:
                modalStatus === 'WAITING_QR'
                  ? 'QR aguardando leitura.'
                  : modalStatus === 'RECONNECTING'
                    ? 'WebWhats aguardando reconexão.'
                  : 'WebWhats em atenção.',
              href: '/dashboard/whatsapp?focus=qr',
              quality: 'real',
              source: ['company.whatsappModalStatus', 'company.whatsappModalLastError'],
              updatedAt: modalUpdatedAt,
              active: modalStatus === 'RECONNECTING',
            })
          : modalAvailable
            ? this.buildOperationalChip({
                key: 'webwhats',
                label: 'WebWhats ativo',
                shortLabel: 'WebWhats',
                tone: 'red',
                value: 'Off',
                detail: 'A conexão rápida por QR está disponível, mas ainda não foi conectada.',
                hint: 'WebWhats não conectado.',
                href: '/dashboard/whatsapp?focus=qr',
                quality: 'real',
                source: ['company.whatsappModalStatus'],
                updatedAt: modalUpdatedAt,
                active: false,
              })
            : this.buildOperationalChip({
                key: 'webwhats',
                label: 'WebWhats ativo',
                shortLabel: 'WebWhats',
                tone: 'red',
                value: 'Indisp.',
                detail: 'O modal WhatsApp não está configurado neste ambiente.',
                hint: 'WebWhats indisponível.',
                href: '/dashboard/whatsapp?focus=qr',
                quality: 'real',
                source: ['env.WHATSAPP_MODAL_ENABLED', 'env.WHATSAPP_MODAL_INTERNAL_URL'],
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
    let paymentQuality: OperationalStatusQuality = 'real';
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

    const hideMetaOffChip = webWhatsChip.active && !officialConfigured;
    const hidePaymentAbsentChip = accessSource === 'trial' && !effectiveMercadoPagoToken;

    const statuses = [
      tokenChip,
      ...(hideMetaOffChip ? [] : [metaChip]),
      webWhatsChip,
      ...(hidePaymentAbsentChip ? [] : [paymentChip]),
      accessChip,
    ];

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
    let stale = false;

    if (opts?.refresh) {
      const timeoutMs = this.resolveRefreshTimeoutMs();
      const refreshResults = await Promise.all([
        this.waitForTimedOperation(
          'Validacao WhatsApp Meta',
          this.whatsappStatus.getStatusForCompany(normalizedCompanyId, { refresh: true }),
          timeoutMs,
        ),
        this.waitForTimedOperation(
          'Validacao WebWhats',
          this.whatsappModalService.getCompanyStatus(normalizedCompanyId),
          timeoutMs,
        ),
      ]);
      stale = refreshResults.some((result) => result.timedOut);
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
    stale = stale || paymentValidationCache.stale;
    const status = this.buildStatusFromCompany(company, masterConfig, paymentValidationCache.cache);
    return stale ? this.markStatusAsStale(status) : status;
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

    return companies.map((company) => this.buildStatusFromCompany(company, masterConfig, paymentValidationCache.cache));
  }
}
