import { BadRequestException, Injectable } from '@nestjs/common';
import { isBillingOwnerActor } from '../access/actor-kind';
import { PrismaService } from '../prisma/prisma.service';
import type { LogisticaActor } from './logistica-operacao.service';
import { canonicalRouteDate } from './logistica-route-billing.service';
import { LogisticaService } from './logistica.service';

function actorId(actor?: LogisticaActor | null): number {
  const id = Math.trunc(Number(actor?.id || 0));
  if (!id) throw new BadRequestException('Usuário não identificado.');
  return id;
}

/**
 * Projeção do app administrativo. O listRota legado calcula metadata apenas
 * quando enxerga exatamente um motorista; um Admin enxerga a empresa inteira e
 * poderia perder `routeStatus=ACTIVE` depois da primeira parada. Aqui a rota do
 * próprio Admin é relida pela chave canônica empresa+motorista+data.
 */
@Injectable()
export class LogisticaAdminRouteViewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logistica: LogisticaService,
  ) {}

  async getRoute(companyId: number, dateInput: string | undefined, actor: LogisticaActor) {
    const userId = actorId(actor);
    const date = canonicalRouteDate(dateInput);
    const [payload, route] = await Promise.all([
      this.logistica.listRota(companyId, date, actor),
      (this.prisma as any).logisticaRoute.findUnique({
        where: {
          companyId_entregadorId_routeDate: {
            companyId,
            entregadorId: userId,
            routeDate: date,
          },
        },
        select: {
          id: true,
          mode: true,
          status: true,
          trackingSession: { select: { id: true, status: true } },
        },
      }),
    ]);

    const items = Array.isArray((payload as any)?.items)
      ? (payload as any).items.filter((item: any) => !item?.entregador || Number(item.entregador.id) === userId)
      : [];
    const mode = route?.mode === 'TRACKED' ? 'TRACKED' : route?.mode === 'ESSENTIAL' ? 'ESSENTIAL' : null;

    return {
      ...(payload as any),
      date,
      total: items.length,
      items,
      routeId: route?.id ?? (payload as any)?.routeId ?? null,
      routeStatus: route?.status ?? (payload as any)?.routeStatus ?? null,
      trackingRequired: mode ? mode === 'TRACKED' : Boolean((payload as any)?.trackingRequired),
      trackingSessionId: route?.trackingSession?.id ?? (payload as any)?.trackingSessionId ?? null,
      trackingStatus: route?.trackingSession?.status ?? (payload as any)?.trackingStatus ?? null,
      ...(isBillingOwnerActor(actor) ? { routeMode: mode ?? (payload as any)?.routeMode ?? null } : {}),
    };
  }
}
