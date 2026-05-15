export type LeadQualityV2Decision =
  | 'deliver'
  | 'review'
  | 'discard'
  | 'protect';

export type LeadQualityV2 = {
  version: 'lead-quality-v2';
  identityScore: number;
  segmentFitScore: number;
  contactabilityScore: number;
  commercialIntentScore: number;
  freshnessScore: number;
  riskScore: number;
  opportunityScore: number;
  finalRankScore: number;
  decision: LeadQualityV2Decision;
  reasons: string[];
  discardReason: string | null;
  protectionReason: string | null;
  recommendedChannel: 'whatsapp' | 'email' | 'call' | 'review' | 'discard';
  productFit: {
    listFit: number;
    leadFit: number;
    botFit: number;
    recoveryFit: number;
    websiteFit: number;
  };
};

type SegmentIntentGroup = 'core' | 'adjacent_good' | 'adjacent_review' | 'reject';

type SegmentIntentMap = {
  key: string;
  aliases: string[];
  core: string[];
  adjacent_good: string[];
  adjacent_review: string[];
  reject: string[];
};

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
]);

const GENERIC_NAME_PATTERNS = [
  'empresa',
  'sem nome',
  'contato',
  'telefone',
  'guia comercial',
  'lista de empresas',
  'lista telefonica',
  'catalogo',
  'diretorio',
  'resultado',
  'lead',
];

const DIRECTORY_PATTERNS = [
  'guia',
  'lista',
  'diretorio',
  'catalogo',
  'telelista',
  'telefone empresas',
];

const SEGMENT_INTENTS: SegmentIntentMap[] = [
  {
    key: 'oficina',
    aliases: ['oficina', 'mecanica', 'automotivo', 'auto'],
    core: ['oficina', 'mecanica', 'auto center', 'auto eletrica'],
    adjacent_good: ['pneus', 'funilaria', 'borracharia'],
    adjacent_review: ['guincho', 'lava rapido', 'pecas'],
    reject: ['auto escola', 'estacionamento', 'seguradora'],
  },
  {
    key: 'restaurante',
    aliases: ['restaurante', 'alimentacao', 'comida'],
    core: ['restaurante', 'pizzaria', 'lanchonete', 'hamburgueria', 'delivery'],
    adjacent_good: ['padaria', 'cafeteria', 'bar'],
    adjacent_review: ['mercado', 'conveniencia'],
    reject: ['fornecedor', 'distribuidora'],
  },
  {
    key: 'clinica',
    aliases: ['clinica', 'saude', 'medico', 'odontologia'],
    core: ['clinica', 'medico', 'odontologia', 'fisioterapia', 'estetica'],
    adjacent_good: ['laboratorio', 'psicologia', 'pilates'],
    adjacent_review: ['farmacia'],
    reject: ['plano de saude', 'hospital publico'],
  },
  {
    key: 'beleza',
    aliases: ['salao', 'beleza', 'barbearia', 'estetica'],
    core: ['salao', 'barbearia', 'estetica', 'manicure'],
    adjacent_good: ['cosmeticos', 'depilacao'],
    adjacent_review: ['loja de beleza'],
    reject: ['escola de beleza'],
  },
  {
    key: 'pet',
    aliases: ['pet', 'veterinaria', 'animal'],
    core: ['pet shop', 'veterinaria', 'banho e tosa'],
    adjacent_good: ['racao', 'agropecuaria'],
    adjacent_review: ['casa de racao'],
    reject: ['adocao', 'ong'],
  },
];

function normalizeText(value: unknown, max = 500) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function normalizeKey(value: unknown) {
  return normalizeText(value, 500)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function clampScore(value: unknown) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function parseJsonRecord(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, any> : {};
  } catch {
    return {};
  }
}

function normalizePhone(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
}

function isValidPhone(value: unknown) {
  const digits = normalizePhone(value);
  return digits.length >= 10 && digits.length <= 11;
}

function isLikelyMobile(value: unknown) {
  const digits = normalizePhone(value);
  return digits.length === 11 && digits[2] === '9';
}

function hasEmail(value: unknown) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(normalizeText(value));
}

function hasStatus(value: unknown, statuses: string[]) {
  const normalized = normalizeKey(value);
  return statuses.some((status) => normalized === status || normalized.includes(status));
}

