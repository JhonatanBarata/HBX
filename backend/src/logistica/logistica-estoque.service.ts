import { BadRequestException, ForbiddenException, Injectable, Logger, Optional } from '@nestjs/common';
import type { ActorKindUserLike } from '../access/actor-kind';
import { PrismaService } from '../prisma/prisma.service';
import { EstoqueService } from '../fiscal/estoque.service';
import { LogisticaConfigService } from './logistica-config.service';
import { addCivilDays } from './logistica-occurrence.service';
import { canonicalRouteDate } from './logistica-route-billing.service';
import type { ConferirRetornoCargaDiaDto, DeclararCargaDiaDto } from './dto/logistica-estoque.dto';

/**
 * PR27072026 F2 (27/07) — ESTOQUE DE CARGA: conferência de caminhão do dia
 * ("carregou X, vendeu Y, voltou Z; bateu/estourou"). NÃO é almoxarifado/WMS —
 * 1 tela, 2 números por produto (docs/PLANEJAMENTOS/PR27072026-ROTA-3-NIVEIS.md,
 * frente F2). Recurso ADVANCED+ (gate de nível, mesmo padrão do F1 — BASIC nem
 * vê a tela, ForbiddenException em todo método público).
 *
 * ── VENDIDO É SEMPRE DERIVADO, NUNCA UMA 2ª FONTE DE VERDADE ─────────────────
 * "Vendeu Y" NÃO é digitado por ninguém: é a SOMA do EntregaItem.qtdEntregue (já
 * gravado pelo confirmar da entrega) dos pedidos 'entregue' do dia — a mesma
 * fórmula de fallback do resto do módulo (qtdEntregue ?? qtdPrevista ?? 0).
 * Enquanto a carga está ABERTA, "vendido"/"esperado de retorno" são calculados
 * AO VIVO a cada leitura (nunca armazenados — a rota ainda está rodando, o
 * número muda a cada entrega confirmada). Só na CONFERÊNCIA (fim do dia) é que
 * o vendido vira SNAPSHOT congelado junto do retorno/resultado — depois disso
 * a leitura nunca mais recalcula (mesma "fotografia do instante" do
 * ClienteHistorico: a entrega de amanhã não pode reescrever a conferência de hoje).
 *
 * MVP é 1 caminhão por empresa/dia — `entregadorId` existe no schema (coluna
 * solta, sem FK) só pra não fechar a porta pro futuro multi-caminhão; o front
 * de hoje nem manda o campo (null = caminhão único da empresa).
 */
@Injectable()
export class LogisticaEstoqueService {
  private readonly logger = new Logger(LogisticaEstoqueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: LogisticaConfigService,
    // FISCAL F3 — a carga declarada RESERVA o estoque (claim do caminhão) e a
    // conferência do retorno LIBERA o que voltou. Gate estoqueAtivo + vínculo
    // de produto moram DENTRO do serviço fiscal. @Optional() (testes = no-op);
    // best-effort: estoque NUNCA derruba a operação da carga.
    @Optional() private readonly fiscalEstoque?: EstoqueService,
  ) {}

  /** Ref única da carga no estoque: dia civil + entregador (null = caminhão único). */
  private refCargaDia(dataISO: string, entregadorId: number | null): string {
    return entregadorId != null ? `${dataISO}:${entregadorId}` : dataISO;
  }

  // ── gate de nível (ADVANCED+) ────────────────────────────────────────────────
  private async gateNivel(companyId: number, actor?: ActorKindUserLike | null): Promise<void> {
    if (actor?.isSystemMaster) return;
    const { nivel } = await this.config.getNivel(companyId);
    if (nivel === 'BASIC') {
      throw new ForbiddenException('Estoque de carga é do plano Advanced.');
    }
  }

  private normalizeDataISO(input: string | undefined): string {
    return canonicalRouteDate(input);
  }

