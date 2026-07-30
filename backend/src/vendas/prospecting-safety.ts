export type ProspectingAutoReplyClassification =
  | 'auto_reply_detected'
  | 'bot_menu_detected'
  | 'out_of_hours_auto_reply'
  | 'awaiting_human';

export type ProspectingIntentKind =
  | 'positive'
  | 'what_is_it'
  | 'human_requested'
  | 'neutral'
  | 'negative'
  | 'opt_out'
  | 'ambiguous_intent';

export type ProspectingIntentClassification = {
  kind: ProspectingIntentKind;
  confidence: number;
  reasons: string[];
  signals: {
    positive: boolean;
    negative: boolean;
    optOut: boolean;
    whatIsIt: boolean;
    delay: boolean;
    humanHandoff: boolean;
    neutral: boolean;
  };
};

// Identidade e negócio SEMPRE por placeholder ({{funcionario}}/{{empresa}}), nunca literal:
// renderMessageTemplate (vendas-automation.service.ts) resolve os dois a partir de
// User.name/Company.name do tenant que está prospectando — nunca do dono da HBX.
// Ver docs/AUDITORIA-COPY-VAZADA (30/07/2026): a versão anterior tinha "Jhonatan" e a
// consultoria do dono hardcoded; qualquer tenant real que ligasse a prospecção sem
// customizar o texto ia se apresentar como o dono e vender o negócio dele.
export const SAFE_FIRST_CONTACT_TEMPLATE =
  '{{cumprimentacao}}, tudo bem? Aqui é {{funcionario}}, da {{empresa}}. Vi o contato de {{cliente}} e queria te explicar rapidinho o que a gente faz. Faz sentido eu te mandar uma ideia curta?';

export const SAFE_FIRST_CONTACT_VARIANTS = [
  '{{cumprimentacao}}, tudo certo? Aqui é {{funcionario}}, da {{empresa}}. Encontrei {{cliente}} e acho que vale a pena eu te apresentar rapidinho o nosso trabalho. Posso te mandar uma ideia curta?',
  '{{cumprimentacao}}! Sou {{funcionario}}, da {{empresa}}. Vi {{cliente}} e queria entender se faz sentido pra vocês conhecerem o que a gente faz. Posso te explicar em 1 minuto?',
  '{{cumprimentacao}}, tudo bem? Meu nome é {{funcionario}}, trabalho na {{empresa}}. Vi o contato de {{cliente}} e queria te mostrar rapidinho uma novidade que pode interessar. Faz sentido?',
  '{{cumprimentacao}}, tudo bem? Aqui é {{funcionario}}, da {{empresa}}. Posso te explicar em poucas palavras o que a gente faz e ver se faz sentido pra vocês?',
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

function normalizeIntentText(value: unknown) {
  return normalizeProspectingSafetyText(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeIntentText(value: unknown) {
  const normalized = normalizeIntentText(value);
  return normalized ? normalized.split(' ').filter(Boolean) : [];
}

function levenshteinDistance(left: string, right: string) {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);
  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost,
      );
    }
    for (let j = 0; j <= right.length; j += 1) previous[j] = current[j];
  }
  return previous[right.length];
}

function tokenMatchesIntentKeyword(textToken: string, keywordToken: string) {
  if (!textToken || !keywordToken) return false;
  if (textToken === keywordToken) return true;
  if (keywordToken.length < 5 || textToken.length < 5) return false;
  if (Math.abs(textToken.length - keywordToken.length) > 1) return false;
  return levenshteinDistance(textToken, keywordToken) <= 1;
}

function containsIntentKeyword(text: string, keywords: string[]) {
  const textTokens = tokenizeIntentText(text);
  if (!textTokens.length) return false;
  const normalizedText = ` ${textTokens.join(' ')} `;
  return keywords.some((keyword) => {
    const keywordTokens = tokenizeIntentText(keyword);
    if (!keywordTokens.length) return false;
    if (keywordTokens.length === 1) {
      const [keywordToken] = keywordTokens;
      if (keywordToken.length <= 3) {
        return textTokens.includes(keywordToken);
      }
      return textTokens.some((token) => tokenMatchesIntentKeyword(token, keywordToken));
    }
    if (normalizedText.includes(` ${keywordTokens.join(' ')} `)) return true;
    if (keywordTokens.some((token) => token.length < 4)) return false;
    for (let index = 0; index <= textTokens.length - keywordTokens.length; index += 1) {
      const windowTokens = textTokens.slice(index, index + keywordTokens.length);
      if (windowTokens.every((token, tokenIndex) => tokenMatchesIntentKeyword(token, keywordTokens[tokenIndex]))) {
        return true;
      }
    }
    return false;
  });
}

