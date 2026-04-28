import type { InboxConversation } from "@/app/dashboard/inbox/inbox-model";
import { hasAtendimentoRecoveryContext } from "./atendimento-data";
import type { WorkspaceActionDescriptor } from "./types";

type AtendimentoMutableStatus = "new" | "open" | "closed";

export function buildAtendimentoRecoveryLinks(
  conversation: InboxConversation,
  openFinance: () => void,
  allowRecoveryCapability = true,
): WorkspaceActionDescriptor[] {
  if (!allowRecoveryCapability || !hasAtendimentoRecoveryContext(conversation)) return [];

  return [
    {
      id: "atendimento-open-recovery",
      kind: "button",
      label: "Financeiro",
      onClick: openFinance,
      tone: "primary",
    },
  ];
}

export function buildAtendimentoContextActions(input: {
  conversation: InboxConversation;
  selectedStatus: AtendimentoMutableStatus | "blocked" | string;
  selectedBlocked: boolean;
  allowRecoveryCapability?: boolean;
  openFinance: () => void;
  openAutomation: () => void;
  openAgenda: () => void;
  updateStatus: (nextStatus: AtendimentoMutableStatus) => void | Promise<void>;
  closeConversation: () => void | Promise<void>;
  blockConversation: () => void;
  unblockConversation: () => void;
}): WorkspaceActionDescriptor[] {
  const {
    conversation,
    selectedStatus,
    selectedBlocked,
    allowRecoveryCapability = true,
    openFinance,
    openAutomation,
    openAgenda,
    updateStatus,
    closeConversation,
    blockConversation,
    unblockConversation,
  } = input;

  const actions: WorkspaceActionDescriptor[] = [
    ...buildAtendimentoRecoveryLinks(conversation, openFinance, allowRecoveryCapability),
    {
      id: "atendimento-open-automation",
      kind: "button",
      label: "Automacao",
      tone: "secondary",
      onClick: openAutomation,
    },
    {
      id: "atendimento-open-agenda",
      kind: "button",
      label: "Agenda",
      tone: "secondary",
      onClick: openAgenda,
    },
  ];

  if (!selectedBlocked) {
    actions.push(
      {
        id: "atendimento-assign-human",
        kind: "button",
        label: "Assumir",
        tone: selectedStatus === "open" ? "primary" : "secondary",
        onClick: () => updateStatus("open"),
      },
      {
        id: "atendimento-resume-bot",
        kind: "button",
        label: "Bot",
        tone: selectedStatus === "new" ? "primary" : "secondary",
        onClick: () => updateStatus("new"),
      },
      {
        id: "atendimento-close-conversation",
        kind: "button",
        label: "Encerrar",
        tone: selectedStatus === "closed" ? "primary" : "secondary",
        onClick: closeConversation,
      },
    );
  }

  actions.push(
    selectedBlocked
      ? {
          id: "atendimento-unblock-conversation",
          kind: "button",
          label: "Desbloquear",
          tone: "secondary",
          onClick: unblockConversation,
        }
      : {
          id: "atendimento-block-conversation",
          kind: "button",
          label: "Bloquear",
          tone: "danger",
          onClick: blockConversation,
        },
  );

  return actions;
}
