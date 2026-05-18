export type LeadQualityV2Decision =
  | 'deliver'
  | 'review'
  | 'discard'
  | 'protect';

export type LeadQualityV2Channel = 'whatsapp' | 'instagram' | 'email' | 'website' | 'phone' | 'facebook';
export type LeadQualityV2ChannelMatchMode = 'prefer' | 'any_required' | 'all_required';

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
  channelAvailability?: Record<LeadQualityV2Channel, boolean>;
  productFit: {
    listFit: number;
    leadFit: number;
    botFit: number;
    recoveryFit: number;
    websiteFit: number;
  };
};

export type LeadQualityV2SalesProfile = {
  whatDoYouSell?: string | null;
  offerCategory?: string | null;
  targetAudience?: string[];
  targetSegments?: string[];
  avoidSegments?: string[];
  hardRejectSegments?: string[];
  preferredCities?: string[];
  preferredStates?: string[];
  preferredChannels?: string[];
  requiredChannels?: string[];
  channelMatchMode?: LeadQualityV2ChannelMatchMode | string | null;
  qualityMode?: 'list' | 'lead_plus' | string | null;
  leadPreferences?: Record<string, any>;
  negativeRules?: Record<string, any>;
};

export type LeadQualityV2QualityMode = 'list' | 'lead_plus';

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
  {
    key: 'imobiliaria',
    aliases: ['imobiliaria', 'imovel', 'imoveis', 'corretor de imoveis'],
    core: ['imobiliaria', 'imoveis', 'corretor de imoveis', 'administradora de imoveis'],
    adjacent_good: ['condominio', 'construtora', 'arquitetura'],
    adjacent_review: ['mudanca', 'cartorio'],
    reject: ['hotel', 'pousada'],
  },
  {
    key: 'advocacia',
    aliases: ['advocacia', 'advogado', 'juridico', 'servicos juridicos'],
    core: ['advocacia', 'advogado', 'escritorio juridico', 'servicos juridicos'],
    adjacent_good: ['consultoria empresarial', 'contabilidade'],
    adjacent_review: ['cartorio', 'despachante'],
    reject: ['forum', 'tribunal', 'defensoria publica'],
  },
  {
    key: 'contabilidade',
    aliases: ['contabilidade', 'contador', 'contabil', 'escritorio contabil'],
    core: ['contabilidade', 'contador', 'contabil', 'escritorio contabil'],
    adjacent_good: ['consultoria empresarial', 'financeira', 'mei'],
    adjacent_review: ['advocacia', 'despachante'],
    reject: ['banco', 'loterica'],
  },
  {
    key: 'agencia_marketing',
    aliases: ['agencia de marketing', 'agencias de marketing', 'agencias marketing', 'marketing digital', 'trafego pago', 'social media'],
    core: ['agencia de marketing', 'marketing digital', 'trafego pago', 'social media'],
    adjacent_good: ['web design', 'designer', 'fotografia', 'grafica'],
    adjacent_review: ['produtora', 'eventos'],
    reject: ['jornal', 'radio'],
  },
  {
    key: 'grafica',
    aliases: ['grafica', 'impressao', 'comunicacao visual'],
    core: ['grafica', 'impressao', 'comunicacao visual', 'adesivos', 'banners'],
    adjacent_good: ['marketing', 'papelaria', 'design'],
    adjacent_review: ['copiadora', 'plotagem'],
    reject: ['editora', 'jornal'],
  },
  {
    key: 'web_design',
    aliases: ['web design', 'site', 'desenvolvimento web', 'criacao de sites'],
    core: ['web design', 'desenvolvimento web', 'criacao de sites', 'sites'],
    adjacent_good: ['marketing digital', 'informatica', 'agencia'],
    adjacent_review: ['provedor de internet', 'telecom'],
    reject: ['lan house'],
  },
  {
    key: 'informatica',
    aliases: ['informatica', 'assistencia tecnica', 'ti', 'computador'],
    core: ['informatica', 'assistencia tecnica', 'manutencao de computadores', 'suporte tecnico'],
    adjacent_good: ['eletronicos', 'celulares', 'provedor de internet'],
    adjacent_review: ['papelaria', 'lan house'],
    reject: ['curso de informatica'],
  },
  {
    key: 'seguranca',
    aliases: ['seguranca', 'alarme', 'sistemas de seguranca', 'monitoramento'],
    core: ['seguranca', 'alarme', 'monitoramento', 'cameras', 'sistemas de seguranca'],
    adjacent_good: ['portaria', 'zeladoria', 'controle de acesso'],
    adjacent_review: ['eletrica', 'automacao'],
    reject: ['seguranca publica', 'policia'],
  },
  {
    key: 'limpeza',
    aliases: ['limpeza', 'servicos de limpeza', 'zeladoria'],
    core: ['limpeza', 'servicos de limpeza', 'zeladoria', 'conservacao'],
    adjacent_good: ['dedetizadora', 'lavanderia', 'portaria'],
    adjacent_review: ['jardinagem', 'manutencao predial'],
    reject: ['produto de limpeza'],
  },
  {
    key: 'lavanderia',
    aliases: ['lavanderia', 'lavanderias'],
    core: ['lavanderia', 'lavagem de roupas', 'passadoria'],
    adjacent_good: ['costura', 'tinturaria'],
    adjacent_review: ['limpeza', 'hotelaria'],
    reject: ['lava rapido'],
  },
  {
    key: 'dedetizadora',
    aliases: ['dedetizadora', 'dedetizacao', 'controle de pragas'],
    core: ['dedetizadora', 'dedetizacao', 'controle de pragas', 'desinsetizacao'],
    adjacent_good: ['limpeza', 'higienizacao'],
    adjacent_review: ['jardinagem', 'zeladoria'],
    reject: ['pet shop'],
  },
  {
    key: 'chaveiro',
    aliases: ['chaveiro', 'chaves', 'fechadura'],
    core: ['chaveiro', 'chaves', 'fechadura', 'carimbo'],
    adjacent_good: ['seguranca', 'controle de acesso'],
    adjacent_review: ['ferragens'],
    reject: ['chaveiro musical'],
  },
  {
    key: 'academia',
    aliases: ['academia', 'fitness', 'musculacao', 'crossfit'],
    core: ['academia', 'fitness', 'musculacao', 'crossfit', 'treinamento funcional'],
    adjacent_good: ['pilates', 'yoga', 'nutricao'],
    adjacent_review: ['fisioterapia', 'estetica'],
    reject: ['academia de letras'],
  },
  {
    key: 'farmacia',
    aliases: ['farmacia', 'drogaria'],
    core: ['farmacia', 'drogaria', 'medicamentos'],
    adjacent_good: ['perfumaria', 'manipulacao', 'ortopedia'],
    adjacent_review: ['clinica', 'laboratorio'],
    reject: ['farmacia municipal', 'posto de saude'],
  },
  {
    key: 'laboratorio',
    aliases: ['laboratorio', 'exames', 'analises clinicas'],
    core: ['laboratorio', 'exames', 'analises clinicas', 'diagnostico'],
    adjacent_good: ['clinica', 'medicina diagnostica'],
    adjacent_review: ['farmacia', 'hospital'],
    reject: ['laboratorio escolar'],
  },
  {
    key: 'mercado',
    aliases: ['mercado', 'supermercado', 'mercearia'],
    core: ['mercado', 'supermercado', 'mercearia', 'hortifruti'],
    adjacent_good: ['padaria', 'acougue', 'conveniencia'],
    adjacent_review: ['atacado', 'distribuidora'],
    reject: ['mercado financeiro'],
  },
  {
    key: 'padaria',
    aliases: ['padaria', 'panificadora', 'panificacao'],
    core: ['padaria', 'panificadora', 'confeitaria', 'panificacao'],
    adjacent_good: ['cafeteria', 'mercado', 'lanchonete'],
    adjacent_review: ['restaurante', 'doceria'],
    reject: ['fornecedor de farinha'],
  },
  {
    key: 'loja_roupa',
    aliases: ['loja de roupa', 'lojas de roupas', 'moda', 'confeccao'],
    core: ['loja de roupa', 'lojas de roupas', 'moda', 'confeccao', 'vestuario'],
    adjacent_good: ['calcados', 'acessorios', 'boutique'],
    adjacent_review: ['brecho', 'costura'],
    reject: ['lavanderia'],
  },
  {
    key: 'loja_celular',
    aliases: ['loja de celular', 'lojas de celulares', 'celular', 'smartphone'],
    core: ['loja de celular', 'lojas de celulares', 'celulares', 'smartphones', 'assistencia celular'],
    adjacent_good: ['informatica', 'eletronicos', 'acessorios'],
    adjacent_review: ['telecom', 'provedor'],
    reject: ['operadora nacional'],
  },
  {
    key: 'eletronicos',
    aliases: ['eletronicos', 'eletronica', 'loja de eletronicos'],
    core: ['eletronicos', 'eletronica', 'loja de eletronicos', 'assistencia eletronica'],
    adjacent_good: ['informatica', 'celulares', 'eletrodomesticos'],
    adjacent_review: ['som automotivo', 'games'],
    reject: ['auto eletrica'],
  },
  {
    key: 'otica',
    aliases: ['otica', 'oculos', 'optica'],
    core: ['otica', 'optica', 'oculos', 'lentes'],
    adjacent_good: ['oftalmologia', 'clinica'],
    adjacent_review: ['relojoaria', 'joalheria'],
    reject: ['fotografia'],
  },
];

