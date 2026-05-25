"use client";

import type { CSSProperties, ReactNode } from "react";
import styles from "./HbxGuide4.module.css";

export type HbxGuide4Item = {
  id: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
  disabled?: boolean;
  badge?: number | string | null;
  tone?: "default" | "success" | "danger" | "primary";
  onClick?: () => void;
};

type Props = {
  ariaLabel: string;
  topItems?: HbxGuide4Item[];
  navItems?: HbxGuide4Item[];
  bottomItems?: HbxGuide4Item[];
  className?: string;
  style?: CSSProperties;
};

function GuideButton({ item }: { item: HbxGuide4Item }) {
  const hasBadge = item.badge !== null && item.badge !== undefined && item.badge !== "" && item.badge !== 0;
  const commonProps = {
    className: `${styles.item} hbx-guide4__item hbx-tab-glide__item`,
    "data-active": item.active ? "true" : "false",
    "data-tone": item.tone || "default",
    "aria-label": item.label,
    title: item.label,
  } as const;

  if (!item.onClick) {
    return (
      <span {...commonProps} role="status">
        <span className={`${styles.icon} hbx-guide4__icon`}>{item.icon}</span>
        {hasBadge ? <span className={`${styles.badge} hbx-guide4__badge`}>{item.badge}</span> : null}
      </span>
    );
  }

  return (
    <button
      type="button"
      {...commonProps}
      disabled={item.disabled}
      onClick={item.onClick}
    >
      <span className={`${styles.icon} hbx-guide4__icon`}>{item.icon}</span>
      {hasBadge ? <span className={`${styles.badge} hbx-guide4__badge`}>{item.badge}</span> : null}
    </button>
  );
}

function GuideSection({ items }: { items?: HbxGuide4Item[] }) {
  if (!items?.length) return null;
  return (
    <div className={styles.section}>
      {items.map((item) => (
        <GuideButton key={item.id} item={item} />
      ))}
    </div>
  );
}

export default function HbxGuide4({
  ariaLabel,
  topItems,
  navItems,
  bottomItems,
  className,
  style,
}: Props) {
  return (
    <aside className={`${styles.guide} hbx-guide4 ${className || ""}`} style={style} aria-label={ariaLabel}>
      <GuideSection items={topItems} />
      <GuideSection items={navItems} />
      <div className={styles.spacer} aria-hidden="true" />
      <GuideSection items={bottomItems} />
    </aside>
  );
}
