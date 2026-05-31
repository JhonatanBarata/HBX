import { Injectable } from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { NormalizedSearchInput, SearchExecutionContext } from '../shared/radar-types';
import type { WebscrapingContactResult } from '../shared/radar-core-shared';
import { buildRadarStageIssue } from '../shared/radar-stage-policy';
import type { RadarLeadSourceKind, RadarLeadSourceResult } from './radar-lead-source.types';

function normalizePhoneDigits(raw: unknown) {
  return String(raw || '').replace(/\D/g, '');
}

function normalizeLookupValue(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseJsonObject(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, any>;
  if (typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function rowToContact(row: any, source: RadarLeadSourceKind): WebscrapingContactResult {
  const enrichment = parseJsonObject(row?.enrichmentJson);
  const metadata = parseJsonObject(row?.metadataJson);
  const raw = { ...metadata, ...enrichment };
  const phone = String(row?.phone || raw.phone || '').trim();
  const phoneDigits = normalizePhoneDigits(row?.phoneDigits || raw.phoneDigits || phone);
  return {
    ...raw,
    placeId: String(row?.placeId || raw.placeId || `radar:${row?.id || phoneDigits || row?.name || source}`).trim(),
    name: String(row?.name || raw.name || '').trim(),
    phone,
    phoneDigits,
    rating: row?.rating ?? raw.rating ?? null,
    reviews: row?.reviews ?? raw.reviews ?? null,
    address: row?.address || raw.address || null,
    website: row?.website || raw.website || null,
    instagramUrl: row?.instagramUrl || raw.instagramUrl || null,
    facebookUrl: row?.facebookUrl || raw.facebookUrl || null,
    email: row?.email || raw.email || null,
    socialStatus: row?.socialStatus || raw.socialStatus || null,
    whatsappStatus: row?.whatsappStatus || raw.whatsappStatus || raw.whatsappCheckStatus || null,
    city: row?.city || raw.city || null,
    state: row?.state || raw.state || null,
    segment: row?.segment || raw.segment || null,
    source,
    sourceEngine: source,
    evidenceJson: {
      ...(raw.evidenceJson && typeof raw.evidenceJson === 'object' ? raw.evidenceJson : {}),
      reprocessSource: source,
      radarLeadId: row?.id || null,
      selectedFor: source,
    },
  } as WebscrapingContactResult;
}

@Injectable()
export class RadarInternalReprocessSourceService {
  async run(input: {
    prisma: PrismaService | any;
    context?: SearchExecutionContext | null;
    normalized: NormalizedSearchInput;
    source: Extract<RadarLeadSourceKind, 'reprocess_missing_social' | 'reprocess_old_cards'>;
    limit?: number;
  }): Promise<RadarLeadSourceResult> {
    const delegate = (input.prisma as any)?.radarLeadPool;
    if (!delegate?.findMany) {
      return this.skipped(input.source, 'radar_lead_pool_indisponivel');
    }
    try {
      const rows = await delegate.findMany({
        where: this.buildWhere(input.normalized, input.source),
        take: Math.max(1, Math.min(100, Math.trunc(Number(input.limit || input.normalized.quantity || 20)))),
        orderBy: input.source === 'reprocess_old_cards'
          ? { updatedAt: 'asc' }
          : { createdAt: 'desc' },
      });
      const candidates = (Array.isArray(rows) ? rows : [])
        .map((row) => rowToContact(row, input.source))
        .filter((row) => this.isUsefulCandidate(row, input.source));
      return {
        source: input.source,
        status: 'completed',
        retryable: false,
        foundCount: Array.isArray(rows) ? rows.length : 0,
        acceptedCount: candidates.length,
        rejectedCount: Math.max(0, (Array.isArray(rows) ? rows.length : 0) - candidates.length),
        reason: candidates.length ? 'candidatos_internos_para_reprocessamento' : 'sem_candidato_interno_util',
        results: candidates,
      };
    } catch (error) {
      const issue = buildRadarStageIssue({
        stage: 'search',
        code: 'internal_reprocess_failed',
        message: String((error as any)?.message || error || 'Falha no reprocessamento interno.'),
        retryable: true,
        blocksDelivery: false,
      });
      return {
        source: input.source,
        status: 'partial_error',
        retryable: true,
        foundCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        reason: issue.message,
        results: [],
        issue,
      };
    }
  }

  skipped(source: RadarLeadSourceKind, reason: string): RadarLeadSourceResult {
    return {
      source,
      status: 'skipped',
      retryable: false,
      foundCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      reason,
      results: [],
    };
  }

  private buildWhere(input: NormalizedSearchInput, source: RadarLeadSourceKind) {
    const city = String(input.city || '').trim();
    const state = String(input.state || '').trim().toUpperCase();
    const segment = String(input.segment || '').trim();
    const base: Record<string, any> = {
      ...(city ? { city } : {}),
      ...(state ? { state } : {}),
      ...(segment ? { segment: { contains: segment } } : {}),
    };
    if (source === 'reprocess_old_cards') {
      return base;
    }
    return {
      ...base,
      OR: [
        { socialStatus: null },
        { socialStatus: '' },
        { socialStatus: 'missing' },
        { socialStatus: 'error' },
        { socialStatus: 'candidate_review' },
        { whatsappStatus: { not: 'confirmed' } },
        { email: null },
      ],
    };
  }

  private isUsefulCandidate(candidate: WebscrapingContactResult, source: RadarLeadSourceKind) {
    if (!candidate.name) return false;
    if (source === 'reprocess_old_cards') return true;
    const socialStatus = normalizeLookupValue(candidate.socialStatus);
    const whatsappStatus = normalizeLookupValue((candidate as any).whatsappStatus || (candidate as any).whatsappCheckStatus);
    return !candidate.instagramUrl
      || !candidate.facebookUrl
      || ['missing', 'error', 'candidate_review', 'pending', 'searching', 'weak', ''].includes(socialStatus)
      || (candidate.phoneDigits && whatsappStatus !== 'confirmed')
      || (candidate.website && !candidate.email);
  }
}
