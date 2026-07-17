'use strict';

const { extractCnpjFromText, extractEmailsFromText, extractPhonesFromText, normalizeDomain, normalizePhoneDigits, normalizeUrl, compactText } = require('../extractors/email.extractor');
const { buildContactUrls, extractLikelyCompanyName, extractPublicLinks, extractSocialUrls } = require('../extractors/contact-page.extractor');
const { buildCompactEvidence, evidenceContainsValue } = require('../extractors/evidence.extractor');

const MAX_PAGE_BYTES = 350_000;

// --- Ritmo humano (protege o IP) -------------------------------------------
// A caça é serial; o que faltava era PAUSA entre requisições e BACKOFF quando o
// alvo bloqueia (429/403/503). O volume pode ser infinito; a velocidade é lenta.
function clampMs(value, fallback) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
const PACING = {
  minDelayMs: clampMs(process.env.HBX_LOCAL_LAB_MIN_DELAY_MS, 1500),
  maxDelayMs: clampMs(process.env.HBX_LOCAL_LAB_MAX_DELAY_MS, 4000),
  blockBackoffMs: clampMs(process.env.HBX_LOCAL_LAB_BLOCK_BACKOFF_MS, 60_000),
};
const BLOCK_STATUSES = new Set([429, 403, 503]);
let lastFetchAt = 0;
let blockStreak = 0;
const pacingStats = { fetches: 0, blocks: 0, backoffMs: 0 };

