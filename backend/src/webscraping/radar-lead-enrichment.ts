import { calculateLeadQualityV2, type LeadQualityV2SalesProfile } from './lead-quality-v2';

export type RadarEmailStatus = 'confirmed' | 'probable' | 'missing' | 'invalid' | 'unverified';
export type RadarEmailSource = 'website' | 'maps' | 'inferred' | 'manual' | 'none';
export type RadarSocialStatus = 'found' | 'partial' | 'candidate_review' | 'missing' | 'weak' | 'error' | 'unknown';
export type RadarRecommendedChannel = 'whatsapp' | 'email' | 'call' | 'review' | 'discard';
export type RadarPainType =
  | 'sem_site'
  | 'site_fraco'
  | 'whatsapp_desorganizado'
  | 'alta_demanda'
  | 'pouca_presenca'
  | 'reativacao'
  | 'unknown';

export type RadarLeadEnrichmentInput = {
  id?: string | null;
  name?: string | null;
  phone?: string | null;
  phoneDigits?: string | null;
  status?: string | null;
  companyStatus?: string | null;
  negativeReason?: string | null;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  website?: string | null;
  websiteStatus?: string | null;
  email?: string | null;
  emailStatus?: string | null;
  emailSource?: string | null;
  emailConfidence?: number | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  socialStatus?: string | null;
  socialConfidence?: number | null;
  googleMapsUrl?: string | null;
  placeId?: string | null;
  sourceUrl?: string | null;
  businessCategory?: string | null;
  openingHoursStatus?: string | null;
  rating?: number | null;
  reviews?: number | null;
  opportunityScore?: number | null;
  opportunityReason?: string | null;
  whatsappStatus?: 'confirmed' | 'missing' | 'unverified' | 'invalid' | string | null;
  qualityMode?: 'list' | 'lead_plus' | string | null;
  salesProfile?: LeadQualityV2SalesProfile | null;
  rawPayload?: Record<string, any> | null;
  now?: Date;
};

export type RadarLeadEnrichmentResult = {
  email: string | null;
  emailStatus: RadarEmailStatus;
  emailSource: RadarEmailSource;
  emailConfidence: number;
  emailCandidate: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  socialStatus: RadarSocialStatus;
  socialConfidence: number;
  googleMapsUrl: string | null;
  businessCategory: string | null;
  openingHoursStatus: string | null;
  recommendedChannel: RadarRecommendedChannel;
  painType: RadarPainType;
  painLabel: string;
  painPitch: string;
  opportunityReason: string;
  enrichmentScore: number;
  enrichmentConfidence: number;
  enrichmentJson: string;
  lastEnrichedAt: Date;
  enrichmentVersion: string;
};

export const RADAR_LEAD_ENRICHMENT_VERSION = 'radar-card-v1';

const PROTECTED_STATUSES = new Set([
  'negative',
  'denied',
  'blocked',
  'opt_out',
  'optout',
  'do_not_contact',
  'complaint',
  'discarded',
  'hidden',
  'lost',
  'no_whatsapp',
  'invalid_whatsapp',
  'invalid_phone',
  'rejected',
]);

const BLOCKED_EMAIL_DOMAINS = new Set([
  'bit.ly',
  'example.com',
  'example.com.br',
  'facebook.com',
  'fb.com',
  'goo.gl',
  'google.com',
  'instagram.com',
  'linktr.ee',
  'maps.app.goo.gl',
  'test.com',
  'teste.com',
  'wa.me',
  'whatsapp.com',
  'wixsite.com',
  'dominio.com',
]);

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function normalizeKey(value: unknown) {
  return normalizeText(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeUrl(value: unknown) {
  const raw = normalizeText(value);
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw)) return `https://${raw}`;
  return raw;
}

function clampInt(value: unknown, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(Number(value || 0) || 0)));
}

function hasUsableEmail(value: unknown) {
  const email = normalizeText(value).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)) return false;
  const domain = email.split('@')[1] || '';
  return !isBlockedEmailDomain(domain);
}

function extractFirstEmail(value: unknown) {
  const text = normalizeText(typeof value === 'object' ? JSON.stringify(value) : value);
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return matches.map((match) => match.toLowerCase()).find((email) => hasUsableEmail(email)) || '';
}

