import { Injectable, Optional } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SourceBudgetService } from '../../source-budget/source-budget.service';
import type { NormalizedSearchInput } from '../shared/radar-types';
import type { HbxEngineSearchOutput, WebscrapingContactResult } from '../shared/radar-core-shared';
import { buildRadarStageIssue } from '../shared/radar-stage-policy';
import type { RadarLeadSourceResult } from '../01-search/radar-lead-source.types';
import { RadarWebsiteCrawlSourceService } from '../01-search/radar-website-crawl-source.service';
import { buildRadarSocialLookupQueries } from '../04-socials/radar-social-query-planner';
import {
  RADAR_SOCIAL_CATEGORY_TOKENS,
  RADAR_SOCIAL_STOP_TOKENS,
  RADAR_SOCIAL_WEAK_TOKENS,
  socialProfileLooksCompatibleWithLead,
} from '../04-socials/radar-social-matching';

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
  // Candidato de probe direto (slug sondado em instagram/facebook) que JÁ provou identidade
  // pelo TÍTULO REAL da página — dispensa o matchesLead de página (o título de perfil não
  // carrega cidade, e o snippet honesto não tem mais os dados do lead injetados).
  probeValidated?: boolean;
};

type WebEnrichmentAttempt = {
  source: 'hbx_engine' | 'fallback_web';
  status: 'accepted' | 'empty' | 'skipped';
  foundCount: number;
  acceptedCount: number;
  rejectedCount: number;
  reason: string;
  fallbackRequired?: boolean;
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

function collectUrlsFromUnknown(value: unknown, output: string[] = [], depth = 0): string[] {
  if (depth > 4 || value == null) return output;
  if (typeof value === 'string') {
    const text = htmlDecode(value);
    const urlRegex = /https?:\/\/[^\s"'<>),]+/gi;
    let match: RegExpExecArray | null;
    while ((match = urlRegex.exec(text))) {
      output.push(match[0].replace(/[.,;:!?]+$/g, ''));
    }
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectUrlsFromUnknown(item, output, depth + 1));
    return output;
  }
  if (typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((item) => collectUrlsFromUnknown(item, output, depth + 1));
  }
  return output;
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

function compactLookupValue(value: unknown) {
  return normalizeLookupValue(value).replace(/[^a-z0-9]+/g, '');
}

function slugLookupValue(value: unknown) {
  return normalizeLookupValue(value).replace(/[^a-z0-9]+/g, '');
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
    if (nested) {
      const value = decodeURIComponent(nested);
      if (/^a1[a-z0-9_-]+={0,2}$/i.test(value)) {
        try {
          return Buffer.from(value.slice(2).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
        } catch {
          return value;
        }
      }
      return value;
    }
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

function leadNameIdentityTokens(lead: WebscrapingContactResult) {
  const tokens = normalizeLookupValue(lead.name)
    .split(/\s+/)
    .filter((token) => token.length >= 3);
  return {
    category: tokens.filter((token) => RADAR_SOCIAL_CATEGORY_TOKENS.has(token)),
    weak: tokens.filter((token) => RADAR_SOCIAL_WEAK_TOKENS.has(token)),
    distinctive: tokens.filter((token) => (
      token.length >= 4
      && !RADAR_SOCIAL_CATEGORY_TOKENS.has(token)
      && !RADAR_SOCIAL_WEAK_TOKENS.has(token)
    )),
  };
}

function socialSlugTokens(lead: WebscrapingContactResult) {
  const tokens = normalizeLookupValue(lead.name)
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !['ltda', 'eireli', 'me'].includes(token));
  const businessPrefixTokens = new Set(['atelie', 'atelier', 'espaco', 'salao', 'salao', 'studio', 'studiio']);
  const serviceTokens = new Set([
    ...Array.from(RADAR_SOCIAL_CATEGORY_TOKENS),
    'beleza',
    'cabelo',
    'cabelos',
    'cabeleireiro',
    'cabeleireira',
    'cabeleireiros',
    'cabeleireiras',
    'make',
    'makeup',
    'manicure',
    'pedicure',
    'unha',
    'unhas',
    'sobrancelha',
    'sobrancelhas',
    'unissex',
  ]);
  const withoutStops = tokens.filter((token) => !RADAR_SOCIAL_STOP_TOKENS.has(token));
  const withoutPrefixes = withoutStops.filter((token) => !businessPrefixTokens.has(token));
  const distinctive = withoutPrefixes.filter((token) => (
    token.length >= 3
    && !serviceTokens.has(token)
    && !RADAR_SOCIAL_WEAK_TOKENS.has(token)
  ));
  const service = withoutPrefixes.filter((token) => serviceTokens.has(token));
  return { tokens, withoutStops, withoutPrefixes, distinctive, service };
}

function buildDirectSocialSlugs(lead: WebscrapingContactResult, input: NormalizedSearchInput) {
  const parts = socialSlugTokens(lead);
  const city = slugLookupValue(input.city || (lead as any).city);
  const state = slugLookupValue(input.state || (lead as any).state);

  // Abreviação de cidade: primeiros 3+ chars, útil em slugs como "salaosp", "clinicabh"
  const cityAbbrev = city.length >= 6 ? city.slice(0, 3) : '';
  // Nome condensado sem vogais (padrão comum de slug BR: "prfluciana", "clfernanda")
  const compactDistinctive = parts.distinctive.join('').replace(/[aeiou]/g, '').slice(0, 8);

  const bases = [
    // Combinações completas
    parts.tokens,
    parts.withoutStops,
    parts.withoutPrefixes,
    [...parts.distinctive, ...parts.service.slice(0, 1)],
    parts.distinctive,
    // Nome colado + serviço (muito comum em IG BR: "anapaula_beleza", "aninhacabelos")
    parts.withoutPrefixes.length >= 2 ? [parts.withoutPrefixes[0]] : [],
    // Somente os 2 primeiros tokens distintos (apelido curto)
    parts.distinctive.slice(0, 2),
    // Todos os tokens sem serviço mas em ordem original
    parts.withoutStops.slice(0, 3),
  ]
    .map((tokens) => tokens.join(''))
    .filter((value) => value.length >= 4);

  const suffixes = [
    '',
    'rc',
    city,
    state,
    cityAbbrev,
    'oficial',
    'beleza',
    'salao',
    'studio',
    'cabelos',
    'cabeleireiro',
    'cabeleireira',
    'makeup',
    'manicure',
    'unhas',
    'sobrancelhas',
    'estetica',
    'esmalteria',
    'clinica',
    'barbearia',
    'tattoo',
    'nutrição',
    'nutri',
    // Sufixos city+state juntos para slugs tipo "salao_sjc_sp"
    city && state ? `${city}${state}` : '',
    city && cityAbbrev ? cityAbbrev : '',
  ].filter(Boolean).filter((suffix, index, list) => list.indexOf(suffix) === index);

  // Também tenta bases com primeiro token + cidade (ex: "espaçoana" → "anasjc")
  const firstDistinctive = parts.distinctive[0] || '';
  const secondDistinctive = parts.distinctive[1] || '';
  const extraBases: string[] = [];
  if (firstDistinctive && city) {
    extraBases.push(`${firstDistinctive}${city}`);
    extraBases.push(`${firstDistinctive}_${city}`);
  }
  if (firstDistinctive && secondDistinctive) {
    // Iniciais + sobrenome (ex: "mariasantos", "mtsantos")
    extraBases.push(`${firstDistinctive[0]}${secondDistinctive}`);
  }
  if (compactDistinctive.length >= 4) {
    extraBases.push(compactDistinctive);
  }

  const candidates = new Set<string>();
  for (const base of bases) {
    candidates.add(base);
    for (const suffix of suffixes) {
      if (!suffix || base.endsWith(suffix)) continue;
      candidates.add(`${base}${suffix}`);
      candidates.add(`${base}_${suffix}`);
    }
  }
  for (const extra of extraBases) {
    if (extra.length >= 5) candidates.add(extra);
  }

  // Respeita o teto de profiles sondados (HBX_RADAR_WEB_ENRICHMENT_DIRECT_SOCIAL_MAX_PROFILES, default 10)
  // — o slice final é feito em probeDirectSocialProfiles; aqui mandamos um pool maior mas razoável
  return Array.from(candidates)
    .filter((slug) => slug.length >= 4 && slug.length <= 40)
    .slice(0, 30);
}

function candidateEvidence(candidate: WebCandidate) {
  return normalizeLookupValue(`${candidate.url} ${candidate.title} ${candidate.snippet}`);
}

function hasCompactSocialIdentity(lead: WebscrapingContactResult, input: NormalizedSearchInput, candidate: WebCandidate) {
  if (!isInstagram(candidate.url) && !isFacebook(candidate.url)) return false;
  const evidenceCompact = compactLookupValue(`${candidate.url} ${candidate.title} ${candidate.snippet}`);
  const cityCompact = compactLookupValue(input.city || (lead as any).city);
  if (cityCompact.length < 5 || !evidenceCompact.includes(cityCompact)) return false;

  const identity = leadNameIdentityTokens(lead);
  const categoryHit = identity.category.some((token) => evidenceCompact.includes(compactLookupValue(token)));
  const weakHit = identity.weak.some((token) => evidenceCompact.includes(compactLookupValue(token)));
  const distinctiveHit = identity.distinctive.some((token) => evidenceCompact.includes(compactLookupValue(token)));
  return distinctiveHit || (categoryHit && weakHit);
}

function matchesLead(lead: WebscrapingContactResult, input: NormalizedSearchInput, candidate: WebCandidate) {
  const evidence = candidateEvidence(candidate);
  const evidenceCompact = compactLookupValue(`${candidate.url} ${candidate.title} ${candidate.snippet}`);
  const leadName = normalizeLookupValue(lead.name);
  const city = normalizeLookupValue(input.city || (lead as any).city);
  const cityCompact = compactLookupValue(input.city || (lead as any).city);
  const hasCity = Boolean(city && (evidence.includes(city) || (cityCompact.length >= 5 && evidenceCompact.includes(cityCompact))));
  if (leadName && evidence.includes(leadName) && hasCity) return true;
  const tokens = leadTokens(lead);
  const hits = tokens.filter((token) => evidence.includes(token)).length;
  const phone = normalizePhoneDigits(lead.phoneDigits || lead.phone);
  const hasPhone = phone.length >= 10 && evidence.replace(/\D/g, '').includes(phone);
  return hasPhone || hasCompactSocialIdentity(lead, input, candidate) || (hits >= Math.min(2, tokens.length || 2) && (hasCity || hits >= 3));
}

function socialTitleLooksCompatible(lead: WebscrapingContactResult, title: string, slug: string) {
  const evidence = normalizeLookupValue(`${title} ${slug}`).replace(/[^a-z0-9]+/g, ' ');
  const identity = leadNameIdentityTokens(lead);
  const distinctiveHits = identity.distinctive.filter((token) => evidence.includes(token)).length;
  const categoryHit = identity.category.some((token) => evidence.includes(token));
  const weakHit = identity.weak.some((token) => evidence.includes(token));
  return distinctiveHits >= Math.min(2, identity.distinctive.length || 2) || (distinctiveHits >= 1 && (categoryHit || weakHit));
}

function hasEnrichableIdentity(result: WebscrapingContactResult) {
  const phone = normalizePhoneDigits(result.phoneDigits || result.phone);
  if (phone.length >= 10) return true;
  if (isOwnWebsite(result.website) || String(result.instagramUrl || result.facebookUrl || '').trim()) return true;
  const name = normalizeLookupValue(result.name);
  if (name.length < 5) return false;
  if (/\b(perto de mim|melhores|lista telefonica|guia comercial|guia telefone|anuncie aqui)\b/i.test(name)) return false;
  return leadNameIdentityTokens(result).distinctive.length > 0;
}

function hasPoorFields(result: WebscrapingContactResult) {
  if (!hasEnrichableIdentity(result)) return false;
  return !isOwnWebsite(result.website)
    || !String(result.email || '').trim()
    || !String(result.instagramUrl || result.facebookUrl || '').trim();
}

function needsWebDiscoveryFallback(result: WebscrapingContactResult) {
  return !isOwnWebsite(result.website)
    || !String(result.instagramUrl || result.facebookUrl || '').trim();
}

function summarizeChannels(result: WebscrapingContactResult) {
  return {
    website: isOwnWebsite(result.website),
    email: Boolean(String((result as any).email || '').trim()),
    social: Boolean(String(result.instagramUrl || result.facebookUrl || '').trim()),
  };
}

function withWebEnrichmentPipeline(result: WebscrapingContactResult, attempts: WebEnrichmentAttempt[]) {
  const evidenceJson = (typeof (result as any).evidenceJson === 'object' && (result as any).evidenceJson)
    ? (result as any).evidenceJson
    : {};
  const existing = (typeof evidenceJson.radarWebEnrichment === 'object' && evidenceJson.radarWebEnrichment)
    ? evidenceJson.radarWebEnrichment
    : {};
  return {
    ...result,
    evidenceJson: {
      ...evidenceJson,
      radarWebEnrichment: {
        ...existing,
        pipeline: attempts,
        finalChannels: summarizeChannels(result),
        blocksDelivery: false,
      },
    },
  } as WebscrapingContactResult;
}

function buildSearchQuery(lead: WebscrapingContactResult, input: NormalizedSearchInput) {
  const name = compactText(lead.name).replace(/"/g, '');
  const city = compactText(input.city).replace(/"/g, '');
  const segment = compactText((lead as any).segment || input.segment).replace(/"/g, '');
  return [
    `"${name}"`,
    `"${city}"`,
    input.state ? input.state : '',
    segment ? `"${segment}"` : '',
    'site oficial instagram facebook email contato agenda whatsapp',
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function buildWebsiteEmailQueries(lead: WebscrapingContactResult, input: NormalizedSearchInput) {
  const name = compactText(lead.name).replace(/"/g, '');
  const city = compactText(input.city || (lead as any).city).replace(/"/g, '');
  const state = compactText(input.state || (lead as any).state).replace(/"/g, '');
  const segment = compactText((lead as any).segment || input.segment).replace(/"/g, '');
  const phone = normalizePhoneDigits(lead.phoneDigits || lead.phone);
  return [
    name && city ? `"${name}" "${city}" site oficial contato email` : '',
    name && city ? `"${name}" "${city}" agenda whatsapp instagram facebook` : '',
    name && city && segment ? `"${name}" "${city}" "${segment}" contato` : '',
    name && city && state ? `"${name}" "${city}, ${state}" site oficial` : '',
    phone ? `"${phone}" "${city}" contato` : '',
  ].filter(Boolean);
}

function buildFallbackWebQueries(lead: WebscrapingContactResult, input: NormalizedSearchInput) {
  const name = compactText(lead.name).replace(/"/g, '');
  const city = compactText(input.city || (lead as any).city).replace(/"/g, '');
  const state = compactText(input.state || (lead as any).state).replace(/"/g, '');
  const segment = compactText((lead as any).segment || input.segment).replace(/"/g, '');
  const phone = normalizePhoneDigits(lead.phoneDigits || lead.phone);
  const domain = hostFromUrl(lead.website);
  return [
    name && city ? `"${name}" "${city}" instagram` : '',
    name && city ? `"${name}" "${city}" facebook` : '',
    name && city && segment ? `"${name}" "${city}" "${segment}" instagram` : '',
    name && city && segment ? `"${name}" "${city}" "${segment}" facebook` : '',
    name && city ? `site:instagram.com "${name}" "${city}"` : '',
    name && city ? `site:facebook.com "${name}" "${city}"` : '',
    name && city && state ? `"${name}" "${city}, ${state}" instagram facebook` : '',
    phone ? `"${phone}" instagram facebook "${city}"` : '',
    domain ? `site:instagram.com "${domain}"` : '',
    domain ? `site:facebook.com "${domain}"` : '',
    buildSearchQuery(lead, input),
  ].filter(Boolean).filter((query, index, list) => list.indexOf(query) === index);
}

function buildHbxEnrichmentQueries(lead: WebscrapingContactResult, input: NormalizedSearchInput) {
  const name = compactText(lead.name).replace(/"/g, '');
  const city = compactText(input.city || (lead as any).city).replace(/"/g, '');
  const state = compactText(input.state || (lead as any).state).replace(/"/g, '');
  const phone = normalizePhoneDigits(lead.phoneDigits || lead.phone);
  const domain = hostFromUrl(lead.website);
  const socialQueries = buildRadarSocialLookupQueries({
    ...lead,
    city,
    state,
    segment: (lead as any).segment || input.segment,
  }).map((entry) => entry.query);
  const directSocialOperators = [
    name && city ? `site:instagram.com "${name}" "${city}"` : '',
    name && city ? `site:facebook.com "${name}" "${city}"` : '',
  ].filter(Boolean);
  const directDiscoveryQueries = [
    name && city ? `"${name}" "${city}" instagram facebook email contato` : '',
    name && city && state ? `"${name}" "${city}, ${state}" instagram facebook` : '',
    phone ? `"${phone}" instagram facebook` : '',
    domain ? `site:instagram.com "${domain}"` : '',
    domain ? `site:facebook.com "${domain}"` : '',
  ].filter(Boolean);
  return [
    ...directSocialOperators,
    ...socialQueries,
    ...directDiscoveryQueries,
    ...buildWebsiteEmailQueries(lead, input),
  ].filter((query, index, list) => list.indexOf(query) === index);
}

function webCandidatesFromHbxResult(result: WebscrapingContactResult): WebCandidate[] {
  const title = compactText((result as any).title || result.name);
  const snippet = compactText((result as any).snippet || (result as any).description || (result as any).rawText || (result as any).socialText || (result as any).address);
  const urls = [
    result.website,
    result.instagramUrl,
    result.facebookUrl,
    (result as any).sourceUrl,
    ...(Array.isArray((result as any).contactLinks) ? (result as any).contactLinks : []),
    ...(Array.isArray((result as any).links) ? (result as any).links : []),
    ...collectUrlsFromUnknown((result as any).socialLinks),
    ...collectUrlsFromUnknown((result as any).evidenceJson),
    ...collectUrlsFromUnknown((result as any).enrichmentJson),
    ...collectUrlsFromUnknown((result as any).rawText),
    ...collectUrlsFromUnknown((result as any).socialText),
  ].filter(Boolean).map((url) => String(url || '').trim()).filter(Boolean);
  return Array.from(new Set(urls)).map((url) => ({ url, title, snippet }));
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

  // Carimbo social (status/confidence) só acompanha URL social que REALMENTE entrou no result
  // final — herdar o "found/82" de um result cuja URL a porta de handle rejeitou deixava o
  // card dizendo "Instagram encontrado" sem link nenhum (ou pior, justificando um link errado).
  const finalHasSocialUrl = Boolean(
    (merged.result as any)?.instagramUrl
    || (merged.result as any)?.facebookUrl
    || lead.instagramUrl
    || lead.facebookUrl,
  );
  const result = {
    ...(merged.result || lead),
    email: lead.email || (acceptedEmail as any)?.email || (lead as any).email || null,
    emailStatus: (lead as any).emailStatus || (acceptedEmail as any)?.emailStatus || ((acceptedEmail as any)?.email ? 'probable' : (lead as any).emailStatus),
    emailSource: (lead as any).emailSource || (acceptedEmail as any)?.emailSource || ((acceptedEmail as any)?.email ? 'hbx_engine' : (lead as any).emailSource),
    socialStatus: finalHasSocialUrl
      ? ((acceptedSocial as any)?.socialStatus || (merged.result as any)?.socialStatus || (lead as any).socialStatus)
      : (lead as any).socialStatus,
    socialConfidence: finalHasSocialUrl
      ? ((acceptedSocial as any)?.socialConfidence || (merged.result as any)?.socialConfidence || (lead as any).socialConfidence)
      : (lead as any).socialConfidence,
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

  // Identidade pro handle social: nome do lead + cidade pesquisada (a cidade é DESCONTADA dos
  // tokens de identidade dentro da porta — handle de portal local não casa só por carregar o
  // nome da cidade).
  const socialIdentity = { name: lead.name, city: input.city || (lead as any).city || null };
  for (const candidate of candidates) {
    // Probe direto já provou identidade pelo TÍTULO REAL do perfil; título de perfil não traz
    // cidade, então o matchesLead de página (que exige cidade/telefone) reprovaria o legítimo.
    if (!candidate.probeValidated && !matchesLead(lead, input, candidate)) {
      rejected.push(candidate);
      continue;
    }
    if (!website && isOwnWebsite(candidate.url)) {
      website = candidate.url.replace(/\/+$/, '');
      accepted.push(candidate);
      continue;
    }
    // Porta de handle (28/07 — conserto do "sociais errando quase tudo"): a página FALAR do
    // lead não faz do perfil social DELA o perfil do lead — portal que citava a empresa
    // emprestava o próprio @. O handle precisa carregar a identidade do lead pra ser aceito.
    if (!instagramUrl && isInstagram(candidate.url)) {
      const normalized = normalizeSocialUrl(candidate.url, 'instagram');
      if (normalized && socialProfileLooksCompatibleWithLead(socialIdentity, normalized)) {
        instagramUrl = normalized;
        accepted.push(candidate);
      } else if (normalized) {
        rejected.push(candidate);
      }
      continue;
    }
    if (!facebookUrl && isFacebook(candidate.url)) {
      const normalized = normalizeSocialUrl(candidate.url, 'facebook');
      if (normalized && socialProfileLooksCompatibleWithLead(socialIdentity, normalized)) {
        facebookUrl = normalized;
        accepted.push(candidate);
      } else if (normalized) {
        rejected.push(candidate);
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

  // ── DISJUNTOR do Brave → generalizado no SourceBudgetService (Sprint 3 MOTOR-RFB-FILA, 02/07).
  // O contador estático + PrismaClient lazy que nasceram aqui viraram o freio ÚNICO por fonte em
  // ../../source-budget/source-budget.service.ts (tabela SourceApiUsage; a migration copiou o
  // histórico de BraveApiUsage). MUDANÇA DE POLÍTICA consciente: fonte PAGA agora é FAIL-CLOSED —
  // erro ao ler o contador = NÃO chama (antes era fail-open).
  // PrismaClient estático LAZY mantido SÓ pro freio do PARAR abaixo: o serviço é instanciado na mão
  // em 4 lugares (`new RadarWebEnrichmentService()`) → injetar Prisma quebraria esses call sites.
  private static _counterDb: PrismaClient | null = null;
  private static counterDb(): PrismaClient {
    if (!RadarWebEnrichmentService._counterDb) {
      RadarWebEnrichmentService._counterDb = new PrismaClient();
    }
    return RadarWebEnrichmentService._counterDb;
  }
  // ── FREIO do PARAR (Sprint 1 MOTOR-RFB-FILA): emergencyStop do turbo_noturno congela o Brave ────
  // O botão "Parar" do MASTER grava emergencyStop=true no WebscrapingOperationalConfig, mas o
  // enriquecimento em voo (search runs, jobs) continuava queimando cota Brave. Este gate corta TODA
  // chamada Brave na fonte enquanto o PARAR estiver ativo. Cache de 8s: o searchBrave roda em rajada
  // (1 chamada/1.1s) e não pode bater no banco a cada query. Mesmo PrismaClient estático do disjuntor
  // mensal (serviço é instanciado na mão em 4 lugares — ver comentário do counterDb acima).
  private static _emergencyStopCache: { value: boolean; checkedAt: number } = { value: false, checkedAt: 0 };
  private static readonly EMERGENCY_STOP_CACHE_MS = 8_000;
  private static async factoryEmergencyStopped(): Promise<boolean> {
    const now = Date.now();
    const cache = RadarWebEnrichmentService._emergencyStopCache;
    if (now - cache.checkedAt < RadarWebEnrichmentService.EMERGENCY_STOP_CACHE_MS) return cache.value;
    let value = false;
    try {
      const db = RadarWebEnrichmentService.counterDb() as any;
      const row = await db.webscrapingOperationalConfig.findUnique({
        where: { key: 'turbo_noturno' },
        select: { metadataJson: true },
      });
      const parsed = JSON.parse(String(row?.metadataJson || '{}'));
      value = parsed?.emergencyStop === true || String(parsed?.emergencyStop || '').toLowerCase() === 'true';
    } catch {
      // Fail-open (mesma regra do braveBudgetExceeded): sem banco, o fluxo inteiro já está quebrado —
      // não derrubar a busca por blip transitório de leitura.
      value = false;
    }
    RadarWebEnrichmentService._emergencyStopCache = { value, checkedAt: now };
    return value;
  }

  async run(input: {
    normalized: NormalizedSearchInput;
    currentResults: WebscrapingContactResult[];
    host?: RadarWebEnrichmentHost;
    maxCards?: number;
  }): Promise<RadarLeadSourceResult> {
    if (envDisabled('HBX_RADAR_WEB_ENRICHMENT_ENABLED')) return this.skipped('flag_radar_web_enrichment_desativada');
    if (input.normalized.targetType !== 'pj') return this.skipped('radar_web_enrichment_apenas_pj');

    const requestedMaxCards = Number.isFinite(Number(input.maxCards)) ? Number(input.maxCards) : 0;
    const maxCards = requestedMaxCards > 0
      ? Math.max(1, Math.min(50, Math.trunc(requestedMaxCards)))
      : positiveIntegerEnv('HBX_RADAR_WEB_ENRICHMENT_MAX_CARDS', 20, 50);
    const poorCards = (input.currentResults || []).filter(hasPoorFields).slice(0, maxCards);
    if (!poorCards.length) return this.skipped('sem_card_pobre_para_enriquecer');

    const fetcher = input.host?.fetcher || globalThis.fetch;
    if (!fetcher && !input.host?.searchHbxEngine) return this.skipped('fonte_indisponivel_para_radar_web_enrichment');

    const timeoutMs = positiveIntegerEnv('HBX_RADAR_WEB_ENRICHMENT_TIMEOUT_MS', 4500, 15000);
    const fallbackMaxQueries = positiveIntegerEnv('HBX_RADAR_WEB_ENRICHMENT_FALLBACK_MAX_QUERIES', 4, 10);
    const results: WebscrapingContactResult[] = [];
    let foundCount = 0;
    let rejectedCount = 0;
    let retryable = false;

    for (const lead of poorCards) {
      try {
        const attempts: WebEnrichmentAttempt[] = [];
        let hbx: { result: WebscrapingContactResult | null; foundCount: number; rejectedCount: number };
        try {
          hbx = await this.searchHbxForLead(input.host || {}, lead, input.normalized, timeoutMs);
        } catch (error) {
          retryable = true;
          hbx = { result: null, foundCount: 0, rejectedCount: 0 };
          attempts.push({
            source: 'hbx_engine',
            status: 'skipped',
            foundCount: 0,
            acceptedCount: 0,
            rejectedCount: 0,
            fallbackRequired: true,
            reason: `hbx_enrichment_timeout_fallback_web: ${String((error as any)?.message || error)}`,
          });
          input.host?.logger?.warn?.(`[radar-web-enrichment] HBX falhou; tentando fallback web: ${String((error as any)?.message || error)}`);
        }
        let bestResult = hbx.result;
        if (!attempts.some((attempt) => attempt.source === 'hbx_engine')) {
          attempts.push({
            source: 'hbx_engine',
            status: hbx.result ? 'accepted' : 'empty',
            foundCount: hbx.foundCount,
            acceptedCount: hbx.result ? 1 : 0,
            rejectedCount: hbx.rejectedCount,
            fallbackRequired: Boolean(hbx.result && needsWebDiscoveryFallback(hbx.result)),
            reason: hbx.result ? 'hbx_enrichment_retornou_dado_aceito' : 'hbx_enrichment_sem_match_aceito',
          });
        }
        if (hbx.result) {
          foundCount += hbx.foundCount;
          rejectedCount += hbx.rejectedCount;
          if (!needsWebDiscoveryFallback(hbx.result)) {
            results.push(withWebEnrichmentPipeline(hbx.result, attempts));
            continue;
          }
        }
        if (!fetcher) {
          attempts.push({
            source: 'fallback_web',
            status: 'skipped',
            foundCount: 0,
            acceptedCount: 0,
            rejectedCount: 0,
            reason: 'fetcher_indisponivel',
          });
          if (bestResult) results.push(withWebEnrichmentPipeline(bestResult, attempts));
          continue;
        }
        const fallbackLead = bestResult || lead;
        let merged = { result: null, accepted: [] as WebCandidate[], rejected: [] as WebCandidate[] };
        let fallbackFoundCount = 0;
        const directSocialCandidates = await this.probeDirectSocialProfiles(fetcher, fallbackLead, input.normalized, timeoutMs);
        if (directSocialCandidates.length) {
          fallbackFoundCount += directSocialCandidates.length;
          merged = mergeEnrichment(fallbackLead, input.normalized, directSocialCandidates);
          rejectedCount += merged.rejected.length;
        }
        for (const query of buildFallbackWebQueries(fallbackLead, input.normalized).slice(0, fallbackMaxQueries)) {
          if (merged.result) break;
          try {
            const candidates = await this.searchWeb(fetcher, query, timeoutMs);
            fallbackFoundCount += candidates.length;
            merged = mergeEnrichment(fallbackLead, input.normalized, candidates);
            rejectedCount += merged.rejected.length;
            if (merged.result) break;
          } catch (error) {
            retryable = true;
            input.host?.logger?.warn?.(`[radar-web-enrichment] fallback falhou sem descartar dado ja encontrado: ${String((error as any)?.message || error)}`);
            if (bestResult) break;
            continue;
          }
        }
        foundCount += fallbackFoundCount;
        attempts.push({
          source: 'fallback_web',
          status: merged.result ? 'accepted' : 'empty',
          foundCount: fallbackFoundCount,
          acceptedCount: merged.result ? 1 : 0,
          rejectedCount: merged.rejected.length,
          reason: merged.result ? 'fallback_web_completou_dados' : 'fallback_web_sem_match_aceito',
        });
        bestResult = merged.result || bestResult;
        if (bestResult) results.push(withWebEnrichmentPipeline(bestResult, attempts));
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
    const maxQueries = positiveIntegerEnv('HBX_RADAR_WEB_ENRICHMENT_HBX_MAX_QUERIES', 16, 40);
    for (const query of buildHbxEnrichmentQueries(lead, normalized).slice(0, maxQueries)) {
      const output = await host.searchHbxEngine({
        ...normalized,
        targetType: 'pj',
        quantity: 5,
        preferredChannels: ['instagram', 'facebook', 'email', 'website'],
        requiredChannels: [],
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

  private async probeDirectSocialProfiles(
    fetcher: typeof fetch,
    lead: WebscrapingContactResult,
    input: NormalizedSearchInput,
    timeoutMs: number,
  ): Promise<WebCandidate[]> {
    const maxProfiles = positiveIntegerEnv('HBX_RADAR_WEB_ENRICHMENT_DIRECT_SOCIAL_MAX_PROFILES', 10, 18);
    const slugs = buildDirectSocialSlugs(lead, input).slice(0, maxProfiles);
    if (!slugs.length) return [];
    const candidates: WebCandidate[] = [];
    for (const slug of slugs) {
      const instagram = await this.probeInstagramProfile(fetcher, lead, input, slug, timeoutMs).catch(() => null);
      if (instagram) {
        candidates.push(instagram);
        break;
      }
    }
    for (const slug of slugs.slice(0, Math.min(slugs.length, 8))) {
      const facebook = await this.probeFacebookProfile(fetcher, lead, input, slug, timeoutMs).catch(() => null);
      if (facebook) {
        candidates.push(facebook);
        break;
      }
    }
    return candidates;
  }

  private async probeInstagramProfile(
    fetcher: typeof fetch,
    lead: WebscrapingContactResult,
    input: NormalizedSearchInput,
    slug: string,
    timeoutMs: number,
  ): Promise<WebCandidate | null> {
    const url = `https://www.instagram.com/${slug}/`;
    const response = await fetcher(url, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36 HBX-Radar',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const html = await response.text();
    if (!/ProfilePage|profilePage_/i.test(html)) return null;
    // Login-wall do Instagram devolve 200 + shell com "ProfilePage" no bundle pra QUALQUER
    // slug — página existir não prova perfil. Slug fabricado do nome virava perfil "confirmado"
    // (@podemosaguasdaprataspmunicpalsp, @energisarc com o sufixo 'rc' da lista). Igual ao
    // probe de Facebook: só aceita quando o TÍTULO REAL da página carrega a identidade do lead.
    const title = stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
    if (!title || /^(instagram|login)\b/i.test(title.trim()) || !socialTitleLooksCompatible(lead, title, slug)) return null;
    return {
      url,
      title,
      // Snippet SÓ com o que veio da página: injetar nome/cidade/segmento do lead aqui fazia
      // o matchesLead rio abaixo validar evidência que nós mesmos fabricamos (circular).
      snippet: `${title} ${slug} instagram direct_probe`,
      probeValidated: true,
    };
  }

  private async probeFacebookProfile(
    fetcher: typeof fetch,
    lead: WebscrapingContactResult,
    input: NormalizedSearchInput,
    slug: string,
    timeoutMs: number,
  ): Promise<WebCandidate | null> {
    const url = `https://www.facebook.com/${slug}`;
    const response = await fetcher(url, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36 HBX-Radar',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const html = await response.text();
    const title = stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
    if (!title || /^facebook$/i.test(title) || !socialTitleLooksCompatible(lead, title, slug)) return null;
    return {
      url,
      title,
      // Snippet honesto: só dado da própria página (ver comentário no probe de Instagram).
      snippet: `${title} ${slug} facebook direct_probe`,
      probeValidated: true,
    };
  }

  // Cache local por query (não gasta cota). Throttle (1 em voo + 1100ms) e disjuntor mensal
  // agora vivem no SourceBudgetService — este é o gargalo ÚNICO por onde TODA chamada Brave passa.
  private static readonly _braveCache = new Map<string, WebCandidate[]>();

  private async searchBrave(fetcher: typeof fetch, query: string, timeoutMs: number): Promise<WebCandidate[]> {
    const key = process.env.BRAVE_SEARCH_API_KEY;
    if (!key) return [];
    const cached = RadarWebEnrichmentService._braveCache.get(query);
    if (cached) return cached;
    return SourceBudgetService.schedule('brave', async () => {
      // Double-check cache after queue wait — another item may have populated it.
      const inCache = RadarWebEnrichmentService._braveCache.get(query);
      if (inCache) return inCache;
      // FREIO do PARAR (Sprint 1): com emergencyStop ativo no turbo_noturno, NENHUMA chamada sai —
      // o botão "Parar" congela o contador em até 8s (TTL do cache). Degrada gracioso ([]);
      // volta sozinho quando o MASTER retoma a agenda.
      if (await RadarWebEnrichmentService.factoryEmergencyStopped()) return [];
      // GOVERNOR POR FONTE: teto mensal estourado OU contador ilegível (fail-closed) → NÃO bate na
      // API, degrada gracioso (devolve [], igual o backstop de 429 abaixo). O incremento acontece
      // dentro do tryConsumePaid, só quando a chamada VAI mesmo ser feita (serializada pela fila).
      if (!(await SourceBudgetService.tryConsumePaid('brave'))) {
        return [];
      }
      try {
        // BUG-FIX (30/06): `search_lang=pt` (e `pt-BR`) faz a Brave responder 422 Unprocessable
        // Entity → searchBrave devolvia [] SEMPRE → descoberta de site e sociais achava ZERO.
        // `country=br` já enviesa pro Brasil.
        // Medido ao vivo no IP do VPS: com search_lang=422, sem ele=200.
        const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&country=br&count=10`;
        const response = await fetcher(url, {
          headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': key,
          },
          signal: AbortSignal.timeout(Math.min(timeoutMs, 8000)),
        });
        // 429 = rate-limit: return empty without caching so next call can retry.
        if (response.status === 429) {
          SourceBudgetService.reportRateLimited('brave', Number(response.headers?.get?.('retry-after')) || null);
          return [];
        }
        if (!response.ok) return [];
        const data: any = await response.json();
        const results: WebCandidate[] = (Array.isArray(data?.web?.results) ? data.web.results : [])
          .map((r: any) => ({
            url: String(r?.url || '').trim(),
            title: String(r?.title || '').trim(),
            snippet: String(r?.description || '').trim(),
          }))
          .filter((c: WebCandidate) => c.url);
        if (results.length) {
          RadarWebEnrichmentService._braveCache.set(query, results);
        }
        return results;
      } catch {
        return [];
      }
    });
  }

  private async searchWeb(fetcher: typeof fetch, query: string, timeoutMs: number): Promise<WebCandidate[]> {
    // FREIO do PARAR (P1, 02/07 — docs/PLANEJAMENTOS/PR02072026/W1-cutover-ordem-fixa.md):
    // decisão do dono — "parar = nenhuma fonte consultada" cobre TAMBÉM o fallback ddg/bing
    // (grátis), não só o Brave (já congelado no Sprint 1). searchWeb é o ÚNICO ponto de entrada
    // pro fallback bing→ddg deste serviço — gate aqui cobre ambos com 1 checagem.
    if (await RadarWebEnrichmentService.factoryEmergencyStopped()) return [];
    // ORDEM DO DINHEIRO (F4 da REFUNDAÇÃO 28/07): GRÁTIS primeiro, pago por ÚLTIMO.
    // A ordem antiga (Brave 1º em toda query) queimou os 900/mês na vitrine enquanto
    // ddg fechava o mês com ZERO chamadas (bing sempre devolve algo). Brave agora é
    // refinador: só entra quando bing E ddg voltaram vazios, sob teto mensal E diário.
    const bing = await this.searchBing(fetcher, query, timeoutMs).catch(() => [] as WebCandidate[]);
    if (bing.length) return bing;
    const ddg = await this.searchDuckDuckGo(fetcher, query, timeoutMs).catch(() => [] as WebCandidate[]);
    if (ddg.length) return ddg;
    if (process.env.BRAVE_SEARCH_API_KEY) {
      return this.searchBrave(fetcher, query, timeoutMs).catch(() => [] as WebCandidate[]);
    }
    return [];
  }

  /**
   * Worker 1 — sociais DO DONO. Dado o nome do sócio/dono (vindo do L4/qsa),
   * procura o perfil PESSOAL dele no Instagram/Facebook via busca web (Brave→Bing→DDG).
   * Best-effort e baixa confiança (nome de pessoa é ambíguo) → devolve candidatos pra revisão.
   * Nunca joga erro; sem resultado confiável → tudo null.
   */
  async findOwnerSocials(
    fetcher: typeof fetch,
    ownerName: string,
    hint: { city?: string | null; state?: string | null; segment?: string | null; companyName?: string | null } = {},
    timeoutMs = 8000,
  ): Promise<{
    instagramUrl: string | null;
    facebookUrl: string | null;
    candidates: Array<{ url: string; network: 'instagram' | 'facebook'; title: string }>;
  }> {
    const name = String(ownerName || '').trim();
    const empty = {
      instagramUrl: null,
      facebookUrl: null,
      candidates: [] as Array<{ url: string; network: 'instagram' | 'facebook'; title: string }>,
    };
    if (name.length < 4 || typeof fetcher !== 'function') return empty;
    const loc = [hint.city, hint.state].map((p) => String(p || '').trim()).filter(Boolean).join(' ');
    const ctx = [hint.segment, hint.companyName].map((p) => String(p || '').trim()).filter(Boolean).join(' ');
    const queries = [
      `"${name}" ${loc} instagram`.trim(),
      `"${name}" ${ctx} instagram`.trim(),
      `"${name}" ${loc} facebook`.trim(),
    ].filter((q, i, arr) => q && arr.indexOf(q) === i);

    const candidates: Array<{ url: string; network: 'instagram' | 'facebook'; title: string }> = [];
    for (const q of queries) {
      const results = await this.searchWeb(fetcher, q, timeoutMs).catch(() => [] as WebCandidate[]);
      for (const r of results) {
        const network = this.classifyOwnerSocialUrl(r.url);
        if (!network) continue;
        if (candidates.some((c) => c.url === r.url)) continue;
        candidates.push({ url: r.url, network, title: r.title || '' });
      }
      const hasIg = candidates.some((c) => c.network === 'instagram');
      const hasFb = candidates.some((c) => c.network === 'facebook');
      if (hasIg && hasFb) break;
    }
    return {
      instagramUrl: candidates.find((c) => c.network === 'instagram')?.url || null,
      facebookUrl: candidates.find((c) => c.network === 'facebook')?.url || null,
      candidates: candidates.slice(0, 8),
    };
  }

  /** Aceita só URL de PERFIL do Instagram/Facebook; rejeita posts, login, páginas de sistema. */
  private classifyOwnerSocialUrl(raw: string): 'instagram' | 'facebook' | null {
    try {
      const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      const host = u.hostname.replace(/^www\./, '').toLowerCase();
      const path = u.pathname.replace(/^\/+|\/+$/g, '');
      if (!path) return null; // só o domínio, sem perfil
      if (host === 'instagram.com') {
        if (/^(p|reel|reels|explore|stories|accounts|directory)(\/|$)/i.test(path)) return null;
        return 'instagram';
      }
      if (host === 'facebook.com' || host === 'fb.com') {
        if (/^(sharer|login|help|watch|events|groups|marketplace|pages\/category)(\/|$)/i.test(path)) return null;
        return 'facebook';
      }
      return null;
    } catch {
      return null;
    }
  }

  // Fontes GRÁTIS passam pelo semáforo de concorrência do governor (teto por fonte, default 8 —
  // dado medido: 20 batendo juntos = timeout). Fail-open: semáforo é in-memory, sem banco no caminho.
  private async searchBing(fetcher: typeof fetch, query: string, timeoutMs: number): Promise<WebCandidate[]> {
    return SourceBudgetService.withFreeSlot('bing', async () => {
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
    });
  }

  private async searchDuckDuckGo(fetcher: typeof fetch, query: string, timeoutMs: number): Promise<WebCandidate[]> {
    return SourceBudgetService.withFreeSlot('ddg', async () => {
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
    });
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
    const seen = new Set(candidates.map((candidate) => candidate.url));
    const blockRegex = /<li[^>]+class="[^"]*\bb_algo\b[^"]*"[\s\S]*?(?=<li[^>]+class="[^"]*\bb_algo\b|<\/ol>|$)/gi;
    let blockMatch: RegExpExecArray | null;
    while ((blockMatch = blockRegex.exec(html))) {
      const block = blockMatch[0];
      const title = stripHtml((
        block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1]
        || block.match(/aria-label="([^"]+)"/i)?.[1]
        || ''
      ).trim());
      const snippet = stripHtml(block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '');
      const anchorRegex = /<a[^>]+href="([^"]+)"[^>]*>/gi;
      let anchorMatch: RegExpExecArray | null;
      while ((anchorMatch = anchorRegex.exec(block))) {
        const url = decodeResultUrl(anchorMatch[1]);
        if (!url || seen.has(url)) continue;
        if (/\/\/(www\.)?(bing|microsoft|live)\./i.test(url) || /\/\/r\.bing\.com/i.test(url)) continue;
        seen.add(url);
        candidates.push({ url, title, snippet });
        break;
      }
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
    if (!['true', '1', 'yes', 'on'].includes(String(process.env.HBX_RADAR_WEB_ENRICHMENT_WEBSITE_CRAWL_ENABLED || '').trim().toLowerCase())) {
      return results;
    }
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
