export type ProspectingAutoReplyClassification =
  | 'auto_reply_detected'
  | 'bot_menu_detected'
  | 'out_of_hours_auto_reply'
  | 'awaiting_human';

export const SAFE_FIRST_CONTACT_TEMPLATE =
  '{{cumprimentacao}}, tudo bem? Me chamo Jhonatan. Trabalho ajudando empresas a melhorar processos e automatizar tarefas repetitivas do dia a dia. Posso te explicar rapidinho e ver se faz sentido aí?';

export const SAFE_FIRST_CONTACT_VARIANTS = [
  '{{cumprimentacao}}, tudo certo? Aqui é o Jhonatan. Eu ajudo empresas a organizar melhor a rotina, reduzir retrabalho e implantar soluções simples para ganhar tempo na operação. Posso te mandar uma ideia rápida?',
  '{{cumprimentacao}}! Sou o Jhonatan. Trabalho com consultoria e implantação de automações para empresas que querem parar de perder tempo com processos manuais, controles soltos e tarefas repetidas. Faz sentido eu te explicar em 1 minuto?',
  '{{cumprimentacao}}, tudo bem? Me chamo Jhonatan. Eu olho a rotina da empresa, entendo onde está dando retrabalho e ajudo a implantar soluções práticas para deixar o dia a dia mais organizado. Posso te explicar rapidinho?',
  '{{cumprimentacao}}, tudo bem? Trabalho com melhoria de processos para empresas: atendimento, vendas, administrativo, retornos, controles internos e automações conforme a necessidade. Posso te mostrar por alto como funciona?',
] as const;

const CLICKABLE_URL_PATTERN =
  /\b(?:https?:\/\/|www\.)[^\s<>()]+|\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com(?:\.br)?|br|net|org|io|app|dev|ai|co|gov|edu|info|biz|me|site|online|store|tech|digital)(?:\/[^\s<>()]*)?/gi;

const CTA_BEFORE_LINK_PATTERN = /^\s*(?:cadastre(?:-se)?\s+aqui|acesse|link|clique\s+aqui|confira|veja\s+aqui)\s*:?\s*/i;

function normalizeProspectingSafetyText(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeFirstContactForComparison(value: unknown) {
  return normalizeProspectingSafetyText(sanitizeFirstContactMessage(String(value || '')))
    .replace(/[^a-z0-9{}]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function firstContactMessageHasLink(value: unknown) {
  CLICKABLE_URL_PATTERN.lastIndex = 0;
  return CLICKABLE_URL_PATTERN.test(String(value || ''));
}

export function sanitizeFirstContactMessage(text: string): string {
  const source = String(text || '').replace(/\r\n/g, '\n');
  const lines = source.split('\n');
  const kept: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] || '';
    const nextLine = lines[index + 1] || '';
    const lineHasLink = firstContactMessageHasLink(line);
    const nextLineHasLink = firstContactMessageHasLink(nextLine);
    const isCtaLine = CTA_BEFORE_LINK_PATTERN.test(line);

    if (isCtaLine && (lineHasLink || nextLineHasLink)) {
      continue;
    }

    const withoutLinks = line.replace(CLICKABLE_URL_PATTERN, '').replace(/[ \t]+/g, ' ').trim();
    const withoutDanglingCta = withoutLinks
      .replace(CTA_BEFORE_LINK_PATTERN, '')
      .replace(/\b(?:cadastre(?:-se)?\s+aqui|acesse|link|clique\s+aqui|confira|veja\s+aqui)\s*:?\s*$/i, '')
      .trim();
    if (withoutDanglingCta) kept.push(withoutDanglingCta);
  }

  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function classifyProspectingAutoReply(text: string): ProspectingAutoReplyClassification | null {
  const normalized = normalizeProspectingSafetyText(text);
  if (!normalized) return null;

  if (/(digite|tecle|envie|responda).{0,35}(numero|opcao|opcoes|menu)|selecione.{0,35}(opcao|opcoes)|escolha.{0,35}(opcao|opcoes)|menu de atendimento|opcao desejada/.test(normalized)) {
    return 'bot_menu_detected';
  }

  if (/nao estamos disponiveis|fora do horario|horario de funcionamento|expediente|atendimento encerrado|retornaremos.{0,40}(horario|expediente)|respondemos.{0,40}(horario|expediente)/.test(normalized)) {
    return 'out_of_hours_auto_reply';
  }

  if (/aguarde.{0,40}(atendente|equipe|consultor)|um atendente.{0,50}(ira|vai|pode)|nossa equipe.{0,50}(retornara|vai responder|respondera)|em breve.{0,40}(atendente|equipe|retornaremos|responderemos)/.test(normalized)) {
    return 'awaiting_human';
  }

  if (/mensagem automatica|resposta automatica|atendimento automatico|assistente virtual|chatbot|sou a ivet|ola eu sou|ol[aá],? eu sou|boas vindas ao atendimento|protocolo de atendimento/.test(normalized)) {
    return 'auto_reply_detected';
  }

  return null;
}

export function isExplicitProspectingNegativeReply(text: string, extraKeywords: string[] = []) {
  const normalized = normalizeProspectingSafetyText(text);
  if (!normalized) return false;
  const explicitPatterns = [
    /\bnao tenho interesse\b/,
    /\bsem interesse\b/,
    /\bnao quero\b/,
    /\bremover\b/,
    /\bremova\b/,
    /\bpare\b/,
    /\bnao me chame\b/,
    /\bnao autoriz[ae]i\b/,
    /\bspam\b/,
    /\bbloqueia\b/,
    /\bbloqueie\b/,
    /\bdescadastrar\b/,
    /\bcancelar contato\b/,
  ];
  if (explicitPatterns.some((pattern) => pattern.test(normalized))) return true;
  return extraKeywords.some((keyword) => {
    const normalizedKeyword = normalizeProspectingSafetyText(keyword);
    return Boolean(normalizedKeyword && normalized.includes(normalizedKeyword));
  });
}
