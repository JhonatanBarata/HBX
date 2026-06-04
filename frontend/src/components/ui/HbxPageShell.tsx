import type { HTMLAttributes, ReactNode } from "react";
import styles from "./HbxAdminUi.module.css";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type HbxPageShellProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

export default function HbxPageShell({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
  ...props
}: HbxPageShellProps) {
  const hasHeader = Boolean(eyebrow || title || description || actions);

  return (
    <main className={cx(styles.pageShell, className)} {...props}>
      {hasHeader ? (
        <header className={styles.pageHeader}>
          <div className={styles.pageTitle}>
            {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
            {title ? <h1>{title}</h1> : null}
            {description ? <p className={styles.pageDescription}>{description}</p> : null}
          </div>
          {actions ? <div className={styles.actionBar}>{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </main>
  );
}
