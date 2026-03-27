# Trechos — Atendimento / Recovery

Arquivo gerado automaticamente com os trechos extraídos dos arquivos solicitados.

Arquivos incluídos:
- `frontend/src/app/dashboard/inbox/page.client.tsx`
- `frontend/src/components/bot-editor/BotMessageStudio.tsx`
- `frontend/src/hooks/use-flow-builder.ts`
- `frontend/src/components/workspace/adapters/atendimento-data.ts`
- `frontend/src/components/workspace/adapters/atendimento-actions.ts`
- `frontend/src/app/dashboard/inbox/inbox-model.ts` (tipos)

---

## 1) `frontend/src/app/dashboard/inbox/page.client.tsx`

Trechos relevantes (occorrências dos campos pedidos e lógica relacionada):

```ts
// decide label primária com base em routeTarget e recoveryOpenAmount
if (conversation.routeTarget === "recovery" && Number(conversation.recoveryOpenAmount || 0) > 0) {
  return "Responder e revisar o financeiro quando preciso.";
}

// comparable fields usados para detectar mudanças
const comparableFields = [
  "updatedAt",
  "status",
  "routeTarget",
  "routeReason",
  "currentFlow",
  "flowResult",
  "latestSourceModule",
  "isBlocked",
  "blockedAt",
  "blockedReason",
  "humanAssigned",
  "botActive",
  "recoveryCustomerId",
  "recoveryCurrentStep",
  "recoveryStatus",
  "recoveryOpenAmount",
  "recoveryTotalPaid",
] as const;

// filtro da fila recovery
if (inboxQueue === "recovery") {
  return conversations.filter(
    (conversation) =>
      conversation.status !== "closed" &&
      !conversation.isBlocked &&
      conversation.routeTarget === "recovery",
  );
}

// exibição do painel financeiro (usa recoveryCustomerId e recoveryStatus)
if (contextTab === "financeiro") {
  hasRecoveryCapability && selectedConversation.recoveryCustomerId ? (
    ... buildAtendimentoRecoverySummary({ conversation: selectedConversation, ... })
  ) : <ChatEmptyState title="Sem contexto financeiro">... </ChatEmptyState>
}

// pending atendimento e persistência do contador
if (conversation.routeTarget === "atendimento" && (conversation.status === "new" || conversation.status === "open")) { ... }

// botStudio / editor aberto
if (selectedConversation?.routeTarget) {
  summaryParts.push(`rota ${selectedConversation.routeTarget}`);
}
```

Também há chamadas a `buildAtendimentoQueueBadges`, `buildAtendimentoRecoverySummary` e `buildAtendimentoContextActions` que consomem os campos Recovery.

---

## 2) `frontend/src/components/workspace/adapters/atendimento-data.ts`

Trechos principais (regra e uso dos campos Recovery):

