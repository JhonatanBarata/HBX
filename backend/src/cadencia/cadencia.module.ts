import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { MessagingModule } from '../messaging/messaging.module';
import { AtividadesModule } from '../atividades/atividades.module';
import { SavedSearchModule } from '../saved-search/saved-search.module';
import { CadenciaController } from './cadencia.controller';
import { CadenciaService } from './cadencia.service';
import { CadenciaGatilhoService } from './cadencia-gatilho.service';
import { CadenciaRotinaService } from './cadencia-rotina.service';
import { CadenciaSchedulerService } from './cadencia-scheduler.service';

// WORM-13 — Automacoes. Reusa (nao rebuilda):
//   - MessagingModule -> ConversationsService (envio WhatsApp com freios) +
//     InboxRealtimeService (notificacao) + o relay de inbound (gatilho 13b).
//   - AtividadesModule -> AtividadesService.createFromAutomation (hook WORM-12).
//   - SavedSearchModule -> SavedSearchService.runForUser (rotina 13c em cima do WORM-15).
// TODO auto-disparo (scheduler/runners) fica atras da flag HBX_CADENCIA_RUNNER_ENABLED
// (default OFF): o scheduler acorda mas nao executa nada enquanto a flag estiver off.
@Module({
  imports: [PrismaModule, AuthModule, ModulesAccessModule, MessagingModule, AtividadesModule, SavedSearchModule],
  controllers: [CadenciaController],
  providers: [CadenciaService, CadenciaGatilhoService, CadenciaRotinaService, CadenciaSchedulerService],
  exports: [CadenciaService, CadenciaGatilhoService],
})
export class CadenciaModule {}
