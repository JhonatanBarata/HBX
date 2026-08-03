import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { ComexCambioService } from './comex-cambio.service';
import {
  ComexDetectoresService,
  parseComexAchadosParams,
} from './comex-detectores.service';
import { ComexNewsService } from './comex-news.service';
import { ComexService } from './comex.service';

/**
 * HBX COMEX — vendas/radar internacional. Módulo próprio ('comex' em
 * structural-defaults.json, defaultEnabled=true — nasce ligado, kill-switch
 * do master por empresa). Multi-tenant: dado analítico é PÚBLICO/agregado,
 * nada aqui é por-empresa — mesmo assim a porta exige sessão + módulo.
 */
@Controller('comex')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('comex')
export class ComexController {
  constructor(
    private readonly comex: ComexService,
    private readonly news: ComexNewsService,
    private readonly cambioService: ComexCambioService,
    private readonly detectores: ComexDetectoresService,
  ) {}

  /**
   * F1 do Analista — biblioteca de detectores (achados rankeados, sem IA).
   * Alvos combináveis: sh4 (mercado) · produto/cnae (gigante escondido via
   * matrizes de afinidade) · municipio+uf (vizinhança SECEX) · preco (régua C1).
   */
  @Get('achados')
  achados(
    @Query('sh4') sh4: string,
    @Query('fluxo') fluxo: string,
    @Query('uf') uf: string,
    @Query('municipio') municipio: string,
    @Query('cnae') cnae: string,
    @Query('produto') produto: string,
    @Query('excluir') excluir: string,
    @Query('preco') preco: string,
  ) {
    return this.detectores.achados(
      parseComexAchadosParams({ sh4, fluxo, uf, municipio, cnae, produto, excluir, preco }),
    );
  }

  @Get('status')
  status() {
    return { disponivel: this.comex.disponivel() };
  }

  @Get('busca')
  busca(@Query('q') q: string) {
    return this.comex.buscaNcm(q || '');
  }

  @Get('mercado')
  mercado(@Query('sh4') sh4: string, @Query('fluxo') fluxo: string) {
    return this.comex.mercado(sh4, fluxo);
  }

  @Get('radar')
  radar(@Query('sh4') sh4: string, @Query('fluxo') fluxo: string) {
    return this.comex.radar(sh4, fluxo);
  }

  // N3 — manchete + fonte + link (modelo Google News); ?lang=pt|en|es filtra.
  @Get('noticias')
  noticias(@Query('lang') lang: string) {
    return this.news.noticias(lang);
  }

  // N3 — PTAX oficial BCB (USD/EUR/CNY venda), cache 60min.
  @Get('cambio')
  cambio() {
    return this.cambioService.cambio();
  }
}
