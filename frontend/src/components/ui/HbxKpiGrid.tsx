import type { HTMLAttributes, ReactNode } from "react";
import styles from "./HbxAdminUi.module.css";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type HbxKpiGridProps = HTMLAttributes<HTMLDivElement> & {
  minColumnWidth?: string;
};

type HbxKpiCardProps = HTMLAttributes<HTMLElement> & {
  label: ReactNode;
  value: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  tone?: "default" | "brand" | "success" | "warning" | "danger";
};

export function HbxKpiGrid({ minColumnWidth = "180px", className, style, children, ...props }: HbxKpiGridProps) {
  return (
    <div
      className={cx(styles.kpiGrid, className)}
      style={{ ["--hbx-kpi-min" as string]: minColumnWidth, ...style }}
      {...props}
    >
      {children}
    </div>
  );
}

export function HbxKpiCard({
  label,
  value,
  description,
  meta,
  tone = "default",
  className,
  ...props
}: HbxKpiCardProps) {
  return (
    <article className={cx(styles.kpiCard, className)} data-tone={tone} {...props}>
      <span className={styles.kpiLabel}>{label}</span>
      <strong className={styles.kpiValue}>{value}</strong>
      {description ? <span className={styles.kpiDescription}>{description}</span> : null}
      {meta ? <span className={styles.kpiMeta}>{meta}</span> : null}
    </article>
  );
}

