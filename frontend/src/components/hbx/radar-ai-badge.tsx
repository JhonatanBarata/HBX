"use client";

// CHIP E3 (05/07) — badge de status de IA por CARD (vitrine de leads + estoque de Vendas).
// Componente único: as duas telas renderizam o MESMO badge (mesma classe central, mesma copy),
// só a fonte do `status` muda (useRadarAiStatusPoll em cada tela). Nunca visual próprio na tela —
// tudo vive em .radar-ai-badge* (kit.css) + RADAR_AI_STATUS_COPY (radar-ai-status.ts).

import {
  radarAiStatusLabel,
  radarAiStatusSummaryLabel,
  type RadarAiLeadStatus,
} from "@/lib/radar-ai-status";

export function RadarAiBadge({ status }: { status: RadarAiLeadStatus | undefined | null }) {
  if (!status || status.state === "none") return null;
  const label = radarAiStatusLabel(status);
  if (!label) return null;
  const summary = radarAiStatusSummaryLabel(status);
  const modifier = status.state === "processing" ? " radar-ai-badge--processing"
    : status.state === "done" ? " radar-ai-badge--done"
    : "";
  return (
    <span className={"radar-ai-badge" + modifier} role="status">
      {label}
      {summary && <span className="radar-ai-badge__summary">{summary}</span>}
    </span>
  );
}