  private normalizeEntregadorId(input: number | undefined | null): number | null {
    const id = Math.trunc(Number(input));
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  /**
   * Molde de logistica-admin-route.service.ts#dateRange — duplicado de propósito
   * (mesmo padrão do BUG 5/resolveDayRange documentado em logistica.service.ts:
   * cada arquivo com sua própria cópia de 3 linhas, sem acoplar módulos). Brasil
   * não observa DST desde 2019 — "-03:00" fixo é seguro o ano inteiro. Regra do
   * módulo: só helpers de dia civil SP (addCivilDays), nada de setDate/getDay.
   */
  private dataRangeCivilSP(dataISO: string): { start: Date; end: Date } {
    const next = addCivilDays(dataISO, 1);
    const start = new Date(`${dataISO}T00:00:00-03:00`);
    const end = new Date(new Date(`${next}T00:00:00-03:00`).getTime() - 1);
    return { start, end };
  }

  /**
   * Soma qtdEntregue (fallback qtdPrevista, fallback 0 — MESMA fórmula usada em
   * listRota/histórico/fechamento) por produto, das Entregas 'entregue' do dia
   * (deliveredAt no range civil SP). Legado sem EntregaItem cai no productId/
   * quantidade da própria Entrega (mesmo fallback do listRota).
   */
  private async vendidoPorProduto(
    companyId: number,
    dataISO: string,
    entregadorId: number | null,
  ): Promise<Map<number, number>> {
    const { start, end } = this.dataRangeCivilSP(dataISO);
    const rows = await this.prisma.entrega.findMany({
      where: {
        companyId,
        status: 'entregue',
        deliveredAt: { gte: start, lte: end },
        ...(entregadorId != null ? { entregadorId } : {}),
      },
      select: {
        productId: true,
        quantidade: true,
        itens: { select: { productId: true, qtdEntregue: true, qtdPrevista: true } },
      },
    });
    const mapa = new Map<number, number>();
    const soma = (productId: number | null | undefined, qtd: number) => {
      const pid = Math.trunc(Number(productId));
      if (!Number.isInteger(pid) || pid <= 0) return;
      mapa.set(pid, (mapa.get(pid) ?? 0) + Math.max(0, qtd));
    };
    for (const r of rows) {
      if (r.itens.length > 0) {
        for (const it of r.itens) soma(it.productId, it.qtdEntregue ?? it.qtdPrevista ?? 0);
      } else {
        soma(r.productId, r.quantidade ?? 0);
      }
    }
    return mapa;
  }

  private async findRow(companyId: number, dataISO: string, entregadorId: number | null) {
    return this.prisma.logisticaCargaDia.findFirst({
      where: { companyId, dataISO, entregadorId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        dataISO: true,
        entregadorId: true,
        status: true,
        conferidaAt: true,
        itens: {
          select: {
            id: true,
            productId: true,
            qtdCarregada: true,
            qtdVendidaSnapshot: true,
            qtdRetorno: true,
            resultado: true,
            product: { select: { id: true, name: true, unidade: true } },
          },
        },
      },
    });
  }

  private async montarDTO(
    companyId: number,
    dataISO: string,
    entregadorId: number | null,
    row: Awaited<ReturnType<LogisticaEstoqueService['findRow']>>,
  ): Promise<CargaDiaDTO> {
    if (!row) {
      return { id: null, dataISO, entregadorId, status: null, declarada: false, conferidaAt: null, itens: [] };
    }
    if (row.status === 'CONFERIDA') {
      // Snapshot congelado — NUNCA recalcula vendido/esperado depois de conferido.
      return {
        id: row.id,
        dataISO: row.dataISO,
        entregadorId: row.entregadorId,
        status: 'CONFERIDA',
        declarada: true,
        conferidaAt: row.conferidaAt ? row.conferidaAt.toISOString() : null,
        itens: row.itens.map((it) => ({
          id: it.id,
          productId: it.productId ?? 0,
          produtoNome: it.product?.name ?? null,
          unidade: it.product?.unidade ?? null,
          qtdCarregada: it.qtdCarregada,
          qtdVendida: it.qtdVendidaSnapshot ?? 0,
          qtdEsperadaRetorno: it.qtdCarregada - (it.qtdVendidaSnapshot ?? 0),
          qtdRetorno: it.qtdRetorno ?? null,
          resultado: (it.resultado as CargaDiaResultado | null) ?? null,
        })),
      };
    }
    // ABERTA — vendido/esperado calculados AO VIVO (a rota ainda está rodando).
    const vendidoMap = await this.vendidoPorProduto(companyId, dataISO, entregadorId);
    return {
      id: row.id,
      dataISO: row.dataISO,
      entregadorId: row.entregadorId,
      status: 'ABERTA',
      declarada: true,
      conferidaAt: null,
      itens: row.itens.map((it) => {
        const pid = it.productId ?? 0;
        const vendida = vendidoMap.get(pid) ?? 0;
        return {
          id: it.id,
          productId: pid,
          produtoNome: it.product?.name ?? null,
          unidade: it.product?.unidade ?? null,
          qtdCarregada: it.qtdCarregada,
          qtdVendida: vendida,
          qtdEsperadaRetorno: it.qtdCarregada - vendida,
          qtdRetorno: null,
          resultado: null,
        };
      }),
    };
  }

  // ── LER ───────────────────────────────────────────────────────────────────
  async getCargaDia(
    companyId: number,
    dataISOInput: string | undefined,
    actor?: ActorKindUserLike | null,
    entregadorIdInput?: number,
  ): Promise<CargaDiaDTO> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    await this.gateNivel(companyId, actor);
    const dataISO = this.normalizeDataISO(dataISOInput);
    const entregadorId = this.normalizeEntregadorId(entregadorIdInput);
    const row = await this.findRow(companyId, dataISO, entregadorId);
    return this.montarDTO(companyId, dataISO, entregadorId, row);
  }

