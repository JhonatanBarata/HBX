import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Admin } from '../auth/admin.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import {
  CreateAgendaPlanoDto,
  ExecutarAgendaDiaAcaoDto,
  ReordenarAgendaDiaDto,
  UpdateAgendaPlanoDto,
} from './dto/logistica-agenda.dto';
import { LogisticaAgendaService } from './logistica-agenda.service';

@Controller('logistica/agenda')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('logistica')
export class LogisticaAgendaController {
  constructor(private readonly agenda: LogisticaAgendaService) {}

  private companyId(req: any): number {
    const companyId = Math.trunc(Number(req?.user?.companyId || 0));
    if (!companyId) throw new ForbiddenException('Empresa não identificada.');
    return companyId;
  }

  private userId(req: any): number {
    const userId = Math.trunc(Number(req?.user?.id || 0));
    if (!userId) throw new ForbiddenException('Usuário não identificado.');
    return userId;
  }

  /** Resumo compacto dos sete dias; leitura também atende o app do motorista. */
  @Get()
  summary(@Req() req: any) {
    return this.agenda.getSummary(this.companyId(req));
  }

  @Get('dias/:dia')
  day(@Req() req: any, @Param('dia') day: string) {
    return this.agenda.getDay(this.companyId(req), day);
  }

  @Get('dias/:dia/previa')
  dayPreview(
    @Req() req: any,
    @Param('dia') day: string,
    @Query('date') date?: string,
  ) {
    return this.agenda.getDayPreview(this.companyId(req), day, date);
  }

  /** S2 — rotas salvas candidatas a importar sequência para este dia. */
  @Get('dias/:dia/sequencias')
  @UseGuards(RolesGuard)
  @Admin()
  importSequences(@Req() req: any, @Param('dia') day: string) {
    return this.agenda.listImportSequences(this.companyId(req), day);
  }

  /** S2 — preview do matching (read-only); aplicar é o PATCH dias/:dia/ordem já existente. */
  @Get('dias/:dia/importar-preview')
  @UseGuards(RolesGuard)
  @Admin()
  importPreview(
    @Req() req: any,
    @Param('dia') day: string,
    @Query('modeloId') modeloId?: string,
  ) {
    return this.agenda.getImportPreview(this.companyId(req), day, modeloId);
  }

  /** S3 — divergências entre planos ativos do dia e a rota salva do mesmo dia (read-only). */
  @Get('dias/:dia/divergencias')
  @UseGuards(RolesGuard)
  @Admin()
  divergencias(@Req() req: any, @Param('dia') day: string) {
    return this.agenda.getDivergencias(this.companyId(req), day);
  }

  @Get('catalogos')
  @UseGuards(RolesGuard)
  @Admin()
  catalogs(@Req() req: any) {
    return this.agenda.getCatalogs(this.companyId(req));
  }

  // 🔴 MORREU AQUI o "Organizar agora" (`GET legado/preview` + `POST
  // legado/aplicar`, F2 09/08). Ele lia a agenda V1 de dentro do
  // `ClienteProduto` (`diasSemana`/`frequenciaDias`/`proximaData`) e a copiava
  // pros planos. Nenhum cadastro grava mais dia no vínculo — a porta é
  // `definirDiasDaVisita`, e ela já escreve PLANO —, então o importador não tem
  // mais de onde importar. Ele também já era inalcançável desde a F1: o `modo`
  // da agenda passou a ser sempre `AGENDA_V2`, e a tela só oferecia o botão em
  // modo LEGADO. A tela do botão sai na F5.

  @Post('planos')
  @UseGuards(RolesGuard)
  @Admin()
  createPlan(@Req() req: any, @Body() dto: CreateAgendaPlanoDto) {
    return this.agenda.createPlan(this.companyId(req), dto);
  }

  @Patch('planos/:id')
  @UseGuards(RolesGuard)
  @Admin()
  updatePlan(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateAgendaPlanoDto,
  ) {
    return this.agenda.updatePlan(this.companyId(req), id, dto);
  }

  @Patch('dias/:dia/ordem')
  @UseGuards(RolesGuard)
  @Admin()
  reorderDay(
    @Req() req: any,
    @Param('dia') day: string,
    @Body() dto: ReordenarAgendaDiaDto,
  ) {
    return this.agenda.reorderDay(this.companyId(req), day, dto);
  }

  @Get('dias/:dia/acao-preview')
  @UseGuards(RolesGuard)
  @Admin()
  actionPreview(
    @Req() req: any,
    @Param('dia') day: string,
    @Query('acao') action?: string,
    @Query('destinoDiaSemana') destination?: string,
    @Query('dataInicio') startDate?: string,
  ) {
    return this.agenda.getActionPreview(
      this.companyId(req),
      day,
      action,
      destination,
      startDate,
    );
  }

  @Post('dias/:dia/acao')
  @UseGuards(RolesGuard)
  @Admin()
  executeAction(
    @Req() req: any,
    @Param('dia') day: string,
    @Body() dto: ExecutarAgendaDiaAcaoDto,
  ) {
    return this.agenda.executeDayAction(
      this.companyId(req),
      this.userId(req),
      day,
      dto,
    );
  }
}
