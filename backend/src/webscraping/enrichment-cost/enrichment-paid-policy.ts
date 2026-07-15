/**
 * Política de acesso a providers pagos/premium no enriquecimento de leads.
 *
 * Fonte única de configuração — lê das envs:
 *   HBX_ENRICH_ALLOW_PAID    → libera providers tier "paid"    (ex.: Serper, ScrapingDog, Tavily)
 *   HBX_ENRICH_ALLOW_PREMIUM → libera providers tier "premium" (ex.: Exa, Firecrawl, SerpApi)
 *
 * Ambas default desligadas. A amarração a plano/cobrança é responsabilidade de outra frente.
 *
 * AVISO: sem SERPER_API_KEY / BRAVE_SEARCH_API_KEY setados no motor Python,
 * nenhum provider pago dispara mesmo com allowPaid=true.
 */

import { paidSourcesAllowed } from '../source-budget/role-guard';

const TRUTHY_VALUES = new Set(['true', '1', 'on', 'yes', 'sim']);

function envFlag(name: string): boolean {
  return TRUTHY_VALUES.has((process.env[name] ?? '').trim().toLowerCase());
}

export interface EnrichmentPaidFlags {
  allowPaid: boolean;
  allowPremium: boolean;
}

/**
 * Resolve os flags de acesso a providers pagos/premium.
 * Ambos são false por padrão — torneira fechada até que as envs sejam definidas.
 */
export function resolveEnrichmentPaidFlags(): EnrichmentPaidFlags {
  // TRAVA FÍSICA ANTI-PAGO (Lei nº1): em localhost, o repasse pro motor Python vem SEMPRE fechado —
  // nenhum provider pago/premium liga, independente das envs. Só o VPS (HBX_ROLE=vps) reabre.
  if (!paidSourcesAllowed()) {
    return { allowPaid: false, allowPremium: false };
  }
  return {
    allowPaid: envFlag('HBX_ENRICH_ALLOW_PAID'),
    allowPremium: envFlag('HBX_ENRICH_ALLOW_PREMIUM'),
  };
}
