import { matchesRadarSegmentCnaeAllowlist } from './radar-segment-cnae-map.util';

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
  // De QUAIS pedidos esta regra se afasta (30/07 — "a mina do gás"). Antes isso era
  // ADIVINHADO: a regra saía do jogo quando o segmento pedido continha um token dela.
  // Adivinhar não fecha: quem pede "distribuidora de gás" morria na regra de
  // energia/água/combustível (o token é a frase 'gas liquefeito', que o pedido não
  // contém), e comparar palavra a palavra consertaria o gás e sujaria a água — o token
  // 'agua e esgoto' faria a MESMA regra se afastar de "distribuidora de água" e soltar
  // saneamento na busca do dono. Com a lista explícita não há troca: energia/água/
  // combustível se afasta de energia, gás e combustível — e NUNCA de água, porque ali
  // saneamento é mesmo outro ramo. Palavra inteira, com tolerância de plural.
  notFor?: string[];
};

export const RADAR_SEGMENT_EXCLUSION_MAP: Record<string, RadarSegmentExclusionRule[]> = {
  distribuidora: [
    {
      code: 'transporte_carga',
      label: 'Transporte de carga',
      notFor: ['transporte', 'transportadora', 'carga', 'logistica', 'frete'],
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
      notFor: ['varejo', 'varejista'],
      tokens: [
        'comercio varejista',
        'varejista',
      ],
    },
    {
      code: 'energia_agua_combustivel',
      label: 'Energia, água ou combustível',
      // 'agua' está FORA de propósito: quem pede "distribuidora de água" quer o
      // distribuidor de galão/mineral, não a companhia de saneamento — é esta regra
      // que segura SANASA & cia fora da lista. Decisão do dono, 30/07.
      notFor: ['energia', 'eletrica', 'gas', 'glp', 'combustivel', 'combustiveis', 'saneamento', 'esgoto'],
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
        // 'esgoto' solto (casa palavra inteira): o CNAE de saneamento aparece em
        // muitas formas ("gestão de redes de esgoto") e só a frase 'agua e esgoto'
        // deixava a companhia de esgoto passar pra busca de distribuidora de água.
        'esgoto',
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
      notFor: ['imovel', 'imoveis', 'imobiliaria', 'corretagem', 'corretor', 'corretora'],
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
      // 30/07: DDD 19 "distribuidora de água" trouxe 18 farmacêuticas/hospitalares VIVAS
      // (Sanofi 54 > JOBEMA água 49). CNAE/nome de medicamentos É evidência positiva de
      // outro ramo — sem esta regra a porta só via "não sei" (`segment_unconfirmed`).
      code: 'farma_hospitalar',
      label: 'Farmacêutico / hospitalar / veterinário',
      notFor: ['medicamento', 'medicamentos', 'farmaceutica', 'farmaceutico', 'farmacia', 'hospitalar', 'veterinario', 'drogaria'],
      tokens: [
        // Frases oficiais de CNAE (fonte cnpj_public, quando há cnaeDescription real).
        'medicamentos e drogas de uso humano',
        'produtos farmaceuticos',
        'produtos veterinarios',
        // Termos curtos: pegam sinal só pelo NOME, sem CNAE oficial (lane web).
        'medicamentos',
        'medicamento',
        'farmaceutica',
        'farmaceutico',
        'hospitalar',
        'drogaria',
      ],
    },
    {
      // S5 CORREÇÃO DO NOTURNO (30/07, reincidência do achado nº5): o teste noturno
      // mediu 13,8% da entrega de "distribuidora de água" com CARA DE GÁS. O mapa já
      // tinha 'gas natural'/'gas liquefeito' (frases de CNAE), mas nada pegava o
      // revendedor de botijão pelo NOME — que é como ele aparece na lane web. Mesma
      // forma da regra farma_hospitalar (30/07), que nasceu do mesmo sintoma.
      code: 'gas_glp',
      label: 'Gás / GLP / botijão',
      notFor: ['gas', 'glp', 'botijao', 'botijoes', 'gasista'],
      tokens: [
        // Frases oficiais de CNAE.
        'comercio varejista de gas liquefeito',
        'comercio atacadista de gas liquefeito',
        'gas liquefeito de petroleo',
        // Nome (lane web) — 'gas' sozinho é seguro porque o casamento é por palavra
        // INTEIRA: não pega "Vargas", "gastronomia" nem "Gaspar".
        'gas',
        'glp',
        'botijao',
        'botijoes',
        'gasista',
      ],
    },
    {
      code: 'servicos_financeiros',
      label: 'Serviços financeiros',
      notFor: ['banco', 'financeira', 'seguro', 'seguros', 'seguradora', 'credito', 'valores'],
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

// S5 CORREÇÃO DO NOTURNO (30/07): o casamento era `includes` cru. Com frase de CNAE
// isso é seguro ('gas liquefeito' não aparece por acidente), mas com token de UMA
// palavra é uma bomba: 'gas' casaria "VarGAS", "GAStronomia", "GASpar" — e a regra
// nova do gás não existiria sem esse token (o revendedor de botijão se anuncia como
// "Gás e Água do Zé", não com o CNAE na placa). Então token de uma palavra passa a
// casar por PALAVRA INTEIRA, com tolerância de plural (a mesma que os pares
// 'imobiliaria'/'imobiliarias' faziam na mão). Frases seguem em `includes`.
const singleWordMatcherCache = new Map<string, RegExp>();
function matchesExclusionToken(haystack: string, token: string): boolean {
  const normalized = normalizeExclusionKey(token);
  if (!normalized) return false;
  if (normalized.includes(' ')) return haystack.includes(normalized);
  let matcher = singleWordMatcherCache.get(normalized);
  if (!matcher) {
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    matcher = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:s|es)?(?:[^a-z0-9]|$)`);
    singleWordMatcherCache.set(normalized, matcher);
  }
  return matcher.test(haystack);
}

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

// 30/07 (mina desarmada): o segmento que o DONO pediu nunca é exclusão dele mesmo —
// "distribuidora de energia" caía na regra energia_agua_combustivel (tokens 'energia' e
// 'distribuicao de energia' no CNAE oficial) e a busca se auto-excluía INTEIRA, na porta da
// Receita E no gate web; idem "distribuidora de medicamentos" com a regra farma. A regra sai
// do jogo POR INTEIRO (não token a token): o CNAE oficial traz variações ('energia eletrica')
// que continuariam matando o segmento pedido se só o token literal fosse poupado.
//
// 30/07 (2ª volta — "a mina do gás"): a lista `notFor` MANDA quando existe. A inferência
// pelos tokens continua embaixo só como rede pra regra futura que nascer sem `notFor` —
// nunca como fonte principal, porque adivinhar foi exatamente o que deixou
// "distribuidora de gás" se matando sozinha na regra de energia/combustível.
function ruleTargetsRequestedSegment(rule: RadarSegmentExclusionRule, segmentKey: string): boolean {
  if (!segmentKey) return false;
  if (rule.notFor?.length) {
    return rule.notFor.some((term) => matchesExclusionToken(segmentKey, term));
  }
  return rule.tokens.some((token) => segmentKey.includes(normalizeExclusionKey(token)));
}

export function resolveSegmentExclusionRules(segment: unknown): RadarSegmentExclusionRule[] {
  const segmentKey = normalizeExclusionKey(segment);
  for (const candidate of segmentKeyCandidates(segment)) {
    const rules = RADAR_SEGMENT_EXCLUSION_MAP[candidate];
    if (rules && rules.length) {
      return rules.filter((rule) => !ruleTargetsRequestedSegment(rule, segmentKey));
    }
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
    if (rule.tokens.some((token) => matchesExclusionToken(haystack, token))) {
      return rule;
    }
  }
  return null;
}

// LOTE 1 (17/08 — PR17082026-FAXINA-DA-BUSCA-RFB-PRIMEIRO): EVIDÊNCIA POSITIVA DE CNAE VENCE A
// EXCLUSÃO GENÉRICA.
//
// Até aqui a exclusão vencia TUDO. Só que a regra `varejo_puro` (token 'comercio varejista')
// matava o CNAE 4723-7/00 — que é exatamente onde a distribuidora de água mora na Receita.
// Medido em Valinhos/SP: FERREIRAGUA, VALINAGUA, ACQUARELLA, RICCI e RINAGUA rejeitadas como
// "varejo puro" numa busca por distribuidora de água.
//
// A evidência é o CÓDIGO do CNAE (campo estruturado da Receita), NUNCA texto: nome que diz
// "água" não desarma nada — senão qualquer "Água & Gás do Zé" reabriria o furo do noturno de
// 30/07. E como a allowlist é curada e estreita (radar-segment-cnae-map.util), as regras
// existentes seguem inteiras: saneamento (3600601), energia (3513100/3514000), roupa (4781400),
// transporte (4930202) e farma não estão em allowlist nenhuma e morrem como antes.
//
// A função ANTIGA fica intacta byte a byte (4 call-sites + ~25 asserts dependem da assinatura
// varargs) — esta é aditiva.
export function findRadarSegmentExclusionMatchWithEvidence(input: {
  segment: unknown;
  cnae?: unknown;
  city?: unknown;
  texts: unknown[];
}): RadarSegmentExclusionRule | null {
  if (matchesRadarSegmentCnaeAllowlist({
    segment: input.segment,
    cnae: input.cnae,
    city: input.city,
    texts: input.texts,
  })) return null;
  return findRadarSegmentExclusionMatch(input.segment, ...input.texts);
}
