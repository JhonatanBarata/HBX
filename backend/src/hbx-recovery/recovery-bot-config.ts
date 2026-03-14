export const RECOVERY_BOT_CONFIG_CHANNEL = '__HBX_RECOVERY_BOT_CONFIG__';
export const RECOVERY_BOT_CONFIG_TITLE = 'config_v1';

export const RECOVERY_BOT_ACTION_IDS = [
  'view_amount',
  'choose_installments',
  'pay_full',
  'talk_human',
  'talk_later',
  'close_topic',
  'followup_today',
  'followup_tomorrow',
  'followup_week',
  'installment_2',
  'installment_3',
  'installment_4',
  'installment_5',
  'generate_installment_link',
  'paid_claim',
] as const;

export type RecoveryBotButtonActionId = (typeof RECOVERY_BOT_ACTION_IDS)[number];

export type RecoveryBotButton = {
  actionId: RecoveryBotButtonActionId;
  title: string;
};

export type RecoveryBotStartTemplate = {
  id: string;
  name: string;
  language: string;
  active: boolean;
};

// Legacy types kept for backward compatibility with previously stored payloads.
export type RecoveryBotTopicId =
  | 'hbx_recovery_subject_discount'
  | 'hbx_recovery_subject_deadline'
  | 'hbx_recovery_subject_wrong_number'
  | 'hbx_recovery_subject_paid'
  | 'hbx_recovery_subject_dispute'
  | 'hbx_recovery_subject_other';

export type RecoveryBotTopic = {
  id: RecoveryBotTopicId;
  title: string;
  description: string;
};

export const RECOVERY_BOT_TOPIC_IDS: RecoveryBotTopicId[] = [
  'hbx_recovery_subject_discount',
  'hbx_recovery_subject_deadline',
  'hbx_recovery_subject_wrong_number',
  'hbx_recovery_subject_paid',
  'hbx_recovery_subject_dispute',
  'hbx_recovery_subject_other',
];

const LEGACY_DEFAULT_TOPICS: RecoveryBotTopic[] = [
  {
    id: 'hbx_recovery_subject_discount',
    title: 'Solicitar desconto',
    description: 'Negociar valor da divida.',
  },
  {
    id: 'hbx_recovery_subject_deadline',
    title: 'Solicitar prazo',
    description: 'Pedir novo prazo de pagamento.',
  },
  {
    id: 'hbx_recovery_subject_wrong_number',
    title: 'Numero incorreto',
    description: 'Nao reconheco esta cobranca.',
  },
  {
    id: 'hbx_recovery_subject_paid',
    title: 'Ja paguei',
    description: 'Quero confirmar baixa do pagamento.',
  },
  {
    id: 'hbx_recovery_subject_dispute',
    title: 'Contestar cobranca',
    description: 'Tenho duvida sobre este debito.',
  },
  {
    id: 'hbx_recovery_subject_other',
    title: 'Outro assunto',
    description: 'Preciso de atendimento humano.',
  },
];

const DEFAULT_TEMPLATE_NAME = String(
  process.env.WHATSAPP_HBX_RECOVERY_INITIAL_TEMPLATE_NAME ||
    process.env.WHATSAPP_HBX_RECOVERY_TEMPLATE_NAME ||
    '',
).trim();
const DEFAULT_TEMPLATE_LANGUAGE =
  String(
    process.env.WHATSAPP_HBX_RECOVERY_INITIAL_TEMPLATE_LANGUAGE ||
      process.env.WHATSAPP_HBX_RECOVERY_TEMPLATE_LANGUAGE ||
      'pt_BR',
  ).trim() || 'pt_BR';

const DEFAULT_MAIN_MENU_BUTTONS: RecoveryBotButton[] = [
  { actionId: 'view_amount', title: 'Ver valor pendente' },
  { actionId: 'choose_installments', title: 'Parcelar' },
  { actionId: 'pay_full', title: 'Pagar a vista' },
  { actionId: 'talk_human', title: 'Falar com atendente' },
];

