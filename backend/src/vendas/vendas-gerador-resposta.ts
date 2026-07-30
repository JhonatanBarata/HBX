// GERADOR DE RESPOSTA QUALIFICADA (30/07/2026, 2º período — "classificar ≠
// conversar"). Substitui o sorteio de frases fixas QUANDO dá para conversar de
// verdade: catálogo pronto + ficha da conversa + objetivo do veredito viram um
// prompt; a saída passa por validação dura ANTES de virar mensagem real.
//
// Contrato de segurança (é o motivo de este módulo ser puro e testado):
//   - Sem catálogo pronto, o chamador nem chega aqui (frases fixas seguras).
//   - QUALQUER recusa da validação = fallback nas frases fixas de sempre; o
//     gerador nunca pode ser o motivo de um lead ficar sem resposta.
//   - A validação recusa: preço fora da âncora do catálogo, placeholder {{...}}
//     vazando, resposta gigante (não parece WhatsApp) e "sou uma IA".
//
// A chamada LLM em si fica no messaging.service (callAssistenteOllama, com
// GOVERNOR-IA e flag) — aqui é só montar o prompt e julgar a saída.

import { buildCatalogoPromptBlock, type CatalogoComercial } from './vendas-catalogo';
import {
  buildObjetivoPromptBlock,
  resumirFicha,
  type FichaQualificacao,
  type VeredictoLead,
} from './vendas-qualificacao';

/** Teto de tamanho: acima disso não parece mensagem humana de WhatsApp. */
export const RESPOSTA_MAX_CHARS = 420;

export function montarPromptRespostaQualificada(input: {
  catalogo: CatalogoComercial;
  ficha: FichaQualificacao;
  veredicto: VeredictoLead;
  textoDoLead: string;
}): { role: string; content: string }[] {
  const dores = input.ficha.preenchidas.dor_atual ? [input.ficha.preenchidas.dor_atual] : [];
  const sabido = resumirFicha(input.ficha);
  return [
    {
      role: 'system',
      content: [
        'Você é um vendedor brasileiro respondendo no WhatsApp da empresa. Escreva UMA mensagem curta',
        '(no máximo 2 frases + a pergunta, se o objetivo pedir), natural, sem formalidade excessiva e sem emoji.',
        'Nunca diga que é assistente, robô ou IA. Nunca use marcadores {{...}}.',
        '',
        buildCatalogoPromptBlock(input.catalogo, dores),
        '',
        buildObjetivoPromptBlock(input.veredicto),
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        sabido ? `O que já sabemos da conversa: ${sabido}` : 'Primeira resposta do cliente nesta conversa.',
        `O cliente acabou de dizer: "${String(input.textoDoLead || '').trim().slice(0, 400)}"`,
        'Responda SOMENTE com o texto da mensagem, sem aspas e sem prefixo.',
      ].join('\n'),
    },
  ];
}

export type RespostaValidada = { ok: true; body: string } | { ok: false; motivo: string };

// ---------------------------------------------------------- CONTINUIDADE
// O portão do multi-turno (ordem do dono 30/07: "implante essa continuidade").
// O bot conversa ENQUANTO o card ainda é dele; o teto natural é o próprio
// funil: aquecido → card vai pra "Te chamou" → o vendedor é o dono da conversa
// e o bot cala. As outras travas: humano assumiu, lead fechado e a
// anti-dupla-resposta (mesmo inbound nunca é respondido duas vezes).

export type ContinuidadeGate = { pode: true } | { pode: false; motivo: string };

export function podeContinuarConversaQualificada(input: {
  leadStatus: string | null | undefined;
  leadFechado: boolean;
  humanoAssumiu: boolean;
  inboundMessageId: number | null;
  ultimoInboundRespondido: number | null;
}): ContinuidadeGate {
  if (input.leadFechado) return { pode: false, motivo: 'lead fechado' };
  if (input.humanoAssumiu) return { pode: false, motivo: 'humano assumiu a conversa' };
  const status = String(input.leadStatus || '').trim().toLowerCase();
  if (['retorno', 'qualificado', 'encerrado'].includes(status)) {
    return { pode: false, motivo: 'card já entregue ao vendedor' };
  }
  if (
    input.inboundMessageId &&
    input.ultimoInboundRespondido &&
    input.inboundMessageId === input.ultimoInboundRespondido
  ) {
    return { pode: false, motivo: 'mensagem já respondida' };
  }
  return { pode: true };
}

const PADRAO_PRECO = /r\$\s*\d|\d+\s*(?:reais|por\s+m[eê]s|\/m[eê]s|mensais)|\d+\s*%/i;
const PADRAO_IA = /sou\s+(?:uma?\s+)?(?:ia|intelig[eê]ncia artificial|assistente virtual|rob[oô]|modelo de linguagem)/i;

export function validarRespostaGerada(raw: string, opts: { temAncoraDePreco: boolean }): RespostaValidada {
  let body = String(raw || '').trim();
  // Modelos adoram embrulhar: tira aspas externas e prefixos tipo "Resposta:".
  body = body.replace(/^resposta\s*:\s*/i, '').replace(/^["'“”]+|["'“”]+$/g, '').trim();
  if (!body) return { ok: false, motivo: 'vazia' };
  if (body.length > RESPOSTA_MAX_CHARS) return { ok: false, motivo: `longa demais (${body.length} chars)` };
  if (body.includes('{{')) return { ok: false, motivo: 'placeholder {{...}} vazando' };
  if (PADRAO_IA.test(body)) return { ok: false, motivo: 'se apresentou como IA' };
  if (!opts.temAncoraDePreco && PADRAO_PRECO.test(body)) {
    return { ok: false, motivo: 'citou preço sem âncora no catálogo' };
  }
  return { ok: true, body };
}
