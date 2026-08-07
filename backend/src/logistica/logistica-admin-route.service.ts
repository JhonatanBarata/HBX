import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { isBillingOwnerActor } from '../access/actor-kind';
import { PrismaService } from '../prisma/prisma.service';
import {
  addCivilDays,
  isoWeekdayForDate,
  LogisticaOccurrenceService,
  saoPauloDateKey,
} from './logistica-occurrence.service';
import type { LogisticaActor } from './logistica-operacao.service';
import { canonicalRouteDate } from './logistica-route-billing.service';
import { LogisticaRotaService } from './logistica-rota.service';
import { LogisticaService } from './logistica.service';
import { DAY_ABBR, LogisticaAgendaService } from './logistica-agenda.service';
import { encerrarDiasAnteriores } from './logistica-fechamento-caixa.util';
import { formatDDMM } from './logistica-agenda-evento.util';

const OPEN_STATUS = ['agendada', 'em_rota'] as const;

export type PrepareAdminRouteInput = {
  operationalDate?: string;
  sourceDates?: string[];
  pendingDeliveryIds?: string[];
  origemLat?: number;
  origemLng?: number;
};

function dateRange(dateKey: string): { start: Date; end: Date } {
  const next = addCivilDays(dateKey, 1);
  const start = new Date(`${dateKey}T00:00:00-03:00`);
  const end = new Date(new Date(`${next}T00:00:00-03:00`).getTime() - 1);
  return { start, end };
}

function formatDatePt(dateKey: string): string {
  const [year, month, day] = dateKey.split('-');
  return `${day}/${month}/${year}`;
}

function appendNote(current: unknown, note: string): string | null {
  const before = String(current || '').trim();
  const addition = String(note || '').trim();
  if (!addition) return before || null;
  if (before.includes(addition)) return before.slice(0, 500);
  return `${before ? `${before} | ` : ''}${addition}`.slice(0, 500);
}

function actorId(actor?: LogisticaActor | null): number {
  const id = Math.trunc(Number(actor?.id || 0));
  if (!id) throw new BadRequestException('Usuário não identificado.');
  return id;
}

function normalizeIds(value: unknown, max = 100): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item || '').trim()).filter(Boolean))).slice(0, max);
}

