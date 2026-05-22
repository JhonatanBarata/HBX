"use client";

export type StoredRadarRun = {
  runId: string;
  status?: string | null;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  radiusKm?: number | null;
  regionalCities?: Array<{ city?: string | null; state?: string | null; distanceKm?: number | null }> | null;
  selectedSegments?: string[] | null;
  targetQuantity?: number | null;
  deliveredCount?: number | null;
  updatedAt: number;
};

export type StoredRadarFilters = {
  filters: {
    state?: string | null;
    city?: string | null;
    segment?: string | null;
    radiusKm?: number | null;
    originLat?: number | null;
    originLng?: number | null;
    quantity?: number | null;
    engine?: string | null;
    targetType?: string | null;
    ddd?: string | null;
    scoreRange?: string | null;
    noWebsite?: boolean | null;
    withWebsite?: boolean | null;
    highOpportunity?: boolean | null;
    minRating?: string | null;
    minReviews?: string | null;
    status?: string | null;
    preferredChannels?: string[];
    requiredChannels?: string[];
    channelMatchMode?: string | null;
  };
  generalSearch?: string | null;
  updatedAt: number;
};

export const RADAR_ACTIVE_RUN_STORAGE_KEY = "hbx_active_radar_run_v1";
export const RADAR_ACTIVE_RUN_EVENT = "hbx:active-radar-run";
export const RADAR_FILTER_DRAFT_STORAGE_KEY = "hbx_radar_filter_draft_v1";

function emitRadarRunChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(RADAR_ACTIVE_RUN_EVENT));
}

function storedRadarRunHasSameMeaning(left: StoredRadarRun | null, right: StoredRadarRun | null) {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.runId === right.runId &&
    String(left.status || "") === String(right.status || "") &&
    String(left.city || "") === String(right.city || "") &&
    String(left.state || "") === String(right.state || "") &&
    String(left.segment || "") === String(right.segment || "") &&
    Number(left.radiusKm || 0) === Number(right.radiusKm || 0) &&
    JSON.stringify(left.regionalCities || []) === JSON.stringify(right.regionalCities || []) &&
    JSON.stringify(left.selectedSegments || []) === JSON.stringify(right.selectedSegments || []) &&
    Number(left.targetQuantity || 0) === Number(right.targetQuantity || 0) &&
    Number(left.deliveredCount || 0) === Number(right.deliveredCount || 0)
  );
}

export function isTerminalRadarRunStatus(status?: string | null) {
  return ["completed", "partial_error", "completed_insufficient_results", "failed", "canceled"].includes(String(status || ""));
}

export function isRadarRunNotFoundPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as { code?: unknown; status?: unknown; meta?: { status?: unknown } };
  const code = String(candidate.code || "").trim();
  const status = Number(candidate.status || candidate.meta?.status || 0);
  return code === "RADAR_RUN_NOT_FOUND" || status === 404;
}

export function isRadarRunNotFoundError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; status?: unknown; payload?: unknown };
  return String(candidate.code || "").trim() === "RADAR_RUN_NOT_FOUND"
    || Number(candidate.status || 0) === 404
    || isRadarRunNotFoundPayload(candidate.payload);
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
  const current = readStoredRadarRun();
  const nextWithoutTimestamp: StoredRadarRun = {
    ...input,
    updatedAt: current?.updatedAt || Date.now(),
  };
  if (storedRadarRunHasSameMeaning(current, nextWithoutTimestamp)) return;

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

export function readStoredRadarFilters() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(RADAR_FILTER_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredRadarFilters | null;
    if (!parsed?.filters || typeof parsed.filters !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredRadarFilters(input: Omit<StoredRadarFilters, "updatedAt"> & { updatedAt?: number }) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RADAR_FILTER_DRAFT_STORAGE_KEY, JSON.stringify({
      ...input,
      updatedAt: input.updatedAt || Date.now(),
    }));
  } catch {
    // localStorage is best-effort; the backend run remains the source of truth.
  }
}

export function clearStoredRadarFilters() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(RADAR_FILTER_DRAFT_STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
}
