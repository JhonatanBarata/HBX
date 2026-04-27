"use client";

import styles from "./InlineLaunchNotice.module.css";

export type InlineLaunchNoticeState = {
  phase: "loading" | "success";
  progress: number;
  title: string;
  description: string;
  ctaLabel: string;
  statusLabel?: string;
  activityTick?: number;
};

type InlineLaunchNoticeProps = {
  notice: InlineLaunchNoticeState;
  onOpen: () => void;
  compact?: boolean;
};

export default function InlineLaunchNotice({ notice, onOpen, compact = false }: InlineLaunchNoticeProps) {
  return (
    <div
      className={styles.notice}
      data-phase={notice.phase}
      data-compact={compact ? "true" : "false"}
      role="status"
      aria-live="polite"
    >
      <div className={styles.noticeHeader}>
        <strong className={styles.noticeTitle}>{notice.title}</strong>
        <span className={styles.noticeMeta}>
          {notice.phase === "loading" ? `${notice.progress}%` : "Sucesso"}
        </span>
      </div>
      {notice.statusLabel ? <p className={styles.noticeDescription}>{notice.statusLabel}</p> : null}
      <p className={styles.noticeDescription}>{notice.description}</p>
      <div className={styles.progressTrack} aria-hidden="true">
        <span className={styles.progressBar} style={{ width: `${notice.progress}%` }} />
      </div>
      {notice.phase === "success" ? (
        <button type="button" className="btn btn-primary btn-sm" onClick={onOpen}>
          {notice.ctaLabel}
        </button>
      ) : null}
    </div>
  );
}
