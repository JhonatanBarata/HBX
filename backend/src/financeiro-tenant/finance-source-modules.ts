/**
 * FINANCEIRO-UNIVERSAL — catálogo ÚNICO das origens de cobrança do TENANT
 * (dinheiro que o cliente do HBX cobra do cliente FINAL dele). NÃO inclui a
 * receita da PLATAFORMA (assinatura/recarga/crédito = sourceModule null).
 *
 * Fonte da verdade pro módulo financeiro-tenant enxergar/baixar cobrança de
 * QUALQUER módulo (logística + vendas + futuros) sem hard-code espalhado. A
 * logística mantém os filtros PRÓPRIOS dela intactos — não depende deste arquivo.
 */
export const TENANT_FINANCE_SOURCE_MODULES = [
  'logistica_entrega',
  'logistica_fechamento',
  'vendas_fechamento',
] as const;

export type TenantFinanceSourceModule = (typeof TENANT_FINANCE_SOURCE_MODULES)[number];

/**
 * Prefixo das origens da LOGÍSTICA. A baixa (quitar) de uma cobrança logística é
 * DELEGADA ao logisticaService.quitarCharge (paridade total: além do claim
 * atômico, PARA a cadência hbx-recovery de quem zerou a dívida — não cobrar quem
 * já pagou = trava anti-ban de chip). Cobrança de outras origens (vendas) faz o
 * claim atômico local, sem recovery.
 */
export const LOGISTICA_SOURCE_PREFIX = 'logistica';

export function isLogisticaSource(sourceModule: string | null | undefined): boolean {
  return String(sourceModule || '').startsWith(LOGISTICA_SOURCE_PREFIX);
}