  // ── DECLARAR (o que subiu no caminhão) ───────────────────────────────────────
  /**
   * Idempotente enquanto ABERTA: redeclarar no MESMO dia SUBSTITUI a lista de
   * itens (delete+recria — o operador corrigiu uma quantidade digitada errado).
   * Depois de CONFERIDA, a carga do dia é IMUTÁVEL (BadRequestException).
   */
  async declararCarga(
    companyId: number,
    input: DeclararCargaDiaDto,
    actor?: ActorKindUserLike | null,
  ): Promise<CargaDiaDTO> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    await this.gateNivel(companyId, actor);
    const dataISO = this.normalizeDataISO(input?.dataISO);
    const entregadorId = this.normalizeEntregadorId(input?.entregadorId);
    const itensInput = Array.isArray(input?.itens) ? input.itens : [];
    if (itensInput.length === 0) throw new BadRequestException('Informe ao menos 1 produto.');

    // Dedupe por productId — o mesmo produto 2× no body soma (nunca substitui
    // silenciosamente; o operador digitou 2 linhas do mesmo item por engano).
    const porProduto = new Map<number, number>();
    for (const it of itensInput) {
      const pid = Math.trunc(Number(it?.productId));
      if (!Number.isInteger(pid) || pid <= 0) throw new BadRequestException('Produto inválido.');
      const qtd = Math.max(0, Math.trunc(Number(it?.qtdCarregada) || 0));
      porProduto.set(pid, (porProduto.get(pid) ?? 0) + qtd);
    }
    const productIds = Array.from(porProduto.keys());
    const produtos = await this.prisma.product.findMany({
      where: { id: { in: productIds }, companyId },
      select: { id: true },
    });
    const validos = new Set(produtos.map((p) => p.id));
    const invalido = productIds.find((id) => !validos.has(id));
    if (invalido) throw new BadRequestException(`Produto ${invalido} não encontrado nesta empresa.`);

    const existente = await this.prisma.logisticaCargaDia.findFirst({
      where: { companyId, dataISO, entregadorId },
      select: { id: true, status: true },
    });
    if (existente?.status === 'CONFERIDA') {
      throw new BadRequestException('A carga deste dia já foi conferida — não é possível redeclarar.');
    }

