"use client";

import { useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";

export type RadarAiPublicState = "none" | "queued" | "processing" | "released" | "invalidated";

type RadarAiStatusBase = {
  stage?: string | null;
  updatedAt?: string | null;
};

export type RadarAiLeadStatus =
  | ({ state: "none" } & RadarAiStatusBase)
  | ({
      state: "queued";
      position?: number | null;
      queuedAt?: string | null;
      pcOnline?: boolean | null;
      retryAt?: string | null;
    } & RadarAiStatusBase)
  | ({ state: "processing"; startedAt?: string | null } & RadarAiStatusBase)
  | ({
      state: "released";
      completedAt?: string | null;
      noNewData?: boolean;
      receipt?: Record<string, unknown> | null;
    } & RadarAiStatusBase)
  | ({
      state: "invalidated";
      completedAt?: string | null;
      reasonCode?: string | null;
    } & RadarAiStatusBase);

export type RadarAiStatusMap = Record<string, RadarAiLeadStatus>;

export const RADAR_AI_STATUS_COPY: Record<Exclude<RadarAiPublicState, "none">, string> = {
  queued: "Aguardando liberação",
  processing: "Em processo de liberação",
  released: "Liberado",
  invalidated: "Invalidado",
};

const PROCESSING_STATES = new Set([
  "leased",
  "running",
  "crawling",
  "scraping",
  "analyzing",
  "analysing",
  "inference_30b",
  "ready_to_commit",
  "committing",
  "processing",
]);
const QUEUED_STATES = new Set(["queued", "waiting", "retry", "retrying", "offline", "delayed"]);
const RELEASED_STATES = new Set(["done", "completed", "released", "no_new_data"]);
const INVALIDATED_STATES = new Set(["dead", "failed", "error", "invalid", "invalidated", "rejected"]);

function cleanText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

export function normalizeRadarAiStatus(raw: unknown): RadarAiLeadStatus {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { state: "none" };
  const value = raw as Record<string, unknown>;
  const rawState = String(value.state ?? value.status ?? "none").trim().toLowerCase();
  const stage = cleanText(value.stage ?? value.lastPhase);
  const updatedAt = cleanText(value.updatedAt ?? value.heartbeatAt);

  if (RELEASED_STATES.has(rawState)) {
    return {
      state: "released",
      stage,
      updatedAt,
      completedAt: cleanText(value.completedAt),
      noNewData: Boolean(value.noNewData),
      receipt: value.receipt && typeof value.receipt === "object" && !Array.isArray(value.receipt)
        ? value.receipt as Record<string, unknown>
        : null,
    };
  }
  if (INVALIDATED_STATES.has(rawState)) {
    return {
      state: "invalidated",
      stage,
      updatedAt,
      completedAt: cleanText(value.completedAt),
      reasonCode: cleanText(value.reasonCode ?? value.errorCode),
    };
  }
  if (PROCESSING_STATES.has(rawState)) {
    return {
      state: "processing",
      stage,
      updatedAt,
      startedAt: cleanText(value.startedAt),
    };
  }
  if (QUEUED_STATES.has(rawState)) {
    const position = Number(value.position);
    return {
      state: "queued",
      stage,
      updatedAt,
      position: Number.isFinite(position) && position > 0 ? Math.trunc(position) : null,
      queuedAt: cleanText(value.queuedAt),
      pcOnline: typeof value.pcOnline === "boolean" ? value.pcOnline : null,
      retryAt: cleanText(value.retryAt ?? value.nextAttemptAt),
    };
  }
  return { state: "none", stage, updatedAt };
}

export function radarAiStatusLabel(status: RadarAiLeadStatus | undefined | null): string | null {
  if (!status || status.state === "none") return null;
  return RADAR_AI_STATUS_COPY[status.state];
}

export function isRadarAiTerminal(
  status: RadarAiLeadStatus | undefined | null,
): status is Extract<RadarAiLeadStatus, { state: "released" | "invalidated" }> {
  return status?.state === "released" || status?.state === "invalidated";
}

const POLL_MS = 6000;
export const RADAR_AI_STATUS_BATCH_SIZE = 200;
const EMPTY_STATUS_MAP: RadarAiStatusMap = {};

export function chunkRadarAiStatusLeadIds(ids: string[]): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += RADAR_AI_STATUS_BATCH_SIZE) {
    chunks.push(ids.slice(index, index + RADAR_AI_STATUS_BATCH_SIZE));
  }
  return chunks;
}

type RadarAiStatusPollOptions = {
  onTerminal?: (radarLeadId: string, status: Extract<RadarAiLeadStatus, { state: "released" | "invalidated" }>) => void;
};

export function useRadarAiStatusPoll(
  leadIds: string[],
  options: RadarAiStatusPollOptions = {},
): RadarAiStatusMap {
  const [statusMap, setStatusMap] = useState<RadarAiStatusMap>({});
  const idsKey = Array.from(new Set(leadIds.map((id) => String(id || "").trim()).filter(Boolean))).sort().join(",");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusRef = useRef<RadarAiStatusMap>({});
  const notifiedTerminalRef = useRef(new Set<string>());
  const onTerminalRef = useRef(options.onTerminal);

  useEffect(() => {
    onTerminalRef.current = options.onTerminal;
  }, [options.onTerminal]);

  useEffect(() => {
    const ids = idsKey ? idsKey.split(",") : [];
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (!ids.length) return;

    let cancelled = false;
    let inFlight = false;

    async function fetchOnce() {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const batches = chunkRadarAiStatusLeadIds(ids);
        const responses = await Promise.allSettled(
          batches.map((batch) => apiFetch<{ items?: Record<string, unknown> }>("/webscraping/radar/ai-status", {
            method: "POST",
            body: JSON.stringify({ leadIds: batch }),
          })),
        );
        if (cancelled) return;

        const rawItems: Record<string, unknown> = {};
        for (const response of responses) {
          if (response.status === "fulfilled" && response.value?.items) {
            Object.assign(rawItems, response.value.items);
          }
        }
        const previous = statusRef.current;
        const next: RadarAiStatusMap = {};

        for (const id of ids) {
          next[id] = Object.prototype.hasOwnProperty.call(rawItems, id)
            ? normalizeRadarAiStatus(rawItems[id])
            : previous[id] || { state: "none" };

          const current = next[id];
          const before = previous[id];
          if (isRadarAiTerminal(current)) {
            if (before && !isRadarAiTerminal(before) && !notifiedTerminalRef.current.has(id)) {
              notifiedTerminalRef.current.add(id);
              onTerminalRef.current?.(id, current);
            }
          } else {
            notifiedTerminalRef.current.delete(id);
          }
        }

        statusRef.current = next;
        setStatusMap(next);

        const allTerminal = ids.every((id) => isRadarAiTerminal(next[id]));
        if (allTerminal && timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      } catch {
        // Mantém o último estado conhecido. O próximo ciclo tenta novamente.
      } finally {
        inFlight = false;
      }
    }

    timerRef.current = setInterval(() => { void fetchOnce(); }, POLL_MS);
    void fetchOnce();

    return () => {
      cancelled = true;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [idsKey]);

  return idsKey ? statusMap : EMPTY_STATUS_MAP;
}
