import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  AgendaPlanoItemDto,
  CreateAgendaPlanoDto,
  ExecutarAgendaDiaAcaoDto,
  ReordenarAgendaDiaDto,
  UpdateAgendaPlanoDto,
} from './dto/logistica-agenda.dto';
import { resolvePrincipalContatoId } from './logistica-contato.util';
import { parseDateOrNull, resolveValorUnit } from './logistica-recorrencia.service';

const DAY_NAMES = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'] as const;
const PRESERVED_ROUTE_STATUS = ['em_rota'] as const;
const FINISHED_DELIVERY_STATUS = ['entregue', 'cancelada'] as const;

type AgendaMode = 'LEGADO' | 'AGENDA_V2';
type AgendaFrequency = 'SEMANAL' | 'QUINZENAL' | 'INTERVALO';

type LegacyGroup = {
  id: string;
  key: string;
  customerProfileId: string;
  localId: string | null;
  diaSemana: number;
  frequencia: AgendaFrequency;
  intervaloDias: number | null;
  proximaData: Date | null;
  cliente: any;
  local: any;
  itens: Array<{
    productId: number;
    nome: string;
    qtd: number;
    valorUnit: number;
  }>;
};

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
  legacyGroups?: LegacyGroup[];
  legacyWarnings?: unknown[];
};

type DbLike = PrismaService | any;

@Injectable()
export class LogisticaAgendaService {
  constructor(private readonly prisma: PrismaService) {}

  async isAgendaV2Active(companyId: number): Promise<boolean> {
    this.assertCompany(companyId);
    const config = await this.prisma.logisticaConfig.findUnique({
      where: { companyId },
      select: { agendaV2Ativa: true },
    });
    return config?.agendaV2Ativa === true;
  }

