"use client";

import type { CSSProperties } from "react";
import styles from "./MobileLeadScoreGauge.module.css";

export default function MobileLeadScoreGauge({
  value,
  label = "Score",
  caption,
  locked = false,
  premium = false,
  className = "",
}: {
  value: number;
  label?: string;
  caption?: string;
  locked?: boolean;
  premium?: boolean;
  className?: string;
}) {
  const score = Math.max(0, Math.min(100, Math.round(Number(value || 0))));
  return (
    <div
      className={`${styles.gauge} ${className}`}
      data-locked={locked ? "true" : "false"}
      data-premium={premium ? "true" : "false"}
      style={{ ["--lead-score" as string]: `${score}%` } as CSSProperties}
      aria-label={`${label} ${score}`}
    >
      <span>{label}</span>
      <strong>{locked ? "Lead" : score}</strong>
      {caption ? <small>{caption}</small> : null}
    </div>
  );
}
