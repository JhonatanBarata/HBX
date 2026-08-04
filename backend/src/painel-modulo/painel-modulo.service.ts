import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { ComexCambioService } from '../comex/comex-cambio.service';
import { TENANT_FINANCE_SOURCE_MODULES } from '../financeiro-tenant/finance-source-modules';
import { diaCurtoLocal, horaLocal, inicioDoDia, inicioDoMes, janelaDoDia } from './painel-dia.util';
import type { PainelBarra, PainelFato, PainelModulo, PainelTom } from './painel-modulo.types';

/**
 * PAINEL DAS COSTAS — quem monta o verso de cada módulo do menu.
 *
 * Regras que valem para os 11 painéis:
 *  · company-scoped SEMPRE (companyId do JWT em toda query — lei multi-tenant);
 *  · só CONTAGEM barata em coluna indexada. Nada de varrer tabela grande: a
 *    série de 7 dias é 7 counts na mesma faixa indexada, nunca um SELECT de
 *    linhas para contar na memória (armadilha do pool-storm por COUNT);
 *  · dinheiro só para quem pode ver dinheiro (LEI DO VENDEDOR): sem papel
 *    admin, o painel financeiro volta neutro e MUDO, não zerado;
 *  · nada aqui escreve. O painel é leitura pura.
 */

const CACHE_TTL_MS = 20_000;
const DIAS_SERIE = 7;

type Ator = { companyId: number; podeVerDinheiro: boolean };

function pct(parte: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((parte / total) * 100)));
}

function num(v: number): string {
  return new Intl.NumberFormat('pt-BR').format(Math.max(0, Math.trunc(Number(v) || 0)));
}

