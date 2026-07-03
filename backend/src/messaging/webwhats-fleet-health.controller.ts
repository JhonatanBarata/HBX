import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { WebwhatsFleetHealthService } from './webwhats-fleet-health.service';

/**
 * GATEWAY-WA S1 — endpoint protegido (ADMIN/OWNER via MasterGuard, mesma cadeia de auth dos
 * endpoints de owner do backend). Expõe a saúde de frota do motor Webwhats + contadores do freio
 * de envio (S3) para o painel do dono. SEM UI aqui — só o endpoint pronto (o dono liga a tela).
 */
@Controller('modules/owner/webwhats')
@UseGuards(JwtAuthGuard, MasterGuard)
export class WebwhatsFleetHealthController {
  constructor(private readonly fleetHealth: WebwhatsFleetHealthService) {}

  @Get('fleet-health')
  getFleetHealth() {
    return this.fleetHealth.getFleetHealth();
  }
}
