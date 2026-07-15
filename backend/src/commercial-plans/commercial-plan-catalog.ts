export const COMMERCIAL_PLAN_KEYS = {
  LITE: 'hbx_lite',
  PADRAO: 'hbx_padrao',
  PRO: 'hbx_pro',
  MELHOR: 'hbx_melhor',
} as const;

export const COMMERCIAL_ENTITLEMENT_KEYS = {
  VENDAS: 'vendas',
  ATENDIMENTO_CHAT: 'atendimento_chat',
  WEBSCRAPING: 'webscraping',
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
  | typeof COMMERCIAL_PLAN_KEYS.PRO
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

export const UNIVERSAL_PRODUCT_CAPABILITIES: CommercialPlanCapabilities = Object.freeze({
  canSeeLeadIntelligence: true,
  canSeeOpportunityReason: true,
  canSeeSocialLinks: true,
  canSeeMessageTemplates: true,
  // Enriquecimento acontece somente na puxada/debito do lead; não existe
  // enriquecimento automático extra como benefício de pacote.
  canAutoEnrichLeads: false,
  canUseAdvancedFilters: true,
  canUseVerifiedWhatsapp: true,
  canUseFilteredQuota: true,
  canUseSalesProfileAdvanced: true,
  canSeeConversionReport: true,
  canExportConversionPdf: true,
  canUseWeeklyProfileSuggestions: true,
});

export const COMMERCIAL_PRICING = {
  liteMonthly: 49.00,
  padraoMonthly: 99.00,
  proMonthly: 249.00,
  // HBX Company (ordem do dono 15/06): a partir de R$ 445,90/mês + implantação a
  // partir de R$ 300. Mensalidade E implantação são negociadas (o dono conversa com
  // a empresa); "a partir de" é EXCLUSIVO do Company. Sem self-checkout de cartão.
  melhorMonthly: 445.90,
  extraUserMonthly: 24.90,
  annualDiscountPercent: 20,
} as const;

// ── Self-Checkout (F2): overlay editável do catálogo ─────────────────────────
// O catálogo nasce em CÓDIGO (base abaixo). O master edita por plano em
// PlanModuleConfig.planInfoJson; o backend carrega esses overrides para CÁ no
// boot e a cada edição (modules.service.refreshCommercialCatalogOverlay). Os
// getters síncronos consultam o overlay PRIMEIRO e caem na base se não houver
// override — fonte ÚNICA, empresa só aponta plano+ciclo. Sem overlay carregado
// (boot incompleto) os getters seguem na base: nunca vaza preço errado.
export type CommercialPlanOverride = {
  title?: string;
  observation?: string;
  status?: 'available' | 'paused';
  monthlyPrice?: number;
  includedUsers?: number;
  extraUserMonthly?: number;
  trialDays?: number;
};

const COMMERCIAL_CATALOG_OVERRIDES = new Map<ActiveCommercialPlanKey, CommercialPlanOverride>();

export function applyCommercialCatalogOverrides(
  entries: Array<{ planKey: unknown; override: CommercialPlanOverride | null | undefined }>,
) {
  COMMERCIAL_CATALOG_OVERRIDES.clear();
  for (const entry of entries || []) {
    const ov = entry?.override;
    if (!ov || typeof ov !== 'object') continue;
    const key = normalizeCommercialPlanKey(entry?.planKey);
    const clean: CommercialPlanOverride = {};
    if (typeof ov.title === 'string' && ov.title.trim()) clean.title = ov.title.trim();
    if (typeof ov.observation === 'string') clean.observation = ov.observation;
    if (ov.status === 'paused' || ov.status === 'available') clean.status = ov.status;
    if (ov.monthlyPrice != null && Number.isFinite(Number(ov.monthlyPrice))) clean.monthlyPrice = toCommercialCurrency(ov.monthlyPrice);
    if (ov.includedUsers != null && Number.isFinite(Number(ov.includedUsers))) clean.includedUsers = Math.max(0, Math.trunc(Number(ov.includedUsers)));
    if (ov.extraUserMonthly != null && Number.isFinite(Number(ov.extraUserMonthly))) clean.extraUserMonthly = toCommercialCurrency(ov.extraUserMonthly);
    if (ov.trialDays != null && Number.isFinite(Number(ov.trialDays))) clean.trialDays = Math.max(0, Math.trunc(Number(ov.trialDays)));
    COMMERCIAL_CATALOG_OVERRIDES.set(key, clean);
  }
}

// Desconto do plano anual: GLOBAL e fonte ÚNICA aqui. O master edita na Política
// comercial (Self-Checkout); o valor persistido alimenta este override no boot/edição.
// 0/ausente → cai no default do catálogo (não vira "sem desconto" por engano).
let COMMERCIAL_ANNUAL_DISCOUNT_OVERRIDE: number | null = null;

export function applyCommercialAnnualDiscountOverride(percent: unknown) {
  const n = Number(percent);
  COMMERCIAL_ANNUAL_DISCOUNT_OVERRIDE = Number.isFinite(n) && n > 0 ? n : null;
}

export function getCommercialAnnualDiscountPercent(): number {
  return COMMERCIAL_ANNUAL_DISCOUNT_OVERRIDE != null
    ? COMMERCIAL_ANNUAL_DISCOUNT_OVERRIDE
    : COMMERCIAL_PRICING.annualDiscountPercent;
}

export function clearCommercialCatalogOverrides() {
  COMMERCIAL_CATALOG_OVERRIDES.clear();
  COMMERCIAL_ANNUAL_DISCOUNT_OVERRIDE = null;
}

export function getCommercialCatalogOverride(planKey: unknown): CommercialPlanOverride | null {
  return COMMERCIAL_CATALOG_OVERRIDES.get(normalizeCommercialPlanKey(planKey)) || null;
}

// Decisão do dono 07/07 (modelo de crédito): a vitrine pública oferta SÓ o plano topo
// (Enterprise = hbx_melhor / "Implantação"). List/Lead/Pro saem da oferta pública por
// DEFAULT de código — NÃO são apagados (contas e billing existentes seguem intactos;
// migration destrutiva só depois de 1 ciclo limpo, ver PAGAMENTOS.md), apenas nascem
// 'paused' na vitrine e barrados no self-checkout. O master reabre qualquer um via
// override de banco (status:'available'), que ganha do default.
export const PUBLICLY_OFFERED_PLAN_KEYS: ReadonlySet<ActiveCommercialPlanKey> = new Set([
  COMMERCIAL_PLAN_KEYS.MELHOR,
]);

function defaultCommercialPlanStatus(planKey: ActiveCommercialPlanKey): 'available' | 'paused' {
  return PUBLICLY_OFFERED_PLAN_KEYS.has(planKey) ? 'available' : 'paused';
}

// Plano pausado (Self-Checkout): card embaçado/inclicável na vitrine e checkout
// barrado. Implantação (contactOnly) nunca passa pelo self-checkout, então pausa
// nela é inócua, mas o estado é respeitado igual. Override do master ganha em qualquer
// direção (pausar OU reabrir); sem override, vale o default de oferta pública acima.
export function isCommercialPlanPaused(planKey: unknown): boolean {
  const key = normalizeCommercialPlanKey(planKey);
  const override = getCommercialCatalogOverride(key);
  if (override?.status) return override.status === 'paused';
  return defaultCommercialPlanStatus(key) === 'paused';
}

export const COMMERCIAL_CAPACITY_UNLIMITED = 999_999;

export type CommercialOperationalEnvelope = {
  googleSearchesPerDay: number;
  cardsPerMonth: number;
  dailyCardSafetyLimit: number;
  enrichmentsPerDay: number;
  cardsPerSearch?: number;
  searchesPerCycle?: number;
  totalCards?: number;
};

// Envelope operacional único. Crédito por lead é o choke comercial; este
// objeto só preserva o contrato técnico legado enquanto o Radar migra para o
// orçamento global de fonte. Nenhum valor varia por plano/tier.
export const UNIVERSAL_COMMERCIAL_OPERATIONAL_ENVELOPE: Readonly<CommercialOperationalEnvelope> = Object.freeze({
  googleSearchesPerDay: 6,
  cardsPerMonth: COMMERCIAL_CAPACITY_UNLIMITED,
  dailyCardSafetyLimit: COMMERCIAL_CAPACITY_UNLIMITED,
  enrichmentsPerDay: COMMERCIAL_CAPACITY_UNLIMITED,
  cardsPerSearch: COMMERCIAL_CAPACITY_UNLIMITED,
  searchesPerCycle: COMMERCIAL_CAPACITY_UNLIMITED,
  totalCards: COMMERCIAL_CAPACITY_UNLIMITED,
});

export const COMMERCIAL_PLAN_QUOTAS: Record<ActiveCommercialPlanKey, CommercialOperationalEnvelope> = {
  [COMMERCIAL_PLAN_KEYS.LITE]: { ...UNIVERSAL_COMMERCIAL_OPERATIONAL_ENVELOPE },
  [COMMERCIAL_PLAN_KEYS.PADRAO]: { ...UNIVERSAL_COMMERCIAL_OPERATIONAL_ENVELOPE },
  [COMMERCIAL_PLAN_KEYS.PRO]: { ...UNIVERSAL_COMMERCIAL_OPERATIONAL_ENVELOPE },
  [COMMERCIAL_PLAN_KEYS.MELHOR]: { ...UNIVERSAL_COMMERCIAL_OPERATIONAL_ENVELOPE },
};

export const GOOGLE_DAILY_LIMIT_REACHED_MESSAGE =
  'O orçamento operacional diário do Google foi atingido. O Brave e as fontes públicas continuam disponíveis.';

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
  [COMMERCIAL_PLAN_KEYS.PRO]: 0,
  [COMMERCIAL_PLAN_KEYS.MELHOR]: 0,
};

