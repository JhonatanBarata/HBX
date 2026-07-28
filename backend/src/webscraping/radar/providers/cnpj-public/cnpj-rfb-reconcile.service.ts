import { Injectable } from '@nestjs/common';
import { normalizeSegmentText, segmentTokenGroups } from '../../shared/radar-segment-match.util';

/**
 * F3 REFUNDAÇÃO (28/07) — RECONCILIAÇÃO WEB→RFB ANTES DA PRATELEIRA.
 *
 * Problema real: candidato da lane web sem CNPJ ganhava o carimbo do texto DIGITADO na busca
 * ("EDR Imobiliária" e "Galmare Planejados" saíram como "distribuidora de água"). A resposta
 * estava do lado o tempo todo: a RFB 28M local sabe o CNAE real de quase toda empresa do país.
 *
 * Regras de segurança (memória do pool-storm 23/07 — pool preso por count() na 28M):
 * - NUNCA count(*). Só findMany com take baixo.
 * - Consulta SEMPRE ancorada em índice: phoneDigits (índice próprio) ou normalizedCity+state.
 * - Timeout curto por consulta; qualquer falha/estouro degrada gracioso ('unavailable') e o
 *   card vira "não confirmado" — a entrega nunca trava por causa desta camada.
 * - Match só quando INEQUÍVOCO (todas as linhas candidatas apontam pro MESMO CNPJ básico).
 *   Ambiguidade = 'unmatched', nunca chute.
 */

export type RadarRfbReconcileStatus = 'matched' | 'unmatched' | 'unavailable' | 'skipped';

export type RadarRfbReconcileRecord = {
  cnpj: string;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  cnae: string | null;
  cnaeDescription: string | null;
};

export type RadarRfbReconcileOutcome = {
  status: RadarRfbReconcileStatus;
  matchedBy: 'phone' | 'name_city' | null;
  record: RadarRfbReconcileRecord | null;
};

type RfbRow = {
  cnpj: string | null;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  cnae: string | null;
  cnaeDescription: string | null;
  normalizedCity: string | null;
  state: string | null;
  searchText: string | null;
  situacao: string | null;
  phoneShareCount: number | null;
};

type RfbDelegate = {
  findMany: (args: Record<string, unknown>) => Promise<RfbRow[]>;
};

type PrismaLike = { cnpjPublicCompany?: RfbDelegate };

type LoggerLike = { warn?: (message: string) => void } | null | undefined;

const RFB_ROW_SELECT = {
  cnpj: true,
  razaoSocial: true,
  nomeFantasia: true,
  cnae: true,
  cnaeDescription: true,
  normalizedCity: true,
  state: true,
  searchText: true,
  situacao: true,
  phoneShareCount: true,
} as const;

// Telefone compartilhado por muitos CNPJs = telefone de contador/escritório — nunca é prova
// de identidade de UMA empresa.
const MAX_SHARED_PHONE_COUNT = 4;

const DEFAULT_QUERY_TIMEOUT_MS = 2_500;
const DDD_SAMPLE_TIMEOUT_MS = 2_000;
const DDD_SAMPLE_TAKE = 80;
const DDD_CACHE_TTL_MS = 10 * 60_000;
const DDD_CACHE_EMPTY_TTL_MS = 5 * 60_000;
const DDD_CACHE_MAX_ENTRIES = 500;

function normalizePhoneDigitsBr(raw: unknown): string {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length > 11) digits = digits.slice(2);
  return digits;
}

function cnpjBasico(cnpj: unknown): string {
  return String(cnpj || '').replace(/\D/g, '').slice(0, 8);
}

function rowIsActive(row: RfbRow): boolean {
  const situacao = String(row.situacao || 'ativa').toLowerCase();
  return situacao === 'ativa' || situacao === '';
}

