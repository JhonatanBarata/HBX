import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { AssistenteController } from './assistente.controller';
import { AssistenteService } from './assistente.service';
import { AssistenteSandboxService } from './assistente-sandbox.service';
import { CopilotoController } from './copiloto.controller';
import { CopilotoService } from './copiloto.service';
import { ConversationAssistantRuntimeService } from './conversation-assistant-runtime.service';

// WORM-14 — Assistente IA (wizard + fluxo em lista + sandbox "Teste sua IA").
//
// REUSA (nao rebuilda) o pipeline de IA local do bot: o sandbox chama o MESMO
// Ollama (:11434, qwen2.5:7b) do classificador (ai-intent-classifier.service).
// De proposito NAO importa MessagingModule/ConversationsService nem nenhum
// client do Webwhats — o sandbox e um chat interno que NUNCA toca o chip. O
// unico auto-envio possivel (publicar) fica atras de HBX_ASSISTENTE_PUBLISH_
// ENABLED (default OFF) e, mesmo ligado, reusa o caminho freado do bot — nunca
// API crua de motor.
@Module({
  imports: [PrismaModule, ModulesAccessModule],
  controllers: [AssistenteController, CopilotoController],
  providers: [AssistenteService, AssistenteSandboxService, CopilotoService, ConversationAssistantRuntimeService],
  exports: [AssistenteService, ConversationAssistantRuntimeService],
})
export class AssistenteModule {}