const AUDIENCE_INTENTS: Array<{ key: string; aliases: string[]; match: string[] }> = [
  {
    key: 'idosos',
    aliases: ['idoso', 'idosos', 'terceira idade', 'sênior', 'senior'],
    match: ['idoso', 'terceira idade', 'senior', 'geriatria', 'geriatra', 'cuidador', 'cuidadores', 'home care', 'casa de repouso', 'residencial senior', 'lar de idosos', 'fisioterapia', 'farmacia', 'ortopedia'],
  },
  {
    key: 'familias',
    aliases: ['familia', 'familias', 'famílias', 'pais', 'maes', 'mães'],
    match: ['familia', 'familias', 'infantil', 'crianca', 'criança', 'pediatria', 'escola', 'colegio', 'bercario', 'buffet infantil', 'condominio', 'mercado', 'padaria'],
  },
  {
    key: 'empresas pequenas',
    aliases: ['empresa pequena', 'empresas pequenas', 'pequenos negocios', 'pequenos negócios', 'mei', 'microempresa'],
    match: ['mei', 'microempresa', 'pequena empresa', 'comercio local', 'loja', 'assistencia tecnica', 'prestador', 'barbearia', 'salao', 'oficina', 'clinica', 'restaurante'],
  },
  {
    key: 'comercios locais',
    aliases: ['comercio local', 'comercios locais', 'comércios locais', 'loja local'],
    match: ['loja', 'comercio', 'mercado', 'padaria', 'restaurante', 'lanchonete', 'barbearia', 'salao', 'pet shop', 'oficina', 'assistencia tecnica'],
  },
  {
    key: 'profissionais autonomos',
    aliases: ['profissional autonomo', 'profissionais autonomos', 'profissionais autônomos', 'autonomo', 'autônomo'],
    match: ['autonomo', 'profissional liberal', 'consultorio', 'personal', 'corretor', 'advogado', 'contador', 'psicologo', 'fisioterapeuta', 'designer', 'eletricista'],
  },
  {
    key: 'clinicas',
    aliases: ['clinica', 'clinicas', 'clínicas', 'consultorio', 'consultórios'],
    match: ['clinica', 'consultorio', 'odontologia', 'medico', 'fisioterapia', 'estetica', 'psicologia', 'laboratorio', 'pilates', 'nutricao'],
  },
];

