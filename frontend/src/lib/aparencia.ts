// ============================================================
// APARÊNCIA — fonte ÚNICA de CASCA + TEMA + MODO (o contrato).
//
// Antes (até 28/07) os três conceitos viviam grudados num valor só:
// `hbx:pele = "aurora-mod"` carregava a cor E a casca, o boot do layout.tsx
// tinha a própria lista duplicada, e `data-pele` existia só pra o seletor se
// destacar. Agora são TRÊS eixos independentes:
//
//   CASCA  = a experiência inteira (densidade, superfície, geometria)
//   TEMA   = a cor (só a Premium escolhe)
//   MODO   = claro/escuro (só a Premium escolhe)
//
// TRÊS CASCAS (ordem do dono 28/07):
//   premium      — a casca de alto acabamento, 5 temas × claro/escuro
//   corporativa  — clara fixa, densa, orientada a dados ("cara de Excel")
//   backup       — A CASCA DE HOJE, CONGELADA. Escreve data-casca="modern"
//                  DE PROPÓSITO: assim casca-modern.css continua byte-idêntico
//                  e o fallback é garantido, não "quase igual".
//
// ATENÇÃO — ESTE ARQUIVO NÃO PODE IMPORTAR REACT. Ele é importado pelo
// app/layout.tsx, que é SERVER Component; qualquer hook aqui puxaria o módulo
// inteiro pro bundle do servidor e o Next recusa (500 em TODA rota). É a mesma
// fronteira que casca-mobile-const.ts documenta. Hook/estado moram em
// components/hbx/theme-attributes.tsx.
// ============================================================

export type CascaKey = "premium" | "corporativa" | "backup";
export type TemaKey = "login" | "aurora" | "ember" | "rose" | "hbx-cyber" | "corporativa";
export type Modo = "light" | "dark";

// Chaves de armazenamento — uma por eixo (era `hbx:pele`, combinado).
export const CASCA_STORAGE = "hbx:casca";
export const TEMA_STORAGE = "hbx:tema";
export const MODE_STORAGE = "hbx:mode";
/** chave ANTIGA (`aurora-mod`) — lida uma vez pra migrar e apagada. */
export const LEGACY_PELE_STORAGE = "hbx:pele";

export type TemaDef = { key: TemaKey; label: string };

/** Os 5 temas de cor da Premium. Cada um é um theme-<key>.css já existente. */
export const TEMAS_PREMIUM: readonly TemaDef[] = [
  { key: "login", label: "Login" },
  { key: "aurora", label: "Aurora" },
  { key: "ember", label: "Ember" },
  { key: "rose", label: "Rosé" },
  { key: "hbx-cyber", label: "HBX" },
];

export type CascaDef = {
  key: CascaKey;
  label: string;
  hint: string;
  /** valor escrito em <html data-casca>. Ver nota do `backup` no topo. */
  attr: string;
  temas: readonly TemaDef[];
  modos: readonly Modo[];
  temaPadrao: TemaKey;
  modoPadrao: Modo;
};

export const CASCAS: readonly CascaDef[] = [
  {
    key: "premium",
    label: "Premium",
    hint: "Superfície, profundidade e cor — 5 temas, claro e escuro",
    attr: "premium",
    temas: TEMAS_PREMIUM,
    modos: ["light", "dark"],
    temaPadrao: "login",
    modoPadrao: "light",
  },
  {
    key: "corporativa",
    label: "Corporativa",
    hint: "Clara, densa e orientada a dados — sem escolha de cor",
    attr: "corporativa",
    // A paleta corporativa existe como TEMA fixo só pra continuar usando o
    // contrato de tokens (theme-corporativa.css). Não é escolha do usuário.
    temas: [{ key: "corporativa", label: "Corporativa" }],
    modos: ["light"],
    temaPadrao: "corporativa",
    modoPadrao: "light",
  },
  {
    key: "backup",
    label: "Backup",
    hint: "A casca anterior, congelada — rede de segurança",
    attr: "modern",
    temas: TEMAS_PREMIUM,
    modos: ["light", "dark"],
    temaPadrao: "login",
    modoPadrao: "light",
  },
];

