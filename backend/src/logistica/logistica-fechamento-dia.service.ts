import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LogisticaService } from './logistica.service';
import type { LogisticaActor } from './logistica-operacao.service';
import { isoWeekdayForDate, saoPauloDateKey } from './logistica-dia.util';
import { saoPauloMidnight } from './logistica-agenda-cursor.util';
import { LogisticaRecorrenciaService, resolveValorUnit } from './logistica-recorrencia.service';
import { LogisticaAgendaService } from './logistica-agenda.service';
import type { VenderDto } from './dto/logistica.dto';

/**
 * O FECHAMENTO DO DIA — quanto entrou hoje, por qual forma, e o registro do dia.
 *
 * 🔴 O "MODO CADERNETA" MORREU (09/08, ordem do dono: "a caderneta está
 * desativada nos ajustes, nem tem mais isso nos ajustes, não existe mais
 * caderneta. É fechamento, renomeie e remove qualquer legado desse cancer").
 * O modo era uma CHAVE (`LogisticaConfig.modoCaderneta`) que a tela de Ajustes
 * deixou de oferecer em 07/08 — e como ninguém mais podia ligá-la, os três
 * portões que a exigiam viraram paredes: o "Fechar o dia" respondia "O modo
 * caderneta está desligado nos Ajustes" pra uma chave que não existia mais em
 * lugar nenhum, e o aprendiz das rotas salvas simplesmente nunca rodava. Nenhum
 * portão aqui lê a chave: vender e fechar o dia são do produto, não de um modo.
 *
 * Venda por toque no cliente, SEM rota e SEM debitar crédito (o débito segue
 * exclusivo do Iniciar rota). A venda registrada é a MESMA máquina do confirmar
 * da rota (cobrança, comprovante, idempotência).
 *
 * SETE PÁGINAS, UMA POR DIA DA SEMANA (05/08): cada venda leva a etiqueta da
 * página (`fechamentoDiaSemana`); o dinheiro NUNCA muda de dia (deliveredAt =
 * agora, sempre). Do que ele anota o sistema tira ouro sozinho: o dia do
 * cliente se preenche pela porta canônica (2 anotações na mesma página), o
 * sumiço ganha chip, e na virada da semana as páginas viram "Rota de
 * Segunda…Domingo" nas Rotas salvas (o aprendiz). Tudo best-effort: ouro nunca
 * derruba venda.
 *
 * Reuso deliberado: `vender` = createEntrega + confirmarEntrega EXISTENTES —
 * nenhuma regra de dinheiro nova mora aqui (código financeiro tem dono).
 */

// Fontes PROVADAS no campo — MESMA lei do semáforo da conferência
// (GEOFONTES_PROVADAS em logistica-conferencia.util.ts): geocode não conta.
const FONTES_PROVADAS = new Set(['gps_entrega', 'gps_cadastro']);

export interface FechamentoMedida {
  total: number;
  provados: number;
  pronto: boolean;
}

export interface FechamentoResumo {
  dia: FechamentoMedida;
  // A BASE DA AGENDA (PR05082026-VER-TELA V4, 05/08): todos os clientes com dia
  // de entrega cadastrado, não só os de hoje. É ELA que decide quando o convite
  // do GPS aparece — emenda 3 do dono: cliente avulso, sem dia, nunca trava o
  // GPS de ninguém. Campo ADITIVO: APK velho simplesmente ignora.
  base: FechamentoMedida;
  // null quando o módulo financeiro do tenant está OFF — sem financeiro não
  // existe "quanto entrou por forma"; número inventado em tela de dinheiro é
  // mentira (o APK esconde o card quando vem null).
  fechamento: {
    totalCents: number;
    vendas: number;
    formas: { dinheiroCents: number; pixCents: number; cartaoCents: number; fiadoCents: number };
  } | null;
  // QUEM DEVE (05/08, ordem do dono: `{Devedor?} S/N? Caso sim: "Deve: {valor}"`)
  // — só quem tem saldo em aberto entra, em centavos, indexado pelo id do
  // cliente. Vem no resumo (e não no roster) porque a lista do dia mistura duas
  // fontes (agenda do dia + entregas de hoje) e o "Deve" tem de valer pras
  // duas. Vazio com financeiro OFF: sem cobrança não existe devedor.
  devedores: Record<string, number>;
  // A página pedida (`?dia=`; ausente = dia real do date) — 7 páginas, uma por
  // dia da semana. ADITIVO: APK velho nunca manda `dia` e ignora os campos novos.
  pagina: FechamentoPagina;
  // Os dias da janela que TÊM venda (a seção Histórico no pé da tela).
  historicoDias: FechamentoHistoricoDia[];
  // O aviso do GPS: elegível quando a semana FECHADA tem vendas e as rotas
  // salvas existem. O teto de 1×/dia é do APK (marca d'água ao APARECER).
  conviteGps: { elegivel: boolean; nome: string | null };
}

export interface FechamentoPaginaVenda {
  entregaId: string;
  clienteId: string;
  localId: string | null;
  nome: string;
  itens: Array<{ productId: number | null; nome: string; qtd: number; valorUnit: number | null }>;
  metodo: string | null;
  total: number | null;
  // Ouro nº1b — o cliente vendido 2+ vezes nesta página mas cadastrado em OUTRO
  // dia: vira chip "+ dia" (sugestão; nunca sobrescreve calado). `diasAtuais`
  // viaja junto pro APK montar o PATCH aditivo (dias atuais + este).
  sugerirDia?: boolean;
  diasAtuais?: number[];
}

export interface FechamentoPagina {
  diaSemana: number;
  // A DATA da página dentro da janela ("qua · 05/08/2026" no cabeçalho da tela).
  dateKey: string;
  // As vendas DA PÁGINA na janela de 7 dias civis SP terminando no `date` —
  // cada dia da semana aparece exatamente 1× na janela. Ordem = ordem de
  // registro (a sequência dele).
  vendas: FechamentoPaginaVenda[];
  // Fechamento DA PÁGINA (mesma forma do fechamento do dia; null sem financeiro).
  fechamento: FechamentoResumo['fechamento'];
  // Ouro nº2 — clientes do dia que compravam nesta página e faltaram as últimas
  // 2 semanas (precisa de histórico: sem compra ANTIGA não há sumiço).
  sumidos: string[];
}

// O HISTÓRICO do fechamento (ordem do dono 05/08): "SEG a DOM bem bonito, só o
// que realmente tiver dados" — 1 linha por dia da janela COM venda, com a data.
export interface FechamentoHistoricoDia {
  diaSemana: number;
  dateKey: string;
  vendas: number;
  totalCents: number | null;
}

export interface FechamentoVendaResult {
  ok: true;
  entregaId: string;
  totalCents: number;
  replayed?: boolean;
}

