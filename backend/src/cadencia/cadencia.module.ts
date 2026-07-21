import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { MessagingModule } from '../messaging/messaging.module';
import { AtividadesModule } from '../atividades/atividades.module';
import { SavedSearchModule } from '../saved-search/saved-search.module';
import { MailModule } from '../mail/mail.module';
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
//   - MailModule -> CompanyMailerService.sendForCompany (e-mail real da cadencia, remetente
//     do PROPRIO tenant; passo canal:'email' atras da flag HBX_CADENCIA_EMAIL_ENABLED, default OFF).
// TODO auto-disparo (scheduler/runners) fica atras da flag HBX_CADENCIA_RUNNER_ENABLED
// (default OFF): o scheduler acorda mas nao executa nada enquanto a flag estiver off.
@Module({
  imports: [PrismaModule, AuthModule, ModulesAccessModule, MessagingModule, AtividadesModule, SavedSearchModule, MailModule],
  controllers: [CadenciaController],
  providers: [CadenciaService, CadenciaGatilhoService, CadenciaRotinaService, CadenciaSchedulerService],
  // CadenciaRotinaService entrou nos exports na S04 (MOTOR-ÚNICO) — puramente
  // aditivo (só abre a porta de DI, nenhum provider/behavior muda) pra o módulo
  // `automation` novo poder injetá-la e ler `rotinasAtivas` no GET /automation/overview
  // sem duplicar a query.
  // CadenciaSchedulerService entrou nos exports na S07 (MOTOR-ÚNICO) — aditivo
  // igual: o timer próprio dele morreu (ver cadencia-scheduler.service.ts), ele
  // agora só EXPÕE os executores (`getExecutors()`) pro AutomationModule
  // registrar no OutboundOrchestratorService. Nenhum provider novo, só abre DI.
  exports: [CadenciaService, CadenciaGatilhoService, CadenciaRotinaService, CadenciaSchedulerService],
})
export class CadenciaModule {}
