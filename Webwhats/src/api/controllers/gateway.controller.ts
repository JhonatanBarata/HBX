import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';

// GATEWAY-WA S1/S2: endpoints finos de observabilidade (telemetria de frota + outbox).
// Somente LEITURA; nao toca no fluxo de conexao. Protegidos por apikey no router.
export class GatewayController {
  constructor(
    private readonly waMonitor: WAMonitoringService,
    private readonly prismaRepository: PrismaRepository,
  ) {}

  // GET /health/fleet — por instancia viva: nome, estado do socket (mesma fonte do
  // connectionState) e os ultimos 20 ConnectionEvent daquela instancia.
  public async fleetHealth() {
    const names = Object.keys(this.waMonitor.waInstances || {});

    const fleet = await Promise.all(
      names.map(async (name) => {
        const wa = this.waMonitor.waInstances[name];
        const state = wa?.connectionStatus?.state ?? 'unknown';

        let events: Array<{
          id: number;
          event: string;
          statusCode: number | null;
          attempt: number | null;
          createdAt: Date;
        }> = [];
        try {
          events = await this.prismaRepository.connectionEvent.findMany({
            where: { instanceName: name },
            orderBy: { id: 'desc' },
            take: 20,
            select: { id: true, event: true, statusCode: true, attempt: true, createdAt: true },
          });
        } catch {
          /* best-effort: se a tabela nao existir ainda, devolve frota sem historico */
        }

        return {
          instance: name,
          state,
          ownerJid: wa?.ownerJid ?? null,
          events,
        };
      }),
    );

    return { count: fleet.length, fleet };
  }

  // GET /events?cursor={id}&limit={n} — eventos da outbox com id > cursor, ordem asc.
  // limit default 100, teto 500. Payload leve, sem joins.
  public async events(cursor?: string, limit?: string) {
    const parsedCursor = Number.parseInt(cursor ?? '', 10);
    const afterId = Number.isFinite(parsedCursor) && parsedCursor > 0 ? parsedCursor : 0;

    const parsedLimit = Number.parseInt(limit ?? '', 10);
    const take = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 500) : 100;

    const events = await this.prismaRepository.eventOutbox.findMany({
      where: { id: { gt: afterId } },
      orderBy: { id: 'asc' },
      take,
      select: { id: true, instanceName: true, eventName: true, payload: true, createdAt: true },
    });

    const nextCursor = events.length > 0 ? events[events.length - 1].id : afterId;

    return { cursor: afterId, nextCursor, count: events.length, events };
  }
}
