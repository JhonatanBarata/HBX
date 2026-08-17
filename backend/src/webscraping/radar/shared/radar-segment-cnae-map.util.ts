// MAPA CURADO SEGMENTO→CNAE (LOTE 1, 17/08 —
// docs/PLANEJAMENTOS/PR17082026-FAXINA-DA-BUSCA-RFB-PRIMEIRO.md).
//
// O FURO (medido ao vivo na VPS em Valinhos/SP): o dono pede "distribuidoras de água" e a
// Receita entregava 4 cards de um universo de 86. A porta inteira raciocinava por TEXTO —
// exigia 'distribuidora' E 'agua' como palavra inteira no nome/descrição — mas o CNAE onde a
// distribuidora de água REALMENTE mora é 4723-7/00 "Comércio varejista de bebidas", cuja
// descrição não tem nenhuma das duas palavras. Pior: a regra de exclusão `varejo_puro` (token
// 'comercio varejista') matava exatamente esse CNAE. Dupla pena — o texto não alcançava e a
// exclusão matava quem o código provava.
//
// A cura é este mapa: o CÓDIGO oficial do CNAE vira EVIDÊNCIA POSITIVA do ramo pedido. Lei
// única, num lugar só (WHERE do dataset, filtro fino em memória, porta do provider, exclusão,
// gate da lane web e contagem da Base Receita consomem daqui) — nunca reimplementar espalhado.
//
// TRÊS DECISÕES QUE MORAM AQUI, e o motivo de cada uma:
//
// 1. CURADO PRO RAMO DO DONO, não pra taxonomia inteira (decisão 4 do dono, 17/08): o foco é
//    DISTRIBUIÇÃO — água, gás e bebidas. Segmento fora do mapa continua resolvendo só por
//    texto, exatamente como antes; o mapa nunca AFROUXA quem ele não conhece.
// 2. A CHAVE CASA POR SUBCONJUNTO DE TOKENS: a chave entra quando TODAS as palavras dela estão
//    no pedido. Assim "distribuidoras de água" e "distribuidora de água mineral" resolvem, e
//    "distribuidora" sozinho NÃO (senão o mapa da água apareceria em busca de distribuidora de
//    autopeças). Os apelidos que o dono digita de verdade ("água mineral", "galão de água",
//    "água e gás", "depósito de água") são CHAVES próprias, não gambiarra no matcher.
// 3. CNAE AMPLO SÓ ENTRA COM SINAL TEXTUAL. 4723-7/00 é o CNAE de toda adega/bar/conveniência
//    da cidade; 4784-9/00 é o do revendedor de botijão. Eles ficam na allowlist da ÁGUA porque
//    é ali que FERREIRAGUA & cia estão cadastradas — mas exigindo a palavra 'agua' no texto do
//    registro. Sem o sinal, o botijão puro segue morrendo na regra `gas_glp` (é a lei que
//    nasceu do noturno de 30/07, "13,8% da entrega de água com cara de gás") e a adega segue
//    fora. O sinal viaja DENTRO do SQL (ver buildRadarSegmentCnaePrismaMatchers) porque o
//    `take` do dataset corta ANTES do filtro em memória.
import {
  buildSegmentAliasMatcher,
  normalizeSegmentText,
  segmentPhraseTokenGroups,
  segmentPhrases,
} from './radar-segment-match.util';

export type RadarSegmentCnaeEntry = {
  // Código do CNAE em DÍGITOS, sem pontuação — é assim que a coluna CnpjPublicCompany.cnae é
  // gravada pelo import do dump da RFB (backend/scripts/import-cnpj-dataset.js). Comparação
  // sempre por PREFIXO, pra aceitar tanto o código de 7 dígitos quanto a classe de 4/5.
  cnae: string;
  // Rótulo PT-BR do CNAE — log/diagnóstico e leitura humana do mapa. Não é copy de tela.
  label: string;
  // Sinal textual EXIGIDO quando o CNAE é amplo demais pra provar o ramo sozinho. Sem ele o
  // código entra como prova direta ("o código já É o pedido").
  textSignals?: string[];
};

// Entradas da ÁGUA reusadas pelos apelidos — o dono digita de várias formas e todas têm de
// chegar no mesmo lugar; duplicar a lista aqui seria a semente de duas verdades.
const CNAES_DISTRIBUIDORA_DE_AGUA: RadarSegmentCnaeEntry[] = [
  { cnae: '4635401', label: 'Comercio atacadista de agua mineral' },
  { cnae: '3600602', label: 'Distribuicao de agua por caminhoes' },
  // 4723-7/00 é o endereço real da distribuidora de água na Receita (foi ele que a regra
  // varejo_puro matava) — amplo, entra só com o sinal 'agua'.
  { cnae: '4723700', label: 'Comercio varejista de bebidas', textSignals: ['agua'] },
  // 4784-9/00 (GLP): FERREIRAGUA vende gás E água e está cadastrada aqui. Fica na allowlist da
  // água COM sinal exigido — revendedor de botijão que não fala em água continua fora.
  { cnae: '4784900', label: 'Comercio varejista de GLP', textSignals: ['agua'] },
];

