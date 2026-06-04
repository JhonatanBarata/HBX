import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

type WebhookRecordOptions = {
  companyId?: number | null;
  eventType?: unknown;
  signatureStatus?: unknown;
};

type LedgerRow = {
  id: string;
  companyId?: number | null;
  provider: string;
  eventId: string;
  eventType?: string | null;
  signatureStatus: string;
  payloadHash: string;
  processedAt?: Date | null;
  status: string;
  createdAt?: Date;
  updatedAt?: Date;
};

function normalizeText(value: unknown, fallback?: string) {
  const normalized = String(value || '').trim();
  return normalized || fallback || null;
}

function normalizeProvider(value: unknown) {
  return String(normalizeText(value, 'unknown') || 'unknown').trim().toLowerCase();
}

function normalizeEventId(value: unknown, payloadHash: string) {
  return String(normalizeText(value, payloadHash) || payloadHash).trim();
}

function normalizeCompanyId(value: unknown) {
  const parsed = Math.trunc(Number(value || 0));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function stableSerialize(value: unknown): string {
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`);
    return `{${entries.join(',')}}`;
  }
  return String(value);
}

export function externalWebhookPayloadHash(payload: unknown) {
  return createHash('sha256').update(stableSerialize(payload), 'utf8').digest('hex');
}

@Injectable()
export class ExternalWebhookLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  private serialize(row: LedgerRow | null | undefined, duplicate = false) {
    if (!row) return null;
    return {
      id: row.id,
      companyId: row.companyId ?? null,
      provider: row.provider,
      eventId: row.eventId,
      eventType: row.eventType ?? null,
      signatureStatus: row.signatureStatus,
      payloadHash: row.payloadHash,
      status: row.status,
      processedAt: row.processedAt ?? null,
      duplicate,
      createdAt: row.createdAt ?? null,
      updatedAt: row.updatedAt ?? null,
    };
  }

  private async find(provider: string, eventId: string) {
    return this.prisma.externalWebhookEvent.findUnique({
      where: { provider_eventId: { provider, eventId } },
    });
  }

  async recordReceived(providerRaw: unknown, eventIdRaw: unknown, payload: unknown, options: WebhookRecordOptions = {}) {
    const payloadHash = externalWebhookPayloadHash(payload);
    const provider = normalizeProvider(providerRaw);
    const eventId = normalizeEventId(eventIdRaw, payloadHash);
    const existing = await this.find(provider, eventId);
    if (existing) {
      return this.serialize(existing, true);
    }

    try {
      const created = await this.prisma.externalWebhookEvent.create({
        data: {
          companyId: normalizeCompanyId(options.companyId),
          provider,
          eventId,
          eventType: normalizeText(options.eventType),
          signatureStatus: normalizeText(options.signatureStatus, 'unknown'),
          payloadHash,
          status: 'received',
        },
      });
      return this.serialize(created, false);
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const duplicate = await this.find(provider, eventId);
        return this.serialize(duplicate, true);
      }
      throw error;
    }
  }

  async wasProcessed(providerRaw: unknown, eventIdRaw: unknown) {
    const provider = normalizeProvider(providerRaw);
    const eventId = String(normalizeText(eventIdRaw, '') || '').trim();
    if (!eventId) return false;
    const row = await this.find(provider, eventId);
    return Boolean(row?.processedAt || row?.status === 'processed');
  }

  async markProcessed(providerRaw: unknown, eventIdRaw: unknown, processedAt = new Date()) {
    const provider = normalizeProvider(providerRaw);
    const eventId = String(normalizeText(eventIdRaw, '') || '').trim();
    if (!eventId) return null;
    const updated = await this.prisma.externalWebhookEvent.update({
      where: { provider_eventId: { provider, eventId } },
      data: {
        status: 'processed',
        processedAt,
      },
    });
    return this.serialize(updated, false);
  }

  async markRejected(providerRaw: unknown, eventIdRaw: unknown, signatureStatus: unknown = 'rejected') {
    const provider = normalizeProvider(providerRaw);
    const eventId = String(normalizeText(eventIdRaw, '') || '').trim();
    if (!eventId) return null;
    const updated = await this.prisma.externalWebhookEvent.update({
      where: { provider_eventId: { provider, eventId } },
      data: {
        status: 'rejected',
        signatureStatus: normalizeText(signatureStatus, 'rejected'),
      },
    });
    return this.serialize(updated, false);
  }
}
