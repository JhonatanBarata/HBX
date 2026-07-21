import { Injectable } from '@nestjs/common';
import { classifyProspectingAutoReply } from '../vendas/prospecting-safety';

// ============================================================================
// S06 (MOTOR-ÚNICO) — InboundRouterService.
//
// Extração LITERAL da precedência "quem responde este inbound" que hoje mora
// em `messaging.service.ts` (trecho ~10041-10144 de `processPersistedInbound`).
// A ordem abaixo é REGRA DE PRODUTO (paridade HubSpot/Intercom — README.md
// "Benchmark"), documentada linha a linha em
// docs/PLANEJAMENTOS/PR20072026-MOTOR-UNICO/CONTRATO.md §1.2. Qualquer sprint
// que mexer aqui precisa continuar batendo com o JUIZ:
// backend/src/automation/characterization/inbound-precedence.test.ts (S01).
//
// Ordem (CONTRATO §1.2, passos 1-2-4-5-6):
//   1. isValidHumanInbound (tipo humano E não é auto-reply de ausência)
//   2. interruptForInbound (SEMPRE primeiro, awaited, idempotente)
//   3. dispatchVendasCockpitProjection — fora do escopo da fusão, não mexer;
//      mantido aqui só porque é o `conversations` colaborador de qualquer
//      forma e precisa ficar EXATAMENTE entre o interrupt e a cadência.
//   4. dispatchCadenciaInbound — fire-and-forget, `void`, NUNCA `await`
//      (medir latência antes de mudar isso é decisão de outra sprint).
//      S08 (MOTOR-ÚNICO): por baixo, `ConversationsService.dispatchCadenciaInbound`
//      agora aciona o hook de `CadenciaGatilhoService`, que passou a emitir
//      via `EventRuleService.emit(companyId, 'lead_respondeu_whatsapp', ...)`
//      (backend/src/automation/event-rule.service.ts) — o motor genérico de
//      regras que busca/itera/isola erro por regra, delegando a execução das
//      ações pra quem sempre executou (cadencia-gatilho.service.ts). O NOME e
//      a ASSINATURA da chamada abaixo (`conversations.dispatchCadenciaInbound`)
//      de propósito NÃO mudam nesta sprint: são exatamente o que os testes de
//      caracterização S01 mockam e verificam
//      (characterization/inbound-precedence.test.ts, caso "dispatchCadenciaInbound
//      roda para inbound humano valido..."), e o contrato da S08 proíbe tocar
//      nesses testes. Comportamento observável do router é IDÊNTICO a antes.
//   5. findRecoveryCustomerByPhone — SEMPRE chamado, mesmo com inbound
//      não-humano (usado pelo chamador no fallback de recovery/atendimento).
//   6. assistente IA (`prepareReply` + enfileirar via `queueOutboundForCompany`
//      + `markQueued`/`markQueueFailed` + log de evento) — só quando
//      isValidHumanInbound && !recoveryCustomer && a assistente está plugada.
//
// Passo 7 (handleAtendimentoInbound) e o fallback mais profundo (passo 8,
// resolveAtendimentoBotSanitizationContext + handleRecoveryInbound + legacy)
// FICAM no messaging por ora (Opção A do contrato da sprint: menor mudança,
// zero risco de ciclo messaging<->automation) — o router devolve
// `{action:'fallthrough_atendimento', recoveryCustomer}` e quem chama executa
// o resto.
//
// S10 (MOTOR-ÚNICO): listado no "Arquivos" da sprint, mas SEM diff funcional
// aqui — este router é agnóstico à ORIGEM da config (não lê AssistenteConfig/
// AutomationAgent, só interpreta o `handled` que `conversationAssistant.
// prepareReply` devolve). A troca de origem (AgentRuntimeResolver, flag
// `HBX_AUTOMATION_AGENT`) mora inteira dentro de
// `ConversationAssistantRuntimeService.prepareReply` — quando o cérebro
// efetivo é 'roteiro', `prepareReply` já devolve `handled:false` (a
// assistente "não reivindica"), e este router cai no MESMO caminho
// `fallthrough_atendimento` de sempre, sem precisar saber por quê. Zero
// mudança de comportamento aqui, byte a byte.
//
// Desenho anti-ciclo: esta classe NÃO tem dependência de construtor (não
// injeta ConversationsService/CommercialContactControlService/etc via Nest
// DI) — os colaboradores são passados em CADA chamada de `route()`. Isso
// evita que `AutomationModule` precise importar `MessagingModule` (que já
// importa `CadenciaModule`, que por sua vez importa `MessagingModule` de
// volta — ciclo real, ver CONTRATO §1.1) e mantém a classe testável tanto via
// Nest DI (registrada em `automation.module.ts`) quanto via
// `new InboundRouterService()` direto, sem estado — é o mesmo truque já usado
// em `messaging.service.ts` para `commercialContactControl` (construído à mão
// no construtor) e `legacyRulesHandler` (`this.legacyRulesHandler ?? new
// LegacyRulesInboundHandler(...)`). `messaging.service.ts` instancia direto,
// sem passar pelo `@Optional()` do construtor — não há estado a compartilhar.
// ============================================================================

