export const RADAR_SOCIAL_BLOCKED_PATH_PARTS = new Set([
  'accounts',
  'events',
  'explore',
  'hashtag',
  'hashtags',
  'login',
  'pages',
  'posts',
  'photos',
  'search',
  'share',
  'tag',
  'tags',
  'videos',
  'groups',
  'reel',
  'reels',
  'p',
  'stories',
]);

export const RADAR_SOCIAL_CATEGORY_TOKENS = new Set([
  'auto',
  'bar',
  'bares',
  'barbearia',
  'beleza',
  'borracharia',
  'calcado',
  'calcados',
  'center',
  'choperia',
  'clinica',
  'confeccao',
  'confeccoes',
  'confeitaria',
  'delivery',
  'doceria',
  'esmalteria',
  'esfiharia',
  'esfiharias',
  'estetica',
  'gastronomia',
  'hamburgueria',
  'imob',
  'imobiliaria',
  'imobiliarias',
  'imovel',
  'imoveis',
  'lanches',
  'lancheria',
  'lancherias',
  'lanchonete',
  'lanchonetes',
  'loja',
  'marmitaria',
  'mecanica',
  'oficina',
  'padaria',
  'pneu',
  'pneus',
  'pizzaria',
  'pizza',
  'pizzas',
  'restaurante',
  'restaurantes',
  'rotisserie',
  'salao',
  'sobrancelha',
  'studio',
  'trattoria',
  'trattorias',
]);

export const RADAR_SOCIAL_STOP_TOKENS = new Set([
  'cia',
  'comercio',
  'comercial',
  'companhia',
  'das',
  'de',
  'do',
  'dos',
  'eireli',
  'ltda',
  'moraes',
]);

export const RADAR_SOCIAL_WEAK_TOKENS = new Set([
  'absolute',
  'bella',
  'belle',
  'bello',
  'bem',
  'casa',
  'casas',
  'central',
  'centro',
  'class',
  'clinic',
  'estilo',
  'express',
  'ideal',
  'mais',
  'max',
  'mega',
  'nova',
  'novo',
  'oficial',
  'popular',
  'prime',
  'real',
  'top',
  'vip',
]);

export const RADAR_WEBSITE_GENERIC_HOST_TOKENS = new Set([
  ...Array.from(RADAR_SOCIAL_CATEGORY_TOKENS),
  'animal',
  'animais',
  'medica',
  'medicas',
  'medico',
  'medicos',
  'odontologica',
  'odontologicas',
  'odontologico',
  'odontologicos',
  'pet',
  'pets',
  'vet',
  'veterinaria',
  'veterinarias',
  'veterinario',
  'veterinarios',
]);

const RADAR_THIRD_PARTY_SOCIAL_PROFILE_HINTS = [
  'editoramanole',
  'fresha',
  'guiatemdigital',
  'oficialmanole',
  'petdiretorio',
  'qconcursos',
  'setorenergetico',
  'socorroauto',
];

export function normalizeLookupValue(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeSocialProfileKey(value: string | null | undefined) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return normalizeLookupValue(`${parsed.hostname} ${parsed.pathname}`).replace(/[^a-z0-9]+/g, ' ');
  } catch {
    return normalizeLookupValue(raw).replace(/[^a-z0-9]+/g, ' ');
  }
}

export function looksLikeThirdPartySocialProfile(value: string | null | undefined) {
  const key = normalizeSocialProfileKey(value);
  if (!key) return false;
  return RADAR_THIRD_PARTY_SOCIAL_PROFILE_HINTS.some((hint) => key.includes(normalizeLookupValue(hint)));
}

export function socialHandleFromUrl(value: string | null | undefined) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.some((part) => RADAR_SOCIAL_BLOCKED_PATH_PARTS.has(normalizeLookupValue(part)))) return '';
    return normalizeLookupValue(parts[0] || '').replace(/[^a-z0-9]+/g, '');
  } catch {
    return normalizeLookupValue(raw).replace(/[^a-z0-9]+/g, '');
  }
}

export function socialTokenVariants(token: string) {
  const normalized = normalizeLookupValue(token).replace(/[^a-z0-9]+/g, '');
  if (!normalized) return [];
  const variants = new Set([normalized]);
  if (normalized.length >= 5 && normalized.endsWith('s')) variants.add(normalized.slice(0, -1));
  return Array.from(variants);
}

