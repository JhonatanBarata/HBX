import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isBillingOwnerActor } from '../access/actor-kind';
import { PrismaService } from '../prisma/prisma.service';
import { resolveOperationalCapabilities } from '../team/operational-capabilities';
import { LogisticaOperacaoService, isLogisticaAdmin, type LogisticaActor } from './logistica-operacao.service';
import { canonicalRouteDate } from './logistica-route-billing.util';
import { lockLogisticaRouteTransaction } from './logistica-route-lock';
import { LogisticaRotaCobrancaService } from './logistica-rota-cobranca.service';
import { LogisticaRotaService } from './logistica-rota.service';
import { LogisticaService } from './logistica.service';

const OPEN = ['agendada', 'em_rota'] as const;
const MAX_CONTINUITY_STOPS = 300;

type DeliverySnapshot = {
  id: string;
  status: string;
  entregadorId: number | null;
  scheduledAt: Date | null;
  rotaOrdem: number | null;
  startedAt: Date | null;
  arrivedAt: Date | null;
  entregador?: { name?: string | null; username?: string | null; email?: string | null } | null;
};

type ContinuityTarget = {
  ref: string;
  kind: 'route' | 'draft';
  routeId: string | null;
  routeDate: string;
  effectiveDate: string | null;
  ownerId: number;
  sourceOwnerId: number;
  ownerName: string;
  routeStatus: string | null;
  operationalEndedAt: Date | null;
  routeStartedAt: Date | null;
  parked: boolean;
  deliveries: DeliverySnapshot[];
};

export type RotaContinuidadeItem = {
  ref: string;
  routeId: string | null;
  date: string;
  owner: { id: number; name: string };
  total: number;
  delivered: number;
  remaining: number;
  state: 'planned' | 'started' | 'ended_with_pending';
  canOpen: boolean;
  canContinue: boolean;
  canPull: boolean;
  canCancel: boolean;
};

/**
 * Continuidade é a porta exata da rota no APK.
 *
 * Ela existe separada de `limpar-dia` para nunca transformar "Puxar" em uma
 * limpeza ampla por empresa/data. Toda mutação resolve novamente o `ref` dentro
 * do tenant, trava a execução e usa ids + dono esperado como CAS.
 */
