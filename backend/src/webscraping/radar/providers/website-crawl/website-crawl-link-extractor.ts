const REJECTED_HOST_PATTERNS = [
  /(^|\.)instagram\.com$/i,
  /(^|\.)facebook\.com$/i,
  /(^|\.)fb\.com$/i,
  /(^|\.)whatsapp\.com$/i,
  /(^|\.)wa\.me$/i,
  /(^|\.)google\./i,
  /(^|\.)goo\.gl$/i,
  /(^|\.)g\.co$/i,
  /(^|\.)linktr\.ee$/i,
  /(^|\.)bio\.link$/i,
  /(^|\.)ifood\.com\.br$/i,
  /(^|\.)tripadvisor\./i,
  /(^|\.)apontador\.com\.br$/i,
  /(^|\.)guiamais\.com\.br$/i,
  /(^|\.)telelistas\.net$/i,
  /(^|\.)olx\.com\.br$/i,
  /(^|\.)mercadolivre\.com\.br$/i,
  /(^|\.)getninjas\.com\.br$/i,
  /(^|\.)doctoralia\.com\.br$/i,
  /(^|\.)jusbrasil\.com\.br$/i,
];

const ASSET_EXTENSIONS = /\.(pdf|png|jpe?g|gif|webp|svg|ico|css|js|zip|rar|mp4|mp3|avi|mov|docx?|xlsx?|pptx?)(\?|#|$)/i;

export const WEBSITE_CRAWL_LIGHT_PATHS = [
  '/',
  '/contato',
  '/sobre',
  '/atendimento',
  '/unidades',
  '/links',
];

export function normalizeWebsiteUrl(raw: unknown): { url: string | null; reason?: string } {
  const value = String(raw || '').trim();
  if (!value) return { url: null, reason: 'website_vazio' };
  if (/^(mailto|tel|javascript):/i.test(value)) return { url: null, reason: 'url_nao_http' };
  try {
    const parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    parsed.hash = '';
    if (!['http:', 'https:'].includes(parsed.protocol)) return { url: null, reason: 'protocolo_invalido' };
    if (isRejectedWebsiteHost(parsed.hostname)) return { url: null, reason: 'host_generico_ou_rede_social' };
    return { url: parsed.toString().replace(/\/+$/, '/') };
  } catch {
    return { url: null, reason: 'url_invalida' };
  }
}

export function isRejectedWebsiteHost(hostname: unknown) {
  const host = String(hostname || '').trim().toLowerCase().replace(/^www\./, '');
  if (!host || !host.includes('.')) return true;
  return REJECTED_HOST_PATTERNS.some((pattern) => pattern.test(host));
}

export function isOfficialWebsiteUrl(raw: unknown) {
  return Boolean(normalizeWebsiteUrl(raw).url);
}

export function buildLightCrawlUrls(baseUrl: string, paths = WEBSITE_CRAWL_LIGHT_PATHS) {
  const base = new URL(baseUrl);
  const urls = new Set<string>();
  for (const path of paths) {
    const next = new URL(path || '/', `${base.protocol}//${base.host}`);
    next.hash = '';
    if (next.hostname !== base.hostname) continue;
    if (ASSET_EXTENSIONS.test(next.pathname)) continue;
    urls.add(next.toString());
  }
  return Array.from(urls);
}

export function extractLinksFromHtml(html: string, baseUrl: string) {
  const links = new Set<string>();
  const anchorPattern = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(html || ''))) {
    const href = String(match[1] || '').trim();
    if (!href || /^(javascript|data):/i.test(href)) continue;
    try {
      const parsed = /^(mailto|tel):/i.test(href) ? null : new URL(href, baseUrl);
      links.add(parsed ? parsed.toString().replace(/\/+$/, '') : href);
    } catch {
      // Ignore malformed links; link extraction is enrichment only.
    }
  }
  return Array.from(links);
}
