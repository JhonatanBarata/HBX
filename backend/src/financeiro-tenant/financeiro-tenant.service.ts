import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LogisticaService } from '../logistica/logistica.service';
import {
  TENANT_FINANCE_SOURCE_MODULES,
  isLogisticaSource,
} from './finance-source-modules';

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export interface SaldoClienteRow {
  customerProfileId: string;
  nome: string | null;
  saldoAberto: number;
  cobrancas: number;
}
export interface SaldosResult {
  clientes: SaldoClienteRow[];
}
export interface ExtratoChargeRow {
  id: string;
  amount: number;
  currency: string;
  description: string;
  status: string;
  lifecycle: string;
  sourceModule: string | null;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string | null;
}
export interface ExtratoResult {
  clienteId: string;
  nome: string | null;
  saldoAberto: number;
  total: number;
  charges: ExtratoChargeRow[];
}
export interface QuitarResult {
  id: string;
  status: string;
  paidAt: string | null;
  alreadyPaid: boolean;
}

/**
 * FINANCEIRO-UNIVERSAL (Fase 1) — financeiro do TENANT desacoplado da logística.
 *
 * Lê/baixa `FinanceiroCharge` por CATÁLOGO de origens (TENANT_FINANCE_SOURCE_MODULES)
 * — hoje logística (entrega/fechamento) + vendas (fechamento). A receita da
 * PLATAFORMA (assinatura/recarga, sourceModule=null) fica FORA por construção.
 *
 * NÃO toca `logistica.service.ts`: a baixa de cobrança logística é DELEGADA ao
 * `LogisticaService.quitarCharge` (paridade total, inclusive parar a cadência
 * recovery). A logística segue intocada — garantia de não quebrar.
 *
 * LEI DO VENDEDOR: o controller é @Admin — só o responsável vê valores.
 */
@Injectable()
export class FinanceiroTenantService {
  private readonly logger = new Logger(FinanceiroTenantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly logistica: LogisticaService,
  ) {}

  /** "Quem me deve": clientes com cobrança em aberto (pending) de QUALQUER origem do tenant. */
  async saldos(companyId: number): Promise<SaldosResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');

    const rows = await this.prisma.financeiroCharge.groupBy({
      by: ['customerProfileId'],
      where: {
        companyId,
        status: 'pending',
        sourceModule: { in: [...TENANT_FINANCE_SOURCE_MODULES] },
        customerProfileId: { not: null },
      },
      _sum: { amount: true },
      _count: { _all: true },
    });

    const comSaldo = rows
      .filter((r) => r.customerProfileId && round2(Number(r._sum.amount) || 0) > 0)
      .map((r) => ({
        customerProfileId: r.customerProfileId as string,
        saldoAberto: round2(Math.max(0, Number(r._sum.amount) || 0)),
        cobrancas: Number(r._count?._all) || 0,
      }));
    if (comSaldo.length === 0) return { clientes: [] };

    const ids = comSaldo.map((c) => c.customerProfileId);
    const nomes = await this.prisma.customerProfile.findMany({
      where: { companyId, id: { in: ids } },
      select: { id: true, name: true },
    });
    const nomePorId = new Map(nomes.map((n) => [n.id, n.name] as const));

    const clientes = comSaldo
      .map((c) => ({
        ...c,
        nome: String(nomePorId.get(c.customerProfileId) || '').trim() || null,
      }))
      .sort((a, b) => b.saldoAberto - a.saldoAberto);

