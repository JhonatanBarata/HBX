import { WebhookController } from '@api/integrations/event/webhook/webhook.controller';
import { WebsocketController } from '@api/integrations/event/websocket/websocket.controller';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Logger } from '@config/logger.config';
import { Server } from 'http';

export class EventManager {
  private readonly logger = new Logger('EventManager');

  private prismaRepository: PrismaRepository;
  private waMonitor: WAMonitoringService;
  private websocketController: WebsocketController;
  private webhookController: WebhookController;

  constructor(prismaRepository: PrismaRepository, waMonitor: WAMonitoringService) {
    this.prisma = prismaRepository;
    this.monitor = waMonitor;

    this.websocket = new WebsocketController(prismaRepository, waMonitor);
    this.webhook = new WebhookController(prismaRepository, waMonitor);
  }

  public set prisma(prisma: PrismaRepository) {
    this.prismaRepository = prisma;
  }

  public get prisma() {
    return this.prismaRepository;
  }

  public set monitor(waMonitor: WAMonitoringService) {
    this.waMonitor = waMonitor;
  }

  public get monitor() {
    return this.waMonitor;
  }

  public set websocket(websocket: WebsocketController) {
    this.websocketController = websocket;
  }

  public get websocket() {
    return this.websocketController;
  }

  public set webhook(webhook: WebhookController) {
    this.webhookController = webhook;
  }

  public get webhook() {
    return this.webhookController;
  }

  public init(httpServer: Server): void {
    this.websocket.init(httpServer);
  }

  public async emit(eventData: {
    instanceName: string;
    origin: string;
    event: string;
    data: object;
    serverUrl: string;
    dateTime: string;
    sender: string;
    apiKey?: string;
    local?: boolean;
    integration?: string[];
    extra?: Record<string, any>;
  }): Promise<void> {
    // GATEWAY-WA S2: event outbox duravel. Choke point unico por onde passam TODOS os eventos
    // que hoje viram webhook — grava na outbox ANTES do fan-out (dupla entrega: o webhook HTTP
    // continua ligado). Best-effort: falha de INSERT nunca pode derrubar o fluxo de envio.
    await this.persistToOutbox(eventData);

    await this.websocket.emit(eventData);
    await this.webhook.emit(eventData);
  }

  private async persistToOutbox(eventData: {
    instanceName: string;
    event: string;
    data: object;
    serverUrl: string;
    dateTime: string;
    sender: string;
    apiKey?: string;
  }): Promise<void> {
    try {
      await this.prisma.eventOutbox.create({
        data: {
          instanceName: eventData.instanceName,
          eventName: eventData.event,
          payload: {
            event: eventData.event,
            instance: eventData.instanceName,
            data: eventData.data,
            sender: eventData.sender,
            server_url: eventData.serverUrl,
            date_time: eventData.dateTime,
            apikey: eventData.apiKey ?? null,
          } as any,
        },
      });
    } catch (error) {
      this.logger.warn(`[OUTBOX] falha ao gravar EventOutbox (${eventData.event}): ${error?.toString()}`);
    }
  }

  public async setInstance(instanceName: string, data: any): Promise<any> {
    if (data.websocket) {
      await this.websocket.set(instanceName, {
        websocket: {
          enabled: true,
          events: data.websocket?.events,
        },
      });
    }

    if (data.webhook) {
      await this.webhook.set(instanceName, {
        webhook: {
          enabled: true,
          events: data.webhook?.events,
          url: data.webhook?.url,
          headers: data.webhook?.headers,
          base64: data.webhook?.base64,
          byEvents: data.webhook?.byEvents,
        },
      });
    }
  }
}