const DEFAULT_DECLINE_MENU_BUTTONS: RecoveryBotButton[] = [
  { actionId: 'talk_later', title: 'Falar depois' },
  { actionId: 'close_topic', title: 'Encerrar assunto' },
  { actionId: 'talk_human', title: 'Falar com atendente' },
];

const DEFAULT_FOLLOWUP_BUTTONS: RecoveryBotButton[] = [
  { actionId: 'followup_today', title: 'Hoje mais tarde' },
  { actionId: 'followup_tomorrow', title: 'Amanha' },
  { actionId: 'followup_week', title: 'Esta semana' },
];

const DEFAULT_VALUE_BUTTONS: RecoveryBotButton[] = [
  { actionId: 'pay_full', title: 'Pagar agora' },
  { actionId: 'choose_installments', title: 'Parcelar' },
  { actionId: 'talk_human', title: 'Falar com atendente' },
];

const DEFAULT_INSTALLMENT_BUTTONS: RecoveryBotButton[] = [
  { actionId: 'installment_2', title: '2x' },
  { actionId: 'installment_3', title: '3x' },
  { actionId: 'installment_4', title: '4x' },
  { actionId: 'installment_5', title: '5x' },
  { actionId: 'talk_human', title: 'Falar com atendente' },
];

const DEFAULT_INSTALLMENT_CONFIRM_BUTTONS: RecoveryBotButton[] = [
  { actionId: 'generate_installment_link', title: 'Gerar link' },
  { actionId: 'choose_installments', title: 'Alterar parcelas' },
  { actionId: 'talk_human', title: 'Falar com atendente' },
];

const DEFAULT_POST_LINK_BUTTONS: RecoveryBotButton[] = [
  { actionId: 'paid_claim', title: 'Ja paguei' },
  { actionId: 'choose_installments', title: 'Alterar parcelas' },
  { actionId: 'talk_human', title: 'Falar com atendente' },
];

export type RecoveryBotConfig = {
  // New flow editor fields
  startTemplates: RecoveryBotStartTemplate[];
  rootFooter: string;
  mainMenuPrompt: string;
  mainMenuButtons: RecoveryBotButton[];
  declineMenuPrompt: string;
  declineMenuButtons: RecoveryBotButton[];
  followupPrompt: string;
  followupButtons: RecoveryBotButton[];
  valueMessageTemplate: string;
  valueButtons: RecoveryBotButton[];
  installmentsPrompt: string;
  installmentButtons: RecoveryBotButton[];
  installmentConfirmTemplate: string;
  installmentConfirmButtons: RecoveryBotButton[];
  cashLinkMessageTemplate: string;
  installmentLinkMessageTemplate: string;
  postLinkPrompt: string;
  postLinkButtons: RecoveryBotButton[];
  closeTopicMessage: string;
  paidClaimMessage: string;
  humanAckMessage: string;

  // Legacy fields kept so older code paths remain compatible while refactoring.
  initialTemplateName: string;
  initialTemplateLanguage: string;
  rootPrompt: string;
  optionPixLabel: string;
  optionCardLabel: string;
  optionAgentLabel: string;
  topicsPrompt: string;
  topicsButtonLabel: string;
  topics: RecoveryBotTopic[];
};

const DEFAULT_START_TEMPLATES: RecoveryBotStartTemplate[] = [
  {
    id: 'template_default',
    name: DEFAULT_TEMPLATE_NAME,
    language: DEFAULT_TEMPLATE_LANGUAGE,
    active: true,
  },
].filter((item) => item.name);

