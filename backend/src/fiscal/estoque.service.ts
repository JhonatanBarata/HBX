import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { gzipSync } from 'zlib';
import { PrismaService } from '../prisma/prisma.service';
import { parseNfeCompra } from './nfe-compra-parser.util';

// ===========================================================================
// FISCAL F3 — ESTOQUE de produto único (1–5 SKUs). O HBX controla QUANTIDADE
// (entrou/saiu/sobrou); a contabilidade é do contador do tenant — linha que
// nunca atravessamos.
//
// LEI DO SALDO: 100% DERIVADO da trilha de movimentos — nunca coluna editável,
// nunca UPDATE de saldo. Corrigir = lançar movimento novo (INVENTARIO/AJUSTE
// com rastro). 3 estados:
//   físico     = entradas + devoluções + reversas ± inventário ± ajuste
//                − baixas de entrega − saídas de emissão − perdas
//   reservado  = max(0, RESERVA − LIBERA_RESERVA − BAIXA_ENTREGA)  (claim da carga)
//   disponível = físico − reservado
//   faturado   = BAIXA_ENTREGA + SAIDA_EMISSAO (acumulado — o que JÁ foi)
//
// GATE: movimentos exigem FiscalTenantProfile.estoqueAtivo (os ganchos da
// logística viram no-op silencioso com estoque desligado — empresa que não
// ligou não ganha trilha fantasma).
// ===========================================================================

const TIPOS_SINALIZADOS = new Set(['INVENTARIO', 'AJUSTE']);

export interface SaldoProduto {
  fisico: number;
  reservado: number;
  disponivel: number;
  faturado: number;
}

export interface MapeamentoEntradaXml {
  cProd: string;
  produtoId?: string | null; // produto de estoque existente
  novoProduto?: { nome: string; unidade?: string | null; ncm?: string | null } | null;
  ignorar?: boolean; // item do XML que não é estoque (frete/brinde)
}

