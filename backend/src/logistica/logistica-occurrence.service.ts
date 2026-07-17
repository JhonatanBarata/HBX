import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePrincipalContatoId } from './logistica-contato.util';
import { canonicalRouteDate } from './logistica-route-billing.service';

const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo';
const OPEN_DELIVERY_STATUS = ['agendada', 'em_rota'] as const;
const MAX_SOURCE_DATES = 14;

type RecurrenceRow = {
  id: string;
  companyId: number;
  customerProfileId: string;
  productId: number;
  localId: string | null;
  qtdPadrao: number;
  precoAcordado: number | null;
  frequenciaDias: number | null;
  diasSemana: string | null;
  proximaData: Date | null;
  product: { id: number; name: string; price: number | null; priceCents: number | null } | null;
  customerProfile: {
    id: string;
    name: string | null;
    precoPadrao: number | null;
    lat: number | null;
    lng: number | null;
    geoFonte: string | null;
  } | null;
  local: {
    apelido: string | null;
    lat: number | null;
    lng: number | null;
    geoFonte: string | null;
  } | null;
};

type OccurrenceCandidate = {
  row: RecurrenceRow;
  sourceDate: string;
  itemId: string;
  nextDate: string | null;
};

export type OccurrencePreviewItem = {
  productId: number;
  nome: string;
  qtd: number;
};

export type OccurrencePreviewCustomer = {
  customerProfileId: string;
  nome: string;
  localId: string | null;
  localApelido: string | null;
  lat: number | null;
  lng: number | null;
  geoFonte: string | null;
  itens: OccurrencePreviewItem[];
};

export type OccurrencePreviewResult = {
  date: string;
  clientes: OccurrencePreviewCustomer[];
};

export type MaterializeOccurrencesResult = {
  date: string;
  sourceDates: string[];
  criadas: number;
  puladas: number;
  avancados: number;
  candidatos: number;
  deliveryIds: string[];
};

export type MaterializeOccurrencesInput = {
  operationalDate?: string;
  sourceDates?: string[];
  driverUserId?: number | null;
  actorUserId?: number | null;
};

function parseWeekdays(value: unknown): number[] {
  return Array.from(
    new Set(
      String(value || '')
        .split(',')
        .map((part) => Math.trunc(Number(part.trim())))
        .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7),
    ),
  ).sort((a, b) => a - b);
}

function dateParts(dateKey: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new BadRequestException('Data inválida. Use YYYY-MM-DD.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new BadRequestException('Data de calendário inválida.');
  }
  return { year, month, day };
}

export function addCivilDays(dateKey: string, amount: number): string {
  const { year, month, day } = dateParts(dateKey);
  const value = new Date(Date.UTC(year, month - 1, day + amount));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
}

export function isoWeekdayForDate(dateKey: string): number {
  const { year, month, day } = dateParts(dateKey);
  const js = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
  return js === 0 ? 7 : js;
}

export function saoPauloDateKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function occurrenceItemId(recurrenceId: string, sourceDate: string): string {
  return `occ_${sourceDate.replace(/-/g, '')}_${String(recurrenceId || '').trim()}`;
}

function occurrenceBusinessKey(
  sourceDate: string,
  customerProfileId: string,
  localId: string | null,
  productId: number | null | undefined,
): string {
  return `${sourceDate}\u0000${customerProfileId}\u0000${localId || ''}\u0000${Number(productId || 0)}`;
}

function candidateBusinessKey(candidate: OccurrenceCandidate): string {
  return occurrenceBusinessKey(
    candidate.sourceDate,
    candidate.row.customerProfileId,
    candidate.row.localId,
    candidate.row.productId,
  );
}

function dateRange(dateKey: string): { start: Date; end: Date } {
  const next = addCivilDays(dateKey, 1);
  const start = new Date(`${dateKey}T00:00:00-03:00`);
  const end = new Date(new Date(`${next}T00:00:00-03:00`).getTime() - 1);
  return { start, end };
}

