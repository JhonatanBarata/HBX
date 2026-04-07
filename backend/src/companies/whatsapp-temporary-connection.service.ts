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
  id?: string | null;
  name?: string | null;
  instanceName?: string | null;
  instanceId?: string | null;
  owner?: string | null;
  profileName?: string | null;
  profileStatus?: string | null;
  status?: string | null;
  connectionStatus?: string | null;
  number?: string | null;
  token?: string | null;
  qrcode?: unknown;
  instance?: {
    id?: string | null;
    name?: string | null;
    instanceName?: string | null;
    instanceId?: string | null;
    owner?: string | null;
    profileName?: string | null;
    profileStatus?: string | null;
    status?: string | null;
    connectionStatus?: string | null;
    number?: string | null;
    token?: string | null;
    qrcode?: unknown;
  };
};

type NormalizedQrPayload = {
  code: string | null;
  pairingCode: string | null;
  qrCodeDataUrl: string | null;
  pending?: boolean;
};

type EvolutionInstanceSnapshot = {
  instance: EvolutionInstanceEntry['instance'] | null;
  qr: NormalizedQrPayload;
};

@Injectable()
export class WhatsAppTemporaryConnectionService {
  private readonly logger = new Logger(WhatsAppTemporaryConnectionService.name);
  private availabilityWarned = false;

  constructor(private readonly prisma: PrismaService) {
    this.warnIfProviderUnavailable();
  }

  private normalizeOptionalString(value: unknown) {
    const normalized = String(value || '').trim();
    return normalized || null;
  }