@Injectable()
export class EstoqueService {
  private readonly logger = new Logger(EstoqueService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── gate ──────────────────────────────────────────────────────────────────
  private async requireEstoqueAtivo(companyId: number) {
    const perfil = await (this.prisma as any).fiscalTenantProfile.findUnique({ where: { companyId } });
    if (!perfil?.estoqueAtivo) {
      throw new BadRequestException('Controle de estoque está desligado — ligue na configuração fiscal.');
    }
    return perfil;
  }

  private async estoqueLigado(companyId: number): Promise<boolean> {
    const perfil = await (this.prisma as any).fiscalTenantProfile.findUnique({ where: { companyId } });
    return Boolean(perfil?.estoqueAtivo);
  }

  // ── PRODUTOS ──────────────────────────────────────────────────────────────
  async listarProdutos(companyId: number, incluirInativos = false) {
    const where: Record<string, unknown> = { companyId };
    if (!incluirInativos) where.ativo = true;
    const [produtos, saldos] = await Promise.all([
      (this.prisma as any).estoqueProduto.findMany({ where, orderBy: { createdAt: 'asc' } }),
      this.saldos(companyId),
    ]);
    return produtos.map((p: any) => ({ ...p, saldo: saldos.get(p.id) || { fisico: 0, reservado: 0, disponivel: 0, faturado: 0 } }));
  }

  async criarProduto(companyId: number, dto: {
    nome: string;
    unidade?: string | null;
    ncm?: string | null;
    cest?: string | null;
    cfopSaida?: string | null;
    csosn?: string | null;
    logisticaProductId?: number | null;
  }) {
    const nome = String(dto.nome || '').trim();
    if (!nome) throw new BadRequestException('Nome do produto é obrigatório.');
    const logisticaProductId = await this.validarVinculoLogistica(companyId, dto.logisticaProductId);
    return (this.prisma as any).estoqueProduto.create({
      data: {
        companyId,
        nome,
        unidade: String(dto.unidade || '').trim() || null,
        ncm: String(dto.ncm || '').replace(/\D/g, '') || null,
        cest: String(dto.cest || '').replace(/\D/g, '') || null,
        cfopSaida: String(dto.cfopSaida || '').replace(/\D/g, '') || null,
        csosn: String(dto.csosn || '').replace(/\D/g, '') || null,
        logisticaProductId,
      },
    });
  }

  async atualizarProduto(companyId: number, id: string, dto: {
    nome?: string;
    unidade?: string | null;
    ncm?: string | null;
    cest?: string | null;
    cfopSaida?: string | null;
    csosn?: string | null;
    logisticaProductId?: number | null;
    ativo?: boolean;
  }) {
    const existing = await (this.prisma as any).estoqueProduto.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Produto de estoque não encontrado.');
    const data: Record<string, unknown> = {};
    if (dto.nome !== undefined) {
      const nome = String(dto.nome || '').trim();
      if (!nome) throw new BadRequestException('Nome não pode ficar vazio.');
      data.nome = nome;
    }
    for (const k of ['unidade'] as const) {
      if (dto[k] !== undefined) data[k] = String(dto[k] || '').trim() || null;
    }
    for (const k of ['ncm', 'cest', 'cfopSaida', 'csosn'] as const) {
      if (dto[k] !== undefined) data[k] = String(dto[k] || '').replace(/\D/g, '') || null;
    }
    if (dto.logisticaProductId !== undefined) {
      data.logisticaProductId = await this.validarVinculoLogistica(companyId, dto.logisticaProductId, existing.id);
    }
    if (dto.ativo !== undefined) data.ativo = Boolean(dto.ativo);
    return (this.prisma as any).estoqueProduto.update({ where: { id: existing.id }, data });
  }

  /** Vínculo com o Product da logística: precisa existir NESTA empresa e não estar em outro estoque. */
  private async validarVinculoLogistica(companyId: number, raw: number | null | undefined, ignorarEstoqueId?: string): Promise<number | null> {
    const id = Math.trunc(Number(raw));
    if (!Number.isInteger(id) || id <= 0) return null;
    const produto = await (this.prisma as any).product.findFirst({ where: { id, companyId }, select: { id: true } });
    if (!produto) throw new BadRequestException('Produto da logística não encontrado nesta empresa.');
    const emUso = await (this.prisma as any).estoqueProduto.findFirst({
      where: { companyId, logisticaProductId: id, ...(ignorarEstoqueId ? { id: { not: ignorarEstoqueId } } : {}) },
      select: { id: true, nome: true },
    });
    if (emUso) throw new BadRequestException(`Este produto da logística já está vinculado a "${emUso.nome}".`);
    return id;
  }

  // ── SALDOS (derivados — a única fonte é a trilha) ─────────────────────────
  async saldos(companyId: number): Promise<Map<string, SaldoProduto>> {
    const grupos = await (this.prisma as any).estoqueMovimento.groupBy({
      by: ['produtoId', 'tipo'],
      where: { companyId },
      _sum: { quantidade: true },
    });
    const porProduto = new Map<string, Record<string, number>>();
    for (const g of grupos) {
      const atual = porProduto.get(g.produtoId) || {};
      atual[g.tipo] = Number(g._sum?.quantidade) || 0;
      porProduto.set(g.produtoId, atual);
    }
    const out = new Map<string, SaldoProduto>();
    for (const [produtoId, t] of porProduto) {
      const entradas = (t.ENTRADA_XML || 0) + (t.ENTRADA_MANUAL || 0) + (t.DEVOLUCAO || 0) + (t.REVERSA_CANCELAMENTO || 0);
      const sinalizados = (t.INVENTARIO || 0) + (t.AJUSTE || 0);
      const baixas = (t.BAIXA_ENTREGA || 0) + (t.SAIDA_EMISSAO || 0);
      const fisico = entradas + sinalizados - baixas - (t.PERDA || 0);
      const reservado = Math.max(0, (t.RESERVA || 0) - (t.LIBERA_RESERVA || 0) - (t.BAIXA_ENTREGA || 0));
      out.set(produtoId, {
        fisico,
        reservado,
        disponivel: fisico - reservado,
        faturado: baixas,
      });
    }
    return out;
  }

  async extrato(companyId: number, opts: { produtoId?: string; limite?: number } = {}) {
    const where: Record<string, unknown> = { companyId };
    if (opts.produtoId) where.produtoId = String(opts.produtoId);
    return (this.prisma as any).estoqueMovimento.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(300, Math.trunc(opts.limite || 80))),
    });
  }

  // ── MOVIMENTOS MANUAIS (tela) ─────────────────────────────────────────────
  async entradaManual(companyId: number, dto: { produtoId: string; quantidade: number; motivo?: string | null }) {
    await this.requireEstoqueAtivo(companyId);
    return this.lancar(companyId, dto.produtoId, 'ENTRADA_MANUAL', dto.quantidade, { motivo: dto.motivo });
  }

  /** PERDA — baixa com motivo OBRIGATÓRIO (quebrou/venceu/extraviou). Rastro fiscal. */
  async perda(companyId: number, dto: { produtoId: string; quantidade: number; motivo: string }) {
    await this.requireEstoqueAtivo(companyId);
    this.exigirMotivo(dto.motivo, 'perda');
    return this.lancar(companyId, dto.produtoId, 'PERDA', dto.quantidade, { motivo: dto.motivo });
  }

  /** AJUSTE assinado (+/−) com motivo OBRIGATÓRIO. */
  async ajuste(companyId: number, dto: { produtoId: string; quantidade: number; motivo: string }) {
    await this.requireEstoqueAtivo(companyId);
    this.exigirMotivo(dto.motivo, 'ajuste');
    return this.lancar(companyId, dto.produtoId, 'AJUSTE', dto.quantidade, { motivo: dto.motivo, permitirNegativo: true });
  }

  async devolucao(companyId: number, dto: { produtoId: string; quantidade: number; motivo?: string | null }) {
    await this.requireEstoqueAtivo(companyId);
    return this.lancar(companyId, dto.produtoId, 'DEVOLUCAO', dto.quantidade, { motivo: dto.motivo });
  }

  /**
   * INVENTÁRIO — o tenant digita a CONTAGEM física; o sistema calcula a
   * diferença contra o saldo derivado e LANÇA o movimento (+/−). O saldo segue
   * 100% derivado — nunca editado na mão.
   */
  async inventario(companyId: number, dto: { produtoId: string; contagem: number; motivo?: string | null }) {
    await this.requireEstoqueAtivo(companyId);
    const contagem = Number(dto.contagem);
    if (!Number.isFinite(contagem) || contagem < 0) throw new BadRequestException('Contagem física inválida.');
    const saldos = await this.saldos(companyId);
    const fisicoAtual = saldos.get(String(dto.produtoId))?.fisico ?? 0;
    const diff = contagem - fisicoAtual;
    if (diff === 0) {
      return { lancado: false, diferenca: 0, aviso: 'Contagem bate com o saldo — nada a lançar.' };
    }
    const mov = await this.lancar(companyId, dto.produtoId, 'INVENTARIO', diff, {
      motivo: String(dto.motivo || '').trim() || `Contagem física: ${contagem} (saldo era ${fisicoAtual})`,
      permitirNegativo: true,
    });
    return { lancado: true, diferenca: diff, movimento: mov };
  }

  /**
   * Gate da EMISSÃO de NF-e de produto (F2b vai chamar): negativo AVISA por
   * default; 'travar' recusa. NÃO usado na baixa de entrega — rua nunca trava.
   */
  async verificarDisponibilidade(companyId: number, produtoId: string, quantidade: number): Promise<{ ok: boolean; aviso: string | null }> {
    const perfil = await this.requireEstoqueAtivo(companyId);
    const saldos = await this.saldos(companyId);
    const disponivel = saldos.get(String(produtoId))?.disponivel ?? 0;
    if (disponivel - quantidade >= 0) return { ok: true, aviso: null };
    const msg = `Estoque insuficiente: disponível ${disponivel}, pedido ${quantidade}.`;
    if (perfil.estoqueNegativo === 'travar') {
      throw new BadRequestException(`${msg} A empresa configurou TRAVAR emissão com estoque negativo.`);
    }
    return { ok: true, aviso: `${msg} (Emitindo mesmo assim — configuração 'avisar'.)` };
  }

  // ── ENTRADA POR XML (upload da NF-e de compra) ────────────────────────────
  /** 1º passo: parse + sugestão de mapeamento por produto (tela de conferência). */
  async previewEntradaXml(companyId: number, xml: string) {
    await this.requireEstoqueAtivo(companyId);
    const parsed = parseNfeCompra(xml);
    const jaLancada = await (this.prisma as any).estoqueMovimento.findFirst({
      where: { companyId, tipo: 'ENTRADA_XML', refChaveNfe: parsed.chaveAcesso },
      select: { id: true },
    });
    const produtos = await (this.prisma as any).estoqueProduto.findMany({ where: { companyId, ativo: true } });
    const norm = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
    const itens = parsed.itens.map((item) => {
      // Sugestão: NCM igual primeiro (dado forte), senão nome contido/contendo.
      const porNcm = item.ncm ? produtos.find((p: any) => p.ncm && p.ncm === item.ncm) : null;
      const porNome = produtos.find((p: any) => {
        const a = norm(p.nome);
        const b = norm(item.nome);
        return a && b && (a.includes(b) || b.includes(a));
      });
      const sugestao = porNcm || porNome || null;
      return { ...item, sugestaoProdutoId: sugestao?.id ?? null, sugestaoProdutoNome: sugestao?.nome ?? null };
    });
    return {
      chaveAcesso: parsed.chaveAcesso,
      emitenteNome: parsed.emitenteNome,
      emitenteCnpj: parsed.emitenteCnpj,
      jaLancada: Boolean(jaLancada),
      itens,
    };
  }

  /** 2º passo: confirma com os mapeamentos — dedup DURO por chave+produto. */
  async confirmarEntradaXml(companyId: number, xml: string, mapeamentos: MapeamentoEntradaXml[]) {
    await this.requireEstoqueAtivo(companyId);
    const parsed = parseNfeCompra(xml);
    const mapa = new Map<string, MapeamentoEntradaXml>();
    for (const m of mapeamentos || []) mapa.set(String(m.cProd), m);

    // MALOTE (decisão 10): o XML da compra fica GUARDADO — upsert idempotente
    // por (empresa, chave). Competência = mês do upload (fuso do Brasil).
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' });
    const parts = fmt.formatToParts(new Date());
    const competencia = `${parts.find((p) => p.type === 'year')?.value}-${parts.find((p) => p.type === 'month')?.value}`;
    await (this.prisma as any).fiscalCompraXml.upsert({
      where: { companyId_chaveAcesso: { companyId, chaveAcesso: parsed.chaveAcesso } },
      create: {
        companyId,
        chaveAcesso: parsed.chaveAcesso,
        emitenteNome: parsed.emitenteNome,
        emitenteCnpj: parsed.emitenteCnpj,
        competencia,
        xmlGzB64: gzipSync(Buffer.from(String(xml), 'utf8')).toString('base64'),
      },
      update: {}, // reenvio do mesmo XML não reescreve o guardado
    });

    let lancados = 0;
    let duplicados = 0;
    let ignorados = 0;
    for (const item of parsed.itens) {
      const m = mapa.get(String(item.cProd));
      if (!m || m.ignorar) {
        ignorados += 1;
        continue;
      }
      let produtoId = String(m.produtoId || '').trim() || null;
      if (!produtoId && m.novoProduto?.nome) {
        const novo = await this.criarProduto(companyId, {
          nome: m.novoProduto.nome,
          unidade: m.novoProduto.unidade ?? item.unidade,
          ncm: m.novoProduto.ncm ?? item.ncm,
        });
        produtoId = novo.id;
      }
      if (!produtoId) {
        throw new BadRequestException(`Item "${item.nome}" sem destino: escolha um produto, crie um novo ou marque ignorar.`);
      }
      const produto = await (this.prisma as any).estoqueProduto.findFirst({ where: { id: produtoId, companyId } });
      if (!produto) throw new BadRequestException(`Produto de estoque não encontrado para o item "${item.nome}".`);
      if (!(item.quantidade > 0)) {
        ignorados += 1;
        continue;
      }
      try {
        await (this.prisma as any).estoqueMovimento.create({
          data: {
            companyId,
            produtoId,
            tipo: 'ENTRADA_XML',
            quantidade: item.quantidade,
            refChaveNfe: parsed.chaveAcesso,
            motivo: `NF-e compra ${parsed.emitenteNome || ''} — ${item.nome}`.trim(),
          },
        });
        lancados += 1;
      } catch (err: any) {
        // P2002 = o UNIQUE (chave+produto) mordeu — a mesma compra 2× não duplica.
        if (String(err?.code) === 'P2002') duplicados += 1;
        else throw err;
      }
    }
    return { chaveAcesso: parsed.chaveAcesso, lancados, duplicados, ignorados };
  }

  // ── GANCHOS DA LOGÍSTICA (chamados best-effort de lá) ─────────────────────
  /**
   * BAIXA definitiva quando o motorista CONCLUI a entrega (decisão do dono: a
   * baixa é na entrega confirmada, não na emissão — a NF-e do fechamento
   * CONCILIA). No-op silencioso com estoque desligado ou produto sem vínculo.
   * Dedup DURO por (entrega, produto) — reconfirmação não baixa 2×.
   * Negativo AVISA (log alto) — entrega de rua nunca trava.
   */
  async baixaPorEntrega(companyId: number, entregaId: string): Promise<{ baixados: number; avisos: string[] }> {
    if (!(await this.estoqueLigado(companyId))) return { baixados: 0, avisos: [] };
    const entrega = await (this.prisma as any).entrega.findFirst({
      where: { id: entregaId, companyId },
      select: {
        id: true,
        productId: true,
        quantidade: true,
        itens: { select: { productId: true, qtdEntregue: true, qtdPrevista: true } },
      },
    });
    if (!entrega) return { baixados: 0, avisos: [] };

    // qtd por produto da LOGÍSTICA (mesma fórmula do módulo: entregue ?? prevista).
    const porLogistica = new Map<number, number>();
    const soma = (pid: number | null | undefined, qtd: number) => {
      const id = Math.trunc(Number(pid));
      if (!Number.isInteger(id) || id <= 0 || !(qtd > 0)) return;
      porLogistica.set(id, (porLogistica.get(id) ?? 0) + qtd);
    };
    if (entrega.itens?.length) {
      for (const it of entrega.itens) soma(it.productId, Number(it.qtdEntregue ?? it.qtdPrevista) || 0);
    } else {
      soma(entrega.productId, Number(entrega.quantidade) || 0);
    }
    if (porLogistica.size === 0) return { baixados: 0, avisos: [] };

    const vinculados = await (this.prisma as any).estoqueProduto.findMany({
      where: { companyId, logisticaProductId: { in: Array.from(porLogistica.keys()) } },
    });
    const saldos = await this.saldos(companyId);
    let baixados = 0;
    const avisos: string[] = [];
    for (const produto of vinculados) {
      const qtd = porLogistica.get(produto.logisticaProductId) ?? 0;
      if (!(qtd > 0)) continue;
      try {
        await (this.prisma as any).estoqueMovimento.create({
          data: { companyId, produtoId: produto.id, tipo: 'BAIXA_ENTREGA', quantidade: qtd, refEntregaId: entregaId },
        });
        baixados += 1;
        const fisico = (saldos.get(produto.id)?.fisico ?? 0) - qtd;
        if (fisico < 0) {
          const aviso = `Estoque NEGATIVO de "${produto.nome}" após a baixa (${fisico}). Confira entradas/contagem.`;
          avisos.push(aviso);
          this.logger.warn(`[estoque] company=${companyId} ${aviso}`);
        }
      } catch (err: any) {
        if (String(err?.code) === 'P2002') continue; // reconfirmação — já baixado
        throw err;
      }
    }
    return { baixados, avisos };
  }

  /**
   * RESERVA da carga do caminhão (declarar/redeclarar): re-reserva a ref do dia
   * — libera o que a ref tinha e reserva a lista nova (trilha imutável e
   * auditável; nada é apagado).
   */
  async reservarCargaDia(companyId: number, refCargaDia: string, itens: Array<{ logisticaProductId: number; quantidade: number }>): Promise<{ reservados: number }> {
    if (!(await this.estoqueLigado(companyId))) return { reservados: 0 };
    const vinculados = await (this.prisma as any).estoqueProduto.findMany({
      where: { companyId, logisticaProductId: { in: itens.map((i) => Math.trunc(Number(i.logisticaProductId))).filter((n) => n > 0) } },
    });
    const porLogistica = new Map<number, any>(vinculados.map((p: any) => [p.logisticaProductId, p]));

    let reservados = 0;
    for (const item of itens) {
      const produto = porLogistica.get(Math.trunc(Number(item.logisticaProductId)));
      const qtd = Number(item.quantidade) || 0;
      if (!produto || !(qtd >= 0)) continue;
      const anterior = await this.reservaAtualDaRef(companyId, produto.id, refCargaDia);
      if (anterior > 0) {
        await (this.prisma as any).estoqueMovimento.create({
          data: { companyId, produtoId: produto.id, tipo: 'LIBERA_RESERVA', quantidade: anterior, refCargaDia, motivo: 'Redeclaração da carga' },
        });
      }
      if (qtd > 0) {
        await (this.prisma as any).estoqueMovimento.create({
          data: { companyId, produtoId: produto.id, tipo: 'RESERVA', quantidade: qtd, refCargaDia },
        });
        reservados += 1;
      }
    }
    return { reservados };
  }

  /**
   * Fim do dia (conferência do retorno): libera o remanescente reservado da ref
   * DESCONTANDO as baixas de entrega do dia — o saldo fecha sem fantasma
   * (faltou/sobrou continua visível na conferência da carga e no físico;
   * perda/ajuste é decisão humana na tela).
   */
  async liberarCargaDia(companyId: number, refCargaDia: string, dataISO: string): Promise<{ liberados: number }> {
    if (!(await this.estoqueLigado(companyId))) return { liberados: 0 };
    const reservas = await (this.prisma as any).estoqueMovimento.findMany({
      where: { companyId, refCargaDia, tipo: { in: ['RESERVA', 'LIBERA_RESERVA'] } },
      select: { produtoId: true, tipo: true, quantidade: true },
    });
    const porProduto = new Map<string, number>();
    for (const r of reservas) {
      const sinal = r.tipo === 'RESERVA' ? 1 : -1;
      porProduto.set(r.produtoId, (porProduto.get(r.produtoId) ?? 0) + sinal * (Number(r.quantidade) || 0));
    }
    // Baixas do DIA civil SP (o vendido da rota já saiu do reservado na derivação).
    const start = new Date(`${dataISO}T00:00:00-03:00`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
    let liberados = 0;
    for (const [produtoId, reservaLiquida] of porProduto) {
      if (!(reservaLiquida > 0)) continue;
      const baixasDia = await (this.prisma as any).estoqueMovimento.aggregate({
        where: { companyId, produtoId, tipo: 'BAIXA_ENTREGA', createdAt: { gte: start, lte: end } },
        _sum: { quantidade: true },
      });
      const liberar = Math.max(0, reservaLiquida - (Number(baixasDia?._sum?.quantidade) || 0));
      if (liberar > 0) {
        await (this.prisma as any).estoqueMovimento.create({
          data: { companyId, produtoId, tipo: 'LIBERA_RESERVA', quantidade: liberar, refCargaDia, motivo: 'Retorno da carga (conferência do dia)' },
        });
        liberados += 1;
      }
    }
    return { liberados };
  }

  // ── miolo ────────────────────────────────────────────────────────────────
  private exigirMotivo(motivo: string, operacao: string) {
    if (String(motivo || '').trim().length < 3) {
      throw new BadRequestException(`Motivo é obrigatório na ${operacao} (mínimo 3 caracteres).`);
    }
  }

  private async reservaAtualDaRef(companyId: number, produtoId: string, refCargaDia: string): Promise<number> {
    const rows = await (this.prisma as any).estoqueMovimento.findMany({
      where: { companyId, produtoId, refCargaDia, tipo: { in: ['RESERVA', 'LIBERA_RESERVA'] } },
      select: { tipo: true, quantidade: true },
    });
    return rows.reduce((s: number, r: any) => s + (r.tipo === 'RESERVA' ? 1 : -1) * (Number(r.quantidade) || 0), 0);
  }

  private async lancar(
    companyId: number,
    produtoIdRaw: string,
    tipo: string,
    quantidadeRaw: number,
    opts: { motivo?: string | null; permitirNegativo?: boolean } = {},
  ) {
    const produtoId = String(produtoIdRaw || '').trim();
    const produto = await (this.prisma as any).estoqueProduto.findFirst({ where: { id: produtoId, companyId } });
    if (!produto) throw new NotFoundException('Produto de estoque não encontrado.');
    const quantidade = Number(quantidadeRaw);
    if (!Number.isFinite(quantidade) || quantidade === 0) throw new BadRequestException('Quantidade inválida.');
    if (!opts.permitirNegativo && !TIPOS_SINALIZADOS.has(tipo) && quantidade < 0) {
      throw new BadRequestException('Quantidade deve ser positiva — pra tirar do estoque use perda/ajuste/inventário.');
    }
    return (this.prisma as any).estoqueMovimento.create({
      data: { companyId, produtoId, tipo, quantidade, motivo: String(opts.motivo || '').trim() || null },
    });
  }
}