```ts
export function isAtendimentoRecoveryConversation(
  conversation: InboxConversation,
  allowRecoveryCapability = true,
) {
  return allowRecoveryCapability && conversation.routeTarget === "recovery";
}

export function getAtendimentoConversationStatusMeta(
  conversation: InboxConversation,
  allowRecoveryCapability = true,
): AtendimentoConversationStatusMeta {
  if (conversation.status === "blocked" || conversation.isBlocked) {
    return { label: "Bloqueado", shortLabel: "BLQ", tone: "blocked" };
  }
  if (isAtendimentoRecoveryConversation(conversation, allowRecoveryCapability)) {
    return { label: "Recovery", shortLabel: "REC", tone: "recovery" };
  }
  ...
}

// badges / summary que usam recoveryOpenAmount, recoveryStatus, currentFlow
if (allowRecoveryCapability && conversation.recoveryCurrentStep) {
  badges.push({ label: mapRecoveryFlowStepLabel(conversation.recoveryCurrentStep), tone: "neutral" });
}
if (allowRecoveryCapability && isAtendimentoRecoveryConversation(conversation, allowRecoveryCapability)) {
  badges.push({ label: formatAtendimentoRecoveryOperationLabel(conversation), tone: conversation.humanAssigned ? "success" : "neutral" });
}
if (allowRecoveryCapability && conversation.recoveryOpenAmount > 0) {
  badges.push({ label: formatCurrency(conversation.recoveryOpenAmount), tone: "brand" });
}

export function buildAtendimentoRecoverySummary(input: { conversation: InboxConversation; formatCurrency: (value: number) => string; }): WorkspaceSummaryDescriptor[] {
  const { conversation, formatCurrency } = input;
  return [
    { label: "Status cobranca", value: formatAtendimentoRecoveryStatusLabel(conversation.recoveryStatus) },
    { label: "Fluxo", value: humanizeRecoveryFlowKey(conversation.currentFlow) },
    { label: "Resultado", value: formatAtendimentoRecoveryFlowResultLabel(conversation.flowResult) },
    { label: "Valor em aberto", value: formatCurrency(conversation.recoveryOpenAmount || 0) },
    { label: "Total recuperado", value: formatCurrency(conversation.recoveryTotalPaid || 0) },
  ];
}
```

---

## 3) `frontend/src/components/workspace/adapters/atendimento-actions.ts`

Trechos (ações/links condicionados a `routeTarget`):

```ts
export function buildAtendimentoRecoveryLinks(
  conversation: InboxConversation,
  allowRecoveryCapability = true,
): WorkspaceActionDescriptor[] {
  if (!allowRecoveryCapability || conversation.routeTarget !== "recovery") return [];

  return [
    { id: "atendimento-open-recovery", kind: "link", label: "Cobranca", href: "/dashboard/inbox?atendimentoTab=automation&recoveryTab=messages", tone: "primary" },
    { id: "atendimento-open-payments", kind: "link", label: "Pagamentos", href: "/dashboard/inbox?atendimentoTab=automation&recoveryTab=payments", tone: "secondary" },
    { id: "atendimento-open-templates", kind: "link", label: "Templates", href: "/dashboard/inbox?atendimentoTab=automation&recoveryTab=templates", tone: "secondary" },
  ];
}

export function buildAtendimentoContextActions(input: { conversation: InboxConversation; selectedStatus: AtendimentoMutableStatus | "blocked" | string; selectedBlocked: boolean; allowRecoveryCapability?: boolean; openAutomation: () => void; openAgenda: () => void; updateStatus: (nextStatus: AtendimentoMutableStatus) => void | Promise<void>; blockConversation: () => void; unblockConversation: () => void; }) {
  const actions: WorkspaceActionDescriptor[] = [
    ...buildAtendimentoRecoveryLinks(conversation, allowRecoveryCapability),
    { id: "atendimento-open-automation", kind: "button", label: "Automacao", tone: "secondary", onClick: openAutomation },
    { id: "atendimento-open-agenda", kind: "button", label: "Agenda", tone: "secondary", onClick: openAgenda },
  ];
  ...
}
```

---

## 4) `frontend/src/components/bot-editor/BotMessageStudio.tsx`

Trechos do builder/inspector (contexto do fluxo — não contém campos Recovery diretamente, mas é relevante para o `currentFlow`/editor):

```ts
export type BotStudioFlowScenario = {
  id: string;
  label: string;
  description: string;
  badge?: string;
  nodeKind?: "template" | "message" | "action" | "human_handoff" | "end";
  supportsButtons?: boolean;
  editable?: boolean;
  messageText: string;
  buttons: BotStudioButton[];
  position?: { x: number; y: number };
  effectLabel?: string;
  toneLabel?: string;
};

const nodeById = useMemo(
  () => new Map(flowScenarios.map((scenario, index) => [scenario.id, { ...scenario, position: scenario.position || { x: 320 * index, y: 120 } }])),
  [flowScenarios],
);
const selectedNode = nodeById.get(selectedScenarioId) || selectedScenario || null;

function getDefaultInspectorSections(node: BotStudioFlowScenario | null): InspectorSectionId[] {
  if (!node) return ["content"];
  if (node.nodeKind === "template") return ["content", "advanced"];
  if (node.nodeKind === "action") return ["capture", "advanced"];
  if (isEditableNode(node) && node.supportsButtons !== false) return ["content", "buttons"];
  return ["content", "advanced"];
}
```

