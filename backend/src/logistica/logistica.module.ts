import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MessagingModule } from '../messaging/messaging.module';
import { LogisticaService } from './logistica.service';
import { LogisticaRecorrenciaService } from './logistica-recorrencia.service';
import { LogisticaController } from './logistica.controller';

/**
 * NÚCLEO-CRM N6 (05/07) — módulo LOGÍSTICA (app de entrega, cliente água).
 *
 * Importa MessagingModule (exporta ConversationsService) para o disparo de
 * WhatsApp "entregue" reusar o caminho BLINDADO da cadência (disjuntor, outbox,
 * 1-número=1-conexão). O disparo (e a cobrança) só rodam com HBX_LOGISTICA_ENABLED
 * ON — default OFF, tudo inerte.
 */
@Module({
  imports: [PrismaModule, MessagingModule],
  controllers: [LogisticaController],
  providers: [LogisticaService, LogisticaRecorrenciaService],
  exports: [LogisticaService, LogisticaRecorrenciaService],
})
export class LogisticaModule {}
