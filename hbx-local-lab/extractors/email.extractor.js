'use strict';

const BAD_EMAIL_LOCAL_PARTS = new Set([
  'asset',
  'assets',
  'email',
  'example',
  'favicon',
  'icon',
  'image',
  'img',
  'logo',
  'sprite',
  'test',
  'teste',
  'user',
  'usuario',
]);

const BAD_EMAIL_DOMAINS = new Set([
  'bit.ly',
  'econodata.com.br',
  'example.com',
  'example.com.br',
  'facebook.com',
  'fb.com',
  'google.com',
  'instagram.com',
  'linktr.ee',
  'maps.app.goo.gl',
  'restaurantguru.com',
  'restaurantguru.com.br',
  'solutudo.com.br',
  'test.com',
  'teste.com',
  'wa.me',
  'whatsapp.com',
]);

const BAD_EMAIL_TLDS = new Set(['css', 'gif', 'jpeg', 'jpg', 'js', 'png', 'svg', 'webp']);

function compactText(value, maxLength = 1000) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function normalizeDomain(value) {
  const raw = compactText(value, 1000).toLowerCase();
  if (!raw) return '';
  const email = raw.match(/[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})/i);
  if (email && email[1]) return email[1].replace(/^www\./, '');
  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//i, '').replace(/^www\./, '').split('/')[0].toLowerCase();
  }
}

function normalizeUrl(value) {
  const raw = compactText(value, 2000);
  if (!raw) return '';
  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    parsed.username = '';
    parsed.password = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function normalizePhoneDigits(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length > 11) digits = digits.slice(2);
  return digits;
}

function deobfuscateText(value) {
  return String(value || '')
    .replace(/\s*(?:\[|\()\s*at\s*(?:\]|\))\s*/gi, '@')
    .replace(/\s+(?:at|arroba)\s+/gi, '@')
    .replace(/\s*(?:\[|\()\s*dot\s*(?:\]|\))\s*/gi, '.')
    .replace(/\s+(?:dot|ponto)\s+/gi, '.');
}

function normalizeEmail(value) {
  const raw = deobfuscateText(value).trim().toLowerCase();
  const match = raw.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  if (!match) return '';
  const email = match[0].toLowerCase();
  const [local, domain] = email.split('@');
  const tld = String(domain || '').split('.').pop() || '';
  if (!local || !domain) return '';
  if (BAD_EMAIL_LOCAL_PARTS.has(local)) return '';
  if (BAD_EMAIL_DOMAINS.has(domain)) return '';
  if (BAD_EMAIL_TLDS.has(tld)) return '';
  return email;
}

function isBlockedEmail(value) {
  const raw = deobfuscateText(value).trim().toLowerCase();
  const match = raw.match(/[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})/i);
  if (!match) return false;
  const email = match[0].toLowerCase();
  const [local, domain] = email.split('@');
  const tld = String(domain || '').split('.').pop() || '';
  return BAD_EMAIL_LOCAL_PARTS.has(local) || BAD_EMAIL_DOMAINS.has(domain) || BAD_EMAIL_TLDS.has(tld);
}

// --- CNPJ no HTML (rodapé/contato dos sites brasileiros) -------------------
// Valida os 2 dígitos verificadores pra não capturar qualquer sequência de 14 números.
function isValidCnpj(digits) {
  const d = String(digits || '').replace(/\D/g, '');
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false; // todos iguais
  const calc = (len) => {
    let sum = 0;
    let pos = len - 7;
    for (let i = len; i >= 1; i -= 1) {
      sum += Number(d[len - i]) * pos;
      pos -= 1;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

// Devolve o 1º CNPJ válido achado no texto (14 dígitos, formatado ou não), ou null.
function extractCnpjFromText(text) {
  const raw = String(text || '');
  const matches = raw.matchAll(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g);
  for (const match of matches) {
    const digits = match[0].replace(/\D/g, '');
    if (isValidCnpj(digits)) return digits;
  }
  return null;
}

// --- Telefones no HTML (BR) ------------------------------------------------
// Acha telefones fixos/celulares brasileiros no texto, devolve só dígitos (DDD+numero),
// dedup e no máximo `max`. Ignora sequências curtas/longas demais (CEP, CNPJ, etc.).
function extractPhonesFromText(text, max = 6) {
  const raw = String(text || '');
  const out = [];
  const seen = new Set();
  // tel: links (mais confiáveis) + padrão visual (xx) xxxxx-xxxx
  const telLinks = [...raw.matchAll(/tel:\+?(\d[\d\s().-]{8,16}\d)/gi)].map((m) => m[1]);
  const visual = [...raw.matchAll(/\(?\b\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g)].map((m) => m[0]);
  for (const candidate of [...telLinks, ...visual]) {
    const digits = normalizePhoneDigits(candidate);
    if (digits.length !== 10 && digits.length !== 11) continue;       // fixo(10) ou celular(11)
    if (/^(\d)\1+$/.test(digits)) continue;                            // 0000000000 etc.
    if (digits[2] === '0' && digits.length === 11) continue;          // celular não começa com 0
    if (seen.has(digits)) continue;
    seen.add(digits);
    out.push(digits);
    if (out.length >= max) break;
  }
  return out;
}

function extractEmailsFromText(text, context = {}) {
  const sourceUrl = normalizeUrl(context.sourceUrl);
  const provider = compactText(context.provider || 'site_crawl', 120);
  const websiteDomain = normalizeDomain(context.website || sourceUrl);
  const decoded = deobfuscateText(text);
  const rawMatches = new Set();
  const mailtoMatches = [...String(text || '').matchAll(/mailto:([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi)];
  mailtoMatches.forEach((match) => rawMatches.add(match[1]));
  [...decoded.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)].forEach((match) => rawMatches.add(match[0]));

  return Array.from(rawMatches)
    .map((rawEmail) => {
      const email = normalizeEmail(rawEmail);
      if (!email || !sourceUrl) return null;
      const domain = normalizeDomain(email);
      const officialDomainMatch = websiteDomain && domain === websiteDomain;
      const mailto = mailtoMatches.some((match) => String(match[1] || '').toLowerCase() === email);
      const status = mailto || officialDomainMatch ? 'public_found' : 'probable';
      const confidence = mailto ? 95 : officialDomainMatch ? 88 : 55;
      return {
        externalId: `email:${email}`,
        email,
        domain,
        companyName: compactText(context.companyName || '', 300) || null,
        website: normalizeUrl(context.website) || null,
        sourceUrl,
        confidence,
        status,
        provider,
        sourceMode: 'local_lab',
        evidence: {
          method: mailto ? 'mailto' : 'html_text',
          officialDomainMatch: Boolean(officialDomainMatch),
          sourceUrl,
        },
      };
    })
    .filter(Boolean);
}

module.exports = {
  BAD_EMAIL_DOMAINS,
  compactText,
  deobfuscateText,
  extractCnpjFromText,
  extractEmailsFromText,
  extractPhonesFromText,
  isBlockedEmail,
  isValidCnpj,
  normalizeDomain,
  normalizeEmail,
  normalizePhoneDigits,
  normalizeUrl,
};