export const RADAR_SEGMENT_CNAE_MAP: Record<string, RadarSegmentCnaeEntry[]> = {
  'distribuidora de agua': CNAES_DISTRIBUIDORA_DE_AGUA,
  // Apelidos do MESMO pedido (é assim que o dono digita) — mesmos CNAEs, decisão 17/08.
  'agua mineral': CNAES_DISTRIBUIDORA_DE_AGUA,
  'galao de agua': CNAES_DISTRIBUIDORA_DE_AGUA,
  'agua e gas': CNAES_DISTRIBUIDORA_DE_AGUA,
  'deposito de agua': CNAES_DISTRIBUIDORA_DE_AGUA,
  'distribuidora de gas': [
    { cnae: '4784900', label: 'Comercio varejista de GLP' },
    { cnae: '4682600', label: 'Comercio atacadista de GLP' },
  ],
  'distribuidora de bebidas': [
    { cnae: '4635402', label: 'Comercio atacadista de cerveja, chope e refrigerante' },
    { cnae: '4635499', label: 'Comercio atacadista de bebidas nao especificadas' },
    { cnae: '4723700', label: 'Comercio varejista de bebidas' },
  ],
};

// Palavras de ligação: não identificam ramo nenhum e só atrapalhariam o casamento por
// subconjunto ("distribuidora de agua" × "distribuidora da agua" têm de ser a MESMA coisa).
const STOPWORDS_DE_SEGMENTO = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o', 'as', 'os', 'para', 'pra', 'com',
]);

// Singular/plural do PT-BR no recorte que este mapa precisa. Cuidado deliberado com token
// curto: 'gas' termina em 's' e virar 'ga' seria ruído — abaixo de 5 letras nada é cortado.
function singularizarToken(token: string): string {
  if (token.length >= 6 && token.endsWith('oes')) return `${token.slice(0, -3)}ao`; // galoes→galao
  if (token.length >= 6 && token.endsWith('ais')) return `${token.slice(0, -3)}al`; // minerais→mineral
  if (token.length >= 5 && token.endsWith('s')) return token.slice(0, -1); // aguas→agua
  return token;
}

/** Frase pedida (ou chave do mapa) reduzida ao conjunto de palavras que identificam o ramo. */
function tokensCanonicos(phrase: unknown): string[] {
  return normalizeSegmentText(phrase)
    .split(/\s+/)
    .filter((token) => token && !STOPWORDS_DE_SEGMENTO.has(token))
    .map(singularizarToken)
    .filter(Boolean);
}

/**
 * Entradas do mapa para o segmento pedido. A chave entra quando TODAS as palavras dela estão na
 * frase pedida (subconjunto) — "distribuidora" sozinho não alcança o mapa da água.
 *
 * Segmento pode ser LISTA ("distribuidora de agua, distribuidora de gas"): cada item é um pedido
 * próprio (mesma lei do radar-segment-match.util) e o resultado é a UNIÃO deduplicada por CNAE.
 * Na união, entrada SEM sinal exigido VENCE a mesma entrada COM sinal: quem pediu "água e gás"
 * não pode receber menos GLP do que quem pediu só "gás".
 */
export function resolveRadarSegmentCnaeEntries(segment: unknown): RadarSegmentCnaeEntry[] {
  const phrases = segmentPhrases(segment);
  if (!phrases.length) return [];
  const chaves = Object.entries(RADAR_SEGMENT_CNAE_MAP)
    .map(([chave, entries]) => ({ tokens: tokensCanonicos(chave), entries }))
    .filter((item) => item.tokens.length > 0);
  const porCnae = new Map<string, RadarSegmentCnaeEntry>();
  for (const phrase of phrases) {
    const pedido = new Set(tokensCanonicos(phrase));
    if (!pedido.size) continue;
    for (const chave of chaves) {
      if (!chave.tokens.every((token) => pedido.has(token))) continue;
      for (const entry of chave.entries) {
        const anterior = porCnae.get(entry.cnae);
        if (!anterior) {
          porCnae.set(entry.cnae, entry);
          continue;
        }
        if (!anterior.textSignals?.length) continue; // já está na forma mais permissiva
        if (!entry.textSignals?.length) {
          porCnae.set(entry.cnae, entry);
          continue;
        }
        porCnae.set(entry.cnae, {
          ...anterior,
          textSignals: Array.from(new Set([...anterior.textSignals, ...entry.textSignals])),
        });
      }
    }
  }
  return Array.from(porCnae.values());
}

/**
 * Matchers Prisma pro WHERE do dataset (OR adicional ao match textual).
 *
 * O AND do sinal textual vai DENTRO do SQL de propósito: o `take` do fetchRecords corta o
 * SELECT ANTES do filtro fino em memória, então 4723700 solto traria todo bar/adega da cidade
 * e expulsaria as distribuidoras reais das 200-2000 vagas.
 */
