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

// ── A 1ª MENSAGEM DESPERTA INTERESSE (06/08/2026) ───────────────────────────
// O dono reprovou 6 textos que passaram inteiros nesta régua: *"vc está muito
// 'pra frente' nessas mensagens, esses pitch são segunda mensagem já, a primeira
// vc tem q despertar interesse"*. E corrigiu o próprio modelo minutos depois:
// **"remova o grátis"**, trocando o barato do "sim" de PREÇO por TEMPO
// ("é bem rápido").
//
// A régua que já morava aqui — "fale da ROTINA de quem vai ler" — não estava
// errada: estava na MENSAGEM ERRADA. Ela é da 2ª (depois do "sim"), e o prompt
// a ensinava na 1ª. Resultado: a IA gerava, com nota máxima, exatamente o que
// ele acabou de reprovar.
//
// Preço no 1º contato é PROIBIDO em qualquer forma — inclusive "grátis". Isto
// reprova até eco das copies antigas ("pra testar sem pagar nada", "o teste não
// custa nada"), e é de propósito: aquelas frases são anteriores à ordem dele.
const PRECO_RE =
  /(gr[áa]tis|gratuit[ao]s?|de gra[çc]a|sem custo|sem pagar( nada)?|n[ãa]o (custa|paga|pagam) nada|cortesia|por minha conta|desconto|promo[çc][ãa]o|R\$\s*\d|\bpre[çc]o\b)/i;

const LINK_RE = /(https?:\/\/|www\.|wa\.me\/|bit\.ly|encurta)/i;
// Prova social inventada: a IA não sabe quantos clientes a empresa tem, então
// qualquer número aqui é mentira que o lead pode cobrar na cara do vendedor.
const PROVA_SOCIAL_RE = /\bmais de\s+\d+\s+(clientes|empresas|distribuidoras|lojas)/i;

// O CONVITE — o que separa mecanicamente a 1ª mensagem da 2ª.
//
// Os 6 textos que o dono reprovou não tinham NENHUM defeito de forma: tamanho ok,
// ganchos diferentes, sem link, sem preço. O defeito era de FASE — todos abriam
// interrogando a operação de um desconhecido ("vai pro caderno ou já cai na rota?",
// "o entregador sai com a lista no papel?"). Isso é 2ª mensagem.
//
// A diferença que dá pra medir: a pergunta da 1ª é sobre o INTERESSE de quem lê
// ("Teria interesse de conhecer?"); a pergunta da 2ª é sobre a OPERAÇÃO de quem lê.
// Então a régua é positiva — tem que HAVER convite — em vez de uma lista infinita de
// vocabulário de operação, que muda a cada segmento (galão, rota, entregador...) e
// nunca ficaria completa.
const CONVITE_RE =
  /(interesse|conhecer|apresentar|explicar|mostrar|demonstra|\bdemo\b|fazer um teste|\bteste\b|testar|experimentar|dar uma olhada|uma olhadinha|ideia (curta|rapida|breve)|mandar uma ideia)/;

