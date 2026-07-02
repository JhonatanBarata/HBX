import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { AuthModule } from '../auth/auth.module';
import { WebscrapingModule } from '../webscraping/webscraping.module';
import { SavedSearchController } from './saved-search.controller';
import { SavedSearchService } from './saved-search.service';

// WORM-15 — pesquisas salvas do Radar. Reusa a query do Radar
// (WebscrapingService.listRadarLeadsForUser) e a distribuicao por vendedor
// (saveRadarSellerStandingOrder) importando o WebscrapingModule.
@Module({
  imports: [PrismaModule, ModulesAccessModule, AuthModule, WebscrapingModule],
  controllers: [SavedSearchController],
  providers: [SavedSearchService],
  exports: [SavedSearchService],
})
export class SavedSearchModule {}
