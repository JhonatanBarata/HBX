import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * CRÉDITOS S1 (05/07 — docs/PLANEJAMENTOS/CREDITOS/S1-SPEC.md).
 *
 * A carteira pré-paga que vai SUBSTITUIR o paywall por tier: 1 crédito = 1 lead
 * entregue (D1). Este serviço é SÓ a fundação — schema + saldo atômico + lotes/FIFO.
 * NÃO tem enforcement, NÃO debita fluxo de vendas, NÃO tem checkout (isso é S2/S3).
 * Nasce inerte: nenhum runtime de vendas o chama ainda.
 *
 * Regras de dinheiro que NÃO podem ser violadas:
 *  - Saldo = Σ(lotes com remaining>0 E não expirados). Fonte ÚNICA derivada do ledger
 *    (nada de contar CompanyCommercialUsageLog — esse é o modelo VELHO que vamos aposentar).
 *  - Débito atômico e fail-closed: o SELECT ... FOR UPDATE trava a linha da wallet, então
 *    dois "puxar lead" concorrentes serializam e NUNCA vendem o mesmo crédito. Nunca deixa
 *    saldo < 0 (D7: serve o que couber e reporta partial, nunca negativa).
 *  - Idempotência por usageKey: reexecutar a mesma ação = no-op (sobrevive a retry de
 *    webhook/PARAR). A checagem roda SOB o lock, então é segura contra corrida.
 *  - FIFO por expiração: consome o lote que expira PRIMEIRO (expiresAt ASC nulls-last,
 *    createdAt ASC no empate).
 */

const LEDGER_MOVEMENT_KINDS = ['debit', 'refund', 'expire', 'adjust'] as const;

// Lote cujo pai já expirou no momento do refund: o crédito volta num lote `adjust`
// de graça curta (não ressuscita saldo indefinidamente). Caso raro — refund normal
// (PARAR/falha) acontece segundos após o débito, com o lote-pai ainda vivo.
const REFUND_EXPIRED_PARENT_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export type CreditLotKind = 'grant' | 'recharge' | 'promo';
export type CreditGrantType = 'paid' | 'courtesy_internal' | 'promo';