    const itensCreate = Array.from(porProduto.entries()).map(([productId, qtdCarregada]) => ({ productId, qtdCarregada }));

    if (existente) {
      await this.prisma.$transaction([
        this.prisma.logisticaCargaDiaItem.deleteMany({ where: { cargaDiaId: existente.id } }),
        this.prisma.logisticaCargaDiaItem.createMany({
          data: itensCreate.map((it) => ({ ...it, cargaDiaId: existente.id })),
        }),
        // B4 — redeclarar na tela é TAKEOVER humano: a gaveta vira MANUAL e a
        // rota para de reconciliá-la (a contagem física manda; muitas vezes o
        // caminhão leva MAIS que o previsto, galão extra pra venda avulsa).
        this.prisma.logisticaCargaDia.update({
          where: { id: existente.id },
          data: { origem: 'MANUAL' },
        }),
      ]);
    } else {
      await this.prisma.logisticaCargaDia.create({
        data: { companyId, dataISO, entregadorId, status: 'ABERTA', origem: 'MANUAL', itens: { create: itensCreate } },
      });
    }

    // FISCAL F3 — (re)declarar a carga (re)reserva o estoque dos produtos
    // vinculados. Best-effort com voz: falha vira log, a carga segue.
    if (this.fiscalEstoque) {
      await this.fiscalEstoque
        .reservarCargaDia(
          companyId,
          this.refCargaDia(dataISO, entregadorId),
          itensCreate.map((it) => ({ logisticaProductId: it.productId, quantidade: it.qtdCarregada })),
        )
        .catch((e: any) => {
          this.logger.warn(`[logistica] reserva de estoque da carga ${dataISO} falhou: ${String(e?.message || e)}`);
        });
    }

