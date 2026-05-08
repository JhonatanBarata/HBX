export const COMMERCIAL_PLAN_KEYS = {
  LITE: 'hbx_lite',
  PADRAO: 'hbx_padrao',
  MELHOR: 'hbx_melhor',
  LEGACY_VENDAS: 'hbx_vendas',
  LEGACY_VENDAS_IA: 'hbx_vendas_ia',
  LEGACY_RECOVERY: 'hbx_recovery',
} as const;

export const COMMERCIAL_ENTITLEMENT_KEYS = {
  VENDAS: 'vendas',
  ATENDIMENTO_CHAT: 'atendimento_chat',
  WEBSCRAPING: 'webscraping',
  BOT_IA: 'bot_ia',
  RECOVERY: 'recovery',
  NIGHT_FACTORY: 'night_factory',
  RADAR_PREMIUM: 'radar_premium',
  RECOVERY_INTELLIGENCE: 'recovery_intelligence',
  DIGITAL_AUDIT: 'digital_audit',
  OPPORTUNITY_SCORE: 'opportunity_score',
  AI_SALES_SCRIPTS: 'ai_sales_scripts',
} as const;

export type CommercialPlanKey = (typeof COMMERCIAL_PLAN_KEYS)[keyof typeof COMMERCIAL_PLAN_KEYS];
export type ActiveCommercialPlanKey =
  | typeof COMMERCIAL_PLAN_KEYS.LITE
  | typeof COMMERCIAL_PLAN_KEYS.PADRAO
  | typeof COMMERCIAL_PLAN_KEYS.MELHOR;
export type CommercialEntitlementKey =
  (typeof COMMERCIAL_ENTITLEMENT_KEYS)[keyof typeof COMMERCIAL_ENTITLEMENT_KEYS];

export const COMMERCIAL_PRICING = {
  liteMonthly: 49.90,
  padraoMonthly: 89.90,
  melhorMonthly: 149.90,
  annualDiscountPercent: 20,
} as const;

export const COMMERCIAL_PLAN_QUOTAS: Record<ActiveCommercialPlanKey, {
  googleSearchesPerDay: number;
  cardsPerSearch?: number;
  searchesPerCycle?: number;
  totalCards?: number;
}> = {
  [COMMERCIAL_PLAN_KEYS.LITE]: { googleSearchesPerDay: 0, cardsPerSearch: 50, searchesPerCycle: 3, totalCards: 150 },
  [COMMERCIAL_PLAN_KEYS.PADRAO]: { googleSearchesPerDay: 2 },
  [COMMERCIAL_PLAN_KEYS.MELHOR]: { googleSearchesPerDay: 6 },
};

export const GOOGLE_DAILY_LIMIT_REACHED_MESSAGE =
  'Você atingiu suas buscas Google de hoje. Os motores gratuitos continuam liberados. Para mais buscas por dia, escolha o HBX Full — Bot e IA.';

export const BOT_IA_PLAN_REQUIRED_PAYLOAD = {
  code: 'BOT_IA_PLAN_REQUIRED',
  message: 'Bot de atendimento está disponível no plano HBX Full — Bot e IA.',
  redirectTo: '/planos?intent=bot_ia',
  requiredPlanKey: COMMERCIAL_PLAN_KEYS.MELHOR,
} as const;

export const ACTIVE_COMMERCIAL_ENTITLEMENT_STATUSES = new Set([
  'active',
  'trialing',
  'paid',
  'manual',
  'grace',
]);

export const PENDING_COMMERCIAL_ENTITLEMENT_STATUS = 'pending_checkout';

export const COMMERCIAL_PLAN_MODULE_KEYS: Record<ActiveCommercialPlanKey, string[]> = {
  [COMMERCIAL_PLAN_KEYS.LITE]: ['vendas', 'webscraping'],
  [COMMERCIAL_PLAN_KEYS.PADRAO]: ['atendimento', 'vendas', 'webscraping'],
  [COMMERCIAL_PLAN_KEYS.MELHOR]: ['atendimento', 'vendas', 'webscraping', 'bot_ia'],
};

