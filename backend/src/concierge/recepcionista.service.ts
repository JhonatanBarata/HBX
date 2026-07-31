// ============================================================================
// RECEPCIONISTA IA — o cérebro fino (31/07/2026).
//
// Uma responsabilidade só: transformar a fala do cliente em slots confiáveis
// (`nome`, `empresa`, `assunto`). Toda a regra dura mora no módulo PURO
// `recepcionista-slots.ts`; aqui é só a orquestração com a IA local.
//
// TRÊS GARANTIAS, nesta ordem:
//  1. NUNCA lança. Recepção que quebra deixa cliente falando sozinho — qualquer
//     falha (IA off, timeout, cold-load, JSON torto) cai no chão determinístico.
//  2. O CHÃO VEM PRIMEIRO. A extração por regra roda SEMPRE e é o piso; a IA só
//     acrescenta o que o regex não pegou. Assim a recepcionista funciona com a
//     IA desligada — e o dono não fica refém de GPU pra atender cliente.
//  3. A IA NÃO DECIDE NADA. Ela devolve JSON, o `sanitize` do módulo puro corta,
//     e o porteiro do nome (`isPlausibleName`) tem a palavra final.
// ============================================================================

import { Injectable, Logger } from '@nestjs/common';

import { safeParseConciergeJson } from './concierge-slots';
import { callConciergeExtractor, conciergeAiEnabled } from './concierge-ollama';
import {
  buildRecepcionistaMessages,
  extractSlotsDeterministic,
  mergeSlots,
  sanitizeRecepcionistaSlots,
  type RecepcionistaSlots,
} from './recepcionista-slots';

/**
 * Vale a pena gastar uma chamada de modelo nesta mensagem?
 * Só quando há texto suficiente pra existir uma apresentação que o regex não
 * pegou. Saudação e monossílabo caem fora — a IA não teria o que extrair e o
 * cliente pagaria a espera à toa.
 */
function isRicaOSuficienteParaIa(text: unknown): boolean {
  const limpo = String(text ?? '').trim();
  if (limpo.length < 12) return false;
  return limpo.split(/\s+/).filter(Boolean).length >= 3;
}

@Injectable()
export class RecepcionistaService {
  private readonly logger = new Logger(RecepcionistaService.name);

  /**
   * Lê a mensagem do cliente e devolve os slots que dá pra confiar.
   * `fonte` serve pra medir depois quanto a IA está realmente somando sobre o
   * chão determinístico — sem isso, ligar GPU vira fé, não decisão.
   */
  async extrairSlots(
    text: string,
    opts: { companyId?: number | null } = {},
  ): Promise<{ slots: RecepcionistaSlots; fonte: 'regra' | 'ia' | 'regra+ia' }> {
    const chao = extractSlotsDeterministic(text);

    if (!conciergeAiEnabled()) {
      return { slots: chao, fonte: 'regra' };
    }

    // Se a regra já resolveu tudo, não gasta chamada de modelo.
    if (chao.nome && chao.assunto) {
      return { slots: chao, fonte: 'regra' };
    }

    // LATÊNCIA É PARTE DA RECEPÇÃO: o cliente está do outro lado esperando, e
    // o Ollama frio leva ~35s pra primeira resposta (ver GOTCHA cold-load em
    // WHATSAPP.md). Mensagem curta ("oi", "bom dia", "?") não tem apresentação
    // escondida pra IA achar — o próximo passo já é óbvio (perguntar o nome).
    // Então nem chamamos o modelo: resposta instantânea, custo zero.
    if (!isRicaOSuficienteParaIa(text)) {
      return { slots: chao, fonte: 'regra' };
    }

    try {
      const bruto = await callConciergeExtractor(buildRecepcionistaMessages(text), {
        companyId: opts.companyId ?? null,
      });
      const daIa = sanitizeRecepcionistaSlots(safeParseConciergeJson(bruto));
      const juntos = mergeSlots(chao, daIa);
      const iaAcrescentou =
        (!chao.nome && Boolean(juntos.nome)) ||
        (!chao.assunto && Boolean(juntos.assunto)) ||
        (!chao.empresa && Boolean(juntos.empresa));
      return { slots: juntos, fonte: iaAcrescentou ? 'regra+ia' : 'regra' };
    } catch (error: any) {
      // Cold-load do Ollama (~35s) e governor cheio caem aqui. É esperado e
      // seguro: o cliente é atendido pela regra, ninguém fica sem resposta.
      this.logger.warn(
        `Recepcionista caiu no chao deterministico: ${String(error?.message || error || 'erro desconhecido')}`,
      );
      return { slots: chao, fonte: 'regra' };
    }
  }
}
