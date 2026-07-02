import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { AtividadesService } from './atividades.service';
import {
  ConcluirAtividadeDto,
  CreateAtividadeDto,
  ListAtividadesQueryDto,
  UpdateAtividadeDto,
} from './dto/atividades.dto';

// Agenda do vendedor (WORM-12). Mesma superficie do Vendas: gate de modulo 'vendas'
// (Atividades e a agenda dentro da carteira do vendedor, nao um modulo a parte).
@Controller('atividades')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('vendas')
export class AtividadesController {
  constructor(private readonly atividadesService: AtividadesService) {}

  // Tela "Hoje": ?janela=atrasadas|hoje|semana|todas&tipo=&responsavelId=&incluirConcluidas=
  @Get('agenda')
  getAgenda(@Req() req: any, @Query() query: ListAtividadesQueryDto) {
    return this.atividadesService.listForUser(req.user, query || {});
  }

  // Atividades de UM card (usado no detalhe do lead — WORM-11).
  @Get('lead/:leadId')
  getForLead(@Req() req: any, @Param('leadId') leadId: string) {
    return this.atividadesService.listForLead(req.user, leadId);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateAtividadeDto) {
    return this.atividadesService.createForUser(req.user, dto);
  }

  @Patch(':atividadeId')
  update(@Req() req: any, @Param('atividadeId') atividadeId: string, @Body() dto: UpdateAtividadeDto) {
    return this.atividadesService.updateForUser(req.user, atividadeId, dto || {});
  }

  // Concluir = 1 tap + resultado ("atendeu? sim/nao/remarcar").
  @Post(':atividadeId/concluir')
  concluir(@Req() req: any, @Param('atividadeId') atividadeId: string, @Body() dto: ConcluirAtividadeDto) {
    return this.atividadesService.concluirForUser(req.user, atividadeId, dto || {});
  }

  @Delete(':atividadeId')
  remove(@Req() req: any, @Param('atividadeId') atividadeId: string) {
    return this.atividadesService.deleteForUser(req.user, atividadeId);
  }
}
