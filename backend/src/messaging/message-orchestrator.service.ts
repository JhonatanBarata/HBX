import { Injectable } from '@nestjs/common';

@Injectable()
export class MessageOrchestratorService {
  // Minimal orchestrator: (state + incoming) -> (nextState + optional reply)
  decide(input: { state: string; text: string }) {
    const state = String(input.state || 'NEW');
    const rawText = String(input.text || '');
    const text = rawText.trim().toLowerCase();

    // Only the minimal rule requested
    if (text === 'oi') {
      return {
        nextState: state === 'NEW' ? 'AWAITING_MENU' : state,
        reply: 'Olá! Recebi sua mensagem. Em breve teremos um menu aqui.',
        draftItems: null as any,
        context: undefined as any,
      };
    }

    // Minimal order bridge: once user is awaiting menu, any non-greeting becomes a draft.
    if (state === 'AWAITING_MENU' && text) {
      return {
        nextState: 'AWAITING_CONFIRMATION',
        reply: 'Recebi seu pedido, confirma?',
        draftItems: { rawText: rawText.trim() },
        context: undefined as any,
      };
    }

    return {
      nextState: state,
      reply: null as string | null,
      draftItems: null as any,
      context: undefined as any,
    };
  }
}
