import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceiroService } from './financeiro.service';
import { HbxCommissionSyncService } from '../commissions/hbx-commission-sync.service';
import { MercadoPagoClientService } from '../payments/mercado-pago-client.service';
import { resolvePlatformMercadoPagoAccess } from '../modules/master-global-integrations.util';
import { CreditWalletService } from '../credits/credit-wallet.service';
import { CreditPackConfigService } from '../credits/credit-pack-config.service';
import { computeDefaultExpiresAt } from '../credits/credit-pack-catalog';
import { isCreditsFeatureEnabled } from '../credits/credits.flags';
import { IndicacaoService } from '../credits/indicacao.service';
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
      code: 'CARD_REQUIRED' | 'CHARGE_FAILED' | 'CHARGE_DECLINED' | 'CHARGE_PENDING';
      message: string;
      packKey: string;
      amount: number;
    };

// PIX (PR22082026-CLIENTE-ME-ACHA) — a recarga em 2 fases: o QR nasce PENDENTE e o crédito
// só entra quando o MP diz "aprovado" (poll do painel OU webhook — quem chegar primeiro).
export type PixRechargeInput = {
  packKey: string;
  idempotencyKey: string;
  taxDocument?: string | null;
};

export type PixRechargeStatus = 'pending' | 'approved' | 'cancelled';

export type PixRechargeCreateResult =
  | {
      ok: true;
      status: PixRechargeStatus;
      paymentId: string;
      packKey: string;
      credits: number;
      amount: number;
      qrCode: string | null;
      qrCodeBase64: string | null;
      ticketUrl: string | null;
      expiresAt: string | null;
      mock: boolean;
    }
  | {
      ok: false;
      code: 'CHARGE_FAILED';
      message: string;
      packKey: string;
      amount: number;
    };