const DEFAULT_DELAY_INTENT_KEYWORDS = [
  'depois',
  'mais tarde',
  'outro horario',
  'outro dia',
  'amanha',
  'semana que vem',
  'pode ligar depois',
  'me chama depois',
  'manda depois',
  'agora nao',
];

const DEFAULT_DOUBT_INTENT_KEYWORDS = [
  'nao entendi',
  'nao entendo',
  'nao compreendi',
  'fiquei confuso',
  'duvida',
  'tenho duvida',
  'explica melhor',
  'me explica melhor',
];

const DEFAULT_HUMAN_HANDOFF_INTENT_KEYWORDS = [
  'humano',
  'atendente',
  'consultor',
  'ligar',
  'me liga',
  'me chama',
  'pode ligar',
];

const DEFAULT_OPT_OUT_INTENT_KEYWORDS = [
  'remover',
  'remova',
  'pare',
  'spam',
  'nao me chame',
  'bloqueia',
  'bloqueie',
  'descadastrar',
];

export function classifyProspectingIntent(input: {
  text: string;
  positiveKeywords: string[];
  negativeKeywords: string[];
  whatIsItKeywords: string[];
  neutralKeywords: string[];
  // "Falar depois" e "falar com humano" também aceitam palavras do dono — as
  // listas custom entram POR CIMA dos defaults do motor (nunca substituem, pra
  // não perder os gatilhos básicos). Opcionais: chamadas antigas seguem valendo.
  callbackKeywords?: string[];
  humanHandoffKeywords?: string[];
}): ProspectingIntentClassification {
  const text = String(input.text || '');
  const normalized = normalizeIntentText(text);
  const empty: ProspectingIntentClassification = {
    kind: 'neutral',
    confidence: 0,
    reasons: ['empty_text'],
    signals: {
      positive: false,
      negative: false,
      optOut: false,
      whatIsIt: false,
      delay: false,
      humanHandoff: false,
      neutral: false,
    },
  };
  if (!normalized) return empty;

  const optOut = containsIntentKeyword(text, DEFAULT_OPT_OUT_INTENT_KEYWORDS);
  const negative = optOut || isExplicitProspectingNegativeReply(text, input.negativeKeywords);
  const whatIsIt = containsIntentKeyword(text, [
    ...input.whatIsItKeywords,
    ...DEFAULT_DOUBT_INTENT_KEYWORDS,
  ]);
  const positive = containsIntentKeyword(text, input.positiveKeywords);
  const delay = containsIntentKeyword(text, [
    ...(input.callbackKeywords ?? []),
    ...DEFAULT_DELAY_INTENT_KEYWORDS,
  ]);
  const humanHandoff = containsIntentKeyword(text, [
    ...(input.humanHandoffKeywords ?? []),
    ...DEFAULT_HUMAN_HANDOFF_INTENT_KEYWORDS,
  ]);
  const neutral = containsIntentKeyword(text, input.neutralKeywords);
  const signals = { positive, negative, optOut, whatIsIt, delay, humanHandoff, neutral };
  const reasons = Object.entries(signals)
    .filter(([, value]) => value)
    .map(([key]) => key);

  if (negative) {
    return {
      kind: optOut ? 'opt_out' : 'negative',
      confidence: optOut ? 0.98 : 0.94,
      reasons: reasons.length ? reasons : ['negative'],
      signals,
    };
  }

  if (positive && (whatIsIt || delay || humanHandoff || neutral)) {
    return {
      kind: 'ambiguous_intent',
      confidence: 0.48,
      reasons: reasons.length ? reasons : ['mixed_positive_signal'],
      signals,
    };
  }

  if (whatIsIt && (delay || humanHandoff)) {
    return {
      kind: 'ambiguous_intent',
      confidence: 0.45,
      reasons: reasons.length ? reasons : ['mixed_question_signal'],
      signals,
    };
  }

  if (whatIsIt) {
    return { kind: 'what_is_it', confidence: 0.86, reasons: reasons.length ? reasons : ['what_is_it'], signals };
  }
  if (positive) {
    return { kind: 'positive', confidence: 0.88, reasons: reasons.length ? reasons : ['positive'], signals };
  }
  if (humanHandoff) {
    return { kind: 'human_requested', confidence: 0.78, reasons: reasons.length ? reasons : ['human_requested'], signals };
  }
  if (delay || neutral) {
    return { kind: 'neutral', confidence: delay ? 0.74 : 0.66, reasons: reasons.length ? reasons : ['neutral'], signals };
  }

  return { kind: 'neutral', confidence: 0.32, reasons: ['low_confidence'], signals };
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
