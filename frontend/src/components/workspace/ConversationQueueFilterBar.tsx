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
  showArchived?: boolean;
  archivedLabel?: string;
  botSignalCounts?: {
    active: boolean;
    state?: "running" | "paused" | "error" | "idle" | "off";
    green: number;
    yellow: number;
    red: number;
    nextSendAt?: string | null;
    statusText?: string | null;
  };
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
  { value: "all", label: "Pessoais" },
  { value: "scheduled", label: "Atendimento" },
  { value: "bot", label: "Prospecção" },
  { value: "recovery", label: "Recovery" },
  { value: "groups", label: "Grupos" },
];

export default function ConversationQueueFilterBar({
  value,
  onChange,
  counts,
  unreadCounts,
  showArchived = false,
  archivedLabel = "Excluídos",
  botSignalCounts,
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
      {[...OPTIONS, ...(showArchived ? [{ value: "archived" as const, label: archivedLabel }] : [])].map((option) => {
        const active = value === option.value;
        const dropping = dropOverQueue === option.value;
        const unreadCount = Math.max(0, Math.trunc(Number(unreadCounts?.[option.value] || 0)));
        const botState =
          option.value === "bot"
            ? botSignalCounts?.state || (botSignalCounts?.active ? "running" : "idle")
            : undefined;
        const botStateLabel =
          botState === "running"
            ? "Ativa"
            : botState === "paused"
              ? "Pausada"
              : botState === "error"
                ? "Erro"
                : "Parada";
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-label={`${option.label}: ${option.value === "bot" ? botStateLabel : counts[option.value] || 0}${unreadCount > 0 ? `, ${unreadCount} não lida${unreadCount === 1 ? "" : "s"}` : ""}`}
            className={styles.queueCard}
            draggable={allowQueueCardDrag}
            data-active={active ? "true" : "false"}
            data-unread={unreadCount > 0 ? "true" : "false"}
            data-dropover={dropping ? "true" : "false"}
            data-dragging-source={draggedQueue === option.value ? "true" : "false"}
            data-tone={option.value}
            data-bot-state={botState}
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
            {option.value === "bot" && botSignalCounts ? (
              <span
                className={styles.signalBubbles}
                data-active={botSignalCounts.active ? "true" : "false"}
                aria-label={`Prospecção: ${botSignalCounts.green} verdes, ${botSignalCounts.yellow} amarelos, ${botSignalCounts.red} vermelhos`}
              >
                <i data-tone="green">{botSignalCounts.green}</i>
                <i data-tone="yellow">{botSignalCounts.yellow}</i>
                <i data-tone="red">{botSignalCounts.red}</i>
              </span>
            ) : null}
            {option.value !== "bot" ? <AnimatedQueueCount value={counts[option.value] || 0} /> : null}
            {option.value === "bot" && botSignalCounts?.nextSendAt ? (
              <NextProspectionCountdown targetAt={botSignalCounts.nextSendAt} />
            ) : null}
            {option.value === "bot" && botSignalCounts && !botSignalCounts.nextSendAt ? (
              <span className={styles.botStatePill} data-state={botState}>
                {botSignalCounts.statusText || botStateLabel}
              </span>
            ) : null}
            <span className={styles.receiveHint}>Solte aqui</span>
          </button>
        );
      })}
    </div>
  );
}

function formatCountdown(targetAt: string, now = Date.now()) {
  const target = new Date(targetAt).getTime();
  if (!Number.isFinite(target)) return null;
  const remainingMs = Math.max(0, target - now);
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function NextProspectionCountdown({ targetAt }: { targetAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const label = formatCountdown(targetAt, now);
  if (!label) return null;
  return (
    <span className={styles.nextProspectionTimer} aria-label={`Próxima prospecção em ${label}`}>
      <span className={styles.nextProspectionIcon} aria-hidden="true">
        <span />
      </span>
      <strong>{label}</strong>
    </span>
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
