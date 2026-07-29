// Taxonomia de SEGMENTOS do Radar (dono 14/06): espelha HBX_CATEGORY_SEGMENTS do
// backend (radar/shared/radar-core-shared.ts) + preenche o que faltava lá (Saúde,
// Comércio) porque a lagoa tem esses segmentos (ex.: dentista) e sem eles o filtro
// não deixaria escolher. Mesmo padrão do brazil-cities.ts (dado de referência no
// front). Usado como datalist (autocomplete) nos painéis de preferência e de puxar
// — selecionável MAS aceita digitar livre (pra não travar segmento fora da lista).

export type SegmentCategory = { label: string; segments: string[] };

export const RADAR_SEGMENT_CATEGORIES: SegmentCategory[] = [
  { label: "Saúde", segments: [
    "dentistas", "clínicas odontológicas", "clínicas", "consultórios médicos", "laboratórios",
    "fisioterapia", "psicologia", "nutricionistas", "farmácias", "óticas", "pet shops", "clínicas veterinárias",
  ] },
  { label: "Beleza & Estética", segments: [
    "salões de beleza", "barbearias", "clínicas de estética", "manicure", "cosméticos", "perfumarias",
  ] },
  { label: "Alimentação", segments: [
    "restaurantes", "pizzarias", "lanchonetes", "bares", "cafeterias", "panificadoras",
    "confeitarias", "docerias", "alimentos naturais", "mercados", "supermercados", "açougues",
  ] },
  { label: "Automotivo", segments: [
    "oficinas mecânicas", "auto center", "auto peças", "auto elétricas", "pneus", "borracharias",
    "concessionárias", "lava rápidos", "postos de combustível", "auto escolas", "revendas de veículos",
  ] },
  { label: "Comércio & Serviços", segments: [
    "lojas de roupas", "calçados", "móveis", "materiais de construção", "papelarias", "floriculturas",
    "academias", "imobiliárias", "contabilidade", "advocacia", "escolas de idiomas",
  ] },
  { label: "Indústria", segments: [
    "metalúrgicas", "usinagem", "ferramentaria", "embalagens", "máquinas industriais",
    "indústrias de plásticos", "químicas", "caldeiraria", "cerâmicas",
  ] },
  { label: "Atacado & Logística", segments: [
    "atacadistas", "distribuidoras", "transportadoras", "depósitos de bebidas", "fornecedoras industriais",
  ] },
  { label: "Agro & Campo", segments: [
    "agropecuárias", "casas de ração", "agronegócios", "implementos agrícolas", "nutrição animal", "produtos agrícolas",
  ] },
];

// Lista achatada e deduplicada (pro datalist), preservando a ordem por categoria.
// Categoria de um segmento (pra mostrar como dica no datalist).
export function categoryOfSegment(segment: string): string | null {
  const v = String(segment || "").trim().toLowerCase();
  for (const c of RADAR_SEGMENT_CATEGORIES) {
    if (c.segments.some((s) => s.toLowerCase() === v)) return c.label;
  }
  return null;
}