  private normalizeDigits(value: unknown) {
    const digits = String(value || '').replace(/\D/g, '').trim();
    return digits || null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private readPayloadValue(payload: unknown, paths: string[][]) {
    for (const path of paths) {
      let current = payload;
      let found = true;
      for (const segment of path) {
        if (!this.isRecord(current) || !(segment in current)) {
          found = false;
          break;
        }
        current = current[segment];
      }
      if (found && current !== null && current !== undefined) return current;
    }

    return null;
  }

  private normalizePayloadString(value: unknown) {
    if (this.isRecord(value)) return null;
    return this.normalizeOptionalString(value);
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
    const missingConfigKeys: string[] = [];
    if (!this.providerBaseUrl()) missingConfigKeys.push('WHATSAPP_TEMPORARY_API_URL');
    if (!this.providerApiKey()) missingConfigKeys.push('WHATSAPP_TEMPORARY_API_KEY');

    const configured = missingConfigKeys.length === 0;

    return {
      configured,
      provider: configured ? 'EVOLUTION_API' : null,
      missingConfigKeys,
      setupHint: configured
        ? null
        : `Configure ${missingConfigKeys.join(' e ')} no ambiente do backend para habilitar o WebWhats por QR.`,
    };
  }

  private warnIfProviderUnavailable() {
    const availability = this.getAvailability();
    if (availability.configured || this.availabilityWarned) return;
    this.availabilityWarned = true;
    this.logger.warn(availability.setupHint || 'Provider temporário do WhatsApp não configurado.');
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

  private readFetchInstancesEntries(payload: unknown) {
    if (Array.isArray(payload)) return payload;
    const response = this.readPayloadValue(payload, [['response'], ['data'], ['instances']]);
    return Array.isArray(response) ? response : [];
  }

  private normalizeEvolutionInstance(entry: unknown): EvolutionInstanceEntry['instance'] | null {
    if (!this.isRecord(entry)) return null;

    return {
      instanceName: this.normalizeOptionalString(this.readPayloadValue(entry, [
        ['instance', 'instanceName'],
        ['instance', 'name'],
        ['instanceName'],
        ['name'],
      ])),
      instanceId: this.normalizeOptionalString(this.readPayloadValue(entry, [
        ['instance', 'instanceId'],
        ['instance', 'id'],
        ['instanceId'],
        ['id'],
      ])),
      owner: this.normalizeOptionalString(this.readPayloadValue(entry, [
        ['instance', 'owner'],
        ['owner'],
      ])),
      profileName: this.normalizeOptionalString(this.readPayloadValue(entry, [
        ['instance', 'profileName'],
        ['profileName'],
      ])),
      profileStatus: this.normalizeOptionalString(this.readPayloadValue(entry, [
        ['instance', 'profileStatus'],
        ['profileStatus'],
      ])),
      status: this.normalizeOptionalString(this.readPayloadValue(entry, [
        ['instance', 'status'],
        ['status'],
      ])),
      connectionStatus: this.normalizeOptionalString(this.readPayloadValue(entry, [
        ['instance', 'connectionStatus'],
        ['connectionStatus'],
      ])),
      number: this.normalizeOptionalString(this.readPayloadValue(entry, [
        ['instance', 'number'],
        ['number'],
      ])),
      token: this.normalizeOptionalString(this.readPayloadValue(entry, [
        ['instance', 'token'],
        ['token'],
      ])),
      qrcode: this.readPayloadValue(entry, [
        ['instance', 'qrcode'],
        ['qrcode'],
        ['instance', 'Qrcode'],
        ['Qrcode'],
      ]),
    };
  }

  private async fetchEvolutionInstance(
    client: AxiosInstance,
    instanceKey: string,
  ): Promise<EvolutionInstanceSnapshot | null> {
    const response = await client.get<unknown>(
      `/instance/fetchInstances`,
      {
        params: {
          instanceName: instanceKey,
        },
      },
    );

    const payload = this.readFetchInstancesEntries(response.data);
    for (const entry of payload) {
      const instance = this.normalizeEvolutionInstance(entry);
      if (this.normalizeOptionalString(instance?.instanceName) !== instanceKey) continue;

      return {
        instance,
        qr: await this.extractQrPayload(entry),
      };
    }

    return null;
  }

  private async createEvolutionInstance(client: AxiosInstance, company: CompanyTemporaryFields, instanceKey: string) {
    const ownerNumber =
      this.normalizeDigits(company.whatsappNumber) || this.normalizeDigits(company.contactPhone);

    const response = await client.post('/instance/create', {
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

    return this.extractQrPayload(response.data);
  }

  private parseAxiosError(error: unknown) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || null;
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

  private async sleep(delayMs: number) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  private isAlreadyExistingInstanceError(error: unknown) {
    const parsed = this.parseAxiosError(error);
    const message = String(parsed.message || '').toLowerCase();
    return message.includes('already') || message.includes('exists') || parsed.status === 409;
  }

  private isTransientInstanceNotFoundError(error: unknown) {
    const parsed = this.parseAxiosError(error);
    const message = String(parsed.message || '').trim().toLowerCase();
    return parsed.status === 404 && (
      message.includes('instance')
      || message.includes('not found')
      || message.includes('not exist')
      || message.includes('does not exist')
      || message.includes('404')
    );
  }

  private async createEvolutionInstanceIfMissing(
    client: AxiosInstance,
    company: CompanyTemporaryFields,
    instanceKey: string,
  ) {
    try {
      return await this.createEvolutionInstance(client, company, instanceKey);
    } catch (error) {
      if (!this.isAlreadyExistingInstanceError(error)) {
        const parsed = this.parseAxiosError(error);
        throw new BadRequestException(parsed.message);
      }
    }

    return null;
  }

  private async deleteEvolutionInstance(
    client: AxiosInstance,
    instanceKey: string,
    instanceId?: string | null,
  ) {
    const targets = [instanceKey, this.normalizeOptionalString(instanceId)].filter(
      (target, index, items): target is string => Boolean(target && items.indexOf(target) === index),
    );
    let lastError: unknown = null;

    for (const target of targets) {
      try {
        await client.delete(`/instance/delete/${encodeURIComponent(target)}`);
        return;
      } catch (error) {
        lastError = error;
        if (!this.isTransientInstanceNotFoundError(error)) {
          throw error;
        }
      }
    }

    if (lastError && !this.isTransientInstanceNotFoundError(lastError)) {
      throw lastError;
    }
  }

  private async retryFetchEvolutionInstance(
    client: AxiosInstance,
    instanceKey: string,
    attempts = 4,
  ) {
    const delaysMs = [600, 1000, 1500, 2200];
    const maxAttempts = Math.max(1, Math.min(Math.trunc(attempts), delaysMs.length));
    for (const delayMs of delaysMs.slice(0, maxAttempts)) {
      await this.sleep(delayMs);
      const instance = await this.fetchEvolutionInstance(client, instanceKey);
      if (instance) return instance;
    }

    return null;
  }

  private resolveDisplayNumber(instance: EvolutionInstanceEntry['instance'] | null) {
    const owner = this.normalizeDigits(instance?.owner);
    if (owner) return owner;
    const number = this.normalizeDigits(instance?.number);
    if (number) return number;
    return this.normalizeOptionalString(instance?.profileName);
  }

  private resolveInstanceState(instance: EvolutionInstanceEntry['instance'] | null) {
    return this.normalizeOptionalString(
      instance?.status
      || instance?.profileStatus
      || (instance as any)?.state
      || (instance as any)?.connectionStatus,
    );
  }

  private async buildQrCodeDataUrl(value: string | null) {
    if (!value) return null;
    return QRCode.toDataURL(value, {
      width: 320,
      margin: 1,
    });
  }

  private normalizeBase64QrCodeDataUrl(value: unknown) {
    const base64 = this.normalizeOptionalString(value);
    if (!base64 || this.isRecord(value)) return null;
    if (/^data:image\//i.test(base64)) return base64;
    if (!/^[a-z0-9+/=\r\n]+$/i.test(base64) || base64.replace(/\s/g, '').length < 120) return null;
    return `data:image/png;base64,${base64}`;
  }

  private mergeQrPayloads(payloads: Array<NormalizedQrPayload | null | undefined>) {
    const merged: NormalizedQrPayload = {
      code: null,
      pairingCode: null,
      qrCodeDataUrl: null,
    };

    for (const payload of payloads) {
      if (!payload) continue;
      merged.code ||= payload.code;
      merged.pairingCode ||= payload.pairingCode;
      merged.qrCodeDataUrl ||= payload.qrCodeDataUrl;
    }

    return merged;
  }

  private hasQrPayload(payload: NormalizedQrPayload | null | undefined) {
    return Boolean(payload?.qrCodeDataUrl || payload?.pairingCode || payload?.code);
  }

  private isPendingQrPayload(payload: unknown) {
    const count = Number(this.readPayloadValue(payload, [
      ['count'],
      ['response', 'count'],
      ['data', 'count'],
    ]));
    return Number.isFinite(count) && count === 0;
  }

  private async extractQrPayload(payload: unknown): Promise<NormalizedQrPayload> {
    const code = this.normalizePayloadString(this.readPayloadValue(payload, [
      ['code'],
      ['Code'],
      ['response', 'code'],
      ['response', 'Code'],
      ['response', 'qrcode', 'code'],
      ['response', 'qrcode', 'Code'],
      ['response', 'qrcode'],
      ['response', 'Qrcode'],
      ['instance', 'code'],
      ['instance', 'Code'],
      ['instance', 'qrcode', 'code'],
      ['instance', 'qrcode', 'Code'],
      ['instance', 'qrcode'],
      ['instance', 'Qrcode'],
      ['qrcode', 'code'],
      ['qrcode', 'Code'],
      ['qrcode'],
      ['Qrcode', 'code'],
      ['Qrcode', 'Code'],
      ['Qrcode'],
      ['data', 'code'],
      ['data', 'Code'],
      ['data', 'qrcode', 'code'],
      ['data', 'qrcode', 'Code'],
      ['data', 'Qrcode', 'code'],
      ['data', 'Qrcode', 'Code'],
      ['data', 'Qrcode'],
      ['data', 'qrcode'],
    ]));
    const pairingCode = this.normalizePayloadString(this.readPayloadValue(payload, [
      ['pairingCode'],
      ['PairingCode'],
      ['pairing_code'],
      ['response', 'pairingCode'],
      ['response', 'PairingCode'],
      ['response', 'pairing_code'],
      ['response', 'qrcode', 'pairingCode'],
      ['response', 'qrcode', 'PairingCode'],
      ['instance', 'pairingCode'],
      ['instance', 'PairingCode'],
      ['instance', 'qrcode', 'pairingCode'],
      ['instance', 'qrcode', 'PairingCode'],
      ['qrcode', 'pairingCode'],
      ['qrcode', 'PairingCode'],
      ['qrcode', 'pairing_code'],
      ['Qrcode', 'pairingCode'],
      ['Qrcode', 'PairingCode'],
      ['data', 'pairingCode'],
      ['data', 'PairingCode'],
      ['data', 'pairing_code'],
      ['data', 'qrcode', 'pairingCode'],
      ['data', 'qrcode', 'PairingCode'],
      ['data', 'Qrcode', 'pairingCode'],
      ['data', 'Qrcode', 'PairingCode'],
    ]));
    const qrCodeDataUrl = this.normalizeBase64QrCodeDataUrl(this.readPayloadValue(payload, [
      ['base64'],
      ['Base64'],
      ['response', 'base64'],
      ['response', 'Base64'],
      ['response', 'qrcode', 'base64'],
      ['response', 'qrcode', 'Base64'],
      ['response', 'qrcode', 'qrcode'],
      ['response', 'qrcode', 'Qrcode'],
      ['instance', 'base64'],
      ['instance', 'Base64'],
      ['instance', 'qrcode', 'base64'],
      ['instance', 'qrcode', 'Base64'],
      ['instance', 'qrcode', 'qrcode'],
      ['instance', 'qrcode', 'Qrcode'],
      ['qrcode', 'base64'],
      ['qrcode', 'Base64'],
      ['qrcode', 'qrcode'],
      ['qrcode', 'Qrcode'],
      ['Qrcode', 'base64'],
      ['Qrcode', 'Base64'],
      ['Qrcode', 'qrcode'],
      ['Qrcode', 'Qrcode'],
      ['data', 'base64'],
      ['data', 'Base64'],
      ['data', 'qrcode', 'base64'],
      ['data', 'qrcode', 'Base64'],
      ['data', 'Qrcode', 'base64'],
      ['data', 'Qrcode', 'Base64'],
      ['data', 'Qrcode'],
      ['data', 'qrcode'],
    ]));

    return {
      code,
      pairingCode,
      qrCodeDataUrl: qrCodeDataUrl || (code ? await this.buildQrCodeDataUrl(code) : null),
    };
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

  private async ensureEvolutionInstance(
    client: AxiosInstance,
    company: CompanyTemporaryFields,
    preferredInstanceKey?: string | null,
  ) {
    const instanceKey = this.normalizeOptionalString(preferredInstanceKey) || this.buildInstanceKey(company);
    let snapshot = await this.fetchEvolutionInstance(client, instanceKey);
    let createQr: NormalizedQrPayload | null = null;

    if (!snapshot) {
      createQr = await this.createEvolutionInstanceIfMissing(client, company, instanceKey);
      if (createQr?.qrCodeDataUrl || createQr?.pairingCode) {
        await this.prisma.company.update({
          where: { id: Number(company.id) },
          data: {
            whatsappTemporaryInstanceKey: instanceKey,
            whatsappTemporaryProvider: 'EVOLUTION_API',
            ...(createQr.pairingCode ? { whatsappTemporaryPairingCode: createQr.pairingCode } : {}),
            ...(createQr.qrCodeDataUrl ? { whatsappTemporaryQrCodeData: createQr.qrCodeDataUrl } : {}),
          },
        });
      }
      snapshot = await this.retryFetchEvolutionInstance(client, instanceKey, 4);
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
      instance: snapshot?.instance || null,
      createQr,
      instanceQr: snapshot?.qr || null,
    };
  }

  private async fetchConnectionState(client: AxiosInstance, instanceKey: string) {
    const response = await client.get<{ instance?: { state?: string; status?: string } }>(
      `/instance/connectionState/${encodeURIComponent(instanceKey)}`,
    );
    return this.normalizeOptionalString(response.data?.instance?.state || response.data?.instance?.status);
  }

  private async fetchConnectionStateWithRecovery(
    client: AxiosInstance,
    company: CompanyTemporaryFields,
    instanceKey: string,
    options?: {
      allowMissingAfterRecovery?: boolean;
    },
  ) {
    try {
      return await this.fetchConnectionState(client, instanceKey);
    } catch (error) {
      if (!this.isTransientInstanceNotFoundError(error)) {
        throw error;
      }

      const parsed = this.parseAxiosError(error);
      this.logger.warn(
        `Temporary WhatsApp provider did not find instance ${instanceKey} during connectionState: ${parsed.message}. Refetching before one recreate attempt.`,
      );

      let snapshot = await this.fetchEvolutionInstance(client, instanceKey);
      if (!snapshot) {
        await this.createEvolutionInstanceIfMissing(client, company, instanceKey);
        snapshot = await this.retryFetchEvolutionInstance(client, instanceKey, 4);
      }

      if (!snapshot) {
        if (options?.allowMissingAfterRecovery) {
          return null;
        }
        throw error;
      }

      await this.sleep(800);
      try {
        return await this.fetchConnectionState(client, instanceKey);
      } catch (retryError) {
        if (this.isTransientInstanceNotFoundError(retryError)) {
          return null;
        }
        throw retryError;
      }
    }
  }

  private async fetchConnectPayload(client: AxiosInstance, instanceKey: string, number?: string | null) {
    const response = await client.get<unknown>(
      `/instance/connect/${encodeURIComponent(instanceKey)}`,
      {
        params: number ? { number } : undefined,
      },
    );

    const qr = await this.extractQrPayload(response.data);
    return {
      ...qr,
      pending: !this.hasQrPayload(qr) && this.isPendingQrPayload(response.data),
    };
  }

  private async pollQrFromEvolutionInstance(
    client: AxiosInstance,
    instanceKey: string,
    attempts = 6,
  ): Promise<EvolutionInstanceSnapshot | null> {
    const delaysMs = [1000, 1000, 1200, 1500, 1800, 2200];
    const maxAttempts = Math.max(1, Math.min(Math.trunc(attempts), delaysMs.length));
    let latestSnapshot: EvolutionInstanceSnapshot | null = null;

    for (const delayMs of delaysMs.slice(0, maxAttempts)) {
      await this.sleep(delayMs);
      const snapshot = await this.fetchEvolutionInstance(client, instanceKey);
      if (!snapshot) continue;
      latestSnapshot = snapshot;
      if (this.hasQrPayload(snapshot.qr)) return snapshot;
    }

    return latestSnapshot;
  }

  private async fetchExistingInstanceAfterNotFound(
    client: AxiosInstance,
    instanceKey: string | null,
    error: unknown,
  ) {
    if (!instanceKey || !this.isTransientInstanceNotFoundError(error)) return null;
    try {
      return await this.fetchEvolutionInstance(client, instanceKey);
    } catch {
      return null;
    }
  }

  private async fetchConnectQrDirectly(
    client: AxiosInstance,
    instanceKey: string,
    number?: string | null,
  ) {
    let latestQr: NormalizedQrPayload = {
      code: null,
      pairingCode: null,
      qrCodeDataUrl: null,
      pending: true,
    };

    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (attempt > 0) {
        await this.sleep(1500);
      }

      try {
        latestQr = await this.fetchConnectPayload(client, instanceKey, number);
        if (this.hasQrPayload(latestQr)) {
          return latestQr;
        }
      } catch (error) {
        if (!this.isTransientInstanceNotFoundError(error)) {
          throw error;
        }

        const parsed = this.parseAxiosError(error);
        this.logger.warn(
          `Temporary WhatsApp provider returned not found during direct QR connect for existing instance ${instanceKey}: ${parsed.message}`,
        );
      }
    }

    return latestQr;
  }

  private async syncQrWithEvolutionProvider(
    client: AxiosInstance,
    company: CompanyTemporaryFields,
    instanceKey: string,
    lastSyncAt: Date,
  ): Promise<TemporarySyncResult> {
    let snapshot = await this.fetchEvolutionInstance(client, instanceKey);
    let createQr: NormalizedQrPayload | null = null;

    if (!snapshot) {
      createQr = await this.createEvolutionInstanceIfMissing(client, company, instanceKey);
      snapshot = await this.retryFetchEvolutionInstance(client, instanceKey, 4);
    }

    if (!snapshot) {
      return {
        connected: false,
        temporaryStatus: 'ATTENTION',
        rawState: null,
        qrCodeDataUrl: null,
        pairingCode: null,
        displayNumber: this.normalizeOptionalString(company.whatsappTemporaryDisplayNumber),
        provider: 'EVOLUTION_API',
        errorMessage: `Instance "${instanceKey}" not found`,
        connectedAt: null,
        lastSyncAt,
        instanceKey,
      };
    }

    const number = this.normalizeDigits(company.whatsappNumber) || this.normalizeDigits(company.contactPhone);
    let selectedQr = this.mergeQrPayloads([createQr, snapshot.qr]);

    if (!this.hasQrPayload(selectedQr)) {
      const connectQr = await this.fetchConnectQrDirectly(client, instanceKey, number);
      selectedQr = this.mergeQrPayloads([connectQr, selectedQr]);
    }

    if (!this.hasQrPayload(selectedQr)) {
      this.logger.warn(
        `Temporary WhatsApp provider returned no QR for existing instance ${instanceKey}; recreating the temporary instance once.`,
      );
      await this.deleteEvolutionInstance(client, instanceKey, snapshot.instance?.instanceId);
      await this.sleep(800);

      createQr = await this.createEvolutionInstanceIfMissing(client, company, instanceKey);
      snapshot = await this.retryFetchEvolutionInstance(client, instanceKey, 4);

      if (snapshot) {
        selectedQr = this.mergeQrPayloads([createQr, snapshot.qr]);
        if (!this.hasQrPayload(selectedQr)) {
          const reconnectQr = await this.fetchConnectQrDirectly(client, instanceKey, number);
          selectedQr = this.mergeQrPayloads([reconnectQr, selectedQr]);
        }
      }
    }

    return {
      connected: false,
      temporaryStatus: 'ATTENTION',
      rawState: this.resolveInstanceState(snapshot?.instance || null),
      qrCodeDataUrl: selectedQr.qrCodeDataUrl,
      pairingCode: selectedQr.pairingCode,
      displayNumber:
        this.resolveDisplayNumber(snapshot?.instance || null)
        || this.normalizeOptionalString(company.whatsappTemporaryDisplayNumber),
      provider: 'EVOLUTION_API',
      errorMessage: null,
      connectedAt: null,
      lastSyncAt,
      instanceKey,
    };
  }

  private async fetchConnectPayloadWithRecovery(
    client: AxiosInstance,
    company: CompanyTemporaryFields,
    instanceKey: string,
    number?: string | null,
  ) {
    try {
      return await this.fetchConnectPayload(client, instanceKey, number);
    } catch (error) {
      if (!this.isTransientInstanceNotFoundError(error)) {
        throw error;
      }

      const parsed = this.parseAxiosError(error);
      this.logger.warn(
        `Temporary WhatsApp provider did not find instance ${instanceKey} during connect: ${parsed.message}. Refetching before one recreate attempt.`,
      );

      let snapshot = await this.fetchEvolutionInstance(client, instanceKey);
      let recreateQr: NormalizedQrPayload | null = null;
      if (!snapshot) {
        recreateQr = await this.createEvolutionInstanceIfMissing(client, company, instanceKey);
        snapshot = await this.retryFetchEvolutionInstance(client, instanceKey, 4);
      }

      if (!snapshot) {
        throw error;
      }

      const fallbackQr = this.mergeQrPayloads([recreateQr, snapshot.qr]);
      await this.sleep(800);
      try {
        return await this.fetchConnectPayload(client, instanceKey, number);
      } catch (retryError) {
        if (this.isTransientInstanceNotFoundError(retryError)) {
          return {
            ...fallbackQr,
            pending: !this.hasQrPayload(fallbackQr),
          };
        }
        throw retryError;
      }
    }
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
    const intendedInstanceKey = this.buildInstanceKey(company);
    let preservedInstanceKey = intendedInstanceKey;
    let preservedPairingCode = this.normalizeOptionalString(company.whatsappTemporaryPairingCode);
    let preservedQrCodeDataUrl = this.normalizeOptionalString(company.whatsappTemporaryQrCodeData);
    let preservedDisplayNumber = this.normalizeOptionalString(company.whatsappTemporaryDisplayNumber);
    let preservedConnectedAt = company.whatsappTemporaryConnectedAt || null;
    const savedQrPayload: NormalizedQrPayload = {
      code: null,
      pairingCode: preservedPairingCode,
      qrCodeDataUrl: preservedQrCodeDataUrl,
    };

    if (requestQr) {
      return this.syncQrWithEvolutionProvider(client, company, intendedInstanceKey, lastSyncAt);
    }

    try {
      const { instanceKey, instance, createQr, instanceQr } = await this.ensureEvolutionInstance(
        client,
        company,
        intendedInstanceKey,
      );
      preservedInstanceKey = instanceKey;
      const currentSnapshot = instance ? null : await this.retryFetchEvolutionInstance(client, instanceKey, 4);
      const currentInstance = instance || currentSnapshot?.instance || null;
      const fetchQr = instanceQr || currentSnapshot?.qr || null;
      const providerQrPayload = this.mergeQrPayloads([createQr, fetchQr]);
      const initialQrPayload = this.mergeQrPayloads([providerQrPayload, savedQrPayload]);
      preservedPairingCode = initialQrPayload.pairingCode;
      preservedQrCodeDataUrl = initialQrPayload.qrCodeDataUrl;
      preservedDisplayNumber =
        this.resolveDisplayNumber(currentInstance)
        || preservedDisplayNumber;
      const connectedFromSnapshot = this.isConnectedState(this.resolveInstanceState(currentInstance));
      let connectQr: NormalizedQrPayload | null = null;
      let connectSnapshot: EvolutionInstanceSnapshot | null = null;

      if (!connectedFromSnapshot && requestQr && !this.hasQrPayload(providerQrPayload)) {
        connectQr = await this.fetchConnectPayloadWithRecovery(
          client,
          company,
          instanceKey,
          this.normalizeDigits(company.whatsappNumber) || this.normalizeDigits(company.contactPhone),
        );
      }

      if (connectQr?.pending && !this.hasQrPayload(connectQr)) {
        connectSnapshot = await this.pollQrFromEvolutionInstance(client, instanceKey, 6);
      }

      const connectFetchQr = connectSnapshot?.qr || null;
      const latestInstance = connectSnapshot?.instance || currentInstance;
      if (connectSnapshot?.instance) {
        preservedDisplayNumber =
          this.resolveDisplayNumber(connectSnapshot.instance)
          || preservedDisplayNumber;
      }

      const selectedQrPayload = this.mergeQrPayloads([createQr, connectQr, connectFetchQr, fetchQr, savedQrPayload]);
      const hasSelectedQrPayload = this.hasQrPayload(selectedQrPayload);
      preservedPairingCode = selectedQrPayload.pairingCode;
      preservedQrCodeDataUrl = selectedQrPayload.qrCodeDataUrl;

      if (hasSelectedQrPayload) {
        await this.prisma.company.update({
          where: { id: Number(company.id) },
          data: {
            whatsappTemporaryStatus: 'ATTENTION',
            whatsappTemporaryInstanceKey: instanceKey,
            whatsappTemporaryProvider: 'EVOLUTION_API',
            whatsappTemporaryPairingCode: preservedPairingCode,
            whatsappTemporaryQrCodeData: preservedQrCodeDataUrl,
            whatsappTemporaryLastSyncAt: lastSyncAt,
            whatsappTemporaryStatusError: null,
          },
        });
      }

      let rawState = this.resolveInstanceState(latestInstance);
      let stateErrorMessage: string | null = null;

      try {
        rawState =
          await this.fetchConnectionStateWithRecovery(client, company, instanceKey, {
            allowMissingAfterRecovery: hasSelectedQrPayload,
          })
          || rawState;
      } catch (error) {
        if (!hasSelectedQrPayload) {
          throw error;
        }

        const parsed = this.parseAxiosError(error);
        stateErrorMessage = parsed.message;
        this.logger.warn(
          `Temporary WhatsApp provider state check failed after QR was captured for company ${company.id}: ${parsed.message}`,
        );
      }

      const connected = this.isConnectedState(rawState);
      const instanceExists = Boolean(latestInstance);

      if (connected) {
        preservedPairingCode = null;
        preservedQrCodeDataUrl = null;
        preservedConnectedAt = company.whatsappTemporaryConnectedAt || lastSyncAt;
      }

      return {
        connected,
        temporaryStatus: connected
          ? 'TEMPORARY'
          : requestQr || String(rawState || '').trim() || preservedQrCodeDataUrl || preservedPairingCode
            ? 'ATTENTION'
            : 'NOT_CONNECTED',
        rawState,
        qrCodeDataUrl: preservedQrCodeDataUrl,
        pairingCode: preservedPairingCode,
        displayNumber: preservedDisplayNumber,
        provider: 'EVOLUTION_API',
        errorMessage: connected || instanceExists ? null : stateErrorMessage,
        connectedAt: connected ? preservedConnectedAt : null,
        lastSyncAt,
        instanceKey,
      } satisfies TemporarySyncResult;
    } catch (error) {
      const parsed = this.parseAxiosError(error);
      const latestCompany = await this.loadCompany(company.id).catch(() => company);
      const instanceKey =
        preservedInstanceKey
        || this.normalizeOptionalString(latestCompany.whatsappTemporaryInstanceKey);
      const existingSnapshot = await this.fetchExistingInstanceAfterNotFound(client, instanceKey, error);
      const pairingCode =
        preservedPairingCode
        || existingSnapshot?.qr?.pairingCode
        || this.normalizeOptionalString(latestCompany.whatsappTemporaryPairingCode);
      const qrCodeDataUrl =
        preservedQrCodeDataUrl
        || existingSnapshot?.qr?.qrCodeDataUrl
        || this.normalizeOptionalString(latestCompany.whatsappTemporaryQrCodeData);
      const displayNumber =
        preservedDisplayNumber
        || this.resolveDisplayNumber(existingSnapshot?.instance || null)
        || this.normalizeOptionalString(latestCompany.whatsappTemporaryDisplayNumber);
      const rawState = this.resolveInstanceState(existingSnapshot?.instance || null);
      this.logger.warn(`Temporary WhatsApp provider sync failed for company ${company.id}: ${parsed.message}`);
      return {
        connected: false,
        temporaryStatus: 'ATTENTION',
        rawState,
        qrCodeDataUrl,
        pairingCode,
        displayNumber,
        provider: 'EVOLUTION_API',
        errorMessage: existingSnapshot
          ? null
          : parsed.message || this.normalizeOptionalString(latestCompany.whatsappTemporaryStatusError),
        connectedAt: preservedConnectedAt || latestCompany.whatsappTemporaryConnectedAt || null,
        lastSyncAt,
        instanceKey,
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
