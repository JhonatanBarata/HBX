export type MobileActionKind = 'call' | 'whatsapp';
export type MobileActionEvent =
  | 'delivered'
  | 'opened'
  | 'external_started'
  | 'returned'
  | 'completed'
  | 'canceled'
  | 'failed';

const STATUS_BY_EVENT: Record<MobileActionEvent, string> = {
  delivered: 'delivered',
  opened: 'opened',
  external_started: 'started',
  returned: 'returned',
  completed: 'completed',
  canceled: 'canceled',
  failed: 'failed',
};

const ALLOWED_TARGETS: Record<string, ReadonlySet<string>> = {
  queued: new Set(['delivered']),
  delivering: new Set(['delivered', 'failed']),
  delivered: new Set(['opened', 'failed']),
  opened: new Set(['started', 'canceled', 'failed']),
  started: new Set(['returned', 'failed']),
  returned: new Set(['completed', 'canceled', 'failed']),
};

const RESULTS_BY_KIND: Record<MobileActionKind, ReadonlySet<string>> = {
  call: new Set(['atendeu', 'nao_atendeu', 'retornar', 'sem_interesse']),
  whatsapp: new Set(['mensagem_enviada', 'nao_enviada', 'retornar']),
};

export function mobileActionStatusForEvent(event: MobileActionEvent) {
  return STATUS_BY_EVENT[event];
}

export function canApplyMobileActionEvent(currentStatus: string, event: MobileActionEvent) {
  const targetStatus = mobileActionStatusForEvent(event);
  if (currentStatus === targetStatus) {
    return !['completed', 'canceled', 'failed'].includes(currentStatus);
  }
  return ALLOWED_TARGETS[currentStatus]?.has(targetStatus) === true;
}

export function isValidMobileActionResult(
  kind: MobileActionKind,
  event: MobileActionEvent,
  result: string | null,
) {
  if (event !== 'completed') return result === null;
  return result !== null && RESULTS_BY_KIND[kind].has(result);
}
