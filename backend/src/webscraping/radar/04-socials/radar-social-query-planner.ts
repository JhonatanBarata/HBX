import {
  RADAR_SOCIAL_CATEGORY_TOKENS,
  RADAR_SOCIAL_STOP_TOKENS,
  RADAR_SOCIAL_WEAK_TOKENS,
  RADAR_WEBSITE_GENERIC_HOST_TOKENS,
  normalizeLookupValue,
} from './radar-social-matching';
import type { RadarSocialLookupQuery, RadarSocialNetwork } from './radar-social-types';

function quote(value: unknown) {
  const safe = String(value || '').replace(/"/g, '').replace(/\s+/g, ' ').trim();
  return safe ? `"${safe}"` : '';
}

function compact(value: unknown) {
  return normalizeLookupValue(String(value || '')).replace(/[^a-z0-9]+/g, '');
}

function normalizePhoneDigits(raw: unknown) {
  return String(raw || '').replace(/\D/g, '');
}

function formatPhoneDigits(digits: string) {
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}

function extractDomain(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return parsed.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function brandTokens(name: string) {
  return normalizeLookupValue(name)
    .split(/\s+/)
    .filter((token) => (
      token.length >= 3
      && !RADAR_SOCIAL_STOP_TOKENS.has(token)
      && !RADAR_SOCIAL_CATEGORY_TOKENS.has(token)
      && !RADAR_SOCIAL_WEAK_TOKENS.has(token)
      && !RADAR_WEBSITE_GENERIC_HOST_TOKENS.has(token)
    ));
}

function probableHandles(name: string, city: string, state: string, segment: string) {
  const tokens = brandTokens(name).slice(0, 3);
  const base = tokens.join('');
  if (!base) return [];
  const cityKey = compact(city);
  const stateKey = compact(state);
  const segmentToken = normalizeLookupValue(segment)
    .split(/\s+/)
    .find((token) => RADAR_SOCIAL_CATEGORY_TOKENS.has(token) || token.length >= 5);
  return Array.from(new Set([
    base,
    cityKey ? `${base}${cityKey}` : '',
    stateKey ? `${base}${stateKey}` : '',
    segmentToken ? `${base}${compact(segmentToken)}` : '',
  ].filter(Boolean)));
}

export class RadarSocialQueryPlanner {
  plan(lead: any): RadarSocialLookupQuery[] {
    const name = String(lead?.name || lead?.companyName || '').replace(/"/g, '').replace(/\s+/g, ' ').trim();
    const legalName = String(lead?.legalName || lead?.razaoSocial || lead?.companyLegalName || '').replace(/"/g, '').replace(/\s+/g, ' ').trim();
    const city = String(lead?.city || '').replace(/"/g, '').replace(/\s+/g, ' ').trim();
    const state = String(lead?.state || '').replace(/"/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
    const segment = String(lead?.segment || lead?.businessCategory || '').replace(/"/g, '').replace(/\s+/g, ' ').trim();
    const address = String(lead?.address || '').replace(/"/g, '').replace(/\s+/g, ' ').trim();
    const digits = normalizePhoneDigits(lead?.phoneDigits || lead?.phone);
    const maskedPhone = formatPhoneDigits(digits);
    const domain = extractDomain(lead?.website);
    const brand = brandTokens(name)[0] || '';
    const brandName = brand
      ? name.split(/\s+/).find((part) => normalizeLookupValue(part) === brand) || brand
      : name;
    const baseNames = Array.from(new Set([brandName, name].filter(Boolean)));
    const networks: RadarSocialNetwork[] = ['instagram', 'facebook'];
    const queries: RadarSocialLookupQuery[] = [];

    for (const safeName of baseNames) {
      for (const network of networks) {
        if (safeName && city) queries.push({ network, layer: 'brand_city', query: `${quote(safeName)} ${quote(city)} ${network}` });
      }
    }
    if (legalName && city && normalizeLookupValue(legalName) !== normalizeLookupValue(name)) {
      for (const network of networks) queries.push({ network, layer: 'legal_name_city', query: `${quote(legalName)} ${quote(city)} ${network}` });
    }
    if (digits.length >= 10) {
      for (const network of networks) {
        queries.push({ network, layer: 'phone_masked', query: `${quote(maskedPhone)} ${network}` });
        queries.push({ network, layer: 'phone_digits', query: `${quote(digits)} ${network}` });
      }
    }
    if (domain) {
      for (const network of networks) queries.push({ network, layer: 'domain', query: `${quote(domain)} ${network}` });
    }
    for (const safeName of baseNames) {
      if (!safeName || !city) continue;
      queries.push({ network: 'instagram', layer: 'site_operator', query: `site:instagram.com ${quote(safeName)} ${quote(city)}` });
      queries.push({ network: 'facebook', layer: 'site_operator', query: `site:facebook.com ${quote(safeName)} ${quote(city)}` });
    }
    if (name && city) {
      queries.push({ network: 'instagram', layer: 'whatsapp_intent', query: `${quote(name)} ${quote(city)} "whatsapp"` });
      queries.push({ network: 'facebook', layer: 'whatsapp_intent', query: `${quote(name)} ${quote(city)} "whatsapp"` });
    }
    if (name && address) {
      for (const network of networks) queries.push({ network, layer: 'address_city', query: `${quote(name)} ${quote(address)} ${network}` });
    }
    for (const handle of probableHandles(name, city, state, segment)) {
      for (const network of networks) queries.push({ network, layer: 'probable_handle', query: `${quote(handle)} ${network}` });
    }

    const seen = new Set<string>();
    return queries.filter((entry) => {
      const key = `${entry.network}:${normalizeLookupValue(entry.query)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return Boolean(entry.query.trim());
    }).slice(0, 40);
  }
}

export function buildRadarSocialLookupQueries(leadOrName: any, city?: string) {
  const lead = typeof leadOrName === 'object'
    ? leadOrName
    : { name: leadOrName, city };
  return new RadarSocialQueryPlanner().plan(lead);
}
