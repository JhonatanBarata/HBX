// Match de SEGMENTO pedido × texto do candidato (28/07 — conserto do "distribuidora de agua
// trouxe igreja/academia/partido"). A lei, num lugar só (WHERE do dataset, porta da Receita,
// gate da lane web e keyword da Base Receita consomem daqui — nunca reimplementar o match
// espalhado):
//
// 1. O segmento pode ser uma LISTA ("bicicletarias, calçados") — cada item é um pedido
//    próprio: basta UM item casar (OR entre frases), mas o item que casar tem de casar
//    INTEIRO (AND entre as palavras da frase). O OR plano antigo por token fazia
//    "distribuidora de agua" aceitar qualquer "distribuidora" — de pescado, hospitalar — e
//    qualquer "agua" — inclusive "criacao de peixes em agua doce" da descrição de CNAE.
// 2. Palavra INTEIRA (\b), não substring — "agua" não pode casar "AGUAI" nem "aguape".
// 3. O nome da CIDADE pedida não conta como texto de segmento — em "Águas de Lindóia" toda
//    empresa local carrega "AGUAS DE LINDOIA" no nome (igreja, hotel, partido) e virava
//    "distribuidora de água". A frase da cidade é removida do texto antes do match.
//
// Singular/plural continuam equivalentes (agua↔aguas). Código CNAE explícito no segmento
// (ex. "4635") NÃO passa por aqui — quem chama resolve por `cnae startsWith` antes.
export function normalizeSegmentText(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Itens da lista de segmentos: vírgula/;/|// separam PEDIDOS independentes.
export function segmentPhrases(segment: unknown): string[] {
  return String(segment || '')
    .split(/[,;|/]+/)
    .map((phrase) => phrase.trim())
    .filter(Boolean);
}

// Grupos de variantes por palavra de UMA frase: cada palavra ≥4 chars vira um grupo
// [palavra, singular, plural] — match da frase = TODOS os grupos casam (AND entre grupos,
// OR dentro). `withRadical` adiciona o radical curto ao grupo (sorveteria→sorvete) pra
// conectar variações naturais de atividade no WHERE da Base Receita — mesmo recorte que o
// keywordVariants antigo do cnpj-base-query usava, agora vivendo aqui.
export function segmentTokenGroups(segment: unknown, options?: { withRadical?: boolean }): string[][] {
  const tokens = normalizeSegmentText(segment).split(/\s+/).filter((token) => token.length >= 4);
  const seenBases = new Set<string>();
  const groups: string[][] = [];
  for (const token of tokens) {
    const base = token.endsWith('s') ? token.slice(0, -1) : token;
    if (seenBases.has(base)) continue;
    seenBases.add(base);
    const group = new Set<string>([token, base, `${base}s`]);
    if (options?.withRadical && token.length >= 7) {
      const radicalLength = Math.max(5, Math.min(8, token.length - 3));
      group.add(token.slice(0, radicalLength));
    }
    groups.push(Array.from(group));
  }
  return groups;
}

// Uma entrada por frase da lista; frases sem palavra útil caem fora.
export function segmentPhraseTokenGroups(segment: unknown, options?: { withRadical?: boolean }): string[][][] {
  return segmentPhrases(segment)
    .map((phrase) => segmentTokenGroups(phrase, options))
    .filter((groups) => groups.length > 0);
}

// Matcher fino (em memória): recebe o texto do candidato (nome + razão + CNAE + descrição, ou
// o searchText já gravado) e aplica a lei acima. Segmento vazio/sem palavra útil = aceita tudo
// (sem segmento pedido não há filtro — comportamento de sempre).
//
// `radicalPrefix`: além das variantes exatas, palavra LONGA (≥7) também casa por prefixo do
// radical ("distribuidora" casa "distribuidores"/"distribuicao"). É pra texto livre de página
// (gate da lane web), onde a flexão varia — NUNCA usar na base RFB, onde o prefixo reabriria
// o furo do saneamento ("distribuicao de agua e esgoto" viraria distribuidora de água).
// Palavra curta ("agua") segue exata sempre — prefixo nela recriaria o furo do "AGUAI".
export function buildSegmentTextMatcher(
  segment: unknown,
  city?: unknown,
  options?: { radicalPrefix?: boolean },
): (haystack: unknown) => boolean {
  const phrases = segmentPhraseTokenGroups(segment);
  if (!phrases.length) return () => true;
  const cityPhrase = normalizeSegmentText(city);
  const cityPattern = cityPhrase ? new RegExp(`\\b${escapeRegex(cityPhrase)}\\b`, 'g') : null;
  const phrasePatterns = phrases.map((groups) => groups.map((group) => {
    const alternatives = group.map(escapeRegex);
    if (options?.radicalPrefix) {
      const longest = group.reduce((best, token) => (token.length > best.length ? token : best), '');
      if (longest.length >= 7) {
        const radicalLength = Math.max(5, Math.min(8, longest.length - 3));
        alternatives.push(`${escapeRegex(longest.slice(0, radicalLength))}[a-z0-9]*`);
      }
    }
    return new RegExp(`\\b(?:${alternatives.join('|')})\\b`);
  }));
  return (haystack: unknown) => {
    let text = normalizeSegmentText(haystack);
    if (!text) return false;
    if (cityPattern) text = text.replace(cityPattern, ' ');
    return phrasePatterns.some((groupPatterns) => groupPatterns.every((pattern) => pattern.test(text)));
  };
}
