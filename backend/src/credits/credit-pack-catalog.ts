// CRÉDITOS S3-PARTE1 (docs/PLANEJAMENTOS/CREDITOS/S3-SPEC.md) — catálogo de PACOTES de
// recarga de crédito. Espelha EXATAMENTE o padrão de `commercial-plan-catalog.ts`: base em
// CÓDIGO (preços/valores são PLACEHOLDER — o dono seta o número real no /master depois) +
// overlay editável persistido em `CreditPackConfig`, hidratado no boot e a cada edição
// (mesmo desenho de `applyCommercialCatalogOverrides`/`refreshCommercialCatalogOverlay`).
// Fonte ÚNICA de preço/crédito: nada disso vive em frontend.

export const CREDIT_PACK_KEYS = {
  STARTER: 'starter',
  GROWTH: 'growth',
  SCALE: 'scale',
} as const;

export type CreditPackKey = (typeof CREDIT_PACK_KEYS)[keyof typeof CREDIT_PACK_KEYS];

export type CreditPackStatus = 'available' | 'paused';

export type CreditPackOverride = {
  title?: string;
  observation?: string;
  status?: CreditPackStatus;
  credits?: number;
  price?: number;
  defaultExpiryDays?: number;
};

export type CreditPackDefinition = {
  key: CreditPackKey;
  title: string;
  status: CreditPackStatus;
  credits: number;
  price: number;
  defaultExpiryDays: number;
  observation: string;
  badge: string | null;
  recommended: boolean;
};

// Prazo default de expiração do crédito quando o master não configurou nada específico
// (config global — D6 do S1). PLACEHOLDER editável via overlay global (ver
// `applyCreditExpiryDefaultOverride`), o dono ajusta no /master.
const DEFAULT_CREDIT_EXPIRY_DAYS = 90;

// CRÉDITOS A3 (docs/PLANEJAMENTOS/CREDITOS/A3-RESULTADO.md) — lote grátis de boas-vindas no
// signup self-service (substitui o trial por tempo, A3 do PLANO.md). Defaults de código:
// 30 créditos / 30 dias de validade (âncora de mercado: CNPJ.biz dá ~10 créditos de trial —
// dar 3x é argumento de venda). Config global editável pelo master, MESMO padrão do prazo
// default de expiração acima (override em memória + persistência em CreditGlobalConfig).
const DEFAULT_WELCOME_CREDITS = 30;
const DEFAULT_WELCOME_EXPIRY_DAYS = 30;

// Base em CÓDIGO — 3 pacotes default. `price`/`credits` são PLACEHOLDER: o dono cravará o
// número real no /master (decisão 04/07: "NÃO cravar preço final"). Nada aqui é lido pelo
// frontend diretamente — só via endpoint do backend.
const CREDIT_PACK_BASE: Record<CreditPackKey, CreditPackDefinition> = {
  [CREDIT_PACK_KEYS.STARTER]: {
    key: CREDIT_PACK_KEYS.STARTER,
    title: 'Pacote Starter',
    status: 'available',
    credits: 100,
    price: 97.0,
    defaultExpiryDays: DEFAULT_CREDIT_EXPIRY_DAYS,
    observation: 'Recarga de entrada — placeholder, preço/quantidade editáveis no master.',
    badge: null,
    recommended: false,
  },
  [CREDIT_PACK_KEYS.GROWTH]: {
    key: CREDIT_PACK_KEYS.GROWTH,
    title: 'Pacote Growth',
    status: 'available',
    credits: 300,
    price: 247.0,
    defaultExpiryDays: DEFAULT_CREDIT_EXPIRY_DAYS,
    observation: 'Recarga intermediária — placeholder, preço/quantidade editáveis no master.',
    badge: 'Mais vendido',
    recommended: true,
  },
  [CREDIT_PACK_KEYS.SCALE]: {
    key: CREDIT_PACK_KEYS.SCALE,
    title: 'Pacote Scale',
    status: 'available',
    credits: 800,
    price: 597.0,
    defaultExpiryDays: DEFAULT_CREDIT_EXPIRY_DAYS,
    observation: 'Recarga de maior volume — placeholder, preço/quantidade editáveis no master.',
    badge: null,
    recommended: false,
  },
};

export function normalizeCreditPackKey(value: unknown): CreditPackKey | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === CREDIT_PACK_KEYS.STARTER) return CREDIT_PACK_KEYS.STARTER;
  if (normalized === CREDIT_PACK_KEYS.GROWTH) return CREDIT_PACK_KEYS.GROWTH;
  if (normalized === CREDIT_PACK_KEYS.SCALE) return CREDIT_PACK_KEYS.SCALE;
  return null;
}

export function listCreditPackKeys(): CreditPackKey[] {
  return [CREDIT_PACK_KEYS.STARTER, CREDIT_PACK_KEYS.GROWTH, CREDIT_PACK_KEYS.SCALE];
}

// ── Overlay editável (mesmo padrão do commercial-plan-catalog) ──────────────────────
const CREDIT_PACK_OVERRIDES = new Map<CreditPackKey, CreditPackOverride>();

// Prazo default GLOBAL de expiração do crédito — pode ser reconfigurado pelo master (uma
// linha especial/config global, alimenta o `expiresAt` das concessões quando não
// especificado). null/ausente → cai no default de código (nunca "sem expiração" por engano).
let CREDIT_EXPIRY_DEFAULT_DAYS_OVERRIDE: number | null = null;

// CRÉDITOS A3 — overrides GLOBAIS do lote de boas-vindas (quantidade/validade), mesmo desenho
// do override de expiração acima. null/ausente → cai nos defaults de código.
let WELCOME_CREDITS_OVERRIDE: number | null = null;
let WELCOME_EXPIRY_DAYS_OVERRIDE: number | null = null;

