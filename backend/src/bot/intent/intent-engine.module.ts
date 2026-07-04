import { Module } from '@nestjs/common';
import { AiIntentClassifierService } from './ai-intent-classifier.service';
import { IntentEngineService } from './intent-engine.service';

/**
 * INTENTENGINE — módulo leaf (sem dependência cíclica) do motor de intenção
 * único. Provê o `IntentEngineService` (ponto de entrada de todos os fluxos) e o
 * `AiIntentClassifierService` que ele envelopa. `PrismaService` é @Global, então
 * não precisa importar `PrismaModule` aqui.
 *
 * Pode ser importado tanto por MessagingModule quanto por VendasModule sem criar
 * dependência circular entre eles — mesmo papel que o antigo
 * `AiIntentClassifierModule`.
 */
@Module({
  providers: [AiIntentClassifierService, IntentEngineService],
  exports: [AiIntentClassifierService, IntentEngineService],
})
export class IntentEngineModule {}
