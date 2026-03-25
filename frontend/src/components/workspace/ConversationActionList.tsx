"use client";

import Link from "next/link";
import { ChatActionButton } from "@/components/chat/PremiumChat";
import type { WorkspaceActionDescriptor } from "./adapters/types";

type ConversationActionListProps = {
  actions: WorkspaceActionDescriptor[];
};

export default function ConversationActionList({ actions }: ConversationActionListProps) {
  return (
    <>
      {actions.map((action) =>
        action.kind === "link" ? (
          <Link key={action.id} href={action.href} className={`btn btn-${action.tone} btn-sm`}>
            {action.label}
          </Link>
        ) : (
          <ChatActionButton
            key={action.id}
            type="button"
            className={`btn btn-${action.tone} btn-sm`}
            onClick={action.onClick}
            disabled={action.disabled}
          >
            {action.label}
          </ChatActionButton>
        ),
      )}
    </>
  );
}
