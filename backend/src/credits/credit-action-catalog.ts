// CRÉDITO UNIVERSAL (PR10072026, decisão do dono 10/07 — revoga o D1 do PLANO.md, ver adendo):
// catálogo de AÇÕES metradas pelo crédito. Mesmo espírito do `credit-pack-catalog.ts` (fonte
// única em CÓDIGO; overlay editável no /master é fase 2 — pendência registrada no adendo do
// PLANO.md, não silenciosa). O modelo é TRACK-FIRST: ação nova nasce `track` (mede no ledger
// como `debit_shadow`, saldo intocado) por ~30 dias; virar `debit` é decisão explícita do dono
// com o número de uso real na mão — nunca flip silencioso.
//
// Modos:
//  - `free`  → nem mede (zero linha no ledger).
//  - `track` → mede (linha `debit_shadow` com o actionKey), NUNCA cobra nem bloqueia.
//  - `debit` → cobra de verdade. ATENÇÃO: ação que precisa BLOQUEAR a entrega sem saldo
//    (fail-closed ANTES do efeito) NÃO passa pelo meter — usa o caminho assert existente
//    (`CreditsService.assertAndDebitLeadDelivery`). O meter só debita PÓS-FATO (efeito já
//    aconteceu; sem saldo → serve o que couber e loga — não há como "desenviar" uma mensagem).

export type CreditActionMode = 'free' | 'track' | 'debit';

export const CREDIT_ACTION_KEYS = {
  LEAD_DELIVERY: 'lead_delivery',
  WHATSAPP_AUTO_SEND: 'whatsapp_auto_send',
  AI_REALTIME: 'ai_realtime',
  AI_BATCH: 'ai_batch',
  LOGISTICA_DELIVERY: 'logistica_delivery',
} as const;

export type CreditActionKey = (typeof CREDIT_ACTION_KEYS)[keyof typeof CREDIT_ACTION_KEYS];

export type CreditActionDefinition = {
  key: CreditActionKey;
  mode: CreditActionMode;
  /** Custo em créditos por unidade (ledger é Int). Em `track` é o peso MEDIDO, não cobrado. */
  cost: number;
  label: string;
};

const CREDIT_ACTION_BASE: Record<CreditActionKey, CreditActionDefinition> = {
  // Débito real do lead JÁ vive no caminho assert (CommercialUsageLimitsService →
  // assertAndDebitLeadDelivery, fail-closed antes da entrega). A linha existe aqui pra o
  // catálogo ser a foto COMPLETA de preço por ação — o meter RECUSA `lead_delivery`
  // explicitamente (ver CreditMeterService: aceitar criaria um 2º débito real em outro
  // namespace de usageKey, fora do gate R1 e do god-mode).
  [CREDIT_ACTION_KEYS.LEAD_DELIVERY]: {
    key: CREDIT_ACTION_KEYS.LEAD_DELIVERY,
    mode: 'debit',
    cost: 1,
    label: 'Lead entregue',
  },
  // Decisão do dono (10/07): WhatsApp automação NUNCA debita ("ninguém cobra a não ser que
  // for Meta" — Evolution/Baileys não tem custo por mensagem; só a API oficial da Meta cobra,
  // e aí se repassa). Fica `track` pra dar número real de uso; humano nem entra (allowlist
  // por sourceModule no MessagingService).
  [CREDIT_ACTION_KEYS.WHATSAPP_AUTO_SEND]: {
    key: CREDIT_ACTION_KEYS.WHATSAPP_AUTO_SEND,
    mode: 'track',
    cost: 1,
    label: 'Mensagem automática de WhatsApp',
  },
  // IA local (qwen no Ollama) tem custo marginal ~R$0 → track. IA PAGA futura (API externa)
  // entra como ação NOVA já `debit` no dia 1 — não flip destas duas.
  [CREDIT_ACTION_KEYS.AI_REALTIME]: {
    key: CREDIT_ACTION_KEYS.AI_REALTIME,
    mode: 'track',
    cost: 1,
    label: 'Chamada de IA em tempo real (bot/assistente)',
  },
  [CREDIT_ACTION_KEYS.AI_BATCH]: {
    key: CREDIT_ACTION_KEYS.AI_BATCH,
    mode: 'track',
    cost: 1,
    label: 'Chamada de IA em lote (enriquecimento/notas)',
  },
  [CREDIT_ACTION_KEYS.LOGISTICA_DELIVERY]: {
    key: CREDIT_ACTION_KEYS.LOGISTICA_DELIVERY,
    mode: 'track',
    cost: 1,
    label: 'Entrega concluída (logística)',
  },
};

