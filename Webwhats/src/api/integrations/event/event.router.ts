import { WebhookRouter } from '@api/integrations/event/webhook/webhook.router';
import { WebsocketRouter } from '@api/integrations/event/websocket/websocket.router';
import { Router } from 'express';

export class EventRouter {
  public readonly router: Router;

  constructor(configService: any, ...guards: any[]) {
    this.router = Router();

    this.router.use('/webhook', new WebhookRouter(configService, ...guards).router);
    this.router.use('/websocket', new WebsocketRouter(...guards).router);
  }
}
