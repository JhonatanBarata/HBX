import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { MasterCockpitService } from './master-cockpit.service';

// Command center do system master (Camada 5). Master-only (JWT + MasterGuard).
// Só LEITURA agregada — sem mutação. Uma rota: a visão completa do cockpit.
@Controller('master-cockpit')
export class MasterCockpitController {
  constructor(private readonly cockpit: MasterCockpitService) {}

  @Get('overview')
  @UseGuards(JwtAuthGuard, MasterGuard)
  overview() {
    return this.cockpit.overview();
  }
}