    const row = await this.findRow(companyId, dataISO, entregadorId);
    return this.montarDTO(companyId, dataISO, entregadorId, row);
  }

  // ── CONFERIR RETORNO (fim do dia) ────────────────────────────────────────────
  /**
   * Congela vendido+retorno+resultado por item e fecha a carga (status
   * CONFERIDA). Exige retorno de TODO produto declarado (nenhum fica "não
   * informado" silenciosamente — 400 lista o que falta). Uma vez conferida, a
   * carga é IMUTÁVEL — não existe endpoint de reabrir (F2 não pediu).
   */
  async conferirRetorno(
    companyId: number,
    input: ConferirRetornoCargaDiaDto,
    actor?: ActorKindUserLike | null,
  ): Promise<CargaDiaDTO> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    await this.gateNivel(companyId, actor);
    const dataISO = this.normalizeDataISO(input?.dataISO);
    const entregadorId = this.normalizeEntregadorId(input?.entregadorId);

    const row = await this.findRow(companyId, dataISO, entregadorId);
    if (!row) throw new BadRequestException('Nenhuma carga declarada para este dia.');
    if (row.status === 'CONFERIDA') throw new BadRequestException('Esta carga já foi conferida.');

    const itensInput = Array.isArray(input?.itens) ? input.itens : [];
    const retornoPorProduto = new Map<number, number>();
    for (const it of itensInput) {
      const pid = Math.trunc(Number(it?.productId));
      if (!Number.isInteger(pid) || pid <= 0) continue;
      retornoPorProduto.set(pid, Math.max(0, Math.trunc(Number(it?.qtdRetorno) || 0)));
    }
    const faltando = row.itens.filter((it) => it.productId != null && !retornoPorProduto.has(it.productId));
    if (faltando.length > 0) {
      const nomes = faltando.map((it) => it.product?.name || `produto ${it.productId}`).join(', ');
      throw new BadRequestException(`Falta informar o retorno de: ${nomes}.`);
    }

    const vendidoMap = await this.vendidoPorProduto(companyId, dataISO, entregadorId);

    await this.prisma.$transaction(async (tx) => {
      for (const it of row.itens) {
        const pid = it.productId ?? 0;
        const vendida = vendidoMap.get(pid) ?? 0;
        const qtdRetorno = retornoPorProduto.get(pid) ?? 0;
        const esperado = it.qtdCarregada - vendida;
        const diff = qtdRetorno - esperado;
        const resultado: CargaDiaResultado = diff === 0 ? 'bateu' : diff > 0 ? 'sobrou' : 'faltou';
        await tx.logisticaCargaDiaItem.update({
          where: { id: it.id },
          data: { qtdVendidaSnapshot: vendida, qtdRetorno, resultado },
        });
      }
      await tx.logisticaCargaDia.update({
        where: { id: row.id },
        data: { status: 'CONFERIDA', conferidaAt: new Date() },
      });
    });

    // FISCAL F3 — o caminhão voltou: libera o remanescente reservado do dia
    // (as baixas das entregas já saíram na derivação). Best-effort com voz.
    if (this.fiscalEstoque) {
      await this.fiscalEstoque
        .liberarCargaDia(companyId, this.refCargaDia(dataISO, entregadorId))
        .catch((e: any) => {
          this.logger.warn(`[logistica] liberação de estoque da carga ${dataISO} falhou: ${String(e?.message || e)}`);
        });
    }

    const atualizado = await this.findRow(companyId, dataISO, entregadorId);
    return this.montarDTO(companyId, dataISO, entregadorId, atualizado);
  }

  // ── B4: RESERVA AMARRADA AO CICLO DA ROTA (PR04082026-BALCAO) ───────────────
  /**
   * Chamada pelo INICIAR (caminhão saiu = estoque preso) e pelo ENCERRAR
   * (paradas devolvidas = reserva devolvida) da rota — nunca pelo planejar
   * (plano é especulação; decisão do dono 04/08: reserva ao INICIAR). UMA
   * função, que RECALCULA o alvo da gaveta do dia a partir da VERDADE do banco:
   *
   *   alvo = vendido do dia (entregas 'entregue') + previsto das paradas
   *          ABERTAS com sinal de rota (mesmo `estavaNaRota` do encerrarRota)
   *
   * Por construção: replanejar/2ª leva convergem (reservarCargaDia já é
   * reconciliação por delta), encerrar libera o remanescente sozinho (o
   * previsto cai a zero) e multi-caminhão soma na MESMA gaveta do dia — a
   * DUPLA RESERVA morre porque a gaveta é uma só.
   *
   * QUEM DECLAROU MANDA: gaveta MANUAL (contagem física do operador) NUNCA é
   * sobrescrita pela rota; CONFERIDA é imutável. Gate: só com estoqueAtivo (a
   * reserva é do modo Gestão Fiscal). SEM gate de nível de propósito — a TELA
   * de carga é Advanced+, a reserva automática da rota é de todo mundo.
   */
  async reconciliarReservaRota(
    companyId: number,
    dataISOInput?: string,
  ): Promise<{ fonte: 'MANUAL' | 'ROTA' | null; produtos: number }> {
    if (!companyId) return { fonte: null, produtos: 0 };
    // Erro de banco aqui PROPAGA (não vira "estoque desligado" mudo — lição
    // CNEFE); o embrulho best-effort com voz é do chamador na rota.
    const perfil = await (this.prisma as any).fiscalTenantProfile.findUnique({
      where: { companyId },
      select: { estoqueAtivo: true },
    });
    if (!perfil?.estoqueAtivo) return { fonte: null, produtos: 0 };

    const dataISO = this.normalizeDataISO(dataISOInput);
    const gaveta = await (this.prisma as any).logisticaCargaDia.findFirst({
      where: { companyId, dataISO, entregadorId: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, origem: true },
    });
    if (gaveta?.status === 'CONFERIDA') return { fonte: null, produtos: 0 };
    if (gaveta && gaveta.origem !== 'ROTA') return { fonte: 'MANUAL', produtos: 0 };

    // Alvo da gaveta: o que já saiu (vendido) + o que ainda está no caminhão
    // (previsto das abertas em rota). A reconciliação com baixas carimbadas
    // deixa o reservado líquido = previsto aberto.
    const alvo = await this.vendidoPorProduto(companyId, dataISO, null);
    const { start, end } = this.dataRangeCivilSP(dataISO);
    const abertas = await this.prisma.entrega.findMany({
      where: {
        companyId,
        status: { in: ['agendada', 'em_rota'] },
        OR: [{ scheduledAt: { gte: start, lte: end } }, { scheduledAt: null }],
      },
      select: {
        status: true,
        rotaOrdem: true,
        etaAt: true,
        startedAt: true,
        productId: true,
        quantidade: true,
        itens: { select: { productId: true, qtdPrevista: true } },
      },
    });
    const soma = (productId: number | null | undefined, qtd: number) => {
      const pid = Math.trunc(Number(productId));
      if (!Number.isInteger(pid) || pid <= 0) return;
      alvo.set(pid, (alvo.get(pid) ?? 0) + Math.max(0, qtd));
    };
    for (const e of abertas) {
      const naRota = e.status === 'em_rota' || e.rotaOrdem != null || e.etaAt != null || e.startedAt != null;
      if (!naRota) continue;
      if (e.itens.length > 0) {
        for (const it of e.itens) soma(it.productId, it.qtdPrevista ?? 0);
      } else {
        soma(e.productId, e.quantidade ?? 0);
      }
    }
    const itens = Array.from(alvo.entries())
      .filter(([, qtd]) => qtd > 0)
      .map(([productId, qtdCarregada]) => ({ productId, qtdCarregada }));

    if (!gaveta && itens.length === 0) return { fonte: null, produtos: 0 };
    if (gaveta) {
      if (itens.length === 0) {
        // Rota sem nada previsto nem vendido no dia: a gaveta da rota some da
        // tela (o histórico de RESERVA/LIBERA fica no estoque, nada se apaga).
        await (this.prisma as any).logisticaCargaDia.delete({ where: { id: gaveta.id } });
      } else {
        await this.prisma.$transaction([
          this.prisma.logisticaCargaDiaItem.deleteMany({ where: { cargaDiaId: gaveta.id } }),
          this.prisma.logisticaCargaDiaItem.createMany({
            data: itens.map((it) => ({ ...it, cargaDiaId: gaveta.id })),
          }),
        ]);
      }
    } else {
      await (this.prisma as any).logisticaCargaDia.create({
        data: { companyId, dataISO, entregadorId: null, status: 'ABERTA', origem: 'ROTA', itens: { create: itens } },
      });
    }

    // Reconciliação fiscal por delta (idempotente); lista vazia LIBERA o que
    // sobrou na ref. Aqui NÃO é best-effort — quem embrulha com voz é a rota.
    if (this.fiscalEstoque) {
      await this.fiscalEstoque.reservarCargaDia(
        companyId,
        this.refCargaDia(dataISO, null),
        itens.map((it) => ({ logisticaProductId: it.productId, quantidade: it.qtdCarregada })),
      );
    }
    return { fonte: 'ROTA', produtos: itens.length };
  }
}

// ── tipos ─────────────────────────────────────────────────────────────────────
export type CargaDiaResultado = 'bateu' | 'sobrou' | 'faltou';
export type CargaDiaStatus = 'ABERTA' | 'CONFERIDA';

export interface CargaDiaItemDTO {
  id: string | null;
  productId: number;
  produtoNome: string | null;
  unidade: string | null;
  qtdCarregada: number;
  qtdVendida: number;
  qtdEsperadaRetorno: number;
  qtdRetorno: number | null;
  resultado: CargaDiaResultado | null;
}

export interface CargaDiaDTO {
  id: string | null;
  dataISO: string;
  entregadorId: number | null;
  status: CargaDiaStatus | null;
  declarada: boolean;
  conferidaAt: string | null;
  itens: CargaDiaItemDTO[];
}
