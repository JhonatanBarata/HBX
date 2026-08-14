import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { RotaContinuidadeRefDto } from './dto/logistica-rota-continuidade.dto';
import { LogisticaRotaContinuidadeService } from './logistica-rota-continuidade.service';

@Controller('logistica/rota/continuidade')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('logistica')
export class LogisticaRotaContinuidadeController {
  constructor(private readonly continuidade: LogisticaRotaContinuidadeService) {}

  @Get()
  listar(@Req() req: any) {
    return this.continuidade.listar(req.user);
  }

  @Get('abrir')
  abrir(@Req() req: any, @Query('ref') ref?: string) {
    return this.continuidade.abrir(req.user, ref);
  }

  @Post('retomar')
  retomar(@Req() req: any, @Body() dto: RotaContinuidadeRefDto) {
    return this.continuidade.retomar(req.user, dto.ref, dto.expectedOwnerId);
  }

  @Post('puxar')
  puxar(@Req() req: any, @Body() dto: RotaContinuidadeRefDto) {
    return this.continuidade.puxar(req.user, dto.ref, dto.expectedOwnerId);
  }

  @Post('cancelar')
  cancelar(@Req() req: any, @Body() dto: RotaContinuidadeRefDto) {
    return this.continuidade.cancelar(req.user, dto.ref, dto.expectedOwnerId);
  }
}