export function getCommercialPlanTrialDays(planKey: unknown) {
  const normalized = normalizeCommercialPlanKey(planKey);
  const override = getCommercialCatalogOverride(normalized);
  if (override && override.trialDays != null) return override.trialDays;
  return COMMERCIAL_PLAN_TRIAL_DAYS[normalized] ?? 0;
}

// Regra unica de assentos (PR10062026002 C.3): usuarios inclusos no plano e
// preco do usuario extra. O aviso de custo do convite de vendedor le daqui.
export const COMMERCIAL_PLAN_INCLUDED_USERS: Record<ActiveCommercialPlanKey, number> = {
  [COMMERCIAL_PLAN_KEYS.LITE]: 1,
  [COMMERCIAL_PLAN_KEYS.PADRAO]: 2,
  [COMMERCIAL_PLAN_KEYS.PRO]: 3,
  [COMMERCIAL_PLAN_KEYS.MELHOR]: 5,
};

export const COMMERCIAL_PLAN_EXTRA_USER_MONTHLY: Record<ActiveCommercialPlanKey, number> = {
  [COMMERCIAL_PLAN_KEYS.LITE]: 0,
  [COMMERCIAL_PLAN_KEYS.PADRAO]: COMMERCIAL_PRICING.extraUserMonthly,
  [COMMERCIAL_PLAN_KEYS.PRO]: COMMERCIAL_PRICING.extraUserMonthly,
  [COMMERCIAL_PLAN_KEYS.MELHOR]: COMMERCIAL_PRICING.extraUserMonthly,
};

