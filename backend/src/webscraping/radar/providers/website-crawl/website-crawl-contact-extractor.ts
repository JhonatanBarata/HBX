import { extractLinksFromHtml } from './website-crawl-link-extractor';
import type { WebsiteCrawlExtractedFields } from './website-crawl-types';

function onlyDigits(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function decodeBasicEntities(value: string) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#64;/g, '@')
    .replace(/&#x40;/gi, '@')
    .replace(/&commat;/gi, '@');
}

function stripHtml(html: string) {
  return decodeBasicEntities(String(html || ''))
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|section|article|address)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();
}

function normalizeSocialUrl(raw: string, host: 'instagram.com' | 'facebook.com') {
  try {
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (!hostname.endsWith(host)) return null;
    parsed.hash = '';
    parsed.search = '';
    const pathname = parsed.pathname.replace(/\/+$/, '');
    if (!pathname || ['/share', '/sharer.php', '/plugins'].some((prefix) => pathname.startsWith(prefix))) return null;
    return `${parsed.protocol}//${parsed.hostname}${pathname}`;
  } catch {
    return null;
  }
}

function extractProbableAddress(text: string) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => (
    /\b(rua|avenida|av\.|alameda|rodovia|travessa|estrada|praca|r\.)\b/i.test(line)
    && /\d{1,5}/.test(line)
    && line.length <= 180
  )) || null;
}

function hasContactForm(html: string) {
  return /<form\b/i.test(html) && /(?:contato|mensagem|telefone|email|e-mail|nome|submit|enviar)/i.test(html);
}

function extractFormActions(html: string, pageUrl: string) {
  const actions = new Set<string>();
  const pattern = /<form\b[^>]*\baction\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html || ''))) {
    try {
      actions.add(new URL(match[1], pageUrl).toString().replace(/\/+$/, ''));
    } catch {
      // Ignore malformed form actions; website intelligence is best-effort.
    }
  }
  return Array.from(actions);
}

function hasChatWidget(html: string, links: string[]) {
  return /(?:tawk\.to|jivochat|crisp\.chat|intercom|zendesk|hubspot|rdstation|whatsapp\.com\/send|wa\.me)/i.test(html)
    || links.some((link) => /(?:chat|atendimento|whatsapp|wa\.me|api\.whatsapp\.com)/i.test(link));
}

function fixedPhoneOnly(phoneDigits: string[], whatsappPhoneDigits: string[]) {
  if (!phoneDigits.length || whatsappPhoneDigits.length) return false;
  return phoneDigits.every((digits) => {
    const normalized = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
    return normalized.length === 10 || (normalized.length === 11 && Number(normalized[2] || '0') < 6);
  });
}

export class WebsiteCrawlContactExtractor {
  extract(html: string, pageUrl: string): WebsiteCrawlExtractedFields {
    const decoded = decodeBasicEntities(html || '');
    const text = stripHtml(decoded);
    const links = extractLinksFromHtml(decoded, pageUrl);
    const formActions = extractFormActions(decoded, pageUrl);
    const emails = unique([
      ...Array.from(decoded.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)).map((match) => match[0].toLowerCase()),
      ...links.filter((link) => /^mailto:/i.test(link)).map((link) => link.replace(/^mailto:/i, '').split('?')[0].toLowerCase()),
    ]);
    const phoneMatches = Array.from(text.matchAll(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-.\s]?\d{4}/g)).map((match) => match[0]);
    const telLinks = links.filter((link) => /^tel:/i.test(link)).map((link) => link.replace(/^tel:/i, ''));
    const whatsappUrls = links.filter((link) => /(?:wa\.me|api\.whatsapp\.com|web\.whatsapp\.com|whatsapp\.com\/send)/i.test(link));
    const whatsappPhoneDigits = unique(whatsappUrls.map((link) => {
      const direct = link.match(/wa\.me\/(\d{10,15})/i)?.[1];
      if (direct) return direct;
      try {
        return onlyDigits(new URL(link).searchParams.get('phone'));
      } catch {
        return '';
      }
    })).filter((digits) => digits.length >= 10);
    const phones = unique([...phoneMatches, ...telLinks]);
    const phoneDigits = unique([...phones.map(onlyDigits), ...whatsappPhoneDigits]).filter((digits) => digits.length >= 10);
    const instagramUrls = unique([
      ...links.map((link) => normalizeSocialUrl(link, 'instagram.com')),
      ...Array.from(decoded.matchAll(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/[A-Za-z0-9._-]+/gi)).map((match) => normalizeSocialUrl(match[0], 'instagram.com')),
    ]);
    const facebookUrls = unique([
      ...links.map((link) => normalizeSocialUrl(link, 'facebook.com')),
      ...Array.from(decoded.matchAll(/(?:https?:\/\/)?(?:www\.)?facebook\.com\/[A-Za-z0-9._-]+/gi)).map((match) => normalizeSocialUrl(match[0], 'facebook.com')),
    ]);
    const cnpjs = unique(Array.from(text.matchAll(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g)).map((match) => match[0]));
    const contactLinks = unique(links.filter((link) => (
      /^mailto:|^tel:/i.test(link)
      || /(?:contato|atendimento|whatsapp|instagram|facebook|wa\.me)/i.test(link)
    )));
    const formLinks = unique([...formActions, ...links.filter((link) => /(?:contato|fale-conosco|fale_conosco|atendimento|mensagem)/i.test(link))]);
    const budgetLinks = unique(links.filter((link) => /(?:orcamento|orçamento|cotacao|cotação|pedido|reserve|agendar|agenda|booking)/i.test(link)));
    const chatLinks = unique(links.filter((link) => /(?:chat|atendimento|whatsapp|wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)/i.test(link)));
    const contactForm = hasContactForm(decoded);
    const budgetIntent = budgetLinks.length > 0 || /(?:orcamento|orçamento|cotacao|cotação|solicite|agende|agendar|reserve|pedido)/i.test(text);
    const chatWidget = hasChatWidget(decoded, links);
    const opportunitySignals = unique([
      !whatsappUrls.length && !chatWidget ? 'site_sem_whatsapp_claro' : '',
      !contactForm ? 'site_sem_formulario' : 'site_com_formulario',
      budgetIntent ? 'site_com_link_orcamento' : '',
      chatWidget ? 'site_com_chat_atendimento' : '',
      fixedPhoneOnly(phoneDigits, whatsappPhoneDigits) ? 'telefone_fixo_sem_canal_digital' : '',
      (instagramUrls.length || facebookUrls.length) && !whatsappUrls.length && !chatWidget ? 'social_sem_link_atendimento' : '',
    ]);
    const siteIssues = unique([
      !whatsappUrls.length && !chatWidget ? 'whatsapp_nao_encontrado_no_site' : '',
      !contactForm ? 'formulario_nao_detectado' : '',
      fixedPhoneOnly(phoneDigits, whatsappPhoneDigits) ? 'apenas_telefone_fixo_detectado' : '',
    ]);
    return {
      phones,
      phoneDigits,
      whatsappUrls,
      whatsappPhoneDigits,
      instagramUrls,
      facebookUrls,
      emails,
      cnpjs,
      address: extractProbableAddress(text),
      contactLinks,
      formLinks,
      budgetLinks,
      chatLinks,
      hasContactForm: contactForm,
      hasBudgetIntent: budgetIntent,
      hasChatWidget: chatWidget,
      opportunitySignals,
      siteIssues,
    };
  }
}
