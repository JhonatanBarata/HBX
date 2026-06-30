import { Module } from '@nestjs/common';
import { AiIntentClassifierService } from './ai-intent-classifier.service';

/**
 * Módulo leaf (sem dependências) do classificador de intenção por IA, para
 * poder ser importado tanto por VendasModule quanto por MessagingModule sem
 * criar dependência circular entre eles.
 */
@Module({
  providers: [AiIntentClassifierService],
  exports: [AiIntentClassifierService],
})
export class AiIntentClassifierModule {}