export type PixRechargeStatusResult = {
  ok: true;
  status: PixRechargeStatus;
  paymentId: string;
  credited: number;
  balanceAfter: number | null;
  expiresAt: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** Validade do QR Pix. Curta de propósito: QR velho aprovado depois de a tela fechar é
 *  crédito que entra sem ninguém ver — 30 min cobre o "abri o banco e paguei". */
const PIX_EXPIRES_MS = 30 * 60 * 1000;
const CREDIT_RECHARGE_REFERENCE_PREFIX = 'hbx-credit-recharge-';

@Injectable()
export class CreditRechargeService {
  private readonly logger = new Logger(CreditRechargeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mercadoPagoClient: MercadoPagoClientService,
    private readonly wallet: CreditWalletService,
    private readonly packConfig: CreditPackConfigService,
    private readonly financeiro: FinanceiroService,
    // FURO 2 (11/07): comissão sobre recarga. @Optional pra não quebrar DI/testes antigos —
    // ausente = recarga segue sem comissionar (mesmo efeito do % desarmado).
    @Optional() private readonly commissionSync?: HbxCommissionSyncService,
    // S5 INDICAÇÃO: bônus de indicação na 1ª recarga PAGA aprovada. @Optional pelo mesmo
    // motivo — ausente/flag OFF = recarga idêntica, zero bônus.
    @Optional() private readonly indicacao?: IndicacaoService,
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
  private async resolveMpAccessToken(_companyId: number): Promise<string> {
    // FINANCEIRO-UNIVERSAL P1 — recarga de crédito é RECEITA DA PLATAFORMA: cai SEMPRE
    // na conta MP do master, NUNCA na do tenant (furo I5). Ignora companyId de propósito
    // (mantido na assinatura para não mexer nos call-sites/testes).
    const resolved = await resolvePlatformMercadoPagoAccess(this.prisma);
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

    // FIXER PR10072026 — retry de intenção que JÁ virou cobrança aprovada: devolve o
    // resultado gravado SEM chamar o gateway. Fecha a janela de migração do formato da
    // X-Idempotency-Key (pagamento aprovado com a key antiga + reenvio pós-deploy geraria
    // key NOVA no MP → cartão cobrado 2×) e vira a trava permanente de re-cobrança.
    const priorCharge = await this.prisma.financeiroCharge.findFirst({
      where: { externalReference, companyId },
      select: { id: true, mpPaymentId: true },
    });
    if (priorCharge) {
      const balanceAfter = await this.wallet.getBalance(companyId);
      return {
        ok: true,
        credited: 0, // o crédito entrou na execução que criou a charge (grant idempotente)
        balanceAfter,
        paymentId: String(priorCharge.mpPaymentId || (mock ? `mock-${idempotencyKey}` : externalReference)),
        mock,
        expiresAt, // aproximação (mesma política de validade); a data exata vive no lote
      };
    }

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
          // X-Idempotency-Key = intenção do FRONT escopada pela EMPRESA: retry de rede da
          // MESMA intenção não cobra 2x (o MP dedupa e devolve o mesmo pagamento). O escopo
          // por companyId é OBRIGATÓRIO — a maioria das empresas usa o token MP do MASTER,
          // então keys iguais de empresas diferentes colidem na MESMA conta MP e a segunda
          // empresa receberia o pagamento da primeira como "dedup". Nunca randomUUID aqui.
          `credrech-${companyId}-${idempotencyKey}`,
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
      const providerPaymentStatus = this.normalizeProviderPaymentStatus(payment?.status);
      if (providerPaymentStatus === 'pending') {
        return {
          ok: false,
          code: 'CHARGE_PENDING',
          message: 'Pagamento em análise. Aguarde a confirmação antes de tentar novamente.',
          packKey: pack.key,
          amount,
        };
      }
      if (providerPaymentStatus !== 'approved') {
        return {
          ok: false,
          code: 'CHARGE_DECLINED',
          message: 'Pagamento recusado. Confira os dados do cartão ou tente outro.',
          packKey: pack.key,
          amount,
        };
      }
      // P0.4 — amarração pagamento↔empresa/intenção, fail-closed ANTES de qualquer crédito.
      // A resposta do MP precisa provar que é O NOSSO pagamento: id presente (NUNCA sintetizar
      // — id inventado quebraria a idempotência do grant e o rastreio de estorno),
      // external_reference desta empresa+intenção, valor exato do pack (MP devolve decimal em
      // reais — comparação em centavos, sem ruído de float) e moeda BRL. Divergência = alerta
      // action_required + erro; o retry do cliente NÃO recobra (mesma X-Idempotency-Key
      // devolve o mesmo pagamento no MP).
      const respPaymentId = String(payment?.id ?? '').trim();
      const respReference = String(payment?.external_reference ?? '').trim();
      const respAmount = Number(payment?.transaction_amount);
      const respCurrency = String(payment?.currency_id ?? '').trim().toUpperCase();
      const divergence = !respPaymentId
        ? 'payment_id_ausente'
        : respReference !== externalReference
          ? 'external_reference_divergente'
          : !Number.isFinite(respAmount) || Math.round(respAmount * 100) !== Math.round(amount * 100)
            ? 'valor_divergente'
            : respCurrency !== 'BRL'
              ? 'moeda_divergente'
              : null;
      if (divergence) {
        await this.alertRechargeDivergence(companyId, {
          reason: divergence,
          externalReference,
          paymentId: respPaymentId || null,
          packKey: pack.key,
          credits: pack.credits,
          expected: { externalReference, amount, currency: 'BRL' },
          received: {
            paymentId: respPaymentId || null,
            externalReference: respReference || null,
            amount: Number.isFinite(respAmount) ? respAmount : null,
            currency: respCurrency || null,
            status: String(payment?.status ?? '') || null,
          },
        });
        throw new BadGatewayException({
          code: 'CREDIT_RECHARGE_RESPONSE_MISMATCH',
          message: 'Resposta do provedor de pagamento não confere com esta recarga. Nossa equipe foi alertada.',
        });
      }
      paymentId = respPaymentId;
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
        // P0.4 — P2002 SÓ é retry benigno se a linha que já existe for DESTA empresa.
        // Com o token MP do master compartilhado entre empresas, um mpPaymentId pode
        // colidir com cobrança de OUTRA empresa — engolir isso viraria falso-sucesso
        // silencioso cruzando tenants. externalReference embute o companyId, então o
        // conflito cross-empresa real é o do mpPaymentId (@unique).
        const conflicting = await this.prisma.financeiroCharge.findFirst({
          where: mock
            ? { externalReference }
            : { OR: [{ externalReference }, { mpPaymentId: paymentId }] },
          select: { id: true, companyId: true },
        });
        if (conflicting && conflicting.companyId !== companyId) {
          await this.alertRechargeDivergence(companyId, {
            reason: 'charge_conflito_cross_empresa',
            externalReference,
            paymentId,
            packKey: pack.key,
            credits: pack.credits,
            received: {
              conflictingChargeId: conflicting.id,
              conflictingCompanyId: conflicting.companyId,
            },
          });
          throw new ConflictException({
            code: 'CREDIT_RECHARGE_CROSS_COMPANY_CONFLICT',
            message: 'Conflito de pagamento entre contas detectado. Nossa equipe foi alertada.',
          });
        }
        // Corrida de retry da MESMA empresa: outro processo já gravou a MESMA
        // cobrança+ledger — ok, segue.
      }
    }

    // FURO 2 (11/07, decisão do dono): recarga PAGA entra no incentivo do vendedor — comissão
    // sobre o valor REAL cobrado. Desarmada por default (HBX_COMMISSION_RECHARGE_PERCENT=0) e
    // BEST-EFFORT: nunca quebra uma recarga que o cartão já pagou; idempotente por charge no
    // próprio sync (kind 'recharge', cycleKey `recharge:<chargeId>`).
    if (this.commissionSync) {
      const chargeRow = await this.prisma.financeiroCharge.findFirst({
        where: { externalReference },
        select: { id: true, amount: true },
      }).catch(() => null);
      if (chargeRow) {
        await this.commissionSync.createRechargeCommission({
          companyId,
          chargeId: chargeRow.id,
          amount: Number(chargeRow.amount || amount),
          source: 'credit_recharge',
        }).catch(() => undefined);
      }
    }

    // S5 INDICAÇÃO — bônus pros dois lados na 1ª recarga PAGA aprovada da empresa indicada
    // (HBX_INDICACAO_ENABLED default OFF = no-op imediato). BEST-EFFORT PURO: o cartão JÁ
    // foi cobrado e o crédito da recarga JÁ entrou — bônus de indicação JAMAIS quebra o
    // fluxo de pagamento. Idempotente no ledger (usageKeys estáveis) — retry não dobra.
    if (this.indicacao) {
      await this.indicacao.onPrimeiraRecargaAprovada(companyId).catch((error: any) => {
        this.logger.warn(
          `indicacao_bonus_hook_failed company=${companyId} paymentId=${paymentId} error=${String(error?.message || error)}`,
        );
      });
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

  // ── PIX (PR22082026-CLIENTE-ME-ACHA) ─────────────────────────────────────────
  //
  // Por que Pix entra agora e entra ASSIM: dono de distribuidora paga Pix; cartão
  // empresarial é exceção. A recarga de cartão é síncrona (o MP responde aprovado na
  // hora); Pix é em 2 fases — o QR nasce PENDENTE e o crédito só entra quando o MP
  // confirma. Quem confirma é QUEM CHEGAR PRIMEIRO: o poll do painel (o cliente está
  // com a tela aberta esperando) ou o webhook. Os dois caem em `settlePixCharge`, que é
  // idempotente (grant por usageKey `mp:<paymentId>`, charge por externalReference
  // @unique, receita só se a charge ainda não tem ledgerEntryId).
  //
  // 🔴 A MESMA REGRA DE OURO DO CARTÃO: nada de crédito em cima de resposta que não
  // prova ser nossa (id presente, external_reference/valor/moeda batem, tenant bate).

  private assertBillingOwnerCompany(user: {
    role?: unknown;
    isSystemMaster?: boolean;
    canViewBilling?: boolean;
    companyId?: unknown;
  }): number {
    if (!isCreditsFeatureEnabled()) {
      throw new NotFoundException('Recurso indisponivel');
    }
    // LEI DO VENDEDOR: bloqueio NEUTRO pra vendedor e gerente — não citar preço/pacote.
    if (!isBillingOwnerActor(user as any)) {
      throw new ForbiddenException('Acesso restrito ao responsável da conta.');
    }
    const companyId = Math.trunc(Number(user?.companyId || 0));
    if (!companyId) throw new ForbiddenException('Nenhuma empresa em contexto');
    return companyId;
  }

  private publicApiBaseUrl() {
    const explicit = process.env.PUBLIC_API_BASE_URL || process.env.API_PUBLIC_URL || process.env.BACKEND_PUBLIC_URL || '';
    if (String(explicit).trim()) return String(explicit).trim().replace(/\/+$/, '');
    return `http://localhost:${Number(process.env.APP_PORT || 3000)}`;
  }

  /** Formato de data que o MP exige em `date_of_expiration`: ISO com offset explícito. */
  private formatMpDate(date: Date): string {
    const pad = (n: number, l = 2) => String(n).padStart(l, '0');
    const off = -date.getTimezoneOffset();
    const sign = off >= 0 ? '+' : '-';
    const abs = Math.abs(off);
    return (
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
      `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}` +
      `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
    );
  }

  private parseChargePayload(raw: unknown): Record<string, any> {
    if (!raw) return {};
    if (typeof raw === 'object') return raw as Record<string, any>;
    try {
      const parsed = JSON.parse(String(raw));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  /** É uma cobrança de RECARGA DE CRÉDITO (e não assinatura/checkout/recovery)? */
  private isCreditRechargeCharge(charge: any): boolean {
    if (!charge) return false;
    if (String(charge.externalReference || '').startsWith(CREDIT_RECHARGE_REFERENCE_PREFIX)) return true;
    return String(this.parseChargePayload(charge.providerPayload).source || '') === 'credit_recharge';
  }

  private pixStatusFromCharge(charge: any): PixRechargeStatus {
    const status = String(charge?.status || '').toLowerCase();
    if (status === 'approved') return 'approved';
    if (['cancelled', 'failed', 'refunded', 'partially_refunded', 'charged_back'].includes(status)) return 'cancelled';
    return 'pending';
  }

  private serializePixCharge(charge: any, extra?: { mock?: boolean }): PixRechargeCreateResult {
    const payload = this.parseChargePayload(charge.providerPayload);
    return {
      ok: true,
      status: this.pixStatusFromCharge(charge),
      paymentId: String(charge.mpPaymentId || ''),
      packKey: String(payload.packKey || ''),
      credits: Number(payload.credits || 0),
      amount: Number(charge.amount || 0),
      qrCode: charge.pixQrCode || null,
      qrCodeBase64: charge.pixQrCodeBase64 || null,
      ticketUrl: charge.pixTicketUrl || null,
      expiresAt: payload.expiresAt ? String(payload.expiresAt) : null,
      mock: Boolean(extra?.mock ?? payload.mock),
    };
  }

  /**
   * Fase 1 — gera o QR. A cobrança nasce PENDENTE no FinanceiroCharge (com o QR guardado
   * nas colunas pix* que o checkout Pix do financeiro já usa). Reabrir a MESMA intenção
   * (mesma idempotencyKey) devolve o MESMO QR enquanto ele vale — refresh da tela não
   * gera pagamento novo no MP.
   */
  async createPixRecharge(
    user: {
      id?: unknown;
      email?: string | null;
      role?: unknown;
      isSystemMaster?: boolean;
      canViewBilling?: boolean;
      companyId?: unknown;
    },
    input: PixRechargeInput,
  ): Promise<PixRechargeCreateResult> {
    const companyId = this.assertBillingOwnerCompany(user);

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
      select: { id: true, taxDocument: true, contactEmail: true },
    });
    if (!company) throw new BadRequestException('Empresa não encontrada');

    const amount = Number(pack.price.toFixed(2));
    const externalReference = `${CREDIT_RECHARGE_REFERENCE_PREFIX}${companyId}-${idempotencyKey}`;
    const mock = this.isMockPayments();
    const expiryDays = Number(pack.defaultExpiryDays) > 0 ? Number(pack.defaultExpiryDays) : null;

    // A MESMA intenção já virou cobrança? Reabre o que existe — nunca cria 2º pagamento.
    const prior = await this.prisma.financeiroCharge.findFirst({ where: { externalReference, companyId } });
    if (prior) {
      const status = this.pixStatusFromCharge(prior);
      if (status === 'cancelled') {
        return {
          ok: false,
          code: 'CHARGE_FAILED',
          message: 'Este QR Pix expirou. Gere um novo para continuar.',
          packKey: pack.key,
          amount,
        };
      }
      return this.serializePixCharge(prior, { mock });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + PIX_EXPIRES_MS);
    let paymentId: string;
    let qrCode: string | null = null;
    let qrCodeBase64: string | null = null;
    let ticketUrl: string | null = null;
    let providerSnapshot: any = null;

    if (mock) {
      // MOCK (dev): sem gateway. O QR é de mentira e o 1º poll "paga" (ver getPixRechargeStatus).
      paymentId = `mock-pix-${idempotencyKey}`;
      qrCode = `00020126580014br.gov.bcb.pix0136MOCK-HBX-${idempotencyKey}5204000053039865802BR5903HBX6009SAO PAULO62070503***6304MOCK`;
    } else {
      const accessToken = await this.resolveMpAccessToken(companyId);
      if (!accessToken) {
        throw new BadRequestException({
          code: 'MERCADO_PAGO_MASTER_NOT_LINKED',
          message: 'Mercado Pago não está pronto para esta empresa.',
        });
      }
      const docDigits = String(input.taxDocument || company.taxDocument || '').replace(/\D/g, '');
      const payerEmail = String(user?.email || company.contactEmail || '').trim();
      let payment: any;
      try {
        payment = await this.mercadoPagoClient.createPayment(
          accessToken,
          {
            transaction_amount: amount,
            description: `Recarga de créditos HBX — ${pack.title} (${pack.credits} créditos)`,
            payment_method_id: 'pix',
            notification_url: `${this.publicApiBaseUrl()}/webhooks/mercadopago/financeiro?company_id=${companyId}`,
            external_reference: externalReference,
            date_of_expiration: this.formatMpDate(expiresAt),
            metadata: {
              company_id: companyId,
              source: 'credit_recharge',
              pack_key: pack.key,
              credits: pack.credits,
              method: 'pix',
            },
            payer: {
              email: payerEmail,
              ...(docDigits
                ? { identification: { type: docDigits.length > 11 ? 'CNPJ' : 'CPF', number: docDigits } }
                : {}),
            },
          } as any,
          // Mesma lei da X-Idempotency-Key do cartão: intenção do front ESCOPADA pela empresa.
          `credrechpix-${companyId}-${idempotencyKey}`,
        );
      } catch (error: any) {
        this.logger.warn(
          `credit_recharge_pix_create_failed company=${companyId} pack=${pack.key} error=${String(error?.message || error)}`,
        );
        return {
          ok: false,
          code: 'CHARGE_FAILED',
          message: String(error?.message || 'Não foi possível gerar o Pix agora. Tente novamente.'),
          packKey: pack.key,
          amount,
        };
      }
      // P0.4 — a resposta precisa provar que é o NOSSO pagamento antes de virar cobrança.
      const respPaymentId = String(payment?.id ?? '').trim();
      const respReference = String(payment?.external_reference ?? '').trim();
      const respAmount = Number(payment?.transaction_amount);
      const divergence = !respPaymentId
        ? 'payment_id_ausente'
        : respReference !== externalReference
          ? 'external_reference_divergente'
          : !Number.isFinite(respAmount) || Math.round(respAmount * 100) !== Math.round(amount * 100)
            ? 'valor_divergente'
            : null;
      if (divergence) {
        await this.alertRechargeDivergence(companyId, {
          reason: divergence,
          externalReference,
          paymentId: respPaymentId || null,
          packKey: pack.key,
          credits: pack.credits,
          expected: { externalReference, amount, currency: 'BRL' },
          received: {
            paymentId: respPaymentId || null,
            externalReference: respReference || null,
            amount: Number.isFinite(respAmount) ? respAmount : null,
            status: String(payment?.status ?? '') || null,
          },
        });
        throw new BadGatewayException({
          code: 'CREDIT_RECHARGE_RESPONSE_MISMATCH',
          message: 'Resposta do provedor de pagamento não confere com esta recarga. Nossa equipe foi alertada.',
        });
      }
      const providerStatus = this.normalizeProviderPaymentStatus(payment?.status);
      if (providerStatus === 'failed' || providerStatus === 'cancelled') {
        return {
          ok: false,
          code: 'CHARGE_FAILED',
          message: 'O Mercado Pago recusou gerar este Pix. Tente novamente em instantes.',
          packKey: pack.key,
          amount,
        };
      }
      paymentId = respPaymentId;
      const tx = payment?.point_of_interaction?.transaction_data || {};
      qrCode = tx.qr_code || null;
      qrCodeBase64 = tx.qr_code_base64 || null;
      ticketUrl = tx.ticket_url || null;
      providerSnapshot = { id: payment?.id, status: payment?.status, date_of_expiration: payment?.date_of_expiration };
    }

    const description = `Recarga de créditos — ${pack.title} (${pack.credits} créditos)`;
    const payload = {
      source: 'credit_recharge',
      method: 'PIX',
      packKey: pack.key,
      credits: pack.credits,
      price: amount,
      expiryDays,
      idempotencyKey,
      expiresAt: expiresAt.toISOString(),
      mock,
      provider: providerSnapshot,
    };
    let charge: any;
    try {
      charge = await this.prisma.financeiroCharge.create({
        data: {
          companyId,
          amount,
          description,
          billingCycle: 'MONTHLY',
          paymentMethod: 'PIX',
          status: 'pending',
          lifecycle: 'in_progress',
          competence: this.monthKey(now),
          externalReference,
          mpPaymentId: paymentId,
          notificationUrl: mock ? null : `${this.publicApiBaseUrl()}/webhooks/mercadopago/financeiro?company_id=${companyId}`,
          pixQrCode: qrCode,
          pixQrCodeBase64: qrCodeBase64,
          pixTicketUrl: ticketUrl,
          createdByUserId: Math.trunc(Number(user?.id || 0)) || null,
          providerPayload: JSON.stringify(payload),
        },
      });
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;
      // Corrida de dois cliques da MESMA intenção: a outra requisição já gravou — reabre.
      charge = await this.prisma.financeiroCharge.findFirst({ where: { externalReference, companyId } });
      if (!charge) throw error;
    }
    return this.serializePixCharge(charge, { mock });
  }

  /**
   * Fase 2 pelo POLL do painel. Se a cobrança ainda está pendente, consulta o MP e
   * assenta — o crédito entra aqui mesmo que o webhook nunca chegue.
   */
  async getPixRechargeStatus(
    user: {
      role?: unknown;
      isSystemMaster?: boolean;
      canViewBilling?: boolean;
      companyId?: unknown;
    },
    paymentIdRaw: string,
  ): Promise<PixRechargeStatusResult> {
    const companyId = this.assertBillingOwnerCompany(user);
    const paymentId = String(paymentIdRaw || '').trim();
    if (!paymentId) throw new BadRequestException('paymentId obrigatório');
    const charge = await this.prisma.financeiroCharge.findFirst({ where: { companyId, mpPaymentId: paymentId } });
    if (!charge || !this.isCreditRechargeCharge(charge)) {
      throw new NotFoundException('Recarga não encontrada.');
    }
    const current = this.pixStatusFromCharge(charge);
    if (current !== 'pending') {
      return {
        ok: true,
        status: current,
        paymentId,
        credited: 0,
        balanceAfter: current === 'approved' ? await this.wallet.getBalance(companyId) : null,
        expiresAt: null,
      };
    }
    const payload = this.parseChargePayload(charge.providerPayload);
    let provider: any;
    if (payload.mock) {
      // MOCK: o primeiro poll "paga" — é o banco aprovando, simulado.
      provider = {
        id: paymentId,
        status: 'approved',
        transaction_amount: Number(charge.amount),
        currency_id: 'BRL',
        external_reference: charge.externalReference,
        date_approved: new Date().toISOString(),
      };
    } else {
      const accessToken = await this.resolveMpAccessToken(companyId);
      if (!accessToken) {
        throw new BadRequestException({
          code: 'MERCADO_PAGO_MASTER_NOT_LINKED',
          message: 'Mercado Pago não está pronto para esta empresa.',
        });
      }
      try {
        provider = await this.mercadoPagoClient.getPayment(accessToken, paymentId);
      } catch (error: any) {
        // Consulta caiu: continua pendente (o próximo poll tenta de novo). Nunca vira 500
        // na cara de quem está com o banco aberto.
        this.logger.warn(`credit_recharge_pix_poll_failed company=${companyId} paymentId=${paymentId} error=${String(error?.message || error)}`);
        return { ok: true, status: 'pending', paymentId, credited: 0, balanceAfter: null, expiresAt: payload.expiresAt || null };
      }
    }
    return this.settlePixCharge(charge, provider);
  }

  /**
   * Fase 2 pelo WEBHOOK. Chamado pelo FinanceiroWebhookController ANTES do processamento
   * genérico do financeiro: se o pagamento é de uma recarga Pix pendente, assenta aqui
   * (crédito + receita); o genérico depois só atualiza a charge e NÃO duplica receita
   * (a charge já sai com ledgerEntryId). Pagamento que não é nosso → `handled:false`.
   * Nunca lança: erro aqui não pode derrubar o webhook inteiro.
   */
  async settleIfCreditRecharge(paymentIdRaw: unknown): Promise<{ handled: boolean; status?: PixRechargeStatus; reason?: string }> {
    const paymentId = String(paymentIdRaw || '').trim();
    if (!paymentId) return { handled: false, reason: 'payment_id_ausente' };
    try {
      const charge = await this.prisma.financeiroCharge.findFirst({ where: { mpPaymentId: paymentId } });
      if (!charge || !this.isCreditRechargeCharge(charge) || String(charge.paymentMethod || '').toUpperCase() !== 'PIX') {
        return { handled: false, reason: 'nao_e_recarga_pix' };
      }
      const current = this.pixStatusFromCharge(charge);
      if (current !== 'pending') return { handled: true, status: current };
      const payload = this.parseChargePayload(charge.providerPayload);
      if (payload.mock) return { handled: true, status: 'pending', reason: 'mock_sem_webhook' };
      const accessToken = await this.resolveMpAccessToken(Number(charge.companyId));
      if (!accessToken) return { handled: true, status: 'pending', reason: 'mp_token_ausente' };
      const provider = await this.mercadoPagoClient.getPayment(accessToken, paymentId);
      const settled = await this.settlePixCharge(charge, provider);
      return { handled: true, status: settled.status };
    } catch (error: any) {
      this.logger.warn(`credit_recharge_pix_webhook_settle_failed paymentId=${paymentId} error=${String(error?.message || error)}`);
      return { handled: false, reason: String(error?.message || error) };
    }
  }

  /**
   * O assentamento — ÚNICO lugar em que Pix vira crédito. Idempotente em todas as camadas:
   * grant por usageKey `mp:<paymentId>`, receita só se a charge ainda não tem
   * ledgerEntryId, charge já aprovada só é relida. Mesmas guardas P0.4 do cartão.
   */
  private async settlePixCharge(chargeInput: any, provider: any): Promise<PixRechargeStatusResult> {
    const companyId = Number(chargeInput.companyId);
    const paymentId = String(chargeInput.mpPaymentId || '');
    const payload = this.parseChargePayload(chargeInput.providerPayload);
    const credits = Math.trunc(Number(payload.credits || 0));
    const packKey = String(payload.packKey || '');
    const amount = Number(chargeInput.amount || 0);
    const mock = Boolean(payload.mock);
    const status = this.normalizeProviderPaymentStatus(provider?.status);

    if (status === 'failed' || status === 'cancelled') {
      await this.prisma.financeiroCharge.update({
        where: { id: chargeInput.id },
        data: {
          status: 'cancelled',
          lifecycle: 'cancelled',
          providerPayload: JSON.stringify({ ...payload, provider: { id: provider?.id, status: provider?.status, status_detail: provider?.status_detail } }),
        },
      });
      return { ok: true, status: 'cancelled', paymentId, credited: 0, balanceAfter: null, expiresAt: null };
    }
    if (status !== 'approved') {
      return { ok: true, status: 'pending', paymentId, credited: 0, balanceAfter: null, expiresAt: payload.expiresAt || null };
    }

    // Aprovado — amarração fail-closed ANTES de qualquer crédito.
    const respReference = String(provider?.external_reference ?? '').trim();
    const respAmount = Number(provider?.transaction_amount);
    const respCurrency = String(provider?.currency_id ?? 'BRL').trim().toUpperCase();
    const metaCompanyId = Number((provider?.metadata || {}).company_id || 0);
    const divergence = respReference && respReference !== String(chargeInput.externalReference || '')
      ? 'external_reference_divergente'
      : !Number.isFinite(respAmount) || Math.round(respAmount * 100) !== Math.round(amount * 100)
        ? 'valor_divergente'
        : respCurrency !== 'BRL'
          ? 'moeda_divergente'
          : metaCompanyId && metaCompanyId !== companyId
            ? 'tenant_divergente'
            : !(credits > 0)
              ? 'creditos_ausentes_na_charge'
              : null;
    if (divergence) {
      await this.alertRechargeDivergence(companyId, {
        reason: divergence,
        externalReference: String(chargeInput.externalReference || ''),
        paymentId,
        packKey,
        credits,
        expected: { externalReference: chargeInput.externalReference, amount, currency: 'BRL', companyId },
        received: {
          externalReference: respReference || null,
          amount: Number.isFinite(respAmount) ? respAmount : null,
          currency: respCurrency || null,
          companyId: metaCompanyId || null,
          status: String(provider?.status ?? '') || null,
        },
      });
      throw new BadGatewayException({
        code: 'CREDIT_RECHARGE_RESPONSE_MISMATCH',
        message: 'Resposta do provedor de pagamento não confere com esta recarga. Nossa equipe foi alertada.',
      });
    }

    const paidAt = provider?.date_approved ? new Date(provider.date_approved) : new Date();
    const expiryDays = Number(payload.expiryDays);
    const creditExpiresAt = expiryDays > 0 ? new Date(paidAt.getTime() + expiryDays * DAY_MS) : computeDefaultExpiresAt();

    // 1) crédito — idempotente pelo paymentId (retry/poll+webhook não dobram).
    let grant: { entryId: string; amount: number; alreadyProcessed: boolean };
    try {
      grant = await this.wallet.grant(companyId, credits, {
        kind: 'recharge',
        grantType: 'paid',
        expiresAt: creditExpiresAt,
        sourceRef: paymentId,
        usageKey: `mp:${paymentId}`,
        createdByUserId: Math.trunc(Number(chargeInput.createdByUserId || 0)) || null,
        metadata: { packKey, price: amount, idempotencyKey: payload.idempotencyKey || null, method: 'PIX' },
      });
    } catch (error: any) {
      await this.alertRechargeOrphan(companyId, {
        stage: 'grant',
        paymentId,
        amount,
        packKey,
        credits,
        mock,
        error: String(error?.message || error),
      });
      throw error;
    }

    // 2) receita + charge paga — JUNTAS. Se o webhook genérico passou antes e já linkou uma
    //    linha de receita (ledgerEntryId), só marca a charge: receita nunca sai em dobro.
    const description = String(chargeInput.description || `Recarga de créditos — ${packKey} (${credits} créditos)`);
    const providerMerged = JSON.stringify({
      ...payload,
      provider: { id: provider?.id, status: provider?.status, date_approved: provider?.date_approved },
    });
    try {
      await this.prisma.$transaction(async (tx: any) => {
        let ledgerEntryId: string | null = chargeInput.ledgerEntryId || null;
        if (!ledgerEntryId) {
          ledgerEntryId = await this.financeiro.insertBillingLedgerEntry(
            {
              companyId,
              createdByUserId: Math.trunc(Number(chargeInput.createdByUserId || 0)) || null,
              entryType: mock ? 'CREDIT_RECHARGE_MOCK' : 'CREDIT_RECHARGE',
              entryGroup: 'revenue',
              status: 'APPROVED',
              origin: 'credit_recharge',
              competence: chargeInput.competence || this.monthKey(paidAt),
              amount,
              paidAt,
              paymentMethod: 'PIX',
              referenceLabel: description,
              metadata: { packKey, credits, paymentId, mock, method: 'PIX' },
            },
            tx,
          );
        }
        await tx.financeiroCharge.update({
          where: { id: chargeInput.id },
          data: {
            status: 'approved',
            lifecycle: 'paid',
            paidAt,
            ledgerEntryId,
            providerPayload: providerMerged,
          },
        });
      });
    } catch (error: any) {
      await this.alertRechargeOrphan(companyId, {
        stage: 'charge',
        paymentId,
        amount,
        packKey,
        credits,
        mock,
        error: String(error?.message || error),
      });
      throw error;
    }

    // Comissão e indicação: mesmos ganchos best-effort do cartão.
    if (this.commissionSync) {
      await this.commissionSync.createRechargeCommission({
        companyId,
        chargeId: chargeInput.id,
        amount,
        source: 'credit_recharge',
      }).catch(() => undefined);
    }
    if (this.indicacao) {
      await this.indicacao.onPrimeiraRecargaAprovada(companyId).catch((error: any) => {
        this.logger.warn(
          `indicacao_bonus_hook_failed company=${companyId} paymentId=${paymentId} error=${String(error?.message || error)}`,
        );
      });
    }

    const balanceAfter = await this.wallet.getBalance(companyId);
    return {
      ok: true,
      status: 'approved',
      paymentId,
      credited: grant.alreadyProcessed ? 0 : credits,
      balanceAfter,
      expiresAt: null,
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

  /**
   * P0.4 — a resposta/unicidade do pagamento NÃO bate com a intenção desta empresa
   * (id ausente, external_reference/valor/moeda divergente, ou conflito de unicidade com
   * cobrança de OUTRA empresa). Fail-closed: quem chama LANÇA depois deste alerta — nada
   * é creditado em cima de resposta que não prova ser nossa. MasterEvent `action_required`
   * pra reconciliação manual (o cartão PODE ter sido cobrado no MP). Best-effort PURO,
   * mesmo contrato do alertRechargeOrphan.
   */
  private async alertRechargeDivergence(
    companyId: number,
    detail: {
      reason: string;
      externalReference: string;
      paymentId: string | null;
      packKey: string;
      credits: number;
      expected?: Record<string, unknown>;
      received?: Record<string, unknown>;
    },
  ): Promise<void> {
    this.logger.error(
      `credit_recharge_divergence reason=${detail.reason} company=${companyId} ` +
        `externalReference=${detail.externalReference} paymentId=${detail.paymentId || '-'} ` +
        `pack=${detail.packKey}`,
    );
    try {
      await emitMasterEvent(this.prisma, {
        type: 'credit.recharge_divergence',
        severity: 'action_required',
        companyId,
        // dedup por intenção (externalReference é única por empresa+intenção e existe
        // mesmo quando o MP não devolveu payment.id); `state` = motivo, então um motivo
        // NOVO na mesma intenção ainda insere.
        dedupKey: `credit-recharge-divergence:${detail.externalReference}`,
        payload: {
          state: detail.reason,
          paymentId: detail.paymentId,
          externalReference: detail.externalReference,
          packKey: detail.packKey,
          credits: detail.credits,
          expected: detail.expected ?? null,
          received: detail.received ?? null,
        },
      });
    } catch {
      // Best-effort: alerta jamais engole/troca o erro fail-closed que vem em seguida.
    }
  }
}