export function getCommercialPlanIncludedUsers(planKey: unknown) {
  const normalized = normalizeCommercialPlanKey(planKey);
  const override = getCommercialCatalogOverride(normalized);
  if (override && override.includedUsers != null) return override.includedUsers;
  return COMMERCIAL_PLAN_INCLUDED_USERS[normalized] ?? 1;
}

export function getCommercialPlanExtraUserMonthlyPrice(planKey: unknown) {
  const normalized = normalizeCommercialPlanKey(planKey);
  const override = getCommercialCatalogOverride(normalized);
  // Sem assento padrão (<=0) não existe assento extra (regra do dono).
  if (getCommercialPlanIncludedUsers(normalized) <= 0) return 0;
  if (override && override.extraUserMonthly != null) return override.extraUserMonthly;
  return COMMERCIAL_PLAN_EXTRA_USER_MONTHLY[normalized] ?? 0;
}

export function toCommercialCurrency(value: unknown) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(2));
}

// Teto de comissão por fechamento (PR13062026007). cap <= 0 = sem teto. A comissão
// SEMPRE espelha o que o vendedor recebe, então quem cria comissão (sync, recorrente,
// projeção do gerencial) capa pelo mesmo helper. Ex.: comissão R$300, teto R$100 → R$100.
export function applyCommissionCap(amount: unknown, cap: unknown) {
  const value = Math.max(0, Number(amount || 0) || 0);
  const ceiling = Math.max(0, Number(cap || 0) || 0);
  const capped = ceiling > 0 ? Math.min(value, ceiling) : value;
  return Number(capped.toFixed(2));
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
  if (normalized === COMMERCIAL_PLAN_KEYS.PRO) return COMMERCIAL_PLAN_KEYS.PRO;
  // 'hbx_vendas_ia' é chave legada (removida do catálogo): normaliza p/ MELHOR para
  // não quebrar registros históricos que migration não alcançou.
  if (normalized === COMMERCIAL_PLAN_KEYS.MELHOR || normalized === 'hbx_vendas_ia') {
    return COMMERCIAL_PLAN_KEYS.MELHOR;
  }
  return COMMERCIAL_PLAN_KEYS.PADRAO;
}

