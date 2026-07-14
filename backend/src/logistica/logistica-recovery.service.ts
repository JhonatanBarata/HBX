import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HbxRecoveryService } from '../hbx-recovery/hbx-recovery.service';

/**
 * LOGÍSTICA-MOBILE M7 (05/07) — RECOVERY OPT-IN da logística.
 *
 * Cobrança da logística que VENCEU e não foi paga entra no funil de cobrança
 * hbx-recovery que JÁ RODA EM PROD — sem criar nenhum caminho de envio novo.
 *
 * ── O QUE É O "FUNIL EXISTENTE" (o ponto de entrada reusado) ──────────────────
 * O funil hbx-recovery opera sobre `HbxRecoveryCustomer` (openAmount>0 +
 * automationEnabled): é ESSE registro que a cadência/bot/link-de-pagamento do
 * Recovery consomem, e ao criá-lo o próprio Recovery já sincroniza o `DebtCase`
 * linkado ao `customerProfile` (HbxRecoveryService.syncRecoveryDebtCaseRecord,
 * dentro da transação de `createCustomer`). Logo, o ponto de entrada do funil é
 *
 *     HbxRecoveryService.createCustomer(user, dto)
 *
 * — o único método público que materializa {HbxRecoveryCustomer + DebtCase}. Aqui
 * NÃO reimplementamos cadência nem envio: só chamamos esse método. Todo o freio de
 * chip (disjuntor, teto, 1-número=1-conexão, outbox) vive lá dentro, intocado.
 *
 * ── OPT-IN DURO (fail-closed) ─────────────────────────────────────────────────
 * Só varre empresas com LogisticaConfig.moduloRecoveryAtivo=true (default false).
 * Empresa que não ligou → 0 leitura de charge, 0 DebtCase, funil NUNCA chamado.
 *
 * ── IDEMPOTÊNCIA ──────────────────────────────────────────────────────────────
 * A unidade do funil é 1 cobrança POR CLIENTE (o Recovery agrega o valor aberto do
 * cliente num DebtCase só). Então: agrupo as charges vencidas por customerProfile e
 * garanto UM HbxRecoveryCustomer por cliente. Se já existe um HbxRecoveryCustomer
 * daquele customerProfile (company-scoped) → NÃO cria outro (já está no funil).
 * Rodar a varredura 2× no mesmo estado = 0 caso novo.
 *
 * ── SEM CAMINHO NOVO / SEM MP ─────────────────────────────────────────────────
 * Este serviço só LÊ FinanceiroCharge e chama createCustomer (que grava
 * HbxRecoveryCustomer + DebtCase). Não dispara WhatsApp direto, não toca MercadoPago,
 * não abre socket. O envio (quando acontecer) é decisão do funil hbx-recovery.
 */

// "Cron" caseiro no mesmo padrão do M2 (o repo NÃO usa @nestjs/schedule): varre
// 1×/dia + 1 passada atrasada no boot. INERTE por default — só toca empresas que
// ligaram moduloRecoveryAtivo. Sem ninguém opt-in, o timer acorda, não acha nada e
// volta a dormir (zero efeito, zero chamada de funil).
const RECOVERY_SWEEP_MS = 24 * 60 * 60 * 1000;
const RECOVERY_BOOT_DELAY_MS = 45_000;

