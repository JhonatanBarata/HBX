import type { ComponentProps } from "react";
import { ChatBadge } from "@/components/chat/PremiumChat";

export type WorkspaceBadgeTone = NonNullable<ComponentProps<typeof ChatBadge>["tone"]>;

export type WorkspaceBadgeDescriptor = {
  label: string;
  tone: WorkspaceBadgeTone;
};

export type WorkspaceQueueTone = "brand" | "teal" | "info" | "purple" | "success" | "amber" | "danger" | "muted";

export type WorkspaceSummaryDescriptor = {
  label: string;
  value: string;
};

export type WorkspaceLinkDescriptor = {
  label: string;
  href: string;
  tone: "primary" | "secondary";
};

export type WorkspaceActionDescriptor =
  | {
      id: string;
      kind: "link";
      label: string;
      href: string;
      tone: "primary" | "secondary";
    }
  | {
      id: string;
      kind: "button";
      label: string;
      tone: "primary" | "secondary" | "danger";
      onClick: () => void;
      disabled?: boolean;
    };
