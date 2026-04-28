import type { WorkspaceActionDescriptor } from "./types";

type RecoveryQuickActionId =
  | "assign_human"
  | "pause_bot"
  | "resume_bot"
  | "generate_cash_link"
  | "generate_credit_link"
  | "resend_link"
  | "request_proof"
  | "mark_paid"
  | "reopen_interaction"
  | "block_interaction"
  | "unblock_interaction"
  | "close_interaction";

export function buildRecoveryQuickActions(input: {
  conversationId: number;
  isBusy: (conversationId: number, actionId: RecoveryQuickActionId) => boolean;
  runAction: (conversationId: number, actionId: RecoveryQuickActionId) => void | Promise<void>;
}): WorkspaceActionDescriptor[] {
  const { conversationId, isBusy, runAction } = input;

  const createAction = (
    id: RecoveryQuickActionId,
    label: string,
    tone: "primary" | "secondary" | "danger",
  ): WorkspaceActionDescriptor => ({
    id: `recovery-${id}`,
    kind: "button",
    label,
    tone,
    onClick: () => runAction(conversationId, id),
    disabled: isBusy(conversationId, id),
  });

  return [
    createAction("assign_human", "Assumir atendimento", "secondary"),
    createAction("pause_bot", "Pausar Bot", "secondary"),
    createAction("resume_bot", "Reativar Bot", "secondary"),
    createAction("generate_cash_link", "Gerar link a vista", "primary"),
    createAction("generate_credit_link", "Pagar no credito", "primary"),
    createAction("block_interaction", "Bloquear cliente", "danger"),
  ];
}