export const DEFAULT_RECOVERY_BOT_CONFIG: RecoveryBotConfig = {
  startTemplates: DEFAULT_START_TEMPLATES,
  rootFooter: 'HBX Recovery',
  mainMenuPrompt: 'Perfeito, {{cliente}}. Escolha abaixo como deseja continuar:',
  mainMenuButtons: DEFAULT_MAIN_MENU_BUTTONS,
  declineMenuPrompt:
    'Tudo bem. Deseja que nossa equipe entre em contato em outro momento ou prefere encerrar por aqui?',
  declineMenuButtons: DEFAULT_DECLINE_MENU_BUTTONS,
  followupPrompt: 'Qual periodo prefere?',
  followupButtons: DEFAULT_FOLLOWUP_BUTTONS,
  valueMessageTemplate:
    'Seu valor pendente atual e de {{valor_formatado}} referente ao servico de {{descricao_servico}} realizado em {{data_servico}}.',
  valueButtons: DEFAULT_VALUE_BUTTONS,
  installmentsPrompt: 'Sem problema. Escolha em quantas parcelas deseja pagar:',
  installmentButtons: DEFAULT_INSTALLMENT_BUTTONS,
  installmentConfirmTemplate:
    'Voce escolheu pagar em {{quantidade_parcelas}}x de {{valor_parcela_formatado}}. Deseja gerar o link agora?',
  installmentConfirmButtons: DEFAULT_INSTALLMENT_CONFIRM_BUTTONS,
  cashLinkMessageTemplate:
    'Pronto, {{cliente}}. Aqui esta seu link de pagamento:\n{{link_pagamento}}\n\nAssim que o pagamento for confirmado, avisaremos automaticamente.',
  installmentLinkMessageTemplate:
    'Perfeito, {{cliente}}. Aqui esta seu link de pagamento em {{quantidade_parcelas}}x de {{valor_parcela_formatado}}:\n{{link_pagamento}}\n\nSe precisar, posso te conectar com um atendente.',
  postLinkPrompt: 'Precisando de algo mais?',
  postLinkButtons: DEFAULT_POST_LINK_BUTTONS,
  closeTopicMessage:
    'Entendido. Vamos encerrar esse assunto por agora. Se precisar, estamos por aqui.',
  paidClaimMessage: 'Obrigado pelo aviso. Vou encaminhar para validacao humana do pagamento.',
  humanAckMessage:
    'Certo, vou encaminhar sua conversa para um atendente.',

  // Legacy defaults
  initialTemplateName: DEFAULT_TEMPLATE_NAME,
  initialTemplateLanguage: DEFAULT_TEMPLATE_LANGUAGE,
  rootPrompt: 'Perfeito, {{cliente}}. Escolha abaixo como deseja continuar:',
  optionPixLabel: 'Ver valor pendente',
  optionCardLabel: 'Parcelar',
  optionAgentLabel: 'Falar com atendente',
  topicsPrompt: '',
  topicsButtonLabel: '',
  topics: LEGACY_DEFAULT_TOPICS,
};

function normalizeText(value: unknown, fallback: string, maxLength: number): string {
  const normalized = String(value || '').trim();
  if (!normalized) return fallback;
  return normalized.slice(0, maxLength);
}

function normalizeActionId(value: unknown): RecoveryBotButtonActionId | null {
  const actionId = String(value || '').trim() as RecoveryBotButtonActionId;
  return RECOVERY_BOT_ACTION_IDS.includes(actionId) ? actionId : null;
}

function normalizeButtons(
  value: unknown,
  fallback: RecoveryBotButton[],
  maxButtons = 10,
): RecoveryBotButton[] {
  const rows = Array.isArray(value) ? value : [];
  const normalized: RecoveryBotButton[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Record<string, unknown>;
    const actionId = normalizeActionId(item.actionId);
    if (!actionId) continue;
    const title = normalizeText(item.title, '', 25);
    if (!title) continue;
    normalized.push({ actionId, title });
    if (normalized.length >= maxButtons) break;
  }
  if (!normalized.length) {
    return fallback.map((item) => ({ ...item }));
  }
  return normalized;
}

function normalizeTemplateId(name: string, language: string, index: number) {
  const base = `${name}-${language}`.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return base || `template_${index + 1}`;
}