---

## 5) `frontend/src/hooks/use-flow-builder.ts`

Trechos do hook que gerencia o estado do flow (definition, selectedNode etc):

```ts
export function useFlowBuilder(value: FlowDefinition) {
  const [definition, setDefinition] = useState<FlowDefinition>(() => cloneFlowDefinition(value));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(() => findStartNode(value)?.id || null);
  const [runtimeSession, setRuntimeSession] = useState<FlowRuntimeSession>(() =>
    advanceRuntimeSession(value, createRuntimeSession(value)),
  );

  useEffect(() => {
    setDefinition(cloneFlowDefinition(value));
  }, [value]);

  const issues = useMemo(() => validateFlowDefinition(definition), [definition]);
  const transitionMap = useMemo(() => buildTransitionMap(definition), [definition]);

  return {
    definition,
    issues,
    selectedNode: getNodeById(definition, selectedNodeId),
    selectedNodeId,
    transitionMap,
    runtimeSession,
    selectNode,
    updateDefinition,
    onNodesChange,
    onEdgesChange,
    onConnect,
    autoLayout,
    updateLayout,
    updateRuntimeWindow,
    sendTestInput,
    resetTestRuntime,
  };
}
```

---

## 6) `frontend/src/app/dashboard/inbox/inbox-model.ts` (tipos relevantes)

```ts
export type InboxRouteTarget = "recovery" | "atendimento";
export type InboxStatus = "new" | "open" | "closed" | "blocked";

export type Customer = {
  id: string;
  phone: string;
  name: string | null;
};

export type AtendimentoCustomer = {
  id: string;
  companyId: number;
  name: string | null;
  phone: string;
  phoneNormalized: string;
  ...
  recoveryCustomerId: string | null;
  openAmount: number | null;
  recoveryStatus: string | null;
  recoveryRiskScore: number | null;
  recoveryTotalPaid: number;
  recoveryAutomationEnabled: boolean | null;
};

export type InboxRecoveryPaymentSummary = { id: string; amount: number; status: string | null; /* ... */ };

export type InboxConversation = {
  id: string;
  status: InboxStatus | string;
  assignedTo: string | null;
  botActive: boolean | null;
  humanAssigned: boolean | null;
  createdAt: string;
  updatedAt: string;
  currentFlow: string | null;
  flowResult: string | null;
  routeTarget: InboxRouteTarget;
  routeReason: string;
  recoveryCustomerId: string | null;
  recoveryCustomerName: string | null;
  recoveryOpenAmount: number;
  recoveryRiskScore: number | null;
  recoveryTotalPaid: number;
  recoveryStatus: string | null;
  recoveryPaymentHistory: InboxRecoveryPaymentSummary[];
  recoveryCurrentStep: string | null;
  recoverySuggestedPath: string;
  latestSourceModule: string | null;
  isBlocked: boolean;
  blockedAt: string | null;
  blockedReason: string | null;
  metadata?: Record<string, unknown> | null;
  customer: Customer;
  messages: InboxMessage[];
};
```

---

Se quiser que eu: (A) inclua trechos maiores (ex.: `loadConversation`, `mergeInboxConversationSummary`) na íntegra, (B) gere um PR que altera a regra `isAtendimentoRecoveryConversation` para `isRecovery(conversation)` mais robusta, ou (C) gere uma versão reduzida apenas com trechos copiados para colagem (sem comentários), diga qual prefere.