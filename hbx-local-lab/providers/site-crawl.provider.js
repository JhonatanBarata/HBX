'use strict';

const dns = require('node:dns').promises;
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const { extractCnpjFromText, extractEmailsFromText, extractPhonesFromText, normalizeDomain, normalizePhoneDigits, normalizeUrl, compactText } = require('../extractors/email.extractor');
const { buildContactUrls, extractLikelyCompanyName, extractPublicLinks, extractSocialUrls } = require('../extractors/contact-page.extractor');
const { buildCompactEvidence, evidenceContainsValue } = require('../extractors/evidence.extractor');

const MAX_PAGE_BYTES = 350_000;
const FETCH_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 5;

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

function extractConfirmedWhatsappNumbers(html) {
  const output = [];
  const seen = new Set();
  const source = String(html || '').replace(/&amp;/gi, '&');
  const links = source.match(/(?:https?:)?\/\/(?:wa\.me\/\d+|(?:api|web)\.whatsapp\.com\/send\?[^\s"'<>]*)/gi) || [];
  for (const rawLink of links) {
    let digits = '';
    try {
      const url = new URL(rawLink.startsWith('//') ? `https:${rawLink}` : rawLink);
      if (url.hostname.toLowerCase() === 'wa.me') digits = normalizePhoneDigits(url.pathname.split('/').filter(Boolean)[0]);
      else if (['api.whatsapp.com', 'web.whatsapp.com'].includes(url.hostname.toLowerCase())) digits = normalizePhoneDigits(url.searchParams.get('phone'));
    } catch {
      continue;
    }
    if (![10, 11].includes(digits.length) || seen.has(digits)) continue;
    seen.add(digits);
    output.push(digits);
  }
  return output;
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

function isPublicIpv4(address) {
  const parts = String(address || '').split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return !(a === 192 && b === 0 && c === 2);
}

function isPublicIp(address) {
  const value = String(address || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  const family = net.isIP(value);
  if (family === 4) return isPublicIpv4(value);
  if (family !== 6) return false;
  const mapped = value.match(/(?:^|:)ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  if (mapped) return isPublicIpv4(mapped);
  if (value.startsWith('::')) return false;
  if (/^(fc|fd)/i.test(value) || /^fe[89ab]/i.test(value) || /^ff/i.test(value)) return false;
  if (/^(?:64:ff9b|2001:(?:0|1|2|10|db8)|2002)(?::|$)/i.test(value)) return false;
  return true;
}

async function resolveSafePublicUrl(rawUrl, resolver = dns.lookup) {
  const target = normalizeUrl(rawUrl);
  if (!target) throw new Error('unsafe_target_url');
  const parsed = new URL(target);
  if (parsed.username || parsed.password) throw new Error('unsafe_target_credentials');
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  const allowedPort = !parsed.port || (parsed.protocol === 'http:' && parsed.port === '80') || (parsed.protocol === 'https:' && parsed.port === '443');
  if (!allowedPort) throw new Error('unsafe_target_port');
  if (net.isIP(hostname)) {
    if (!isPublicIp(hostname)) throw new Error('unsafe_target_address');
    return { url: parsed.toString(), addresses: [{ address: hostname, family: net.isIP(hostname) }] };
  }
  if (!hostname || !hostname.includes('.') || hostname === 'localhost' || /\.(?:localhost|local|internal|lan|home)$/.test(hostname)) {
    throw new Error('unsafe_target_hostname');
  }
  let resolved;
  try {
    resolved = await resolver(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('unsafe_target_dns');
  }
  const rows = Array.isArray(resolved) ? resolved : resolved ? [resolved] : [];
  if (!rows.length || rows.some((entry) => !isPublicIp(typeof entry === 'string' ? entry : entry?.address))) {
    throw new Error('unsafe_target_address');
  }
  const addresses = rows.map((entry) => ({
    address: typeof entry === 'string' ? entry : entry.address,
    family: Number(typeof entry === 'string' ? net.isIP(entry) : entry.family || net.isIP(entry.address)),
  })).sort((left, right) => left.family - right.family);
  return { url: parsed.toString(), addresses };
}

async function assertSafePublicUrl(rawUrl, resolver = dns.lookup) {
  return (await resolveSafePublicUrl(rawUrl, resolver)).url;
}

function fetchPinnedPublicPage(url, resolvedAddress, options = {}) {
  const parsed = new URL(url);
  const transport = parsed.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname.replace(/^\[|\]$/g, ''),
      port: parsed.port || undefined,
      path: `${parsed.pathname}${parsed.search}`,
      method: options.method || 'GET',
      headers: options.headers,
      signal: options.signal,
      servername: parsed.hostname.replace(/^\[|\]$/g, ''),
      lookup: (_hostname, lookupOptions, callback) => {
        const done = typeof lookupOptions === 'function' ? lookupOptions : callback;
        const opts = typeof lookupOptions === 'function' ? {} : lookupOptions || {};
        if (opts.all) done(null, [resolvedAddress]);
        else done(null, resolvedAddress.address, resolvedAddress.family);
      },
    }, (response) => {
      let consumed = false;
      const text = () => {
        if (consumed) return Promise.reject(new Error('response_already_consumed'));
        consumed = true;
        return new Promise((resolveBody, rejectBody) => {
          const chunks = [];
          let total = 0;
          response.on('data', (chunk) => {
            if (total >= MAX_PAGE_BYTES) return;
            const remaining = MAX_PAGE_BYTES - total;
            const part = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
            chunks.push(part);
            total += part.length;
          });
          response.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
          response.on('error', rejectBody);
        });
      };
      resolve({
        ok: Number(response.statusCode) >= 200 && Number(response.statusCode) < 300,
        status: Number(response.statusCode || 0),
        url,
        headers: {
          get(name) {
            const value = response.headers[String(name || '').toLowerCase()];
            return Array.isArray(value) ? value.join(', ') : value == null ? null : String(value);
          },
        },
        text,
        discard() {
          if (consumed) return;
          consumed = true;
          response.resume();
        },
      });
    });
    request.on('error', reject);
    request.end();
  });
}

async function fetchPublicPage(url, signal, fetcher = null, resolver = dns.lookup) {
  let resolvedTarget;
  let target;
  try {
    resolvedTarget = await resolveSafePublicUrl(url, resolver);
    target = resolvedTarget.url;
  } catch (error) {
    return { ok: false, error: String(error?.message || 'unsafe_target'), url: normalizeUrl(url) || null };
  }

  // Pausa humana antes do GET (jitter), respeitando o intervalo mínimo desde o último.
  const gap = nextDelayMs();
  const since = Date.now() - lastFetchAt;
  if (lastFetchAt > 0 && since < gap) await sleep(gap - since);

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener?.('abort', abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  if (timeout.unref) timeout.unref();
  let page;
  try {
    let response;
    let current = target;
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      const requestOptions = {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
          // UA de navegador: muitos sites devolvem 403 pra UA de bot e a gente perdia o e-mail.
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
      };
      response = typeof fetcher === 'function'
        ? await fetcher(current, requestOptions)
        : await fetchPinnedPublicPage(current, resolvedTarget.addresses[0], requestOptions);
      if (response.status < 300 || response.status >= 400) {
        resolvedTarget = await resolveSafePublicUrl(response.url || current, resolver);
        target = resolvedTarget.url;
        break;
      }
      if (redirects >= MAX_REDIRECTS) throw new Error('too_many_redirects');
      const location = response.headers?.get?.('location');
      if (!location) throw new Error('redirect_without_location');
      response.discard?.();
      resolvedTarget = await resolveSafePublicUrl(new URL(location, current).toString(), resolver);
      current = resolvedTarget.url;
    }
    if (!response.ok) {
        response.discard?.();
        page = { ok: false, error: `http_${response.status}`, status: response.status, url: target, capturedAt: new Date().toISOString() };
    } else {
      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      if (contentType && !/text\/html|text\/plain|text\/xml|application\/xml|application\/xhtml\+xml/.test(contentType)) {
        response.discard?.();
        page = { ok: false, error: 'unsupported_content_type', status: response.status, url: target, capturedAt: new Date().toISOString() };
      } else {
        const raw = await response.text();
        page = { ok: true, url: target, status: response.status, html: raw.slice(0, MAX_PAGE_BYTES), capturedAt: new Date().toISOString() };
      }
    }
  } catch (error) {
    page = { ok: false, error: String(error && error.name === 'AbortError' ? 'aborted' : error?.message || error), url: target, capturedAt: new Date().toISOString() };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener?.('abort', abortFromCaller);
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

function buildLeadFromCandidate(candidate, emails, pages, job, phonesFound = [], evidence = [], confirmedWhatsapps = []) {
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
  for (const item of confirmedWhatsapps) {
    const sourceEvidence = evidence.find((entry) => evidenceContainsValue(entry, item, 'whatsapp')) || null;
    if (!sourceEvidence) continue;
    contacts.push({
      kind: 'whatsapp',
      value: item,
      valueNormalized: item,
      sourceUrl: sourceEvidence.sourceUrl,
      evidenceId: sourceEvidence.id,
      confidence: 100,
      officialDomainMatch: true,
      whatsappConfirmed: true,
      verification: 'official_whatsapp_link',
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
    const candidateWhatsapps = [];
    const discoveredLinks = new Set();
    const collectPhones = (html) => {
      for (const ph of extractPhonesFromText(html)) {
        if (!candidatePhones.includes(ph) && candidatePhones.length < 6) candidatePhones.push(ph);
      }
    };
    for (const url of contactUrls) {
      if (context.isCanceled && context.isCanceled()) break;
      if (pages.length >= maxPagesPerSite) break;
      const page = await fetchPublicPage(url, context.signal, context.fetcher, context.resolveHostname);
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
      for (const number of extractConfirmedWhatsappNumbers(page.html)) {
        if (!candidateWhatsapps.includes(number)) candidateWhatsapps.push(number);
      }
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
      const page = await fetchPublicPage(link, context.signal, context.fetcher, context.resolveHostname);
      pages.push(page);
      if (!page.ok) continue;
      const compactEvidence = buildCompactEvidence(page, 'site_crawl');
      if (compactEvidence && !evidence.some((item) => item.id === compactEvidence.id)) evidence.push(compactEvidence);
      stats.pagesVisited += 1;
      if (typeof context.onProgress === 'function') context.onProgress({ pagesVisited: stats.pagesVisited, emailsFound: stats.emailsFound });
      if (!candidate.cnpj) candidate.cnpj = extractCnpjFromText(page.html);
      collectPhones(page.html);
      for (const number of extractConfirmedWhatsappNumbers(page.html)) {
        if (!candidateWhatsapps.includes(number)) candidateWhatsapps.push(number);
      }
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
    const lead = buildLeadFromCandidate(candidate, leadEmails, pages, job, candidatePhones, candidateEvidence, candidateWhatsapps);
    if (lead) leads.push(lead);
  }

  if (!candidates.length) warnings.push('site_crawl requer seedUrls, websites ou candidates no MVP.');
  return { provider: 'site_crawl', leads, emails, evidence, stats, warnings };
}

module.exports = {
  assertSafePublicUrl,
  collectSeedCandidates,
  extractConfirmedWhatsappNumbers,
  fetchPublicPage,
  isPublicIp,
  runSiteCrawlProvider,
  configurePacing,
  getPacingStats,
};
