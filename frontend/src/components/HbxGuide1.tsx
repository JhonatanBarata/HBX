"use client";

import type { CSSProperties, ReactNode } from "react";
import styles from "./HbxGuide1.module.css";

export type HbxGuide1Tab<T extends string> = {
  key: T;
  label: string;
  badge?: ReactNode;
  admin?: boolean;
};

type HbxGuide1Props<T extends string> = {
  tabs: readonly HbxGuide1Tab<T>[];
  activeKey: T;
  ariaLabel: string;
  onChange: (key: T) => void;
};

export default function HbxGuide1<T extends string>({
  tabs,
  activeKey,
  ariaLabel,
  onChange,
}: HbxGuide1Props<T>) {
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.key === activeKey));
  const style = {
    "--hbx-guide1-count": tabs.length,
    "--hbx-guide1-index": activeIndex,
  } as CSSProperties;

  return (
    <nav className={`${styles.guide} hbx-guide1 hbx-tab-glide`} style={style} aria-label={ariaLabel} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`${styles.tab} hbx-guide1__tab hbx-tab-glide__item`}
          data-active={activeKey === tab.key ? "true" : "false"}
          data-admin={tab.admin ? "true" : "false"}
          onClick={() => onChange(tab.key)}
          role="tab"
          aria-selected={activeKey === tab.key}
        >
          <span>{tab.label}</span>
          {tab.badge !== undefined && tab.badge !== null ? <b>{tab.badge}</b> : null}
        </button>
      ))}
    </nav>
  );
}
