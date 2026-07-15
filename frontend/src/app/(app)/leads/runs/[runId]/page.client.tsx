"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  LeadProcessView,
  type LeadProcessSnapshot,
  type LeadProcessStatus,
} from "@/components/hbx/lead-process-view";
import { apiFetch } from "@/lib/api";

import styles from "./page.module.css";

type SearchRunResponse = {
  id?: string;
  runId?: string;
  status?: string;
  foundCount?: number;
  process?: LeadProcessSnapshot | null;
  meta?: {
    progress?: number;
    terminal?: boolean;
    operationalState?: string;
    process?: LeadProcessSnapshot | null;
    filters?: {
      state?: string | null;
      city?: string | null;
      segment?: string | null;
      radiusKm?: number | null;
      selectedSegments?: string[] | null;
      requiredChannels?: string[] | null;
    };
  };
};

type BankTotals = {
  universeTotal?: number | null;
  availableTotal?: number | null;
  nationalActiveTotal?: number | null;
  operationalPoolTotal?: number | null;
  poolExclusiveTotal?: number | null;
};

const TERMINAL_PROCESS = new Set<LeadProcessStatus>(["completed", "partial", "failed"]);

function processStatus(run: SearchRunResponse): LeadProcessStatus {
  const status = String(run.status || "").toLowerCase();
  if (status === "failed" || status === "error") return "failed";
  if (["partial", "partial_error", "completed_insufficient_results", "canceled", "cancelled"].includes(status)) return "partial";
  if (["completed", "success", "done", "published"].includes(status) || run.meta?.terminal) return "completed";
  if (!status || ["queued", "starting", "sleeping"].includes(status)) return "starting";
  return "running";
}

function filterLabels(run: SearchRunResponse) {
  const filters = run.meta?.filters;
  if (!filters) return [];
  const location = [filters.city, filters.state].filter(Boolean).join("/");
  const segments = filters.selectedSegments?.length ? filters.selectedSegments : filters.segment ? [filters.segment] : [];
  return [
    location,
    ...segments,
    typeof filters.radiusKm === "number" && filters.radiusKm > 0 ? `Raio de ${filters.radiusKm} km` : "",
    ...(filters.requiredChannels || []).map(channel => `Canal: ${channel}`),
  ].filter((value): value is string => Boolean(value));
}

function snapshotFromRun(run: SearchRunResponse, fallbackId: string): LeadProcessSnapshot {
  const provided = run.process || run.meta?.process;
  const labels = filterLabels(run);
  if (provided) {
    return {
      ...provided,
      operationId: String(provided.operationId || run.id || run.runId || fallbackId),
      mode: "search",
      status: processStatus({ ...run, status: provided.status || run.status }),
      progress: Number(provided.progress || 0),
      stages: Array.isArray(provided.stages) ? provided.stages : [],
      counters: provided.counters && typeof provided.counters === "object" ? provided.counters : {},
      recentLeads: Array.isArray(provided.recentLeads) ? provided.recentLeads : [],
      events: Array.isArray(provided.events) ? provided.events : [],
      filters: labels.length ? labels : provided.filters,
    };
  }
  return {
    operationId: String(run.id || run.runId || fallbackId),
    mode: "search",
    status: processStatus(run),
    progress: Number(run.meta?.progress || 0),
    stages: [],
    counters: typeof run.foundCount === "number" ? { found: run.foundCount } : {},
    currentLead: null,
    recentLeads: [],
    events: [],
    filters: labels,
  };
}

function withBankTotals(snapshot: LeadProcessSnapshot | null, bank: BankTotals | null) {
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

export function LeadRunClient({ runId: runIdProp }: { runId?: string } = {}) {
  const params = useParams<{ runId?: string | string[] }>();
  const router = useRouter();
  const paramValue = params?.runId;
  const runId = runIdProp || (Array.isArray(paramValue) ? paramValue[0] : paramValue) || "";
  const [snapshot, setSnapshot] = useState<LeadProcessSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bank, setBank] = useState<BankTotals | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [pollVersion, setPollVersion] = useState(0);
  const snapshotStatus = snapshot?.status;

  useEffect(() => {
    let alive = true;
    apiFetch<BankTotals>("/leads-bank")
      .then(result => { if (alive) setBank(result); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!snapshotStatus || !TERMINAL_PROCESS.has(snapshotStatus)) return;
    let alive = true;
    apiFetch<BankTotals>("/leads-bank")
      .then(result => { if (alive) setBank(result); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [snapshotStatus]);

  const load = useCallback(async () => {
    if (!runId) throw new Error("Execução de busca inválida.");
    const response = await apiFetch<SearchRunResponse>(
      `/webscraping/radar/search-runs/${encodeURIComponent(runId)}`,
    );
    const next = snapshotFromRun(response, runId);
    setSnapshot(next);
    setError(null);
    setLoading(false);
    return next;
  }, [runId]);

  useEffect(() => {
    let alive = true;
    let timer: number | null = null;

    async function tick() {
      try {
        const next = await load();
        if (!alive || TERMINAL_PROCESS.has(next.status)) return;
        timer = window.setTimeout(() => { void tick(); }, 1500);
      } catch (cause) {
        if (!alive) return;
        setError(cause instanceof Error ? cause.message : "Não foi possível acompanhar esta busca.");
        setLoading(false);
      }
    }

    void tick();
    return () => {
      alive = false;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [load, pollVersion]);

  async function cancel() {
    if (!runId || canceling) return;
    setCanceling(true);
    try {
      await apiFetch(`/webscraping/radar/search-runs/${encodeURIComponent(runId)}/cancel`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível parar a busca.");
    } finally {
      setCanceling(false);
    }
  }

  function retry() {
    setLoading(true);
    setError(null);
    setPollVersion(version => version + 1);
  }

  function openResults() {
    try { sessionStorage.setItem("hbx:vendas-modo", "buscar"); } catch { /* sem storage */ }
    router.push(`/vendas?modo=buscar&runId=${encodeURIComponent(runId)}`);
  }

  function returnToSearch() {
    try { sessionStorage.setItem("hbx:vendas-modo", "buscar"); } catch { /* sem storage */ }
    router.push("/vendas?modo=buscar");
  }

  const terminal = snapshot ? TERMINAL_PROCESS.has(snapshot.status) : false;
  const failed = snapshot?.status === "failed";
  const presentedSnapshot = withBankTotals(snapshot, bank);
  return (
    <div className={styles.page}>
      <LeadProcessView
        snapshot={presentedSnapshot}
        loading={loading}
        error={error}
        onCancel={!error && !terminal && !canceling ? cancel : undefined}
        onPrimary={error && !terminal ? retry : failed ? returnToSearch : terminal ? openResults : undefined}
        primaryLabel={error && !terminal ? "Tentar novamente" : failed ? "Voltar para a busca" : "Ver empresas encontradas"}
      />
    </div>
  );
}
