import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { WebscrapingModule } from '../webscraping/webscraping.module';
import { CommercialPlansModule } from '../commercial-plans/commercial-plans.module';
import { CreditsModule } from '../credits/credits.module';
import { ConciergeController } from './concierge.controller';
import { ConciergeService } from './concierge.service';

// CONCIERGE IA (Missão F — RELEASE-20X S5). REUSA, não rebuilda:
// - IA: mesmo Ollama local + faixa realtime do GOVERNOR-IA (concierge-ollama).
// - Busca: WebscrapingService.startRadarSearchRunForUser EXISTENTE.
// - Custo/cota: CommercialUsageLimitsService + catálogo de crédito.
// De propósito NÃO importa MessagingModule/Webwhats — o concierge não fala com
// chip nenhum; a única ação executável é a busca do Radar, com clique humano.
@Module({
  imports: [PrismaModule, ModulesAccessModule, WebscrapingModule, CommercialPlansModule, CreditsModule],
  controllers: [ConciergeController],
  providers: [ConciergeService],
})
export class ConciergeModule {}
