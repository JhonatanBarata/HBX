import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../../../auth/guards/master.guard';
import { RadarFabricaService } from './radar-fabrica.service';

// ─── Contrato do painel (F2, 02/07) — NÃO divergir (outro worker consome) ────────────────────────
// Mesma cadeia de auth dos endpoints do dono (JWT + Master), igual missions/cnpj-backfill.
// Backend LOCAL: a fábrica roda no nó residencial (grátis; a trava Lei nº1 recusa fonte paga).
//
// GET  /modules/owner/fabrica/status
// POST /modules/owner/fabrica/start   { budget }   (roda até N e para sozinho; sem budget → recusa 200 started:false)
// POST /modules/owner/fabrica/stop                  (para agora, congela com segurança)
@Controller('modules/owner/fabrica')
@UseGuards(JwtAuthGuard, MasterGuard)
export class RadarFabricaController {
  constructor(private readonly fabrica: RadarFabricaService) {}

  @Get('status')
  status() {
    return this.fabrica.status();
  }

  @Post('start')
  start(@Body() body: { budget?: number }) {
    return this.fabrica.start({ budget: Number(body?.budget) });
  }

  @Post('stop')
  stop() {
    return this.fabrica.stop();
  }
}
