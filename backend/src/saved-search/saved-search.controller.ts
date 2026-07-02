import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { SavedSearchService } from './saved-search.service';
import { CreateSavedSearchDto, UpdateSavedSearchDto } from './dto/saved-search.dto';

// WORM-15 — pesquisas salvas do Radar. Mesma superficie do Radar/Vendas: gate de
// modulo 'vendas' (a pesquisa salva vive dentro da tela Leads do vendedor).
@Controller('saved-search')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('vendas')
export class SavedSearchController {
  constructor(private readonly savedSearchService: SavedSearchService) {}

  @Get()
  list(@Req() req: any) {
    return this.savedSearchService.listForUser(req.user);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateSavedSearchDto) {
    return this.savedSearchService.createForUser(req.user, dto);
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateSavedSearchDto) {
    return this.savedSearchService.updateForUser(req.user, id, dto || {});
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.savedSearchService.deleteForUser(req.user, id);
  }

  // Re-roda o filtro salvo na MESMA query do Radar (listRadarLeadsForUser).
  @Post(':id/run')
  run(@Req() req: any, @Param('id') id: string) {
    return this.savedSearchService.runForUser(req.user, id);
  }
}
