"use client";

import WorkspaceSegmentedControl from "./WorkspaceSegmentedControl";
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

const PRIMARY_SEGMENTS = PRIMARY_OPTIONS.map((option) => ({
  id: option.value,
  label: option.label,
}));

const SECONDARY_SEGMENTS = SECONDARY_OPTIONS.map((option) => ({
  id: option.value,
  label: option.label,
}));

export default function ConversationQueueFilterBar({
  value,
  onChange,
}: ConversationQueueFilterBarProps) {
  const closedView = value === "closed" || value === "blocked";
  const activeSecondaryValue = closedView ? "all" : value;

  return (
    <div className={styles.filterBar}>
      <WorkspaceSegmentedControl
        items={PRIMARY_SEGMENTS}
        value={value === "closed" || value === "blocked" ? value : "all"}
        onChange={(nextValue) => onChange(nextValue as ConversationQueueFilterValue)}
        className={styles.primaryRow}
        highlightClassName={styles.primaryHighlight}
        buttonClassName={styles.primaryButton}
        activeButtonClassName={styles.primaryButtonActive}
        role="tablist"
        buttonRole="tab"
        ariaLabel="Visao principal da fila"
      />

      {!closedView ? (
        <WorkspaceSegmentedControl
          items={SECONDARY_SEGMENTS}
          value={activeSecondaryValue}
          onChange={(nextValue) => onChange(nextValue as ConversationQueueFilterValue)}
          className={styles.secondaryRow}
          highlightClassName={styles.secondaryHighlight}
          buttonClassName={styles.secondaryButton}
          activeButtonClassName={styles.secondaryButtonActive}
          role="tablist"
          buttonRole="tab"
          ariaLabel="Filtros secundarios do chat"
        />
      ) : null}
    </div>
  );
}
