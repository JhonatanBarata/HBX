"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { HbxMotionRuntime } from "@/components/hbx/motion";
import {
  CASCA_PADRAO, CASCA_STORAGE, CASCAS, COR_PADRAO, COR_STORAGE, DENSIDADE_STORAGE,
  LEGACY_PELE_STORAGE, LEGACY_TEMA_STORAGE, MATERIAL_STORAGE, MODE_STORAGE, TEMA_ATTR,
  classificarCor, corDoLegado, normalizarHex, resolveDensidade, type DensidadeKey,
  getCasca, resolveMaterial, resolveMaterialEscolhido, resolveModo,
  type CascaDef, type CascaKey, type MaterialKey, type Modo,
} from "@/lib/aparencia";

// ================================================================
// APARÊNCIA — aplicação (o CONTRATO mora em lib/aparencia.ts).
// Aqui só o que precisa do navegador: ler storage, escrever no <html>,
// migrar o formato antigo e animar a troca.
//
// AS 5 LEIS seguem valendo. Desde 03/08 a COR não é mais um arquivo por
// pele: é UMA semente (`--hbx-cor`) que theme-gerado.css transforma nos
// ~60 tokens, em OKLCH, com a claridade cravada na folha. A CASCA é a
// camada de cima — casca-<key>.css veste a MESMA estrutura com outra
// densidade e geometria — e o MATERIAL (vidro/chapado) é o quarto eixo,
// em material.css. Nenhuma tela sabe qual dos quatro está ativo.
//
// O boot inline do layout.tsx é GERADO do mesmo registro
// (buildAparenciaBoot) — não existe mais lista duplicada pra sair de
// sincronia.
//
// REGRA DA MEMÓRIA (dono 28/07): a escolha Premium NUNCA é apagada por
// entrar na Corporativa. Só gravamos o que o usuário ESCOLHE; o valor
// aplicado é resolvido na hora contra as capacidades da casca. Quem
// estava em Aurora escuro, entra na Corporativa e volta, acha Aurora
// escuro do jeito que deixou.
// ================================================================

/** `cor` = nome da grade OU hex livre. `null` = padrão de fábrica da folha. */
export type Aparencia = { casca: CascaDef; cor: string | null; modo: Modo; material: MaterialKey };

function ler(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function gravar(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* sem storage */ }
}
function apagar(key: string) {
  try { localStorage.removeItem(key); } catch { /* sem storage */ }
}

/**
 * O que está escolhido (não necessariamente o que está aplicado — a casca
 * pode não suportar o modo guardado; ver `aplicar`).
 */
export function getAparencia(): Aparencia {
  let cascaKey = ler(CASCA_STORAGE);
  let corSalva = ler(COR_STORAGE);

  // Migração do valor combinado antigo (`hbx:pele = "aurora-mod"`). Roda uma
  // vez: depois de gravar os eixos separados a chave velha é APAGADA.
  if (!cascaKey) {
    const legado = ler(LEGACY_PELE_STORAGE);
    if (legado) {
      cascaKey = CASCA_PADRAO;
      gravar(CASCA_STORAGE, cascaKey);
      apagar(LEGACY_PELE_STORAGE);
    }
  }

  // Migração das 6 cores fixas (`hbx:tema = "ember"` → `hbx:cor = "laranja"`).
  // Mesma queda macia de sempre: chave que não existe mais não quebra tela,
  // vira o tom mais próximo da grade.
  if (!corSalva) {
    const antigo = ler(LEGACY_TEMA_STORAGE) ?? ler(LEGACY_PELE_STORAGE);
    const cor = corDoLegado(antigo);
    if (cor) {
      corSalva = cor;
      gravar(COR_STORAGE, cor);
    }
    if (antigo) apagar(LEGACY_TEMA_STORAGE);
  }

  const casca = getCasca(cascaKey);
  return {
    casca,
    cor: classificarCor(corSalva) ? corSalva : null,
    modo: resolveModo(casca, ler(MODE_STORAGE)),
    material: resolveMaterial(casca, ler(MATERIAL_STORAGE)),
  };
}

/**
 * Escreve os atributos no <html>. Escrita ÚNICA de aparência do app.
 *
 * A COR tem dois caminhos e só um vale por vez: nome da grade vira
 * `data-cor` (o hex mora na folha) e cor livre vai em `--hbx-cor` inline.
 * Escrever os dois deixaria o inline vencendo para sempre — o atalho da grade
 * ficaria mudo e ninguém entenderia por quê. Por isso cada ramo LIMPA o outro.
 */