export interface FechamentoApagarVendaResult {
  ok: true;
  entregaId: string;
  /** true quando a venda já estava apagada (2º toque, replay da fila offline). */
  jaApagada?: boolean;
}

function cents(valor: number | null | undefined): number {
  const n = Number(valor);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function dateKeyValida(v: unknown): string {
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : saoPauloDateKey(new Date());
}

function diaSemanaValido(v: unknown): number | null {
  const n = Math.trunc(Number(v));
  return Number.isInteger(n) && n >= 1 && n <= 7 ? n : null;
}

/** Soma dias a um dateKey (meio-dia UTC — o mesmo truque do isoWeekdayForDate). */
function somarDiasKey(dateKey: string, dias: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + dias);
  return dt.toISOString().slice(0, 10);
}

/**
 * A página de uma venda: a etiqueta quando existe; sem etiqueta (legado/rota),
 * o dia REAL do deliveredAt em SP. Sem data nenhuma → null (fica fora de tudo).
 */
function paginaDaVenda(e: { fechamentoDiaSemana?: number | null; deliveredAt?: Date | null }): number | null {
  const etiqueta = diaSemanaValido(e.fechamentoDiaSemana);
  if (etiqueta) return etiqueta;
  const key = saoPauloDateKey(e.deliveredAt ?? null);
  return key ? isoWeekdayForDate(key) : null;
}

// O nome que o aprendiz grava nas Rotas salvas — 1 por dia da semana, atualizado
// na virada da semana. Renomeou? A renomeada vira DELE (a próxima semana cria a
// "Rota de X" de novo do zero).
const NOME_ROTA_DIA: Record<number, string> = {
  1: 'Rota de Segunda',
  2: 'Rota de Terça',
  3: 'Rota de Quarta',
  4: 'Rota de Quinta',
  5: 'Rota de Sexta',
  6: 'Rota de Sábado',
  7: 'Rota de Domingo',
};

// 🔴 O NOME VELHO, SÓ PARA ACHAR E RENOMEAR (09/08). Estas linhas existem no
// banco de quem já usou o app ("Caderneta de Quarta" está na lista de Rotas
// salvas dele agora). Procurar só pelo nome novo criaria uma SEGUNDA linha do
// mesmo dia e o dono veria a rota dele duplicada — por isso o upsert procura
// pelos dois e, achando a velha, RENOMEIA em vez de criar. Some sozinho
// conforme as semanas passam; é a única lembrança da palavra no código.
const NOME_ANTIGO_DIA: Record<number, string> = {
  1: 'Caderneta de Segunda',
  2: 'Caderneta de Terça',
  3: 'Caderneta de Quarta',
  4: 'Caderneta de Quinta',
  5: 'Caderneta de Sexta',
  6: 'Caderneta de Sábado',
  7: 'Caderneta de Domingo',
};

@Injectable()
export class LogisticaFechamentoDiaService {
  private readonly logger = new Logger(LogisticaFechamentoDiaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly logistica: LogisticaService,
    // Opcionais com default null: preservam os testes de mesa (mesmo padrão do
    // controller com o operacao). No Nest o DI injeta sempre; sem eles o ouro
    // nº1 (dia aprendido) fica quieto — nunca quebra a venda.
    private readonly recorrencia: LogisticaRecorrenciaService = null as any,
    private readonly agenda: LogisticaAgendaService = null as any,
  ) {}

  private async configRow(companyId: number) {
    return this.prisma.logisticaConfig.findUnique({ where: { companyId } });
  }

  /** Medidor do dia + fechamento por forma — o contrato da tela de fechamento do APK. */
  async resumo(
    companyId: number,
    dateInput?: unknown,
    opts?: { dia?: unknown; userId?: number | null },
  ): Promise<FechamentoResumo> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const dateKey = dateKeyValida(dateInput);
    const cfg = await this.configRow(companyId);

    // ── Medidores: clientes × quantos têm localização PROVADA no campo. Dois
    // recortes da MESMA conta (dia é do CLIENTE — LogisticaPlanoEntrega é a
    // verdade): o DIA (só quem entrega hoje) e a BASE (todo mundo com dia
    // cadastrado). Read-only: nunca materializa entrega nem avança proximaData
    // (mesma lei do dia-preview).
    const diaSemana = isoWeekdayForDate(dateKey);
    const [dia, base] = await Promise.all([
      this.medir(companyId, diaSemana),
      this.medir(companyId, null),
    ]);

    // ── Fechamento do dia: a conta que o dono faz de cabeça hoje (quanto entrou
    // em dinheiro/pix/cartão + quanto ficou fiado). Fonte = Entrega entregue no
    // dia civil SP; método imediato soma na forma, o resto é fiado do dia.
    // Financeiro OFF → null (sem cobrança não há forma; o card nem aparece).
    // "Deve: R$ X" da linha do dia. REUSA `saldosFinanceiro` — a mesma visão
    // "quem me deve" da web, que por sua vez lê a fonte única
    // `saldoAbertoPorClientes`. Escrever uma 2ª conta de dívida aqui seria a
    // receita pronta pro APK e o extrato discordarem. Best-effort: dívida é
    // enfeite da linha; falha dela nunca pode derrubar a tela do dia.
    let devedores: Record<string, number> = {};
    if (cfg?.moduloFinanceiroAtivo) {
      try {
        const saldos = await this.logistica.saldosFinanceiro(companyId);
        for (const row of saldos.clientes || []) {
          const c = cents(row.saldoAberto);
          if (c > 0) devedores[row.customerProfileId] = c;
        }
      } catch (e: any) {
        this.logger.warn(`[fechamento] devedores company=${companyId} falhou: ${String(e?.message || e)}`);
        devedores = {};
      }
    }

    let fechamento: FechamentoResumo['fechamento'] = null;
    if (cfg?.moduloFinanceiroAtivo) {
      const inicio = saoPauloMidnight(dateKey);
      const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
      const entregues = await this.prisma.entrega.findMany({
        where: { companyId, status: 'entregue', deliveredAt: { gte: inicio, lt: fim } },
        select: { valor: true, receiptMethod: true },
      });
      const formas = { dinheiroCents: 0, pixCents: 0, cartaoCents: 0, fiadoCents: 0 };
      let totalCents = 0;
      for (const e of entregues) {
        const c = cents(e.valor);
        totalCents += c;
        if (e.receiptMethod === 'dinheiro') formas.dinheiroCents += c;
        else if (e.receiptMethod === 'pix') formas.pixCents += c;
        else if (e.receiptMethod === 'cartao') formas.cartaoCents += c;
        else formas.fiadoCents += c;
      }
      fechamento = { totalCents, vendas: entregues.length, formas };
    }

    // ── A página pedida (default = dia real do date).
    const paginaDia = diaSemanaValido(opts?.dia) ?? diaSemana;
    const { pagina, historicoDias } = await this.montarPagina(
      companyId,
      dateKey,
      paginaDia,
      !!cfg?.moduloFinanceiroAtivo,
    );

