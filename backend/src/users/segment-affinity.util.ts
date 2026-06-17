// Afinidade de segmento observada do vendedor (17/06).
// Fonte única de leitura/escrita de User.segmentAffinityJson.
//
// Formato: { "<segmentoNormalizado>": <contagemDeAções> }
// Só vira preferência/boost quando a contagem ≥ threshold (padrão 3).

export type SegmentAffinity = Record<string, number>;

export function parseAffinity(json: unknown): SegmentAffinity {
  if (!json) return {};
  try {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: SegmentAffinity = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const count = Math.max(0, Math.trunc(Number(v ?? 0)) || 0);
      if (k && count > 0) result[k] = count;
    }
    return result;
  } catch {
    return {};
  }
}

export function incrementAffinity(json: unknown, segment: string): string {
  if (!segment) return typeof json === 'string' ? json : '{}';
  const affinity = parseAffinity(json);
  affinity[segment] = (affinity[segment] ?? 0) + 1;
  return JSON.stringify(affinity);
}

export function confirmedSegments(json: unknown, threshold = 3): string[] {
  return Object.entries(parseAffinity(json))
    .filter(([, count]) => count >= threshold)
    .map(([seg]) => seg);
}

export function topSegment(json: unknown): string | null {
  let best: string | null = null;
  let max = 0;
  for (const [seg, count] of Object.entries(parseAffinity(json))) {
    if (count > max) { max = count; best = seg; }
  }
  return best;
}