const OFFER_INTENTS: Array<{ key: string; aliases: string[]; leadSignals: string[] }> = [
  {
    key: 'site',
    aliases: ['site', 'website', 'landing page', 'pagina', 'página', 'presenca digital', 'presença digital'],
    leadSignals: ['loja', 'clinica', 'restaurante', 'salao', 'barbearia', 'pet shop', 'oficina', 'imobiliaria', 'consultorio'],
  },
  {
    key: 'whatsapp',
    aliases: ['whatsapp', 'bot', 'chatbot', 'atendimento', 'automacao', 'automação', 'ia', 'resposta automatica', 'resposta automática'],
    leadSignals: ['clinica', 'consultorio', 'imobiliaria', 'restaurante', 'delivery', 'agenda', 'orcamento', 'orçamento', 'atendimento', 'suporte'],
  },
  {
    key: 'sistema',
    aliases: ['sistema', 'software', 'crm', 'gestao', 'gestão', 'agenda', 'erp', 'saas'],
    leadSignals: ['clinica', 'consultorio', 'oficina', 'restaurante', 'salao', 'barbearia', 'pet shop', 'imobiliaria', 'contador', 'advogado'],
  },
  {
    key: 'marketing',
    aliases: ['marketing', 'trafego', 'tráfego', 'anuncio', 'anúncio', 'social media', 'instagram', 'design'],
    leadSignals: ['instagram', 'facebook', 'loja', 'restaurante', 'salao', 'barbearia', 'clinica', 'estetica', 'delivery'],
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

function normalizeStringArray(value: unknown, limit = 40) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeText(item, 80))
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeSegmentArray(value: unknown, limit = 40) {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((item) => normalizeText(item, 240).split(/[,;|]+/g))
    .map((item) => normalizeText(item, 80))
    .filter(Boolean)
    .slice(0, limit);
}

const CHANNEL_LABELS: Record<LeadQualityV2Channel, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  email: 'E-mail',
  website: 'Site',
  phone: 'Telefone',
  facebook: 'Facebook',
};