function extractDomain(value: unknown) {
  const raw = normalizeText(value);
  if (!raw) return null;
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./i, '').toLowerCase() || null;
  } catch {
    const host = raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0]?.toLowerCase();
    return host && host.includes('.') ? host : null;
  }
}

function isBlockedEmailDomain(domain: string | null | undefined) {
  const normalized = normalizeText(domain).toLowerCase().replace(/^www\./i, '');
  return Boolean(normalized && Array.from(BLOCKED_EMAIL_DOMAINS).some((blocked) => normalized === blocked || normalized.endsWith(`.${blocked}`)));
}

function pickRaw(input: RadarLeadEnrichmentInput, keys: string[]) {
  const raw = input.rawPayload || {};
  for (const key of keys) {
    const value = (input as any)[key] ?? raw[key];
    if (normalizeText(value)) return normalizeText(value);
  }
  return '';
}

function pickCollectedEmail(input: RadarLeadEnrichmentInput) {
  const raw = input.rawPayload || {};
  const sources: Array<{ source: RadarEmailSource; keys: string[] }> = [
    { source: 'manual', keys: ['contactEmail', 'email', 'recipientEmail'] },
    { source: 'maps', keys: ['googleEmail', 'mapsEmail', 'googleMapsEmail', 'placeEmail'] },
    { source: 'website', keys: [
      'websiteEmail',
      'emails',
      'schema',
      'structuredData',
      'siteText',
      'websiteText',
      'html',
      'rawHtml',
      'footerText',
      'contactPageText',
      'aboutPageText',
      'contactHtml',
      'aboutHtml',
      'instagramBio',
      'facebookAbout',
    ] },
  ];
  for (const entry of sources) {
    for (const key of entry.keys) {
      const direct = entry.source === 'manual' ? raw[key] : ((input as any)[key] ?? raw[key]);
      const email = extractFirstEmail(direct);
      if (email) return { email, source: entry.source };
    }
  }
  return { email: '', source: 'none' as RadarEmailSource };
}

function normalizeWebsiteStatus(input: RadarLeadEnrichmentInput) {
  const explicit = normalizeKey(input.websiteStatus);
  if (['none', 'present', 'social_only', 'weak', 'unreachable', 'unknown'].includes(explicit)) return explicit;
  return normalizeText(input.website) ? 'present' : 'none';
}

function isProtected(input: RadarLeadEnrichmentInput) {
  return [input.companyStatus, input.status, input.negativeReason]
    .map(normalizeKey)
    .some((value) => PROTECTED_STATUSES.has(value) || value.includes('opt-out') || value.includes('bloquead') || value.includes('descart'));
}

function resolvePain(input: RadarLeadEnrichmentInput): { type: RadarPainType; label: string; pitch: string } {
  const websiteStatus = normalizeWebsiteStatus(input);
  const whatsappStatus = normalizeKey(input.whatsappStatus);
  const reviews = Number(input.reviews || 0) || 0;
  const rating = Number(input.rating || 0) || 0;

  if (websiteStatus === 'none' || !normalizeText(input.website)) {
    return {
      type: 'sem_site',
      label: 'Sem site',
      pitch: 'Boa oportunidade para organizar captação e atendimento sem depender de um site próprio.',
    };
  }
  if (websiteStatus === 'weak' || websiteStatus === 'social_only' || websiteStatus === 'unreachable') {
    return {
      type: 'site_fraco',
      label: websiteStatus === 'social_only' ? 'Presença só em rede social' : 'Site fraco',
      pitch: 'Presença digital existe, mas ainda pode virar uma fila comercial mais clara.',
    };
  }
  if (whatsappStatus === 'confirmed') {
    return {
      type: 'whatsapp_desorganizado',
      label: 'WhatsApp acionável',
      pitch: 'Contato por WhatsApp pode ser organizado por prioridade, retorno e mensagem pronta.',
    };
  }
  if (rating >= 4.2 && reviews >= 20) {
    return {
      type: 'alta_demanda',
      label: 'Alta demanda local',
      pitch: 'Boa avaliação e volume de reviews indicam demanda para abordagem comercial objetiva.',
    };
  }
  return {
    type: 'pouca_presenca',
    label: 'Presença digital básica',
    pitch: 'Card pede revisão comercial para confirmar melhor canal e próxima abordagem.',
  };
}

