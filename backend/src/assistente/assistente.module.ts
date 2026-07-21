import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ModulesAccessModule } from '../modules/modules.module';
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
// unico auto-envio possivel (publicar) fica atras de HBX_AUTOMATION_IA_LIVE
// (fallback HBX_ASSISTENTE_PUBLISH_ENABLED, default OFF) e, mesmo ligado,
// reusa o caminho freado do bot — nunca API crua de motor.
//
// S20 (MOTOR-ÚNICO): `AssistenteController` (rotas HTTP /assistente,
// /assistente/templates, /assistente/prompt, POST /assistente,
// /assistente/sandbox, /assistente/publish) foi REMOVIDO — zero consumidor
// vivo (grep completo em frontend web + EntregaShell/APK + tests; a tela
// /assistente virou redirect na S17, e a nova secao-atendente.tsx documenta
// explicitamente "NUNCA chama /assistente ... direto"). `AssistenteService`
// FICA (usado internamente pelo AgentService — automation/agent.service.ts —
// via injeção de dependência, não HTTP: .get/.save/.publish/.runSandbox).
// Ver relatório da S20 (docs/PLANEJAMENTOS/PR20072026-MOTOR-UNICO/) pra prova.
// `CopilotoController` é feature SEPARADA (INTOCÁVEL, achado S02/S20) — só
// compartilha o prefixo de URL /assistente por acidente histórico, continua
// registrado normalmente.
@Module({
  imports: [PrismaModule, forwardRef(() => ModulesAccessModule)],
  controllers: [CopilotoController],
  providers: [AssistenteService, AssistenteSandboxService, CopilotoService, ConversationAssistantRuntimeService],
  exports: [AssistenteService, ConversationAssistantRuntimeService],
})
export class AssistenteModule {}
