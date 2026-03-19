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
export type RecoveryBotAnyActionId = RecoveryBotButtonActionId | string;

export type RecoveryBotButton = {
  actionId: RecoveryBotAnyActionId;
  title: string;
};

export type RecoveryBotStartTemplate = {
  id: string;
  name: string;
  language: string;
  active: boolean;
};

export type RecoveryBotVariableScope = 'shared' | 'recovery' | 'atendimento';

export type RecoveryBotVariableDefinition = {
  key: string;
  label: string;
  example: string;
  description: string;
  scope: RecoveryBotVariableScope;
  required: boolean;
};

export type RecoveryBotActionGuide = {
  actionId: RecoveryBotAnyActionId;
  title: string;
  description: string;
  route: RecoveryBotVariableScope;
  enabled: boolean;
  responseMessage?: string;
  custom?: boolean;
};

export type RecoveryRoutingRules = {
  preferRecoveryForDebtors: boolean;
  preferRecoveryForNegotiations: boolean;
  preferInboxForManualQueue: boolean;
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
  { actionId: 'choose_installments', title: 'Pagar no credito' },
  { actionId: 'pay_full', title: 'Pagar no Pix' },
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
  { actionId: 'pay_full', title: 'Pagar no Pix' },
  { actionId: 'choose_installments', title: 'Pagar no credito' },
  { actionId: 'talk_human', title: 'Falar com atendente' },
];

const DEFAULT_INSTALLMENT_BUTTONS: RecoveryBotButton[] = [
  { actionId: 'choose_installments', title: 'Gerar link no credito' },
  { actionId: 'talk_human', title: 'Falar com atendente' },
];

const DEFAULT_INSTALLMENT_CONFIRM_BUTTONS: RecoveryBotButton[] = [
  { actionId: 'generate_installment_link', title: 'Gerar link no credito' },
  { actionId: 'choose_installments', title: 'Gerar novo link no credito' },
  { actionId: 'talk_human', title: 'Falar com atendente' },
];

const DEFAULT_POST_LINK_BUTTONS: RecoveryBotButton[] = [
  { actionId: 'paid_claim', title: 'Ja paguei' },
  { actionId: 'choose_installments', title: 'Gerar link no credito' },
  { actionId: 'talk_human', title: 'Falar com atendente' },
];

const DEFAULT_VARIABLE_CATALOG: RecoveryBotVariableDefinition[] = [
  {
    key: 'cliente',
    label: 'Nome do cliente',
    example: 'Maria Oliveira',
    description: 'Nome principal exibido nas mensagens do bot e templates Meta.',
    scope: 'shared',
    required: true,
  },
  {
    key: 'empresa',
    label: 'Nome da empresa',
    example: 'Colsani Ar Condicionado',
    description: 'Nome comercial da empresa logada no tenant atual.',
    scope: 'shared',
    required: true,
  },
  {
    key: 'funcionario',
    label: 'Atendente responsavel',
    example: 'Leo Colsani',
    description: 'Nome do usuario logado quando o texto quiser personalizar o contato.',
    scope: 'atendimento',
    required: false,
  },
  {
    key: 'data_servico',
    label: 'Data do servico',
    example: '12/03/2026',
    description: 'Data da visita, manutencao ou ordem de servico relacionada a cobranca.',
    scope: 'recovery',
    required: true,
  },
  {
    key: 'descricao_servico',
    label: 'Descricao do servico',
    example: 'manutencao preventiva',
    description: 'Resumo curto do servico que gerou o valor pendente.',
    scope: 'recovery',
    required: true,
  },
  {
    key: 'valor_formatado',
    label: 'Valor formatado',
    example: 'R$ 480,00',
    description: 'Valor total aberto, pronto para aparecer no WhatsApp.',
    scope: 'recovery',
    required: true,
  },
  {
    key: 'quantidade_parcelas',
    label: 'Quantidade de parcelas',
    example: '3',
    description: 'Mantida para compatibilidade com templates antigos do Recovery.',
    scope: 'recovery',
    required: false,
  },
  {
    key: 'valor_parcela_formatado',
    label: 'Valor da parcela',
    example: 'R$ 160,00',
    description: 'Mantida para fluxos legados que ainda usam contexto de parcelamento.',
    scope: 'recovery',
    required: false,
  },
  {
    key: 'link_pagamento',
    label: 'Link de pagamento',
    example: 'https://pagamentos.hbx.app/exemplo',
    description: 'URL final enviada para checkout ou pagamento direto.',
    scope: 'shared',
    required: true,
  },
];

