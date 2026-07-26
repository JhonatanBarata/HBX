import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MessagingModule } from '../messaging/messaging.module';
import { HbxRecoveryModule } from '../hbx-recovery/hbx-recovery.module';
// Crédito da Logística é reservado no início da entrega.
import { CreditsModule } from '../credits/credits.module';
// PR10072026 W1: gate de módulo em rota (ModuleAccessGuard precisa do ModulesService).
import { ModulesAccessModule } from '../modules/modules.module';
import { AuthModule } from '../auth/auth.module';
import { LogisticaService } from './logistica.service';
import { LogisticaRecorrenciaService } from './logistica-recorrencia.service';
import { LogisticaRecorrenciaOccurrenceService } from './logistica-recorrencia-occurrence.service';
import { LogisticaOccurrenceService } from './logistica-occurrence.service';
import { LogisticaRotaService } from './logistica-rota.service';
import { LogisticaConferenciaService } from './logistica-conferencia.service';
import { LogisticaCustoPreviewService } from './logistica-custo-preview.service';
import { LogisticaRotaModeloService } from './logistica-rota-modelo.service';
import { LogisticaLeituraService } from './logistica-leitura.service';
import { LogisticaGeoService } from './logistica-geo.service';
import { LogisticaOsrmService } from './logistica-osrm.service';
import { LogisticaOsrmController } from './logistica-osrm.controller';
import { LogisticaConfigService } from './logistica-config.service';
import { LogisticaRecoveryService } from './logistica-recovery.service';
import { LogisticaCobrancaAvisoService } from './logistica-cobranca-aviso.service';
import { ResumoDiarioService } from './resumo-diario.service';
import { LogisticaPedidoPublicoService } from './logistica-pedido-publico.service';
import { LogisticaController } from './logistica.controller';
import { LogisticaAdminRouteController } from './logistica-admin-route.controller';
import { LogisticaAdminRouteService } from './logistica-admin-route.service';
import { LogisticaAdminRouteViewService } from './logistica-admin-route-view.service';
import { LogisticaMobileController } from './logistica-mobile.controller';
import { LogisticaMobileService } from './logistica-mobile.service';
import { LogisticaPedidoPublicoController } from './logistica-pedido-publico.controller';
import { LogisticaOperacaoService } from './logistica-operacao.service';
import { LogisticaRouteBillingService } from './logistica-route-billing.service';
import { LogisticaTrackingService } from './logistica-tracking.service';
import { LogisticaTrackingMobileController } from './logistica-tracking-mobile.controller';
import { LogisticaTrackedBillingService } from './logistica-tracked-billing.service';
import { LogisticaTrackingBonusService } from './logistica-tracking-bonus.service';
import { LogisticaOfflineController } from './logistica-offline.controller';
import { LogisticaOfflineService } from './logistica-offline.service';
import { OfflineAwareLogisticaTrackedBillingService } from './logistica-offline-tracked-billing.service';
import { LogisticaOfflineReservationReconcilerService } from './logistica-offline-reservation-reconciler.service';
import { LogisticaAgendaController } from './logistica-agenda.controller';
import { LogisticaAgendaService } from './logistica-agenda.service';
import { LogisticaBaseSaudeController } from './logistica-base-saude.controller';
import { LogisticaBaseSaudeService } from './logistica-base-saude.service';

