import { randomUUID } from 'crypto';

// Trilha ÚNICA de eventos do dono (MasterEvent) — COCKPIT-MASTER Sprint 1. Toda
// ocorrência que o MASTER precisa ver vira UM evento tipado e consultável, escrito
// EM PARALELO às trilhas antigas (write-through: MasterPaymentNotificationLog,
// MasterNotice e MasterSupportAuditLog continuam intactas). É a fundação dos
// alertas de falha do cockpit (Sprint 3).
//
// Best-effort POR CONTRATO (espelho do push-master-notice.ts): NUNCA lança,
// engole tudo — um evento que falha jamais pode derrubar uma venda, um alerta
// ou uma auditoria de quem chamou. Devolve o id inserido ou null.
//
// Dedup opcional por `dedupKey`: se o último evento com a mesma chave tem o mesmo
// `payload.state` (o estado não mudou) OU é mais novo que `dedupWindowMinutes`,
// não insere — evita metralhar a trilha com o mesmo fato repetido.

export type MasterEventSeverity = 'info' | 'attention' | 'action_required';

export type EmitMasterEventInput = {
  // tipo canônico do evento (ex.: 'sale.closed', 'implantacao.sold',
  // 'fullplan.requested', 'bot.config_missing', 'master_context.assumed').
  type: string;
  severity: MasterEventSeverity;
  companyId?: number | null;
  // chave de dedup (ex.: 'chip-down:42'); ausente = sempre insere.
  dedupKey?: string | null;
  // dados livres do evento; `payload.state` participa da dedup (ver acima).
  payload?: Record<string, unknown> | null;
  // janela de silêncio da dedup em minutos; 0/ausente = só compara payload.state.
  dedupWindowMinutes?: number;
};

const VALID_SEVERITIES = new Set(['info', 'attention', 'action_required']);

// Lê o `state` do payloadJson persistido — qualquer JSON quebrado vira "sem state"
// (dedup não pode explodir por lixo antigo na tabela).
function readPayloadState(payloadJson: unknown): unknown {
  if (!payloadJson) return undefined;
  try {
    const parsed = JSON.parse(String(payloadJson));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>).state : undefined;
  } catch {
    return undefined;
  }
}

// `prisma` é `any` de propósito: serve tanto o PrismaService quanto um tx.
// Client tipado do Prisma (masterEvent.create/findFirst) — NÃO $executeRaw.
export async function emitMasterEvent(
  prisma: any,
  input: EmitMasterEventInput,
): Promise<string | null> {
  try {
    const type = String(input?.type || '').trim().slice(0, 120);
    if (!type) return null;

    const severity = VALID_SEVERITIES.has(String(input?.severity)) ? String(input.severity) : 'info';
    const companyId = Math.trunc(Number(input?.companyId || 0)) || null;
    const dedupKey = input?.dedupKey ? String(input.dedupKey).slice(0, 180) : null;
    const payload = input?.payload && typeof input.payload === 'object' ? input.payload : null;
    const payloadJson = payload ? JSON.stringify(payload) : null;

    // Dedup: olha só o ÚLTIMO evento com a chave — é ele que representa o estado
    // atual conhecido; eventos mais antigos são história, não dedup.
    if (dedupKey) {
      const last = await prisma.masterEvent.findFirst({
        where: { dedupKey },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, payloadJson: true },
      });
      if (last) {
        const windowMinutes = Number(input?.dedupWindowMinutes) > 0 ? Number(input.dedupWindowMinutes) : 0;
        const lastCreatedAt = last.createdAt instanceof Date
          ? last.createdAt.getTime()
          : new Date(last.createdAt as any).getTime();
        const withinWindow =
          windowMinutes > 0 && Number.isFinite(lastCreatedAt) && Date.now() - lastCreatedAt < windowMinutes * 60_000;

        const nextState = payload ? payload.state : undefined;
        const lastState = readPayloadState(last.payloadJson);
        const sameState = nextState !== undefined && lastState !== undefined && String(nextState) === String(lastState);

        if (sameState || withinWindow) return null;
      }
    }

    const id = randomUUID();
    await prisma.masterEvent.create({
      data: { id, type, severity, companyId, dedupKey, payloadJson },
    });
    return id;
  } catch {
    // Best-effort por contrato: evento nunca derruba o fluxo de quem chamou.
    return null;
  }
}