    return { clientes };
  }

  /** Extrato de UM cliente: todas as cobranças do tenant (qualquer origem). company-scoped. */
  async extratoCliente(companyId: number, clienteId: string): Promise<ExtratoResult | null> {
    if (!companyId || !clienteId) return null;
    const cliente = await this.prisma.customerProfile.findFirst({
      where: { id: String(clienteId).trim(), companyId },
      select: { id: true, name: true },
    });
    if (!cliente) return null;

    const charges = await this.prisma.financeiroCharge.findMany({
      where: {
        companyId,
        customerProfileId: cliente.id,
        sourceModule: { in: [...TENANT_FINANCE_SOURCE_MODULES] },
      },
      orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      select: {
        id: true,
        amount: true,
        currency: true,
        description: true,
        status: true,
        lifecycle: true,
        sourceModule: true,
        dueDate: true,
        paidAt: true,
        createdAt: true,
      },
    });

    const saldoAberto = round2(
      charges
        .filter((c) => c.status === 'pending')
        .reduce((sum, c) => sum + Math.max(0, Number(c.amount) || 0), 0),
    );

    return {
      clienteId: cliente.id,
      nome: String(cliente.name || '').trim() || null,
      saldoAberto,
      total: charges.length,
      charges: charges.map((c) => ({
        id: c.id,
        amount: c.amount,
        currency: c.currency,
        description: c.description,
        status: c.status,
        lifecycle: c.lifecycle,
        sourceModule: c.sourceModule ?? null,
        dueDate: c.dueDate ? c.dueDate.toISOString() : null,
        paidAt: c.paidAt ? c.paidAt.toISOString() : null,
        createdAt: c.createdAt ? c.createdAt.toISOString() : null,
      })),
    };
  }

  /**
   * Baixa manual GENÉRICA de uma cobrança do tenant.
   * - origem LOGÍSTICA → delega ao LogisticaService.quitarCharge (mesma parada de
   *   recovery, mesma auditoria — zero divergência de comportamento).
   * - origem VENDAS (ou outra futura do catálogo) → claim atômico local
   *   (pending→approved/paid), idempotente. Não toca MP, não dispara nada.
   * Charge de outra empresa ou origem fora do catálogo → null (controller → 404).
   */
  async quitarCharge(
    companyId: number,
    chargeId: string,
    opts: { userId?: number | null } = {},
  ): Promise<QuitarResult | null> {
    if (!companyId || !chargeId) return null;
    const id = String(chargeId).trim();

    const charge = await this.prisma.financeiroCharge.findFirst({
      where: {
        id,
        companyId,
        sourceModule: { in: [...TENANT_FINANCE_SOURCE_MODULES] },
      },
      select: { id: true, status: true, lifecycle: true, amount: true, paidAt: true, sourceModule: true },
    });
    if (!charge) return null;

    // Logística: delega (paridade total + para a cadência recovery de quem pagou).
    if (isLogisticaSource(charge.sourceModule)) {
      const res = await this.logistica.quitarCharge(companyId, id, opts);
      if (!res) return null;
      return { id: res.id, status: res.status, paidAt: res.paidAt, alreadyPaid: res.alreadyPaid };
    }

    // Já paga → idempotente (200 com estado atual).
    if (charge.paidAt || charge.status === 'approved' || charge.lifecycle === 'paid') {
      return {
        id: charge.id,
        status: charge.status,
        paidAt: charge.paidAt ? charge.paidAt.toISOString() : null,
        alreadyPaid: true,
      };
    }
    // Não-quitável (cancelled/failed/refunded) → devolve estado sem mutar.
    if (String(charge.status).trim().toLowerCase() !== 'pending') {
      return { id: charge.id, status: charge.status, paidAt: null, alreadyPaid: false };
    }

    // Claim atômico pending→paga (guarda no WHERE): 2 cliques = 1 baixa.
    const now = new Date();
    const claim = await this.prisma.financeiroCharge.updateMany({
      where: { id: charge.id, companyId, status: 'pending' },
      data: { status: 'approved', lifecycle: 'paid', paidAt: now },
    });
    if (!claim.count) {
      const atual = await this.prisma.financeiroCharge.findFirst({
        where: { id: charge.id, companyId },
        select: { id: true, status: true, paidAt: true },
      });
      if (!atual) return null;
      return {
        id: atual.id,
        status: atual.status,
        paidAt: atual.paidAt ? atual.paidAt.toISOString() : null,
        alreadyPaid: Boolean(atual.paidAt) || atual.status === 'approved',
      };
    }

    this.logger.log(
      `[financeiro-tenant] baixa manual: charge=${charge.id} company=${companyId} amount=${charge.amount} source=${charge.sourceModule} user=${opts.userId ?? 'n/d'} paidAt=${now.toISOString()}`,
    );
    return { id: charge.id, status: 'approved', paidAt: now.toISOString(), alreadyPaid: false };
  }
}
