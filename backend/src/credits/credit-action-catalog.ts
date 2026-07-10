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

/** Ação fora do catálogo → null (o meter trata como "não medir", nunca inventa preço). */
export function getCreditActionDefinition(actionKey: unknown): CreditActionDefinition | null {
  const key = normalizeCreditActionKey(actionKey);
  if (!key) return null;
  return { ...CREDIT_ACTION_BASE[key] };
}

export function listCreditActionDefinitions(): CreditActionDefinition[] {
  return (Object.values(CREDIT_ACTION_KEYS) as CreditActionKey[]).map((key) => ({ ...CREDIT_ACTION_BASE[key] }));
}
