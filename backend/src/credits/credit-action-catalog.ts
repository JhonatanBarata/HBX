/**
 * Catálogo canônico das ações que usam créditos.
 *
 * A chave antiga `whatsapp_auto_send` foi preservada para não quebrar overrides e
 * ledger existentes, mas a ação agora representa qualquer Automação (WhatsApp,
 * e-mail, atendimento, prospecção e recovery). Só existem dois modos públicos:
 * grátis ou débito. Custos são expressos em créditos com até três casas decimais;
 * a carteira decimal preserva FIFO, validade, estorno e idempotência.
 */
export type CreditActionMode = 'free' | 'debit';

export const CREDIT_ACTION_KEYS = {
  LEAD_DELIVERY: 'lead_delivery',
  AUTOMATION: 'whatsapp_auto_send',
  // Alias de compatibilidade para callers antigos.
  WHATSAPP_AUTO_SEND: 'whatsapp_auto_send',
  AI_REALTIME: 'ai_realtime',
  AI_BATCH: 'ai_batch',
  // Chave legada mantida para compatibilidade de ledger/callers. O custo da
  // logística vive exclusivamente nos modos Essencial e Rastreado abaixo.
  LOGISTICA_DELIVERY: 'logistica_delivery',
  LOGISTICA_ESSENTIAL_BLOCK: 'logistica_essential_block',
  LOGISTICA_TRACKED_DELIVERY: 'logistica_tracked_delivery',
} as const;

export type CreditActionKey =
  | 'lead_delivery'
  | 'whatsapp_auto_send'
  | 'ai_realtime'
  | 'ai_batch'
  | 'logistica_delivery'
  | 'logistica_essential_block'
  | 'logistica_tracked_delivery';

export type CreditActionDefinition = {
  key: CreditActionKey;
  mode: CreditActionMode;
  /** Custo em créditos. Até 3 casas decimais; 0 é válido. */
  cost: number;
  label: string;
};

const CREDIT_ACTION_BASE: Record<CreditActionKey, CreditActionDefinition> = {
  lead_delivery: { key: 'lead_delivery', mode: 'debit', cost: 1, label: 'Lead entregue' },
  whatsapp_auto_send: { key: 'whatsapp_auto_send', mode: 'debit', cost: 0.1, label: 'Automação' },
  ai_realtime: {
    key: 'ai_realtime',
    mode: 'debit',
    cost: 0.1,
    label: 'Chamada de IA em tempo real (inclui Concierge)',
  },
  ai_batch: { key: 'ai_batch', mode: 'free', cost: 0, label: 'Chamada de IA em lote (enriquecimento)' },
  logistica_delivery: {
    key: 'logistica_delivery',
    mode: 'free',
    cost: 0,
    label: 'Entrega avulsa — absorvida pela rota',
  },
  [CREDIT_ACTION_KEYS.LOGISTICA_ESSENTIAL_BLOCK]: {
    key: CREDIT_ACTION_KEYS.LOGISTICA_ESSENTIAL_BLOCK,
    mode: 'debit',
    cost: 1,
    label: 'Bloco iniciado de até 5 entregas (Rota Essencial)',
  },
  [CREDIT_ACTION_KEYS.LOGISTICA_TRACKED_DELIVERY]: {
    key: CREDIT_ACTION_KEYS.LOGISTICA_TRACKED_DELIVERY,
    mode: 'debit',
    cost: 2,
    label: 'Entrega concluída com rastreamento válido',
  },
};

const ACTION_KEYS: CreditActionKey[] = [
  'lead_delivery',
  'whatsapp_auto_send',
  'ai_realtime',
  'ai_batch',
  'logistica_delivery',
  'logistica_essential_block',
  'logistica_tracked_delivery',
];

/**
 * A ação legada de criação da entrega é imutavelmente grátis. Mesmo que exista
 * override antigo no banco, ele não pode reativar o débito de 0,2 e somar com a
 * cobrança canônica da rota Essencial/Rastreada.
 */
const OVERRIDE_LOCKED_ACTIONS = new Set<CreditActionKey>([
  CREDIT_ACTION_KEYS.LOGISTICA_DELIVERY,
]);

export function normalizeCreditActionKey(value: unknown): CreditActionKey | null {
  const normalized = String(value || '').trim().toLowerCase();
  return ACTION_KEYS.includes(normalized as CreditActionKey) ? (normalized as CreditActionKey) : null;
}

export function listCreditActionKeys(): CreditActionKey[] {
  return [...ACTION_KEYS];
}

export function isCreditActionOverrideLocked(actionKey: unknown): boolean {
  const key = normalizeCreditActionKey(actionKey);
  return !!key && OVERRIDE_LOCKED_ACTIONS.has(key);
}

export function getCreditActionBaseDefinition(actionKey: unknown): CreditActionDefinition | null {
  const key = normalizeCreditActionKey(actionKey);
  return key ? { ...CREDIT_ACTION_BASE[key] } : null;
}

export type CreditActionOverride = { mode?: CreditActionMode; cost?: number };
const CREDIT_ACTION_OVERRIDES = new Map<CreditActionKey, CreditActionOverride>();

export function normalizeCreditCost(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1000) return null;
  return Math.round(parsed * 1000) / 1000;
}

export function creditCostToMilli(value: unknown): number {
  const normalized = normalizeCreditCost(value);
  return normalized == null ? 0 : Math.round(normalized * 1000);
}

export function applyCreditActionOverrides(
  entries: Array<{ actionKey: unknown; override: CreditActionOverride | null | undefined }>,
) {
  CREDIT_ACTION_OVERRIDES.clear();
  for (const entry of entries || []) {
    const key = normalizeCreditActionKey(entry?.actionKey);
    const override = entry?.override;
    if (!key || isCreditActionOverrideLocked(key) || !override || typeof override !== 'object') continue;
    const clean: CreditActionOverride = {};
    if (override.mode === 'free' || override.mode === 'debit') clean.mode = override.mode;
    const cost = normalizeCreditCost(override.cost);
    if (cost != null) clean.cost = cost;
    if (Object.keys(clean).length) CREDIT_ACTION_OVERRIDES.set(key, clean);
  }
}

export function clearCreditActionOverrides() {
  CREDIT_ACTION_OVERRIDES.clear();
}

export function getCreditActionOverride(actionKey: unknown): CreditActionOverride | null {
  const key = normalizeCreditActionKey(actionKey);
  if (!key || isCreditActionOverrideLocked(key)) return null;
  return CREDIT_ACTION_OVERRIDES.get(key) || null;
}

export function getCreditActionDefinition(actionKey: unknown): CreditActionDefinition | null {
  const key = normalizeCreditActionKey(actionKey);
  if (!key) return null;
  const base = CREDIT_ACTION_BASE[key];
  if (isCreditActionOverrideLocked(key)) return { ...base };
  const override = CREDIT_ACTION_OVERRIDES.get(key);
  return override
    ? { ...base, mode: override.mode ?? base.mode, cost: override.cost ?? base.cost }
    : { ...base };
}

export function listCreditActionDefinitions(): CreditActionDefinition[] {
  return ACTION_KEYS.map((key) => getCreditActionDefinition(key)!);
}
