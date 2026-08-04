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
    gtin?: string | null;
    precoBalcaoCents?: number | null;
  }) {
    const nome = String(dto.nome || '').trim();
    if (!nome) throw new BadRequestException('Nome do produto é obrigatório.');
    const logisticaProductId = await this.validarVinculoLogistica(companyId, dto.logisticaProductId);
    try {
      return await (this.prisma as any).estoqueProduto.create({
        data: {
          companyId,
          nome,
          unidade: String(dto.unidade || '').trim() || null,
          ncm: String(dto.ncm || '').replace(/\D/g, '') || null,
          cest: String(dto.cest || '').replace(/\D/g, '') || null,
          cfopSaida: String(dto.cfopSaida || '').replace(/\D/g, '') || null,
          csosn: String(dto.csosn || '').replace(/\D/g, '') || null,
          logisticaProductId,
          gtin: this.normalizarGtin(dto.gtin),
          precoBalcaoCents: this.normalizarPrecoCents(dto.precoBalcaoCents),
        },
      });
    } catch (err: any) {
      if (String(err?.code) === 'P2002') {
        throw new BadRequestException('Este código de barras já está em outro produto desta empresa.');
      }
      throw err;
    }
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
    gtin?: string | null;
    precoBalcaoCents?: number | null;
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
    if (dto.gtin !== undefined) data.gtin = this.normalizarGtin(dto.gtin);
    if (dto.precoBalcaoCents !== undefined) data.precoBalcaoCents = this.normalizarPrecoCents(dto.precoBalcaoCents);
    try {
      return await (this.prisma as any).estoqueProduto.update({ where: { id: existing.id }, data });
    } catch (err: any) {
      if (String(err?.code) === 'P2002') {
        throw new BadRequestException('Este código de barras já está em outro produto desta empresa.');
      }
      throw err;
    }
  }

  /** EAN sempre STRING (zero à esquerda); "SEM GTIN"/lixo = null; 8–14 dígitos. */
  private normalizarGtin(raw: string | null | undefined): string | null {
    const v = String(raw || '').trim();
    if (!v || /sem\s*gtin/i.test(v)) return null;
    const digits = v.replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length < 8 || digits.length > 14) {
      throw new BadRequestException('Código de barras inválido — EAN tem de 8 a 14 dígitos.');
    }
    return digits;
  }

  private normalizarPrecoCents(raw: number | null | undefined): number | null {
    if (raw == null) return null;
    const n = Math.trunc(Number(raw));
    if (!Number.isFinite(n) || n < 0) throw new BadRequestException('Preço de balcão inválido.');
    return n || null;
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
  // Revisão adversarial A2 (04/08): o reservado NÃO pode subtrair a BAIXA
  // acumulada da vida inteira (baixa sem carga, atrasada ou de 2 cargas no
  // mesmo dia corrompia o número pra sempre). Agora o reservado fecha POR REF
  // de carga: cada ref é uma "gaveta" (RESERVA − LIBERA − BAIXA daquela ref,
  // clampada em zero) e o total é a soma das gavetas. Baixa SEM ref (entrega
  // fora de carga) mexe só no físico — nunca na reserva de ninguém.
  async saldos(companyId: number): Promise<Map<string, SaldoProduto>> {
    const grupos = await (this.prisma as any).estoqueMovimento.groupBy({
      by: ['produtoId', 'tipo', 'refCargaDia'],
      where: { companyId },
      _sum: { quantidade: true },
    });
    const totais = new Map<string, Record<string, number>>(); // produto → tipo → soma (todas as refs)
    const porRef = new Map<string, Map<string, Record<string, number>>>(); // produto → ref → tipo → soma
    for (const g of grupos) {
      const soma = Number(g._sum?.quantidade) || 0;
      const t = totais.get(g.produtoId) || {};
      t[g.tipo] = (t[g.tipo] || 0) + soma;
      totais.set(g.produtoId, t);
      if (g.refCargaDia != null) {
        const refs = porRef.get(g.produtoId) || new Map();
        const r = refs.get(g.refCargaDia) || {};
        r[g.tipo] = (r[g.tipo] || 0) + soma;
        refs.set(g.refCargaDia, r);
        porRef.set(g.produtoId, refs);
      }
    }
    const out = new Map<string, SaldoProduto>();
    for (const [produtoId, t] of totais) {
      const entradas = (t.ENTRADA_XML || 0) + (t.ENTRADA_MANUAL || 0) + (t.DEVOLUCAO || 0) + (t.REVERSA_CANCELAMENTO || 0);
      const sinalizados = (t.INVENTARIO || 0) + (t.AJUSTE || 0);
      const baixas = (t.BAIXA_ENTREGA || 0) + (t.SAIDA_EMISSAO || 0);
      const fisico = entradas + sinalizados - baixas - (t.PERDA || 0);
      let reservado = 0;
      for (const r of (porRef.get(produtoId) || new Map()).values()) {
        reservado += Math.max(0, (r.RESERVA || 0) - (r.LIBERA_RESERVA || 0) - (r.BAIXA_ENTREGA || 0));
      }
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
    // B4: resíduo binário de Float (2e-15) não vira movimento de lixo na trilha.
    const diff = Math.round((contagem - fisicoAtual) * 1000) / 1000;
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
      // B1 — sugestão: GTIN igual PRIMEIRO (match exato do bip — zera erro),
      // depois NCM igual (dado forte), senão nome contido/contendo.
      const porGtin = item.cEAN ? produtos.find((p: any) => p.gtin && p.gtin === item.cEAN) : null;
      const porNcm = item.ncm ? produtos.find((p: any) => p.ncm && p.ncm === item.ncm) : null;
      const porNome = produtos.find((p: any) => {
        const a = norm(p.nome);
        const b = norm(item.nome);
        return a && b && (a.includes(b) || b.includes(a));
      });
      const sugestao = porGtin || porNcm || porNome || null;
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
  async confirmarEntradaXml(
    companyId: number,
    xml: string,
    mapeamentos: MapeamentoEntradaXml[],
    opts: { permitirRelancamento?: boolean } = {},
  ) {
    await this.requireEstoqueAtivo(companyId);
    const parsed = parseNfeCompra(xml);
    const mapa = new Map<string, MapeamentoEntradaXml>();
    for (const m of mapeamentos || []) mapa.set(String(m.cProd), m);

    // M7 (revisão adversarial): re-lançar a MESMA chave mapeando pra outro
    // produto duplicaria a compra em silêncio. Chave já lançada exige gesto
    // explícito — e quem re-lança assume estornar o lançamento errado.
    const jaLancada = await (this.prisma as any).estoqueMovimento.findFirst({
      where: { companyId, tipo: 'ENTRADA_XML', refChaveNfe: parsed.chaveAcesso },
      select: { id: true },
    });
    if (jaLancada && !opts.permitirRelancamento) {
      throw new BadRequestException(
        'Esta NF-e já teve entrada lançada. Se for intencional (ex.: corrigir mapeamento), marque "lançar mesmo assim" — e estorne o lançamento anterior com um ajuste.',
      );
    }

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

    // A1 (revisão adversarial): 2 itens da MESMA NF-e apontando pro MESMO
    // produto (lotes/preços diferentes) SOMAM — antes o 2º caía no UNIQUE como
    // "duplicado" e a quantidade sumia em silêncio. Fase 1 resolve destinos;
    // fase 2 agrega por produto; fase 3 lança UM movimento por produto.
    let ignorados = 0;
    const porProduto = new Map<string, { quantidade: number; nomes: string[] }>();
    for (const item of parsed.itens) {
      const m = mapa.get(String(item.cProd));
      if (!m || m.ignorar) {
        ignorados += 1;
        continue;
      }
      let produtoId = String(m.produtoId || '').trim() || null;
      if (!produtoId && m.novoProduto?.nome) {
        // B1 — PRÉ-CADASTRO pela nota: o gtin vem do PRÓPRIO XML (item parseado
        // no servidor), nunca do cliente — o produto nasce amarrado ao bip.
        // XML só traz preço de CUSTO → pré-cadastro nasce SEM preço de venda.
        const novo = await this.criarProduto(companyId, {
          nome: m.novoProduto.nome,
          unidade: m.novoProduto.unidade ?? item.unidade,
          ncm: m.novoProduto.ncm ?? item.ncm,
          gtin: item.cEAN,
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
      const atual = porProduto.get(produtoId) || { quantidade: 0, nomes: [] };
      atual.quantidade += item.quantidade;
      atual.nomes.push(item.nome);
      porProduto.set(produtoId, atual);
    }

    let lancados = 0;
    let duplicados = 0;
    for (const [produtoId, agg] of porProduto) {
      try {
        await (this.prisma as any).estoqueMovimento.create({
          data: {
            companyId,
            produtoId,
            tipo: 'ENTRADA_XML',
            quantidade: agg.quantidade,
            refChaveNfe: parsed.chaveAcesso,
            motivo: `NF-e compra ${parsed.emitenteNome || ''} — ${agg.nomes.join(' + ')}`.trim().slice(0, 300),
          },
        });
        lancados += 1;
      } catch (err: any) {
        // P2002 aqui é SÓ reenvio da mesma chave (o agrupamento acima eliminou
        // a colisão interna do próprio XML).
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

    // A2: a baixa que veio de um caminhão CARREGADO carimba a ref da carga
    // ABERTA — é isso que faz a gaveta do reservado fechar por ref. Entrega
    // fora de carga (avulsa/fim de semana) fica sem ref e só mexe no físico.
    let refCargaDia: string | null = null;
    try {
      const cargaAberta = await (this.prisma as any).logisticaCargaDia.findFirst({
        where: { companyId, status: 'ABERTA' },
        orderBy: { dataISO: 'desc' },
        select: { dataISO: true, entregadorId: true },
      });
      if (cargaAberta) {
        refCargaDia = cargaAberta.entregadorId != null ? `${cargaAberta.dataISO}:${cargaAberta.entregadorId}` : cargaAberta.dataISO;
      }
    } catch {
      /* modelo indisponível no ambiente — baixa segue sem ref */
    }

    const saldos = await this.saldos(companyId);
    let baixados = 0;
    const avisos: string[] = [];
    for (const produto of vinculados) {
      const qtd = porLogistica.get(produto.logisticaProductId) ?? 0;
      if (!(qtd > 0)) continue;
      try {
        await (this.prisma as any).estoqueMovimento.create({
          data: { companyId, produtoId: produto.id, tipo: 'BAIXA_ENTREGA', quantidade: qtd, refEntregaId: entregaId, refCargaDia },
        });
        baixados += 1;
        const fisico = (saldos.get(produto.id)?.fisico ?? 0) - qtd;
        if (fisico < 0) {
          const aviso = `Estoque NEGATIVO de "${produto.nome}" após a baixa (${fisico}). Confira entradas/contagem.`;
          avisos.push(aviso);
          this.logger.warn(`[estoque] company=${companyId} ${aviso}`);
        }
      } catch (err: any) {
        if (String(err?.code) !== 'P2002') throw err;
        // M3 (revisão adversarial): reconfirmação com quantidade DIFERENTE
        // (reabrir → corrigir → reconfirmar) lançava só a cobrança — o físico
        // ficava errado pra sempre. Agora a diferença vira AJUSTE com rastro.
        const existente = await (this.prisma as any).estoqueMovimento.findFirst({
          where: { companyId, tipo: 'BAIXA_ENTREGA', refEntregaId: entregaId, produtoId: produto.id },
          select: { id: true, quantidade: true },
        });
        const anterior = Number(existente?.quantidade) || 0;
        const delta = Math.round((anterior - qtd) * 1000) / 1000; // entregou menos → devolve ao físico (+)
        if (existente && delta !== 0) {
          await (this.prisma as any).estoqueMovimento.create({
            data: {
              companyId,
              produtoId: produto.id,
              tipo: 'AJUSTE',
              quantidade: delta,
              motivo: `Correção da entrega ${entregaId}: baixa de ${anterior} → ${qtd}`,
            },
          });
          baixados += 1;
        }
      }
    }
    return { baixados, avisos };
  }

  /**
   * RESERVA da carga (declarar/redeclarar) — RECONCILIA a ref pro ALVO da lista
   * (revisão adversarial M6): lê o líquido atual de CADA produto que já mexeu
   * na ref (união com a lista nova — produto REMOVIDO da redeclaração é
   * liberado) e lança só o DELTA. Idempotente por construção: duplo clique com
   * a mesma lista converge pra delta zero em vez de duplicar liberação.
   */
  async reservarCargaDia(companyId: number, refCargaDia: string, itens: Array<{ logisticaProductId: number; quantidade: number }>): Promise<{ reservados: number }> {
    if (!(await this.estoqueLigado(companyId))) return { reservados: 0 };
    const vinculados = await (this.prisma as any).estoqueProduto.findMany({
      where: { companyId, logisticaProductId: { in: itens.map((i) => Math.trunc(Number(i.logisticaProductId))).filter((n) => n > 0) } },
    });
    const porLogistica = new Map<number, any>(vinculados.map((p: any) => [p.logisticaProductId, p]));

    // Alvo por produto de ESTOQUE (itens sem vínculo ficam de fora — sem trilha fantasma).
    const alvo = new Map<string, number>();
    for (const item of itens) {
      const produto = porLogistica.get(Math.trunc(Number(item.logisticaProductId)));
      const qtd = Number(item.quantidade) || 0;
      if (produto && qtd >= 0) alvo.set(produto.id, (alvo.get(produto.id) ?? 0) + qtd);
    }
    const liquidoAtual = await this.liquidoDaRef(companyId, refCargaDia);
    const produtos = new Set<string>([...alvo.keys(), ...liquidoAtual.keys()]);

    let reservados = 0;
    for (const produtoId of produtos) {
      const target = alvo.get(produtoId) ?? 0;
      const atual = liquidoAtual.get(produtoId) ?? 0;
      const delta = Math.round((target - atual) * 1000) / 1000;
      if (delta > 0) {
        await (this.prisma as any).estoqueMovimento.create({
          data: { companyId, produtoId, tipo: 'RESERVA', quantidade: delta, refCargaDia },
        });
        reservados += 1;
      } else if (delta < 0) {
        await (this.prisma as any).estoqueMovimento.create({
          data: { companyId, produtoId, tipo: 'LIBERA_RESERVA', quantidade: -delta, refCargaDia, motivo: 'Redeclaração da carga' },
        });
      }
    }
    return { reservados };
  }

  /**
   * Fim do dia (conferência do retorno): fecha a GAVETA da ref — libera o
   * líquido remanescente (RESERVA − LIBERA − BAIXA **desta ref**; as baixas
   * chegam carimbadas com a ref da carga aberta). Sem range de data, sem
   * vazamento entre cargas/dias (revisão adversarial A2).
   */
  async liberarCargaDia(companyId: number, refCargaDia: string): Promise<{ liberados: number }> {
    if (!(await this.estoqueLigado(companyId))) return { liberados: 0 };
    const liquido = await this.liquidoDaRef(companyId, refCargaDia, { comBaixas: true });
    let liberados = 0;
    for (const [produtoId, restante] of liquido) {
      if (!(restante > 0)) continue;
      await (this.prisma as any).estoqueMovimento.create({
        data: { companyId, produtoId, tipo: 'LIBERA_RESERVA', quantidade: restante, refCargaDia, motivo: 'Retorno da carga (conferência do dia)' },
      });
      liberados += 1;
    }
    return { liberados };
  }

  // ── miolo ────────────────────────────────────────────────────────────────
  private exigirMotivo(motivo: string, operacao: string) {
    if (String(motivo || '').trim().length < 3) {
      throw new BadRequestException(`Motivo é obrigatório na ${operacao} (mínimo 3 caracteres).`);
    }
  }

  /** Líquido da ref por produto: RESERVA − LIBERA (− BAIXA da ref quando `comBaixas`). */
  private async liquidoDaRef(companyId: number, refCargaDia: string, opts: { comBaixas?: boolean } = {}): Promise<Map<string, number>> {
    const tipos = opts.comBaixas ? ['RESERVA', 'LIBERA_RESERVA', 'BAIXA_ENTREGA'] : ['RESERVA', 'LIBERA_RESERVA'];
    const rows = await (this.prisma as any).estoqueMovimento.findMany({
      where: { companyId, refCargaDia, tipo: { in: tipos } },
      select: { produtoId: true, tipo: true, quantidade: true },
    });
    const out = new Map<string, number>();
    for (const r of rows) {
      const sinal = r.tipo === 'RESERVA' ? 1 : -1;
      out.set(r.produtoId, (out.get(r.produtoId) ?? 0) + sinal * (Number(r.quantidade) || 0));
    }
    return out;
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