function toRecord(row: RfbRow): RadarRfbReconcileRecord {
  return {
    cnpj: String(row.cnpj || '').replace(/\D/g, ''),
    razaoSocial: row.razaoSocial || null,
    nomeFantasia: row.nomeFantasia || null,
    cnae: row.cnae || null,
    cnaeDescription: row.cnaeDescription || null,
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class CnpjRfbReconcileService {
  private cityDddCache = new Map<string, { ddds: string[] | null; expiresAt: number }>();

  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`consulta RFB estourou ${ms}ms`)), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Tenta ancorar o candidato da lane web num CNPJ da base local. Telefone primeiro (índice
   * próprio, prova mais forte), nome+cidade como reserva. Só devolve 'matched' quando todas
   * as linhas plausíveis apontam pro MESMO CNPJ básico.
   */
  async reconcileWebCandidate(input: {
    prisma: PrismaLike;
    candidate: Record<string, unknown>;
    city?: string | null;
    state?: string | null;
    timeoutMs?: number;
    logger?: LoggerLike;
  }): Promise<RadarRfbReconcileOutcome> {
    const candidate = input.candidate || {};
    const delegate = input.prisma?.cnpjPublicCompany;
    const timeoutMs = Math.max(500, Number(input.timeoutMs) || DEFAULT_QUERY_TIMEOUT_MS);

    // Já tem CNPJ (rodapé do site, motor, etc.) → o fato já existe; L4 resolve o CNAE.
    const existingCnpj = String((candidate as { cnpj?: unknown }).cnpj || '').replace(/\D/g, '');
    if (existingCnpj.length >= 14) return { status: 'skipped', matchedBy: null, record: null };

    if (!delegate?.findMany) return { status: 'unavailable', matchedBy: null, record: null };

    const normCity = normalizeSegmentText(input.city);
    const state = String(input.state || '').trim().toUpperCase();

    try {
      // ── Lane 1: telefone (índice phoneDigits; RFB grava DDD+número sem o 55) ──
      const digits = normalizePhoneDigitsBr(
        (candidate as { phoneDigits?: unknown; phone?: unknown }).phoneDigits
        || (candidate as { phone?: unknown }).phone,
      );
      if (digits.length === 10 || digits.length === 11) {
        const rows = await this.withTimeout(delegate.findMany({
          where: { phoneDigits: digits },
          select: RFB_ROW_SELECT,
          take: 6,
        }), timeoutMs);
        const plausible = (rows || []).filter((row) => (
          rowIsActive(row)
          && (Number(row.phoneShareCount) || 0) <= MAX_SHARED_PHONE_COUNT
        ));
        const basicos = new Set(plausible.map((row) => cnpjBasico(row.cnpj)).filter(Boolean));
        if (basicos.size === 1) {
          const preferred = plausible.find((row) => normCity && normalizeSegmentText(row.normalizedCity) === normCity)
            || plausible[0];
          return { status: 'matched', matchedBy: 'phone', record: toRecord(preferred) };
        }
      }

      // ── Lane 2: nome+cidade (índice normalizedCity+state) ──
      if (normCity) {
        const nameText = normalizeSegmentText((candidate as { name?: unknown }).name);
        // A cidade sai do nome antes do match (lei de radar-segment-match): "AGUAS DE ..." no
        // nome de toda empresa local não é identidade.
        const cityPattern = new RegExp(`\\b${escapeRegex(normCity)}\\b`, 'g');
        const nameWithoutCity = nameText.replace(cityPattern, ' ').replace(/\s+/g, ' ').trim();
        const whereGroups = segmentTokenGroups(nameWithoutCity).slice(0, 6);
        if (whereGroups.length) {
          const rows = await this.withTimeout(delegate.findMany({
            where: {
              normalizedCity: normCity,
              ...(state ? { state } : {}),
              AND: whereGroups.map((group) => ({
                OR: group.map((token) => ({ searchText: { contains: token } })),
              })),
            },
            select: RFB_ROW_SELECT,
            take: 25,
          }), timeoutMs);
          // Refino em memória com palavra INTEIRA, incluindo os tokens curtos (2-3 chars,
          // ex. "EDR") que o WHERE por substring não consegue exigir com fronteira.
          const allTokens = nameWithoutCity.split(/\s+/).filter((token) => token.length >= 2);
          const tokenPatterns = allTokens.map((token) => {
            const base = token.endsWith('s') ? token.slice(0, -1) : token;
            return new RegExp(`\\b(?:${escapeRegex(token)}|${escapeRegex(base)}|${escapeRegex(base)}s)\\b`);
          });
          const strong = (rows || []).filter((row) => {
            if (!rowIsActive(row)) return false;
            const haystack = normalizeSegmentText(row.searchText
              || [row.nomeFantasia, row.razaoSocial].filter(Boolean).join(' '));
            return tokenPatterns.every((pattern) => pattern.test(haystack));
          });
          const basicos = new Set(strong.map((row) => cnpjBasico(row.cnpj)).filter(Boolean));
          if (basicos.size === 1) {
            return { status: 'matched', matchedBy: 'name_city', record: toRecord(strong[0]) };
          }
        }
      }

      return { status: 'unmatched', matchedBy: null, record: null };
    } catch (error) {
      input.logger?.warn?.(`[rfb-reconcile] degradando gracioso (card vira nao-confirmado): ${String((error as Error)?.message || error)}`);
      return { status: 'unavailable', matchedBy: null, record: null };
    }
  }

  /**
   * Aplica o resultado no candidato (muta in-place, mesmo contrato dos gates):
   * - matched → herda CNPJ/razão/CNAE e a categoria VISÍVEL vira a descrição real do CNAE;
   * - unmatched/unavailable → categoria observada pelo motor (Maps etc.) fica; sem nada
   *   observado, o card nasce "não confirmado" com categoria VAZIA — NUNCA o texto da busca.
   */
  applyOutcomeToCandidate(candidate: Record<string, unknown>, outcome: RadarRfbReconcileOutcome): void {
    const target = candidate as Record<string, unknown> & {
      cnpj?: unknown;
      razaoSocial?: unknown;
      cnae?: unknown;
      cnaeDescription?: unknown;
      businessCategory?: unknown;
      category?: unknown;
    };
    if (outcome.status === 'matched' && outcome.record) {
      if (!String(target.cnpj || '').trim() && outcome.record.cnpj) target.cnpj = outcome.record.cnpj;
      if (!String(target.razaoSocial || '').trim() && outcome.record.razaoSocial) target.razaoSocial = outcome.record.razaoSocial;
      if (!String(target.cnae || '').trim() && outcome.record.cnae) target.cnae = outcome.record.cnae;
      if (!String(target.cnaeDescription || '').trim() && outcome.record.cnaeDescription) {
        target.cnaeDescription = outcome.record.cnaeDescription;
      }
    }
    const cnaeDescription = String(target.cnaeDescription || '').trim();
    const observed = String(target.businessCategory || target.category || '').trim();
    if (cnaeDescription) {
      target.businessCategory = cnaeDescription;
      target.businessCategoryStatus = 'cnae';
    } else if (observed) {
      target.businessCategory = observed;
      target.businessCategoryStatus = 'observed';
    } else {
      target.businessCategory = null;
      target.businessCategoryStatus = 'unconfirmed';
    }
    target.rfbReconcile = { status: outcome.status, matchedBy: outcome.matchedBy };
  }

  /**
   * DDDs reais da cidade por AMOSTRA da RFB local (nunca count(*)): até 80 telefones da
   * cidade, DDDs que cobrem ≥15% da amostra. Cache em memória (10min) porque um run processa
   * dezenas de candidatos da MESMA cidade. null = não verificável (amostra vazia/erro).
   */
  async getCityDddHints(input: {
    prisma: PrismaLike;
    city?: string | null;
    state?: string | null;
    logger?: LoggerLike;
  }): Promise<string[] | null> {
    const normCity = normalizeSegmentText(input.city);
    const state = String(input.state || '').trim().toUpperCase();
    if (!normCity) return null;
    const key = `${normCity}:${state}`;
    const cached = this.cityDddCache.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.ddds;

    const delegate = input.prisma?.cnpjPublicCompany;
    if (!delegate?.findMany) return null;

    let ddds: string[] | null = null;
    try {
      const rows = await this.withTimeout(delegate.findMany({
        where: {
          normalizedCity: normCity,
          ...(state ? { state } : {}),
          AND: [{ phoneDigits: { not: null } }, { phoneDigits: { not: '' } }],
        },
        select: { phoneDigits: true } as never,
        take: DDD_SAMPLE_TAKE,
      }), DDD_SAMPLE_TIMEOUT_MS);
      const counts = new Map<string, number>();
      let sample = 0;
      for (const row of rows || []) {
        const digits = normalizePhoneDigitsBr((row as { phoneDigits?: unknown }).phoneDigits);
        if (digits.length < 10) continue;
        const ddd = digits.slice(0, 2);
        const dddNumber = Number(ddd);
        if (!Number.isInteger(dddNumber) || dddNumber < 11 || dddNumber > 99) continue;
        sample += 1;
        counts.set(ddd, (counts.get(ddd) || 0) + 1);
      }
      if (sample > 0) {
        const minimum = Math.max(2, Math.ceil(sample * 0.15));
        ddds = Array.from(counts.entries())
          .filter(([, count]) => count >= minimum || sample < 2)
          .sort((a, b) => b[1] - a[1])
          .map(([ddd]) => ddd);
        if (!ddds.length) {
          // Amostra minúscula e dispersa: usa o DDD mais frequente mesmo assim.
          const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
          ddds = top ? [top[0]] : null;
        }
      }
    } catch (error) {
      input.logger?.warn?.(`[rfb-reconcile] amostra de DDD da cidade falhou (segue sem verificar DDD): ${String((error as Error)?.message || error)}`);
      ddds = null;
    }

    if (this.cityDddCache.size >= DDD_CACHE_MAX_ENTRIES) this.cityDddCache.clear();
    this.cityDddCache.set(key, {
      ddds,
      expiresAt: now + (ddds?.length ? DDD_CACHE_TTL_MS : DDD_CACHE_EMPTY_TTL_MS),
    });
    return ddds;
  }
}