@Injectable()
export class LogisticaRecoveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LogisticaRecoveryService.name);
  private sweepHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly recovery: HbxRecoveryService,
  ) {}

  // ── CRON opt-in (INERTE por default) ─────────────────────────────────────────
  // Habilitado por LogisticaConfig.moduloRecoveryAtivo (default false). Só liga o
  // timer se pelo menos uma empresa opt-in existir NÃO importa: o timer roda sempre,
  // mas cada passada só encontra empresas opt-in — sem elas, no-op total.
  onModuleInit() {
    this.sweepHandle = setInterval(() => {
      void this.sweepTodas('interval');
    }, RECOVERY_SWEEP_MS);
    // 1 passada atrasada no boot (não roda EM boot — respiro de 45s; ainda assim só
    // faz algo se alguma empresa tiver moduloRecoveryAtivo=true).
    setTimeout(() => {
      void this.sweepTodas('startup');
    }, RECOVERY_BOOT_DELAY_MS);
  }

  onModuleDestroy() {
    if (this.sweepHandle) clearInterval(this.sweepHandle);
    this.sweepHandle = null;
  }

  /**
   * Passada do cron: só as empresas que LIGARAM moduloRecoveryAtivo entram. Sem
   * opt-in = no-op total (nenhuma leitura de charge, nenhuma chamada de funil).
   * Falha de uma empresa não derruba as outras.
   */
  private async sweepTodas(trigger: 'startup' | 'interval'): Promise<void> {
    let configs: Array<{ companyId: number }> = [];
    try {
      configs = await this.prisma.logisticaConfig.findMany({
        where: { moduloRecoveryAtivo: true },
        select: { companyId: true },
      });
    } catch (e: any) {
      this.logger.warn(`[logistica-recovery] cron (${trigger}) falhou ao listar configs: ${String(e?.message || e)}`);
      return;
    }
    if (configs.length === 0) return; // ninguém opt-in → inerte
    for (const c of configs) {
      try {
        await this.varrer(c.companyId);
      } catch (e: any) {
        this.logger.warn(
          `[logistica-recovery] cron (${trigger}) company=${c.companyId} falhou: ${String(e?.message || e)}`,
        );
      }
    }
  }

  // ── VARREDURA (o gatilho do endpoint ADMIN) ──────────────────────────────────
  /**
   * Varre as cobranças vencidas (status='pending', dueDate < corte, sourceModule
   * IN logistica_*) da empresa e, para cada CLIENTE com dívida, garante 1 entrada
   * no funil hbx-recovery (HbxRecoveryCustomer + DebtCase). company-scoped.
   *
   * OPT-IN DURO: se moduloRecoveryAtivo=false (default) → NADA acontece (early return
   * ANTES de qualquer leitura de charge/chamada de funil). Fail-closed.
   *
   * IDEMPOTENTE: 1 HbxRecoveryCustomer por customerProfile. 2ª varredura no mesmo
   * estado não cria novo caso (o cliente já está no funil).
   */
  async varrer(companyId: number, dateInput?: string): Promise<VarrerResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');

    // 1) OPT-IN DURO (fail-closed): sem a flag da empresa, ninguém entra no funil.
    const cfg = await this.prisma.logisticaConfig.findUnique({
      where: { companyId },
      select: { moduloRecoveryAtivo: true },
    });
    if (!cfg?.moduloRecoveryAtivo) {
      this.logger.log(`[logistica-recovery] company=${companyId} moduloRecoveryAtivo=false → no-op (opt-in).`);
      return { companyId, ativo: false, corte: null, clientesVencidos: 0, injetados: 0, jaNoFunil: 0, semTelefone: 0 };
    }

    // Corte de vencimento: charges com dueDate ESTRITAMENTE antes do início de HOJE
    // (ou da data informada). Vencida = passou do dia; "vence hoje" ainda não conta.
    const corte = startOfDay(parseDateOrNull(dateInput) ?? new Date());

    // 2) Gancho canônico do Recovery: toda cobrança financeira vencida que está
    // ligada a um CustomerProfile entra, independentemente do módulo de origem.
    // Cobranças da própria plataforma não possuem customerProfileId e ficam fora.
    const charges = await this.prisma.financeiroCharge.findMany({
      where: {
        companyId,
        status: 'pending',
        dueDate: { lt: corte },
        customerProfileId: { not: null },
      },
      select: {
        id: true,
        customerProfileId: true,
        amount: true,
        dueDate: true,
        entregaId: true,
        sourceModule: true,
      },
      orderBy: [{ dueDate: 'asc' }],
    });

    const entregaIds = [...new Set(charges.map((charge) => String(charge.entregaId || '')).filter(Boolean))];
    const entregas = entregaIds.length
      ? await this.prisma.entrega.findMany({
          where: { companyId, id: { in: entregaIds } },
          select: {
            id: true,
            productId: true,
            quantidade: true,
            valor: true,
            itens: { select: { productId: true, qtdEntregue: true, qtdPrevista: true, valorUnit: true } },
          },
        })
      : [];
    const entregaById = new Map(entregas.map((entrega) => [entrega.id, entrega]));

    // 3) Agrupa por cliente: o funil é 1 caso por cliente (soma o aberto vencido).
    const porCliente = new Map<string, {
      amount: number;
      dueDate: Date | null;
      charges: Array<(typeof charges)[number]>;
    }>();
    for (const c of charges) {
      const pid = String(c.customerProfileId || '').trim();
      if (!pid) continue;
      const g = porCliente.get(pid) ?? { amount: 0, dueDate: null, charges: [] };
      g.amount = round2(g.amount + Math.max(0, Number(c.amount) || 0));
      // guarda o vencimento MAIS ANTIGO (o que a cobrança usa como registrationDate).
      if (c.dueDate && (!g.dueDate || c.dueDate.getTime() < g.dueDate.getTime())) g.dueDate = c.dueDate;
      g.charges.push(c);
      porCliente.set(pid, g);
    }

    let injetados = 0;
    let jaNoFunil = 0;
    let semTelefone = 0;

    for (const [customerProfileId, grupo] of porCliente) {
      if (grupo.amount <= 0) continue;

      // IDEMPOTÊNCIA: já existe um HbxRecoveryCustomer deste cliente? Então ele já
      // está no funil — não cria outro (a 2ª varredura cai aqui e não duplica).
      let existente = await this.prisma.hbxRecoveryCustomer.findFirst({
        where: { companyId, customerProfileId },
        select: { id: true, openAmount: true, sourceModule: true },
      });

      // O funil precisa de um alvo de WhatsApp (a cadência manda pra ele). Cliente
      // sem telefone não tem como ser cobrado → pula (não é falha, só não aplica).
      const conta = await this.prisma.customerProfile.findFirst({
        where: { id: customerProfileId, companyId },
        select: { name: true, phone: true, phoneNormalized: true },
      });
      const telefone = String(conta?.phoneNormalized || conta?.phone || '').trim();
      if (!existente && !digitsOk(telefone)) {
        semTelefone++;
        continue;
      }

      const nome = String(conta?.name || '').trim() || 'Cliente';
      // 4) INJETA NO FUNIL EXISTENTE: createCustomer cria o HbxRecoveryCustomer E
      // sincroniza o DebtCase linkado ao customerProfile (dentro da mesma transação
      // do Recovery). NÃO reimplementamos cadência/envio aqui.
      try {
        let createdNow = false;
        if (!existente) {
          const created = await this.recovery.createCustomer(
            { companyId },
            {
              name: nome,
              clientName: nome,
              whatsappNumber: telefone,
              openAmount: grupo.amount,
              registrationDate: grupo.dueDate ? grupo.dueDate.toISOString() : undefined,
            } as any,
            { sourceModule: 'financeiro' },
          );
          existente = { id: String(created.id), openAmount: grupo.amount, sourceModule: 'financeiro' };
          createdNow = true;
        } else {
          jaNoFunil++;
        }

        await this.materializeCustomerDebt({
          companyId,
          customerProfileId,
          recoveryCustomer: existente,
          charges: grupo.charges,
          entregaById,
          createdNow,
        });
        if (createdNow) injetados++;
      } catch (e: any) {
        this.logger.warn(
          `[logistica-recovery] company=${companyId} cliente=${customerProfileId} falhou ao injetar no funil: ${String(e?.message || e)}`,
        );
      }
    }

    this.logger.log(
      `[logistica-recovery] company=${companyId} corte=${corte.toISOString().slice(0, 10)}: ` +
        `${porCliente.size} cliente(s) vencido(s), ${injetados} injetado(s), ${jaNoFunil} já no funil, ${semTelefone} sem telefone.`,
    );

    return {
      companyId,
      ativo: true,
      corte: corte.toISOString().slice(0, 10),
      clientesVencidos: porCliente.size,
      injetados,
      jaNoFunil,
      semTelefone,
    };
  }

  // ── QUITAR → PARA A CADÊNCIA (o oposto do varrer) ─────────────────────────────
  /**
   * Chamado BEST-EFFORT pelo quitarCharge da logística quando um fiado recebe
   * baixa manual. O varrer só INJETA; ESTE fecha: recomputa a dívida VENCIDA e
   * pendente (logistica_*) do cliente e, se ainda houver → no-op (a cadência
   * segue); se ZEROU → PARA a cadência fechando o caso no funil hbx-recovery
   * (zera o HbxRecoveryCustomer + DebtCase 'paid', via resolverDebtCaseSeQuitado).
   *
   * Mesma simetria do varrer: a logística é quem conhece as charges (por isso o
   * recompute vive aqui, não no hbx-recovery); o hbx-recovery só executa o
   * fechamento. NUNCA dispara WhatsApp; NUNCA quebra a baixa (o chamador engole o
   * erro). Idempotente: 2ª baixa no mesmo estado = no-op.
   */
  async resolverSeQuitado(companyId: number, customerProfileId: string): Promise<void> {
    const cid = Number(companyId) || 0;
    const pid = String(customerProfileId || '').trim();
    if (!cid || !pid) return;

    await this.reconcileDebtItems(cid, pid);

    // Recompute: sobrou alguma cobrança financeira pendente e vencida deste
    // cliente? Se sim, a cadência segue.
    const corte = startOfDay(new Date());
    const pendente = await this.prisma.financeiroCharge.findFirst({
      where: {
        companyId: cid,
        customerProfileId: pid,
        status: 'pending',
        dueDate: { lt: corte },
      },
      select: { id: true },
    });
    if (pendente) return; // ainda há vencido em aberto → no-op (segue cobrando)

    // Zerou a dívida vencida → PARA a cadência (sem WhatsApp, idempotente).
    await this.recovery.resolverDebtCaseSeQuitado(cid, pid);
  }

  private async materializeCustomerDebt(input: {
    companyId: number;
    customerProfileId: string;
    recoveryCustomer: { id: string; openAmount: number; sourceModule?: string | null };
    charges: Array<{
      id: string;
      amount: number;
      dueDate: Date | null;
      entregaId: string | null;
      sourceModule: string | null;
    }>;
    entregaById: Map<string, any>;
    createdNow: boolean;
  }) {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.recoveryDebtItem.aggregate({
        where: { companyId: input.companyId, recoveryCustomerId: input.recoveryCustomer.id, status: 'open' },
        _sum: { openAmount: true },
      });
      const beforeMaterialized = Number(before._sum.openAmount || 0);

      let debtCase = await tx.debtCase.findFirst({
        where: {
          companyId: input.companyId,
          customerProfileId: input.customerProfileId,
          sourceProvider: 'HBX_RECOVERY',
          status: 'open',
        },
        orderBy: [{ updatedAt: 'desc' }],
      });

      for (const charge of input.charges) {
        const existingItem = await tx.recoveryDebtItem.findUnique({
          where: { financeiroChargeId: charge.id },
          select: { id: true, paidAmount: true },
        });
        const paidAmount = Math.max(0, Number(existingItem?.paidAmount || 0));
        const originalAmount = round2(Math.max(0, Number(charge.amount || 0)));
        const openAmount = round2(Math.max(0, originalAmount - paidAmount));
        const item = existingItem
          ? await tx.recoveryDebtItem.update({
              where: { id: existingItem.id },
              data: {
                recoveryCustomerId: input.recoveryCustomer.id,
                debtCaseId: debtCase?.id || null,
                originalAmount,
                openAmount,
                dueDate: charge.dueDate,
                status: openAmount > 0 ? 'open' : 'paid',
              },
            })
          : await tx.recoveryDebtItem.create({
              data: {
                companyId: input.companyId,
                customerProfileId: input.customerProfileId,
                recoveryCustomerId: input.recoveryCustomer.id,
                debtCaseId: debtCase?.id || null,
                financeiroChargeId: charge.id,
                sourceType: String(charge.sourceModule || 'financeiro'),
                sourceRefId: charge.id,
                entregaId: charge.entregaId || null,
                originalAmount,
                openAmount,
                paidAmount,
                dueDate: charge.dueDate,
                status: openAmount > 0 ? 'open' : 'paid',
              },
            });

        const entrega = charge.entregaId ? input.entregaById.get(charge.entregaId) : null;
        const productRows = entrega?.itens?.length
          ? entrega.itens
          : entrega?.productId
            ? [{
                productId: entrega.productId,
                qtdEntregue: entrega.quantidade,
                qtdPrevista: entrega.quantidade,
                valorUnit: Number(entrega.valor || 0) / Math.max(1, Number(entrega.quantidade || 1)),
              }]
            : [];
        for (const product of productRows) {
          if (!product.productId) continue;
          const quantity = Math.max(1, Number(product.qtdEntregue ?? product.qtdPrevista ?? 1));
          await tx.recoveryDebtItemProduct.upsert({
            where: { debtItemId_productId: { debtItemId: item.id, productId: Number(product.productId) } },
            create: {
              debtItemId: item.id,
              productId: Number(product.productId),
              quantity,
              amount: round2(Number(product.valorUnit || 0) * quantity),
            },
            update: { quantity, amount: round2(Number(product.valorUnit || 0) * quantity) },
          });
        }
      }

      const after = await tx.recoveryDebtItem.aggregate({
        where: { companyId: input.companyId, recoveryCustomerId: input.recoveryCustomer.id, status: 'open' },
        _sum: { openAmount: true },
      });
      const materializedOpen = round2(Number(after._sum.openAmount || 0));
      const legacyFinancialCase = beforeMaterialized === 0 && ['logistica', 'financeiro'].includes(String(input.recoveryCustomer.sourceModule || ''));
      const nextOpen = input.createdNow || legacyFinancialCase
        ? materializedOpen
        : round2(Math.max(0, Number(input.recoveryCustomer.openAmount || 0) + materializedOpen - beforeMaterialized));

      await tx.hbxRecoveryCustomer.update({
        where: { id: input.recoveryCustomer.id },
        data: { openAmount: nextOpen, status: nextOpen > 0 ? 'OVERDUE' : 'PAID' },
      });

      if (!debtCase && nextOpen > 0) {
        debtCase = await tx.debtCase.create({
          data: {
            companyId: input.companyId,
            customerProfileId: input.customerProfileId,
            sourceProvider: 'HBX_RECOVERY',
            amount: nextOpen,
            dueDate: input.charges[0]?.dueDate || null,
            status: 'open',
            rawPayloadJson: JSON.stringify({ source: 'financeiro-recovery-hook', recoveryCustomerId: input.recoveryCustomer.id }),
          },
        });
      } else if (debtCase) {
        await tx.debtCase.update({
          where: { id: debtCase.id },
          data: { amount: nextOpen, status: nextOpen > 0 ? 'open' : 'paid', paidAt: nextOpen > 0 ? null : new Date() },
        });
      }
      if (debtCase) {
        await tx.recoveryDebtItem.updateMany({
          where: { companyId: input.companyId, recoveryCustomerId: input.recoveryCustomer.id },
          data: { debtCaseId: debtCase.id },
        });
      }
    });
  }

  private async reconcileDebtItems(companyId: number, customerProfileId: string) {
    const items = await this.prisma.recoveryDebtItem.findMany({
      where: { companyId, customerProfileId, financeiroChargeId: { not: null } },
      include: { financeiroCharge: { select: { status: true, amount: true } } },
    });
    for (const item of items) {
      const paid = ['approved', 'paid', 'released'].includes(String(item.financeiroCharge?.status || '').toLowerCase());
      if (!paid) continue;
      await this.prisma.recoveryDebtItem.update({
        where: { id: item.id },
        data: {
          openAmount: 0,
          paidAmount: round2(Number(item.financeiroCharge?.amount || item.originalAmount || 0)),
          status: 'paid',
        },
      });
    }
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────────
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function parseDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).trim());
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function round2(v: number): number {
  return Math.round((Number(v) || 0) * 100) / 100;
}

// O Recovery exige DDI + 10..15 dígitos (normalizeWhatsAppNumber). Pré-filtra aqui
// pra pular cliente sem telefone utilizável sem estourar exceção lá dentro.
function digitsOk(raw: string): boolean {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

// ── tipos ─────────────────────────────────────────────────────────────────────
export interface VarrerResult {
  companyId: number;
  ativo: boolean;
  corte: string | null;
  clientesVencidos: number;
  injetados: number;
  jaNoFunil: number;
  semTelefone: number;
}