export function normalizeCreditActionKey(value: unknown): CreditActionKey | null {
  const normalized = String(value || '').trim().toLowerCase();
  const keys = Object.values(CREDIT_ACTION_KEYS) as string[];
  return keys.includes(normalized) ? (normalized as CreditActionKey) : null;
}

export function listCreditActionKeys(): CreditActionKey[] {
  return Object.values(CREDIT_ACTION_KEYS) as CreditActionKey[];
}

/** Definição BASE (em código, sem overlay) — usada pelo master pra mostrar "padrão" vs "editado". */
export function getCreditActionBaseDefinition(actionKey: unknown): CreditActionDefinition | null {
  const key = normalizeCreditActionKey(actionKey);
  if (!key) return null;
  return { ...CREDIT_ACTION_BASE[key] };
}

// ── Overlay editável (PR11072026 W1 — mesmo padrão do commercial-plan-catalog /
// credit-pack-catalog: base em CÓDIGO + override em memória, hidratado no boot/edição
// pelo CreditActionConfigService a partir de `CreditActionConfig`). `lead_delivery` NUNCA
// tem override persistido (rejeitado no set do service) e `whatsapp_auto_send` nunca
// persiste mode='debit' (idem) — mas o merge aqui é puramente mecânico, defesa em
// profundidade fica no service (validação no set) e no meter (recusa hardcoded do lead).
export type CreditActionOverride = {
  mode?: CreditActionMode;
  cost?: number;
};

const CREDIT_ACTION_OVERRIDES = new Map<CreditActionKey, CreditActionOverride>();

/** Substitui o overlay inteiro (idempotente — chamado no boot e a cada PUT/DELETE do master). */
export function applyCreditActionOverrides(
  entries: Array<{ actionKey: unknown; override: CreditActionOverride | null | undefined }>,
) {
  CREDIT_ACTION_OVERRIDES.clear();
  for (const entry of entries || []) {
    const key = normalizeCreditActionKey(entry?.actionKey);
    if (!key) continue;
    const ov = entry?.override;
    if (!ov || typeof ov !== 'object') continue;
    const clean: CreditActionOverride = {};
    if (ov.mode === 'free' || ov.mode === 'track' || ov.mode === 'debit') clean.mode = ov.mode;
    // PARIDADE DE INVARIANTE (revisão 11/07): `whatsapp_auto_send` NUNCA debita (decisão do dono).
    // O service rejeita mode='debit' no set, mas o merge é a ÚLTIMA linha de defesa contra uma
    // linha CreditActionConfig injetada FORA do set (escrita direta no banco): dropar o mode aqui
    // faz o invariante não depender de uma única camada — igual o lead é recusado no meter.
    if (clean.mode === 'debit' && key === CREDIT_ACTION_KEYS.WHATSAPP_AUTO_SEND) delete clean.mode;
    if (ov.cost != null && Number.isFinite(Number(ov.cost))) clean.cost = Math.max(1, Math.trunc(Number(ov.cost)));
    // configJson corrompido/vazio (JSON.parse falhou no service) vira override SEM nenhum
    // campo válido — não registra: senão getCreditActionOverride devolveria `{}` (objeto
    // truthy) em vez de null, e a UI do master mostraria "editado" pra uma linha que na
    // prática nunca teve override real gravado.
    if (Object.keys(clean).length === 0) continue;
    CREDIT_ACTION_OVERRIDES.set(key, clean);
  }
}

export function clearCreditActionOverrides() {
  CREDIT_ACTION_OVERRIDES.clear();
}

export function getCreditActionOverride(actionKey: unknown): CreditActionOverride | null {
  const key = normalizeCreditActionKey(actionKey);
  if (!key) return null;
  return CREDIT_ACTION_OVERRIDES.get(key) || null;
}

/** Ação fora do catálogo → null (o meter trata como "não medir", nunca inventa preço).
 * Aplica o overlay (base + override, override ganha) quando houver. */
export function getCreditActionDefinition(actionKey: unknown): CreditActionDefinition | null {
  const key = normalizeCreditActionKey(actionKey);
  if (!key) return null;
  const base = CREDIT_ACTION_BASE[key];
  const override = CREDIT_ACTION_OVERRIDES.get(key);
  if (!override) return { ...base };
  return {
    ...base,
    mode: override.mode ?? base.mode,
    cost: override.cost ?? base.cost,
  };
}

export function listCreditActionDefinitions(): CreditActionDefinition[] {
  return (Object.values(CREDIT_ACTION_KEYS) as CreditActionKey[]).map((key) => getCreditActionDefinition(key)!);
}
