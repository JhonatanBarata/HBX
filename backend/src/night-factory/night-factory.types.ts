export type NightFactoryStatus = 'dormindo' | 'rodando' | 'pausado' | 'erro';

export type NightFactoryConfig = {
  enabled: boolean;
  startHour: number;
  endHour: number;
  maxConcurrency: number;
  batchSize: number;
  maxLeadsPerNight: number;
  enrichOnlyNewLeads: boolean;
  allowWebsiteFetch: boolean;
  allowScreenshot: boolean;
  allowAiSuggestions: boolean;
  allowRecoveryRevival: boolean;
  allowVendasQueuePush: boolean;
  cpuSoftLimitPercent: number;
  memorySoftLimitPercent: number;
};

export type HbxOpportunityLevel = 'baixo' | 'medio' | 'bom' | 'premium';

export type HbxOpportunityScoreResult = {
  opportunityScore: number;
  opportunityLevel: HbxOpportunityLevel;
  digitalPresenceScore: number;
  opportunityReason: string;
  recommendedOffer: string;
  suggestedApproach: string;
  suggestedWhatsappMessage: string;
  suggestedHumanOpening: string;
  detectedProblems: string[];
  detectedAssets: string[];
  segmentPlaybookKey: string | null;
};

export const DEFAULT_NIGHT_FACTORY_CONFIG: NightFactoryConfig = {
  enabled: true,
  startHour: 0,
  endHour: 6,
  maxConcurrency: 2,
  batchSize: 50,
  maxLeadsPerNight: 600,
  enrichOnlyNewLeads: true,
  allowWebsiteFetch: false,
  allowScreenshot: false,
  allowAiSuggestions: false,
  allowRecoveryRevival: true,
  allowVendasQueuePush: false,
  cpuSoftLimitPercent: 75,
  memorySoftLimitPercent: 78,
};

type SegmentPlaybook = {
  key: string;
  keywords: string[];
  pain: string;
  offer: string;
  approach: string;
  questions: string[];
};

