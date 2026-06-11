import type { HTMLAttributes, ReactNode } from "react";
import styles from "./HbxAdminUi.module.css";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type HbxToastProps = HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  description?: ReactNode;
  tone?: "info" | "success" | "warning" | "danger";
  action?: ReactNode;
};

export default function HbxToast({
  title,
  description,
  tone = "info",
  action,
  className,
  ...props
}: HbxToastProps) {
  return (
    <div className={cx(styles.toast, className)} data-tone={tone} role="status" aria-live="polite" {...props}>
      <div className={styles.toastCopy}>
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className={styles.toastAction}>{action}</div> : null}
    </div>
  );
}