// O plano comercial e dado autoritativo (Company.selectedPlanKey, gravado no
// checkout/troca de plano). Cortesia/manual NAO implica Full — empresa
// liberada sem plano escolhido projeta Lead Plus (PADRAO), igual ao
// module-access-policy. Aceita o objeto company inteiro por conveniencia dos
// call sites; so le selectedPlanKey (a inferencia por premiumAccess/
// paymentStatus morreu no DROP do PR-002).
export function resolveCommercialPlanKeyForCapabilities(input: {
  selectedPlanKey?: unknown;
}): ActiveCommercialPlanKey {
  const rawSelected = String(input.selectedPlanKey || '').trim();
  return rawSelected ? normalizeCommercialPlanKey(rawSelected) : COMMERCIAL_PLAN_KEYS.PADRAO;
}

export function getCommercialPlanMonthlyPrice(planKey: unknown) {
  const normalized = normalizeCommercialPlanKey(planKey);
  const override = getCommercialCatalogOverride(normalized);
  if (override && override.monthlyPrice != null) return override.monthlyPrice;
  if (normalized === COMMERCIAL_PLAN_KEYS.LITE) return COMMERCIAL_PRICING.liteMonthly;
  if (normalized === COMMERCIAL_PLAN_KEYS.PRO) return COMMERCIAL_PRICING.proMonthly;
  if (normalized === COMMERCIAL_PLAN_KEYS.MELHOR) return COMMERCIAL_PRICING.melhorMonthly;
  return COMMERCIAL_PRICING.padraoMonthly;
}

export function getCommercialPlanTitle(planKey: unknown) {
  const normalized = normalizeCommercialPlanKey(planKey);
  const override = getCommercialCatalogOverride(normalized);
  if (override && override.title) return override.title;
  if (normalized === COMMERCIAL_PLAN_KEYS.LITE) return 'HBX List';
  if (normalized === COMMERCIAL_PLAN_KEYS.PRO) return 'HBX Pro';
  if (normalized === COMMERCIAL_PLAN_KEYS.MELHOR) return 'Implantação';
  return 'HBX Lead Plus';
}

// R3 (FASE 2 — REMOÇÃO, definitivo): tier deixou de decidir capacidade. Toda
// empresa comercial (não-platform_infra) projeta 'full' — a distinção
// list/lead/full nascida do catálogo de planos morreu como driver de acesso.
// Assinatura mantida (planKey ainda aceito) só por compatibilidade dos call
// sites; nenhum deles deve mais esperar 'list'/'lead' de volta. Camada que
// decide "quem pode o quê" agora é RBAC (UserTeamPolicy), não plano.
export function getCommercialPlanTier(_planKey: unknown): CommercialPlanTier {
  return 'full';
}

// R3: capacidades booleanas nascem TODAS ligadas por default (não dependem
// mais de planKey/tier). RBAC (camada 2, UserTeamPolicy) é quem corta agora,
// não o plano comercial. Parâmetro mantido só por compatibilidade de chamada.
export function getCommercialPlanCapabilities(_planKey: unknown): CommercialPlanCapabilities {
  return { ...UNIVERSAL_PRODUCT_CAPABILITIES };
}

// Ranking de preço dos planos self-service (bloco PR16062026026).
// List=1 < Lead=2 < Pro=3. Implantação (MELHOR) não entra no ranking (-1).
export function getCommercialPlanRank(planKey: unknown): number {
  const normalized = normalizeCommercialPlanKey(planKey);
  if (normalized === COMMERCIAL_PLAN_KEYS.LITE) return 1;
  if (normalized === COMMERCIAL_PLAN_KEYS.PADRAO) return 2;
  if (normalized === COMMERCIAL_PLAN_KEYS.PRO) return 3;
  return -1; // MELHOR não é self-service
}

