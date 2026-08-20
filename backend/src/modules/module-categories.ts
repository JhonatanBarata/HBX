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

// Mapa canônico (decisão do dono 10/07, ampliado em 19/08):
//   Radar/Empresas   → webscraping
//   Vendas + Agenda  → vendas, conversas   (agenda/automações/relatórios seguem o módulo 'vendas' no front)
//   WhatsApp + IA    → atendimento, bot
//   Logística        → logistica
//   Website          → website
//
// 🔴 'conversas' ENTROU NA CATEGORIA 'vendas' (19/08, ordem do dono: "conversas
// tem que ser ligado junto com o vendas"). Até aqui ela não pertencia a
// categoria nenhuma — e esse foi o defeito: a tela do tenant desenha SÓ as
// categorias deste mapa, então 'conversas' não tinha interruptor em lugar
// NENHUM do lado da empresa, enquanto o nascimento do tenant a gravava OFF.
// Resultado medido em produção: o próprio dono (company 51, ADMIN) levou "este
// módulo não está liberado — fale com o administrador" no HBX Vendas e não
// tinha onde ligar; só o master conseguia, e ainda por cima em dois cliques
// (OFF→ON). Chave sem tela não existe.
export const MODULE_CATEGORY_MAP: Record<ModuleCategoryKey, string[]> = {
  radar: ['webscraping'],
  vendas: ['vendas', 'conversas'],
  whatsapp: ['atendimento', 'bot'],
  logistica: ['logistica'],
  website: ['website'],
};

// 🔴 CATEGORIA ACOPLADA — os módulos dela andam SEMPRE JUNTOS (19/08).
//
// A regra normal desta lista é ANY ("categoria já tem algum módulo ON → não
// reescreve"), e ela existe para preservar mix parcial de propósito
// (atendimento ON + bot OFF, company 40). Para 'vendas' isso seria exatamente o
// bug: como 'vendas' quase sempre já está ON, ligar a categoria não escreveria
// NADA e 'conversas' ficaria OFF para sempre — a mesma porta trancada, só que
// com o interruptor na tela mentindo que resolveu.
//
// Acoplada = quem liga a categoria liga TODOS os módulos dela que ainda não
// estão ligados (o teto do master continua sendo lei: `ceilingOff` vira
// skipped). Desligar segue igual: a categoria inteira cai.
export const COUPLED_CATEGORY_KEYS: ReadonlySet<ModuleCategoryKey> = new Set<ModuleCategoryKey>(['vendas']);

export function isCoupledCategory(key: unknown): boolean {
  const normalized = String(key || '').trim().toLowerCase() as ModuleCategoryKey;
  return COUPLED_CATEGORY_KEYS.has(normalized);
}

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

// ─── CORREÇÃO 11/07 (pós-revisão PR10072026) — escrita por INTENÇÃO ─────────
//
// O POST /profile/module-categories manda só o CONJUNTO de categorias ligadas.
// Gravar cegamente enabled=false em todo módulo fora do conjunto desligava
// módulos VIVOS por efeito colateral (categoria parcial — ex.: atendimento ON
// + bot OFF — era reportada como desligada pelo options e sumia do POST; o
// próximo toggle de QUALQUER outra categoria matava o atendimento da empresa).
// Regra nova, por categoria, comparando a INTENÇÃO (target) com o estado atual:
//   · target ON  + algum módulo já ON → NADA (preserva o mix por módulo; o
//     options reporta categoria parcial como ligada — semântica ANY)
//     ⚠️ EXCEÇÃO: categoria ACOPLADA (`options.coupled`, ver COUPLED_CATEGORY_KEYS)
//     ignora o ANY e liga o que faltar — é a lei "conversas anda com vendas".
//   · target ON  + tudo OFF           → liga todos (teto do master pula → skipped)
//   · target OFF + categoria travada  → NADA (tenant não governa locked; a UI a
//     esconde, logo ausência no POST não é intenção) — módulos ON viram skipped
//   · target OFF + algum módulo ON    → desliga todos (toggle real do usuário)
//   · target OFF + tudo já OFF        → NADA (idempotente)

export type CategoryModuleState = {
  key: string;
  // Linha de CompanyModule ? (masterEnabled && enabled) : SystemModule.defaultEnabled.
  effective: boolean;
  // Linha com masterEnabled === false (teto do master).
  ceilingOff: boolean;
  // Módulo fora do catálogo/companyAssignable (categoria vira locked, fail-closed).
  missing?: boolean;
};

export type CategoryWritePlan = {
  writes: Array<{ moduleKey: string; enabled: boolean }>;
  skippedModuleKeys: string[];
};

export function planCategoryModuleWrites(
  target: boolean,
  modules: CategoryModuleState[],
  options?: { coupled?: boolean },
): CategoryWritePlan {
  const writes: CategoryWritePlan['writes'] = [];
  const skippedModuleKeys: string[] = [];
  const coupled = Boolean(options?.coupled);
  const anyOn = modules.some((m) => !m.missing && m.effective);
  const locked = modules.some((m) => m.missing || m.ceilingOff);

  if (target) {
    if (anyOn && !coupled) return { writes, skippedModuleKeys }; // já ligada (mesmo parcial)
    for (const m of modules) {
      if (m.missing) continue;
      if (m.ceilingOff) {
        skippedModuleKeys.push(m.key);
        continue;
      }
      // Acoplada: o que já está ON não precisa de escrita nova — só o que falta.
      if (coupled && m.effective) continue;
      writes.push({ moduleKey: m.key, enabled: true });
    }
    return { writes, skippedModuleKeys };
  }

  if (locked) {
    // Categoria travada não é governável pelo tenant: nada é escrito; o que
    // está ON e ficou intocado entra em skipped (informativo pro front).
    for (const m of modules) {
      if (!m.missing && m.effective) skippedModuleKeys.push(m.key);
    }
    return { writes, skippedModuleKeys };
  }

  if (!anyOn) return { writes, skippedModuleKeys }; // já desligada
  for (const m of modules) {
    if (m.missing) continue;
    writes.push({ moduleKey: m.key, enabled: false });
  }
  return { writes, skippedModuleKeys };
}
