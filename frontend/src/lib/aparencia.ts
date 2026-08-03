// ============================================================
// APARÊNCIA — fonte ÚNICA de CASCA + COR + MATERIAL + MODO (o contrato).
//
// Antes (até 28/07) os conceitos viviam grudados num valor só:
// `hbx:pele = "aurora-mod"` carregava a cor E a casca. Depois viraram três
// eixos; em 03/08 a COR deixou de ser uma lista fechada e o MATERIAL ganhou
// dono próprio. Hoje são QUATRO eixos independentes:
//
//   CASCA     = a experiência inteira (densidade, geometria)
//   COR       = uma cor qualquer, escolhida pela pessoa
//   MATERIAL  = vidro ou chapado
//   MODO      = claro/escuro
//
// POR QUE A LISTA DE 6 CORES MORREU (dono, 03/08: "remover todas essas
// cores, deixar um painel, multicor").
//
// As 6 cores não eram cor: eram meias-peles. Medido em /dev/pele, no MESMO
// padrão Premium, o `.side` saía assim:
//
//   Aurora / Layout / Rosé  →  backdrop-filter: blur(24px)
//   Ember / Lima / Corporativo →  blur: nenhum
//
// Metade tinha vidro e metade não — e ninguém tinha pedido isso. Trocar de
// COR mudava o MATERIAL do app por acidente, porque cada theme-<key>.css
// carregava um "Bloco B" de vestir junto com a paleta. O botão Vidro/Chapado
// deste arquivo é a correção: o que era efeito colateral virou escolha.
//
// A troca também matou 170 regras de vestir que já eram letra morta — as duas
// cascas são importadas DEPOIS das peles e venciam o empate de especificidade.
// O que sobrou de real virou hbx-theme/material.css.
//
// ATENÇÃO — ESTE ARQUIVO NÃO PODE IMPORTAR REACT. Ele é importado pelo
// app/layout.tsx, que é SERVER Component; qualquer hook aqui puxaria o módulo
// inteiro pro bundle do servidor e o Next recusa (500 em TODA rota). É a mesma
// fronteira que casca-mobile-const.ts documenta. Hook/estado moram em
// components/hbx/theme-attributes.tsx.
// ============================================================

export type CascaKey = "corporativa" | "backup";
export type Modo = "light" | "dark";

/**
 * COR — um hex, não uma chave de registro.
 *
 * O valor guardado é SÓ a semente. Quem constrói os ~60 tokens da tela é
 * hbx-theme/theme-gerado.css, em OKLCH, e ele usa da semente apenas MATIZ e
 * CROMA: a escada de claridade é da casa e é fixa. É isso que torna "qualquer
 * cor" seguro — contraste vira consequência da escada, não da sorte de quem
 * escolheu. Cor clara demais para texto branco não existe, porque a claridade
 * do botão nunca vem do usuário.
 */
export type Cor = string;

/** `<html data-theme>` tem UM valor agora. Fica de pé porque ~75 seletores de
 *  casca casam `[data-casca="…"][data-theme]` e sumiriam sem o atributo. */
export const TEMA_ATTR = "hbx";

export type MaterialKey = "vidro" | "chapado";
export const MATERIAIS: ReadonlyArray<{ key: MaterialKey; label: string }> = [
  { key: "vidro", label: "Vidro" },
  { key: "chapado", label: "Chapado" },
];

// Chaves de armazenamento — uma por eixo.
export const CASCA_STORAGE = "hbx:casca";
export const COR_STORAGE = "hbx:cor";
export const MATERIAL_STORAGE = "hbx:material";
export const MODE_STORAGE = "hbx:mode";
/** chave ANTIGA de cor (`aurora`, `ember`…) — lida uma vez pra migrar. */
export const LEGACY_TEMA_STORAGE = "hbx:tema";
/** chave MAIS antiga (`aurora-mod`) — casca e cor no mesmo valor. */
export const LEGACY_PELE_STORAGE = "hbx:pele";

/**
 * DENSIDADE — a terceira liberdade (decisão do dono, 01/08).
 *
 * A casca continua dando o PADRÃO; a escolha do usuário, quando existe, vence.
 * MATERIAL nasceu copiando este desenho de propósito: `null` = "sem
 * preferência, quem manda é a casca" é um estado de verdade, não um terceiro
 * valor inventado no meio do caminho.
 */
export const DENSIDADE_STORAGE = "hbx:densidade";
export type DensidadeKey = "compacta" | "normal" | "folgada";
export const DENSIDADES: ReadonlyArray<{ key: DensidadeKey; label: string }> = [
  { key: "compacta", label: "Compacto" },
  { key: "normal", label: "Normal" },
  { key: "folgada", label: "Folgado" },
];
export function resolveDensidade(valor: string | null | undefined): DensidadeKey | null {
  return DENSIDADES.some(d => d.key === valor) ? (valor as DensidadeKey) : null;
}

export type CorDef = { key: string; nome: string };

