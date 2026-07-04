import { Module } from '@nestjs/common';
import { BotConfigStoreService } from './bot-config-store.service';

/**
 * INTENTENGINE S3 — módulo leaf (sem dependência cíclica) do armazenamento
 * versionado de config do bot. `PrismaService` é @Global, então não precisa
 * importar `PrismaModule` aqui. Importado por BotModule, InboxModule,
 * MessagingModule e HbxRecoveryModule (os 4 pontos que hoje leem/gravam config
 * do bot na tabela emprestada `HbxRecoveryFlowStage`).
 */
@Module({
  providers: [BotConfigStoreService],
  exports: [BotConfigStoreService],
})
export class BotConfigStoreModule {}
