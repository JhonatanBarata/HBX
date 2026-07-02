import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { CadenciaService } from './cadencia.service';
import { CadenciaGatilhoService } from './cadencia-gatilho.service';
import { CadenciaRotinaService } from './cadencia-rotina.service';
import type {
  AplicarCadenciaDto,
  CreateCadenciaDto,
  CreateGatilhoDto,
  CreateRotinaDto,
  UpdateCadenciaDto,
  UpdateGatilhoDto,
  UpdateRotinaDto,
} from './dto/cadencia.dto';

// WORM-13 — Automacoes (cadencia/persona + gatilhos + rotinas). Mesma superficie
// do Vendas: gate de modulo 'vendas'. NENHUM endpoint dispara WhatsApp direto — o
// unico auto-disparo (runner) fica atras da flag HBX_CADENCIA_RUNNER_ENABLED (OFF).
@Controller('cadencia')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('vendas')
export class CadenciaController {
  constructor(
    private readonly cadencia: CadenciaService,
    private readonly gatilhos: CadenciaGatilhoService,
    private readonly rotinas: CadenciaRotinaService,
  ) {}

  // ---------------- 13a — CADENCIAS (personas) ----------------
  @Get()
  list(@Req() req: any) {
    return this.cadencia.listForUser(req.user);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateCadenciaDto) {
    return this.cadencia.createForUser(req.user, dto || {});
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateCadenciaDto) {
    return this.cadencia.updateForUser(req.user, id, dto || {});
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.cadencia.deleteForUser(req.user, id);
  }

  // Aplicar cadencia a uma lista de leadIds OU a um savedSearchId.
  @Post(':id/aplicar')
  aplicar(@Req() req: any, @Param('id') id: string, @Body() dto: AplicarCadenciaDto) {
    return this.cadencia.aplicarForUser(req.user, id, dto || {});
  }

  // Cancelar inscricoes (toda a cadencia, ou um lead com ?leadId=).
  @Post(':id/cancelar')
  cancelar(@Req() req: any, @Param('id') id: string, @Query('leadId') leadId?: string) {
    return this.cadencia.cancelarInscricoes(req.user, id, leadId);
  }

  // ---------------- 13b — GATILHOS ----------------
  @Get('gatilhos')
  listGatilhos(@Req() req: any) {
    return this.gatilhos.listForUser(req.user);
  }

  @Post('gatilhos')
  createGatilho(@Req() req: any, @Body() dto: CreateGatilhoDto) {
    return this.gatilhos.createForUser(req.user, dto || {});
  }

  @Patch('gatilhos/:id')
  updateGatilho(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateGatilhoDto) {
    return this.gatilhos.updateForUser(req.user, id, dto || {});
  }

  @Delete('gatilhos/:id')
  removeGatilho(@Req() req: any, @Param('id') id: string) {
    return this.gatilhos.deleteForUser(req.user, id);
  }

  // ---------------- 13c — ROTINAS ----------------
  @Get('rotinas')
  listRotinas(@Req() req: any) {
    return this.rotinas.listForUser(req.user);
  }

  @Post('rotinas')
  createRotina(@Req() req: any, @Body() dto: CreateRotinaDto) {
    return this.rotinas.createForUser(req.user, dto || {});
  }

  @Patch('rotinas/:id')
  updateRotina(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateRotinaDto) {
    return this.rotinas.updateForUser(req.user, id, dto || {});
  }

  @Delete('rotinas/:id')
  removeRotina(@Req() req: any, @Param('id') id: string) {
    return this.rotinas.deleteForUser(req.user, id);
  }
}
