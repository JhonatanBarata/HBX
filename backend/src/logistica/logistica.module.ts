import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MessagingModule } from '../messaging/messaging.module';
import { HbxRecoveryModule } from '../hbx-recovery/hbx-recovery.module';
// CRÉDITO UNIVERSAL (PR10072026): medidor de uso (track da entrega concluída).
import { CreditsModule } from '../credits/credits.module';
// PR10072026 W1: gate de módulo em rota (ModuleAccessGuard precisa do ModulesService).
import { ModulesAccessModule } from '../modules/modules.module';
import { AuthModule } from '../auth/auth.module';
import { LogisticaService } from './logistica.service';
import { LogisticaRecorrenciaService } from './logistica-recorrencia.service';
import { LogisticaRotaService } from './logistica-rota.service';
import { LogisticaConfigService } from './logistica-config.service';
import { LogisticaRecoveryService } from './logistica-recovery.service';
import { LogisticaCobrancaAvisoService } from './logistica-cobranca-aviso.service';
import { ResumoDiarioService } from './resumo-diario.service';
import { LogisticaPedidoPublicoService } from './logistica-pedido-publico.service';
import { LogisticaController } from './logistica.controller';
import { LogisticaPedidoPublicoController } from './logistica-pedido-publico.controller';
import { LogisticaOperacaoService } from './logistica-operacao.service';
import { LogisticaRouteBillingService } from './logistica-route-billing.service';
import { LogisticaTrackingService } from './logistica-tracking.service';
import { LogisticaTrackingMobileController } from './logistica-tracking-mobile.controller';

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
 */
@Module({
  imports: [PrismaModule, MessagingModule, HbxRecoveryModule, CreditsModule, ModulesAccessModule, AuthModule],
  controllers: [LogisticaController, LogisticaPedidoPublicoController, LogisticaTrackingMobileController],
  providers: [
    LogisticaService,
    LogisticaRecorrenciaService,
    LogisticaRotaService,
    LogisticaConfigService,
    LogisticaRecoveryService,
    LogisticaCobrancaAvisoService,
    ResumoDiarioService,
    LogisticaPedidoPublicoService,
    LogisticaOperacaoService,
    LogisticaRouteBillingService,
    LogisticaTrackingService,
  ],
  exports: [
    LogisticaService,
    LogisticaRecorrenciaService,
    LogisticaRotaService,
    LogisticaConfigService,
    LogisticaOperacaoService,
    LogisticaRecoveryService,
    LogisticaRouteBillingService,
    LogisticaTrackingService,
  ],
})
export class LogisticaModule {}
