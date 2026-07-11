import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MessagingModule } from '../messaging/messaging.module';
import { HbxRecoveryModule } from '../hbx-recovery/hbx-recovery.module';
// CRÉDITO UNIVERSAL (PR10072026): medidor de uso (track da entrega concluída).
import { CreditsModule } from '../credits/credits.module';
// PR10072026 W1: gate de módulo em rota (ModuleAccessGuard precisa do ModulesService).
import { ModulesAccessModule } from '../modules/modules.module';
import { LogisticaService } from './logistica.service';
import { LogisticaRecorrenciaService } from './logistica-recorrencia.service';
import { LogisticaRotaService } from './logistica-rota.service';
import { LogisticaConfigService } from './logistica-config.service';
import { LogisticaRecoveryService } from './logistica-recovery.service';
import { LogisticaCobrancaAvisoService } from './logistica-cobranca-aviso.service';
import { LogisticaController } from './logistica.controller';

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
 */
@Module({
  imports: [PrismaModule, MessagingModule, HbxRecoveryModule, CreditsModule, ModulesAccessModule],
  controllers: [LogisticaController],
  providers: [
    LogisticaService,
    LogisticaRecorrenciaService,
    LogisticaRotaService,
    LogisticaConfigService,
    LogisticaRecoveryService,
    LogisticaCobrancaAvisoService,
  ],
  exports: [
    LogisticaService,
    LogisticaRecorrenciaService,
    LogisticaRotaService,
    LogisticaConfigService,
    LogisticaRecoveryService,
  ],
})
export class LogisticaModule {}