@Injectable()
export class LogisticaRotaContinuidadeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logistica: LogisticaService,
    private readonly rota: LogisticaRotaService,
    private readonly cobranca: LogisticaRotaCobrancaService,
    private readonly operacao: LogisticaOperacaoService,
  ) {}

  async listar(actor: LogisticaActor) {
    const companyId = this.companyId(actor);
    const actorId = this.actorId(actor);
    await this.operacao.assertCapacidade(actor, 'DRIVER');
    const today = canonicalRouteDate();

    const routes: any[] = await (this.prisma as any).logisticaRoute.findMany({
      where: {
        companyId,
        stops: { some: { delivery: { status: { in: [...OPEN] } } } },
      },
      orderBy: [{ routeDate: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        routeDate: true,
        status: true,
        startedAt: true,
        operationalEndedAt: true,
        entregadorId: true,
        entregador: { select: { name: true, username: true, email: true } },
        stops: {
          orderBy: { snapshotOrder: 'asc' },
          select: {
            delivery: {
              select: {
                id: true,
                status: true,
                entregadorId: true,
                entregador: { select: { name: true, username: true, email: true } },
                scheduledAt: true,
                rotaOrdem: true,
                startedAt: true,
                arrivedAt: true,
              },
            },
          },
        },
      },
    });

    const targets: ContinuityTarget[] = routes.map((route) => this.targetFromRoute(route));

    const drafts: any[] = await (this.prisma as any).entrega.findMany({
      where: {
        companyId,
        entregadorId: { not: null },
        status: { in: [...OPEN] },
        logisticaRouteStop: { is: null },
        OR: [{ rotaOrdem: { not: null } }, { startedAt: { not: null } }],
      },
      orderBy: [{ scheduledAt: 'asc' }, { rotaOrdem: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        status: true,
        entregadorId: true,
        scheduledAt: true,
        rotaOrdem: true,
        startedAt: true,
        arrivedAt: true,
        entregador: { select: { name: true, username: true, email: true } },
      },
    });
    const draftGroups = new Map<string, ContinuityTarget>();
    for (const row of drafts) {
      const ownerId = Number(row.entregadorId);
      const date = this.dateKey(row.scheduledAt) || today;
      const ref = `draft:${ownerId}:${date}`;
      let group = draftGroups.get(ref);
      if (!group) {
        group = {
          ref,
          kind: 'draft',
          routeId: null,
          routeDate: date,
          effectiveDate: date,
          ownerId,
          sourceOwnerId: ownerId,
          ownerName: this.userName(row.entregador, ownerId),
          routeStatus: null,
          operationalEndedAt: null,
          routeStartedAt: null,
          parked: false,
          deliveries: [],
        };
        draftGroups.set(ref, group);
      }
      group.deliveries.push(row);
    }
    targets.push(...draftGroups.values());

    const ownedRefs = [...new Set(targets.flatMap((target) => {
      if (target.ownerId !== actorId) return [];
      // Depois de Retomar/Puxar o stop continua na execução anterior até o
      // próximo Iniciar migrá-lo com billingExempt. Para o app, porém, este já
      // é o rascunho atual do novo dono.
      if (target.parked && target.effectiveDate === today) return [`draft:${actorId}:${today}`];
      if (target.routeDate === today && !target.operationalEndedAt) return [target.ref];
      return [];
    }))];
    const allItems = targets
      .filter((target) => {
        const currentOwnRoute = target.ownerId === actorId && (
          (target.routeDate === today && !target.operationalEndedAt) ||
          (target.parked && target.effectiveDate === today)
        );
        if (currentOwnRoute) return false;
        const startedByOther = target.ownerId !== actorId && this.started(target);
        return !startedByOther || isLogisticaAdmin(actor);
      })
      .map((target) => this.summary(target, actor, today))
      .filter((item) => item.remaining > 0)
      .sort((a, b) => {
        const aOwnOld = a.owner.id === actorId && a.date < today ? 0 : 1;
        const bOwnOld = b.owner.id === actorId && b.date < today ? 0 : 1;
        return aOwnOld - bOwnOld || a.date.localeCompare(b.date) || a.owner.name.localeCompare(b.owner.name);
      });
    const items = allItems.slice(0, 40);
    const hiddenCount = Math.max(0, allItems.length - items.length);
    return {
      today,
      scopeKey: `${companyId}:${actorId}`,
      ownedRefs,
      items,
      primary: items[0] ?? null,
      hiddenCount,
      hasMore: hiddenCount > 0,
    };
  }

  async abrir(actor: LogisticaActor, refInput?: string) {
    const target = await this.resolve(actor, refInput);
    this.assertHasOpenStops(target);
    this.assertCanRead(actor, target);
    this.assertActionableSize(target);
    const result = await this.logistica.listRota(
      this.companyId(actor),
      target.effectiveDate || target.routeDate,
      actor,
      undefined,
      { entregadorId: target.ownerId, deliveryIds: target.deliveries.map((row) => row.id) },
    );
    return {
      ...result,
      continuityRef: target.ref,
      continuity: this.summary(target, actor, canonicalRouteDate()),
    };
  }

  async retomar(actor: LogisticaActor, refInput?: string, expectedOwnerId?: number) {
    const companyId = this.companyId(actor);
    const actorId = this.actorId(actor);
    const target = await this.resolve(actor, refInput);
    this.assertHasOpenStops(target);
    this.assertExpectedOwner(target, expectedOwnerId);
    if (target.ownerId !== actorId) {
      throw new ForbiddenException('Esta rota pertence a outra pessoa. Use Puxar quando ela ainda não tiver sido iniciada.');
    }
    this.assertActionableSize(target);
    const openIds = this.openIds(target);
    if (!openIds.length) return { ok: true, date: canonicalRouteDate(), moved: 0 };
    const today = canonicalRouteDate();
    if (!this.isResumableTarget(target, today)) {
      throw new ConflictException('Esta rota não é mais uma pendência retomável. Atualize a tela.');
    }
    await this.cobranca.assertAssentoDoDia(
      companyId,
      actorId,
      today,
      isBillingOwnerActor(actor),
    );

    await this.prisma.$transaction(async (tx: any) => {
        await this.lockDrivers(tx, companyId, [{ driverId: actorId, date: today }]);
        await this.lock(tx, companyId, target);
        await this.assertNoActiveDestination(tx, companyId, actorId, today);
        await this.assertRouteStillActionable(tx, companyId, target, actorId, openIds, 'retomar');
        const current = await tx.entrega.findMany({
          where: { companyId, id: { in: openIds }, entregadorId: actorId, status: { in: [...OPEN] } },
          select: { id: true },
        });
        if (current.length !== openIds.length) throw new ConflictException('A rota mudou. Atualize antes de continuar.');
        if (target.routeId) {
          await tx.logisticaRoute.updateMany({
            where: { companyId, id: target.routeId, entregadorId: actorId },
            data: { operationalEndedAt: new Date() },
          });
          await tx.logisticaTrackingSession.updateMany({
            where: { companyId, routeId: target.routeId, status: 'ACTIVE' },
            data: { status: 'ENDED', endedAt: new Date() },
          });
          // O snapshot comercial fica na execução velha. No próximo Iniciar,
          // `congelarStops` migra estes mesmos stops por UPDATE e os marca como
          // billingExempt — nunca apaga/reinsere a prova comercial.
        }
        const moved = await tx.entrega.updateMany({
          where: { companyId, id: { in: openIds }, entregadorId: actorId, status: { in: [...OPEN] } },
          data: { scheduledAt: this.noon(today), status: 'agendada', startedAt: null, etaAt: null },
        });
        if (moved.count !== openIds.length) throw new ConflictException('A rota mudou. Atualize antes de continuar.');
      });

    try {
      await this.rota.planejarRota(
        companyId,
        { date: today, deliveryIds: openIds, ordemManual: this.orderedOpenIds(target) },
        actorId,
        actorId,
      );
      return { ok: true, date: today, moved: openIds.length, planningPending: false };
    } catch (error: any) {
      // A mudança de dia/dono já foi confirmada atomicamente. Responder como se
      // nada tivesse acontecido faria o aparelho repetir um ref que já morreu.
      // A ordem anterior continua gravada; a tela atual recarrega e permite
      // Montar/Iniciar de novo, enquanto o motivo fica explícito.
      return {
        ok: true,
        date: today,
        moved: openIds.length,
        planningPending: true,
        message: 'A rota foi retomada. Toque em Montar rota para recalcular a ordem.',
      };
    }
  }

  async puxar(actor: LogisticaActor, refInput?: string, expectedOwnerId?: number) {
    const companyId = this.companyId(actor);
    const actorId = this.actorId(actor);
    const target = await this.resolve(actor, refInput);
    this.assertHasOpenStops(target);
    if (!expectedOwnerId) throw new BadRequestException('A rota mudou ou o cartão está desatualizado. Atualize a tela.');
    this.assertExpectedOwner(target, expectedOwnerId);
    if (target.ownerId === actorId) return this.retomar(actor, refInput, expectedOwnerId);
    this.assertActionableSize(target);
    if (!this.isPullableTarget(target) || this.started(target)) {
      throw new ConflictException(
        'Esta rota já começou. Sincronize e encerre no aparelho atual antes de transferir; uma execução iniciada não troca de motorista.',
      );
    }
    const targetUser = await (this.prisma as any).user.findFirst({
      where: { id: actorId, companyId, isActive: true },
      select: { id: true, companyId: true, role: true, isSystemMaster: true },
    });
    if (!targetUser) throw new ForbiddenException('Seu usuário não está ativo nesta empresa.');
    const capabilities = await resolveOperationalCapabilities(this.prisma, targetUser);
    if (!capabilities.includes('DRIVER')) throw new ForbiddenException('Seu perfil não está habilitado como Entregador.');

    const openIds = this.openIds(target);
    if (!openIds.length) throw new ConflictException('Esta rota não tem paradas abertas para puxar.');
    const today = canonicalRouteDate();
    const destinationDate = target.routeDate < today ? today : target.routeDate;
    const activeDestination = await (this.prisma as any).logisticaRoute.findFirst({
      where: {
        companyId,
        entregadorId: actorId,
        routeDate: destinationDate,
        operationalEndedAt: null,
        status: { in: ['INITIALIZING', 'ACTIVE'] },
      },
      select: { id: true },
    });
    if (activeDestination) {
      throw new ConflictException(
        'Você já está com uma rota em andamento. Sincronize e encerre essa execução antes de puxar outra.',
      );
    }
    const range = this.dayRange(destinationDate);
    const sourceHasOtherWork = (await (this.prisma as any).entrega.count({
      where: {
        companyId,
        entregadorId: target.ownerId,
        status: { not: 'cancelada' },
        // Só as abertas transferidas deixam de ocupar o assento de A. Entrega
        // já concluída continua sendo trabalho de A e precisa contar.
        id: { notIn: openIds },
        OR: [{ scheduledAt: { gte: range.start, lt: range.end } }, { scheduledAt: null }],
      },
    })) > 0;
    await this.cobranca.assertAssentoDoDia(
      companyId,
      actorId,
      destinationDate,
      isBillingOwnerActor(actor),
      sourceHasOtherWork ? undefined : target.ownerId,
    );

    await this.prisma.$transaction(async (tx: any) => {
      await this.lockDrivers(tx, companyId, [
        { driverId: target.ownerId, date: target.effectiveDate || target.routeDate },
        { driverId: actorId, date: destinationDate },
      ]);
      await this.lock(tx, companyId, target);
      // Revalida dentro da transação: o GET acima dá a mensagem cedo, este
      // gate impede anexar paradas a uma sessão que começou no intervalo.
      await this.assertNoActiveDestination(tx, companyId, actorId, destinationDate);
      await this.assertRouteStillActionable(tx, companyId, target, expectedOwnerId, openIds, 'puxar');
      const current = await tx.entrega.findMany({
        where: {
          companyId,
          id: { in: openIds },
          entregadorId: target.ownerId,
          status: 'agendada',
          startedAt: null,
          arrivedAt: null,
        },
        select: { id: true },
      });
      if (current.length !== openIds.length) {
        throw new ConflictException('A rota começou ou mudou enquanto era transferida. Atualize a tela.');
      }
      if (target.routeId && !target.parked) {
        const closed = await tx.logisticaRoute.updateMany({
          where: {
            companyId,
            id: target.routeId,
            entregadorId: target.ownerId,
            startedAt: null,
            status: 'PLANNED',
          },
          data: { operationalEndedAt: new Date() },
        });
        if (closed.count !== 1) throw new ConflictException('A rota já foi iniciada e não pode ser puxada.');
        // O stop permanece como prova da rota A. Quando B iniciar, o mecanismo
        // já existente o migra por UPDATE para a execução nova e carimba
        // billingExempt; crédito/auditoria nunca diminuem por causa do handoff.
      }
      const moved = await tx.entrega.updateMany({
        where: {
          companyId,
          id: { in: openIds },
          entregadorId: target.ownerId,
          status: 'agendada',
          startedAt: null,
          arrivedAt: null,
        },
        data: {
          entregadorId: actorId,
          atribuidoPorUserId: actorId,
          atribuidoAt: new Date(),
          scheduledAt: this.noon(destinationDate),
          etaAt: null,
        },
      });
      if (moved.count !== openIds.length) throw new ConflictException('A rota mudou durante a transferência. Atualize a tela.');
    });

    try {
      await this.rota.planejarRota(
        companyId,
        { date: destinationDate, deliveryIds: openIds, ordemManual: this.orderedOpenIds(target) },
        actorId,
        actorId,
      );
      return { ok: true, date: destinationDate, moved: openIds.length, planningPending: false };
    } catch (error: any) {
      return {
        ok: true,
        date: destinationDate,
        moved: openIds.length,
        planningPending: true,
        message: 'A rota foi puxada. Toque em Montar rota para recalcular a ordem.',
      };
    }
  }

  async cancelar(actor: LogisticaActor, refInput?: string, expectedOwnerId?: number) {
    const companyId = this.companyId(actor);
    const actorId = this.actorId(actor);
    const ref = String(refInput || '').trim();
    let target: ContinuityTarget;
    try {
      target = await this.resolve(actor, ref);
    } catch (error) {
      // F5 (15/08): `draft:` que não resolve mais (o dia já ficou vazio) deixa
      // de ser 404 no Cancelar — vira a MESMA saída graciosa de sempre. Mas só
      // depois de checar posse pelo ownerId codificado na própria ref contra o
      // ator/admin: sem essa checagem a saída graciosa vira sonda de tenant
      // (qualquer um descobriria "existe"/"não existe" só pelo formato da
      // resposta). Ref `route:` desconhecida continua 404 — aquilo é erro de
      // verdade, não fantasma.
      if (error instanceof NotFoundException) {
        const draftMatch = /^draft:(\d+):(\d{4}-\d{2}-\d{2})$/.exec(ref);
        if (draftMatch) {
          const refOwnerId = Number(draftMatch[1]);
          if (refOwnerId !== actorId && !isLogisticaAdmin(actor)) {
            throw new ForbiddenException('Somente o dono da rota ou um administrador pode cancelá-la.');
          }
          return { ok: true, resumo: { canceladas: 0 } };
        }
      }
      throw error;
    }
    this.assertExpectedOwner(target, expectedOwnerId);
    if (target.ownerId !== actorId && !isLogisticaAdmin(actor)) {
      throw new ForbiddenException('Somente o dono da rota ou um administrador pode cancelá-la.');
    }
    if (target.ownerId !== actorId && this.started(target)) {
      throw new ConflictException('A rota está em andamento em outro aparelho. Sincronize e encerre lá antes de cancelar.');
    }
    const openIds = this.openIds(target);
    this.assertActionableSize(target);
    if (!openIds.length) {
      // 🔴 A ROTA FANTASMA (15/08) — quem fabrica a lápide é o CANCELAR
      // anterior (ou um Iniciar que falhou): uma `route:` sem nenhuma parada
      // aberta não prova mais que "não há nada para cancelar" — o DIA pode
      // continuar de pé, com o `routeId` publicado apontando só pra lápide
      // (metadata do tracking devolve QUALQUER rota do motorista+dia). Sem
      // isto o Cancelar vira no-op mudo pra sempre.
      const diaAlvo = await this.diaDoAlvoMorto(actor, target);
      if (!diaAlvo) return { ok: true, resumo: { canceladas: 0 } };
      // Reaplica as MESMAS três guardas, na MESMA ordem, sobre o alvo
      // derivado — o dia pode ter dono/estado diferente do que a rota morta
      // registrava.
      this.assertExpectedOwner(diaAlvo, expectedOwnerId);
      if (diaAlvo.ownerId !== actorId && !isLogisticaAdmin(actor)) {
        throw new ForbiddenException('Somente o dono da rota ou um administrador pode cancelá-la.');
      }
      if (diaAlvo.ownerId !== actorId && this.started(diaAlvo)) {
        throw new ConflictException('A rota está em andamento em outro aparelho. Sincronize e encerre lá antes de cancelar.');
      }
      this.assertActionableSize(diaAlvo);
      const resultado = await this.rota.limparDia(
        companyId,
        {
          date: diaAlvo.effectiveDate || diaAlvo.routeDate,
          motivo: 'Cancelada pela tela de continuidade da rota',
          deliveryIds: this.openIds(diaAlvo),
          skipRoute: true,
        },
        diaAlvo.ownerId,
        actorId,
      );
      // D2 (fechada): a lápide é encerrada aqui, por conta própria — mandar
      // `routeId` ao `limparDia` faria o CAS dela ("As paradas desta rota
      // mudaram") reprovar, porque os stops da lápide já não existem.
      if (target.routeId) {
        await (this.prisma as any).logisticaRoute.updateMany({
          where: { companyId, id: target.routeId, operationalEndedAt: null },
          data: { operationalEndedAt: new Date() },
        });
        // 🔴 FURO 2 (15/08, LOTE 1.2) — ESPELHO do `encerrarRota`/`limparDia`:
        // este caminho manda `skipRoute:true` pro `limparDia` (D2, comentário
        // acima), então `lockedRouteIds` fica vazio lá dentro e o bloco que
        // fecha `LogisticaTrackingSession` ACTIVE→ENDED NUNCA roda pra esta
        // lápide. Sem isto uma sessão TRACKED sobrevivia ao cancelamento: um
        // comando em voo na fila do aparelho (GPS/evento) batia CONFLICT
        // contra a rota que o app já esqueceu, virava REJECTED e ficava preso
        // até o teto de 24h do processamento assíncrono — sem ninguém ter
        // cancelado nada de propósito.
        //
        // Roda SEMPRE que `target.routeId` existe — sem gatear no `count` do
        // updateMany acima (byte a byte o `encerrarRota`, que também não
        // gateia): uma lápide JÁ encerrada ANTES desta chamada (a cena medida
        // em prod, gravada por um cancelar de antes do lote 2) pode muito bem
        // ter ficado com a sessão ACTIVE pra trás — é exatamente o cenário que
        // este fix existe pra fechar, não pra pular.
        if (typeof (this.prisma as any).logisticaTrackingSession?.updateMany === 'function') {
          await (this.prisma as any).logisticaTrackingSession.updateMany({
            where: { companyId, routeId: target.routeId, status: 'ACTIVE' },
            data: { status: 'ENDED', endedAt: new Date() },
          });
        }
      }
      return resultado;
    }
    return this.rota.limparDia(
      companyId,
      {
        date: target.effectiveDate || target.routeDate,
        motivo: 'Cancelada pela tela de continuidade da rota',
        deliveryIds: openIds,
        routeId: target.parked ? undefined : target.routeId || undefined,
        skipRoute: target.parked || !target.routeId,
      },
      target.ownerId,
      actorId,
    );
  }

  /**
   * Cancelar mirou `route:` mas a rota já não tem paradas abertas (a lápide).
   * O DIA pode continuar de pé — `sourceOwnerId` é o dono da LINHA da rota,
   * nunca o `ownerId` derivado (que já cai pro próprio `sourceOwnerId` quando
   * não sobra nenhuma aberta pra apontar outro dono, ver `targetFromRoute`).
   * `null` quando o dia também está vazio: mantém a saída graciosa de sempre.
   */
  private async diaDoAlvoMorto(actor: LogisticaActor, target: ContinuityTarget): Promise<ContinuityTarget | null> {
    if (target.kind !== 'route') return null;
    try {
      return await this.resolve(actor, `draft:${target.sourceOwnerId}:${target.routeDate}`);
    } catch (error) {
      if (error instanceof NotFoundException) return null;
      throw error;
    }
  }

  private async resolve(actor: LogisticaActor, refInput?: string): Promise<ContinuityTarget> {
    await this.operacao.assertCapacidade(actor, 'DRIVER');
    const companyId = this.companyId(actor);
    const ref = String(refInput || '').trim();
    const routeMatch = /^route:([a-zA-Z0-9_-]{8,80})$/.exec(ref);
    if (routeMatch) {
      const route: any = await (this.prisma as any).logisticaRoute.findFirst({
        where: { companyId, id: routeMatch[1] },
        select: {
          id: true,
          routeDate: true,
          status: true,
          startedAt: true,
          operationalEndedAt: true,
          entregadorId: true,
          entregador: { select: { name: true, username: true, email: true } },
          stops: {
            orderBy: { snapshotOrder: 'asc' },
            select: {
              delivery: {
                select: {
                  id: true,
                  status: true,
                  entregadorId: true,
                  entregador: { select: { name: true, username: true, email: true } },
                  scheduledAt: true,
                  rotaOrdem: true,
                  startedAt: true,
                  arrivedAt: true,
                },
              },
            },
          },
        },
      });
      if (!route) throw new NotFoundException('Rota não encontrada nesta empresa.');
      return this.targetFromRoute(route);
    }

    const draftMatch = /^draft:(\d+):(\d{4}-\d{2}-\d{2})$/.exec(ref);
    if (!draftMatch) throw new BadRequestException('Referência de rota inválida. Atualize a tela.');
    const ownerId = Number(draftMatch[1]);
    const routeDate = canonicalRouteDate(draftMatch[2]);
    const range = this.dayRange(routeDate);
    const rows: any[] = await (this.prisma as any).entrega.findMany({
      where: {
        companyId,
        entregadorId: ownerId,
        status: { in: [...OPEN] },
        AND: [
          { OR: [{ rotaOrdem: { not: null } }, { startedAt: { not: null } }] },
          { OR: [{ scheduledAt: { gte: range.start, lt: range.end } }, { scheduledAt: null }] },
          {
            OR: [
              { logisticaRouteStop: { is: null } },
              { logisticaRouteStop: { is: { route: { operationalEndedAt: { not: null } } } } },
            ],
          },
        ],
      },
      orderBy: [{ rotaOrdem: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        status: true,
        entregadorId: true,
        scheduledAt: true,
        rotaOrdem: true,
        startedAt: true,
        arrivedAt: true,
        entregador: { select: { name: true, username: true, email: true } },
      },
    });
    if (!rows.some((row) => this.isOpen(row.status))) throw new NotFoundException('Rota montada não encontrada.');
    return {
      ref,
      kind: 'draft',
      routeId: null,
      routeDate,
      effectiveDate: routeDate,
      ownerId,
      sourceOwnerId: ownerId,
      ownerName: this.userName(rows[0]?.entregador, ownerId),
      routeStatus: null,
      operationalEndedAt: null,
      routeStartedAt: null,
      parked: false,
      deliveries: rows,
    };
  }

  private targetFromRoute(route: any): ContinuityTarget {
    const deliveries: DeliverySnapshot[] = route.stops.map((stop: any) => stop.delivery).filter(Boolean);
    const open = deliveries.filter((row) => this.isOpen(row.status));
    const ownerIds = [...new Set(open.map((row) => Number(row.entregadorId)).filter((id) => id > 0))];
    const sourceOwnerId = Number(route.entregadorId);
    const ownerId = ownerIds.length === 1 ? ownerIds[0] : sourceOwnerId;
    const ownerRow = open.find((row) => Number(row.entregadorId) === ownerId);
    const dates = [...new Set(open.map((row) => this.dateKey(row.scheduledAt)).filter(Boolean))] as string[];
    const effectiveDate = dates.length === 1 ? dates[0] : null;
    // `parked` é a prova comercial ainda presa à execução anterior enquanto o
    // trabalho já pertence a outro dono/dia. Ela só migra no próximo Iniciar.
    const parked = ownerId !== sourceOwnerId || (
      !!route.operationalEndedAt && !!effectiveDate && String(route.routeDate) < effectiveDate
    );
    return {
      ref: `route:${route.id}`,
      kind: 'route',
      routeId: route.id,
      routeDate: String(route.routeDate),
      effectiveDate,
      ownerId,
      sourceOwnerId,
      ownerName: this.userName(
        ownerRow?.entregador || (ownerId === sourceOwnerId ? route.entregador : null),
        ownerId,
      ),
      routeStatus: route.status,
      operationalEndedAt: route.operationalEndedAt,
      routeStartedAt: route.startedAt,
      parked,
      deliveries,
    };
  }

  private summary(target: ContinuityTarget, actor: LogisticaActor, today: string): RotaContinuidadeItem {
    const actorId = this.actorId(actor);
    const remaining = this.openIds(target).length;
    const delivered = target.deliveries.filter((row) => row.status === 'entregue').length;
    const started = this.started(target);
    return {
      ref: target.ref,
      routeId: target.routeId,
      date: target.parked && target.effectiveDate ? target.effectiveDate : target.routeDate,
      owner: { id: target.ownerId, name: target.ownerName },
      total: target.deliveries.length,
      delivered,
      remaining,
      state: target.operationalEndedAt && remaining > 0 ? 'ended_with_pending' : started ? 'started' : 'planned',
      canOpen: true,
      canContinue: target.ownerId === actorId && this.isResumableTarget(target, today),
      canPull: target.ownerId !== actorId && this.isPullableTarget(target) && !started,
      canCancel: target.ownerId === actorId || (isLogisticaAdmin(actor) && !started),
    };
  }

  private assertCanRead(actor: LogisticaActor, target: ContinuityTarget) {
    if (target.ownerId === this.actorId(actor) || isLogisticaAdmin(actor) || !this.started(target)) return;
    throw new ForbiddenException('Esta rota em andamento pertence a outra pessoa.');
  }

  private started(target: ContinuityTarget): boolean {
    const deliveryStarted = target.deliveries.some((row) =>
      this.isOpen(row.status) && (row.status === 'em_rota' || !!row.startedAt || !!row.arrivedAt),
    );
    // Em parked, startedAt/status pertencem à execução histórica, não ao lote
    // aberto já retomado/transferido.
    return deliveryStarted || (!target.parked && (!!target.routeStartedAt || target.routeStatus === 'ACTIVE'));
  }

  private isPullableTarget(target: ContinuityTarget): boolean {
    if (target.kind === 'draft') return true;
    if (target.routeStatus === 'PLANNED') return true;
    // Execução velha já encerrada, com as abertas retomadas e estacionadas no
    // snapshot até o próximo Iniciar. COMPLETED/FAILED/REFUNDING jamais entram.
    return target.parked && !!target.operationalEndedAt && target.routeStatus === 'ACTIVE';
  }

  private isResumableTarget(target: ContinuityTarget, today: string): boolean {
    if (target.kind === 'draft') return target.routeDate < today;
    if (['COMPLETED', 'FAILED', 'REFUNDING'].includes(String(target.routeStatus || ''))) return false;
    if (target.routeStatus === 'PLANNED') return target.routeDate < today || !!target.operationalEndedAt;
    return ['ACTIVE', 'INITIALIZING'].includes(String(target.routeStatus || '')) && !!target.operationalEndedAt;
  }

  private openIds(target: ContinuityTarget): string[] {
    return this.orderedOpenIds(target);
  }

  private orderedOpenIds(target: ContinuityTarget): string[] {
    return target.deliveries
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => this.isOpen(row.status))
      .sort((a, b) => {
        const ao = Number.isFinite(Number(a.row.rotaOrdem)) ? Number(a.row.rotaOrdem) : Number.MAX_SAFE_INTEGER;
        const bo = Number.isFinite(Number(b.row.rotaOrdem)) ? Number(b.row.rotaOrdem) : Number.MAX_SAFE_INTEGER;
        return ao - bo || a.index - b.index;
      })
      .map(({ row }) => row.id);
  }

  private isOpen(status: string): status is (typeof OPEN)[number] {
    return status === 'agendada' || status === 'em_rota';
  }

  /**
   * Estado permanente nunca gateia verbo de ESCAPE (lei do repo). `resolve()`
   * usava esta checagem pra TODOS os verbos, inclusive `cancelar` — e por isso
   * uma rota fantasma (0 abertas, por bug de higiene em outro lugar) virava um
   * beco: nem Cancelar saía dela, porque `resolve()` já explodia 409 antes de
   * `cancelar` alcançar a saída graciosa `{ok:true, canceladas:0}`.
   *
   * A checagem migrou pra CÁ, chamada só por `abrir`/`retomar`/`puxar` — eles
   * seguem informando o operador (mesma mensagem, mesma posição na ordem de
   * validação de antes). `cancelar` nunca chama isto: sem abertas, ele cai
   * direto no próprio `if (!openIds.length)` dele.
   */
  private assertHasOpenStops(target: ContinuityTarget): void {
    if (!this.openIds(target).length) throw new ConflictException('Esta rota não tem mais paradas abertas.');
  }

  private assertActionableSize(target: ContinuityTarget): void {
    const total = this.openIds(target).length;
    if (total > MAX_CONTINUITY_STOPS) {
      throw new BadRequestException(
        `Esta rota tem ${total} paradas abertas. O limite seguro por operação é ${MAX_CONTINUITY_STOPS}; divida a rota antes de continuar.`,
      );
    }
  }

  private assertExpectedOwner(target: ContinuityTarget, expectedOwnerId?: number): void {
    if (expectedOwnerId && target.ownerId !== Number(expectedOwnerId)) {
      throw new ConflictException('Esta rota mudou de funcionário. Atualize a tela antes de continuar.');
    }
  }

  private async lockDrivers(
    tx: any,
    companyId: number,
    entries: Array<{ driverId: number; date: string | null }>,
  ): Promise<void> {
    const keys = [...new Set(entries
      .filter((entry) => entry.driverId > 0 && !!entry.date)
      .map((entry) => `driver:${entry.driverId}:date:${entry.date}`))].sort();
    for (const key of keys) await lockLogisticaRouteTransaction(tx, companyId, key);
  }

  private async assertNoActiveDestination(
    tx: any,
    companyId: number,
    driverId: number,
    date: string,
  ): Promise<void> {
    const active = await tx.logisticaRoute.findFirst({
      where: {
        companyId,
        entregadorId: driverId,
        routeDate: date,
        operationalEndedAt: null,
        status: { in: ['INITIALIZING', 'ACTIVE'] },
      },
      select: { id: true },
    });
    if (active) {
      throw new ConflictException(
        'Você já está com uma rota em andamento. Sincronize e encerre essa execução antes de continuar.',
      );
    }
  }

  private async assertRouteStillActionable(
    tx: any,
    companyId: number,
    target: ContinuityTarget,
    expectedOwnerId: number,
    expectedOpenIds: string[],
    action: 'retomar' | 'puxar',
  ): Promise<void> {
    if (!target.routeId) return;
    const route = await tx.logisticaRoute.findFirst({
      where: { companyId, id: target.routeId },
      select: { status: true, routeDate: true, operationalEndedAt: true, startedAt: true },
    });
    if (!route) throw new ConflictException('A rota não existe mais. Atualize a tela.');
    const currentTarget = { ...target, routeStatus: route.status, routeDate: String(route.routeDate), operationalEndedAt: route.operationalEndedAt, routeStartedAt: route.startedAt };
    if (action === 'retomar' && !this.isResumableTarget(currentTarget, canonicalRouteDate())) {
      throw new ConflictException('Esta rota foi iniciada ou mudou. Atualize a tela antes de continuar.');
    }
    if (action === 'puxar' && (!this.isPullableTarget(currentTarget) || this.started(currentTarget))) {
      throw new ConflictException('Esta rota foi iniciada ou mudou. Atualize a tela antes de puxar.');
    }
    const stops = await tx.logisticaRouteStop.findMany({
      where: { companyId, routeId: target.routeId, delivery: { status: { in: [...OPEN] } } },
      select: { deliveryId: true, delivery: { select: { entregadorId: true } } },
    });
    const actual = stops
      .filter((stop: any) => Number(stop.delivery?.entregadorId) === Number(expectedOwnerId))
      .map((stop: any) => String(stop.deliveryId))
      .sort();
    const expected = [...expectedOpenIds].sort();
    if (actual.length !== expected.length || actual.some((id: string, index: number) => id !== expected[index])) {
      throw new ConflictException('As paradas desta rota mudaram. Atualize a tela antes de continuar.');
    }
  }

  private async lock(tx: any, companyId: number, target: ContinuityTarget) {
    await lockLogisticaRouteTransaction(tx, companyId, target.routeId || target.ref);
  }

  private companyId(actor: LogisticaActor): number {
    const id = Math.trunc(Number(actor?.companyId || 0));
    if (!id) throw new BadRequestException('Empresa não identificada.');
    return id;
  }

  private actorId(actor: LogisticaActor): number {
    const id = Math.trunc(Number(actor?.id || 0));
    if (!id) throw new BadRequestException('Usuário não identificado.');
    return id;
  }

  private userName(user: any, id: number): string {
    return String(user?.name || user?.username || user?.email || `Funcionário ${id}`).trim();
  }

  private dateKey(value: Date | string | null): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date);
  }

  private dayRange(date: string): { start: Date; end: Date } {
    const next = new Date(`${date}T12:00:00-03:00`);
    next.setUTCDate(next.getUTCDate() + 1);
    const nextKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(next);
    return { start: new Date(`${date}T00:00:00-03:00`), end: new Date(`${nextKey}T00:00:00-03:00`) };
  }

  private noon(date: string): Date {
    return new Date(`${date}T12:00:00-03:00`);
  }
}
