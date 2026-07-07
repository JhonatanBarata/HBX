import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceiroService } from './financeiro.service';
import { MercadoPagoClientService } from '../payments/mercado-pago-client.service';
import { resolveCompanyMercadoPagoAccess } from '../modules/master-global-integrations.util';
import { CreditWalletService } from '../credits/credit-wallet.service';
import { CreditPackConfigService } from '../credits/credit-pack-config.service';
import { computeDefaultExpiresAt } from '../credits/credit-pack-catalog';
import { isCreditsFeatureEnabled } from '../credits/credits.flags';
import { isBillingOwnerActor } from '../access/actor-kind';
import { emitMasterEvent } from '../common/master-event';

/**
 * CRÉDITOS S3-PARTE2 — recarga self-service da carteira via MercadoPago (cartão one-off).
 *
 * Mora no FINANCEIRO (não no credits) de propósito: a direção de dependência
 * CommercialPlans→Credits exige que o CreditsModule continue dependendo SÓ do Prisma
 * (invariante do S2); o financeiro já importa o MP client e é a casa única da Regra
 * de Ouro. Serviço NOVO (não engordar o financeiro.service de 4.4k linhas) e testável.
 *
 * Regras de dinheiro:
 * - REGRA DE OURO: crédito só entra com pagamento APROVADO na resposta síncrona do MP
 *   (mesmo caminho provado do upgrade live). Recusou/falhou → nada muda, código claro.
 * - Idempotência em 3 camadas: X-Idempotency-Key do MP derivada da idempotencyKey do
 *   FRONT (retry de rede não cobra 2x — o MP dedupa e devolve o MESMO pagamento);
 *   `usageKey` do lote derivada do payment id (grant dedupa no ledger); charge fiscal
 *   dedupado por externalReference único.
 * - Receita NA COMPRA (D3/S5): grava FinanceiroCharge aprovado/pago na hora — regime de
 *   caixa; o fiscal (Livro Caixa/contador-robô) consome daí. `grantType: 'paid'`.
 * - LEI DO VENDEDOR: só dono/master recarrega (isBillingOwnerActor). Vendedor E gerente
 *   recebem Forbidden NEUTRO (sem mencionar preço/pacote).
 * - Cartão-only nesta fase: Pix/boleto exigem confirmação assíncrona (webhook 2-fases) —
 *   fica explícito como próxima onda, não meio-implementado aqui.
 */

export type RechargeInput = {
  packKey: string;
  idempotencyKey: string;
  cardTokenId?: string | null;
  paymentMethodId?: string | null;
  taxDocument?: string | null;
};

