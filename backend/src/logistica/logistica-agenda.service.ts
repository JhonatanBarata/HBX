import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LogisticaRotaCobrancaService } from './logistica-rota-cobranca.service';
import {
  AgendaDivergenciaItemDto,
  AgendaDivergenciasDto,
  AgendaImportarPreviewDto,
  AgendaPlanoItemDto,
  AgendaSequenciaResumoDto,
  CreateAgendaPlanoDto,
  ExecutarAgendaDiaAcaoDto,
  ReordenarAgendaDiaDto,
  UpdateAgendaPlanoDto,
} from './dto/logistica-agenda.dto';
import { resolvePrincipalContatoId } from './logistica-contato.util';
import { stopLivreWhere } from './logistica-rota-viva.util';
import {
  matchSequenciaImportada,
  paradasDoModelo,
  separarParadasDuplicadas,
  SequenciaMatchPlano,
} from './logistica-agenda-sequencia.util';
import { AgendaAlertaJanela, calcularEtas } from './logistica-agenda-eta.util';
// Peças puras do vínculo. Moram num util (e não no LogisticaRecorrenciaService)
// porque agora é ELE que injeta ESTE serviço — importar de lá fecharia ciclo de DI.
import {
  carregarVinculoItemSnapshot,
  parseDateOrNull,
  resolveValorUnit,
  VinculoItemSnapshot,
} from './logistica-recorrencia.util';
// FUSO (26/07) — a Agenda usa os MESMOS helpers de dia civil de São Paulo que o
// resto do módulo; ver o bloco "FUSO" no fim deste arquivo.
import { isoWeekdayForDate, saoPauloDateKey } from './logistica-dia.util';
// F0 (27/07) — motor confiável: cursor só avança no desfecho (ver generateDay),
// guarda anti-dupla-aberta, extrato de eventos e fechamento de caixa lazy.
import { sourceDateFromOccurrenceKey } from './logistica-agenda-cursor.util';
import { registrarEventoAgenda, formatDDMM } from './logistica-agenda-evento.util';
import { encerrarDiasAnteriores } from './logistica-fechamento-caixa.util';

const DAY_NAMES = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'] as const;
// F0 (27/07) — abreviação curta do dia pro extrato (LogisticaAgendaEvento.de/paraTexto)
// e pra mensagem de erro do prepare (logistica-admin-route.service.ts). Exportada de
// propósito: mesmo array em dois lugares seria o tipo de duplicação que já causou
// incidente de fuso neste módulo.
export const DAY_ABBR = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'] as const;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const PRESERVED_ROUTE_STATUS = ['em_rota'] as const;
const FINISHED_DELIVERY_STATUS = ['entregue', 'cancelada'] as const;

// Sobrou UM modo (F1, 09/08). O campo continua no payload porque as telas leem
// `modo`/`agendaV2Ativa` — quem limpa o contrato da resposta é outra frente.
type AgendaMode = 'AGENDA_V2';
type AgendaFrequency = 'SEMANAL' | 'QUINZENAL' | 'INTERVALO';

type AgendaContext = {
  mode: AgendaMode;
  active: boolean;
  diasTrabalho: number[];
  migration: {
    necessaria: boolean;
    totalVinculos: number;
    totalPlanosProjetados: number;
    avisos: unknown[];
  };
};

type DbLike = PrismaService | any;

@Injectable()
export class LogisticaAgendaService {
  private readonly logger = new Logger(LogisticaAgendaService.name);

  constructor(
    private readonly prisma: PrismaService,
    // ROTA v2 F3b (10/08) — @Optional() por padrão de módulo: sem o serviço
    // de cobrança injetado (ex.: instanciação direta em teste), o portão de
    // assentos simplesmente não roda — materializar continua exatamente como
    // sempre foi, sem quebrar nenhum teste existente.
    @Optional() private readonly cobranca?: LogisticaRotaCobrancaService,
  ) {}

  async getSummary(companyId: number) {
    this.assertCompany(companyId);
    const context = await this.getContext(companyId);

    const [plans, routes] = await Promise.all([
      this.prisma.logisticaPlanoEntrega.findMany({
        // Cliente morto não conta no chip do dia (ver CLIENTE_VIVO).
        where: { companyId, customerProfile: CLIENTE_VIVO },
        select: {
          id: true,
          customerProfileId: true,
          diaSemana: true,
          ativo: true,
          // FIX 25/07 — a cadência ENTRA no resumo. Sem estes três campos o
          // contador do dia era um número de catálogo, e a prévia (que aplica
          // `planOccursOn` na data real) mostrava outra coisa.
          proximaData: true,
          frequencia: true,
          intervaloDias: true,
          itens: { select: { id: true } },
        },
      }),
      this.prisma.logisticaRotaModelo.findMany({
        where: { companyId, tipo: 'SEMANAL' },
        select: {
          id: true,
          nome: true,
          diaSemana: true,
          tipo: true,
          ativo: true,
          versao: true,
          _count: { select: { paradas: true } },
        },
      }),
    ]);

    const hoje = startOfDay(new Date());

    return {
      modo: context.mode,
      agendaV2Ativa: true,
      migracao: context.migration,
      dias: DAY_NAMES.map((nome, index) => {
        const day = index + 1;
        const dayPlans = plans.filter((plan) => plan.diaSemana === day);
        const route = routes.find((item) => item.diaSemana === day) ?? null;
        // FIX 25/07 (o dia que dizia 98 e listava 0): o contador do chip tem que
        // contar EXATAMENTE o que a prévia daquele dia vai mostrar. A prévia roda
        // em `dateForIsoDay(dia)` — hoje, se o dia é hoje; senão a próxima
        // ocorrência do dia da semana — e filtra por `planOccursOn`. Antes daqui
        // saía `route._count.paradas` (paradas do MODELO de rota, sem data
        // nenhuma), então plano pausado, quinzenal em semana de folga ou dia já
        // gerado/limpo continuavam contando. `totalPlanos` guarda o número cru.
        const dataReferencia = nextDateForWeekday(day, hoje);
        const ocorrem = dayPlans.filter((plan) => planOccursOn(plan, dataReferencia));
        // FIX 27/07 (dono: "tem certeza que terça não tinha pessoas?") — `totalParadas`
        // responde "quantas visitas caem NA PRÓXIMA data deste dia", e isso ZERA sozinho
        // assim que o dia é gerado (a `proximaData` do plano pula pra semana seguinte) ou
        // quando a cadência é quinzenal/de N em N. Na tela isso lia como "terça não tem
        // ninguém" — mentira: os clientes de terça continuam lá (medido em prod 27/07,
        // empresa 48: terça 7 planos ativos, sexta 13, ambos com chip 0). `totalClientesDia`
        // é a LISTA DE GENTE do dia, sem filtro de ciclo — é ela que diz se o dia existe.
        const ativosDoDia = dayPlans.filter((plan) => plan.ativo !== false);
        return {
          diaSemana: day,
          nome,
          ativo: route ? route.ativo : dayPlans.some((plan) => plan.ativo),
          rota: route ? routeDto(route) : null,
          totalPlanos: dayPlans.length,
          totalParadas: ocorrem.length,
          totalClientes: new Set(ocorrem.map((plan) => plan.customerProfileId)).size,
          totalClientesDia: new Set(ativosDoDia.map((plan) => plan.customerProfileId)).size,
          avisos: dayPlans.length && !route
            ? [{ codigo: 'SEM_ROTA', mensagem: 'Defina a sequência deste dia.' }]
            : [],
        };
      }),
    };
  }