export function socialCategoryTokenVariants(token: string) {
  const variants = new Set(socialTokenVariants(token));
  if (token === 'pizzaria' || token === 'pizzarias') {
    variants.add('pizza');
    variants.add('pizzas');
  }
  if (token === 'lanchonete' || token === 'lanchonetes') variants.add('lanches');
  if (token === 'restaurante' || token === 'restaurantes') {
    variants.add('restaurante');
    variants.add('restaurantes');
  }
  if (['imob', 'imobiliaria', 'imobiliarias', 'imovel', 'imoveis'].includes(token)) {
    ['imob', 'imobiliaria', 'imobiliarias', 'imovel', 'imoveis'].forEach((variant) => variants.add(variant));
  }
  return Array.from(variants);
}

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function safeInteger(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

export function hasTrustedEngineSocialSignal(row: any) {
  const sourceKey = normalizeLookupValue([
    row?.source,
    row?.sourceEngine,
    ...(Array.isArray(row?.sourceEngines) ? row.sourceEngines : parseJsonArray(row?.sourceEngines)),
  ].filter(Boolean).join(' '));
  const socialStatus = normalizeLookupValue(row?.socialStatus || row?.signals?.socialStatus);
  const socialConfidence = safeInteger(row?.socialConfidence ?? row?.signals?.socialConfidence);

  return Boolean(
    (sourceKey.includes('hbx') || sourceKey.includes('scraping'))
    && ['found', 'confirmed'].includes(socialStatus)
    && socialConfidence >= 70
  );
}

export function socialProfileLooksCompatibleWithLead(row: any, value: string | null | undefined) {
  const handle = socialHandleFromUrl(value);
  if (!handle) return false;
  if (hasTrustedEngineSocialSignal(row)) return true;
  const name = normalizeLookupValue(row?.name || row?.companyName || '');
  const tokens = name.split(/\s+/).filter((token) => token.length >= 3 && !RADAR_SOCIAL_STOP_TOKENS.has(token));
  const categoryTokens = tokens.filter((token) => RADAR_SOCIAL_CATEGORY_TOKENS.has(token));
  const strongTokens = tokens.filter((token) => (
    token.length >= 4
    && !RADAR_SOCIAL_CATEGORY_TOKENS.has(token)
    && !RADAR_SOCIAL_WEAK_TOKENS.has(token)
  ));
  if (!strongTokens.length) return false;
  const compactName = tokens.join('');
  if (compactName.length >= 8 && compactName.length <= 36 && (handle.includes(compactName) || compactName.includes(handle))) return true;
  const strongVariants = Array.from(new Set(strongTokens.flatMap((token) => socialTokenVariants(token))));
  const categoryVariants = Array.from(new Set(categoryTokens.flatMap((token) => socialCategoryTokenVariants(token))));
  for (const category of categoryVariants) {
    for (const token of strongVariants) {
      const a = `${category}${token}`;
      const b = `${token}${category}`;
      if ((a.length >= 6 && handle.includes(a)) || (b.length >= 6 && handle.includes(b))) return true;
      if (handle.includes(category) && handle.includes(token)) return true;
    }
  }
  const strongHits = strongTokens.filter((token) => socialTokenVariants(token).some((variant) => variant.length >= 5 && handle.includes(variant)));
  if (strongHits.length >= 2) return true;
  const initials = cityInitialsKey(row?.city);
  if (initials && strongHits.some((token) => token.length >= 6) && handle.endsWith(initials)) return true;
  return false;
}

export function cityInitialsKey(value: string | null | undefined) {
  const tokens = normalizeLookupValue(value).split(/\s+/).filter((token) => token.length >= 3);
  return tokens.length >= 2 ? tokens.map((token) => token[0]).join('') : '';
}

export function radarSocialLookupNameScore(lead: any, result: any, url: string) {
  const handle = socialHandleFromUrl(url);
  if (!handle) return 0;
  const leadName = normalizeLookupValue(String(lead?.name || ''));
  const resultText = normalizeLookupValue([
    result?.name,
    result?.title,
    result?.description,
    result?.snippet,
    result?.address,
    result?.city,
    result?.state,
    result?.sourceUrl,
    result?.website,
  ].filter(Boolean).join(' '));
  const tokens = leadName.split(/\s+/).filter((token) => token && !RADAR_SOCIAL_STOP_TOKENS.has(token));
  const compactName = tokens.join('').replace(/[^a-z0-9]+/g, '');
  const strongTokens = tokens.filter((token) => token.length >= 3 && !RADAR_SOCIAL_CATEGORY_TOKENS.has(token));
  const leadCityCompact = normalizeLookupValue(String(lead?.city || '')).replace(/[^a-z0-9]+/g, '');
  let score = 0;
  if (socialProfileLooksCompatibleWithLead(lead, url)) score = Math.max(score, 65);
  if (compactName.length >= 6 && (handle.includes(compactName) || compactName.includes(handle))) score = Math.max(score, 55);
  if (leadName.length >= 6 && resultText.includes(leadName)) score = Math.max(score, 48);
  const strongHits = strongTokens.filter((token) => socialTokenVariants(token).some((variant) => variant.length >= 3 && handle.includes(variant)));
  if (strongHits.length >= 2) score = Math.max(score, 55);
  if (strongHits.length === 1 && leadCityCompact.length >= 5 && handle.includes(leadCityCompact)) score = Math.max(score, 58);
  if (strongHits.length === 1) score = Math.max(score, 38);
  const categoryHits = tokens.filter((token) => RADAR_SOCIAL_CATEGORY_TOKENS.has(token) && handle.includes(token));
  if (categoryHits.length && strongHits.length) score = Math.max(score, 58);
  return score;
}

export function evaluateRadarSocialLookupCandidate(
  lead: any,
  result: any,
  url: string | null,
  network: 'instagram' | 'facebook',
  normalizeRadarSocialUrl: (value: unknown, network: 'instagram' | 'facebook') => string | null,
) {
  const normalizedUrl = normalizeRadarSocialUrl(url, network);
  if (!normalizedUrl) return { accepted: false, confidence: 0, reason: 'url_social_invalida', url: null as string | null };
  if (looksLikeThirdPartySocialProfile(normalizedUrl)) {
    return { accepted: false, confidence: 0, reason: 'perfil_terceiro', url: null as string | null };
  }
  const handle = socialHandleFromUrl(normalizedUrl);
  if (!handle || ['instagram', 'facebook', 'login', 'accounts', 'explore', 'tags', 'search', 'pages'].includes(handle)) {
    return { accepted: false, confidence: 0, reason: 'pagina_generica', url: null as string | null };
  }
  const leadCity = normalizeLookupValue(String(lead?.city || ''));
  const leadState = String(lead?.state || '').trim().toUpperCase();
  const resultCity = normalizeLookupValue(String(result?.city || ''));
  const resultState = String(result?.state || '').trim().toUpperCase();
  if (leadCity && resultCity && resultCity !== leadCity) {
    return { accepted: false, confidence: 0, reason: 'cidade_incompativel', url: null as string | null };
  }
  if (leadState && resultState && resultState !== leadState) {
    return { accepted: false, confidence: 0, reason: 'uf_incompativel', url: null as string | null };
  }
  const evidenceText = normalizeLookupValue([
    result?.name,
    result?.title,
    result?.description,
    result?.snippet,
    result?.address,
    result?.city,
    result?.state,
    result?.sourceUrl,
    result?.website,
    normalizedUrl,
  ].filter(Boolean).join(' '));
  const nameScore = radarSocialLookupNameScore(lead, result, normalizedUrl);
  if (nameScore < 38) {
    return { accepted: false, confidence: nameScore, reason: 'nome_pouco_parecido', url: normalizedUrl };
  }
  let confidence = nameScore;
  const leadCityCompact = leadCity.replace(/[^a-z0-9]+/g, '');
  const evidenceCompact = evidenceText.replace(/[^a-z0-9]+/g, '');
  if (leadCity && (evidenceText.includes(leadCity) || (leadCityCompact.length >= 5 && evidenceCompact.includes(leadCityCompact)))) confidence += 20;
  if (leadState && evidenceText.includes(normalizeLookupValue(leadState))) confidence += 5;
  if (String(result?.source || '').includes('social')) confidence += 5;
  confidence = Math.max(0, Math.min(100, confidence));
  return {
    accepted: confidence >= 70,
    confidence,
    reason: confidence >= 70 ? 'perfil_compativel' : 'confianca_baixa',
    url: normalizedUrl,
  };
}
