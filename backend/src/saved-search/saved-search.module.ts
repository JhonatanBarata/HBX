import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { AuthModule } from '../auth/auth.module';
import { WebscrapingModule } from '../webscraping/webscraping.module';
import { SavedSearchController } from './saved-search.controller';
import { SavedSearchGavetaController } from './saved-search-gaveta.controller';
import { SavedSearchService } from './saved-search.service';

// WORM-15 — pesquisas salvas do Radar. Reusa a query do Radar
// (WebscrapingService.listRadarLeadsForUser) importando o WebscrapingModule.
// (standing order por vendedor removido — LIMPEZA-DESTRUTIVA L4, 04/07.)
// LEADS-FINAL 03 (06/07): SavedSearchGavetaController é o adapter do contrato
// /webscraping/radar/saved-searches sobre o MESMO SavedSearchService (ver comentário lá).
@Module({
  imports: [PrismaModule, ModulesAccessModule, AuthModule, WebscrapingModule],
  controllers: [SavedSearchController, SavedSearchGavetaController],
  providers: [SavedSearchService],
  exports: [SavedSearchService],
})
export class SavedSearchModule {}