const HUMAN_INBOUND_TYPES = ['text', 'button', 'interactive', 'image', 'video', 'document', 'audio'];

export type InboundRouterLogEvent = {
  companyId?: number | null;
  scope: string;
  event: string;
  message: string;
  conversationId?: number | null;
  phone?: string | null;
  messageType?: string | null;
  result?: string | null;
  extra?: Record<string, unknown> | null;
};

type AssistantPrepareResult =
  | { handled: false; reason: string }
  | {
      handled: true;
      duplicate?: boolean;
      failed?: boolean;
      runId?: string;
      reply?: string;
      publicName?: string;
      source?: string;
      vendasLeadId?: string | null;
      reason?: string;
    };

export type InboundRouterAssistantCollaborator = {
  prepareReply: (input: {
    companyId: number;
    conversationId: number;
    inboundMessageId: number;
    text: string;
  }) => Promise<AssistantPrepareResult>;
  markQueued: (input: {
    companyId: number;
    runId: string;
    outboundMessageId: number;
    source?: string | null;
  }) => Promise<unknown>;
  markQueueFailed: (input: { companyId: number; runId: string; error: unknown }) => Promise<unknown>;
};

export type InboundRouterConversationsCollaborator = {
  dispatchVendasCockpitProjection?: (input: {
    companyId: number;
    conversationId: number;
    event: 'inbound';
    messageId?: number | null;
    validHumanInbound?: boolean;
  }) => Promise<unknown>;
  dispatchCadenciaInbound: (input: {
    companyId: number;
    fromPhone: string;
    conversationId: number | null;
    text: string;
  }) => Promise<unknown> | unknown;
  queueOutboundForCompany: (
    companyId: number,
    payload: Record<string, unknown>,
  ) => Promise<{ outboundMessageId: number | string }>;
};

export type InboundRouterCollaborators = {
  commercialContactControl: {
    interruptForInbound: (input: {
      companyId: number;
      conversationId: number;
      inboundMessageId: number;
      from: string;
      timestamp: Date;
    }) => Promise<unknown>;
  };
  conversations: InboundRouterConversationsCollaborator;
  conversationAssistant?: InboundRouterAssistantCollaborator | null;
  findRecoveryCustomerByPhone: (companyId: number, from: string) => Promise<any>;
  logWhatsAppEvent: (input: InboundRouterLogEvent) => Promise<unknown>;
  logger: { warn: (message: string) => void };
};

export type InboundRouterInput = {
  companyId: number;
  from: string;
  text: string;
  inboundType: string;
  inboundConversationId: number;
  inboundMessageId: number;
  timestamp: Date;
};

export type InboundRouterResult =
  | {
      action: 'handled';
      result: {
        matched: true;
        source: 'conversation_assistant';
        assistantRunId: string | null;
        duplicate: boolean;
        failed: boolean;
      };
    }
  | {
      action: 'fallthrough_atendimento';
      isValidHumanInbound: boolean;
      recoveryCustomer: any;
    };