function resolveRecommendedChannel(input: RadarLeadEnrichmentInput, emailStatus: RadarEmailStatus): RadarRecommendedChannel {
  if (isProtected(input)) return 'discard';
  const whatsappStatus = normalizeKey(input.whatsappStatus);
  if (whatsappStatus === 'confirmed') return 'whatsapp';
  if (emailStatus === 'confirmed' || emailStatus === 'probable') return 'email';
  if (normalizeText(input.phone || input.phoneDigits) && whatsappStatus !== 'confirmed') return 'call';
  return 'review';
}

function buildReason(input: RadarLeadEnrichmentInput, data: {
  emailStatus: RadarEmailStatus;
  recommendedChannel: RadarRecommendedChannel;
  painLabel: string;
  painType: RadarPainType;
}) {
  if (data.recommendedChannel === 'discard') {
    return 'Card protegido por negativo, bloqueio, opt-out ou descarte: não deve voltar para fila de chamada.';
  }

  const signals: string[] = [];
  const whatsappStatus = normalizeKey(input.whatsappStatus);
  if (whatsappStatus === 'confirmed') signals.push('WhatsApp confirmado');
  else if (normalizeText(input.phone || input.phoneDigits)) signals.push('telefone disponível');
  if (data.emailStatus === 'confirmed') signals.push('e-mail confirmado');
  if (data.emailStatus === 'probable') signals.push('e-mail provável');
  if (normalizeText(input.instagramUrl)) signals.push('Instagram encontrado');
  if (normalizeText(input.facebookUrl)) signals.push('Facebook encontrado');
  signals.push(data.painLabel.toLowerCase());
  if (Number(input.rating || 0) >= 4.2) signals.push('boa avaliação');
  if (Number(input.reviews || 0) >= 20) signals.push('prova social');

  const action =
    data.recommendedChannel === 'whatsapp'
      ? 'boa oportunidade para abordagem sobre organização comercial pelo WhatsApp.'
      : data.recommendedChannel === 'email'
        ? 'boa oportunidade para abordagem inicial por e-mail com mensagem curta.'
        : data.recommendedChannel === 'call'
          ? 'boa oportunidade para ligação de validação antes de enviar mensagem.'
          : 'pede revisão rápida para confirmar o melhor canal.';
  return `${signals.filter(Boolean).join(' + ')}: ${action}`;
}