export const COMMERCIAL_PLAN_ENTITLEMENT_KEYS: Record<ActiveCommercialPlanKey, CommercialEntitlementKey[]> = {
  [COMMERCIAL_PLAN_KEYS.LITE]: [
    COMMERCIAL_ENTITLEMENT_KEYS.VENDAS,
    COMMERCIAL_ENTITLEMENT_KEYS.WEBSCRAPING,
    COMMERCIAL_ENTITLEMENT_KEYS.OPPORTUNITY_SCORE,
  ],
  [COMMERCIAL_PLAN_KEYS.PADRAO]: [
    COMMERCIAL_ENTITLEMENT_KEYS.VENDAS,
    COMMERCIAL_ENTITLEMENT_KEYS.ATENDIMENTO_CHAT,
    COMMERCIAL_ENTITLEMENT_KEYS.WEBSCRAPING,
    COMMERCIAL_ENTITLEMENT_KEYS.NIGHT_FACTORY,
    COMMERCIAL_ENTITLEMENT_KEYS.RADAR_PREMIUM,
    COMMERCIAL_ENTITLEMENT_KEYS.AI_SALES_SCRIPTS,
  ],
  [COMMERCIAL_PLAN_KEYS.MELHOR]: [
    COMMERCIAL_ENTITLEMENT_KEYS.VENDAS,
    COMMERCIAL_ENTITLEMENT_KEYS.ATENDIMENTO_CHAT,
    COMMERCIAL_ENTITLEMENT_KEYS.WEBSCRAPING,
    COMMERCIAL_ENTITLEMENT_KEYS.BOT_IA,
    COMMERCIAL_ENTITLEMENT_KEYS.NIGHT_FACTORY,
    COMMERCIAL_ENTITLEMENT_KEYS.RADAR_PREMIUM,
    COMMERCIAL_ENTITLEMENT_KEYS.RECOVERY_INTELLIGENCE,
    COMMERCIAL_ENTITLEMENT_KEYS.DIGITAL_AUDIT,
    COMMERCIAL_ENTITLEMENT_KEYS.OPPORTUNITY_SCORE,
    COMMERCIAL_ENTITLEMENT_KEYS.AI_SALES_SCRIPTS,
  ],
};

export function toCommercialCurrency(value: unknown) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(2));
}

export function isCommercialEntitlementActive(status: unknown) {
  return ACTIVE_COMMERCIAL_ENTITLEMENT_STATUSES.has(String(status || '').trim().toLowerCase());
}

export function parseCommercialMetadata(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, any>;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, any>
      : {};
  } catch {
    return {};
  }
}

export function normalizeCommercialPlanKey(value: unknown): ActiveCommercialPlanKey {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === COMMERCIAL_PLAN_KEYS.LITE) return COMMERCIAL_PLAN_KEYS.LITE;
  if (normalized === COMMERCIAL_PLAN_KEYS.MELHOR || normalized === COMMERCIAL_PLAN_KEYS.LEGACY_VENDAS_IA) {
    return COMMERCIAL_PLAN_KEYS.MELHOR;
  }
  return COMMERCIAL_PLAN_KEYS.PADRAO;
}

export function getCommercialPlanMonthlyPrice(planKey: unknown) {
  const normalized = normalizeCommercialPlanKey(planKey);
  if (normalized === COMMERCIAL_PLAN_KEYS.LITE) return COMMERCIAL_PRICING.liteMonthly;
  if (normalized === COMMERCIAL_PLAN_KEYS.MELHOR) return COMMERCIAL_PRICING.melhorMonthly;
  return COMMERCIAL_PRICING.padraoMonthly;
}

export function getCommercialPlanTitle(planKey: unknown) {
  const normalized = normalizeCommercialPlanKey(planKey);
  if (normalized === COMMERCIAL_PLAN_KEYS.LITE) return 'HBX List';
  if (normalized === COMMERCIAL_PLAN_KEYS.MELHOR) return 'HBX Full — Bot e IA';
  return 'HBX Lead';
}

