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

  constructor(private readonly prisma: PrismaService) {}

  getAvailability() {
    const config = this.readConfig();
    return {
      enabled: config.enabled,
      configured: config.configured,
      available: config.available,
      missingConfigKeys: [...config.missingConfigKeys],
      timeoutMs: config.timeoutMs,
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
      await this.requestProvider({
        method: 'GET',
        path: '/health',
        purpose: 'health do modal externo',
      });
      return {
        healthy: true,
        status: 'healthy' as ProviderHealth,
        message: 'Serviço Modal WhatsApp disponível.',
      };
    } catch (error) {
      const providerError = this.toProviderError(error);
      return {
        healthy: false,
        status: 'unavailable' as ProviderHealth,
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

    try {
      await this.requestProvider({
        method: 'POST',
        path: '/sessions',
        purpose: 'inicio da sessao',
        data: {
          sessionKey: tenantKey,
        },
      });
    } catch (error) {
      return this.buildFailureResponse(company, storedSnapshot, error, 'Falha ao iniciar a sessão do Modal WhatsApp.');
    }

    await this.persistSnapshot(company, liveSnapshot, 'start');

    try {
      const refreshedSnapshot = await this.waitForSessionReady(company, liveSnapshot);
      return this.buildResponse(company, refreshedSnapshot, {
        success: true,
        providerHealth: 'healthy',
        message:
          refreshedSnapshot.status === 'waiting_qr'
            ? 'QR pronto para leitura.'
            : refreshedSnapshot.status === 'connected'
              ? 'WhatsApp conectado.'
              : 'Solicitação enviada ao Modal WhatsApp. Atualize novamente em alguns segundos.',
      });
    } catch (error) {
      this.logger.warn(`Modal WhatsApp start confirmation failed for company ${company.id}: ${this.toProviderError(error).message}`);
      return this.buildResponse(company, liveSnapshot, {
        success: true,
        providerHealth: 'unknown',
        message: 'Solicitação enviada ao Modal WhatsApp. Atualize o status em alguns segundos.',
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
      const liveSnapshot = await this.fetchLiveSnapshot(company, { includeQr: true });
      if (!liveSnapshot.qrCodeDataUrl) {
        return this.buildResponse(company, liveSnapshot, {
          success: false,
          providerHealth: 'healthy',
          errorCode: 'WHATSAPP_MODAL_QR_UNAVAILABLE',
          message: 'QR code indisponível no momento. Atualize o status em alguns segundos.',
        });
      }

      return this.buildResponse(company, liveSnapshot, {
        success: true,
        providerHealth: 'healthy',
        message: 'QR code atualizado com sucesso.',
      });
    } catch (error) {
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
      await this.requestProvider({
        method: 'POST',
        path: `/sessions/${encodeURIComponent(tenantKey)}/disconnect`,
        purpose: 'desconexao da sessao',
      });
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

    try {
      const refreshedSnapshot = await this.fetchLiveSnapshot(company, { includeQr: false });
      return this.buildResponse(company, refreshedSnapshot, {
        success: true,
        providerHealth: 'healthy',
        message: 'Sessão desconectada do Modal WhatsApp.',
      });
    } catch (error) {
      this.logger.warn(`Modal WhatsApp disconnect confirmation failed for company ${company.id}: ${this.toProviderError(error).message}`);
      return this.buildResponse(company, optimisticSnapshot, {
        success: true,
        providerHealth: 'unknown',
        message: 'Solicitação de desconexão enviada ao Modal WhatsApp.',
      });
    }
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

    const optimisticSnapshot: ModalSnapshot = {
      ...storedSnapshot,
      status: 'starting',
      phone: null,
      connectedAt: null,
      lastError: null,
      updatedAt: new Date(),
      qrCodeDataUrl: null,
    };
    await this.persistSnapshot(company, optimisticSnapshot, 'restart');

    try {
      await this.requestProvider({
        method: 'POST',
        path: `/sessions/${encodeURIComponent(tenantKey)}/restart`,
        purpose: 'reinicio da sessao',
      });
    } catch (error) {
      return this.buildFailureResponse(company, storedSnapshot, error, 'Falha ao reiniciar a sessão do Modal WhatsApp.');
    }

    try {
      const refreshedSnapshot = await this.waitForSessionReady(company, optimisticSnapshot);
      return this.buildResponse(company, refreshedSnapshot, {
        success: true,
        providerHealth: 'healthy',
        message:
          refreshedSnapshot.status === 'waiting_qr'
            ? 'QR pronto para leitura.'
            : refreshedSnapshot.status === 'connected'
              ? 'WhatsApp conectado.'
              : 'Solicitação de reinício enviada ao Modal WhatsApp. Atualize novamente em alguns segundos.',
      });
    } catch (error) {
      this.logger.warn(`Modal WhatsApp restart confirmation failed for company ${company.id}: ${this.toProviderError(error).message}`);
      return this.buildResponse(company, optimisticSnapshot, {
        success: true,
        providerHealth: 'unknown',
        message: 'Solicitação de reinício enviada ao Modal WhatsApp. Atualize o status em alguns segundos.',
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

  private isMissingInstanceError(error: unknown) {
    const providerError = this.toProviderError(error);
    return providerError.statusCode === 404 || this.isMissingInstanceMessage(providerError.message);
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

  private readConfig(): ModalConfig {
    const enabled = ['1', 'true', 'yes', 'on'].includes(
      String(process.env.WHATSAPP_MODAL_ENABLED || '').trim().toLowerCase(),
    );
    const internalUrl = this.normalizeOptionalString(process.env.WHATSAPP_MODAL_INTERNAL_URL)?.replace(/\/+$/, '') || null;
    const apiKey = this.normalizeOptionalString(process.env.WHATSAPP_MODAL_API_KEY);
    const missingConfigKeys: string[] = [];

    if (!internalUrl) missingConfigKeys.push('WHATSAPP_MODAL_INTERNAL_URL');

    const configured = Boolean(internalUrl);
    return {
      enabled,
      configured,
      available: enabled && configured,
      internalUrl,
      apiKey,
      timeoutMs: this.clampTimeout(process.env.WHATSAPP_MODAL_TIMEOUT_MS),
      missingConfigKeys,
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
      headers['x-api-key'] = apiKey;
      headers.Authorization = `Bearer ${apiKey}`;
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
    const root = this.asRecord(payload) || {};
    const rootData = this.asRecord(root.data) || root;
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
    const missingInstance = this.isMissingInstanceMessage(rawStatus) || this.isMissingInstanceMessage(lastError);
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
    const delaysMs = [0, 500, 1000, 1500];
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

  private async fetchQrSnapshot(company: CompanyModalFields, fallback: ModalSnapshot) {
    const tenantKey = this.buildTenantKey(company);
    let payload: unknown = null;

    try {
      payload = await this.requestProvider({
        method: 'GET',
        path: `/sessions/${encodeURIComponent(tenantKey)}/qr`,
        purpose: 'leitura do qr',
        treatNotFoundAsNull: true,
      });
    } catch (error) {
      const providerError = this.toProviderError(error);
      if (providerError.code === 'WHATSAPP_MODAL_QR_UNAVAILABLE' || this.isMissingInstanceError(providerError)) {
        return null;
      }
      throw providerError;
    }

    if (!payload) {
      return null;
    }

    const qrSnapshot = await this.extractSnapshot(payload, fallback);
    return {
      ...fallback,
      status: qrSnapshot.qrCodeDataUrl ? 'waiting_qr' : fallback.status,
      qrCodeDataUrl: qrSnapshot.qrCodeDataUrl,
      phone: qrSnapshot.phone || fallback.phone,
      connectedAt: qrSnapshot.connectedAt || fallback.connectedAt,
      lastError: qrSnapshot.lastError || fallback.lastError,
      updatedAt: qrSnapshot.updatedAt || fallback.updatedAt,
      rawStatus: qrSnapshot.rawStatus || fallback.rawStatus,
    } satisfies ModalSnapshot;
  }

  private async fetchLiveSnapshot(
    company: CompanyModalFields,
    options?: { includeQr?: boolean },
  ) {
    const tenantKey = this.buildTenantKey(company);
    const fallback = this.buildStoredSnapshot(company);
    let payload: unknown = null;

    try {
      payload = await this.requestProvider({
        method: 'GET',
        path: `/sessions/${encodeURIComponent(tenantKey)}/status`,
        purpose: 'status da sessao',
        treatNotFoundAsNull: true,
      });
    } catch (error) {
      if (!this.isMissingInstanceError(error)) {
        throw error;
      }
    }

    let snapshot: ModalSnapshot = payload
      ? await this.extractSnapshot(payload, fallback)
      : {
          ...fallback,
          status: 'offline',
          lastError: null,
          updatedAt: new Date(),
          qrCodeDataUrl: null,
          rawStatus: null,
        };

    if (options?.includeQr && snapshot.status !== 'connected') {
      const qrSnapshot = await this.fetchQrSnapshot(company, snapshot);
      if (qrSnapshot) {
        snapshot = qrSnapshot;
      }
    }

    await this.persistSnapshot(company, snapshot, 'status_sync');
    return snapshot;
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
      providerHealth: 'unavailable',
      errorCode: providerError.code,
      message: providerError.message || message,
    });
  }
}
