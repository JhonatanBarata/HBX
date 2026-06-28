import { randomUUID } from 'crypto';

// Aviso in-app do SINO (MasterNotice), inserido pelo PRÓPRIO sistema — não por um
// UserMaster via rota (essa exige `canManageMasterNotices`). Mesma mesa que o sino
// já lê (`/vendas/master-notices`), mesmo padrão $executeRaw do HbxPulseService.
//
// Camada 2 (Onboarding — FECHAMENTO → COMISSÃO → MASTER): é por aqui que o dono
// recebe "Venda fechada" no momento e o vendedor recebe "Comissão confirmada"
// quando o cliente ativa. Best-effort por contrato: NUNCA lança (engole tudo) —
// um aviso que falha jamais pode derrubar um fechamento ou um sync de comissão.
//
// Dedup opcional por `nudgeKey`: se já existe um aviso VIVO com a mesma key na
// empresa, não duplica (re-gerar o link da mesma venda não enche o sino).

export type PushMasterNoticeAudience = 'seller' | 'customer';
export type PushMasterNoticeTone = 'info' | 'success' | 'warning' | 'urgent';

export type PushMasterNoticeInput = {
  companyId: number;
  audience: PushMasterNoticeAudience;
  title: string;
  body: string;
  tone?: PushMasterNoticeTone;
  // origem do aviso (livre); o sino usa só pra distinguir o recado do brain.
  source?: string;
  // null/0 = broadcast pra audiência; preenchido = recado pessoal (1 vendedor).
  targetUserId?: number | null;
  // CTA do sino (ex.: { kind:'venda', href:'/vendas', leadId }).
  payload?: Record<string, unknown> | null;
  // chave de dedup (1 aviso vivo por chave/empresa).
  nudgeKey?: string | null;
  // janela "forçada" (modal) em segundos; 0 = aviso comum no sino.
  forceSeconds?: number;
  // validade do aviso; default 14 dias.
  ttlHours?: number;
};

const VALID_TONES = new Set(['info', 'success', 'warning', 'urgent']);

// `prisma` é `any` de propósito: serve tanto o PrismaService quanto um tx.
export async function pushMasterNotice(
  prisma: any,
  input: PushMasterNoticeInput,
): Promise<string | null> {
  try {
    const companyId = Math.trunc(Number(input?.companyId || 0));
    if (!companyId) return null;

    const title = String(input?.title || '').trim();
    const body = String(input?.body || '').trim();
    if (!title || !body) return null;

    const audience: PushMasterNoticeAudience = input?.audience === 'customer' ? 'customer' : 'seller';
    const tone = VALID_TONES.has(String(input?.tone)) ? String(input?.tone) : 'success';
    const source = String(input?.source || 'system').slice(0, 60);
    const targetUserId = Math.trunc(Number(input?.targetUserId || 0)) || null;
    const nudgeKey = input?.nudgeKey ? String(input.nudgeKey).slice(0, 180) : null;
    const forceSeconds = Math.max(0, Math.min(120, Math.trunc(Number(input?.forceSeconds || 0)) || 0));
    const ttlHours = Number(input?.ttlHours) > 0 ? Number(input.ttlHours) : 24 * 14;
    const payloadJson = input?.payload ? JSON.stringify(input.payload) : null;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

    // Dedup: já existe aviso vivo com a mesma chave nesta empresa? não duplica.
    if (nudgeKey) {
      const existing = await prisma.$queryRaw`
        SELECT "id" FROM "MasterNotice"
        WHERE "companyId" = ${companyId}
          AND "nudgeKey" = ${nudgeKey}
          AND ("expiresAt" IS NULL OR "expiresAt" >= ${now})
        LIMIT 1
      `;
      if (Array.isArray(existing) && existing.length > 0) return null;
    }

    const id = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "MasterNotice" (
        "id", "companyId", "audience", "title", "body", "tone",
        "forceSeconds", "startsAt", "expiresAt", "createdByUserId",
        "source", "targetUserId", "nudgeKey", "payloadJson",
        "createdAt", "updatedAt"
      ) VALUES (
        ${id}, ${companyId}, ${audience}, ${title}, ${body}, ${tone},
        ${forceSeconds}, ${now}, ${expiresAt}, ${null}::integer,
        ${source}, ${targetUserId}::integer, ${nudgeKey}, ${payloadJson},
        ${now}, ${now}
      )
    `;
    return id;
  } catch {
    // Best-effort por contrato: aviso nunca derruba o fluxo de quem chamou.
    return null;
  }
}
