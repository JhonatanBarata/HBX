import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { SavedSearchService } from './saved-search.service';

// LEADS-FINAL 03 (06/07, docs/PLANEJAMENTOS/LEADS-FINAL/03-FILTROS-E-PESQUISAS-SALVAS.md) —
// "Minhas pesquisas" da gaveta de filtros nova. Contrato PRÓPRIO (name/filtersJson) consumido
// pelo worker de FRONTEND desta tarefa; ADAPTER sobre o mesmo SavedSearchService/tabela do
// WORM-15 (ver saved-search.service.ts, secao "LEADS-FINAL 03") — nao duplica dado. Path
// diferente do controller original (/saved-search) de proposito: o contrato antigo (nome/filtro,
// consumido por leads/page.client.tsx e automacoes/page.client.tsx) continua intocado.
@Controller('webscraping/radar/saved-searches')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('vendas')
export class SavedSearchGavetaController {
  constructor(private readonly savedSearchService: SavedSearchService) {}

  @Get()
  list(@Req() req: any) {
    return this.savedSearchService.listGavetaForUser(req.user);
  }

  @Post()
  create(@Req() req: any, @Body() dto: { name?: string; filtersJson?: string }) {
    return this.savedSearchService.createGavetaForUser(req.user, dto || {});
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.savedSearchService.deleteGavetaForUser(req.user, id);
  }
}
