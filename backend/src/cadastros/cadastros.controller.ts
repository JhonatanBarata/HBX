import { Body, Controller, Get, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { CadastrosService } from './cadastros.service';
import { CreateFornecedorDto, CreatePaisDto, CreatePortoDto, UpsertTransitTimeDto } from './dto/cadastros.dto';

@Controller('cadastros')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('cadastros')
export class CadastrosController {
  constructor(private readonly service: CadastrosService) {}

  @Get('options')
  getOptions(@Req() req: any) {
    return this.service.getOptions(req.user);
  }

  @Post('fornecedores')
  createFornecedor(@Req() req: any, @Body() dto: CreateFornecedorDto) {
    return this.service.createFornecedor(req.user, dto);
  }

  @Post('paises')
  createPais(@Req() req: any, @Body() dto: CreatePaisDto) {
    return this.service.createPais(req.user, dto);
  }

  @Post('portos')
  createPorto(@Req() req: any, @Body() dto: CreatePortoDto) {
    return this.service.createPorto(req.user, dto);
  }

  @Post('transit-times')
  upsertTransitTime(@Req() req: any, @Body() dto: UpsertTransitTimeDto) {
    return this.service.upsertTransitTime(req.user, dto);
  }

  @Get('transit-times/resolve')
  resolveTransitTime(
    @Req() req: any,
    @Query('portoOrigemId', ParseIntPipe) portoOrigemId: number,
    @Query('portoDestinoId', ParseIntPipe) portoDestinoId: number,
  ) {
    return this.service.resolveTransitTime(req.user, portoOrigemId, portoDestinoId);
  }
}
