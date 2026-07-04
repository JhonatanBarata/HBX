// INTENTENGINE Sprint 5 — contrato do pipeline de inbound.
//
// Objetivo: o roteador de inbound (`MessagingService.processPersistedInbound`) deixa de
// ser um trecho monolítico e passa a delegar, etapa por etapa, para handlers explícitos.
// Esta é a PRIMEIRA fatia (PR-1): só o contrato + o handler de MENOR risco
// (`LegacyRulesInboundHandler`, session orchestrator + AutoReplyRule).
//
// REGRA DE OURO: extração 1:1. Nenhum handler pode mudar ordem de decisão, texto enviado,
// metadata ou log em relação ao trecho legado de onde saiu.

/**
 * Contexto de um inbound já persistido, no ponto em que o trecho legado final é acionado.
 *
 * Os campos espelham exatamente o que `processPersistedInbound` já tem em mãos quando chega
 * ao trecho do session orchestrator + AutoReplyRule. Nada aqui é novo: é o mesmo estado que
 * já vivia como variáveis locais / `input` do método.
 */
export interface InboundContext {
  /** Empresa dona do inbound (id, nome e timezone — como no `input.company` legado). */
  company: { id: number; name: string; timezone?: string | null };
  /** `companyId` numérico já resolvido (`Number(input.company.id || 0)`). */
  companyId: number;
  /** Telefone normalizado do cliente (`normalizeWhatsAppPhone(input.from)`). */
  from: string;
  /** Texto já trimado (`String(input.text || '').trim()`). */
  text: string;
  /** Tipo do inbound normalizado. */
  inboundType: string;
  /** Id da conversa do inbound (`Number(input.inboundRow?.conversationId || 0)`). */
  conversationId: number;
  /** Linha do inbound persistido (id + conversationId). */
  inboundRow: { id: number; conversationId: number | null };
  /** Timestamp do inbound. */
  timestamp: Date;
  /** Escopo (`webhook` | `webwhats_sync` | ...). */
  scope: string;
  /** Provider (`WHATSAPP_CLOUD` | `WEBWHATS` | ...). */
  provider: string;
  /** Módulo de origem. */
  sourceModule: string;
  /** Payload cru do inbound (opcional). */
  rawPayload?: any;
  /** Id da mensagem no provider (opcional). */
  externalMessageId?: string | null;
}

/**
 * Resultado de um handler do pipeline.
 *
 * `handled: false` significa "não é comigo, siga a cadeia". `handled: true` encerra a cadeia
 * e `result` carrega o shape que `processPersistedInbound` deve retornar (mesmo shape do
 * trecho legado — não inventamos um envelope novo).
 */
export interface InboundHandlerResult {
  handled: boolean;
  result?: any;
}

/** Contrato comum de um handler do pipeline de inbound. */
export interface InboundHandler {
  handle(ctx: InboundContext): Promise<InboundHandlerResult>;
}
