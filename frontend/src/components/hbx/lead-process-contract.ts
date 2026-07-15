export type LeadProcessMode = "search" | "claim";
export type LeadProcessStatus = "starting" | "running" | "completed" | "partial" | "failed";

export type LeadProcessStage = {
  key: string;
  label: string;
  detail?: string | null;
  status?: string | null;
  current?: number | null;
  total?: number | null;
};

export type LeadProcessCounters = Record<string, number | null | undefined>;

export type LeadProcessContact = {
  value?: string | null;
  label?: string | null;
  source?: string | null;
  sourceLabel?: string | null;
  whatsappStatus?: string | null;
  kind?: string | null;
  rank?: number | null;
};

export type LeadProcessLead = {
  id?: string | null;
  name?: string | null;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  status?: string | null;
  detail?: string | null;
  source?: string | null;
  sourceChain?: string | null;
  phone?: string | null;
  email?: string | null;
  phones?: Array<string | LeadProcessContact> | null;
  emails?: Array<string | LeadProcessContact> | null;
  phoneContacts?: LeadProcessContact[] | null;
  emailContacts?: LeadProcessContact[] | null;
};

export type LeadProcessEvent = {
  id?: string | null;
  key?: string | null;
  type?: string | null;
  label?: string | null;
  status?: string | null;
  detail?: unknown;
  leadId?: string | null;
  at?: string | null;
  createdAt?: string | null;
};

export type LeadProcessSourceState = {
  status?: string | null;
  attempted?: boolean | null;
  found?: number | null;
  error?: string | null;
};

export type LeadProcessDiscardReason = {
  label: string;
  count: number;
};