function aplicar({ casca, cor, modo, material }: Aparencia) {
  const html = document.documentElement;
  html.setAttribute("data-casca", casca.attr);
  html.setAttribute("data-theme", TEMA_ATTR);
  html.setAttribute("data-theme-mode", modo);
  html.setAttribute("data-material", material);

  const escolha = classificarCor(cor);
  if (escolha?.tipo === "grade") {
    html.setAttribute("data-cor", escolha.key);
    html.style.removeProperty("--hbx-cor");
  } else if (escolha?.tipo === "livre") {
    html.removeAttribute("data-cor");
    html.style.setProperty("--hbx-cor", escolha.hex);
  } else {
    html.removeAttribute("data-cor");
    html.style.removeProperty("--hbx-cor");
  }
}

export function applyThemeForPath(_pathname: string) {
  void _pathname;
  // 15/06: a landing "/" agora É o login (usa tokens + robô do tema), então
  // NÃO é mais "html puro" — herda data-theme + data-theme-mode como o resto,
  // senão a Automação não sincroniza com o modo (fumaça branca sobre robô preto).
  try {
    aplicar(getAparencia());
  } catch {
    document.documentElement.setAttribute("data-theme-mode", "light");
  }
}

// Troca com cross-fade suave (classe temporária que se remove sozinha).
type ThemeTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => {
    finished: Promise<void>;
    // O navegador expõe MAIS promessas além de `finished` — e elas rejeitam
    // sozinhas quando a transição é abortada (ex.: clicar no sol/lua duas
    // vezes seguidas). Precisam de catch, ver applyThemeSoft.
    ready?: Promise<void>;
    updateCallbackDone?: Promise<void>;
  };
};

let themeAnimTimer: number | null = null;
let themeAnimRun = 0;

export function applyThemeSoft(mutate: () => void) {
  const html = document.documentElement;
  const run = ++themeAnimRun;
  html.classList.add("hbx-theme-anim");
  if (themeAnimTimer !== null) window.clearTimeout(themeAnimTimer);

  const finish = () => {
    if (run !== themeAnimRun) return;
    themeAnimTimer = window.setTimeout(() => {
      if (run !== themeAnimRun) return;
      html.classList.remove("hbx-theme-anim");
      themeAnimTimer = null;
    }, 100);
  };

  const startViewTransition = (document as ThemeTransitionDocument).startViewTransition;
  if (typeof startViewTransition === "function") {
    const transition = startViewTransition.call(document, mutate);
    // `ready` e `updateCallbackDone` REJEITAM quando o navegador aborta a
    // transição ("Transition was aborted because of invalid state" — acontece
    // ao trocar de tema duas vezes rápido, ou com outra transição em curso).
    // Sem catch isso vira unhandledrejection e o pop-up global de erro abre na
    // cara do usuário por causa de um cross-fade — o tema TROCOU, não houve
    // falha nenhuma. Abortar é resultado esperado aqui: só encerra a animação.
    transition.ready?.catch(finish);
    transition.updateCallbackDone?.catch(finish);
    void transition.finished.then(finish, finish);
    return;
  }

  mutate();
  themeAnimTimer = window.setTimeout(() => {
    html.classList.remove("hbx-theme-anim");
    themeAnimTimer = null;
  }, 2300);
}

// ---- Trocas (sempre na MESMA tela: nenhuma delas navega ou recarrega) ----

/**
 * O Corporativo é deliberadamente instantâneo. Entrar nele ou sair dele não
 * pode herdar o cross-fade da casca anterior.
 */
function applyCascaChange(next: CascaKey, mutate: () => void) {
  if (next === "corporativa" || getCascaAtiva() === "corporativa") {
    if (themeAnimTimer !== null) window.clearTimeout(themeAnimTimer);
    themeAnimTimer = null;
    themeAnimRun += 1;
    document.documentElement.classList.remove("hbx-theme-anim");
    mutate();
    return;
  }
  applyThemeSoft(mutate);
}

/** Troca a CASCA. Preserva tema/modo escolhidos — ver REGRA DA MEMÓRIA. */
export function setCasca(key: CascaKey) {
  applyCascaChange(key, () => {
    gravar(CASCA_STORAGE, key);
    aplicar(getAparencia());
  });
}

/**
 * Aplica os TRÊS eixos de uma vez — é o botão "Aplicar" do menu Aparência
 * (dono 28/07: escolher no menu não muda nada; só o Aplicar muda).
 *
 * Uma chamada só, de propósito: chamar setCasca + setTema + setThemeMode em
 * sequência dispararia TRÊS cross-fades encavalados e a troca ficaria
 * tremida. Aqui grava os três e pinta uma vez.
 *
 * `getAparencia()` relê o storage e resolve contra as capacidades da casca,
 * então combinação impossível (ex.: escuro numa casca clara fixa) já entra
 * corrigida — a validação é do CONTRATO, não deste botão.
 */
