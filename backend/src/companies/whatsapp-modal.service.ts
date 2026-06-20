import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import axios, { AxiosError, AxiosResponse, Method } from 'axios';
import * as QRCode from 'qrcode';
import { COMMERCIAL_PLAN_KEYS } from '../commercial-plans/commercial-plan-catalog';
import { resolveCompanyAccessState } from '../modules/company-access-state';
import { ensureMasterBillingRuntimeSchema } from '../modules/master-runtime';
import { PrismaService } from '../prisma/prisma.service';

type WhatsAppModalStatus = 'offline' | 'starting' | 'waiting_qr' | 'connected' | 'reconnecting' | 'disconnected' | 'error';
type WhatsAppLiveHealthStatus = 'healthy' | 'stale' | 'reconnecting' | 'disconnected' | 'error';
type WhatsAppLiveHealthRecommendedAction =
  | 'none'
  | 'refresh'
  | 'restart'
  | 'open_qr'
  | 'disconnect_reconnect'
  | 'check_provider';
type WhatsAppModalErrorCode =
  | 'WHATSAPP_MODAL_DISABLED'
  | 'WHATSAPP_MODAL_NOT_CONFIGURED'
  | 'WHATSAPP_MODAL_TIMEOUT'
  | 'WHATSAPP_MODAL_UNAVAILABLE'
  | 'WHATSAPP_MODAL_HTTP_ERROR'
  | 'WHATSAPP_MODAL_QR_UNAVAILABLE'
  | 'WHATSAPP_MODAL_PAIRING_UNSUPPORTED'
  | 'WHATSAPP_MODAL_PAIRING_CODE_EMPTY'
  | 'WHATSAPP_MODAL_PAIRING_RATE_LIMITED'
  | 'WHATSAPP_MODAL_ALREADY_CONNECTED'
  | 'WHATSAPP_NUMBER_OWNED_BY_OTHER_COMPANY'
  | 'WHATSAPP_NUMBER_OWNED_BY_OTHER_USER'
  | 'TRIAL_PHONE_ALREADY_USED';
type ProviderHealth = 'disabled' | 'misconfigured' | 'healthy' | 'unavailable' | 'unknown';

type CompanyModalFields = {
  id: number;
  name: string;
  slug: string | null;
  whatsappModalStatus: string | null;
  whatsappModalProvider: string | null;
  whatsappModalPhone: string | null;
  whatsappModalConnectedAt: Date | null;
  whatsappModalLastError: string | null;
  whatsappModalUpdatedAt: Date | null;
  currentWhatsappConnectionSessionId: string | null;
  currentWhatsappConnectionSession?: {
    id: string;
    provider: string | null;
    tenantKey: string | null;
    status: string | null;
  } | null;
  status?: string | null;
  selectedPlanKey: string | null;
  contactPhone: string | null;
  isActive: boolean | null;
  trialStartsAt: Date | null;
  trialEndsAt: Date | null;
  billingGraceEndsAt?: Date | null;
  courtesyEndsAt?: Date | null;
};

type ModalConfig = {
  enabled: boolean;
  configured: boolean;
  available: boolean;
  internalUrl: string | null;
  apiKey: string | null;
  timeoutMs: number;
  missingConfigKeys: string[];
  setupHint: string | null;
};

type ModalSnapshot = {
  status: WhatsAppModalStatus;
  phone: string | null;
  connectedAt: Date | null;
  lastError: string | null;
  updatedAt: Date | null;
  provider: 'external_modal';
  qrCodeDataUrl: string | null;
  rawStatus: string | null;
};

type ExternalRequestOptions = {
  method: Method;
  path: string;
  purpose: string;
  data?: unknown;
  treatNotFoundAsNull?: boolean;
};

type ProviderDiagnosticResponse = {
  method: Method;
  path: string;
  url: string;
  status: number;
  body: unknown;
  durationMs: number;
};

export type WhatsAppLiveHealthResponse = {
  status: WhatsAppLiveHealthStatus;
  connected: boolean;
  liveConfirmed: boolean;
  storedStatus: string | null;
  providerStatus: string | null;
  providerReachable: boolean;
  lastCheckedAt: string;
  lastProviderSyncAt: string | null;
  lastInboundMessageAt: string | null;
  lastOutboundMessageAt: string | null;
  staleSeconds: number | null;
  reason: string;
  actionLabel: string;
  actionHref: string;
  actionFocus: 'status' | 'qr' | 'official';
  recommendedAction: WhatsAppLiveHealthRecommendedAction;
  providerHealth: ProviderHealth;
  inboundStale: boolean;
  inboundStaleSeconds: number | null;
  ttlSeconds: number;
  inboundStaleMinutes: number;
};

export type WhatsAppModalResponse = {
  success: boolean;
  status: WhatsAppModalStatus;
  message: string;
  data: {
    companyId: number;
    companyName: string;
    companySlug: string | null;
    tenantKey: string;
    provider: 'external_modal';
    enabled: boolean;
    configured: boolean;
    available: boolean;
    providerHealth: ProviderHealth;
    missingConfigKeys: string[];
    phone: string | null;
    connectedAt: string | null;
    updatedAt: string | null;
    lastError: string | null;
    qrCodeDataUrl: string | null;
    rawStatus: string | null;
  };
  errorCode: WhatsAppModalErrorCode | null;
  redirectTo?: string | null;
};

export type WhatsAppPairingCodeResponse = {
  success: boolean;
  sessionId: string;
  status: 'waiting_code' | 'code_generated' | 'connected' | 'expired' | 'error' | 'disconnected';
  code: string | null;
  expiresInSeconds: number;
  providerSupported: boolean;
  message: string;
  errorCode: WhatsAppModalErrorCode | null;
  nextAllowedAt?: string | null;
};

class WhatsAppModalProviderError extends Error {
  constructor(
    readonly code: WhatsAppModalErrorCode,
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'WhatsAppModalProviderError';
  }
}

@Injectable()
export class WhatsAppModalService {
  private readonly logger = new Logger(WhatsAppModalService.name);
  private readonly recentConnectAttemptAt = new Map<string, number>();
  private readonly recentWebhookConfigureAt = new Map<string, number>();
  private readonly qrCodeCache = new Map<string, { dataUrl: string; capturedAtMs: number }>();
  private readonly recentPairingCodeAttemptAt = new Map<string, number>();
  private readonly liveHealthCache = new Map<number, { capturedAtMs: number; payload: WhatsAppLiveHealthResponse }>();
  private readonly connectAttemptCooldownMs = 12000;
  private readonly webhookConfigureCooldownMs = 60000;
  private readonly qrCodeCacheTtlMs = 45000;
  private readonly pairingCodeCooldownMs = 60_000;
  private readonly pairingCodeTtlSeconds = 120;
  private readonly reconnectGraceMs = Math.max(
    60_000,
    Math.min(15 * 60_000, Number(process.env.WHATSAPP_MODAL_RECONNECT_GRACE_MS || 5 * 60_000) || 5 * 60_000),
  );

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Gate de conexão (Etapa 4 — Modelo de atendimento)
  // ---------------------------------------------------------------------------

