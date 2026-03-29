"use client";

import Link from "next/link";
import { ChatActionButton, ChatGlyph } from "@/components/chat/PremiumChat";
import type { WorkspaceActionDescriptor } from "./adapters/types";
import styles from "./ConversationActionList.module.css";

type ConversationActionListProps = {
  actions: WorkspaceActionDescriptor[];
};

function getActionIcon(actionId: string) {
  if (actionId.includes("recovery") || actionId.includes("finance")) return "spark" as const;
  if (actionId.includes("automation")) return "gear" as const;
  if (actionId.includes("agenda")) return "clock" as const;
  if (actionId.includes("assign")) return "user" as const;
  if (actionId.includes("resume-bot")) return "spark" as const;
  if (actionId.includes("close")) return "note" as const;
  if (actionId.includes("block")) return "shield" as const;
  if (actionId.includes("unblock")) return "shield" as const;
  return "spark" as const;
}

export default function ConversationActionList({ actions }: ConversationActionListProps) {
  return (
    <>
      {actions.map((action) => {
        const icon = getActionIcon(action.id);
        const className = [
          `btn btn-${action.tone} btn-sm`,
          styles.actionButton,
          action.tone === "danger" ? styles.actionButtonDanger : "",
        ]
          .filter(Boolean)
          .join(" ");

        const content = (
          <>
            <span className={styles.actionIcon}>
              <ChatGlyph name={icon} />
            </span>
            <span className={styles.actionLabel}>{action.label}</span>
          </>
        );

        return action.kind === "link" ? (
          <Link key={action.id} href={action.href} className={className}>
            {content}
          </Link>
        ) : (
          <ChatActionButton
            key={action.id}
            type="button"
            className={className}
            onClick={action.onClick}
            disabled={action.disabled}
          >
            {content}
          </ChatActionButton>
        );
      })}
    </>
  );
}
