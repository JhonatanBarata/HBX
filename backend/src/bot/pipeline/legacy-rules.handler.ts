// INTENTENGINE Sprint 5 (PR-1) — LegacyRulesInboundHandler.
//
// Contém EXATAMENTE o trecho legado FINAL de `MessagingService.processPersistedInbound`
// (a partir de `const session = await this.sessions.getOrCreateActiveSession(...)` até o
// `return` final): session orchestrator + AutoReplyRule.
//
// REGRA DE OURO desta fatia: extração 1:1. Mesma ordem de decisão, mesmo texto enviado,
// mesma metadata, mesmos efeitos (o que enfileira em outbound, o que grava em
// inboundMessage, os estados de sessão). NADA muda. O código abaixo é cópia ao pé da letra
// do trecho original — só troca `input.company` por `ctx.company`, `companyId`/`from`/`text`
// (já resolvidos no legado) pelos campos equivalentes de `ctx`, e usa os helpers exportados
// de messaging.service (os MESMOS que o trecho usava).

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConversationSessionsService } from '../../messaging/conversation-sessions.service';
import { MessageOrchestratorService } from '../../messaging/message-orchestrator.service';
import { OrderDraftsService } from '../../messaging/order-drafts.service';
import { ConversationsService } from '../../messaging/conversations.service';
import {
  computeGreeting,
  normalizeText,
  renderTemplate,
} from '../../messaging/messaging.service';
import type { InboundContext, InboundHandler, InboundHandlerResult } from './inbound-handler';

@Injectable()
export class LegacyRulesInboundHandler implements InboundHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: ConversationSessionsService,
    private readonly orchestrator: MessageOrchestratorService,
    private readonly drafts: OrderDraftsService,
    private readonly conversations: ConversationsService,
  ) {}

  async handle(ctx: InboundContext): Promise<InboundHandlerResult> {
    const companyId = ctx.companyId;
    const from = ctx.from;
    const text = ctx.text;

    const session = await this.sessions.getOrCreateActiveSession({ companyId, channel: 'whatsapp', from });
    const decision = this.orchestrator.decide({ state: session.state, text });
    const nextState = decision.nextState ?? session.state;

    if (nextState !== session.state) {
      await this.sessions.updateSession(session.id, { state: nextState });
    }

    if (decision.draftItems) {
      await this.drafts.upsertForSession({ companyId, sessionId: session.id, items: decision.draftItems });
    }

    await this.prisma.inboundMessage.create({ data: { companyId, from, body: text } });

    if (decision.reply) {
      await this.conversations.queueOutboundForCompany(companyId, {
        to: from,
        body: decision.reply,
        sourceModule: 'atendimento',
        messageType: 'text',
      });
      return { handled: true, result: { matched: true, sessionId: session.id, state: nextState, enqueued: 1 } };
    }

    const rules = await this.prisma.autoReplyRule.findMany({
      where: { companyId, enabled: true },
      include: { responses: true },
      orderBy: [{ priority: 'desc' }, { id: 'asc' }],
    });

    const incoming = text ?? '';
    const matched = rules.find((r) => {
      const pattern = normalizeText(r.pattern, r.caseInsensitive);
      const msg = normalizeText(incoming, r.caseInsensitive);
      if (r.matchType === 'EXACT') return msg === pattern;
      if (r.matchType === 'CONTAINS') return msg.includes(pattern);
      return false;
    });

    if (!matched) return { handled: true, result: { matched: false, sessionId: session.id, state: nextState } };

    const greeting = computeGreeting(ctx.company.timezone);
    const vars = { greeting, companyName: ctx.company.name, from };
    const responses = [...matched.responses].sort((a, b) => a.order - b.order);

    for (const r of responses) {
      const body = renderTemplate(r.template, vars);
      const when = new Date(Date.now() + (r.delaySeconds ?? 0) * 1000);
      const queued = await this.conversations.queueOutboundForCompany(companyId, {
        to: from,
        body,
        at: when,
        sourceModule: 'atendimento',
        messageType: 'text',
      });
      await this.prisma.outboundMessage.update({ where: { id: queued.outboundMessageId }, data: { nextAttemptAt: when } });
    }

    return {
      handled: true,
      result: { matched: true, ruleId: matched.id, sessionId: session.id, state: nextState, enqueued: responses.length },
    };
  }
}
