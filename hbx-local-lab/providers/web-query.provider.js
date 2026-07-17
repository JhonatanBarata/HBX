'use strict';

const { compactText, normalizeDomain, normalizeUrl } = require('../extractors/email.extractor');
const { collectSeedCandidates, fetchPublicPage, runSiteCrawlProvider } = require('./site-crawl.provider');

const SEARCH_PAGE_MAX_BYTES = 500_000;
const BLOCKED_DISCOVERY_HOSTS = /(^|\.)(bing|google|duckduckgo|yahoo|facebook|instagram|linkedin|youtube|wikipedia|reclameaqui|guiamais|telelistas|solutudo|apontador|listaamarela|tripadvisor|ifood|jusbrasil|mercadolivre|olx)\./i;
const LEGAL_OR_GENERIC_TOKENS = new Set(['ltda', 'eireli', 'empresa', 'comercio', 'comercial', 'servicos', 'brasil', 'grupo', 'me', 'sa']);
const LEGAL_SUFFIX_TOKENS = new Set(['ltda', 'eireli', 'me', 'sa', 's', 'a']);

function normalizeLookup(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function htmlDecode(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripHtml(value) {
  return compactText(htmlDecode(String(value || '').replace(/<[^>]+>/g, ' ')), 600);
}

function decodeResultUrl(raw) {
  const decoded = htmlDecode(raw);
  try {
    const parsed = new URL(decoded.startsWith('//') ? `https:${decoded}` : decoded);
    const nested = parsed.searchParams.get('uddg') || parsed.searchParams.get('u');
    if (nested) {
      const value = decodeURIComponent(nested);
      if (/^a1[a-z0-9_-]+={0,2}$/i.test(value)) {
        try {
          return normalizeUrl(Buffer.from(value.slice(2).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
        } catch { return ''; }
      }
      return normalizeUrl(value);
    }
    return normalizeUrl(parsed.href);
  } catch {
    return normalizeUrl(decoded);
  }
}

function identityFromJob(job) {
  const candidate = (Array.isArray(job.candidates) ? job.candidates : []).find((item) => item && typeof item === 'object') || {};
  return {
    name: compactText(candidate.name || candidate.companyName || job.companyName, 300),
    city: compactText(candidate.city || job.city, 120),
    state: compactText(candidate.state || job.state, 2).toUpperCase(),
    segment: compactText(candidate.segment || job.segment, 180),
  };
}

function buildDiscoveryQueries(job) {
  const identity = identityFromJob(job);
  const name = identity.name ? `"${identity.name}"` : '';
  const base = [name, identity.city, identity.state, identity.segment].filter(Boolean).join(' ');
  if (!base) return [];
  return [
    `${base} site oficial contato`,
    `${base} email telefone`,
  ];
}

function parseDuckDuckGoResults(html) {
  const rows = [];
  const resultRegex = /<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = resultRegex.exec(String(html || '')))) {
    const url = decodeResultUrl(match[1]);
    const title = stripHtml(match[2]);
    if (!url || !title) continue;
    const after = String(html).slice(match.index, Math.min(String(html).length, match.index + 1400));
    const snippet = stripHtml(after.match(/class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1] || '');
    rows.push({ url, title, snippet, source: 'duckduckgo' });
  }
  return rows;
}

function parseBingResults(html) {
  const rows = [];
  const blockRegex = /<li[^>]+class=["'][^"']*\bb_algo\b[^"']*["'][\s\S]*?(?=<li[^>]+class=["'][^"']*\bb_algo\b|<\/ol>|$)/gi;
  let match;
  while ((match = blockRegex.exec(String(html || '')))) {
    const block = match[0];
    const anchor = block.match(/<h2[^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    const url = decodeResultUrl(anchor?.[1]);
    const title = stripHtml(anchor?.[2]);
    if (!url || !title) continue;
    const snippet = stripHtml(block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '');
    rows.push({ url, title, snippet, source: 'bing' });
  }
  return rows;
}

function rankOfficialCandidates(job, rows) {
  const identity = identityFromJob(job);
  const name = normalizeLookup(identity.name);
  const city = normalizeLookup(identity.city);
  const state = normalizeLookup(identity.state);
  const legalName = name.split(' ').filter((token) => token && !LEGAL_SUFFIX_TOKENS.has(token)).join(' ');
  const nameTokens = name.split(' ').filter((token) => token.length >= 3 && !LEGAL_OR_GENERIC_TOKENS.has(token));
  if (!legalName) return [];
  const seen = new Set();
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const url = normalizeUrl(row?.url);
    const domain = normalizeDomain(url);
    if (!url || !domain || BLOCKED_DISCOVERY_HOSTS.test(domain) || seen.has(domain)) return null;
    const haystack = normalizeLookup(`${row.title || ''} ${row.snippet || ''} ${domain}`);
    const hits = nameTokens.filter((token) => haystack.includes(token));
    if (!haystack.includes(legalName)) return null;
    if (city && !haystack.includes(city)) return null;
    if (!city && state && !haystack.split(' ').includes(state)) return null;
    let score = 70;
    score += Math.min(45, hits.length * 15);
    score += hits.some((token) => domain.includes(token)) ? 20 : 0;
    score += city && haystack.includes(city) ? 15 : 0;
    score += state && haystack.split(' ').includes(state) ? 5 : 0;
    seen.add(domain);
    return { ...row, url, domain, score };
  }).filter(Boolean).sort((left, right) => right.score - left.score);
}

async function fetchSearchPage(url, context = {}) {
  const page = await fetchPublicPage(url, context.signal, context.fetcher, context.resolveHostname);
  if (!page.ok) throw new Error(page.error || 'web_query_fetch_indisponivel');
  return String(page.html || '').slice(0, SEARCH_PAGE_MAX_BYTES);
}

async function discoverOfficialWebsite(job, context = {}) {
  const queries = buildDiscoveryQueries(job);
  if (!queries.length) return { candidate: null, queries, warnings: ['web_query sem identidade suficiente para pesquisar.'], attempts: 0 };
  const rows = [];
  const warnings = [];
  let attempts = 0;
  let successfulResponses = 0;
  for (const query of queries.slice(0, 1)) {
    const engines = [
      { source: 'duckduckgo', url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, parse: parseDuckDuckGoResults },
      { source: 'bing', url: `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=10&setlang=pt-BR&cc=BR`, parse: parseBingResults },
    ];
    for (const engine of engines) {
      attempts += 1;
      try {
        const html = await fetchSearchPage(engine.url, context);
        successfulResponses += 1;
        rows.push(...engine.parse(html));
        const ranked = rankOfficialCandidates(job, rows);
        if (ranked.length) return { candidate: ranked[0], queries, warnings, attempts };
      } catch (error) {
        warnings.push(`${engine.source}:${compactText(error?.message || error, 120)}`);
      }
    }
  }
  if (!successfulResponses) throw new Error('web_query_indisponivel');
  return { candidate: null, queries, warnings: [...warnings, 'web_query sem site oficial compatível com a identidade da missão.'], attempts };
}

async function runWebQueryProvider(job, context = {}) {
  const seeded = collectSeedCandidates(job);
  if (seeded.length) {
    return {
      provider: 'web_query',
      leads: seeded.map((candidate, index) => ({
        externalId: `web-query:${index + 1}:${candidate.website}`,
        name: candidate.name || `Candidato ${index + 1}`,
        city: candidate.city || job.city || null,
        state: candidate.state || job.state || null,
        segment: candidate.segment || job.segment || null,
        website: candidate.website,
        phone: candidate.phone || null,
        whatsapp: candidate.whatsapp || null,
        sourceUrl: candidate.sourceUrl || candidate.website,
        sourceProvider: 'web_query',
        sourceMode: 'local_lab',
        sourceRisk: 'experimental',
        evidence: { method: 'seed_candidate', queries: buildDiscoveryQueries(job) },
        raw: {},
      })),
      emails: [],
      evidence: [],
      stats: { provider: 'web_query', queriesBuilt: buildDiscoveryQueries(job).length, candidates: seeded.length, discovered: 0 },
      warnings: [],
    };
  }

  const discovery = await discoverOfficialWebsite(job, context);
  if (!discovery.candidate) {
    return {
      provider: 'web_query', leads: [], emails: [], evidence: [],
      stats: { provider: 'web_query', queriesBuilt: discovery.queries.length, candidates: 0, discovered: 0, attempts: discovery.attempts },
      warnings: discovery.warnings,
    };
  }

  const identity = identityFromJob(job);
  const candidate = {
    ...identity,
    website: discovery.candidate.url,
    sourceUrl: discovery.candidate.url,
  };
  const crawled = await runSiteCrawlProvider({
    ...job,
    candidates: [candidate],
    seedUrls: [],
    websites: [],
    maxCandidates: 1,
  }, context);
  const legalName = normalizeLookup(identity.name).split(' ').filter((token) => token && !LEGAL_SUFFIX_TOKENS.has(token)).join(' ');
  const siteText = normalizeLookup((crawled.evidence || []).map((item) => item.excerpt).join(' '));
  if (!legalName || !siteText.includes(legalName)) {
    return {
      provider: 'web_query', leads: [], emails: [], evidence: [],
      stats: { provider: 'web_query', queriesBuilt: discovery.queries.length, candidates: 1, discovered: 0, attempts: discovery.attempts },
      warnings: [...discovery.warnings, 'web_query descartou resultado porque o próprio site não confirmou a identidade.'],
    };
  }
  return {
    provider: 'web_query',
    leads: (crawled.leads || []).map((lead) => ({
      ...lead,
      sourceProvider: 'web_query_verified',
      raw: {
        ...(lead.raw || {}),
        discovery: {
          source: discovery.candidate.source,
          resultUrl: discovery.candidate.url,
          identityScore: discovery.candidate.score,
          identityConfirmed: true,
          query: discovery.queries[0],
        },
      },
    })),
    emails: crawled.emails || [],
    evidence: crawled.evidence || [],
    stats: {
      ...(crawled.stats || {}),
      provider: 'web_query',
      queriesBuilt: discovery.queries.length,
      candidates: 1,
      discovered: 1,
      attempts: discovery.attempts,
    },
    warnings: [...discovery.warnings, ...(crawled.warnings || [])],
  };
}

module.exports = {
  buildDiscoveryQueries,
  discoverOfficialWebsite,
  parseBingResults,
  parseDuckDuckGoResults,
  rankOfficialCandidates,
  runWebQueryProvider,
};