/**
 * A GRADE — o atalho, não a cerca.
 *
 * 15 matizes + 2 neutros, todos calculados na MESMA claridade OKLCH (L 0,55) e
 * no croma MÁXIMO que cabe no sRGB daquele matiz. É por isso que a grade
 * parece uma família e não um saco de cores: elas só diferem no eixo que a
 * pessoa está escolhendo. Croma máximo (e não um valor fixo) porque um croma
 * que caiba no amarelo deixa o vermelho lavado — medido: 0,15 em todos
 * transformava "Vermelho" num rosa empoeirado.
 *
 * OS HEX NÃO ESTÃO AQUI, e não por acaso: o fiscal (check-pele.mjs, R2) varre
 * `.ts` junto com `.tsx`, e o bloco `pele-allow` só existe no laço de CSS.
 * Cor literal mora em pele — os 17 tons vivem em hbx-theme/theme-gerado.css
 * como `--cor-<key>`, e `[data-cor="<key>"]` de lá é quem resolve o nome em
 * cor. Guardar o NOME tem um efeito bom de lado: reajustar um tom da grade
 * alcança quem já o escolheu, porque o atalho é referência viva e não cópia
 * congelada no navegador de cada um.
 *
 * Quem quer o azul EXATO da própria marca não usa a grade: usa a cor livre, e
 * aí sim o hex vai inline no <html>.
 */
export const CORES: readonly CorDef[] = [
  { key: "vermelho", nome: "Vermelho" },
  { key: "laranja", nome: "Laranja" },
  { key: "ambar", nome: "Âmbar" },
  { key: "ouro", nome: "Ouro" },
  { key: "limao", nome: "Limão" },
  { key: "verde", nome: "Verde" },
  { key: "esmeralda", nome: "Esmeralda" },
  { key: "turquesa", nome: "Turquesa" },
  { key: "ciano", nome: "Ciano" },
  { key: "azul", nome: "Azul" },
  { key: "anil", nome: "Anil" },
  { key: "violeta", nome: "Violeta" },
  { key: "purpura", nome: "Púrpura" },
  { key: "magenta", nome: "Magenta" },
  { key: "rosa", nome: "Rosa" },
  { key: "ardosia", nome: "Ardósia" },
  { key: "grafite", nome: "Grafite" },
];

/** Padrão de fábrica — o violeta que o Aurora ocupava desde 01/08. O VALOR
 *  dele mora em theme-gerado.css; aqui fica só o nome. */
export const COR_PADRAO = "violeta";

/** Nome da grade? Devolve a key; senão `null`. */
export function corDaGrade(valor: string | null | undefined): string | null {
  return CORES.some(c => c.key === valor) ? String(valor) : null;
}

/**
 * Aceita só `#RGB`/`#RRGGBB`. Devolve sempre 6 dígitos maiúsculos, ou `null`.
 *
 * Guarda de verdade, não formalidade: o valor vem de localStorage (que
 * qualquer um edita) e entra numa `style` do <html>. Sem esta peneira,
 * `#fff;} html{display:none` seria uma "cor" válida.
 */
export function normalizarHex(valor: string | null | undefined): string | null {
  if (typeof valor !== "string") return null;
  const v = valor.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    return ("#" + v.slice(1).split("").map(c => c + c).join("")).toUpperCase();
  }
  return null;
}

/** O que está guardado: um nome da grade, um hex livre, ou nada. */
export function classificarCor(valor: string | null | undefined):
  { tipo: "grade"; key: string } | { tipo: "livre"; hex: string } | null {
  const key = corDaGrade(valor);
  if (key) return { tipo: "grade", key };
  const hex = normalizarHex(valor);
  if (hex) return { tipo: "livre", hex };
  return null;
}

/**
 * As 6 chaves antigas viram o tom mais próximo da grade.
 *
 * Ninguém abre o app numa cor que não escolheu: quem estava no Ember acha um
 * laranja, quem estava no Rosé acha um rosa. A queda macia continua sendo a
 * regra da casa — chave desconhecida cai no padrão, sem tela quebrada.
 */
const LEGADO: Readonly<Record<string, string>> = {
  aurora: "violeta",
  "hbx-cyber": "anil",
  corporativa: "azul",
  rose: "rosa",
  ember: "laranja",
  login: "limao",
};

export function corDoLegado(tema: string | null | undefined): string | null {
  if (!tema) return null;
  return LEGADO[String(tema).replace(/-mod$/, "")] ?? null;
}

