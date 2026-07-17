"use client";

import { radarAiStatusLabel, type RadarAiLeadStatus } from "@/lib/radar-ai-status";

export function RadarAiBadge({ status }: { status: RadarAiLeadStatus | undefined | null }) {
  if (!status || status.state === "none") return null;
  const label = radarAiStatusLabel(status);
  if (!label) return null;

  return (
    <span
      className={`radar-ai-badge radar-ai-badge--${status.state}`}
      data-local-enrichment-state={status.state}
      role="status"
    >
      {label}
    </span>
  );
}
