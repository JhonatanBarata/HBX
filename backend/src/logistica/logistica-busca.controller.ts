import { BadRequestException, Controller, ForbiddenException, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { LogisticaBuscaService } from './logistica-busca.service';

/**
 * BUSCA DA PARADA AVULSA — F1 (12/08, PR12082026-PESQUISA-PAINEL-AVULSA).
 *
 * Arquivo NOVO, dono próprio — zero edição em logistica.controller.ts
 * (território de sessões paralelas nesta data), mesmo precedente do
 * LogisticaTrackingShareController (27/07).
 *
 * Guard = o MESMO do LogisticaController que o app do entregador já chama:
 * JWT + gate de módulo 'logistica'; companyId vem SEMPRE do usuário logado,
 * nunca do cliente (multi-tenant — nada atravessa empresa).
 *
 * Rotas (a F2 allowlista no Kotlin):
 *   GET /logistica/busca?q=&lat=&lng=
 *   GET /logistica/busca/porta?municipio=&via=&numero=
 */
@Controller('logistica')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('logistica')
export class LogisticaBuscaController {
  constructor(private readonly busca: LogisticaBuscaService) {}

  private ensureCompanyIdFromUser(user: any): number {
    const companyId = Number(user?.companyId);
    if (!companyId) throw new ForbiddenException('Empresa não identificada');
    return companyId;
  }

  /** O painel de busca: 3 grupos (clientes/endereços/comércios), GPS-ranqueado. */
  @Get('busca')
  buscar(
    @Req() req: any,
    @Query('q') q?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.busca.buscar(companyId, q ?? '', lat, lng);
  }

  /** O passo do NÚMERO: via escolhida + número → pino de porta + CEP (F2). */
  @Get('busca/porta')
  porta(
    @Req() req: any,
    @Query('municipio') municipio?: string,
    @Query('via') via?: string,
    @Query('numero') numero?: string,
  ) {
    this.ensureCompanyIdFromUser(req.user); // mesmo gate; a fonte é pública (Censo)
    const codMunicipio = String(municipio ?? '').replace(/\D+/g, '');
    if (!codMunicipio) throw new BadRequestException('municipio (código IBGE) é obrigatório');
    if (!String(via ?? '').trim()) throw new BadRequestException('via é obrigatória');
    return this.busca.resolverPorta({ codMunicipio, via: String(via), numero });
  }
}
