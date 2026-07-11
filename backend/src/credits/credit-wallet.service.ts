import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { emitMasterEvent } from '../common/master-event';

// CRÉDITOS S1 (docs/PLANEJAMENTOS/CREDITOS/S1-SPEC.md) — fundação da carteira de crédito.
// Sprint 0 fechado 04/07: 1 crédito = 1 lead; saldo em LOTES com expiração FIFO; fail-closed
// nunca negativo; idempotência por usageKey. SEM enforcement neste sprint — o serviço nasce
// inerte atrás de HBX_CREDITS_ENABLED (default OFF); ninguém no runtime de vendas chama ainda.
//
// Padrão de concorrência REUSADO do hbx-recovery.service.ts (applyPayment/reversePayment):
// optimistic lock via updateMany condicional (WHERE id + remaining esperado) + retry com teto.
// Nenhum SELECT...FOR UPDATE novo — o statement condicional único no banco é o que é atômico;
// o loop cobre só a corrida entre leitura e escrita (perde a corrida → relê e tenta de novo).

export type CreditLotKind = 'grant' | 'recharge' | 'promo';
export type CreditGrantType = 'paid' | 'courtesy_internal' | 'promo';
export type CreditMovementKind =
  | 'debit'
  | 'refund'
  | 'expire'
  | 'adjust'
  | 'purchase_reversal'
  | 'chargeback_debt'
  | 'chargeback_settlement';

export type CreditLot = {
  id: string;
  amount: number;
  remaining: number;
  expiresAt: Date | null;
  grantType: CreditGrantType | null;
  createdAt: Date;
};

export type CreditWalletSnapshot = {
  companyId: number;
  walletId: string;
  balance: number;
  chargebackDebtCredits: number; // P0.3 hold: dívida de chargeback ainda em aberto (0 = sem hold)
  lots: CreditLot[];
};

