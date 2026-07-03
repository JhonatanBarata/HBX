import { authGuard } from '@api/guards/auth.guard';
import { gatewayController } from '@api/server.module';
import { Router } from 'express';

import { HttpStatus } from './index.router';

// GATEWAY-WA S1/S2: rotas de observabilidade de FROTA (nao escopadas por instancia).
// Guard = apikey global (mesmo do /verify-creds); nao usam os guards de instancia porque
// nao ha :instanceName no path.
export class GatewayRouter {
  public readonly router: Router = Router();

  constructor() {
    this.router
      .get('/health/fleet', authGuard['apikey'], async (req, res) => {
        const response = await gatewayController.fleetHealth();
        return res.status(HttpStatus.OK).json(response);
      })
      .get('/events', authGuard['apikey'], async (req, res) => {
        const cursor = req.query?.cursor as string | undefined;
        const limit = req.query?.limit as string | undefined;
        const response = await gatewayController.events(cursor, limit);
        return res.status(HttpStatus.OK).json(response);
      });
  }
}
