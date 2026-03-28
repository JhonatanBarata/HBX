"use client";

type SegmentedItem = {
  id: string;
  label: string;
};

type InboxV2SegmentedControlProps = {
  items: readonly SegmentedItem[];
  value: string;
  onChange: (nextValue: string) => void;
  className?: string;
  buttonClassName?: string;
  activeButtonClassName?: string;
  role?: string;
  buttonRole?: string;
  ariaLabel?: string;
};

export default function InboxV2SegmentedControl({
  items,
  value,
  onChange,
  className,
  buttonClassName,
  activeButtonClassName,
  role,
  buttonRole,
  ariaLabel,
}: InboxV2SegmentedControlProps) {
  return (
    <div className={className} role={role} aria-label={ariaLabel}>
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