function sleep(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

// O orquestrador ajusta o ritmo por job e zera o estado entre jobs.
function configurePacing(job = {}) {
  if (job.minDelayMs != null) PACING.minDelayMs = clampMs(job.minDelayMs, PACING.minDelayMs);
  if (job.maxDelayMs != null) PACING.maxDelayMs = clampMs(job.maxDelayMs, PACING.maxDelayMs);
  if (job.blockBackoffMs != null) PACING.blockBackoffMs = clampMs(job.blockBackoffMs, PACING.blockBackoffMs);
  lastFetchAt = 0;
  blockStreak = 0;
  pacingStats.fetches = 0;
  pacingStats.blocks = 0;
  pacingStats.backoffMs = 0;
}

function getPacingStats() {
  return { ...pacingStats, minDelayMs: PACING.minDelayMs, maxDelayMs: PACING.maxDelayMs, blockBackoffMs: PACING.blockBackoffMs };
}

function nextDelayMs() {
  const lo = Math.min(PACING.minDelayMs, PACING.maxDelayMs);
  const hi = Math.max(PACING.minDelayMs, PACING.maxDelayMs);
  return Math.round(lo + Math.random() * (hi - lo));
}

function normalizeSeedCandidate(seed, job) {
  if (!seed) return null;
  if (typeof seed === 'string') {
    const website = normalizeUrl(seed);
    if (!website) return null;
    return {
      name: '',
      city: job.city || null,
      state: job.state || null,
      segment: job.segment || null,
      website,
      sourceUrl: website,
    };
  }
  const website = normalizeUrl(seed.website || seed.url || seed.sourceUrl);
  if (!website) return null;
  return {
    name: compactText(seed.name || seed.companyName || '', 300),
    city: compactText(seed.city || job.city || '', 120) || null,
    state: compactText(seed.state || job.state || '', 2).toUpperCase() || null,
    segment: compactText(seed.segment || job.segment || '', 180) || null,
    website,
    cnpj: String(seed.cnpj || '').replace(/\D/g, '').slice(0, 14) || null,
    phone: seed.phone || null,
    whatsapp: seed.whatsapp || null,
    instagramUrl: normalizeUrl(seed.instagramUrl) || null,
    facebookUrl: normalizeUrl(seed.facebookUrl) || null,
    sourceUrl: normalizeUrl(seed.sourceUrl || website) || website,
  };
}

function collectSeedCandidates(job) {
  const seeds = [
    ...(Array.isArray(job.seedUrls) ? job.seedUrls : []),
    ...(Array.isArray(job.websites) ? job.websites : []),
    ...(Array.isArray(job.candidates) ? job.candidates : []),
  ];
  const candidates = seeds.map((seed) => normalizeSeedCandidate(seed, job)).filter(Boolean);
  const seen = new Set();
  const maxCandidates = Math.max(1, Math.min(5000, Number(job.maxCandidates || Math.max(100, Number(job.targetEmails || 20) * 10)) || 500));
  return candidates.filter((candidate) => {
    const key = normalizeDomain(candidate.website);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, maxCandidates);
}

async function fetchPublicPage(url, signal, fetcher = globalThis.fetch) {
  const target = normalizeUrl(url);
  if (!target || typeof fetcher !== 'function') return { ok: false, error: 'fetch_unavailable', url: target || url };

  // Pausa humana antes do GET (jitter), respeitando o intervalo mínimo desde o último.
  const gap = nextDelayMs();
  const since = Date.now() - lastFetchAt;
  if (lastFetchAt > 0 && since < gap) await sleep(gap - since);

  let page;
  try {
    const response = await fetcher(target, {
      method: 'GET',
      redirect: 'follow',
      signal,
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
        // UA de navegador: muitos sites devolvem 403 pra UA de bot e a gente perdia o e-mail.
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    });
    if (!response.ok) {
        page = { ok: false, error: `http_${response.status}`, status: response.status, url: target, capturedAt: new Date().toISOString() };
    } else {
      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      if (contentType && !/text\/html|text\/plain|text\/xml|application\/xml|application\/xhtml\+xml/.test(contentType)) {
        page = { ok: false, error: 'unsupported_content_type', status: response.status, url: target, capturedAt: new Date().toISOString() };
      } else {
        const raw = await response.text();
        page = { ok: true, url: target, status: response.status, html: raw.slice(0, MAX_PAGE_BYTES), capturedAt: new Date().toISOString() };
      }
    }
  } catch (error) {
    page = { ok: false, error: String(error && error.name === 'AbortError' ? 'aborted' : error?.message || error), url: target, capturedAt: new Date().toISOString() };
  }

  lastFetchAt = Date.now();
  pacingStats.fetches += 1;

  // Backoff: se o alvo bloqueou (429/403/503), dorme (crescente) e segue — não insiste, não toma ban.
  if (page && page.status && BLOCK_STATUSES.has(page.status) && PACING.blockBackoffMs > 0) {
    blockStreak += 1;
    const backoff = PACING.blockBackoffMs * Math.min(blockStreak, 5);
    pacingStats.blocks += 1;
    pacingStats.backoffMs += backoff;
    await sleep(backoff);
    lastFetchAt = Date.now();
  } else {
    blockStreak = 0;
  }

  return page;
}

function buildLeadFromCandidate(candidate, emails, pages, job, phonesFound = [], evidence = []) {
  const firstPage = pages.find((page) => page.ok);
  // Multi e-mail: o dono quer 1/2/3 — o crawl achava vários e eu só guardava o 1º.
  // Ordena por confiança (mailto/domínio oficial primeiro), dedup, teto 3.
  const emailsList = [];
  for (const e of [...emails].sort((a, b) => (b.confidence || 0) - (a.confidence || 0))) {
    if (e && e.email && !emailsList.includes(e.email)) emailsList.push(e.email);
    if (emailsList.length >= 3) break;
  }
  // Multi telefone: telefone do card primeiro, depois os achados no site. Teto 3.
  const phonesList = [];
  for (const p of [normalizePhoneDigits(candidate.phone), ...phonesFound]) {
    if (p && (p.length === 10 || p.length === 11) && !phonesList.includes(p)) phonesList.push(p);
    if (phonesList.length >= 3) break;
  }
  const firstEmail = emails[0] || null;
  const name = compactText(candidate.name || extractLikelyCompanyName(firstPage?.html || '', ''), 300);
  if (!name) return null;
  const contacts = [];
  for (const item of emailsList) {
    const emailRow = emails.find((entry) => entry && entry.email === item);
    const evidenceId = emailRow?.evidence?.evidenceId || null;
    contacts.push({
      kind: 'email',
      value: item,
      valueNormalized: item,
      sourceUrl: emailRow?.sourceUrl || null,
      evidenceId,
      confidence: Number(emailRow?.confidence || 0),
      officialDomainMatch: Boolean(emailRow?.evidence?.officialDomainMatch),
    });
  }
  for (const item of phonesList) {
    const sourceEvidence = evidence.find((entry) => evidenceContainsValue(entry, item, 'phone')) || null;
    contacts.push({
      kind: 'phone',
      value: item,
      valueNormalized: item,
      sourceUrl: sourceEvidence?.sourceUrl || null,
      evidenceId: sourceEvidence?.id || null,
      confidence: sourceEvidence ? 60 : 0,
      officialDomainMatch: false,
    });
  }
  return {
    externalId: `lead:${normalizeDomain(candidate.website) || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name,
    city: candidate.city || job.city || null,
    state: candidate.state || job.state || null,
    segment: candidate.segment || job.segment || null,
    website: candidate.website || null,
    cnpj: candidate.cnpj || null,
    phone: phonesList[0] || normalizePhoneDigits(candidate.phone) || null,
    phones: phonesList,
    whatsapp: normalizePhoneDigits(candidate.whatsapp) || null,
    email: emailsList[0] || null,
    emails: emailsList,
    emailStatus: emailsList.length ? (firstEmail && firstEmail.status === 'probable' ? 'probable' : 'found_on_site') : 'missing',
    emailConfidence: firstEmail?.confidence || 0,
    instagramUrl: candidate.instagramUrl || null,
    facebookUrl: candidate.facebookUrl || null,
    sourceUrl: firstEmail?.sourceUrl || candidate.sourceUrl || candidate.website,
    sourceProvider: 'site_crawl',
    sourceMode: 'local_lab',
    sourceRisk: 'experimental',
    evidence: {
      items: evidence,
      emailsFound: emails.length,
    },
    contacts,
    raw: {
      pageErrors: pages.filter((page) => !page.ok).map((page) => ({ url: page.url, error: page.error })).slice(0, 20),
    },
  };
}

async function runSiteCrawlProvider(job, context = {}) {
  const candidates = collectSeedCandidates(job);
  const stats = {
    provider: 'site_crawl',
    candidates: candidates.length,
    pagesVisited: 0,
    emailsFound: 0,
  };
  const leads = [];
  const emails = [];
  const evidence = [];
  const warnings = [];

  for (const candidate of candidates) {
    if (context.isCanceled && context.isCanceled()) break;
    const maxPagesPerSite = Math.max(1, Math.min(250, Number(job.maxPagesPerSite || 40) || 40));
    const maxDiscoveredLinks = Math.max(0, Math.min(1000, Number(job.maxDiscoveredLinks || 80) || 80));
    const contactUrls = buildContactUrls(candidate.website).slice(0, maxPagesPerSite);
    const pages = [];
    const candidatePhones = [];
    const discoveredLinks = new Set();
    const collectPhones = (html) => {
      for (const ph of extractPhonesFromText(html)) {
        if (!candidatePhones.includes(ph) && candidatePhones.length < 6) candidatePhones.push(ph);
      }
    };
    for (const url of contactUrls) {
      if (context.isCanceled && context.isCanceled()) break;
      if (pages.length >= maxPagesPerSite) break;
      const page = await fetchPublicPage(url, context.signal, context.fetcher);
      pages.push(page);
      if (!page.ok) continue;
      const compactEvidence = buildCompactEvidence(page, 'site_crawl');
      if (compactEvidence && !evidence.some((item) => item.id === compactEvidence.id)) evidence.push(compactEvidence);
      stats.pagesVisited += 1;
      if (typeof context.onProgress === 'function') context.onProgress({ pagesVisited: stats.pagesVisited, emailsFound: stats.emailsFound });
      extractPublicLinks(page.html, page.url).slice(0, maxDiscoveredLinks).forEach((link) => discoveredLinks.add(link));
      const socialLinks = extractSocialUrls(page.html, page.url);
      if (!candidate.instagramUrl) candidate.instagramUrl = socialLinks.find((link) => /instagram\.com/i.test(link)) || null;
      if (!candidate.facebookUrl) candidate.facebookUrl = socialLinks.find((link) => /facebook\.com/i.test(link)) || null;
      if (!candidate.cnpj) candidate.cnpj = extractCnpjFromText(page.html);
      collectPhones(page.html);
      const found = extractEmailsFromText(page.html, {
        sourceUrl: page.url,
        website: candidate.website,
        companyName: candidate.name,
        provider: 'site_crawl',
        evidence: compactEvidence,
      });
      emails.push(...found);
      stats.emailsFound += found.length;
    }

    for (const link of Array.from(discoveredLinks).slice(0, maxDiscoveredLinks)) {
      if (context.isCanceled && context.isCanceled()) break;
      if (pages.length >= maxPagesPerSite) break;
      const page = await fetchPublicPage(link, context.signal, context.fetcher);
      pages.push(page);
      if (!page.ok) continue;
      const compactEvidence = buildCompactEvidence(page, 'site_crawl');
      if (compactEvidence && !evidence.some((item) => item.id === compactEvidence.id)) evidence.push(compactEvidence);
      stats.pagesVisited += 1;
      if (typeof context.onProgress === 'function') context.onProgress({ pagesVisited: stats.pagesVisited, emailsFound: stats.emailsFound });
      if (!candidate.cnpj) candidate.cnpj = extractCnpjFromText(page.html);
      collectPhones(page.html);
      const found = extractEmailsFromText(page.html, {
        sourceUrl: page.url,
        website: candidate.website,
        companyName: candidate.name,
        provider: 'site_crawl',
        evidence: compactEvidence,
      });
      emails.push(...found);
      stats.emailsFound += found.length;
    }

    const leadEmails = emails.filter((email) => normalizeDomain(email.website || email.email) === normalizeDomain(candidate.website));
    const candidateEvidence = evidence.filter((item) => normalizeDomain(item.sourceUrl) === normalizeDomain(candidate.website));
    const lead = buildLeadFromCandidate(candidate, leadEmails, pages, job, candidatePhones, candidateEvidence);
    if (lead) leads.push(lead);
  }

  if (!candidates.length) warnings.push('site_crawl requer seedUrls, websites ou candidates no MVP.');
  return { provider: 'site_crawl', leads, emails, evidence, stats, warnings };
}

module.exports = {
  collectSeedCandidates,
  fetchPublicPage,
  runSiteCrawlProvider,
  configurePacing,
  getPacingStats,
};
