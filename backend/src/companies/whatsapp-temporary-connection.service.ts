import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { randomBytes } from 'crypto';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { ensureMasterBillingRuntimeSchema } from '../modules/master-runtime';

type CompanyTemporaryFields = {
  id: number;
  name: string;
  slug?: string | null;
  whatsappNumber?: string | null;
  contactPhone?: string | null;
  whatsappConnectionMode?: string | null;
  whatsappTemporaryInstanceKey?: string | null;
  whatsappTemporaryPairingCode?: string | null;
  whatsappTemporaryQrCodeData?: string | null;
  whatsappTemporaryDisplayNumber?: string | null;
  whatsappTemporaryStatusError?: string | null;
  whatsappTemporaryConnectedAt?: Date | null;
};

type TemporarySyncResult = {
  connected: boolean;
  temporaryStatus: 'NOT_CONNECTED' | 'TEMPORARY' | 'ATTENTION';
  rawState: string | null;
  qrCodeDataUrl: string | null;
  pairingCode: string | null;
  displayNumber: string | null;
  provider: string | null;
  errorMessage: string | null;
  connectedAt: Date | null;
  lastSyncAt: Date;
  instanceKey: string | null;
};

type EvolutionInstanceEntry = {
  instance?: {
    instanceName?: string;
    instanceId?: string;
    owner?: string;
    profileName?: string;
    profileStatus?: string;
    status?: string;
  };
};

@Injectable()
export class WhatsAppTemporaryConnectionService {
  private readonly logger = new Logger(WhatsAppTemporaryConnectionService.name);

  constructor(private readonly prisma: PrismaService) {}

  private normalizeOptionalString(value: unknown) {
    const normalized = String(value || '').trim();
    return normalized || null;
  }

  private normalizeDigits(value: unknown) {
    const digits = String(value || '').replace(/\D/g, '').trim();
    return digits || null;
  }

  private providerBaseUrl() {
    return String(process.env.WHATSAPP_TEMPORARY_API_URL || '').trim().replace(/\/$/, '');
  }

  private providerApiKey() {
    return String(process.env.WHATSAPP_TEMPORARY_API_KEY || '').trim();
  }

  private providerEnabled() {
    return Boolean(this.providerBaseUrl() && this.providerApiKey());
  }

  getAvailability() {
    return {
      configured: this.providerEnabled(),
      provider: this.providerEnabled() ? 'EVOLUTION_API' : null,
    };
  }

  private providerClient() {
    const baseURL = this.providerBaseUrl();
    const apikey = this.providerApiKey();
    if (!baseURL || !apikey) {
      throw new BadRequestException(
        'O vínculo rápido por QR ainda precisa de configuração técnica do provedor temporário.',
      );
    }

    return axios.create({
      baseURL,
      timeout: 15000,
      headers: {
        apikey,
        'Content-Type': 'application/json',
      },
    });
  }

  private async loadCompany(companyId: number) {
    await ensureMasterBillingRuntimeSchema(this.prisma);
    const company = await this.prisma.company.findUnique({
      where: { id: Number(companyId) },
      select: {
        id: true,
        name: true,
        slug: true,
        whatsappNumber: true,
        contactPhone: true,
        whatsappConnectionMode: true,
        whatsappTemporaryInstanceKey: true,
        whatsappTemporaryPairingCode: true,
        whatsappTemporaryQrCodeData: true,
        whatsappTemporaryDisplayNumber: true,
        whatsappTemporaryStatusError: true,
        whatsappTemporaryConnectedAt: true,
      },
    });

    if (!company) {
      throw new NotFoundException('Empresa não encontrada para vínculo temporário.');
    }

    return company as CompanyTemporaryFields;
  }

  private buildInstanceKey(company: CompanyTemporaryFields) {
    const existing = this.normalizeOptionalString(company.whatsappTemporaryInstanceKey);
    if (existing) return existing;

    const slugBase = this.normalizeOptionalString(company.slug)
      || this.normalizeOptionalString(company.name)?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')
      || `company-${company.id}`;
    const prefix = this.normalizeOptionalString(process.env.WHATSAPP_TEMPORARY_INSTANCE_PREFIX) || 'hbx-temp';
    const suffix = randomBytes(3).toString('hex');
    return `${prefix}-${slugBase}-${company.id}-${suffix}`.slice(0, 80);
  }

  private async fetchEvolutionInstance(
    client: AxiosInstance,
    instanceKey: string,
  ): Promise<EvolutionInstanceEntry['instance'] | null> {
    const response = await client.get<EvolutionInstanceEntry[] | { response?: EvolutionInstanceEntry[] }>(
      `/instance/fetchInstances`,
      {
        params: {
          instanceName: instanceKey,
        },
      },
    );

    const payload = Array.isArray(response.data)
      ? response.data
      : Array.isArray((response.data as any)?.response)
        ? (response.data as any).response
        : [];
    const match = payload.find((entry) => this.normalizeOptionalString(entry?.instance?.instanceName) === instanceKey);
    return match?.instance || null;
  }