  private parseLooseJsonObject(raw: string | null | undefined): Record<string, any> {
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return parsed as Record<string, any>;
    } catch {
      return {};
    }
  }

  private isModalAdminOwner(user: any): boolean {
    if (user?.isSystemMaster) return true;
    const role = String(user?.role || '').trim().toUpperCase();
    return role === 'ADMIN' && user?.canViewBilling !== false;
  }

  // Número limpo pra exibir (tira o "@s.whatsapp.net"/"@c.us" e formata BR). O motor às vezes guarda
  // o JID inteiro no displayPhone; o dono não quer ver "5519...@s.whatsapp.net".
  private cleanDisplayPhone(raw: string | null): string | null {
    if (!raw) return null;
    const digits = String(raw).split('@')[0].replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length === 13 && digits.startsWith('55')) {
      return `+55 ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
    }
    if (digits.length === 12 && digits.startsWith('55')) {
      return `+55 ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`;
    }
    return digits;
  }

  // Lançada logo no início de startCompanySession e getCompanyQrCode quando userId
  // está presente (ou seja, fluxo "me/whatsapp-modal/..." — o front de atendimento).
  // O fluxo :id/whatsapp-modal/... (admin panel direto) e master não passam userId
  // e, portanto, NÃO são bloqueados aqui — sem regressão de admin.
  private async assertConnectionGate(companyId: number, user: any, userId: number): Promise<void> {
    // master e admin-dono sempre passam
    if (this.isModalAdminOwner(user)) return;

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { whatsappAttendanceMode: true },
    });
    const rawMode = String(company?.whatsappAttendanceMode || '').trim().toLowerCase();
    const effectiveMode: 'shared' | 'individual' = rawMode === 'shared' ? 'shared' : 'individual';

    if (effectiveMode === 'shared') {
      // Modo compartilhado: só o admin-dono/master conecta.
      // Vendedor/gerente chega aqui → bloqueado.
      throw new ForbiddenException('No modo compartilhado, só o admin conecta o WhatsApp da empresa.');
    }

    // Modo individual: role USER precisa ter canConnectWhatsapp === true na policy.
    const policyRow = await this.prisma.userTeamPolicy.findUnique({
      where: { userId },
      select: { visibilityJson: true },
    }).catch(() => null);
    const vis = this.parseLooseJsonObject(policyRow?.visibilityJson);
    if (!vis?.canConnectWhatsapp) {
      throw new ForbiddenException('Conexão de WhatsApp não liberada para este acesso — peça ao admin.');
    }
  }

  getAvailability() {
    const config = this.readConfig();
    return {
      enabled: config.enabled,
      configured: config.configured,
      available: config.available,
      missingConfigKeys: [...config.missingConfigKeys],
      timeoutMs: config.timeoutMs,
      setupHint: config.setupHint,
    };
  }

  async getProviderHealth() {
    const config = this.readConfig();
    if (!config.enabled) {
      return {
        healthy: false,
        status: 'disabled' as ProviderHealth,
        message: 'Integração Modal WhatsApp desativada por ambiente.',
      };
    }

    if (!config.configured) {
      return {
        healthy: false,
        status: 'misconfigured' as ProviderHealth,
        message: this.buildMisconfiguredMessage(config),
      };
    }

    try {
      const isReachable = await this.probeProviderHealth();
      if (!isReachable) {
        throw new WhatsAppModalProviderError(
          'WHATSAPP_MODAL_UNAVAILABLE',
          'Webwhats indisponível no momento.',
        );
      }
      return {
        healthy: true,
        status: 'healthy' as ProviderHealth,
        message: 'Webwhats disponível.',
      };
    } catch (error) {
      const providerError = this.toProviderError(error);
      return {
        healthy: false,
        status: providerError.code === 'WHATSAPP_MODAL_NOT_CONFIGURED' ? 'misconfigured' as ProviderHealth : 'unavailable' as ProviderHealth,
        message: providerError.message,
      };
    }
  }

  private resolveLiveHealthTtlSeconds() {
    const parsed = Number(process.env.WHATSAPP_LIVE_HEALTH_TTL_SECONDS || '180');
    if (!Number.isFinite(parsed) || parsed <= 0) return 180;
    return Math.max(30, Math.min(900, Math.trunc(parsed)));
  }

  private resolveInboundStaleMinutes() {
    const parsed = Number(process.env.WHATSAPP_INBOUND_STALE_MINUTES || '60');
    if (!Number.isFinite(parsed) || parsed <= 0) return 60;
    return Math.max(5, Math.min(24 * 60, Math.trunc(parsed)));
  }

  private resolveLiveHealthCacheMs() {
    const parsed = Number(process.env.WHATSAPP_LIVE_HEALTH_CACHE_SECONDS || '10');
    if (!Number.isFinite(parsed) || parsed < 0) return 10_000;
    return Math.min(30_000, Math.max(0, Math.trunc(parsed) * 1000));
  }

  private maxDate(...values: Array<Date | string | null | undefined>) {
    let best: Date | null = null;
    for (const value of values) {
      if (!value) continue;
      const parsed = value instanceof Date ? value : new Date(String(value));
      if (Number.isNaN(parsed.getTime())) continue;
      if (!best || parsed.getTime() > best.getTime()) {
        best = parsed;
      }
    }
    return best;
  }

  private async loadMessageActivity(companyId: number) {
    const [
      lastInboundCompanyMessage,
      lastOutboundCompanyMessage,
      lastLegacyInbound,
      lastOutboundMessage,
    ] = await Promise.all([
      this.prisma.companyMessage.findFirst({
        where: { companyId, direction: { in: ['INBOUND', 'inbound'] } },
        orderBy: [{ timestamp: 'desc' }, { createdAt: 'desc' }],
        select: { timestamp: true, createdAt: true },
      }),
      this.prisma.companyMessage.findFirst({
        where: { companyId, direction: { in: ['OUTBOUND', 'outbound'] } },
        orderBy: [{ timestamp: 'desc' }, { createdAt: 'desc' }],
        select: { timestamp: true, createdAt: true },
      }),
      this.prisma.inboundMessage.findFirst({
        where: { companyId },
        orderBy: { receivedAt: 'desc' },
        select: { receivedAt: true },
      }),
      this.prisma.outboundMessage.findFirst({
        where: { companyId },
        orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
        select: { sentAt: true, createdAt: true },
      }),
    ]);

    return {
      lastInboundMessageAt: this.maxDate(
        lastInboundCompanyMessage?.timestamp,
        lastInboundCompanyMessage?.createdAt,
        lastLegacyInbound?.receivedAt,
      ),
      lastOutboundMessageAt: this.maxDate(
        lastOutboundCompanyMessage?.timestamp,
        lastOutboundCompanyMessage?.createdAt,
        lastOutboundMessage?.sentAt,
        lastOutboundMessage?.createdAt,
      ),
    };
  }

  private isStoredConnected(value: unknown) {
    return String(value || '').trim().toUpperCase() === 'CONNECTED';
  }

  private buildLiveHealthPayload(input: {
    company: CompanyModalFields;
    snapshot: ModalSnapshot;
    providerReachable: boolean;
    instanceExists: boolean;
    providerHealth: ProviderHealth;
    providerErrorMessage?: string | null;
    hasOperationalSession: boolean;
    lastInboundMessageAt: Date | null;
    lastOutboundMessageAt: Date | null;
    checkedAt: Date;
    ttlSeconds: number;
    inboundStaleMinutes: number;
  }): WhatsAppLiveHealthResponse {
    const storedStatus = this.normalizeOptionalString(input.company.whatsappModalStatus);
    const storedConnected = this.isStoredConnected(storedStatus);
    const providerStatus = input.snapshot.rawStatus || input.snapshot.status || null;
    const lastProviderSyncAt = input.snapshot.updatedAt || input.company.whatsappModalUpdatedAt || null;
    const providerSyncAgeSeconds = lastProviderSyncAt
      ? Math.max(0, Math.floor((input.checkedAt.getTime() - lastProviderSyncAt.getTime()) / 1000))
      : null;
    const providerConfirmedDown =
      input.providerReachable &&
      (
        !input.instanceExists ||
        input.snapshot.status === 'offline' ||
        input.snapshot.status === 'disconnected' ||
        input.snapshot.status === 'waiting_qr' ||
        input.snapshot.status === 'error'
      );
    const liveConfirmed =
      input.providerReachable &&
      input.instanceExists &&
      input.snapshot.status === 'connected' &&
      input.hasOperationalSession &&
      providerSyncAgeSeconds !== null &&
      providerSyncAgeSeconds <= input.ttlSeconds;
    const connected = providerConfirmedDown
      ? false
      : (
        liveConfirmed ||
        storedConnected ||
        input.snapshot.status === 'connected' ||
        input.snapshot.status === 'reconnecting'
      );
    const inboundStaleSeconds = input.lastInboundMessageAt
      ? Math.max(0, Math.floor((input.checkedAt.getTime() - input.lastInboundMessageAt.getTime()) / 1000))
      : null;
    const inboundStale =
      connected &&
      (
        !input.lastInboundMessageAt ||
        (inboundStaleSeconds !== null && inboundStaleSeconds > input.inboundStaleMinutes * 60)
      );

    let status: WhatsAppLiveHealthStatus = 'stale';
    let recommendedAction: WhatsAppLiveHealthRecommendedAction = 'refresh';
    let actionLabel = 'Revalidar agora';
    let actionHref = '/dashboard/whatsapp?focus=qr';
    let actionFocus: WhatsAppLiveHealthResponse['actionFocus'] = 'qr';
    let reason = 'Status salvo não tem confirmação viva recente do provider.';

    if (liveConfirmed) {
      status = 'healthy';
      recommendedAction = 'none';
      actionLabel = 'Conexão confirmada';
      actionFocus = 'status';
      reason = inboundStale
        ? input.lastInboundMessageAt
          ? 'Provider confirmou sessão viva; o Atendimento está sem mensagens recebidas recentes.'
          : 'Provider confirmou sessão viva; o Atendimento ainda não tem mensagens recebidas registradas.'
        : 'Provider confirmou sessão conectada recentemente.';
    } else if (!input.providerReachable) {
      status = storedConnected ? 'reconnecting' : 'error';
      recommendedAction = storedConnected ? 'refresh' : 'check_provider';
      actionLabel = storedConnected ? 'Revalidar agora' : 'Ver diagnóstico técnico';
      actionFocus = storedConnected ? 'qr' : 'status';
      reason = storedConnected
        ? 'Status salvo dizia conectado, mas o provider não respondeu à confirmação viva.'
        : input.providerErrorMessage || 'Provider WebWhats indisponível na confirmação viva.';
    } else if (!input.instanceExists || input.snapshot.status === 'offline' || input.snapshot.status === 'disconnected') {
      status = 'disconnected';
      recommendedAction = 'open_qr';
      actionLabel = 'Abrir QR Code';
      reason = !input.instanceExists
        ? 'Provider respondeu que a instância não existe ou não está ativa.'
        : 'Provider confirmou sessão desconectada.';
    } else if (input.snapshot.status === 'reconnecting' || input.snapshot.status === 'starting') {
      status = 'reconnecting';
      recommendedAction = 'restart';
      actionLabel = 'Reiniciar sessão';
      reason = input.snapshot.lastError || 'WebWhats está reconectando ou iniciando.';
    } else if (input.snapshot.status === 'waiting_qr') {
      status = 'disconnected';
      recommendedAction = 'open_qr';
      actionLabel = 'Abrir QR Code';
      reason = 'QR aguardando leitura. A sessão ainda não está viva.';
    } else if (input.snapshot.status === 'error') {
      status = 'error';
      recommendedAction = 'restart';
      actionLabel = 'Reiniciar sessão';
      reason = input.snapshot.lastError || 'Provider retornou erro para a instância.';
    }

    return {
      status,
      connected,
      liveConfirmed,
      storedStatus,
      providerStatus,
      providerReachable: input.providerReachable,
      lastCheckedAt: input.checkedAt.toISOString(),
      lastProviderSyncAt: this.toIso(lastProviderSyncAt),
      lastInboundMessageAt: this.toIso(input.lastInboundMessageAt),
      lastOutboundMessageAt: this.toIso(input.lastOutboundMessageAt),
      staleSeconds: providerSyncAgeSeconds,
      reason,
      actionLabel,
      actionHref,
      actionFocus,
      recommendedAction,
      providerHealth: input.providerHealth,
      inboundStale,
      inboundStaleSeconds,
      ttlSeconds: input.ttlSeconds,
      inboundStaleMinutes: input.inboundStaleMinutes,
    };
  }

  async getCompanyLiveHealth(
    companyId: number,
    options?: { forceRefresh?: boolean },
  ): Promise<WhatsAppLiveHealthResponse> {
    const normalizedCompanyId = Number(companyId || 0);
    const cacheMs = this.resolveLiveHealthCacheMs();
    const cached = this.liveHealthCache.get(normalizedCompanyId);
    if (!options?.forceRefresh && cached && cacheMs > 0 && Date.now() - cached.capturedAtMs <= cacheMs) {
      return cached.payload;
    }

    const company = await this.loadCompany(normalizedCompanyId);
    const ttlSeconds = this.resolveLiveHealthTtlSeconds();
    const inboundStaleMinutes = this.resolveInboundStaleMinutes();
    const checkedAt = new Date();
    const storedSnapshot = this.buildStoredSnapshot(company);
    const activityPromise = this.loadMessageActivity(normalizedCompanyId);
    const availabilityResponse = this.buildAvailabilityResponse(company, storedSnapshot, 'status');

    if (availabilityResponse && !availabilityResponse.data.available) {
      const activity = await activityPromise;
      const payload = this.buildLiveHealthPayload({
        company,
        snapshot: storedSnapshot,
        providerReachable: false,
        instanceExists: false,
        providerHealth: availabilityResponse.data.providerHealth,
        providerErrorMessage: availabilityResponse.message,
        hasOperationalSession: Boolean(company.currentWhatsappConnectionSessionId),
        lastInboundMessageAt: activity.lastInboundMessageAt,
        lastOutboundMessageAt: activity.lastOutboundMessageAt,
        checkedAt,
        ttlSeconds,
        inboundStaleMinutes,
      });
      this.liveHealthCache.set(normalizedCompanyId, { capturedAtMs: Date.now(), payload });
      return payload;
    }

    let snapshot = storedSnapshot;
    let providerReachable = false;
    let instanceExists = false;
    let providerHealth: ProviderHealth = 'unknown';
    let providerErrorMessage: string | null = null;

    try {
      const result = await this.fetchLiveSnapshotWithMeta(company, { includeQr: false });
      snapshot = result.snapshot;
      providerReachable = result.providerReachable !== false;
      instanceExists = Boolean(result.instanceExists);
      providerHealth = providerReachable ? 'healthy' : 'unknown';
      providerErrorMessage = result.providerErrorMessage || null;
    } catch (error) {
      const providerError = this.toProviderError(error);
      providerReachable = false;
      providerErrorMessage = providerError.message;
      providerHealth = providerError.code === 'WHATSAPP_MODAL_NOT_CONFIGURED' ? 'misconfigured' : 'unavailable';
      if (!this.isTransientProviderError(error)) {
        const failureSnapshot: ModalSnapshot = {
          ...storedSnapshot,
          status: this.isMissingInstanceError(error) ? 'offline' : 'error',
          connectedAt: this.isMissingInstanceError(error) ? null : storedSnapshot.connectedAt,
          lastError: this.isMissingInstanceError(error) ? null : providerError.message,
          updatedAt: checkedAt,
          qrCodeDataUrl: null,
        };
        await this.persistSnapshot(company, failureSnapshot, 'live_health_failure');
        snapshot = failureSnapshot;
        providerReachable = this.isMissingInstanceError(error);
        instanceExists = false;
        providerHealth = providerReachable ? 'healthy' : providerHealth;
      }
    }

    const activity = await activityPromise;
    const hasOperationalSession = await this.hasActiveWebwhatsConnectionSession(normalizedCompanyId);
    const payload = this.buildLiveHealthPayload({
      company,
      snapshot,
      providerReachable,
      instanceExists,
      providerHealth,
      providerErrorMessage,
      hasOperationalSession,
      lastInboundMessageAt: activity.lastInboundMessageAt,
      lastOutboundMessageAt: activity.lastOutboundMessageAt,
      checkedAt,
      ttlSeconds,
      inboundStaleMinutes,
    });
    this.liveHealthCache.set(normalizedCompanyId, { capturedAtMs: Date.now(), payload });
    return payload;
  }

  async getCompanyStatus(companyId: number, userId?: number): Promise<WhatsAppModalResponse> {
    const baseCompany = await this.loadCompany(companyId);
    const company = userId ? this.patchCompanyWithTenantKey(baseCompany, this.buildUserTenantKey(baseCompany, userId)) : baseCompany;
    const storedSnapshot = await this.resolveStoredSnapshot(baseCompany, userId);
    const availabilityResponse = this.buildAvailabilityResponse(baseCompany, storedSnapshot, 'status');
    if (availabilityResponse) {
      return availabilityResponse;
    }

    // STATUS HONESTO (Trilha 1 — Fundação de confiança):
    // Quando há userId, a FONTE DE VERDADE é a sessão `WhatsAppConnectionSession` do
    // usuário (lida por `buildUserStoredSnapshot`). Se a sessão já diz disconnected/offline,
    // NÃO consultamos o motor — evitamos que uma instância zumbi (delete falhou no motor)
    // ou o campo legado `company.whatsappModalStatus` (que persistSnapshot com userId
    // NÃO atualiza) reporte "Conectado" para um número já desconectado pelo vendedor.
    if (userId && (storedSnapshot.status === 'disconnected' || storedSnapshot.status === 'offline')) {
      return this.buildResponse(baseCompany, storedSnapshot, {
        success: true,
        providerHealth: 'healthy',
      });
    }

    try {
      const snapshot = await this.fetchLiveSnapshot(company, { includeQr: false }, userId);
      return this.buildResponse(baseCompany, snapshot, {
        success: true,
        providerHealth: 'healthy',
      });
    } catch (error) {
      if (this.isTransientProviderError(error)) {
        return this.buildTransientFailureResponse(baseCompany, storedSnapshot, error, { success: true });
      }
      return this.buildFailureResponse(baseCompany, storedSnapshot, error, 'Falha ao consultar o Modal WhatsApp.');
    }
  }

  async startCompanySession(companyId: number, userId?: number, user?: any): Promise<WhatsAppModalResponse> {
    // Gate de conexão (Etapa 4): aplica somente quando há userId (fluxo de vendedor/gerente).
    if (userId && user !== undefined) {
      await this.assertConnectionGate(companyId, user, userId);
    }
    const baseCompany = await this.loadCompany(companyId);
    // 050-1: sobrepõe tenantKey para a chave por-vendedor quando userId presente.
    const userTenantKey = userId ? this.buildUserTenantKey(baseCompany, userId) : null;
    const company = userTenantKey ? this.patchCompanyWithTenantKey(baseCompany, userTenantKey) : baseCompany;

    const storedSnapshot = await this.resolveStoredSnapshot(baseCompany, userId);
    const availabilityResponse = this.buildAvailabilityResponse(baseCompany, storedSnapshot, 'start');
    if (availabilityResponse) {
      return availabilityResponse;
    }

    const tenantKey = this.resolveOperationalTenantKey(company);
    this.logger.log(`Starting Modal WhatsApp session for company ${company.id} (${tenantKey}).`);

    let liveSnapshot: ModalSnapshot = {
      ...storedSnapshot,
      status: 'starting',
      lastError: null,
      updatedAt: new Date(),
      qrCodeDataUrl: null,
    };
    await this.persistSnapshot(company, liveSnapshot, 'start', userId);

    try {
      await this.createProviderInstance(tenantKey);
    } catch (error) {
      if (this.isExistingInstanceError(error)) {
        // "Já existe" não garante que está sã — pode ser instância órfã (sem linha no banco
        // do motor) que causa P2025 em loop. Verifica o estado real; se quebrado, reseta e recria.
        const state = await this.fetchProviderConnectionStateForPairing(tenantKey).catch(() => null);
        const rawState = String((state as any)?.instance?.state || (state as any)?.state || '').trim().toLowerCase();
        if (!state || (rawState !== 'open' && rawState !== 'connecting')) {
          this.logger.warn(`Modal WhatsApp start: instancia ${tenantKey} existe mas estado invalido (${rawState || 'null'}) — resetando e recriando.`);
          await this.resetProviderInstanceForPairing(tenantKey);
          try {
            await this.createProviderInstance(tenantKey);
          } catch (recreateError) {
            if (!this.isExistingInstanceError(recreateError) && !this.isTransientProviderError(recreateError)) {
              return this.buildFailureResponse(baseCompany, storedSnapshot, recreateError, 'Falha ao recriar sessão do Modal WhatsApp.');
            }
          }
        }
      } else if (!this.isTransientProviderError(error)) {
        return this.buildFailureResponse(baseCompany, storedSnapshot, error, 'Falha ao iniciar a sessão do Modal WhatsApp.');
      }
    }
    await this.tryConfigureProviderWebhook(tenantKey, 'start');

    try {
      const connectSnapshot = await this.connectProviderSession(company, liveSnapshot);
      if (connectSnapshot) {
        liveSnapshot = connectSnapshot;
        await this.persistSnapshot(company, liveSnapshot, 'start_connect', userId);
        return this.buildResponse(baseCompany, liveSnapshot, {
          success: true,
          providerHealth: 'healthy',
          message: this.buildSessionActionMessage(liveSnapshot, {
            action: 'start',
            reusedExistingSession: liveSnapshot.status === 'connected',
          }),
        });
      }
    } catch (error) {
      if (!this.isTransientProviderError(error)) {
        return this.buildFailureResponse(baseCompany, storedSnapshot, error, 'Falha ao iniciar a sessão do Modal WhatsApp.');
      }
      this.logger.warn(`Modal WhatsApp start connect pending for company ${company.id}: ${this.toProviderError(error).message}`);
    }

    try {
      const immediateSnapshot = await this.fetchLiveSnapshot(company, { includeQr: true }, userId);
      liveSnapshot = this.isSessionReady(immediateSnapshot)
        ? immediateSnapshot
        : await this.waitForSessionReady(company, immediateSnapshot, userId);
      return this.buildResponse(baseCompany, liveSnapshot, {
        success: true,
        providerHealth: 'healthy',
        message: this.buildSessionActionMessage(liveSnapshot, {
          action: 'start',
          reusedExistingSession: false,
        }),
      });
    } catch (error) {
      this.logger.warn(`Modal WhatsApp start confirmation failed for company ${company.id}: ${this.toProviderError(error).message}`);
      if (!this.isTransientProviderError(error)) {
        return this.buildFailureResponse(baseCompany, storedSnapshot, error, 'Falha ao iniciar a sessão do Modal WhatsApp.');
      }
      return this.buildResponse(baseCompany, liveSnapshot, {
        success: true,
        providerHealth: 'unknown',
        message: this.buildPendingSessionMessage('start'),
        errorCode: this.isTransientProviderError(error) ? this.toProviderError(error).code : null,
      });
    }
  }

  async getCompanyQrCode(companyId: number, userId?: number, user?: any): Promise<WhatsAppModalResponse> {
    // Gate de conexão (Etapa 4): aplica somente quando há userId (fluxo de vendedor/gerente).
    if (userId && user !== undefined) {
      await this.assertConnectionGate(companyId, user, userId);
    }
    const baseCompany = await this.loadCompany(companyId);
    const company = userId ? this.patchCompanyWithTenantKey(baseCompany, this.buildUserTenantKey(baseCompany, userId)) : baseCompany;
    const storedSnapshot = await this.resolveStoredSnapshot(baseCompany, userId);
    const availabilityResponse = this.buildAvailabilityResponse(baseCompany, storedSnapshot, 'qr');
    if (availabilityResponse) {
      return availabilityResponse;
    }

    try {
      const connectSnapshot = await this.connectProviderSession(company, storedSnapshot);
      const liveSnapshot = connectSnapshot || await this.fetchLiveSnapshot(company, { includeQr: false }, userId);

      if (connectSnapshot) {
        await this.persistSnapshot(company, liveSnapshot, 'qr', userId);
      }

      if (!liveSnapshot.qrCodeDataUrl) {
        return this.buildResponse(baseCompany, liveSnapshot, {
          success: false,
          providerHealth: 'healthy',
          errorCode: 'WHATSAPP_MODAL_QR_UNAVAILABLE',
          message: this.buildQrUnavailableMessage(liveSnapshot),
        });
      }

      return this.buildResponse(baseCompany, liveSnapshot, {
        success: true,
        providerHealth: 'healthy',
        message: 'QR code atualizado com sucesso.',
      });
    } catch (error) {
      if (this.isTransientProviderError(error)) {
        return this.buildTransientFailureResponse(baseCompany, storedSnapshot, error, { success: false });
      }
      return this.buildFailureResponse(baseCompany, storedSnapshot, error, 'Falha ao obter o QR code do Modal WhatsApp.');
    }
  }

  async requestPairingCode(companyId: number, sessionId: string, phoneNumber: string): Promise<WhatsAppPairingCodeResponse> {
    const company = await this.loadCompany(companyId);
    const storedSnapshot = this.buildStoredSnapshot(company);
    const availabilityResponse = this.buildAvailabilityResponse(company, storedSnapshot, 'pairing');
    const tenantKey = this.resolveOperationalTenantKey(company);
    if (sessionId !== tenantKey) {
      throw new NotFoundException('Sessão WhatsApp não encontrada para esta empresa.');
    }
    if (availabilityResponse) {
      return this.buildPairingUnavailableResponse(tenantKey, availabilityResponse.message, availabilityResponse.errorCode || 'WHATSAPP_MODAL_UNAVAILABLE');
    }

    const normalizedPhone = this.normalizePairingPhoneOrThrow(phoneNumber);
    this.assertLeadTrialPairingPhoneAllowed(company, normalizedPhone);
    const latest = await this.fetchLiveSnapshot(company, { includeQr: false });
    if (latest.status === 'connected') {
      return {
        success: false,
        sessionId: tenantKey,
        status: 'connected',
        code: null,
        expiresInSeconds: 0,
        providerSupported: true,
        message: 'WhatsApp já está conectado nesta sessão.',
        errorCode: 'WHATSAPP_MODAL_ALREADY_CONNECTED',
      };
    }

    const rateLimitKey = `${tenantKey}:${normalizedPhone}`;
    const lastAttemptAt = this.recentPairingCodeAttemptAt.get(rateLimitKey);
    if (typeof lastAttemptAt === 'number' && Date.now() - lastAttemptAt < this.pairingCodeCooldownMs) {
      const nextAllowedAt = new Date(lastAttemptAt + this.pairingCodeCooldownMs);
      throw new HttpException({
        code: 'WHATSAPP_MODAL_PAIRING_RATE_LIMITED',
        message: 'Aguarde antes de gerar outro código de pareamento.',
        nextAllowedAt: nextAllowedAt.toISOString(),
      }, HttpStatus.TOO_MANY_REQUESTS);
    }

    try {
      const maskedPhone = this.maskPairingPhoneForLog(normalizedPhone);
      this.logger.log(`Modal WhatsApp pairing code requested for ${tenantKey} phone=${maskedPhone}.`);
      await this.resetProviderInstanceForPairing(tenantKey, latest.status);
      const providerPayload = await this.createAndConnectProviderForPairing(tenantKey, normalizedPhone, {
        retryExistingInstance: true,
      });
      const code = this.extractPairingCode(providerPayload);
      if (!code) {
        return this.buildPairingUnavailableResponse(
          tenantKey,
          'O Webwhats respondeu sem pairingCode. A instância provavelmente foi criada sem number ou já estava presa em modo QR.',
          'WHATSAPP_MODAL_PAIRING_CODE_EMPTY',
        );
      }
      this.recentPairingCodeAttemptAt.set(rateLimitKey, Date.now());
      this.logger.log(`pairing code extracted tenant=${tenantKey}`);

      const snapshot: ModalSnapshot = {
        ...latest,
        status: 'waiting_qr',
        lastError: null,
        updatedAt: new Date(),
        qrCodeDataUrl: null,
      };
      await this.persistSnapshot(company, snapshot, 'pairing_code');
      return {
        success: true,
        sessionId: tenantKey,
        status: 'code_generated',
        code,
        expiresInSeconds: this.pairingCodeTtlSeconds,
        providerSupported: true,
        message: 'Código de pareamento gerado.',
        errorCode: null,
      };
    } catch (error) {
      const providerError = this.toProviderError(error);
      if (providerError.code === 'WHATSAPP_MODAL_PAIRING_UNSUPPORTED' || providerError.statusCode === 404 || providerError.statusCode === 405) {
        return this.buildPairingUnavailableResponse(
          tenantKey,
          'Este motor suporta apenas QR Code. Para conectar sem câmera, precisamos ativar o modo pairing code ou Cloud API.',
          'WHATSAPP_MODAL_PAIRING_UNSUPPORTED',
        );
      }
      return this.buildPairingUnavailableResponse(tenantKey, providerError.message, providerError.code);
    }
  }

  async disconnectCompanySession(companyId: number, userId?: number): Promise<WhatsAppModalResponse> {
    const baseCompany = await this.loadCompany(companyId);
    const company = userId ? this.patchCompanyWithTenantKey(baseCompany, this.buildUserTenantKey(baseCompany, userId)) : baseCompany;
    const storedSnapshot = await this.resolveStoredSnapshot(baseCompany, userId);
    const availabilityResponse = this.buildAvailabilityResponse(baseCompany, storedSnapshot, 'disconnect');
    if (availabilityResponse) {
      return availabilityResponse;
    }

    const tenantKey = this.resolveOperationalTenantKey(company);
    this.logger.log(`Disconnecting Modal WhatsApp session for company ${company.id} (${tenantKey}).`);

    try {
      await this.logoutProviderSession(tenantKey);
    } catch (error) {
      if (!this.isMissingInstanceError(error)) {
        return this.buildFailureResponse(baseCompany, storedSnapshot, error, 'Falha ao desconectar a sessão do Modal WhatsApp.');
      }
    }

    // SUMIR VESTÍGIOS (18/06): desconectar APAGA a instância do motor (não só logout).
    // Sem isso, sobrava uma instância órfã "connecting/Iniciando" que o poll de status
    // ficava reanimando — o dono via o número antigo voltar e o backend "tentando
    // reconectar". Deletar na raiz garante que desconectou = não há mais rastro no motor.
    try {
      await this.deleteProviderInstance(tenantKey);
    } catch (error) {
      if (!this.isMissingInstanceError(error)) {
        this.logger.warn(`delete pos-disconnect falhou para ${tenantKey}: ${this.toProviderError(error).message}`);
      }
    }

    const optimisticSnapshot: ModalSnapshot = {
      ...storedSnapshot,
      status: 'disconnected',
      phone: null,
      connectedAt: null,
      lastError: null,
      updatedAt: new Date(),
      qrCodeDataUrl: null,
    };
    await this.persistSnapshot(company, optimisticSnapshot, 'disconnect', userId);

    return this.buildResponse(baseCompany, optimisticSnapshot, {
      success: true,
      providerHealth: 'healthy',
      message: 'Sessão desconectada do Modal WhatsApp.',
    });
  }

  // Troca do MODELO de atendimento (Etapa 5). Só admin-dono/master. Ao ir para 'shared', as sessões
  // ativas de NÃO-admin (vendedor/gerente) CONFLITAM (no shared só vale o número da empresa) e precisam
  // cair. Sem confirm → devolve a lista (nome+número) pro front confirmar. Com confirm → DESCONEXÃO
  // LIMPA reusando disconnectCompanySession (logout+delete do motor) — nunca soft-drop, pra não entrar
  // no loop de remontagem. Depois grava o modo.
  async setAttendanceMode(
    companyId: number,
    user: any,
    mode: string,
    confirm: boolean,
  ): Promise<{
    requiresConfirm?: boolean;
    affected?: Array<{ userId: number; name: string | null; phone: string | null }>;
    ok?: boolean;
    mode?: string;
    disconnected?: Array<{ userId: number; name: string | null; phone: string | null }>;
  }> {
    if (!this.isModalAdminOwner(user)) {
      throw new ForbiddenException('Só o admin da empresa troca o modelo de atendimento.');
    }
    const normalized = String(mode || '').trim().toLowerCase();
    if (normalized !== 'shared' && normalized !== 'individual') {
      throw new BadRequestException('Modelo inválido. Use "shared" ou "individual".');
    }

    let affected: Array<{ userId: number; name: string | null; phone: string | null }> = [];
    if (normalized === 'shared') {
      const sessions = await this.prisma.whatsAppConnectionSession.findMany({
        where: { companyId, provider: 'webwhats', status: 'active', userId: { not: null } },
        select: {
          userId: true,
          displayPhone: true,
          phoneNormalized: true,
          user: { select: { name: true, username: true, role: true, isSystemMaster: true, canViewBilling: true } },
        },
      });
      affected = sessions
        .filter((s) => {
          const u = s.user as any;
          const isAdminOwner =
            Boolean(u?.isSystemMaster) ||
            (String(u?.role || '').trim().toUpperCase() === 'ADMIN' && u?.canViewBilling !== false);
          return !isAdminOwner;
        })
        .map((s) => ({
          userId: Number(s.userId),
          name: (s.user as any)?.name || (s.user as any)?.username || null,
          phone: this.cleanDisplayPhone(s.displayPhone || s.phoneNormalized || null),
        }));
    }

    if (affected.length && !confirm) {
      return { requiresConfirm: true, affected };
    }

    const disconnected: Array<{ userId: number; name: string | null; phone: string | null }> = [];
    for (const a of affected) {
      try {
        await this.disconnectCompanySession(companyId, a.userId);
        disconnected.push(a);
      } catch (error) {
        this.logger.warn(`Falha ao desconectar userId=${a.userId} na troca de modo: ${this.toProviderError(error).message}`);
      }
    }

    await this.prisma.company.update({
      where: { id: companyId },
      data: { whatsappAttendanceMode: normalized },
    });

    return { ok: true, mode: normalized, disconnected };
  }

  async restartCompanySession(companyId: number, userId?: number): Promise<WhatsAppModalResponse> {
    const baseCompany = await this.loadCompany(companyId);
    const company = userId ? this.patchCompanyWithTenantKey(baseCompany, this.buildUserTenantKey(baseCompany, userId)) : baseCompany;
    const storedSnapshot = await this.resolveStoredSnapshot(baseCompany, userId);
    const availabilityResponse = this.buildAvailabilityResponse(baseCompany, storedSnapshot, 'restart');
    if (availabilityResponse) {
      return availabilityResponse;
    }

    const tenantKey = this.resolveOperationalTenantKey(company);
    this.logger.log(`Restarting Modal WhatsApp session for company ${company.id} (${tenantKey}).`);

    try {
      await this.restartProviderSession(tenantKey);
    } catch (error) {
      if (this.isMissingInstanceError(error)) {
        return this.startCompanySession(companyId, userId);
      }
      if (!this.isTransientProviderError(error)) {
        return this.buildFailureResponse(baseCompany, storedSnapshot, error, 'Falha ao reiniciar a sessão do Modal WhatsApp.');
      }
    }
    await this.tryConfigureProviderWebhook(tenantKey, 'restart');

    let optimisticSnapshot: ModalSnapshot = {
      ...storedSnapshot,
      status: 'starting',
      lastError: null,
      updatedAt: new Date(),
      qrCodeDataUrl: null,
    };
    await this.persistSnapshot(company, optimisticSnapshot, 'restart', userId);

    try {
      const connectSnapshot = await this.connectProviderSession(company, optimisticSnapshot);
      if (connectSnapshot) {
        optimisticSnapshot = connectSnapshot;
        await this.persistSnapshot(company, optimisticSnapshot, 'restart_connect', userId);
        return this.buildResponse(baseCompany, optimisticSnapshot, {
          success: true,
          providerHealth: 'healthy',
          message: this.buildSessionActionMessage(optimisticSnapshot, {
            action: 'restart',
            reusedExistingSession: optimisticSnapshot.status === 'connected',
          }),
        });
      }
    } catch (error) {
      if (!this.isTransientProviderError(error)) {
        return this.buildFailureResponse(baseCompany, storedSnapshot, error, 'Falha ao reiniciar a sessão do Modal WhatsApp.');
      }
      this.logger.warn(`Modal WhatsApp restart connect pending for company ${company.id}: ${this.toProviderError(error).message}`);
    }

    try {
      const immediateSnapshot = await this.fetchLiveSnapshot(company, { includeQr: true }, userId);
      optimisticSnapshot = this.isSessionReady(immediateSnapshot)
        ? immediateSnapshot
        : await this.waitForSessionReady(company, immediateSnapshot, userId);
      return this.buildResponse(baseCompany, optimisticSnapshot, {
        success: true,
        providerHealth: 'healthy',
        message: this.buildSessionActionMessage(optimisticSnapshot, {
          action: 'restart',
          reusedExistingSession: false,
        }),
      });
    } catch (error) {
      this.logger.warn(`Modal WhatsApp restart confirmation failed for company ${company.id}: ${this.toProviderError(error).message}`);
      if (!this.isTransientProviderError(error)) {
        return this.buildFailureResponse(baseCompany, storedSnapshot, error, 'Falha ao reiniciar a sessão do Modal WhatsApp.');
      }
      return this.buildResponse(baseCompany, optimisticSnapshot, {
        success: true,
        providerHealth: 'unknown',
        message: this.buildPendingSessionMessage('restart'),
        errorCode: this.isTransientProviderError(error) ? this.toProviderError(error).code : null,
      });
    }
  }

  private normalizeOptionalString(value: unknown) {
    const normalized = String(value || '').trim();
    return normalized || null;
  }

  private normalizeTrialPhone(value: unknown): string | null {
    const digits = String(value || '').replace(/\D+/g, '');
    if (!digits) return null;
    if (digits.length >= 12) return digits;
    if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
      return `55${digits}`;
    }
    return digits;
  }

  // Projecoes do estado canonico (PR-002 A.4): o motor do modal nao
  // re-deriva mais trial/pago de campos crus.
  private isTrialingCompany(company: Partial<CompanyModalFields>) {
    const access = resolveCompanyAccessState(company as any);
    return access.state === 'trial' || access.state === 'trial_ending';
  }

  private isLeadTrialingCompany(company: Partial<CompanyModalFields>) {
    const selectedPlanKey = String(company.selectedPlanKey || '').trim().toLowerCase();
    return selectedPlanKey === COMMERCIAL_PLAN_KEYS.PADRAO && this.isTrialingCompany(company);
  }

  private assertLeadTrialPairingPhoneAllowed(company: CompanyModalFields, phoneNumber: string) {
    if (!this.isLeadTrialingCompany(company)) return;

    const lockedPhone = this.normalizeTrialPhone(company.contactPhone);
    if (!lockedPhone) {
      throw new BadRequestException({
        code: 'TRIAL_CONTACT_PHONE_REQUIRED',
        message: 'Telefone do trial não encontrado. Acione o suporte para liberar o vínculo do WhatsApp.',
      });
    }

    const requestedPhone = this.normalizeTrialPhone(phoneNumber);
    if (requestedPhone !== lockedPhone) {
      throw new BadRequestException({
        code: 'TRIAL_WHATSAPP_PHONE_LOCKED',
        message: 'No trial HBX Lead Plus, vincule o WhatsApp ao telefone informado na ativação. Para trocar o telefone, acione o suporte.',
      });
    }
  }

  private isPaidOrActiveCompany(company: Partial<CompanyModalFields>) {
    const access = resolveCompanyAccessState(company as any);
    return access.state === 'paying' || access.state === 'manual' || access.state === 'exempt';
  }

  private buildTrialPhoneMetadata(company: CompanyModalFields, snapshot: ModalSnapshot, source: string) {
    return {
      source,
      whatsappModalStatus: snapshot.status,
      whatsappModalPhone: snapshot.phone,
      connectedAt: snapshot.connectedAt instanceof Date ? snapshot.connectedAt.toISOString() : null,
      provider: snapshot.provider,
      tenantKey: this.resolveOperationalTenantKey(company),
      recordedAt: new Date().toISOString(),
    };
  }

  // POR USUÁRIO (decisão do dono 18/06): a regra "1 número = 1 empresa / 1 usuário" foi
  // REMOVIDA DE VEZ. Ela fazia logout + DELETE da instância do número sempre que o número
  // já tinha sessão ativa — derrubando o número quando outro vendedor/contexto tocava
  // nele. Esse wipe era a causa do "recebe mas não envia" reincidente (status caía de
  // connected -> error -> offline). Cada usuário liga o SEU próprio número e tem a SUA
  // instância (`company-{id}-user-{userId}`); o motor já garante 1 socket por número.
  // Mantida como no-op (assinatura preservada) pra não quebrar os chamadores.
  private async enforceNumberNotSharedAcrossCompaniesOrBlock(
    _company: CompanyModalFields,
    _snapshot: ModalSnapshot,
    _source: string,
    _userId?: number,
  ): Promise<void> {
    return;
  }

  private async registerTrialPhoneUsageOrBlock(company: CompanyModalFields, phone: string | null, snapshot: ModalSnapshot, source: string) {
    const phoneNormalized = this.normalizeTrialPhone(phone);
    if (!phoneNormalized) return;

    const metadataJson = JSON.stringify(this.buildTrialPhoneMetadata(company, snapshot, source));
    const existing = await this.prisma.trialPhoneUsage.findUnique({
      where: { phoneNormalized },
    });

    if (!existing) {
      await this.prisma.trialPhoneUsage.create({
        data: {
          phoneNormalized,
          companyId: Number(company.id),
          firstTrialStartsAt: company.trialStartsAt || null,
          firstTrialEndsAt: company.trialEndsAt || null,
          source,
          metadataJson,
        },
      });
      return;
    }

    if (Number(existing.companyId || 0) === Number(company.id)) {
      await this.prisma.trialPhoneUsage.update({
        where: { phoneNormalized },
        data: {
          source,
          metadataJson,
        },
      });
      return;
    }

    if (this.isPaidOrActiveCompany(company)) {
      await this.prisma.trialPhoneUsage.update({
        where: { phoneNormalized },
        data: {
          metadataJson: JSON.stringify({
            ...this.buildTrialPhoneMetadata(company, snapshot, source),
            paidReuseCompanyId: Number(company.id),
            previousTrialCompanyId: existing.companyId || null,
          }),
        },
      });
      return;
    }

    if (this.isTrialingCompany(company)) {
      await this.prisma.company.update({
        where: { id: Number(company.id) },
        data: {
          // Trial reusando WhatsApp ja consumido = suspended (estado unico).
          status: 'suspended',
          statusChangedAt: new Date(),
          isActive: false,
          deactivatedAt: new Date(),
          whatsappModalLastError: 'Este WhatsApp já utilizou o trial HBX. Escolha um plano para continuar.',
          whatsappModalUpdatedAt: new Date(),
        },
      });
      throw new WhatsAppModalProviderError(
        'TRIAL_PHONE_ALREADY_USED',
        'Este WhatsApp já utilizou o trial HBX. Escolha um plano para continuar.',
        402,
      );
    }
  }

  private async hasActiveWebwhatsConnectionSession(companyId: number) {
    // 050-1: checa qualquer sessão ativa da empresa (legado company-{id} ou por-user).
    const session = await this.prisma.whatsAppConnectionSession.findFirst({
      where: {
        companyId: Number(companyId),
        provider: 'webwhats',
        status: 'active',
      },
      select: { id: true },
    });
    return Boolean(session?.id);
  }

  private parseSessionMetadataJson(value: unknown) {
    if (!value) return {};
    try {
      const parsed = JSON.parse(String(value));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, any> : {};
    } catch {
      return {};
    }
  }

  private async reconcileWebwhatsConnectionSession(
    company: CompanyModalFields,
    snapshot: ModalSnapshot,
    reason: string,
    userId?: number,
  ) {
    const tenantKey = userId
      ? this.buildUserTenantKey(company, userId)
      : this.resolveOperationalTenantKey(company);
    const now = new Date();
    const phoneNormalized = this.normalizeTrialPhone(snapshot.phone);
    const displayPhone = this.normalizeOptionalString(snapshot.phone);

    if (snapshot.status === 'connected') {
      const connectedAt = snapshot.connectedAt || company.whatsappModalConnectedAt || now;

      // IDENTIDADE DA SESSÃO É POR NÚMERO (não por empresa). Este é o ÚNICO escritor do
      // ciclo de vida da sessão (ingest/inbox só leem). Regra definitiva (mata o vazamento
      // de chat entre chips):
      //   - número conhecido → reusa a sessão DESTE número (qualquer status) e reativa →
      //     mesmo chip reconectando preserva o histórico;
      //   - número conhecido sem sessão própria → CRIA sessão nova (nunca relabela a do
      //     número anterior — telefone grava UMA vez e jamais é sobrescrito);
      //   - número ainda desconhecido (status conecta antes do número chegar) → não churn:
      //     mantém a sessão atual ou cria placeholder que recebe o número no próximo status
      //     (write-once a partir de null).
      const buildMeta = (prev?: unknown) =>
        JSON.stringify({
          ...this.parseSessionMetadataJson(prev),
          source: reason,
          rawStatus: snapshot.rawStatus,
          recordedAt: now.toISOString(),
        });

      const currentActive = await this.prisma.whatsAppConnectionSession.findFirst({
        where: { companyId: Number(company.id), provider: 'webwhats', tenantKey, status: 'active' },
        orderBy: [{ connectedAt: 'desc' }, { createdAt: 'desc' }],
        select: { id: true, phoneNormalized: true, displayPhone: true, metadataJson: true, userId: true },
      });

      let session: { id: string };

      if (!phoneNormalized) {
        if (currentActive?.id) {
          // wipedAt: null — ao reativar, apaga o wipe anterior. O wipe legítimo do MESMO
          // número é protegido pela supressão por-contato (WhatsAppAuditLog, number-aware),
          // que independe deste campo. Sem isso, o bootstrap do connect nasce floorado e o
          // inbox aparece vazio com sessão conectada.
          const data: any = { tenantKey, status: 'active', connectedAt, disconnectedAt: null, wipedAt: null, metadataJson: buildMeta(currentActive.metadataJson) };
          // 050-2: carimba dono se a sessão legada ainda não tem userId.
          if (userId && !(currentActive as any).userId) data.userId = userId;
          session = await this.prisma.whatsAppConnectionSession.update({
            where: { id: String(currentActive.id) },
            data,
            select: { id: true },
          });
        } else {
          session = await this.prisma.whatsAppConnectionSession.create({
            data: { companyId: Number(company.id), provider: 'webwhats', tenantKey, phoneNormalized: null, displayPhone: null, status: 'active', connectedAt, metadataJson: buildMeta(), userId: userId ?? null },
            select: { id: true },
          });
        }
      } else {
        const byPhone = await this.prisma.whatsAppConnectionSession.findFirst({
          where: { companyId: Number(company.id), provider: 'webwhats', tenantKey, phoneNormalized },
          orderBy: [{ connectedAt: 'desc' }, { createdAt: 'desc' }],
          select: { id: true, displayPhone: true, metadataJson: true, userId: true },
        });
        if (byPhone?.id) {
          // wipedAt: null — mesmo número reconectando: apaga wipe antigo para que o sync
          // do bootstrap não flore os chats. Proteção real é a supressão por-contato
          // (WhatsAppAuditLog) que continua ativa e é number-aware.
          const data: any = { tenantKey, status: 'active', connectedAt, disconnectedAt: null, wipedAt: null, metadataJson: buildMeta(byPhone.metadataJson) };
          if (displayPhone && !byPhone.displayPhone) data.displayPhone = displayPhone;
          if (userId && !byPhone.userId) data.userId = userId;
          session = await this.prisma.whatsAppConnectionSession.update({
            where: { id: String(byPhone.id) },
            data,
            select: { id: true },
          });
        } else if (currentActive?.id && !currentActive.phoneNormalized) {
          // Placeholder sem número → primeira atribuição (write-once a partir de null).
          // wipedAt: null pelo mesmo motivo: qualquer wipe anterior não deve floorar o
          // bootstrap do número recém-atribuído.
          const data: any = { tenantKey, status: 'active', connectedAt, disconnectedAt: null, wipedAt: null, phoneNormalized, displayPhone, metadataJson: buildMeta(currentActive.metadataJson) };
          if (userId && !(currentActive as any).userId) data.userId = userId;
          session = await this.prisma.whatsAppConnectionSession.update({
            where: { id: String(currentActive.id) },
            data,
            select: { id: true },
          });
        } else {
          // Número NOVO → sessão NOVA. Nunca toca na sessão do número anterior.
          session = await this.prisma.whatsAppConnectionSession.create({
            data: { companyId: Number(company.id), provider: 'webwhats', tenantKey, phoneNormalized, displayPhone, status: 'active', connectedAt, metadataJson: buildMeta(), userId: userId ?? null },
            select: { id: true },
          });
        }
      }

      // 050-1: Uma sessão ativa por TENANTKEY (= por usuário quando userId presente).
      // Não fecha sessões de OUTROS usuários — cada um mantém a sua.
      await this.prisma.whatsAppConnectionSession.updateMany({
        where: {
          companyId: Number(company.id),
          provider: 'webwhats',
          status: 'active',
          tenantKey,
          NOT: { id: String(session.id) },
        },
        data: {
          status: 'disconnected',
          disconnectedAt: now,
        },
      });

      return String(session.id);
    }

    if (
      snapshot.status === 'disconnected' ||
      snapshot.status === 'offline' ||
      snapshot.status === 'error' ||
      snapshot.status === 'waiting_qr'
    ) {
      await this.prisma.whatsAppConnectionSession.updateMany({
        where: {
          companyId: Number(company.id),
          provider: 'webwhats',
          status: 'active',
          tenantKey,
        },
        data: {
          status: 'disconnected',
          disconnectedAt: now,
        },
      });
      return null;
    }

    return company.currentWhatsappConnectionSessionId || null;
  }

  private sleep(delayMs: number) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  private isMissingInstanceMessage(value: unknown) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return false;
    return (
      (normalized.includes('instance') && normalized.includes('not found'))
      || (normalized.includes('session') && normalized.includes('not found'))
      || normalized === 'not_found'
    );
  }

  private isExistingInstanceMessage(value: unknown) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return false;
    return (
      (normalized.includes('instance') && normalized.includes('already exists'))
      || (normalized.includes('session') && normalized.includes('already exists'))
      || (normalized.includes('instance') && normalized.includes('exists'))
      || (normalized.includes('session') && normalized.includes('exists'))
      || normalized.includes('already in use')
      || normalized.includes('this name')
      || normalized === 'already_exists'
      || normalized === 'conflict'
    );
  }

  private isProviderAuthenticationMessage(value: unknown) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return false;
    return (
      normalized.includes('unauthorized')
      || normalized.includes('unauthorised')
      || normalized.includes('api key')
      || normalized.includes('apikey')
      || normalized.includes('invalid key')
      || normalized.includes('invalid token')
      || normalized.includes('authentication')
      || normalized.includes('auth')
    );
  }

  private isPairingResetNotConnectedMessage(value: unknown) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return false;
    return (
      normalized.includes('instance is not connected')
      || normalized.includes('session is not connected')
      || normalized.includes('instance is disconnected')
      || normalized.includes('not connected')
    );
  }

  private isMissingInstanceError(error: unknown) {
    const providerError = this.toProviderError(error);
    return providerError.statusCode === 404 || this.isMissingInstanceMessage(providerError.message);
  }

  private isExistingInstanceError(error: unknown) {
    const providerError = this.toProviderError(error);
    return providerError.statusCode === 409 || this.isExistingInstanceMessage(providerError.message);
  }

  private isTransientProviderError(error: unknown) {
    const providerError = this.toProviderError(error);
    return providerError.code === 'WHATSAPP_MODAL_TIMEOUT' || providerError.code === 'WHATSAPP_MODAL_UNAVAILABLE';
  }

  private shouldPreserveSessionDuringReconnectGrace(snapshot: ModalSnapshot) {
    const updatedAtMs = snapshot.updatedAt instanceof Date ? snapshot.updatedAt.getTime() : 0;
    if (snapshot.status === 'connected') {
      return Boolean(
        (snapshot.phone || snapshot.connectedAt)
        && updatedAtMs
        && Date.now() - updatedAtMs <= this.reconnectGraceMs,
      );
    }
    if (snapshot.status !== 'reconnecting') return false;
    return Boolean(updatedAtMs && Date.now() - updatedAtMs <= this.reconnectGraceMs);
  }

  private buildReconnectingSnapshot(fallback: ModalSnapshot, reason?: string | null): ModalSnapshot {
    return {
      ...fallback,
      status: 'reconnecting',
      phone: fallback.phone,
      connectedAt: fallback.connectedAt,
      lastError: reason || 'Webwhats instavel ou reiniciando. Aguardando reconexao antes de derrubar a sessao.',
      updatedAt: new Date(),
      qrCodeDataUrl: null,
      rawStatus: fallback.rawStatus,
    };
  }

  private async probeProviderHealth() {
    const rootReachable = await this.probeProviderPath('/', { allowNotFound: true });
    if (rootReachable) {
      return true;
    }

    return this.probeProviderPath('/instance/connectionState/company-health-probe');
  }

  private async probeProviderPath(path: string, options?: { allowNotFound?: boolean }) {
    const config = this.readConfig();
    if (!config.enabled || !config.configured || !config.internalUrl) {
      return false;
    }

    const url = `${config.internalUrl}${path.startsWith('/') ? path : `/${path}`}`;
    try {
      const response = await axios.request({
        method: 'GET',
        url,
        timeout: config.timeoutMs,
        headers: this.buildHeaders(config.apiKey),
        validateStatus: () => true,
      });
      return this.isProbeReachableStatus(response.status, options);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        return this.isProbeReachableStatus(error.response.status, options);
      }
      throw error;
    }
  }

  private isProbeReachableStatus(status: unknown, options?: { allowNotFound?: boolean }) {
    const normalizedStatus = Number(status || 0);
    if (!Number.isFinite(normalizedStatus) || normalizedStatus <= 0 || normalizedStatus >= 500) {
      return false;
    }
    if (normalizedStatus === 404 && !options?.allowNotFound) {
      return false;
    }
    return true;
  }

  private async createProviderInstance(tenantKey: string, phoneNumber?: string) {
    return this.requestProvider({
      method: 'POST',
      path: '/instance/create',
      purpose: 'criacao da instancia',
      data: this.buildSessionCreatePayload(tenantKey, phoneNumber),
    });
  }

  private async logoutProviderSession(tenantKey: string) {
    return this.requestProvider({
      method: 'DELETE',
      path: `/instance/logout/${encodeURIComponent(tenantKey)}`,
      purpose: 'logout da instancia',
      treatNotFoundAsNull: true,
    });
  }

  private async restartProviderSession(tenantKey: string) {
    return this.requestProvider({
      method: 'POST',
      path: `/instance/restart/${encodeURIComponent(tenantKey)}`,
      purpose: 'reinicio da instancia',
    });
  }

  private async deleteProviderInstance(tenantKey: string) {
    return this.requestProvider({
      method: 'DELETE',
      path: `/instance/delete/${encodeURIComponent(tenantKey)}`,
      purpose: 'remocao da instancia',
      treatNotFoundAsNull: true,
    });
  }

  private async resetProviderInstanceForPairing(tenantKey: string, status?: WhatsAppModalStatus | null) {
    this.recentConnectAttemptAt.delete(tenantKey);
    this.qrCodeCache.delete(tenantKey);
    if (status === 'connected') {
      await this.runSafeProviderResetStep(tenantKey, 'logout', () => this.logoutProviderSession(tenantKey));
      await this.runSafeProviderResetStep(tenantKey, 'delete', () => this.deleteProviderInstance(tenantKey));
      return;
    }
    await this.runSafeProviderResetStep(tenantKey, 'delete', () => this.deleteProviderInstance(tenantKey));
  }

  private async runSafeProviderResetStep(
    tenantKey: string,
    step: 'logout' | 'delete',
    action: () => Promise<unknown>,
  ) {
    try {
      await action();
    } catch (error) {
      const providerError = this.toProviderError(error);
      const notConnectedReset = providerError.statusCode === 400 && this.isPairingResetNotConnectedMessage(providerError.message);
      if (notConnectedReset) {
        if (step === 'logout') {
          this.logger.warn(`pairing reset ignored logout because instance is not connected tenant=${tenantKey}`);
        } else {
          this.logger.warn(
            `Modal WhatsApp reset pairing ${step} ignorado para ${tenantKey}: ${providerError.message}`,
          );
        }
        return;
      }
      if (
        this.isMissingInstanceError(providerError)
        || providerError.statusCode === 404
        || providerError.statusCode === 405
        || this.isTransientProviderError(providerError)
      ) {
        this.logger.warn(
          `Modal WhatsApp reset pairing ${step} ignorado para ${tenantKey}: ${providerError.message}`,
        );
        return;
      }
      throw providerError;
    }
  }

  private async createAndConnectProviderForPairing(
    tenantKey: string,
    phoneNumber: string,
    options?: { retryExistingInstance?: boolean },
  ) {
    const createPayload = await this.createProviderInstanceForPairing(tenantKey, phoneNumber, {
      retryExistingInstance: options?.retryExistingInstance !== false,
    });
    await this.tryConfigureProviderWebhook(tenantKey, 'pairing_code');

    this.recentConnectAttemptAt.delete(tenantKey);
    const connectPayload = await this.requestProvider({
      method: 'GET',
      path: `/instance/connect/${encodeURIComponent(tenantKey)}`,
      purpose: 'conexao da instancia para codigo de pareamento',
      treatNotFoundAsNull: true,
    });
    if (this.extractPairingCode(connectPayload)) {
      return connectPayload;
    }
    if (this.extractPairingCode(createPayload)) {
      return createPayload;
    }

    const statusPayload = await this.fetchProviderConnectionStateForPairing(tenantKey);
    if (this.extractPairingCode(statusPayload)) {
      return statusPayload;
    }

    try {
      return await this.requestProviderPairingCode(tenantKey, phoneNumber);
    } catch (error) {
      const providerError = this.toProviderError(error);
      if (providerError.code === 'WHATSAPP_MODAL_PAIRING_UNSUPPORTED' || providerError.statusCode === 404 || providerError.statusCode === 405) {
        return connectPayload || createPayload || statusPayload;
      }
      throw providerError;
    }
  }

  private async createProviderInstanceForPairing(
    tenantKey: string,
    phoneNumber: string,
    options?: { retryExistingInstance?: boolean },
  ) {
    const retryDelaysMs = options?.retryExistingInstance === false ? [0] : [0, 800, 1600, 2600];
    let lastExistingInstanceError: WhatsAppModalProviderError | null = null;

    for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
      if (retryDelaysMs[attempt] > 0) {
        await this.sleep(retryDelaysMs[attempt]);
      }

      try {
        this.logger.log(`pairing creating instance with number tenant=${tenantKey} phone=${this.maskPairingPhoneForLog(phoneNumber)}`);
        return await this.createProviderInstance(tenantKey, phoneNumber);
      } catch (error) {
        const providerError = this.toProviderError(error);
        if (options?.retryExistingInstance === false || !this.isExistingInstanceError(providerError)) {
          throw providerError;
        }

        lastExistingInstanceError = providerError;
        this.logger.warn(
          `Modal WhatsApp instancia existente durante pairing para ${tenantKey} tentativa=${attempt + 1}/${retryDelaysMs.length}: ` +
            `${providerError.message}. Resetando e aguardando exclusao antes de recriar com number.`,
        );
        await this.resetProviderInstanceForPairing(tenantKey);
      }
    }

    throw lastExistingInstanceError || new WhatsAppModalProviderError(
      'WHATSAPP_MODAL_HTTP_ERROR',
      'Instância WhatsApp já existe ou está em uso durante criacao da instancia.',
    );
  }

  private async fetchProviderConnectionStateForPairing(tenantKey: string) {
    try {
      return await this.requestProvider({
        method: 'GET',
        path: `/instance/connectionState/${encodeURIComponent(tenantKey)}`,
        purpose: 'status da instancia para codigo de pareamento',
        treatNotFoundAsNull: true,
      });
    } catch (error) {
      const providerError = this.toProviderError(error);
      if (providerError.statusCode === 404 || providerError.statusCode === 405 || this.isMissingInstanceError(providerError)) {
        return null;
      }
      throw providerError;
    }
  }

  private async connectProviderSession(company: CompanyModalFields, fallback: ModalSnapshot) {
    const tenantKey = this.resolveOperationalTenantKey(company);
    if (this.shouldThrottleConnectAttempt(tenantKey, fallback)) {
      return this.reconcileTransientSnapshot(
        tenantKey,
        await this.fetchLiveSnapshot(company, { includeQr: false }),
      );
    }

    this.recentConnectAttemptAt.set(tenantKey, Date.now());
    let payload: unknown = null;

    try {
      payload = await this.requestProvider({
        method: 'GET',
        path: `/instance/connect/${encodeURIComponent(tenantKey)}`,
        purpose: 'conexao da instancia',
        treatNotFoundAsNull: true,
      });
    } catch (error) {
      const providerError = this.toProviderError(error);
      if (this.isMissingInstanceError(providerError)) {
        return null;
      }
      throw providerError;
    }

    if (!payload || this.isMissingInstancePayload(payload)) {
      return null;
    }

    await this.tryConfigureProviderWebhook(tenantKey, 'connect');

    return this.reconcileTransientSnapshot(tenantKey, await this.extractSnapshot(payload, fallback));
  }

  private shouldThrottleConnectAttempt(tenantKey: string, fallback: ModalSnapshot) {
    if (fallback.status !== 'starting' && fallback.status !== 'waiting_qr') {
      return false;
    }

    const lastAttemptAt = this.recentConnectAttemptAt.get(tenantKey);
    return typeof lastAttemptAt === 'number' && Date.now() - lastAttemptAt < this.connectAttemptCooldownMs;
  }

  private reconcileTransientSnapshot(tenantKey: string, snapshot: ModalSnapshot): ModalSnapshot {
    const normalizedStatus = snapshot.status;

    if (snapshot.qrCodeDataUrl) {
      this.qrCodeCache.set(tenantKey, {
        dataUrl: snapshot.qrCodeDataUrl,
        capturedAtMs: Date.now(),
      });
    } else if (normalizedStatus === 'starting' || normalizedStatus === 'waiting_qr') {
      const cachedQr = this.qrCodeCache.get(tenantKey);
      if (cachedQr && Date.now() - cachedQr.capturedAtMs <= this.qrCodeCacheTtlMs) {
        return {
          ...snapshot,
          status: 'waiting_qr',
          qrCodeDataUrl: cachedQr.dataUrl,
        };
      }
    } else {
      this.qrCodeCache.delete(tenantKey);
    }

    if (
      normalizedStatus === 'connected'
      || normalizedStatus === 'offline'
      || normalizedStatus === 'disconnected'
      || normalizedStatus === 'error'
    ) {
      this.recentConnectAttemptAt.delete(tenantKey);
    }

    return snapshot;
  }

  private normalizeDate(value: unknown) {
    if (!value) return null;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private toIso(value: Date | null | undefined) {
    return value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString() : null;
  }

  private clampTimeout(value: unknown) {
    const parsed = Number(value || 15000);
    if (!Number.isFinite(parsed)) return 15000;
    return Math.max(1000, Math.min(30000, Math.trunc(parsed)));
  }

  private readModalApiKey() {
    return this.normalizeOptionalString(process.env.WHATSAPP_MODAL_API_KEY);
  }

  private readConfig(): ModalConfig {
    const enabled = ['1', 'true', 'yes', 'on'].includes(
      String(process.env.WHATSAPP_MODAL_ENABLED || '').trim().toLowerCase(),
    );
    const internalUrl = this.normalizeOptionalString(process.env.WHATSAPP_MODAL_INTERNAL_URL)?.replace(/\/+$/, '') || null;
    const apiKey = this.readModalApiKey();
    const missingConfigKeys: string[] = [];

    if (!internalUrl) missingConfigKeys.push('WHATSAPP_MODAL_INTERNAL_URL');
    if (!apiKey) missingConfigKeys.push('WHATSAPP_MODAL_API_KEY');

    const configured = Boolean(internalUrl && apiKey);
    const setupHint = !enabled
      ? 'Integração Modal WhatsApp desativada por ambiente.'
      : configured
        ? null
        : this.buildMisconfiguredMessage({
            enabled,
            configured,
            available: enabled && configured,
            internalUrl,
            apiKey,
            timeoutMs: this.clampTimeout(process.env.WHATSAPP_MODAL_TIMEOUT_MS),
            missingConfigKeys,
            setupHint: null,
          });

    return {
      enabled,
      configured,
      available: enabled && configured,
      internalUrl,
      apiKey,
      timeoutMs: this.clampTimeout(process.env.WHATSAPP_MODAL_TIMEOUT_MS),
      missingConfigKeys,
      setupHint,
    };
  }

  private buildMisconfiguredMessage(config: ModalConfig) {
    if (!config.missingConfigKeys.length) {
      return 'Integração Modal WhatsApp indisponível neste ambiente.';
    }

    return `Integração Modal WhatsApp incompleta. Configure ${config.missingConfigKeys.join(', ')}.`;
  }

  private buildTenantKey(company: Pick<CompanyModalFields, 'id'>) {
    return `company-${Number(company.id)}`;
  }

  // WhatsApp é POR USUÁRIO (decisão do dono 18/06): cada vendedor/admin liga o SEU
  // próprio número, então cada usuário tem a SUA instância no motor —
  // `company-{id}-user-{userId}`. Sem userId (automação/sistema/legado) usa a chave da
  // empresa `company-{id}`. Compartilhar UM número entre admin e vendedores é REGRESSÃO
  // (vira N sockets no mesmo número brigando = "recebe mas não envia"); por isso cada
  // usuário liga o próprio número e tem a própria sessão.
  private buildUserTenantKey(company: Pick<CompanyModalFields, 'id'>, userId: number | null | undefined) {
    if (!userId) return this.buildTenantKey(company);
    return `company-${Number(company.id)}-user-${Number(userId)}`;
  }

  // Sobrepõe o currentWhatsappConnectionSession da empresa com uma sessão virtual
  // de tenantKey específico. Permite que métodos internos que usam
  // resolveOperationalTenantKey(company) enxerguem a chave correta sem precisar
  // repassar userId por toda a cadeia privada.
  private patchCompanyWithTenantKey(company: CompanyModalFields, tenantKey: string): CompanyModalFields {
    return {
      ...company,
      currentWhatsappConnectionSession: {
        id: String(company.currentWhatsappConnectionSessionId || '_virtual'),
        provider: 'webwhats',
        tenantKey,
        status: 'active',
      },
    };
  }

  // POR USUÁRIO: a instância operacional é a da SESSÃO ATIVA (per-user
  // `company-{id}-user-{userId}` quando o contexto tem userId; senão a da empresa).
  private resolveOperationalTenantKey(company: Pick<CompanyModalFields, 'id' | 'currentWhatsappConnectionSession'>) {
    const current = company.currentWhatsappConnectionSession;
    if (
      current &&
      String(current.provider || '').trim().toLowerCase() === 'webwhats' &&
      String(current.status || '').trim().toLowerCase() === 'active'
    ) {
      const tenantKey = this.normalizeOptionalString(current.tenantKey);
      if (tenantKey) return tenantKey;
    }
    return this.buildTenantKey(company);
  }

  private buildSessionCreatePayload(tenantKey: string, phoneNumber?: string) {
    const payload: Record<string, unknown> = {
      instanceName: tenantKey,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
    };
    const normalizedPhone = this.normalizeOptionalString(phoneNumber)?.replace(/\D/g, '') || '';
    if (normalizedPhone) {
      payload.number = normalizedPhone;
    }
    return payload;
  }

  private normalizePairingPhoneOrThrow(value: unknown) {
    const normalized = String(value || '').replace(/\D/g, '');
    if (!/^[1-9]\d{7,14}$/.test(normalized)) {
      throw new BadRequestException('Informe o telefone com DDI, exemplo +5519999999999.');
    }
    return normalized;
  }

  private maskPairingPhoneForLog(phoneNumber: string) {
    const digits = String(phoneNumber || '').replace(/\D/g, '');
    const suffix = digits.slice(-4) || '****';
    return `****${suffix}`;
  }

  private buildPairingUnavailableResponse(
    tenantKey: string,
    message: string,
    errorCode: WhatsAppModalErrorCode,
  ): WhatsAppPairingCodeResponse {
    return {
      success: false,
      sessionId: tenantKey,
      status: errorCode === 'WHATSAPP_MODAL_ALREADY_CONNECTED' ? 'connected' : 'error',
      code: null,
      expiresInSeconds: 0,
      providerSupported: errorCode !== 'WHATSAPP_MODAL_PAIRING_UNSUPPORTED',
      message,
      errorCode,
    };
  }

  private buildPairingCodeRequestPayload(tenantKey: string, phoneNumberWithoutPlus: string) {
    return {
      instanceName: tenantKey,
      phoneNumber: phoneNumberWithoutPlus,
      number: phoneNumberWithoutPlus,
    };
  }

  private buildPairingCodePaths(tenantKey: string) {
    const encoded = encodeURIComponent(tenantKey);
    const configured = this.normalizeOptionalString(process.env.WHATSAPP_MODAL_PAIRING_CODE_PATH_TEMPLATE);
    const paths = configured
      ? [configured.replace(/\{tenantKey\}/g, encoded).replace(/\{instance\}/g, encoded)]
      : [
          `/instance/requestPairingCode/${encoded}`,
          `/instance/pairing-code/${encoded}`,
          `/instance/connect/${encoded}`,
        ];
    return Array.from(new Set(paths));
  }

  private async requestProviderPairingCode(tenantKey: string, phoneNumberWithoutPlus: string) {
    const payload = this.buildPairingCodeRequestPayload(tenantKey, phoneNumberWithoutPlus);
    let lastError: unknown = null;
    for (const path of this.buildPairingCodePaths(tenantKey)) {
      try {
        return await this.requestProvider({
          method: 'POST',
          path,
          purpose: 'codigo de pareamento da instancia',
          data: payload,
        });
      } catch (error) {
        const providerError = this.toProviderError(error);
        lastError = providerError;
        if (providerError.statusCode !== 404 && providerError.statusCode !== 405) {
          throw providerError;
        }
      }
    }
    throw lastError || new WhatsAppModalProviderError(
      'WHATSAPP_MODAL_PAIRING_UNSUPPORTED',
      'Provider sem endpoint de pairing code.',
      404,
    );
  }

  private extractPairingCode(payload: unknown): string | null {
    const { root, rootData } = this.extractPayloadParts(payload);
    const data = this.asRecord(rootData.data) || rootData;
    const response = this.asRecord(rootData.response) || this.asRecord(root.response) || this.asRecord(data.response) || null;
    const instance = this.asRecord(rootData.instance) || this.asRecord(root.instance) || null;
    const responseInstance = this.asRecord(response?.instance) || null;
    const qrcode =
      this.asRecord(rootData.qrcode)
      || this.asRecord(rootData.qr)
      || this.asRecord(data.qrcode)
      || this.asRecord(data.qr)
      || this.asRecord(response?.qrcode)
      || this.asRecord(response?.qr)
      || this.asRecord(root.qrcode)
      || this.asRecord(root.qr)
      || this.asRecord(instance?.qrcode)
      || this.asRecord(instance?.qr)
      || this.asRecord(responseInstance?.qrcode)
      || this.asRecord(responseInstance?.qr)
      || null;
    const code = this.firstString(
      qrcode?.pairingCode,
      qrcode?.pairing_code,
      qrcode?.code,
      qrcode?.pairCode,
      rootData.pairingCode,
      rootData.pairing_code,
      rootData.code,
      rootData.pairCode,
      data.pairingCode,
      data.pairing_code,
      data.code,
      data.pairCode,
      response?.pairingCode,
      response?.pairing_code,
      response?.code,
      response?.pairCode,
      root.pairingCode,
      root.pairing_code,
      root.code,
      root.pairCode,
    );
    if (!code) return null;
    return code.replace(/\s+/g, '').toUpperCase();
  }

  private buildProviderWebhookEvents() {
    const configured = this.normalizeOptionalString(process.env.WHATSAPP_MODAL_WEBHOOK_EVENTS || process.env.WEBWHATS_WEBHOOK_EVENTS);
    if (configured) {
      const events = configured
        .split(',')
        .map((event) => event.trim().toUpperCase())
        .filter(Boolean);
      if (events.length) return events;
    }

    return [
      'MESSAGES_UPSERT',
      'MESSAGES_UPDATE',
      'MESSAGES_DELETE',
      'SEND_MESSAGE',
      'CONNECTION_UPDATE',
      'LOGOUT_INSTANCE',
    ];
  }

  private normalizeAbsoluteWebhookUrl(value: unknown) {
    const normalized = this.normalizeOptionalString(value);
    if (!normalized) return null;

    try {
      const parsed = new URL(normalized);
      if (!['http:', 'https:'].includes(parsed.protocol)) return null;
      parsed.searchParams.delete('companyId');
      parsed.searchParams.delete('company_id');
      return parsed.toString();
    } catch {
      return null;
    }
  }

  private buildProviderWebhookUrl() {
    const publicBase = this.normalizeOptionalString(process.env.PUBLIC_API_BASE_URL);
    if (publicBase) {
      return this.normalizeAbsoluteWebhookUrl(`${publicBase.replace(/\/+$/, '')}/webhooks/webwhats/events`);
    }

    const fallbackBase = this.normalizeOptionalString(process.env.API_PUBLIC_URL || process.env.BACKEND_PUBLIC_URL);
    if (fallbackBase) {
      return this.normalizeAbsoluteWebhookUrl(`${fallbackBase.replace(/\/+$/, '')}/webhooks/webwhats/events`);
    }

    return this.normalizeAbsoluteWebhookUrl(process.env.WHATSAPP_MODAL_WEBHOOK_URL || process.env.WEBWHATS_WEBHOOK_URL);
  }

  private redactWebhookUrlForLog(url: string) {
    try {
      const parsed = new URL(url);
      if (parsed.search) parsed.search = '?[redacted]';
      return parsed.toString();
    } catch {
      return '[invalid_webhook_url]';
    }
  }

  private buildProviderWebhookPayload(webhookUrl: string) {
    return {
      webhook: {
        enabled: true,
        url: webhookUrl,
        events: this.buildProviderWebhookEvents(),
        byEvents: false,
        base64: false,
      },
    };
  }

  private stringifyProviderBodyForLog(value: unknown, depth = 0): string {
    try {
      return JSON.stringify(this.sanitizeProviderBodyForLog(value, depth));
    } catch {
      return '{"error":"body_unserializable"}';
    }
  }

  private sanitizeProviderBodyForLog(value: unknown, depth = 0): unknown {
    if (depth > 8) return '[max-depth]';
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') {
      return value.length > 2000 ? `${value.slice(0, 2000)}...[truncated:${value.length}]` : value;
    }
    if (typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.slice(0, 80).map((item) => this.sanitizeProviderBodyForLog(item, depth + 1));

    const output: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      const normalizedKey = key.toLowerCase();
      if (
        normalizedKey.includes('apikey') ||
        normalizedKey.includes('api_key') ||
        normalizedKey.includes('authorization') ||
        normalizedKey.includes('password') ||
        normalizedKey.includes('secret') ||
        normalizedKey.includes('token')
      ) {
        output[key] = '[redacted]';
        continue;
      }
      output[key] = this.sanitizeProviderBodyForLog(raw, depth + 1);
    }
    return output;
  }

  private getProviderRequestUrl(path: string, internalUrl: string) {
    return `${internalUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private async requestProviderDiagnostic(options: ExternalRequestOptions & { instance: string }): Promise<ProviderDiagnosticResponse> {
    const config = this.readConfig();
    if (!config.enabled) {
      throw new WhatsAppModalProviderError('WHATSAPP_MODAL_DISABLED', 'Integração Modal WhatsApp desativada por ambiente.');
    }
    if (!config.configured || !config.internalUrl) {
      throw new WhatsAppModalProviderError('WHATSAPP_MODAL_NOT_CONFIGURED', this.buildMisconfiguredMessage(config));
    }

    const url = this.getProviderRequestUrl(options.path, config.internalUrl);
    const startedAt = Date.now();

    try {
      const response = await axios.request({
        method: options.method,
        url,
        data: options.data,
        timeout: config.timeoutMs,
        headers: this.buildHeaders(config.apiKey),
        validateStatus: () => true,
      });
      const result = {
        method: options.method,
        path: options.path,
        url,
        status: response.status,
        body: response.data,
        durationMs: Date.now() - startedAt,
      };
      const logMessage =
        `Modal WhatsApp ${options.purpose} instance=${options.instance} url=${url} status=${response.status} ` +
        `durationMs=${result.durationMs} body=${this.stringifyProviderBodyForLog(response.data)}`;
      if (response.status >= 200 && response.status < 300) {
        this.logger.log(logMessage);
      } else {
        this.logger.warn(logMessage);
      }
      return result;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status || 0;
        this.logger.warn(
          `Modal WhatsApp ${options.purpose} failed instance=${options.instance} url=${url} status=${status || 'n/a'} ` +
            `body=${this.stringifyProviderBodyForLog(error.response?.data)} message=${error.message}`,
        );
        throw this.mapAxiosError(error, options.purpose);
      }
      throw error;
    }
  }

  private parseProviderBoolean(value: unknown) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const normalized = String(value ?? '').trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    return null;
  }

  private normalizeProviderWebhookSettings(payload: unknown) {
    const root = this.asRecord(payload) || {};
    const webhook = this.asRecord(root.webhook);
    const nestedWebhook = this.asRecord(webhook?.webhook);
    const data = this.asRecord(root.data);
    const dataWebhook = this.asRecord(data?.webhook);
    const source = nestedWebhook || dataWebhook || webhook || data || root;

    const eventsRaw = Array.isArray(source.events)
      ? source.events
      : Array.isArray(root.events)
        ? root.events
        : [];

    return {
      enabled: this.parseProviderBoolean(source.enabled ?? root.enabled),
      url: this.firstString(source.url, root.url),
      byEvents: this.parseProviderBoolean(
        source.byEvents ??
          source.webhookByEvents ??
          source.webhook_by_events ??
          root.byEvents ??
          root.webhookByEvents ??
          root.webhook_by_events,
      ),
      base64: this.parseProviderBoolean(
        source.base64 ??
          source.webhookBase64 ??
          source.webhook_base64 ??
          root.base64 ??
          root.webhookBase64 ??
          root.webhook_base64,
      ),
      events: eventsRaw.map((event) => String(event || '').trim().toUpperCase()).filter(Boolean),
    };
  }

  private validateProviderWebhookSettings(payload: unknown, expectedUrl: string, requiredEvents: string[]) {
    const settings = this.normalizeProviderWebhookSettings(payload);
    const configuredEvents = new Set(settings.events);
    const missingEvents = requiredEvents.filter((event) => !configuredEvents.has(event));
    const mismatches: string[] = [];

    if (settings.enabled !== true) mismatches.push(`enabled=${String(settings.enabled)}`);
    if (settings.url !== expectedUrl) mismatches.push(`url=${settings.url || 'null'}`);
    if (settings.byEvents !== false) mismatches.push(`byEvents=${String(settings.byEvents)}`);
    if (settings.base64 !== false) mismatches.push(`base64=${String(settings.base64)}`);
    if (missingEvents.length) mismatches.push(`missingEvents=${missingEvents.join(',')}`);

    return {
      ok: mismatches.length === 0,
      settings,
      missingEvents,
      mismatches,
    };
  }

  private async tryConfigureProviderWebhook(tenantKey: string, reason: string) {
    const webhookUrl = this.buildProviderWebhookUrl();
    if (!webhookUrl) {
      this.logger.warn(
        'Webhook WebWhats automatico nao configurado. Defina PUBLIC_API_BASE_URL apontando para o backend publico.',
      );
      return;
    }

    const lastAttemptAt = this.recentWebhookConfigureAt.get(tenantKey);
    if (typeof lastAttemptAt === 'number' && Date.now() - lastAttemptAt < this.webhookConfigureCooldownMs) {
      return;
    }
    this.recentWebhookConfigureAt.set(tenantKey, Date.now());

    const requiredEvents = this.buildProviderWebhookEvents();
    const setPath = `/webhook/set/${encodeURIComponent(tenantKey)}`;
    const findPath = `/webhook/find/${encodeURIComponent(tenantKey)}`;

    try {
      const setResult = await this.requestProviderDiagnostic({
        method: 'POST',
        path: setPath,
        purpose: 'configuracao do webhook da instancia',
        data: this.buildProviderWebhookPayload(webhookUrl),
        instance: tenantKey,
      });

      if (setResult.status < 200 || setResult.status >= 300) {
        this.logger.warn(
          `Webhook WebWhats set falhou instance=${tenantKey} url=${setResult.url} status=${setResult.status} ` +
            `body=${this.stringifyProviderBodyForLog(setResult.body)}`,
        );
        return;
      }

      const findResult = await this.requestProviderDiagnostic({
        method: 'GET',
        path: findPath,
        purpose: 'validacao do webhook da instancia',
        instance: tenantKey,
      });

      if (findResult.status < 200 || findResult.status >= 300) {
        this.logger.warn(
          `Webhook WebWhats find falhou instance=${tenantKey} url=${findResult.url} status=${findResult.status} ` +
            `body=${this.stringifyProviderBodyForLog(findResult.body)}`,
        );
        return;
      }

      const validation = this.validateProviderWebhookSettings(findResult.body, webhookUrl, requiredEvents);
      if (!validation.ok) {
        this.logger.warn(
          `Webhook WebWhats validacao falhou instance=${tenantKey} expectedUrl=${webhookUrl} ` +
            `mismatches=${validation.mismatches.join('; ')} body=${this.stringifyProviderBodyForLog(findResult.body)}`,
        );
        return;
      }

      this.logger.log(
        `Webhook WebWhats configurado e validado instance=${tenantKey} url=${this.redactWebhookUrlForLog(webhookUrl)} ` +
          `events=${requiredEvents.join(',')}`,
      );
    } catch (error) {
      const providerError = this.toProviderError(error);
      this.logger.warn(
        `Webhook WebWhats nao configurado para ${tenantKey} durante ${reason}: ${providerError.message}`,
      );
    }
  }

  private normalizeStoredStatus(value: unknown): WhatsAppModalStatus {
    const normalized = String(value || '').trim().toUpperCase();
    if (normalized === 'STARTING') return 'starting';
    if (normalized === 'WAITING_QR') return 'waiting_qr';
    if (normalized === 'CONNECTED') return 'connected';
    if (normalized === 'RECONNECTING' || normalized === 'UNSTABLE') return 'reconnecting';
    if (normalized === 'DISCONNECTED') return 'disconnected';
    if (normalized === 'ERROR') return 'error';
    return 'offline';
  }

  private buildStoredSnapshot(company: CompanyModalFields): ModalSnapshot {
    return {
      status: this.normalizeStoredStatus(company.whatsappModalStatus),
      phone: this.normalizeOptionalString(company.whatsappModalPhone),
      connectedAt: company.whatsappModalConnectedAt || null,
      lastError: this.normalizeOptionalString(company.whatsappModalLastError),
      updatedAt: company.whatsappModalUpdatedAt || null,
      provider: 'external_modal',
      qrCodeDataUrl: null,
      rawStatus: null,
    };
  }

  // POR USUÁRIO (18/06): o estado MOSTRADO no modal de um usuário vem da SESSÃO DELE
  // (`WhatsAppConnectionSession` do tenantKey `company-{id}-user-{userId}`), NÃO da linha
  // da empresa. Sem isso, o número/status de quem conectou vazava pra TODOS os usuários
  // (o dono viu o mesmo "+55 (19) 9..." e "Aguardando reconexão" no admin e no vendedor).
  // Usuário sem sessão própria = offline limpo (sem número). É o que separa de verdade.
  private async buildUserStoredSnapshot(company: CompanyModalFields, userId: number): Promise<ModalSnapshot> {
    const tenantKey = this.buildUserTenantKey(company, userId);
    const session = await this.prisma.whatsAppConnectionSession.findFirst({
      where: { companyId: Number(company.id), provider: 'webwhats', tenantKey },
      orderBy: [{ connectedAt: 'desc' }, { createdAt: 'desc' }],
      select: { status: true, displayPhone: true, connectedAt: true, updatedAt: true },
    });
    const active = session?.status === 'active';
    return {
      status: active ? 'connected' : session?.status === 'disconnected' ? 'disconnected' : 'offline',
      phone: active ? this.normalizeOptionalString(session?.displayPhone) : null,
      connectedAt: active ? session?.connectedAt || null : null,
      lastError: null,
      updatedAt: session?.updatedAt || null,
      provider: 'external_modal',
      qrCodeDataUrl: null,
      rawStatus: null,
    };
  }

  // Resolve o snapshot gravado conforme o contexto: por-usuário quando há userId,
  // senão o legado da empresa (sistema/automação).
  private async resolveStoredSnapshot(company: CompanyModalFields, userId?: number): Promise<ModalSnapshot> {
    return userId ? this.buildUserStoredSnapshot(company, userId) : this.buildStoredSnapshot(company);
  }

  private buildHeaders(apiKey: string | null) {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (apiKey) {
      headers.apikey = apiKey;
    }

    return headers;
  }

  private asRecord(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  }

  private firstString(...values: unknown[]) {
    for (const value of values) {
      if (Array.isArray(value)) {
        const nested = this.firstString(...value);
        if (nested) return nested;
        continue;
      }
      if (value && typeof value === 'object') continue;
      const normalized = this.normalizeOptionalString(value);
      if (normalized) return normalized;
    }
    return null;
  }

  private extractPayloadParts(payload: unknown) {
    const root = this.asRecord(payload) || {};
    const rootData = this.asRecord(root.data) || root;
    return {
      root,
      rootData,
    };
  }

  private getPayloadMessage(payload: unknown) {
    const { root, rootData } = this.extractPayloadParts(payload);
    return this.firstString(
      rootData.message,
      root.message,
      rootData.error,
      root.error,
      rootData.detail,
      root.detail,
    );
  }

  private isMissingInstancePayload(payload: unknown) {
    return this.isMissingInstanceMessage(this.getPayloadMessage(payload));
  }

  private async normalizeQrCodeData(value: unknown) {
    const normalized = this.normalizeOptionalString(value);
    if (!normalized) return null;
    if (normalized.startsWith('data:image')) return normalized;
    if (/^[a-z]+:\/\//i.test(normalized)) return normalized;
    const compact = normalized.replace(/\s+/g, '');
    if (/^[A-Za-z0-9+/=]+$/.test(compact) && compact.length > 120) {
      return `data:image/png;base64,${compact}`;
    }
    return QRCode.toDataURL(normalized, {
      width: 320,
      margin: 1,
    });
  }

  private normalizeExternalStatus(rawStatus: string | null, hints: {
    phone?: string | null;
    lastError?: string | null;
    qrCodeDataUrl?: string | null;
  }) {
    const normalized = String(rawStatus || '').trim().toLowerCase();

    if (['connected', 'open', 'ready', 'active', 'authenticated', 'logged_in', 'online'].includes(normalized)) {
      return 'connected' as const;
    }
    if (
      [
        'waiting_qr',
        'awaiting_qr',
        'qr_ready',
        'scan_qr',
        'pending_qr',
        'pairing_code',
        'qrcode',
      ].includes(normalized)
    ) {
      return 'waiting_qr' as const;
    }
    if (['starting', 'booting', 'initializing', 'connecting', 'launching', 'opening'].includes(normalized)) {
      return 'starting' as const;
    }
    if (['reconnecting', 'unstable', 'recovering', 'aguardando_reconexao'].includes(normalized)) {
      return 'reconnecting' as const;
    }
    if (['disconnected', 'close', 'closed', 'stopped', 'logged_out', 'terminated'].includes(normalized)) {
      return 'disconnected' as const;
    }
    if (['offline', 'not_connected', 'none', 'missing', 'not_found', 'idle'].includes(normalized)) {
      return 'offline' as const;
    }
    if (['error', 'failed', 'failure', 'timeout', 'broken'].includes(normalized)) {
      return 'error' as const;
    }

    if (hints.qrCodeDataUrl) return 'waiting_qr';
    if (hints.phone) return 'connected';
    if (hints.lastError) return 'error';
    return 'offline';
  }

  private async extractSnapshot(payload: unknown, fallback: ModalSnapshot): Promise<ModalSnapshot> {
    const { root, rootData } = this.extractPayloadParts(payload);
    const instance = this.asRecord(rootData.instance) || this.asRecord(root.instance) || null;
    const session = this.asRecord(rootData.session) || this.asRecord(root.session) || rootData;
    const qr =
      this.asRecord(rootData.qr)
      || this.asRecord(rootData.qrcode)
      || this.asRecord(rootData.Qrcode)
      || this.asRecord(session.qr)
      || this.asRecord(session.qrcode)
      || this.asRecord(session.Qrcode)
      || null;

    const qrCodeDataUrl = await this.normalizeQrCodeData(
      this.firstString(
        session.base64,
        session.qrCodeDataUrl,
        session.qrCode,
        session.qr,
        session.code,
        rootData.base64,
        rootData.qrCodeDataUrl,
        rootData.qrCode,
        rootData.qr,
        rootData.code,
        root.base64,
        root.qrCodeDataUrl,
        root.qrCode,
        root.qr,
        root.code,
        root.qrcode,
        root.Qrcode,
        qr?.qrCodeDataUrl,
        qr?.qrCode,
        qr?.value,
        qr?.base64,
        qr?.code,
        qr?.qrcode,
        qr?.Qrcode,
      ),
    );
    const rawStatus = this.firstString(
      instance?.state,
      instance?.status,
      instance?.connectionStatus,
      session.status,
      session.state,
      session.connectionStatus,
      rootData.status,
      rootData.state,
      rootData.connectionStatus,
      root.status,
      root.state,
      root.connectionStatus,
    );
    const lastError = this.firstString(
      session.lastError,
      session.error,
      session.errorMessage,
      rootData.lastError,
      rootData.error,
      rootData.errorMessage,
      root.error,
      root.errorMessage,
      root.success === false ? root.message : null,
    );
    const phone = this.firstString(
      instance?.number,
      instance?.owner,
      instance?.ownerJid,
      instance?.profileName,
      session.phone,
      session.phoneNumber,
      session.number,
      session.owner,
      session.ownerJid,
      rootData.phone,
      rootData.phoneNumber,
      rootData.number,
      rootData.owner,
      rootData.ownerJid,
      root.phone,
      root.phoneNumber,
      root.number,
      root.owner,
      root.ownerJid,
    );
    const missingInstance =
      this.isMissingInstancePayload(payload)
      || this.isMissingInstanceMessage(rawStatus)
      || this.isMissingInstanceMessage(lastError);
    const normalizedStatus = missingInstance
      ? 'offline'
      : this.normalizeExternalStatus(rawStatus, {
          phone: phone || fallback.phone,
          lastError,
          qrCodeDataUrl,
        });

    return {
      status: normalizedStatus,
      phone: phone || fallback.phone,
      connectedAt:
        normalizedStatus === 'connected'
          ? this.normalizeDate(
              this.firstString(session.connectedAt, rootData.connectedAt, root.connectedAt),
            ) || fallback.connectedAt || new Date()
          : null,
      lastError: missingInstance ? null : normalizedStatus === 'error' ? lastError || fallback.lastError : null,
      updatedAt: new Date(),
      provider: 'external_modal',
      qrCodeDataUrl,
      rawStatus,
    };
  }

  private async waitForSessionReady(company: CompanyModalFields, fallback: ModalSnapshot, userId?: number) {
    const delaysMs = [0, 750, 1500, 2500, 4000, 6000];
    let latest = fallback;

    for (const delayMs of delaysMs) {
      if (delayMs > 0) {
        await this.sleep(delayMs);
      }

      latest = await this.fetchLiveSnapshot(company, { includeQr: true }, userId);
      if (latest.status === 'waiting_qr' || latest.status === 'connected') {
        return latest;
      }
      if (latest.status === 'error' && !this.isMissingInstanceMessage(latest.lastError)) {
        return latest;
      }
    }

    return latest;
  }

  private isSessionReady(snapshot: ModalSnapshot) {
    return (
      snapshot.status === 'waiting_qr'
      || snapshot.status === 'connected'
    );
  }

  private buildSessionActionMessage(
    snapshot: ModalSnapshot,
    options: {
      action: 'start' | 'restart';
      reusedExistingSession: boolean;
      pending?: boolean;
    },
  ) {
    if (snapshot.status === 'waiting_qr') {
      return 'QR pronto para leitura.';
    }
    if (snapshot.status === 'connected') {
      return 'WhatsApp conectado.';
    }
    if (snapshot.status === 'reconnecting') {
      return 'Webwhats instavel. Mantendo a sessao enquanto tenta reconectar.';
    }
    if (snapshot.status === 'error') {
      return snapshot.lastError || 'Falha ao sincronizar o Modal WhatsApp.';
    }
    if (options.reusedExistingSession) {
      return options.pending
        ? 'Sessão existente preservada. Atualize o status em alguns segundos.'
        : 'Sessão existente preservada. Atualize novamente em alguns segundos.';
    }
    return options.action === 'restart'
      ? options.pending
        ? 'Solicitação de reconexão enviada ao Modal WhatsApp. Atualize o status em alguns segundos.'
        : 'Solicitação de reconexão enviada ao Modal WhatsApp. Atualize novamente em alguns segundos.'
      : options.pending
        ? 'Solicitação enviada ao Modal WhatsApp. Atualize o status em alguns segundos.'
        : 'Solicitação enviada ao Modal WhatsApp. Atualize novamente em alguns segundos.';
  }

  private buildQrUnavailableMessage(snapshot: ModalSnapshot) {
    if (snapshot.status === 'connected') {
      return 'WhatsApp já está conectado. Nenhum QR está disponível.';
    }
    if (snapshot.status === 'offline' || snapshot.status === 'disconnected') {
      return 'A instância ainda não está pronta para exibir QR. Tente conectar novamente.';
    }
    if (snapshot.status === 'starting') {
      return 'QR code ainda não foi disponibilizado pelo Webwhats. Atualize o status em alguns segundos.';
    }
    return 'QR code indisponível no momento. Atualize o status em alguns segundos.';
  }

  private buildPendingSessionMessage(action: 'start' | 'restart') {
    return action === 'restart'
      ? 'Solicitação de reconexão enviada ao Webwhats. Atualize o status em alguns segundos.'
      : 'Solicitação enviada ao Webwhats. Atualize o status em alguns segundos.';
  }

  private buildMessage(snapshot: ModalSnapshot) {
    if (snapshot.status === 'connected') {
      return snapshot.phone
        ? `Sessão conectada ao número ${snapshot.phone}.`
        : 'Sessão conectada ao Modal WhatsApp.';
    }
    if (snapshot.status === 'waiting_qr') {
      return 'Escaneie o QR code no WhatsApp para concluir a conexão.';
    }
    if (snapshot.status === 'starting') {
      return 'Sessão em inicialização no Modal WhatsApp.';
    }
    if (snapshot.status === 'reconnecting') {
      return 'Webwhats instável. Aguardando reconexão sem fechar o Atendimento.';
    }
    if (snapshot.status === 'disconnected') {
      return 'Sessão desconectada do Modal WhatsApp.';
    }
    if (snapshot.status === 'error') {
      return snapshot.lastError || 'Falha ao sincronizar o Modal WhatsApp.';
    }
    return 'Nenhuma sessão ativa no Modal WhatsApp.';
  }

  private buildProviderHealth(config: ModalConfig, success: boolean, fallback: ProviderHealth = 'unknown'): ProviderHealth {
    if (!config.enabled) return 'disabled';
    if (!config.configured) return 'misconfigured';
    return success ? 'healthy' : fallback;
  }

  private buildResponse(
    company: CompanyModalFields,
    snapshot: ModalSnapshot,
    options?: {
      success?: boolean;
      message?: string;
      errorCode?: WhatsAppModalErrorCode | null;
      providerHealth?: ProviderHealth;
      redirectTo?: string | null;
    },
  ): WhatsAppModalResponse {
    const config = this.readConfig();
    return {
      success: options?.success ?? true,
      status: snapshot.status,
      message: options?.message || this.buildMessage(snapshot),
      data: {
        companyId: Number(company.id),
        companyName: String(company.name || ''),
        companySlug: company.slug || null,
        tenantKey: this.resolveOperationalTenantKey(company),
        provider: 'external_modal',
        enabled: config.enabled,
        configured: config.configured,
        available: config.available,
        providerHealth: options?.providerHealth || this.buildProviderHealth(config, options?.success !== false),
        missingConfigKeys: [...config.missingConfigKeys],
        phone: snapshot.phone,
        connectedAt: this.toIso(snapshot.connectedAt),
        updatedAt: this.toIso(snapshot.updatedAt),
        lastError: snapshot.lastError,
        qrCodeDataUrl: snapshot.qrCodeDataUrl,
        rawStatus: snapshot.rawStatus,
      },
      errorCode: options?.errorCode || null,
      redirectTo:
        options?.redirectTo
        || (options?.errorCode === 'TRIAL_PHONE_ALREADY_USED'
          ? '/planos?intent=trial_phone_used'
          : null),
    };
  }

  private buildAvailabilityResponse(
    company: CompanyModalFields,
    snapshot: ModalSnapshot,
    intent: 'status' | 'start' | 'qr' | 'disconnect' | 'restart' | 'pairing',
  ) {
    const config = this.readConfig();
    if (!config.enabled) {
      return this.buildResponse(company, snapshot, {
        success: intent === 'status',
        providerHealth: 'disabled',
        errorCode: intent === 'status' ? null : 'WHATSAPP_MODAL_DISABLED',
        message: 'Integração Modal WhatsApp desativada por ambiente.',
      });
    }

    if (!config.configured) {
      return this.buildResponse(company, snapshot, {
        success: false,
        providerHealth: 'misconfigured',
        errorCode: 'WHATSAPP_MODAL_NOT_CONFIGURED',
        message: this.buildMisconfiguredMessage(config),
      });
    }

    return null;
  }

  private toProviderError(error: unknown) {
    if (error instanceof WhatsAppModalProviderError) {
      return error;
    }

    if (error instanceof Error) {
      return new WhatsAppModalProviderError('WHATSAPP_MODAL_UNAVAILABLE', error.message);
    }

    return new WhatsAppModalProviderError(
      'WHATSAPP_MODAL_UNAVAILABLE',
      'Falha inesperada ao consultar o Modal WhatsApp.',
    );
  }

  private buildProviderErrorFromResponse(response: AxiosResponse<unknown>, purpose: string, path?: string) {
    const responseBody = this.asRecord(response.data) || {};
    const dataBody = this.asRecord(responseBody.data);
    const nestedResponse = this.asRecord(responseBody.response) || this.asRecord(dataBody?.response);
    const detail = this.firstString(
      responseBody.message,
      responseBody.detail,
      dataBody?.message,
      nestedResponse?.message,
      nestedResponse?.statusReason,
      nestedResponse?.error,
      dataBody?.statusReason,
      dataBody?.error,
      responseBody.statusReason,
      responseBody.error,
    );
    const suffix = detail ? ` ${detail}` : '';
    const normalizedPurpose = String(purpose || '').trim().toLowerCase();
    const normalizedDetail = String(detail || '').trim().toLowerCase();
    const requestPath = path || this.normalizeOptionalString(response.config?.url) || 'unknown-path';

    this.logger.warn(
      `Modal WhatsApp provider HTTP ${response.status} during ${purpose} path=${requestPath} ` +
        `message=${detail || 'sem mensagem'} body=${this.stringifyProviderBodyForLog(response.data)}`,
    );

    if (this.isExistingInstanceMessage(detail)) {
      return new WhatsAppModalProviderError(
        'WHATSAPP_MODAL_HTTP_ERROR',
        `Instância WhatsApp já existe ou está em uso durante ${purpose}.${suffix}`.trim(),
        response.status,
      );
    }

    if (normalizedPurpose.includes('pareamento') || normalizedPurpose.includes('pairing')) {
      if (
        response.status === 400 ||
        response.status === 404 ||
        response.status === 405 ||
        normalizedDetail.includes('not support') ||
        normalizedDetail.includes('unsupported') ||
        normalizedDetail.includes('not implemented') ||
        normalizedDetail.includes('pairing')
      ) {
        return new WhatsAppModalProviderError(
          'WHATSAPP_MODAL_PAIRING_UNSUPPORTED',
          'Este motor suporta apenas QR Code. Para conectar sem câmera, precisamos ativar o modo pairing code ou Cloud API.',
          response.status,
        );
      }
    }

    if (response.status === 409 && normalizedPurpose.includes('qr')) {
      return new WhatsAppModalProviderError(
        'WHATSAPP_MODAL_QR_UNAVAILABLE',
        'QR code indisponível no momento. Atualize o status em alguns segundos.',
        response.status,
      );
    }

    if (response.status === 401 || (response.status === 403 && this.isProviderAuthenticationMessage(detail))) {
      return new WhatsAppModalProviderError(
        'WHATSAPP_MODAL_NOT_CONFIGURED',
        `Webwhats recusou a autenticacao durante ${purpose}. Verifique WHATSAPP_MODAL_API_KEY.${suffix}`.trim(),
        response.status,
      );
    }

    if (response.status === 408 || response.status === 504) {
      return new WhatsAppModalProviderError(
        'WHATSAPP_MODAL_TIMEOUT',
        `Modal WhatsApp excedeu o tempo limite durante ${purpose}.${suffix}`.trim(),
        response.status,
      );
    }

    if (response.status >= 500) {
      return new WhatsAppModalProviderError(
        'WHATSAPP_MODAL_UNAVAILABLE',
        `Modal WhatsApp indisponível durante ${purpose}.${suffix}`.trim(),
        response.status,
      );
    }

    return new WhatsAppModalProviderError(
      'WHATSAPP_MODAL_HTTP_ERROR',
      `Modal WhatsApp retornou HTTP ${response.status} durante ${purpose}.${suffix}`.trim(),
      response.status,
    );
  }

  private mapAxiosError(error: AxiosError<unknown>, purpose: string) {
    const code = String(error.code || '').trim().toUpperCase();
    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
      return new WhatsAppModalProviderError(
        'WHATSAPP_MODAL_TIMEOUT',
        `Modal WhatsApp excedeu o tempo limite durante ${purpose}.`,
      );
    }

    if (!error.response) {
      return new WhatsAppModalProviderError(
        'WHATSAPP_MODAL_UNAVAILABLE',
        `Modal WhatsApp indisponível durante ${purpose}.`,
      );
    }

    return this.buildProviderErrorFromResponse(error.response, purpose, this.normalizeOptionalString(error.config?.url) || undefined);
  }

  private async requestProvider(options: ExternalRequestOptions) {
    const config = this.readConfig();
    if (!config.enabled) {
      throw new WhatsAppModalProviderError('WHATSAPP_MODAL_DISABLED', 'Integração Modal WhatsApp desativada por ambiente.');
    }
    if (!config.configured || !config.internalUrl) {
      throw new WhatsAppModalProviderError('WHATSAPP_MODAL_NOT_CONFIGURED', this.buildMisconfiguredMessage(config));
    }

    const url = `${config.internalUrl}${options.path.startsWith('/') ? options.path : `/${options.path}`}`;
    const startedAt = Date.now();

    try {
      const response = await axios.request({
        method: options.method,
        url,
        data: options.data,
        timeout: config.timeoutMs,
        headers: this.buildHeaders(config.apiKey),
        validateStatus: () => true,
      });

      if (response.status === 404 && options.treatNotFoundAsNull) {
        return null;
      }

      if (response.status < 200 || response.status >= 300) {
        throw this.buildProviderErrorFromResponse(response, options.purpose, options.path);
      }

      const durationMs = Date.now() - startedAt;
      this.logger.log(`Modal WhatsApp ${options.purpose} completed for ${options.path} in ${durationMs}ms.`);
      return response.data;
    } catch (error) {
      if (error instanceof WhatsAppModalProviderError) {
        throw error;
      }
      if (axios.isAxiosError(error)) {
        throw this.mapAxiosError(error, options.purpose);
      }
      throw error;
    }
  }

  private async loadCompany(companyId: number) {
    await ensureMasterBillingRuntimeSchema(this.prisma);
    const normalizedId = Number(companyId);
    if (!normalizedId) {
      throw new NotFoundException('Empresa nao encontrada.');
    }

    const company = await this.prisma.company.findUnique({
      where: { id: normalizedId },
      select: {
        id: true,
        name: true,
        slug: true,
        whatsappModalStatus: true,
        whatsappModalProvider: true,
        whatsappModalPhone: true,
        whatsappModalConnectedAt: true,
        whatsappModalLastError: true,
        whatsappModalUpdatedAt: true,
        currentWhatsappConnectionSessionId: true,
        currentWhatsappConnectionSession: {
          select: {
            id: true,
            provider: true,
            tenantKey: true,
            status: true,
          },
        },
        status: true,
        selectedPlanKey: true,
        contactPhone: true,
        isActive: true,
        trialStartsAt: true,
        trialEndsAt: true,
        billingGraceEndsAt: true,
        courtesyEndsAt: true,
      },
    });

    if (!company) {
      throw new NotFoundException('Empresa nao encontrada.');
    }

    return company as CompanyModalFields;
  }

  private async persistSnapshot(company: CompanyModalFields, snapshot: ModalSnapshot, origin: string, userId?: number) {
    const previousStatus = this.normalizeStoredStatus(company.whatsappModalStatus);
    if (previousStatus !== snapshot.status) {
      this.logger.log(
        `Modal WhatsApp status changed for company ${company.id}: ${previousStatus} -> ${snapshot.status} (${origin}).`,
      );
    }
    if (snapshot.status === 'connected' && previousStatus !== 'connected') {
      this.logger.log(`QR conectado para company ${company.id}.`);
    }
    if (snapshot.status === 'connected' && snapshot.phone) {
      await this.enforceNumberNotSharedAcrossCompaniesOrBlock(company, snapshot, origin, userId);
      await this.registerTrialPhoneUsageOrBlock(company, snapshot.phone, snapshot, origin);
    }
    const currentSessionId = await this.reconcileWebwhatsConnectionSession(company, snapshot, origin, userId);

    if (userId) {
      // PER-USER (18/06): o estado vive na SESSÃO do usuário (reconcile acima). NÃO
      // sobrescreve o estado da EMPRESA com o de UM usuário — senão o número/status de
      // quem conectou vaza pros outros e o poll de um user derruba o status do outro
      // (foi o "erro compartilhado" entre admin e vendedor). Só aponta o currentSession
      // (usado pela bridge company-scoped) quando ESTE usuário está conectado.
      if (snapshot.status === 'connected' && currentSessionId) {
        await this.prisma.company.update({
          where: { id: Number(company.id) },
          data: {
            whatsappModalProvider: 'external_modal',
            currentWhatsappConnectionSessionId: currentSessionId,
          },
        });
      } else if (
        (snapshot.status === 'disconnected' || snapshot.status === 'offline') &&
        company.currentWhatsappConnectionSessionId
      ) {
        // BUG 1 FIX (disconnect por usuário): quando o vendedor desconecta, o ponteiro
        // currentWhatsappConnectionSessionId da empresa ficava apontando para a sessão que
        // acabou de virar `disconnected`. Ao próxima operação company-scoped (sem userId),
        // resolveOperationalTenantKey recaía para company-{id} em vez de company-{id}-user-{n},
        // e o status_sync ou start operava na instância errada. Limpar o ponteiro garante
        // que a empresa só aponte para sessões realmente ativas.
        await this.prisma.company.update({
          where: { id: Number(company.id) },
          data: { currentWhatsappConnectionSessionId: null },
        });
      }
      return;
    }

    await this.prisma.company.update({
      where: { id: Number(company.id) },
      data: {
        whatsappModalProvider: 'external_modal',
        whatsappModalStatus: snapshot.status.toUpperCase(),
        whatsappModalPhone: snapshot.phone,
        whatsappModalConnectedAt: snapshot.connectedAt,
        whatsappModalLastError: snapshot.lastError,
        whatsappModalUpdatedAt: snapshot.updatedAt || new Date(),
        currentWhatsappConnectionSessionId: currentSessionId,
      },
    });
  }

  private async fetchLiveSnapshotWithMeta(
    company: CompanyModalFields,
    options?: { includeQr?: boolean },
    userId?: number,
  ) {
    const tenantKey = this.resolveOperationalTenantKey(company);
    const fallback = await this.resolveStoredSnapshot(company, userId);
    let payload: unknown = null;

    try {
      payload = await this.requestProvider({
        method: 'GET',
        path: `/instance/connectionState/${encodeURIComponent(tenantKey)}`,
        purpose: 'status da instancia',
        treatNotFoundAsNull: true,
      });
    } catch (error) {
      if (this.isTransientProviderError(error) && this.shouldPreserveSessionDuringReconnectGrace(fallback)) {
        const providerError = this.toProviderError(error);
        const reconnectingSnapshot = this.buildReconnectingSnapshot(fallback, providerError.message);
        await this.persistSnapshot(company, reconnectingSnapshot, 'status_sync_reconnecting');
        return {
          snapshot: reconnectingSnapshot,
          instanceExists: true,
          providerReachable: false,
          providerErrorMessage: providerError.message,
        };
      }
      if (!this.isMissingInstanceError(error)) {
        throw error;
      }
    }

    const instanceExists = Boolean(payload) && !this.isMissingInstancePayload(payload);
    let snapshot: ModalSnapshot = instanceExists
      ? await this.extractSnapshot(payload, fallback)
      : this.shouldPreserveSessionDuringReconnectGrace(fallback)
        ? this.buildReconnectingSnapshot(fallback, 'Instancia Webwhats indisponivel durante janela de reconexao.')
        : {
          ...fallback,
          status: 'offline',
          phone: fallback.phone,
          connectedAt: null,
          lastError: null,
          updatedAt: new Date(),
          qrCodeDataUrl: null,
          rawStatus: null,
        };
    snapshot = this.reconcileTransientSnapshot(tenantKey, snapshot);

    if (
      instanceExists &&
      ['offline', 'error'].includes(snapshot.status) &&
      this.shouldPreserveSessionDuringReconnectGrace(fallback)
    ) {
      snapshot = this.buildReconnectingSnapshot(
        {
          ...fallback,
          rawStatus: snapshot.rawStatus,
        },
        snapshot.lastError || 'Provider Webwhats retornou estado instavel durante janela de reconexao.',
      );
    }

    if (options?.includeQr && instanceExists && snapshot.status !== 'connected') {
      const connectSnapshot = await this.connectProviderSession(company, snapshot);
      if (connectSnapshot) {
        snapshot = {
          ...snapshot,
          ...connectSnapshot,
          status: connectSnapshot.qrCodeDataUrl ? 'waiting_qr' : connectSnapshot.status,
          phone: connectSnapshot.phone || snapshot.phone,
          connectedAt: connectSnapshot.connectedAt || snapshot.connectedAt,
          lastError: connectSnapshot.lastError || null,
          updatedAt: connectSnapshot.updatedAt || snapshot.updatedAt,
          rawStatus: connectSnapshot.rawStatus || snapshot.rawStatus,
        };
        snapshot = this.reconcileTransientSnapshot(tenantKey, snapshot);
      }
    }

    await this.persistSnapshot(company, snapshot, 'status_sync', userId);
    return {
      snapshot,
      instanceExists,
      providerReachable: true,
      providerErrorMessage: null,
    };
  }

  private async fetchLiveSnapshot(
    company: CompanyModalFields,
    options?: { includeQr?: boolean },
    userId?: number,
  ) {
    const result = await this.fetchLiveSnapshotWithMeta(company, options, userId);
    return result.snapshot;
  }

  private async buildFailureResponse(
    company: CompanyModalFields,
    fallbackSnapshot: ModalSnapshot,
    error: unknown,
    message: string,
  ) {
    const providerError = this.toProviderError(error);
    this.logger.warn(`Modal WhatsApp failed for company ${company.id}: ${providerError.message}`);

    const failureSnapshot: ModalSnapshot = {
      ...fallbackSnapshot,
      status: 'error',
      lastError: providerError.message,
      updatedAt: new Date(),
      qrCodeDataUrl: null,
    };
    await this.persistSnapshot(company, failureSnapshot, 'failure');

    return this.buildResponse(company, failureSnapshot, {
      success: false,
      providerHealth: providerError.code === 'WHATSAPP_MODAL_NOT_CONFIGURED' ? 'misconfigured' : 'unavailable',
      errorCode: providerError.code,
      message: providerError.message || message,
    });
  }

  private async buildTransientFailureResponse(
    company: CompanyModalFields,
    fallbackSnapshot: ModalSnapshot,
    error: unknown,
    options?: { success?: boolean; message?: string },
  ) {
    const providerError = this.toProviderError(error);
    this.logger.warn(`Modal WhatsApp transient failure for company ${company.id}: ${providerError.message}`);
    const snapshot = this.shouldPreserveSessionDuringReconnectGrace(fallbackSnapshot)
      ? this.buildReconnectingSnapshot(fallbackSnapshot, providerError.message)
      : fallbackSnapshot;
    if (snapshot.status === 'reconnecting') {
      await this.persistSnapshot(company, snapshot, 'transient_reconnecting');
    }

    return this.buildResponse(company, snapshot, {
      success: options?.success ?? false,
      providerHealth: 'unknown',
      errorCode: providerError.code,
      message: options?.message || providerError.message,
    });
  }
}