export type RechargeResult =
  | {
      ok: true;
      credited: number;
      balanceAfter: number;
      paymentId: string;
      mock: boolean;
      expiresAt: Date | null;
    }
  | {
      ok: false;
      code: 'CARD_REQUIRED' | 'CHARGE_FAILED' | 'CHARGE_DECLINED';
      message: string;
      packKey: string;
      amount: number;
    };

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class CreditRechargeService {
  private readonly logger = new Logger(CreditRechargeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mercadoPagoClient: MercadoPagoClientService,
    private readonly wallet: CreditWalletService,
    private readonly packConfig: CreditPackConfigService,
    private readonly financeiro: FinanceiroService,
  ) {}

  // Mesma régua do financeiro.service (isMockPaymentsProvider): mock SÓ em dev.
  private isMockPayments() {
    const provider = String(process.env.PAYMENTS_PROVIDER || 'mercadopago').trim().toLowerCase();
    return provider === 'mock' && String(process.env.NODE_ENV || '').trim() === 'development';
  }

  private normalizeProviderPaymentStatus(value: unknown) {
    const normalized = String(value || '').trim().toLowerCase();
    if (['approved', 'accredited'].includes(normalized)) return 'approved';
    if (['rejected', 'failed'].includes(normalized)) return 'failed';
    if (['cancelled', 'canceled'].includes(normalized)) return 'cancelled';
    return 'pending';
  }

  private monthKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  // Isolado num método pra ser patchável em teste (o util real puxa o runtime schema
  // do master via raw SQL — infra pesada que não pertence à prova da orquestração).
  private async resolveMpAccessToken(companyId: number): Promise<string> {
    const resolved = await resolveCompanyMercadoPagoAccess(this.prisma, companyId);
    return String(resolved?.accessToken || '').trim();
  }

  async rechargeWithCard(
    user: {
      id?: unknown;
      email?: string | null;
      role?: unknown;
      isSystemMaster?: boolean;
      canViewBilling?: boolean;
      companyId?: unknown;
    },
    input: RechargeInput,
  ): Promise<RechargeResult> {
    if (!isCreditsFeatureEnabled()) {
      throw new NotFoundException('Recurso indisponivel');
    }
    // LEI DO VENDEDOR: bloqueio NEUTRO pra vendedor e gerente — não citar preço/pacote.
    if (!isBillingOwnerActor(user as any)) {
      throw new ForbiddenException('Acesso restrito ao responsável da conta.');
    }
    const companyId = Math.trunc(Number(user?.companyId || 0));
    if (!companyId) throw new ForbiddenException('Nenhuma empresa em contexto');

    const idempotencyKey = String(input?.idempotencyKey || '').trim();
    if (idempotencyKey.length < 8 || idempotencyKey.length > 80) {
      throw new BadRequestException('idempotencyKey obrigatória (8-80 chars, gere um UUID por intenção de recarga)');
    }

    const pack = this.packConfig.listAvailable().find(
      (p) => p.key === String(input?.packKey || '').trim(),
    );
    if (!pack || !(pack.credits > 0) || !(pack.price > 0)) {
      throw new BadRequestException('Pacote de crédito indisponível');
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, taxDocument: true },
    });
    if (!company) throw new BadRequestException('Empresa não encontrada');

    const amount = Number(pack.price.toFixed(2));
    const expiresAt =
      Number(pack.defaultExpiryDays) > 0
        ? new Date(Date.now() + Number(pack.defaultExpiryDays) * DAY_MS)
        : computeDefaultExpiresAt();
    const externalReference = `hbx-credit-recharge-${companyId}-${idempotencyKey}`;
    const mock = this.isMockPayments();

    let paymentId: string;
    if (mock) {
      // MOCK (dev): sem gateway; a idempotencyKey do front É a identidade do pagamento.
      paymentId = `mock-${idempotencyKey}`;
    } else {
      if (!input?.cardTokenId || !input?.paymentMethodId) {
        return {
          ok: false,
          code: 'CARD_REQUIRED',
          message: 'Informe o cartão para concluir a recarga de créditos.',
          packKey: pack.key,
          amount,
        };
      }
      const accessToken = await this.resolveMpAccessToken(companyId);
      if (!accessToken) {
        throw new BadRequestException({
          code: 'MERCADO_PAGO_MASTER_NOT_LINKED',
          message: 'Mercado Pago não está pronto para esta empresa.',
        });
      }
      const docDigits = String(input.taxDocument || company.taxDocument || '').replace(/\D/g, '');
      let payment: any;
      try {
        payment = await this.mercadoPagoClient.createPayment(
          accessToken,
          {
            transaction_amount: amount,
            token: input.cardTokenId,
            installments: 1,
            payment_method_id: input.paymentMethodId,
            description: `Recarga de créditos HBX — ${pack.title} (${pack.credits} créditos)`,
            external_reference: externalReference,
            metadata: {
              company_id: companyId,
              source: 'credit_recharge',
              pack_key: pack.key,
              credits: pack.credits,
            },
            payer: {
              email: String(user?.email || '').trim(),
              ...(docDigits
                ? { identification: { type: docDigits.length > 11 ? 'CNPJ' : 'CPF', number: docDigits } }
                : {}),
            },
          },
          // X-Idempotency-Key = intenção do FRONT: retry de rede da MESMA intenção não
          // cobra 2x (o MP dedupa e devolve o mesmo pagamento). Nunca randomUUID aqui.
          `credrech-${idempotencyKey}`,
        );
      } catch (error: any) {
        this.logger.warn(
          `credit_recharge_charge_failed company=${companyId} pack=${pack.key} error=${String(error?.message || error)}`,
        );
        return {
          ok: false,
          code: 'CHARGE_FAILED',
          message: String(error?.message || 'Não foi possível cobrar o cartão. Tente novamente.'),
          packKey: pack.key,
          amount,
        };
      }
      if (this.normalizeProviderPaymentStatus(payment?.status) !== 'approved') {
        return {
          ok: false,
          code: 'CHARGE_DECLINED',
          message: 'Pagamento recusado. Confira os dados do cartão ou tente outro.',
          packKey: pack.key,
          amount,
        };
      }
      paymentId = String(payment?.id || `ref-${idempotencyKey}`);
    }

    // Pagamento APROVADO daqui pra baixo. Crédito + receita, ambos idempotentes:
    // 1) Lote no ledger (usageKey = identidade do pagamento → retry não dobra crédito).
    // INTEGRIDADE DE DINHEIRO: o cartão JÁ foi cobrado no MP. Se o grant falhar aqui
    // (erro de banco), o cliente pagou e NÃO recebeu crédito. Não há como estornar
    // silenciosamente, então: (a) alerta o master (visível na janela Pagamentos do /master
    // via MasterEvent action_required) pra reconciliação manual; (b) rethrow com erro claro —
    // o retry do cliente converge porque o grant é idempotente por `mp:<paymentId>` (não
    // cobra 2x no MP: a mesma X-Idempotency-Key devolve o mesmo pagamento).
    let grant: { entryId: string; amount: number; alreadyProcessed: boolean };
    try {
      grant = await this.wallet.grant(companyId, pack.credits, {
        kind: 'recharge',
        grantType: 'paid',
        expiresAt,
        sourceRef: paymentId,
        usageKey: `mp:${paymentId}`,
        createdByUserId: Math.trunc(Number(user?.id || 0)) || null,
        metadata: { packKey: pack.key, price: amount, idempotencyKey },
      });
    } catch (error: any) {
      await this.alertRechargeOrphan(companyId, {
        stage: 'grant',
        paymentId,
        amount,
        packKey: pack.key,
        credits: pack.credits,
        mock,
        error: String(error?.message || error),
      });
      throw error;
    }

    // 2) Receita NA COMPRA (regime de caixa) — S5: o fiscal (Livro Caixa/DAS) SÓ enxerga
    //    receita que está no MasterBillingLedgerEntry (entryGroup 'revenue') LIGADA à
    //    FinanceiroCharge via ledgerEntryId (é esse link que faz estorno abater o líquido).
    //    Charge + linha do ledger + link commitam JUNTOS (transação): sem janela de
    //    "receita fantasma" (ledger sem charge) nem "receita invisível" (charge sem ledger).
    //    Idempotência: externalReference @unique — retry cai no P2002, nada duplica.
    const existingCharge = await this.prisma.financeiroCharge.findFirst({
      where: { externalReference },
      select: { id: true },
    });
    if (!existingCharge) {
      const now = new Date();
      const description = `Recarga de créditos — ${pack.title} (${pack.credits} créditos)`;
      try {
        await this.prisma.$transaction(async (tx) => {
          const charge = await tx.financeiroCharge.create({
            data: {
              companyId,
              amount,
              description,
              billingCycle: 'MONTHLY',
              paymentMethod: 'CARD',
              status: 'approved',
              lifecycle: 'paid',
              competence: this.monthKey(now),
              externalReference,
              mpPaymentId: mock ? null : paymentId,
              paidAt: now,
              createdByUserId: Math.trunc(Number(user?.id || 0)) || null,
              providerPayload: JSON.stringify({
                source: 'credit_recharge',
                packKey: pack.key,
                credits: pack.credits,
                mock,
              }),
            },
          });
          const ledgerEntryId = await this.financeiro.insertBillingLedgerEntry(
            {
              companyId,
              createdByUserId: Math.trunc(Number(user?.id || 0)) || null,
              entryType: mock ? 'CREDIT_RECHARGE_MOCK' : 'CREDIT_RECHARGE',
              entryGroup: 'revenue',
              status: 'APPROVED',
              origin: 'credit_recharge',
              competence: this.monthKey(now),
              amount,
              paidAt: now,
              paymentMethod: 'CARD',
              referenceLabel: description,
              metadata: { packKey: pack.key, credits: pack.credits, paymentId, mock },
            },
            tx,
          );
          await tx.financeiroCharge.update({
            where: { id: charge.id },
            data: { ledgerEntryId },
          });
        });
      } catch (error: any) {
        if (error?.code !== 'P2002') {
          // Crédito JÁ entrou (grant acima), mas a receita/charge fiscal falhou: "receita
          // invisível". Alerta o master pra reconciliar o fiscal e rethrow (o retry recria a
          // charge — o bloco é escopado por externalReference @unique, não duplica).
          await this.alertRechargeOrphan(companyId, {
            stage: 'charge',
            paymentId,
            amount,
            packKey: pack.key,
            credits: pack.credits,
            mock,
            error: String(error?.message || error),
          });
          throw error;
        }
        // Corrida de retry: outro processo já gravou a MESMA cobrança+ledger — ok, segue.
      }
    }

    const balanceAfter = await this.wallet.getBalance(companyId);
    return {
      ok: true,
      credited: grant.alreadyProcessed ? 0 : pack.credits,
      balanceAfter,
      paymentId,
      mock,
      expiresAt,
    };
  }

  /**
   * Pagamento aprovado no MP mas o pós-cobrança falhou (grant ou charge fiscal): o cliente
   * pagou e algo ficou pela metade. Emite um MasterEvent `action_required` (aparece na janela
   * Pagamentos do /master) + log de erro alto, pra reconciliação manual. Best-effort PURO —
   * o emitMasterEvent nunca lança (contrato), e aqui blindamos de novo: alertar NUNCA pode
   * mascarar/atrapalhar o rethrow do erro original que trouxe a gente até aqui.
   */
  private async alertRechargeOrphan(
    companyId: number,
    detail: {
      stage: 'grant' | 'charge';
      paymentId: string;
      amount: number;
      packKey: string;
      credits: number;
      mock: boolean;
      error: string;
    },
  ): Promise<void> {
    this.logger.error(
      `credit_recharge_orphan_payment stage=${detail.stage} company=${companyId} ` +
        `paymentId=${detail.paymentId} amount=${detail.amount} pack=${detail.packKey} ` +
        `mock=${detail.mock} error=${detail.error}`,
    );
    try {
      await emitMasterEvent(this.prisma, {
        type: 'credit.recharge_orphan',
        severity: 'action_required',
        companyId,
        // dedup por pagamento: um mesmo paymentId órfão não metralha a trilha do master.
        dedupKey: `credit-recharge-orphan:${detail.paymentId}`,
        payload: {
          state: detail.stage,
          paymentId: detail.paymentId,
          amount: detail.amount,
          packKey: detail.packKey,
          credits: detail.credits,
          mock: detail.mock,
          error: detail.error,
        },
      });
    } catch {
      // emitMasterEvent já é best-effort; guarda extra pra alerta jamais engolir/trocar o erro real.
    }
  }
}
