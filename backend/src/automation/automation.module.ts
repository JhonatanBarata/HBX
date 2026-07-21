import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { AssistenteModule } from '../assistente/assistente.module';
import { BotModule } from '../bot/bot.module';
import { BotConfigStoreModule } from '../bot/config/bot-config-store.module';
import { VendasModule } from '../vendas/vendas.module';
import { CadenciaModule } from '../cadencia/cadencia.module';
import { AutomationController } from './automation.controller';
import { AutomationOverviewService } from './automation-overview.service';

// S04 (MOTOR-ÚNICO) — módulo `automation`.
//
// ⚠️ Convivência (achado S03, CONTRATO.md §1.1): `backend/src/automation/` JÁ
// TEM `commercial-automation-state.service.ts` (classe PURA, instanciada à mão
// em `vendas/commercial-contact-control.service.ts:74`, NÃO é provider Nest) e
// `characterization/*.test.ts` (S01, o JUIZ de qualquer refactor de
// precedência). Este módulo só COEXISTE na mesma pasta — não renomeia, não
// move, não transforma nada disso em provider daqui.
//
// Importa só pra INJETAR os services donos (nunca duplicar a lógica deles):
// AssistenteModule -> AssistenteService (config/estado do cérebro IA)
// BotModule -> BotActivationService (pino armed/live/preflight por tipo)
// BotConfigStoreModule -> BotConfigStoreService (versão/updatedAt do roteiro)
// VendasModule -> VendasAutomationService (live-status da prospecção)
// CadenciaModule -> CadenciaGatilhoService/CadenciaRotinaService (contagens)
@Module({
  imports: [
    PrismaModule,
    ModulesAccessModule,
    AssistenteModule,
    BotModule,
    BotConfigStoreModule,
    VendasModule,
    CadenciaModule,
  ],
  controllers: [AutomationController],
  providers: [AutomationOverviewService],
  exports: [AutomationOverviewService],
})
export class AutomationModule {}
