import type { HTMLAttributes, ReactNode } from "react";
import styles from "./HbxAdminUi.module.css";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type HbxEmptyStateProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

export default function HbxEmptyState({
  title,
  description,
  actions,
  className,
  ...props
}: HbxEmptyStateProps) {
  return (
    <div className={cx(styles.emptyState, className)} role="status" {...props}>
      <strong>{title}</strong>
      {description ? <p className={styles.emptyDescription}>{description}</p> : null}
      {actions ? <div className={styles.emptyActions}>{actions}</div> : null}
    </div>
  );
}
