"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  LeadProcessView,
  type LeadProcessLead,
  type LeadProcessSnapshot,
  type LeadProcessStatus,
} from "@/components/hbx/lead-process-view";
import { apiFetch } from "@/lib/api";

type ClaimResponse = {
  ok?: boolean;
  operation?: LeadProcessSnapshot | null;
  [key: string]: unknown;
};

type ClaimOptions = {
  lead?: LeadProcessLead | null;
};

type BankTotals = {
  universeTotal?: number | null;
  availableTotal?: number | null;
  nationalActiveTotal?: number | null;
  operationalPoolTotal?: number | null;
  poolExclusiveTotal?: number | null;
};

type LeadProcessContextValue = {
  claimLead: (leadId: string, options?: ClaimOptions) => Promise<ClaimResponse>;
  dismiss: () => void;
  snapshot: LeadProcessSnapshot | null;
  error: string | null;
  open: boolean;
};

const TERMINAL = new Set(["completed", "partial", "failed"]);
const LeadProcessContext = createContext<LeadProcessContextValue | null>(null);

function normalizeStatus(value: unknown): LeadProcessStatus {
  const status = String(value || "").trim().toLowerCase();
  if (["completed", "success", "done", "published"].includes(status)) return "completed";
  if (["partial", "partial_error", "canceled", "cancelled"].includes(status)) return "partial";
  if (["failed", "error", "rejected", "refunded"].includes(status)) return "failed";
  if (!status || ["queued", "starting", "pending"].includes(status)) return "starting";
  return "running";
}

function operationFrom(payload: unknown): LeadProcessSnapshot | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as {
    operation?: unknown;
    operations?: unknown;
    process?: unknown;
    operationId?: unknown;
    runId?: unknown;
    mode?: unknown;
  };
  const firstOperation = Array.isArray(record.operations) ? record.operations[0] : null;
  const candidate = record.operation ?? firstOperation ?? record.process ?? payload;
  if (!candidate || typeof candidate !== "object") return null;
  const snapshot = candidate as Partial<LeadProcessSnapshot> & { id?: unknown; runId?: unknown };
  const operationId = snapshot.operationId || snapshot.runId || snapshot.id || record.operationId || record.runId;
  if (!operationId) return null;
  const mode = snapshot.mode === "search" ? "search" : "claim";
  return {
    ...snapshot,
    operationId: String(operationId),
    mode,
    status: normalizeStatus(snapshot.status || snapshot.internalStatus),
    progress: Number(snapshot.progress || 0),
    stages: Array.isArray(snapshot.stages) ? snapshot.stages : [],
    counters: snapshot.counters && typeof snapshot.counters === "object" ? snapshot.counters : {},
    currentLead: snapshot.currentLead ?? null,
    recentLeads: Array.isArray(snapshot.recentLeads) ? snapshot.recentLeads : [],
    events: Array.isArray(snapshot.events) ? snapshot.events : [],
    sourceCoverage: snapshot.sourceCoverage && typeof snapshot.sourceCoverage === "object" ? snapshot.sourceCoverage : null,
    filters: Array.isArray(snapshot.filters) ? snapshot.filters : undefined,
    discardReasons: Array.isArray(snapshot.discardReasons) ? snapshot.discardReasons : undefined,
  };
}

function withBankTotals(snapshot: LeadProcessSnapshot | null, bank: BankTotals | null | undefined) {
  if (!snapshot || !bank) return snapshot;
  return {
    ...snapshot,
    counters: {
      ...snapshot.counters,
      universeTotal: bank.universeTotal ?? bank.availableTotal ?? undefined,
      nationalActiveTotal: bank.nationalActiveTotal ?? undefined,
      operationalPoolTotal: bank.operationalPoolTotal ?? undefined,
      poolExclusiveTotal: bank.poolExclusiveTotal ?? undefined,
    },
  } satisfies LeadProcessSnapshot;
}

function eventFailureText(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of ["error", "detail", "message"]) {
    if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
  }
  return null;
}

