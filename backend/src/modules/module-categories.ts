// OOBE POR CATEGORIA DE MÓDULO (PR10072026/02, 10/07) — FONTE ÚNICA do mapa
// categoria→módulos. O primeiro acesso pergunta ao DONO quais categorias ele
// quer (ex.: cliente só-logística no celular pula toda a dor de cabeça); a
// escolha vira post-it em CompanyModule (enabled true/false) via
// POST /profile/module-categories (users.service.saveCompanyModuleCategories).
//
// REGRA DURA: cadastros básicos (empresas/contatos/produtos/config/dash) NUNCA
// são desligados por aqui — só os módulos listados neste mapa são tocados.
// financeiro/gerencial são eixo Dono/Gerente (fora de plano E fora daqui).

export type ModuleCategoryKey = 'radar' | 'vendas' | 'whatsapp' | 'logistica' | 'website';

// Mapa canônico (decisão do dono 10/07):
//   Radar/Empresas   → webscraping
//   Vendas + Agenda  → vendas   (agenda/automações/relatórios seguem o módulo 'vendas' no front)
//   WhatsApp + IA    → atendimento, bot
//   Logística        → logistica
//   Website          → website
export const MODULE_CATEGORY_MAP: Record<ModuleCategoryKey, string[]> = {
  radar: ['webscraping'],
  vendas: ['vendas'],
  whatsapp: ['atendimento', 'bot'],
  logistica: ['logistica'],
  website: ['website'],
};

export const MODULE_CATEGORY_KEYS = Object.keys(MODULE_CATEGORY_MAP) as ModuleCategoryKey[];

// Todos os módulos GOVERNADOS pela escolha de categoria — o endpoint só encosta
// nestes (upsert de post-it); qualquer outro módulo fica intocado.
export const CATEGORY_MANAGED_MODULE_KEYS: string[] = Array.from(
  new Set(Object.values(MODULE_CATEGORY_MAP).flat()),
);

// Normaliza a lista vinda do front: só chaves conhecidas, únicas, na ordem canônica.
export function normalizeModuleCategories(input: unknown): ModuleCategoryKey[] {
  const raw = Array.isArray(input) ? input : [];
  const wanted = new Set(
    raw.map((c) => String(c || '').trim().toLowerCase()).filter(Boolean),
  );
  return MODULE_CATEGORY_KEYS.filter((k) => wanted.has(k));
}

// Módulos que a seleção de categorias LIGA (união dos mapas das escolhidas).
export function moduleKeysForCategories(categories: ModuleCategoryKey[]): Set<string> {
  const keys = new Set<string>();
  for (const cat of categories) {
    for (const moduleKey of MODULE_CATEGORY_MAP[cat] || []) keys.add(moduleKey);
  }
  return keys;
}

// Leitor tolerante do Company.moduleCategoriesJson (coluna JSONB — o Prisma
// devolve array/objeto; caminhos raw podem devolver string JSON). Sempre
// devolve lista limpa de chaves conhecidas; qualquer lixo vira [].
export function parseCompanyModuleCategories(raw: unknown): ModuleCategoryKey[] {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return normalizeModuleCategories(parsed);
  } catch {
    return [];
  }
}