function normalizeChannel(value: unknown): LeadQualityV2Channel | null {
  const key = normalizeKey(value);
  if (!key) return null;
  if (['whatsapp', 'zap', 'wpp'].includes(key)) return 'whatsapp';
  if (['instagram', 'insta'].includes(key)) return 'instagram';
  if (['email', 'e-mail', 'mail'].includes(key)) return 'email';
  if (['website', 'site', 'web', 'www'].includes(key)) return 'website';
  if (['phone', 'telefone', 'ligacao', 'ligacao telefonica', 'call', 'celular'].includes(key)) return 'phone';
  if (['facebook', 'face', 'fb'].includes(key)) return 'facebook';
  return null;
}

function normalizeChannels(value: unknown, limit = 6): LeadQualityV2Channel[] {
  const source = Array.isArray(value) ? value : [];
  return Array.from(new Set(source.map(normalizeChannel).filter(Boolean) as LeadQualityV2Channel[])).slice(0, limit);
}

function normalizeChannelMatchMode(value: unknown): LeadQualityV2ChannelMatchMode {
  const normalized = normalizeKey(value);
  if (normalized === 'any_required' || normalized === 'all_required') return normalized;
  return 'prefer';
}

function profileHasPreference(profile: LeadQualityV2SalesProfile | null | undefined, key: string) {
  return Boolean(profile?.leadPreferences && (profile.leadPreferences as any)[key] === true);
}

function profileHasNegativeRule(profile: LeadQualityV2SalesProfile | null | undefined, key: string) {
  return Boolean(profile?.negativeRules && (profile.negativeRules as any)[key] === true);
}

function resolveSegmentIntent(requestedSegment: unknown) {
  const requested = normalizeKey(requestedSegment);
  if (!requested) return null;
  return SEGMENT_INTENTS.find((item) => item.aliases.some((alias) => requested.includes(normalizeKey(alias)))) || null;
}

function scoreTargetSegmentFit(targetSegments: string[], leadText: string) {
  if (!targetSegments.length) return { matched: false, strong: false, rejected: false };
  for (const segment of targetSegments) {
    const segmentKey = normalizeKey(segment);
    const intent = resolveSegmentIntent(segment);
    if (intent) {
      if (includesAny(leadText, intent.reject)) return { matched: false, strong: false, rejected: true };
      if (includesAny(leadText, intent.core)) return { matched: true, strong: true, rejected: false };
      if (includesAny(leadText, intent.adjacent_good)) return { matched: true, strong: true, rejected: false };
      if (includesAny(leadText, intent.adjacent_review)) return { matched: true, strong: false, rejected: false };
      continue;
    }
    if (segmentKey && leadText.includes(segmentKey)) return { matched: true, strong: true, rejected: false };
  }
  return { matched: false, strong: false, rejected: false };
}

function resolveAudienceIntent(label: unknown) {
  const requested = normalizeKey(label);
  if (!requested || requested === 'todos') return null;
  return AUDIENCE_INTENTS.find((item) => item.aliases.some((alias) => requested.includes(normalizeKey(alias)))) || {
    key: requested,
    aliases: [requested],
    match: [requested],
  };
}

function scoreAudienceFit(input: { targetAudience: string[]; leadText: string; reasons: string[] }) {
  const intents = input.targetAudience
    .map(resolveAudienceIntent)
    .filter(Boolean) as Array<{ key: string; aliases: string[]; match: string[] }>;
  if (!intents.length) return { scoreDelta: 0, matched: false };

  const matched = intents.find((intent) => includesAny(input.leadText, intent.match));
  if (matched) {
    input.reasons.push(`Publico-alvo compativel: ${matched.key}.`);
    input.reasons.push('Combina com seu Perfil de Venda.');
    return { scoreDelta: 12, matched: true };
  }

  input.reasons.push('Publico-alvo configurado sem evidencia forte neste card.');
  return { scoreDelta: -6, matched: false };
}

function resolveOfferIntents(profile: LeadQualityV2SalesProfile | null | undefined) {
  const offerText = normalizeKey(`${profile?.whatDoYouSell || ''} ${profile?.offerCategory || ''}`);
  if (!offerText) return [];
  const matched = OFFER_INTENTS.filter((intent) => intent.aliases.some((alias) => offerText.includes(normalizeKey(alias))));
  if (matched.length) return matched;
  return [{
    key: offerText,
    aliases: [offerText],
    leadSignals: offerText.split(' ').filter((part) => part.length >= 4).slice(0, 6),
  }];
}