function toCreditCurrency(value: unknown) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(2));
}

function toCreditInt(value: unknown) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.trunc(numeric));
}

/**
 * Substitui o overlay inteiro (padrão do `applyCommercialCatalogOverrides`): recarrega do
 * zero a partir das linhas persistidas em `CreditPackConfig`. Idempotente — chamado no boot
 * e a cada PUT do master.
 */
export function applyCreditPackOverrides(
  entries: Array<{ packKey: unknown; override: CreditPackOverride | null | undefined }>,
) {
  CREDIT_PACK_OVERRIDES.clear();
  for (const entry of entries || []) {
    const key = normalizeCreditPackKey(entry?.packKey);
    if (!key) continue;
    const ov = entry?.override;
    if (!ov || typeof ov !== 'object') continue;
    const clean: CreditPackOverride = {};
    if (typeof ov.title === 'string' && ov.title.trim()) clean.title = ov.title.trim();
    if (typeof ov.observation === 'string') clean.observation = ov.observation;
    if (ov.status === 'paused' || ov.status === 'available') clean.status = ov.status;
    if (ov.credits != null && Number.isFinite(Number(ov.credits))) clean.credits = toCreditInt(ov.credits);
    if (ov.price != null && Number.isFinite(Number(ov.price))) clean.price = toCreditCurrency(ov.price);
    if (ov.defaultExpiryDays != null && Number.isFinite(Number(ov.defaultExpiryDays))) {
      clean.defaultExpiryDays = Math.max(1, toCreditInt(ov.defaultExpiryDays));
    }
    CREDIT_PACK_OVERRIDES.set(key, clean);
  }
}

export function clearCreditPackOverrides() {
  CREDIT_PACK_OVERRIDES.clear();
  CREDIT_EXPIRY_DEFAULT_DAYS_OVERRIDE = null;
  WELCOME_CREDITS_OVERRIDE = null;
  WELCOME_EXPIRY_DAYS_OVERRIDE = null;
}

export function getCreditPackOverride(packKey: unknown): CreditPackOverride | null {
  const key = normalizeCreditPackKey(packKey);
  if (!key) return null;
  return CREDIT_PACK_OVERRIDES.get(key) || null;
}

export function applyCreditExpiryDefaultOverride(days: unknown) {
  const n = Number(days);
  CREDIT_EXPIRY_DEFAULT_DAYS_OVERRIDE = Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

/** Prazo default (em dias) de expiração do crédito — config global, editável pelo master. */
export function getCreditExpiryDefaultDays(): number {
  return CREDIT_EXPIRY_DEFAULT_DAYS_OVERRIDE != null
    ? CREDIT_EXPIRY_DEFAULT_DAYS_OVERRIDE
    : DEFAULT_CREDIT_EXPIRY_DAYS;
}

/** `expiresAt` calculado a partir de agora + prazo default global (usado quando a concessão
 * não especifica `expiresAt`). */
export function computeDefaultExpiresAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + getCreditExpiryDefaultDays() * 24 * 60 * 60 * 1000);
}

// ── CRÉDITOS A3 — lote grátis de boas-vindas (config global) ────────────────────────
export function applyWelcomeCreditsOverride(value: unknown) {
  const n = Number(value);
  WELCOME_CREDITS_OVERRIDE = Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

export function applyWelcomeExpiryDaysOverride(value: unknown) {
  const n = Number(value);
  WELCOME_EXPIRY_DAYS_OVERRIDE = Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

/** Quantidade default do lote de boas-vindas — config global, editável pelo master. */
export function getWelcomeCreditsDefault(): number {
  return WELCOME_CREDITS_OVERRIDE != null ? WELCOME_CREDITS_OVERRIDE : DEFAULT_WELCOME_CREDITS;
}

/** Validade (em dias) do lote de boas-vindas — config global, editável pelo master. */
export function getWelcomeExpiryDaysDefault(): number {
  return WELCOME_EXPIRY_DAYS_OVERRIDE != null ? WELCOME_EXPIRY_DAYS_OVERRIDE : DEFAULT_WELCOME_EXPIRY_DAYS;
}

/** `expiresAt` do lote de boas-vindas: agora + validade default global. */
export function computeWelcomeExpiresAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + getWelcomeExpiryDaysDefault() * 24 * 60 * 60 * 1000);
}

export function isCreditPackPaused(packKey: unknown): boolean {
  return getCreditPackOverride(packKey)?.status === 'paused';
}

/** Pacote único com overlay aplicado (base + override, override ganha). */
export function getCreditPackDefinition(packKey: unknown): CreditPackDefinition | null {
  const key = normalizeCreditPackKey(packKey);
  if (!key) return null;
  const base = CREDIT_PACK_BASE[key];
  const override = getCreditPackOverride(key);
  if (!override) return { ...base };
  return {
    ...base,
    title: override.title ?? base.title,
    observation: override.observation ?? base.observation,
    status: override.status ?? base.status,
    credits: override.credits ?? base.credits,
    price: override.price ?? base.price,
    defaultExpiryDays: override.defaultExpiryDays ?? base.defaultExpiryDays,
  };
}

/** Catálogo completo (base + overlay), na ordem fixa starter → growth → scale. */
export function buildCreditPacksCatalog(options: { includePaused?: boolean } = {}): CreditPackDefinition[] {
  const all = listCreditPackKeys()
    .map((key) => getCreditPackDefinition(key))
    .filter((pack): pack is CreditPackDefinition => Boolean(pack));
  return options.includePaused ? all : all.filter((pack) => pack.status !== 'paused');
}