function startingSnapshot(leadId: string, lead?: LeadProcessLead | null): LeadProcessSnapshot {
  return {
    operationId: "",
    mode: "claim",
    status: "starting",
    progress: 0,
    stages: [],
    counters: {},
    currentLead: lead || { id: leadId },
    recentLeads: [],
    events: [],
  };
}

function pollDelay() {
  return new Promise<void>(resolve => window.setTimeout(resolve, 1200));
}

export function LeadProcessProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<LeadProcessSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [bank, setBank] = useState<BankTotals | null | undefined>(undefined);
  const runTokenRef = useRef(0);

  useEffect(() => () => { runTokenRef.current += 1; }, []);

  useEffect(() => {
    if (!open || bank !== undefined) return;
    let alive = true;
    apiFetch<BankTotals>("/leads-bank")
      .then(result => { if (alive) setBank(result); })
      .catch(() => { if (alive) setBank(null); });
    return () => { alive = false; };
  }, [bank, open]);

  const dismiss = useCallback(() => {
    if (snapshot && !TERMINAL.has(snapshot.status)) return;
    setOpen(false);
    setError(null);
    setSnapshot(null);
  }, [snapshot]);

  const claimLead = useCallback(async (leadId: string, options?: ClaimOptions) => {
    const token = ++runTokenRef.current;
    setBank(undefined);
    setSnapshot(startingSnapshot(leadId, options?.lead));
    setError(null);
    setOpen(true);

    try {
      const response = await apiFetch<ClaimResponse>(
        `/webscraping/radar/leads/${encodeURIComponent(leadId)}/send-to-vendas`,
        { method: "POST", body: JSON.stringify({}) },
      );
      let operation = operationFrom(response);
      if (!operation) {
        throw new Error("O servidor confirmou a entrega, mas não retornou o acompanhamento da operação.");
      }
      if (token !== runTokenRef.current) return response;
      setSnapshot(operation);

      while (!TERMINAL.has(operation.status)) {
        await pollDelay();
        if (token !== runTokenRef.current) return response;
        const polled = await apiFetch<unknown>(
          `/webscraping/radar/claim-runs/${encodeURIComponent(operation.operationId)}`,
        );
        const next = operationFrom(polled);
        if (!next) throw new Error("O servidor não retornou o estado da operação de entrega.");
        operation = next;
        setSnapshot(operation);
      }

      if (operation.status === "failed") {
        const failureEvent = [...operation.events].reverse().find(event => {
          const key = String(event.key || event.type || event.status || "").toLowerCase();
          return key.includes("failed") || key.includes("error") || key.includes("refunded");
        });
        throw new Error(eventFailureText(failureEvent?.detail) || failureEvent?.label || "O servidor não concluiu a entrega do lead.");
      }

      return { ...response, operation };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Não foi possível concluir a entrega do lead.";
      if (token === runTokenRef.current) {
        setError(message);
        setSnapshot(current => ({
          ...(current || startingSnapshot(leadId, options?.lead)),
          status: "failed",
        }));
      }
      throw cause;
    }
  }, []);

  const presentedSnapshot = useMemo(() => withBankTotals(snapshot, bank), [bank, snapshot]);
  const value = useMemo<LeadProcessContextValue>(
    () => ({ claimLead, dismiss, snapshot: presentedSnapshot, error, open }),
    [claimLead, dismiss, presentedSnapshot, error, open],
  );

  return <LeadProcessContext.Provider value={value}>{children}</LeadProcessContext.Provider>;
}

export function useLeadClaim() {
  const context = useContext(LeadProcessContext);
  if (!context) throw new Error("useLeadClaim precisa estar dentro de LeadProcessProvider.");
  return context;
}

export function LeadPullProgressOverlay() {
  const { snapshot, error, open, dismiss } = useLeadClaim();
  if (!open) return null;
  return (
    <LeadProcessView
      snapshot={snapshot}
      error={error}
      loading={!snapshot}
      variant="overlay"
      onClose={snapshot && TERMINAL.has(snapshot.status) ? dismiss : undefined}
    />
  );
}
