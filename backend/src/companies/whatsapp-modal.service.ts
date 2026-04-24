import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import axios, { AxiosError, AxiosResponse, Method } from 'axios';
import * as QRCode from 'qrcode';
import { ensureMasterBillingRuntimeSchema } from '../modules/master-runtime';
import { PrismaService } from '../prisma/prisma.service';

type WhatsAppModalStatus = 'offline' | 'starting' | 'waiting_qr' | 'connected' | 'disconnected' | 'error';
type WhatsAppModalErrorCode =
  | 'WHATSAPP_MODAL_DISABLED'
  | 'WHATSAPP_MODAL_NOT_CONFIGURED'
  | 'WHATSAPP_MODAL_TIMEOUT'
  | 'WHATSAPP_MODAL_UNAVAILABLE'
  | 'WHATSAPP_MODAL_HTTP_ERROR'
  | 'WHATSAPP_MODAL_QR_UNAVAILABLE';
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
  private readonly connectAttemptCooldownMs = 12000;
  private readonly webhookConfigureCooldownMs = 60000;
  private readonly qrCodeCacheTtlMs = 45000;

  constructor(private readonly prisma: PrismaService) {}

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

  async getCompanyStatus(companyId: number): Promise<WhatsAppModalResponse> {
    const company = await this.loadCompany(companyId);
    const storedSnapshot = this.buildStoredSnapshot(company);
    const availabilityResponse = this.buildAvailabilityResponse(company, storedSnapshot, 'status');
    if (availabilityResponse) {
      return availabilityResponse;
    }

    try {
      const snapshot = await this.fetchLiveSnapshot(company, { includeQr: false });
      return this.buildResponse(company, snapshot, {
        success: true,
        providerHealth: 'healthy',
      });
    } catch (error) {
      if (this.isTransientProviderError(error)) {
        return this.buildTransientFailureResponse(company, storedSnapshot, error, { success: true });
      }
      return this.buildFailureResponse(company, storedSnapshot, error, 'Falha ao consultar o Modal WhatsApp.');
    }
  }

  async startCompanySession(companyId: number): Promise<WhatsAppModalResponse> {
    const company = await this.loadCompany(companyId);
    const storedSnapshot = this.buildStoredSnapshot(company);
    const availabilityResponse = this.buildAvailabilityResponse(company, storedSnapshot, 'start');
    if (availabilityResponse) {
      return availabilityResponse;
    }

    const tenantKey = this.buildTenantKey(company);
    this.logger.log(`Starting Modal WhatsApp session for company ${company.id} (${tenantKey}).`);

    let liveSnapshot: ModalSnapshot = {
      ...storedSnapshot,
      status: 'starting',
      lastError: null,
      updatedAt: new Date(),
      qrCodeDataUrl: null,
    };
    await this.persistSnapshot(company, liveSnapshot, 'start');

    try {
      await this.createProviderInstance(tenantKey);
    } catch (error) {
      if (!this.isExistingInstanceError(error) && !this.isTransientProviderError(error)) {
        return this.buildFailureResponse(company, storedSnapshot, error, 'Falha ao iniciar a sessão do Modal WhatsApp.');
      }
    }
    await this.tryConfigureProviderWebhook(tenantKey, 'start');

    try {
      const connectSnapshot = await this.connectProviderSession(company, liveSnapshot);
      if (connectSnapshot) {
        liveSnapshot = connectSnapshot;
        await this.persistSnapshot(company, liveSnapshot, 'start_connect');
        return this.buildResponse(company, liveSnapshot, {
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
        return this.buildFailureResponse(company, storedSnapshot, error, 'Falha ao iniciar a sessão do Modal WhatsApp.');
      }
      this.logger.warn(`Modal WhatsApp start connect pending for company ${company.id}: ${this.toProviderError(error).message}`);
    }

    try {
      const immediateSnapshot = await this.fetchLiveSnapshot(company, { includeQr: true });
      liveSnapshot = this.isSessionReady(immediateSnapshot)
        ? immediateSnapshot
        : await this.waitForSessionReady(company, immediateSnapshot);
      return this.buildResponse(company, liveSnapshot, {
        success: true,
        providerHealth: 'healthy',
        message: this.buildSessionActionMessage(liveSnapshot, {
          action: 'start',
          reusedExistingSession: false,
        }),
      });
    } catch (error) {
      this.logger.warn(`Modal WhatsApp start confirmation failed for company ${company.id}: ${this.toProviderError(error).message}`);
      return this.buildResponse(company, liveSnapshot, {
        success: true,
        providerHealth: 'unknown',
        message: this.buildPendingSessionMessage('start'),
        errorCode: this.isTransientProviderError(error) ? this.toProviderError(error).code : null,
      });
    }
  }

  async getCompanyQrCode(companyId: number): Promise<WhatsAppModalResponse> {
    const company = await this.loadCompany(companyId);
    const storedSnapshot = this.buildStoredSnapshot(company);
    const availabilityResponse = this.buildAvailabilityResponse(company, storedSnapshot, 'qr');
    if (availabilityResponse) {
      return availabilityResponse;
    }

    try {
      const connectSnapshot = await this.connectProviderSession(company, storedSnapshot);
      const liveSnapshot = connectSnapshot || await this.fetchLiveSnapshot(company, { includeQr: false });

      if (connectSnapshot) {
        await this.persistSnapshot(company, liveSnapshot, 'qr');
      }

      if (!liveSnapshot.qrCodeDataUrl) {
        return this.buildResponse(company, liveSnapshot, {
          success: false,
          providerHealth: 'healthy',
          errorCode: 'WHATSAPP_MODAL_QR_UNAVAILABLE',
          message: this.buildQrUnavailableMessage(liveSnapshot),
        });
      }

      return this.buildResponse(company, liveSnapshot, {
        success: true,
        providerHealth: 'healthy',
        message: 'QR code atualizado com sucesso.',
      });
    } catch (error) {
      if (this.isTransientProviderError(error)) {
        return this.buildTransientFailureResponse(company, storedSnapshot, error, { success: false });
      }
      return this.buildFailureResponse(company, storedSnapshot, error, 'Falha ao obter o QR code do Modal WhatsApp.');
    }
  }

  async disconnectCompanySession(companyId: number): Promise<WhatsAppModalResponse> {
    const company = await this.loadCompany(companyId);
    const storedSnapshot = this.buildStoredSnapshot(company);
    const availabilityResponse = this.buildAvailabilityResponse(company, storedSnapshot, 'disconnect');
    if (availabilityResponse) {
      return availabilityResponse;
    }

    const tenantKey = this.buildTenantKey(company);
    this.logger.log(`Disconnecting Modal WhatsApp session for company ${company.id} (${tenantKey}).`);

    try {
      await this.logoutProviderSession(tenantKey);
    } catch (error) {
      if (!this.isMissingInstanceError(error)) {
        return this.buildFailureResponse(company, storedSnapshot, error, 'Falha ao desconectar a sessão do Modal WhatsApp.');
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
    await this.persistSnapshot(company, optimisticSnapshot, 'disconnect');

    return this.buildResponse(company, optimisticSnapshot, {
      success: true,
      providerHealth: 'healthy',
      message: 'Sessão desconectada do Modal WhatsApp.',
    });
  }

  async restartCompanySession(companyId: number): Promise<WhatsAppModalResponse> {
    const company = await this.loadCompany(companyId);
    const storedSnapshot = this.buildStoredSnapshot(company);
    const availabilityResponse = this.buildAvailabilityResponse(company, storedSnapshot, 'restart');
    if (availabilityResponse) {
      return availabilityResponse;
    }

    const tenantKey = this.buildTenantKey(company);
    this.logger.log(`Restarting Modal WhatsApp session for company ${company.id} (${tenantKey}).`);

    try {
      await this.restartProviderSession(tenantKey);
    } catch (error) {
      if (this.isMissingInstanceError(error)) {
        return this.startCompanySession(companyId);
      }
      if (!this.isTransientProviderError(error)) {
        return this.buildFailureResponse(company, storedSnapshot, error, 'Falha ao reiniciar a sessão do Modal WhatsApp.');
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
    await this.persistSnapshot(company, optimisticSnapshot, 'restart');

    try {
      const connectSnapshot = await this.connectProviderSession(company, optimisticSnapshot);
      if (connectSnapshot) {
        optimisticSnapshot = connectSnapshot;
        await this.persistSnapshot(company, optimisticSnapshot, 'restart_connect');
        return this.buildResponse(company, optimisticSnapshot, {
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
        return this.buildFailureResponse(company, storedSnapshot, error, 'Falha ao reiniciar a sessão do Modal WhatsApp.');
      }
      this.logger.warn(`Modal WhatsApp restart connect pending for company ${company.id}: ${this.toProviderError(error).message}`);
    }

    try {
      const immediateSnapshot = await this.fetchLiveSnapshot(company, { includeQr: true });
      optimisticSnapshot = this.isSessionReady(immediateSnapshot)
        ? immediateSnapshot
        : await this.waitForSessionReady(company, immediateSnapshot);
      return this.buildResponse(company, optimisticSnapshot, {
        success: true,
        providerHealth: 'healthy',
        message: this.buildSessionActionMessage(optimisticSnapshot, {
          action: 'restart',
          reusedExistingSession: false,
        }),
      });
    } catch (error) {
      this.logger.warn(`Modal WhatsApp restart confirmation failed for company ${company.id}: ${this.toProviderError(error).message}`);
      return this.buildResponse(company, optimisticSnapshot, {
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
      || normalized === 'already_exists'
      || normalized === 'conflict'
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

  private async createProviderInstance(tenantKey: string) {
    return this.requestProvider({
      method: 'POST',
      path: '/instance/create',
      purpose: 'criacao da instancia',
      data: this.buildSessionCreatePayload(tenantKey),
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

  private async connectProviderSession(company: CompanyModalFields, fallback: ModalSnapshot) {
    const tenantKey = this.buildTenantKey(company);
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

  private buildSessionCreatePayload(tenantKey: string) {
    return {
      instanceName: tenantKey,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      syncFullHistory: true,
    };
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

  private async waitForSessionReady(company: CompanyModalFields, fallback: ModalSnapshot) {
    const delaysMs = [0, 750, 1500, 2500, 4000, 6000];
    let latest = fallback;

    for (const delayMs of delaysMs) {
      if (delayMs > 0) {
        await this.sleep(delayMs);
      }

      latest = await this.fetchLiveSnapshot(company, { includeQr: true });
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
        tenantKey: this.buildTenantKey(company),
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
    };
  }

  private buildAvailabilityResponse(
    company: CompanyModalFields,
    snapshot: ModalSnapshot,
    intent: 'status' | 'start' | 'qr' | 'disconnect' | 'restart',
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

  private buildProviderErrorFromResponse(response: AxiosResponse<unknown>, purpose: string) {
    const responseBody = this.asRecord(response.data) || {};
    const detail = this.firstString(
      responseBody.message,
      responseBody.error,
      responseBody.detail,
      this.asRecord(responseBody.data)?.message,
    );
    const suffix = detail ? ` ${detail}` : '';
    const normalizedPurpose = String(purpose || '').trim().toLowerCase();

    if (response.status === 409 && normalizedPurpose.includes('qr')) {
      return new WhatsAppModalProviderError(
        'WHATSAPP_MODAL_QR_UNAVAILABLE',
        'QR code indisponível no momento. Atualize o status em alguns segundos.',
        response.status,
      );
    }

    if (response.status === 401 || response.status === 403) {
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

    return this.buildProviderErrorFromResponse(error.response, purpose);
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
        throw this.buildProviderErrorFromResponse(response, options.purpose);
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
      },
    });

    if (!company) {
      throw new NotFoundException('Empresa nao encontrada.');
    }

    return company as CompanyModalFields;
  }

  private async persistSnapshot(company: CompanyModalFields, snapshot: ModalSnapshot, origin: string) {
    const previousStatus = this.normalizeStoredStatus(company.whatsappModalStatus);
    if (previousStatus !== snapshot.status) {
      this.logger.log(
        `Modal WhatsApp status changed for company ${company.id}: ${previousStatus} -> ${snapshot.status} (${origin}).`,
      );
    }
    if (snapshot.status === 'connected' && previousStatus !== 'connected') {
      this.logger.log(`QR conectado para company ${company.id}.`);
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
      },
    });
  }

  private async fetchLiveSnapshotWithMeta(
    company: CompanyModalFields,
    options?: { includeQr?: boolean },
  ) {
    const tenantKey = this.buildTenantKey(company);
    const fallback = this.buildStoredSnapshot(company);
    let payload: unknown = null;

    try {
      payload = await this.requestProvider({
        method: 'GET',
        path: `/instance/connectionState/${encodeURIComponent(tenantKey)}`,
        purpose: 'status da instancia',
        treatNotFoundAsNull: true,
      });
    } catch (error) {
      if (!this.isMissingInstanceError(error)) {
        throw error;
      }
    }

    const instanceExists = Boolean(payload) && !this.isMissingInstancePayload(payload);
    let snapshot: ModalSnapshot = instanceExists
      ? await this.extractSnapshot(payload, fallback)
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

    await this.persistSnapshot(company, snapshot, 'status_sync');
    return {
      snapshot,
      instanceExists,
    };
  }

  private async fetchLiveSnapshot(
    company: CompanyModalFields,
    options?: { includeQr?: boolean },
  ) {
    const result = await this.fetchLiveSnapshotWithMeta(company, options);
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

  private buildTransientFailureResponse(
    company: CompanyModalFields,
    fallbackSnapshot: ModalSnapshot,
    error: unknown,
    options?: { success?: boolean; message?: string },
  ) {
    const providerError = this.toProviderError(error);
    this.logger.warn(`Modal WhatsApp transient failure for company ${company.id}: ${providerError.message}`);

    return this.buildResponse(company, fallbackSnapshot, {
      success: options?.success ?? false,
      providerHealth: 'unknown',
      errorCode: providerError.code,
      message: options?.message || providerError.message,
    });
  }
}
