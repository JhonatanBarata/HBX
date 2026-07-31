import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { WebscrapingModule } from '../webscraping/webscraping.module';
import { CommercialPlansModule } from '../commercial-plans/commercial-plans.module';
import { CreditsModule } from '../credits/credits.module';
import { MasterAlertModule } from '../master-alert/master-alert.module';
import { ConciergeController } from './concierge.controller';
import { ConciergeService } from './concierge.service';
import { ConciergeReviewService } from './concierge-review.service';

// CONCIERGE IA (Missão F — RELEASE-20X S5). REUSA, não rebuilda:
// - IA: mesmo Ollama local + faixa realtime do GOVERNOR-IA (concierge-ollama).
// - Busca: WebscrapingService.startRadarSearchRunForUser EXISTENTE.
// - Custo/cota: CommercialUsageLimitsService + catálogo de crédito.
// De propósito NÃO importa MessagingModule/Webwhats — o concierge não fala com
// chip nenhum; a única ação executável é a busca do Radar, com clique humano.
//
// 31/07: entra o ConciergeReviewService (revisor noturno). MasterAlertModule só
// para AVISAR o dono do resultado — pelo sino, sem zap. Continua sem Messaging.
@Module({
  imports: [PrismaModule, ModulesAccessModule, WebscrapingModule, CommercialPlansModule, CreditsModule, MasterAlertModule],
  controllers: [ConciergeController],
  providers: [ConciergeService, ConciergeReviewService],
})
export class ConciergeModule {}