/**
 * NÚCLEO-CRM N6 (05/07) — módulo LOGÍSTICA (app de entrega, cliente água).
 *
 * Importa MessagingModule (exporta ConversationsService) para o disparo de
 * WhatsApp "entregue" reusar o caminho BLINDADO da cadência (disjuntor, outbox,
 * 1-número=1-conexão). O disparo (e a cobrança) só rodam com HBX_LOGISTICA_ENABLED
 * ON — default OFF, tudo inerte.
 *
 * LOGÍSTICA-MOBILE M7 (05/07): importa HbxRecoveryModule (exporta HbxRecoveryService)
 * para a cobrança vencida da logística entrar no funil hbx-recovery EXISTENTE via
 * createCustomer (opt-in por LogisticaConfig.moduloRecoveryAtivo, default OFF). Sem
 * ciclo: hbx-recovery NÃO importa logistica.
 *
 * OFFLINE-ROTA: LogisticaOfflineController emite uma cápsula restrita a uma rota
 * ACTIVE/aparelho. A implementação especializada de tracked billing reserva os
 * créditos ao preparar e continua concluindo a claim na transação canônica. O
 * reconciliador devolve claims ainda DEBITED depois que a rota chega a COMPLETED.
 *
 * S2 COBRANÇA-WHATS (11/07): LogisticaCobrancaAvisoService = aviso de cobrança +
 * lembrete de vencimento no zap (Pix copia-e-cola), DORMENTE atrás de
 * HBX_COBRANCA_WHATS_ENABLED (default OFF — scheduler nem arma) + toggle por
 * tenant (LogisticaConfig.cobrancaWhatsAtiva, default false). Provider entra
 * AQUI (regra do S2: nada em app.module.ts); envio só pelo caminho blindado
 * (ConversationsService, já exportado pelo MessagingModule importado acima).
 *
 * S3 RESUMO-DIÁRIO (11/07): ResumoDiarioService = resumo do negócio no WhatsApp
 * do DONO (telefone VERIFICADO do cadastro), 1 msg/empresa/dia na hora escolhida.
 * DORMENTE atrás de HBX_RESUMO_DIARIO_ENABLED (default OFF — scheduler nem arma)
 * + toggle por tenant (LogisticaConfig.resumoDiarioAtivo, default false). Mesmas
 * regras do S2: provider AQUI, envio SÓ pelo caminho blindado.
 *
 * S6 PORTAL-PEDIDO (11/07): LogisticaPedidoPublicoController = rota PÚBLICA
 * /public/pedido/:token (sem JWT — segurança pelo token opaco, molde
 * website-lead-capture). DORMENTE atrás de HBX_PEDIDO_PUBLICO_ENABLED (default
 * OFF — GET/POST respondem 404 seco) + toggle por tenant
 * (LogisticaConfig.pedidoPublicoAtivo, default false). Controller entra AQUI
 * (regra do S6: nada em app.module.ts); pedido vira Entrega 'agendada' — ZERO
 * WhatsApp/cobrança (efeitos continuam só no confirmar, atrás da flag do N6).
 *
 * ADMIN MOBILE (16/07): ocorrência recorrente, data operacional e rota deixam de
 * ser a mesma coisa. O adapter LogisticaRecorrenciaOccurrenceService mantém o
 * CRUD antigo, mas direciona preview/gerar-dia para o motor determinístico de
 * ocorrências. O novo controller expõe Ajustar → Traçar → Começar exclusivamente
 * ao administrador, sem antecipar a futura árvore de roles.
 *
 * CONTRATO APK (17/07): LogisticaMobileController mantém a rota actor-scoped e
 * entrega ao motorista apenas as instruções de recebimento necessárias. A mesma
 * superfície materializa datas de origem na data operacional escolhida, sem
 * reabrir histórico nem duplicar ocorrência.
 *
 * S4 OSRM-BACKEND (21/07, PR21072026-NAVEGACAO-HBX): LogisticaOsrmController
 * expõe `/logistica/osrm/route|table` como proxy do OSRM público (servidor de
 * DEMONSTRAÇÃO, sem SLA) — cache + rate-limit por empresa em
 * LogisticaOsrmService, stateless (sem Prisma). O app mantém fallback direto
 * pro público em qualquer erro daqui; self-host futuro = trocar OSRM_BASE_URL.
 *
 * S1 MOTOR-COM-CRACHÁ (25/07, PR25072026-ROTA-CONFERIDA): LogisticaRotaService
 * passa a INJETAR LogisticaOsrmService (@Optional — degrada pro degrau 2 sem
 * quebrar se algum teste instanciar o serviço sem ele) como DEGRAU 1 da cadeia
 * proxy→público→Haversine de planRouteByRoads. Mesmo provider desta entrada, só
 * ganhou mais um consumidor dentro do módulo.
 *
 * S3 VALIDADOR-CONFERÊNCIA (25/07, PR25072026-ROTA-CONFERIDA): LogisticaConferenciaService
 * roda o MESMO planRouteByRoads em memória (DRY-RUN ABSOLUTO — Lei nº3: nunca grava
 * rotaOrdem/etaAt, nunca chama LogisticaRouteBillingService) e devolve o semáforo de
 * confiança do pino por parada. Reusa LogisticaConfigService/LogisticaOsrmService já
 * providos aqui; não precisa de novo import de módulo.
 *
 * S6 CRÉDITOS-PREVIEW (25/07, PR25072026-ROTA-CONFERIDA): LogisticaCustoPreviewService
 * é 100% LEITURA (Lei nº3: nenhum wallet.debit/prepareRoute) — espelha a MESMA
 * fórmula de blocos do billing real (essentialBlocksForDeliveries, importada de
 * logistica-route-billing.service.ts) pra devolver quanto o Iniciar VAI debitar
 * antes do operador apertar o botão. Reusa CreditWalletService/LogisticaConfigService
 * já providos aqui; não precisa de novo import de módulo.
 *
 * S7 SAÚDE-DA-BASE (25/07, PR25072026-ROTA-CONFERIDA): LogisticaBaseSaudeController/
 * Service expõem `/logistica/base-saude` — a MESMA regra da S3 (`conferirParadas`)
 * apontada pro tenant inteiro em vez da rota do dia. Read-only puro (só
 * findMany/groupBy); nenhuma dependência nova de módulo (só PrismaModule, já
 * importado acima).
 */
