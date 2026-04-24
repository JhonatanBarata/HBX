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
  unreadCounts?: Partial<Record<ConversationQueueFilterValue, number>>;
  dropOverQueue: ConversationQueueFilterValue | null;
  allowQueueCardDrag?: boolean;
  draggedQueue?: ConversationQueueFilterValue | null;
  onQueueDragOver: (queue: ConversationQueueFilterValue) => void;
  onQueueDragLeave: () => void;
  onQueueDrop: (queue: ConversationQueueFilterValue) => void;
  onQueueCardDragStart?: (queue: ConversationQueueFilterValue) => void;
  onQueueCardDragEnd?: () => void;
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
  unreadCounts,
  dropOverQueue,
  allowQueueCardDrag = false,
  draggedQueue = null,
  onQueueDragOver,
  onQueueDragLeave,
  onQueueDrop,
  onQueueCardDragStart,
  onQueueCardDragEnd,
}: ConversationQueueFilterBarProps) {
  const filterBarRef = useRef<HTMLDivElement | null>(null);

  const resolveQueueFromPointer = (clientX: number, clientY: number) => {
    const root = filterBarRef.current;
    if (!root) return null;

    const cards = Array.from(root.querySelectorAll<HTMLButtonElement>(`[data-queue-value="true"]`));
    if (!cards.length) return null;

    let nearestQueue: ConversationQueueFilterValue | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
      const queue = card.dataset.queue as ConversationQueueFilterValue | undefined;
      if (!queue) continue;
      if (inside) return queue;

      const dx = clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0;
      const dy = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
      const distance = dx * dx + dy * dy;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestQueue = queue;
      }
    }

    return nearestQueue;
  };

  return (
    <div
      ref={filterBarRef}
      className={styles.filterBar}
      role="tablist"
      aria-label="Filas de conversa"
      onDragOver={(event) => {
        event.preventDefault();
        const queue = resolveQueueFromPointer(event.clientX, event.clientY);
        if (queue) onQueueDragOver(queue);
      }}
      onDragLeave={(event) => {
        const relatedTarget = event.relatedTarget;
        if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) return;
        onQueueDragLeave();
      }}
      onDrop={(event) => {
        event.preventDefault();
        const queue = resolveQueueFromPointer(event.clientX, event.clientY) || dropOverQueue;
        if (queue) onQueueDrop(queue);
      }}
    >
      {OPTIONS.map((option) => {
        const active = value === option.value;
        const dropping = dropOverQueue === option.value;
        const unreadCount = Math.max(0, Math.trunc(Number(unreadCounts?.[option.value] || 0)));
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-label={`${option.label}: ${counts[option.value] || 0}${unreadCount > 0 ? `, ${unreadCount} não lida${unreadCount === 1 ? "" : "s"}` : ""}`}
            className={styles.queueCard}
            draggable={allowQueueCardDrag}
            data-active={active ? "true" : "false"}
            data-unread={unreadCount > 0 ? "true" : "false"}
            data-dropover={dropping ? "true" : "false"}
            data-dragging-source={draggedQueue === option.value ? "true" : "false"}
            data-tone={option.value}
            data-queue-value="true"
            data-queue={option.value}
            onClick={() => onChange(option.value)}
            onDragStart={(event) => {
              if (!allowQueueCardDrag) return;
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", `queue:${option.value}`);
              onQueueCardDragStart?.(option.value);
            }}
            onDragEnd={() => {
              onQueueCardDragEnd?.();
            }}
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
            {unreadCount > 0 ? <span className={styles.unreadBadge}>{unreadCount}</span> : null}
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