  private async createEvolutionInstance(client: AxiosInstance, company: CompanyTemporaryFields, instanceKey: string) {
    const ownerNumber =
      this.normalizeDigits(company.whatsappNumber) || this.normalizeDigits(company.contactPhone);

    await client.post('/instance/create', {
      instanceName: instanceKey,
      integration: 'WHATSAPP-BAILEYS',
      token: '',
      qrcode: true,
      ...(ownerNumber ? { number: ownerNumber } : {}),
      rejectCall: true,
      msgCall: 'Ligação não atendida por este canal temporário.',
      groupsIgnore: true,
      alwaysOnline: false,
      readMessages: false,
      readStatus: false,
      syncFullHistory: false,
    });
  }

  private parseAxiosError(error: unknown) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const payload = error.response?.data;
      const message = typeof payload === 'string'
        ? payload
        : this.normalizeOptionalString((payload as any)?.message)
          || this.normalizeOptionalString((payload as any)?.response?.message)
          || this.normalizeOptionalString(error.message)
          || 'Falha no provedor do WhatsApp temporário.';
      return {
        status,
        message,
      };
    }

    return {
      status: null,
      message: this.normalizeOptionalString((error as any)?.message) || 'Falha no provedor do WhatsApp temporário.',
    };
  }

  private isConnectedState(rawState: string | null) {
    const normalized = String(rawState || '').trim().toLowerCase();
    return normalized === 'open' || normalized === 'connected';
  }

  private resolveDisplayNumber(instance: EvolutionInstanceEntry['instance'] | null) {
    const owner = this.normalizeDigits(instance?.owner);
    if (owner) return owner;
    return this.normalizeOptionalString(instance?.profileName);
  }

  private async buildQrCodeDataUrl(value: string | null) {
    if (!value) return null;
    return QRCode.toDataURL(value, {
      width: 320,
      margin: 1,
    });
  }

  private async persistTemporaryState(companyId: number, result: TemporarySyncResult) {
    await this.prisma.company.update({
      where: { id: Number(companyId) },
      data: {
        whatsappTemporaryStatus: result.temporaryStatus,
        whatsappTemporaryInstanceKey: result.instanceKey,
        whatsappTemporaryProvider: result.provider,
        whatsappTemporaryPairingCode: result.pairingCode,
        whatsappTemporaryQrCodeData: result.qrCodeDataUrl,
        whatsappTemporaryDisplayNumber: result.displayNumber,
        whatsappTemporaryLastSyncAt: result.lastSyncAt,
        whatsappTemporaryConnectedAt: result.connectedAt,
        whatsappTemporaryStatusError: result.errorMessage,
      },
    });
  }

  private async ensureEvolutionInstance(client: AxiosInstance, company: CompanyTemporaryFields) {
    const instanceKey = this.buildInstanceKey(company);
    let instance = await this.fetchEvolutionInstance(client, instanceKey);

    if (!instance) {
      try {
        await this.createEvolutionInstance(client, company, instanceKey);
      } catch (error) {
        const parsed = this.parseAxiosError(error);
        const message = String(parsed.message || '').toLowerCase();
        if (!message.includes('already') && !message.includes('exists') && parsed.status !== 409) {
          throw new BadRequestException(parsed.message);
        }
      }
      instance = await this.fetchEvolutionInstance(client, instanceKey);
    }

    await this.prisma.company.update({
      where: { id: Number(company.id) },
      data: {
        whatsappTemporaryInstanceKey: instanceKey,
        whatsappTemporaryProvider: 'EVOLUTION_API',
      },
    });

    return {
      instanceKey,
      instance,
    };
  }

  private async fetchConnectionState(client: AxiosInstance, instanceKey: string) {
    const response = await client.get<{ instance?: { state?: string; status?: string } }>(
      `/instance/connectionState/${encodeURIComponent(instanceKey)}`,
    );
    return this.normalizeOptionalString(response.data?.instance?.state || response.data?.instance?.status);
  }

  private async fetchConnectPayload(client: AxiosInstance, instanceKey: string, number?: string | null) {
    const response = await client.get<{ code?: string; pairingCode?: string }>(
      `/instance/connect/${encodeURIComponent(instanceKey)}`,
      {
        params: number ? { number } : undefined,
      },
    );

    return {
      code: this.normalizeOptionalString(response.data?.code),
      pairingCode: this.normalizeOptionalString(response.data?.pairingCode),
    };
  }

  private async syncWithEvolutionProvider(
    company: CompanyTemporaryFields,
    options?: {
      requestQr?: boolean;
    },
  ) {
    const client = this.providerClient();
    const lastSyncAt = new Date();
    const requestQr = Boolean(options?.requestQr);

    try {
      const { instanceKey, instance } = await this.ensureEvolutionInstance(client, company);
      const currentInstance = instance || (await this.fetchEvolutionInstance(client, instanceKey));
      const rawState = await this.fetchConnectionState(client, instanceKey);
      const connected = this.isConnectedState(rawState);
      let code: string | null = null;
      let pairingCode: string | null = null;

      if (!connected && requestQr) {
        const connectPayload = await this.fetchConnectPayload(
          client,
          instanceKey,
          this.normalizeDigits(company.whatsappNumber) || this.normalizeDigits(company.contactPhone),
        );
        code = connectPayload.code;
        pairingCode = connectPayload.pairingCode;
      }

      const qrCodeDataUrl = connected
        ? null
        : code
          ? await this.buildQrCodeDataUrl(code)
          : this.normalizeOptionalString(company.whatsappTemporaryQrCodeData);
      const displayNumber =
        this.resolveDisplayNumber(currentInstance)
        || this.normalizeOptionalString(company.whatsappTemporaryDisplayNumber);

      return {
        connected,
        temporaryStatus: connected
          ? 'TEMPORARY'
          : requestQr || String(rawState || '').trim()
            ? 'ATTENTION'
            : 'NOT_CONNECTED',
        rawState,
        qrCodeDataUrl,
        pairingCode: connected ? null : pairingCode || this.normalizeOptionalString(company.whatsappTemporaryPairingCode),
        displayNumber,
        provider: 'EVOLUTION_API',
        errorMessage: null,
        connectedAt: connected ? company.whatsappTemporaryConnectedAt || lastSyncAt : null,
        lastSyncAt,
        instanceKey,
      } satisfies TemporarySyncResult;
    } catch (error) {
      const parsed = this.parseAxiosError(error);
      this.logger.warn(`Temporary WhatsApp provider sync failed for company ${company.id}: ${parsed.message}`);
      return {
        connected: false,
        temporaryStatus: 'ATTENTION',
        rawState: null,
        qrCodeDataUrl: null,
        pairingCode: this.normalizeOptionalString(company.whatsappTemporaryPairingCode),
        displayNumber: this.normalizeOptionalString(company.whatsappTemporaryDisplayNumber),
        provider: this.providerEnabled() ? 'EVOLUTION_API' : null,
        errorMessage: parsed.message || this.normalizeOptionalString(company.whatsappTemporaryStatusError),
        connectedAt: null,
        lastSyncAt,
        instanceKey: this.normalizeOptionalString(company.whatsappTemporaryInstanceKey),
      } satisfies TemporarySyncResult;
    }
  }

  async syncCompanyTemporaryConnection(
    companyId: number,
    options?: {
      requestQr?: boolean;
    },
  ) {
    const company = await this.loadCompany(companyId);
    if (!this.providerEnabled()) {
      return null;
    }

    const result = await this.syncWithEvolutionProvider(company, options);
    await this.persistTemporaryState(companyId, result);
    return result;
  }

  async startTemporaryConnection(companyId: number) {
    if (!this.providerEnabled()) {
      throw new BadRequestException(
        'O vínculo rápido por QR ainda não foi configurado neste ambiente.',
      );
    }

    const result = await this.syncCompanyTemporaryConnection(companyId, { requestQr: true });
    if (!result) {
      throw new BadRequestException('Não foi possível iniciar o vínculo rápido por QR.');
    }
    return result;
  }

  async disconnectTemporaryConnection(companyId: number) {
    const company = await this.loadCompany(companyId);
    const instanceKey = this.normalizeOptionalString(company.whatsappTemporaryInstanceKey);
    const lastSyncAt = new Date();

    if (this.providerEnabled() && instanceKey) {
      try {
        const client = this.providerClient();
        await client.delete(`/instance/logout/${encodeURIComponent(instanceKey)}`);
      } catch (error) {
        const parsed = this.parseAxiosError(error);
        this.logger.warn(`Temporary WhatsApp provider logout failed for company ${company.id}: ${parsed.message}`);
      }
    }

    await this.prisma.company.update({
      where: { id: Number(companyId) },
      data: {
        whatsappTemporaryStatus: 'NOT_CONNECTED',
        whatsappTemporaryPairingCode: null,
        whatsappTemporaryQrCodeData: null,
        whatsappTemporaryDisplayNumber: null,
        whatsappTemporaryConnectedAt: null,
        whatsappTemporaryLastSyncAt: lastSyncAt,
        whatsappTemporaryStatusError: null,
      },
    });

    return {
      disconnected: true,
      lastSyncAt: lastSyncAt.toISOString(),
    };
  }
}
