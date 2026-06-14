// Preferência de segmento/região do vendedor (14/06).
// Fonte única de leitura/escrita do campo User.preferredSegmentsJson.
//
// Formato canônico (escrita): JSON object
//   { "segments": string[], "cityRegion": string | null }
// — o mesmo shape que o admin já grava no cadastro/indicação
//   (users.controller.buildPreferredSegmentsJson).
//
// O leitor TOLERA o formato bare-array legado (`["dentista","oficina"]`) para
// não perder dado escrito antes desta consolidação.

export type PreferredSegments = {
  segments: string[];
  cityRegion: string | null;
};

const MAX_SEGMENTS = 12;
const MAX_SEGMENT_LEN = 80;
const MAX_CITY_REGION_LEN = 120;

function cleanSegmentList(value: unknown): string[] {
  const list = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  return Array.from(
    new Set(
      list
        .map((item) => String(item ?? '').trim().replace(/\s+/g, ' '))
        .filter(Boolean)
        .map((item) => item.slice(0, MAX_SEGMENT_LEN)),
    ),
  ).slice(0, MAX_SEGMENTS);
}

function cleanCityRegion(value: unknown): string | null {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_CITY_REGION_LEN);
  return text || null;
}

// Leitura tolerante: aceita object {segments,cityRegion} OU bare-array legado.
export function parsePreferredSegments(json: unknown): PreferredSegments {
  let parsed: unknown = json;
  if (typeof json === 'string') {
    try {
      parsed = JSON.parse(json || '[]');
    } catch {
      return { segments: [], cityRegion: null };
    }
  }
  if (Array.isArray(parsed)) {
    return { segments: cleanSegmentList(parsed), cityRegion: null };
  }
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    return {
      segments: cleanSegmentList(obj.segments),
      cityRegion: cleanCityRegion(obj.cityRegion),
    };
  }
  return { segments: [], cityRegion: null };
}

// Escrita canônica. Retorna null quando não há nada para guardar (limpa o campo).
export function buildPreferredSegmentsJsonValue(
  segments: unknown,
  cityRegion?: unknown,
): string | null {
  const cleanSegments = cleanSegmentList(segments);
  const cleanCity = cleanCityRegion(cityRegion);
  if (!cleanSegments.length && !cleanCity) return null;
  return JSON.stringify({ segments: cleanSegments, cityRegion: cleanCity });
}