export type CascaDef = {
  key: CascaKey;
  label: string;
  /** valor escrito em <html data-casca>. Ver nota do `backup` abaixo. */
  attr: string;
  modos: readonly Modo[];
  modoPadrao: Modo;
  /** material que a casca entrega quando a pessoa não escolheu nada. */
  materialPadrao: MaterialKey;
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
// ~75 seletores de CSS. Regra pra quem mexer aqui: leia `label` quando falar
// com o usuário, leia `key`/`attr` quando falar com o código.
//
// O `materialPadrao` só descreve o que cada casca JÁ fazia antes de o material
// virar botão: a Premium nasceu de vidro, a Corporativa nasceu chapada. Quem
// nunca abrir o painel não vê diferença nenhuma.
// ============================================================
export const CASCAS: readonly CascaDef[] = [
  {
    key: "backup",
    label: "Premium",
    attr: "modern",
    modos: ["light", "dark"],
    modoPadrao: "light",
    materialPadrao: "vidro",
  },
  {
    key: "corporativa",
    label: "Corporativo",
    attr: "corporativa",
    modos: ["light", "dark"],
    modoPadrao: "light",
    materialPadrao: "chapado",
  },
];

export const CASCA_PADRAO: CascaKey = "backup";

/** Casca por chave, com queda no padrão (nunca devolve undefined). */
export function getCasca(key: string | null | undefined): CascaDef {
  return CASCAS.find(c => c.key === key) ?? CASCAS.find(c => c.key === CASCA_PADRAO)!;
}

/** true = o menu Aparência mostra o seletor de modo pra esta casca. */
export function escolheModo(casca: CascaDef): boolean { return casca.modos.length > 1; }

/** Modo válido PRA ESTA casca (hoje as duas aceitam claro e escuro). */
export function resolveModo(casca: CascaDef, modo: string | null | undefined): Modo {
  return casca.modos.includes(modo as Modo) ? (modo as Modo) : casca.modoPadrao;
}

/** Material escolhido, ou o da casca quando não há escolha. */
export function resolveMaterial(casca: CascaDef, material: string | null | undefined): MaterialKey {
  return MATERIAIS.some(m => m.key === material) ? (material as MaterialKey) : casca.materialPadrao;
}

/** Só a ESCOLHA (sem cair no padrão da casca) — `null` = "quem manda é a casca". */
export function resolveMaterialEscolhido(valor: string | null | undefined): MaterialKey | null {
  return MATERIAIS.some(m => m.key === valor) ? (valor as MaterialKey) : null;
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
    m: c.modos,
    md: c.modoPadrao,
    mt: c.materialPadrao,
  }));
  return `(function(){try{`
    + `var h=document.documentElement;`
    + `var C=${JSON.stringify(registro)},P=${JSON.stringify(CASCA_PADRAO)};`
    + `var g=function(k){try{return localStorage.getItem(k);}catch(e){return null;}};`
    + `var casca=g(${JSON.stringify(CASCA_STORAGE)});`
    + `var cor=g(${JSON.stringify(COR_STORAGE)});`
    + `var modo=g(${JSON.stringify(MODE_STORAGE)});`
    // migração 1: o valor combinado antigo (`hbx:pele = "aurora-mod"`)
    + `if(!casca){var L=g(${JSON.stringify(LEGACY_PELE_STORAGE)});if(L){casca=P;}}`
    // migração 2: as 6 chaves de cor (`hbx:tema = "ember"`) viram nome da grade
    + `if(!cor){var T=g(${JSON.stringify(LEGACY_TEMA_STORAGE)})||g(${JSON.stringify(LEGACY_PELE_STORAGE)});`
    + `if(T){var M=${JSON.stringify(LEGADO)};cor=M[String(T).replace(/-mod$/,"")]||null;}}`
    + `var d=null,i;for(i=0;i<C.length;i++){if(C[i].k===casca){d=C[i];break;}}`
    + `if(!d){for(i=0;i<C.length;i++){if(C[i].k===P){d=C[i];break;}}}`
    + `if(d.m.indexOf(modo)<0){modo=d.md;}`
    + `var mat=g(${JSON.stringify(MATERIAL_STORAGE)});`
    + `if(mat!=="vidro"&&mat!=="chapado"){mat=d.mt;}`
    + `h.setAttribute("data-casca",d.a);`
    + `h.setAttribute("data-theme",${JSON.stringify(TEMA_ATTR)});`
    + `h.setAttribute("data-theme-mode",modo);`
    + `h.setAttribute("data-material",mat);`
    // COR — dois caminhos, e só um deles vale por vez. Nome da grade vira
    // atributo (o hex fica na folha); cor livre vai inline. Escrever os dois
    // deixaria o inline vencendo para sempre e o atalho da grade mudo.
    + `var G=${JSON.stringify(CORES.map(c => c.key))};`
    + `if(G.indexOf(cor)>=0){h.setAttribute("data-cor",cor);h.style.removeProperty("--hbx-cor");}`
    + `else if(/^#[0-9a-fA-F]{6}$/.test(cor||"")){h.removeAttribute("data-cor");h.style.setProperty("--hbx-cor",cor);}`
    // Sem escolha válida: nenhum dos dois. O padrão de fábrica é a declaração
    // que já está em theme-gerado.css — o boot não repete o valor.
    + `else{h.removeAttribute("data-cor");h.style.removeProperty("--hbx-cor");}`
    // Densidade entra no MESMO boot inline que a pele, e pelo mesmo motivo:
    // ela muda altura de linha, e altura de linha aplicada depois do primeiro
    // paint é a tela pulando na cara do usuário a cada carregamento.
    + `var dens=g(${JSON.stringify(DENSIDADE_STORAGE)});`
    + `if(dens==="compacta"||dens==="normal"||dens==="folgada"){h.setAttribute("data-densidade",dens);}`
    + `else{h.removeAttribute("data-densidade");}`
    + `}catch(e){}})();`;
}
