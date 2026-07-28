// Match de SEGMENTO pedido × texto do candidato (28/07 — conserto do "distribuidora de agua
// trouxe igreja/academia/partido"). A lei, num lugar só (WHERE do dataset, porta da Receita e
// keyword da Base Receita consomem daqui — nunca reimplementar o match espalhado):
//
// 1. TODAS as palavras do segmento precisam casar (AND), não qualquer uma (o OR antigo fazia
//    "distribuidora de agua" aceitar qualquer "distribuidora" — de pescado, hospitalar — e
//    qualquer "agua" — inclusive "criacao de peixes em agua doce" da descrição de CNAE).
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

// Grupos de variantes por palavra do segmento: cada palavra ≥4 chars vira um grupo
// [palavra, singular, plural] — match = TODOS os grupos casam (AND entre grupos, OR dentro).
// `withRadical` adiciona o radical curto ao grupo (sorveteria→sorvet, transportadora→transport)
// pra conectar variações naturais de atividade no WHERE da Base Receita — mesmo recorte que o
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

// Matcher fino (em memória): recebe o texto do candidato (nome + razão + CNAE + descrição, ou
// o searchText já gravado) e aplica a lei acima. Segmento vazio/sem palavra útil = aceita tudo
// (sem segmento pedido não há filtro — comportamento de sempre).
export function buildSegmentTextMatcher(segment: unknown, city?: unknown): (haystack: unknown) => boolean {
  const groups = segmentTokenGroups(segment);
  if (!groups.length) return () => true;
  const cityPhrase = normalizeSegmentText(city);
  const cityPattern = cityPhrase ? new RegExp(`\\b${escapeRegex(cityPhrase)}\\b`, 'g') : null;
  const groupPatterns = groups.map(
    (group) => new RegExp(`\\b(?:${group.map(escapeRegex).join('|')})\\b`),
  );
  return (haystack: unknown) => {
    let text = normalizeSegmentText(haystack);
    if (!text) return false;
    if (cityPattern) text = text.replace(cityPattern, ' ');
    return groupPatterns.every((pattern) => pattern.test(text));
  };
}
