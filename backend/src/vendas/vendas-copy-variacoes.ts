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

// ── RÉGUA DE MENSAGEM HUMANA (treino do dono, 31/07/2026) ────────────────────
// Ordem literal: "o disparo não pode ser grande, e tem q ser igual humano. Contato
// simples, 'consigo te ajudar' e tals (...) não dê textão, é 1~2 linhas no máximo".
//
// Antes deste bloco a IA não tinha NENHUM limite de tamanho nem de voz: o prompt só
// pedia "varie estrutura, saudação e ritmo" e o validador só tinha piso (20 chars).
// Um textão de 600 caracteres com cara de folheto passava inteiro e ia pro disparo.
//
// 2 linhas de WhatsApp ≈ 200 caracteres. O teto é HARD, mas nunca menor que a própria
// frase-base: se a pessoa escreveu 300 caracteres, recusar as variações por terem o
// mesmo tamanho seria o botão brigando com quem clicou.
export const VARIACAO_MAX_CHARS = 200;

// Marcas de folheto — o oposto de "gente falando". Lista curta e específica de
// propósito: régua que reprova palavra comum ("solução") vira botão que nunca
// funciona, e aí ninguém usa a IA.
const MARCAS_DE_FOLHETO = [
  'prezado',
  'prezada',
  'venho por meio',
  'somos referencia',
  'somos lider',
  'solucoes integradas',
  'otimizar processos',
  'parceria de sucesso',
  'oportunidade unica',
  'promocao imperdivel',
  'nao perca',
];

const LINK_RE = /(https?:\/\/|www\.|wa\.me\/|bit\.ly|encurta)/i;
// Prova social inventada: a IA não sabe quantos clientes a empresa tem, então
// qualquer número aqui é mentira que o lead pode cobrar na cara do vendedor.
const PROVA_SOCIAL_RE = /\bmais de\s+\d+\s+(clientes|empresas|distribuidoras|lojas)/i;

function semAcento(texto: string): string {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

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
        'Você escreve mensagens de PRIMEIRO CONTATO no WhatsApp, em português do Brasil. ' +
        'Elas têm que parecer GENTE mandando mensagem, não empresa mandando folheto. ' +
        'REGRAS DURAS: ' +
        `no máximo 2 linhas (até ${VARIACAO_MAX_CHARS} caracteres); ` +
        'UMA ideia só por mensagem; ' +
        'termine numa pergunta fácil de responder (que se responde com "sim", "sou eu" ou um número); ' +
        'fale da ROTINA de quem vai ler, não do seu produto; ' +
        'pode escrever em tom informal, como se fosse no celular. ' +
        'É PROIBIDO: link, preço, prazo, promessa, mais de um emoji, ' +
        'palavra de folheto ("prezado", "somos referência", "soluções integradas", "otimizar processos"), ' +
        'inventar cliente, número de clientes ou qualquer prova social, ' +
        'e inventar produto ou benefício que não esteja na frase original. ' +
        'Varie o GANCHO entre as mensagens (pergunta sobre a rotina, pedido de permissão, ' +
        'procurar o responsável, oferta direta) — não troque só as palavras da mesma frase. ' +
        regraPlaceholders +
        ' Responda SOMENTE um JSON array de strings, sem comentários.',
    },
    {
      role: 'user',
      content:
        `Frase original:\n${String(base || '').trim()}\n\n` +
        `Gere ${n} variações curtas, com ganchos diferentes entre si. Nenhuma pode passar de ${VARIACAO_MAX_CHARS} caracteres.`,
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
  // Teto de tamanho: nunca menor que a frase que a própria pessoa escreveu.
  const tetoChars = Math.max(VARIACAO_MAX_CHARS, String(base || '').trim().length);
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
    // ── RÉGUA HUMANA (31/07) — antes disto, textão de folheto passava inteiro ──
    if (texto.length > tetoChars) {
      recusadas.push({
        texto,
        motivo: `Textão (${texto.length} caracteres). Primeiro contato é 1 a 2 linhas — até ${tetoChars}.`,
      });
      continue;
    }
    if (LINK_RE.test(texto)) {
      recusadas.push({ texto, motivo: 'Tem link. Link no primeiro contato é cara de spam e queima o número.' });
      continue;
    }
    if (PROVA_SOCIAL_RE.test(texto)) {
      recusadas.push({ texto, motivo: 'Inventou prova social ("mais de N clientes"). A IA não sabe esse número.' });
      continue;
    }
    const semAcentoTexto = semAcento(texto);
    const folheto = MARCAS_DE_FOLHETO.find((marca) => semAcentoTexto.includes(marca));
    if (folheto) {
      recusadas.push({ texto, motivo: `Voz de folheto ("${folheto}"). Escreva como gente escreve no celular.` });
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