function normalizeStartTemplates(
  value: unknown,
  fallbackName: string,
  fallbackLanguage: string,
): RecoveryBotStartTemplate[] {
  const rows = Array.isArray(value) ? value : [];
  const normalized: RecoveryBotStartTemplate[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row || typeof row !== 'object') continue;
    const item = row as Record<string, unknown>;
    const name = normalizeText(item.name, '', 120);
    if (!name) continue;
    const language = normalizeText(item.language, 'pt_BR', 16);
    const idRaw = normalizeText(item.id, '', 80);
    normalized.push({
      id: idRaw || normalizeTemplateId(name, language, index),
      name,
      language,
      active: Boolean(item.active),
    });
    if (normalized.length >= 25) break;
  }

  if (!normalized.length && fallbackName) {
    normalized.push({
      id: 'template_default',
      name: fallbackName,
      language: fallbackLanguage || 'pt_BR',
      active: true,
    });
  }

  if (!normalized.length) return [];

  let activeIndex = normalized.findIndex((item) => item.active);
  if (activeIndex < 0) activeIndex = 0;
  return normalized.map((item, index) => ({ ...item, active: index === activeIndex }));
}

function normalizeLegacyTopics(value: unknown): RecoveryBotTopic[] {
  const topicsInput = Array.isArray(value) ? value : [];
  const topicsById = new Map<RecoveryBotTopicId, RecoveryBotTopic>();

  for (const row of topicsInput) {
    const topic = row as Record<string, unknown>;
    const id = String(topic?.id || '').trim() as RecoveryBotTopicId;
    if (!RECOVERY_BOT_TOPIC_IDS.includes(id)) continue;
    topicsById.set(id, {
      id,
      title: normalizeText(topic?.title, LEGACY_DEFAULT_TOPICS.find((item) => item.id === id)?.title || id, 40),
      description: normalizeText(
        topic?.description,
        LEGACY_DEFAULT_TOPICS.find((item) => item.id === id)?.description || '',
        80,
      ),
    });
  }

  return RECOVERY_BOT_TOPIC_IDS.map((id) => {
    const existing = topicsById.get(id);
    if (existing) return existing;
    return LEGACY_DEFAULT_TOPICS.find((item) => item.id === id)!;
  });
}