function nextWeeklyDate(sourceDate: string, weekdays: number[]): string {
  const sourceDow = isoWeekdayForDate(sourceDate);
  for (let add = 1; add <= 7; add++) {
    const candidate = ((sourceDow - 1 + add) % 7) + 1;
    if (weekdays.includes(candidate)) return addCivilDays(sourceDate, add);
  }
  return addCivilDays(sourceDate, 7);
}

function resolveUnitValue(row: RecurrenceRow): number {
  if (typeof row.precoAcordado === 'number' && Number.isFinite(row.precoAcordado)) {
    return Math.max(0, row.precoAcordado);
  }
  if (typeof row.product?.priceCents === 'number') return Math.max(0, row.product.priceCents / 100);
  if (typeof row.product?.price === 'number') return Math.max(0, row.product.price);
  if (typeof row.customerProfile?.precoPadrao === 'number') return Math.max(0, row.customerProfile.precoPadrao);
  return 0;
}

function formatDatePt(dateKey: string): string {
  const { year, month, day } = dateParts(dateKey);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

function originNote(sourceDates: string[]): string {
  const dates = Array.from(new Set(sourceDates)).sort();
  if (dates.length === 0) return '';
  if (dates.length === 1) return `Origem recorrente: ${formatDatePt(dates[0])}.`;
  return `Origens recorrentes: ${dates.map(formatDatePt).join(', ')}.`;
}

function appendNote(current: unknown, note: string): string | null {
  const before = String(current || '').trim();
  const addition = String(note || '').trim();
  if (!addition) return before || null;
  if (before.includes(addition)) return before.slice(0, 500);
  return `${before ? `${before} | ` : ''}${addition}`.slice(0, 500);
}

function uniqueDateKeys(value: unknown, fallback: string): string[] {
  const rows = Array.isArray(value) ? value : [];
  const dates = Array.from(
    new Set(
      rows
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .map((item) => canonicalRouteDate(item)),
    ),
  ).sort();
  const result = dates.length > 0 ? dates : [fallback];
  if (result.length > MAX_SOURCE_DATES) {
    throw new BadRequestException(`Escolha no máximo ${MAX_SOURCE_DATES} datas por preparação.`);
  }
  return result;
}

function groupKey(customerProfileId: string, localId: string | null): string {
  return `${customerProfileId}\u0000${localId || ''}`;
}

function isUniqueError(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as any).code === 'P2002';
}

function consumeLegacyCoverage(
  candidates: OccurrenceCandidate[],
  deterministicIds: Set<string>,
  legacyCounts: Map<string, number>,
): Set<string> {
  const counts = new Map(legacyCounts);
  const covered = new Set<string>();
  for (const candidate of candidates) {
    if (deterministicIds.has(candidate.itemId)) continue;
    const key = candidateBusinessKey(candidate);
    const remaining = counts.get(key) || 0;
    if (remaining <= 0) continue;
    covered.add(candidate.itemId);
    counts.set(key, remaining - 1);
  }
  return covered;
}

