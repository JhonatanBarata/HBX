"use client";

import type { CSSProperties } from "react";

type SegmentedItem = {
  id: string;
  label: string;
};

type WorkspaceSegmentedControlProps = {
  items: readonly SegmentedItem[];
  value: string;
  onChange: (nextValue: string) => void;
  className?: string;
  highlightClassName?: string;
  buttonClassName?: string;
  activeButtonClassName?: string;
  role?: string;
  buttonRole?: string;
  ariaLabel?: string;
};

export default function WorkspaceSegmentedControl({
  items,
  value,
  onChange,
  className,
  highlightClassName,
  buttonClassName,
  activeButtonClassName,
  role,
  buttonRole,
  ariaLabel,
}: WorkspaceSegmentedControlProps) {
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.id === value),
  );

  const trackStyle = {
    "--segment-count": String(Math.max(items.length, 1)),
    "--segment-index": String(activeIndex),
  } as CSSProperties;

  return (
    <div className={className} role={role} aria-label={ariaLabel} style={trackStyle}>
      {highlightClassName ? <div className={highlightClassName} aria-hidden="true" /> : null}
      {items.map((item) => {
        const active = item.id === value;
        const nextClassName = active
          ? [buttonClassName, activeButtonClassName].filter(Boolean).join(" ")
          : buttonClassName || undefined;

        return (
          <button
            key={item.id}
            type="button"
            role={buttonRole}
            aria-pressed={active}
            aria-selected={role === "tablist" ? active : undefined}
            data-active={active ? "true" : "false"}
            className={nextClassName}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