export function normalizeRecoveryBotConfig(input: unknown): RecoveryBotConfig {
  const data = (input && typeof input === 'object' ? (input as Record<string, unknown>) : {}) || {};

  const fallbackTemplateName = normalizeText(
    data.initialTemplateName,
    DEFAULT_RECOVERY_BOT_CONFIG.initialTemplateName,
    120,
  );
  const fallbackTemplateLanguage = normalizeText(
    data.initialTemplateLanguage,
    DEFAULT_RECOVERY_BOT_CONFIG.initialTemplateLanguage,
    16,
  );

  const startTemplates = normalizeStartTemplates(
    data.startTemplates,
    fallbackTemplateName,
    fallbackTemplateLanguage,
  );
  const activeTemplate =
    startTemplates.find((item) => item.active) ||
    (startTemplates.length ? startTemplates[0] : null);

  const mainMenuButtons = normalizeButtons(data.mainMenuButtons, DEFAULT_MAIN_MENU_BUTTONS, 10);
  const declineMenuButtons = normalizeButtons(data.declineMenuButtons, DEFAULT_DECLINE_MENU_BUTTONS, 10);
  const followupButtons = normalizeButtons(data.followupButtons, DEFAULT_FOLLOWUP_BUTTONS, 10);
  const valueButtons = normalizeButtons(data.valueButtons, DEFAULT_VALUE_BUTTONS, 10);
  const installmentButtons = normalizeButtons(data.installmentButtons, DEFAULT_INSTALLMENT_BUTTONS, 10);
  const installmentConfirmButtons = normalizeButtons(
    data.installmentConfirmButtons,
    DEFAULT_INSTALLMENT_CONFIRM_BUTTONS,
    10,
  );
  const postLinkButtons = normalizeButtons(data.postLinkButtons, DEFAULT_POST_LINK_BUTTONS, 10);
  const topics = normalizeLegacyTopics(data.topics);

  const agentButton =
    mainMenuButtons.find((button) => button.actionId === 'talk_human') ||
    DEFAULT_MAIN_MENU_BUTTONS.find((button) => button.actionId === 'talk_human')!;

  return {
    startTemplates,
    rootFooter: normalizeText(data.rootFooter, DEFAULT_RECOVERY_BOT_CONFIG.rootFooter, 60),
    mainMenuPrompt: normalizeText(data.mainMenuPrompt, DEFAULT_RECOVERY_BOT_CONFIG.mainMenuPrompt, 700),
    mainMenuButtons,
    declineMenuPrompt: normalizeText(
      data.declineMenuPrompt,
      DEFAULT_RECOVERY_BOT_CONFIG.declineMenuPrompt,
      700,
    ),
    declineMenuButtons,
    followupPrompt: normalizeText(data.followupPrompt, DEFAULT_RECOVERY_BOT_CONFIG.followupPrompt, 700),
    followupButtons,
    valueMessageTemplate: normalizeText(
      data.valueMessageTemplate,
      DEFAULT_RECOVERY_BOT_CONFIG.valueMessageTemplate,
      700,
    ),
    valueButtons,
    installmentsPrompt: normalizeText(
      data.installmentsPrompt,
      DEFAULT_RECOVERY_BOT_CONFIG.installmentsPrompt,
      700,
    ),
    installmentButtons,
    installmentConfirmTemplate: normalizeText(
      data.installmentConfirmTemplate,
      DEFAULT_RECOVERY_BOT_CONFIG.installmentConfirmTemplate,
      700,
    ),
    installmentConfirmButtons,
    cashLinkMessageTemplate: normalizeText(
      data.cashLinkMessageTemplate,
      DEFAULT_RECOVERY_BOT_CONFIG.cashLinkMessageTemplate,
      700,
    ),
    installmentLinkMessageTemplate: normalizeText(
      data.installmentLinkMessageTemplate,
      DEFAULT_RECOVERY_BOT_CONFIG.installmentLinkMessageTemplate,
      700,
    ),
    postLinkPrompt: normalizeText(data.postLinkPrompt, DEFAULT_RECOVERY_BOT_CONFIG.postLinkPrompt, 700),
    postLinkButtons,
    closeTopicMessage: normalizeText(
      data.closeTopicMessage,
      DEFAULT_RECOVERY_BOT_CONFIG.closeTopicMessage,
      700,
    ),
    paidClaimMessage: normalizeText(
      data.paidClaimMessage,
      DEFAULT_RECOVERY_BOT_CONFIG.paidClaimMessage,
      700,
    ),
    humanAckMessage: normalizeText(
      data.humanAckMessage,
      DEFAULT_RECOVERY_BOT_CONFIG.humanAckMessage,
      700,
    ),

    // Legacy fields (derived from new flow)
    initialTemplateName: activeTemplate?.name || fallbackTemplateName,
    initialTemplateLanguage: activeTemplate?.language || fallbackTemplateLanguage,
    rootPrompt: normalizeText(
      data.rootPrompt,
      normalizeText(data.mainMenuPrompt, DEFAULT_RECOVERY_BOT_CONFIG.rootPrompt, 700),
      700,
    ),
    optionPixLabel: normalizeText(
      data.optionPixLabel,
      mainMenuButtons[0]?.title || DEFAULT_RECOVERY_BOT_CONFIG.optionPixLabel,
      20,
    ),
    optionCardLabel: normalizeText(
      data.optionCardLabel,
      mainMenuButtons[1]?.title || DEFAULT_RECOVERY_BOT_CONFIG.optionCardLabel,
      20,
    ),
    optionAgentLabel: normalizeText(
      data.optionAgentLabel,
      agentButton?.title || DEFAULT_RECOVERY_BOT_CONFIG.optionAgentLabel,
      20,
    ),
    topicsPrompt: normalizeText(data.topicsPrompt, DEFAULT_RECOVERY_BOT_CONFIG.topicsPrompt, 700),
    topicsButtonLabel: normalizeText(
      data.topicsButtonLabel,
      DEFAULT_RECOVERY_BOT_CONFIG.topicsButtonLabel,
      20,
    ),
    topics,
  };
}
