// VARIAÇÕES DE COPY POR IA (item 3 do dia de vendedor, aprovado pelo dono 30/07:
// "a pessoa cria a frase, e nossa IA cria aleatórios de exemplo").
//
// O contrato tem 3 travas, e elas são o motivo deste módulo existir separado:
//   1. NADA é salvo aqui — a IA só PROPÕE; quem aprova/edita/salva é a pessoa,
//      pelo fluxo normal da tela (PATCH da config). IA nunca dispara texto que
//      ninguém viu.
//   2. O LOTE passa pela MESMA régua do gate anti-carimbo (coldTextSimilarity,
//      teto HBX_WA_COLD_SIMILARITY_PCT): variação parecida demais com a frase
//      base OU com outra aprovada é RECUSADA com motivo legível. Régua única —
//      o que o gate cancelaria em produção nem chega a virar sugestão.
//   3. A IA varia FORMA, nunca oferta: os placeholders `{{...}}` da frase-base
//      são obrigatórios e imutáveis (perder um = mensagem sem personalização;
//      inventar um = `{{coisa}}` cru vazando pro lead).
//
// A chamada HTTP ao Ollama local fica no service (callAssistenteOllama, com
// GOVERNOR-IA e flag) — aqui é só o puro: prompt, parse tolerante e validação.

import { coldTextSimilarity, normalizeColdText } from '../messaging/wa-cold-contact-gate.service';

export const VARIACOES_QUANTIDADE_DEFAULT = 4;
export const VARIACOES_QUANTIDADE_MAX = 8;

/** Placeholders `{{...}}` da frase, como conjunto ordenado (ex.: {{cumprimentacao}}). */
export function extrairPlaceholders(texto: string): string[] {
  const found = new Set<string>();
  for (const match of String(texto || '').matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) {
    found.add(match[1]);
  }
  return [...found].sort();
}

export function montarPromptVariacoes(base: string, quantidade: number): { role: string; content: string }[] {
  const n = Math.max(1, Math.min(VARIACOES_QUANTIDADE_MAX, Math.trunc(quantidade || VARIACOES_QUANTIDADE_DEFAULT)));
  const placeholders = extrairPlaceholders(base);
  const regraPlaceholders = placeholders.length
    ? `Mantenha EXATAMENTE estes marcadores, sem criar novos: ${placeholders.map((p) => `{{${p}}}`).join(', ')}.`
    : 'NÃO use marcadores {{...}}.';
  return [
    {
      role: 'system',
      content:
        'Você reescreve mensagens curtas de WhatsApp comercial em português do Brasil. ' +
        'Reescreva variando estrutura, saudação e ritmo — o SENTIDO e a oferta ficam idênticos. ' +
        'É PROIBIDO inventar produto, benefício, preço, prazo ou promessa que não esteja na frase original. ' +
        regraPlaceholders +
        ' Responda SOMENTE um JSON array de strings, sem comentários.',
    },
    {
      role: 'user',
      content: `Frase original:\n${String(base || '').trim()}\n\nGere ${n} variações bem diferentes entre si.`,
    },
  ];
}

/**
 * Parse tolerante da resposta do modelo: primeiro tenta JSON array (inclusive
 * embutido em texto/markdown); senão cai em linhas não vazias. Entrada podre
 * vira lista vazia — nunca lança.
 */
export function parseVariacoesResposta(raw: string): string[] {
  const texto = String(raw || '').trim();
  if (!texto) return [];
  const tentativas: string[] = [texto];
  const bloco = texto.match(/\[[\s\S]*\]/);
  if (bloco) tentativas.unshift(bloco[0]);
  for (const candidato of tentativas) {
    try {
      const parsed = JSON.parse(candidato);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item ?? '').trim()).filter(Boolean);
      }
    } catch {
      // tenta o próximo formato
    }
  }
  return texto
    .split('\n')
    .map((linha) => linha.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim())
    .map((linha) => linha.replace(/^"|"$/g, '').trim())
    .filter((linha) => linha.length > 0 && !/^```/.test(linha));
}

export type VariacaoRecusada = { texto: string; motivo: string };

/**
 * Validação do lote: régua ÚNICA do anti-carimbo + placeholders imutáveis.
 * `thresholdPct` na mesma escala do gate (85 = 0.85).
 */
export function validarLoteVariacoes(
  base: string,
  candidatas: string[],
  thresholdPct: number,
  limite: number = VARIACOES_QUANTIDADE_MAX,
): { aprovadas: string[]; recusadas: VariacaoRecusada[] } {
  const threshold = Math.min(100, Math.max(1, thresholdPct || 85)) / 100;
  const baseNorm = normalizeColdText(base);
  const basePlaceholders = extrairPlaceholders(base).join('|');
  const aprovadas: string[] = [];
  const aprovadasNorm: string[] = [];
  const recusadas: VariacaoRecusada[] = [];

  for (const cru of candidatas) {
    const texto = String(cru || '').trim();
    if (aprovadas.length >= Math.max(1, limite)) break;
    if (!texto || texto.length < 20) {
      if (texto) recusadas.push({ texto, motivo: 'Curta demais para um primeiro contato.' });
      continue;
    }
    if (extrairPlaceholders(texto).join('|') !== basePlaceholders) {
      recusadas.push({ texto, motivo: 'Mudou os marcadores {{...}} da frase original.' });
      continue;
    }
    const norm = normalizeColdText(texto);
    const simBase = coldTextSimilarity(norm, baseNorm);
    if (simBase >= threshold) {
      recusadas.push({ texto, motivo: `${Math.round(simBase * 100)}% igual à frase original — o gate cancelaria este envio.` });
      continue;
    }
    const irmaParecida = aprovadasNorm.some((outra) => coldTextSimilarity(norm, outra) >= threshold);
    if (irmaParecida) {
      recusadas.push({ texto, motivo: 'Parecida demais com outra variação do lote.' });
      continue;
    }
    aprovadas.push(texto);
    aprovadasNorm.push(norm);
  }

  return { aprovadas, recusadas };
}
