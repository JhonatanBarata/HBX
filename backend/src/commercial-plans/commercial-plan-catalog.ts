export const COMMERCIAL_PLAN_KEYS = {
  VENDAS: 'hbx_vendas',
  VENDAS_IA: 'hbx_vendas_ia',
  RECOVERY: 'hbx_recovery',
} as const;

export const COMMERCIAL_ENTITLEMENT_KEYS = {
  VENDAS: 'vendas',
  BOT_IA: 'bot_ia',
  RECOVERY: 'recovery',
} as const;

export type CommercialPlanKey = (typeof COMMERCIAL_PLAN_KEYS)[keyof typeof COMMERCIAL_PLAN_KEYS];
export type CommercialEntitlementKey =
  (typeof COMMERCIAL_ENTITLEMENT_KEYS)[keyof typeof COMMERCIAL_ENTITLEMENT_KEYS];

export const COMMERCIAL_PRICING = {
  vendasMonthly: 89.90,
  botAiMonthly: 39.90,
  botAiIntroMonthly: 19.95,
  comboRegularMonthly: 129.80,
  comboIntroMonthly: 109.85,
  comboIntroCycles: 3,
  botAiIntroDiscountPercent: 50,
} as const;

export const BOT_IA_PLAN_REQUIRED_PAYLOAD = {
  code: 'BOT_IA_PLAN_REQUIRED',
  message: 'O BOT Inteligente faz parte do plano HBX Vendas + IA.',
  redirectTo: '/dashboard/planos?intent=bot_ia',
  requiredPlanKey: COMMERCIAL_PLAN_KEYS.VENDAS_IA,
} as const;

export const ACTIVE_COMMERCIAL_ENTITLEMENT_STATUSES = new Set([
  'active',
  'trialing',
  'paid',
  'manual',
]);

export type BotAiIntroMetadata = {
  introDiscountPercent: number;
  introCyclesTotal: number;
  introCyclesRemaining: number;
  regularMonthlyPrice: number;
  introMonthlyPrice: number;
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

export function buildBotAiIntroMetadata(): BotAiIntroMetadata {
  return {
    introDiscountPercent: COMMERCIAL_PRICING.botAiIntroDiscountPercent,
    introCyclesTotal: COMMERCIAL_PRICING.comboIntroCycles,
    introCyclesRemaining: COMMERCIAL_PRICING.comboIntroCycles,
    regularMonthlyPrice: COMMERCIAL_PRICING.botAiMonthly,
    introMonthlyPrice: COMMERCIAL_PRICING.botAiIntroMonthly,
  };
}

export function resolveBotAiIntroCyclesRemaining(metadataJson: unknown) {
  const metadata = parseCommercialMetadata(metadataJson);
  const remaining = Math.trunc(Number(metadata.introCyclesRemaining ?? 0));
  return Number.isFinite(remaining) ? Math.max(0, remaining) : 0;
}

export function buildCommercialPlansCatalog() {
  return [
    {
      key: COMMERCIAL_PLAN_KEYS.VENDAS,
      title: 'HBX Vendas',
      status: 'available',
      monthlyPrice: COMMERCIAL_PRICING.vendasMonthly,
      trialDays: 30,
      headline: 'Vendas com WhatsApp embutido',
      features: [
        'WhatsApp embutido',
        'Vendas + agenda comercial + atendimento base',
        'Free trial de 30 dias',
      ],
    },
    {
      key: COMMERCIAL_PLAN_KEYS.VENDAS_IA,
      title: 'HBX Vendas + IA',
      status: 'available',
      monthlyPrice: COMMERCIAL_PRICING.comboRegularMonthly,
      introMonthlyPrice: COMMERCIAL_PRICING.comboIntroMonthly,
      introCycles: COMMERCIAL_PRICING.comboIntroCycles,
      headline: 'Vendas com BOT Inteligente',
      features: [
        'Tudo do HBX Vendas',
        'BOT Inteligente para configurar e ativar fluxos',
        '50% de desconto no BOT nas 3 primeiras mensalidades',
      ],
      priceBreakdown: {
        vendas: COMMERCIAL_PRICING.vendasMonthly,
        bot_ia: COMMERCIAL_PRICING.botAiMonthly,
        botAiIntroDiscountPercent: COMMERCIAL_PRICING.botAiIntroDiscountPercent,
        introTotal: COMMERCIAL_PRICING.comboIntroMonthly,
        regularTotal: COMMERCIAL_PRICING.comboRegularMonthly,
      },
      legalCopy:
        'Nas 3 primeiras mensalidades, o BOT Inteligente tem 50% de desconto. Depois, o valor mensal passa para R$ 129,80.',
    },
    {
      key: COMMERCIAL_PLAN_KEYS.RECOVERY,
      title: 'HBX Recovery',
      status: 'unavailable',
      monthlyPrice: null,
      disabledReason: 'Indisponível no momento',
      features: ['Ainda não disponível para contratação.'],
    },
  ];
}
