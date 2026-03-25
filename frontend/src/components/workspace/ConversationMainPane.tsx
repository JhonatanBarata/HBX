"use client";

import type { ReactNode } from "react";
import { ChatDockPanel } from "@/components/chat/PremiumChat";

type ConversationMainPaneProps = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  count?: ReactNode;
  className?: string;
  bodyClassName?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export default function ConversationMainPane({
  eyebrow,
  title,
  description,
  count,
  className,
  bodyClassName,
  actions,
  children,
}: ConversationMainPaneProps) {
  return (
    <ChatDockPanel
      eyebrow={eyebrow}
      title={title}
      description={description}
      count={count}
      actions={actions}
      className={className}
      bodyClassName={bodyClassName}
    >
      {children}
    </ChatDockPanel>
  );
}