export function computeCommercialPlanCycleAmount(planKey: unknown, billingCycleRaw: unknown) {
  const monthly = getCommercialPlanMonthlyPrice(planKey);
  const billingCycle = String(billingCycleRaw || '').trim().toUpperCase() === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
  if (billingCycle !== 'ANNUAL') return toCommercialCurrency(monthly);
  const annualFull = monthly * 12;
  return toCommercialCurrency(annualFull * (1 - COMMERCIAL_PRICING.annualDiscountPercent / 100));
}

export function buildCommercialPlansCatalog() {
  return [
    {
      key: COMMERCIAL_PLAN_KEYS.LITE,
      title: 'HBX List',
      status: 'available',
      monthlyPrice: COMMERCIAL_PRICING.liteMonthly,
      trialDays: 0,
      annualDiscountPercent: COMMERCIAL_PRICING.annualDiscountPercent,
      headline: 'Radar Digital com lista comercial pronta para Vendas.',
      description: 'Para escolher filtros do Radar, puxar cards elegíveis do banco e abrir WhatsApp externo.',
      badge: 'Entrada',
      recommended: false,
      requiresCheckout: true,
      quotas: COMMERCIAL_PLAN_QUOTAS[COMMERCIAL_PLAN_KEYS.LITE],
      features: [
        'Radar Digital + Vendas',
        'Filtros por cidade, segmento e perfil',
        'Até 50 cards por pesquisa',
        '3 pesquisas comerciais, total 150 cards',
        'Cards elegíveis respeitando negativos, opt-outs e descartes',
        'WhatsApp externo ao clicar no número',
        'Sem Atendimento interno, Night Factory ou Bot IA',
      ],
      legalCopy: 'Liberação após pagamento confirmado.',
    },
    {
      key: COMMERCIAL_PLAN_KEYS.PADRAO,
      title: 'HBX Lead',
      status: 'available',
      monthlyPrice: COMMERCIAL_PRICING.padraoMonthly,
      trialDays: 30,
      annualDiscountPercent: COMMERCIAL_PRICING.annualDiscountPercent,
      headline: 'Para prospectar, atender e operar a Night Factory.',
      description: 'Para quem quer Radar Digital + Vendas + Atendimento interno com oportunidades noturnas.',
      badge: 'Mais escolhido',
      recommended: true,
      requiresCheckout: false,
      quotas: COMMERCIAL_PLAN_QUOTAS[COMMERCIAL_PLAN_KEYS.PADRAO],
      features: [
        'Tudo do HBX List',
        'Radar Digital + Vendas + Atendimento',
        'Prospecção com filtros de segmento e cidade',
        'Cards elegíveis alimentando Prospecção/Atendimento',
        'Atendimento interno pelo painel',
        'Night Factory liberado',
        'Controle de retornos',
        'Histórico por cliente',
        'Scripts comerciais sugeridos',
        'Sem Bot IA automático completo',
      ],
      legalCopy: 'Trial gratuito de 30 dias. Não precisa de cartão. Não haverá cobrança automática.',
    },
    {
      key: COMMERCIAL_PLAN_KEYS.MELHOR,
      title: 'HBX Full — Bot e IA',
      status: 'available',
      monthlyPrice: COMMERCIAL_PRICING.melhorMonthly,
      trialDays: 0,
      annualDiscountPercent: COMMERCIAL_PRICING.annualDiscountPercent,
      headline: 'Automação completa com Bot IA, Radar e Night Factory.',
      description: 'Para quem quer o HBX completo com atendimento, prospecção, bot e automação.',
      badge: 'Mais completo',
      recommended: false,
      requiresCheckout: true,
      quotas: COMMERCIAL_PLAN_QUOTAS[COMMERCIAL_PLAN_KEYS.MELHOR],
      features: [
        'Tudo do HBX Lead',
        'Bot IA liberado',
        'Bot de prospecção pós-resposta',
        'Respostas automáticas',
        'Qualificação de interessados',
        'Night Factory completa',
        'Opportunity Score completo',
        'Mini-auditorias digitais',
        'Recovery inteligente',
        'Regras de segurança para automação',
        'Encaminhamento para humano',
        'Automação com limites e segurança',
      ],
      legalCopy: 'Liberação após pagamento confirmado.',
    },
  ];
}
