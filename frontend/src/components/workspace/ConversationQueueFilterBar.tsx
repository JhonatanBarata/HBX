"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ConversationQueueFilterBar.module.css";

export type ConversationQueueFilterValue =
  | "all"
  | "archived"
  | "groups"
  | "recovery"
  | "scheduled"
  | "bot";

type ConversationQueueFilterBarProps = {
  value: ConversationQueueFilterValue;
  onChange: (value: ConversationQueueFilterValue) => void;
  counts: Record<ConversationQueueFilterValue, number>;
  dropOverQueue: ConversationQueueFilterValue | null;
  onQueueDragOver: (queue: ConversationQueueFilterValue) => void;
  onQueueDragLeave: () => void;
  onQueueDrop: (queue: ConversationQueueFilterValue) => void;
};

const OPTIONS: Array<{ value: ConversationQueueFilterValue; label: string }> = [
  { value: "all", label: "Conversas" },
  { value: "archived", label: "Excluídos" },
  { value: "groups", label: "Grupos" },
  { value: "recovery", label: "Recovery" },
  { value: "scheduled", label: "Agendamento" },
  { value: "bot", label: "BOT" },
];

export default function ConversationQueueFilterBar({
  value,
  onChange,
  counts,
  dropOverQueue,
  onQueueDragOver,
  onQueueDragLeave,
  onQueueDrop,
}: ConversationQueueFilterBarProps) {
  return (
    <div className={styles.filterBar} role="tablist" aria-label="Filas de conversa">
      {OPTIONS.map((option) => {
        const active = value === option.value;
        const dropping = dropOverQueue === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            className={styles.queueCard}
            data-active={active ? "true" : "false"}
            data-dropover={dropping ? "true" : "false"}
            data-tone={option.value}
            onClick={() => onChange(option.value)}
            onDragOver={(event) => {
              event.preventDefault();
              onQueueDragOver(option.value);
            }}
            onDragLeave={() => onQueueDragLeave()}
            onDrop={(event) => {
              event.preventDefault();
              onQueueDrop(option.value);
            }}
          >
            <span className={styles.queueTitle}>{option.label}</span>
            <AnimatedQueueCount value={counts[option.value] || 0} />
            <span className={styles.receiveHint}>Solte aqui</span>
          </button>
        );
      })}
    </div>
  );
}

function AnimatedQueueCount({ value }: { value: number }) {
  const [displayed, setDisplayed] = useState(value);
  const [rolling, setRolling] = useState(false);
  const prevRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (prevRef.current === value) return;
    const from = prevRef.current;
    const to = value;
    prevRef.current = value;
    const diff = Math.abs(to - from);
    const duration = Math.max(240, Math.min(560, 220 + diff * 10));
    const startTime = performance.now();
    let rollingStarted = false;

    const tick = (now: number) => {
      if (!rollingStarted) {
        rollingStarted = true;
        setRolling(true);
      }
      const progress = Math.min((now - startTime) / duration, 1);
      const eased =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      const current = Math.round(from + (to - from) * eased);
      setDisplayed(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayed(to);
        setRolling(false);
      }
    };

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  return (
    <strong className={styles.queueCount} data-rolling={rolling ? "true" : "false"}>
      {displayed}
    </strong>
  );
}
