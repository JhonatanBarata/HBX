"use client";

export type StoredRadarRun = {
  runId: string;
  status?: string | null;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  targetQuantity?: number | null;
  deliveredCount?: number | null;
  updatedAt: number;
};

export const RADAR_ACTIVE_RUN_STORAGE_KEY = "hbx_active_radar_run_v1";
export const RADAR_ACTIVE_RUN_EVENT = "hbx:active-radar-run";

function emitRadarRunChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(RADAR_ACTIVE_RUN_EVENT));
}

export function isTerminalRadarRunStatus(status?: string | null) {
  return ["completed", "partial_error", "completed_insufficient_results", "failed", "canceled"].includes(String(status || ""));
}

export function formatPtBrCardCount(count: number) {
  const safeCount = Math.max(0, Number(count || 0));
  return `${safeCount} ${safeCount === 1 ? "card" : "cards"}`;
}

export function formatPtBrReceivedCards(count: number) {
  const safeCount = Math.max(0, Number(count || 0));
  return `${formatPtBrCardCount(safeCount)} ${safeCount === 1 ? "recebido" : "recebidos"}`;
}

export function readStoredRadarRun() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(RADAR_ACTIVE_RUN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredRadarRun | null;
    if (!parsed?.runId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredRadarRun(input: Omit<StoredRadarRun, "updatedAt"> & { updatedAt?: number }) {
  if (typeof window === "undefined" || !input.runId) return;
  const payload: StoredRadarRun = {
    ...input,
    updatedAt: input.updatedAt || Date.now(),
  };
  try {
    window.localStorage.setItem(RADAR_ACTIVE_RUN_STORAGE_KEY, JSON.stringify(payload));
    emitRadarRunChange();
  } catch {
    // localStorage is best-effort; the backend run remains the source of truth.
  }
}

export function clearStoredRadarRun(runId?: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (runId) {
      const current = readStoredRadarRun();
      if (current?.runId && current.runId !== runId) return;
    }
    window.localStorage.removeItem(RADAR_ACTIVE_RUN_STORAGE_KEY);
    emitRadarRunChange();
  } catch {
    // ignore storage failures
  }
}

export function subscribeStoredRadarRun(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const handleStorage = (event: StorageEvent) => {
    if (event.key === RADAR_ACTIVE_RUN_STORAGE_KEY) listener();
  };
  window.addEventListener(RADAR_ACTIVE_RUN_EVENT, listener);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(RADAR_ACTIVE_RUN_EVENT, listener);
    window.removeEventListener("storage", handleStorage);
  };
}