const DEFAULT_ACTION_CATALOG: RecoveryBotActionGuide[] = [
  {
    actionId: 'view_amount',
    title: 'Ver valor pendente',
    description: 'Exibe o saldo em aberto com contexto de servico e data.',
    route: 'recovery',
    enabled: true,
  },
  {
    actionId: 'choose_installments',
    title: 'Pagar no credito',
    description: 'Gera o fluxo de pagamento em cartao e abre checkout com condicoes disponiveis.',
    route: 'recovery',
    enabled: true,
  },
  {
    actionId: 'pay_full',
    title: 'Pagar no Pix',
    description: 'Gera o link de pagamento imediato via Pix.',
    route: 'recovery',
    enabled: true,
  },
  {
    actionId: 'talk_human',
    title: 'Falar com atendente',
    description: 'Tira o bot da frente e envia a conversa para fila manual.',
    route: 'atendimento',
    enabled: true,
  },
  {
    actionId: 'talk_later',
    title: 'Falar depois',
    description: 'Abre o menu de follow-up para reagendar o contato.',
    route: 'recovery',
    enabled: true,
  },
  {
    actionId: 'close_topic',
    title: 'Encerrar assunto',
    description: 'Fecha a conversa atual sem manter a fila humana ativa.',
    route: 'shared',
    enabled: true,
  },
  {
    actionId: 'followup_today',
    title: 'Hoje mais tarde',
    description: 'Agenda o retorno ainda no mesmo dia.',
    route: 'recovery',
    enabled: true,
  },
  {
    actionId: 'followup_tomorrow',
    title: 'Amanha',
    description: 'Agenda follow-up para o dia seguinte.',
    route: 'recovery',
    enabled: true,
  },
  {
    actionId: 'followup_week',
    title: 'Esta semana',
    description: 'Agenda novo contato durante a semana corrente.',
    route: 'recovery',
    enabled: true,
  },
  {
    actionId: 'installment_2',
    title: 'Opcao legada 2x',
    description: 'Alias legado mantido para payloads antigos.',
    route: 'recovery',
    enabled: false,
  },
  {
    actionId: 'installment_3',
    title: 'Opcao legada 3x',
    description: 'Alias legado mantido para payloads antigos.',
    route: 'recovery',
    enabled: false,
  },
  {
    actionId: 'installment_4',
    title: 'Opcao legada 4x',
    description: 'Alias legado mantido para payloads antigos.',
    route: 'recovery',
    enabled: false,
  },
  {
    actionId: 'installment_5',
    title: 'Opcao legada 5x',
    description: 'Alias legado mantido para payloads antigos.',
    route: 'recovery',
    enabled: false,
  },
  {
    actionId: 'generate_installment_link',
    title: 'Gerar link no credito',
    description: 'Confirma o checkout de cartao sem travar uma parcela especifica.',
    route: 'recovery',
    enabled: true,
  },
  {
    actionId: 'paid_claim',
    title: 'Ja paguei',
    description: 'Encaminha comprovacao ou alegacao de pagamento para a equipe.',
    route: 'atendimento',
    enabled: true,
  },
];

const DEFAULT_ROUTING_RULES: RecoveryRoutingRules = {
  preferRecoveryForDebtors: true,
  preferRecoveryForNegotiations: true,
  preferInboxForManualQueue: true,
};

export type RecoveryBotConfig = {
  variableCatalog: RecoveryBotVariableDefinition[];
  actionCatalog: RecoveryBotActionGuide[];
  routingRules: RecoveryRoutingRules;

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
  variableCatalog: DEFAULT_VARIABLE_CATALOG,
  actionCatalog: DEFAULT_ACTION_CATALOG,
  routingRules: DEFAULT_ROUTING_RULES,
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
  installmentsPrompt: 'Perfeito. Vou gerar seu link de pagamento no cartao de credito.',
  installmentButtons: DEFAULT_INSTALLMENT_BUTTONS,
  installmentConfirmTemplate: 'Posso gerar agora seu link de pagamento no cartao de credito.',
  installmentConfirmButtons: DEFAULT_INSTALLMENT_CONFIRM_BUTTONS,
  cashLinkMessageTemplate:
    'Pronto, {{cliente}}. Aqui esta seu link de pagamento:\n{{link_pagamento}}\n\nAssim que o pagamento for confirmado, avisaremos automaticamente.',
  installmentLinkMessageTemplate:
    'Perfeito, {{cliente}}. Aqui esta seu link de pagamento no cartao de credito:\n{{link_pagamento}}\n\nO checkout vai mostrar as condicoes disponiveis direto no pagamento.',
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
  optionCardLabel: 'Pagar no credito',
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

function normalizeActionId(value: unknown): RecoveryBotAnyActionId | null {
  const actionId = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 48);
  return actionId || null;
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

function normalizeVariableKey(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 40);
}

