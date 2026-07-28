import { Body, Controller, ForbiddenException, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Admin } from '../auth/admin.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { LogisticaEstoqueService } from './logistica-estoque.service';
import { ConferirRetornoCargaDiaDto, DeclararCargaDiaDto } from './dto/logistica-estoque.dto';

/**
 * PR27072026 F2 (27/07) — ESTOQUE DE CARGA (`/logistica/estoque/carga`).
 *
 * Guard de classe = mesmo padrão de LogisticaController: JwtAuthGuard +
 * ModuleAccessGuard('logistica') — o kill-switch do módulo (teto master×enabled)
 * já cobre todo mundo. GET fica aberto a QUALQUER ator autenticado da empresa
 * (mesmo padrão do GET /logistica/config — o entregador também pode conferir o
 * dia); as 2 escritas (declarar/conferir) são ADMIN-only (RolesGuard + @Admin(),
 * mesmo padrão do PATCH /logistica/config) — é o dono/gerente que confere o
 * caminhão, não qualquer motorista. O gate de NÍVEL (Advanced+) é do serviço
 * (LogisticaEstoqueService — Forbidden pra BASIC em todo método).
 */
@Controller('logistica/estoque')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('logistica')
export class LogisticaEstoqueController {
  constructor(private readonly service: LogisticaEstoqueService) {}

  private companyId(req: any): number {
    const id = Math.trunc(Number(req?.user?.companyId || 0));
    if (!id) throw new ForbiddenException('Empresa não identificada.');
    return id;
  }

  /** Carga do dia (declarado/vendido ao vivo/esperado de retorno). ?date=YYYY-MM-DD. */
  @Get('carga')
  getCarga(@Req() req: any, @Query('date') date?: string) {
    return this.service.getCargaDia(this.companyId(req), date, req.user);
  }

  /** Declara (ou redeclara, enquanto ABERTA) o que subiu no caminhão hoje. */
  @Post('carga')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  declarar(@Req() req: any, @Body() dto: DeclararCargaDiaDto) {
    return this.service.declararCarga(this.companyId(req), dto, req.user);
  }

  /** Fecha o dia: retorno por produto → CONFERIDA + resultado bateu/sobrou/faltou. */
  @Post('carga/conferir')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  conferir(@Req() req: any, @Body() dto: ConferirRetornoCargaDiaDto) {
    return this.service.conferirRetorno(this.companyId(req), dto, req.user);
  }
}
