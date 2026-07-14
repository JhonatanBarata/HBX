import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const BLOCKED_RADAR_STATUSES = ['complaint', 'denied', 'hidden', 'rejected'];
const NATIONAL_COUNT_TTL_MS = 5 * 60_000;

function safeText(value: unknown, max = 280) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalize(value: unknown) {
  return safeText(value, 260)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function parseJsonRecord(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function cnpjDigits(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 14 ? digits : '';
}

function findCnpjInRecord(value: unknown, depth = 0): string {
  if (!value || depth > 4) return '';
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 40)) {
      const found = findCnpjInRecord(item, depth + 1);
      if (found) return found;
    }
    return '';
  }
  if (typeof value !== 'object') return '';
  for (const [key, item] of Object.entries(value as Record<string, any>).slice(0, 120)) {
    if (normalize(key).includes('cnpj')) {
      const direct = cnpjDigits(item);
      if (direct) return direct;
    }
    const nested = findCnpjInRecord(item, depth + 1);
    if (nested) return nested;
  }
  return '';
}

function extractPoolCnpj(row: any) {
  const structured = findCnpjInRecord(parseJsonRecord(row?.metadataJson))
    || findCnpjInRecord(parseJsonRecord(row?.evidenceJson));
  if (structured) return structured;
  const sourceMatch = String(row?.sourceUrl || '').match(/(?:cnpj(?:-base)?[^0-9]*)?(\d{14})(?:\D|$)/i);
  return cnpjDigits(sourceMatch?.[1]);
}

function websiteIdentity(value: unknown) {
  const raw = safeText(value, 500);
  if (!raw) return '';
  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function poolIdentityKey(row: any, cnpj: string) {
  if (cnpj) return `cnpj:${cnpj}`;
  const placeId = safeText(row?.placeId, 240);
  if (placeId) return `place:${placeId}`;
  const host = websiteIdentity(row?.website);
  if (host) return `site:${host}`;
  const name = normalize(row?.name);
  const city = normalize(row?.city || row?.normalizedCity);
  const state = normalize(row?.state);
  if (name) return `name:${name}|${city}|${state}`;
  return `pool:${safeText(row?.id, 240)}`;
}

function startOfLocalDay(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

@Injectable()
export class LeadsBankService {
  private nationalActiveCountCache: { value: number | null; available: boolean; expiresAt: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private async getNationalActiveCount() {
    const now = Date.now();
    if (this.nationalActiveCountCache && this.nationalActiveCountCache.expiresAt > now) {
      return this.nationalActiveCountCache;
    }
    const available = await this.prisma.hasTable('CnpjPublicCompany').catch(() => false);
    let value: number | null = null;
    if (available && (this.prisma as any).cnpjPublicCompany?.count) {
      value = await (this.prisma as any).cnpjPublicCompany
        .count({ where: { situacao: 'ativa' } })
        .then((count: unknown) => Number.isFinite(Number(count)) ? Math.max(0, Math.trunc(Number(count))) : null)
        .catch(() => null);
    }
    const result = { value, available: available && value != null, expiresAt: now + NATIONAL_COUNT_TTL_MS };
    this.nationalActiveCountCache = result;
    return result;
  }

  /**
   * Universo único: CNPJs ativos da RFB ∪ identidades exclusivas do motor.
   * Nunca soma cegamente o pool; primeiro elimina tudo que já existe na RFB e
   * deduplica os exclusivos por CNPJ/placeId/site/nome+localidade.
   */
  async getLeadsBank() {
    const national = await this.getNationalActiveCount();
    const poolAvailable = await this.prisma.hasTable('RadarLeadPool').catch(() => false);
    const todayStart = startOfLocalDay();
    let poolRows: any[] = [];
    let poolReadComplete = !poolAvailable;
    if (poolAvailable) {
      try {
        poolRows = await (this.prisma as any).radarLeadPool.findMany({
          where: { status: { notIn: BLOCKED_RADAR_STATUSES } },
          select: {
            id: true,
            placeId: true,
            name: true,
            city: true,
            normalizedCity: true,
            state: true,
            website: true,
            sourceUrl: true,
            metadataJson: true,
            evidenceJson: true,
            createdAt: true,
          },
        });
        poolReadComplete = true;
      } catch {
        poolReadComplete = false;
      }
    }

    const poolCnpjs = [...new Set(poolRows.map(extractPoolCnpj).filter(Boolean))];
    const activePoolCnpjs = new Set<string>();
    let activeLookupComplete = poolCnpjs.length === 0;
    if (national.available && poolCnpjs.length && (this.prisma as any).cnpjPublicCompany?.findMany) {
      try {
        for (let offset = 0; offset < poolCnpjs.length; offset += 5_000) {
          const rows = await (this.prisma as any).cnpjPublicCompany.findMany({
            where: { cnpj: { in: poolCnpjs.slice(offset, offset + 5_000) }, situacao: 'ativa' },
            select: { cnpj: true },
          });
          for (const row of rows) {
            const cnpj = cnpjDigits(row?.cnpj);
            if (cnpj) activePoolCnpjs.add(cnpj);
          }
        }
        activeLookupComplete = true;
      } catch {
        activeLookupComplete = false;
      }
    }

    const exclusiveIdentities = new Map<string, Date>();
    for (const row of poolRows) {
      const cnpj = extractPoolCnpj(row);
      if (cnpj && activePoolCnpjs.has(cnpj)) continue;
      const key = poolIdentityKey(row, cnpj);
      const createdAt = new Date(row?.createdAt || 0);
      const existing = exclusiveIdentities.get(key);
      if (!existing || createdAt.getTime() < existing.getTime()) exclusiveIdentities.set(key, createdAt);
    }

    const unionExact = national.value != null && poolReadComplete && activeLookupComplete;
    const poolExclusiveTotal = unionExact ? exclusiveIdentities.size : null;
    const universeTotal = unionExact ? national.value! + exclusiveIdentities.size : null;
    const deltaToday = unionExact
      ? [...exclusiveIdentities.values()].filter((createdAt) => createdAt >= todayStart).length
      : null;

    return {
      generatedAt: new Date().toISOString(),
      total: universeTotal,
      universeTotal,
      availableTotal: universeTotal,
      baseTotal: universeTotal,
      deltaToday,
      available: unionExact,
      label: 'Empresas disponíveis no Brasil',
      baseAvailable: national.available,
      nationalActiveTotal: national.value,
      operationalPoolTotal: poolReadComplete ? poolRows.length : null,
      poolExclusiveTotal,
      poolAvailable,
      unionExact,
      deduplication: 'cnpj|placeId|website|name+city+state',
    };
  }
}
