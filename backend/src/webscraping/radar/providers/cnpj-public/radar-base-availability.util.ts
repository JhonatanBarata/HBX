import type { CnpjBaseQueryInput } from './cnpj-base-query.service';
import {
  resolveRadarSegmentCnaeEntries,
  resolveRadarSegmentCnaeSignalKeyword,
} from '../../shared/radar-segment-cnae-map.util';

// VENDAS-REFAB S3 — ponte ÚNICA entre os filtros que o Vendas/Radar já expõe
// (NormalizedRadarFilters, ver radar/shared/radar-types.ts) e o WHERE da base 28M
// (CnpjPublicCompany, ver cnpj-base-query.service.ts). Escopo estrito: só mapeia o que o
// filtro do Vendas JÁ manda hoje — não inventa campo novo de UI (porte/CNAE picker é decisão
// do S4/front). `segment` vira TANTO keyword (nome/razão) QUANTO cnae (se vier código numérico
// puro), porque hoje o campo único "segmento" do Vendas mistura os dois usos.

export type RadarFiltersLikeForBaseCount = {
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  withWebsite?: boolean | null;
  noWebsite?: boolean | null;
  validPhone?: boolean | null;
  likelyWhatsapp?: boolean | null;
};

/** Segmento como código CNAE puro (4-7 dígitos) — mesma regra do CnpjPublicDatasetService. */
function extractCnaeCode(segment: string): string | null {
  const match = segment.match(/\b\d{4,7}\b/);
  return match ? match[0] : null;
}

export function buildCnpjBaseQueryInputFromRadarFilters(
  filters: RadarFiltersLikeForBaseCount,
): CnpjBaseQueryInput {
  const city = String(filters.city || '').trim();
  const state = String(filters.state || '').trim().toUpperCase();
  const segment = String(filters.segment || '').trim();
  const cnaeCode = segment ? extractCnaeCode(segment) : null;

  const input: CnpjBaseQueryInput = {};
  if (city) input.cities = [city];
  if (state) input.states = [state];
  if (cnaeCode) {
    input.cnaes = [cnaeCode];
  } else if (segment) {
    // LOTE 1 (17/08): a contagem TEM de falar a mesma língua da porta da Receita, senão a
    // frase honesta do relatório ("a Receita tem N nessa cidade") mente na direção oposta da
    // entrega. Com o mapa curado, a porta passou a aceitar por CÓDIGO de CNAE — se a contagem
    // continuasse só com `keyword = segmento`, ela exigiria 'distribuidora' E 'agua' no texto
    // (a trava A1) e prometeria 15 onde a busca entrega 86.
    //
    // O sinal textual das entradas amplas (4723700/4784900) vira `keyword`, não a frase toda:
    // o WHERE do cnpj-base-query soma cnaes E keyword em AND, então "CNAE do mapa + palavra
    // 'agua' no texto" é a tradução mais próxima possível da regra da porta. Entradas SEM
    // sinal já carregam 'agua' na própria descrição do CNAE, então nada se perde nelas.
    // Resíduo conhecido e aceito: `contains` é substring e a contagem não tira o nome da
    // cidade do texto (a porta tira) — cidade chamada "Águas de ..." conta a mais.
    const entries = resolveRadarSegmentCnaeEntries(segment);
    if (entries.length) {
      input.cnaes = entries.map((entry) => entry.cnae);
      // Só o CNAE PRINCIPAL, porque é só ele que a porta olha (`cnae: { startsWith }` no WHERE
      // do dataset). Contar CNAE secundário aqui prometeria empresa que a busca não entrega —
      // secundário é decisão à parte, ainda sem GO do dono.
      input.cnaePrincipalOnly = true;
      const sinal = resolveRadarSegmentCnaeSignalKeyword(segment);
      if (sinal) input.keyword = sinal;
    } else {
      input.keyword = segment;
    }
  }

  const contato: CnpjBaseQueryInput['contato'] = {};
  // withWebsite/noWebsite: a base fria NUNCA tem `website` populado (dump RFB não traz site —
  // é output de enriquecimento, ver comentário em cnpj-base-query.service.ts buildWhere). Não
  // mapeamos pra WHERE (inflaria/zeraria contagem sem lastro); ambos ficam de fora do count aqui
  // de propósito — a base 28M não sabe responder "tem site".
  if (filters.validPhone) contato.comTelefone = true;
  if (filters.likelyWhatsapp) contato.comCelular = true;
  if (Object.keys(contato).length) input.contato = contato;

  return input;
}
