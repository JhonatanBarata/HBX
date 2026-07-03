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
  payload?: unknown;
  attempts?: number | null;
  nextRetryAt?: Date | null;
  lastError?: string | null;
  processedAt?: Date | null;
  status: string;
  createdAt?: Date;
  updatedAt?: Date;
};

// ARQ11 S1 — backoff exponencial do worker (índice = attempts já feitas antes desta falha).
// Após 8 tentativas o evento vai a dead_letter (ver ExternalWebhookLedgerService.markRetry).
const RETRY_BACKOFF_MS = [
  60_000, // 1 min
  5 * 60_000, // 5 min
  30 * 60_000, // 30 min
  2 * 60 * 60_000, // 2 h
  12 * 60 * 60_000, // 12 h
];
const MAX_RETRY_ATTEMPTS = 8;

export function retryBackoffMs(attempts: number): number {
  const idx = Math.min(Math.max(0, attempts), RETRY_BACKOFF_MS.length - 1);
  return RETRY_BACKOFF_MS[idx];
}

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

// ARQ11 S1 — converte o payload para algo que o Postgres aceita na coluna Json.
// Buffer vira string utf8; qualquer valor que não sobreviva a JSON.stringify é degradado
// para a serialização estável (nunca lança — o objetivo é guardar o replay, não validar).
function jsonSafePayload(payload: unknown): unknown {
  if (payload === undefined) return null;
  if (Buffer.isBuffer(payload)) return payload.toString('utf8');
  try {
    return JSON.parse(JSON.stringify(payload));
  } catch {
    return stableSerialize(payload);
  }
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
      payload: row.payload ?? null,
      attempts: row.attempts ?? 0,
      nextRetryAt: row.nextRetryAt ?? null,
      lastError: row.lastError ?? null,
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
          // ARQ11 S1 — guarda o payload COMPLETO (JSON-safe) para replay do worker. Buffers/valores
          // não serializáveis viram string via jsonSafePayload; nunca derruba o create.
          payload: jsonSafePayload(payload) as any,
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

  // ==========================================================================
  // ARQ11 S1 — FILA DURÁVEL DE RETRY (consumida pelo worker por @Cron/tick)
  // ==========================================================================

  /**
   * Reclama atomicamente um lote de eventos prontos para processar
   * (status in ('received','retry') com nextRetryAt null OU <= now), movendo-os para
   * 'processing' e devolvendo APENAS as linhas que ESTE chamador ganhou.
   *
   * Seguro contra corrida / réplica: o claim de cada linha é um updateMany condicional
   * pela (id + status atual) — só a primeira transação a virar o status conta, as demais
   * recebem count=0 e a linha não entra no lote retornado. Sem SELECT ... FOR UPDATE
   * (que o Prisma não expõe direto) e sem token de claim extra.
   */
  async claimBatchForProcessing(providerRaw: unknown, limit = 20, now = new Date()) {
    const provider = normalizeProvider(providerRaw);
    const take = Math.max(1, Math.min(200, Math.trunc(Number(limit) || 20)));

    const candidates = await this.prisma.externalWebhookEvent.findMany({
      where: {
        provider,
        status: { in: ['received', 'retry'] },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      orderBy: { createdAt: 'asc' },
      take,
    });

    const claimed: ReturnType<ExternalWebhookLedgerService['serialize']>[] = [];
    for (const candidate of candidates) {
      const result = await this.prisma.externalWebhookEvent.updateMany({
        where: { id: candidate.id, status: candidate.status },
        data: { status: 'processing' },
      });
      if (result.count === 1) {
        claimed.push(this.serialize({ ...candidate, status: 'processing' }, false));
      }
    }
    return claimed.filter(Boolean);
  }

  /**
   * Falha transitória no worker: incrementa attempts e reprograma o próximo retry pelo
   * backoff exponencial [1min,5min,30min,2h,12h]. Ao cruzar MAX_RETRY_ATTEMPTS (8) o evento
   * vai a 'dead_letter' (não é mais reclamado) — visível/reprocessável manualmente.
   * Retorna { row, deadLettered } para o worker decidir marcar a conexão com erro.
   */
  async markRetry(providerRaw: unknown, eventIdRaw: unknown, lastError: unknown, now = new Date()) {
    const provider = normalizeProvider(providerRaw);
    const eventId = String(normalizeText(eventIdRaw, '') || '').trim();
    if (!eventId) return null;

    const current = await this.find(provider, eventId);
    const attempts = Math.max(0, Math.trunc(Number((current as any)?.attempts ?? 0))) + 1;
    const deadLettered = attempts >= MAX_RETRY_ATTEMPTS;
    const nextRetryAt = deadLettered ? null : new Date(now.getTime() + retryBackoffMs(attempts - 1));
    const message = String(normalizeText(lastError, 'erro desconhecido') || 'erro desconhecido').slice(0, 500);

    const updated = await this.prisma.externalWebhookEvent.update({
      where: { provider_eventId: { provider, eventId } },
      data: {
        status: deadLettered ? 'dead_letter' : 'retry',
        attempts,
        nextRetryAt,
        lastError: message,
      },
    });
    return { row: this.serialize(updated, false), deadLettered, attempts };
  }

  /**
   * Manda o evento direto para 'dead_letter' (falha PERMANENTE — ex.: lead sem forma de
   * contato). Não consome as tentativas de backoff: não adianta re-tentar algo que nunca
   * vai passar. Guarda lastError para observabilidade/reprocessamento manual.
   */
  async markDeadLetter(providerRaw: unknown, eventIdRaw: unknown, lastError: unknown) {
    const provider = normalizeProvider(providerRaw);
    const eventId = String(normalizeText(eventIdRaw, '') || '').trim();
    if (!eventId) return null;
    const message = String(normalizeText(lastError, 'descartado (permanente)') || 'descartado (permanente)').slice(0, 500);
    const updated = await this.prisma.externalWebhookEvent.update({
      where: { provider_eventId: { provider, eventId } },
      data: { status: 'dead_letter', nextRetryAt: null, lastError: message },
    });
    return this.serialize(updated, false);
  }
}