export function buildRadarSegmentCnaePrismaMatchers(segment: unknown): Array<Record<string, any>> {
  return resolveRadarSegmentCnaeEntries(segment).map((entry) => {
    const sinais = (entry.textSignals || [])
      .map((sinal) => normalizeSegmentText(sinal))
      .filter(Boolean);
    if (!sinais.length) return { cnae: { startsWith: entry.cnae } };
    return {
      AND: [
        { cnae: { startsWith: entry.cnae } },
        { OR: sinais.map((sinal) => ({ searchText: { contains: sinal } })) },
      ],
    };
  });
}

// Compilar regex por candidato custa caro na porta da Receita (lote de até 2.000 linhas) — o
// matcher é o mesmo pro lote inteiro. Mesmo padrão do singleWordMatcherCache da exclusão. O
// teto existe porque a chave carrega texto digitado pelo usuário: cache não pode virar vazamento.
const matcherCache = new Map<string, (input: { cnae: unknown; haystack: unknown }) => boolean>();
const MATCHER_CACHE_MAX = 200;

/**
 * Matcher em memória: o registro tem CNAE da allowlist do pedido (e o sinal textual, quando a
 * entrada exige)?
 *
 * ARMADILHA (documentada em radar-segment-match.util.ts:114-117): o sinal textual usa
 * `buildSegmentAliasMatcher`, NUNCA `buildSegmentTextMatcher`. O segundo aceita TUDO quando a
 * frase não tem palavra útil (≥4 chars) — contrato certo pro pedido do cliente ("sem segmento
 * não há filtro"), catastrófico aqui: um sinal curto como 'gas' viraria curinga e a allowlist
 * inteira passaria a aceitar qualquer registro daquele CNAE. O alias matcher é fail-closed.
 */
export function buildRadarSegmentCnaeMatcher(
  segment: unknown,
  city?: unknown,
): (input: { cnae: unknown; haystack: unknown }) => boolean {
  // Chave com o texto CRU: normalizar aqui apagaria a vírgula que separa pedidos independentes
  // ("distribuidora de agua, distribuidora de gas" resolve diferente de tudo junto).
  const cacheKey = `${String(segment ?? '')}|${String(city ?? '')}`;
  const cached = matcherCache.get(cacheKey);
  if (cached) return cached;

  const entries = resolveRadarSegmentCnaeEntries(segment);
  const compiladas = entries.map((entry) => ({
    cnae: entry.cnae,
    // Sem sinal exigido = o código já É o pedido, texto não decide nada.
    sinal: entry.textSignals?.length ? buildSegmentAliasMatcher(entry.textSignals, city) : null,
  }));
  const matcher = !compiladas.length
    ? () => false
    : (input: { cnae: unknown; haystack: unknown }) => {
      const digitos = String(input?.cnae ?? '').replace(/\D/g, '');
      if (!digitos) return false;
      for (const item of compiladas) {
        if (!digitos.startsWith(item.cnae)) continue;
        if (!item.sinal) return true;
        if (item.sinal(input?.haystack)) return true;
      }
      return false;
    };

  if (matcherCache.size >= MATCHER_CACHE_MAX) matcherCache.clear();
  matcherCache.set(cacheKey, matcher);
  return matcher;
}

/**
 * Atalho pra quem tem o candidato inteiro na mão (exclusão, gate da lane web): o CNAE oficial
 * deste registro é evidência positiva do ramo pedido?
 *
 * `cnae` é o CAMPO ESTRUTURADO, nunca o blob de texto — nome que diz "água" não prova ramo
 * nenhum e não pode desarmar exclusão. `texts` serve só pro sinal das entradas amplas.
 */
export function matchesRadarSegmentCnaeAllowlist(input: {
  segment: unknown;
  cnae?: unknown;
  city?: unknown;
  texts?: unknown[];
}): boolean {
  const digitos = String(input?.cnae ?? '').replace(/\D/g, '');
  if (!digitos) return false;
  const matcher = buildRadarSegmentCnaeMatcher(input.segment, input.city);
  return matcher({
    cnae: digitos,
    haystack: (input.texts || []).filter(Boolean).join(' '),
  });
}

/**
 * Sinais textuais das entradas resolvidas, no formato de `keyword` do CnpjBaseQueryInput — é
 * como a CONTAGEM da Base Receita ("a Receita tem N nessa cidade") consegue falar a mesma
 * língua da porta: CNAE do mapa E o sinal, em vez de exigir a frase inteira do segmento.
 *
 * Devolve '' quando nenhum sinal tem palavra útil (≥4 chars): keyword sem token faz o buildWhere
 * do cnpj-base-query cair no par ILIKE razaoSocial/nomeFantasia — o seq scan de 39M linhas que
 * devolveu 504 na cara do vendedor em 05/08. Contagem é enfeite; derrubar a tela não é.
 */
export function resolveRadarSegmentCnaeSignalKeyword(segment: unknown): string {
  const sinais = Array.from(new Set(
    resolveRadarSegmentCnaeEntries(segment)
      .flatMap((entry) => entry.textSignals || [])
      .map((sinal) => String(sinal || '').trim())
      .filter(Boolean),
  ));
  if (!sinais.length) return '';
  const keyword = sinais.join(', ');
  return segmentPhraseTokenGroups(keyword).length ? keyword : '';
}
