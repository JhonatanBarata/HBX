import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EstoqueService } from './estoque.service';
import { FiscalAutomationLogService } from '../contabil/fiscal-automation-log.service';
import { renderComprovanteEntregaPdf } from './comprovante-entrega.util';

// ===========================================================================
// B1 BALCÃO (PR04082026-BALCAO-DISTRIBUIDORA) — frente de caixa da vertical.
//
// A venda de balcão é o REGISTRO: itens com snapshot de nome/preço, forma de
// pagamento e baixa IMEDIATA no estoque (SAIDA_EMISSAO — o movimento que o F3
// já tinha esperando). À vista (DINHEIRO/PIX/CARTAO) mora só aqui; FIADO exige
// cliente da base e adicionalmente vira FinanceiroCharge (mesmo modelo da
// logística — extrato do cliente/recovery ganham a venda de graça).
//
// LEIS: gate duro (balcão só existe com o modo HBX Gestão Fiscal/estoque ativo);
// preço resolvido NO SERVIDOR (precoBalcaoCents ?? Product da logística — a
// tela nunca manda preço); cancelar segue o rito (motivo + REVERSA de estoque
// com rastro — nada some); multi-tenant em toda query; fuso do Brasil no "dia".
// ===========================================================================

const PAGAMENTOS = ['DINHEIRO', 'PIX', 'CARTAO', 'FIADO'] as const;

export interface BalcaoItemInput {
  produtoId: string;
  quantidade: number;
}

export interface BalcaoVendaInput {
  itens: BalcaoItemInput[];
  pagamento: string;
  clienteId?: string | null;
  idempotencyKey?: string | null;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Início do dia LOCAL do Brasil (America/Sao_Paulo é -03 fixo desde 2019). */
function inicioDiaBrasil(agora = new Date()): Date {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return new Date(`${fmt.format(agora)}T00:00:00-03:00`);
}

@Injectable()
export class BalcaoService {
  private readonly logger = new Logger(BalcaoService.name);

  // trilha @Optional no FIM — testes posicionais (new BalcaoService(prisma, estoque)) intactos.
  constructor(
    private readonly prisma: PrismaService,
    private readonly estoque: EstoqueService,
    @Optional() private readonly trilha: FiscalAutomationLogService | null = null,
  ) {}

  // ── gate ──────────────────────────────────────────────────────────────────
  private async requireBalcao(companyId: number) {
    const perfil = await (this.prisma as any).fiscalTenantProfile.findUnique({ where: { companyId } });
    if (!perfil?.estoqueAtivo) {
      throw new BadRequestException('O balcão faz parte do modo HBX Gestão Fiscal — ative o modo na tela fiscal.');
    }
    return perfil;
  }

  // ── PRODUTOS DA TELA (preço resolvido no servidor) ───────────────────────
  async listarProdutos(companyId: number) {
    await this.requireBalcao(companyId);
    const [produtos, saldos] = await Promise.all([
      (this.prisma as any).estoqueProduto.findMany({ where: { companyId, ativo: true }, orderBy: { createdAt: 'asc' } }),
      this.estoque.saldos(companyId),
    ]);
    const precos = await this.precosLogistica(companyId, produtos);
    return produtos.map((p: any) => ({
      id: p.id,
      nome: p.nome,
      unidade: p.unidade,
      gtin: p.gtin || null,
      precoCents: this.resolverPrecoCents(p, precos),
      saldo: saldos.get(p.id) || { fisico: 0, reservado: 0, disponivel: 0, faturado: 0 },
    }));
  }

  /** precoBalcaoCents ganha; sem ele cai no Product da logística vinculado; sem nenhum = null (tela avisa). */
  private resolverPrecoCents(p: any, precos: Map<number, number>): number | null {
    if (p.precoBalcaoCents != null && p.precoBalcaoCents > 0) return Math.trunc(p.precoBalcaoCents);
    if (p.logisticaProductId != null && precos.has(p.logisticaProductId)) return precos.get(p.logisticaProductId)!;
    return null;
  }

