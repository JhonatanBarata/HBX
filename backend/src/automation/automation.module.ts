import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { AssistenteModule } from '../assistente/assistente.module';
import { BotModule } from '../bot/bot.module';
import { BotConfigStoreModule } from '../bot/config/bot-config-store.module';
import { VendasModule } from '../vendas/vendas.module';
import { CadenciaModule } from '../cadencia/cadencia.module';
import { InboxModule } from '../inbox/inbox.module';
import { AutomationController } from './automation.controller';
import { AutomationOverviewService } from './automation-overview.service';
import { AgentService } from './agent.service';
import { PlaysService } from './plays.service';
import { InboundRouterService } from './inbound-router.service';
import { CadenciaSchedulerService } from '../cadencia/cadencia-scheduler.service';
import { OUTBOUND_EXECUTORS, OutboundOrchestratorService, type OutboundExecutor } from './outbound-orchestrator.service';
import { EventRuleService } from './event-rule.service';
import { AgentBackfillService } from './agent-backfill.service';
import { AgentRuntimeResolver } from './agent-runtime.resolver';

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
// InboxModule -> InboxService (S05, AgentService: GET/PATCH bot-config do
// roteiro — dono real da validação/sanitização tenant-aware, por isso o
// AgentService delega pros métodos PÚBLICOS dele em vez de reimplementar).
// InboxModule não importa AutomationModule (sem ciclo) — ver S05.
//
// S06: InboundRouterService entra como provider aqui (para DI dentro desta
// frente / testes Nest), mas NÃO é usado via DI por MessagingService — o
// router não tem estado nem dependência de construtor (colaboradores passados
// em cada `route()`), então messaging.service.ts instancia direto
// (`new InboundRouterService()`). Isso evita que MessagingModule precise
// importar AutomationModule, o que fecharia um ciclo real:
// AutomationModule -> CadenciaModule -> MessagingModule (CONTRATO.md §1.1).
//
// S07: OutboundOrchestratorService entra como provider aqui, junto do
// provider de fábrica `OUTBOUND_EXECUTORS` — a lista de executores é montada
// chamando `CadenciaSchedulerService.getExecutors()` (CadenciaModule já
// exporta o service desde esta sprint). Prospecção (vendas-automation)
// NÃO entra na lista — ver nota em vendas-automation.service.ts (onModuleInit)
// e CONTRATO.md §"S07 — decisão prospecção fora do orquestrador": tem timer
// próprio, mas é 15s (vs. os 60s default daqui) e é acionado diretamente por
// 4+ pontos do próprio service (start/resume de campanha), não só pelo timer
// — migrar mudaria a cadência real de disparo, o que a sprint proíbe.
//
// S08: EventRuleService entra como provider aqui (para DI dentro desta
// frente/testes Nest), no mesmo espírito de InboundRouterService acima — mas
// `CadenciaGatilhoService` (dentro de CadenciaModule) NÃO o injeta via Nest
// DI: instancia à mão (`new EventRuleService(this.prisma)`) no próprio
// construtor. Isso evita o ciclo real que existiria se CadenciaModule
// precisasse importar AutomationModule de volta (AutomationModule já importa
// CadenciaModule, ver comentário acima). Ver event-rule.service.ts.
//
// S09: AgentBackfillService entra como provider aqui pro mesmo motivo de
// AutomationOverviewService/AgentService (DI dentro desta frente/testes
// Nest) — mas NINGUÉM injeta ele em runtime (não roda no boot, ver README
// linha 85 "flags novas nascem OFF" e S09.md item 3). O consumidor real é o
// script `backend/scripts/automation-agent-backfill.js`, que instancia os 3
// services DONOS (PrismaService, BotConfigStoreService, BotActivationService)
// direto via `require('../dist/...')`, fora do bootstrap HTTP do Nest —
// mesmo padrão de `scripts/f2-fabrica-stop-resume.js`. Registrar aqui só
// mantém o módulo como fonte única de DI da frente, sem duplicar o
// construtor em dois lugares.
//
// S10: AgentRuntimeResolver entra como provider aqui pro MESMO motivo de
// InboundRouterService acima (DI dentro desta frente/testes Nest) — mas os
// consumidores reais (ConversationAssistantRuntimeService em AssistenteModule,
// MessagingService em MessagingModule) instanciam direto
// (`new AgentRuntimeResolver(prisma)`), sem DI — só depende de PrismaService
// (@Global()), então nenhum módulo precisa importar AutomationModule pra
// usá-lo, evitando o ciclo real documentado acima (AutomationModule ->
// CadenciaModule -> MessagingModule). AgentService (aqui mesmo) NÃO usa o
// resolver — flag ON, ele lê `AutomationAgent` direto via PrismaService (ver
// doc-comment em agent.service.ts, seção "S10 — leitura/escrita do schema
// novo"), porque a leitura ali precisa dos DOIS cérebros populados ao mesmo
// tempo (tela de configuração), enquanto o resolver devolve só o cérebro
// ATIVO (contrato do runtime conversacional).
// S11: PlaysService entra como provider aqui pelo MESMO motivo de
// AutomationOverviewService/AgentService (S04/S05) — controller real
// (AutomationController) injeta via DI normal. Nenhum import de módulo novo:
// CadenciaModule (CadenciaService/CadenciaRotinaService), VendasModule
// (VendasAutomationService) e BotModule (BotActivationService) já estavam
// importados acima desde S04/S05/S07 — PlaysService só consome exports que já
// existem, zero mudança na lista de `imports`.
@Module({
  imports: [
    PrismaModule,
    ModulesAccessModule,
    AssistenteModule,
    BotModule,
    BotConfigStoreModule,
    VendasModule,
    CadenciaModule,
    InboxModule,
  ],
  controllers: [AutomationController],
  providers: [
    AutomationOverviewService,
    AgentService,
    PlaysService,
    InboundRouterService,
    AgentRuntimeResolver,
    {
      provide: OUTBOUND_EXECUTORS,
      useFactory: (cadenciaScheduler: CadenciaSchedulerService): OutboundExecutor[] => cadenciaScheduler.getExecutors(),
      inject: [CadenciaSchedulerService],
    },
    OutboundOrchestratorService,
    EventRuleService,
    AgentBackfillService,
  ],
  exports: [
    AutomationOverviewService,
    AgentService,
    PlaysService,
    InboundRouterService,
    AgentRuntimeResolver,
    OutboundOrchestratorService,
    EventRuleService,
    AgentBackfillService,
  ],
})
export class AutomationModule {}
