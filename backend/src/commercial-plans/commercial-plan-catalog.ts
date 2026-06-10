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
export type CommercialPlanTier = 'list' | 'lead' | 'full';
export type CommercialPlanCapabilities = {
  canSeeLeadIntelligence: boolean;
  canSeeOpportunityReason: boolean;
  canSeeSocialLinks: boolean | 'teaser_only';
  canSeeMessageTemplates: boolean;
  canAutoEnrichLeads: boolean;
  canUseAdvancedFilters: boolean;
  canUseVerifiedWhatsapp: boolean | 'limited';
  canUseFilteredQuota: boolean;
  canUseSalesProfileAdvanced: boolean;
  canSeeConversionReport: boolean;
  canExportConversionPdf: boolean;
  canUseWeeklyProfileSuggestions: boolean;
};

export const COMMERCIAL_PRICING = {
  liteMonthly: 45.00,
  padraoMonthly: 99.00,
  melhorMonthly: 149.90,
  extraUserMonthly: 24.90,
  annualDiscountPercent: 20,
} as const;

export const COMMERCIAL_PLAN_QUOTAS: Record<ActiveCommercialPlanKey, {
  googleSearchesPerDay: number;
  cardsPerMonth: number;
  dailyCardSafetyLimit: number;
  enrichmentsPerDay: number;
  cardsPerSearch?: number;
  searchesPerCycle?: number;
  totalCards?: number;
}> = {
  [COMMERCIAL_PLAN_KEYS.LITE]: {
    googleSearchesPerDay: 0,
    cardsPerMonth: 880,
    dailyCardSafetyLimit: 50,
    enrichmentsPerDay: 3,
    cardsPerSearch: 50,
    searchesPerCycle: 3,
    totalCards: 880,
  },
  [COMMERCIAL_PLAN_KEYS.PADRAO]: {
    googleSearchesPerDay: 2,
    cardsPerMonth: 2200,
    dailyCardSafetyLimit: 100,
    enrichmentsPerDay: 100,
  },
  [COMMERCIAL_PLAN_KEYS.MELHOR]: {
    googleSearchesPerDay: 6,
    cardsPerMonth: 5000,
    dailyCardSafetyLimit: 250,
    enrichmentsPerDay: 250,
  },
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

// Regra unica de trial self-service (PR10062026002 C.1): so o Lead Plus tem
// trial; List e Full sao contratacao direta. Quem precisa do prazo le daqui.
export const COMMERCIAL_PLAN_TRIAL_DAYS: Record<ActiveCommercialPlanKey, number> = {
  [COMMERCIAL_PLAN_KEYS.LITE]: 0,
  [COMMERCIAL_PLAN_KEYS.PADRAO]: 14,
  [COMMERCIAL_PLAN_KEYS.MELHOR]: 0,
};

export function getCommercialPlanTrialDays(planKey: unknown) {
  const normalized = normalizeCommercialPlanKey(planKey);
  return COMMERCIAL_PLAN_TRIAL_DAYS[normalized] ?? 0;
}

export const COMMERCIAL_PLAN_MODULE_KEYS: Record<ActiveCommercialPlanKey, string[]> = {
  [COMMERCIAL_PLAN_KEYS.LITE]: ['vendas', 'webscraping'],
  [COMMERCIAL_PLAN_KEYS.PADRAO]: ['atendimento', 'vendas', 'webscraping', 'cadastro', 'gerencial'],
  [COMMERCIAL_PLAN_KEYS.MELHOR]: ['atendimento', 'vendas', 'webscraping', 'cadastro', 'gerencial', 'bot_ia'],
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

export function resolveCommercialPlanKeyForCapabilities(input: {
  selectedPlanKey?: unknown;
  premiumAccess?: unknown;
  paymentStatus?: unknown;
  subscriptionStatus?: unknown;
}): ActiveCommercialPlanKey {
  const rawSelected = String(input.selectedPlanKey || '').trim();
  const selected = rawSelected ? normalizeCommercialPlanKey(rawSelected) : null;
  const paymentStatus = String(input.paymentStatus || '').trim().toUpperCase();
  const subscriptionStatus = String(input.subscriptionStatus || '').trim().toLowerCase();
  const manualOverride = paymentStatus === 'MANUAL' || subscriptionStatus === 'manual';

  if (selected === COMMERCIAL_PLAN_KEYS.MELHOR) return COMMERCIAL_PLAN_KEYS.MELHOR;
  if (manualOverride && Boolean(input.premiumAccess)) return COMMERCIAL_PLAN_KEYS.MELHOR;
  if (!selected && Boolean(input.premiumAccess)) return COMMERCIAL_PLAN_KEYS.MELHOR;
  if (selected) return selected;
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
  return 'HBX Lead Plus';
}

export function getCommercialPlanTier(planKey: unknown): CommercialPlanTier {
  const normalized = normalizeCommercialPlanKey(planKey);
  if (normalized === COMMERCIAL_PLAN_KEYS.LITE) return 'list';
  if (normalized === COMMERCIAL_PLAN_KEYS.MELHOR) return 'full';
  return 'lead';
}

export function getCommercialPlanCapabilities(planKey: unknown): CommercialPlanCapabilities {
  const tier = getCommercialPlanTier(planKey);
  if (tier === 'list') {
    return {
      canSeeLeadIntelligence: false,
      canSeeOpportunityReason: false,
      canSeeSocialLinks: true,
      canSeeMessageTemplates: false,
      canAutoEnrichLeads: false,
      canUseAdvancedFilters: false,
      canUseVerifiedWhatsapp: 'limited',
      canUseFilteredQuota: false,
      canUseSalesProfileAdvanced: false,
      canSeeConversionReport: true,
      canExportConversionPdf: false,
      canUseWeeklyProfileSuggestions: false,
    };
  }
  return {
    canSeeLeadIntelligence: true,
    canSeeOpportunityReason: true,
    canSeeSocialLinks: true,
    canSeeMessageTemplates: true,
    canAutoEnrichLeads: true,
    canUseAdvancedFilters: true,
    canUseVerifiedWhatsapp: true,
    canUseFilteredQuota: true,
    canUseSalesProfileAdvanced: true,
    canSeeConversionReport: true,
    canExportConversionPdf: true,
    canUseWeeklyProfileSuggestions: true,
  };
}

export function computeCommercialPlanCycleAmount(planKey: unknown, billingCycleRaw: unknown) {
  const monthly = getCommercialPlanMonthlyPrice(planKey);
  const billingCycle = String(billingCycleRaw || '').trim().toUpperCase() === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
  if (billingCycle !== 'ANNUAL') return toCommercialCurrency(monthly);
  const annualFull = monthly * 12;
  return toCommercialCurrency(annualFull * (1 - COMMERCIAL_PRICING.annualDiscountPercent / 100));
}

export function buildCommercialPlansCatalog(options: { includeHidden?: boolean } = {}) {
  const catalog = [
    {
      key: COMMERCIAL_PLAN_KEYS.LITE,
      title: 'HBX List',
      status: 'available',
      monthlyPrice: COMMERCIAL_PRICING.liteMonthly,
      trialDays: COMMERCIAL_PLAN_TRIAL_DAYS[COMMERCIAL_PLAN_KEYS.LITE],
      annualDiscountPercent: COMMERCIAL_PRICING.annualDiscountPercent,
      includedUsers: 1,
      extraUserMonthlyPrice: 0,
      requiresAssistedSetup: false,
      setupFeeMode: 'none',
      hidden: false,
      headline: 'Cards simples para começar barato.',
      description: 'Leads/cards simples com telefone, cidade, segmento, site, redes sociais e canais encontrados. WhatsApp externo e inteligência premium quando contratar Lead.',
      badge: 'Entrada',
      recommended: false,
      requiresCheckout: false,
      quotas: COMMERCIAL_PLAN_QUOTAS[COMMERCIAL_PLAN_KEYS.LITE],
      features: [
        'Radar Digital + Vendas com cards simples',
        'Telefone, cidade, segmento e site básico',
        'Instagram/Facebook quando encontrados',
        'E-mail quando encontrado ou provável',
        'WhatsApp externo',
        '880 cards por mês',
        'Até 50 cards por pesquisa',
        '3 pesquisas comerciais por mês',
        'Negativos, opt-outs e duplicados respeitados',
        'Sem score, motivo inteligente ou mensagem pronta do Lead+',
      ],
      legalCopy: 'Liberação após pagamento confirmado.',
    },
    {
      key: COMMERCIAL_PLAN_KEYS.PADRAO,
      title: 'HBX Lead Plus',
      status: 'available',
      monthlyPrice: COMMERCIAL_PRICING.padraoMonthly,
      trialDays: COMMERCIAL_PLAN_TRIAL_DAYS[COMMERCIAL_PLAN_KEYS.PADRAO],
      annualDiscountPercent: COMMERCIAL_PRICING.annualDiscountPercent,
      includedUsers: 2,
      extraUserMonthlyPrice: COMMERCIAL_PRICING.extraUserMonthly,
      requiresAssistedSetup: false,
      setupFeeMode: 'none',
      hidden: false,
      headline: 'Card inteligente: prioridade, canal, motivo e mensagem pronta.',
      description: 'Leads inteligentes com WhatsApp verificado pela HBX, e-mail confirmado/provável, motivo, canal recomendado e templates comerciais.',
      badge: 'Mais vendido',
      recommended: true,
      requiresCheckout: false,
      quotas: COMMERCIAL_PLAN_QUOTAS[COMMERCIAL_PLAN_KEYS.PADRAO],
      features: [
        'Tudo do HBX List',
        'WhatsApp verificado',
        'Instagram/Facebook quando encontrados',
        'Score de oportunidade',
        'Motivo do score',
        'Canal recomendado',
        'Mensagem pronta por segmento',
        'Filtros inteligentes',
        '2.200 cards inteligentes por mês',
        'Trava diária técnica anti-abuso',
        'Limite consumido por card entregue',
        'Histórico, retornos e agenda',
      ],
      legalCopy: 'Teste de 14 dias. Após o trial, contratação segue pelo checkout.',
    },
    {
      key: COMMERCIAL_PLAN_KEYS.MELHOR,
      title: 'HBX Full — Bot e IA',
      status: 'available',
      monthlyPrice: COMMERCIAL_PRICING.melhorMonthly,
      trialDays: COMMERCIAL_PLAN_TRIAL_DAYS[COMMERCIAL_PLAN_KEYS.MELHOR],
      annualDiscountPercent: COMMERCIAL_PRICING.annualDiscountPercent,
      includedUsers: 2,
      extraUserMonthlyPrice: COMMERCIAL_PRICING.extraUserMonthly,
      requiresAssistedSetup: true,
      setupFeeMode: 'negotiated',
      hidden: false,
      headline: 'WhatsApp comercial completo com implantação assistida.',
      description: 'WhatsApp comercial completo com Atendimento, Bot IA, Radar, Vendas e implantação assistida.',
      badge: 'Mais completo',
      recommended: true,
      requiresCheckout: false,
      quotas: COMMERCIAL_PLAN_QUOTAS[COMMERCIAL_PLAN_KEYS.MELHOR],
      features: [
        'Tudo do HBX List',
        'Atendimento interno pelo painel',
        'Bot IA liberado',
        'Bot de prospecção pós-resposta',
        'Respostas automáticas',
        'Qualificação de interessados',
        'Night Factory completa',
        'Opportunity Score completo',
        'Mini-auditorias digitais',
        'Recovery inteligente',
        '5.000 cards inteligentes por mês',
        'Regras de segurança para automação',
        'Encaminhamento para humano',
        'Automação com limites e segurança',
        'Implantação e configuração assistida pela HBX',
      ],
      legalCopy: 'Liberação após pagamento confirmado. Automação/Bot IA precisa ser configurada com segurança pela HBX.',
    },
  ];

  return options.includeHidden ? catalog : catalog.filter((plan) => !plan.hidden);
}
