"use client";

type ConversationQueueFilterValue = "all" | "closed" | "blocked";

type ConversationQueueFilterBarProps = {
  value: ConversationQueueFilterValue;
  onChange: (value: ConversationQueueFilterValue) => void;
};

const FILTER_OPTIONS: Array<{ value: ConversationQueueFilterValue; label: string }> = [
  { value: "all", label: "Conversas" },
  { value: "closed", label: "Conversas encerradas" },
  { value: "blocked", label: "Clientes bloqueados" },
];

export default function ConversationQueueFilterBar({
  value,
  onChange,
}: ConversationQueueFilterBarProps) {
  return (
    <>
      {FILTER_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`btn btn-sm ${value === option.value ? "btn-primary" : "btn-secondary"}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </>
  );
}