function scoreOfferFit(input: {
  salesProfile: LeadQualityV2SalesProfile | null | undefined;
  leadText: string;
  websiteStatus: string;
  website: string;
  hasSocial: boolean;
  whatsappConfirmed: boolean;
  likelyMobile: boolean;
  reasons: string[];
}) {
  const intents = resolveOfferIntents(input.salesProfile);
  if (!intents.length) return { scoreDelta: 0, matched: false };

  let scoreDelta = 0;
  const matchedLabels: string[] = [];
  const weakWebsite = !input.website || ['none', 'weak', 'broken', 'unreachable', 'social_only'].includes(input.websiteStatus);
  const hasDirectContact = input.whatsappConfirmed || input.likelyMobile;

  for (const intent of intents) {
    const signalMatch = includesAny(input.leadText, intent.leadSignals);
    if (intent.key === 'site' && weakWebsite && signalMatch) {
      scoreDelta += 16;
      matchedLabels.push('site/presenca digital');
      continue;
    }
    if (intent.key === 'whatsapp' && hasDirectContact && signalMatch) {
      scoreDelta += 14;
      matchedLabels.push('WhatsApp/atendimento');
      continue;
    }
    if (intent.key === 'sistema' && signalMatch) {
      scoreDelta += 12;
      matchedLabels.push('sistema/gestao');
      continue;
    }
    if (intent.key === 'marketing' && (input.hasSocial || weakWebsite) && signalMatch) {
      scoreDelta += 10;
      matchedLabels.push('marketing');
      continue;
    }
    if (signalMatch) {
      scoreDelta += 8;
      matchedLabels.push(intent.key);
    }
  }

  if (matchedLabels.length) {
    input.reasons.push(`O que voce vende combina com este card: ${Array.from(new Set(matchedLabels)).slice(0, 2).join(', ')}.`);
    return { scoreDelta: Math.min(18, scoreDelta), matched: true };
  }

  return { scoreDelta: -3, matched: false };
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
    qualityMode?: LeadQualityV2QualityMode | string | null;
    now?: Date;
    salesProfile?: LeadQualityV2SalesProfile | null;
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
  const websiteAvailable = Boolean(website) && !['broken', 'unreachable', 'none'].includes(websiteStatus);
  const channelAvailability: Record<LeadQualityV2Channel, boolean> = {
    whatsapp: whatsappConfirmed || likelyMobile,
    phone: phoneValid,
    email: emailConfirmed || emailProbable,
    website: websiteAvailable,
    instagram: Boolean(instagramUrl),
    facebook: Boolean(facebookUrl),
  };
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
  const salesProfile = input.context?.salesProfile || null;

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
  let segmentFitScore = clampScore(segmentFit.score);
  const profileTargetAudience = normalizeStringArray(salesProfile?.targetAudience);
  const profileTargetSegments = normalizeSegmentArray(salesProfile?.targetSegments);
  const profileAvoidSegments = normalizeSegmentArray(salesProfile?.avoidSegments);
  const profileHardRejectSegments = normalizeSegmentArray(salesProfile?.hardRejectSegments);
  const profilePreferredCities = normalizeStringArray(salesProfile?.preferredCities);
  const profilePreferredStates = normalizeStringArray(salesProfile?.preferredStates).map((state) => state.toUpperCase());
  const profilePreferredChannels = normalizeChannels(salesProfile?.preferredChannels);
  const profileRequiredChannels = normalizeChannels(salesProfile?.requiredChannels);
  const explicitChannelMatchMode = normalizeChannelMatchMode(salesProfile?.channelMatchMode);
  const channelMatchMode = profileRequiredChannels.length && explicitChannelMatchMode === 'prefer'
    ? 'all_required'
    : explicitChannelMatchMode;
  const qualityMode: LeadQualityV2QualityMode = normalizeKey(input.context?.qualityMode || salesProfile?.qualityMode) === 'lead_plus' ? 'lead_plus' : 'list';
  const preferredChannelMatches = profilePreferredChannels.filter((channel) => channelAvailability[channel]);
  const missingRequiredChannels = profileRequiredChannels.filter((channel) => !channelAvailability[channel]);
  const requiredChannelMatched = profileRequiredChannels.some((channel) => channelAvailability[channel]);
  const targetSegmentFit = scoreTargetSegmentFit(profileTargetSegments, leadText);
  const profileMatchesTargetSegment = targetSegmentFit.matched;
  const profileMatchesAvoidSegment = profileAvoidSegments.some((segment) => leadText.includes(normalizeKey(segment)));
  const profileMatchesHardReject = profileHardRejectSegments.some((segment) => leadText.includes(normalizeKey(segment)));
  const audienceFit = scoreAudienceFit({ targetAudience: profileTargetAudience, leadText, reasons });
  const profileCity = normalizeKey(row?.city);
  const profileState = normalizeText(row?.state).toUpperCase();
  const profilePreferredCityMatch = profilePreferredCities.some((city) => profileCity === normalizeKey(city));
  const profilePreferredStateMatch = profilePreferredStates.some((state) => profileState === state);
  const hasLocationPreference = profilePreferredCities.length > 0 || profilePreferredStates.length > 0;
  const cityMatchesPreference = !profilePreferredCities.length || profilePreferredCityMatch;
  const stateMatchesPreference = !profilePreferredStates.length || profilePreferredStateMatch;
  const outOfPreferredLocation = hasLocationPreference && (!cityMatchesPreference || !stateMatchesPreference);
  const shouldDiscardOutOfCity = outOfPreferredLocation && (qualityMode === 'lead_plus' || profileHasNegativeRule(salesProfile, 'avoidOutOfCity'));
  if (profileMatchesTargetSegment) {
    segmentFitScore = clampScore(segmentFitScore + 16);
    reasons.push('Segmento prioritario no seu perfil.');
    reasons.push('Combina com seu Perfil de Venda.');
  }
  if (audienceFit.scoreDelta) {
    segmentFitScore = clampScore(segmentFitScore + audienceFit.scoreDelta);
  }
  if (profileMatchesAvoidSegment) {
    segmentFitScore = clampScore(segmentFitScore - 35);
    reasons.push('Evita perfil configurado pelo vendedor.');
  }
  if (profileMatchesHardReject) {
    segmentFitScore = Math.min(segmentFitScore, 10);
    reasons.push('Evita perfil configurado pelo vendedor.');
  }
  if (profilePreferredCities.length && profilePreferredCityMatch) {
    segmentFitScore = clampScore(segmentFitScore + 6);
  }
  if (profilePreferredStates.length && profilePreferredStateMatch) {
    segmentFitScore = clampScore(segmentFitScore + 4);
  }

  let contactabilityScore = 0;
  if (whatsappConfirmed) contactabilityScore += 72;
  else if (likelyMobile) contactabilityScore += 40;
  else if (phoneValid) contactabilityScore += 33;
  if (emailConfirmed) contactabilityScore += 20;
  else if (emailProbable) contactabilityScore += 13;
  if (hasSocial) contactabilityScore += 12;
  if (preferredChannelMatches.length) {
    contactabilityScore += Math.min(14, preferredChannelMatches.length * 5);
    reasons.push(`Canal preferido disponivel: ${preferredChannelMatches.map((channel) => CHANNEL_LABELS[channel]).join(', ')}.`);
  }
  if (profileHasPreference(salesProfile, 'preferInstagram') && instagramUrl) {
    contactabilityScore += 8;
    reasons.push('Combina com seu Perfil de Venda.');
  }
  if (profileHasPreference(salesProfile, 'preferWhatsapp') && (whatsappConfirmed || likelyMobile)) {
    contactabilityScore += 10;
    reasons.push('Canal preferido: WhatsApp.');
  }
  if (normalizeText(row?.googleMapsUrl || row?.signals?.googleMapsUrl)) contactabilityScore += 8;
  if (!phoneValid) contactabilityScore -= 20;
  if (whatsappUnavailable) contactabilityScore -= 24;
  if (phoneValid && !likelyMobile && !whatsappConfirmed) contactabilityScore -= 8;
  if (!phoneValid && !whatsappConfirmed && !emailConfirmed && !emailProbable && !hasSocial) contactabilityScore -= 8;
  contactabilityScore = clampScore(contactabilityScore);
  if (whatsappConfirmed || likelyMobile) reasons.push(whatsappConfirmed ? 'WhatsApp confirmado.' : 'WhatsApp provavel por celular valido.');
  if (emailConfirmed || emailProbable) reasons.push(emailConfirmed ? 'E-mail confirmado.' : 'E-mail provavel.');
  if (hasSocial) reasons.push(instagramUrl && !website ? 'Instagram encontrado, mas site ausente.' : 'Rede social encontrada.');

  const playbookKnown = Boolean(resolveSegmentIntent(row?.segment || input.context?.requestedSegment)) || includesAny(leadText, ['clinica', 'oficina', 'restaurante', 'salao', 'barbearia', 'pet', 'imobiliaria']);
  const offerFit = scoreOfferFit({
    salesProfile,
    leadText,
    websiteStatus,
    website,
    hasSocial,
    whatsappConfirmed,
    likelyMobile,
    reasons,
  });
  let commercialIntentScore = 25;
  if (!website || websiteStatus === 'none') commercialIntentScore += 22;
  if (['weak', 'broken', 'unreachable', 'social_only'].includes(websiteStatus)) commercialIntentScore += 18;
  if (hasSocial && (!website || ['none', 'weak', 'social_only'].includes(websiteStatus))) commercialIntentScore += 14;
  if (Number(row?.rating || 0) >= 4.2) commercialIntentScore += 8;
  if (Number(row?.reviews || 0) >= 20) commercialIntentScore += 8;
  if (profileHasPreference(salesProfile, 'preferNoWebsite') && (!website || ['none', 'weak', 'social_only'].includes(websiteStatus))) {
    commercialIntentScore += 14;
    reasons.push('Boa oportunidade para o que voce vende.');
  }
  if (profileHasPreference(salesProfile, 'preferInstagram') && instagramUrl) commercialIntentScore += 8;
  if (profileHasPreference(salesProfile, 'preferHighReviews')) {
    const minRating = Number((salesProfile?.leadPreferences || {}).minRating || 0);
    const minReviews = Number((salesProfile?.leadPreferences || {}).minReviews || 0);
    if ((!minRating || Number(row?.rating || 0) >= minRating) && (!minReviews || Number(row?.reviews || 0) >= minReviews)) {
      commercialIntentScore += 6;
    }
  }
  if (offerFit.scoreDelta) commercialIntentScore += offerFit.scoreDelta;
  if (audienceFit.matched) commercialIntentScore += 4;
  if (whatsappConfirmed || likelyMobile) commercialIntentScore += 8;
  if (playbookKnown) commercialIntentScore += 8;
  if (normalizeText(row?.painType || row?.signals?.painType || row?.opportunityReason)) commercialIntentScore += 8;
  commercialIntentScore = clampScore(commercialIntentScore);
  if ((!website || websiteStatus === 'none') && hasSocial) reasons.push('Rede social ativa sem site forte aumenta oportunidade comercial.');
  else if (!website || websiteStatus === 'none') reasons.push('Sem site: oportunidade para organizar presenca e atendimento.');
  if (Number(row?.reviews || 0) >= 20) reasons.push('Boa avaliacao e reviews indicam demanda local.');

  let riskScore = 0;
  const protectionReasons: string[] = [];
  const publicSectorLike = includesAny(leadText, ['prefeitura', 'camara municipal', 'governo', 'secretaria municipal', 'orgao publico', 'ministerio']);
  const largeCompanyLike = includesAny(leadText, ['multinacional', 'franquia nacional', 'shopping', 'grupo empresarial', 'holding', 'banco']);
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
  if (profileHasNegativeRule(salesProfile, 'avoidDirectories') && directoryLike) riskScore += 35;
  if (profileHasNegativeRule(salesProfile, 'avoidPublicSector') && publicSectorLike) {
    riskScore += 55;
    protectionReasons.push('orgao publico');
    reasons.push('Evita perfil configurado pelo vendedor.');
  }
  if ((profileHasNegativeRule(salesProfile, 'avoidLargeCompanies') || profileHasPreference(salesProfile, 'preferSmallBusiness')) && largeCompanyLike) {
    riskScore += 28;
    reasons.push('Evita perfil configurado pelo vendedor.');
  }
  if (profileHasNegativeRule(salesProfile, 'avoidNoPhone') && !phoneValid) {
    riskScore += 70;
    protectionReasons.push('sem telefone');
  }
  if (profileHasNegativeRule(salesProfile, 'avoidNoWhatsapp') && !whatsappConfirmed && !likelyMobile) {
    riskScore += 45;
    protectionReasons.push('sem WhatsApp');
  }
  if (shouldDiscardOutOfCity) {
    riskScore += 60;
    protectionReasons.push('fora da cidade configurada');
  }
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
  let finalRankScore = clampScore(
    opportunityScore * 0.30 +
    contactabilityScore * 0.25 +
    segmentFitScore * 0.20 +
    commercialIntentScore * 0.15 +
    freshnessScore * 0.10 -
    riskPenalty,
  );
  if (preferredChannelMatches.length) {
    finalRankScore = clampScore(finalRankScore + Math.min(10, preferredChannelMatches.length * 4));
  }
  if (shouldDiscardOutOfCity) {
    finalRankScore = Math.min(finalRankScore, 35);
  }

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
  if (profilePreferredChannels.includes('whatsapp') && (whatsappConfirmed || likelyMobile)) {
    recommendedChannel = 'whatsapp';
  } else if (profilePreferredChannels.includes('instagram') && instagramUrl && recommendedChannel === 'review') {
    recommendedChannel = 'review';
  } else if (profilePreferredChannels.includes('email') && (emailConfirmed || emailProbable)) {
    recommendedChannel = 'email';
  } else if (profilePreferredChannels.includes('phone') && phoneValid) {
    recommendedChannel = 'call';
  }

  let decision: LeadQualityV2Decision = 'review';
  let discardReason: string | null = null;
  let protectionReason: string | null = null;
  if ((riskScore >= 80 && !shouldDiscardOutOfCity) || protectedStatus) {
    decision = 'protect';
    protectionReason = protectionReasons.join(', ') || 'protected_status';
    reasons.push(`Protegido: ${protectionReason}.`);
  } else if (directoryLike) {
    decision = 'discard';
    discardReason = 'generic_directory';
  } else if (identityScore < 35) {
    decision = 'discard';
    discardReason = 'weak_identity';
  } else if (profileMatchesHardReject) {
    decision = 'discard';
    discardReason = 'segment_mismatch';
  } else if (profileHasNegativeRule(salesProfile, 'avoidPublicSector') && publicSectorLike) {
    decision = 'discard';
    discardReason = 'segment_mismatch';
  } else if (profileHasNegativeRule(salesProfile, 'avoidNoPhone') && !phoneValid) {
    decision = 'discard';
    discardReason = 'weak_contactability';
  } else if (profileHasNegativeRule(salesProfile, 'avoidNoWhatsapp') && !whatsappConfirmed && !likelyMobile) {
    decision = qualityMode === 'lead_plus' ? 'discard' : 'review';
    discardReason = qualityMode === 'lead_plus' ? 'weak_contactability' : null;
    finalRankScore = Math.min(finalRankScore, qualityMode === 'lead_plus' ? 35 : 45);
  } else if (shouldDiscardOutOfCity) {
    decision = 'discard';
    discardReason = 'location_mismatch';
    reasons.push('Descartado: fora da cidade configurada.');
  } else if (qualityMode === 'lead_plus' && profileTargetSegments.length && (!profileMatchesTargetSegment || !targetSegmentFit.strong)) {
    decision = 'discard';
    discardReason = 'segment_mismatch';
    finalRankScore = Math.min(finalRankScore, 35);
  } else if (qualityMode === 'lead_plus' && profilePreferredChannels.includes('whatsapp') && !whatsappConfirmed && !likelyMobile) {
    decision = 'review';
    discardReason = null;
    finalRankScore = Math.min(finalRankScore, 45);
  } else if (segmentFit.group === 'reject' || (normalizeKey(input.context?.requestedSegment) && segmentFitScore < 25)) {
    decision = 'discard';
    discardReason = 'segment_mismatch';
  } else if (!phoneValid && contactabilityScore < 25 && !emailConfirmed && !emailProbable && !hasSocial) {
    decision = 'discard';
    discardReason = 'weak_contactability';
  } else if (qualityMode === 'lead_plus') {
    decision =
      identityScore >= 60 &&
      segmentFitScore >= 65 &&
      contactabilityScore >= 55 &&
      riskScore < 40 &&
      finalRankScore >= 68 &&
      recommendedChannel !== 'discard'
        ? 'deliver'
        : 'review';
  } else if (identityScore >= 45 && contactabilityScore >= 25 && segmentFitScore >= 38 && riskScore < 60) {
    decision = 'deliver';
  } else {
    decision = 'review';
  }

  const requiredChannelRuleFailed = profileRequiredChannels.length > 0 && (
    (channelMatchMode === 'any_required' && !requiredChannelMatched) ||
    (channelMatchMode === 'all_required' && missingRequiredChannels.length > 0)
  );
  if (requiredChannelRuleFailed && decision !== 'protect') {
    const absentChannelKeys = channelMatchMode === 'any_required' ? profileRequiredChannels : missingRequiredChannels;
    const absentChannels = absentChannelKeys.map((channel) => CHANNEL_LABELS[channel]);
    reasons.push(`Canal obrigatório ausente após enriquecimento: ${absentChannels.join('/')}.`);
    const onlyMissingSocial = absentChannelKeys.length > 0 && absentChannelKeys.every((channel) => channel === 'instagram' || channel === 'facebook');
    const hasStrongDirectContact = whatsappConfirmed || likelyMobile || phoneValid || emailConfirmed || emailProbable;
    decision = qualityMode === 'list' || (qualityMode === 'lead_plus' && onlyMissingSocial && hasStrongDirectContact)
      ? 'review'
      : 'discard';
    discardReason = decision === 'discard' ? 'required_channel_missing' : null;
    if (decision === 'discard') finalRankScore = Math.min(finalRankScore, 39);
    else finalRankScore = Math.min(finalRankScore, qualityMode === 'lead_plus' ? 45 : finalRankScore);
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
    channelAvailability,
    productFit: {
      listFit,
      leadFit,
      botFit,
      recoveryFit,
      websiteFit,
    },
  };
}