export type GrantOptions = {
  kind?: CreditLotKind;
  grantType?: CreditGrantType;
  expiresAt?: Date | null;
  sourceRef?: string | null;
  createdByUserId?: number | null;
  usageKey?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type DebitOptions = {
  actionKey: string;
  usageKey: string;
  userId?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type DebitResult = {
  debited: number;
  requested: number;
  partial: boolean;
  balanceAfter: number;
};

export type RefundResult = {
  refunded: number;
  balanceAfter: number;
  alreadyProcessed: boolean;
};

// P0.3 (PR10072026 W2) — reversão de COMPRA de crédito (estorno/chargeback da recarga no MP).
// Diferente de `refund` (que devolve um débito operacional): aqui o dinheiro SAIU da nossa
// conta, então os créditos vendidos precisam SAIR da carteira — nunca abaixo de zero.
// `shortfall` = créditos do pack que o cliente JÁ consumiu antes do estorno (dívida a
// tratar pelo master; a decisão de bloquear consumo fica com o dono).
export type PurchaseReversalOptions = {
  amount: number; // créditos do pack estornado (inteiro > 0)
  usageKey: string; // 'mp-reversal:<mpPaymentId>' — idempotência da reversão inteira
  preferredLotId?: string | null; // lote da própria recarga — consumido PRIMEIRO se ainda vivo
  userId?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type PurchaseReversalResult = {
  reversed: number;
  requested: number;
  shortfall: number;
  balanceAfter: number;
  alreadyProcessed: boolean;
};

export type ExpireLotsResult = {
  expiredEntries: number;
  expiredCredits: number;
};

const MAX_CONCURRENCY_RETRIES = 8;

// Validade do lote de REPOSIÇÃO quando um refund cai sobre um lote já expirado (decisão do
// dono 04/07: "lote novo com validade nova"). Default aqui; o S3/master-config torna isto
// configurável junto com o prazo padrão de expiração do crédito (D6). Nunca `null` (perpétuo).
const REFUND_EXPIRED_LOT_VALIDITY_MS = 365 * 24 * 60 * 60 * 1000;

// Sinal interno: abortar a transação do par decremento+trilha porque o optimistic lock
// não casou (outro writer mexeu no lote). NÃO é erro de banco — é retry controlado. Fica
// distinto do P2002 (duplicata de usageKey) para os dois serem tratados de formas diferentes.
class ConcurrencyRetrySignal extends Error {
  constructor() {
    super('credit-wallet: optimistic lock miss, retry');
    this.name = 'ConcurrencyRetrySignal';
  }
}

// Sinal interno: o total committado desta usageKey já cobre o `amount` pedido — outra
// chamada (ou execução anterior) completou a ação. Aborta a tx sem consumir; o resultado
// idempotente é relido do ledger. Distinto do P2002 (que só pega colisão no MESMO lote).
class UsageKeySatisfiedSignal extends Error {
  constructor() {
    super('credit-wallet: usageKey já coberta pelo ledger');
    this.name = 'UsageKeySatisfiedSignal';
  }
}

function isFiniteNonNegativeInt(value: number) {
  return Number.isInteger(value) && value >= 0;
}

@Injectable()
export class CreditWalletService {
  private readonly logger = new Logger(CreditWalletService.name);
  constructor(private readonly prisma: PrismaService) {}

  private json(value: unknown) {
    if (value === undefined || value === null) return null;
    return JSON.stringify(value);
  }

  /** Cria a wallet se não existir. Idempotente — corrida concorrente cai no P2002 e relê. */
  async ensureWallet(companyId: number): Promise<{ id: string; companyId: number }> {
    const existing = await this.prisma.creditWallet.findUnique({ where: { companyId } });
    if (existing) return { id: existing.id, companyId: existing.companyId };
    try {
      const created = await this.prisma.creditWallet.create({ data: { companyId } });
      return { id: created.id, companyId: created.companyId };
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;
      const winner = await this.prisma.creditWallet.findUnique({ where: { companyId } });
      if (winner) return { id: winner.id, companyId: winner.companyId };
      throw error;
    }
  }

  private isUniqueConstraintError(error: unknown) {
    return Boolean(error) && typeof error === 'object' && (error as any).code === 'P2002';
  }

  /**
   * Lotes ABERTOS (remaining>0) e NÃO expirados, em ordem FIFO de consumo:
   * expiresAt ASC com nulls por último (nunca-expira é consumido por último);
   * empate → createdAt ASC (mais antigo primeiro).
   */
  private async openLotsFifo(walletId: string, now: Date): Promise<CreditLot[]> {
    const rows = await this.prisma.creditLedgerEntry.findMany({
      where: {
        walletId,
        kind: { in: ['grant', 'recharge', 'promo'] },
        remaining: { gt: 0 },
      },
      orderBy: [{ createdAt: 'asc' }],
    });
    const open = rows.filter((row) => !row.expiresAt || row.expiresAt.getTime() > now.getTime());
    open.sort((a, b) => {
      const aExp = a.expiresAt ? a.expiresAt.getTime() : Number.POSITIVE_INFINITY;
      const bExp = b.expiresAt ? b.expiresAt.getTime() : Number.POSITIVE_INFINITY;
      if (aExp !== bExp) return aExp - bExp;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    return open.map((row) => ({
      id: row.id,
      amount: row.amount,
      remaining: row.remaining,
      expiresAt: row.expiresAt,
      grantType: (row.grantType as CreditGrantType | null) ?? null,
      createdAt: row.createdAt,
    }));
  }

  /** Saldo = Σ(lotes remaining>0 e não expirados). Fonte ÚNICA derivada do ledger. */
  async getBalance(companyId: number, now: Date = new Date()): Promise<number> {
    const wallet = await this.prisma.creditWallet.findUnique({ where: { companyId } });
    if (!wallet) return 0;
    const lots = await this.openLotsFifo(wallet.id, now);
    return lots.reduce((sum, lot) => sum + lot.remaining, 0);
  }

  /** Saldo + lista de lotes (p/ o painel do S6). */
  async getWalletSnapshot(companyId: number, now: Date = new Date()): Promise<CreditWalletSnapshot> {
    const wallet = await this.ensureWallet(companyId);
    const lots = await this.openLotsFifo(wallet.id, now);
    const debt = await this.getChargebackDebt(companyId);
    return {
      companyId,
      walletId: wallet.id,
      balance: lots.reduce((sum, lot) => sum + lot.remaining, 0),
      chargebackDebtCredits: debt,
      lots,
    };
  }

  /**
   * MASTER-REFAB S1 — saldo de VÁRIAS empresas em 1 query agregada (painel /master não pode
   * abrir uma wallet por empresa em loop). Mesmo predicado de `openLotsFifo`/`getBalance`
   * (lotes grant|recharge|promo com remaining>0 e não expirados) — só que somado no banco via
   * groupBy, não recalculado aqui. Empresa sem nenhum lote aberto simplesmente não aparece no
   * Map (o chamador trata ausência como saldo 0).
   */
  async getBalancesByCompanyIds(companyIds: number[], now: Date = new Date()): Promise<Map<number, number>> {
    const ids = Array.from(
      new Set(companyIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)),
    );
    const balances = new Map<number, number>();
    if (!ids.length) return balances;
    const rows = await this.prisma.creditLedgerEntry.groupBy({
      by: ['companyId'],
      where: {
        companyId: { in: ids },
        kind: { in: ['grant', 'recharge', 'promo'] },
        remaining: { gt: 0 },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      _sum: { remaining: true },
    });
    for (const row of rows) {
      balances.set(Number(row.companyId), Number(row._sum.remaining || 0));
    }
    return balances;
  }

  /**
   * Cria um lote de crédito (grant | recharge | promo). Idempotente por usageKey: se já existe
   * uma entrada com a mesma usageKey, é no-op (retorna a entrada já gravada, sem duplicar).
   */
  async grant(companyId: number, amount: number, opts: GrantOptions = {}): Promise<{ entryId: string; amount: number; alreadyProcessed: boolean }> {
    if (!isFiniteNonNegativeInt(amount) || amount <= 0) {
      throw new Error('grant: amount deve ser inteiro positivo');
    }
    const wallet = await this.ensureWallet(companyId);
    const usageKey = opts.usageKey?.trim() || null;

    if (usageKey) {
      const existing = await this.prisma.creditLedgerEntry.findFirst({ where: { usageKey } });
      if (existing) {
        if (Number(existing.companyId) !== Number(companyId)) {
          // P0.4 — a dedup por usageKey é GLOBAL no ledger: chave já registrada em OUTRA
          // empresa (ex.: colisão de pagamento MP na conta master compartilhada) devolvida
          // como `alreadyProcessed` seria falso-sucesso silencioso cruzando tenants — o
          // chamador acharia que creditou e NINGUÉM receberia. Fail-closed: alerta o master
          // e lança; nenhum crédito entra em nenhuma das duas carteiras.
          await emitMasterEvent(this.prisma, {
            type: 'credit.grant_cross_company',
            severity: 'action_required',
            companyId,
            dedupKey: `credit-grant-cross-company:${usageKey}`,
            payload: {
              state: 'cross_company_usage_key',
              usageKey,
              existingEntryId: existing.id,
              existingCompanyId: existing.companyId,
            },
          });
          throw new Error(`grant: usageKey já registrada para outra empresa (usageKey=${usageKey})`);
        }
        return { entryId: existing.id, amount: existing.amount, alreadyProcessed: true };
      }
    }

    const created = await this.prisma.creditLedgerEntry.create({
      data: {
        walletId: wallet.id,
        companyId,
        kind: opts.kind || 'grant',
        amount,
        remaining: amount,
        expiresAt: opts.expiresAt ?? null,
        grantType: opts.grantType ?? null,
        usageKey,
        sourceRef: opts.sourceRef ?? null,
        createdByUserId: opts.createdByUserId ?? null,
        metadataJson: this.json(opts.metadata),
      },
    });

    // P0.3 hold — crédito novo abate dívida de chargeback pendente ("crédito novo paga a dívida
    // primeiro"). Best-effort: nunca deixa a concessão falhar por causa da quitação; se falhar, a
    // dívida permanece e a empresa segue bloqueada (fail-safe a favor do caixa). No-op barato
    // quando não há dívida.
    try {
      await this.settleChargebackDebtFromBalance(companyId, {
        usageKey: `chargeback-settle:grant:${created.id}`,
        userId: opts.createdByUserId ?? null,
        metadata: { trigger: 'grant', grantEntryId: created.id, kind: opts.kind || 'grant' },
      });
    } catch (error: any) {
      this.logger.warn(
        `chargeback_debt_settle_failed company=${companyId} entry=${created.id} error=${String(error?.message || error)}`,
      );
    }

    return { entryId: created.id, amount: created.amount, alreadyProcessed: false };
  }

  /** Resultado idempotente: relê as linhas `debit` COMMITADAS dessa usageKey e monta o retorno. */
  private async debitResultFromLedger(companyId: number, usageKey: string, requested: number): Promise<DebitResult> {
    const rows = await this.prisma.creditLedgerEntry.findMany({ where: { usageKey, kind: 'debit' } });
    const debited = rows.reduce((sum, row) => sum + row.amount, 0);
    const balanceAfter = await this.getBalance(companyId);
    return { debited, requested, partial: debited < requested, balanceAfter };
  }

  /**
   * Débito atômico e fail-closed. Consome em FIFO por expiração até `amount`; nunca deixa
   * saldo < 0; se o saldo não cobrir o pedido, serve o que couber e reporta `partial: true`
   * (D7). Idempotente por usageKey: reexecutar a MESMA ação (mesma usageKey) é no-op e retorna
   * o resultado já gravado — nunca debita 2x.
   *
   * Integridade de dinheiro (Fix A+B da revisão Opus S1):
   * - Fix A: cada par (decremento do lote + linha `debit`) roda numa transação interativa —
   *   commitam JUNTOS ou nada. Sem janela em que o lote fica debitado mas a trilha some.
   * - Fix B: a idempotência NÃO depende de um pré-check não-atômico. O par (usageKey, lote) é
   *   `@@unique` no banco; se uma chamada concorrente com a MESMA usageKey já debitou aquele
   *   lote, o `create` bate P2002 DENTRO da transação → rollback do decremento daquele passo,
   *   e tratamos a ação como já-processada (relemos as linhas committadas). Nunca dobra o débito.
   */
  async debit(companyId: number, amount: number, opts: DebitOptions): Promise<DebitResult> {
    if (!isFiniteNonNegativeInt(amount) || amount <= 0) {
      throw new Error('debit: amount deve ser inteiro positivo');
    }
    const usageKey = String(opts.usageKey || '').trim();
    if (!usageKey) throw new Error('debit: usageKey é obrigatório (idempotência)');

    // Pré-check rápido (atalho, NÃO a trava): se a ação já foi processada, sai cedo. A trava
    // real contra corrida é o @@unique + o tratamento de P2002 no laço abaixo.
    const existingDebits = await this.prisma.creditLedgerEntry.findMany({
      where: { usageKey, kind: 'debit' },
    });
    if (existingDebits.length > 0) {
      const foreign = existingDebits.find((row) => Number(row.companyId) !== Number(companyId));
      if (foreign) {
        // Mesmo furo do grant (P0.4): a dedup por usageKey é GLOBAL — chave já registrada em
        // OUTRA empresa devolvida como resultado idempotente seria falso-sucesso silencioso
        // cruzando tenants (a empresa certa nunca é debitada e o chamador acha que foi).
        // Fail-closed: alerta o master e lança.
        await emitMasterEvent(this.prisma, {
          type: 'credit.debit_cross_company',
          severity: 'action_required',
          companyId,
          dedupKey: `credit-debit-cross-company:${usageKey}`,
          payload: {
            state: 'cross_company_usage_key',
            usageKey,
            existingEntryId: foreign.id,
            existingCompanyId: foreign.companyId,
          },
        });
        throw new Error(`debit: usageKey já registrada para outra empresa (usageKey=${usageKey})`);
      }
      return this.debitResultFromLedger(companyId, usageKey, amount);
    }

    const wallet = await this.ensureWallet(companyId);
    const now = new Date();

    const { consumed, duplicateDetected } = await this.consumeOpenLots({
      walletId: wallet.id,
      companyId,
      amount,
      usageKey,
      movementKind: 'debit',
      actionKey: opts.actionKey,
      userId: opts.userId ?? null,
      metadata: opts.metadata ?? null,
      now,
    });

    // Se detectamos duplicata em qualquer ponto, a fonte da verdade é o ledger committado
    // (o que ESTA chamada gravou + o que a concorrente gravou com a mesma usageKey).
    if (duplicateDetected) {
      return this.debitResultFromLedger(companyId, usageKey, amount);
    }

    const balanceAfter = await this.getBalance(companyId, now);
    return {
      debited: consumed,
      requested: amount,
      partial: consumed < amount,
      balanceAfter,
    };
  }

  /**
   * Laço ÚNICO de consumo de lotes (compartilhado por `debit` e `reversePurchase` — P0.3):
   * consome em FIFO por expiração até `amount`, nunca deixa saldo < 0, e grava uma linha de
   * movimento (`movementKind`) POR lote consumido, todas com a MESMA usageKey. As garantias
   * Fix A (decremento + trilha na MESMA tx) e Fix B (@@unique(usageKey, parentEntryId) → P2002
   * = ação duplicada, rollback, nunca consome 2×) vivem AQUI, uma vez só.
   * `preferredLotId` (reversão de compra): consome PRIMEIRO o lote indicado (a própria recarga
   * estornada, se ainda viva), depois segue o FIFO normal.
   */
  private async consumeOpenLots(input: {
    walletId: string;
    companyId: number;
    amount: number;
    usageKey: string;
    movementKind: 'debit' | 'purchase_reversal';
    actionKey?: string | null;
    preferredLotId?: string | null;
    userId?: number | null;
    metadata?: Record<string, unknown> | null;
    now: Date;
  }): Promise<{ consumed: number; duplicateDetected: boolean }> {
    let remainingToConsume = input.amount;
    let totalConsumed = 0;
    let duplicateDetected = false;

    for (let attempt = 0; attempt < MAX_CONCURRENCY_RETRIES && remainingToConsume > 0; attempt++) {
      const lots = await this.openLotsFifo(input.walletId, input.now);
      if (lots.length === 0) break;
      if (input.preferredLotId) {
        const idx = lots.findIndex((lot) => lot.id === input.preferredLotId);
        if (idx > 0) lots.unshift(lots.splice(idx, 1)[0]);
      }

      let progressedThisPass = false;
      for (const lot of lots) {
        if (remainingToConsume <= 0) break;
        const consume = Math.min(lot.remaining, remainingToConsume);
        if (consume <= 0) continue;

        let committed = false;
        let consumedNow = 0;
        try {
          // Fix A: decremento + trilha na MESMA transação interativa — atômicos.
          await this.prisma.$transaction(async (tx) => {
            // Teto GLOBAL da usageKey (FIXER PR10072026): duas chamadas concorrentes com a
            // MESMA usageKey podem progredir em lotes DISJUNTOS (o @@unique só trava colisão
            // no MESMO lote) — cada uma partindo do `amount` cheio, a soma committada podia
            // passar do pedido (ex.: reversão de 100 tirando 130 da carteira). Relê o total
            // committado DENTRO da tx e nunca consome além de `amount − jáCommittado`.
            const committedRows = await tx.creditLedgerEntry.findMany({
              where: { usageKey: input.usageKey, kind: input.movementKind },
            });
            const alreadyCommitted = committedRows.reduce((sum, row) => sum + Number(row.amount), 0);
            if (alreadyCommitted > totalConsumed) {
              // Há linhas desta usageKey que NÃO são desta chamada — o resultado final tem
              // que vir do ledger (soma global), não do contador local.
              duplicateDetected = true;
            }
            const allowed = input.amount - alreadyCommitted;
            if (allowed <= 0) throw new UsageKeySatisfiedSignal();
            const consumeCapped = Math.min(consume, allowed);

            // Optimistic lock: só decrementa se `remaining` ainda é o que lemos.
            const result = await tx.creditLedgerEntry.updateMany({
              where: { id: lot.id, remaining: lot.remaining },
              data: { remaining: { decrement: consumeCapped } },
            });
            if (result.count !== 1) {
              // Perdeu a corrida no lote: aborta a transação (rollback do decremento que
              // ainda nem aconteceu) sem gravar linha. A próxima passada relê os lotes.
              throw new ConcurrencyRetrySignal();
            }
            // Fix B: o @@unique(usageKey, parentEntryId) faz este create bater P2002 se uma
            // chamada concorrente com a MESMA usageKey já consumiu ESTE lote → rollback do
            // decremento acima (mesma tx) e sinalizamos ação-duplicada lá fora.
            await tx.creditLedgerEntry.create({
              data: {
                walletId: input.walletId,
                companyId: input.companyId,
                kind: input.movementKind,
                amount: consumeCapped,
                remaining: 0,
                actionKey: input.actionKey ?? null,
                usageKey: input.usageKey,
                parentEntryId: lot.id,
                createdByUserId: input.userId ?? null,
                metadataJson: this.json(input.metadata),
              },
            });
            consumedNow = consumeCapped;
            committed = true;
          });
        } catch (error) {
          if (this.isUniqueConstraintError(error)) {
            // Ação já processada por uma chamada concorrente (mesma usageKey já consumiu este
            // lote). O decremento foi revertido pelo rollback. Para de tentar e devolve o
            // resultado idempotente committado — nunca consome em dobro.
            duplicateDetected = true;
            break;
          }
          if (error instanceof UsageKeySatisfiedSignal) {
            // O ledger global já cobre o `amount` inteiro — nada mais a consumir aqui.
            duplicateDetected = true;
            break;
          }
          if (error instanceof ConcurrencyRetrySignal) {
            // Corrida no optimistic lock (não é duplicata): não é progresso; relê na próxima passada.
            continue;
          }
          throw error;
        }

        if (committed) {
          remainingToConsume -= consumedNow;
          totalConsumed += consumedNow;
          progressedThisPass = true;
        }
      }

      if (duplicateDetected) break;
      if (!progressedThisPass) {
        // Nenhum lote consumido nesta passada (contenção alta) — próxima iteração relê os lotes.
        continue;
      }
    }

    return { consumed: totalConsumed, duplicateDetected };
  }

  /** Resultado idempotente da reversão de compra: relê as linhas committadas dessa usageKey. */
  private async purchaseReversalResultFromLedger(
    companyId: number,
    usageKey: string,
    requested: number,
    alreadyProcessed: boolean,
    now: Date = new Date(),
  ): Promise<PurchaseReversalResult> {
    const rows = await this.prisma.creditLedgerEntry.findMany({
      where: { usageKey, kind: 'purchase_reversal' },
    });
    const reversed = rows.reduce((sum, row) => sum + row.amount, 0);
    const balanceAfter = await this.getBalance(companyId, now);
    return {
      reversed,
      requested,
      shortfall: Math.max(0, requested - reversed),
      balanceAfter,
      alreadyProcessed,
    };
  }

  /**
   * P0.3 — reversão de COMPRA de crédito (estorno/chargeback de recarga): debita da carteira
   * min(saldo disponível, `amount`) com movimento append-only `purchase_reversal`, consumindo
   * PRIMEIRO o lote da própria recarga (`preferredLotId`, se ainda vivo) e depois FIFO normal.
   * Nunca deixa saldo negativo: o que o cliente já consumiu vira `shortfall` (dívida — quem
   * decide o que fazer com ela é o chamador/master, não a carteira).
   *
   * Idempotente por usageKey ('mp-reversal:<mpPaymentId>'): 20 webhooks duplicados = 1 débito.
   * Mesmas garantias de dinheiro do `debit` (o laço é o MESMO — `consumeOpenLots`): Fix A
   * (tx atômica por lote) + Fix B (@@unique no banco, corrida concorrente não dobra).
   * NÃO é revertível por `refund` (que só enxerga linhas `kind: 'debit'`) — de propósito:
   * compra estornada não volta sozinha.
   */
  async reversePurchase(companyId: number, opts: PurchaseReversalOptions): Promise<PurchaseReversalResult> {
    if (!isFiniteNonNegativeInt(opts.amount) || opts.amount <= 0) {
      throw new Error('reversePurchase: amount deve ser inteiro positivo');
    }
    const usageKey = String(opts.usageKey || '').trim();
    if (!usageKey) throw new Error('reversePurchase: usageKey é obrigatório (idempotência)');

    const now = new Date();

    // Pré-check rápido (atalho, NÃO a trava): a trava real é o @@unique + P2002 na tx.
    const existing = await this.prisma.creditLedgerEntry.findMany({
      where: { usageKey, kind: 'purchase_reversal' },
    });
    if (existing.length > 0) {
      return this.purchaseReversalResultFromLedger(companyId, usageKey, opts.amount, true, now);
    }

    const wallet = await this.ensureWallet(companyId);
    const { consumed, duplicateDetected } = await this.consumeOpenLots({
      walletId: wallet.id,
      companyId,
      amount: opts.amount,
      usageKey,
      movementKind: 'purchase_reversal',
      preferredLotId: opts.preferredLotId ?? null,
      userId: opts.userId ?? null,
      metadata: opts.metadata ?? null,
      now,
    });

    if (duplicateDetected) {
      return this.purchaseReversalResultFromLedger(companyId, usageKey, opts.amount, true, now);
    }

    const balanceAfter = await this.getBalance(companyId, now);
    return {
      reversed: consumed,
      requested: opts.amount,
      shortfall: Math.max(0, opts.amount - consumed),
      balanceAfter,
      alreadyProcessed: false,
    };
  }

  /** P0.3 hold — dívida de chargeback ainda em aberto desta empresa (0 = sem hold). Leitura barata
   *  (1 coluna) usada pelo choke de entrega. */
  async getChargebackDebt(companyId: number): Promise<number> {
    const wallet = await this.prisma.creditWallet.findUnique({ where: { companyId } });
    return Math.max(0, Number(wallet?.chargebackDebtCredits || 0));
  }

  /**
   * P0.3 hold — registra DÍVIDA de crédito quando um estorno/chargeback reverteu uma recarga cujos
   * créditos o cliente JÁ consumiu (o `shortfall` do reversePurchase). A dívida BLOQUEIA novas
   * entregas até ser quitada (settleChargebackDebtFromBalance). NÃO é saldo negativo — é o agregado
   * `CreditWallet.chargebackDebtCredits`; o rastro append-only é 1 linha `chargeback_debt`.
   *
   * Idempotência: a linha aponta `parentEntryId = lote estornado`, então o par
   * (usageKey, parentEntryId) é @@unique — webhook duplicado do MESMO pagamento bate P2002 e NÃO
   * incrementa a dívida 2×. Criação da linha + incremento do campo rodam na MESMA transação.
   */
  async registerChargebackDebt(
    companyId: number,
    opts: {
      amount: number;
      usageKey: string;
      parentLotId?: string | null;
      sourceRef?: string | null;
      userId?: number | null;
      metadata?: Record<string, unknown> | null;
    },
  ): Promise<{ debtAfter: number; alreadyProcessed: boolean }> {
    if (!isFiniteNonNegativeInt(opts.amount) || opts.amount <= 0) {
      throw new Error('registerChargebackDebt: amount deve ser inteiro positivo');
    }
    const usageKey = String(opts.usageKey || '').trim();
    if (!usageKey) throw new Error('registerChargebackDebt: usageKey é obrigatório (idempotência)');
    const wallet = await this.ensureWallet(companyId);

    // Pré-check rápido (atalho, NÃO a trava): a trava real é o @@unique + P2002 na tx abaixo.
    const existing = await this.prisma.creditLedgerEntry.findFirst({
      where: { usageKey, kind: 'chargeback_debt' },
    });
    if (existing) {
      return { debtAfter: await this.getChargebackDebt(companyId), alreadyProcessed: true };
    }

    try {
      const debtAfter = await this.prisma.$transaction(async (tx) => {
        await tx.creditLedgerEntry.create({
          data: {
            walletId: wallet.id,
            companyId,
            kind: 'chargeback_debt',
            amount: opts.amount,
            remaining: 0,
            actionKey: 'chargeback_debt',
            usageKey,
            parentEntryId: opts.parentLotId ?? null,
            sourceRef: opts.sourceRef ?? null,
            createdByUserId: opts.userId ?? null,
            metadataJson: this.json(opts.metadata),
          },
        });
        const updated = await tx.creditWallet.update({
          where: { companyId },
          data: { chargebackDebtCredits: { increment: opts.amount } },
        });
        return Math.max(0, updated.chargebackDebtCredits);
      });
      return { debtAfter, alreadyProcessed: false };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        // Webhook duplicado do mesmo pagamento (mesmo usageKey+lote): já contabilizado, no-op.
        return { debtAfter: await this.getChargebackDebt(companyId), alreadyProcessed: true };
      }
      throw error;
    }
  }

  /**
   * P0.3 hold — QUITA a dívida de chargeback com crédito NOVO ("crédito novo paga a dívida
   * primeiro"): debita do saldo `min(dívida, saldo)` via o MESMO laço FIFO do débito (movimento
   * `debit`, actionKey `chargeback_settlement` — não conta como consumo de lead) e reduz
   * `chargebackDebtCredits` no mesmo tanto. Chamado quando entra crédito (recarga paga / concessão
   * do master). Nunca deixa dívida < 0 nem debita além do saldo; se o saldo não cobrir tudo, quita
   * parcial e a empresa segue bloqueada até completar. Idempotência: usageKey própria por chamada.
   */
  async settleChargebackDebtFromBalance(
    companyId: number,
    opts: { usageKey: string; userId?: number | null; metadata?: Record<string, unknown> | null },
  ): Promise<{ settled: number; debtAfter: number }> {
    const wallet = await this.prisma.creditWallet.findUnique({ where: { companyId } });
    const debt = Math.max(0, Number(wallet?.chargebackDebtCredits || 0));
    if (!wallet || debt <= 0) return { settled: 0, debtAfter: debt };

    const now = new Date();
    const balance = await this.getBalance(companyId, now);
    const toSettle = Math.min(debt, balance);
    if (toSettle <= 0) return { settled: 0, debtAfter: debt };

    const usageKey = String(opts.usageKey || '').trim() || `chargeback-settle:${wallet.id}:${debt}`;
    const { consumed } = await this.consumeOpenLots({
      walletId: wallet.id,
      companyId,
      amount: toSettle,
      usageKey,
      movementKind: 'debit',
      actionKey: 'chargeback_settlement',
      userId: opts.userId ?? null,
      metadata: opts.metadata ?? null,
      now,
    });
    if (consumed <= 0) return { settled: 0, debtAfter: debt };

    // Decrementa só o que foi de fato consumido; clampa em 0 (corrida de duas quitações não deixa
    // a dívida negativa).
    const updated = await this.prisma.creditWallet.update({
      where: { companyId },
      data: { chargebackDebtCredits: { decrement: consumed } },
    });
    if (updated.chargebackDebtCredits < 0) {
      await this.prisma.creditWallet.update({ where: { companyId }, data: { chargebackDebtCredits: 0 } });
      return { settled: consumed, debtAfter: 0 };
    }
    return { settled: consumed, debtAfter: updated.chargebackDebtCredits };
  }

  /**
   * Reverte o(s) débito(s) daquela usageKey: devolve `remaining` aos lotes originais (via
   * parentEntryId) se ainda não expiraram. Se o lote original já expirou (ou não existe mais),
   * a devolução vira um LOTE novo (`kind: 'grant'`, sem data de expiração) — decisão de design
   * (ver S1-RESULTADO.md): não ressuscitar prazo de um lote morto, mas também não perder o
   * crédito do cliente por causa de timing. Sempre grava uma linha `kind: 'refund'` (movimento,
   * remaining=0) como trilha auditável, independente de qual dos dois caminhos foi tomado.
   *
   * Integridade de dinheiro (Fix A+B da revisão Opus S1): TODO o corpo (increments dos lotes +
   * lotes-novos de fallback + a linha `refund`) roda numa ÚNICA transação interativa — commita
   * junto ou nada. A linha `refund` é criada DENTRO da tx e serve de trava de idempotência: seu
   * par (usageKey=refundKey, parentEntryId) é `@@unique`, então dois refunds concorrentes da
   * mesma usageKey: o 2º bate P2002 → rollback total (nenhum increment dobrado) → tratado como
   * já-processado. Sem janela em que o crédito volta ao lote mas a trilha `refund` some.
   */
  async refund(
    companyId: number,
    opts: { usageKey: string; userId?: number | null; metadata?: Record<string, unknown> | null },
    now: Date = new Date(),
  ): Promise<RefundResult> {
    const usageKey = String(opts.usageKey || '').trim();
    if (!usageKey) throw new Error('refund: usageKey é obrigatório');

    // Idempotência do refund: chave dedicada derivada da usageKey do débito original
    // (nunca colide com a usageKey do débito em si, que já é usada por linhas `debit`).
    const refundKey = `refund:${usageKey}`;

    // Pré-check rápido (atalho, NÃO a trava): a trava real é o @@unique + P2002 na tx.
    const existingRefunds = await this.prisma.creditLedgerEntry.findMany({
      where: { usageKey: refundKey, kind: 'refund' },
    });
    if (existingRefunds.length > 0) {
      const refunded = existingRefunds.reduce((sum, row) => sum + row.amount, 0);
      const balanceAfter = await this.getBalance(companyId, now);
      return { refunded, balanceAfter, alreadyProcessed: true };
    }

    const debits = await this.prisma.creditLedgerEntry.findMany({
      where: { usageKey, kind: 'debit' },
    });
    if (debits.length === 0) {
      const balanceAfter = await this.getBalance(companyId, now);
      return { refunded: 0, balanceAfter, alreadyProcessed: false };
    }

    const wallet = await this.ensureWallet(companyId);

    let totalRefunded = 0;
    try {
      totalRefunded = await this.prisma.$transaction(async (tx) => {
        // Trava de idempotência PRIMEIRO: se um refund concorrente já rodou, este create bate
        // P2002 e a tx inteira faz rollback (nenhum increment é aplicado em dobro).
        await tx.creditLedgerEntry.create({
          data: {
            walletId: wallet.id,
            companyId,
            kind: 'refund',
            amount: debits.reduce((sum, row) => sum + row.amount, 0),
            remaining: 0,
            usageKey: refundKey,
            parentEntryId: debits[0]?.id ?? null,
            createdByUserId: opts.userId ?? null,
            metadataJson: this.json({ ...(opts.metadata || {}), originalUsageKey: usageKey }),
          },
        });

        let sum = 0;
        for (const debitRow of debits) {
          // Decide "lote vivo × morto" pelo estado ATUAL do lote (não por recálculo de data
          // desalinhado do job de expiração): tenta reincrementar o lote original SE ele ainda
          // não expirou segundo o `now` desta chamada; qualquer motivo (expirado/sumiu) cai no
          // fallback de lote novo. Dentro da tx serializada não há corrida a resolver por retry.
          let restoredToOriginalLot = false;
          if (debitRow.parentEntryId) {
            const fresh = await tx.creditLedgerEntry.findUnique({ where: { id: debitRow.parentEntryId } });
            const stillOpen = fresh && (!fresh.expiresAt || fresh.expiresAt.getTime() > now.getTime());
            if (fresh && stillOpen) {
              await tx.creditLedgerEntry.update({
                where: { id: fresh.id },
                data: { remaining: { increment: debitRow.amount } },
              });
              restoredToOriginalLot = true;
            }
          }

          if (!restoredToOriginalLot) {
            // Lote original expirado/ausente: devolve como LOTE novo com VALIDADE NOVA (decisão
            // do dono 04/07 — não ressuscita o prazo morto, mas também não perde o crédito nem
            // cria passivo perpétuo). kind:'grant' proposital (precisa ser lote consumível;
            // `adjust` é MOVIMENTO remaining=0 e não entraria no saldo). `sourceRef` deixa
            // rastreável a origem "refund sobre expirado".
            const parentLot = debitRow.parentEntryId
              ? await tx.creditLedgerEntry.findUnique({ where: { id: debitRow.parentEntryId } })
              : null;
            await tx.creditLedgerEntry.create({
              data: {
                walletId: wallet.id,
                companyId,
                kind: 'grant',
                amount: debitRow.amount,
                remaining: debitRow.amount,
                expiresAt: new Date(now.getTime() + REFUND_EXPIRED_LOT_VALIDITY_MS),
                grantType: parentLot?.grantType ?? null,
                sourceRef: `refund-expired-lot:${debitRow.id}`,
              },
            });
          }

          sum += debitRow.amount;
        }
        return sum;
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        // Refund concorrente já processou esta usageKey — relê o que foi committado.
        const rows = await this.prisma.creditLedgerEntry.findMany({
          where: { usageKey: refundKey, kind: 'refund' },
        });
        const refunded = rows.reduce((sum, row) => sum + row.amount, 0);
        const balanceAfter = await this.getBalance(companyId, now);
        return { refunded, balanceAfter, alreadyProcessed: true };
      }
      throw error;
    }

    const balanceAfter = await this.getBalance(companyId, now);
    return { refunded: totalRefunded, balanceAfter, alreadyProcessed: false };
  }

  /**
   * Job: lotes com expiresAt < now e remaining>0 → escreve `expire`, zera `remaining`.
   * Retorna quantos créditos expiraram (breakage) e quantas entradas de lote foram fechadas,
   * para o painel do master. Roda contra TODAS as wallets (varredura global, sem companyId).
   *
   * Integridade de dinheiro (Fix A da revisão Opus S1): zerar `remaining` + gravar a linha
   * `expire` roda na MESMA transação interativa — commitam juntos ou nada. O optimistic lock
   * (`updateMany where remaining = fresh.remaining`) garante que só a 1ª execução zera o lote:
   * uma 2ª passada vê `remaining=0` e para antes de escrever, então nunca duplica o breakage.
   */
  async expireLots(now: Date = new Date()): Promise<ExpireLotsResult> {
    const expiredLots = await this.prisma.creditLedgerEntry.findMany({
      where: {
        kind: { in: ['grant', 'recharge', 'promo'] },
        remaining: { gt: 0 },
        expiresAt: { lt: now },
      },
    });

    let expiredEntries = 0;
    let expiredCredits = 0;

    for (const lot of expiredLots) {
      for (let attempt = 0; attempt < MAX_CONCURRENCY_RETRIES; attempt++) {
        const fresh = await this.prisma.creditLedgerEntry.findUnique({ where: { id: lot.id } });
        if (!fresh || fresh.remaining <= 0) break;
        if (!fresh.expiresAt || fresh.expiresAt.getTime() >= now.getTime()) break;

        let committedAmount = 0;
        try {
          committedAmount = await this.prisma.$transaction(async (tx) => {
            const result = await tx.creditLedgerEntry.updateMany({
              where: { id: fresh.id, remaining: fresh.remaining },
              data: { remaining: 0 },
            });
            if (result.count !== 1) {
              // Perdeu a corrida (outro writer/passada mexeu no remaining) — aborta a tx sem
              // gravar; o laço externo relê e decide de novo.
              throw new ConcurrencyRetrySignal();
            }
            await tx.creditLedgerEntry.create({
              data: {
                walletId: fresh.walletId,
                companyId: fresh.companyId,
                kind: 'expire',
                amount: fresh.remaining,
                remaining: 0,
                parentEntryId: fresh.id,
                sourceRef: 'expireLots-job',
              },
            });
            return fresh.remaining;
          });
        } catch (error) {
          if (error instanceof ConcurrencyRetrySignal) continue;
          throw error;
        }

        expiredEntries += 1;
        expiredCredits += committedAmount;
        break;
      }
    }

    return { expiredEntries, expiredCredits };
  }
}