// Classifica a direção da troca de plano.
// 'contact' = destino é Implantação (não é troca, é contato via 024).
// from Implantação → self-service = sempre 'downgrade' (rank -1 é inferior numericamente mas Implantação é o topo).
export function classifyPlanChange(
  fromKey: unknown,
  toKey: unknown,
): 'upgrade' | 'downgrade' | 'same' | 'contact' {
  const fromNormalized = normalizeCommercialPlanKey(fromKey);
  const toNormalized = normalizeCommercialPlanKey(toKey);
  if (toNormalized === COMMERCIAL_PLAN_KEYS.MELHOR) return 'contact';
  if (fromNormalized === COMMERCIAL_PLAN_KEYS.MELHOR) return 'downgrade';
  const fromRank = getCommercialPlanRank(fromKey);
  const toRank = getCommercialPlanRank(toKey);
  if (fromRank === toRank) return 'same';
  return toRank > fromRank ? 'upgrade' : 'downgrade';
}

export function computeCommercialPlanCycleAmount(planKey: unknown, billingCycleRaw: unknown) {
  const monthly = getCommercialPlanMonthlyPrice(planKey);
  const billingCycle = String(billingCycleRaw || '').trim().toUpperCase() === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
  if (billingCycle !== 'ANNUAL') return toCommercialCurrency(monthly);
  const annualFull = monthly * 12;
  return toCommercialCurrency(annualFull * (1 - getCommercialAnnualDiscountPercent() / 100));
}

