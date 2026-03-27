"use client";

import styles from "./ConversationQueueFilterBar.module.css";

type ConversationQueueFilterValue = "all" | "recovery" | "scheduled" | "bot" | "closed" | "blocked";

type ConversationQueueFilterBarProps = {
  value: ConversationQueueFilterValue;
  onChange: (value: ConversationQueueFilterValue) => void;
};

const PRIMARY_OPTIONS: Array<{ value: ConversationQueueFilterValue; label: string }> = [
  { value: "all", label: "Chat" },
  { value: "closed", label: "Encerrados" },
  { value: "blocked", label: "Bloqueados" },
];

const SECONDARY_OPTIONS: Array<{ value: Exclude<ConversationQueueFilterValue, "closed">; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "recovery", label: "Recovery" },
  { value: "scheduled", label: "Agendamento" },
  { value: "bot", label: "BOT" },
];

export default function ConversationQueueFilterBar({
  value,
  onChange,
}: ConversationQueueFilterBarProps) {
  const closedView = value === "closed" || value === "blocked";
  const activeSecondaryValue = closedView ? "all" : value;

  return (
    <div className={styles.filterBar}>
      <div className={styles.primaryRow} role="tablist" aria-label="Visao principal da fila">
        {PRIMARY_OPTIONS.map((option) => {
          const active =
            option.value === "closed"
              ? value === "closed"
              : option.value === "blocked"
                ? value === "blocked"
                : !closedView;
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={active}
              className={active ? styles.primaryButtonActive : styles.primaryButton}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {!closedView ? (
        <div className={styles.secondaryRow} role="tablist" aria-label="Filtros secundarios do chat">
          {SECONDARY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={activeSecondaryValue === option.value}
              className={
                activeSecondaryValue === option.value
                  ? styles.secondaryButtonActive
                  : styles.secondaryButton
              }
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
