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

function poolIdentityKeys(row: any, cnpj: string) {
  const keys: string[] = [];
  if (cnpj) keys.push(`cnpj:${cnpj}`);
  const placeId = safeText(row?.placeId, 240);
  if (placeId) keys.push(`place:${placeId}`);
  const host = websiteIdentity(row?.website);
  if (host) keys.push(`site:${host}`);
  const name = normalize(row?.name);
  const city = normalize(row?.city || row?.normalizedCity);
  const state = normalize(row?.state);
  if (name) keys.push(`name:${name}|${city}|${state}`);
  return keys.length ? [...new Set(keys)] : [`pool:${safeText(row?.id, 240)}`];
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
    if (available) {
      // A carga mensal da RFB já calcula esse agregado ao terminar. Ler a
      // estatística evita um COUNT filtrado recorrente sobre ~28 milhões de
      // linhas; o fallback mantém ambientes antigos funcionais e fail-closed.
      const statsAvailable = await this.prisma.hasTable('CnpjBaseStats').catch(() => false);
      if (statsAvailable && (this.prisma as any).cnpjBaseStats?.findUnique) {
        const stat = await (this.prisma as any).cnpjBaseStats.findUnique({
          where: { group_key: { group: 'situacao', key: 'ativa' } },
          select: { count: true },
        }).catch(() => null);
        const parsed = Number(stat?.count);
        value = Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null;
      }
      if (value == null && (this.prisma as any).cnpjPublicCompany?.count) {
        value = await (this.prisma as any).cnpjPublicCompany
          .count({ where: { situacao: 'ativa' } })
          .then((count: unknown) => Number.isFinite(Number(count)) ? Math.max(0, Math.trunc(Number(count))) : null)
          .catch(() => null);
      }
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

    // Uma linha pode ter CNPJ, placeId, site e nome ao mesmo tempo. Usar apenas
    // a primeira chave superconta quando outra linha compartilha uma chave
    // secundária. O union-find conecta todos os aliases e também propaga a
    // presença na RFB ativa para o componente inteiro.
    const parents = poolRows.map((_, index) => index);
    const find = (index: number): number => {
      let root = index;
      while (parents[root] !== root) root = parents[root];
      while (parents[index] !== index) {
        const next = parents[index];
        parents[index] = root;
        index = next;
      }
      return root;
    };
    const unite = (left: number, right: number) => {
      const leftRoot = find(left);
      const rightRoot = find(right);
      if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
    };
    const aliasOwner = new Map<string, number>();
    const rowCnpjs = poolRows.map(extractPoolCnpj);
    poolRows.forEach((row, index) => {
      for (const alias of poolIdentityKeys(row, rowCnpjs[index])) {
        const owner = aliasOwner.get(alias);
        if (owner == null) aliasOwner.set(alias, index);
        else unite(index, owner);
      }
    });

    const components = new Map<number, { rfbBacked: boolean; createdAt: Date }>();
    poolRows.forEach((row, index) => {
      const root = find(index);
      const createdAt = new Date(row?.createdAt || 0);
      const existing = components.get(root);
      components.set(root, {
        rfbBacked: Boolean(existing?.rfbBacked || (rowCnpjs[index] && activePoolCnpjs.has(rowCnpjs[index]))),
        createdAt: !existing || createdAt.getTime() < existing.createdAt.getTime()
          ? createdAt
          : existing.createdAt,
      });
    });
    const exclusiveIdentities = [...components.values()].filter((component) => !component.rfbBacked);

    const unionExact = national.value != null && poolReadComplete && activeLookupComplete;
    const poolExclusiveTotal = unionExact ? exclusiveIdentities.length : null;
    const universeTotal = unionExact ? national.value! + exclusiveIdentities.length : null;
    const deltaToday = unionExact
      ? exclusiveIdentities.filter((component) => component.createdAt >= todayStart).length
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