  private async precosLogistica(companyId: number, produtos: any[]): Promise<Map<number, number>> {
    const ids = produtos.map((p) => p.logisticaProductId).filter((v) => v != null);
    const out = new Map<number, number>();
    if (ids.length === 0) return out;
    const rows = await (this.prisma as any).product.findMany({
      where: { companyId, id: { in: ids } },
      select: { id: true, price: true, priceCents: true },
    });
    for (const r of rows) {
      const cents = r.priceCents != null ? Math.trunc(Number(r.priceCents)) : Math.round((Number(r.price) || 0) * 100);
      if (cents > 0) out.set(r.id, cents);
    }
    return out;
  }

  // ── VENDA ─────────────────────────────────────────────────────────────────
  async criarVenda(companyId: number, userId: number | null, dto: BalcaoVendaInput) {
    const perfil = await this.requireBalcao(companyId);

    const pagamento = String(dto?.pagamento || '').toUpperCase();
    if (!(PAGAMENTOS as readonly string[]).includes(pagamento)) {
      throw new BadRequestException('Forma de pagamento inválida (DINHEIRO, PIX, CARTAO ou FIADO).');
    }
    const itensRaw = Array.isArray(dto?.itens) ? dto.itens : [];
    if (itensRaw.length === 0) throw new BadRequestException('Venda sem itens.');
    if (itensRaw.length > 50) throw new BadRequestException('Venda com itens demais (máx. 50).');

    // Idempotência do clique: a MESMA chave devolve a MESMA venda (double-submit
    // não baixa estoque duas vezes).
    const idempotencyKey = String(dto?.idempotencyKey || '').trim().slice(0, 60) || null;
    if (idempotencyKey) {
      const existente = await (this.prisma as any).balcaoVenda.findFirst({
        where: { companyId, idempotencyKey },
        include: { itens: true },
      });
      if (existente) return { venda: await this.serializeVenda(companyId, existente), aviso: null, repetida: true };
    }

    // Mesmo produto 2× no carrinho SOMA (lição A1 do XML: o dedup do movimento é
    // por produto — sem agregar, o 2º item estouraria o UNIQUE e sumiria).
    const porProduto = new Map<string, number>();
    for (const item of itensRaw) {
      const produtoId = String(item?.produtoId || '').trim();
      const qtd = Number(item?.quantidade);
      if (!produtoId) throw new BadRequestException('Item sem produto.');
      if (!Number.isFinite(qtd) || qtd <= 0 || qtd > 10_000) throw new BadRequestException('Quantidade inválida.');
      porProduto.set(produtoId, (porProduto.get(produtoId) || 0) + qtd);
    }

    const produtos = await (this.prisma as any).estoqueProduto.findMany({
      where: { companyId, id: { in: [...porProduto.keys()] }, ativo: true },
    });
    const mapa = new Map<string, any>(produtos.map((p: any) => [p.id, p]));
    for (const produtoId of porProduto.keys()) {
      if (!mapa.has(produtoId)) throw new BadRequestException('Produto não encontrado (ou inativo) nesta empresa.');
    }
    const precos = await this.precosLogistica(companyId, produtos);

    const itens: Array<{ produtoId: string; produtoNome: string; quantidade: number; precoCents: number; subtotalCents: number }> = [];
    let totalCents = 0;
    for (const [produtoId, quantidade] of porProduto) {
      const p = mapa.get(produtoId);
      const precoCents = this.resolverPrecoCents(p, precos);
      if (precoCents == null) {
        throw new BadRequestException(`"${p.nome}" está sem preço — defina o preço de balcão no Estoque antes de vender.`);
      }
      const subtotalCents = Math.round(quantidade * precoCents);
      itens.push({ produtoId, produtoNome: p.nome, quantidade, precoCents, subtotalCents });
      totalCents += subtotalCents;
    }
    if (totalCents <= 0) throw new BadRequestException('Total da venda inválido.');

    // Estoque: 'travar' recusa ANTES de gravar; 'avisar' deixa e devolve o aviso.
    const saldos = await this.estoque.saldos(companyId);
    const negativos: string[] = [];
    for (const item of itens) {
      const disponivel = saldos.get(item.produtoId)?.disponivel ?? 0;
      if (disponivel - item.quantidade < 0) negativos.push(`${item.produtoNome} (disponível ${disponivel}, pedido ${item.quantidade})`);
    }
    if (negativos.length > 0 && perfil.estoqueNegativo === 'travar') {
      throw new BadRequestException(`Estoque insuficiente: ${negativos.join(' · ')}. A empresa configurou TRAVAR venda sem saldo.`);
    }
    const aviso = negativos.length > 0 ? `Estoque ficou NEGATIVO: ${negativos.join(' · ')} — confira entradas ou faça o inventário.` : null;

    // FIADO: cliente da base obrigatório + teto de fiado (limiteFiado) respeitado.
    let cliente: any = null;
    if (pagamento === 'FIADO') {
      const clienteId = String(dto?.clienteId || '').trim();
      if (!clienteId) throw new BadRequestException('Fiado exige escolher o cliente.');
      cliente = await (this.prisma as any).customerProfile.findFirst({ where: { id: clienteId, companyId } });
      if (!cliente) throw new BadRequestException('Cliente não encontrado nesta empresa.');
      if (cliente.limiteFiado != null) {
        const devendo = await (this.prisma as any).financeiroCharge.aggregate({
          where: { companyId, customerProfileId: cliente.id, status: 'pending' },
          _sum: { amount: true },
        });
        const emAberto = Number(devendo?._sum?.amount) || 0;
        const novoTotal = round2(emAberto + totalCents / 100);
        if (novoTotal > Number(cliente.limiteFiado)) {
          throw new BadRequestException(
            `Teto de fiado do cliente estourado: em aberto R$ ${emAberto.toFixed(2)} + esta venda passa o limite de R$ ${Number(cliente.limiteFiado).toFixed(2)}.`,
          );
        }
      }
    }

    const agora = new Date();
    try {
      const venda = await (this.prisma as any).$transaction(async (tx: any) => {
        const v = await tx.balcaoVenda.create({
          data: {
            companyId,
            clienteId: cliente?.id ?? null,
            byUserId: userId,
            pagamento,
            totalCents,
            idempotencyKey,
          },
        });
        await tx.balcaoVendaItem.createMany({
          data: itens.map((i) => ({ companyId, vendaId: v.id, ...i })),
        });
        for (const i of itens) {
          await tx.estoqueMovimento.create({
            data: {
              companyId,
              produtoId: i.produtoId,
              tipo: 'SAIDA_EMISSAO',
              quantidade: i.quantidade,
              refVendaId: v.id,
              motivo: `Balcão (${pagamento})`,
            },
          });
        }
        if (pagamento === 'FIADO') {
          const charge = await tx.financeiroCharge.create({
            data: {
              companyId,
              amount: round2(totalCents / 100),
              currency: 'BRL',
              description: `Balcão — ${String(cliente?.name || 'cliente').slice(0, 160)}`,
              billingCycle: 'ONCE',
              paymentMethod: 'MANUAL',
              status: 'pending',
              lifecycle: 'in_progress',
              customerProfileId: cliente.id,
              sourceModule: 'balcao_venda',
              createdByUserId: userId,
              providerPayload: JSON.stringify({ source: 'balcao_venda', vendaId: v.id, criadoEm: agora.toISOString() }),
            },
          });
          return tx.balcaoVenda.update({ where: { id: v.id }, data: { financeChargeId: charge.id }, include: { itens: true } });
        }
        return tx.balcaoVenda.findUnique({ where: { id: v.id }, include: { itens: true } });
      });
      return { venda: await this.serializeVenda(companyId, venda), aviso, repetida: false };
    } catch (err: any) {
      // Corrida do double-click perdida pro UNIQUE da idempotencyKey: devolve a venda vencedora.
      if (String(err?.code) === 'P2002' && idempotencyKey) {
        const existente = await (this.prisma as any).balcaoVenda.findFirst({
          where: { companyId, idempotencyKey },
          include: { itens: true },
        });
        if (existente) return { venda: await this.serializeVenda(companyId, existente), aviso: null, repetida: true };
      }
      throw err;
    }
  }