export function buildRadarLeadEnrichment(input: RadarLeadEnrichmentInput): RadarLeadEnrichmentResult {
  const now = input.now || new Date();
  const rawEmailStatus = normalizeKey(input.emailStatus);
  const rawEmailSource = normalizeKey(input.emailSource);
  const suppliedEmail = normalizeText(input.email || pickRaw(input, ['contactEmail', 'email', 'recipientEmail'])).toLowerCase();
  const suppliedEmailIsInferred = rawEmailSource === 'inferred' || rawEmailStatus === 'probable';
  const explicitEmail = hasUsableEmail(suppliedEmail) && !suppliedEmailIsInferred ? suppliedEmail : '';
  const collectedEmail = explicitEmail ? { email: '', source: 'none' as RadarEmailSource } : pickCollectedEmail(input);
  const domain = extractDomain(input.website);
  const emailCandidate = hasUsableEmail(explicitEmail)
    ? explicitEmail
    : hasUsableEmail(collectedEmail.email)
      ? collectedEmail.email
      : null;
  const emailStatus: RadarEmailStatus = hasUsableEmail(explicitEmail) || hasUsableEmail(collectedEmail.email)
    ? 'confirmed'
    : rawEmailStatus === 'invalid'
      ? 'invalid'
      : emailCandidate
        ? 'probable'
        : rawEmailStatus === 'unverified'
          ? 'unverified'
          : 'missing';
  const emailSource: RadarEmailSource = hasUsableEmail(explicitEmail)
    ? (normalizeKey(input.emailSource) === 'manual' ? 'manual' : 'website')
    : hasUsableEmail(collectedEmail.email)
      ? collectedEmail.source
    : emailCandidate
      ? 'inferred'
      : 'none';
  const emailConfidence = emailStatus === 'confirmed'
    ? Math.max(85, clampInt(input.emailConfidence))
    : emailStatus === 'probable'
      ? Math.max(45, clampInt(input.emailConfidence || 55))
      : 0;

  const instagramUrl = normalizeUrl(pickRaw(input, ['instagramUrl', 'instagram', 'instagram_url']));
  const facebookUrl = normalizeUrl(pickRaw(input, ['facebookUrl', 'facebook', 'facebook_url']));
  const website = normalizeUrl(input.website);
  const requestedSocialStatus = normalizeKey(input.socialStatus);
  const socialStatus: RadarSocialStatus = instagramUrl && facebookUrl
    ? 'found'
    : instagramUrl || facebookUrl
      ? requestedSocialStatus === 'found' ? 'found' : 'partial'
      : requestedSocialStatus === 'candidate_review'
        ? 'candidate_review'
        : requestedSocialStatus === 'weak'
          ? 'weak'
          : requestedSocialStatus === 'error'
            ? 'error'
            : 'missing';
  const socialConfidence = socialStatus === 'found'
    ? Math.max(80, clampInt(input.socialConfidence))
    : socialStatus === 'partial'
      ? Math.max(75, clampInt(input.socialConfidence))
      : socialStatus === 'candidate_review'
        ? Math.max(60, Math.min(74, clampInt(input.socialConfidence || 60)))
        : socialStatus === 'weak'
          ? Math.max(35, clampInt(input.socialConfidence))
          : 0;
  const googleMapsUrl = normalizeUrl(
    pickRaw(input, ['googleMapsUrl', 'mapsUrl', 'google_maps_url']) ||
    input.sourceUrl ||
    (input.placeId ? `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(String(input.placeId))}` : ''),
  );
  const businessCategory = normalizeText(input.businessCategory || pickRaw(input, ['businessCategory', 'category', 'types'])) || normalizeText(input.segment) || null;
  const openingHoursStatus = normalizeText(input.openingHoursStatus || pickRaw(input, ['openingHoursStatus', 'openNow'])) || null;
  const pain = resolvePain(input);
  let recommendedChannel = resolveRecommendedChannel(input, emailStatus);
  let opportunityReason = buildReason(input, {
    emailStatus,
    recommendedChannel,
    painLabel: pain.label,
    painType: pain.type,
  });

  let score = clampInt(input.opportunityScore, 0, 100);
  if (recommendedChannel === 'whatsapp') score += 12;
  if (emailStatus === 'confirmed') score += 8;
  if (emailStatus === 'probable') score += 5;
  if (pain.type === 'sem_site' || pain.type === 'site_fraco') score += 7;
  if (instagramUrl && facebookUrl) score += 8;
  else if (instagramUrl) score += 6;
  else if (facebookUrl) score += 4;
  if ((instagramUrl || facebookUrl) && (pain.type === 'sem_site' || pain.type === 'site_fraco')) score += 4;
  if (socialStatus === 'partial') score += 5;
  if (socialStatus === 'candidate_review') score += 3;
  if (socialStatus === 'weak') score += 2;
  if (Number(input.rating || 0) >= 4.2) score += 4;
  if (Number(input.reviews || 0) >= 20) score += 3;
  if (recommendedChannel === 'discard') score = 0;
  let enrichmentScore = clampInt(score, 0, 100);
  const enrichmentConfidence = clampInt(
    35 +
      (recommendedChannel === 'whatsapp' ? 25 : 0) +
      (emailStatus === 'confirmed' ? 20 : emailStatus === 'probable' ? 12 : 0) +
      (pain.type !== 'unknown' ? 12 : 0) +
      (socialStatus === 'found' ? 6 : socialStatus === 'partial' ? 4 : socialStatus === 'candidate_review' ? 2 : 0),
    0,
    100,
  );
  const qualityV2 = calculateLeadQualityV2({
    lead: input,
    enrichment: {
      websiteStatus: normalizeWebsiteStatus(input),
      emailStatus,
      emailCandidate,
      instagramUrl,
      facebookUrl,
      socialStatus,
      googleMapsUrl,
      businessCategory,
      recommendedChannel,
      painType: pain.type,
      opportunityScore: enrichmentScore,
      whatsappStatus: input.whatsappStatus,
    },
    context: {
      requestedSegment: (input.rawPayload as any)?.requestedSegment || input.segment || null,
      requestedCity: (input.rawPayload as any)?.requestedCity || input.city || null,
      requestedState: (input.rawPayload as any)?.requestedState || input.state || null,
      qualityMode: 'list',
      salesProfile: input.salesProfile || (input.rawPayload as any)?.salesProfile || null,
      now,
    },
  });
  const hasDecisionContext = Boolean(normalizeText(input.name) || normalizeText(input.city) || normalizeText(input.segment) || normalizeText(input.businessCategory));
  if (qualityV2.decision === 'protect') {
    recommendedChannel = 'discard';
    enrichmentScore = 0;
    opportunityReason = qualityV2.reasons[0] || 'Card protegido por historico operacional.';
  } else if (hasDecisionContext && qualityV2.decision === 'discard') {
    recommendedChannel = qualityV2.recommendedChannel === 'discard' ? 'discard' : 'review';
    enrichmentScore = Math.min(enrichmentScore, qualityV2.finalRankScore, 25);
    opportunityReason = qualityV2.reasons.find((reason) => /^Descartado|^Resultado|^Identidade|^Sem evidencia|^Descartado:/i.test(reason)) || qualityV2.reasons[0] || opportunityReason;
  } else if (hasDecisionContext && qualityV2.decision === 'review') {
    recommendedChannel = recommendedChannel === 'discard' ? 'review' : recommendedChannel;
    enrichmentScore = Math.min(enrichmentScore, Math.max(qualityV2.finalRankScore, 45));
  } else {
    enrichmentScore = Math.max(enrichmentScore, qualityV2.finalRankScore);
  }
  if (qualityV2.productFit.websiteFit >= 75 && (pain.type === 'sem_site' || pain.type === 'site_fraco')) {
    opportunityReason = `${opportunityReason} Fit forte para Website/HBX Lead.`;
  }
  if ((instagramUrl || facebookUrl) && (pain.type === 'sem_site' || pain.type === 'site_fraco') && !/rede social|Instagram|Facebook/i.test(opportunityReason)) {
    opportunityReason = `${opportunityReason} Rede social encontrada, mas site ausente ou fraco.`;
  }
  const jsonPayload = {
    version: RADAR_LEAD_ENRICHMENT_VERSION,
    emailCandidate,
    whatsappStatus: normalizeText(input.whatsappStatus) || null,
    qualityV2,
    signals: {
      website,
      websiteStatus: normalizeWebsiteStatus(input),
      socialStatus,
      instagramUrl,
      facebookUrl,
      emailCandidate,
      emailStatus,
      googleMapsUrl,
      whatsappStatus: normalizeText(input.whatsappStatus) || null,
      recommendedChannel,
      painType: pain.type,
      qualityV2,
    },
    sourceConfidence: {
      email: emailConfidence,
      social: socialConfidence,
      enrichment: enrichmentConfidence,
    },
  };

  return {
    email: emailStatus === 'confirmed' || emailStatus === 'probable' ? emailCandidate : null,
    emailStatus,
    emailSource,
    emailConfidence,
    emailCandidate,
    instagramUrl,
    facebookUrl,
    socialStatus,
    socialConfidence,
    googleMapsUrl,
    businessCategory,
    openingHoursStatus,
    recommendedChannel,
    painType: pain.type,
    painLabel: pain.label,
    painPitch: pain.pitch,
    opportunityReason,
    enrichmentScore,
    enrichmentConfidence,
    enrichmentJson: JSON.stringify(jsonPayload),
    lastEnrichedAt: now,
    enrichmentVersion: RADAR_LEAD_ENRICHMENT_VERSION,
  };
}