@Injectable()
export class InboundRouterService {
  async route(collaborators: InboundRouterCollaborators, input: InboundRouterInput): Promise<InboundRouterResult> {
    const { companyId, from, text, inboundType, inboundConversationId, inboundMessageId, timestamp } = input;

    const isValidHumanInbound =
      HUMAN_INBOUND_TYPES.includes(inboundType) && classifyProspectingAutoReply(text) === null;

    if (isValidHumanInbound && inboundConversationId > 0 && inboundMessageId > 0) {
      // Barreira obrigatoria antes de IA e gatilhos: um inbound real invalida os
      // proximos contatos comerciais. O metodo e idempotente pelo id da mensagem.
      await collaborators.commercialContactControl.interruptForInbound({
        companyId,
        conversationId: inboundConversationId,
        inboundMessageId,
        from,
        timestamp,
      });
    }

    if (inboundConversationId > 0 && inboundMessageId > 0) {
      await collaborators.conversations.dispatchVendasCockpitProjection?.({
        companyId,
        conversationId: inboundConversationId,
        event: 'inbound',
        messageId: inboundMessageId,
        validHumanInbound: isValidHumanInbound,
      });
    }

    // WORM-13 (13b) — apenas resposta humana valida aciona a cadencia. Recibo,
    // sincronizacao historica e auto-reply nao podem mover estado comercial.
    if (isValidHumanInbound) {
      void collaborators.conversations.dispatchCadenciaInbound({
        companyId,
        fromPhone: from,
        conversationId: inboundConversationId || null,
        text,
      });
    }

    const recoveryCustomer = await collaborators.findRecoveryCustomerByPhone(companyId, from);
    if (isValidHumanInbound && !recoveryCustomer && collaborators.conversationAssistant) {
      const prepared = await collaborators.conversationAssistant.prepareReply({
        companyId,
        conversationId: inboundConversationId,
        inboundMessageId,
        text,
      });
      if (prepared.handled) {
        if (prepared.runId && prepared.reply) {
          try {
            const queued = await collaborators.conversations.queueOutboundForCompany(companyId, {
              conversationId: inboundConversationId,
              to: from,
              contactId: from,
              body: prepared.reply,
              messageType: 'text',
              sourceModule: 'conversation_assistant',
              senderType: 'bot',
              variables: {
                purpose: 'conversation_reply',
                assistantRunId: prepared.runId,
                inboundMessageId,
                vendasLeadId: prepared.vendasLeadId || null,
              },
              flowState: { botActive: true, humanAssigned: false, flowResult: null },
            });
            await collaborators.conversationAssistant.markQueued({
              companyId,
              runId: prepared.runId,
              outboundMessageId: Number(queued.outboundMessageId),
              source: prepared.source || null,
            });
            await collaborators.logWhatsAppEvent({
              companyId,
              scope: 'conversation_assistant',
              event: 'assistant_reply_queued',
              message: `Resposta de ${prepared.publicName || 'assistente'} enfileirada.`,
              conversationId: inboundConversationId,
              phone: from,
              messageType: 'text',
              result: 'queued',
              extra: {
                assistantRunId: prepared.runId,
                inboundMessageId,
                outboundMessageId: Number(queued.outboundMessageId),
              },
            });
          } catch (error) {
            await collaborators.conversationAssistant
              .markQueueFailed({
                companyId,
                runId: prepared.runId,
                error,
              })
              .catch(() => null);
            collaborators.logger.warn(
              `Falha ao enfileirar resposta da assistente company=${companyId} conversation=${inboundConversationId}: ${String((error as any)?.message || error)}`,
            );
          }
        }
        // Claim, falha ou duplicata da Assistente não cai também no Atendimento:
        // apenas um motor conversacional pode responder ao mesmo inbound.
        return {
          action: 'handled',
          result: {
            matched: true,
            source: 'conversation_assistant',
            assistantRunId: prepared.runId || null,
            duplicate: prepared.duplicate === true,
            failed: prepared.failed === true,
          },
        };
      }
    }

    return { action: 'fallthrough_atendimento', isValidHumanInbound, recoveryCustomer };
  }
}