export type LeadProcessSnapshot = {
  operationId: string;
  mode: LeadProcessMode;
  status: LeadProcessStatus;
  internalStatus?: string | null;
  progress: number;
  stages: LeadProcessStage[];
  counters: LeadProcessCounters;
  currentLead?: LeadProcessLead | null;
  recentLeads: LeadProcessLead[];
  events: LeadProcessEvent[];
  sourceCoverage?: Record<string, LeadProcessSourceState | unknown> | null;
  filters?: string[];
  discardReasons?: LeadProcessDiscardReason[];
  contactAccessGranted?: boolean | null;
  creditRefundConfirmed?: boolean | null;
  contactAccessRevoked?: boolean | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

const POST_DEBIT_STATUSES = new Set([
  "credit_debited",
  "ownership_claimed",
  "rfb_hydrating",
  "base_revealed",
  "motor_enriching",
  "vendas_creating",
  "completed",
  "partial",
]);

const REVEALED_STATUSES = new Set([
  "base_revealed",
  "motor_enriching",
  "vendas_creating",
  "completed",
  "partial",
]);

const CONTACT_ACCESS_BLOCKED_STATUSES = new Set([
  "failed",
  "refund_pending",
  "refund-confirmed",
  "refund_confirmed",
  "refunded",
  "credit_refunded",
]);

const SAFE_STAGE_LABELS: Record<string, string> = {
  queued: "Preparando a operação",
  validating: "Validando a operação",
  debit_pending: "Reservando o crédito",
  credit_debited: "Crédito debitado",
  ownership_claimed: "Reservando o lead para sua empresa",
  rfb: "Consultando a Receita Federal",
  rfb_hydrating: "Conferindo a Receita Federal",
  base_revealed: "Liberando os dados adquiridos",
  motor: "Consultando o motor HBX",
  motor_enriching: "Completando os contatos disponíveis",
  cross_deduplicate: "Cruzando e removendo duplicados",
  validate_eligibility: "Validando elegibilidade",
  publishing: "Publicando empresas aprovadas",
  vendas_creating: "Transferindo para Vendas",
  completed: "Operação concluída",
  partial: "Operação concluída parcialmente",
  refund_pending: "Reconciliando o estorno",
  refunded: "Crédito estornado",
  failed: "Operação interrompida",
};

const SAFE_EVENT_LABELS: Record<string, string> = {
  search_queued: "Busca enfileirada",
  rfb_attempted: "Consulta à Receita iniciada",
  motor_attempted: "Consulta ao motor iniciada",
  search_finished: "Busca finalizada",
  process_update: "Processamento atualizado",
};

const SAFE_COUNTERS = new Set([
  "scanned",
  "matched",
  "duplicates",
  "discarded",
  "enriching",
  "approved",
  "published",
  "found",
  "queued",
  "completed",
  "partial",
  "failed",
  "universeTotal",
  "availableTotal",
  "nationalActiveTotal",
  "operationalPoolTotal",
  "poolExclusiveTotal",
]);

function safeStatus(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function stageIsDone(snapshot: LeadProcessSnapshot, key: string) {
  return snapshot.stages.some(stage => {
    const status = safeStatus(stage.status);
    return stage.key === key && ["done", "completed", "success"].includes(status);
  });
}

export function leadContactAccessIsRevoked(snapshot: LeadProcessSnapshot | null) {
  if (!snapshot || snapshot.mode !== "claim") return true;
  const internal = safeStatus(snapshot.internalStatus);
  return snapshot.creditRefundConfirmed === true
    || snapshot.contactAccessRevoked === true
    || snapshot.status === "failed"
    || CONTACT_ACCESS_BLOCKED_STATUSES.has(internal);
}

export function leadCreditWasDebited(snapshot: LeadProcessSnapshot | null) {
  if (!snapshot || snapshot.mode !== "claim" || leadContactAccessIsRevoked(snapshot)) return false;
  const internal = safeStatus(snapshot.internalStatus);
  return POST_DEBIT_STATUSES.has(internal) || stageIsDone(snapshot, "credit_debited");
}

export function canRevealLeadContacts(snapshot: LeadProcessSnapshot | null) {
  if (!snapshot || snapshot.contactAccessGranted !== true || !leadCreditWasDebited(snapshot) || leadContactAccessIsRevoked(snapshot)) return false;
  const internal = safeStatus(snapshot.internalStatus);
  return REVEALED_STATUSES.has(internal) || stageIsDone(snapshot, "base_revealed");
}

function optionalText(value: unknown, maxLength = 240) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizeContact(contact: LeadProcessContact | string): LeadProcessContact | null {
  const record: LeadProcessContact = typeof contact === "string" ? { value: contact } : contact || {};
  const value = optionalText(record.value, 320);
  if (!value) return null;
  return {
    value,
    label: optionalText(record.label, 120),
    source: optionalText(record.source, 80),
    sourceLabel: optionalText(record.sourceLabel, 120),
    whatsappStatus: optionalText(record.whatsappStatus, 40),
    kind: optionalText(record.kind, 40),
    rank: optionalNumber(record.rank),
  };
}

function contactKey(contact: LeadProcessContact, kind: "phone" | "email") {
  const value = String(contact.value || "").trim();
  return kind === "phone" ? value.replace(/\D/g, "") : value.toLowerCase();
}

function sanitizeContacts(lead: LeadProcessLead, kind: "phone" | "email") {
  const structured = kind === "phone" ? lead.phoneContacts : lead.emailContacts;
  const legacy = kind === "phone" ? lead.phones : lead.emails;
  const primary = kind === "phone" ? lead.phone : lead.email;
  const candidates: Array<LeadProcessContact | string> = [
    ...(Array.isArray(structured)
      ? structured.slice().sort((a, b) => Number(a?.rank || 99) - Number(b?.rank || 99))
      : []),
    ...(Array.isArray(legacy) ? legacy : []),
    ...(primary ? [primary] : []),
  ];
  const seen = new Set<string>();
  const result: LeadProcessContact[] = [];
  for (const candidate of candidates) {
    const contact = sanitizeContact(candidate);
    if (!contact) continue;
    const key = contactKey(contact, kind);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(contact);
    if (result.length === 3) break;
  }
  return result;
}

function sanitizedLeadStatus(value: unknown) {
  const status = safeStatus(value);
  if (["failed", "error", "rejected", "discarded", "negative"].some(item => status.includes(item))) return "discarded";
  if (["approved", "published", "completed", "success"].some(item => status.includes(item))) return "approved";
  return "processing";
}

function sanitizeLead(lead: LeadProcessLead, revealContacts: boolean): LeadProcessLead {
  const status = sanitizedLeadStatus(lead.status);
  const safeLead: LeadProcessLead = {
    id: optionalText(lead.id, 160),
    name: optionalText(lead.name, 240),
    city: optionalText(lead.city, 120),
    state: optionalText(lead.state, 32),
    segment: optionalText(lead.segment, 160),
    status,
    // `detail` vem de provedores e pode carregar telefone/e-mail em texto
    // livre. Antes da compra mostramos apenas um motivo comercial genérico.
    detail: revealContacts
      ? optionalText(lead.detail, 360)
      : status === "discarded"
        ? "Não passou pelos critérios desta busca"
        : null,
    source: optionalText(lead.source, 100),
    sourceChain: optionalText(lead.sourceChain, 240),
  };
  if (!revealContacts) return safeLead;
  return {
    ...safeLead,
    phoneContacts: sanitizeContacts(lead, "phone"),
    emailContacts: sanitizeContacts(lead, "email"),
  };
}

function canonicalStageKey(value: unknown) {
  const key = safeStatus(value);
  return Object.hasOwn(SAFE_STAGE_LABELS, key) ? key : null;
}

function sanitizeStages(stages: LeadProcessStage[], reveal: boolean) {
  return stages.slice(0, 24).map((stage, index) => {
    const key = canonicalStageKey(stage.key);
    return {
      key: key || `stage_${index + 1}`,
      label: key ? SAFE_STAGE_LABELS[key] : `Etapa ${index + 1}`,
      detail: reveal ? optionalText(stage.detail, 280) : null,
      status: optionalText(stage.status, 40),
      current: optionalNumber(stage.current),
      total: optionalNumber(stage.total),
    } satisfies LeadProcessStage;
  });
}

function sanitizeCounters(counters: LeadProcessCounters) {
  const result: LeadProcessCounters = {};
  for (const [key, value] of Object.entries(counters || {})) {
    if (!SAFE_COUNTERS.has(key)) continue;
    result[key] = optionalNumber(value);
  }
  return result;
}

function eventDetail(value: unknown) {
  if (typeof value === "string") return optionalText(value, 320);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of ["detail", "message", "error", "reason"]) {
    const text = optionalText(record[key], 320);
    if (text) return text;
  }
  return null;
}

function sanitizeEvents(events: LeadProcessEvent[], reveal: boolean) {
  return events.slice(-40).map((event, index) => {
    const rawKey = safeStatus(event.key || event.type).replace(/^claim\./, "");
    const stageKey = canonicalStageKey(rawKey);
    const key = stageKey || (Object.hasOwn(SAFE_EVENT_LABELS, rawKey) ? rawKey : "process_update");
    return {
      id: `event-${index + 1}`,
      key,
      label: stageKey ? SAFE_STAGE_LABELS[stageKey] : SAFE_EVENT_LABELS[key],
      status: optionalText(event.status, 40),
      detail: reveal ? eventDetail(event.detail) : null,
      at: optionalText(event.at || event.createdAt, 80),
    } satisfies LeadProcessEvent;
  });
}

function sanitizeCoverage(value: LeadProcessSnapshot["sourceCoverage"]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result: Record<string, LeadProcessSourceState> = {};
  for (const source of ["rfb", "motor"] as const) {
    const candidate = value[source];
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const record = candidate as LeadProcessSourceState;
    result[source] = {
      status: optionalText(record.status, 40),
      attempted: record.attempted === true,
      found: optionalNumber(record.found),
    };
  }
  return Object.keys(result).length ? result : null;
}

function safeDiscardLabel(value: unknown) {
  const label = String(value || "").toLowerCase();
  if (label.includes("duplic")) return "Duplicada no universo";
  if (label.includes("entreg") || label.includes("adquir")) return "Já entregue";
  if (label.includes("contat") || label.includes("telefone")) return "Contato não aproveitável";
  if (label.includes("cidade") || label.includes("recorte")) return "Fora do recorte";
  if (label.includes("situa") || label.includes("cadastr")) return "Situação cadastral incompatível";
  if (label.includes("confian")) return "Baixa confiança";
  if (label.includes("bloque") || label.includes("negativ")) return "Histórico negativo";
  return "Outro critério confirmado";
}

/**
 * Fronteira defensiva do frontend. O backend continua sendo a barreira de
 * segurança, mas nenhum snapshot arbitrário é guardado/renderizado sem uma
 * allowlist. Antes da liberação paga, a empresa e o contexto da busca continuam
 * visíveis; somente telefones, e-mails e outros contatos permanecem fora do DOM.
 */
export function sanitizeLeadProcessSnapshot(snapshot: LeadProcessSnapshot | null): LeadProcessSnapshot | null {
  if (!snapshot) return null;
  const reveal = canRevealLeadContacts(snapshot);
  const currentLead = snapshot.currentLead ? sanitizeLead(snapshot.currentLead, reveal) : null;
  return {
    operationId: String(snapshot.operationId || "").slice(0, 180),
    mode: snapshot.mode === "search" ? "search" : "claim",
    status: snapshot.status,
    internalStatus: optionalText(snapshot.internalStatus, 48),
    progress: optionalNumber(snapshot.progress) || 0,
    stages: sanitizeStages(Array.isArray(snapshot.stages) ? snapshot.stages : [], reveal),
    counters: sanitizeCounters(snapshot.counters || {}),
    currentLead,
    recentLeads: (Array.isArray(snapshot.recentLeads) ? snapshot.recentLeads : [])
      .slice(-8)
      .map(lead => sanitizeLead(lead, reveal)),
    events: sanitizeEvents(Array.isArray(snapshot.events) ? snapshot.events : [], reveal),
    sourceCoverage: sanitizeCoverage(snapshot.sourceCoverage),
    filters: snapshot.mode === "search" && Array.isArray(snapshot.filters)
      ? snapshot.filters.map(value => optionalText(value, 160)).filter((value): value is string => Boolean(value)).slice(0, 8)
      : undefined,
    discardReasons: Array.isArray(snapshot.discardReasons)
      ? snapshot.discardReasons.slice(0, 12).map(reason => ({
        label: safeDiscardLabel(reason.label),
        count: Math.max(0, Math.trunc(optionalNumber(reason.count) || 0)),
      }))
      : undefined,
    contactAccessGranted: snapshot.contactAccessGranted === true,
    creditRefundConfirmed: snapshot.creditRefundConfirmed === true,
    contactAccessRevoked: snapshot.contactAccessRevoked === true,
    createdAt: optionalText(snapshot.createdAt, 80),
    updatedAt: optionalText(snapshot.updatedAt, 80),
  };
}
