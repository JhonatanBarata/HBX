"use client";

import WorkspaceSegmentedControl from "./workspace/WorkspaceSegmentedControl";
import styles from "./LiquidGlassSegmentedControl.module.css";

type LiquidGlassSegmentedControlProps<TValue extends string> = {
  items: ReadonlyArray<{ id: TValue; label: string }>;
  value: TValue;
  onChange: (value: TValue) => void;
  ariaLabel: string;
};

export default function LiquidGlassSegmentedControl<TValue extends string>({
  items,
  value,
  onChange,
  ariaLabel,
}: LiquidGlassSegmentedControlProps<TValue>) {
  return (
    <WorkspaceSegmentedControl
      items={items}
      value={value}
      onChange={(nextValue) => onChange(nextValue as TValue)}
      className={styles.root}
      highlightClassName={styles.highlight}
      buttonClassName={styles.button}
      activeButtonClassName={styles.buttonActive}
      role="tablist"
      buttonRole="tab"
      ariaLabel={ariaLabel}
    />
  );
}