"use client";

import { ChatBadge } from "@/components/chat/PremiumChat";
import type { WorkspaceBadgeDescriptor } from "./adapters/types";

type ConversationBadgeListProps = {
  badges: WorkspaceBadgeDescriptor[];
};

export default function ConversationBadgeList({ badges }: ConversationBadgeListProps) {
  return (
    <>
      {badges.map((badge) => (
        <ChatBadge key={`${badge.tone}:${badge.label}`} tone={badge.tone}>
          {badge.label}
        </ChatBadge>
      ))}
    </>
  );
}
