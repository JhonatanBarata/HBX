import { Injectable, Logger } from '@nestjs/common';

/**
 * BLINDAGEM DO DISPARO FRIO ("cold contact gate") — incidente 30/07/2026.
 *
 * CONTEXTO ($ / chip expulso): 3 disparos frios em 3 minutos, com copy quase idêntica,
 * para 3 números SEM nenhuma conversa prévia → a Meta removeu o dispositivo vinculado
 * 2 segundos após o 3º envio (stream:error 401 conflict device_removed). O freio de
 * vazão (WaSendThrottleService) não pega esse vetor: o risco não é mensagens/minuto,
 * é PRIMEIRO CONTATO repetitivo. Este gate fecha exatamente esse buraco, no MESMO
 * ponto único de despacho — nenhum caminho (tela, bot, cadência) passa por fora.
 *
 * FRIO = mensagem comercial para um número com quem este tenant NUNCA trocou mensagem
 * (nenhum INBOUND em qualquer conversa do número; nenhum OUTBOUND já entregue).
 * Responder quem já falou com a empresa NUNCA é travado aqui.
 *
 * Três regras, todas por EMPRESA (dia-negócio no fuso do dono, UTC-3):
 *   1. TETO DIÁRIO de contatos frios (default 10 — número do dono, 30/07).
 *      Estouro: bot REAGENDA para o próximo dia útil; envio HUMANO é cancelado com
 *      motivo claro (deixar bolha "Enviando" por horas seria mentira).
 *   2. ESPAÇAMENTO MÍNIMO entre frios (default 10 min) — reagenda, NUNCA descarta.
 *   3. TRAVA DE REPETIÇÃO: copy ≥ N% igual (default 85) a outro frio das últimas 24h
 *      é CANCELADA (esperar não resolve texto igual — o conserto é variar a copy).
 *      Textos curtos (< HBX_WA_COLD_SIMILARITY_MIN_LEN) ficam de fora: "oi, tudo bem?"
 *      é genérico demais para ser assinatura de robô.
 *
 * Contadores persistem no WhatsAppAuditLog (scope='dispatch', event='cold_contact_sent')
 * — sobrevivem a restart/deploy (o freio de vazão zera em restart; ESTE não pode:
 * teto diário zerando a cada publish viraria porta dos fundos).
 *
 * FLAG: HBX_WA_COLD_GATE_ENABLED — default LIGADO (lição "entregar ligado"; a chave
 * OFF do throttle foi metade do buraco de 30/07). Kill-switch explícito: '0'/'false'/'off'/'no'.
 *
 * ESCOPO: só fontes comerciais de vendas/prospecção (COLD_GATE_SOURCE_MODULES).
 * Logística/recovery/financeiro mandam transacional para cliente CONHECIDO — fora
 * do vetor de ban e fora do gate (e se fosse frio de verdade, é outra decisão de
 * produto, não deste freio).
 */

export const COLD_GATE_SOURCE_MODULES = [
  'vendas',
  'vendas_human',
  'vendas_prospeccao_bot',
  'prospeccao_bot',
  'cadencia_bot',
] as const;

export type WaColdGateDecision =
  | { allow: true; cold: boolean }
  | { allow: false; action: 'reschedule'; reason: 'cold_daily_cap' | 'cold_spacing'; retryAfterMs: number }
  | { allow: false; action: 'cancel'; reason: 'cold_daily_cap' | 'cold_copy_similar'; detail: string };

type PrismaLike = {
  companyMessage: { findFirst: (args: any) => Promise<any> };
  companyConversation: { findMany: (args: any) => Promise<any[]> };
  whatsAppAuditLog: {
    count: (args: any) => Promise<number>;
    findFirst: (args: any) => Promise<any>;
    findMany: (args: any) => Promise<any[]>;
    create: (args: any) => Promise<any>;
  };
};

function integerEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(String(process.env[name] ?? '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Normaliza copy para comparação: minúsculas, sem acento, sem dígito/pontuação. */
export function normalizeColdText(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Similaridade por conjunto de palavras (0..1): máximo entre Jaccard e CONTAINMENT
 * (interseção / menor conjunto). Medido nas copies REAIS de 30/07: Jaccard 0.815
 * deixava passar; containment 0.917 pega — trocar "Me chamo X" por "Aqui é o X" não
 * disfarça o carimbo. Variação reescrita de verdade mede ~0.13 (passa longe).
 */
export function coldTextSimilarity(aNorm: string, bNorm: string): number {
  const tokensOf = (s: string) => new Set(s.split(' ').filter((t) => t.length >= 2));
  const a = tokensOf(aNorm);
  const b = tokensOf(bNorm);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection += 1;
  const union = a.size + b.size - intersection;
  const jaccard = union > 0 ? intersection / union : 0;
  const containment = intersection / Math.min(a.size, b.size);
  return Math.max(jaccard, containment);
}

/** Variantes de dígitos do telefone BR (com/sem o 9º dígito) para casar histórico. */
export function brPhoneDigitCandidates(to: string): string[] {
  const digits = String(to || '').replace(/\D/g, '');
  if (!digits) return [];
  const out = new Set<string>([digits]);
  // 55 + DDD(2) + 9 + 8 dígitos = 13 → variante sem o 9; 55 + DDD + 8 = 12 → com o 9.
  if (digits.length === 13 && digits.startsWith('55') && digits[4] === '9') {
    out.add(digits.slice(0, 4) + digits.slice(5));
  } else if (digits.length === 12 && digits.startsWith('55')) {
    out.add(digits.slice(0, 4) + '9' + digits.slice(4));
  }
  return [...out];
}

/** Meia-noite do dia-negócio no fuso do dono (America/Sao_Paulo, UTC-3 fixo). */
export function businessDayStartUtc(now = new Date()): Date {
  const sp = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate(), 3, 0, 0));
}

@Injectable()
export class WaColdContactGateService {
  private readonly logger = new Logger(WaColdContactGateService.name);

  constructor(private readonly prisma: PrismaLike) {}

  isEnabled(): boolean {
    const raw = String(process.env.HBX_WA_COLD_GATE_ENABLED ?? '').trim().toLowerCase();
    return !['0', 'false', 'off', 'no'].includes(raw);
  }

  maxPerDay(): number {
    return Math.max(1, integerEnv('HBX_WA_COLD_MAX_PER_DAY', 10));
  }

  minSpacingMs(): number {
    return Math.max(0, integerEnv('HBX_WA_COLD_MIN_SPACING_MINUTES', 10)) * 60 * 1000;
  }

  similarityThreshold(): number {
    return Math.min(100, Math.max(1, integerEnv('HBX_WA_COLD_SIMILARITY_PCT', 85))) / 100;
  }

  similarityWindowMs(): number {
    return Math.max(1, integerEnv('HBX_WA_COLD_SIMILARITY_WINDOW_HOURS', 24)) * 60 * 60 * 1000;
  }

  similarityMinLen(): number {
    return Math.max(0, integerEnv('HBX_WA_COLD_SIMILARITY_MIN_LEN', 60));
  }

  isColdGateSource(sourceModule: unknown): boolean {
    const source = String(sourceModule || '').trim().toLowerCase();
    return (COLD_GATE_SOURCE_MODULES as readonly string[]).includes(source);
  }

  /**
   * O número é FRIO para este tenant? (nenhum inbound nunca; nenhum outbound já
   * entregue — nem nesta conversa nem em outra conversa do mesmo telefone).
   * Best-effort fail-open: erro de banco não pode derrubar o caminho de envio —
   * o freio de vazão continua atrás deste gate de qualquer forma.
   */
  private async isColdContact(input: {
    companyId: number;
    conversationId: number | null;
    to: string;
    currentCompanyMessageId: number | null;
  }): Promise<boolean> {
    try {
      const priorInConversation = input.conversationId
        ? await this.prisma.companyMessage.findFirst({
            where: {
              companyId: input.companyId,
              conversationId: input.conversationId,
              ...(input.currentCompanyMessageId ? { id: { not: input.currentCompanyMessageId } } : {}),
              OR: [
                { direction: 'INBOUND' },
                { direction: 'OUTBOUND', status: { in: ['SENT', 'DELIVERED', 'READ'] } },
              ],
            },
            select: { id: true },
          })
        : null;
      if (priorInConversation) return false;

      const candidates = brPhoneDigitCandidates(input.to);
      if (candidates.length === 0) return Boolean(input.conversationId);
      const siblings = await this.prisma.companyConversation.findMany({
        where: {
          companyId: input.companyId,
          ...(input.conversationId ? { id: { not: input.conversationId } } : {}),
          OR: [
            { sourcePhoneNormalized: { in: candidates } },
            ...candidates.map((digits) => ({ contact: { contains: digits } })),
          ],
        },
        select: { id: true },
        take: 20,
      });
      if (siblings.length === 0) return true;
      const priorElsewhere = await this.prisma.companyMessage.findFirst({
        where: {
          companyId: input.companyId,
          conversationId: { in: siblings.map((c) => Number(c.id)) },
          OR: [
            { direction: 'INBOUND' },
            { direction: 'OUTBOUND', status: { in: ['SENT', 'DELIVERED', 'READ'] } },
          ],
        },
        select: { id: true },
      });
      return !priorElsewhere;
    } catch (error) {
      this.logger.warn(
        `cold-gate: falha ao classificar frio (company=${input.companyId}): ${String((error as any)?.message || error)}`,
      );
      return false;
    }
  }

  /**
   * Decisão para UM envio, chamada ANTES do despacho (depois do freio de vazão).
   * Só consome a cota (grava cold_contact_sent) quando allow=true e cold=true.
   */
  async evaluate(input: {
    companyId: number;
    conversationId: number | null;
    to: string;
    sourceModule?: string | null;
    senderType?: string | null;
    body?: string | null;
    sessionId?: string | null;
    tenantKey?: string | null;
    currentCompanyMessageId?: number | null;
  }): Promise<WaColdGateDecision> {
    if (!this.isEnabled() || !this.isColdGateSource(input.sourceModule)) {
      return { allow: true, cold: false };
    }
    const cold = await this.isColdContact({
      companyId: input.companyId,
      conversationId: input.conversationId,
      to: input.to,
      currentCompanyMessageId: input.currentCompanyMessageId ?? null,
    });
    if (!cold) return { allow: true, cold: false };

    const now = Date.now();
    const dayStart = businessDayStartUtc(new Date(now));
    const isHuman = String(input.senderType || '').trim().toLowerCase() === 'human';

    try {
      // ── 1. Teto diário ──
      const sentToday = await this.prisma.whatsAppAuditLog.count({
        where: {
          companyId: input.companyId,
          scope: 'dispatch',
          event: 'cold_contact_sent',
          createdAt: { gte: dayStart },
        },
      });
      if (sentToday >= this.maxPerDay()) {
        if (isHuman) {
          return {
            allow: false,
            action: 'cancel',
            reason: 'cold_daily_cap',
            detail: `Teto diário de ${this.maxPerDay()} primeiros contatos atingido (proteção do chip). Amanhã libera de novo.`,
          };
        }
        const nextDay = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000);
        return {
          allow: false,
          action: 'reschedule',
          reason: 'cold_daily_cap',
          retryAfterMs: Math.max(60_000, nextDay.getTime() - now),
        };
      }

      // ── 2. Espaçamento mínimo entre frios ──
      const lastCold = await this.prisma.whatsAppAuditLog.findFirst({
        where: { companyId: input.companyId, scope: 'dispatch', event: 'cold_contact_sent' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      const lastAt = lastCold?.createdAt instanceof Date ? lastCold.createdAt.getTime() : 0;
      const spacing = this.minSpacingMs();
      if (lastAt && now - lastAt < spacing) {
        return {
          allow: false,
          action: 'reschedule',
          reason: 'cold_spacing',
          retryAfterMs: spacing - (now - lastAt) + Math.floor(Math.random() * 30_000),
        };
      }

      // ── 3. Trava de repetição de copy ──
      const bodyNorm = normalizeColdText(String(input.body || ''));
      if (bodyNorm.length >= this.similarityMinLen()) {
        const recent = await this.prisma.whatsAppAuditLog.findMany({
          where: {
            companyId: input.companyId,
            scope: 'dispatch',
            event: 'cold_contact_sent',
            createdAt: { gte: new Date(now - this.similarityWindowMs()) },
          },
          orderBy: { createdAt: 'desc' },
          take: 30,
          select: { metadata: true },
        });
        const threshold = this.similarityThreshold();
        for (const row of recent) {
          let priorNorm = '';
          try {
            priorNorm = String(JSON.parse(String(row?.metadata || '{}'))?.extra?.textNorm || '');
          } catch {
            priorNorm = '';
          }
          if (!priorNorm) continue;
          const similarity = coldTextSimilarity(bodyNorm, priorNorm);
          if (similarity >= threshold) {
            return {
              allow: false,
              action: 'cancel',
              reason: 'cold_copy_similar',
              detail: `Mensagem ${Math.round(similarity * 100)}% igual a um primeiro contato recente — repetir carimbo é o que expulsa o chip. Varie o texto de verdade.`,
            };
          }
        }
      }

      // ── Liberado: consome a cota (persistente — sobrevive a deploy) ──
      await this.prisma.whatsAppAuditLog
        .create({
          data: {
            companyId: input.companyId,
            scope: 'dispatch',
            event: 'cold_contact_sent',
            level: 'INFO',
            message: `Primeiro contato frio liberado para ${input.to} (${sentToday + 1}/${this.maxPerDay()} hoje)`,
            metadata: JSON.stringify({
              extra: {
                textNorm: bodyNorm.slice(0, 600),
                to: input.to,
                conversationId: input.conversationId,
                sourceModule: input.sourceModule || null,
                sessionId: input.sessionId || null,
                tenantKey: input.tenantKey || null,
              },
            }),
          },
        })
        .catch((error: any) => {
          this.logger.warn(`cold-gate: falha ao gravar cota (company=${input.companyId}): ${String(error?.message || error)}`);
        });
      return { allow: true, cold: true };
    } catch (error) {
      // Fail-open consciente: o gate protege contra padrão, não pode virar ponto único
      // de queda do envio inteiro. O freio de vazão e a supressão continuam valendo.
      this.logger.warn(`cold-gate: erro na avaliação (company=${input.companyId}): ${String((error as any)?.message || error)}`);
      return { allow: true, cold: false };
    }
  }

  /**
   * Snapshot para o painel de disparos (live-status): estado do gate hoje.
   * Leitura pura — nunca consome cota.
   */
  async snapshotForCompany(companyId: number): Promise<{
    enabled: boolean;
    maxPerDay: number;
    minSpacingMinutes: number;
    similarityPct: number;
    sentToday: number;
    remainingToday: number;
    nextAllowedColdAt: string | null;
    lastBlock: { reason: string; at: string } | null;
  }> {
    const dayStart = businessDayStartUtc();
    const [sentToday, lastCold, lastBlock] = await Promise.all([
      this.prisma.whatsAppAuditLog.count({
        where: { companyId, scope: 'dispatch', event: 'cold_contact_sent', createdAt: { gte: dayStart } },
      }),
      this.prisma.whatsAppAuditLog.findFirst({
        where: { companyId, scope: 'dispatch', event: 'cold_contact_sent' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      this.prisma.whatsAppAuditLog.findFirst({
        where: {
          companyId,
          scope: 'dispatch',
          event: { in: ['cold_send_held', 'cold_send_blocked'] },
          createdAt: { gte: dayStart },
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, metadata: true, message: true },
      }),
    ]);
    const lastAt = lastCold?.createdAt instanceof Date ? lastCold.createdAt.getTime() : 0;
    const nextAllowed = lastAt ? lastAt + this.minSpacingMs() : 0;
    let lastBlockReason: string | null = null;
    if (lastBlock) {
      try {
        lastBlockReason = String(JSON.parse(String(lastBlock.metadata || '{}'))?.reason || '') || null;
      } catch {
        lastBlockReason = null;
      }
    }
    return {
      enabled: this.isEnabled(),
      maxPerDay: this.maxPerDay(),
      minSpacingMinutes: Math.round(this.minSpacingMs() / 60_000),
      similarityPct: Math.round(this.similarityThreshold() * 100),
      sentToday,
      remainingToday: Math.max(0, this.maxPerDay() - sentToday),
      nextAllowedColdAt: nextAllowed > Date.now() ? new Date(nextAllowed).toISOString() : null,
      lastBlock: lastBlock
        ? { reason: lastBlockReason || String(lastBlock.message || 'bloqueio'), at: lastBlock.createdAt.toISOString() }
        : null,
    };
  }
}
