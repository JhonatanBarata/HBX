import type { HTMLAttributes, ReactNode } from "react";
import styles from "./HbxAdminUi.module.css";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type HbxPersistentNoticeProps = HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  description?: ReactNode;
  tone?: "info" | "success" | "warning" | "danger";
  action?: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
};

export default function HbxPersistentNotice({
  title,
  description,
  tone = "info",
  action,
  onDismiss,
  dismissLabel = "Dispensar aviso",
  className,
  ...props
}: HbxPersistentNoticeProps) {
  return (
    <div className={cx(styles.persistentNotice, className)} data-tone={tone} role="status" {...props}>
      <span className={styles.noticeMark} aria-hidden="true" />
      <div className={styles.noticeCopy}>
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className={styles.noticeAction}>{action}</div> : null}
      {onDismiss ? (
        <button type="button" className={styles.noticeDismiss} onClick={onDismiss} aria-label={dismissLabel}>
          ×
        </button>
      ) : null}
    </div>
  );
}

