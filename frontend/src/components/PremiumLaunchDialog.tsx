"use client";

import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import type { InlineLaunchNoticeState } from "./InlineLaunchNotice";
import styles from "./PremiumLaunchDialog.module.css";

type PremiumLaunchDialogProps = {
  notice: InlineLaunchNoticeState | null;
  onOpen: () => void;
  progressLabel?: string | null;
  progressValueLabel?: string | null;
  detailRows?: Array<{ label: string; value: string }>;
  celebrate?: boolean;
  loadingLabel?: string;
};

const CONFETTI_SEEDS = Array.from({ length: 18 }, (_, index) => index);

function getVisibleProgress(progress: number) {
  return Math.max(0, Math.min(100, Math.round(progress)));
}

export default function PremiumLaunchDialog({
  notice,
  onOpen,
  progressLabel,
  progressValueLabel,
  detailRows,
  celebrate = false,
  loadingLabel = "Carregando ambiente...",
}: PremiumLaunchDialogProps) {
  if (!notice || typeof document === "undefined") return null;

  const visibleProgress = getVisibleProgress(notice.progress);
  const statusLabel = notice.statusLabel || (notice.phase === "loading" ? "Processando..." : "Concluído.");
  const detailActivationStep = detailRows?.length ? Math.max(1, 72 / detailRows.length) : 0;

  return createPortal(
    <div className={styles.backdrop} role="presentation" data-component="popupaviso">
      <section className={styles.dialog} data-phase={notice.phase} role="dialog" aria-modal="true" aria-live="polite">
        <span className={styles.dialogGlow} aria-hidden="true" />
        {celebrate && notice.phase === "success" ? (
          <div className="shutdown-confetti" aria-hidden="true">
            {CONFETTI_SEEDS.map((seed) => (
              <span
                key={seed}
                className="shutdown-confetti__piece"
                style={
                  {
                    "--i": seed,
                    "--size": `${10 + (seed % 4) * 3}px`,
                    "--spread-x": `${8 + ((seed * 11) % 84)}%`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        ) : null}

        <div className={styles.hero}>
          <span className={styles.badge}>HBX Fluxo Guiado</span>
          <div className={styles.orb} aria-hidden="true">
            <span className={styles.orbHalo} />
            <span className={styles.orbRing} />
            <span className={styles.orbRingSoft} />
            <span className={styles.orbCore} />
          </div>
          <div className={styles.copy}>
            <strong className={styles.title}>{notice.title}</strong>
            <p className={styles.description}>{notice.description}</p>
            {notice.phase === "loading" ? (
              <p key={notice.activityTick} className={styles.statusLine}>
                {statusLabel}
              </p>
            ) : null}
          </div>
        </div>

        <div className={styles.progressPanel}>
          <div className={styles.progressMeta}>
            <span>{progressLabel || (notice.phase === "loading" ? "Preparando rota" : "Rota pronta")}</span>
            <strong>
              {progressValueLabel || (notice.phase === "loading" ? `${visibleProgress}%` : "100%")}
            </strong>
          </div>
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={notice.phase === "loading" ? visibleProgress : 100}
          >
            <span className={styles.progressBar} style={{ width: `${notice.progress}%` }} />
          </div>
          {notice.phase === "loading" ? <span className={styles.progressPulse}>{statusLabel}</span> : null}
        </div>

        {detailRows && detailRows.length ? (
          <div className={styles.detailGrid}>
            {detailRows.map((row, index) => {
              const isActive = notice.phase === "success" || notice.progress >= 14 + index * detailActivationStep;
              return (
                <div
                  key={`${row.label}:${row.value}`}
                  className={styles.detailCard}
                  data-active={isActive ? "true" : "false"}
                >
                  <span>{row.label}</span>
                  {isActive ? (
                    <strong>{row.value}</strong>
                  ) : (
                    <strong className={styles.detailSkeleton}>Carregando</strong>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}

        <div className={styles.footer}>
          {notice.phase === "success" ? (
            <button type="button" className="btn btn-primary" onClick={onOpen}>
              {notice.ctaLabel}
            </button>
          ) : (
            <button type="button" className="btn btn-secondary" disabled>
              {loadingLabel}
            </button>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
