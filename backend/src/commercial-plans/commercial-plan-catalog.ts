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
} as const;

export type CommercialPlanKey = (typeof COMMERCIAL_PLAN_KEYS)[keyof typeof COMMERCIAL_PLAN_KEYS];
export type ActiveCommercialPlanKey =
  | typeof COMMERCIAL_PLAN_KEYS.LITE
  | typeof COMMERCIAL_PLAN_KEYS.PADRAO
  | typeof COMMERCIAL_PLAN_KEYS.MELHOR;
export type CommercialEntitlementKey =
  (typeof COMMERCIAL_ENTITLEMENT_KEYS)[keyof typeof COMMERCIAL_ENTITLEMENT_KEYS];

export const COMMERCIAL_PRICING = {
  liteMonthly: 29.90,
  padraoMonthly: 79.90,
  melhorMonthly: 129.90,
  annualDiscountPercent: 10,
} as const;

export const COMMERCIAL_PLAN_QUOTAS: Record<ActiveCommercialPlanKey, { googleSearchesPerDay: number }> = {
  [COMMERCIAL_PLAN_KEYS.LITE]: { googleSearchesPerDay: 0 },
  [COMMERCIAL_PLAN_KEYS.PADRAO]: { googleSearchesPerDay: 2 },
  [COMMERCIAL_PLAN_KEYS.MELHOR]: { googleSearchesPerDay: 6 },
};

export const GOOGLE_DAILY_LIMIT_REACHED_MESSAGE =
  'Você atingiu suas buscas Google de hoje. Os motores gratuitos continuam liberados. Para mais buscas por dia, escolha o HBX Melhor.';

export const BOT_IA_PLAN_REQUIRED_PAYLOAD = {
  code: 'BOT_IA_PLAN_REQUIRED',
  message: 'Bot de atendimento está disponível no plano HBX Melhor.',
  redirectTo: '/dashboard/planos?intent=bot_ia',
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
  [COMMERCIAL_PLAN_KEYS.MELHOR]: ['atendimento', 'vendas', 'webscraping'],
};

export const COMMERCIAL_PLAN_ENTITLEMENT_KEYS: Record<ActiveCommercialPlanKey, CommercialEntitlementKey[]> = {
  [COMMERCIAL_PLAN_KEYS.LITE]: [
    COMMERCIAL_ENTITLEMENT_KEYS.VENDAS,
    COMMERCIAL_ENTITLEMENT_KEYS.WEBSCRAPING,
  ],
  [COMMERCIAL_PLAN_KEYS.PADRAO]: [
    COMMERCIAL_ENTITLEMENT_KEYS.VENDAS,
    COMMERCIAL_ENTITLEMENT_KEYS.ATENDIMENTO_CHAT,
    COMMERCIAL_ENTITLEMENT_KEYS.WEBSCRAPING,
  ],
  [COMMERCIAL_PLAN_KEYS.MELHOR]: [
    COMMERCIAL_ENTITLEMENT_KEYS.VENDAS,
    COMMERCIAL_ENTITLEMENT_KEYS.ATENDIMENTO_CHAT,
    COMMERCIAL_ENTITLEMENT_KEYS.WEBSCRAPING,
    COMMERCIAL_ENTITLEMENT_KEYS.BOT_IA,
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
  if (normalized === COMMERCIAL_PLAN_KEYS.LITE) return 'HBX Lite';
  if (normalized === COMMERCIAL_PLAN_KEYS.MELHOR) return 'HBX Melhor';
  return 'HBX Padrão';
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
      title: 'HBX Lite',
      status: 'available',
      monthlyPrice: COMMERCIAL_PRICING.liteMonthly,
      trialDays: 0,
      annualDiscountPercent: COMMERCIAL_PRICING.annualDiscountPercent,
      headline: 'Organização básica para começar.',
      description: 'Para quem quer registrar oportunidades e manter a prospecção inicial sob controle, sem automação avançada.',
      badge: 'Entrada',
      recommended: false,
      requiresCheckout: true,
      quotas: COMMERCIAL_PLAN_QUOTAS[COMMERCIAL_PLAN_KEYS.LITE],
      features: [
        'Vendas organizadas em um só lugar',
        'Prospecção com motores gratuitos/HBX/cache',
        'Ideal para começar com baixo custo',
      ],
      legalCopy: 'Liberação após pagamento confirmado.',
    },
    {
      key: COMMERCIAL_PLAN_KEYS.PADRAO,
      title: 'HBX Padrão',
      status: 'available',
      monthlyPrice: COMMERCIAL_PRICING.padraoMonthly,
      trialDays: 30,
      annualDiscountPercent: COMMERCIAL_PRICING.annualDiscountPercent,
      headline: 'O plano certo para vender todos os dias.',
      description: 'Plano principal para primeiros clientes HBX: CRM de vendas, atendimento e webscraping com preço de lançamento.',
      badge: 'Mais escolhido',
      recommended: true,
      requiresCheckout: false,
      quotas: COMMERCIAL_PLAN_QUOTAS[COMMERCIAL_PLAN_KEYS.PADRAO],
      features: [
        '30 dias grátis, sem cobrança automática',
        'Vendas + Atendimento Chat',
        '2 buscas Google por dia',
        'Motores gratuitos/HBX/cache liberados',
        'Ideal para começar a vender com constância',
      ],
      legalCopy: 'Trial gratuito de 30 dias. Não precisa de cartão. Não haverá cobrança automática.',
    },
    {
      key: COMMERCIAL_PLAN_KEYS.MELHOR,
      title: 'HBX Melhor',
      status: 'available',
      monthlyPrice: COMMERCIAL_PRICING.melhorMonthly,
      trialDays: 0,
      annualDiscountPercent: COMMERCIAL_PRICING.annualDiscountPercent,
      headline: 'Bot IA, mais volume e atendimento no mesmo pacote.',
      description: 'Para quem quer abordagem com Bot IA, mais buscas Google por dia e operação comercial mais automatizada.',
      badge: 'Mais completo',
      recommended: false,
      requiresCheckout: true,
      quotas: COMMERCIAL_PLAN_QUOTAS[COMMERCIAL_PLAN_KEYS.MELHOR],
      features: [
        'Vendas + Atendimento Chat',
        'Bot de atendimento',
        '6 buscas Google por dia',
        'Motores gratuitos/HBX/cache liberados',
        'Pacote mais completo',
      ],
      legalCopy: 'Liberação após pagamento confirmado.',
    },
  ];
}