export type GrantCreditOptions = {
  kind?: CreditLotKind;
  grantType?: CreditGrantType | null;
  expiresAt?: Date | null;
  sourceRef?: string | null;
  usageKey?: string | null;
  createdByUserId?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type DebitCreditOptions = {
  actionKey: string;
  usageKey: string;
  createdByUserId?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type DebitResult = {
  debited: number;
  requested: number;
  partial: boolean;
  balanceAfter: number;
  idempotentReplay: boolean;
};

export type RefundResult = {
  refunded: number;
  alreadyRefunded: boolean;
  balanceAfter: number;
};

export type ExpireResult = {
  expiredCredits: number;
  expiredLots: number;
};

export type CreditLotSnapshot = {
  id: string;
  kind: string;
  amount: number;
  remaining: number;
  expiresAt: string | null;
  grantType: string | null;
  createdAt: string;
};

export type WalletSnapshot = {
  companyId: number;
  balance: number;
  lots: CreditLotSnapshot[];
};

@Injectable()
export class CreditWalletService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Flag mestra (env, default OFF). S1 só EXPÕE — quem gateia enforcement é o S2.
   * Os métodos funcionam com a flag OFF (para teste); o que a flag guarda é o wire
   * no runtime de vendas, que ainda não existe.
   */
  isEnabled(): boolean {
    return String(process.env.HBX_CREDITS_ENABLED || '').trim().toLowerCase() === 'true';
  }

  /** Cria a wallet da empresa se não existir. Idempotente (trata corrida P2002). */
  async ensureWallet(companyId: number): Promise<string> {
    const existing = await this.prisma.creditWallet.findUnique({
      where: { companyId },
      select: { id: true },
    });
    if (existing) return existing.id;
    try {
      const created = await this.prisma.creditWallet.create({
        data: { companyId },
        select: { id: true },
      });
      return created.id;
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const row = await this.prisma.creditWallet.findUnique({
          where: { companyId },
          select: { id: true },
        });
        if (row) return row.id;
      }
      throw error;
    }
  }

  /** Saldo = Σ(lotes remaining>0 e não expirados). Fonte única derivada do ledger. */
  async getBalance(companyId: number, now: Date = new Date()): Promise<number> {
    const rows = await this.prisma.creditLedgerEntry.findMany({
      where: this.openLotsWhere(companyId, now),
      select: { remaining: true },
    });
    return rows.reduce((sum, row) => sum + Math.max(0, row.remaining), 0);
  }

  /** Saldo + lista de lotes abertos (para o painel do S6). */
  async getWalletSnapshot(companyId: number, now: Date = new Date()): Promise<WalletSnapshot> {
    const lots = await this.prisma.creditLedgerEntry.findMany({
      where: this.openLotsWhere(companyId, now),
      orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        kind: true,
        amount: true,
        remaining: true,
        expiresAt: true,
        grantType: true,
        createdAt: true,
      },
    });
    const balance = lots.reduce((sum, lot) => sum + Math.max(0, lot.remaining), 0);
    return {
      companyId,
      balance,
      lots: lots.map((lot) => ({
        id: lot.id,
        kind: lot.kind,
        amount: lot.amount,
        remaining: lot.remaining,
        expiresAt: lot.expiresAt ? lot.expiresAt.toISOString() : null,
        grantType: lot.grantType ?? null,
        createdAt: lot.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Entra saldo (LOTE). Idempotente por usageKey (e por sourceRef quando não houver
   * usageKey) — sobrevive a retry de webhook de pagamento. Roda sob o lock da wallet.
   */
  async grant(companyId: number, amount: number, options: GrantCreditOptions = {}): Promise<{ id: string; created: boolean }> {
    const normalizedAmount = Math.trunc(Number(amount) || 0);
    if (normalizedAmount <= 0) {
      throw new Error('CreditWallet.grant: amount deve ser inteiro positivo');
    }
    const walletId = await this.ensureWallet(companyId);
    const kind: CreditLotKind = options.kind || 'grant';
    return this.prisma.$transaction(async (tx) => {
      await this.lockWallet(tx, companyId);
      const dedupeKey = options.usageKey || null;
      const dedupeSourceRef = !dedupeKey ? options.sourceRef || null : null;
      if (dedupeKey || dedupeSourceRef) {
        const prior = await tx.creditLedgerEntry.findFirst({
          where: {
            walletId,
            kind,
            ...(dedupeKey ? { usageKey: dedupeKey } : { sourceRef: dedupeSourceRef }),
          },
          select: { id: true },
        });
        if (prior) return { id: prior.id, created: false };
      }
      const created = await tx.creditLedgerEntry.create({
        data: {
          walletId,
          companyId,
          kind,
          amount: normalizedAmount,
          remaining: normalizedAmount,
          expiresAt: options.expiresAt ?? null,
          grantType: options.grantType ?? null,
          sourceRef: options.sourceRef ?? null,
          usageKey: options.usageKey ?? null,
          createdByUserId: options.createdByUserId ?? null,
          metadataJson: options.metadata ? JSON.stringify(options.metadata) : null,
        },
        select: { id: true },
      });
      return { id: created.id, created: true };
    });
  }

  /**
   * Debita `amount` créditos. Atômico (FOR UPDATE na wallet), FIFO por expiração,
   * fail-closed (nunca negativa; serve o que couber e reporta partial). Idempotente
   * por usageKey: retry retorna o resultado já gravado sem debitar de novo.
   */
  async debit(companyId: number, amount: number, options: DebitCreditOptions): Promise<DebitResult> {
    const requested = Math.trunc(Number(amount) || 0);
    if (requested <= 0) {
      throw new Error('CreditWallet.debit: amount deve ser inteiro positivo');
    }
    if (!options?.usageKey) {
      throw new Error('CreditWallet.debit: usageKey obrigatório (idempotência)');
    }
    const walletId = await this.ensureWallet(companyId);
    return this.prisma.$transaction(async (tx) => {
      await this.lockWallet(tx, companyId);
      const now = new Date();

      // Idempotência: já debitou com essa usageKey? Reconstrói o resultado original.
      const prior = await tx.creditLedgerEntry.findMany({
        where: { walletId, usageKey: options.usageKey, kind: 'debit' },
        select: { amount: true },
      });
      if (prior.length) {
        const debited = prior.reduce((sum, row) => sum + row.amount, 0);
        return {
          debited,
          requested,
          partial: debited < requested,
          balanceAfter: await this.balanceInTx(tx, walletId, now),
          idempotentReplay: true,
        };
      }

      const lots = await tx.creditLedgerEntry.findMany({
        where: {
          walletId,
          remaining: { gt: 0 },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, remaining: true },
      });

      let remainingToDebit = requested;
      let debited = 0;
      for (const lot of lots) {
        if (remainingToDebit <= 0) break;
        const take = Math.min(lot.remaining, remainingToDebit);
        if (take <= 0) continue;
        // Decremento condicional (guard remaining>=take). Sob o lock isso nunca perde
        // a corrida, mas o WHERE é o cinto de segurança que impede saldo negativo.
        const updated = await tx.creditLedgerEntry.updateMany({
          where: { id: lot.id, remaining: { gte: take } },
          data: { remaining: { decrement: take } },
        });
        if (updated.count !== 1) continue;
        await tx.creditLedgerEntry.create({
          data: {
            walletId,
            companyId,
            kind: 'debit',
            amount: take,
            remaining: 0,
            actionKey: options.actionKey,
            usageKey: options.usageKey,
            parentEntryId: lot.id,
            createdByUserId: options.createdByUserId ?? null,
            metadataJson: options.metadata ? JSON.stringify(options.metadata) : null,
          },
        });
        debited += take;
        remainingToDebit -= take;
      }

      return {
        debited,
        requested,
        partial: debited < requested,
        balanceAfter: await this.balanceInTx(tx, walletId, now),
        idempotentReplay: false,
      };
    });
  }

  /**
   * Reverte o débito de uma usageKey (on-failure/PARAR). Devolve remaining aos lotes
   * originais ainda vivos; se o lote-pai já expirou, cria um lote `adjust` de graça
   * curta. Idempotente: refund 2x = no-op.
   */
  async refund(companyId: number, usageKey: string, createdByUserId?: number | null): Promise<RefundResult> {
    if (!usageKey) {
      throw new Error('CreditWallet.refund: usageKey obrigatório');
    }
    const walletId = await this.ensureWallet(companyId);
    return this.prisma.$transaction(async (tx) => {
      await this.lockWallet(tx, companyId);
      const now = new Date();

      const existingRefunds = await tx.creditLedgerEntry.findMany({
        where: { walletId, usageKey, kind: 'refund' },
        select: { amount: true },
      });
      if (existingRefunds.length) {
        return {
          refunded: existingRefunds.reduce((sum, row) => sum + row.amount, 0),
          alreadyRefunded: true,
          balanceAfter: await this.balanceInTx(tx, walletId, now),
        };
      }

      const debits = await tx.creditLedgerEntry.findMany({
        where: { walletId, usageKey, kind: 'debit' },
        select: { id: true, amount: true, parentEntryId: true },
      });

      let refunded = 0;
      for (const debitRow of debits) {
        const parent = debitRow.parentEntryId
          ? await tx.creditLedgerEntry.findUnique({
              where: { id: debitRow.parentEntryId },
              select: { id: true, expiresAt: true, grantType: true },
            })
          : null;
        const parentAlive = parent && (parent.expiresAt === null || parent.expiresAt > now);
        if (parentAlive) {
          await tx.creditLedgerEntry.update({
            where: { id: parent!.id },
            data: { remaining: { increment: debitRow.amount } },
          });
        } else {
          await tx.creditLedgerEntry.create({
            data: {
              walletId,
              companyId,
              kind: 'adjust',
              amount: debitRow.amount,
              remaining: debitRow.amount,
              expiresAt: new Date(now.getTime() + REFUND_EXPIRED_PARENT_GRACE_MS),
              grantType: parent?.grantType ?? null,
              usageKey,
              parentEntryId: debitRow.id,
              createdByUserId: createdByUserId ?? null,
            },
          });
        }
        await tx.creditLedgerEntry.create({
          data: {
            walletId,
            companyId,
            kind: 'refund',
            amount: debitRow.amount,
            remaining: 0,
            usageKey,
            parentEntryId: debitRow.id,
            createdByUserId: createdByUserId ?? null,
          },
        });
        refunded += debitRow.amount;
      }

      return {
        refunded,
        alreadyRefunded: false,
        balanceAfter: await this.balanceInTx(tx, walletId, now),
      };
    });
  }

  /**
   * Job diário: lotes vencidos com remaining>0 → escreve `expire`, zera remaining.
   * Retorna o total de créditos que expiraram (breakage — número pro painel do master).
   */
  async expireLots(now: Date = new Date()): Promise<ExpireResult> {
    const expiredLots = await this.prisma.creditLedgerEntry.findMany({
      where: { remaining: { gt: 0 }, expiresAt: { lt: now } },
      select: { id: true, walletId: true, companyId: true },
    });
    let expiredCredits = 0;
    let count = 0;
    for (const lot of expiredLots) {
      const applied = await this.prisma.$transaction(async (tx) => {
        await this.lockWallet(tx, lot.companyId);
        const fresh = await tx.creditLedgerEntry.findUnique({
          where: { id: lot.id },
          select: { remaining: true, expiresAt: true },
        });
        if (!fresh || fresh.remaining <= 0 || !fresh.expiresAt || fresh.expiresAt >= now) return 0;
        await tx.creditLedgerEntry.update({
          where: { id: lot.id },
          data: { remaining: 0 },
        });
        await tx.creditLedgerEntry.create({
          data: {
            walletId: lot.walletId,
            companyId: lot.companyId,
            kind: 'expire',
            amount: fresh.remaining,
            remaining: 0,
            parentEntryId: lot.id,
          },
        });
        return fresh.remaining;
      });
      if (applied > 0) {
        expiredCredits += applied;
        count += 1;
      }
    }
    return { expiredCredits, expiredLots: count };
  }

  // ── internos ────────────────────────────────────────────────────────────────

  private openLotsWhere(companyId: number, now: Date) {
    return {
      companyId,
      remaining: { gt: 0 },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };
  }

  private async balanceInTx(tx: any, walletId: string, now: Date): Promise<number> {
    const rows = await tx.creditLedgerEntry.findMany({
      where: {
        walletId,
        remaining: { gt: 0 },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { remaining: true },
    });
    return rows.reduce((sum: number, row: { remaining: number }) => sum + Math.max(0, row.remaining), 0);
  }

  /**
   * Trava a linha da wallet (SELECT ... FOR UPDATE). É o coração da atomicidade:
   * qualquer outra transação que tente debitar/creditar a MESMA empresa espera aqui.
   */
  private async lockWallet(tx: any, companyId: number): Promise<void> {
    await tx.$queryRawUnsafe(
      'SELECT "id" FROM "CreditWallet" WHERE "companyId" = $1 FOR UPDATE',
      companyId,
    );
  }
}

export const CREDIT_LEDGER_MOVEMENT_KINDS = LEDGER_MOVEMENT_KINDS;
