import type { HTMLAttributes, ReactNode } from "react";
import styles from "./HbxAdminUi.module.css";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type HbxStatCardProps = HTMLAttributes<HTMLElement> & {
  label: ReactNode;
  value: ReactNode;
  description?: ReactNode;
  tone?: "default" | "success" | "warning";
};

export default function HbxStatCard({
  label,
  value,
  description,
  tone = "default",
  className,
  ...props
}: HbxStatCardProps) {
  return (
    <article className={cx(styles.statCard, className)} data-tone={tone} {...props}>
      <span className={styles.statLabel}>{label}</span>
      <strong className={styles.statValue}>{value}</strong>
      {description ? <span className={styles.statDescription}>{description}</span> : null}
    </article>
  );
}