export const CASCA_PADRAO: CascaKey = "premium";

/** Casca por chave, com queda no padrão (nunca devolve undefined). */
export function getCasca(key: string | null | undefined): CascaDef {
  return CASCAS.find(c => c.key === key) ?? CASCAS.find(c => c.key === CASCA_PADRAO)!;
}

/** true = o menu Aparência mostra o seletor de tema/modo pra esta casca. */
export function escolheTema(casca: CascaDef): boolean { return casca.temas.length > 1; }
export function escolheModo(casca: CascaDef): boolean { return casca.modos.length > 1; }

/** Tema válido PRA ESTA casca (senão o padrão dela). */
export function resolveTema(casca: CascaDef, tema: string | null | undefined): TemaKey {
  return casca.temas.some(t => t.key === tema) ? (tema as TemaKey) : casca.temaPadrao;
}

/** Modo válido PRA ESTA casca (a Corporativa ignora `dark` salvo). */
export function resolveModo(casca: CascaDef, modo: string | null | undefined): Modo {
  return casca.modos.includes(modo as Modo) ? (modo as Modo) : casca.modoPadrao;
}

/**
 * Migração do formato antigo: `hbx:pele = "aurora-mod"` → casca Premium
 * + tema `aurora`. Cai na PREMIUM (não no backup) de propósito: hoje as duas
 * são visualmente idênticas, então ninguém vê mudança nenhuma, e o Backup
 * fica disponível como escolha em vez de ser o destino de todo mundo.
 */
export function temaDoLegado(pele: string | null | undefined): TemaKey | null {
  if (!pele) return null;
  const base = String(pele).replace(/-mod$/, "");
  return TEMAS_PREMIUM.some(t => t.key === base) ? (base as TemaKey) : null;
}

/**
 * Script de boot pré-hidratação, GERADO deste mesmo registro — era aqui que
 * o modelo antigo duplicava a lista (uma no layout.tsx, outra no
 * theme-attributes.tsx) e elas saíam de sincronia. Roda síncrono no <head>,
 * antes da primeira pintura: sem flash de casca.
 */
export function buildAparenciaBoot(): string {
  const registro = CASCAS.map(c => ({
    k: c.key,
    a: c.attr,
    t: c.temas.map(t => t.key),
    m: c.modos,
    td: c.temaPadrao,
    md: c.modoPadrao,
  }));
  // `h.removeAttribute("data-engine")` vivia aqui, herdado do boot antigo.
  // Varredura de 28/07: `data-engine` aparece em ZERO lugares no repositório
  // inteiro — ninguém nunca seta. Era limpeza de um conceito que já tinha sido
  // removido, rodando em toda carga de página desde então. Saiu.
  return `(function(){try{`
    + `var h=document.documentElement;`
    + `var C=${JSON.stringify(registro)},P=${JSON.stringify(CASCA_PADRAO)};`
    + `var g=function(k){try{return localStorage.getItem(k);}catch(e){return null;}};`
    + `var casca=g(${JSON.stringify(CASCA_STORAGE)});`
    + `var tema=g(${JSON.stringify(TEMA_STORAGE)});`
    + `var modo=g(${JSON.stringify(MODE_STORAGE)});`
    // migração do valor combinado antigo (só quando ainda não há casca salva)
    + `if(!casca){var L=g(${JSON.stringify(LEGACY_PELE_STORAGE)});`
    + `if(L){casca=P;if(!tema){tema=String(L).replace(/-mod$/,"");}}}`
    + `var d=null,i;for(i=0;i<C.length;i++){if(C[i].k===casca){d=C[i];break;}}`
    + `if(!d){for(i=0;i<C.length;i++){if(C[i].k===P){d=C[i];break;}}}`
    + `if(d.t.indexOf(tema)<0){tema=d.td;}`
    + `if(d.m.indexOf(modo)<0){modo=d.md;}`
    + `h.setAttribute("data-casca",d.a);`
    + `h.setAttribute("data-theme",tema);`
    + `h.setAttribute("data-theme-mode",modo);`
    + `}catch(e){}})();`;
}
