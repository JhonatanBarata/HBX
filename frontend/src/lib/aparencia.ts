// ============================================================
// APARÊNCIA — fonte ÚNICA de CASCA + TEMA + MODO (o contrato).
//
// Antes (até 28/07) os três conceitos viviam grudados num valor só:
// `hbx:pele = "aurora-mod"` carregava a cor E a casca, o boot do layout.tsx
// tinha a própria lista duplicada, e `data-pele` existia só pra o seletor se
// destacar. Agora são TRÊS eixos independentes:
//
//   CASCA  = a experiência inteira (densidade, superfície, geometria)
//   TEMA   = a cor
//   MODO   = claro/escuro
//
// DUAS CASCAS (dono 31/07 — a HBX foi removida inteira):
//   backup       — lê-se "Premium". Escreve data-casca="modern" DE PROPÓSITO:
//                  assim casca-modern.css continua byte-idêntico e o fallback
//                  é garantido, não "quase igual".
//   corporativa  — densa, orientada a dados ("cara de Excel").
// As DUAS oferecem as mesmas 5 cores clássicas e os dois modos: a diferença
// entre elas é DENSIDADE E GEOMETRIA, não paleta. Foi a ordem do dono ao
// matar a HBX ("implante cores no corporativo, as mesmas cores do premium") e
// é o que separa casca de tema de vez.
//
// ATENÇÃO — ESTE ARQUIVO NÃO PODE IMPORTAR REACT. Ele é importado pelo
// app/layout.tsx, que é SERVER Component; qualquer hook aqui puxaria o módulo
// inteiro pro bundle do servidor e o Next recusa (500 em TODA rota). É a mesma
// fronteira que casca-mobile-const.ts documenta. Hook/estado moram em
// components/hbx/theme-attributes.tsx.
// ============================================================

export type CascaKey = "corporativa" | "backup";
/**
 * DOIS PADRÕES, UMA COR CADA (dono, 01/08/2026: "crie 2 padrões só! Premium e
 * Corporativo").
 *
 * Até 31/07 eram 6 cores × 2 cascas × 2 modos = 24 combinações para manter
 * coerentes. Não era a quantidade de CSS que impedia a garantia de "nada
 * some" — era esse espaço de combinação: ninguém abre 24 telas para conferir
 * um ajuste, e o que ninguém confere ninguém garante. Com 2 padrões × 2 modos
 * são 4, e 4 a máquina confere a cada corrida (tests/e2e/design-system.spec.ts).
 *
 * Saíram Aurora, Ember, Rosé e Layout — 158 seletores de CSS decorativo.
 *
 * Os NOMES DE ATRIBUTO continuam `login` e `corporativa` de propósito, pelo
 * mesmo motivo que a casca Premium se chama `backup` no código: eles estão
 * gravados no navegador de cada usuário e pendurados em seletores de CSS.
 * Renomear obrigaria a migrar storage e reescrever folha sem mudar um pixel.
 * Regra de sempre: leia `label` ao falar com o usuário, `key`/`attr` ao falar
 * com o código.
 */
export type TemaKey = "login" | "corporativa";
export type Modo = "light" | "dark";

// Chaves de armazenamento — uma por eixo (era `hbx:pele`, combinado).
export const CASCA_STORAGE = "hbx:casca";
export const TEMA_STORAGE = "hbx:tema";
export const MODE_STORAGE = "hbx:mode";
/** chave ANTIGA (`aurora-mod`) — lida uma vez pra migrar e apagada. */
export const LEGACY_PELE_STORAGE = "hbx:pele";

export type TemaDef = { key: TemaKey; label: string };

/**
 * A paleta de cada padrão. UMA por casca — e é por isso que o seletor de cor
 * some sozinho da interface: `escolheTema()` devolve `temas.length > 1`, o
 * menu em components/hbx/shell.tsx é guiado por este registro, e o rótulo do
 * botão deixa de ser "Premium · Login" para ser só "Premium".
 *
 * Nenhuma linha de JSX precisou mudar para isso acontecer. Registro que manda
 * na tela é o que permite mudar produto editando dado.
 */
const PALETA_PREMIUM: readonly TemaDef[] = [{ key: "login", label: "Premium" }];
const PALETA_CORPORATIVO: readonly TemaDef[] = [{ key: "corporativa", label: "Corporativo" }];