function semAcento(texto: string): string {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** A mensagem CONVIDA a conhecer (marca da 1ª), ou só interroga a operação (marca da 2ª)? */
export function temConviteDePrimeiroContato(texto: string): boolean {
  return CONVITE_RE.test(semAcento(texto));
}

export interface ReguaPrimeiroContatoOpts {
  /**
   * Teto de caracteres. Na geração de variações vale o teto da frase-base (a régua
   * não briga com quem escreveu); na copy de FÁBRICA vale o teto duro.
   */
  tetoChars?: number;
  /**
   * Exigir o convite. LIGADO na copy de fábrica (é o que o sistema entrega quando
   * ninguém escreveu nada — ali só a régua do dono manda) e na variação de uma
   * frase-base QUE JÁ CONVIDA: a IA pode variar o fraseado, não pode PERDER o
   * convite e virar interrogatório. DESLIGADO quando a própria pessoa escreveu uma
   * base sem convite — senão o botão "Gerar variações" morre pra quem escolheu
   * outro estilo, e régua que mata o que serve é régua quebrada.
   */
  exigirConvite?: boolean;
}

/**
 * RÉGUA DE CONTEÚDO DO 1º CONTATO — uma função só, usada pela IA de variações E pelo
 * fiscal das copies de fábrica. Duas réguas pra mesma pergunta é como nasce "passou
 * no preparo e morreu no envio" (mesma decisão do vendas-copy-reserva).
 *
 * Devolve o MOTIVO legível da recusa, ou `null` se o texto serve.
 */
export function reprovarPrimeiroContato(texto: string, opts: ReguaPrimeiroContatoOpts = {}): string | null {
  const limpo = String(texto || '').trim();
  const teto = Math.max(1, opts.tetoChars || VARIACAO_MAX_CHARS);
  if (limpo.length > teto) {
    return `Textão (${limpo.length} caracteres). Primeiro contato é 1 a 2 linhas — até ${teto}.`;
  }
  if (LINK_RE.test(limpo)) {
    return 'Tem link. Link no primeiro contato é cara de spam e queima o número.';
  }
  if (PRECO_RE.test(limpo)) {
    return 'Fala de preço (ou de "grátis") no primeiro contato. O barato do "sim" é o TEMPO — "é bem rápido".';
  }
  if (PROVA_SOCIAL_RE.test(limpo)) {
    return 'Inventou prova social ("mais de N clientes"). A IA não sabe esse número.';
  }
  const semAcentoTexto = semAcento(limpo);
  const folheto = MARCAS_DE_FOLHETO.find((marca) => semAcentoTexto.includes(marca));
  if (folheto) {
    return `Voz de folheto ("${folheto}"). Escreva como gente escreve no celular.`;
  }
  if (opts.exigirConvite && !temConviteDePrimeiroContato(limpo)) {
    return 'Não convida a conhecer nada — só pergunta da operação de um desconhecido. Isso é a SEGUNDA mensagem; a primeira desperta interesse.';
  }
  return null;
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
        // ── A MISSÃO (06/08) — o que estava faltando e produzia a mensagem errada ──
        'A PRIMEIRA MENSAGEM TEM UM TRABALHO SÓ: DESPERTAR INTERESSE. ' +
        'Não é vender, não é diagnosticar, não é qualificar. ' +
        'O MOLDE (siga a forma, invente as palavras): ' +
        '<cumprimento> + <em 1ª pessoa, o que você está fazendo> + ' +
        '<convite pra conhecer/ver o que é> + <pergunta de sim ou não> + <deixar claro que é rápido>. ' +
        'Quem barateia o "sim" é o TEMPO ("é bem rápido", "leva 1 minuto"), NUNCA o preço. ' +
        'REGRAS DURAS: ' +
        `no máximo 2 linhas (até ${VARIACAO_MAX_CHARS} caracteres); ` +
        'UMA ideia só por mensagem; ' +
        'termine numa pergunta fácil de responder com "sim" ou "não"; ' +
        'toda mensagem precisa CONVIDAR a conhecer alguma coisa; ' +
        'pode escrever em tom informal, como se fosse no celular. ' +
        'É PROIBIDO: link, preço, prazo, promessa, mais de um emoji, ' +
        'a palavra "grátis" e qualquer sinônimo dela ("de graça", "sem custo", "não custa nada", "cortesia"), ' +
        'palavra de folheto ("prezado", "somos referência", "soluções integradas", "otimizar processos"), ' +
        'inventar cliente, número de clientes ou qualquer prova social, ' +
        'e inventar produto ou benefício que não esteja na frase original. ' +
        // O erro que o dono reprovou com nome e sobrenome.
        'PROIBIDO TAMBÉM, e este é o erro mais comum: PERGUNTAR COMO FUNCIONA A OPERAÇÃO de quem vai ler — ' +
        'como anotam os pedidos, se usam caderno ou sistema, como montam a rota, quem responde o WhatsApp, ' +
        'o que acontece no fim do dia. Isso é a SEGUNDA mensagem, e só depois que a pessoa disser "sim". ' +
        'Na primeira você ainda não tem licença pra perguntar nada disso. ' +
        'Varie o GANCHO entre as mensagens (o cumprimento, a ordem das partes, o jeito de convidar, ' +
        'o jeito de fazer a pergunta) — não troque só uma palavra da mesma frase. ' +
        'Mas a MISSÃO das mensagens é a mesma em todas: convidar. ' +
        regraPlaceholders +
        ' Responda SOMENTE um JSON array de strings, sem comentários.',
    },
    {
      role: 'user',
      content:
        `Frase original:\n${String(base || '').trim()}\n\n` +
        `Gere ${n} variações curtas, todas convidando a conhecer, com ganchos diferentes entre si. ` +
        `Nenhuma pode passar de ${VARIACAO_MAX_CHARS} caracteres. ` +
        'Nenhuma pode perguntar como é a operação da pessoa.',
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
  // O convite só é cobrado se a frase-base convida (ver ReguaPrimeiroContatoOpts).
  const exigirConvite = temConviteDePrimeiroContato(base);
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
    // ── RÉGUA DE CONTEÚDO (31/07 humana + 06/08 fase da mensagem) ──────────────
    // Mesma função que o fiscal das copies de fábrica usa.
    const reprovado = reprovarPrimeiroContato(texto, { tetoChars, exigirConvite });
    if (reprovado) {
      recusadas.push({ texto, motivo: reprovado });
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
