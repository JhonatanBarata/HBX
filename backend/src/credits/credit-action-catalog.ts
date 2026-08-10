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
  // logística vivia nos modos Essencial e Rastreado — ROTA v2 (10/08)
  // aposentou os dois: ver LOGISTICA_ESSENTIAL_BLOCK/LOGISTICA_TRACKED_DELIVERY
  // abaixo e os 2 novos que os substituem.
  LOGISTICA_DELIVERY: 'logistica_delivery',
  // ⛔ APOSENTADAS (ROTA v2, 10/08 — "PICAR A PONTE"): plano com nível
  // (BASIC/ADVANCED/FULL) virou rota ILIMITADA (limite é de ASSENTO, não mais
  // de bloco/parada/entrega cobrada); nível CREDITO paga o DIA, não a parada.
  // Chaves mantidas — ledger histórico aponta pra elas — mas travadas em
  // 'free' (ver OVERRIDE_LOCKED_ACTIONS) pra nunca mais cobrar por cima do
  // débito novo do dia/passe.
  LOGISTICA_ESSENTIAL_BLOCK: 'logistica_essential_block',
  LOGISTICA_TRACKED_DELIVERY: 'logistica_tracked_delivery',
  // ROTA v2 (10/08) — os 2 débitos novos do modelo híbrido por NÍVEL:
  //   - nível CREDITO: 1 débito por EMPRESA+DATA quando o dia tem paradas
  //     (planejarRota garante o dia pago antes de persistir rotaOrdem).
  //   - qualquer nível com plano (BASIC/ADVANCED/FULL): 1 débito por
  //     MOTORISTA+DATA só quando ele PASSA do teto de assentos incluso
  //     (`assertAssentoDoDia`/POST /logistica/rota/passe-do-dia).
  LOGISTICA_DIA_DE_ROTA: 'logistica_dia_de_rota',
  LOGISTICA_PASSE_MOTORISTA_DIA: 'logistica_passe_motorista_dia',
  // MODO PASSEIO (29/07) — 1 débito por passeio INICIADO no APK (usageKey por
  // tourId, idempotente). Preço editável no /master como as demais ações.
  PASSEIO_TOUR: 'passeio_tour',
} as const;

export type CreditActionKey =
  | 'lead_delivery'
  | 'whatsapp_auto_send'
  | 'ai_realtime'
  | 'ai_batch'
  | 'logistica_delivery'
  | 'logistica_essential_block'
  | 'logistica_tracked_delivery'
  | 'logistica_dia_de_rota'
  | 'logistica_passe_motorista_dia'
  | 'passeio_tour';

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
  // ⛔ APOSENTADAS (ROTA v2, 10/08) — mode 'free' TRAVADO (OVERRIDE_LOCKED_ACTIONS
  // abaixo): a máquina de cobrar por bloco/parada/entrega morreu com o
  // billing antigo (logistica-route-billing.service.ts). Cost fica só de
  // registro histórico do que já foi cobrado no passado.
  [CREDIT_ACTION_KEYS.LOGISTICA_ESSENTIAL_BLOCK]: {
    key: CREDIT_ACTION_KEYS.LOGISTICA_ESSENTIAL_BLOCK,
    mode: 'free',
    cost: 0.4,
    label: 'Logística Simples (aposentada)',
  },
  [CREDIT_ACTION_KEYS.LOGISTICA_TRACKED_DELIVERY]: {
    key: CREDIT_ACTION_KEYS.LOGISTICA_TRACKED_DELIVERY,
    mode: 'free',
    cost: 2,
    label: 'Logística Rastreada (aposentada)',
  },
  // ROTA v2 (10/08) — nível CREDITO: 1 débito por EMPRESA+DATA (usageKey
  // `logistica:dia:company:<id>:date:<routeDate>`), lançado por planejarRota
  // antes de persistir rotaOrdem. Custo 6 é decisão do dono — editável no
  // /master como qualquer ação.
  [CREDIT_ACTION_KEYS.LOGISTICA_DIA_DE_ROTA]: {
    key: CREDIT_ACTION_KEYS.LOGISTICA_DIA_DE_ROTA,
    mode: 'debit',
    cost: 6,
    label: 'Dia de rota (avulso) — 1× por empresa+dia',
  },
  // ROTA v2 (10/08) — qualquer nível com plano: 1 débito por MOTORISTA+DATA
  // (usageKey `logistica:passe:company:<id>:driver:<uid>:date:<d>`) quando
  // ele passa do teto de assentos inclusos do nível/empresa.
  [CREDIT_ACTION_KEYS.LOGISTICA_PASSE_MOTORISTA_DIA]: {
    key: CREDIT_ACTION_KEYS.LOGISTICA_PASSE_MOTORISTA_DIA,
    mode: 'debit',
    cost: 8,
    label: 'Passe do dia — motorista além dos assentos (1× por motorista+dia)',
  },
  [CREDIT_ACTION_KEYS.PASSEIO_TOUR]: {
    key: CREDIT_ACTION_KEYS.PASSEIO_TOUR,
    mode: 'debit',
    cost: 2,
    label: 'Modo Passeio (por passeio iniciado)',
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
  'logistica_dia_de_rota',
  'logistica_passe_motorista_dia',
  'passeio_tour',
];

/**
 * A ação legada de criação da entrega é imutavelmente grátis. Mesmo que exista
 * override antigo no banco, ele não pode reativar o débito de 0,2 e somar com a
 * cobrança canônica do dia/passe.
 *
 * ⛔ ROTA v2 (10/08) — LOGISTICA_ESSENTIAL_BLOCK e LOGISTICA_TRACKED_DELIVERY
 * entram no MESMO cadeado: a máquina que as cobrava morreu
 * (logistica-route-billing.service.ts), e um override antigo no banco (preço
 * ainda de 0,4/2 de quando elas cobravam de verdade) NUNCA pode religar
 * cobrança por bloco/parada/entrega por cima do débito novo do dia/passe.
 */
const OVERRIDE_LOCKED_ACTIONS = new Set<CreditActionKey>([
  CREDIT_ACTION_KEYS.LOGISTICA_DELIVERY,
  CREDIT_ACTION_KEYS.LOGISTICA_ESSENTIAL_BLOCK,
  CREDIT_ACTION_KEYS.LOGISTICA_TRACKED_DELIVERY,
]);

/**
 * Motivo do cadeado em UMA frase só. O painel mostra a MESMA frase ANTES de
 * editar; o master não precisa tentar salvar pra descobrir que não pode.
 */
export const CREDIT_ACTION_LOCK_REASON =
  'A entrega avulsa é absorvida pela cobrança da rota e não aceita débito próprio. O preço editável é o da Logística Simples (por parada) ou o da Logística Rastreada.';

/** Mesmo cadeado, motivo PRÓPRIO pras 2 ações aposentadas (ROTA v2, 10/08). */
export const CREDIT_ACTION_RETIRED_REASON =
  'Esta ação foi aposentada pela ROTA v2 — o preço editável agora é o "Dia de rota (avulso)" ou o "Passe do dia" (assentos).';

export function getCreditActionLockReason(actionKey: unknown): string | null {
  if (!isCreditActionOverrideLocked(actionKey)) return null;
  const key = normalizeCreditActionKey(actionKey);
  if (key === 'logistica_essential_block' || key === 'logistica_tracked_delivery') {
    return CREDIT_ACTION_RETIRED_REASON;
  }
  return CREDIT_ACTION_LOCK_REASON;
}

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