function mergeLeadInput(lead: any, enrichment: any) {
  const parsedLeadEnrichment = parseJsonRecord(lead?.enrichmentJson);
  const parsedLeadMetadata = parseJsonRecord(lead?.metadataJson);
  const parsedInputEnrichment = parseJsonRecord(enrichment);
  return {
    ...parsedLeadMetadata,
    ...parsedLeadEnrichment,
    ...parsedInputEnrichment,
    ...(lead || {}),
    signals: {
      ...(parsedLeadMetadata?.signals || {}),
      ...(parsedLeadEnrichment?.signals || {}),
      ...(parsedInputEnrichment?.signals || {}),
      ...(lead?.signals || {}),
      ...(enrichment?.signals || {}),
    },
    qualityV2: parsedInputEnrichment?.qualityV2 || parsedLeadEnrichment?.qualityV2 || parsedLeadMetadata?.qualityV2 || lead?.qualityV2,
  };
}

function includesAny(haystack: string, needles: string[]) {
  return needles.some((needle) => haystack.includes(normalizeKey(needle)));
}

function resolveSegmentIntent(requestedSegment: unknown) {
  const requested = normalizeKey(requestedSegment);
  if (!requested) return null;
  return SEGMENT_INTENTS.find((item) => item.aliases.some((alias) => requested.includes(normalizeKey(alias)))) || null;
}

function scoreSegmentFit(input: {
  requestedSegment?: string | null;
  leadText: string;
  reasons: string[];
}) {
  const intent = resolveSegmentIntent(input.requestedSegment);
  if (!intent) {
    if (!normalizeKey(input.requestedSegment)) {
      input.reasons.push('Sem segmento solicitado: fit de segmento sem penalizacao forte.');
      return { score: 72, group: null as SegmentIntentGroup | null };
    }
    input.reasons.push('Segmento solicitado sem mapa especifico: avaliacao conservadora.');
    return { score: 62, group: null as SegmentIntentGroup | null };
  }

  if (includesAny(input.leadText, intent.reject)) {
    const matched = intent.reject.find((term) => input.leadText.includes(normalizeKey(term))) || intent.key;
    input.reasons.push(`Descartado: ${matched} nao combina com ${intent.key}.`);
    return { score: 15, group: 'reject' as SegmentIntentGroup };
  }
  if (includesAny(input.leadText, intent.core)) {
    input.reasons.push(`Segmento compativel: ${intent.key}.`);
    return { score: 92, group: 'core' as SegmentIntentGroup };
  }
  if (includesAny(input.leadText, intent.adjacent_good)) {
    input.reasons.push(`Segmento adjacente bom para ${intent.key}.`);
    return { score: 76, group: 'adjacent_good' as SegmentIntentGroup };
  }
  if (includesAny(input.leadText, intent.adjacent_review)) {
    input.reasons.push(`Segmento proximo pede revisao para ${intent.key}.`);
    return { score: 55, group: 'adjacent_review' as SegmentIntentGroup };
  }
  input.reasons.push(`Sem evidencia forte de aderencia a ${intent.key}.`);
  return { score: 38, group: null as SegmentIntentGroup | null };
}

