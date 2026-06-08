'use strict';

const { normalizeDomain, normalizeUrl } = require('./email.extractor');

const CONTACT_PATHS = [
  '/',
  '/contato',
  '/contatos',
  '/fale-conosco',
  '/faleconosco',
  '/contact',
  '/contacts',
  '/sobre',
  '/quem-somos',
  '/quem_somos',
  '/empresa',
  '/a-clinica',
  '/clinica',
  '/atendimento',
  '/atendimentos',
  '/servicos',
  '/serviços',
  '/especialidades',
  '/unidades',
  '/localizacao',
  '/localização',
  '/enderecos',
  '/endereços',
  '/agendamento',
  '/agendar',
  '/marcar-consulta',
  '/orcamento',
  '/orçamento',
  '/equipe',
  '/profissionais',
  '/convenios',
  '/convênios',
  '/sitemap.xml',
];

function buildContactUrls(website) {
  const baseUrl = normalizeUrl(website);
  if (!baseUrl) return [];
  const parsed = new URL(baseUrl);
  const origin = parsed.origin;
  return Array.from(new Set(CONTACT_PATHS.map((path) => `${origin}${path}`)));
}

function extractLikelyCompanyName(html, fallback = '') {
  const title = String(html || '').match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '';
  const h1 = String(html || '').match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1] || '';
  return String(h1 || title || fallback || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*[-|].*$/, '')
    .trim()
    .slice(0, 180);
}

function extractPublicLinks(html, pageUrl) {
  const base = normalizeUrl(pageUrl);
  if (!base) return [];
  const baseDomain = normalizeDomain(base);
  const links = [];
  for (const match of String(html || '').matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const href = String(match[1] || '').trim();
    if (!href || href.startsWith('#') || /^javascript:/i.test(href)) continue;
    try {
      const url = new URL(href, base);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      const domain = normalizeDomain(url.toString());
      const path = url.pathname.toLowerCase();
      const isSameDomain = domain === baseDomain;
      const isSocial = /(^|\.)instagram\.com$|(^|\.)facebook\.com$/i.test(domain);
      const looksUseful = /contato|contact|sobre|quem-somos|atendimento|servicos|unidades|agendamento/i.test(path);
      if (isSameDomain && looksUseful) links.push(url.toString());
      if (isSocial) links.push(url.toString());
    } catch {
      // Ignore malformed links from public pages.
    }
  }
  for (const match of String(html || '').matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)) {
    const href = String(match[1] || '').trim();
    if (!href) continue;
    try {
      const url = new URL(href, base);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      const domain = normalizeDomain(url.toString());
      const path = url.pathname.toLowerCase();
      const isSameDomain = domain === baseDomain;
      const looksUseful = /contato|contact|sobre|quem-somos|atendimento|servicos|serviços|unidades|agendamento|agenda|localizacao|localização|orcamento|orçamento|equipe|profissionais|convenios|convênios/i.test(path);
      if (isSameDomain && looksUseful) links.push(url.toString());
    } catch {
      // Ignore malformed sitemap entries.
    }
  }
  return Array.from(new Set(links));
}

function extractSocialUrls(html, pageUrl) {
  return extractPublicLinks(html, pageUrl).filter((url) => /instagram\.com|facebook\.com/i.test(url));
}

module.exports = {
  CONTACT_PATHS,
  buildContactUrls,
  extractLikelyCompanyName,
  extractPublicLinks,
  extractSocialUrls,
};