function dinheiro(v: number): string {
  const valor = Math.round((Number(v) || 0) * 100) / 100;
  return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "agora", "há 12 min", "há 3 h", "há 4 d" — recado curto, cabe no rail. */
function desde(ref: Date | null | undefined, agora: Date): string {
  if (!ref) return '—';
  const delta = Math.max(0, agora.getTime() - new Date(ref).getTime());
  const min = Math.floor(delta / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `há ${horas} h`;
  return `há ${Math.floor(horas / 24)} d`;
}

/**
 * Barras de FATIA (cada item é um pedaço do bolo: estágio do funil, status da
 * entrega, forma de pagamento). O todo é a soma — os itens não se sobrepõem.
 */
function barras(itens: Array<{ rotulo: string; valor: number; texto?: string; tom?: PainelTom }>): PainelBarra[] {
  const total = itens.reduce((soma, item) => soma + Math.max(0, item.valor), 0);
  return barrasSobre(itens, total);
}

/**
 * Barras de ATRIBUTO (o mesmo registro pode entrar em mais de uma: contato com
 * WhatsApp E com e-mail; empresa que é cliente E fornecedor). Aqui o todo é a
 * base inteira — somar as fatias daria 100% numa barra só, mentindo.
 */
function barrasSobre(
  itens: Array<{ rotulo: string; valor: number; texto?: string; tom?: PainelTom }>,
  total: number,
): PainelBarra[] {
  return itens.map((item) => ({
    rotulo: item.rotulo,
    valor: Math.max(0, item.valor),
    pct: pct(item.valor, total),
    texto: item.texto,
    tom: item.tom,
  }));
}

@Injectable()
export class PainelModuloService {
  private readonly logger = new Logger(PainelModuloService.name);
  private readonly cache = new Map<string, { em: number; painel: PainelModulo }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cambioService: ComexCambioService,
  ) {}

  /**
   * Módulos que TÊM verso — desde 04/08 são TODOS os do menu (ordem do dono:
   * "ressuscite os painéis de todas as páginas"). Isso revoga a exceção de
   * 31/07 que deixava /dashboard e /relatorios sem verso: com o painel abrindo
   * só no clique, ele não rouba mais o menu de ninguém, então não havia mais
   * motivo pra tela nenhuma ficar de fora — e botão que promete e não abre é o
   * defeito que esta entrega veio matar.
   */
  static readonly MODULOS = [
    'dash',
    'relat',
    'financeiro',
    'fiscal',
    'vendas',
    'agenda',
    'atend',
    'website',
    'empresas',
    'contatos',
    'produtos',
    'concierge',
    'automacaoHub',
    'logistica',
    'clientes',
    'comex',
    'config',
  ] as const;

  async painel(ator: Ator, moduloBruto: string): Promise<PainelModulo | null> {
    const modulo = String(moduloBruto || '').trim();
    if (!ator.companyId) return null;
    if (!(PainelModuloService.MODULOS as readonly string[]).includes(modulo)) return null;

    const chave = `${ator.companyId}:${modulo}:${ator.podeVerDinheiro ? 1 : 0}`;
    const guardado = this.cache.get(chave);
    const agoraMs = Date.now();
    if (guardado && agoraMs - guardado.em < CACHE_TTL_MS) return guardado.painel;

    try {
      const painel = await this.montar(ator, modulo);
      if (painel) {
        this.cache.set(chave, { em: agoraMs, painel });
        if (this.cache.size > 400) this.cache.clear();
      }
      return painel;
    } catch (erro) {
      // Painel é enfeite informativo: falhar aqui NUNCA pode derrubar a casca.
      this.logger.warn(`painel ${modulo} falhou: ${(erro as Error)?.message || erro}`);
      return null;
    }
  }

  private async montar(ator: Ator, modulo: string): Promise<PainelModulo | null> {
    const agora = new Date();
    switch (modulo) {
      case 'dash': return this.dashboard(ator, agora);
      case 'relat': return this.relatorios(ator, agora);
      case 'fiscal': return this.fiscal(ator, agora);
      case 'website': return this.website(ator, agora);
      case 'comex': return this.comex(agora);
      case 'config': return this.configuracoes(ator, agora);
      case 'financeiro': return this.financeiro(ator, agora);
      case 'vendas': return this.vendas(ator, agora);
      case 'agenda': return this.agenda(ator, agora);
      case 'atend': return this.conversas(ator, agora);
      case 'empresas': return this.empresas(ator, agora);
      case 'contatos': return this.contatos(ator, agora);
      case 'produtos': return this.produtos(ator);
      case 'concierge': return this.concierge(ator, agora);
      case 'automacaoHub': return this.automacao(ator, agora);
      case 'logistica': return this.entregas(ator, agora);
      case 'clientes': return this.clientes(ator, agora);
      default: return null;
    }
  }

  /**
   * Série de 7 dias: 7 contagens na MESMA coluna indexada, em paralelo.
   * `janela` recebe o intervalo do dia e devolve o `where` completo.
   */
  private serie7(
    agora: Date,
    primeiroDelta: number,
    contar: (janela: { gte: Date; lt: Date }) => Promise<number>,
  ): Promise<number[]> {
    const dias = Array.from({ length: DIAS_SERIE }, (_, i) => primeiroDelta + i);
    return Promise.all(dias.map((delta) => contar(janelaDoDia(agora, delta))));
  }

  // ── FINANCEIRO ────────────────────────────────────────────────────────────
  private async financeiro(ator: Ator, agora: Date): Promise<PainelModulo> {
    const companyId = ator.companyId;
    const base = {
      companyId,
      sourceModule: { in: [...TENANT_FINANCE_SOURCE_MODULES] },
    };

    // LEI DO VENDEDOR: quem não pode ver dinheiro não vê número nenhum aqui.
    if (!ator.podeVerDinheiro) {
      return {
        modulo: 'financeiro',
        titulo: 'Financeiro',
        legenda: 'acesso restrito',
        tom: 'neutro',
        hero: null,
        serie: [],
        serieRotulo: null,
        metricas: [],
        barras: [],
        fatos: [{ rotulo: 'Valores', valor: 'só o responsável' }],
        rodape: null,
      };
    }

    const hoje = janelaDoDia(agora);
    const mes = inicioDoMes(agora);

    const [aberto, vencidas, venceHoje, recebidoMes, clientesDevendo, serie] = await Promise.all([
      this.prisma.financeiroCharge.aggregate({
        where: { companyId, ...base, status: 'pending' },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.financeiroCharge.aggregate({
        where: { companyId, ...base, status: 'pending', dueDate: { lt: hoje.gte } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.financeiroCharge.count({
        where: { companyId, ...base, status: 'pending', dueDate: hoje },
      }),
      this.prisma.financeiroCharge.aggregate({
        where: { companyId, ...base, status: 'approved', paidAt: { gte: mes } },
        _sum: { amount: true },
      }),
      this.prisma.financeiroCharge.findMany({
        where: { companyId, ...base, status: 'pending', customerProfileId: { not: null } },
        select: { customerProfileId: true },
        distinct: ['customerProfileId'],
        take: 500,
      }),
      this.serie7(agora, -6, (janela) =>
        this.prisma.financeiroCharge.count({ where: { companyId, ...base, createdAt: janela } }),
      ),
    ]);

    const emAberto = Number(aberto._sum.amount || 0);
    const atrasado = Number(vencidas._sum.amount || 0);
    const recebido = Number(recebidoMes._sum.amount || 0);
    const tom: PainelTom = atrasado > 0 ? 'risco' : venceHoje > 0 ? 'atencao' : emAberto > 0 ? 'ok' : 'neutro';

    return {
      modulo: 'financeiro',
      titulo: 'Financeiro',
      legenda: 'em aberto agora',
      tom,
      hero: {
        valor: dinheiro(emAberto),
        rotulo: 'a receber',
        nota: `${num(aberto._count._all)} cobrança(s) · ${num(clientesDevendo.length)} cliente(s)`,
      },
      serie,
      serieRotulo: 'cobranças na semana',
      metricas: [
        { rotulo: 'Vencido', valor: dinheiro(atrasado), tom: atrasado > 0 ? 'risco' : 'neutro' },
        { rotulo: 'Recebido no mês', valor: dinheiro(recebido), tom: recebido > 0 ? 'ok' : 'neutro' },
      ],
      barras: barras([
        { rotulo: 'Recebido', valor: Math.round(recebido), texto: dinheiro(recebido), tom: 'ok' },
        { rotulo: 'A receber', valor: Math.round(emAberto), texto: dinheiro(emAberto), tom: 'atencao' },
        { rotulo: 'Vencido', valor: Math.round(atrasado), texto: dinheiro(atrasado), tom: 'risco' },
      ]),
      fatos: [
        { rotulo: 'Vence hoje', valor: num(venceHoje), tom: venceHoje > 0 ? 'atencao' : undefined },
        { rotulo: 'Em atraso', valor: num(vencidas._count._all), tom: vencidas._count._all > 0 ? 'risco' : undefined },
      ],
      rodape: null,
    };
  }

  // ── VENDAS ────────────────────────────────────────────────────────────────
  private async vendas(ator: Ator, agora: Date): Promise<PainelModulo> {
    const companyId = ator.companyId;
    const vivos = { companyId, status: { not: 'encerrado' } };
    const hoje = janelaDoDia(agora);
    const mes = inicioDoMes(agora);

    const [ativos, porStatus, quentes, retornosHoje, ganhosMes, ultimoContato, serie] = await Promise.all([
      this.prisma.vendasLead.count({ where: { companyId, ...vivos } }),
      this.prisma.vendasLead.groupBy({ by: ['status'], where: { companyId, ...vivos }, _count: { _all: true } }),
      this.prisma.vendasLead.count({ where: { companyId, ...vivos, leadTemperature: 'quente' } }),
      this.prisma.vendasLead.count({ where: { companyId, returnAt: hoje } }),
      this.prisma.vendasLead.count({ where: { companyId, closureReason: 'convertido', closedAt: { gte: mes } } }),
      this.prisma.vendasLead.findFirst({
        where: { companyId, lastContactAt: { not: null } },
        orderBy: { lastContactAt: 'desc' },
        select: { lastContactAt: true },
      }),
      this.serie7(agora, -6, (janela) => this.prisma.vendasLead.count({ where: { companyId, createdAt: janela } })),
    ]);

    const contaPor = (status: string) =>
      Number(porStatus.find((linha) => linha.status === status)?._count?._all || 0);

    const tom: PainelTom =
      quentes > 0 ? 'ok' : retornosHoje > 0 ? 'atencao' : ativos === 0 ? 'neutro' : 'neutro';

    return {
      modulo: 'vendas',
      titulo: 'Vendas',
      legenda: 'no funil agora',
      tom,
      hero: {
        valor: num(ativos),
        rotulo: ativos === 1 ? 'lead vivo' : 'leads vivos',
        nota: `último toque ${desde(ultimoContato?.lastContactAt, agora)}`,
      },
      serie,
      serieRotulo: 'entraram na semana',
      metricas: [
        { rotulo: 'Quentes', valor: num(quentes), tom: quentes > 0 ? 'ok' : 'neutro' },
        { rotulo: 'Fechados no mês', valor: num(ganhosMes), tom: ganhosMes > 0 ? 'ok' : 'neutro' },
      ],
      barras: barras([
        { rotulo: 'Novo', valor: contaPor('novo') },
        { rotulo: 'Em contato', valor: contaPor('contato'), tom: 'ok' },
        { rotulo: 'Retorno', valor: contaPor('retorno'), tom: 'atencao' },
        { rotulo: 'Qualificado', valor: contaPor('qualificado'), tom: 'ok' },
      ]),
      fatos: [
        { rotulo: 'Retornos hoje', valor: num(retornosHoje), tom: retornosHoje > 0 ? 'atencao' : undefined },
      ],
      rodape: null,
    };
  }

  // ── AGENDA ────────────────────────────────────────────────────────────────
  private async agenda(ator: Ator, agora: Date): Promise<PainelModulo> {
    const companyId = ator.companyId;
    const hoje = janelaDoDia(agora);
    const fimSemana = inicioDoDia(agora, 7);

    const [confirmadosHoje, canceladosHoje, proximo, semana, retornosHoje, serie] = await Promise.all([
      this.prisma.atendimentoAppointment.count({
        where: { companyId, status: 'confirmed', startsAt: hoje },
      }),
      this.prisma.atendimentoAppointment.count({
        where: { companyId, status: 'canceled', startsAt: hoje },
      }),
      this.prisma.atendimentoAppointment.findFirst({
        where: { companyId, status: 'confirmed', startsAt: { gte: agora } },
        orderBy: { startsAt: 'asc' },
        select: { startsAt: true, customerName: true },
      }),
      this.prisma.atendimentoAppointment.count({
        where: { companyId, status: 'confirmed', startsAt: { gte: hoje.gte, lt: fimSemana } },
      }),
      this.prisma.vendasLead.count({ where: { companyId, returnAt: hoje } }),
      this.serie7(agora, 0, (janela) =>
        this.prisma.atendimentoAppointment.count({
          where: { companyId, status: 'confirmed', startsAt: janela },
        }),
      ),
    ]);

    const faltamMin = proximo ? Math.round((proximo.startsAt.getTime() - agora.getTime()) / 60_000) : null;
    const tom: PainelTom =
      faltamMin !== null && faltamMin <= 60 ? 'atencao' : confirmadosHoje > 0 ? 'ok' : 'neutro';

    return {
      modulo: 'agenda',
      titulo: 'Agenda',
      legenda: 'hoje',
      tom,
      hero: {
        valor: num(confirmadosHoje),
        rotulo: confirmadosHoje === 1 ? 'compromisso hoje' : 'compromissos hoje',
        nota: proximo
          ? `próximo ${horaLocal(proximo.startsAt)} · ${String(proximo.customerName || 'sem nome').slice(0, 22)}`
          : 'nada marcado à frente',
      },
      serie,
      serieRotulo: 'próximos 7 dias',
      metricas: [
        { rotulo: 'Na semana', valor: num(semana), tom: semana > 0 ? 'ok' : 'neutro' },
        { rotulo: 'Retornos hoje', valor: num(retornosHoje), tom: retornosHoje > 0 ? 'atencao' : 'neutro' },
      ],
      barras: [],
      fatos: [
        {
          rotulo: 'Próximo',
          valor: proximo ? horaLocal(proximo.startsAt) : '—',
          tom: faltamMin !== null && faltamMin <= 60 ? 'atencao' : undefined,
        },
        { rotulo: 'Cancelados hoje', valor: num(canceladosHoje), tom: canceladosHoje > 0 ? 'risco' : undefined },
      ],
      rodape: null,
    };
  }

  // ── CONVERSAS ─────────────────────────────────────────────────────────────
  private async conversas(ator: Ator, agora: Date): Promise<PainelModulo> {
    const companyId = ator.companyId;
    const hoje = janelaDoDia(agora);
    const seteDias = inicioDoDia(agora, -6);
    const recente = { gte: seteDias };

    const [ativasHoje, naSemana, comRobo, comHumano, semDono, ultima, serie] = await Promise.all([
      this.prisma.companyConversation.count({ where: { companyId, lastMessageAt: hoje } }),
      this.prisma.companyConversation.count({ where: { companyId, lastInteractionAt: recente } }),
      this.prisma.companyConversation.count({
        where: { companyId, botActive: true, lastInteractionAt: recente },
      }),
      this.prisma.companyConversation.count({
        where: { companyId, humanAssigned: true, lastInteractionAt: recente },
      }),
      this.prisma.companyConversation.count({
        where: { companyId, botActive: false, humanAssigned: false, lastInteractionAt: recente },
      }),
      this.prisma.companyConversation.findFirst({
        where: { companyId },
        orderBy: { lastMessageAt: 'desc' },
        select: { lastMessageAt: true },
      }),
      this.serie7(agora, -6, (janela) =>
        this.prisma.companyConversation.count({ where: { companyId, lastMessageAt: janela } }),
      ),
    ]);

    const tom: PainelTom = semDono > 0 ? 'atencao' : ativasHoje > 0 ? 'ok' : 'neutro';

    return {
      modulo: 'atend',
      titulo: 'Conversas',
      legenda: 'movimento de hoje',
      tom,
      hero: {
        valor: num(ativasHoje),
        rotulo: ativasHoje === 1 ? 'conversa hoje' : 'conversas hoje',
        nota: `última mensagem ${desde(ultima?.lastMessageAt, agora)}`,
      },
      serie,
      serieRotulo: 'conversas por dia',
      metricas: [
        { rotulo: 'Sem dono', valor: num(semDono), tom: semDono > 0 ? 'atencao' : 'neutro' },
        { rotulo: 'Com atendente', valor: num(comHumano), tom: comHumano > 0 ? 'ok' : 'neutro' },
      ],
      // Quem conduz é ATRIBUTO (robô e atendente podem estar na mesma conversa);
      // o todo é a semana inteira de conversas.
      barras: barrasSobre(
        [
          { rotulo: 'Robô', valor: comRobo, tom: 'ok' },
          { rotulo: 'Atendente', valor: comHumano, tom: 'ok' },
          { rotulo: 'Sem dono', valor: semDono, tom: 'atencao' },
        ],
        naSemana,
      ),
      fatos: [],
      rodape: null,
    };
  }

  // ── EMPRESAS ──────────────────────────────────────────────────────────────
  private async empresas(ator: Ator, agora: Date): Promise<PainelModulo> {
    const companyId = ator.companyId;
    const pj = { companyId, tipo: 'pj' };
    const mes = inicioDoMes(agora);

    const [total, clientes, leads, fornecedores, comCnpj, novasMes, serie] = await Promise.all([
      this.prisma.customerProfile.count({ where: { companyId, ...pj } }),
      this.prisma.customerProfile.count({ where: { companyId, ...pj, isCliente: true } }),
      this.prisma.customerProfile.count({ where: { companyId, ...pj, isLead: true } }),
      this.prisma.customerProfile.count({ where: { companyId, ...pj, isFornecedor: true } }),
      this.prisma.customerProfile.count({ where: { companyId, ...pj, cnpj: { not: null } } }),
      this.prisma.customerProfile.count({ where: { companyId, ...pj, createdAt: { gte: mes } } }),
      this.serie7(agora, -6, (janela) => this.prisma.customerProfile.count({ where: { companyId, ...pj, createdAt: janela } })),
    ]);

    return {
      modulo: 'empresas',
      titulo: 'Empresas',
      legenda: 'contas PJ na base',
      tom: novasMes > 0 ? 'ok' : 'neutro',
      hero: {
        valor: num(total),
        rotulo: total === 1 ? 'empresa' : 'empresas',
        nota: `${num(comCnpj)} com CNPJ conferido`,
      },
      serie,
      serieRotulo: 'entraram na semana',
      metricas: [
        { rotulo: 'Novas no mês', valor: num(novasMes), tom: novasMes > 0 ? 'ok' : 'neutro' },
        { rotulo: 'Clientes', valor: num(clientes), tom: clientes > 0 ? 'ok' : 'neutro' },
      ],
      // Papel é ATRIBUTO: a mesma conta pode ser cliente e fornecedora.
      barras: barrasSobre(
        [
          { rotulo: 'Cliente', valor: clientes, tom: 'ok' },
          { rotulo: 'Lead', valor: leads },
          { rotulo: 'Fornecedor', valor: fornecedores },
        ],
        total,
      ),
      fatos: [],
      rodape: null,
    };
  }

  // ── CONTATOS ──────────────────────────────────────────────────────────────
  private async contatos(ator: Ator, agora: Date): Promise<PainelModulo> {
    const companyId = ator.companyId;
    const mes = inicioDoMes(agora);

    const [total, comWhats, comEmail, principais, doRadar, novosMes, serie] = await Promise.all([
      this.prisma.contato.count({ where: { companyId } }),
      this.prisma.contato.count({ where: { companyId, whatsapp: { not: null } } }),
      this.prisma.contato.count({ where: { companyId, email: { not: null } } }),
      this.prisma.contato.count({ where: { companyId, isPrincipal: true } }),
      this.prisma.contato.count({ where: { companyId, source: 'radar' } }),
      this.prisma.contato.count({ where: { companyId, createdAt: { gte: mes } } }),
      this.serie7(agora, -6, (janela) => this.prisma.contato.count({ where: { companyId, createdAt: janela } })),
    ]);

    const semCanal = Math.max(0, total - comWhats);

    return {
      modulo: 'contatos',
      titulo: 'Contatos',
      legenda: 'pessoas na base',
      tom: semCanal > 0 && total > 0 ? 'atencao' : total > 0 ? 'ok' : 'neutro',
      hero: {
        valor: num(total),
        rotulo: total === 1 ? 'contato' : 'contatos',
        nota: `${num(principais)} marcados como principal`,
      },
      serie,
      serieRotulo: 'entraram na semana',
      metricas: [
        { rotulo: 'Novos no mês', valor: num(novosMes), tom: novosMes > 0 ? 'ok' : 'neutro' },
        { rotulo: 'Sem WhatsApp', valor: num(semCanal), tom: semCanal > 0 ? 'atencao' : 'neutro' },
      ],
      // Canal é ATRIBUTO: o mesmo contato tem WhatsApp E e-mail. O todo é a base.
      barras: barrasSobre(
        [
          { rotulo: 'WhatsApp', valor: comWhats, tom: 'ok' },
          { rotulo: 'E-mail', valor: comEmail },
          { rotulo: 'Do Radar', valor: doRadar },
        ],
        total,
      ),
      fatos: [],
      rodape: null,
    };
  }

  // ── PRODUTOS ──────────────────────────────────────────────────────────────
  private async produtos(ator: Ator): Promise<PainelModulo> {
    const companyId = ator.companyId;
    const meus = { companyId, kind: 'tenant_product' };

    const [ativos, total, naLogistica, semPreco, porCategoria] = await Promise.all([
      this.prisma.product.count({ where: { companyId, ...meus, status: 'active' } }),
      this.prisma.product.count({ where: { companyId, ...meus } }),
      this.prisma.product.count({ where: { companyId, ...meus, usaLogistica: true } }),
      this.prisma.product.count({ where: { companyId, ...meus, price: { lte: 0 } } }),
      this.prisma.product.groupBy({
        by: ['category'],
        where: { companyId, ...meus, status: 'active' },
        _count: { _all: true },
      }),
    ]);

    const topo = porCategoria
      .map((linha) => ({
        rotulo: String(linha.category || 'Sem categoria').slice(0, 16),
        valor: Number(linha._count?._all || 0),
      }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 4);

    return {
      modulo: 'produtos',
      titulo: 'Produtos',
      legenda: 'catálogo ativo',
      tom: semPreco > 0 ? 'atencao' : ativos > 0 ? 'ok' : 'neutro',
      hero: {
        valor: num(ativos),
        rotulo: ativos === 1 ? 'item à venda' : 'itens à venda',
        nota: `${num(Math.max(0, total - ativos))} fora do catálogo`,
      },
      serie: [],
      serieRotulo: null,
      metricas: [
        { rotulo: 'Vão pra rota', valor: num(naLogistica), tom: naLogistica > 0 ? 'ok' : 'neutro' },
        { rotulo: 'Sem preço', valor: num(semPreco), tom: semPreco > 0 ? 'atencao' : 'neutro' },
      ],
      // O topo mostra 4 categorias; o todo continua sendo o catálogo ativo
      // inteiro, senão as 4 maiores sozinhas somariam 100%.
      barras: barrasSobre(topo, ativos),
      fatos: [],
      rodape: null,
    };
  }

  // ── CONCIERGE ─────────────────────────────────────────────────────────────
  private async concierge(ator: Ator, agora: Date): Promise<PainelModulo> {
    const companyId = ator.companyId;
    const mes = inicioDoMes(agora);

    const [executadasMes, rascunhoAberto, ultima, achadosOk, achadosFalha, serie] = await Promise.all([
      this.prisma.aiConciergeDraft.count({ where: { companyId, status: 'executed', updatedAt: { gte: mes } } }),
      this.prisma.aiConciergeDraft.count({
        where: { companyId, status: 'active', expiresAt: { gt: agora } },
      }),
      this.prisma.aiConciergeDraft.findFirst({
        where: { companyId, status: 'executed' },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
      this.prisma.aiConciergeReviewFinding.count({ where: { companyId, verdict: 'ok' } }),
      this.prisma.aiConciergeReviewFinding.count({ where: { companyId, verdict: 'falha' } }),
      this.serie7(agora, -6, (janela) =>
        this.prisma.aiConciergeDraft.count({ where: { companyId, status: 'executed', updatedAt: janela } }),
      ),
    ]);

    return {
      modulo: 'concierge',
      titulo: 'Concierge IA',
      legenda: 'buscas conduzidas',
      tom: achadosFalha > achadosOk ? 'atencao' : executadasMes > 0 ? 'ok' : 'neutro',
      hero: {
        valor: num(executadasMes),
        rotulo: executadasMes === 1 ? 'busca no mês' : 'buscas no mês',
        nota: `última ${desde(ultima?.updatedAt, agora)}`,
      },
      serie,
      serieRotulo: 'buscas na semana',
      metricas: [
        { rotulo: 'Conversa aberta', valor: num(rascunhoAberto), tom: rascunhoAberto > 0 ? 'ok' : 'neutro' },
        {
          rotulo: 'Revisor apontou',
          valor: num(achadosFalha),
          tom: achadosFalha > 0 ? 'atencao' : 'neutro',
        },
      ],
      barras: barras([
        { rotulo: 'Respondeu bem', valor: achadosOk, tom: 'ok' },
        { rotulo: 'Deixou na mão', valor: achadosFalha, tom: 'atencao' },
      ]),
      fatos: [],
      rodape: null,
    };
  }

  // ── AUTOMAÇÃO ─────────────────────────────────────────────────────────────
  private async automacao(ator: Ator, agora: Date): Promise<PainelModulo> {
    const companyId = ator.companyId;
    const mes = inicioDoMes(agora);

    const [ativas, pausadas, concluidasMes, cadenciasLigadas, proxima, serie] = await Promise.all([
      this.prisma.cadenciaInscricao.count({ where: { companyId, status: 'ativa' } }),
      this.prisma.cadenciaInscricao.count({ where: { companyId, status: 'pausada' } }),
      this.prisma.cadenciaInscricao.count({
        where: { companyId, status: 'concluida', updatedAt: { gte: mes } },
      }),
      this.prisma.cadencia.count({ where: { companyId, ativa: true } }),
      this.prisma.cadenciaInscricao.findFirst({
        where: { companyId, status: 'ativa' },
        orderBy: { nextStepAt: 'asc' },
        select: { nextStepAt: true },
      }),
      this.serie7(agora, 0, (janela) =>
        this.prisma.cadenciaInscricao.count({ where: { companyId, status: 'ativa', nextStepAt: janela } }),
      ),
    ]);

    const atrasada = Boolean(proxima?.nextStepAt && proxima.nextStepAt.getTime() < agora.getTime());

    return {
      modulo: 'automacaoHub',
      titulo: 'Automação',
      legenda: 'quem o robô está tocando',
      tom: atrasada ? 'atencao' : ativas > 0 ? 'ok' : 'neutro',
      hero: {
        valor: num(ativas),
        rotulo: ativas === 1 ? 'lead em cadência' : 'leads em cadência',
        nota: proxima?.nextStepAt
          ? atrasada
            ? 'passo vencido esperando a vez'
            : `próximo passo ${diaCurtoLocal(proxima.nextStepAt)} ${horaLocal(proxima.nextStepAt)}`
          : 'nenhum passo agendado',
      },
      serie,
      serieRotulo: 'passos dos próximos 7 dias',
      metricas: [
        { rotulo: 'Cadências ligadas', valor: num(cadenciasLigadas), tom: cadenciasLigadas > 0 ? 'ok' : 'neutro' },
        { rotulo: 'Concluídas no mês', valor: num(concluidasMes), tom: concluidasMes > 0 ? 'ok' : 'neutro' },
      ],
      barras: barras([
        { rotulo: 'Rodando', valor: ativas, tom: 'ok' },
        { rotulo: 'Pausadas', valor: pausadas, tom: 'atencao' },
        { rotulo: 'Concluídas', valor: concluidasMes },
      ]),
      fatos: [],
      rodape: null,
    };
  }

  // ── ENTREGAS ──────────────────────────────────────────────────────────────
  private async entregas(ator: Ator, agora: Date): Promise<PainelModulo> {
    const companyId = ator.companyId;
    const hoje = janelaDoDia(agora);

    const [agendadas, emRota, entregues, canceladas, rotasAtivas, serie] = await Promise.all([
      this.prisma.entrega.count({ where: { companyId, status: 'agendada', scheduledAt: hoje } }),
      this.prisma.entrega.count({ where: { companyId, status: 'em_rota', scheduledAt: hoje } }),
      this.prisma.entrega.count({ where: { companyId, status: 'entregue', scheduledAt: hoje } }),
      this.prisma.entrega.count({ where: { companyId, status: 'cancelada', scheduledAt: hoje } }),
      this.prisma.logisticaRoute.count({ where: { companyId, status: 'ACTIVE' } }),
      this.serie7(agora, -6, (janela) =>
        this.prisma.entrega.count({ where: { companyId, status: 'entregue', scheduledAt: janela } }),
      ),
    ]);

    const doDia = agendadas + emRota + entregues;
    const faltam = agendadas + emRota;

    return {
      modulo: 'logistica',
      titulo: 'Entregas',
      legenda: 'rota de hoje',
      tom: emRota > 0 ? 'ok' : faltam > 0 ? 'atencao' : 'neutro',
      hero: {
        valor: `${num(entregues)}/${num(doDia)}`,
        rotulo: 'entregues hoje',
        nota: faltam > 0 ? `${num(faltam)} ainda na fila` : 'dia fechado',
      },
      serie,
      serieRotulo: 'entregues na semana',
      metricas: [
        { rotulo: 'Na rua', valor: num(emRota), tom: emRota > 0 ? 'ok' : 'neutro' },
        { rotulo: 'Rotas ativas', valor: num(rotasAtivas), tom: rotasAtivas > 0 ? 'ok' : 'neutro' },
      ],
      barras: barras([
        { rotulo: 'Entregue', valor: entregues, tom: 'ok' },
        { rotulo: 'Na rua', valor: emRota, tom: 'ok' },
        { rotulo: 'Na fila', valor: agendadas, tom: 'atencao' },
        { rotulo: 'Cancelada', valor: canceladas, tom: 'risco' },
      ]),
      fatos: [],
      rodape: null,
    };
  }

  // ── CLIENTES ──────────────────────────────────────────────────────────────
  private async clientes(ator: Ator, agora: Date): Promise<PainelModulo> {
    const companyId = ator.companyId;
    const base = { companyId, isCliente: true };
    const mes = inicioDoMes(agora);

    const [total, novosMes, mensal, aberto, naHora, pendura, semEndereco, serie] = await Promise.all([
      this.prisma.customerProfile.count({ where: { companyId, ...base } }),
      this.prisma.customerProfile.count({ where: { companyId, ...base, createdAt: { gte: mes } } }),
      this.prisma.customerProfile.count({ where: { companyId, ...base, formaPagamento: 'mensal' } }),
      this.prisma.customerProfile.count({ where: { companyId, ...base, formaPagamento: 'aberto' } }),
      this.prisma.customerProfile.count({ where: { companyId, ...base, formaPagamento: 'na_hora' } }),
      this.prisma.customerProfile.count({ where: { companyId, ...base, formaPagamento: 'pendura' } }),
      this.prisma.customerProfile.count({ where: { companyId, ...base, lat: null } }),
      this.serie7(agora, -6, (janela) => this.prisma.customerProfile.count({ where: { companyId, ...base, createdAt: janela } })),
    ]);

    return {
      modulo: 'clientes',
      titulo: 'Clientes',
      legenda: 'carteira de entrega',
      tom: semEndereco > 0 ? 'atencao' : total > 0 ? 'ok' : 'neutro',
      hero: {
        valor: num(total),
        rotulo: total === 1 ? 'cliente' : 'clientes',
        nota: `${num(mensal)} no contrato mensal`,
      },
      serie,
      serieRotulo: 'entraram na semana',
      metricas: [
        { rotulo: 'Novos no mês', valor: num(novosMes), tom: novosMes > 0 ? 'ok' : 'neutro' },
        { rotulo: 'Sem mapa', valor: num(semEndereco), tom: semEndereco > 0 ? 'atencao' : 'neutro' },
      ],
      barras: barras([
        { rotulo: 'Mensal', valor: mensal, tom: 'ok' },
        { rotulo: 'Avulso', valor: aberto },
        { rotulo: 'Na hora', valor: naHora },
        { rotulo: 'Fiado', valor: pendura, tom: 'atencao' },
      ]),
      fatos: [] as PainelFato[],
      rodape: null,
    };
  }

  // ── DASHBOARD ─────────────────────────────────────────────────────────────
  // O único painel TRANSVERSAL: as outras telas contam o próprio quintal, esta
  // conta o dia da empresa inteira. Por isso a barra aqui é de FRENTE (onde o
  // dia está acontecendo), não de estágio.
  private async dashboard(ator: Ator, agora: Date): Promise<PainelModulo> {
    const companyId = ator.companyId;
    const hoje = janelaDoDia(agora);

    const [leadsHoje, quentes, conversasHoje, semDono, entregasHoje, naRua, ultimoLead, serie] =
      await Promise.all([
        this.prisma.vendasLead.count({ where: { companyId, createdAt: hoje } }),
        this.prisma.vendasLead.count({
          where: { companyId, status: { not: 'encerrado' }, leadTemperature: 'quente' },
        }),
        this.prisma.companyConversation.count({ where: { companyId, lastMessageAt: hoje } }),
        this.prisma.companyConversation.count({
          where: { companyId, botActive: false, humanAssigned: false, lastMessageAt: hoje },
        }),
        this.prisma.entrega.count({ where: { companyId, scheduledAt: hoje } }),
        this.prisma.entrega.count({ where: { companyId, status: 'em_rota', scheduledAt: hoje } }),
        this.prisma.vendasLead.findFirst({
          where: { companyId },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
        this.serie7(agora, -6, (janela) =>
          this.prisma.vendasLead.count({ where: { companyId, createdAt: janela } }),
        ),
      ]);

    const movimento = leadsHoje + conversasHoje + entregasHoje;
    const tom: PainelTom = semDono > 0 ? 'atencao' : movimento > 0 ? 'ok' : 'neutro';

    return {
      modulo: 'dash',
      titulo: 'Dashboard',
      legenda: 'a empresa hoje',
      tom,
      hero: {
        valor: num(movimento),
        rotulo: movimento === 1 ? 'movimento hoje' : 'movimentos hoje',
        nota: `último lead ${desde(ultimoLead?.createdAt, agora)}`,
      },
      serie,
      serieRotulo: 'leads na semana',
      metricas: [
        { rotulo: 'Leads quentes', valor: num(quentes), tom: quentes > 0 ? 'ok' : 'neutro' },
        { rotulo: 'Entregas na rua', valor: num(naRua), tom: naRua > 0 ? 'ok' : 'neutro' },
      ],
      barras: barras([
        { rotulo: 'Vendas', valor: leadsHoje, tom: 'ok' },
        { rotulo: 'Conversas', valor: conversasHoje, tom: 'ok' },
        { rotulo: 'Entregas', valor: entregasHoje, tom: 'ok' },
      ]),
      fatos: [
        { rotulo: 'Conversa sem dono', valor: num(semDono), tom: semDono > 0 ? 'atencao' : undefined },
      ],
      rodape: null,
    };
  }

  // ── RELATÓRIOS ────────────────────────────────────────────────────────────
  // A tela extrai relatório de VENDAS por período (/vendas/report), então o
  // verso conta o fechamento do mês — o que o relatório vai mostrar.
  private async relatorios(ator: Ator, agora: Date): Promise<PainelModulo> {
    const companyId = ator.companyId;
    const mes = inicioDoMes(agora);
    const fechados = { companyId, closedAt: { gte: mes } };

    const [convertidos, encerrados, porMotivo, donos, serie] = await Promise.all([
      this.prisma.vendasLead.count({ where: { ...fechados, closureReason: 'convertido' } }),
      this.prisma.vendasLead.count({ where: fechados }),
      this.prisma.vendasLead.groupBy({
        by: ['closureReason'],
        where: { ...fechados, closureReason: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.vendasLead.findMany({
        where: { ...fechados, assignedUserId: { not: null } },
        select: { assignedUserId: true },
        distinct: ['assignedUserId'],
        take: 200,
      }),
      this.serie7(agora, -6, (janela) =>
        this.prisma.vendasLead.count({ where: { companyId, closureReason: 'convertido', closedAt: janela } }),
      ),
    ]);

    const perdidos = Math.max(0, encerrados - convertidos);
    const taxa = pct(convertidos, encerrados);
    // Motivo de perda é FATIA (um lead encerra por um motivo só) e o
    // "convertido" já é o hero — aqui interessa por que os OUTROS caíram.
    const perdaPorMotivo = porMotivo
      .filter((linha) => linha.closureReason && linha.closureReason !== 'convertido')
      .map((linha) => ({ rotulo: String(linha.closureReason), valor: Number(linha._count?._all || 0) }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 4);

    return {
      modulo: 'relat',
      titulo: 'Relatórios',
      legenda: 'fechamento do mês',
      tom: convertidos > 0 ? 'ok' : encerrados > 0 ? 'atencao' : 'neutro',
      hero: {
        valor: num(convertidos),
        rotulo: convertidos === 1 ? 'venda no mês' : 'vendas no mês',
        nota: encerrados > 0 ? `${taxa}% do que encerrou` : 'nada encerrado ainda',
      },
      serie,
      serieRotulo: 'vendas na semana',
      metricas: [
        { rotulo: 'Perdidos', valor: num(perdidos), tom: perdidos > 0 ? 'atencao' : 'neutro' },
        { rotulo: 'Vendedores', valor: num(donos.length), tom: donos.length > 0 ? 'ok' : 'neutro' },
      ],
      barras: barras(perdaPorMotivo.map((linha) => ({ ...linha, tom: 'atencao' as PainelTom }))),
      fatos: [{ rotulo: 'Encerrados no mês', valor: num(encerrados) }],
      rodape: null,
    };
  }

  // ── FISCAL ────────────────────────────────────────────────────────────────
  private async fiscal(ator: Ator, agora: Date): Promise<PainelModulo> {
    const companyId = ator.companyId;
    const competencia = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;

    const [porStatus, valorMes, ultima, perfil, serie] = await Promise.all([
      this.prisma.fiscalDocumento.groupBy({
        by: ['status'],
        where: { companyId, competencia },
        _count: { _all: true },
      }),
      this.prisma.fiscalDocumento.aggregate({
        where: { companyId, competencia, status: 'AUTORIZADA' },
        _sum: { valorCents: true },
      }),
      this.prisma.fiscalDocumento.findFirst({
        where: { companyId, status: 'AUTORIZADA' },
        orderBy: { emitidaEm: 'desc' },
        select: { emitidaEm: true },
      }),
      this.prisma.fiscalTenantProfile.findUnique({
        where: { companyId },
        select: { ambiente: true, disjuntorPausado: true, certA1ExpiresAt: true },
      }),
      this.serie7(agora, -6, (janela) =>
        this.prisma.fiscalDocumento.count({ where: { companyId, createdAt: janela } }),
      ),
    ]);

    const conta = (status: string) =>
      Number(porStatus.find((linha) => linha.status === status)?._count?._all || 0);
    const autorizadas = conta('AUTORIZADA');
    const pendentes = conta('PENDENTE');
    const rejeitadas = conta('REJEITADA') + conta('ERRO');
    const canceladas = conta('CANCELADA');
    const faturado = Number(valorMes._sum.valorCents || 0) / 100;

    // O disjuntor pausado é o pior estado possível aqui: a empresa acha que
    // está emitindo e não está. Ele manda na cor, acima de qualquer contagem.
    const pausado = Boolean(perfil?.disjuntorPausado);
    const tom: PainelTom = pausado || rejeitadas > 0 ? 'risco' : autorizadas > 0 ? 'ok' : 'neutro';

    const fatos: PainelFato[] = [
      { rotulo: 'Última emissão', valor: desde(ultima?.emitidaEm, agora) },
    ];
    if (pausado) fatos.push({ rotulo: 'Emissão', valor: 'pausada pelo disjuntor', tom: 'risco' });
    if (perfil?.ambiente === 'restrita') fatos.push({ rotulo: 'Ambiente', valor: 'teste (restrita)', tom: 'atencao' });
    // Certificado vencido não avisa sozinho — a nota simplesmente para de sair.
    if (perfil?.certA1ExpiresAt) {
      const diasCert = Math.floor((perfil.certA1ExpiresAt.getTime() - agora.getTime()) / 86_400_000);
      if (diasCert <= 30) {
        fatos.push({
          rotulo: 'Certificado',
          valor: diasCert < 0 ? 'vencido' : `vence em ${diasCert} d`,
          tom: diasCert < 0 ? 'risco' : 'atencao',
        });
      }
    }

    return {
      modulo: 'fiscal',
      titulo: 'Fiscal',
      legenda: 'notas da competência',
      tom,
      hero: ator.podeVerDinheiro
        ? {
            valor: dinheiro(faturado),
            rotulo: 'emitido no mês',
            nota: `${num(autorizadas)} nota(s) autorizada(s)`,
          }
        : {
            valor: num(autorizadas),
            rotulo: autorizadas === 1 ? 'nota autorizada' : 'notas autorizadas',
            nota: 'valores só para o responsável',
          },
      serie,
      serieRotulo: 'notas na semana',
      metricas: [
        { rotulo: 'Aguardando', valor: num(pendentes), tom: pendentes > 0 ? 'atencao' : 'neutro' },
        { rotulo: 'Rejeitadas', valor: num(rejeitadas), tom: rejeitadas > 0 ? 'risco' : 'neutro' },
      ],
      barras: barras([
        { rotulo: 'Autorizada', valor: autorizadas, tom: 'ok' },
        { rotulo: 'Aguardando', valor: pendentes, tom: 'atencao' },
        { rotulo: 'Rejeitada', valor: rejeitadas, tom: 'risco' },
        { rotulo: 'Cancelada', valor: canceladas },
      ]),
      fatos,
      rodape: null,
    };
  }

  // ── WEBSITE ───────────────────────────────────────────────────────────────
  // Aqui NÃO existe visita/clique para contar (o site é hospedado fora e não
  // manda métrica pra cá). Então este painel conta ESTADO, e só. Inventar
  // "visitas" seria número bonito e falso — o painel perderia a confiança dos
  // outros dezesseis.
  private async website(ator: Ator, agora: Date): Promise<PainelModulo> {
    const companyId = ator.companyId;

    const [cfg, tokensVivos] = await Promise.all([
      this.prisma.companyWebsiteConfig.findUnique({
        where: { companyId },
        select: {
          websiteEnabled: true,
          websitePublicUrl: true,
          websiteAdminEnabled: true,
          websiteLaunchMode: true,
          updatedAt: true,
        },
      }),
      this.prisma.websiteAdminEntryToken.count({ where: { companyId, expiresAt: { gte: agora } } }),
    ]);

    const noAr = Boolean(cfg?.websiteEnabled && cfg?.websitePublicUrl);
    const endereco = String(cfg?.websitePublicUrl || '')
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, '');

    return {
      modulo: 'website',
      titulo: 'Website',
      legenda: noAr ? 'no ar' : 'ainda não publicado',
      tom: noAr ? 'ok' : cfg ? 'atencao' : 'neutro',
      hero: {
        valor: noAr ? 'No ar' : 'Fora do ar',
        rotulo: noAr ? 'site publicado' : 'site desligado',
        nota: endereco ? endereco.slice(0, 30) : 'sem endereço público',
      },
      serie: [],
      serieRotulo: null,
      metricas: [
        {
          rotulo: 'Painel do cliente',
          valor: cfg?.websiteAdminEnabled ? 'Ligado' : 'Desligado',
          tom: cfg?.websiteAdminEnabled ? 'ok' : 'neutro',
        },
        { rotulo: 'Acessos abertos', valor: num(tokensVivos), tom: tokensVivos > 0 ? 'ok' : 'neutro' },
      ],
      barras: [],
      fatos: [
        { rotulo: 'Modo', valor: cfg?.websiteLaunchMode === 'admin' ? 'painel' : 'público' },
        { rotulo: 'Última mudança', valor: desde(cfg?.updatedAt, agora) },
      ],
      rodape: null,
    };
  }

  // ── COMEX ─────────────────────────────────────────────────────────────────
  // Único painel que NÃO é do tenant: o Comex não guarda nada no banco da
  // empresa (dado analítico vem de Parquet). O que serve de relance aqui é o
  // câmbio do dia — e ele é global.
  //
  // O serviço de câmbio busca no Banco Central com timeout de 12s e cache de
  // 1h. Painel é enfeite: com o cache frio, 12s de espera na sidebar seria
  // inaceitável, então a corrida abaixo desiste em 1,2s e o painel volta sem
  // cotação (o fetch continua e aquece o cache pro próximo).
  private async comex(agora: Date): Promise<PainelModulo> {
    const cambio = await Promise.race([
      this.cambioService.cambio().catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1_200)),
    ]);

    const cotacao = (moeda: 'USD' | 'EUR') => cambio?.moedas?.find((m) => m.moeda === moeda) || null;
    const usd = cotacao('USD');
    const eur = cotacao('EUR');
    const real = (v: number | undefined) =>
      v ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}` : '—';

    return {
      modulo: 'comex',
      titulo: 'Comex',
      legenda: usd ? 'câmbio de hoje' : 'câmbio indisponível',
      tom: usd ? 'ok' : 'neutro',
      hero: {
        valor: real(usd?.venda),
        rotulo: 'dólar (venda)',
        nota: usd?.dataCotacao ? `PTAX ${usd.dataCotacao}` : 'sem cotação agora',
      },
      serie: [],
      serieRotulo: null,
      metricas: [
        { rotulo: 'Euro', valor: real(eur?.venda), tom: eur ? 'ok' : 'neutro' },
        { rotulo: 'Atualizado', valor: desde(cambio?.atualizadoEm ? new Date(cambio.atualizadoEm) : null, agora) },
      ],
      barras: [],
      fatos: [{ rotulo: 'Fonte', valor: 'Banco Central' }],
      rodape: null,
    };
  }

  // ── CONFIGURAÇÕES ─────────────────────────────────────────────────────────
  private async configuracoes(ator: Ator, agora: Date): Promise<PainelModulo> {
    const companyId = ator.companyId;

    const [ativos, inativos, porPapel, modulosLigados, convites, ultimoEntrou] = await Promise.all([
      this.prisma.user.count({ where: { companyId, isActive: true } }),
      this.prisma.user.count({ where: { companyId, isActive: false } }),
      this.prisma.user.groupBy({
        by: ['role'],
        where: { companyId, isActive: true },
        _count: { _all: true },
      }),
      this.prisma.companyModule.count({ where: { companyId, enabled: true, masterEnabled: true } }),
      this.prisma.companyUserInvite.count({ where: { companyId, status: 'pending' } }),
      this.prisma.user.findFirst({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    const papel = (nome: string) =>
      Number(porPapel.find((linha) => String(linha.role).toUpperCase() === nome)?._count?._all || 0);

    return {
      modulo: 'config',
      titulo: 'Configurações',
      legenda: 'quem entra e o que está ligado',
      tom: convites > 0 ? 'atencao' : ativos > 0 ? 'ok' : 'neutro',
      hero: {
        valor: num(ativos),
        rotulo: ativos === 1 ? 'pessoa com acesso' : 'pessoas com acesso',
        nota: `último cadastro ${desde(ultimoEntrou?.createdAt, agora)}`,
      },
      serie: [],
      serieRotulo: null,
      metricas: [
        { rotulo: 'Módulos ligados', valor: num(modulosLigados), tom: modulosLigados > 0 ? 'ok' : 'neutro' },
        { rotulo: 'Convites abertos', valor: num(convites), tom: convites > 0 ? 'atencao' : 'neutro' },
      ],
      barras: barras([
        { rotulo: 'Responsável', valor: papel('USERMASTER') + papel('ADMIN'), tom: 'ok' },
        { rotulo: 'Vendedor', valor: papel('USER') },
        { rotulo: 'Entregador', valor: papel('DRIVER') },
      ]),
      fatos: [
        { rotulo: 'Desligados', valor: num(inativos), tom: inativos > 0 ? 'atencao' : undefined },
      ],
      rodape: null,
    };
  }
}