export function buildCommercialPlansCatalog(options: { includeHidden?: boolean } = {}) {
  const universalFeatures = [
    'Produto HBX completo, sem corte de dados por plano',
    'Crédito debitado somente ao puxar o lead',
    'Dados da RFB e do motor unificados',
    'Até 3 telefones e 3 e-mails quando disponíveis',
    'WhatsApp, site e redes sociais quando encontrados',
    'Score, motivo, canal recomendado e mensagens comerciais',
    'Negativos, opt-outs e duplicados respeitados',
  ];
  const universalHeadline = 'O mesmo produto HBX completo, com cobrança por lead.';
  const universalDescription = 'Todas as capacidades comerciais são iguais. O lead é revelado e enriquecido na puxada, após o débito do crédito.';
  const catalog = [
    {
      key: COMMERCIAL_PLAN_KEYS.LITE,
      title: 'HBX List',
      status: 'available',
      contactOnly: false,
      monthlyPrice: COMMERCIAL_PRICING.liteMonthly,
      trialDays: COMMERCIAL_PLAN_TRIAL_DAYS[COMMERCIAL_PLAN_KEYS.LITE],
      annualDiscountPercent: COMMERCIAL_PRICING.annualDiscountPercent,
      includedUsers: COMMERCIAL_PLAN_INCLUDED_USERS[COMMERCIAL_PLAN_KEYS.LITE],
      extraUserMonthlyPrice: COMMERCIAL_PLAN_EXTRA_USER_MONTHLY[COMMERCIAL_PLAN_KEYS.LITE],
      requiresAssistedSetup: false,
      setupFeeMode: 'none',
      hidden: false,
      headline: universalHeadline,
      description: universalDescription,
      badge: 'Entrada',
      recommended: false,
      requiresCheckout: false,
      quotas: COMMERCIAL_PLAN_QUOTAS[COMMERCIAL_PLAN_KEYS.LITE],
      features: [...universalFeatures],
      legalCopy: 'Liberação após pagamento confirmado.',
    },
    {
      key: COMMERCIAL_PLAN_KEYS.PADRAO,
      title: 'HBX Lead Plus',
      status: 'available',
      contactOnly: false,
      monthlyPrice: COMMERCIAL_PRICING.padraoMonthly,
      trialDays: COMMERCIAL_PLAN_TRIAL_DAYS[COMMERCIAL_PLAN_KEYS.PADRAO],
      annualDiscountPercent: COMMERCIAL_PRICING.annualDiscountPercent,
      includedUsers: COMMERCIAL_PLAN_INCLUDED_USERS[COMMERCIAL_PLAN_KEYS.PADRAO],
      extraUserMonthlyPrice: COMMERCIAL_PLAN_EXTRA_USER_MONTHLY[COMMERCIAL_PLAN_KEYS.PADRAO],
      requiresAssistedSetup: false,
      setupFeeMode: 'none',
      hidden: false,
      headline: universalHeadline,
      description: universalDescription,
      badge: 'Mais vendido',
      recommended: true,
      requiresCheckout: false,
      quotas: COMMERCIAL_PLAN_QUOTAS[COMMERCIAL_PLAN_KEYS.PADRAO],
      features: [...universalFeatures],
      legalCopy: 'Teste de 14 dias. Após o trial, contratação segue pelo checkout.',
    },
    {
      key: COMMERCIAL_PLAN_KEYS.PRO,
      title: 'HBX Pro',
      status: 'available',
      contactOnly: false,
      monthlyPrice: COMMERCIAL_PRICING.proMonthly,
      trialDays: COMMERCIAL_PLAN_TRIAL_DAYS[COMMERCIAL_PLAN_KEYS.PRO],
      annualDiscountPercent: COMMERCIAL_PRICING.annualDiscountPercent,
      includedUsers: COMMERCIAL_PLAN_INCLUDED_USERS[COMMERCIAL_PLAN_KEYS.PRO],
      extraUserMonthlyPrice: COMMERCIAL_PLAN_EXTRA_USER_MONTHLY[COMMERCIAL_PLAN_KEYS.PRO],
      requiresAssistedSetup: false,
      setupFeeMode: 'none',
      hidden: false,
      headline: universalHeadline,
      description: universalDescription,
      badge: 'Mais forte',
      recommended: false,
      requiresCheckout: false,
      quotas: COMMERCIAL_PLAN_QUOTAS[COMMERCIAL_PLAN_KEYS.PRO],
      features: [...universalFeatures],
      legalCopy: 'Liberação após pagamento confirmado.',
    },
    {
      key: COMMERCIAL_PLAN_KEYS.MELHOR,
      title: 'Implantação',
      status: 'available',
      // contactOnly: true → preço NÃO é exibido ao cliente; o número interno
      // (melhorMonthly) continua alimentando billing de quem já é Company.
      contactOnly: true,
      monthlyPrice: COMMERCIAL_PRICING.melhorMonthly,
      priceFrom: true,
      trialDays: COMMERCIAL_PLAN_TRIAL_DAYS[COMMERCIAL_PLAN_KEYS.MELHOR],
      annualDiscountPercent: COMMERCIAL_PRICING.annualDiscountPercent,
      includedUsers: COMMERCIAL_PLAN_INCLUDED_USERS[COMMERCIAL_PLAN_KEYS.MELHOR],
      extraUserMonthlyPrice: COMMERCIAL_PLAN_EXTRA_USER_MONTHLY[COMMERCIAL_PLAN_KEYS.MELHOR],
      requiresAssistedSetup: false,
      setupFeeMode: 'negotiated',
      hidden: false,
      headline: universalHeadline,
      description: universalDescription,
      badge: 'Empresas',
      recommended: true,
      requiresCheckout: false,
      quotas: COMMERCIAL_PLAN_QUOTAS[COMMERCIAL_PLAN_KEYS.MELHOR],
      features: [...universalFeatures],
      legalCopy: 'Mensalidade e implantação negociadas na conversa com a HBX.',
    },
  ];

  // Self-Checkout (F2): aplica o overlay editável do master sobre a base de código.
  // `observation` nasce com a descrição existente do plano ("já injeta tudo que
  // existe") e vira editável; `status` carrega a pausa.
  const withOverrides = catalog.map((plan) => {
    const override = getCommercialCatalogOverride(plan.key);
    return {
      ...plan,
      title: override?.title ?? plan.title,
      monthlyPrice: override?.monthlyPrice ?? plan.monthlyPrice,
      // Desconto anual é GLOBAL (fonte única) — reflete o efetivo, não o literal do plano.
      annualDiscountPercent: getCommercialAnnualDiscountPercent(),
      includedUsers: override?.includedUsers ?? plan.includedUsers,
      extraUserMonthlyPrice: override?.extraUserMonthly ?? plan.extraUserMonthlyPrice,
      trialDays: override?.trialDays ?? plan.trialDays,
      // Default de oferta pública (só Enterprise nasce 'available') a menos que o master
      // reabra/pause por override. Ignora o literal `plan.status` da base (sempre 'available').
      status: override?.status ?? defaultCommercialPlanStatus(plan.key),
      observation: override?.observation ?? plan.description,
    };
  });

  return options.includeHidden ? withOverrides : withOverrides.filter((plan) => !plan.hidden);
}
