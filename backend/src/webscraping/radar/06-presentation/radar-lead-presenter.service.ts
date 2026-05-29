import { Injectable } from '@nestjs/common';
import type { RadarWebsiteStatus } from '../shared/radar-types';

export type RadarLeadPresenterHost = {
  extractDdd: (value: string | null | undefined) => string;
  resolveRadarLeadStatus: (row: any) => string;
  isRadarProtectedStatus: (value: unknown) => boolean;
};

function normalizePhoneDigits(raw: string | null | undefined) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }
  return digits;
}

function isLikelyWhatsapp(raw: string | null | undefined) {
  const digits = normalizePhoneDigits(raw);
  if (digits.length !== 11) return false;
  const mobilePrefix = Number(digits[2] || '0');
  return Number.isFinite(mobilePrefix) && mobilePrefix >= 6;
}

function toNumberOrNull(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function safeInteger(value: unknown, fallback = 0) {
  const numeric = toNumberOrNull(value);
  if (numeric == null) return fallback;
  return Math.max(0, Math.trunc(numeric));
}

function parseJsonArray(raw: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(String(raw || '[]'));
    return Array.isArray(parsed) ? parsed.map((item) => String(item || '').trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function parseJsonObject(raw: unknown): Record<string, any> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, any>;
  }
  try {
    const parsed = JSON.parse(String(raw || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function getWebsiteHost(value: string | null | undefined) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase();
  }
}

function inferWebsiteStatus(value: string | null | undefined): RadarWebsiteStatus {
  const website = String(value || '').trim();
  if (!website) return 'none';
  const host = getWebsiteHost(website);
  if (!host) return 'unknown';
  const socialHosts = [
    'facebook.com',
    'instagram.com',
    'linkedin.com',
    'tiktok.com',
    'youtube.com',
    'x.com',
    'twitter.com',
    'wa.me',
    'whatsapp.com',
  ];
  if (socialHosts.some((domain) => host === domain || host.endsWith(`.${domain}`))) return 'social_only';
  const weakHosts = [
    'linktr.ee',
    'bio.link',
    'beacons.ai',
    'wixsite.com',
    'weebly.com',
    'blogspot.com',
    'wordpress.com',
    'sites.google.com',
    'business.site',
    'google.com',
    'google.com.br',
  ];
  if (weakHosts.some((domain) => host === domain || host.endsWith(`.${domain}`))) return 'weak';
  return 'present';
}

@Injectable()
export class RadarLeadPresenterService {
  buildRadarFacet(key: string, label: string, count: number, tone = 'neutral') {
    return count > 0 ? { key, label, count, tone } : null;
  }

  buildRadarAvailableFilters(rows: any[], host: RadarLeadPresenterHost) {
    const states = new Map<string, number>();
    const citiesByState = new Map<string, Map<string, number>>();
    const segments = new Map<string, number>();
    const ddds = new Map<string, number>();
    const statuses = new Map<string, number>();
    const scoreRanges = new Map<string, number>();

    for (const row of rows) {
      const state = String(row?.state || '').trim().toUpperCase();
      const city = String(row?.city || '').trim();
      const segment = String(row?.segment || '').trim();
      const phone = row?.phoneDigits || row?.phone;
      const ddd = String(row?.ddd || host.extractDdd(phone) || '').replace(/\D/g, '').slice(0, 2);
      const status = host.resolveRadarLeadStatus(row);
      const score = safeInteger(row?.opportunityScore);
      const scoreRange = score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low';

      if (state) states.set(state, (states.get(state) || 0) + 1);
      if (state && city) {
        const stateCities = citiesByState.get(state) || new Map<string, number>();
        stateCities.set(city, (stateCities.get(city) || 0) + 1);
        citiesByState.set(state, stateCities);
      }
      if (segment) segments.set(segment, (segments.get(segment) || 0) + 1);
      if (ddd) ddds.set(ddd, (ddds.get(ddd) || 0) + 1);
      if (status) statuses.set(status, (statuses.get(status) || 0) + 1);
      scoreRanges.set(scoreRange, (scoreRanges.get(scoreRange) || 0) + 1);
    }

    const sortEntries = (left: [string, number], right: [string, number]) =>
      right[1] - left[1] || left[0].localeCompare(right[0], 'pt-BR');
    const toOptions = (entries: Iterable<[string, number]>) =>
      Array.from(entries)
        .sort(sortEntries)
        .map(([value, count]) => ({ value, label: value, count }));
    const cityOptionsByState: Record<string, Array<{ value: string; label: string; count: number }>> = {};
    for (const [state, cityCounts] of citiesByState.entries()) {
      cityOptionsByState[state] = toOptions(cityCounts.entries());
    }

    return {
      states: toOptions(states.entries()),
      citiesByState: cityOptionsByState,
      segments: toOptions(segments.entries()),
      ddds: toOptions(ddds.entries()),
      statuses: toOptions(statuses.entries()),
      scoreRanges: toOptions(scoreRanges.entries()),
    };
  }

  buildRadarFacets(rows: any[], host: RadarLeadPresenterHost) {
    const statusCounts = new Map<string, number>();
    const cityCounts = new Map<string, number>();
    const stateCounts = new Map<string, number>();
    const segmentCounts = new Map<string, number>();
    const sourceCounts = new Map<string, number>();
    const counters = {
      likelyWhatsapp: 0,
      withoutWhatsapp: 0,
      dddLocal: 0,
      dddMismatch: 0,
      scoreHigh: 0,
      scoreMedium: 0,
      scoreLow: 0,
      noWebsite: 0,
      weakWebsite: 0,
      withWebsite: 0,
    };

    for (const row of rows) {
      const status = host.resolveRadarLeadStatus(row);
      statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
      const city = String(row?.city || '').trim();
      const state = String(row?.state || '').trim().toUpperCase();
      const segment = String(row?.segment || '').trim();
      if (city) cityCounts.set(city, (cityCounts.get(city) || 0) + 1);
      if (state) stateCounts.set(state, (stateCounts.get(state) || 0) + 1);
      if (segment) segmentCounts.set(segment, (segmentCounts.get(segment) || 0) + 1);
      for (const source of [row?.sourceEngine, row?.source, ...parseJsonArray(row?.sourceEngines)].filter(Boolean)) {
        const normalizedSource = String(source || '').trim();
        if (normalizedSource) sourceCounts.set(normalizedSource, (sourceCounts.get(normalizedSource) || 0) + 1);
      }

      const phone = row?.phoneDigits || row?.phone;
      if (isLikelyWhatsapp(phone)) counters.likelyWhatsapp += 1;
      else counters.withoutWhatsapp += 1;
      const ddd = String(row?.ddd || host.extractDdd(phone));
      const expectedDdds = parseJsonArray(row?.expectedDddsJson);
      if (expectedDdds.length && expectedDdds.includes(ddd)) counters.dddLocal += 1;
      if (host.resolveRadarLeadStatus(row) === 'rejected' && String(row?.rejectionReason || '') === 'ddd_mismatch') counters.dddMismatch += 1;
      const score = safeInteger(row?.opportunityScore);
      if (score >= 70) counters.scoreHigh += 1;
      else if (score >= 45) counters.scoreMedium += 1;
      else counters.scoreLow += 1;
      const websiteStatus = String(row?.websiteStatus || inferWebsiteStatus(row?.website));
      if (websiteStatus === 'none') counters.noWebsite += 1;
      else counters.withWebsite += 1;
      if (websiteStatus === 'weak' || websiteStatus === 'social_only') counters.weakWebsite += 1;
    }

    const fixed = [
      this.buildRadarFacet('all', 'Todos', rows.length, 'neutral'),
      this.buildRadarFacet('new', 'Novos', (statusCounts.get('new') || 0) + (statusCounts.get('clean') || 0), 'info'),
      this.buildRadarFacet('clean', 'Limpos', (statusCounts.get('clean') || 0) + (statusCounts.get('new') || 0), 'info'),
      this.buildRadarFacet('delivered', 'Entregues', statusCounts.get('delivered') || 0, 'info'),
      this.buildRadarFacet('approved', 'Aprovados', statusCounts.get('approved') || 0, 'success'),
      this.buildRadarFacet('sent_to_vendas', 'JÃ¡ enviados para Vendas', statusCounts.get('sent_to_vendas') || 0, 'success'),
      this.buildRadarFacet('in_attendance', 'Em atendimento', statusCounts.get('in_attendance') || 0, 'info'),
      this.buildRadarFacet('interested', 'Interessados', (statusCounts.get('interested') || 0) + (statusCounts.get('positive') || 0), 'success'),
      this.buildRadarFacet('converted', 'Convertidos', statusCounts.get('converted') || 0, 'success'),
      this.buildRadarFacet('negative', 'Negativos', (statusCounts.get('negative') || 0) + (statusCounts.get('denied') || 0), 'warning'),
      this.buildRadarFacet('blocked', 'Bloqueados', statusCounts.get('blocked') || 0, 'danger'),
      this.buildRadarFacet('opt_out', 'Opt-out', statusCounts.get('opt_out') || 0, 'danger'),
      this.buildRadarFacet('discarded', 'Descartados', (statusCounts.get('discarded') || 0) + (statusCounts.get('hidden') || 0), 'neutral'),
      this.buildRadarFacet('complaint', 'ReclamaÃ§Ã£o', statusCounts.get('complaint') || 0, 'danger'),
      this.buildRadarFacet('no_answer', 'NÃ£o atenderam', statusCounts.get('no_answer') || 0, 'attention'),
      this.buildRadarFacet('no_whatsapp', 'Contato invÃ¡lido', (statusCounts.get('no_whatsapp') || 0) + (statusCounts.get('invalid_whatsapp') || 0), 'danger'),
      this.buildRadarFacet('without_whatsapp', 'Sem WhatsApp', counters.withoutWhatsapp, 'neutral'),
      this.buildRadarFacet('likely_whatsapp', 'Com WhatsApp provÃ¡vel', counters.likelyWhatsapp, 'success'),
      this.buildRadarFacet('ddd_local', 'DDD local', counters.dddLocal, 'success'),
      this.buildRadarFacet('ddd_mismatch', 'DDD divergente', counters.dddMismatch, 'alert'),
      this.buildRadarFacet('score_high', 'Score alto', counters.scoreHigh, 'success'),
      this.buildRadarFacet('score_medium', 'Score mÃ©dio', counters.scoreMedium, 'attention'),
      this.buildRadarFacet('score_low', 'Score baixo', counters.scoreLow, 'neutral'),
      this.buildRadarFacet('no_website', 'Sem site', counters.noWebsite, 'info'),
      this.buildRadarFacet('weak_website', 'Site fraco', counters.weakWebsite, 'warning'),
      this.buildRadarFacet('with_website', 'Com site', counters.withWebsite, 'success'),
    ].filter(Boolean);

    const dynamic = [
      ...Array.from(cityCounts.entries()).sort((a, b) => b[1] - a[1]).map(([label, count]) => this.buildRadarFacet(`city:${label}`, label, count, 'city')),
      ...Array.from(stateCounts.entries()).sort((a, b) => b[1] - a[1]).map(([label, count]) => this.buildRadarFacet(`state:${label}`, label, count, 'state')),
      ...Array.from(segmentCounts.entries()).sort((a, b) => b[1] - a[1]).map(([label, count]) => this.buildRadarFacet(`segment:${label}`, label, count, 'segment')),
      ...Array.from(sourceCounts.entries()).sort((a, b) => b[1] - a[1]).map(([label, count]) => this.buildRadarFacet(`source:${label}`, label, count, 'source')),
    ].filter(Boolean);

    return [...fixed, ...dynamic];
  }

  buildRadarEnrichmentSummary(rows: any[], host: RadarLeadPresenterHost) {
    const summary = {
      cardsAnalyzed: rows.length,
      whatsappVerified: 0,
      emailConfirmedOrProbable: 0,
      noWebsite: 0,
      highPriority: 0,
      discardedOrBlocked: 0,
      readyToCall: 0,
    };
    for (const row of rows) {
      const status = host.resolveRadarLeadStatus(row);
      const enrichment = parseJsonObject(row?.enrichmentJson);
      const whatsappEvent = Array.isArray(row?.events)
        ? row.events.find((event: any) => String(event?.eventType || '').trim().toLowerCase() === 'whatsapp_checked')
        : null;
      const whatsappStatus = String((row as any)?.whatsappStatus || parseJsonObject(whatsappEvent?.note)?.whatsappStatus || enrichment?.whatsappStatus || '').toLowerCase();
      const emailStatus = String(row?.emailStatus || enrichment?.signals?.emailStatus || '').toLowerCase();
      const websiteStatus = String(row?.websiteStatus || inferWebsiteStatus(row?.website)).toLowerCase();
      const recommendedChannel = host.isRadarProtectedStatus(status)
        ? 'discard'
        : String(row?.recommendedChannel || enrichment?.signals?.recommendedChannel || '').toLowerCase();
      if (whatsappStatus === 'confirmed') summary.whatsappVerified += 1;
      if (emailStatus === 'confirmed' || emailStatus === 'probable') summary.emailConfirmedOrProbable += 1;
      if (websiteStatus === 'none') summary.noWebsite += 1;
      if (safeInteger(row?.enrichmentScore || row?.opportunityScore) >= 70) summary.highPriority += 1;
      if (recommendedChannel === 'discard' || host.isRadarProtectedStatus(status)) summary.discardedOrBlocked += 1;
      if (['whatsapp', 'email', 'call'].includes(recommendedChannel) && !host.isRadarProtectedStatus(status)) summary.readyToCall += 1;
    }
    return summary;
  }
}