/** Toda cor que ainda existe. Usada pela migração do formato antigo. */
const TEMAS_VIVOS: readonly TemaDef[] = [...PALETA_PREMIUM, ...PALETA_CORPORATIVO];

export type CascaDef = {
  key: CascaKey;
  label: string;
  /** valor escrito em <html data-casca>. Ver nota do `backup` no topo. */
  attr: string;
  temas: readonly TemaDef[];
  modos: readonly Modo[];
  temaPadrao: TemaKey;
  modoPadrao: Modo;
};

// ============================================================
// NOMES E ORDEM — DUAS cascas (dono 31/07: "remova o tema HBX, inteiro").
//
//   chave `backup`      → lê-se "Premium"      (attr modern)
//   chave `corporativa` → lê-se "Corporativo"  (attr corporativa)
//
// Sim, a chave `backup` mostra "Premium". É proposital e NÃO deve ser
// "consertado" renomeando a chave: `hbx:casca` está gravado no navegador de
// cada usuário e o `attr` é o que escreve `<html data-casca>`, de onde pendem
// ~75 seletores de CSS. Renomear obrigaria a migrar storage e reescrever as
// folhas, sem mudar um pixel na tela. Regra pra quem mexer aqui: leia `label`
// quando falar com o usuário, leia `key`/`attr` quando falar com o código.
//
// A CASCA "HBX" (chave `premium`, attr premium) FOI REMOVIDA em 31/07 —
// registro, casca-premium.css e a paleta [data-theme="premium"] saíram
// juntos. O que sobrevive daquele arquivo é SÓ a paleta `.cdl`, que nunca foi
// da casca: é o desenho fechado da Central do Lead, que vale em qualquer
// casca (hoje em theme-central-do-lead.css). Quem tinha a casca HBX salva no
// navegador cai no padrão sozinho — getCasca() já resolve chave desconhecida.
//
// Não existe descrição/legenda por casca: o menu mostra só o nome (o dono
// cortou o subtítulo — "Remova explicações, eu pedi?").
// ============================================================
export const CASCAS: readonly CascaDef[] = [
  {
    key: "backup",
    label: "Premium",
    attr: "modern",
    temas: PALETA_PREMIUM,
    modos: ["light", "dark"],
    temaPadrao: "login",
    modoPadrao: "light",
  },
  {
    key: "corporativa",
    label: "Corporativo",
    attr: "corporativa",
    // O que separa as duas é DENSIDADE, e a densidade é um token só
    // (--hbx-densidade, em hbx-theme/hbx-system.css). Mesma estrutura, mesma
    // tela, respirando diferente: um layout para desenhar, um para testar, e
    // trocar de padrão não CONSEGUE fazer nada sumir — por construção, não
    // por disciplina. Foi a ordem do dono em 01/08 ("só token, mesma
    // estrutura") e é o que torna a garantia verificável.
    temas: PALETA_CORPORATIVO,
    modos: ["light", "dark"],
    temaPadrao: "corporativa",
    modoPadrao: "light",
  },
];

export const CASCA_PADRAO: CascaKey = "backup";

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

/** Modo válido PRA ESTA casca (hoje as duas aceitam claro e escuro). */
export function resolveModo(casca: CascaDef, modo: string | null | undefined): Modo {
  return casca.modos.includes(modo as Modo) ? (modo as Modo) : casca.modoPadrao;
}

/**
 * Migração do formato antigo (`hbx:pele = "aurora-mod"`).
 *
 * Quem tinha Aurora, Ember, Rosé ou Layout salvo não vê tela quebrada nem
 * mensagem de erro: a cor extinta simplesmente não é reconhecida aqui,
 * `resolveTema` cai no padrão da casca e a pessoa abre o app no Premium. É a
 * mesma queda macia que já existia para a casca HBX removida em 31/07 — a
 * regra da casa é que o registro é a fonte da verdade e o que não está nele
 * não existe, em vez de ficar meio-vivo em algum canto do código.
 */
export function temaDoLegado(pele: string | null | undefined): TemaKey | null {
  if (!pele) return null;
  const base = String(pele).replace(/-mod$/, "");
  return TEMAS_VIVOS.some(t => t.key === base) ? (base as TemaKey) : null;
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
