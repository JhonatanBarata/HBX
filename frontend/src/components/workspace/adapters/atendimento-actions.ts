import type { InboxConversation } from "@/app/dashboard/inbox/inbox-model";
import type { WorkspaceActionDescriptor } from "./types";

type AtendimentoMutableStatus = "new" | "open" | "closed";

export function buildAtendimentoRecoveryLinks(
  conversation: InboxConversation,
  allowRecoveryCapability = true,
): WorkspaceActionDescriptor[] {
  if (!allowRecoveryCapability || conversation.routeTarget !== "recovery") return [];

  return [
    {
      id: "atendimento-open-recovery",
      kind: "link",
      label: "Abrir Recovery",
      href: "/hbx-recovery?tab=messages",
      tone: "primary",
    },
    {
      id: "atendimento-open-payments",
      kind: "link",
      label: "Ver pagamentos",
      href: "/hbx-recovery?tab=payments",
      tone: "secondary",
    },
    {
      id: "atendimento-open-templates",
      kind: "link",
      label: "Templates Meta",
      href: "/hbx-recovery?tab=templates",
      tone: "secondary",
    },
  ];
}

export function buildAtendimentoContextActions(input: {
  conversation: InboxConversation;
  selectedStatus: AtendimentoMutableStatus | "blocked" | string;
  selectedBlocked: boolean;
  allowRecoveryCapability?: boolean;
  openAutomation: () => void;
  openAgenda: () => void;
  updateStatus: (nextStatus: AtendimentoMutableStatus) => void | Promise<void>;
  blockConversation: () => void;
  unblockConversation: () => void;
}): WorkspaceActionDescriptor[] {
  const {
    conversation,
    selectedStatus,
    selectedBlocked,
    allowRecoveryCapability = true,
    openAutomation,
    openAgenda,
    updateStatus,
    blockConversation,
    unblockConversation,
  } = input;

  const actions: WorkspaceActionDescriptor[] = [
    ...buildAtendimentoRecoveryLinks(conversation, allowRecoveryCapability),
    {
      id: "atendimento-open-automation",
      kind: "button",
      label: "Abrir automacao",
      tone: "secondary",
      onClick: openAutomation,
    },
    {
      id: "atendimento-open-agenda",
      kind: "button",
      label: "Abrir agenda",
      tone: "secondary",
      onClick: openAgenda,
    },
  ];

  if (!selectedBlocked) {
    actions.push(
      {
        id: "atendimento-assign-human",
        kind: "button",
        label: "Assumir humano",
        tone: selectedStatus === "open" ? "primary" : "secondary",
        onClick: () => updateStatus("open"),
      },
      {
        id: "atendimento-resume-bot",
        kind: "button",
        label: "Voltar ao bot",
        tone: selectedStatus === "new" ? "primary" : "secondary",
        onClick: () => updateStatus("new"),
      },
      {
        id: "atendimento-close-conversation",
        kind: "button",
        label: "Encerrar conversa",
        tone: selectedStatus === "closed" ? "primary" : "secondary",
        onClick: () => updateStatus("closed"),
      },
    );
  }

  actions.push(
    selectedBlocked
      ? {
          id: "atendimento-unblock-conversation",
          kind: "button",
          label: "Desbloquear contato",
          tone: "secondary",
          onClick: unblockConversation,
        }
      : {
          id: "atendimento-block-conversation",
          kind: "button",
          label: "Bloquear contato",
          tone: "danger",
          onClick: blockConversation,
        },
  );

  return actions;
}
