import { Injectable, Optional } from '@nestjs/common';
import type { NormalizedSearchInput } from '../shared/radar-types';
import type { HbxEngineSearchOutput, WebscrapingContactResult } from '../shared/radar-core-shared';
import { buildRadarStageIssue } from '../shared/radar-stage-policy';
import type { RadarLeadSourceResult } from '../01-search/radar-lead-source.types';
import { RadarWebsiteCrawlSourceService } from '../01-search/radar-website-crawl-source.service';

export type RadarWebEnrichmentHost = {
  getRadarWebsiteCrawlSource?: () => RadarWebsiteCrawlSourceService;
  searchHbxEngine?: (
    input: NormalizedSearchInput,
    existing: string[],
    engineUrl: string | undefined,
    options: { queryText?: string; batchLimit?: number; timeoutMs?: number },
  ) => Promise<HbxEngineSearchOutput>;
  engineUrl?: string;
  timeoutMs?: number;
  logger?: { warn?: (message: string) => void };
  fetcher?: typeof fetch;
};

type WebCandidate = {
  url: string;
  title: string;
  snippet: string;
};

function envDisabled(name: string) {
  return ['false', '0', 'off', 'no'].includes(String(process.env[name] || '').trim().toLowerCase());
}

function positiveIntegerEnv(name: string, fallback: number, max: number) {
  const parsed = Number.parseInt(String(process.env[name] || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(max, parsed));
}

function compactText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeLookupValue(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePhoneDigits(raw: unknown) {
  return String(raw || '').replace(/\D/g, '');
}

function htmlDecode(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripHtml(value: string) {
  return htmlDecode(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function decodeResultUrl(raw: string) {
  const decoded = htmlDecode(raw);
  try {
    const parsed = new URL(decoded.startsWith('//') ? `https:${decoded}` : decoded);
    const nested = parsed.searchParams.get('uddg') || parsed.searchParams.get('u');
    if (nested) return decodeURIComponent(nested);
    return parsed.href;
  } catch {
    return decoded;
  }
}

function hostFromUrl(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function isDirectoryOrBlockedHost(host: string) {
  return /(^|\.)?(solutudo|apontador|guiamais|listaamarela|tripadvisor|ifood|marketplace|catalogo|google|maps|reclameaqui|jusbrasil)\./i.test(host)
    || /(^|\.)?(linktr\.ee|bio\.link|wa\.me|whatsapp\.com)$/i.test(host);
}

function isOwnWebsite(url: unknown) {
  const host = hostFromUrl(url);
  if (!host) return false;
  if (/instagram\.com|facebook\.com|fb\.com/i.test(host)) return false;
  return !isDirectoryOrBlockedHost(host);
}

function isInstagram(url: unknown) {
  return /(^|\.)instagram\.com$/i.test(hostFromUrl(url));
}

function isFacebook(url: unknown) {
  return /(^|\.)(facebook|fb)\.com$/i.test(hostFromUrl(url));
}

function normalizeSocialUrl(url: string, network: 'instagram' | 'facebook') {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (network === 'instagram' && host !== 'instagram.com') return null;
    if (network === 'facebook' && host !== 'facebook.com' && host !== 'fb.com') return null;
    const part = parsed.pathname.split('/').filter(Boolean)[0] || '';
    if (!part || ['p', 'reel', 'explore', 'accounts', 'login', 'people', 'pages', 'groups', 'search'].includes(part.toLowerCase())) return null;
    return `https://${network === 'instagram' ? 'instagram.com' : 'facebook.com'}/${part.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

function leadTokens(lead: WebscrapingContactResult) {
  const stop = new Set(['salao', 'beleza', 'cabelo', 'cabelos', 'studio', 'espaco', 'atelie', 'estetica', 'barbearia']);
  return normalizeLookupValue(lead.name)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !stop.has(token));
}

function candidateEvidence(candidate: WebCandidate) {
  return normalizeLookupValue(`${candidate.url} ${candidate.title} ${candidate.snippet}`);
}

function matchesLead(lead: WebscrapingContactResult, input: NormalizedSearchInput, candidate: WebCandidate) {
  const evidence = candidateEvidence(candidate);
  const leadName = normalizeLookupValue(lead.name);
  const hasCity = normalizeLookupValue(input.city) && evidence.includes(normalizeLookupValue(input.city));
  if (leadName && evidence.includes(leadName) && hasCity) return true;
  const tokens = leadTokens(lead);
  const hits = tokens.filter((token) => evidence.includes(token)).length;
  const phone = normalizePhoneDigits(lead.phoneDigits || lead.phone);
  const hasPhone = phone.length >= 10 && evidence.replace(/\D/g, '').includes(phone);
  return hasPhone || (hits >= Math.min(2, tokens.length || 2) && (hasCity || hits >= 3));
}

function hasPoorFields(result: WebscrapingContactResult) {
  const hasPhone = normalizePhoneDigits(result.phoneDigits || result.phone).length >= 10;
  if (!hasPhone) return false;
  return !isOwnWebsite(result.website)
    || !String(result.email || '').trim()
    || !String(result.instagramUrl || result.facebookUrl || '').trim();
}

function buildSearchQuery(lead: WebscrapingContactResult, input: NormalizedSearchInput) {
  return [
    `"${compactText(lead.name).replace(/"/g, '')}"`,
    `"${compactText(input.city).replace(/"/g, '')}"`,
    input.state ? input.state : '',
    'site oficial instagram facebook email contato',
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function buildHbxEnrichmentQueries(lead: WebscrapingContactResult, input: NormalizedSearchInput) {
  const name = compactText(lead.name).replace(/"/g, '');
  const city = compactText(input.city || (lead as any).city).replace(/"/g, '');
  const state = compactText(input.state || (lead as any).state).replace(/"/g, '');
  const phone = normalizePhoneDigits(lead.phoneDigits || lead.phone);
  const domain = hostFromUrl(lead.website);
  return [
    name && city ? `site:instagram.com "${name}" "${city}"` : '',
    name && city ? `site:facebook.com "${name}" "${city}"` : '',
    name && city ? `"${name}" "${city}" instagram facebook email contato` : '',
    name && city && state ? `"${name}" "${city}, ${state}" instagram facebook` : '',
    phone ? `"${phone}" instagram facebook` : '',
    domain ? `site:instagram.com "${domain}"` : '',
    domain ? `site:facebook.com "${domain}"` : '',
  ].filter(Boolean).filter((query, index, list) => list.indexOf(query) === index);
}

function webCandidatesFromHbxResult(result: WebscrapingContactResult): WebCandidate[] {
  const title = compactText((result as any).title || result.name);
  const snippet = compactText((result as any).snippet || (result as any).description || (result as any).address);
  const urls = [
    result.website,
    result.instagramUrl,
    result.facebookUrl,
    (result as any).sourceUrl,
  ].filter(Boolean) as string[];
  return urls.map((url) => ({ url, title, snippet }));
}

function mergeHbxEnrichment(
  lead: WebscrapingContactResult,
  input: NormalizedSearchInput,
  query: string,
  results: WebscrapingContactResult[],
) {
  const candidates = results.flatMap(webCandidatesFromHbxResult);
  const merged = mergeEnrichment(lead, input, candidates);
  const acceptedEmail = results.find((result) => {
    if (!String((result as any).email || '').trim()) return false;
    return webCandidatesFromHbxResult(result).some((candidate) => matchesLead(lead, input, candidate));
  });
  const acceptedSocial = results.find((result) => {
    if (!String(result.instagramUrl || result.facebookUrl || '').trim()) return false;
    return webCandidatesFromHbxResult(result).some((candidate) => matchesLead(lead, input, candidate));
  });
  if (!merged.result && !acceptedEmail && !acceptedSocial) return { result: null, accepted: merged.accepted, rejected: merged.rejected };

  const result = {
    ...(merged.result || lead),
    email: lead.email || (acceptedEmail as any)?.email || (lead as any).email || null,
    emailStatus: (lead as any).emailStatus || (acceptedEmail as any)?.emailStatus || ((acceptedEmail as any)?.email ? 'probable' : (lead as any).emailStatus),
    emailSource: (lead as any).emailSource || (acceptedEmail as any)?.emailSource || ((acceptedEmail as any)?.email ? 'hbx_engine' : (lead as any).emailSource),
    socialStatus: (acceptedSocial as any)?.socialStatus || (merged.result as any)?.socialStatus || (lead as any).socialStatus,
    socialConfidence: (acceptedSocial as any)?.socialConfidence || (merged.result as any)?.socialConfidence || (lead as any).socialConfidence,
    source: 'radar_web_enrichment',
    sourceEngine: 'radar_web_enrichment:hbx_engine',
    evidenceJson: {
      ...((typeof (lead as any).evidenceJson === 'object' && (lead as any).evidenceJson) ? (lead as any).evidenceJson : {}),
      radarWebEnrichment: {
        query,
        engine: 'hbx_engine',
        accepted: merged.accepted.map((item) => ({ url: item.url, title: item.title })),
        rejectedCount: merged.rejected.length,
      },
    },
    enrichmentJson: {
      ...((typeof (lead as any).enrichmentJson === 'object' && (lead as any).enrichmentJson) ? (lead as any).enrichmentJson : {}),
      hbxEngine: results.map((item) => ({
        name: item.name,
        website: item.website || null,
        instagramUrl: item.instagramUrl || null,
        facebookUrl: item.facebookUrl || null,
        email: (item as any).email || null,
        socialStatus: (item as any).socialStatus || null,
      })).slice(0, 5),
    },
  } as WebscrapingContactResult;

  return { result, accepted: merged.accepted, rejected: merged.rejected };
}

function mergeEnrichment(lead: WebscrapingContactResult, input: NormalizedSearchInput, candidates: WebCandidate[]) {
  let website: string | null = null;
  let instagramUrl: string | null = null;
  let facebookUrl: string | null = null;
  const accepted: WebCandidate[] = [];
  const rejected: WebCandidate[] = [];

  for (const candidate of candidates) {
    if (!matchesLead(lead, input, candidate)) {
      rejected.push(candidate);
      continue;
    }
    if (!website && isOwnWebsite(candidate.url)) {
      website = candidate.url.replace(/\/+$/, '');
      accepted.push(candidate);
      continue;
    }
    if (!instagramUrl && isInstagram(candidate.url)) {
      const normalized = normalizeSocialUrl(candidate.url, 'instagram');
      if (normalized) {
        instagramUrl = normalized;
        accepted.push(candidate);
      }
      continue;
    }
    if (!facebookUrl && isFacebook(candidate.url)) {
      const normalized = normalizeSocialUrl(candidate.url, 'facebook');
      if (normalized) {
        facebookUrl = normalized;
        accepted.push(candidate);
      }
    }
  }

  if (!website && !instagramUrl && !facebookUrl) return { result: null, accepted, rejected };
  return {
    result: {
      ...lead,
      website: lead.website || website || '',
      instagramUrl: lead.instagramUrl || instagramUrl || null,
      facebookUrl: lead.facebookUrl || facebookUrl || null,
      socialStatus: instagramUrl || facebookUrl ? 'candidate_review' : (lead as any).socialStatus,
      source: 'radar_web_enrichment',
      sourceEngine: 'radar_web_enrichment',
      evidenceJson: {
        ...((typeof (lead as any).evidenceJson === 'object' && (lead as any).evidenceJson) ? (lead as any).evidenceJson : {}),
        radarWebEnrichment: {
          query: buildSearchQuery(lead, input),
          accepted: accepted.map((item) => ({ url: item.url, title: item.title })),
          rejectedCount: rejected.length,
        },
      },
    } as WebscrapingContactResult,
    accepted,
    rejected,
  };
}

@Injectable()
export class RadarWebEnrichmentService {
  constructor(@Optional() private readonly websiteCrawl?: RadarWebsiteCrawlSourceService) {}

  async run(input: {
    normalized: NormalizedSearchInput;
    currentResults: WebscrapingContactResult[];
    host?: RadarWebEnrichmentHost;
  }): Promise<RadarLeadSourceResult> {
    if (envDisabled('HBX_RADAR_WEB_ENRICHMENT_ENABLED')) return this.skipped('flag_radar_web_enrichment_desativada');
    if (input.normalized.targetType !== 'pj') return this.skipped('radar_web_enrichment_apenas_pj');

    const maxCards = positiveIntegerEnv('HBX_RADAR_WEB_ENRICHMENT_MAX_CARDS', 20, 50);
    const poorCards = (input.currentResults || []).filter(hasPoorFields).slice(0, maxCards);
    if (!poorCards.length) return this.skipped('sem_card_pobre_para_enriquecer');

    const fetcher = input.host?.fetcher || globalThis.fetch;
    if (!fetcher && !input.host?.searchHbxEngine) return this.skipped('fonte_indisponivel_para_radar_web_enrichment');

    const timeoutMs = positiveIntegerEnv('HBX_RADAR_WEB_ENRICHMENT_TIMEOUT_MS', 4500, 15000);
    const results: WebscrapingContactResult[] = [];
    let foundCount = 0;
    let rejectedCount = 0;
    let retryable = false;

    for (const lead of poorCards) {
      try {
        const hbx = await this.searchHbxForLead(input.host || {}, lead, input.normalized, timeoutMs);
        if (hbx.result) {
          foundCount += hbx.foundCount;
          rejectedCount += hbx.rejectedCount;
          results.push(hbx.result);
          continue;
        }
        if (!fetcher) continue;
        const candidates = await this.searchWeb(fetcher, buildSearchQuery(lead, input.normalized), timeoutMs);
        foundCount += candidates.length;
        const merged = mergeEnrichment(lead, input.normalized, candidates);
        rejectedCount += merged.rejected.length;
        if (merged.result) results.push(merged.result);
      } catch (error) {
        retryable = true;
        rejectedCount += 1;
        input.host?.logger?.warn?.(`[radar-web-enrichment] falhou sem bloquear delivery: ${String((error as any)?.message || error)}`);
      }
    }

    const crawled = await this.crawlWebsites(input.host || {}, results);
    return this.completed({
      results: crawled.length ? crawled : results,
      foundCount,
      rejectedCount,
      retryable,
    });
  }

  private async searchHbxForLead(
    host: RadarWebEnrichmentHost,
    lead: WebscrapingContactResult,
    normalized: NormalizedSearchInput,
    timeoutMs: number,
  ): Promise<{ result: WebscrapingContactResult | null; foundCount: number; rejectedCount: number }> {
    if (!host.searchHbxEngine) return { result: null, foundCount: 0, rejectedCount: 0 };
    const existing = [normalizePhoneDigits(lead.phoneDigits || lead.phone)].filter(Boolean);
    for (const query of buildHbxEnrichmentQueries(lead, normalized).slice(0, 4)) {
      const output = await host.searchHbxEngine({
        ...normalized,
        targetType: 'pj',
        quantity: 5,
        preferredChannels: ['instagram', 'facebook', 'email', 'website'],
        channelMatchMode: 'prefer',
      }, existing, host.engineUrl, {
        queryText: query,
        batchLimit: 5,
        timeoutMs: host.timeoutMs || timeoutMs,
      });
      const hbxResults = (output.results || []) as WebscrapingContactResult[];
      const merged = mergeHbxEnrichment(lead, normalized, query, hbxResults);
      if (merged.result) {
        return {
          result: merged.result,
          foundCount: hbxResults.length,
          rejectedCount: merged.rejected.length,
        };
      }
    }
    return { result: null, foundCount: 0, rejectedCount: 0 };
  }

  private async searchWeb(fetcher: typeof fetch, query: string, timeoutMs: number): Promise<WebCandidate[]> {
    const bing = await this.searchBing(fetcher, query, timeoutMs).catch(() => [] as WebCandidate[]);
    if (bing.length) return bing;
    return this.searchDuckDuckGo(fetcher, query, timeoutMs);
  }

  private async searchBing(fetcher: typeof fetch, query: string, timeoutMs: number): Promise<WebCandidate[]> {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=pt-BR`;
    const response = await fetcher(url, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'HBX Radar Web Enrichment',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`radar_web_bing_http_${response.status}`);
    const html = await response.text();
    return this.parseBingResults(html).slice(0, 10);
  }

  private async searchDuckDuckGo(fetcher: typeof fetch, query: string, timeoutMs: number): Promise<WebCandidate[]> {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetcher(url, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'HBX Radar Web Enrichment',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`radar_web_search_http_${response.status}`);
    const html = await response.text();
    return this.parseDuckDuckGoResults(html).slice(0, 10);
  }

  private parseBingResults(html: string): WebCandidate[] {
    const candidates: WebCandidate[] = [];
    const resultRegex = /<li[^>]+class="[^"]*\bb_algo\b[^"]*"[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=<li[^>]+class="[^"]*\bb_algo\b|<\/ol>|$)/gi;
    let match: RegExpExecArray | null;
    while ((match = resultRegex.exec(html))) {
      const url = decodeResultUrl(match[1]);
      const title = stripHtml(match[2]);
      const snippetMatch = match[3].match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      if (!url || !title) continue;
      candidates.push({
        url,
        title,
        snippet: snippetMatch ? stripHtml(snippetMatch[1]) : '',
      });
    }
    return candidates;
  }

  private parseDuckDuckGoResults(html: string): WebCandidate[] {
    const candidates: WebCandidate[] = [];
    const resultRegex = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;
    while ((match = resultRegex.exec(html))) {
      const url = decodeResultUrl(match[1]);
      const title = stripHtml(match[2]);
      if (!url || !title) continue;
      const after = html.slice(match.index, Math.min(html.length, match.index + 1200));
      const snippetMatch = after.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i);
      candidates.push({
        url,
        title,
        snippet: snippetMatch ? stripHtml(snippetMatch[1]) : '',
      });
    }
    return candidates;
  }

  private async crawlWebsites(host: RadarWebEnrichmentHost, results: WebscrapingContactResult[]) {
    const withWebsite = results.filter((result) => isOwnWebsite(result.website));
    if (!withWebsite.length) return results;
    const crawler = host.getRadarWebsiteCrawlSource?.() || this.websiteCrawl || new RadarWebsiteCrawlSourceService();
    const crawl = await crawler.run({
      currentResults: withWebsite,
      remainingQuantity: withWebsite.length,
    }).catch(() => null);
    if (!crawl?.results?.length) return results;
    return crawl.results;
  }

  private completed(input: {
    results: WebscrapingContactResult[];
    foundCount: number;
    rejectedCount: number;
    retryable: boolean;
  }): RadarLeadSourceResult {
    if (input.retryable && !input.results.length) {
      const issue = buildRadarStageIssue({
        stage: 'enrichment',
        operation: 'radar_web_enrichment',
        source: 'radar_web_enrichment',
        status: 'partial_error',
        code: 'radar_web_enrichment_failed',
        message: 'radar_web_enrichment falhou sem bloquear delivery',
        retryable: true,
        blocksDelivery: false,
      });
      return {
        source: 'radar_web_enrichment',
        stage: 'enrichment',
        operation: 'radar_web_enrichment',
        status: 'partial_error',
        retryable: true,
        blocksDelivery: false,
        foundCount: input.foundCount,
        acceptedCount: 0,
        rejectedCount: input.rejectedCount,
        reason: issue.message,
        results: [],
        issue,
      };
    }

    return {
      source: 'radar_web_enrichment',
      stage: 'enrichment',
      operation: 'radar_web_enrichment',
      status: input.retryable ? 'partial_error' : 'completed',
      retryable: input.retryable,
      blocksDelivery: false,
      foundCount: input.foundCount,
      acceptedCount: input.results.length,
      rejectedCount: input.rejectedCount,
      reason: input.results.length ? 'radar_web_enrichment_executado' : 'radar_web_enrichment_sem_dados_novos',
      results: input.results,
      issue: input.retryable ? buildRadarStageIssue({
        stage: 'enrichment',
        operation: 'radar_web_enrichment',
        source: 'radar_web_enrichment',
        status: 'partial_error',
        code: 'radar_web_enrichment_partial',
        message: 'radar_web_enrichment teve falhas parciais sem bloquear delivery',
        retryable: true,
        blocksDelivery: false,
      }) : null,
    };
  }

  private skipped(reason: string): RadarLeadSourceResult {
    return {
      source: 'radar_web_enrichment',
      stage: 'enrichment',
      operation: 'radar_web_enrichment',
      status: 'skipped',
      retryable: false,
      blocksDelivery: false,
      foundCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      reason,
      results: [],
    };
  }
}