@Injectable()
export class LogisticaOccurrenceService {
  private readonly logger = new Logger(LogisticaOccurrenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async preview(companyId: number, sourceDateInput?: string): Promise<OccurrencePreviewResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada.');
    const sourceDate = canonicalRouteDate(sourceDateInput);
    const candidates = await this.buildCandidates(companyId, [sourceDate]);
    const [existing, legacyCounts] = await Promise.all([
      this.loadExistingOccurrenceIds(this.prisma, candidates.map((candidate) => candidate.itemId)),
      this.loadLegacyOccurrenceCounts(this.prisma, companyId, [sourceDate]),
    ]);
    const legacyCovered = consumeLegacyCoverage(candidates, existing, legacyCounts);
    const groups = new Map<string, OccurrencePreviewCustomer>();

    for (const candidate of candidates) {
      if (existing.has(candidate.itemId) || legacyCovered.has(candidate.itemId)) continue;
      const row = candidate.row;
      const key = groupKey(row.customerProfileId, row.localId);
      let group = groups.get(key);
      if (!group) {
        group = {
          customerProfileId: row.customerProfileId,
          nome: String(row.customerProfile?.name || '').trim(),
          localId: row.localId ?? null,
          localApelido: row.local?.apelido ?? null,
          lat: row.local?.lat ?? row.customerProfile?.lat ?? null,
          lng: row.local?.lng ?? row.customerProfile?.lng ?? null,
          geoFonte: row.local?.geoFonte ?? row.customerProfile?.geoFonte ?? null,
          itens: [],
        };
        groups.set(key, group);
      }
      group.itens.push({
        productId: row.productId,
        nome: String(row.product?.name || '').trim(),
        qtd: Math.max(1, Math.trunc(Number(row.qtdPadrao) || 1)),
      });
    }

    return {
      date: sourceDate,
      clientes: Array.from(groups.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    };
  }

  async materialize(companyId: number, input: MaterializeOccurrencesInput = {}): Promise<MaterializeOccurrencesResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada.');
    const operationalDate = canonicalRouteDate(input.operationalDate);
    const sourceDates = uniqueDateKeys(input.sourceDates, operationalDate);
    const driverUserId = Math.trunc(Number(input.driverUserId || 0)) || null;
    const actorUserId = Math.trunc(Number(input.actorUserId || 0)) || null;

    if (driverUserId) {
      const driver = await this.prisma.user.findFirst({
        where: { id: driverUserId, companyId, isActive: true },
        select: { id: true },
      });
      if (!driver) throw new BadRequestException('Motorista inválido para esta empresa.');
    }

    const candidates = await this.buildCandidates(companyId, sourceDates);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.materializeWithinTransaction(
          companyId,
          operationalDate,
          sourceDates,
          candidates,
          driverUserId,
          actorUserId,
        );
      } catch (error) {
        if (attempt === 0 && isUniqueError(error)) continue;
        throw error;
      }
    }
    throw new BadRequestException('Não foi possível preparar as ocorrências da rota.');
  }

  private async materializeWithinTransaction(
    companyId: number,
    operationalDate: string,
    sourceDates: string[],
    candidates: OccurrenceCandidate[],
    driverUserId: number | null,
    actorUserId: number | null,
  ): Promise<MaterializeOccurrencesResult> {
    const { start, end } = dateRange(operationalDate);
    return this.prisma.$transaction(async (tx: any) => {
      await this.lockOperationalDate(tx, companyId, operationalDate);

      const existingRows = candidates.length
        ? await tx.entregaItem.findMany({
            where: { id: { in: candidates.map((candidate) => candidate.itemId) } },
            select: {
              id: true,
              entregaId: true,
              entrega: { select: { companyId: true, scheduledAt: true, status: true } },
            },
          })
        : [];
      const existingById = new Map<string, any>(
        existingRows.map((row: any): [string, any] => [String(row.id), row]),
      );
      const existingIds = new Set<string>(existingById.keys());
      const legacyCounts = await this.loadLegacyOccurrenceCounts(tx, companyId, sourceDates);
      const legacyCovered = consumeLegacyCoverage(candidates, existingIds, legacyCounts);
      const newCandidates = candidates.filter(
        (candidate) => !existingById.has(candidate.itemId) && !legacyCovered.has(candidate.itemId),
      );
      const deliveryIds = new Set<string>();

      for (const row of existingRows) {
        if (Number(row.entrega?.companyId) !== companyId) continue;
        const scheduledKey = saoPauloDateKey(row.entrega?.scheduledAt);
        if (scheduledKey === operationalDate && OPEN_DELIVERY_STATUS.includes(row.entrega?.status)) {
          deliveryIds.add(String(row.entregaId));
        }
      }

      const groups = new Map<string, OccurrenceCandidate[]>();
      for (const candidate of newCandidates) {
        const key = groupKey(candidate.row.customerProfileId, candidate.row.localId);
        const list = groups.get(key);
        if (list) list.push(candidate);
        else groups.set(key, [candidate]);
      }

      let createdDeliveries = 0;
      const advances = new Map<string, string | null>();

      for (const group of groups.values()) {
        const first = group[0].row;
        const itemRows = group.map((candidate) => ({
          id: candidate.itemId,
          productId: candidate.row.productId,
          qtdPrevista: Math.max(1, Math.trunc(Number(candidate.row.qtdPadrao) || 1)),
          valorUnit: resolveUnitValue(candidate.row),
        }));
        const note = originNote(group.map((candidate) => candidate.sourceDate));

        let delivery = await tx.entrega.findFirst({
          where: {
            companyId,
            customerProfileId: first.customerProfileId,
            localId: first.localId ?? null,
            status: { in: [...OPEN_DELIVERY_STATUS] },
            scheduledAt: { gte: start, lte: end },
            ...(driverUserId
              ? { OR: [{ entregadorId: driverUserId }, { entregadorId: null }] }
              : {}),
          },
          orderBy: { createdAt: 'asc' },
          select: { id: true, notes: true, entregadorId: true },
        });

        if (!delivery) {
          let contatoId: string | null = null;
          try {
            contatoId = await resolvePrincipalContatoId(tx, companyId, first.customerProfileId);
          } catch (error) {
            this.logger.warn(
              `[logistica] ocorrência resolvePrincipalContato company=${companyId} cliente=${first.customerProfileId}: ${String((error as any)?.message || error)}`,
            );
          }
          const quantidade = itemRows.reduce((sum, item) => sum + item.qtdPrevista, 0);
          const valor = itemRows.reduce((sum, item) => sum + item.qtdPrevista * item.valorUnit, 0);
          delivery = await tx.entrega.create({
            data: {
              companyId,
              customerProfileId: first.customerProfileId,
              contatoId,
              localId: first.localId ?? null,
              productId: first.productId,
              entregadorId: driverUserId,
              atribuidoPorUserId: driverUserId ? actorUserId : null,
              atribuidoAt: driverUserId ? new Date() : null,
              quantidade,
              valor,
              status: 'agendada',
              scheduledAt: start,
              cobrancaStatus: 'pendente',
              notes: note || null,
              itens: { create: itemRows },
            },
            select: { id: true, notes: true, entregadorId: true },
          });
          createdDeliveries++;
        } else {
          await tx.entregaItem.createMany({
            data: itemRows.map((item) => ({ ...item, entregaId: delivery.id })),
            skipDuplicates: true,
          });
          const allItems = await tx.entregaItem.findMany({
            where: { entregaId: delivery.id },
            select: { productId: true, qtdPrevista: true, valorUnit: true },
          });
          const quantidade = allItems.reduce(
            (sum: number, item: any) => sum + Math.max(0, Number(item.qtdPrevista) || 0),
            0,
          );
          const valor = allItems.reduce(
            (sum: number, item: any) =>
              sum + Math.max(0, Number(item.qtdPrevista) || 0) * Math.max(0, Number(item.valorUnit) || 0),
            0,
          );
          await tx.entrega.update({
            where: { id: delivery.id },
            data: {
              productId: allItems[0]?.productId ?? first.productId,
              quantidade,
              valor,
              scheduledAt: start,
              rotaOrdem: null,
              etaAt: null,
              notes: appendNote(delivery.notes, note),
              ...(driverUserId && !delivery.entregadorId
                ? { entregadorId: driverUserId, atribuidoPorUserId: actorUserId, atribuidoAt: new Date() }
                : {}),
            },
          });
        }

        deliveryIds.add(delivery.id);
        for (const candidate of group) advances.set(candidate.row.id, candidate.nextDate);
      }

      for (const [recurrenceId, nextDate] of advances) {
        await tx.clienteProduto.updateMany({
          where: { id: recurrenceId, companyId },
          data: { proximaData: nextDate ? dateRange(nextDate).start : null },
        });
      }

      return {
        date: operationalDate,
        sourceDates,
        criadas: createdDeliveries,
        puladas: Math.max(0, candidates.length - newCandidates.length),
        avancados: newCandidates.length,
        candidatos: candidates.length,
        deliveryIds: Array.from(deliveryIds),
      };
    });
  }

  private async buildCandidates(companyId: number, sourceDates: string[]): Promise<OccurrenceCandidate[]> {
    if (sourceDates.length === 0) return [];
    const maxDate = sourceDates[sourceDates.length - 1];
    const rows = (await this.prisma.clienteProduto.findMany({
      where: {
        companyId,
        ativo: true,
        OR: [{ proximaData: { lte: dateRange(maxDate).end } }, { diasSemana: { not: null } }],
      },
      orderBy: [{ customerProfileId: 'asc' }, { localId: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        companyId: true,
        customerProfileId: true,
        productId: true,
        localId: true,
        qtdPadrao: true,
        precoAcordado: true,
        frequenciaDias: true,
        diasSemana: true,
        proximaData: true,
        product: { select: { id: true, name: true, price: true, priceCents: true } },
        customerProfile: {
          select: { id: true, name: true, precoPadrao: true, lat: true, lng: true, geoFonte: true },
        },
        local: { select: { apelido: true, lat: true, lng: true, geoFonte: true } },
      },
    })) as RecurrenceRow[];

    const candidates: OccurrenceCandidate[] = [];
    for (const row of rows) {
      const weekdays = parseWeekdays(row.diasSemana);
      let nextKey = saoPauloDateKey(row.proximaData);
      let oneTimeConsumed = false;

      for (const sourceDate of sourceDates) {
        if (weekdays.length > 0) {
          if (!weekdays.includes(isoWeekdayForDate(sourceDate))) continue;
          candidates.push({
            row,
            sourceDate,
            itemId: occurrenceItemId(row.id, sourceDate),
            nextDate: nextWeeklyDate(sourceDate, weekdays),
          });
          continue;
        }

        if (oneTimeConsumed || !nextKey || nextKey > sourceDate) continue;
        const frequency = Math.max(0, Math.trunc(Number(row.frequenciaDias) || 0));
        const nextDate = frequency > 0 ? addCivilDays(sourceDate, frequency) : null;
        candidates.push({
          row,
          sourceDate,
          itemId: occurrenceItemId(row.id, sourceDate),
          nextDate,
        });
        nextKey = nextDate;
        if (!nextDate) oneTimeConsumed = true;
      }
    }
    return candidates;
  }

  private async loadExistingOccurrenceIds(prisma: any, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await prisma.entregaItem.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    return new Set(rows.map((row: any) => String(row.id)));
  }

  /**
   * Compatibilidade com entregas geradas antes do identificador `occ_*` existir.
   * Conta itens por data+cliente+local+produto e consome uma unidade por vínculo;
   * assim dois vínculos iguais continuam distinguíveis, sem recriar o histórico.
   */
  private async loadLegacyOccurrenceCounts(
    prisma: any,
    companyId: number,
    sourceDates: string[],
  ): Promise<Map<string, number>> {
    const dates = Array.from(new Set(sourceDates)).sort();
    if (dates.length === 0) return new Map();
    const rows = await prisma.entrega.findMany({
      where: {
        companyId,
        scheduledAt: {
          gte: dateRange(dates[0]).start,
          lte: dateRange(dates[dates.length - 1]).end,
        },
      },
      select: {
        id: true,
        scheduledAt: true,
        customerProfileId: true,
        localId: true,
        productId: true,
        itens: { select: { id: true, productId: true } },
      },
    });

    const counts = new Map<string, number>();
    for (const delivery of rows) {
      const sourceDate = saoPauloDateKey(delivery.scheduledAt);
      if (!sourceDate || !dates.includes(sourceDate)) continue;
      const legacyProducts = delivery.itens
        .filter((item: any) => !String(item.id || '').startsWith('occ_') && !String(item.id || '').startsWith('carry_'))
        .map((item: any) => Number(item.productId || 0))
        .filter((productId: number) => productId > 0);
      const productIds = legacyProducts.length > 0
        ? legacyProducts
        : Number(delivery.productId || 0) > 0
          ? [Number(delivery.productId)]
          : [];
      for (const productId of productIds) {
        const key = occurrenceBusinessKey(
          sourceDate,
          String(delivery.customerProfileId),
          delivery.localId ?? null,
          productId,
        );
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    return counts;
  }

  private async lockOperationalDate(tx: any, companyId: number, operationalDate: string): Promise<void> {
    const dateNumber = Number(operationalDate.replace(/-/g, ''));
    // pg_advisory_xact_lock retorna void. $queryRaw tenta desserializar esse
    // retorno e falha em produção antes de materializar as entregas do dia.
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock($1::int, $2::int)', companyId, dateNumber);
  }
}
