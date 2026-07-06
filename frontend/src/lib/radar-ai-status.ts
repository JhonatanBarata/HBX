"use client";

// CHIP E3 (05/07, docs/PLANEJAMENTOS/IA-VPS/PLANO-HIBRIDO-30B.md) — a exigência central do dono:
// o CLIENTE tem que VER que a IA trabalha no lead dele e que ele está na fila. Este módulo é a
// fonte central de COPY (o dono ajusta o texto vendo a tela, sem mexer em componente) + o hook de
// polling reusado pela vitrine de leads (leads/page.client.tsx) e pelo estoque de Vendas
// (vendas/page.client.tsx). Fonte real: POST /webscraping/radar/ai-status (RadarPonteStatusService,
// backend/src/webscraping/radar/missions/radar-ponte-status.service.ts) — status da fila da PONTE
// 30B (RadarMission stages enrich_lead/xray_note), DIFERENTE do enrichmentStatus do pipeline
// genérico (night-factory) que a vitrine já expõe. Flag da fila OFF no backend → 'none' pra tudo,
// nenhuma tela muda (degrade invisível).

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

export type RadarAiLeadStatus =
  | { state: "none" }
  | { state: "queued"; position: number; stage: string; queuedAt: string; stale: boolean }
  | { state: "processing"; stage: string; startedAt: string | null }
  | {
      state: "done";
      completedAt: string | null;
      summary: { phonesAdded: number; emailsAdded: number; hasNote: boolean; noteScore: number | null };
    };

export type RadarAiStatusMap = Record<string, RadarAiLeadStatus>;

// ── COPY CENTRAL — o dono troca aqui, vendo a tela, sem procurar em componente. ──────────────────
// {position} é substituído pela posição aproximada na fila. Honestidade PC-off (anti-spinner-
// eterno, PLANO §6 E3): `stale` (fila parada ≥15min sem progredir) troca pro texto "fora do pico".
export const RADAR_AI_STATUS_COPY = {
  queued: (position: number) => `⏳ Na fila da IA — posição ${position}`,
  queuedStale: "⏳ Na fila — a IA processa fora do horário de pico",
  processing: "✨ IA enriquecendo agora",
  done: "✓ Enriquecido por IA",
  doneSummary: (summary: { phonesAdded: number; emailsAdded: number; hasNote: boolean }) => {
    const parts: string[] = [];
    if (summary.phonesAdded > 0) parts.push(`+${summary.phonesAdded} telefone${summary.phonesAdded > 1 ? "s" : ""}`);
    if (summary.emailsAdded > 0) parts.push(`+${summary.emailsAdded} e-mail${summary.emailsAdded > 1 ? "s" : ""}`);
    if (summary.hasNote) parts.push("nota da IA");
    return parts.join(" · ");
  },
};

/** Texto curto pro badge de card (vitrine/estoque) — some sozinho quando o estado é 'none'. */
export function radarAiStatusLabel(status: RadarAiLeadStatus | undefined | null): string | null {
  if (!status) return null;
  if (status.state === "queued") {
    return status.stale ? RADAR_AI_STATUS_COPY.queuedStale : RADAR_AI_STATUS_COPY.queued(status.position);
  }
  if (status.state === "processing") return RADAR_AI_STATUS_COPY.processing;
  if (status.state === "done") return RADAR_AI_STATUS_COPY.done;
  return null;
}

/** Resumo (linha 2, opcional) só no estado 'done' — "+2 telefones · +1 e-mail · nota da IA". */
export function radarAiStatusSummaryLabel(status: RadarAiLeadStatus | undefined | null): string | null {
  if (!status || status.state !== "done") return null;
  const text = RADAR_AI_STATUS_COPY.doneSummary(status.summary);
  return text || null;
}

const POLL_MS = 6000;

/**
 * Polling leve por lote de leadIds — reusa o padrão de refresh que a vitrine já tem
 * (setInterval simples, mesmo espírito do poll de search-runs em leads/page.client.tsx). Nunca
 * websocket novo (PLANO §5 E3). Para sozinho quando `leadIds` fica vazio ou quando TODOS os leads
 * do lote já viraram 'done' (a IA terminou — nada mais pra observar; o card fica com o badge
 * permanente sem seguir batendo no backend).
 */
export function useRadarAiStatusPoll(leadIds: string[]): RadarAiStatusMap {
  const [statusMap, setStatusMap] = useState<RadarAiStatusMap>({});
  const idsKey = Array.from(new Set(leadIds.filter(Boolean))).sort().join(",");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const ids = idsKey ? idsKey.split(",") : [];
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (!ids.length) { setStatusMap({}); return; }

    let cancelled = false;

    async function fetchOnce() {
      try {
        const res = await apiFetch<{ items?: RadarAiStatusMap }>("/webscraping/radar/ai-status", {
          method: "POST",
          body: JSON.stringify({ leadIds: ids }),
        });
        if (cancelled || !mountedRef.current) return;
        const items = res?.items || {};
        setStatusMap(items);
        // Todo mundo 'done' (ou nenhum leadId tem estado ativo) → nada mais pra acompanhar, para o poll.
        const stillActive = ids.some((id) => {
          const s = items[id];
          return s && (s.state === "queued" || s.state === "processing");
        });
        if (!stillActive && timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      } catch {
        // silencioso — mantém o último estado conhecido; o próximo tick tenta de novo
      }
    }

    void fetchOnce();
    timerRef.current = setInterval(() => { void fetchOnce(); }, POLL_MS);
    return () => {
      cancelled = true;
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return statusMap;
}