  // ── CANCELAR (rito: motivo + REVERSA com rastro — nada some) ─────────────
  async cancelarVenda(companyId: number, userId: number | null, vendaId: string, motivoRaw: string) {
    await this.requireBalcao(companyId);
    const motivo = String(motivoRaw || '').trim();
    if (motivo.length < 5) throw new BadRequestException('Motivo do cancelamento é obrigatório (mínimo 5 caracteres).');

    const venda = await (this.prisma as any).balcaoVenda.findFirst({ where: { id: vendaId, companyId }, include: { itens: true } });
    if (!venda) throw new NotFoundException('Venda não encontrada.');
    if (venda.status !== 'CONCLUIDA') throw new BadRequestException('Esta venda já está cancelada.');

    // Fiado já PAGO não se cancela por aqui — dinheiro recebido tem rito próprio.
    let charge: any = null;
    if (venda.financeChargeId) {
      charge = await (this.prisma as any).financeiroCharge.findFirst({ where: { id: venda.financeChargeId, companyId } });
      if (charge && (charge.paidAt || charge.status === 'approved')) {
        throw new BadRequestException('A cobrança do fiado desta venda já foi PAGA — estorne no financeiro antes de cancelar.');
      }
    }

    const atualizado = await (this.prisma as any).$transaction(async (tx: any) => {
      // Claim atômico: 2 cancelamentos simultâneos → o 2º não acha CONCLUIDA e para.
      const claim = await tx.balcaoVenda.updateMany({
        where: { id: venda.id, companyId, status: 'CONCLUIDA' },
        data: { status: 'CANCELADA', canceladaEm: new Date(), canceladaPorId: userId, motivoCancelamento: motivo },
      });
      if (!claim?.count) throw new BadRequestException('Esta venda já está cancelada.');
      for (const i of venda.itens) {
        await tx.estoqueMovimento.create({
          data: {
            companyId,
            produtoId: i.produtoId,
            tipo: 'REVERSA_CANCELAMENTO',
            quantidade: i.quantidade,
            refVendaId: venda.id,
            motivo: `Cancelamento balcão: ${motivo.slice(0, 200)}`,
          },
        });
      }
      if (charge && !charge.paidAt && charge.status !== 'approved') {
        await tx.financeiroCharge.update({
          where: { id: charge.id },
          data: { status: 'cancelled', lifecycle: 'cancelled' },
        });
      }
      return tx.balcaoVenda.findUnique({ where: { id: venda.id }, include: { itens: true } });
    });

    await this.trilha?.registrar({
      sistema: 'NFSE', // trilha compartilhada do fiscal — a operação identifica o balcão
      operacao: 'CANCELAR_VENDA_BALCAO',
      requestResumo: `company=${companyId} venda=${venda.id} total=${venda.totalCents} pagamento=${venda.pagamento} motivo=${motivo.slice(0, 80)}`,
      sucesso: true,
      resultRef: venda.financeChargeId || null,
      aprovadoPor: userId != null ? String(userId) : null,
    });
    return this.serializeVenda(companyId, atualizado);
  }

