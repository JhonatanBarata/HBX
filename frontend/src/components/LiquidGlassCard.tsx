import { createElement, type ElementType, type HTMLAttributes, type ReactNode } from "react";
import styles from "./LiquidGlassCard.module.css";

export const liquidGlassCardStyles = styles;

export type LiquidGlassAccentTone = "brand" | "success" | "info" | "warning" | "danger";

type LiquidGlassCardProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  accentTone?: LiquidGlassAccentTone;
  header: ReactNode;
  chips?: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  highlight?: ReactNode;
  metrics?: ReactNode;
  footer?: ReactNode;
};

function joinClasses(...values: Array<string | null | false | undefined>) {
  return values.filter(Boolean).join(" ");
}

export default function LiquidGlassCard({
  as = "div",
  className,
  accentTone = "brand",
  header,
  chips,
  lead,
  actions,
  highlight,
  metrics,
  footer,
  children,
  ...rest
}: LiquidGlassCardProps) {
  return createElement(
    as,
    {
      ...rest,
      className: joinClasses(styles.card, className),
      "data-accent-tone": accentTone,
      "data-liquid-glass-card": "true",
    },
    <>
      <span className={styles.accentRail} aria-hidden="true" />
      <span className={styles.glow} aria-hidden="true" />
      <div className={styles.inner}>
        <div className={styles.header}>{header}</div>
        {chips ? <div className={styles.chips}>{chips}</div> : null}
        {lead ? <div className={styles.lead}>{lead}</div> : null}
        {actions ? <div className={styles.actions}>{actions}</div> : null}
        {highlight ? <div className={styles.highlight}>{highlight}</div> : null}
        {metrics ? <div className={styles.metrics}>{metrics}</div> : null}
        {footer ? <div className={styles.footer}>{footer}</div> : null}
        {children ? <div className={styles.extra}>{children}</div> : null}
      </div>
    </>,
  );
}