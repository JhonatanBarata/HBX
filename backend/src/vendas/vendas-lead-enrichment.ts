type AvailabilityStatus = 'unknown' | 'available' | 'unavailable';

export type VendasLeadIntelligenceInput = {
  lead: any;
  whatsappAvailability?: { status?: AvailabilityStatus | string | null; checkedAt?: string | null } | null;
  verifiedBy?: 'hbx_master' | 'client_engine' | 'manual' | null;
  templateOffset?: number;
};

type PrimarySocial = 'instagram' | 'facebook' | 'both' | null;

type TemplateContext =
  | 'primeiro_contato'
  | 'sem_site'
  | 'comercio_local'
  | 'servico_local'
  | 'follow_up'
  | 'retorno'
  | 'direta'
  | 'educada';

type MessageTemplate = {
  id: string;
  context: TemplateContext;
  tone: 'direto' | 'educado' | 'consultivo' | 'leve';
  segments: string[];
  text: string;
};

const GENERIC_SEGMENTS = ['geral'];

export const VENDAS_LEAD_MESSAGE_TEMPLATES: MessageTemplate[] = [
  { id: 'oficina-01', context: 'primeiro_contato', tone: 'consultivo', segments: ['oficina', 'automotivo'], text: 'Olá, tudo bem? Vi a {leadName} em {city} e queria te mostrar uma forma simples de organizar os contatos que chegam pelo WhatsApp e não perder oportunidades.' },
  { id: 'oficina-02', context: 'direta', tone: 'direto', segments: ['oficina', 'automotivo'], text: 'Oi! Falo com a {leadName}? Trabalho com uma solução para oficina acompanhar orçamentos, retornos e clientes que chamam no WhatsApp. Posso te mostrar rapidamente?' },
  { id: 'oficina-03', context: 'sem_site', tone: 'educado', segments: ['oficina', 'automotivo'], text: 'Olá! Encontrei a {leadName} e percebi que o atendimento parece bem concentrado no contato direto. Posso te mostrar uma forma de organizar melhor os pedidos e retornos?' },
  { id: 'oficina-04', context: 'follow_up', tone: 'leve', segments: ['oficina', 'automotivo'], text: 'Oi, passando só para retomar meu contato. A ideia é ajudar a {leadName} a não perder orçamento e retorno de cliente no WhatsApp. Faz sentido conversarmos 5 minutos?' },
  { id: 'saude-01', context: 'primeiro_contato', tone: 'educado', segments: ['saude', 'clinica', 'odontologia'], text: 'Olá, tudo bem? Vi a {leadName} em {city}. A HBX ajuda clínicas a organizar contatos, retornos e interessados que chegam pelo WhatsApp. Posso te enviar uma apresentação curta?' },
  { id: 'saude-02', context: 'educada', tone: 'educado', segments: ['saude', 'clinica', 'odontologia'], text: 'Olá! Desculpe chamar por aqui. Vi a {leadName} e acredito que posso ajudar na organização dos atendimentos e retornos pelo WhatsApp. Quem seria a melhor pessoa para falar?' },
  { id: 'saude-03', context: 'retorno', tone: 'consultivo', segments: ['saude', 'clinica', 'odontologia'], text: 'Oi, retomo por aqui conforme disponibilidade. A proposta é simples: centralizar interessados, retornos e histórico para a equipe não perder pacientes pelo WhatsApp.' },
  { id: 'beleza-01', context: 'primeiro_contato', tone: 'leve', segments: ['beleza', 'estetica', 'salao'], text: 'Olá! Vi a {leadName} em {city}. A HBX ajuda negócios de beleza a organizar agenda, interessados e retornos que chegam pelo WhatsApp. Posso te mostrar?' },
  { id: 'beleza-02', context: 'sem_site', tone: 'consultivo', segments: ['beleza', 'estetica', 'salao'], text: 'Oi! Encontrei a {leadName} e vi oportunidade de melhorar a captação pelo WhatsApp. Mesmo sem site, dá para organizar contatos e retornos de forma simples.' },
  { id: 'beleza-03', context: 'direta', tone: 'direto', segments: ['beleza', 'estetica', 'salao'], text: 'Oi, tudo bem? Você cuida do atendimento da {leadName}? Tenho uma solução para organizar mensagens, retornos e clientes interessados. Posso explicar rápido?' },
  { id: 'alimentacao-01', context: 'primeiro_contato', tone: 'consultivo', segments: ['alimentacao', 'restaurante', 'lanchonete', 'mercado'], text: 'Olá! Vi a {leadName} em {city}. A HBX ajuda comércios locais a organizar pedidos, dúvidas e contatos pelo WhatsApp. Posso te mostrar em poucos minutos?' },
  { id: 'alimentacao-02', context: 'comercio_local', tone: 'direto', segments: ['alimentacao', 'restaurante', 'lanchonete', 'mercado'], text: 'Oi! Falo com a {leadName}? Tenho uma ferramenta simples para comércio local não perder contato, pedido ou orçamento no WhatsApp.' },
  { id: 'alimentacao-03', context: 'follow_up', tone: 'leve', segments: ['alimentacao', 'restaurante', 'lanchonete', 'mercado'], text: 'Oi, passando para retomar. Minha ideia é mostrar como a {leadName} pode organizar melhor os contatos do WhatsApp e responder oportunidades no tempo certo.' },
  { id: 'construcao-01', context: 'primeiro_contato', tone: 'consultivo', segments: ['construcao', 'material', 'engenharia', 'reforma'], text: 'Olá, tudo bem? Vi a {leadName} em {city}. A HBX ajuda empresas de construção e serviços a organizar orçamentos, retornos e interessados no WhatsApp.' },
  { id: 'construcao-02', context: 'direta', tone: 'direto', segments: ['construcao', 'material', 'engenharia', 'reforma'], text: 'Oi! Você atende os orçamentos da {leadName}? Posso te mostrar um jeito simples de acompanhar contatos, retornos e oportunidades comerciais.' },
  { id: 'construcao-03', context: 'sem_site', tone: 'educado', segments: ['construcao', 'material', 'engenharia', 'reforma'], text: 'Olá! Encontrei a {leadName} e vi espaço para transformar o WhatsApp em uma fila comercial mais organizada, mesmo sem depender de site.' },
  { id: 'pet-01', context: 'primeiro_contato', tone: 'leve', segments: ['pet', 'veterinaria'], text: 'Olá! Vi a {leadName} em {city}. A HBX ajuda negócios pet a organizar atendimentos, retornos e interessados pelo WhatsApp. Posso te mostrar?' },
  { id: 'pet-02', context: 'educada', tone: 'educado', segments: ['pet', 'veterinaria'], text: 'Oi, tudo bem? Quem cuida dos contatos da {leadName}? Tenho uma solução simples para organizar conversas, retornos e clientes pelo WhatsApp.' },
  { id: 'educacao-01', context: 'primeiro_contato', tone: 'consultivo', segments: ['educacao', 'curso', 'escola'], text: 'Olá! Vi a {leadName} em {city}. A HBX ajuda escolas e cursos a organizar interessados, retornos e matrículas que começam pelo WhatsApp.' },
  { id: 'educacao-02', context: 'follow_up', tone: 'educado', segments: ['educacao', 'curso', 'escola'], text: 'Oi, retomo meu contato. A proposta é ajudar a {leadName} a acompanhar interessados e retornos sem deixar conversas perdidas no WhatsApp.' },
  { id: 'imobiliaria-01', context: 'primeiro_contato', tone: 'consultivo', segments: ['imobiliaria', 'corretor'], text: 'Olá! Vi a {leadName} em {city}. A HBX ajuda imobiliárias a organizar leads, retornos e interessados que entram pelo WhatsApp.' },
  { id: 'imobiliaria-02', context: 'direta', tone: 'direto', segments: ['imobiliaria', 'corretor'], text: 'Oi! Falo com a {leadName}? Tenho uma solução para organizar interessados em imóveis, retornos e contatos sem resposta. Posso explicar rápido?' },
  { id: 'servico-01', context: 'servico_local', tone: 'consultivo', segments: ['servico', 'assistencia', 'limpeza', 'seguranca'], text: 'Olá! Encontrei a {leadName} em {city}. A HBX ajuda prestadores de serviço a transformar WhatsApp em fila de oportunidades e retornos.' },
  { id: 'servico-02', context: 'primeiro_contato', tone: 'educado', segments: ['servico', 'assistencia', 'limpeza', 'seguranca'], text: 'Oi, tudo bem? Vi a {leadName} e queria apresentar uma forma simples de organizar contatos, pedidos de orçamento e próximos passos no WhatsApp.' },
  { id: 'servico-03', context: 'retorno', tone: 'leve', segments: ['servico', 'assistencia', 'limpeza', 'seguranca'], text: 'Oi, passando para retomar. A ideia é ajudar a {leadName} a responder e acompanhar oportunidades do WhatsApp com mais controle.' },
  { id: 'varejo-01', context: 'comercio_local', tone: 'consultivo', segments: ['varejo', 'loja', 'moda', 'otica'], text: 'Olá! Vi a {leadName} em {city}. A HBX ajuda lojas a organizar clientes, pedidos e retornos que chegam pelo WhatsApp.' },
  { id: 'varejo-02', context: 'direta', tone: 'direto', segments: ['varejo', 'loja', 'moda', 'otica'], text: 'Oi! Você cuida do atendimento da {leadName}? Posso te mostrar uma ferramenta simples para não perder venda ou retorno no WhatsApp.' },
  { id: 'varejo-03', context: 'sem_site', tone: 'educado', segments: ['varejo', 'loja', 'moda', 'otica'], text: 'Olá! Encontrei a {leadName}; mesmo sem site forte, dá para organizar melhor os contatos do WhatsApp e priorizar quem chamar primeiro.' },
  { id: 'contabil-01', context: 'primeiro_contato', tone: 'consultivo', segments: ['contabilidade', 'consultoria', 'juridico'], text: 'Olá, tudo bem? Vi a {leadName} em {city}. A HBX ajuda equipes comerciais a organizar contatos, retornos e oportunidades no WhatsApp.' },
  { id: 'contabil-02', context: 'educada', tone: 'educado', segments: ['contabilidade', 'consultoria', 'juridico'], text: 'Oi! Desculpe chamar direto. Quem seria a melhor pessoa na {leadName} para falar sobre organização de contatos e oportunidades comerciais?' },
  { id: 'turismo-01', context: 'primeiro_contato', tone: 'leve', segments: ['turismo', 'hotel', 'pousada', 'viagem'], text: 'Olá! Vi a {leadName} em {city}. A HBX ajuda negócios de turismo a organizar interessados, reservas e retornos pelo WhatsApp.' },
  { id: 'turismo-02', context: 'follow_up', tone: 'educado', segments: ['turismo', 'hotel', 'pousada', 'viagem'], text: 'Oi, retomo rapidamente. A ideia é ajudar a {leadName} a não perder interessados que chamam pelo WhatsApp e precisam de retorno.' },
  { id: 'geral-01', context: 'primeiro_contato', tone: 'consultivo', segments: GENERIC_SEGMENTS, text: 'Olá, tudo bem? Vi a {leadName} em {city} e acredito que posso mostrar uma forma simples de organizar melhor contatos e oportunidades pelo WhatsApp.' },
  { id: 'geral-02', context: 'direta', tone: 'direto', segments: GENERIC_SEGMENTS, text: 'Oi! Falo com a {leadName}? Tenho uma solução para organizar contatos comerciais, retornos e conversas sem resposta. Posso explicar em poucos minutos?' },
  { id: 'geral-03', context: 'educada', tone: 'educado', segments: GENERIC_SEGMENTS, text: 'Olá! Desculpe chamar por aqui. Encontrei a {leadName} e queria apresentar uma solução simples para organizar o atendimento comercial.' },
  { id: 'geral-04', context: 'sem_site', tone: 'consultivo', segments: GENERIC_SEGMENTS, text: 'Olá! Vi a {leadName} e percebi uma oportunidade: mesmo sem site forte, o WhatsApp pode virar uma fila organizada de contatos e retornos.' },
  { id: 'geral-05', context: 'comercio_local', tone: 'leve', segments: GENERIC_SEGMENTS, text: 'Oi! Vi a {leadName} em {city}. Para comércio local, a HBX ajuda a saber quem chamar hoje, quem respondeu e quem precisa de retorno.' },
  { id: 'geral-06', context: 'servico_local', tone: 'consultivo', segments: GENERIC_SEGMENTS, text: 'Olá! A HBX ajuda empresas de serviço a controlar pedidos de orçamento, conversas abertas e retornos pelo WhatsApp. Posso te mostrar usando a {leadName} como exemplo?' },
  { id: 'geral-07', context: 'follow_up', tone: 'educado', segments: GENERIC_SEGMENTS, text: 'Oi, passando para retomar meu contato. A proposta é simples: ajudar a {leadName} a organizar contatos e oportunidades sem depender de planilha.' },
  { id: 'geral-08', context: 'retorno', tone: 'leve', segments: GENERIC_SEGMENTS, text: 'Oi, tudo bem? Retomo por aqui para ver se faz sentido te mostrar como a HBX organiza conversas, retornos e oportunidades comerciais.' },
  { id: 'geral-09', context: 'primeiro_contato', tone: 'direto', segments: GENERIC_SEGMENTS, text: 'Olá! Eu ajudo empresas a transformar contatos soltos do WhatsApp em uma fila clara de vendas. Posso mostrar para a {leadName}?' },
  { id: 'geral-10', context: 'educada', tone: 'consultivo', segments: GENERIC_SEGMENTS, text: 'Olá, tudo bem? Vi a {leadName} e queria entender se vocês já têm algum controle dos contatos que chegam pelo WhatsApp.' },
  { id: 'geral-11', context: 'direta', tone: 'leve', segments: GENERIC_SEGMENTS, text: 'Oi! A pergunta é rápida: hoje a {leadName} consegue saber quais contatos do WhatsApp precisam de retorno? Se não, posso te mostrar uma solução simples.' },
  { id: 'geral-12', context: 'sem_site', tone: 'direto', segments: GENERIC_SEGMENTS, text: 'Oi! Vi que a {leadName} pode ganhar mais controle comercial pelo WhatsApp. A ideia é organizar contatos e retornos sem complicar.' },
  { id: 'geral-13', context: 'primeiro_contato', tone: 'educado', segments: GENERIC_SEGMENTS, text: 'Olá! Meu contato é sobre organização comercial. A HBX ajuda a {leadName} a tratar melhor oportunidades que chegam pelo WhatsApp.' },
  { id: 'geral-14', context: 'follow_up', tone: 'direto', segments: GENERIC_SEGMENTS, text: 'Oi, só retomando: posso te mostrar em 5 minutos como organizar os contatos comerciais da {leadName} por prioridade e retorno?' },
  { id: 'geral-15', context: 'retorno', tone: 'consultivo', segments: GENERIC_SEGMENTS, text: 'Olá! Retorno para deixar a ideia objetiva: WhatsApp verificado, contatos organizados e uma fila clara de quem chamar hoje.' },
  { id: 'geral-16', context: 'educada', tone: 'leve', segments: GENERIC_SEGMENTS, text: 'Oi! Se não for com você, consegue me indicar quem cuida dos contatos comerciais da {leadName}?' },
  { id: 'geral-17', context: 'primeiro_contato', tone: 'leve', segments: GENERIC_SEGMENTS, text: 'Olá! Vi a {leadName} e achei que faria sentido apresentar a HBX: contatos prontos para trabalhar, com prioridade e mensagem pronta.' },
  { id: 'geral-18', context: 'direta', tone: 'consultivo', segments: GENERIC_SEGMENTS, text: 'Oi! Tenho uma forma de entregar para a {leadName} uma fila simples de oportunidades: quem chamar hoje, por qual canal e com qual mensagem.' },
];

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function normalizeKey(value: unknown) {
  return normalizeText(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function hasUsableEmail(value: unknown) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(normalizeText(value));
}

function extractWebsiteDomain(value: unknown) {
  const raw = normalizeText(value);
  if (!raw) return null;
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./i, '').toLowerCase() || null;
  } catch {
    return null;
  }
}