  // ── LISTA + CAIXA DO DIA ──────────────────────────────────────────────────
  async listarVendas(companyId: number, opts: { limite?: number } = {}) {
    await this.requireBalcao(companyId);
    const take = Math.max(1, Math.min(100, Math.trunc(opts.limite || 30)));
    const [rows, dia] = await Promise.all([
      (this.prisma as any).balcaoVenda.findMany({
        where: { companyId },
        include: { itens: true },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      (this.prisma as any).balcaoVenda.aggregate({
        where: { companyId, status: 'CONCLUIDA', createdAt: { gte: inicioDiaBrasil() } },
        _sum: { totalCents: true },
        _count: { _all: true },
      }),
    ]);
    const vendas = [];
    for (const r of rows) vendas.push(await this.serializeVenda(companyId, r, { clientesCache: null }));
    // 1 query só pros nomes dos clientes (em vez de N).
    const clienteIds = [...new Set(rows.map((r: any) => r.clienteId).filter(Boolean))];
    if (clienteIds.length) {
      const clientes = await (this.prisma as any).customerProfile.findMany({
        where: { companyId, id: { in: clienteIds } },
        select: { id: true, name: true },
      });
      const nomes = new Map(clientes.map((c: any) => [c.id, c.name]));
      for (const v of vendas as any[]) if (v.clienteId) v.clienteNome = nomes.get(v.clienteId) || null;
    }
    return {
      vendas,
      dia: { totalCents: Number(dia?._sum?.totalCents) || 0, quantidade: Number(dia?._count?._all) || 0 },
    };
  }

  // ── COMPROVANTE (reusa o render F2a — rodapé SEM VALOR FISCAL obrigatório) ─
  async comprovantePdf(companyId: number, vendaId: string): Promise<{ filename: string; pdf: Buffer }> {
    const perfil = await this.requireBalcao(companyId);
    const venda = await (this.prisma as any).balcaoVenda.findFirst({ where: { id: vendaId, companyId }, include: { itens: true } });
    if (!venda) throw new NotFoundException('Venda não encontrada.');
    const cliente = venda.clienteId
      ? await (this.prisma as any).customerProfile.findFirst({ where: { id: venda.clienteId, companyId }, select: { name: true } })
      : null;
    const municipio = perfil.municipioIbge
      ? await (this.prisma as any).fiscalMunicipio.findUnique({ where: { ibge: perfil.municipioIbge } })
      : null;
    const pdf = await renderComprovanteEntregaPdf({
      empresa: {
        nome: perfil.razaoSocial,
        cnpj: perfil.cnpj,
        municipio: municipio ? `${municipio.nome}/${municipio.uf}` : null,
      },
      cliente: { nome: cliente?.name || 'Consumidor' },
      entregueEm: venda.createdAt,
      itens: venda.itens.map((i: any) => ({ nome: i.produtoNome, quantidade: i.quantidade, valorUnit: i.precoCents / 100 })),
      total: venda.totalCents / 100,
      modoEmissao: (perfil.modoEmissaoProduto === 'entrega' ? 'entrega' : 'fechamento') as 'entrega' | 'fechamento',
      entregaId: venda.id,
    });
    return { filename: `balcao-${venda.id}.pdf`, pdf };
  }

  // ── BUSCA DE CLIENTE (fiado) ──────────────────────────────────────────────
  async buscarClientes(companyId: number, qRaw: string) {
    await this.requireBalcao(companyId);
    const q = String(qRaw || '').trim();
    if (q.length < 2) return [];
    const norm = q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const digits = q.replace(/\D/g, '');
    const rows = await (this.prisma as any).customerProfile.findMany({
      where: {
        companyId,
        status: 'active',
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { searchName: { contains: norm } },
          ...(digits.length >= 4 ? [{ phoneNormalized: { contains: digits } }] : []),
        ],
      },
      select: { id: true, name: true, phone: true, limiteFiado: true },
      take: 8,
      orderBy: { name: 'asc' },
    });
    return rows.map((r: any) => ({ id: r.id, nome: r.name || 'Sem nome', fone: r.phone || null, limiteFiado: r.limiteFiado ?? null }));
  }

  // ── serialização ──────────────────────────────────────────────────────────
  private async serializeVenda(companyId: number, v: any, _opts: { clientesCache?: unknown } = {}) {
    return {
      id: v.id,
      createdAt: v.createdAt ? new Date(v.createdAt).toISOString() : null,
      pagamento: v.pagamento,
      totalCents: v.totalCents,
      status: v.status,
      clienteId: v.clienteId || null,
      clienteNome: null as string | null, // preenchido em lote no listarVendas
      financeChargeId: v.financeChargeId || null,
      motivoCancelamento: v.motivoCancelamento || null,
      canceladaEm: v.canceladaEm ? new Date(v.canceladaEm).toISOString() : null,
      itens: (v.itens || []).map((i: any) => ({
        produtoId: i.produtoId,
        produtoNome: i.produtoNome,
        quantidade: i.quantidade,
        precoCents: i.precoCents,
        subtotalCents: i.subtotalCents,
      })),
    };
  }
}