function normalizeVariableScope(value: unknown, fallback: RecoveryBotVariableScope): RecoveryBotVariableScope {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'recovery' || normalized === 'atendimento' || normalized === 'shared') {
    return normalized;
  }
  return fallback;
}

function normalizeVariableCatalog(value: unknown): RecoveryBotVariableDefinition[] {
  const rows = Array.isArray(value) ? value : [];
  const normalized: RecoveryBotVariableDefinition[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Record<string, unknown>;
    const key = normalizeVariableKey(item.key);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const fallback = DEFAULT_VARIABLE_CATALOG.find((entry) => entry.key === key);
    normalized.push({
      key,
      label: normalizeText(item.label, fallback?.label || key, 50),
      example: normalizeText(item.example, fallback?.example || '', 120),
      description: normalizeText(item.description, fallback?.description || '', 180),
      scope: normalizeVariableScope(item.scope, fallback?.scope || 'shared'),
      required: item.required === undefined ? Boolean(fallback?.required) : Boolean(item.required),
    });
    if (normalized.length >= 30) break;
  }
  if (!normalized.length) return DEFAULT_VARIABLE_CATALOG.map((item) => ({ ...item }));
  for (const fallback of DEFAULT_VARIABLE_CATALOG) {
    if (!seen.has(fallback.key)) normalized.push({ ...fallback });
  }
  return normalized;
}

function normalizeActionCatalog(value: unknown): RecoveryBotActionGuide[] {
  const rows = Array.isArray(value) ? value : [];
  const normalized: RecoveryBotActionGuide[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Record<string, unknown>;
    const actionId = normalizeActionId(item.actionId);
    if (!actionId || seen.has(actionId)) continue;
    seen.add(actionId);
    const fallback = DEFAULT_ACTION_CATALOG.find((entry) => entry.actionId === actionId);
    normalized.push({
      actionId,
      title: normalizeText(item.title, fallback?.title || actionId, 40),
      description: normalizeText(item.description, fallback?.description || '', 180),
      route: normalizeVariableScope(item.route, fallback?.route || 'shared'),
      enabled: item.enabled === undefined ? Boolean(fallback?.enabled ?? true) : Boolean(item.enabled),
      responseMessage: normalizeText(item.responseMessage, fallback?.responseMessage || '', 700),
      custom:
        item.custom === undefined
          ? !(RECOVERY_BOT_ACTION_IDS as readonly string[]).includes(actionId)
          : Boolean(item.custom),
    });
  }
  for (const fallback of DEFAULT_ACTION_CATALOG) {
    if (!seen.has(fallback.actionId)) normalized.push({ ...fallback });
  }
  return normalized;
}

function normalizeRoutingRules(value: unknown): RecoveryRoutingRules {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    preferRecoveryForDebtors:
      input.preferRecoveryForDebtors === undefined
        ? DEFAULT_ROUTING_RULES.preferRecoveryForDebtors
        : Boolean(input.preferRecoveryForDebtors),
    preferRecoveryForNegotiations:
      input.preferRecoveryForNegotiations === undefined
        ? DEFAULT_ROUTING_RULES.preferRecoveryForNegotiations
        : Boolean(input.preferRecoveryForNegotiations),
    preferInboxForManualQueue:
      input.preferInboxForManualQueue === undefined
        ? DEFAULT_ROUTING_RULES.preferInboxForManualQueue
        : Boolean(input.preferInboxForManualQueue),
  };
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
  const variableCatalog = normalizeVariableCatalog(data.variableCatalog);
  const actionCatalog = normalizeActionCatalog(data.actionCatalog);
  const routingRules = normalizeRoutingRules(data.routingRules);

  const agentButton =
    mainMenuButtons.find((button) => button.actionId === 'talk_human') ||
    DEFAULT_MAIN_MENU_BUTTONS.find((button) => button.actionId === 'talk_human')!;

  return {
    variableCatalog,
    actionCatalog,
    routingRules,
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