@Module({
  imports: [PrismaModule, MessagingModule, HbxRecoveryModule, CreditsModule, ModulesAccessModule, AuthModule],
  controllers: [
    LogisticaController,
    LogisticaAdminRouteController,
    LogisticaMobileController,
    LogisticaPedidoPublicoController,
    LogisticaTrackingMobileController,
    LogisticaOfflineController,
    LogisticaOsrmController,
    LogisticaAgendaController,
    LogisticaBaseSaudeController,
  ],
  providers: [
    LogisticaService,
    LogisticaOccurrenceService,
    LogisticaRecorrenciaOccurrenceService,
    {
      provide: LogisticaRecorrenciaService,
      useExisting: LogisticaRecorrenciaOccurrenceService,
    },
    LogisticaAdminRouteService,
    LogisticaAdminRouteViewService,
    LogisticaMobileService,
    LogisticaRotaService,
    LogisticaConferenciaService,
    LogisticaCustoPreviewService,
    LogisticaRotaModeloService,
    LogisticaLeituraService,
    LogisticaGeoService,
    LogisticaOsrmService,
    LogisticaConfigService,
    LogisticaRecoveryService,
    LogisticaCobrancaAvisoService,
    ResumoDiarioService,
    LogisticaPedidoPublicoService,
    LogisticaOperacaoService,
    LogisticaRouteBillingService,
    LogisticaTrackingService,
    OfflineAwareLogisticaTrackedBillingService,
    {
      provide: LogisticaTrackedBillingService,
      useExisting: OfflineAwareLogisticaTrackedBillingService,
    },
    LogisticaOfflineService,
    LogisticaOfflineReservationReconcilerService,
    LogisticaTrackingBonusService,
    LogisticaAgendaService,
    LogisticaBaseSaudeService,
  ],
  exports: [
    LogisticaService,
    LogisticaRecorrenciaService,
    LogisticaOccurrenceService,
    LogisticaMobileService,
    LogisticaRotaService,
    LogisticaConfigService,
    LogisticaOperacaoService,
    LogisticaRecoveryService,
    LogisticaRouteBillingService,
    LogisticaTrackingService,
    LogisticaTrackedBillingService,
    LogisticaTrackingBonusService,
    LogisticaAgendaService,
  ],
})
export class LogisticaModule {}