export const SEGMENT_PLAYBOOKS: SegmentPlaybook[] = [
  {
    key: 'dentista',
    keywords: ['dentista', 'odont', 'clinica odontologica'],
    pain: 'agenda, orçamento e retorno de pacientes',
    offer: 'HBX WhatsApp + Bot IA',
    approach: 'Vi que clínicas costumam perder orçamento quando o WhatsApp fica escondido ou sem triagem rápida.',
    questions: ['Hoje vocês conseguem responder orçamento fora do horário?', 'Quem pediu valor recebe retorno depois?'],
  },
  {
    key: 'clinica',
    keywords: ['clinica', 'estetica', 'medico', 'saude', 'fisioterapia', 'psicologia'],
    pain: 'agendamento, captação e recuperação de interessados',
    offer: 'HBX WhatsApp + Bot IA',
    approach: 'Vi que vocês aparecem na cidade, mas o caminho até atendimento pode virar mais agenda com automação.',
    questions: ['Quantos contatos chegam pelo WhatsApp por dia?', 'Há follow-up automático para quem pediu preço?'],
  },
  {
    key: 'oficina',
    keywords: ['oficina', 'auto', 'mecanica', 'funilaria', 'pneus'],
    pain: 'orçamento e retorno de serviços',
    offer: 'HBX Vendas + WhatsApp',
    approach: 'Vi que oficinas perdem muito orçamento quando o retorno não fica organizado.',
    questions: ['Vocês acompanham orçamento sem resposta?', 'O cliente recebe lembrete para aprovar serviço?'],
  },
  {
    key: 'restaurante',
    keywords: ['restaurante', 'pizzaria', 'lanchonete', 'delivery', 'hamburgueria', 'bar'],
    pain: 'pedido, cardápio e retorno de cliente',
    offer: 'HBX WhatsApp',
    approach: 'WhatsApp pode virar canal de pedido organizado quando cardápio e retorno ficam claros.',
    questions: ['O cardápio está fácil no WhatsApp?', 'Pedidos abandonados recebem retorno?'],
  },
  {
    key: 'imobiliaria',
    keywords: ['imobiliaria', 'imovel', 'corretor', 'condominio'],
    pain: 'triagem de interessados e prioridade comercial',
    offer: 'HBX Bot IA',
    approach: 'O bot separa curioso de comprador e entrega para o vendedor quem tem mais chance.',
    questions: ['Vocês qualificam renda, bairro e urgência antes do vendedor?', 'Existe fila de follow-up?'],
  },
  {
    key: 'advogado',
    keywords: ['advogado', 'advocacia', 'juridico'],
    pain: 'triagem inicial e agendamento seguro',
    offer: 'HBX Atendimento + Bot IA',
    approach: 'Organizar o primeiro contato ajuda a não perder prazo nem lead quente.',
    questions: ['O primeiro atendimento já separa área e urgência?', 'Há retorno para quem chamou fora do horário?'],
  },
];

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function safeText(value: unknown, max = 220) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalize(value: unknown) {
  return safeText(value, 260)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function hasLikelyMobile(phoneDigits: unknown) {
  const digits = String(phoneDigits || '').replace(/\D/g, '');
  const national = digits.startsWith('55') ? digits.slice(2) : digits;
  return national.length === 11 && national[2] === '9';
}

function resolvePlaybook(segment: unknown) {
  const normalized = normalize(segment);
  return SEGMENT_PLAYBOOKS.find((playbook) => playbook.keywords.some((keyword) => normalized.includes(normalize(keyword)))) || null;
}

function resolveLevel(score: number): HbxOpportunityLevel {
  if (score >= 85) return 'premium';
  if (score >= 65) return 'bom';
  if (score >= 40) return 'medio';
  return 'baixo';
}

export function calculateHbxOpportunityScore(lead: any, enrichment: any = {}, context: { targetCities?: string[] } = {}): HbxOpportunityScoreResult {
  const playbook = resolvePlaybook(lead?.segment || lead?.normalizedSegment);
  const website = safeText(enrichment.websiteUrl || lead?.website, 500);
  const websiteStatus = normalize(enrichment.websiteStatus || lead?.websiteStatus || (website ? 'present' : 'none'));
  const status = normalize(lead?.status);
  const city = normalize(lead?.city || lead?.normalizedCity);
  const targetCities = (context.targetCities || []).map(normalize).filter(Boolean);
  const detectedProblems: string[] = [];
  const detectedAssets: string[] = [];
  let score = 20;
  let digitalPresenceScore = 35;

  if (!website || websiteStatus === 'none') {
    score += 20;
    digitalPresenceScore -= 20;
    detectedProblems.push('sem site encontrado');
  } else {
    digitalPresenceScore += 18;
    detectedAssets.push('site encontrado');
  }

  if (['weak', 'broken', 'unreachable'].includes(websiteStatus)) {
    score += 15;
    digitalPresenceScore -= websiteStatus === 'weak' ? 12 : 22;
    detectedProblems.push(websiteStatus === 'weak' ? 'site fraco' : 'site quebrado ou inacessível');
  }

  if (websiteStatus === 'social_only') {
    score += 10;
    digitalPresenceScore -= 8;
    detectedProblems.push('presença baseada só em rede social');
  }

  const hasWhatsapp = Boolean(enrichment.hasWhatsappOnSite || enrichment.whatsappFound);
  if (!hasWhatsapp) {
    score += 15;
    detectedProblems.push('WhatsApp não aparece no site');
  } else {
    digitalPresenceScore += 10;
    detectedAssets.push('WhatsApp visível');
  }

  const reviews = Number(lead?.reviews || 0);
  if (reviews >= 40) {
    score += 10;
    detectedAssets.push('boas avaliações');
  } else if (reviews >= 10) {
    score += 6;
    detectedAssets.push('avaliações suficientes');
  }

  if (playbook) score += 10;
  if (targetCities.length && targetCities.includes(city)) score += 10;

  const hasInstagram = Boolean(enrichment.hasInstagram || enrichment.instagramUrl || String(lead?.sourceUrl || '').includes('instagram'));
  if (hasInstagram && (!website || ['weak', 'broken', 'unreachable', 'none'].includes(websiteStatus))) {
    score += 10;
    detectedProblems.push('Instagram existe, mas o site não ajuda a vender');
    detectedAssets.push('Instagram encontrado');
  }

  if (hasLikelyMobile(lead?.phoneDigits || lead?.phone)) {
    score += 10;
    detectedAssets.push('celular/WhatsApp provável');
  } else {
    score -= 40;
    detectedProblems.push('telefone fraco ou inválido');
  }

  if (enrichment.hasLeadCaptureForm && enrichment.formLooksBroken) {
    score += 10;
    detectedProblems.push('formulário parece quebrado');
  }

  if (enrichment.hasBookingLink || enrichment.hasCatalog || enrichment.hasMenu || enrichment.hasPaymentLink) {
    digitalPresenceScore += 8;
    detectedAssets.push('ativo digital comercial encontrado');
  }

  if (['complaint', 'reclamacao'].includes(status)) {
    score -= 50;
    detectedProblems.push('lead com reclamação/complaint');
  }
  if (['denied', 'negado', 'opt out', 'opt-out'].includes(status)) {
    score -= 40;
    detectedProblems.push('lead negado ou bloqueado');
  }
  if (['duplicate', 'duplicado'].includes(status)) score -= 30;
  if (!safeText(lead?.name, 80) || normalize(lead?.name).length < 3) score -= 20;
  if (normalize(lead?.name).includes('empresa') || normalize(lead?.name).includes('sem nome')) score -= 20;

  const opportunityScore = clampScore(score);
  digitalPresenceScore = clampScore(digitalPresenceScore);
  const opportunityLevel = resolveLevel(opportunityScore);
  const offer = playbook?.offer || (detectedProblems.some((item) => item.includes('site')) ? 'HBX Website + WhatsApp' : 'HBX Vendas + Bot IA');
  const leadName = safeText(lead?.name, 90) || 'essa empresa';
  const segment = safeText(lead?.segment || lead?.normalizedSegment, 80) || 'seu segmento';
  const firstProblem = detectedProblems[0] || 'há espaço para melhorar a conversão digital';
  const approach = playbook?.approach || `Vi sinais de oportunidade em ${segment}: ${firstProblem}.`;
  const suggestedWhatsappMessage = `Olá, tudo bem? Vi a ${leadName} e notei que ${firstProblem}. O HBX ajuda a transformar esses contatos em atendimento e vendas organizadas. Posso te mostrar uma ideia rápida?`;
  const suggestedHumanOpening = `Abrir falando do problema principal: ${firstProblem}. Oferta sugerida: ${offer}.`;

  return {
    opportunityScore,
    opportunityLevel,
    digitalPresenceScore,
    opportunityReason: detectedProblems.length
      ? detectedProblems.slice(0, 4).join(', ')
      : 'lead com presença digital suficiente para abordagem comercial',
    recommendedOffer: offer,
    suggestedApproach: approach,
    suggestedWhatsappMessage,
    suggestedHumanOpening,
    detectedProblems,
    detectedAssets,
    segmentPlaybookKey: playbook?.key || null,
  };
}