function scoreFreshness(row: any, now: Date) {
  const rawDate = row?.lastSeenAt || row?.updatedAt || row?.createdAt || row?.checkedAt;
  const date = rawDate ? new Date(rawDate) : null;
  if (!date || Number.isNaN(date.getTime())) return 65;
  const ageDays = Math.max(0, (now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
  if (ageDays <= 3) return 95;
  if (ageDays <= 15) return 82;
  if (ageDays <= 45) return 68;
  if (ageDays <= 120) return 52;
  return 35;
}

function normalizeWebsiteStatus(row: any) {
  const explicit = normalizeKey(row?.websiteStatus || row?.signals?.websiteStatus);
  if (explicit) return explicit;
  return normalizeText(row?.website) ? 'present' : 'none';
}

function extractWhatsappStatus(row: any) {
  return normalizeKey(row?.whatsappStatus || row?.whatsappCheckStatus || row?.signals?.whatsappStatus || row?.qualityV2?.whatsappStatus);
}

export function calculateLeadQualityV2(input: {
  lead: any;
  enrichment?: any;
  context?: {
    requestedSegment?: string | null;
    requestedCity?: string | null;
    requestedState?: string | null;
    targetType?: string | null;
    now?: Date;
  };
}): LeadQualityV2 {
  const row = mergeLeadInput(input.lead || {}, input.enrichment || {});
  const now = input.context?.now || new Date();
  const reasons: string[] = [];
  const name = normalizeText(row?.name);
  const nameKey = normalizeKey(name);
  const phone = row?.phoneDigits || row?.phone || row?.phoneNormalized;
  const phoneValid = isValidPhone(phone);
  const likelyMobile = isLikelyMobile(phone);
  const websiteStatus = normalizeWebsiteStatus(row);
  const website = normalizeText(row?.website || row?.websiteUrl);
  const instagramUrl = normalizeText(row?.instagramUrl || row?.signals?.instagramUrl);
  const facebookUrl = normalizeText(row?.facebookUrl || row?.signals?.facebookUrl);
  const hasSocial = Boolean(instagramUrl || facebookUrl);
  const emailStatus = normalizeKey(row?.emailStatus || row?.signals?.emailStatus);
  const email = row?.email || row?.emailCandidate;
  const emailConfirmed = emailStatus === 'confirmed' || hasEmail(email);
  const emailProbable = emailStatus === 'probable';
  const whatsappStatus = extractWhatsappStatus(row);
  const whatsappConfirmed = ['confirmed', 'available', 'valid', 'exists', 'true'].includes(whatsappStatus);
  const whatsappUnavailable = ['missing', 'unavailable', 'no_whatsapp', 'invalid', 'invalid_whatsapp'].includes(whatsappStatus);
  const statusText = [
    row?.status,
    row?.companyStatus,
    row?.rejectionReason,
    row?.negativeReason,
    row?.deniedReason,
    row?.complaintReason,
    row?.lastResult,
  ].map(normalizeKey).filter(Boolean).join(' ');
  const protectedStatus = Array.from(PROTECTED_STATUSES).some((status) => statusText.includes(status));
  const directoryLike = includesAny(`${nameKey} ${normalizeKey(row?.source)} ${normalizeKey(row?.sourceUrl)}`, DIRECTORY_PATTERNS);
  const genericName = !name || nameKey.length < 3 || GENERIC_NAME_PATTERNS.some((term) => nameKey === normalizeKey(term) || nameKey.includes(normalizeKey(term)));

  let identityScore = 20;
  if (name && !genericName) identityScore += 24;
  if (phoneValid) identityScore += 16;
  if (normalizeText(row?.city) && normalizeText(row?.state)) identityScore += 12;
  else if (normalizeText(row?.city || row?.state)) identityScore += 7;
  if (normalizeText(row?.address)) identityScore += 10;
  if (normalizeText(row?.placeId)) identityScore += 8;
  if (website || hasSocial) identityScore += 12;
  if (Number(row?.rating || 0) > 0 || Number(row?.reviews || 0) > 0) identityScore += 8;
  if (genericName) {
    identityScore -= 30;
    reasons.push('Identidade fraca: nome generico ou placeholder.');
  }
  if (!phoneValid) identityScore -= 18;
  if (!normalizeText(row?.address)) identityScore -= 6;
  if (directoryLike) {
    identityScore -= 22;
    reasons.push('Resultado parece diretorio, guia ou lista generica.');
  }
  identityScore = clampScore(identityScore);
  if (identityScore >= 70) reasons.push('Empresa parece real: nome, contato e sinais publicos consistentes.');

  const leadText = normalizeKey([
    row?.name,
    row?.segment,
    row?.businessCategory,
    row?.category,
    row?.source,
    row?.sourceUrl,
    row?.opportunityReason,
  ].filter(Boolean).join(' '));
  const segmentFit = scoreSegmentFit({
    requestedSegment: input.context?.requestedSegment || row?.requestedSegment || null,
    leadText,
    reasons,
  });
  const segmentFitScore = clampScore(segmentFit.score);

  let contactabilityScore = 0;
  if (whatsappConfirmed) contactabilityScore += 72;
  else if (likelyMobile) contactabilityScore += 40;
  else if (phoneValid) contactabilityScore += 22;
  if (emailConfirmed) contactabilityScore += 20;
  else if (emailProbable) contactabilityScore += 13;
  if (hasSocial) contactabilityScore += 12;
  if (normalizeText(row?.googleMapsUrl || row?.signals?.googleMapsUrl)) contactabilityScore += 8;
  if (!phoneValid) contactabilityScore -= 20;
  if (whatsappUnavailable) contactabilityScore -= 24;
  if (phoneValid && !likelyMobile && !whatsappConfirmed) contactabilityScore -= 8;
  if (!whatsappConfirmed && !emailConfirmed && !emailProbable && !hasSocial) contactabilityScore -= 8;
  contactabilityScore = clampScore(contactabilityScore);
  if (whatsappConfirmed || likelyMobile) reasons.push(whatsappConfirmed ? 'WhatsApp confirmado.' : 'WhatsApp provavel por celular valido.');
  if (emailConfirmed || emailProbable) reasons.push(emailConfirmed ? 'E-mail confirmado.' : 'E-mail provavel.');
  if (hasSocial) reasons.push(instagramUrl && !website ? 'Instagram encontrado, mas site ausente.' : 'Rede social encontrada.');

  const playbookKnown = Boolean(resolveSegmentIntent(row?.segment || input.context?.requestedSegment)) || includesAny(leadText, ['clinica', 'oficina', 'restaurante', 'salao', 'barbearia', 'pet', 'imobiliaria']);
  let commercialIntentScore = 25;
  if (!website || websiteStatus === 'none') commercialIntentScore += 22;
  if (['weak', 'broken', 'unreachable', 'social_only'].includes(websiteStatus)) commercialIntentScore += 18;
  if (hasSocial && (!website || ['none', 'weak', 'social_only'].includes(websiteStatus))) commercialIntentScore += 14;
  if (Number(row?.rating || 0) >= 4.2) commercialIntentScore += 8;
  if (Number(row?.reviews || 0) >= 20) commercialIntentScore += 8;
  if (whatsappConfirmed || likelyMobile) commercialIntentScore += 8;
  if (playbookKnown) commercialIntentScore += 8;
  if (normalizeText(row?.painType || row?.signals?.painType || row?.opportunityReason)) commercialIntentScore += 8;
  commercialIntentScore = clampScore(commercialIntentScore);
  if ((!website || websiteStatus === 'none') && hasSocial) reasons.push('Rede social ativa sem site forte aumenta oportunidade comercial.');
  else if (!website || websiteStatus === 'none') reasons.push('Sem site: oportunidade para organizar presenca e atendimento.');
  if (Number(row?.reviews || 0) >= 20) reasons.push('Boa avaliacao e reviews indicam demanda local.');

  let riskScore = 0;
  const protectionReasons: string[] = [];
  if (protectedStatus) {
    riskScore += 90;
    protectionReasons.push('status protegido');
  }
  if (Number(row?.globalNegativeCount || 0) > 0) {
    riskScore += 35 + Math.min(35, Number(row.globalNegativeCount) * 10);
    protectionReasons.push('negativo global');
  }
  if (normalizeText(row?.deniedReason)) {
    riskScore += 45;
    protectionReasons.push('negado');
  }
  if (normalizeText(row?.complaintReason)) {
    riskScore += 55;
    protectionReasons.push('complaint');
  }
  if (Number(row?.noAnswerCount || 0) >= 3) riskScore += 18;
  if (Number(row?.contactedCount || 0) >= 3) riskScore += 18;
  if (row?.duplicate || normalizeKey(row?.status).includes('duplicate')) riskScore += 35;
  if (row?.ownerCompanyId && input.context?.targetType !== 'owner') riskScore += 45;
  if (statusText.includes('opt-out') || statusText.includes('opt_out')) riskScore += 80;
  if (statusText.includes('invalid_phone') || statusText.includes('invalid_whatsapp')) riskScore += 80;
  riskScore = clampScore(riskScore);
  if (riskScore >= 40) reasons.push(`Risco elevado: ${protectionReasons.join(', ') || 'historico operacional ruim'}.`);

  const freshnessScore = clampScore(scoreFreshness(row, now));
  const opportunityScore = clampScore(
    commercialIntentScore * 0.38 +
    contactabilityScore * 0.25 +
    segmentFitScore * 0.20 +
    identityScore * 0.12 +
    freshnessScore * 0.05 -
    Math.min(35, riskScore * 0.35),
  );
  const riskPenalty = riskScore >= 80 ? 100 : riskScore >= 60 ? 35 : riskScore >= 40 ? 15 : 0;
  const finalRankScore = clampScore(
    opportunityScore * 0.30 +
    contactabilityScore * 0.25 +
    segmentFitScore * 0.20 +
    commercialIntentScore * 0.15 +
    freshnessScore * 0.10 -
    riskPenalty,
  );

  const websiteFit = clampScore((!website || websiteStatus === 'none' ? 55 : 10) + (['weak', 'social_only', 'broken', 'unreachable'].includes(websiteStatus) ? 35 : 0) + (hasSocial ? 20 : 0));
  const listFit = clampScore(identityScore * 0.45 + contactabilityScore * 0.35 + segmentFitScore * 0.20);
  const leadFit = clampScore(contactabilityScore * 0.35 + segmentFitScore * 0.30 + commercialIntentScore * 0.25 + identityScore * 0.10);
  const botFit = clampScore(
    (includesAny(leadText, ['clinica', 'imobiliaria', 'agenda', 'orcamento', 'atendimento', 'delivery']) ? 45 : 20) +
    (contactabilityScore * 0.30) +
    (commercialIntentScore * 0.25),
  );
  const recoveryFit = clampScore(
    (Number(row?.contactedCount || 0) > 0 ? 25 : 0) +
    (Number(row?.noAnswerCount || 0) > 0 ? 35 : 0) +
    (includesAny(statusText, ['retorno', 'reativar', 'perdido', 'antigo']) ? 25 : 0) +
    Math.min(15, freshnessScore / 8),
  );

  let recommendedChannel: LeadQualityV2['recommendedChannel'];
  if (riskScore >= 80 || protectedStatus) recommendedChannel = 'discard';
  else if (!phoneValid && contactabilityScore < 25 && !emailConfirmed && !emailProbable && !hasSocial) recommendedChannel = 'discard';
  else if (whatsappConfirmed || likelyMobile) recommendedChannel = 'whatsapp';
  else if (emailConfirmed || emailProbable) recommendedChannel = 'email';
  else if (phoneValid) recommendedChannel = 'call';
  else recommendedChannel = 'review';

  let decision: LeadQualityV2Decision = 'review';
  let discardReason: string | null = null;
  let protectionReason: string | null = null;
  if (riskScore >= 80 || protectedStatus) {
    decision = 'protect';
    protectionReason = protectionReasons.join(', ') || 'protected_status';
    reasons.push(`Protegido: ${protectionReason}.`);
  } else if (identityScore < 35) {
    decision = 'discard';
    discardReason = 'weak_identity';
  } else if (directoryLike) {
    decision = 'discard';
    discardReason = 'generic_directory';
  } else if (segmentFit.group === 'reject' || (normalizeKey(input.context?.requestedSegment) && segmentFitScore < 25)) {
    decision = 'discard';
    discardReason = 'segment_mismatch';
  } else if (!phoneValid && contactabilityScore < 25 && !emailConfirmed && !emailProbable && !hasSocial) {
    decision = 'discard';
    discardReason = 'weak_contactability';
  } else if (finalRankScore >= 68 && contactabilityScore >= 45 && segmentFitScore >= 55 && riskScore < 40) {
    decision = 'deliver';
  } else {
    decision = 'review';
  }

  if (discardReason) reasons.push(`Descartado: ${discardReason}.`);
  if (decision === 'deliver' && reasons.length < 3) reasons.push('Bom fit, contato possivel e risco baixo.');

  return {
    version: 'lead-quality-v2',
    identityScore,
    segmentFitScore,
    contactabilityScore,
    commercialIntentScore,
    freshnessScore,
    riskScore,
    opportunityScore,
    finalRankScore,
    decision,
    reasons: Array.from(new Set(reasons.filter(Boolean))).slice(0, 8),
    discardReason,
    protectionReason,
    recommendedChannel,
    productFit: {
      listFit,
      leadFit,
      botFit,
      recoveryFit,
      websiteFit,
    },
  };
}