  async getSummary(companyId: number) {
    this.assertCompany(companyId);
    const context = await this.getContext(companyId);
    if (context.mode === 'LEGADO') {
      return this.getLegacySummary(companyId, context);
    }

    const [plans, routes] = await Promise.all([
      this.prisma.logisticaPlanoEntrega.findMany({
        where: { companyId },
        select: {
          id: true,
          customerProfileId: true,
          diaSemana: true,
          ativo: true,
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

    return {
      modo: context.mode,
      agendaV2Ativa: true,
      migracao: context.migration,
      dias: DAY_NAMES.map((nome, index) => {
        const day = index + 1;
        const dayPlans = plans.filter((plan) => plan.diaSemana === day);
        const route = routes.find((item) => item.diaSemana === day) ?? null;
        return {
          diaSemana: day,
          nome,
          ativo: route ? route.ativo : dayPlans.some((plan) => plan.ativo),
          rota: route ? routeDto(route) : null,
          totalPlanos: dayPlans.length,
          totalParadas: route?._count?.paradas ?? dayPlans.length,
          totalClientes: new Set(dayPlans.map((plan) => plan.customerProfileId)).size,
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
    if (context.mode === 'LEGADO') {
      return this.getLegacyDay(companyId, day, context);
    }

    const [plans, route] = await Promise.all([
      this.prisma.logisticaPlanoEntrega.findMany({
        where: { companyId, diaSemana: day },
        include: planInclude(),
        orderBy: [{ ativo: 'desc' }, { createdAt: 'asc' }],
      }),
      this.prisma.logisticaRotaModelo.findFirst({
        where: { companyId, tipo: 'SEMANAL', diaSemana: day },
        include: {
          paradas: {
            orderBy: { ordem: 'asc' },
            include: { itens: { orderBy: { createdAt: 'asc' } } },
          },
        },
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
      paradas: ordered,
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

  private async getContext(companyId: number): Promise<AgendaContext> {
    const config = await this.prisma.logisticaConfig.findUnique({
      where: { companyId },
      select: { agendaV2Ativa: true, diasTrabalho: true },
    });
    const active = config?.agendaV2Ativa === true;
    const diasTrabalho = parseWeekdays(config?.diasTrabalho);
    if (active) {
      return {
        mode: 'AGENDA_V2',
        active: true,
        diasTrabalho,
        migration: {
          necessaria: false,
          totalVinculos: 0,
          totalPlanosProjetados: 0,
          avisos: [],
        },
      };
    }

    const legacy = await this.loadLegacyGroups(companyId);
    return {
      mode: 'LEGADO',
      active: false,
      diasTrabalho,
      migration: {
        necessaria: legacy.totalLinks > 0,
        totalVinculos: legacy.totalLinks,
        totalPlanosProjetados: legacy.groups.length,
        avisos: legacy.warnings,
      },
      legacyGroups: legacy.groups,
      legacyWarnings: legacy.warnings,
    };
  }

  private async getLegacySummary(companyId: number, context: AgendaContext) {
    const groups = context.legacyGroups ?? [];
    const routes = await this.prisma.logisticaRotaModelo.findMany({
      where: { companyId },
      select: { id: true, nome: true, diaSemana: true, ativo: true, versao: true, paradasJson: true },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      modo: context.mode,
      agendaV2Ativa: false,
      migracao: context.migration,
      dias: DAY_NAMES.map((nome, index) => {
        const day = index + 1;
        const dayGroups = groups.filter((group) => group.diaSemana === day);
        const route = routes.find((item) => item.diaSemana === day) ?? null;
        return {
          diaSemana: day,
          nome,
          ativo: context.diasTrabalho.length
            ? context.diasTrabalho.includes(day)
            : dayGroups.length > 0,
          rota: route ? legacyRouteDto(route) : null,
          totalPlanos: dayGroups.length,
          totalParadas: dayGroups.length,
          totalClientes: new Set(dayGroups.map((group) => group.customerProfileId)).size,
          avisos: [],
        };
      }),
    };
  }

  private async getLegacyDay(companyId: number, day: number, context: AgendaContext) {
    const groups = (context.legacyGroups ?? []).filter((group) => group.diaSemana === day);
    const route = await this.prisma.logisticaRotaModelo.findFirst({
      where: { companyId, diaSemana: day },
      select: { id: true, nome: true, diaSemana: true, ativo: true, versao: true, paradasJson: true },
      orderBy: { updatedAt: 'desc' },
    });
    const ordered = orderLegacyGroups(groups, route?.paradasJson);
    const plans = ordered.map((group) => legacyPlanDto(group));
    const stops = plans.map((plan, index) => ({
      ...plan,
      id: `parada:${plan.id}`,
      ordem: index + 1,
      ordemTravada: true,
      planoEntregaId: plan.id,
    }));

    return {
      modo: context.mode,
      agendaV2Ativa: false,
      migracao: context.migration,
      diaSemana: day,
      nome: DAY_NAMES[day - 1],
      ativo: context.diasTrabalho.length ? context.diasTrabalho.includes(day) : plans.length > 0,
      rota: route ? legacyRouteDto(route) : null,
      planos: plans,
      paradas: stops,
      totais: {
        planos: plans.length,
        paradas: stops.length,
        clientes: new Set(plans.map((plan) => plan.customerProfileId)).size,
        itens: plans.reduce((total, plan) => total + plan.itens.length, 0),
      },
      avisos: context.legacyWarnings ?? [],
    };
  }

  private async loadLegacyGroups(companyId: number): Promise<{
    groups: LegacyGroup[];
    warnings: unknown[];
    totalLinks: number;
  }> {
    const links = await this.prisma.clienteProduto.findMany({
      where: { companyId, ativo: true },
      include: {
        customerProfile: {
          select: {
            id: true,
            name: true,
            endereco: true,
            numero: true,
            bairro: true,
            cidade: true,
            uf: true,
            cep: true,
            lat: true,
            lng: true,
            precoPadrao: true,
          },
        },
        local: { select: localSelect() },
        product: { select: { id: true, name: true, price: true, priceCents: true } },
      },
      orderBy: [{ customerProfileId: 'asc' }, { createdAt: 'asc' }],
    });

    const map = new Map<string, LegacyGroup>();
    const warnings: unknown[] = [];
    let unscheduled = 0;
    let adjustedIntervals = 0;

    for (const link of links) {
      const days = legacyLinkDays(link);
      if (!days.length) {
        unscheduled += 1;
        continue;
      }
      const cadence = legacyCadence(link);
      if (
        !parseWeekdays(link.diasSemana).length
        && cadence.frequency === 'INTERVALO'
        && Math.trunc(Number(link.frequenciaDias)) !== cadence.intervalDays
      ) {
        adjustedIntervals += 1;
      }
      for (const day of days) {
        const nextDate = parseWeekdays(link.diasSemana).length
          ? null
          : link.proximaData ?? null;
        const cadencePhase = legacyCadencePhase(cadence, link.proximaData);
        const key = [
          link.customerProfileId,
          link.localId || '',
          day,
          cadence.frequency,
          cadence.intervalDays || '',
          cadencePhase,
        ].join('|');
        let group = map.get(key);
        if (!group) {
          group = {
            id: virtualLegacyId(key),
            key,
            customerProfileId: link.customerProfileId,
            localId: link.localId ?? null,
            diaSemana: day,
            frequencia: cadence.frequency,
            intervaloDias: cadence.intervalDays,
            proximaData: nextDate,
            cliente: link.customerProfile,
            local: link.local ?? null,
            itens: [],
          };
          map.set(key, group);
        }
        if (nextDate && (!group.proximaData || nextDate < group.proximaData)) {
          group.proximaData = nextDate;
        }
        group.itens.push({
          productId: link.productId,
          nome: link.product?.name || 'Produto',
          qtd: Math.max(1, Math.trunc(Number(link.qtdPadrao) || 1)),
          valorUnit: resolveValorUnit(link as any),
        });
      }
    }

    if (unscheduled) {
      warnings.push({
        codigo: 'VINCULO_SEM_DIA',
        mensagem: `${unscheduled} vínculo(s) sem dia continuam fora da agenda.`,
      });
    }
    if (adjustedIntervals) {
      warnings.push({
        codigo: 'INTERVALO_AJUSTADO_A_ROTA',
        mensagem: `${adjustedIntervals} vínculo(s) por dias corridos serão ajustados para semanas completas.`,
      });
    }
    return { groups: [...map.values()], warnings, totalLinks: links.length };
  }

  async createPlan(companyId: number, input: CreateAgendaPlanoDto) {
    this.assertCompany(companyId);
    const activateAgenda = await this.assertCanWriteAgenda(companyId);
    const normalized = await this.normalizePlanInput(companyId, input);

    const created = await this.prisma.$transaction(async (tx) => {
      if (activateAgenda) {
        const legacyWithSchedule = await tx.clienteProduto.count({
          where: {
            companyId,
            ativo: true,
            OR: [
              { diasSemana: { not: null } },
              { proximaData: { not: null } },
            ],
          },
        });
        if (legacyWithSchedule > 0) {
          throw new ConflictException('Organize os cadastros atuais antes de editar a nova Agenda.');
        }
        await tx.logisticaConfig.upsert({
          where: { companyId },
          update: { agendaV2Ativa: true },
          create: { companyId, agendaV2Ativa: true },
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
            create: normalized.items.map((item) => ({
              companyId,
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
      await this.syncRouteMirror(tx, companyId, route.id, true);
      return plan.id;
    });

    return this.getPlanOrThrow(companyId, created);
  }

  async updatePlan(companyId: number, id: string, input: UpdateAgendaPlanoDto) {
    this.assertCompany(companyId);
    await this.assertAgendaV2(companyId);
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
                create: normalized.items.map((item) => ({
                  companyId,
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
        await this.syncRouteMirror(tx, companyId, oldStop.rotaModeloId, true);
      }

      const targetRoute = await this.ensureDayRoute(tx, companyId, normalized.diaSemana);
      const targetOrder = oldStop && existing.diaSemana === normalized.diaSemana
        ? Math.min(oldStop.ordem, await nextRouteOrder(tx, targetRoute.id))
        : await nextRouteOrder(tx, targetRoute.id);
      await makeOrderSlot(tx, targetRoute.id, targetOrder);
      await this.createRouteStop(tx, companyId, targetRoute.id, targetOrder, existing.id, normalized);
      await compactRouteOrders(tx, targetRoute.id);
      await this.syncRouteMirror(tx, companyId, targetRoute.id, true);
    });

    return this.getPlanOrThrow(companyId, existing.id);
  }

  async reorderDay(companyId: number, dayInput: unknown, input: ReordenarAgendaDiaDto) {
    this.assertCompany(companyId);
    const day = normalizeWeekday(dayInput);
    await this.assertAgendaV2(companyId);
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
      await this.syncRouteMirror(tx, companyId, route.id, true);
    });

    return this.getDay(companyId, day);
  }

  async getLegacyPreview(companyId: number) {
    this.assertCompany(companyId);
    const context = await this.getContext(companyId);
    if (context.active) {
      return {
        agendaV2Ativa: true,
        totalVinculos: 0,
        totalPlanos: 0,
        totalItens: 0,
        dias: [],
        avisos: [{ codigo: 'AGENDA_JA_ATIVA', mensagem: 'A agenda já está organizada.' }],
        podeAplicar: false,
      };
    }
    const groups = context.legacyGroups ?? [];
    return {
      agendaV2Ativa: false,
      totalVinculos: context.migration.totalVinculos,
      totalPlanos: groups.length,
      totalItens: groups.reduce((total, group) => total + group.itens.length, 0),
      dias: DAY_NAMES.map((_, index) => {
        const day = index + 1;
        const dayGroups = groups.filter((group) => group.diaSemana === day);
        return {
          diaSemana: day,
          totalPlanos: dayGroups.length,
          totalItens: dayGroups.reduce((total, group) => total + group.itens.length, 0),
        };
      }),
      avisos: context.legacyWarnings ?? [],
      podeAplicar: true,
    };
  }

  async applyLegacy(companyId: number, userId: number, idempotencyKeyInput: string) {
    this.assertCompany(companyId);
    const userIdValue = await this.resolveAuditUserId(companyId, userId);
    const idempotencyKey = normalizeIdempotencyKey(idempotencyKeyInput);
    const requestHash = hashPayload({ acao: 'IMPORTAR_LEGADO' });
    const replay = await this.findActionReplay(companyId, idempotencyKey, requestHash);
    if (replay) return { ...(replay.resultadoJson as any), replayed: true };

    const context = await this.getContext(companyId);
    if (context.active) throw new ConflictException('A agenda já está organizada.');
    const groups = context.legacyGroups ?? [];

    try {
      return await this.prisma.$transaction(async (tx) => {
        const config = await tx.logisticaConfig.findUnique({
          where: { companyId },
          select: { agendaV2Ativa: true, diasTrabalho: true },
        });
        if (config?.agendaV2Ativa) throw new ConflictException('A agenda já está organizada.');

        const routeByDay = new Map<number, any>();
        let routesCreated = 0;
        let routesReused = 0;
        let plansCreated = 0;
        let itemsCreated = 0;

        for (let day = 1; day <= 7; day += 1) {
          if (!groups.some((group) => group.diaSemana === day)) continue;
          const existingRoute = await tx.logisticaRotaModelo.findFirst({
            where: { companyId, diaSemana: day },
            orderBy: { updatedAt: 'desc' },
          });
          if (existingRoute) {
            routeByDay.set(day, await tx.logisticaRotaModelo.update({
              where: { id: existingRoute.id },
              data: {
                tipo: 'SEMANAL',
                ativo: parseWeekdays(config?.diasTrabalho).length
                  ? parseWeekdays(config?.diasTrabalho).includes(day)
                  : groups.some((group) => group.diaSemana === day),
                versao: { increment: 1 },
              },
            }));
            routesReused += 1;
          } else if (groups.some((group) => group.diaSemana === day)) {
            routeByDay.set(day, await tx.logisticaRotaModelo.create({
              data: {
                companyId,
                nome: `Rota de ${DAY_NAMES[day - 1]}`,
                diaSemana: day,
                tipo: 'SEMANAL',
                ativo: parseWeekdays(config?.diasTrabalho).length
                  ? parseWeekdays(config?.diasTrabalho).includes(day)
                  : true,
                versao: 1,
                paradasJson: [],
              },
            }));
            routesCreated += 1;
          }
        }

        for (const [day, route] of routeByDay) {
          const existingJson = route.paradasJson;
          const dayGroups = orderLegacyGroups(
            groups.filter((group) => group.diaSemana === day),
            existingJson,
          );
          await tx.logisticaRotaModeloParada.deleteMany({
            where: { companyId, rotaModeloId: route.id },
          });
          let order = 1;
          for (const group of dayGroups) {
            const plan = await tx.logisticaPlanoEntrega.upsert({
              where: {
                companyId_legadoChave: {
                  companyId,
                  legadoChave: group.key,
                },
              },
              update: {},
              create: {
                companyId,
                customerProfileId: group.customerProfileId,
                localId: group.localId,
                diaSemana: group.diaSemana,
                frequencia: group.frequencia,
                intervaloDias: group.intervaloDias,
                proximaData: group.proximaData,
                ativo: true,
                origem: 'LEGADO',
                legadoChave: group.key,
                itens: {
                  create: group.itens.map((item) => ({
                    companyId,
                    productId: item.productId,
                    qtd: item.qtd,
                    valorUnit: item.valorUnit,
                  })),
                },
              },
              include: { itens: true },
            });
            plansCreated += 1;
            itemsCreated += plan.itens.length;
            await tx.logisticaRotaModeloParada.create({
              data: {
                companyId,
                rotaModeloId: route.id,
                planoEntregaId: plan.id,
                customerProfileId: group.customerProfileId,
                localId: group.localId,
                ordem: order,
                ordemTravada: true,
                itens: {
                  create: group.itens.map((item) => ({
                    companyId,
                    productId: item.productId,
                    produtoNomeSnapshot: item.nome.slice(0, 140),
                    qtd: item.qtd,
                    valorUnit: item.valorUnit,
                  })),
                },
              },
            });
            order += 1;
          }
          await this.syncRouteMirror(tx, companyId, route.id, false);
        }

        await tx.logisticaConfig.upsert({
          where: { companyId },
          update: { agendaV2Ativa: true },
          create: { companyId, agendaV2Ativa: true },
        });

        const action = await tx.logisticaAgendaAcao.create({
          data: {
            companyId,
            idempotencyKey,
            requestHash,
            acao: 'IMPORTAR_LEGADO',
            diaOrigem: 0,
            dataInicio: new Date(),
            entregasAbertas: 'MANTER',
            executadoPorUserId: userIdValue,
            resultadoJson: {},
          },
        });
        const result = {
          acaoId: action.id,
          idempotencyKey,
          replayed: false,
          planosCriados: plansCreated,
          itensCriados: itemsCreated,
          rotasCriadas: routesCreated,
          rotasAproveitadas: routesReused,
          agendaV2Ativa: true as const,
          avisos: context.legacyWarnings ?? [],
        };
        await tx.logisticaAgendaAcao.update({
          where: { id: action.id },
          data: { resultadoJson: result as any },
        });
        return result;
      }, { isolationLevel: 'Serializable' });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const replayAfterRace = await this.findActionReplay(companyId, idempotencyKey, requestHash);
        if (replayAfterRace) return { ...(replayAfterRace.resultadoJson as any), replayed: true };
      }
      throw error;
    }
  }

  async getActionPreview(
    companyId: number,
    dayInput: unknown,
    actionInput: unknown,
    destinationInput?: unknown,
    startInput?: string,
  ) {
    this.assertCompany(companyId);
    await this.assertAgendaV2(companyId);
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
    await this.assertAgendaV2(companyId);
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

    try {
      return await this.prisma.$transaction(async (tx) => {
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
            await this.syncRouteMirror(tx, companyId, sourceRoute.id, false);
          }
          await this.syncRouteMirror(tx, companyId, targetRoute.id, true);

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
    await this.assertAgendaV2(companyId);
    const date = parseOperationalDate(dateInput);
    const day = isoWeekday(date);
    const plans = await this.prisma.logisticaPlanoEntrega.findMany({
      where: { companyId, diaSemana: day, ativo: true },
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
    let advanced = 0;

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
        const next = nextOccurrenceDate(plan, date);
        await this.prisma.logisticaPlanoEntrega.updateMany({
          where: {
            id: plan.id,
            companyId,
            OR: [{ proximaData: null }, { proximaData: { lte: date } }],
          },
          data: { proximaData: next },
        });
        continue;
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

      const next = nextOccurrenceDate(plan, date);
      const progressed = await this.prisma.logisticaPlanoEntrega.updateMany({
        where: {
          id: plan.id,
          companyId,
          OR: [{ proximaData: null }, { proximaData: { lte: date } }],
        },
        data: { proximaData: next },
      });
      advanced += progressed.count;
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
    await this.assertAgendaV2(companyId);
    const operationalDate = parseOperationalDate(input.operationalDate);
    const sourceDates = [...new Set(
      (Array.isArray(input.sourceDates) && input.sourceDates.length
        ? input.sourceDates
        : [dateKey(operationalDate)])
        .map((value) => dateKey(parseOperationalDate(value))),
    )].slice(0, 7);
    const driverId = normalizeOptionalUserId(input.driverUserId);
    const actorId = normalizeOptionalUserId(input.actorUserId);
    const deliveryIds = new Set<string>();
    let created = 0;
    let skipped = 0;
    let advanced = 0;
    const warnings: string[] = [];

    for (const sourceDate of sourceDates) {
      const result = await this.generateDay(companyId, sourceDate);
      result.deliveryIds.forEach((id) => deliveryIds.add(id));
      created += result.criadas;
      skipped += result.puladas;
      advanced += result.avancados;
      warnings.push(...result.avisos);
    }

    if (deliveryIds.size) {
      await this.prisma.entrega.updateMany({
        where: {
          id: { in: [...deliveryIds] },
          companyId,
          status: 'agendada',
          rotaOrdem: null,
          logisticaRouteStop: null,
          ...(driverId
            ? { OR: [{ entregadorId: null }, { entregadorId: driverId }] }
            : {}),
        },
        data: {
          scheduledAt: operationalDate,
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

  private async assertAgendaV2(companyId: number) {
    if (!(await this.isAgendaV2Active(companyId))) {
      throw new ConflictException('Organize os cadastros atuais antes de editar a nova Agenda.');
    }
  }

  /**
   * Criar o primeiro plano é uma ação explícita. Em empresa realmente vazia,
   * ela também inaugura a Agenda V2; havendo vínculos antigos com dia, exige a
   * importação consciente para não deixar parte da operação para trás.
   */
  private async assertCanWriteAgenda(companyId: number): Promise<boolean> {
    if (await this.isAgendaV2Active(companyId)) return false;
    const legacyWithSchedule = await this.prisma.clienteProduto.count({
      where: {
        companyId,
        ativo: true,
        OR: [
          { diasSemana: { not: null } },
          { proximaData: { not: null } },
        ],
      },
    });
    if (legacyWithSchedule > 0) {
      throw new ConflictException('Organize os cadastros atuais antes de editar a nova Agenda.');
    }
    return true;
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
        paradasJson: [],
      },
    });
  }

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
        ...normalized.schedule,
        itens: {
          create: normalized.items.map((item: any) => ({
            companyId,
            productId: item.productId,
            produtoNomeSnapshot: String(item.nome || 'Produto').slice(0, 140),
            qtd: item.qtd,
            valorUnit: item.valorUnit,
          })),
        },
      },
    });
  }

  private async syncRouteMirror(tx: any, companyId: number, routeId: string, incrementVersion: boolean) {
    const route = await tx.logisticaRotaModelo.findFirst({
      where: { id: routeId, companyId },
      include: {
        paradas: {
          orderBy: { ordem: 'asc' },
          include: { itens: { orderBy: { createdAt: 'asc' } } },
        },
      },
    });
    if (!route) return;
    const mirror = route.paradas.map((stop: any) => ({
      customerProfileId: stop.customerProfileId,
      ...(stop.localId ? { localId: stop.localId } : {}),
      ...(stop.janelaInicio ? { horaRef: stop.janelaInicio } : {}),
      itens: stop.itens.map((item: any) => ({
        productId: item.productId,
        qtd: item.qtd,
        valorUnit: Number(item.valorUnit || 0),
      })),
      ...(stop.planoEntregaId ? { planoEntregaId: stop.planoEntregaId } : {}),
    }));
    await tx.logisticaRotaModelo.update({
      where: { id: route.id },
      data: {
        paradasJson: mirror,
        ...(incrementVersion ? { versao: { increment: 1 } } : {}),
      },
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

function planInclude() {
  return {
    customerProfile: {
      select: {
        id: true,
        name: true,
        endereco: true,
        numero: true,
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

function localSelect() {
  return {
    id: true,
    apelido: true,
    endereco: true,
    numero: true,
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

function legacyPlanDto(group: LegacyGroup) {
  return {
    id: group.id,
    revisao: 0,
    ativo: true,
    customerProfileId: group.customerProfileId,
    localId: group.localId,
    diaSemana: group.diaSemana,
    frequencia: group.frequencia,
    intervaloDias: group.intervaloDias,
    proximaData: group.proximaData?.toISOString() ?? null,
    cliente: clienteDto({ id: group.customerProfileId, ...(group.cliente || {}) }),
    local: group.local ? addressDto(group.local) : null,
    itens: group.itens,
    janela: null,
    tempoParadaMin: null,
    instrucoes: null,
    acesso: accessDto(group.local),
    adicional: null,
    origem: 'LEGADO' as const,
  };
}

function stopDto(stop: any, plan: any) {
  return {
    ...plan,
    id: stop.id,
    ordem: stop.ordem,
    ordemTravada: stop.ordemTravada,
    planoEntregaId: plan.id,
    janela: windowDto(stop) ?? plan.janela,
    tempoParadaMin: stop.tempoParadaMin ?? plan.tempoParadaMin,
    instrucoes: stop.instrucoes ?? plan.instrucoes,
    acesso: accessDto(stop) ?? plan.acesso,
    adicional: additionalDto(stop) ?? plan.adicional,
    itens: stop.itens?.length
      ? stop.itens.map((item: any) => ({
        id: item.id,
        productId: item.productId,
        nome: item.produtoNomeSnapshot,
        qtd: item.qtd,
        valorUnit: Number(item.valorUnit || 0),
      }))
      : plan.itens,
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

function routeDto(route: any) {
  return {
    id: route.id,
    nome: route.nome,
    tipo: 'SEMANAL' as const,
    ativo: route.ativo,
    versao: route.versao,
  };
}

function legacyRouteDto(route: any) {
  return {
    id: route.id,
    nome: route.nome,
    tipo: 'SEMANAL' as const,
    ativo: route.ativo !== false,
    versao: Number(route.versao || 1),
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
    bairro: profile.bairro ?? null,
    cidade: profile.cidade ?? null,
    uf: profile.uf ?? null,
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

function legacyLinkDays(link: any): number[] {
  const explicit = parseWeekdays(link.diasSemana);
  if (explicit.length) return explicit;
  if (link.proximaData instanceof Date) return [isoWeekday(link.proximaData)];
  return [];
}

function legacyCadence(link: any): { frequency: AgendaFrequency; intervalDays: number | null } {
  if (parseWeekdays(link.diasSemana).length) {
    return { frequency: 'SEMANAL', intervalDays: null };
  }
  const days = Math.trunc(Number(link.frequenciaDias));
  if (days === 14) return { frequency: 'QUINZENAL', intervalDays: null };
  if (days > 0 && days !== 7) {
    return {
      frequency: 'INTERVALO',
      intervalDays: Math.min(364, Math.max(7, Math.ceil(days / 7) * 7)),
    };
  }
  return { frequency: 'SEMANAL', intervalDays: null };
}

function virtualLegacyId(key: string): string {
  return `legado:${createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
}

function orderLegacyGroups(groups: LegacyGroup[], paradasJson: unknown): LegacyGroup[] {
  const list = [...groups];
  const stops = Array.isArray(paradasJson) ? paradasJson as any[] : [];
  const rank = new Map<string, number>();
  stops.forEach((stop, index) => {
    const key = `${String(stop?.customerProfileId ?? '')}:${String(stop?.localId ?? '')}`;
    if (!rank.has(key)) rank.set(key, index);
  });
  return list.sort((a, b) => {
    const aRank = rank.get(`${a.customerProfileId}:${a.localId || ''}`);
    const bRank = rank.get(`${b.customerProfileId}:${b.localId || ''}`);
    if (aRank != null || bRank != null) return (aRank ?? Number.MAX_SAFE_INTEGER) - (bRank ?? Number.MAX_SAFE_INTEGER);
    return String(a.cliente?.name || '').localeCompare(String(b.cliente?.name || ''), 'pt-BR');
  });
}

function parseOperationalDate(value?: string): Date {
  const parsed = parseDateOrNull(value);
  const date = parsed ?? new Date();
  if (value && !parsed) throw new BadRequestException('Data inválida. Use YYYY-MM-DD.');
  return startOfDay(date);
}

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function isoWeekday(date: Date): number {
  return date.getDay() || 7;
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

function legacyCadencePhase(
  cadence: { frequency: AgendaFrequency; intervalDays: number | null },
  nextDate: Date | null | undefined,
): string {
  if (!nextDate) return '';
  const anchor = startOfDay(nextDate);
  if (cadence.frequency === 'QUINZENAL') {
    return String(Math.floor(anchor.getTime() / (7 * 86_400_000)) % 2);
  }
  if (cadence.frequency === 'INTERVALO') return dateKey(anchor);
  return '';
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

function normalizedFromPlan(plan: any, day: number) {
  return {
    customerProfileId: plan.customerProfileId,
    localId: plan.localId ?? null,
    diaSemana: day,
    items: (plan.itens ?? []).map((item: any) => ({
      productId: item.productId,
      nome: item.product?.name || 'Produto',
      qtd: item.qtd,
      valorUnit: Number(item.valorUnit || 0),
    })),
    schedule: {
      janelaInicio: plan.janelaInicio ?? null,
      janelaFim: plan.janelaFim ?? null,
      janelaTipo: plan.janelaTipo ?? null,
      tempoParadaMin: plan.tempoParadaMin ?? null,
      instrucoes: plan.instrucoes ?? null,
      acessoTipo: plan.acessoTipo ?? null,
      acessoAndares: plan.acessoAndares ?? null,
      acessoTemElevador: plan.acessoTemElevador ?? null,
      acessoObservacao: plan.acessoObservacao ?? null,
      adicionalTipo: plan.adicionalTipo ?? null,
      adicionalValor: plan.adicionalValor ?? null,
      adicionalMotivo: plan.adicionalMotivo ?? null,
    },
  };
}

function moveDateToWeekday(value: Date, destination: number): Date {
  const result = startOfDay(new Date(value));
  const delta = (destination - isoWeekday(result) + 7) % 7;
  result.setDate(result.getDate() + (delta || 7));
  return result;
}

function nextOccurrenceDate(plan: any, current: Date): Date {
  const base = startOfDay(current);
  const interval = plan.frequencia === 'QUINZENAL'
    ? 14
    : plan.frequencia === 'INTERVALO'
      ? Math.max(1, Math.trunc(Number(plan.intervaloDias) || 1))
      : 7;
  base.setDate(base.getDate() + interval);
  while (isoWeekday(base) !== Number(plan.diaSemana)) {
    base.setDate(base.getDate() + 1);
  }
  return base;
}