export function setAparencia(casca: CascaKey, cor: string | null, modo: Modo, material: MaterialKey) {
  applyCascaChange(casca, () => {
    gravar(CASCA_STORAGE, casca);
    if (cor) gravar(COR_STORAGE, cor); else apagar(COR_STORAGE);
    gravar(MODE_STORAGE, modo);
    gravar(MATERIAL_STORAGE, material);
    aplicar(getAparencia());
  });
}

/** Troca só a COR — nome da grade ou hex livre; `null` volta pro padrão. */
export function setCor(valor: string | null) {
  applyThemeSoft(() => {
    if (valor) gravar(COR_STORAGE, valor); else apagar(COR_STORAGE);
    aplicar(getAparencia());
  });
}

/**
 * Escrita ÚNICA do material. `null` apaga a escolha e devolve o comando à
 * casca — o mesmo desenho da densidade, e pelo mesmo motivo: "sem
 * preferência" é um estado de verdade, não um terceiro valor inventado.
 */
export function setMaterial(key: MaterialKey | null) {
  applyThemeSoft(() => {
    if (key) gravar(MATERIAL_STORAGE, key); else apagar(MATERIAL_STORAGE);
    aplicar(getAparencia());
  });
}

/**
 * Escrita ÚNICA do modo claro/escuro. Continua "burra" de propósito: as telas
 * PÚBLICAS (login, /rota, tutorial externo, /entrega) têm o próprio botão de
 * claro/escuro e não vivem dentro de casca nenhuma. Quem clampa a Corporativa
 * em claro é o boot + o applyThemeForPath ao entrar no app.
 */
export function setThemeMode(mode: Modo) {
  document.documentElement.setAttribute("data-theme-mode", mode);
  gravar(MODE_STORAGE, mode);
}

/**
 * Escrita ÚNICA da densidade. `null` apaga a escolha e devolve o comando à
 * casca — "sem preferência" é um estado de verdade, não um terceiro valor
 * inventado no meio do caminho.
 */
export function setDensidade(key: DensidadeKey | null) {
  const html = document.documentElement;
  if (key) {
    html.setAttribute("data-densidade", key);
    gravar(DENSIDADE_STORAGE, key);
  } else {
    html.removeAttribute("data-densidade");
    try { window.localStorage.removeItem(DENSIDADE_STORAGE); } catch { /* sem storage */ }
  }
}

/** Densidade escolhida, ou `null` quando quem manda ainda é a casca. */
export function getDensidadeAtiva(): DensidadeKey | null {
  return resolveDensidade(document.documentElement.getAttribute("data-densidade"));
}

/** Casca ativa lida do DOM (fonte da verdade do que está na tela). */
export function getCascaAtiva(): CascaKey {
  const attr = document.documentElement.getAttribute("data-casca");
  return (CASCAS.find(c => c.attr === attr)?.key ?? CASCA_PADRAO);
}

/**
 * COR ativa lida do DOM — nome da grade, hex livre, ou `null` (fábrica).
 * O DOM é a fonte da verdade do que está NA TELA; o storage diz só o que foi
 * escolhido, e os dois divergem enquanto o rascunho do painel está aberto.
 */
export function getCorAtiva(): string | null {
  const html = document.documentElement;
  const grade = html.getAttribute("data-cor");
  if (grade) return grade;
  const livre = html.style.getPropertyValue("--hbx-cor").trim();
  return livre || null;
}

/**
 * O HEX de qualquer escolha — para o `<input type="color">`, que só fala hex.
 *
 * Cor livre já é hex. Nome da grade é resolvido LENDO `--cor-<key>` da folha,
 * porque é lá que os 17 tons moram (fiscal R2: cor literal não entra em .ts).
 * Ler do CSS também significa que o campo mostra o tom de verdade se algum dia
 * um deles for reajustado — não uma cópia que envelhece aqui dentro.
 */
export function hexDaCor(cor: string | null): string {
  const escolha = classificarCor(cor);
  if (escolha?.tipo === "livre") return escolha.hex;
  const key = escolha?.tipo === "grade" ? escolha.key : COR_PADRAO;
  const cs = getComputedStyle(document.documentElement);
  return normalizarHex(cs.getPropertyValue(`--cor-${key}`))
    ?? normalizarHex(cs.getPropertyValue(`--cor-${COR_PADRAO}`))
    ?? "#000000";
}

/** Material ativo lido do DOM. */
export function getMaterialAtivo(): MaterialKey {
  const attr = document.documentElement.getAttribute("data-material");
  return attr === "chapado" ? "chapado" : "vidro";
}

/** Só a ESCOLHA de material (`null` = quem manda é a casca). */
export function getMaterialEscolhido(): MaterialKey | null {
  return resolveMaterialEscolhido(ler(MATERIAL_STORAGE));
}

export function ThemeAttributes() {
  const pathname = usePathname();
  useEffect(() => {
    applyThemeForPath(pathname || "/");
  }, [pathname]);
  return <HbxMotionRuntime />;
}
