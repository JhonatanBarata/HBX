import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { ContabilService } from './contabil.service';
import { AjusteManualDto, UpdateFiscalProfileDto } from './dto/contabil.dto';

// CONTABIL — endpoints owner-only (mesmo guard das rotas /master). O Contabil só LÊ
// as fontes MP (nenhum endpoint aqui escreve em fluxo de pagamento).
@Controller('master/contabil')
@UseGuards(JwtAuthGuard, MasterGuard)
export class ContabilController {
  constructor(private readonly contabil: ContabilService) {}

  // FiscalRevenueMonth completo — calcula on-demand se não existir.
  @Get('mes/:competencia')
  getMes(@Param('competencia') competencia: string) {
    return this.contabil.getMes(competencia);
  }

  // Simulador de cenário. receita/prolabore em CENTS.
  @Get('simulador')
  simulador(
    @Query('receita') receita?: string,
    @Query('prolabore') prolabore?: string,
    @Query('rbt12') rbt12?: string,
    @Query('folha12m') folha12m?: string,
  ) {
    return this.contabil.simulador({
      receitaMesCents: Math.max(0, Math.trunc(Number(receita || 0))),
      prolaboreCents: Math.max(0, Math.trunc(Number(prolabore || 0))),
      rbt12Cents: rbt12 !== undefined ? Math.max(0, Math.trunc(Number(rbt12))) : undefined,
      folha12mCents: folha12m !== undefined ? Math.max(0, Math.trunc(Number(folha12m))) : undefined,
    });
  }

  // Perfil fiscal (singleton). SEM campos *Encrypted.
  @Get('perfil')
  getPerfil() {
    return this.contabil.getPerfil();
  }

  @Patch('perfil')
  updatePerfil(@Body() dto: UpdateFiscalProfileDto) {
    return this.contabil.updatePerfil(dto);
  }

  // Ajuste manual da receita do mês (motivo obrigatório).
  @Post('mes/:competencia/ajuste')
  ajuste(@Param('competencia') competencia: string, @Body() dto: AjusteManualDto) {
    return this.contabil.ajusteManual(competencia, dto);
  }
}