function dayLabel(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00-03:00`);
  const weekday = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
  })
    .format(date)
    .replace('.', '');
  return weekday.charAt(0).toUpperCase() + weekday.slice(1);
}

@Injectable()
export class LogisticaAdminRouteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly occurrences: LogisticaOccurrenceService,
    private readonly rota: LogisticaRotaService,
    private readonly logistica: LogisticaService,
    private readonly agenda: LogisticaAgendaService = null as any,
  ) {}

  async getRoute(companyId: number, dateInput: string | undefined, actor: LogisticaActor) {
    const userId = actorId(actor);
    const date = canonicalRouteDate(dateInput);
    const payload: any = await this.logistica.listRota(companyId, date, actor);
    const items = Array.isArray(payload?.items)
      ? payload.items.filter((item: any) => !item?.entregador || Number(item.entregador.id) === userId)
      : [];
    return { ...payload, date, total: items.length, items };
  }

  async getAdjustments(companyId: number, dateInput: string | undefined, actor: LogisticaActor) {
    const operationalDate = canonicalRouteDate(dateInput);
    const route: any = await this.getRoute(companyId, operationalDate, actor);
    const monday = addCivilDays(operationalDate, 1 - isoWeekdayForDate(operationalDate));
    const weekDates = Array.from({ length: 7 }, (_, index) => addCivilDays(monday, index));
    const agendaV2 = Boolean(this.agenda) && await this.agenda.isAgendaV2Active(companyId);
    const previews = await Promise.all(weekDates.map(async (date) => {
      if (!agendaV2) return this.occurrences.preview(companyId, date);
      const agendaPreview = await this.agenda.getDayPreview(
        companyId,
        isoWeekdayForDate(date),
        date,
      );
      return {
        date: agendaPreview.date,
        clientes: agendaPreview.paradas.map((stop: any) => ({
          customerProfileId: stop.customerProfileId,
          itens: stop.itens ?? [],
        })),
      };
    }));
    const { start } = dateRange(operationalDate);

    const pendingRows = await this.prisma.entrega.findMany({
      where: {
        companyId,
        status: { in: [...OPEN_STATUS] },
        scheduledAt: { lt: start },
      },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
      take: 100,
      select: {
        id: true,
        scheduledAt: true,
        quantidade: true,
        customerProfile: { select: { name: true } },
        local: { select: { apelido: true } },
        itens: {
          select: {
            qtdPrevista: true,
            product: { select: { name: true } },
          },
        },
      },
    });

    const openToday = (route.items || []).filter((item: any) => OPEN_STATUS.includes(item.status));
    const missingGps = openToday.filter(
      (item: any) => typeof item?.cliente?.lat !== 'number' || typeof item?.cliente?.lng !== 'number',
    ).length;
    const todayPreview = previews.find((preview) => preview.date === operationalDate);

    return {
      operationalDate,
      today: {
        existingStops: openToday.length,
        expectedStops: todayPreview?.clientes.length || 0,
        totalStops: openToday.length + (todayPreview?.clientes.length || 0),
        missingGps,
      },
      days: previews.map((preview) => ({
        date: preview.date,
        label: dayLabel(preview.date),
        isToday: preview.date === operationalDate,
        customers: preview.clientes.length,
        items: preview.clientes.reduce((sum, customer) => sum + customer.itens.length, 0),
      })),
      pending: pendingRows.map((row) => ({
        id: row.id,
        sourceDate: saoPauloDateKey(row.scheduledAt),
        customerName: row.customerProfile?.name || 'Cliente',
        localLabel: row.local?.apelido || null,
        quantity:
          row.itens.length > 0
            ? row.itens.reduce((sum, item) => sum + Math.max(0, Number(item.qtdPrevista) || 0), 0)
            : Math.max(0, Number(row.quantidade) || 0),
        items: row.itens.map((item) => ({
          name: item.product?.name || 'Item',
          quantity: Math.max(0, Number(item.qtdPrevista) || 0),
        })),
      })),
    };
  }

  async prepare(companyId: number, input: PrepareAdminRouteInput, actor: LogisticaActor) {
    const userId = actorId(actor);
    // F0 (27/07) — FECHAMENTO DE CAIXA lazy: antes de montar, fecha sozinho
    // rota/entrega de dia que já passou e ninguém encerrou. HOJE real (nunca o
    // operationalDate pedido) — preparar a rota de amanhã com antecedência não
    // pode fechar a rota de HOJE, que ainda está rodando.
    await encerrarDiasAnteriores(this.prisma, companyId, canonicalRouteDate());
    const operationalDate = canonicalRouteDate(input?.operationalDate);
    const pendingIds = normalizeIds(input?.pendingDeliveryIds);
    const sourceDates = Array.isArray(input?.sourceDates) ? input.sourceDates : [operationalDate];

    const moved = await this.movePending(companyId, operationalDate, pendingIds, userId);
    const materialized = this.agenda && await this.agenda.isAgendaV2Active(companyId)
      ? await this.agenda.materializeForRoute(companyId, {
        operationalDate,
        sourceDates,
        driverUserId: userId,
        actorUserId: userId,
      })
      : await this.occurrences.materialize(companyId, {
        operationalDate,
        sourceDates,
        driverUserId: userId,
        actorUserId: userId,
      });

    const { start, end } = dateRange(operationalDate);
    await this.prisma.entrega.updateMany({
      where: {
        companyId,
        entregadorId: null,
        status: { in: [...OPEN_STATUS] },
        OR: [{ scheduledAt: { gte: start, lte: end } }, { scheduledAt: null }],
      },
      data: {
        entregadorId: userId,
        atribuidoPorUserId: userId,
        atribuidoAt: new Date(),
        scheduledAt: start,
      },
    });

    const openRows = await this.prisma.entrega.findMany({
      where: {
        companyId,
        entregadorId: userId,
        status: { in: [...OPEN_STATUS] },
        scheduledAt: { gte: start, lte: end },
      },
      orderBy: [{ rotaOrdem: 'asc' }, { createdAt: 'asc' }],
      take: 300,
      select: { id: true, customerProfileId: true },
    });
    // PR27072026 F2 — PARADA AMARELA DE DEVEDOR, modo EXCLUIR: a entrega do
    // devedor NÃO entra na MONTAGEM de hoje (nunca ganha rotaOrdem/etaAt aqui) —
    // filtro só na SELEÇÃO, a ocorrência CONTINUA 'agendada' (ninguém cancela
    // nada; o fechamento de caixa F0 a devolve amanhã). Fonte ÚNICA com listRota:
    // resolverDevedorNaRota (LogisticaService) — os dois nunca podem divergir.
    const devedorMap = await this.logistica.resolverDevedorNaRota(
      companyId,
      openRows.map((row) => row.customerProfileId),
    );
    const visibleRows = openRows.filter((row) => devedorMap.get(row.customerProfileId)?.modo !== 'EXCLUIR');
    const deliveryIds = visibleRows.map((row) => row.id);
    if (deliveryIds.length === 0) {
      await this.diagnosticoRotaVazia(companyId, operationalDate, start);
    }

    const plan = await this.rota.planejarRota(
      companyId,
      {
        date: operationalDate,
        origemLat: input?.origemLat,
        origemLng: input?.origemLng,
        deliveryIds,
      },
      userId,
      userId,
      false,
    );

    return {
      operationalDate,
      sourceDates: materialized.sourceDates,
      movedPending: moved.moved,
      materialized: materialized.avancados,
      skipped: materialized.puladas,
      plan,
    };
  }

  /**
   * F0 (27/07) — "O ERRO DO PREPARE QUE FALA A VERDADE". Antes, `deliveryIds`
   * vazio SEMPRE devolvia "Nenhuma parada foi encontrada para a rota de hoje" —
   * mentira quando as paradas existiam mas estavam presas numa rota de ONTEM
   * que ninguém encerrou (era exatamente o sintoma do incidente "a sexta que
   * não volta"). Diagnostica em ORDEM e lança a mensagem específica da causa
   * mais provável primeiro; SEMPRE lança (retorno `never`).
   *
   * 1) Presa numa rota de dia passado que não foi encerrada — com
   *    `encerrarDiasAnteriores` já rodando no início de `prepare`/`start`, este
   *    caso devia virar raro; o diagnóstico fica como REDE DE SEGURANÇA (ex.:
   *    empresa que ainda não passou por um `prepare` desde o deploy deste fix).
   * 2) Nenhum plano ativo pro dia da semana sendo preparado (só faz sentido na
   *    Agenda V2 — a mensagem cita `diaSemana`; empresa em modo legado cai
   *    direto no fallback 3, que já era a mensagem original).
   * 3) Planos existem mas nada foi gerado/nada ficou em aberto — mensagem
   *    original, sem mudança de comportamento pra quem já via ela.
   */
  private async diagnosticoRotaVazia(companyId: number, operationalDate: string, start: Date): Promise<never> {
    const presa = await this.prisma.entrega.findFirst({
      where: {
        companyId,
        status: 'agendada',
        agendaOcorrenciaKey: { not: null },
        scheduledAt: { lt: start },
      },
      orderBy: { scheduledAt: 'asc' },
      select: { scheduledAt: true },
    });
    const dataPresa = presa?.scheduledAt ? formatDDMM(saoPauloDateKey(presa.scheduledAt)) : null;
    if (dataPresa) {
      throw new BadRequestException(
        `As paradas estão presas na rota de ${dataPresa} que não foi encerrada. Feche o dia anterior e monte de novo.`,
      );
    }

    if (this.agenda && await this.agenda.isAgendaV2Active(companyId)) {
      const dia = isoWeekdayForDate(operationalDate);
      const temPlano = await this.prisma.logisticaPlanoEntrega.count({
        where: { companyId, diaSemana: dia, ativo: true },
      });
      if (temPlano === 0) {
        throw new BadRequestException(`Nenhum cliente tem ${DAY_ABBR[dia - 1]} como dia de entrega.`);
      }
    }

    throw new BadRequestException('Nenhuma parada foi encontrada para a rota de hoje.');
  }

  async start(companyId: number, input: PrepareAdminRouteInput, actor: LogisticaActor) {
    const userId = actorId(actor);
    // F0 (27/07) — mesmo fechamento de caixa lazy do prepare (ver comentário lá).
    await encerrarDiasAnteriores(this.prisma, companyId, canonicalRouteDate());
    const operationalDate = canonicalRouteDate(input?.operationalDate);
    const { start, end } = dateRange(operationalDate);
    const rows = await this.prisma.entrega.findMany({
      where: {
        companyId,
        entregadorId: userId,
        status: { in: [...OPEN_STATUS] },
        scheduledAt: { gte: start, lte: end },
      },
      orderBy: [{ rotaOrdem: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    if (rows.length === 0) throw new BadRequestException('Não há paradas prontas para começar.');

    return this.rota.iniciarRota(
      companyId,
      {
        date: operationalDate,
        origemLat: input?.origemLat,
        origemLng: input?.origemLng,
        deliveryIds: rows.map((row) => row.id),
      },
      userId,
      userId,
      isBillingOwnerActor(actor),
      // PROSPECTOR (07/08) — o ator inteiro (papel), ver iniciarRota.
      actor,
    );
  }

  async retryLater(companyId: number, deliveryIdInput: string, actor: LogisticaActor) {
    const userId = actorId(actor);
    const deliveryId = String(deliveryIdInput || '').trim();
    const delivery = await this.prisma.entrega.findFirst({
      where: { id: deliveryId, companyId, status: { in: [...OPEN_STATUS] } },
      select: { id: true, scheduledAt: true, entregadorId: true, notes: true },
    });
    if (!delivery) throw new NotFoundException('Entrega não encontrada.');
    const date = canonicalRouteDate(saoPauloDateKey(delivery.scheduledAt) || undefined);
    const { start, end } = dateRange(date);
    const aggregate = await this.prisma.entrega.aggregate({
      where: {
        companyId,
        entregadorId: delivery.entregadorId ?? userId,
        status: { in: [...OPEN_STATUS] },
        scheduledAt: { gte: start, lte: end },
      },
      _max: { rotaOrdem: true },
    });
    const nextOrder = Math.max(0, Number(aggregate._max.rotaOrdem ?? -1) + 1);
    await this.prisma.entrega.update({
      where: { id: delivery.id },
      data: {
        rotaOrdem: nextOrder,
        etaAt: null,
        notes: appendNote(delivery.notes, 'Nova tentativa movida para o fim da rota.'),
      },
    });
    await this.rota.recalcularEtaRestantes(companyId, start, delivery.entregadorId ?? userId);
    return { id: delivery.id, rotaOrdem: nextOrder };
  }

  async history(companyId: number, daysInput: unknown, actor: LogisticaActor) {
    actorId(actor);
    const days = Math.max(1, Math.min(30, Math.trunc(Number(daysInput) || 7)));
    const today = canonicalRouteDate();
    const firstDate = addCivilDays(today, -days);
    const start = dateRange(firstDate).start;
    const end = dateRange(today).start;
    const rows = await this.prisma.entrega.findMany({
      where: { companyId, scheduledAt: { gte: start, lt: end } },
      orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
      select: { status: true, scheduledAt: true },
    });
    const grouped = new Map<string, { date: string; total: number; delivered: number; cancelled: number; pending: number }>();
    for (const row of rows) {
      const date = saoPauloDateKey(row.scheduledAt);
      if (!date) continue;
      const current = grouped.get(date) || { date, total: 0, delivered: 0, cancelled: 0, pending: 0 };
      current.total++;
      if (row.status === 'entregue') current.delivered++;
      else if (row.status === 'cancelada') current.cancelled++;
      else current.pending++;
      grouped.set(date, current);
    }
    return {
      days: Array.from(grouped.values())
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((day) => ({
          ...day,
          label: formatDatePt(day.date),
          immutable: true,
          status: day.pending > 0 ? 'PENDENTE' : 'CONCLUÍDA',
        })),
    };
  }

  private async movePending(companyId: number, operationalDate: string, ids: string[], driverUserId: number) {
    if (ids.length === 0) return { moved: 0, deliveryIds: [] as string[] };
    const { start, end } = dateRange(operationalDate);
    const dateToken = operationalDate.replace(/-/g, '');

    return this.prisma.$transaction(async (tx: any) => {
      // A trava é executada apenas pelo efeito: o retorno void do PostgreSQL
      // não pode passar por $queryRaw, que tenta desserializá-lo no Prisma.
      await tx.$executeRawUnsafe(
        'SELECT pg_advisory_xact_lock($1::int, $2::int)',
        companyId,
        Number(dateToken),
      );
      const originals = await tx.entrega.findMany({
        where: {
          companyId,
          id: { in: ids },
          status: { in: [...OPEN_STATUS] },
          scheduledAt: { lt: start },
        },
        orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          customerProfileId: true,
          contatoId: true,
          localId: true,
          productId: true,
          quantidade: true,
          valor: true,
          scheduledAt: true,
          notes: true,
          // L4-A (18/07) — precisa pra copiar pro clone (carry-forward preserva a
          // origem da pendência original, nunca reclassifica como recorrente).
          origem: true,
          itens: {
            select: { id: true, productId: true, qtdPrevista: true, valorUnit: true },
          },
        },
      });

      let moved = 0;
      const deliveryIds = new Set<string>();
      for (const original of originals) {
        const sourceDate = saoPauloDateKey(original.scheduledAt) || operationalDate;
        const transferNote = `Pendente de ${formatDatePt(sourceDate)}.`;
        const cloneId = `carry_${dateToken}_${original.id}`;
        const existingClone = await tx.entrega.findUnique({
          where: { id: cloneId },
          select: { id: true },
        });
        if (existingClone) {
          deliveryIds.add(existingClone.id);
          continue;
        }

        let target = await tx.entrega.findFirst({
          where: {
            companyId,
            customerProfileId: original.customerProfileId,
            localId: original.localId ?? null,
            status: { in: [...OPEN_STATUS] },
            scheduledAt: { gte: start, lte: end },
            OR: [{ entregadorId: driverUserId }, { entregadorId: null }],
          },
          orderBy: { createdAt: 'asc' },
          select: { id: true, notes: true },
        });

        const itemRows = original.itens.length > 0
          ? original.itens.map((item: any) => ({
              id: `carry_${dateToken}_${item.id}`,
              productId: item.productId,
              qtdPrevista: Math.max(0, Number(item.qtdPrevista) || 0),
              valorUnit: Math.max(0, Number(item.valorUnit) || 0),
            }))
          : [{
              id: `carry_${dateToken}_${original.id}_legacy`,
              productId: original.productId,
              qtdPrevista: Math.max(1, Number(original.quantidade) || 1),
              valorUnit: Math.max(0, Number(original.valor) || 0) / Math.max(1, Number(original.quantidade) || 1),
            }];

        if (!target) {
          const quantidade = itemRows.reduce((sum: number, item: any) => sum + item.qtdPrevista, 0);
          const valor = itemRows.reduce((sum: number, item: any) => sum + item.qtdPrevista * item.valorUnit, 0);
          target = await tx.entrega.create({
            data: {
              id: cloneId,
              companyId,
              customerProfileId: original.customerProfileId,
              contatoId: original.contatoId,
              localId: original.localId,
              productId: original.productId,
              entregadorId: driverUserId,
              atribuidoPorUserId: driverUserId,
              atribuidoAt: new Date(),
              quantidade,
              valor,
              status: 'agendada',
              // L4-A (18/07) — carry-forward: clone é a MESMA entrega pendente,
              // só movida de dia; herda a origem (nunca reclassifica).
              origem: original.origem ?? null,
              scheduledAt: start,
              cobrancaStatus: 'pendente',
              notes: appendNote(original.notes, transferNote),
              itens: { create: itemRows },
            },
            select: { id: true, notes: true },
          });
        } else {
          await tx.entregaItem.createMany({
            data: itemRows.map((item: any) => ({ ...item, entregaId: target.id })),
            skipDuplicates: true,
          });
          const allItems = await tx.entregaItem.findMany({
            where: { entregaId: target.id },
            select: { productId: true, qtdPrevista: true, valorUnit: true },
          });
          const quantidade = allItems.reduce((sum: number, item: any) => sum + Math.max(0, Number(item.qtdPrevista) || 0), 0);
          const valor = allItems.reduce(
            (sum: number, item: any) => sum + Math.max(0, Number(item.qtdPrevista) || 0) * Math.max(0, Number(item.valorUnit) || 0),
            0,
          );
          await tx.entrega.update({
            where: { id: target.id },
            data: {
              quantidade,
              valor,
              productId: allItems[0]?.productId ?? original.productId,
              entregadorId: driverUserId,
              atribuidoPorUserId: driverUserId,
              atribuidoAt: new Date(),
              rotaOrdem: null,
              etaAt: null,
              notes: appendNote(target.notes, transferNote),
            },
          });
        }

        await tx.entrega.update({
          where: { id: original.id },
          data: {
            status: 'cancelada',
            startedAt: null,
            notes: appendNote(original.notes, `Transferida para a rota de ${formatDatePt(operationalDate)}.`),
          },
        });
        moved++;
        deliveryIds.add(target.id);
      }
      return { moved, deliveryIds: Array.from(deliveryIds) };
    });
  }
}