    // ── O aprendiz + o aviso do GPS. Fail-closed num bloco só: se a geração das
    // rotas salvas falhar, o convite NÃO sai (abriria uma lista vazia) e o
    // próximo resumo tenta de novo. Nunca derruba a tela do dia.
    //
    // 🔴 RODAVA ATRÁS DA CHAVE MORTA (até 09/08): estava dentro de um
    // `if (cfg?.modoCaderneta)`, e como a chave saiu dos Ajustes em 07/08 o
    // aprendiz PAROU de rodar em todo mundo — as rotas salvas da semana e o
    // convite do GPS estavam desligados sem nenhum aviso. Quem tem venda tem
    // aprendiz: é do produto, não de um modo.
    let conviteGps: FechamentoResumo['conviteGps'] = { elegivel: false, nome: null };
    try {
      conviteGps = await this.aprenderEConvidar(companyId, dateKey, opts?.userId ?? null);
    } catch (e: any) {
      this.logger.warn(`[fechamento] aprendiz company=${companyId} falhou: ${String(e?.message || e)}`);
    }

    return { dia, base, fechamento, devedores, pagina, historicoDias, conviteGps };
  }

  /**
   * A PÁGINA do fechamento: vendas da janela de 7 dias civis SP (cada dia da
   * semana cabe 1× na janela) + fechamento por forma DA página + sumidos.
   * Venda sem etiqueta (legado) cai no dia real do deliveredAt.
   */
  private async montarPagina(
    companyId: number,
    dateKey: string,
    paginaDia: number,
    financeiro: boolean,
  ): Promise<{ pagina: FechamentoPagina; historicoDias: FechamentoHistoricoDia[] }> {
    const fim = saoPauloMidnight(somarDiasKey(dateKey, 1));
    const inicioJanela = saoPauloMidnight(somarDiasKey(dateKey, -6));
    // 3 janelas (21 dias) na MESMA busca: a corrente alimenta a lista; as duas
    // anteriores alimentam o "Sumiu" e a contagem da sugestão de dia.
    const inicioHistorico = saoPauloMidnight(somarDiasKey(dateKey, -20));

    const [entregues, historico, planosDoDia] = await Promise.all([
      this.prisma.entrega.findMany({
        where: { companyId, status: 'entregue', deliveredAt: { gte: inicioJanela, lt: fim } },
        select: {
          id: true,
          customerProfileId: true,
          localId: true,
          valor: true,
          receiptMethod: true,
          deliveredAt: true,
          fechamentoDiaSemana: true,
          // O principal ESCALAR (multi-produto: 1º produto na Entrega, extras
          // em EntregaItem — o merge abaixo devolve o principal à lista).
          productId: true,
          quantidade: true,
          product: { select: { name: true } },
          customerProfile: { select: { name: true } },
          itens: {
            select: {
              productId: true,
              qtdPrevista: true,
              qtdEntregue: true,
              valorUnit: true,
              product: { select: { name: true } },
            },
          },
        },
        orderBy: [{ deliveredAt: 'asc' }],
      }),
      this.prisma.entrega.findMany({
        where: { companyId, status: 'entregue', deliveredAt: { gte: inicioHistorico, lt: fim } },
        select: { customerProfileId: true, deliveredAt: true, fechamentoDiaSemana: true },
      }),
      this.prisma.logisticaPlanoEntrega.findMany({
        where: {
          companyId,
          ativo: true,
          diaSemana: paginaDia,
          customerProfile: { status: 'active', isCliente: true },
        },
        select: { customerProfileId: true },
      }),
    ]);

    const daPagina = entregues.filter((e) => paginaDaVenda(e) === paginaDia);
    const vendas: FechamentoPaginaVenda[] = daPagina.map((e) => {
      const itens = (e.itens || []).map((i) => ({
        productId: i.productId ?? null,
        nome: i.product?.name || '',
        qtd: Math.max(1, Number(i.qtdEntregue ?? i.qtdPrevista) || 1),
        // Sem financeiro, número de dinheiro não viaja (mesma régua do fechamento).
        valorUnit: financeiro && Number.isFinite(Number(i.valorUnit)) ? Number(i.valorUnit) : null,
      }));
      // Merge do principal escalar (mesma regra do registrarHistorico): o 1º
      // produto da venda multi-produto não vira EntregaItem — entra na frente,
      // com unitário derivado do total MENOS os extras (nunca do catálogo).
      if (e.product && !itens.some((i) => i.productId === e.productId)) {
        const qtd = Math.max(1, Number(e.quantidade) || 1);
        const valorExtras = (e.itens || []).reduce(
          (s, i) => s + Math.max(0, Number(i.valorUnit) || 0) * Math.max(0, Number(i.qtdEntregue ?? i.qtdPrevista) || 0),
          0,
        );
        const totalPrincipal = Number(e.valor) - valorExtras;
        itens.unshift({
          productId: e.productId ?? null,
          nome: e.product.name || '',
          qtd,
          valorUnit:
            financeiro && Number.isFinite(totalPrincipal) && totalPrincipal > 0
              ? Math.round((totalPrincipal / qtd) * 100) / 100
              : null,
        });
      }
      return {
        entregaId: e.id,
        clienteId: e.customerProfileId,
        localId: e.localId ?? null,
        nome: e.customerProfile?.name || 'Cliente',
        itens,
        metodo: financeiro ? (e.receiptMethod ?? null) : null,
        total: financeiro && Number.isFinite(Number(e.valor)) ? Number(e.valor) : null,
      };
    });

    let fechamento: FechamentoResumo['fechamento'] = null;
    if (financeiro) {
      const formas = { dinheiroCents: 0, pixCents: 0, cartaoCents: 0, fiadoCents: 0 };
      let totalCents = 0;
      for (const e of daPagina) {
        const c = cents(e.valor);
        totalCents += c;
        if (e.receiptMethod === 'dinheiro') formas.dinheiroCents += c;
        else if (e.receiptMethod === 'pix') formas.pixCents += c;
        else if (e.receiptMethod === 'cartao') formas.cartaoCents += c;
        else formas.fiadoCents += c;
      }
      fechamento = { totalCents, vendas: daPagina.length, formas };
    }

    // Histórico DA página, por cliente: última compra + datas distintas.
    const doDia = historico.filter((e) => paginaDaVenda(e) === paginaDia);
    const porCliente = new Map<string, { ultima: Date; datas: Set<string> }>();
    for (const e of doDia) {
      if (!e.deliveredAt) continue;
      const atual = porCliente.get(e.customerProfileId) ?? { ultima: e.deliveredAt, datas: new Set<string>() };
      if (e.deliveredAt > atual.ultima) atual.ultima = e.deliveredAt;
      const key = saoPauloDateKey(e.deliveredAt);
      if (key) atual.datas.add(key);
      porCliente.set(e.customerProfileId, atual);
    }

    // Ouro nº2 — sumiu: é do dia, comprava ANTES das 2 últimas semanas e não
    // comprou nelas. Sem histórico antigo não há sumiço (senão a 1ª semana de
    // uso pintaria a base inteira — regra que pinta tudo é bug de produto).
    const corte = saoPauloMidnight(somarDiasKey(dateKey, -13));
    const rosterIds = new Set(planosDoDia.map((p) => p.customerProfileId));
    const sumidos: string[] = [];
    for (const clienteId of rosterIds) {
      const h = porCliente.get(clienteId);
      if (h && h.ultima < corte) sumidos.push(clienteId);
    }

    // Ouro nº1b — sugestão de dia: vendido 2+ datas nesta página, fora do dia e
    // COM outro dia cadastrado (sem dia nenhum é caso do preenchimento automático
    // do vender). O APK manda o PATCH aditivo com diasAtuais + este.
    const candidatos = [...new Set(daPagina.map((e) => e.customerProfileId))].filter(
      (id) => !rosterIds.has(id) && (porCliente.get(id)?.datas.size ?? 0) >= 2,
    );
    if (candidatos.length) {
      const planosDeles = await this.prisma.logisticaPlanoEntrega.findMany({
        where: { companyId, ativo: true, customerProfileId: { in: candidatos } },
        select: { customerProfileId: true, diaSemana: true },
      });
      const diasPor = new Map<string, number[]>();
      for (const p of planosDeles) {
        const dias = diasPor.get(p.customerProfileId) ?? [];
        if (diaSemanaValido(p.diaSemana) && !dias.includes(p.diaSemana)) dias.push(p.diaSemana);
        diasPor.set(p.customerProfileId, dias);
      }
      for (const venda of vendas) {
        const dias = diasPor.get(venda.clienteId);
        if (dias && dias.length) {
          venda.sugerirDia = true;
          venda.diasAtuais = [...dias].sort((a, b) => a - b);
        }
      }
    }

    // A data de cada dia da janela (cada dia da semana cabe 1×) + o histórico:
    // só dia COM venda entra ("o q realmente tiver dados"), ordenado SEG→DOM.
    const diaHoje = isoWeekdayForDate(dateKey);
    const dataDoDia = (d: number) => somarDiasKey(dateKey, -(((diaHoje - d) % 7 + 7) % 7));
    const historicoDias: FechamentoHistoricoDia[] = [];
    for (let d = 1; d <= 7; d += 1) {
      const doDiaD = entregues.filter((e) => paginaDaVenda(e) === d);
      if (!doDiaD.length) continue;
      historicoDias.push({
        diaSemana: d,
        dateKey: dataDoDia(d),
        vendas: doDiaD.length,
        totalCents: financeiro ? doDiaD.reduce((s, e) => s + cents(e.valor), 0) : null,
      });
    }

    return {
      pagina: { diaSemana: paginaDia, dateKey: dataDoDia(paginaDia), vendas, fechamento, sumidos },
      historicoDias,
    };
  }

  /**
   * O APRENDIZ + o aviso: na virada da semana, as vendas da semana FECHADA
   * (segunda→domingo) viram/atualizam as "Rota de <dia>" nas Rotas salvas.
   * Elegível pro convite = semana fechada COM vendas e rotas geradas.
   */
  private async aprenderEConvidar(
    companyId: number,
    dateKey: string,
    userId: number | null,
  ): Promise<{ elegivel: boolean; nome: string | null }> {
    const diaHoje = isoWeekdayForDate(dateKey);
    const inicioSemanaAtual = saoPauloMidnight(somarDiasKey(dateKey, -(diaHoje - 1)));
    const inicioSemanaPassada = saoPauloMidnight(somarDiasKey(dateKey, -(diaHoje - 1) - 7));

    const vendasSemana = await this.prisma.entrega.findMany({
      where: {
        companyId,
        status: 'entregue',
        deliveredAt: { gte: inicioSemanaPassada, lt: inicioSemanaAtual },
      },
      select: { customerProfileId: true, localId: true, deliveredAt: true, fechamentoDiaSemana: true },
      orderBy: [{ deliveredAt: 'asc' }],
    });
    if (!vendasSemana.length) return { elegivel: false, nome: null };

    await this.gerarRotasSalvas(companyId, inicioSemanaAtual, vendasSemana);

    let nome: string | null = null;
    if (userId) {
      const user = await this.prisma.user.findFirst({ where: { id: userId }, select: { name: true } });
      nome = String(user?.name || '').trim() || null;
    }
    return { elegivel: true, nome };
  }

  /**
   * Gera/atualiza 1 rota salva por dia da semana com vendas ("Rota de X",
   * tipo LIVRE — é o tipo que a lista de Rotas salvas do APK mostra). Ordem =
   * ordem de registro; dedupe por cliente+local; só cliente vivo. Idempotente
   * por semana: a rota mais nova com updatedAt já DESTA semana = feito.
   */
  private async gerarRotasSalvas(
    companyId: number,
    inicioSemanaAtual: Date,
    vendasSemana: Array<{
      customerProfileId: string;
      localId: string | null;
      deliveredAt: Date | null;
      fechamentoDiaSemana: number | null;
    }>,
  ): Promise<void> {
    // Os dois nomes: sem o antigo aqui, quem já tem "Caderneta de X" da semana
    // passada refaria a semana inteira no primeiro resumo depois do deploy.
    const nomes = [...Object.values(NOME_ROTA_DIA), ...Object.values(NOME_ANTIGO_DIA)];
    const maisNova = await this.prisma.logisticaRotaModelo.findFirst({
      where: { companyId, tipo: 'LIVRE', nome: { in: nomes, mode: 'insensitive' } },
      orderBy: [{ updatedAt: 'desc' }],
      select: { updatedAt: true },
    });
    if (maisNova && maisNova.updatedAt >= inicioSemanaAtual) return;

    const ids = [...new Set(vendasSemana.map((v) => v.customerProfileId))];
    const vivos = new Set(
      (
        await this.prisma.customerProfile.findMany({
          where: { companyId, id: { in: ids }, status: 'active', isCliente: true },
          select: { id: true },
        })
      ).map((c) => c.id),
    );

    const porDia = new Map<number, Array<{ customerProfileId: string; localId: string | null }>>();
    for (const v of vendasSemana) {
      if (!vivos.has(v.customerProfileId)) continue;
      const dia = paginaDaVenda(v);
      if (!dia) continue;
      const lista = porDia.get(dia) ?? [];
      const chave = `${v.customerProfileId}:${v.localId ?? ''}`;
      if (!lista.some((p) => `${p.customerProfileId}:${p.localId ?? ''}` === chave)) {
        lista.push({ customerProfileId: v.customerProfileId, localId: v.localId ?? null });
      }
      porDia.set(dia, lista);
    }

    for (const [dia, paradas] of porDia) {
      await this.salvarRotaDoDia(companyId, dia, paradas);
    }
  }

  /**
   * Upsert de UMA "Rota de <dia>" nas Rotas salvas (tipo LIVRE — o tipo que
   * a lista do APK mostra). Sem mudança o update roda mesmo assim: o @updatedAt
   * é o carimbo "semana feita" do aprendiz — sem ele a semana recontaria a cada
   * resumo. Mudou → versao sobe (o guia tem versão, como toda rota salva).
   *
   * Acha pelo nome novo OU pelo antigo, e a linha antiga é RENOMEADA no mesmo
   * update — a rota dele continua a mesma (id, versão, histórico), só troca a
   * palavra na lista.
   */
  private async salvarRotaDoDia(
    companyId: number,
    dia: number,
    paradas: Array<{ customerProfileId: string; localId: string | null }>,
  ): Promise<void> {
    const nome = NOME_ROTA_DIA[dia];
    const existente = await this.prisma.logisticaRotaModelo.findFirst({
      where: {
        companyId,
        tipo: 'LIVRE',
        OR: [
          { nome: { equals: nome, mode: 'insensitive' } },
          { nome: { equals: NOME_ANTIGO_DIA[dia], mode: 'insensitive' } },
        ],
      },
      select: { id: true, nome: true, paradasJson: true },
    });
    if (!existente) {
      await this.prisma.logisticaRotaModelo.create({
        data: { companyId, nome, diaSemana: dia, paradasJson: paradas as any },
      });
      this.logger.log(`[fechamento] salvou "${nome}" company=${companyId} paradas=${paradas.length}`);
      return;
    }
    const igual = JSON.stringify(existente.paradasJson ?? []) === JSON.stringify(paradas);
    await this.prisma.logisticaRotaModelo.update({
      where: { id: existente.id },
      data: igual
        ? { nome, diaSemana: dia }
        : { nome, diaSemana: dia, paradasJson: paradas as any, versao: { increment: 1 } },
    });
    if (!igual) {
      this.logger.log(`[fechamento] atualizou "${nome}" company=${companyId} paradas=${paradas.length}`);
    }
  }

  /**
   * 🔴 FECHAR O DIA (ordem do dono 05/08): "qual dia podemos registrar?" —
   * fecha o dia, registra o dia da semana escolhido e salva a "Rota de <dia>"
   * nas Rotas salvas NA HORA (sem esperar a virada da semana do aprendiz).
   *
   * Dia escolhido ≠ hoje = passar a limpo o caderno de papel: a SESSÃO de
   * hoje (vendas de hoje na página de hoje, etiqueta explícita ou vazia) é
   * re-etiquetada pro dia escolhido. Venda feita hoje DENTRO de um dia do
   * histórico (etiqueta ≠ hoje) não se move — foi edição de outro dia.
   * O dinheiro NUNCA muda de dia (deliveredAt intocado — contrato da frente).
   *
   * 🔴 SEM PORTÃO DE MODO (09/08). Aqui morava `if (!cfg.modoCaderneta) throw`
   * — o defeito que o dono flagrou: o botão respondia "O modo caderneta está
   * desligado nos Ajustes" apontando pra uma chave que os Ajustes não mostram
   * desde 07/08. Portão que só se abre por uma porta que não existe mais é
   * parede.
   */
  async finalizar(companyId: number, diaInput: unknown): Promise<{ ok: true; dia: number; clientes: number }> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const diaAlvo = diaSemanaValido(diaInput);
    if (!diaAlvo) throw new BadRequestException('Escolha o dia da semana.');

    const hojeKey = dateKeyValida(null);
    const diaHoje = isoWeekdayForDate(hojeKey);
    const inicioHoje = saoPauloMidnight(hojeKey);
    const fimHoje = saoPauloMidnight(somarDiasKey(hojeKey, 1));

    if (diaAlvo !== diaHoje) {
      await this.prisma.entrega.updateMany({
        where: {
          companyId,
          status: 'entregue',
          deliveredAt: { gte: inicioHoje, lt: fimHoje },
          OR: [{ fechamentoDiaSemana: diaHoje }, { fechamentoDiaSemana: null }],
        },
        data: { fechamentoDiaSemana: diaAlvo },
      });
    }

    // A página do dia alvo (janela de 7 dias) vira a Rota salva.
    const inicioJanela = saoPauloMidnight(somarDiasKey(hojeKey, -6));
    const vendas = await this.prisma.entrega.findMany({
      where: { companyId, status: 'entregue', deliveredAt: { gte: inicioJanela, lt: fimHoje } },
      select: { customerProfileId: true, localId: true, deliveredAt: true, fechamentoDiaSemana: true },
      orderBy: [{ deliveredAt: 'asc' }],
    });
    const daPagina = vendas.filter((v) => paginaDaVenda(v) === diaAlvo);
    if (!daPagina.length) {
      throw new BadRequestException('Nada registrado neste dia ainda.');
    }

    const ids = [...new Set(daPagina.map((v) => v.customerProfileId))];
    const vivos = new Set(
      (
        await this.prisma.customerProfile.findMany({
          where: { companyId, id: { in: ids }, status: 'active', isCliente: true },
          select: { id: true },
        })
      ).map((c) => c.id),
    );
    const paradas: Array<{ customerProfileId: string; localId: string | null }> = [];
    for (const v of daPagina) {
      if (!vivos.has(v.customerProfileId)) continue;
      const chave = `${v.customerProfileId}:${v.localId ?? ''}`;
      if (!paradas.some((p) => `${p.customerProfileId}:${p.localId ?? ''}` === chave)) {
        paradas.push({ customerProfileId: v.customerProfileId, localId: v.localId ?? null });
      }
    }
    if (!paradas.length) throw new BadRequestException('Nada registrado neste dia ainda.');

    await this.salvarRotaDoDia(companyId, diaAlvo, paradas);
    return { ok: true, dia: diaAlvo, clientes: paradas.length };
  }

  /**
   * Quantos clientes com plano de entrega ativo, e quantos deles já têm o
   * endereço PROVADO em campo. `diaSemana = null` mede a BASE inteira (o
   * recorte do convite do GPS); com um dia, mede só quem entrega naquele dia.
   *
   * "Pronto" exige total > 0: base vazia não é base provada — oferecer o GPS
   * pra quem não tem cliente nenhum seria convite pra tela vazia.
   */
  private async medir(companyId: number, diaSemana: number | null): Promise<FechamentoMedida> {
    const planos = await this.prisma.logisticaPlanoEntrega.findMany({
      // Cliente morto não conta (mesma régua CLIENTE_VIVO da agenda).
      where: {
        companyId,
        ativo: true,
        ...(diaSemana === null ? {} : { diaSemana }),
        customerProfile: { status: 'active', isCliente: true },
      },
      select: { customerProfileId: true },
    });
    const clienteIds = [...new Set(planos.map((p) => p.customerProfileId))];
    if (!clienteIds.length) return { total: 0, provados: 0, pronto: false };

    const contas = await this.prisma.customerProfile.findMany({
      where: { companyId, id: { in: clienteIds } },
      select: {
        geoFonte: true,
        // O pino que a rota USA é o do local principal (multilocal); perfil é fallback.
        locais: {
          where: { ativo: true, isPrincipal: true },
          select: { geoFonte: true },
          take: 1,
        },
      },
    });
    let provados = 0;
    for (const conta of contas) {
      const fonte = conta.locais[0]?.geoFonte ?? conta.geoFonte;
      if (fonte && FONTES_PROVADAS.has(fonte)) provados += 1;
    }
    const total = clienteIds.length;
    return { total, provados, pronto: total > 0 && provados >= total };
  }

  /**
   * Vendeu: cria a Entrega de HOJE já entregue reusando createEntrega +
   * confirmarEntrega (cobrança/GPS/idempotência da casa). NUNCA debita crédito.
   *
   * 🔴 SEM PORTÃO DE MODO (09/08) — mesma cirurgia do `finalizar`: a venda por
   * toque no cliente exigia a chave morta, ou seja, estava barrada pra todo
   * mundo desde que os Ajustes pararam de oferecê-la.
   */
  async vender(
    companyId: number,
    dto: VenderDto,
    actor?: LogisticaActor | null,
  ): Promise<FechamentoVendaResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const cfg = await this.configRow(companyId);
    const itens = Array.isArray(dto.itens) ? dto.itens : [];
    if (itens.length === 0) throw new BadRequestException('Escolha ao menos um produto.');
    const desfecho = String(dto.desfecho || '').trim();
    const metodo = String(dto.metodo || '').trim() || null;
    // Método só é exigível quando existe FINANCEIRO pra registrá-lo. Com o módulo
    // OFF a folha tem um botão só ("Entregue") e não manda método — exigir aqui
    // travaria TODA venda do tenant sem financeiro.
    if (desfecho === 'pagou' && !metodo && cfg.moduloFinanceiroAtivo) {
      throw new BadRequestException('Escolha como recebeu: dinheiro, Pix ou cartão.');
    }
    const key = String(dto.idempotencyKey || '').trim().slice(0, 80);
    if (!key) throw new BadRequestException('Chave de idempotência é obrigatória.');

    // Idempotência do CLIQUE (antes de criar qualquer coisa): a mesma key já
    // virou venda → devolve o desfecho anterior, nada re-executa. (A janela
    // criar→confirmar não pré-grava a key de propósito: o replay do confirmar
    // PRESSUPÕE que key gravada = entrega confirmada — ver M8.)
    const anterior = await this.prisma.entrega.findFirst({
      where: { companyId, idempotencyKey: key },
      select: { id: true, valor: true },
    });
    if (anterior) {
      return { ok: true, entregaId: anterior.id, totalCents: cents(anterior.valor), replayed: true };
    }

    // 🔴 PREÇO POR CLIENTE (05/08) — a régua de sempre, resolvida AQUI e não no
    // createEntrega (que só conhece o catálogo). Sem isto a venda cobrava
    // R$13 de quem tem R$11 combinado (Larissa, cia 41): o precoAcordado estava
    // no banco desde 24/07 e nenhum caminho da venda o lia. Fica DEPOIS do
    // portão de idempotência de propósito — replay não consulta preço nenhum.
    const precos = await this.resolverPrecos(companyId, dto.clienteId, itens);

    const [primeiro, ...resto] = itens;
    const precoPrimeiro = precos.get(primeiro.productId);
    const criada = await this.logistica.createEntrega(
      companyId,
      {
        customerProfileId: dto.clienteId,
        productId: primeiro.productId,
        quantidade: primeiro.quantidade,
        localId: dto.localId,
        // `valor` do createEntrega é o TOTAL da entrega (ele só multiplica pela
        // quantidade quando o valor NÃO vem explícito) — por isso a conta sai
        // daqui já feita. Sem este campo o preço voltaria a ser o de catálogo.
        valor: round2(precoPrimeiro!.valorUnit * primeiro.quantidade),
      },
      actor ?? null,
    );

    // Confirma na mesma máquina da rota. 'deveu' manda 'fiado' EXPLÍCITO — sem
    // isso o M6 derivaria o metodoPadrao do cliente na_hora e QUITARIA uma venda
    // que ficou pendurada. Ator não filtra aqui: a entrega nasceu NESTA chamada,
    // sem entregador — o escopo por-tenant (companyId) segue duro.
    await this.logistica.confirmarEntrega(
      companyId,
      criada.id,
      {
        lat: dto.gps?.lat,
        lng: dto.gps?.lng,
        accuracy: dto.gps?.accuracy,
        receiptMethod: desfecho === 'pagou' ? (metodo ?? undefined) : 'fiado',
        novosItens: resto.map((i) => ({
          productId: i.productId,
          qtdEntregue: i.quantidade,
          valorUnit: precos.get(i.productId)!.valorUnit,
        })),
        idempotencyKey: key,
      },
      null,
    );

    // ── A ETIQUETA DA PÁGINA (explícita do APK novo; APK velho
    // não manda e cai no dia real em SP). Best-effort: sem etiqueta a página se
    // resolve pelo deliveredAt — a venda nunca trava por causa de organização.
    const paginaDia = diaSemanaValido(dto.diaSemana) ?? isoWeekdayForDate(dateKeyValida(null));
    try {
      await this.prisma.entrega.update({
        where: { id: criada.id },
        data: { fechamentoDiaSemana: paginaDia },
      });
    } catch (e: any) {
      this.logger.warn(`[fechamento] etiqueta dia venda=${criada.id} falhou: ${String(e?.message || e)}`);
    }

    // ── Ouro nº1: cliente SEM dia nenhum vendido em 2 datas distintas na MESMA
    // página → o dia dele vira esta página, pela porta canônica (a MESMA dança
    // do PATCH /clientes/:id/dias: definirDias + espelho da agenda). Cliente com
    // dia diferente NUNCA é reescrito calado (vira sugestão na página).
    try {
      await this.aprenderDiaDoCliente(companyId, dto.clienteId, paginaDia, primeiro.productId);
    } catch (e: any) {
      this.logger.warn(`[fechamento] dia aprendido cliente=${dto.clienteId} falhou: ${String(e?.message || e)}`);
    }

    // 🔴 O PREÇO EDITADO FICA (ordem do dono: "ficar o preço fixo até a
    // próxima"). Só o que ele TOCOU vira combinado — venda com preço herdado
    // não reescreve cadastro. Best-effort: gravar o combinado nunca derruba uma
    // venda que JÁ aconteceu (o dinheiro da entrega já está lançado acima).
    for (const item of itens) {
      const preco = precos.get(item.productId);
      if (!preco?.editado) continue;
      try {
        await this.gravarPrecoCombinado(companyId, dto.clienteId, item.productId, preco.valorUnit);
      } catch (e: any) {
        this.logger.warn(
          `[fechamento] preço combinado cliente=${dto.clienteId} produto=${item.productId} falhou: ${String(e?.message || e)}`,
        );
      }
    }

    // Número da casa (opcional, best-effort): completa o cadastro SEM nunca
    // travar a venda — e só preenche o que está VAZIO (nunca reescreve decisão).
    const numero = String(dto.numero || '').trim().slice(0, 20);
    if (numero) {
      try {
        await this.prisma.customerProfile.updateMany({
          where: { companyId, id: dto.clienteId, OR: [{ numero: null }, { numero: '' }] },
          data: { numero },
        });
        await this.prisma.localEntrega.updateMany({
          where: dto.localId
            ? { companyId, id: dto.localId, customerProfileId: dto.clienteId, OR: [{ numero: null }, { numero: '' }] }
            : { companyId, customerProfileId: dto.clienteId, isPrincipal: true, ativo: true, OR: [{ numero: null }, { numero: '' }] },
          data: { numero },
        });
      } catch (e: any) {
        this.logger.warn(`[fechamento] numero best-effort cliente=${dto.clienteId} falhou: ${String(e?.message || e)}`);
      }
    }

    const final = await this.prisma.entrega.findFirst({
      where: { companyId, id: criada.id },
      select: { valor: true },
    });
    return { ok: true, entregaId: criada.id, totalCents: cents(final?.valor) };
  }

  /**
   * O preço unitário de CADA item da venda, resolvido no servidor.
   *
   * Ordem (a MESMA de `resolveValorUnit` que o gerarDia usa pra gravar o
   * EntregaItem — as duas telas nunca podem discordar):
   *   1. preço EDITADO na folha da venda (só quando o dono tocou no valor);
   *   2. `ClienteProduto.precoAcordado` — o preço combinado com ESTE cliente;
   *   3. preço de catálogo do produto;
   *   4. `precoPadrao` do cliente; 5. zero.
   *
   * `editado` viaja junto porque é ele que decide se o preço vira combinado
   * (item 2 do pedido do dono) — herdar preço nunca reescreve cadastro.
   */
  private async resolverPrecos(
    companyId: number,
    clienteId: string,
    itens: Array<{ productId: number; quantidade: number; valorUnit?: number }>,
  ): Promise<Map<number, { valorUnit: number; editado: boolean }>> {
    const productIds = [...new Set(itens.map((i) => Math.trunc(Number(i.productId))))];
    const [vinculos, produtos, conta] = await Promise.all([
      this.prisma.clienteProduto.findMany({
        where: { companyId, customerProfileId: clienteId, productId: { in: productIds }, ativo: true },
        // O vínculo mais antigo do par cliente+produto é "o de sempre" (o schema
        // permite o mesmo produto 2× pra recorrência — mesma régua do
        // ensureVinculoSemDia da Leitura de Rota).
        orderBy: [{ createdAt: 'asc' }],
        select: { productId: true, precoAcordado: true },
      }),
      this.prisma.product.findMany({
        where: { companyId, id: { in: productIds } },
        select: { id: true, price: true, priceCents: true },
      }),
      this.prisma.customerProfile.findFirst({
        where: { companyId, id: clienteId },
        select: { precoPadrao: true },
      }),
    ]);

    const acordadoPor = new Map<number, number>();
    for (const v of vinculos) {
      if (v.precoAcordado == null || !Number.isFinite(v.precoAcordado)) continue;
      if (!acordadoPor.has(v.productId)) acordadoPor.set(v.productId, v.precoAcordado);
    }
    const produtoPor = new Map(produtos.map((p) => [p.id, p]));

    const out = new Map<number, { valorUnit: number; editado: boolean }>();
    for (const item of itens) {
      const productId = Math.trunc(Number(item.productId));
      if (out.has(productId)) continue;
      const editado = item.valorUnit != null && Number.isFinite(Number(item.valorUnit));
      const valorUnit = editado
        ? Math.max(0, round2(Number(item.valorUnit)))
        : resolveValorUnit({
            precoAcordado: acordadoPor.get(productId) ?? null,
            product: produtoPor.get(productId) ?? null,
            customerProfile: conta ?? null,
          });
      out.set(productId, { valorUnit, editado });
    }
    return out;
  }

  /**
   * Grava o preço combinado com o cliente. Sem vínculo, cria um SEM DIA —
   * invisível pro gerar-dia (`buscarVencidosPorCliente` só olha quem tem
   * diasSemana ou proximaData), então guardar um preço NUNCA inventa recorrência.
   *
   * Toca SÓ o preço: `qtdPadrao`, dias e cadência ficam como o dono deixou. Ele
   * pediu que o PREÇO ficasse fixo — vender 3 hoje não pode virar "3 sempre".
   */
  private async gravarPrecoCombinado(
    companyId: number,
    clienteId: string,
    productId: number,
    valorUnit: number,
  ): Promise<void> {
    const existente = await this.prisma.clienteProduto.findFirst({
      where: { companyId, customerProfileId: clienteId, productId },
      orderBy: [{ createdAt: 'asc' }],
      select: { id: true, precoAcordado: true },
    });
    if (existente) {
      if (Number(existente.precoAcordado) === valorUnit) return;
      await this.prisma.clienteProduto.update({
        where: { id: existente.id },
        data: { precoAcordado: valorUnit },
      });
      return;
    }
    await this.prisma.clienteProduto.create({
      data: {
        companyId,
        customerProfileId: clienteId,
        productId,
        precoAcordado: valorUnit,
        qtdPadrao: 1,
        diasSemana: null,
        frequenciaDias: null,
        proximaData: null,
      },
    });
  }

  /**
   * Ouro nº1 — o dia do cliente se preenche sozinho. Régua aprovada pelo dono
   * (05/08): SÓ cliente sem dia NENHUM (nem plano, nem vínculo com dia), com 2+
   * datas distintas anotadas na MESMA página em 28 dias. Escrita pela porta
   * canônica: garante 1 vínculo, definirDiasDoCliente + espelho da agenda — a
   * MESMA sequência do PATCH /clientes/:id/dias (nunca uma 2ª verdade de dia).
   */
  private async aprenderDiaDoCliente(
    companyId: number,
    clienteId: string,
    dia: number,
    productIdDaVenda: number,
  ): Promise<void> {
    if (!this.recorrencia || !this.agenda) return;

    const [planos, vinculosComDia] = await Promise.all([
      this.prisma.logisticaPlanoEntrega.count({
        where: { companyId, customerProfileId: clienteId, ativo: true },
      }),
      this.prisma.clienteProduto.count({
        where: { companyId, customerProfileId: clienteId, ativo: true, NOT: { diasSemana: null } },
      }),
    ]);
    // Qualquer dia já cadastrado (mesmo com espelho quebrado) = decisão dele; não sobrescrever.
    if (planos > 0 || vinculosComDia > 0) return;

    const desde = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
    const vendas = await this.prisma.entrega.findMany({
      where: {
        companyId,
        customerProfileId: clienteId,
        status: 'entregue',
        fechamentoDiaSemana: dia,
        deliveredAt: { gte: desde },
      },
      select: { deliveredAt: true },
    });
    const datas = new Set(vendas.map((v) => saoPauloDateKey(v.deliveredAt)).filter(Boolean));
    if (datas.size < 2) return;

    // Sem vínculo o definirDias não tem onde escrever — nasce um SEM DIA com o
    // produto da venda (mesma forma do gravarPrecoCombinado: nada de recorrência
    // inventada; o dia entra logo abaixo pela porta canônica).
    const vinculos = await this.prisma.clienteProduto.count({
      where: { companyId, customerProfileId: clienteId, ativo: true },
    });
    if (!vinculos) {
      await this.prisma.clienteProduto.create({
        data: {
          companyId,
          customerProfileId: clienteId,
          productId: productIdDaVenda,
          qtdPadrao: 1,
          diasSemana: null,
          frequenciaDias: null,
          proximaData: null,
        },
      });
    }

    // Snapshots ANTES da mutação (contrato do espelho: mover, nunca duplicar).
    const ativos = await this.prisma.clienteProduto.findMany({
      where: { companyId, customerProfileId: clienteId, ativo: true },
      select: { id: true },
    });
    const anteriores = await Promise.all(
      ativos.map((v) => this.recorrencia.vinculoEspelhoSnapshot(companyId, v.id)),
    );
    const res = await this.recorrencia.definirDiasDoCliente(companyId, clienteId, [dia]);
    for (const vinculoId of res.vinculoIds) {
      const anterior = anteriores.find((s: any) => s && String(s.id) === String(vinculoId)) ?? null;
      await this.agenda.espelharVinculoCadastro(companyId, vinculoId, anterior);
    }
    this.logger.log(`[fechamento] dia aprendido cliente=${clienteId} dia=${dia} company=${companyId}`);
  }

  /**
   * 🔴 APAGAR A VENDA ERRADA (05/08, pedido do dono: "cliente não consegue
   * excluir entrega errada, mantém pressionado e não deleta — tem q apagar do
   * histórico tbm").
   *
   * Desfaz a venda INTEIRA, nos três lugares onde ela aparece:
   *   1. a entrega vira 'cancelada' → sai da lista do dia E do fechamento
   *      (o fechamento conta `status:'entregue'`);
   *   2. a cobrança DESTA entrega é cancelada;
   *   3. a linha do histórico do cliente é apagada.
   *
   * 💰 DINHEIRO JÁ RECEBIDO TAMBÉM É DESFEITO AQUI — de propósito, e é a única
   * porta do sistema em que isso acontece. Não é o sistema decidindo: é uma
   * venda que NÃO EXISTIU, apagada pelo dono com o dedo em cima da linha e uma
   * confirmação. Deixar o charge pago de pé faria o fechamento do dia mentir
   * pra sempre, que é o oposto do que ele pediu. O estado anterior fica inteiro
   * no `DeletionRecord` (snapshot da entrega + do charge), então o desfazer tem
   * volta pelas mãos do suporte.
   *
   * Idempotente: entrega já cancelada devolve `jaApagada` e ainda assim varre o
   * histórico (o 2º toque limpa o que o 1º não conseguiu).
   */
  async apagarVenda(
    companyId: number,
    entregaId: string,
    opts: { deletedByUserId?: number | null } = {},
  ): Promise<FechamentoApagarVendaResult | null> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const id = String(entregaId || '').trim();
    if (!id) throw new BadRequestException('Entrega não identificada');

    const entrega = await this.prisma.entrega.findFirst({
      where: { id, companyId },
      select: {
        id: true, companyId: true, customerProfileId: true, productId: true, quantidade: true,
        valor: true, status: true, receiptMethod: true, cobrancaStatus: true, notes: true,
        scheduledAt: true, deliveredAt: true,
      },
    });
    if (!entrega) return null;

    // 💰 FAIL-CLOSED: entrega já FATURADA está dentro de uma fatura fechada do
    // mês (1 charge agrupando N entregas, sem `entregaId` — o cancelamento
    // abaixo nem a encontraria). Sumir com a entrega e deixar a fatura de pé
    // seria a tela mentindo sobre o que foi cobrado. Desfazer isso é decisão de
    // fechamento, não de toque-longo na rua.
    if (entrega.cobrancaStatus === 'faturada') {
      throw new BadRequestException('Esta entrega já entrou no fechamento do mês. Ajuste pelo financeiro.');
    }

    const jaApagada = entrega.status === 'cancelada';
    const charges = await this.prisma.financeiroCharge.findMany({
      where: { companyId, entregaId: entrega.id },
      select: { id: true, amount: true, status: true, lifecycle: true, paidAt: true },
    });

    await this.prisma.$transaction(async (tx) => {
      if (!jaApagada) {
        await tx.deletionRecord.create({
          data: {
            moduleKey: 'logistica',
            entityType: 'Entrega',
            entityId: entrega.id,
            companyId,
            motivo: 'Venda apagada no fechamento do dia',
            snapshot: JSON.stringify({ entrega, charges }),
            deletedByUserId: opts.deletedByUserId ?? null,
          },
        });
        await tx.financeiroCharge.updateMany({
          where: { companyId, entregaId: entrega.id, status: { not: 'cancelled' } },
          data: { status: 'cancelled', lifecycle: 'cancelled' },
        });
        await tx.entrega.update({
          where: { id: entrega.id },
          data: {
            status: 'cancelada',
            cobrancaStatus: 'pendente',
            notes: `${entrega.notes ? entrega.notes + ' | ' : ''}Venda apagada no fechamento`.slice(0, 500),
          },
        });
      }
      // Sempre — é a segunda metade literal do pedido ("apagar do histórico tbm").
      await tx.clienteHistorico.deleteMany({ where: { companyId, entregaId: entrega.id } });
    });

    return { ok: true, entregaId: entrega.id, ...(jaApagada ? { jaApagada: true } : {}) };
  }
}

function round2(v: number): number {
  return Math.round((Number(v) || 0) * 100) / 100;
}