function normalizeUrl(value: unknown) {
  const raw = normalizeText(value);
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw)) return `https://${raw}`;
  return raw;
}

function parseJsonObject(value: unknown): Record<string, any> {
  const raw = normalizeText(value);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, any>;
  } catch {
    return {};
  }
}

function arrayOrEmpty(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function extractRadarEnrichment(lead: any) {
  const direct = parseJsonObject(lead?.enrichmentJson || lead?.metadataJson);
  const timeline = Array.isArray(lead?.timelineEvents) ? lead.timelineEvents : [];
  const event = [...timeline]
    .sort((left: any, right: any) => {
      const leftTime = left?.createdAt ? new Date(left.createdAt).getTime() : 0;
      const rightTime = right?.createdAt ? new Date(right.createdAt).getTime() : 0;
      return rightTime - leftTime;
    })
    .find((item: any) => String(item?.sourceType || '').trim().toLowerCase() === 'radar_enrichment');
  const fromEvent = parseJsonObject(event?.description);
  const nested = typeof fromEvent.enrichment === 'string'
    ? parseJsonObject(fromEvent.enrichment)
    : fromEvent.enrichment && typeof fromEvent.enrichment === 'object'
      ? fromEvent.enrichment
      : {};
  const mergedEvidence = { ...direct, ...nested, ...fromEvent };
  const rawStatus = normalizeText(fromEvent.enrichmentStatus || nested?.enrichmentStatus || direct?.enrichmentStatus);
  const normalizedRawStatus = normalizeKey(rawStatus);
  const hasPreservedEnrichmentPayload = Boolean(
    nested?.version ||
    nested?.qualityV2 ||
    nested?.signals ||
    direct?.version ||
    direct?.qualityV2 ||
    direct?.signals ||
    fromEvent.enrichedAt ||
    nested?.enrichedAt ||
    direct?.enrichedAt,
  );
  const enrichmentStatus = ['pending', 'queued'].includes(normalizedRawStatus) && hasPreservedEnrichmentPayload
    ? 'completed'
    : normalizedRawStatus === 'pending'
      ? 'queued'
      : rawStatus;
  return {
    ...direct,
    ...nested,
    email: normalizeText(
      lead?.email ||
      fromEvent.email ||
      nested?.contact?.email ||
      direct?.contact?.email ||
      nested?.emailCandidate ||
      direct?.emailCandidate ||
      nested?.signals?.emailCandidate ||
      direct?.signals?.emailCandidate,
    ),
    emailStatus: normalizeText(
      lead?.emailStatus ||
      fromEvent.emailStatus ||
      nested?.contact?.emailStatus ||
      direct?.contact?.emailStatus ||
      nested?.signals?.emailStatus ||
      direct?.signals?.emailStatus,
    ),
    emailSource: normalizeText(
      lead?.emailSource ||
      fromEvent.emailSource ||
      nested?.contact?.emailSource ||
      direct?.contact?.emailSource,
    ),
    emailConfidence: Number(
      lead?.emailConfidence ||
      fromEvent.emailConfidence ||
      nested?.contact?.emailConfidence ||
      direct?.contact?.emailConfidence ||
      nested?.sourceConfidence?.email ||
      direct?.sourceConfidence?.email ||
      0,
    ) || null,
    recommendedChannel: normalizeText(
      lead?.recommendedChannel ||
      fromEvent.recommendedChannel ||
      nested?.actionPlan?.recommendedChannel ||
      direct?.actionPlan?.recommendedChannel ||
      nested?.signals?.recommendedChannel ||
      direct?.signals?.recommendedChannel,
    ),
    painType: normalizeText(
      lead?.painType ||
      fromEvent.painType ||
      nested?.salesFit?.painType ||
      direct?.salesFit?.painType ||
      nested?.signals?.painType ||
      direct?.signals?.painType,
    ),
    painPitch: normalizeText(lead?.painPitch || fromEvent.painPitch || nested?.salesFit?.painPitch || direct?.salesFit?.painPitch),
    opportunityReason: normalizeText(lead?.opportunityReason || fromEvent.opportunityReason || nested?.actionPlan?.nextStep || direct?.actionPlan?.nextStep),
    actionPlan: nested?.actionPlan || direct?.actionPlan || null,
    missingData: arrayOrEmpty(nested?.missingData).concat(arrayOrEmpty(direct?.missingData)),
    evidenceTimeline: arrayOrEmpty(nested?.evidenceTimeline).concat(arrayOrEmpty(direct?.evidenceTimeline)),
    instagramUrl: normalizeUrl(lead?.instagramUrl || fromEvent.instagramUrl || nested?.instagramUrl || direct?.instagramUrl || nested?.signals?.instagramUrl || direct?.signals?.instagramUrl),
    facebookUrl: normalizeUrl(lead?.facebookUrl || fromEvent.facebookUrl || nested?.facebookUrl || direct?.facebookUrl || nested?.signals?.facebookUrl || direct?.signals?.facebookUrl),
    socialStatus: normalizeText(lead?.socialStatus || fromEvent.socialStatus || nested?.socialStatus || direct?.socialStatus || nested?.signals?.socialStatus || direct?.signals?.socialStatus),
    socialConfidence: Number(lead?.socialConfidence || fromEvent.socialConfidence || nested?.socialConfidence || direct?.socialConfidence || nested?.sourceConfidence?.social || direct?.sourceConfidence?.social || 0) || null,
    possibleSocialCandidates: arrayOrEmpty(fromEvent.possibleSocialCandidates)
      .concat(arrayOrEmpty(nested?.possibleSocialCandidates))
      .concat(arrayOrEmpty(direct?.possibleSocialCandidates))
      .concat(arrayOrEmpty(nested?.signals?.possibleSocialCandidates))
      .concat(arrayOrEmpty(direct?.signals?.possibleSocialCandidates)),
    confirmedSocialCandidates: arrayOrEmpty(fromEvent.confirmedSocialCandidates)
      .concat(arrayOrEmpty(nested?.confirmedSocialCandidates))
      .concat(arrayOrEmpty(direct?.confirmedSocialCandidates))
      .concat(arrayOrEmpty(nested?.signals?.confirmedSocialCandidates))
      .concat(arrayOrEmpty(direct?.signals?.confirmedSocialCandidates)),
    enrichmentStatus,
    enrichedAt: normalizeText(fromEvent.enrichedAt || nested?.enrichedAt || direct?.enrichedAt),
    cnpj: normalizeText(fromEvent.cnpj || nested?.cnpj || direct?.cnpj),
    sourceConfidence: nested?.sourceConfidence || direct?.sourceConfidence || null,
    visibilityTier: normalizeText(fromEvent.visibilityTier || nested?.visibilityTier || direct?.visibilityTier),
    deliveryProduct: normalizeText(fromEvent.deliveryProduct || nested?.deliveryProduct || direct?.deliveryProduct),
    debitEligible: typeof fromEvent.debitEligible === 'boolean' ? fromEvent.debitEligible : nested?.debitEligible ?? direct?.debitEligible ?? null,
    qualityReason: normalizeText(fromEvent.qualityReason || nested?.qualityReason || direct?.qualityReason),
  };
}

function resolvePrimarySocial(instagramUrl?: string | null, facebookUrl?: string | null): PrimarySocial {
  if (instagramUrl && facebookUrl) return 'both';
  if (instagramUrl) return 'instagram';
  if (facebookUrl) return 'facebook';
  return null;
}

function inferSegmentKeys(lead: any) {
  const haystack = normalizeKey(`${lead?.segment || ''} ${lead?.name || ''} ${lead?.primarySource || ''}`);
  const keys: string[] = [];
  const add = (key: string, needles: string[]) => {
    if (needles.some((needle) => haystack.includes(needle))) keys.push(key);
  };
  add('oficina', ['oficina', 'mecanica', 'auto', 'pneu', 'motor']);
  add('saude', ['clinica', 'medic', 'odonto', 'dent', 'fisio', 'saude']);
  add('beleza', ['salao', 'beleza', 'estetica', 'barbearia', 'nail']);
  add('alimentacao', ['restaurante', 'lanchonete', 'pizza', 'mercado', 'padaria', 'bar']);
  add('construcao', ['construcao', 'material', 'engenharia', 'reforma', 'madeira']);
  add('pet', ['pet', 'veterin', 'animal']);
  add('educacao', ['escola', 'curso', 'educa', 'colegio']);
  add('imobiliaria', ['imobili', 'corretor', 'imovel']);
  add('servico', ['servico', 'assistencia', 'limpeza', 'seguranca', 'manutencao']);
  add('varejo', ['loja', 'moda', 'otica', 'varejo', 'boutique']);
  add('contabilidade', ['contab', 'consultoria', 'jurid', 'advoc']);
  add('turismo', ['hotel', 'pousada', 'turismo', 'viagem']);
  return keys.length ? keys : ['geral'];
}

function renderTemplate(template: MessageTemplate, lead: any) {
  const leadName = normalizeText(lead?.name) || 'sua empresa';
  const city = normalizeText(lead?.city) || 'sua cidade';
  const segment = normalizeText(lead?.segment) || 'seu segmento';
  return template.text
    .replace(/\{leadName\}/g, leadName)
    .replace(/\{city\}/g, city)
    .replace(/\{segment\}/g, segment);
}

function selectTemplates(lead: any, tags: string[], offset = 0) {
  const segmentKeys = inferSegmentKeys(lead);
  const hasNoSite = tags.includes('sem_site');
  const scored = VENDAS_LEAD_MESSAGE_TEMPLATES.map((template, index) => {
    let score = template.segments.some((segment) => segmentKeys.includes(segment)) ? 20 : 0;
    if (template.segments.includes('geral')) score += 4;
    if (hasNoSite && template.context === 'sem_site') score += 12;
    if (tags.includes('whatsapp_confirmado') && ['direta', 'primeiro_contato'].includes(template.context)) score += 7;
    if (tags.includes('email_encontrado') && template.tone === 'educado') score += 3;
    if (template.context === 'primeiro_contato') score += 5;
    return { template, score, index };
  }).sort((left, right) => right.score - left.score || left.index - right.index);
  const rotated = scored.slice(offset).concat(scored.slice(0, offset));
  return rotated.slice(0, 12).map(({ template }) => ({
    id: template.id,
    context: template.context,
    tone: template.tone,
    text: renderTemplate(template, lead),
  }));
}

export function buildVendasLeadIntelligence(input: VendasLeadIntelligenceInput) {
  const lead = input.lead || {};
  const radarEnrichment = extractRadarEnrichment(lead);
  const whatsappStatusRaw = normalizeKey(input.whatsappAvailability?.status);
  const whatsappStatus =
    whatsappStatusRaw === 'available'
      ? 'confirmed'
      : whatsappStatusRaw === 'unavailable'
        ? 'missing'
        : normalizeText(lead?.phone || lead?.phoneNormalized).replace(/\D/g, '').length < 10
          ? 'invalid'
          : 'unverified';
  const email = normalizeText(lead?.email || radarEnrichment.email);
  const domain = extractWebsiteDomain(lead?.website);
  const websiteStatus = normalizeKey(radarEnrichment.websiteStatus);
  const hasWeakOrMissingWebsite = !normalizeText(lead?.website) || ['none', 'weak', 'social_only', 'unreachable', 'missing'].includes(websiteStatus);
  const instagramUrl = normalizeUrl(radarEnrichment.instagramUrl || lead?.instagramUrl);
  const facebookUrl = normalizeUrl(radarEnrichment.facebookUrl || lead?.facebookUrl);
  const socialStatus = normalizeText(radarEnrichment.socialStatus) || (instagramUrl || facebookUrl ? 'found' : 'missing');
  const socialConfidence = Number(radarEnrichment.socialConfidence || 0) || null;
  const possibleSocialCandidates = arrayOrEmpty(radarEnrichment.possibleSocialCandidates);
  const confirmedSocialCandidates = arrayOrEmpty(radarEnrichment.confirmedSocialCandidates);
  const primarySocial = resolvePrimarySocial(instagramUrl, facebookUrl);
  const radarEmailStatus = normalizeKey(radarEnrichment.emailStatus);
  const emailStatus = radarEmailStatus && ['confirmed', 'probable', 'missing', 'invalid', 'unverified'].includes(radarEmailStatus)
    ? radarEmailStatus
    : hasUsableEmail(email)
    ? 'confirmed'
    : domain
      ? 'probable'
      : 'missing';
  const emailCandidate = hasUsableEmail(email) ? email.toLowerCase() : null;
  const tags = new Set<string>();
  if (!normalizeText(lead?.website)) tags.add('sem_site');
  if (radarEnrichment.painType) tags.add(String(radarEnrichment.painType));
  if (whatsappStatus === 'confirmed') tags.add('whatsapp_confirmado');
  if (emailStatus === 'confirmed' || emailStatus === 'probable') tags.add('email_encontrado');
  if (normalizeText(lead?.city)) tags.add('cidade_alvo');
  if (normalizeText(lead?.segment)) tags.add('segmento_alvo');
  if (Number(lead?.rating || 0) >= 4.2) tags.add('boa_avaliacao');
  if (Number(lead?.reviews || 0) >= 20) tags.add('prova_social');
  if (instagramUrl) tags.add('instagram_encontrado');
  if (facebookUrl) tags.add('facebook_encontrado');
  if (instagramUrl || facebookUrl) tags.add('rede_social_confirmada');
  if (possibleSocialCandidates.length) tags.add('rede_social_possivel');
  if ((instagramUrl || facebookUrl) && hasWeakOrMissingWebsite) tags.add('rede_social_sem_site');

  const blocked = Boolean(
    lead?.wasClosedBefore ||
    lead?.closedAt ||
    normalizeKey(lead?.status) === 'encerrado' ||
    normalizeKey(radarEnrichment.recommendedChannel) === 'discard' ||
    ['negativo', 'opt-out', 'opt_out', 'bloqueado'].some((needle) =>
      normalizeKey(`${lead?.lastResult || ''} ${lead?.shortNote || ''}`).includes(needle),
    )
  );
  let score = 44;
  if (whatsappStatus === 'confirmed') score += 24;
  if (whatsappStatus === 'missing') score -= 18;
  if (emailStatus === 'confirmed') score += 14;
  if (emailStatus === 'probable') score += 8;
  if (tags.has('cidade_alvo')) score += 5;
  if (tags.has('segmento_alvo')) score += 5;
  if (tags.has('sem_site')) score += 7;
  if (tags.has('boa_avaliacao')) score += 5;
  if (tags.has('prova_social')) score += 4;
  if (instagramUrl && facebookUrl) score += 8;
  else if (instagramUrl) score += 6;
  else if (facebookUrl) score += 4;
  if (possibleSocialCandidates.length) score += 5;
  if ((instagramUrl || facebookUrl) && hasWeakOrMissingWebsite) score += 4;
  if (possibleSocialCandidates.length && hasWeakOrMissingWebsite) score += 2;
  if (normalizeKey(socialStatus) === 'weak') score += 2;
  if (normalizeKey(socialStatus) === 'candidate_review') score += 2;
  if (blocked) score = Math.min(score, 20);
  score = Math.max(0, Math.min(99, Math.round(score)));

  const contactQuality = blocked
    ? 'blocked'
    : whatsappStatus === 'confirmed' && score >= 62
      ? 'ready'
      : whatsappStatus === 'invalid' || (whatsappStatus === 'missing' && emailStatus === 'missing')
        ? 'weak'
        : 'review';
  const radarRecommendedChannel = normalizeKey(radarEnrichment.recommendedChannel);
  const nextBestAction = blocked
    ? 'discard'
    : ['whatsapp', 'email', 'call', 'review'].includes(radarRecommendedChannel)
      ? radarRecommendedChannel
    : whatsappStatus === 'confirmed'
      ? 'whatsapp'
      : emailStatus === 'confirmed' || emailStatus === 'probable'
        ? 'email'
        : whatsappStatus === 'missing' && normalizeText(lead?.phone)
          ? 'call'
          : 'review';
  const painPitch = normalizeText(radarEnrichment.painPitch);
  const radarReason = normalizeText(radarEnrichment.opportunityReason || lead?.shortNote);
  const concreteSignals = [
    whatsappStatus === 'confirmed' ? 'WhatsApp confirmado' : whatsappStatus === 'missing' ? 'WhatsApp ausente' : normalizeText(lead?.phone || lead?.phoneNormalized) ? 'telefone disponível' : null,
    emailStatus === 'confirmed' ? 'e-mail confirmado' : emailStatus === 'probable' ? 'e-mail provável' : null,
    tags.has('sem_site') ? 'sem site' : normalizeText(lead?.website) ? 'site informado' : null,
    instagramUrl && facebookUrl ? 'Instagram e Facebook encontrados' : instagramUrl ? 'Instagram encontrado' : facebookUrl ? 'Facebook encontrado' : null,
    possibleSocialCandidates.length ? 'rede social possível para revisão' : null,
    Number(lead?.rating || 0) >= 4.2 ? 'boa avaliação' : null,
    Number(lead?.reviews || 0) >= 20 ? 'reviews relevantes' : null,
    radarEnrichment.painType ? `dor ${radarEnrichment.painType}` : null,
  ].filter(Boolean).join(' + ');
  const opportunityReason = blocked
    ? 'Lead bloqueado por histórico negativo, encerramento ou opt-out.'
    : radarReason
      ? radarReason
    : whatsappStatus === 'confirmed' && score >= 70
      ? `${concreteSignals}: prioridade alta para abordagem comercial.`
      : whatsappStatus === 'missing' && emailStatus !== 'missing'
        ? `${concreteSignals}: WhatsApp não confirmado, mas existe caminho por e-mail para abordagem.`
        : tags.has('sem_site')
          ? `${concreteSignals}: presença digital fraca e oportunidade de organizar contatos pelo WhatsApp.`
          : `${concreteSignals || 'Dados comerciais básicos'}: revisar melhor canal antes da abordagem.`;
  const templates = selectTemplates(lead, Array.from(tags), Math.max(0, Math.trunc(Number(input.templateOffset || 0))));

  return {
    email: emailCandidate,
    emailStatus,
    websiteStatus: websiteStatus || (normalizeText(lead?.website) ? 'present' : 'none'),
    instagramUrl,
    facebookUrl,
    socialStatus,
    socialConfidence,
    possibleSocialCandidates,
    confirmedSocialCandidates,
    primarySocial,
    whatsappStatus,
    contactQuality,
    opportunityScore: score,
    opportunityReason,
    painType: radarEnrichment.painType || null,
    painPitch: painPitch || null,
    recommendedChannel: nextBestAction,
    emailSource: radarEnrichment.emailSource || (radarEnrichment?.sourceConfidence?.email ? 'radar' : null),
    confidence: {
      email: Number(radarEnrichment?.emailConfidence || radarEnrichment?.sourceConfidence?.email || 0) || null,
      enrichment: Number(radarEnrichment?.sourceConfidence?.enrichment || 0) || null,
    },
    leadReasonTags: Array.from(tags),
    nextBestAction,
    lastVerifiedAt: input.whatsappAvailability?.checkedAt || null,
    verifiedBy: input.verifiedBy || (input.whatsappAvailability?.checkedAt ? 'client_engine' : null),
    visibilityTier: radarEnrichment.visibilityTier || null,
    deliveryProduct: radarEnrichment.deliveryProduct || null,
    debitEligible: typeof radarEnrichment.debitEligible === 'boolean' ? radarEnrichment.debitEligible : null,
    qualityReason: radarEnrichment.qualityReason || null,
    enrichmentStatus: radarEnrichment.enrichmentStatus || null,
    enrichedAt: radarEnrichment.enrichedAt || null,
    cnpj: radarEnrichment.cnpj || null,
    messageTemplate: templates[0] || null,
    messageTemplates: templates,
    templateLibrarySize: VENDAS_LEAD_MESSAGE_TEMPLATES.length,
  };
}