  async getDay(companyId: number, dayInput: unknown) {
    this.assertCompany(companyId);
    const day = normalizeWeekday(dayInput);
    const context = await this.getContext(companyId);

    const [plans, route] = await Promise.all([
      this.prisma.logisticaPlanoEntrega.findMany({
        // Cliente morto não aparece na tela do dia (ver CLIENTE_VIVO).
        where: { companyId, diaSemana: day, customerProfile: CLIENTE_VIVO },
        include: planInclude(),
        orderBy: [{ ativo: 'desc' }, { createdAt: 'asc' }],
      }),
      this.prisma.logisticaRotaModelo.findFirst({
        where: { companyId, tipo: 'SEMANAL', diaSemana: day },
        include: { paradas: { orderBy: { ordem: 'asc' } } },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    const planDtos = plans.map((plan) => planDto(plan));
    const planById = new Map(planDtos.map((plan) => [plan.id, plan]));
    const ordered: any[] = [];
    const used = new Set<string>();

    for (const stop of route?.paradas ?? []) {
      if (!stop.planoEntregaId) continue;
      const plan = planById.get(stop.planoEntregaId);
      if (!plan || used.has(plan.id)) continue;
      ordered.push(stopDto(stop, plan));
      used.add(plan.id);
    }
    for (const plan of planDtos) {
      if (used.has(plan.id)) continue;
      ordered.push(stopDtoFromPlan(plan, ordered.length + 1));
    }

    return {
      modo: context.mode,
      agendaV2Ativa: true,
      migracao: context.migration,
      diaSemana: day,
      nome: DAY_NAMES[day - 1],
      ativo: route ? route.ativo : plans.some((plan) => plan.ativo),
      rota: route ? routeDto(route) : null,
      planos: planDtos,
      paradas: attachEtaInfo(ordered),
      totais: {
        planos: planDtos.length,
        paradas: ordered.length,
        clientes: new Set(planDtos.map((plan) => plan.customerProfileId)).size,
        itens: planDtos.reduce((total, plan) => total + plan.itens.length, 0),
      },
      avisos: plans.length && !route
        ? [{ codigo: 'SEM_ROTA', mensagem: 'Defina a sequência deste dia.' }]
        : [],
    };
  }

  async getCatalogs(companyId: number) {
    this.assertCompany(companyId);
    const [customers, products] = await Promise.all([
      this.prisma.customerProfile.findMany({
        where: { companyId, isCliente: true, status: 'active' },
        select: {
          id: true,
          name: true,
          locais: {
            where: { ativo: true },
            orderBy: [{ isPrincipal: 'desc' }, { apelido: 'asc' }],
            select: localSelect(),
          },
        },
        orderBy: [{ name: 'asc' }],
      }),
      this.prisma.product.findMany({
        where: { companyId, status: 'active' },
        select: {
          id: true,
          name: true,
          unidade: true,
          price: true,
          priceCents: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
    ]);

    return {
      clientes: customers.map((customer) => ({
        id: customer.id,
        nome: customer.name || 'Cliente',
        locais: customer.locais.map((local) => ({
          ...addressDto(local),
          acesso: accessDto(local),
        })),
      })),
      produtos: products.map((product) => ({
        id: product.id,
        nome: product.name,
        unidade: product.unidade ?? null,
        preco: product.priceCents != null && Number.isFinite(Number(product.priceCents))
          ? Number(product.priceCents) / 100
          : Number(product.price || 0),
      })),
    };
  }

  async getDayPreview(companyId: number, dayInput: unknown, dateInput?: string) {
    this.assertCompany(companyId);
    const day = normalizeWeekday(dayInput);
    const date = parseOperationalDate(dateInput);
    if (isoWeekday(date) !== day) {
      throw new BadRequestException('A data não pertence ao dia da agenda informado.');
    }
    const detail = await this.getDay(companyId, day);
    const plansById = new Map<string, any>(
      detail.planos.map((plan: any) => [plan.id, plan] as [string, any]),
    );
    const stops = detail.paradas
      .map((stop: any) => {
        const plan = plansById.get(stop.planoEntregaId) as any;
        const occurs = plan ? planOccursOn(plan, date) : false;
        return {
          ...stop,
          ocorreNaData: occurs,
          avisos: occurs ? [] : [{ codigo: 'FORA_DA_FREQUENCIA', mensagem: 'Não ocorre nesta data.' }],
        };
      })
      .filter((stop: any) => stop.ocorreNaData);
    const totalValue = stops.reduce((total: number, stop: any) => total + stopValue(stop), 0);

    return {
      date: dateKey(date),
      diaSemana: day,
      rota: detail.rota,
      paradas: stops,
      totais: {
        paradas: stops.length,
        itens: stops.reduce((total: number, stop: any) => total + stop.itens.length, 0),
        valor: totalValue,
        comRestricaoHorario: stops.filter((stop: any) => stop.janela?.inicio || stop.janela?.fim).length,
        comEscada: stops.filter((stop: any) => stop.acesso?.tipo === 'ESCADA').length,
      },
      avisos: detail.avisos,
    };
  }

  /** S2 — rotas salvas candidatas a importar (qualquer rota da empresa, com ou sem dia fixo). */
  async listImportSequences(companyId: number, dayInput: unknown): Promise<AgendaSequenciaResumoDto[]> {
    this.assertCompany(companyId);
    normalizeWeekday(dayInput); // valida o parâmetro da rota; a listagem não filtra por dia.
    const rotas = await this.prisma.logisticaRotaModelo.findMany({
      where: { companyId },
      select: { id: true, nome: true, diaSemana: true, updatedAt: true, _count: { select: { paradas: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    return rotas.map((rota) => ({
      id: rota.id,
      nome: rota.nome,
      diaSemana: rota.diaSemana ?? null,
      totalParadas: rota._count.paradas,
      updatedAt: rota.updatedAt.toISOString(),
    }));
  }

  /**
   * S2 — preview do matching, read-only puro (nada é escrito). A lista de
   * planos usada no casamento vem das MESMAS linhas que `reorderDay` valida
   * como "current" (`LogisticaRotaModeloParada` com `planoEntregaId`), nunca
   * de `logisticaPlanoEntrega` direto — é o que garante que
   * `ordem + foraDaSequencia + ambiguos` bate exatamente com o que o
   * `PATCH dias/:dia/ordem` aceita, sem exceção.
   */
  async getImportPreview(
    companyId: number,
    dayInput: unknown,
    modeloIdInput: unknown,
  ): Promise<AgendaImportarPreviewDto> {
    this.assertCompany(companyId);
    const day = normalizeWeekday(dayInput);
    const modeloId = cleanId(modeloIdInput);

    const modelo = await this.prisma.logisticaRotaModelo.findFirst({
      where: { id: modeloId, companyId },
      select: { paradas: PARADAS_DO_MODELO },
    });
    if (!modelo) throw new NotFoundException('Rota salva não encontrada.');

    const route = await this.prisma.logisticaRotaModelo.findFirst({
      where: { companyId, tipo: 'SEMANAL', diaSemana: day },
      orderBy: { updatedAt: 'desc' },
      select: {
        paradas: {
          where: { planoEntregaId: { not: null } },
          orderBy: { ordem: 'asc' },
          select: { planoEntregaId: true, localId: true, customerProfileId: true },
        },
      },
    });
    const planosAtuais: SequenciaMatchPlano[] = (route?.paradas ?? []).map((stop) => ({
      id: String(stop.planoEntregaId),
      customerProfileId: stop.customerProfileId,
      localId: stop.localId ?? null,
    }));

    const paradasModelo = paradasDoModelo(modelo.paradas);
    const resultado = matchSequenciaImportada(planosAtuais, paradasModelo);

    // Nomes/endereços são só pra exibir — a ordem em si já está fechada acima.
    const dayDetail = await this.getDay(companyId, day);
    const planById = new Map<string, any>(
      dayDetail.planos.map((plan: any) => [plan.id, plan] as [string, any]),
    );

    const semPlanoCustomerIds = [...new Set(resultado.semPlano.map((item) => item.customerProfileId))];
    const semPlanoCustomers = semPlanoCustomerIds.length
      ? await this.prisma.customerProfile.findMany({
        where: { id: { in: semPlanoCustomerIds }, companyId },
        select: { id: true, name: true, endereco: true, numero: true },
      })
      : [];
    const semPlanoCustomerById = new Map(semPlanoCustomers.map((customer) => [customer.id, customer]));

    return {
      ordem: resultado.ordem.map((item) => ({
        planoId: item.planoId,
        clienteNome: planById.get(item.planoId)?.cliente?.nome || 'Cliente',
        posicao: item.posicao,
      })),
      foraDaSequencia: resultado.foraDaSequencia.map((planoId) => ({
        planoId,
        clienteNome: planById.get(planoId)?.cliente?.nome || 'Cliente',
      })),
      semPlano: resultado.semPlano.map((item) => {
        const customer = semPlanoCustomerById.get(item.customerProfileId);
        return {
          clienteNome: customer?.name || 'Cliente',
          endereco: formatEnderecoResumo(customer),
        };
      }),
      ambiguos: resultado.ambiguos.map((item) => ({
        planoId: item.planoId,
        clienteNome: planById.get(item.planoId)?.cliente?.nome || 'Cliente',
        motivo: item.motivo,
      })),
      aplicavel: resultado.ordem.length > 0,
    };
  }

  /**
   * S3 — conferência de divergência entre os planos ativos do dia e a rota
   * salva "espelho" do mesmo dia (`LogisticaRotaModelo` SEMANAL — a MESMA
   * `LogisticaRotaModeloParada` que `getDay` usa para montar a sequência
   * oficial, mas ali paradas sem `planoEntregaId` são silenciosamente
   * ignoradas; aqui é justamente essas sobras que viram aviso). READ-ONLY
   * absoluto: nenhuma escrita, nenhuma correção — só relata usando o MESMO
   * matcher da S2, pra não existir um segundo cálculo que possa divergir do
   * preview de import.
   */
  async getDivergencias(companyId: number, dayInput: unknown): Promise<AgendaDivergenciasDto> {
    this.assertCompany(companyId);
    const day = normalizeWeekday(dayInput);
    const diaNome = DAY_NAMES[day - 1];

    const route = await this.prisma.logisticaRotaModelo.findFirst({
      where: { companyId, tipo: 'SEMANAL', diaSemana: day },
      orderBy: { updatedAt: 'desc' },
      select: { paradas: PARADAS_DO_MODELO },
    });
    if (!route) {
      return { total: 0, itens: [], semRotaSalva: true };
    }

    // Só planos ATIVOS entram na conferência — plano pausado não precisa
    // estar na rota salva, então não é divergência ele "faltar" lá.
    const plans = await this.prisma.logisticaPlanoEntrega.findMany({
      // Cliente morto não é divergência de sequência — ele nem devia estar aqui
      // (ver CLIENTE_VIVO); sem isto a conferência pediria pra "encaixar na rota"
      // um nome que não existe no cadastro.
      where: { companyId, diaSemana: day, ativo: true, customerProfile: CLIENTE_VIVO },
      select: { id: true, customerProfileId: true, localId: true, customerProfile: { select: { name: true, endereco: true, numero: true } } },
    });
    const planosAtuais: SequenciaMatchPlano[] = plans.map((plan) => ({
      id: plan.id,
      customerProfileId: plan.customerProfileId,
      localId: plan.localId ?? null,
    }));
    const planById = new Map(plans.map((plan) => [plan.id, plan]));

    const paradasModeloBruto = paradasDoModelo(route.paradas);
    const { unicas: paradasModelo, duplicadas } = separarParadasDuplicadas(paradasModeloBruto);
    const resultado = matchSequenciaImportada(planosAtuais, paradasModelo);

    const customerIds = [...new Set([
      ...resultado.semPlano.map((item) => item.customerProfileId),
      ...duplicadas.map((item) => item.customerProfileId),
    ])];
    const customers = customerIds.length
      ? await this.prisma.customerProfile.findMany({
        where: { id: { in: customerIds }, companyId },
        select: { id: true, name: true, endereco: true, numero: true },
      })
      : [];
    const customerById = new Map(customers.map((customer) => [customer.id, customer]));

    const itens: AgendaDivergenciaItemDto[] = [];

    for (const planoId of resultado.foraDaSequencia) {
      const plan = planById.get(planoId);
      itens.push({
        tipo: 'SO_NO_PLANO',
        clienteNome: plan?.customerProfile?.name || 'Cliente',
        endereco: formatEnderecoResumo(plan?.customerProfile),
        planoId,
        detalhe: `Tem visita marcada para ${diaNome} mas não está na rota salva.`,
      });
    }
    for (const ambiguo of resultado.ambiguos) {
      const plan = planById.get(ambiguo.planoId);
      itens.push({
        tipo: 'SO_NO_PLANO',
        clienteNome: plan?.customerProfile?.name || 'Cliente',
        endereco: formatEnderecoResumo(plan?.customerProfile),
        planoId: ambiguo.planoId,
        detalhe: ambiguo.motivo,
      });
    }
    for (const item of resultado.semPlano) {
      const customer = customerById.get(item.customerProfileId);
      itens.push({
        tipo: 'SO_NA_ROTA',
        clienteNome: customer?.name || 'Cliente',
        endereco: formatEnderecoResumo(customer),
        detalhe: `Está na rota salva de ${diaNome} mas não tem visita marcada.`,
      });
    }
    for (const dup of duplicadas) {
      const customer = customerById.get(dup.customerProfileId);
      itens.push({
        tipo: 'DUPLICADO',
        clienteNome: customer?.name || 'Cliente',
        endereco: formatEnderecoResumo(customer),
        detalhe: `Aparece mais de uma vez na rota salva de ${diaNome}.`,
      });
    }

    return { total: itens.length, itens };
  }

  /**
   * 🔴 NÃO EXISTE MAIS "MODO LEGADO" (F1, 09/08). A Agenda V2 é O sistema, não
   * uma opção: a flag `LogisticaConfig.agendaV2Ativa` estava `true` nas 9
   * empresas medidas em produção e nasce `true` por default desde 26/07 — o
   * `if` que escolhia entre ela e o motor de `ClienteProduto` só mantinha vivo
   * um ramo que ninguém percorria. Sobrou o que a tela realmente precisa: os
   * dias de trabalho da empresa.
   */
  private async getContext(companyId: number): Promise<AgendaContext> {
    const config = await this.prisma.logisticaConfig.findUnique({
      where: { companyId },
      select: { diasTrabalho: true },
    });
    return {
      mode: 'AGENDA_V2',
      active: true,
      diasTrabalho: parseWeekdays(config?.diasTrabalho),
      migration: {
        necessaria: false,
        totalVinculos: 0,
        totalPlanosProjetados: 0,
        avisos: [],
      },
    };
  }

  async createPlan(companyId: number, input: CreateAgendaPlanoDto) {
    this.assertCompany(companyId);
    // O PRIMEIRO plano da empresa inaugura a agenda: garante a linha de
    // `LogisticaConfig` (várias rotinas contam com ela existindo).
    //
    // 🔴 MORREU AQUI o porteiro "organize os cadastros atuais antes" (F2,
    // 09/08). Ele contava vínculos com `diasSemana`/`proximaData` — a agenda V1
    // dentro do `ClienteProduto`. Não existe mais cadastro que grave dia no
    // vínculo: quem escreve dia é `definirDiasDaVisita`, e ele escreve PLANO.
    // Sem uma segunda agenda pra atropelar, o porteiro só sabia barrar.
    const inaugurando = !(await this.agendaJaOrganizada(this.prisma, companyId));
    const normalized = await this.normalizePlanInput(companyId, input);

    const created = await this.prisma.$transaction(async (tx) => {
      if (inaugurando) {
        await tx.logisticaConfig.upsert({
          where: { companyId },
          update: {},
          create: { companyId },
        });
      }
      const plan = await tx.logisticaPlanoEntrega.create({
        data: {
          companyId,
          customerProfileId: normalized.customerProfileId,
          localId: normalized.localId,
          diaSemana: normalized.diaSemana,
          frequencia: normalized.frequencia,
          intervaloDias: normalized.intervaloDias,
          proximaData: normalized.proximaData,
          ativo: normalized.ativo,
          revisao: 1,
          origem: 'MANUAL',
          ...normalized.schedule,
          itens: {
            // `companyId` NÃO entra em create ANINHADO: o campo participa das relações
            // compostas (plano/produto/company), então o Prisma o herda do pai — passá-lo
            // aqui derruba com "Unknown argument `companyId`" só em RUNTIME (o `tx: any`
            // some com o typecheck). Provado em 25/07 contra o banco de prod.
            create: normalized.items.map((item) => ({
              productId: item.productId,
              qtd: item.qtd,
              valorUnit: item.valorUnit,
            })),
          },
        },
      });
      if (normalized.localId && normalized.accessProvided) {
        await tx.localEntrega.updateMany({
          where: {
            id: normalized.localId,
            companyId,
            customerProfileId: normalized.customerProfileId,
          },
          data: normalized.localAccess,
        });
      }
      const route = await this.ensureDayRoute(tx, companyId, normalized.diaSemana);
      const order = await nextRouteOrder(tx, route.id);
      await this.createRouteStop(tx, companyId, route.id, order, plan.id, normalized);
      await this.bumpRouteVersao(tx, companyId, route.id);
      return plan.id;
    });

    return this.getPlanOrThrow(companyId, created);
  }

  async updatePlan(companyId: number, id: string, input: UpdateAgendaPlanoDto) {
    this.assertCompany(companyId);
    const existing = await this.prisma.logisticaPlanoEntrega.findFirst({
      where: { id: cleanId(id), companyId },
      include: planInclude(),
    });
    if (!existing) throw new NotFoundException('Plano de entrega não encontrado.');
    const normalized = await this.normalizePlanInput(companyId, input, existing);

    await this.prisma.$transaction(async (tx) => {
      const oldStop = await tx.logisticaRotaModeloParada.findFirst({
        where: { companyId, planoEntregaId: existing.id },
        select: { id: true, rotaModeloId: true, ordem: true },
      });

      await tx.logisticaPlanoEntrega.update({
        where: { id: existing.id },
        data: {
          localId: normalized.localId,
          diaSemana: normalized.diaSemana,
          frequencia: normalized.frequencia,
          intervaloDias: normalized.intervaloDias,
          proximaData: normalized.proximaData,
          ativo: normalized.ativo,
          revisao: { increment: 1 },
          ...normalized.schedule,
          ...(input.itens
            ? {
              itens: {
                deleteMany: {},
                // Sem `companyId` — herdado do pai no create aninhado (ver createPlan).
                create: normalized.items.map((item) => ({
                  productId: item.productId,
                  qtd: item.qtd,
                  valorUnit: item.valorUnit,
                })),
              },
            }
            : {}),
        },
      });

      if (normalized.localId && normalized.accessProvided) {
        await tx.localEntrega.updateMany({
          where: {
            id: normalized.localId,
            companyId,
            customerProfileId: normalized.customerProfileId,
          },
          data: normalized.localAccess,
        });
      }

      if (oldStop) {
        await tx.logisticaRotaModeloParada.delete({ where: { id: oldStop.id } });
        await compactRouteOrders(tx, oldStop.rotaModeloId);
        await this.bumpRouteVersao(tx, companyId, oldStop.rotaModeloId);
      }

      const targetRoute = await this.ensureDayRoute(tx, companyId, normalized.diaSemana);
      const targetOrder = oldStop && existing.diaSemana === normalized.diaSemana
        ? Math.min(oldStop.ordem, await nextRouteOrder(tx, targetRoute.id))
        : await nextRouteOrder(tx, targetRoute.id);
      await makeOrderSlot(tx, targetRoute.id, targetOrder);
      await this.createRouteStop(tx, companyId, targetRoute.id, targetOrder, existing.id, normalized);
      await compactRouteOrders(tx, targetRoute.id);
      await this.bumpRouteVersao(tx, companyId, targetRoute.id);
    });

    // F0 (27/07) — extrato: dia da semana trocado é a mudança que mais gera
    // dúvida do cliente ("por que hoje não veio?"). PÓS-commit, prisma raiz
    // (contrato do evento.util — INSERT dentro da tx pode abortá-la inteira).
    if (existing.diaSemana !== normalized.diaSemana) {
      await registrarEventoAgenda(this.prisma, {
        companyId,
        customerProfileId: normalized.customerProfileId,
        planoEntregaId: existing.id,
        tipo: 'DIA_ALTERADO',
        deTexto: DAY_ABBR[existing.diaSemana - 1] ?? null,
        paraTexto: DAY_ABBR[normalized.diaSemana - 1] ?? null,
        origem: 'manual',
        actorUserId: null,
      });
    }

    return this.getPlanOrThrow(companyId, existing.id);
  }

  /**
   * 🔴 A PORTA ÚNICA DE ESCRITA DE DIA DA SEMANA (F2, 09/08).
   *
   * O dia da visita é do CLIENTE e mora em `LogisticaPlanoEntrega` — ponto. Até
   * a F2 o cadastro gravava o dia em `ClienteProduto.diasSemana` e um ESPELHO
   * copiava aquilo pros planos depois; eram duas agendas pra mesma pergunta, e
   * toda vez que o espelho falhava calado o cliente sumia da rota com o dia
   * gravado na tela. A mão foi invertida: agora o cadastro escreve o PLANO
   * direto e o vínculo voltou a ser só o que ele sempre deveria ter sido —
   * preço e quantidade combinados.
   *
   * Contrato:
   *  - dia PEDIDO que não tem plano → cria (`createPlan`, com parada no fim da
   *    rota daquele dia, igual a Agenda faz pela tela);
   *  - dia PEDIDO com plano pausado → reativa e re-sincroniza os itens;
   *  - dia que SAIU → PAUSA o plano (`ativo=false`), nunca apaga: histórico,
   *    entregas já geradas e a ordem salva da rota continuam de pé;
   *  - `dias: []` → cliente sem dia fixo (todos os planos pausados).
   *
   * Os ITENS da visita vêm dos vínculos ATIVOS do cliente, agrupados por local
   * (multilocal: cada local do cliente ganha o plano do dia com os itens dele).
   * Cliente sem vínculo nenhum NÃO ganha plano — visita sem item não existe
   * (`normalizeItems` exige 1..50), e inventar uma seria pior que não ter dia.
   *
   * NUNCA lança: o que não deu vira aviso (mesma lei do antigo espelho — o
   * cadastro já foi salvo, derrubar a resposta deixaria o APK em erro com dado
   * gravado). Aviso SEMPRE vira linha de log.
   */
  async definirDiasDaVisita(
    companyId: number,
    customerProfileId: string,
    dias: number[],
  ): Promise<{ avisos: string[]; diasSemana: string | null }> {
    const avisos: string[] = [];
    const alvo = normalizeVisitDays(dias);
    const clienteId = cleanId(customerProfileId);
    try {
      this.assertCompany(companyId);
      if (!clienteId) throw new BadRequestException('Cliente é obrigatório.');

      const itensPorLocal = await this.itensDoCadastroPorLocal(companyId, clienteId);
      const planos = await this.prisma.logisticaPlanoEntrega.findMany({
        where: { companyId, customerProfileId: clienteId },
        select: {
          id: true,
          localId: true,
          diaSemana: true,
          ativo: true,
          itens: { select: { productId: true, qtd: true, valorUnit: true } },
        },
        orderBy: { createdAt: 'asc' },
      });

      // 1) Dias que SAÍRAM: pausa. Vale pra QUALQUER plano do cliente, inclusive
      //    de local que não tem mais vínculo — "sem dia" é resposta do cliente
      //    inteiro, não de um local só.
      for (const plano of planos) {
        if (alvo.includes(plano.diaSemana) || !plano.ativo) continue;
        try {
          await this.updatePlan(companyId, plano.id, { ativo: false });
        } catch (error: any) {
          avisos.push(`${diaNomeAgenda(plano.diaSemana)}: ${String(error?.message || error)}`);
        }
      }

      // 2) Dias PEDIDOS: um plano por (local, dia), com os itens do cadastro.
      for (const [localId, itens] of itensPorLocal) {
        if (!itens.length) continue;
        for (const dia of alvo) {
          const existente = planos.find((p) => (p.localId ?? null) === localId && p.diaSemana === dia);
          try {
            if (existente) {
              // 🔴 REAPROVEITAR NÃO PODE APAGAR: `updatePlan({itens})` REESCREVE a
              // lista inteira. Item que o dono acrescentou pela tela da Agenda e
              // não tem vínculo (troca pontual, brinde, item de outro catálogo)
              // sumiria calado só por alguém remarcar o dia. Mescla: o cadastro
              // manda no que é dele, o resto fica.
              await this.updatePlan(companyId, existente.id, {
                ativo: true,
                itens: mesclarItensDaVisita(existente.itens, itens),
              });
            } else {
              await this.createPlan(companyId, {
                customerProfileId: clienteId,
                localId,
                diaSemana: dia,
                frequencia: 'SEMANAL',
                itens,
              } as any);
            }
          } catch (error: any) {
            avisos.push(`${diaNomeAgenda(dia)}: ${String(error?.message || error)}`);
          }
        }
      }

      if (alvo.length && !itensPorLocal.size) {
        avisos.push('O cliente não tem nenhum produto no cadastro — sem item não existe visita.');
      }
    } catch (error: any) {
      avisos.push(String(error?.message || error));
    }
    this.reportarCadastro('dias-da-visita', companyId, clienteId, avisos);
    return { avisos, diasSemana: alvo.length ? alvo.join(',') : null };
  }

  /**
   * SINCRONIZA O ITEM DO VÍNCULO NAS VISITAS ATIVAS (F2, 09/08 — era o
   * `espelharVinculoCadastro` da ponte de 26/07).
   *
   * 🔴 O QUE MUDOU: o método NÃO lê mais cadência nenhuma do `ClienteProduto`.
   * Quem responde "que dias este cliente recebe" é o PLANO; aqui só se responde
   * "o que vai na visita". Mexer num vínculo (criar/editar/apagar produto,
   * quantidade, preço ou local) atualiza o item nas visitas ATIVAS do cliente:
   *  - vínculo apagado/desativado, ou que MUDOU DE LOCAL → o item sai das
   *    visitas do local ANTERIOR; visita que esvaziou vira PAUSADA, nunca
   *    apagada;
   *  - vínculo vivo → o item entra/atualiza nas visitas ativas do local ATUAL.
   *
   * 🔴 NÃO RESSUSCITA DIA PAUSADO: acrescentar um produto nunca pode trazer de
   * volta um dia que o dono tirou do cadastro. Cliente sem visita ativa fica só
   * com o vínculo (preço combinado) até alguém definir os dias — aí o
   * `definirDiasDaVisita` monta o plano já com este item dentro.
   *
   * Fail-closed e sem lançar: o produto duplicado na mesma visita é AMBÍGUO
   * (vira aviso, não chute), e erro vira aviso + log.
   */
  async espelharVinculoCadastro(
    companyId: number,
    vinculoId: string | null,
    anterior: VinculoItemSnapshot | null,
  ): Promise<{ avisos: string[] }> {
    const avisos: string[] = [];
    try {
      this.assertCompany(companyId);
      const atual = vinculoId
        ? await carregarVinculoItemSnapshot(this.prisma, companyId, vinculoId)
        : null;
      if (!atual && !anterior) return this.reportarCadastro('vinculo', companyId, vinculoId, avisos);

      const saiuDoLocal = Boolean(
        anterior
        && (!atual || !atual.ativo || (atual.localId ?? null) !== (anterior.localId ?? null)),
      );
      if (anterior && saiuDoLocal) {
        avisos.push(...await this.removerItemDasVisitas(
          companyId,
          anterior.customerProfileId,
          anterior.localId ?? null,
          anterior.productId,
        ));
      }
      if (atual && atual.ativo) {
        avisos.push(...await this.aplicarItemNasVisitas(companyId, atual));
      } else if (atual && !atual.ativo && !anterior) {
        // Vínculo já nasceu/ficou pausado sem passado conhecido: nada a fazer,
        // mas o item pode estar numa visita antiga — tira pra tela não mentir.
        avisos.push(...await this.removerItemDasVisitas(
          companyId,
          atual.customerProfileId,
          atual.localId ?? null,
          atual.productId,
        ));
      }
    } catch (error: any) {
      avisos.push(`Sincronizar o cadastro com a Agenda falhou (${String(error?.message || error)}).`);
    }
    return this.reportarCadastro('vinculo', companyId, vinculoId, avisos);
  }

  /**
   * Itens da visita, por local, lidos do CADASTRO (`ClienteProduto` = preço e
   * quantidade combinados). `null` na chave = vínculo sem local (perfil).
   */
  private async itensDoCadastroPorLocal(
    companyId: number,
    customerProfileId: string,
  ): Promise<Map<string | null, AgendaPlanoItemDto[]>> {
    const vinculos = await this.prisma.clienteProduto.findMany({
      where: { companyId, customerProfileId, ativo: true },
      orderBy: { createdAt: 'asc' },
      select: {
        localId: true,
        productId: true,
        qtdPadrao: true,
        precoAcordado: true,
        product: { select: { price: true, priceCents: true } },
        customerProfile: { select: { precoPadrao: true } },
      },
    });
    const out = new Map<string | null, AgendaPlanoItemDto[]>();
    for (const v of vinculos) {
      const localId = v.localId ?? null;
      const lista = out.get(localId) ?? [];
      const item = {
        productId: v.productId,
        qtd: Math.max(1, Math.trunc(Number(v.qtdPadrao) || 1)),
        valorUnit: resolveValorUnit(v as any),
      };
      // Mesmo produto vinculado 2× ao mesmo cliente/local (o schema permite, e é
      // intencional): a visita leva UMA linha por produto — a mais antiga manda.
      if (!lista.some((i) => i.productId === item.productId)) lista.push(item);
      out.set(localId, lista);
    }
    return out;
  }

  /** Visitas ATIVAS do cliente naquele local (o dia vem daqui, nunca do vínculo). */
  private async visitasAtivas(companyId: number, customerProfileId: string, localId: string | null) {
    return this.prisma.logisticaPlanoEntrega.findMany({
      where: { companyId, customerProfileId, localId, ativo: true },
      select: {
        id: true,
        diaSemana: true,
        itens: { select: { productId: true, qtd: true, valorUnit: true } },
      },
      orderBy: { diaSemana: 'asc' },
    });
  }

  private async aplicarItemNasVisitas(companyId: number, v: VinculoItemSnapshot): Promise<string[]> {
    const avisos: string[] = [];
    const visitas = await this.visitasAtivas(companyId, v.customerProfileId, v.localId ?? null);
    for (const visita of visitas) {
      const iguais = visita.itens.filter((i) => i.productId === v.productId);
      if (iguais.length > 1) {
        avisos.push(`${diaNomeAgenda(visita.diaSemana)}: AMBIGUO: o produto aparece mais de uma vez na visita — ajuste pela Agenda.`);
        continue;
      }
      const atual = iguais[0];
      if (atual && atual.qtd === v.qtdPadrao && Number(atual.valorUnit || 0) === v.valorUnit) continue;
      if (!atual && visita.itens.length >= 50) {
        avisos.push(`${diaNomeAgenda(visita.diaSemana)}: a visita já tem 50 itens — ajuste pela Agenda.`);
        continue;
      }
      const itens = atual
        ? visita.itens.map((i) => (i.productId === v.productId
          ? { productId: i.productId, qtd: v.qtdPadrao, valorUnit: v.valorUnit }
          : { productId: i.productId, qtd: i.qtd, valorUnit: Number(i.valorUnit || 0) }))
        : [
          ...visita.itens.map((i) => ({ productId: i.productId, qtd: i.qtd, valorUnit: Number(i.valorUnit || 0) })),
          { productId: v.productId, qtd: v.qtdPadrao, valorUnit: v.valorUnit },
        ];
      try {
        await this.updatePlan(companyId, visita.id, { itens });
      } catch (error: any) {
        avisos.push(`${diaNomeAgenda(visita.diaSemana)}: ${String(error?.message || error)}`);
      }
    }
    return avisos;
  }

  private async removerItemDasVisitas(
    companyId: number,
    customerProfileId: string,
    localId: string | null,
    productId: number,
  ): Promise<string[]> {
    const avisos: string[] = [];
    const visitas = await this.visitasAtivas(companyId, customerProfileId, localId);
    for (const visita of visitas) {
      const iguais = visita.itens.filter((i) => i.productId === productId);
      if (!iguais.length) continue;
      if (iguais.length > 1) {
        avisos.push(`${diaNomeAgenda(visita.diaSemana)}: AMBIGUO: o produto aparece mais de uma vez na visita — ajuste pela Agenda.`);
        continue;
      }
      const restantes = visita.itens
        .filter((i) => i.productId !== productId)
        .map((i) => ({ productId: i.productId, qtd: i.qtd, valorUnit: Number(i.valorUnit || 0) }));
      try {
        // Visita sem item nenhum não existe: PAUSA (nunca delete — a ordem da
        // rota, o histórico e as entregas já geradas continuam de pé).
        if (!restantes.length) await this.updatePlan(companyId, visita.id, { ativo: false });
        else await this.updatePlan(companyId, visita.id, { itens: restantes });
      } catch (error: any) {
        avisos.push(`${diaNomeAgenda(visita.diaSemana)}: ${String(error?.message || error)}`);
      }
    }
    return avisos;
  }

  /**
   * 🔴 28/07 — a ponte cadastro→agenda falhava CALADA. Os avisos voltavam no
   * JSON como `agendaAvisos` e ninguém logava nem mostrava, então um erro de
   * Prisma dentro da transação desfazia o plano inteiro sem deixar rastro: o
   * dono via "cliente com dia e sem plano" e não tinha por onde começar. Falha
   * de sincronismo agora SEMPRE vira linha de log — é a mesma lei do disjuntor:
   * o conserto é o freio, não o sintoma.
   */
  private reportarCadastro(escopo: string, companyId: number, alvo: string | null, avisos: string[]) {
    if (avisos.length) {
      this.logger.warn(
        `[logistica] cadastro→agenda (${escopo}) company=${companyId} alvo=${alvo ?? '-'}: ${avisos.join(' | ')}`,
      );
    }
    return { avisos };
  }

  async reorderDay(companyId: number, dayInput: unknown, input: ReordenarAgendaDiaDto) {
    this.assertCompany(companyId);
    const day = normalizeWeekday(dayInput);
    const modes = [
      input.planoIds !== undefined,
      input.posicao !== undefined,
      input.depoisDePlanoId !== undefined,
    ].filter(Boolean).length;
    if (modes !== 1 || (input.planoIds === undefined && !input.planoId)) {
      throw new BadRequestException('Escolha somente uma forma de ordenar o dia.');
    }

    await this.prisma.$transaction(async (tx) => {
      const route = await this.ensureDayRoute(tx, companyId, day);
      const rows = await tx.logisticaRotaModeloParada.findMany({
        where: { companyId, rotaModeloId: route.id, planoEntregaId: { not: null } },
        orderBy: { ordem: 'asc' },
        select: { id: true, planoEntregaId: true, ordem: true },
      });
      const current = rows.map((row) => String(row.planoEntregaId));
      let requested: string[];

      if (input.planoIds !== undefined) {
        requested = input.planoIds.map(cleanId);
        if (
          requested.length !== current.length
          || new Set(requested).size !== requested.length
          || requested.some((id) => !current.includes(id))
        ) {
          throw new BadRequestException('A ordem precisa conter todos os planos deste dia, sem repetição.');
        }
      } else {
        const planId = cleanId(input.planoId);
        const from = current.indexOf(planId);
        if (from < 0) throw new NotFoundException('Plano não encontrado neste dia.');
        requested = [...current];
        requested.splice(from, 1);
        if (input.posicao !== undefined) {
          const target = Math.max(0, Math.min(requested.length, Math.trunc(Number(input.posicao)) - 1));
          requested.splice(target, 0, planId);
        } else if (input.depoisDePlanoId !== undefined) {
          const afterId = input.depoisDePlanoId ? cleanId(input.depoisDePlanoId) : null;
          if (!afterId) requested.unshift(planId);
          else {
            const after = requested.indexOf(afterId);
            if (after < 0) throw new NotFoundException('Plano de referência não encontrado neste dia.');
            requested.splice(after + 1, 0, planId);
          }
        } else {
          throw new BadRequestException('Informe a lista, a posição ou a parada anterior.');
        }
      }

      await writeRouteOrder(tx, rows, requested);
      await this.bumpRouteVersao(tx, companyId, route.id);
    });

    return this.getDay(companyId, day);
  }

  /**
   * "ORGANIZAR AGORA" — traz os vínculos antigos (`ClienteProduto` com dia) pra
   * dentro da Agenda V2. Continua sendo a porta de entrada de empresa que nunca
   * organizou; o que mudou (F1, 09/08) é COMO se sabe que ela já organizou.
   *
   * 🔴 A CHAVE VIROU DADO. Antes o porteiro era a flag `agendaV2Ativa`; com a
   * flag apagada, a pergunta é respondida pelo que existe no banco: empresa com
   * plano de entrega JÁ ESTÁ organizada. É a mesma resposta que a flag dava nas
   * 9 empresas de produção (714 planos, flag `true`), só que lida da verdade em
   * vez de um interruptor que alguém podia esquecer ligado.
   */
  private async agendaJaOrganizada(db: DbLike, companyId: number): Promise<boolean> {
    const planos = await db.logisticaPlanoEntrega.count({ where: { companyId } });
    return planos > 0;
  }

  async getActionPreview(
    companyId: number,
    dayInput: unknown,
    actionInput: unknown,
    destinationInput?: unknown,
    startInput?: string,
  ) {
    this.assertCompany(companyId);
    const day = normalizeWeekday(dayInput);
    const action = normalizeDayAction(actionInput);
    const destination = action === 'MOVER' ? normalizeWeekday(destinationInput) : null;
    if (destination === day) throw new BadRequestException('Escolha outro dia.');
    const start = parseOperationalDate(startInput);
    const plans = await this.prisma.logisticaPlanoEntrega.findMany({
      where: { companyId, diaSemana: day },
      select: { id: true },
    });
    const planIds = plans.map((plan) => plan.id);
    const deliveries = planIds.length
      ? await this.prisma.entrega.findMany({
        where: {
          companyId,
          planoEntregaId: { in: planIds },
          scheduledAt: { gte: start },
        },
        select: {
          id: true,
          status: true,
          rotaOrdem: true,
          logisticaRouteStop: { select: { id: true } },
        },
      })
      : [];
    const routeStops = await this.prisma.logisticaRotaModeloParada.count({
      where: { companyId, planoEntregaId: { in: planIds } },
    });
    const movableOpen = deliveries.filter((delivery) =>
      delivery.status === 'agendada'
      && delivery.rotaOrdem == null
      && !delivery.logisticaRouteStop,
    );

    return {
      acao: action,
      diaOrigem: day,
      diaDestino: destination,
      dataInicio: dateKey(start),
      planosAfetados: plans.length,
      paradasAfetadas: routeStops,
      entregasAgendadasAfetadas: movableOpen.length,
      entregasEmRotaPreservadas: deliveries.filter((delivery) =>
        PRESERVED_ROUTE_STATUS.includes(delivery.status as any)
        || delivery.rotaOrdem != null
        || Boolean(delivery.logisticaRouteStop),
      ).length,
      entregasConcluidasPreservadas: deliveries.filter((delivery) =>
        FINISHED_DELIVERY_STATUS.includes(delivery.status as any),
      ).length,
      financeiroPreservado: true as const,
      avisos: [],
    };
  }

  async executeDayAction(
    companyId: number,
    userId: number,
    dayInput: unknown,
    input: ExecutarAgendaDiaAcaoDto,
  ) {
    this.assertCompany(companyId);
    const actorId = await this.resolveAuditUserId(companyId, userId);
    const day = normalizeWeekday(dayInput);
    const action = normalizeDayAction(input.acao);
    const destination = action === 'MOVER' ? normalizeWeekday(input.destinoDiaSemana) : null;
    if (destination === day) throw new BadRequestException('Escolha outro dia.');
    const start = parseOperationalDate(input.dataInicio);
    const openAction = normalizeOpenDeliveryAction(input.entregasAbertas, action);
    const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
    const canonical = {
      action,
      day,
      destination,
      start: dateKey(start),
      openAction,
    };
    const requestHash = hashPayload(canonical);
    const replay = await this.findActionReplay(companyId, idempotencyKey, requestHash);
    if (replay) return { ...(replay.resultadoJson as any), replayed: true };

    // F0 (27/07, endurecido) — eventos DIA_ALTERADO são COLETADOS dentro da tx
    // Serializable e gravados só DEPOIS do commit (contrato do evento.util:
    // INSERT falhando dentro dela abortaria a ação inteira no Postgres). Se a
    // tx reverter, nada é gravado — o array morre junto com o caminho de erro.
    const eventosDiaAlterado: Array<Parameters<typeof registrarEventoAgenda>[1]> = [];
    try {
      const acaoResultado = await this.prisma.$transaction(async (tx) => {
        const plans = await tx.logisticaPlanoEntrega.findMany({
          where: { companyId, diaSemana: day },
          include: planInclude(),
          orderBy: { createdAt: 'asc' },
        });
        const planIds = plans.map((plan) => plan.id);
        const sourceRoute = await tx.logisticaRotaModelo.findFirst({
          where: { companyId, tipo: 'SEMANAL', diaSemana: day },
          include: {
            paradas: {
              where: { planoEntregaId: { in: planIds } },
              orderBy: { ordem: 'asc' },
            },
          },
        });

        let deliveriesMoved = 0;
        let deliveriesCancelled = 0;
        const deliveries = planIds.length
          ? await tx.entrega.findMany({
            where: {
              companyId,
              planoEntregaId: { in: planIds },
              scheduledAt: { gte: start },
              status: 'agendada',
              rotaOrdem: null,
              logisticaRouteStop: null,
            },
            select: { id: true, scheduledAt: true },
          })
          : [];

        if (openAction === 'CANCELAR' && deliveries.length) {
          const result = await tx.entrega.updateMany({
            where: { id: { in: deliveries.map((delivery) => delivery.id) }, companyId, status: 'agendada' },
            data: { status: 'cancelada' },
          });
          deliveriesCancelled = result.count;
        }

        if (action === 'MOVER' && destination != null) {
          const targetRoute = await this.ensureDayRoute(tx, companyId, destination);
          if (planIds.length) {
            await tx.logisticaRotaModeloParada.deleteMany({
              where: { companyId, rotaModeloId: targetRoute.id, planoEntregaId: { in: planIds } },
            });
            await compactRouteOrders(tx, targetRoute.id);
          }
          let targetOrder = await nextRouteOrder(tx, targetRoute.id);
          for (const plan of plans) {
            const nextDate = plan.proximaData
              ? moveDateToWeekday(new Date(plan.proximaData), destination)
              : null;
            await tx.logisticaPlanoEntrega.update({
              where: { id: plan.id },
              data: {
                diaSemana: destination,
                proximaData: nextDate,
                revisao: { increment: 1 },
              },
            });
            // F0 (27/07) — extrato: mover o dia inteiro também é DIA_ALTERADO,
            // um por plano afetado. Coleta aqui, grava pós-commit (ver acima).
            eventosDiaAlterado.push({
              companyId,
              customerProfileId: plan.customerProfileId,
              planoEntregaId: plan.id,
              tipo: 'DIA_ALTERADO',
              deTexto: DAY_ABBR[day - 1] ?? null,
              paraTexto: DAY_ABBR[destination - 1] ?? null,
              origem: 'manual',
              actorUserId: actorId,
            });
            const normalized = normalizedFromPlan(plan, destination);
            await this.createRouteStop(tx, companyId, targetRoute.id, targetOrder, plan.id, normalized);
            targetOrder += 1;
          }
          if (sourceRoute) {
            await tx.logisticaRotaModeloParada.deleteMany({
              where: { companyId, rotaModeloId: sourceRoute.id, planoEntregaId: { in: planIds } },
            });
            await tx.logisticaRotaModelo.update({
              where: { id: sourceRoute.id },
              data: { ativo: false, versao: { increment: 1 } },
            });
            await compactRouteOrders(tx, sourceRoute.id);
            // A versão do dia de ORIGEM já subiu no update logo acima; o que
            // existia aqui era só a reescrita do espelho JSON, morto na F3.
          }
          await this.bumpRouteVersao(tx, companyId, targetRoute.id);

          if (openAction === 'MOVER') {
            for (const delivery of deliveries) {
              if (!delivery.scheduledAt) continue;
              const scheduledAt = moveDateToWeekday(delivery.scheduledAt, destination);
              await tx.entrega.updateMany({
                where: { id: delivery.id, companyId, status: 'agendada', rotaOrdem: null },
                data: { scheduledAt },
              });
              deliveriesMoved += 1;
            }
          }
        } else {
          await tx.logisticaPlanoEntrega.updateMany({
            where: { companyId, diaSemana: day },
            data: { ativo: false, revisao: { increment: 1 } },
          });
          if (sourceRoute) {
            await tx.logisticaRotaModelo.update({
              where: { id: sourceRoute.id },
              data: { ativo: false, versao: { increment: 1 } },
            });
          }
        }

        const actionRow = await tx.logisticaAgendaAcao.create({
          data: {
            companyId,
            idempotencyKey,
            requestHash,
            acao: action,
            diaOrigem: day,
            diaDestino: destination,
            dataInicio: start,
            entregasAbertas: openAction,
            executadoPorUserId: actorId,
            resultadoJson: {},
          },
        });
        const result = {
          acaoId: actionRow.id,
          idempotencyKey,
          replayed: false,
          acao: action,
          diaOrigem: day,
          diaDestino: destination,
          planosAfetados: plans.length,
          entregasMovidas: deliveriesMoved,
          entregasCanceladas: deliveriesCancelled,
          financeiroPreservado: true,
        };
        await tx.logisticaAgendaAcao.update({
          where: { id: actionRow.id },
          data: { resultadoJson: result as any },
        });
        return result;
      }, { isolationLevel: 'Serializable' });
      // Pós-commit: telemetria com o prisma raiz (nunca dentro da tx).
      for (const evento of eventosDiaAlterado) {
        await registrarEventoAgenda(this.prisma, evento);
      }
      return acaoResultado;
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const replayAfterRace = await this.findActionReplay(companyId, idempotencyKey, requestHash);
        if (replayAfterRace) return { ...(replayAfterRace.resultadoJson as any), replayed: true };
      }
      throw error;
    }
  }

  async generateDay(companyId: number, dateInput?: string) {
    this.assertCompany(companyId);
    const date = parseOperationalDate(dateInput);
    const day = isoWeekday(date);
    const plans = await this.prisma.logisticaPlanoEntrega.findMany({
      // A trava que importa: cliente morto NÃO vira Entrega (ver CLIENTE_VIVO).
      // Era por aqui que os 7 fantasmas de terça entravam na rota do dono.
      where: { companyId, diaSemana: day, ativo: true, customerProfile: CLIENTE_VIVO },
      include: planInclude(),
      orderBy: { createdAt: 'asc' },
    });
    const route = await this.prisma.logisticaRotaModelo.findFirst({
      where: { companyId, tipo: 'SEMANAL', diaSemana: day, ativo: true },
      select: { id: true, versao: true },
    });
    const due = plans.filter((plan) => planOccursOn(plan, date));
    const deliveryIds: string[] = [];
    const warnings: string[] = [];
    let created = 0;
    let skipped = 0;
    // F0 (27/07) — CURSOR NO DESFECHO: a geração NUNCA MAIS avança `proximaData`
    // (era a causa-raiz da "sexta que não volta" — montagem abortada/pulada
    // comia uma semana do plano em silêncio, sem ninguém ter confirmado nada).
    // O avanço agora só acontece no DESFECHO da ocorrência — confirmarEntrega/
    // cancelarEntrega em logistica.service.ts, ver avancarPlanoNoDesfecho — a
    // partir da DATA DE ORIGEM da chave, nunca do dia em que a geração rodou.
    // `advanced`/`avancados` continuam no retorno por compatibilidade de
    // contrato (quem lê o campo não quebra), mas SEMPRE 0 vindos daqui.
    const advanced = 0;

    for (const plan of due) {
      const occurrenceKey = `agenda:${plan.id}:${dateKey(date)}`;
      const existing = await this.prisma.entrega.findFirst({
        where: { companyId, agendaOcorrenciaKey: occurrenceKey },
        select: { id: true, status: true },
      });
      if (existing) {
        skipped += 1;
        if (existing.status === 'entregue' || existing.status === 'cancelada') {
          warnings.push(
            existing.status === 'entregue'
              ? `${plan.customerProfile.name || 'Cliente'} já foi entregue nesta ocorrência.`
              : `${plan.customerProfile.name || 'Cliente'} foi retirado desta ocorrência.`,
          );
        } else {
          deliveryIds.push(existing.id);
        }
        continue;
      }

      /* 🔴 GUARD MORTO (10/08, ROTA v2 F1a — "montar depois de cancelar RECRIA o
         dia"). Aqui morava `ocorrenciaCanceladaRecente`: dentro de 24h, cancelamento
         humano vencia a geração AUTOMÁTICA do dia — porque existia
         `sweepGerarDiaAutomatico`, o timer que recriava o dia sozinho a cada BOOT do
         backend (era ele que ressuscitava às 03:08 o que o dono tinha cancelado às
         00:44). Esse timer MORREU em 10/08 (ver logistica-expurgo.service.ts: hoje o
         único timer da casa só APAGA lixo, nunca CRIA dia). Sem gerador automático
         correndo atrás do cancelar, o guard perdeu o inimigo — e sobrou travando o
         próprio dono: ele cancela o dia, decide remontar, chama `generateDay` de
         novo (é GENTE apertando o botão, não boot nenhum) e o guard recusava com
         "não vou recriar". Decisão humana mais RECENTE (remontar) tem que vencer
         decisão humana mais ANTIGA (cancelar) — nunca o contrário.
         A prova de "cancelei" não sumiu: `LogisticaAgendaEvento` continua guardando
         pra sempre (histórico/decisão nunca some) — só parou de bloquear geração
         nova. `TIPOS_CANCELAMENTO_HUMANO` (logistica-expurgo.util.ts) segue
         exportado: `historicoDeRotas` ainda lê essa trilha pra pintar o dia cancelado
         de vermelho. */

      // GUARD ANTI-DUPLA-ABERTA (F0, 27/07) — sem o avanço-na-geração, nada mais
      // impediria duas ocorrências abertas do MESMO plano ao mesmo tempo: se a
      // de uma data anterior ainda está 'agendada' (ninguém confirmou/cancelou/
      // descartou), a de hoje NÃO nasce — o cliente fica pendurado 1x, nunca 2x.
      // Resolve sozinho no desfecho da pendurada (que aí sim avança o cursor e
      // libera a geração da próxima). `agendaOcorrenciaKey` diferente da chave
      // de hoje é garantido pelo `continue` acima (se fosse igual, `existing`
      // já teria achado e saído por ali).
      const pendurada = await this.prisma.entrega.findFirst({
        where: {
          companyId,
          planoEntregaId: plan.id,
          status: 'agendada',
          agendaOcorrenciaKey: { not: null },
        },
        select: { id: true, agendaOcorrenciaKey: true },
        orderBy: { scheduledAt: 'asc' },
      });
      if (pendurada) {
        const origemPendurada = sourceDateFromOccurrenceKey(pendurada.agendaOcorrenciaKey);
        if (origemPendurada && origemPendurada < dateKey(date)) {
          skipped += 1;
          deliveryIds.push(pendurada.id);
          warnings.push(
            `${plan.customerProfile.name || 'Cliente'} tem entrega pendente de ${formatDDMM(origemPendurada)} — resolva antes de gerar a próxima.`,
          );
          continue;
        }
      }

      let contactId: string | null = null;
      try {
        contactId = await resolvePrincipalContatoId(this.prisma as any, companyId, plan.customerProfileId);
      } catch {
        contactId = null;
      }
      const items = plan.itens.map((item: any) => ({
        productId: item.productId,
        qtdPrevista: item.qtd,
        valorUnit: Number(item.valorUnit || 0),
      }));
      if (!items.length) {
        skipped += 1;
        warnings.push(`${plan.customerProfile.name || 'Cliente'} está sem itens na Agenda.`);
        continue;
      }
      const serialized = planDto(plan);
      const quantity = items.reduce((total: number, item: any) => total + item.qtdPrevista, 0);
      const baseValue = items.reduce(
        (total: number, item: any) => total + item.qtdPrevista * item.valorUnit,
        0,
      );
      const extraValue = serialized.adicional
        ? serialized.adicional.tipo === 'POR_UNIDADE'
          ? serialized.adicional.valor * quantity
          : serialized.adicional.valor
        : 0;

      try {
        const delivery = await this.prisma.entrega.create({
          data: {
            companyId,
            customerProfileId: plan.customerProfileId,
            contatoId: contactId,
            localId: plan.localId,
            productId: items[0]?.productId ?? null,
            quantidade: quantity,
            valor: baseValue + extraValue,
            status: 'agendada',
            origem: 'recorrente',
            scheduledAt: date,
            cobrancaStatus: 'pendente',
            agendaOcorrenciaKey: occurrenceKey,
            planoEntregaId: plan.id,
            planoEntregaRevisao: plan.revisao,
            rotaModeloId: route?.id ?? null,
            rotaModeloVersao: route?.versao ?? null,
            janelaInicioSnapshot: plan.janelaInicio,
            janelaFimSnapshot: plan.janelaFim,
            janelaTipoSnapshot: plan.janelaTipo,
            tempoParadaMinSnapshot: plan.tempoParadaMin,
            instrucoesSnapshot: plan.instrucoes,
            acessoTipoSnapshot: serialized.acesso?.tipo ?? null,
            acessoAndaresSnapshot: serialized.acesso?.andares ?? null,
            acessoTemElevadorSnapshot: serialized.acesso?.temElevador ?? null,
            acessoObservacaoSnapshot: serialized.acesso?.observacao ?? null,
            adicionalTipoSnapshot: serialized.adicional?.tipo ?? null,
            adicionalValorSnapshot: serialized.adicional?.valor ?? null,
            adicionalMotivoSnapshot: serialized.adicional?.motivo ?? null,
            itens: { create: items },
          },
          select: { id: true },
        });
        deliveryIds.push(delivery.id);
        created += 1;
        // F0 (27/07) — extrato: nasceu uma ocorrência nova. Best-effort (nunca
        // derruba a geração que já aconteceu no create acima).
        await registrarEventoAgenda(this.prisma as any, {
          companyId,
          customerProfileId: plan.customerProfileId,
          entregaId: delivery.id,
          planoEntregaId: plan.id,
          tipo: 'OCORRENCIA_GERADA',
          paraTexto: formatDDMM(dateKey(date)),
          origem: 'montagem',
          actorUserId: null,
        });
      } catch (error: any) {
        if (error?.code !== 'P2002') throw error;
        const concurrent = await this.prisma.entrega.findFirst({
          where: { companyId, agendaOcorrenciaKey: occurrenceKey },
          select: { id: true, status: true },
        });
        skipped += 1;
        if (concurrent && !FINISHED_DELIVERY_STATUS.includes(concurrent.status as any)) {
          deliveryIds.push(concurrent.id);
        }
      }
    }

    return {
      date: dateKey(date),
      criadas: created,
      puladas: skipped,
      avancados: advanced,
      deliveryIds,
      avisos: warnings,
    };
  }

  /**
   * Materializa as ocorrências escolhidas e as leva para a data operacional em
   * que a rota será executada. A identidade continua sendo a data de origem;
   * somente entregas abertas, ainda sem rota e sem outro motorista são movidas.
   */
  async materializeForRoute(
    companyId: number,
    input: {
      operationalDate?: string;
      sourceDates?: string[];
      driverUserId?: number | null;
      actorUserId?: number | null;
    } = {},
  ) {
    this.assertCompany(companyId);
    // F0 (27/07) — FECHAMENTO DE CAIXA lazy: antes de montar qualquer coisa,
    // fecha sozinho rota/entrega de dia que já passou e ninguém encerrou. Roda
    // com o HOJE real (não o `operationalDate` pedido — preparar a rota de
    // AMANHÃ com antecedência não pode fechar a rota de HOJE, que ainda está
    // rodando). Ver logistica-fechamento-caixa.util.ts.
    await encerrarDiasAnteriores(this.prisma, companyId, dateKey(new Date()));
    const operationalDate = parseOperationalDate(input.operationalDate);
    const sourceDates = [...new Set(
      (Array.isArray(input.sourceDates) && input.sourceDates.length
        ? input.sourceDates
        : [dateKey(operationalDate)])
        .map((value) => dateKey(parseOperationalDate(value))),
    )].slice(0, 7);
    const driverId = normalizeOptionalUserId(input.driverUserId);
    const actorId = normalizeOptionalUserId(input.actorUserId);
    // ROTA v2 F3b (10/08) — o portão de assentos: motorista já ocupante do dia
    // passa liso; motorista NOVO além do teto (nível/override da empresa)
    // leva 402 ASSENTOS_ESGOTADOS ANTES de qualquer entrega ser movida pra
    // este dia. `@Optional()` por padrão de módulo (testes que constroem a
    // classe direto sem o serviço de cobrança continuam válidos — materializar
    // sem motorista definido também não tem o que gatear).
    if (this.cobranca && driverId) {
      await this.cobranca.assertAssentoDoDia(companyId, driverId, dateKey(operationalDate));
    }
    const deliveryIds = new Set<string>();
    // F0 (27/07) — extrato: ids materializados de uma data de ORIGEM diferente
    // da operacional, agrupados por origem, só pra render OCORRENCIA_ADIANTADA
    // depois do updateMany (best-effort — não participa de nenhuma decisão).
    const deliveryIdsPorOrigemDiferente = new Map<string, Set<string>>();
    const addAdiantada = (sourceDate: string, id: string) => {
      if (sourceDate === dateKey(operationalDate)) return;
      let bucket = deliveryIdsPorOrigemDiferente.get(sourceDate);
      if (!bucket) {
        bucket = new Set<string>();
        deliveryIdsPorOrigemDiferente.set(sourceDate, bucket);
      }
      bucket.add(id);
    };
    let created = 0;
    let skipped = 0;
    let advanced = 0;
    const warnings: string[] = [];

    for (const sourceDate of sourceDates) {
      const result = await this.generateDay(companyId, sourceDate);
      result.deliveryIds.forEach((id) => {
        deliveryIds.add(id);
        addAdiantada(sourceDate, id);
      });
      created += result.criadas;
      skipped += result.puladas;
      advanced += result.avancados;
      warnings.push(...result.avisos);
    }

    // 27/07 — RESGATE DA OCORRÊNCIA PRESA (incidente "a sexta que não volta").
    // Uma parada que ficou ABERTA numa rota de um dia anterior que ninguém
    // encerrou continua carregando a chave daquela ocorrência. O `generateDay`
    // acima acha a chave, pula ("já existe") e ainda empurra a `proximaData` —
    // mas a entrega segue com o `scheduledAt` do dia velho, então NENHUMA
    // montagem futura a enxerga e o dia daquele cliente some pra sempre.
    // Aqui a ocorrência é buscada pela CHAVE (`agenda:<plano>:<data>`), fora do
    // caminho do plano, justamente porque a `proximaData` já pode ter passado.
    for (const sourceDate of sourceDates) {
      const presas = await this.prisma.entrega.findMany({
        where: {
          companyId,
          status: 'agendada',
          agendaOcorrenciaKey: { endsWith: `:${sourceDate}` },
          // MESMA trava do generateDay (CLIENTE_VIVO): cliente apagado NÃO
          // volta pra rota. Sem isto o resgate ressuscitava gente excluída —
          // medido em campo 27/07, a sexta montou 13 paradas sendo 9 de
          // clientes `deleted` (é a armadilha dos "fantasmas de terça").
          customerProfile: CLIENTE_VIVO,
          ...(driverId
            ? { OR: [{ entregadorId: null }, { entregadorId: driverId }] }
            : {}),
        },
        select: { id: true },
        take: 300,
      });
      presas.forEach((row) => {
        deliveryIds.add(row.id);
        addAdiantada(sourceDate, row.id);
      });
    }

    if (deliveryIds.size) {
      await this.prisma.entrega.updateMany({
        where: {
          id: { in: [...deliveryIds] },
          companyId,
          status: 'agendada',
          rotaOrdem: null,
          // A trava aqui NUNCA foi "tem parada congelada", e sim "é de uma rota
          // que ainda está de pé" — roubar parada de rota em andamento é que não
          // pode. Rota já encerrada (operacional ou comercialmente) ou de um dia
          // que passou está morta: a parada dela volta a ser agendável.
          ...stopLivreWhere(dateKey(operationalDate)),
          ...(driverId
            ? { OR: [{ entregadorId: null }, { entregadorId: driverId }] }
            : {}),
        },
        data: {
          scheduledAt: operationalDate,
          rotaOrdem: null,
          etaAt: null,
          ...(driverId ? { entregadorId: driverId } : {}),
          ...(actorId
            ? {
              atribuidoPorUserId: actorId,
              atribuidoAt: new Date(),
            }
            : {}),
        },
      });
    }

    // F0 (27/07) — extrato: quem veio de uma data de ORIGEM diferente da
    // operacional foi ADIANTADA (puxada pra hoje). Best-effort, em lote (1
    // findMany pros metadados + 1 insert por linha) — nunca decide nada, só
    // registra depois que o updateMany acima já aconteceu.
    if (deliveryIdsPorOrigemDiferente.size) {
      const idsParaEvento = [...deliveryIdsPorOrigemDiferente.values()].flatMap((bucket) => [...bucket]);
      const linhas = await this.prisma.entrega.findMany({
        where: { id: { in: idsParaEvento }, companyId },
        select: { id: true, customerProfileId: true, planoEntregaId: true },
      }).catch(() => [] as Array<{ id: string; customerProfileId: string; planoEntregaId: string | null }>);
      const porId = new Map(linhas.map((row) => [row.id, row]));
      const paraTexto = formatDDMM(dateKey(operationalDate));
      for (const [sourceDate, ids] of deliveryIdsPorOrigemDiferente) {
        const deTexto = formatDDMM(sourceDate);
        for (const id of ids) {
          const row = porId.get(id);
          if (!row) continue;
          await registrarEventoAgenda(this.prisma as any, {
            companyId,
            customerProfileId: row.customerProfileId,
            entregaId: id,
            planoEntregaId: row.planoEntregaId,
            tipo: 'OCORRENCIA_ADIANTADA',
            deTexto,
            paraTexto,
            origem: 'montagem',
            actorUserId: actorId,
          });
        }
      }
    }

    return {
      operationalDate: dateKey(operationalDate),
      sourceDates,
      criadas: created,
      puladas: skipped,
      avancados: advanced,
      deliveryIds: [...deliveryIds],
      avisos: [...new Set(warnings)],
    };
  }

  private async getPlanOrThrow(companyId: number, id: string) {
    const plan = await this.prisma.logisticaPlanoEntrega.findFirst({
      where: { id, companyId },
      include: planInclude(),
    });
    if (!plan) throw new NotFoundException('Plano de entrega não encontrado.');
    return planDto(plan);
  }

  private async normalizePlanInput(companyId: number, input: any, existing?: any) {
    const customerProfileId = existing?.customerProfileId ?? cleanId(input.customerProfileId);
    const customer = await this.prisma.customerProfile.findFirst({
      where: { id: customerProfileId, companyId, isCliente: true, status: 'active' },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado nesta empresa.');

    const localId = input.localId !== undefined
      ? nullableId(input.localId)
      : existing?.localId ?? null;
    if (localId) {
      const local = await this.prisma.localEntrega.findFirst({
        where: { id: localId, companyId, customerProfileId, ativo: true },
        select: { id: true },
      });
      if (!local) throw new BadRequestException('O local não pertence a este cliente.');
    }

    const day = input.diaSemana !== undefined
      ? normalizeWeekday(input.diaSemana)
      : normalizeWeekday(existing?.diaSemana);
    const frequency = normalizeFrequency(input.frequencia ?? existing?.frequencia);
    const interval = frequency === 'INTERVALO'
      ? normalizeInterval(input.intervaloDias ?? existing?.intervaloDias)
      : null;
    const nextDate = input.proximaData !== undefined
      ? parseNullableDate(input.proximaData)
      : existing?.proximaData ?? null;
    if (nextDate && isoWeekday(nextDate) !== day) {
      throw new BadRequestException('A próxima data precisa cair no dia da semana escolhido.');
    }

    const rawItems = input.itens ?? existing?.itens?.map((item: any) => ({
      productId: item.productId,
      qtd: item.qtd,
      valorUnit: item.valorUnit,
    }));
    const items = normalizeItems(rawItems);
    const productIds = [...new Set(items.map((item) => item.productId))];
    const products = await this.prisma.product.findMany({
      where: { companyId, id: { in: productIds }, status: 'active' },
      select: { id: true, name: true },
    });
    if (products.length !== productIds.length) {
      throw new BadRequestException('Um produto não pertence a esta empresa ou está inativo.');
    }
    const productNames = new Map(products.map((product) => [product.id, product.name]));

    const window = input.janela !== undefined
      ? normalizeWindow(input.janela)
      : {
        janelaInicio: existing?.janelaInicio ?? null,
        janelaFim: existing?.janelaFim ?? null,
        janelaTipo: existing?.janelaTipo ?? null,
      };
    const access = input.acesso !== undefined
      ? normalizeAccess(input.acesso)
      : {
        acessoTipo: existing?.acessoTipo ?? null,
        acessoAndares: existing?.acessoAndares ?? null,
        acessoTemElevador: existing?.acessoTemElevador ?? null,
        acessoObservacao: existing?.acessoObservacao ?? null,
      };
    const additional = input.adicional !== undefined
      ? normalizeAdditional(input.adicional)
      : {
        adicionalTipo: existing?.adicionalTipo ?? null,
        adicionalValor: existing?.adicionalValor ?? null,
        adicionalMotivo: existing?.adicionalMotivo ?? null,
      };

    return {
      customerProfileId,
      localId,
      diaSemana: day,
      frequencia: frequency,
      intervaloDias: interval,
      proximaData: nextDate,
      ativo: input.ativo ?? existing?.ativo ?? true,
      items: items.map((item) => ({ ...item, nome: productNames.get(item.productId) || 'Produto' })),
      accessProvided: input.acesso !== undefined,
      localAccess: access,
      schedule: {
        ...window,
        tempoParadaMin: input.tempoParadaMin !== undefined
          ? normalizeNullableInteger(input.tempoParadaMin, 1, 480, 'tempo de parada')
          : existing?.tempoParadaMin ?? null,
        instrucoes: input.instrucoes !== undefined
          ? normalizeNullableText(input.instrucoes, 500)
          : existing?.instrucoes ?? null,
        ...access,
        ...additional,
      },
    };
  }

  private async ensureDayRoute(tx: any, companyId: number, day: number) {
    const route = await tx.logisticaRotaModelo.findFirst({
      where: { companyId, tipo: 'SEMANAL', diaSemana: day },
      orderBy: { updatedAt: 'desc' },
    });
    if (route) {
      if (!route.ativo) {
        return tx.logisticaRotaModelo.update({
          where: { id: route.id },
          data: { ativo: true },
        });
      }
      return route;
    }
    return tx.logisticaRotaModelo.create({
      data: {
        companyId,
        nome: `Rota de ${DAY_NAMES[day - 1]}`,
        diaSemana: day,
        tipo: 'SEMANAL',
        ativo: true,
        versao: 1,
      },
    });
  }

  /**
   * 🔴 F3 (09/08) — A PARADA VIROU SÓ POSIÇÃO. Saíram daqui o `itens` (cópia do
   * `LogisticaPlanoEntregaItem`: 716 = 716 em produção) e o `...normalized.schedule`
   * (janela/tempoParada/instruções/acesso/adicional). Os dois eram fotografia do
   * PLANO tirada no instante do create — e plano editado depois deixava a
   * fotografia velha decidindo a tela. Agora `stopDto` lê o plano direto: uma
   * pergunta, uma resposta.
   */
  private async createRouteStop(
    tx: any,
    companyId: number,
    routeId: string,
    order: number,
    planId: string,
    normalized: any,
  ) {
    return tx.logisticaRotaModeloParada.create({
      data: {
        companyId,
        rotaModeloId: routeId,
        planoEntregaId: planId,
        customerProfileId: normalized.customerProfileId,
        localId: normalized.localId,
        ordem: order,
        ordemTravada: true,
      },
    });
  }

  /**
   * A VERSÃO DA ROTA SOBE QUANDO A ORDEM MUDA — e só isso.
   *
   * Isto era o `syncRouteMirror`, que reescrevia o `paradasJson` a cada mexida
   * na sequência. O espelho morreu na F3 (a tabela é a fonte), mas o `versao`
   * NÃO: ele é o carimbo que o app usa pra saber que a rota do dia mudou.
   * Apagar a função inteira teria levado o carimbo junto, calado.
   */
  private async bumpRouteVersao(tx: any, companyId: number, routeId: string) {
    await tx.logisticaRotaModelo.updateMany({
      where: { id: routeId, companyId },
      data: { versao: { increment: 1 } },
    });
  }

  private async findActionReplay(companyId: number, idempotencyKey: string, requestHash: string) {
    const existing = await this.prisma.logisticaAgendaAcao.findUnique({
      where: { companyId_idempotencyKey: { companyId, idempotencyKey } },
    });
    if (!existing) return null;
    if (existing.requestHash !== requestHash) {
      throw new ConflictException('Esta chave de repetição já foi usada com outra operação.');
    }
    return existing;
  }

  private async resolveAuditUserId(companyId: number, userId: number): Promise<number | null> {
    const normalized = normalizeUserId(userId);
    const actor = await this.prisma.user.findFirst({
      where: { id: normalized, companyId },
      select: { id: true },
    });
    return actor?.id ?? null;
  }

  private assertCompany(companyId: number) {
    if (!Number.isInteger(companyId) || companyId <= 0) {
      throw new BadRequestException('Empresa não identificada.');
    }
  }
}

/**
 * 🔴 CLIENTE MORTO NÃO TEM VISITA (27/07, incidente "quem é Elaine?").
 *
 * A importação de lista deixou 23 perfis nascidos `status='deleted'/isCliente=false`
 * (os duvidosos: "Francine / Edila (?)", "Dona — nome incompleto") — eles NÃO
 * aparecem em Clientes. Só que o `LogisticaPlanoEntrega` deles ficou `ativo=true`,
 * e a Agenda filtrava plano só por `ativo` — nunca pelo estado de quem recebe.
 * Resultado medido em prod (companies 48 E 41, o mesmo lixo espelhado): 19 planos
 * fantasmas, a TERÇA da empresa 48 com 0 clientes reais e 7 fantasmas, e o chip
 * anunciando "Terça 7". O dono via na rota um nome que não existe no cadastro.
 *
 * Esta é a régua única de "cliente vivo" para TODA leitura de agenda que vira
 * tela, contagem ou entrega. Aplicada nas consultas de resumo (chip), dia,
 * conferência de sequência e — a que materializa de verdade — `generateDay`.
 * NÃO entra nas ações em massa do dia (mover/pausar) nem na ponte do cadastro:
 * lá o alvo é um plano já escolhido, e esconder linha faria a ação mentir.
 *
 * Reativar o cliente devolve a visita sozinho (o plano continua lá, intacto) —
 * decisão de quem manda no cadastro, nunca do gerador de rota.
 */
const CLIENTE_VIVO = { status: 'active', isCliente: true } as const;

function planInclude() {
  return {
    customerProfile: {
      select: {
        id: true,
        name: true,
        endereco: true,
        numero: true,
        complemento: true,
        bairro: true,
        cidade: true,
        uf: true,
        cep: true,
        lat: true,
        lng: true,
      },
    },
    local: { select: localSelect() },
    itens: {
      include: { product: { select: { id: true, name: true, unidade: true } } },
      orderBy: { createdAt: 'asc' as const },
    },
  };
}

/**
 * A lista do modelo, na ORDEM — a única leitura de parada de rota salva que o
 * matcher de sequência conhece. Quem traduz as linhas pro formato dele é o
 * `paradasDoModelo` (logistica-agenda-sequencia.util.ts), onde mora a lei de
 * "parada sem cliente é descartada, nunca vira string vazia".
 */
const PARADAS_DO_MODELO = {
  orderBy: { ordem: 'asc' },
  select: { customerProfileId: true, localId: true },
} as const;

function localSelect() {
  return {
    id: true,
    apelido: true,
    endereco: true,
    numero: true,
    complemento: true,
    bairro: true,
    cidade: true,
    uf: true,
    cep: true,
    lat: true,
    lng: true,
    geoFonte: true,
    acessoTipo: true,
    acessoAndares: true,
    acessoTemElevador: true,
    acessoObservacao: true,
  };
}

function planDto(plan: any) {
  const localAccess = accessDto(plan.local);
  const ownAccess = accessDto({
    acessoTipo: plan.acessoTipo,
    acessoAndares: plan.acessoAndares,
    acessoTemElevador: plan.acessoTemElevador,
    acessoObservacao: plan.acessoObservacao,
  });
  return {
    id: plan.id,
    revisao: plan.revisao,
    ativo: plan.ativo,
    customerProfileId: plan.customerProfileId,
    localId: plan.localId ?? null,
    diaSemana: plan.diaSemana,
    frequencia: plan.frequencia,
    intervaloDias: plan.intervaloDias ?? null,
    proximaData: plan.proximaData?.toISOString?.() ?? null,
    cliente: clienteDto(plan.customerProfile),
    local: plan.local ? addressDto(plan.local) : null,
    itens: (plan.itens ?? []).map((item: any) => ({
      id: item.id,
      productId: item.productId,
      nome: item.product?.name || 'Produto',
      qtd: item.qtd,
      valorUnit: Number(item.valorUnit || 0),
    })),
    janela: windowDto(plan),
    tempoParadaMin: plan.tempoParadaMin ?? null,
    instrucoes: plan.instrucoes ?? null,
    acesso: ownAccess ?? localAccess,
    adicional: additionalDto(plan),
    origem: plan.origem === 'LEGADO' ? 'LEGADO' : 'AGENDA_V2',
  };
}

/**
 * 🔴 F3 (09/08) — A PARADA SÓ ACRESCENTA POSIÇÃO. Janela, tempo de parada,
 * instruções, acesso, adicional e itens vinham do snapshot da parada com
 * fallback pro plano; agora vêm SÓ do plano (`...plan`), que é onde o dono
 * edita. Enquanto existiram as duas cópias, editar a visita não mudava a tela
 * do dia — a fotografia velha ganhava do dado novo, calada.
 */
function stopDto(stop: any, plan: any) {
  return {
    ...plan,
    id: stop.id,
    ordem: stop.ordem,
    ordemTravada: stop.ordemTravada,
    planoEntregaId: plan.id,
  };
}

function stopDtoFromPlan(plan: any, order: number) {
  return {
    ...plan,
    id: `sem-rota:${plan.id}`,
    ordem: order,
    ordemTravada: true,
    planoEntregaId: plan.id,
  };
}

/**
 * S4-AVISO-DE-HORARIO — campos ADITIVOS `eta`/`alertaJanela` por parada, na
 * ordem já decidida (`ordered`/`stops`). `calcularEtas` é pura (sem
 * Prisma/tx); aqui só traduzimos o formato da parada pro formato do util e
 * devolvemos os mesmos objetos com 2 chaves a mais — nada existente muda de
 * nome nem some, então o APK v31 (que ignora chaves que não conhece) não
 * quebra ao consumir este mesmo GET.
 */
function attachEtaInfo<T extends { janela?: { fim: string | null; tipo: 'RIGIDA' | 'PREFERENCIAL' } | null; tempoParadaMin?: number | null }>(
  paradas: T[],
): Array<T & { eta: string | null; alertaJanela: AgendaAlertaJanela }> {
  const etas = calcularEtas(
    paradas.map((parada) => ({
      tempoParadaMin: parada.tempoParadaMin ?? null,
      janelaFim: parada.janela?.fim ?? null,
      janelaTipo: parada.janela?.tipo ?? null,
    })),
  );
  return paradas.map((parada, index) => ({
    ...parada,
    eta: etas[index]?.eta ?? null,
    alertaJanela: etas[index]?.alertaJanela ?? null,
  }));
}

function routeDto(route: any) {
  return {
    id: route.id,
    nome: route.nome,
    tipo: 'SEMANAL' as const,
    ativo: route.ativo,
    versao: route.versao,
  };
}

// Endereço/GPS do perfil viajam no DTO para a parada SEM local explícito
// ("Local principal") continuar com rua e coordenada nas prévias e no APK.
function clienteDto(profile: any) {
  return {
    id: profile.id,
    nome: profile.name || 'Cliente',
    endereco: profile.endereco ?? null,
    numero: profile.numero ?? null,
    // 09/08 — `complemento` e `cep` faltavam AQUI e só aqui: quem lê a prévia do dia
    // pela fonte PERFIL (o caso de 50 dos 51 clientes de segunda da empresa 41, que
    // não têm LocalEntrega) montava o endereço sem o apartamento e sem o CEP, e a
    // mesma pessoa aparecia com endereço menor no celular do que no computador.
    complemento: profile.complemento ?? null,
    bairro: profile.bairro ?? null,
    cidade: profile.cidade ?? null,
    uf: profile.uf ?? null,
    cep: profile.cep ?? null,
    lat: profile.lat ?? null,
    lng: profile.lng ?? null,
  };
}

function addressDto(local: any) {
  return {
    id: local.id,
    apelido: local.apelido ?? null,
    endereco: local.endereco ?? null,
    numero: local.numero ?? null,
    // mesma razão do `complemento` em clienteDto (09/08): o apartamento é o que
    // distingue duas contas na MESMA porta, e ele não pode existir só no desktop.
    complemento: local.complemento ?? null,
    bairro: local.bairro ?? null,
    cidade: local.cidade ?? null,
    uf: local.uf ?? null,
    cep: local.cep ?? null,
    lat: local.lat ?? null,
    lng: local.lng ?? null,
    geoFonte: local.geoFonte ?? null,
  };
}

function windowDto(source: any) {
  if (!source || (!source.janelaInicio && !source.janelaFim && !source.janelaTipo)) return null;
  return {
    inicio: source.janelaInicio ?? null,
    fim: source.janelaFim ?? null,
    tipo: source.janelaTipo === 'RIGIDA' ? 'RIGIDA' : 'PREFERENCIAL',
  };
}

function accessDto(source: any) {
  if (!source?.acessoTipo) return null;
  return {
    tipo: source.acessoTipo,
    andares: source.acessoAndares ?? null,
    temElevador: source.acessoTemElevador ?? null,
    observacao: source.acessoObservacao ?? null,
  };
}

function formatEnderecoResumo(customer: { endereco?: string | null; numero?: string | null } | undefined): string | null {
  if (!customer?.endereco) return null;
  return [customer.endereco, customer.numero].filter(Boolean).join(', ') || null;
}

function additionalDto(source: any) {
  if (!source?.adicionalTipo || !Number.isFinite(Number(source.adicionalValor))) return null;
  return {
    tipo: source.adicionalTipo,
    valor: Number(source.adicionalValor),
    motivo: source.adicionalMotivo ?? null,
  };
}

function normalizeWeekday(value: unknown): number {
  const day = Math.trunc(Number(value));
  if (!Number.isInteger(day) || day < 1 || day > 7) {
    throw new BadRequestException('Dia deve ser de 1 (segunda) a 7 (domingo).');
  }
  return day;
}

function parseWeekdays(value: unknown): number[] {
  return [...new Set(String(value ?? '')
    .split(',')
    .map((part) => Math.trunc(Number(part)))
    .filter((day) => day >= 1 && day <= 7))];
}

/**
 * Dias da visita pedidos pelo cadastro: ISO 1..7, sem repetido, em ordem. Dia
 * inválido é DESCARTADO (nunca vira lista vazia calada nem estoura 400 no meio
 * de um cadastro que já foi gravado).
 */
function normalizeVisitDays(dias: unknown): number[] {
  return [...new Set(
    (Array.isArray(dias) ? dias : [])
      .map((d) => Math.trunc(Number(d)))
      .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7),
  )].sort((a, b) => a - b);
}

/** Nome do dia pro aviso que o cadastro devolve/loga. */
function diaNomeAgenda(dia: number): string {
  return DAY_NAMES[dia - 1] ?? String(dia);
}

/**
 * Itens da visita = os que já estavam lá + os do cadastro. Produto que existe
 * nos dois lados fica com a quantidade/preço do CADASTRO (é lá que o dono
 * combina); produto que só existe na visita SOBREVIVE (nunca some calado).
 */
function mesclarItensDaVisita(
  atuais: Array<{ productId: number; qtd: number; valorUnit: number | null }>,
  doCadastro: AgendaPlanoItemDto[],
): AgendaPlanoItemDto[] {
  const porProduto = new Map<number, AgendaPlanoItemDto>();
  for (const i of atuais) {
    if (porProduto.has(i.productId)) continue; // duplicado na visita: 1 linha por produto
    porProduto.set(i.productId, { productId: i.productId, qtd: i.qtd, valorUnit: Number(i.valorUnit || 0) });
  }
  for (const i of doCadastro) porProduto.set(i.productId, { ...i });
  return [...porProduto.values()].slice(0, 50);
}

// ── FUSO (26/07) — a Agenda pensa em SÃO PAULO, nunca no fuso do processo ────────
// Incidente 26/07 (company 48, "o app parou de gerar rota"): estas 4 funções usavam
// os métodos LOCAIS do Date (`setHours`, `getDay`, `getFullYear`). Isso equivale a
// "meia-noite do fuso de quem está rodando o código" — em dev (Windows do dono, -03)
// dá meia-noite de Brasília e tudo funciona; no CONTAINER (TZ=UTC) dá meia-noite UTC,
// que é 21h do dia ANTERIOR em Brasília. Resultado medido em prod: `materializeForRoute`
// gravava `scheduledAt = 2026-07-26T00:00:00Z` e o `/admin-route/prepare` procurava a
// partir de `2026-07-26T00:00:00-03:00` (= 03:00Z) — as paradas nasciam 3h ANTES da
// janela que as busca, ficavam invisíveis, e cada clique em "Montar rota"
// materializava um lote novo (98 + 73 + 7 = 178 entregas órfãs) enquanto a tela dizia
// "Nenhuma parada foi encontrada para a rota de hoje".
//
// LEI: data de operação é dia CIVIL de São Paulo, explicitamente — nunca herdada do
// fuso do processo (o mesmo código roda no Windows do dono e num container UTC, e os
// dois têm que decidir o MESMO dia). Mesmo padrão que `logistica-dia.util.ts`
// (saoPauloDateKey/isoWeekdayForDate) e `logistica-admin-route.service.ts` (`-03:00`)
// já usavam — a Agenda era a peça fora do compasso.
const SAO_PAULO_UTC_OFFSET = '-03:00';

/** Meia-noite (00:00) do dia civil de São Paulo a que este instante pertence. */
function startOfDay(date: Date): Date {
  return new Date(`${dateKey(date)}T00:00:00${SAO_PAULO_UTC_OFFSET}`);
}

/**
 * Soma N dias CIVIS de São Paulo. Existe porque `setDate(getDate() + n)` — o jeito
 * "óbvio" — anda no calendário do PROCESSO, não no de São Paulo: `getDate()` lê a
 * meia-noite de SP (03:00Z) com o relógio de quem está rodando, e se esse relógio
 * cruzar um horário de verão o instante escorrega 1h e cai no dia civil ERRADO em SP.
 * Aqui a conta é feita no instante e RE-ANCORADA no dia civil, então o resultado é o
 * mesmo no Windows do dono (-03), no container (UTC) e em qualquer outro fuso.
 *
 * REGRA DO MÓDULO (26/07, 2ª vez que este furo aparece): nenhuma data de operação
 * pode passar por método LOCAL do Date (`setDate/getDate/setHours/getDay/...`). Quem
 * precisar mexer em dia usa `startOfDay` + `addDays` + `isoWeekday`, ponto.
 */
function addDays(date: Date, days: number): Date {
  return startOfDay(new Date(startOfDay(date).getTime() + days * DAY_IN_MS));
}

/** Último milissegundo do dia civil de São Paulo (23:59:59.999 em SP). */
function endOfDay(date: Date): Date {
  return new Date(startOfDay(date).getTime() + DAY_IN_MS - 1);
}

/** Dia da semana (1=segunda … 7=domingo) do dia civil de São Paulo. */
function isoWeekday(date: Date): number {
  return isoWeekdayForDate(dateKey(date));
}

/** Data civil "YYYY-MM-DD" em São Paulo — independente do fuso do processo. */
function dateKey(date: Date): string {
  return saoPauloDateKey(date) ?? '';
}

/**
 * Converte o que a UI manda (`?date=YYYY-MM-DD`) na meia-noite de São Paulo daquele
 * dia. Um "YYYY-MM-DD" puro é DIA CIVIL, não um instante: interpretá-lo com o parser
 * genérico (que usa o fuso do processo) é justamente o que escorregava o dia inteiro
 * no container. Datas com hora/offset explícitos seguem o parse normal e são
 * ancoradas no dia civil SP correspondente.
 */
function parseOperationalDate(value?: string): Date {
  const raw = String(value ?? '').trim();
  if (raw) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const anchored = new Date(`${raw}T00:00:00${SAO_PAULO_UTC_OFFSET}`);
      // Round-trip: "2026-02-30" é bem-formada mas impossível — o Date rolaria pro
      // dia seguinte em silêncio (mesmo cuidado de parseDateOrNull/dateParts).
      if (Number.isNaN(anchored.getTime()) || dateKey(anchored) !== raw) {
        throw new BadRequestException('Data inválida. Use YYYY-MM-DD.');
      }
      return anchored;
    }
    const parsed = parseDateOrNull(raw);
    if (!parsed) throw new BadRequestException('Data inválida. Use YYYY-MM-DD.');
    return startOfDay(parsed);
  }
  return startOfDay(new Date());
}

function planOccursOn(plan: any, date: Date): boolean {
  if (plan.ativo === false || Number(plan.diaSemana) !== isoWeekday(date)) return false;
  if (!plan.proximaData) return true;
  const next = startOfDay(new Date(plan.proximaData));
  const target = startOfDay(date);
  if (target < next) return false;
  const elapsedDays = Math.floor((target.getTime() - next.getTime()) / 86_400_000);
  if (plan.frequencia === 'QUINZENAL') return elapsedDays % 14 === 0;
  if (plan.frequencia === 'INTERVALO') {
    const interval = Math.max(1, Math.trunc(Number(plan.intervaloDias) || 1));
    const routedInterval = Math.ceil(interval / 7) * 7;
    return elapsedDays % routedInterval === 0;
  }
  return elapsedDays % 7 === 0;
}

function stopValue(stop: any): number {
  const itemValue = (stop.itens ?? []).reduce(
    (total: number, item: any) => total + Number(item.qtd || 0) * Number(item.valorUnit || 0),
    0,
  );
  if (!stop.adicional) return itemValue;
  const extra = Number(stop.adicional.valor || 0);
  if (stop.adicional.tipo === 'POR_UNIDADE') {
    const quantity = (stop.itens ?? []).reduce((total: number, item: any) => total + Number(item.qtd || 0), 0);
    return itemValue + extra * quantity;
  }
  return itemValue + extra;
}

function cleanId(value: unknown): string {
  const id = String(value ?? '').trim();
  if (!id) throw new BadRequestException('Identificador obrigatório.');
  if (id.length > 200) throw new BadRequestException('Identificador inválido.');
  return id;
}

function nullableId(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return cleanId(value);
}

function normalizeUserId(value: unknown): number {
  const id = Math.trunc(Number(value));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('Usuário não identificado.');
  return id;
}

function normalizeOptionalUserId(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  return normalizeUserId(value);
}

function normalizeIdempotencyKey(value: unknown): string {
  const key = String(value ?? '').trim();
  if (!key || key.length > 100 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new BadRequestException('Chave de repetição inválida.');
  }
  return key;
}

function stableJson(value: any): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashPayload(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function normalizeFrequency(value: unknown): AgendaFrequency {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (!['SEMANAL', 'QUINZENAL', 'INTERVALO'].includes(normalized)) {
    throw new BadRequestException('Frequência inválida.');
  }
  return normalized as AgendaFrequency;
}

function normalizeInterval(value: unknown): number {
  const interval = Math.trunc(Number(value));
  if (!Number.isInteger(interval) || interval < 1 || interval > 365) {
    throw new BadRequestException('Informe um intervalo de 1 a 365 dias.');
  }
  return interval;
}

function parseNullableDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = parseDateOrNull(String(value));
  if (!parsed) throw new BadRequestException('Data inválida. Use YYYY-MM-DD.');
  return startOfDay(parsed);
}

function normalizeItems(value: unknown): AgendaPlanoItemDto[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) {
    throw new BadRequestException('Informe de 1 a 50 itens.');
  }
  return value.map((raw, index) => {
    const productId = Math.trunc(Number((raw as any)?.productId));
    const quantity = Math.trunc(Number((raw as any)?.qtd));
    const price = Number((raw as any)?.valorUnit);
    if (!Number.isInteger(productId) || productId <= 0) {
      throw new BadRequestException(`Produto inválido no item ${index + 1}.`);
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) {
      throw new BadRequestException(`Quantidade inválida no item ${index + 1}.`);
    }
    if (!Number.isFinite(price) || price < 0 || price > 1_000_000) {
      throw new BadRequestException(`Preço inválido no item ${index + 1}.`);
    }
    return { productId, qtd: quantity, valorUnit: price };
  });
}

function normalizeWindow(value: any) {
  if (value === null || value === undefined) {
    return { janelaInicio: null, janelaFim: null, janelaTipo: null };
  }
  const start = normalizeTime(value.inicio);
  const end = normalizeTime(value.fim);
  const type = value.tipo == null || value.tipo === ''
    ? 'PREFERENCIAL'
    : String(value.tipo).trim().toUpperCase();
  if (!['RIGIDA', 'PREFERENCIAL'].includes(type)) {
    throw new BadRequestException('Tipo de janela inválido.');
  }
  if (!start && !end) return { janelaInicio: null, janelaFim: null, janelaTipo: null };
  if (start && end && start >= end) {
    throw new BadRequestException('O fim do horário precisa ser depois do início.');
  }
  return { janelaInicio: start, janelaFim: end, janelaTipo: type };
}

function normalizeTime(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const time = String(value).trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new BadRequestException('Horário inválido. Use HH:MM.');
  }
  return time;
}

function normalizeAccess(value: any) {
  if (value === null || value === undefined) {
    return {
      acessoTipo: null,
      acessoAndares: null,
      acessoTemElevador: null,
      acessoObservacao: null,
    };
  }
  const type = String(value.tipo ?? '').trim().toUpperCase();
  if (!['TERREO', 'ESCADA', 'ELEVADOR', 'OUTRO'].includes(type)) {
    throw new BadRequestException('Tipo de acesso inválido.');
  }
  const floors = value.andares === null || value.andares === undefined || value.andares === ''
    ? null
    : normalizeNullableInteger(value.andares, 0, 100, 'andares');
  const elevator = value.temElevador === null || value.temElevador === undefined
    ? null
    : Boolean(value.temElevador);
  return {
    acessoTipo: type,
    acessoAndares: floors,
    acessoTemElevador: elevator,
    acessoObservacao: normalizeNullableText(value.observacao, 240),
  };
}

function normalizeAdditional(value: any) {
  if (value === null || value === undefined) {
    return { adicionalTipo: null, adicionalValor: null, adicionalMotivo: null };
  }
  const type = String(value.tipo ?? '').trim().toUpperCase();
  const amount = Number(value.valor);
  if (!['FIXO', 'POR_UNIDADE'].includes(type)) {
    throw new BadRequestException('Tipo de adicional inválido.');
  }
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) {
    throw new BadRequestException('Valor adicional inválido.');
  }
  return {
    adicionalTipo: type,
    adicionalValor: amount,
    adicionalMotivo: normalizeNullableText(value.motivo, 120),
  };
}

function normalizeNullableInteger(
  value: unknown,
  min: number,
  max: number,
  label: string,
): number | null {
  if (value === null || value === undefined || value === '') return null;
  const integer = Math.trunc(Number(value));
  if (!Number.isInteger(integer) || integer < min || integer > max) {
    throw new BadRequestException(`Valor inválido para ${label}.`);
  }
  return integer;
}

function normalizeNullableText(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > max) throw new BadRequestException(`Texto deve ter até ${max} caracteres.`);
  return text;
}

function normalizeDayAction(value: unknown): 'PAUSAR' | 'MOVER' | 'CANCELAR' {
  const action = String(value ?? '').trim().toUpperCase();
  if (!['PAUSAR', 'MOVER', 'CANCELAR'].includes(action)) {
    throw new BadRequestException('Ação inválida.');
  }
  return action as 'PAUSAR' | 'MOVER' | 'CANCELAR';
}

function normalizeOpenDeliveryAction(
  value: unknown,
  action: 'PAUSAR' | 'MOVER' | 'CANCELAR',
): 'MANTER' | 'MOVER' | 'CANCELAR' {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (!['MANTER', 'MOVER', 'CANCELAR'].includes(normalized)) {
    throw new BadRequestException('Tratamento das entregas abertas inválido.');
  }
  if (action === 'MOVER' && normalized === 'CANCELAR') {
    throw new BadRequestException('Ao mover um dia, mantenha ou mova as entregas abertas.');
  }
  if (action !== 'MOVER' && normalized === 'MOVER') {
    throw new BadRequestException('Só é possível mover entregas junto com um dia movido.');
  }
  return normalized as 'MANTER' | 'MOVER' | 'CANCELAR';
}

async function nextRouteOrder(tx: any, routeId: string): Promise<number> {
  const last = await tx.logisticaRotaModeloParada.findFirst({
    where: { rotaModeloId: routeId },
    select: { ordem: true },
    orderBy: { ordem: 'desc' },
  });
  return (last?.ordem ?? 0) + 1;
}

async function makeOrderSlot(tx: any, routeId: string, target: number) {
  const rows = await tx.logisticaRotaModeloParada.findMany({
    where: { rotaModeloId: routeId, ordem: { gte: target } },
    select: { id: true, ordem: true },
    orderBy: { ordem: 'desc' },
  });
  for (const row of rows) {
    await tx.logisticaRotaModeloParada.update({
      where: { id: row.id },
      data: { ordem: row.ordem + 1 },
    });
  }
}

async function compactRouteOrders(tx: any, routeId: string) {
  const rows = await tx.logisticaRotaModeloParada.findMany({
    where: { rotaModeloId: routeId },
    select: { id: true, ordem: true },
    orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }],
  });
  const ids = rows.map((row) => row.id);
  const ords = rows.map((_, index) => index + 1);
  // Passe 1 (shift): afasta a faixa atual pra 10000+ num statement só — soma preserva a
  // unicidade de cada linha e garante zero colisão com o destino 1..N do passe 2.
  await tx.logisticaRotaModeloParada.updateMany({
    where: { id: { in: ids } },
    data: { ordem: { increment: 10_000 } },
  });
  // Passe 2 (destino): grava a ordem final 1..N num statement só; a unique
  // (rotaModeloId, ordem) é checada por linha, então precisa dos dois passes.
  await tx.$executeRaw`
    UPDATE "LogisticaRotaModeloParada" AS p
    SET "ordem" = t.ord, "updatedAt" = now()
    FROM unnest(${ids}::text[], ${ords}::int[]) AS t(id, ord)
    WHERE p."id" = t.id
  `;
}

async function writeRouteOrder(
  tx: any,
  rows: Array<{ id: string; planoEntregaId: string | null; ordem: number }>,
  requested: string[],
) {
  const byPlan = new Map(rows.map((row) => [String(row.planoEntregaId), row]));
  const ids: string[] = [];
  for (const planoId of requested) {
    const row = byPlan.get(planoId);
    if (!row) throw new BadRequestException('Plano inválido na ordem.');
    ids.push(row.id);
  }
  const ords = ids.map((_, index) => index + 1);
  // Passe 1 (shift): afasta a faixa atual pra 10000+ num statement só — soma preserva a
  // unicidade de cada linha e garante zero colisão com o destino 1..N do passe 2.
  await tx.logisticaRotaModeloParada.updateMany({
    where: { id: { in: ids } },
    data: { ordem: { increment: 10_000 } },
  });
  // Passe 2 (destino): grava a ordem final 1..N num statement só; a unique
  // (rotaModeloId, ordem) é checada por linha, então precisa dos dois passes.
  await tx.$executeRaw`
    UPDATE "LogisticaRotaModeloParada" AS p
    SET "ordem" = t.ord, "updatedAt" = now()
    FROM unnest(${ids}::text[], ${ords}::int[]) AS t(id, ord)
    WHERE p."id" = t.id
  `;
}

/**
 * O que o `createRouteStop` precisa saber do plano pra virar POSIÇÃO na rota do
 * dia. Depois da F3 são dois campos: quem e onde. Itens e janela ficaram no
 * plano (o `stopDto` lê de lá), então copiá-los pra cá só criaria de novo a
 * fotografia que a F3 enterrou.
 */
function normalizedFromPlan(plan: any, day: number) {
  return {
    customerProfileId: plan.customerProfileId,
    localId: plan.localId ?? null,
    diaSemana: day,
  };
}

function moveDateToWeekday(value: Date, destination: number): Date {
  const base = startOfDay(new Date(value));
  const delta = (destination - isoWeekday(base) + 7) % 7;
  return addDays(base, delta || 7);
}

/**
 * Espelha o `dateForIsoDay` do APK (app.js:2021): a data que a prévia daquele dia
 * vai consultar — HOJE quando o dia é hoje, senão a próxima ocorrência do dia da
 * semana dentro dos 7 dias seguintes. É o que faz o contador do resumo bater com
 * a lista da prévia.
 */
function nextDateForWeekday(day: number, from: Date): Date {
  const base = startOfDay(from);
  const delta = (Number(day) - isoWeekday(base) + 7) % 7;
  return addDays(base, delta);
}

/**
 * F0 (27/07) — EXPORTADA de propósito: com o cursor só avançando no desfecho,
 * `confirmarEntrega`/`cancelarEntrega` (logistica.service.ts) precisam da
 * MESMA conta de "próxima ocorrência" que a geração sempre usou — reimplementar
 * a aritmética de cadência em outro arquivo é o tipo de duplicação que já
 * causou incidente de fuso neste módulo (ver o bloco "FUSO" acima). Continua
 * usando SOMENTE addDays/isoWeekday (dia civil de São Paulo).
 */
export function nextOccurrenceDate(plan: any, current: Date): Date {
  const interval = plan.frequencia === 'QUINZENAL'
    ? 14
    : plan.frequencia === 'INTERVALO'
      ? Math.max(1, Math.trunc(Number(plan.intervaloDias) || 1))
      : 7;
  let base = addDays(current, interval);
  while (isoWeekday(base) !== Number(plan.diaSemana)) {
    base = addDays(base, 1);
  }
  return base;
}

/**
 * FUSO (26/07) — superfície SÓ de teste das funções de dia civil (ver o bloco "FUSO"
 * acima). Elas são privadas de propósito: quem escreve regra de agenda usa os
 * helpers, não recalcula data na mão. Mas o incidente 26/07 mostrou que elas
 * PRECISAM de teste rodando com TZ=UTC (o fuso do container, onde o bug aparecia e o
 * fuso do dono escondia), então ficam alcançáveis por aqui — nunca use isto em
 * código de produção. Ver `logistica-agenda-fuso.test.ts`.
 */
export const __fusoInternals = {
  startOfDay,
  endOfDay,
  isoWeekday,
  dateKey,
  parseOperationalDate,
  // Aritmética de dia (26/07, 2ª rodada): `addDays` e quem depende dela também
  // entram aqui — foi exatamente a conta de dias que sobrou usando `setDate` na
  // primeira passada, e é o que os testes de fuso agora travam.
  addDays,
  nextDateForWeekday,
  nextOccurrenceDate,
  moveDateToWeekday,
};
