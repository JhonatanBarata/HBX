// S2 LEAD-CENTRICO (25/07 — docs/PLANEJAMENTOS/PR25072026-LEAD-CENTRICO/02-radar-limpo.md):
// exclusões vencem similaridade de nome. Quando o cliente pede um segmento explícito
// ("distribuidora"), um candidato cujo nome/CNAE cai numa atividade EXCLUÍDA daquele segmento
// é rejeitado mesmo que o token bata por similaridade textual (ex.: "Distribuidora de Energia
// X" tem a palavra "distribuidora" no nome, mas é do segmento de energia, não o que o cliente
// pediu). Mapa segmento→exclusões, extensível: novo segmento = nova entrada aqui, nunca
// hardcode espalhado pelos filtros. Começa por "distribuidora" (pedido literal do dono).
export type RadarSegmentExclusionRule = {
  // Código curto pro log/rejectReasons/inclusionReasons (`segmento_excluido_<code>`).
  code: string;
  // Rótulo PT-BR curto, só pra log/diagnóstico — não é copy de tela.
  label: string;
  // Termos (CNAE description ou trecho de nome) que marcam a atividade excluída.
  // Comparados em texto normalizado (sem acento, minúsculo) via "includes".
  tokens: string[];
};

export const RADAR_SEGMENT_EXCLUSION_MAP: Record<string, RadarSegmentExclusionRule[]> = {
  distribuidora: [
    {
      code: 'transporte_carga',
      label: 'Transporte de carga',
      tokens: [
        // Frases oficiais de CNAE (fonte cnpj_public, quando há cnaeDescription real).
        'transporte rodoviario de carga',
        'transporte rodoviario de cargas',
        'transporte de carga',
        'transporte de cargas',
        // Termos curtos: pegam sinal só pelo NOME, sem CNAE oficial (lane web).
        'transportadora',
        'transporte',
      ],
    },
    {
      code: 'varejo_puro',
      label: 'Varejo puro',
      tokens: [
        'comercio varejista',
        'varejista',
      ],
    },
    {
      code: 'energia_agua_combustivel',
      label: 'Energia, água ou combustível',
      tokens: [
        // Frases oficiais de CNAE.
        'energia eletrica',
        'distribuicao de energia',
        'geracao de energia',
        'transmissao de energia',
        'agua e esgoto',
        'tratamento e distribuicao de agua',
        'posto de combustivel',
        'gas natural',
        'gas liquefeito',
        // Termos curtos: pegam sinal só pelo NOME (ex.: "Distribuidora de Energia X").
        'energia',
        'saneamento',
        'combustivel',
        'combustiveis',
      ],
    },
    {
      // CORREÇÃO-DA-PORTA (29/07): caso original "EDR Imobiliária virou distribuidora de
      // água" (28/07). Com a porta exigindo evidência POSITIVA, é esta regra que mata o
      // imóvel em busca de distribuidora — não o score baixo.
      code: 'imobiliaria',
      label: 'Imobiliária / corretagem de imóveis',
      tokens: [
        'atividades imobiliarias',
        'corretagem na compra e venda',
        'administracao de imoveis',
        'imobiliaria',
        'imobiliarias',
        'corretor de imoveis',
        'corretora de imoveis',
      ],
    },
    {
      code: 'servicos_financeiros',
      label: 'Serviços financeiros',
      tokens: [
        // Frases oficiais de CNAE.
        'banco multiplo',
        'banco comercial',
        'banco de investimento',
        'instituicao financeira',
        'sociedade de credito',
        'cooperativa de credito',
        'corretora de valores',
        'corretora de seguros',
        // Termos curtos: pegam sinal só pelo NOME.
        'banco',
        'financeira',
        'seguradora',
        'seguros',
      ],
    },
    // "Empresa baixada" fica de fora deste mapa de texto: já é filtro duro incondicional
    // (independente de segmento) em isActiveCompany/situação, na porta da Receita.
  ],
};

function normalizeExclusionKey(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Aceita o segmento pedido inteiro ("distribuidora de bebidas") e também tenta só a
// primeira palavra ("distribuidora") — mesma tolerância a singular/plural que o match de
// CNAE da porta da Receita usa (segmentMatches em cnpj-public-provider.service.ts).
function segmentKeyCandidates(segment: unknown): string[] {
  const key = normalizeExclusionKey(segment);
  if (!key) return [];
  const candidates = new Set<string>();
  const addWithPlural = (base: string) => {
    if (!base) return;
    candidates.add(base);
    candidates.add(base.endsWith('s') ? base.slice(0, -1) : `${base}s`);
  };
  addWithPlural(key);
  addWithPlural(key.split(' ')[0] || '');
  return Array.from(candidates).filter(Boolean);
}

export function resolveSegmentExclusionRules(segment: unknown): RadarSegmentExclusionRule[] {
  for (const candidate of segmentKeyCandidates(segment)) {
    const rules = RADAR_SEGMENT_EXCLUSION_MAP[candidate];
    if (rules && rules.length) return rules;
  }
  return [];
}

// Varre o texto combinado do candidato (nome + razão social + CNAE + descrição do CNAE —
// o que estiver disponível) contra as regras de exclusão do segmento pedido. Devolve a
// PRIMEIRA regra batida (ou null se não há segmento pedido, o segmento não tem mapa de
// exclusão, ou nada bateu).
export function findRadarSegmentExclusionMatch(
  segment: unknown,
  ...texts: unknown[]
): RadarSegmentExclusionRule | null {
  const rules = resolveSegmentExclusionRules(segment);
  if (!rules.length) return null;
  const haystack = normalizeExclusionKey(texts.filter(Boolean).join(' '));
  if (!haystack) return null;
  for (const rule of rules) {
    if (rule.tokens.some((token) => haystack.includes(normalizeExclusionKey(token)))) {
      return rule;
    }
  }
  return null;
}
