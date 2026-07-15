export type SellerQuotaConfig = {
  baseActiveCardLimit?: number | null;
  minActiveCardLimit?: number | null;
  maxActiveCardLimit?: number | null;
  manualActiveCardLimitOverride?: number | null;
  allowAutoQuotaIncrease?: boolean | null;
  allowInactivityPenalty?: boolean | null;
  paused?: boolean | null;
};

export type SellerQuotaInput = {
  config: SellerQuotaConfig;
  companyDefaults?: {
    baseActiveCardLimit?: number | null;
    minActiveCardLimit?: number | null;
    maxActiveCardLimit?: number | null;
  } | null;
  salesWonLast30: number;
  inactivityDays: number;
};

export type SellerQuotaResult = {
  effectiveLimit: number;
  baseLimit: number;
  bonus: number;
  inactivityPenalty: number;
  reason: 'SELLER_QUOTA_PAUSED' | 'MANUAL_OVERRIDE' | 'DYNAMIC';
};

export type RadarQuotaCheckInput = {
  sellerId: string | number;
  companyId: string | number;
  requestedLimit: number;
  activeCount: number;
  effectiveLimit: number;
  planLimit?: number | null;
  dailyRemaining?: number | null;
};

export function clampSellerCardLimit(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(Number(value || 0) || 0)));
}

function normalizeLimit(value: unknown, fallback: number): number {
  const parsed = Math.trunc(Number(value || 0));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveSellerCardQuota({
  config,
  companyDefaults,
  salesWonLast30,
  inactivityDays,
}: SellerQuotaInput): SellerQuotaResult {
  const min = normalizeLimit(config.minActiveCardLimit ?? companyDefaults?.minActiveCardLimit, 5);
  const max = normalizeLimit(config.maxActiveCardLimit ?? companyDefaults?.maxActiveCardLimit, 100);
  const baseLimit = clampSellerCardLimit(
    normalizeLimit(config.baseActiveCardLimit ?? companyDefaults?.baseActiveCardLimit, 20),
    min,
    max,
  );

  if (config.paused) {
    return {
      effectiveLimit: 0,
      baseLimit,
      bonus: 0,
      inactivityPenalty: 0,
      reason: 'SELLER_QUOTA_PAUSED',
    };
  }

  if (typeof config.manualActiveCardLimitOverride === 'number') {
    return {
      effectiveLimit: clampSellerCardLimit(config.manualActiveCardLimitOverride, min, max),
      baseLimit,
      bonus: 0,
      inactivityPenalty: 0,
      reason: 'MANUAL_OVERRIDE',
    };
  }

  const bonus = config.allowAutoQuotaIncrease === false
    ? 0
    : Math.floor(Math.max(0, Math.trunc(Number(salesWonLast30 || 0) || 0)) / 3) * 5;
  const baseWithBonus = baseLimit + bonus;
  let inactivityPenalty = 0;
  if (config.allowInactivityPenalty !== false) {
    const days = Math.max(0, Math.trunc(Number(inactivityDays || 0) || 0));
    if (days > 14) inactivityPenalty = Math.max(0, baseWithBonus - min);
    else if (days >= 8) inactivityPenalty = Math.floor(baseWithBonus * 0.5);
    else if (days >= 4) inactivityPenalty = Math.floor(baseWithBonus * 0.25);
  }

  return {
    effectiveLimit: clampSellerCardLimit(baseWithBonus - inactivityPenalty, min, max),
    baseLimit,
    bonus,
    inactivityPenalty,
    reason: 'DYNAMIC',
  };
}

export function resolveRadarSearchAllowance(input: RadarQuotaCheckInput) {
  const requestedLimit = Math.max(0, Math.trunc(Number(input.requestedLimit || 0) || 0));
  const planLimit = input.planLimit == null
    ? requestedLimit
    : Math.max(0, Math.trunc(Number(input.planLimit || 0) || 0));
  const dailyRemaining = input.dailyRemaining == null
    ? requestedLimit
    : Math.max(0, Math.trunc(Number(input.dailyRemaining || 0) || 0));
  const activeCount = Math.max(0, Math.trunc(Number(input.activeCount || 0) || 0));
  const effectiveLimit = Math.max(0, Math.trunc(Number(input.effectiveLimit || 0) || 0));
  const availableSlots = Math.max(0, effectiveLimit - activeCount);

  if (availableSlots <= 0) {
    return {
      ok: false,
      code: 'SELLER_CARD_QUOTA_REACHED' as const,
      activeCount,
      effectiveLimit,
      availableSlots: 0,
      allowedLimit: 0,
      message: 'Seu limite de cards ativos foi atingido. Finalize, transfira ou peça mais cards ao responsável.',
    };
  }

  const allowedLimit = Math.max(0, Math.min(requestedLimit, availableSlots, planLimit, dailyRemaining));
  return {
    ok: allowedLimit > 0,
    code: allowedLimit > 0 ? 'OK' as const : 'SELLER_CARD_QUOTA_REACHED' as const,
    activeCount,
    effectiveLimit,
    availableSlots,
    allowedLimit,
  };
}
