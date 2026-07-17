'use strict';

const { createHash } = require('node:crypto');
const { compactText, normalizePhoneDigits, normalizeUrl } = require('./email.extractor');

const MAX_EXCERPT_CHARS = 480;

function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function pageTypeFromUrl(value) {
  const target = normalizeUrl(value);
  if (!target) return 'unknown';
  let pathname = '/';
  try { pathname = new URL(target).pathname.toLowerCase(); } catch { return 'unknown'; }
  if (pathname === '/' || pathname === '') return 'home';
  if (/contato|contact|fale-conosco|atendimento|agendamento|orcamento|orçamento/.test(pathname)) return 'contact';
  if (/sobre|quem-somos|empresa|equipe|profissionais/.test(pathname)) return 'about';
  if (/servico|serviço|especialidade|produto/.test(pathname)) return 'services';
  if (/instagram\.com|facebook\.com|linkedin\.com/.test(target)) return 'social';
  return 'other';
}

function compactRelevantExcerpt(text, maxLength = MAX_EXCERPT_CHARS) {
  const clean = compactText(text, 80_000);
  if (!clean) return '';
  const marker = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[\s.-]?\d{4}|propriet[aá]ri[oa]|fundador|respons[aá]vel|diretor|s[oó]ci[oa]|contato|whatsapp/i;
  const match = marker.exec(clean);
  if (!match) return clean.slice(0, maxLength);
  const radius = Math.max(80, Math.floor((maxLength - match[0].length) / 2));
  const start = Math.max(0, match.index - radius);
  return clean.slice(start, start + maxLength);
}

function buildCompactEvidence(page, provider = 'site_crawl') {
  const sourceUrl = normalizeUrl(page && page.url);
  if (!sourceUrl || !page || !page.ok) return null;
  const visibleText = htmlToText(page.html);
  const literalTokens = Array.from(new Set([
    ...Array.from(String(page.html || '').matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi), (match) => String(match[0]).toLowerCase()),
    ...Array.from(String(page.html || '').matchAll(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[\s.-]?\d{4}/g), (match) => compactText(match[0], 40)),
    ...Array.from(
      String(page.html || '').matchAll(/(?:https?:)?\/\/(?:wa\.me\/\d+|(?:api|web)\.whatsapp\.com\/send\?[^\s"'<>]*)/gi),
      (match) => compactText(match[0].replace(/&amp;/gi, '&'), 300),
    ),
    ...Array.from(String(page.html || '').matchAll(/https?:\/\/[^\s"'<>]*(?:instagram\.com|facebook\.com)[^\s"'<>]*/gi), (match) => compactText(match[0], 300)),
  ].filter(Boolean))).slice(0, 12);
  const normalizedText = compactText(`${visibleText} ${literalTokens.join(' ')}`, 100_000);
  if (!normalizedText) return null;
  const contentHash = createHash('sha256').update(normalizedText, 'utf8').digest('hex');
  const id = `ev_${createHash('sha256').update(`${sourceUrl}\n${contentHash}`, 'utf8').digest('hex').slice(0, 24)}`;
  const normalizedProvider = compactText(provider, 80) || 'site_crawl';
  const pageType = normalizedProvider === 'directory_probe'
    ? 'directory'
    : normalizedProvider === 'social_probe'
      ? 'social'
      : normalizedProvider === 'web_query'
        ? 'search'
        : pageTypeFromUrl(sourceUrl);
  return {
    id,
    sourceUrl,
    provider: normalizedProvider,
    pageType,
    capturedAt: page.capturedAt || new Date().toISOString(),
    contentHash,
    excerpt: compactText(`${literalTokens.join(' ')} ${compactRelevantExcerpt(visibleText, 320)}`, MAX_EXCERPT_CHARS),
  };
}

function evidenceContainsValue(evidence, value, kind) {
  const excerpt = String(evidence && evidence.excerpt || '');
  if (!excerpt || !value) return false;
  if (kind === 'phone' || kind === 'whatsapp') {
    const wanted = normalizePhoneDigits(value);
    const sourceDigits = excerpt.replace(/\D/g, '');
    return Boolean(wanted && sourceDigits.includes(wanted));
  }
  return excerpt.toLocaleLowerCase('pt-BR').includes(String(value).trim().toLocaleLowerCase('pt-BR'));
}

module.exports = {
  MAX_EXCERPT_CHARS,
  buildCompactEvidence,
  compactRelevantExcerpt,
  evidenceContainsValue,
  htmlToText,
  pageTypeFromUrl,
};
