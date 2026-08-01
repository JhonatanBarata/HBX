"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { HbxMotionRuntime } from "@/components/hbx/motion";
import {
  CASCA_PADRAO, CASCA_STORAGE, CASCAS, DENSIDADE_STORAGE, LEGACY_PELE_STORAGE, MODE_STORAGE, TEMA_STORAGE,
  resolveDensidade, type DensidadeKey,
  getCasca, resolveModo, resolveTema, temaDoLegado,
  type CascaDef, type CascaKey, type Modo, type TemaKey,
} from "@/lib/aparencia";

// ================================================================
// APARÊNCIA — aplicação (o CONTRATO mora em lib/aparencia.ts).
// Aqui só o que precisa do navegador: ler storage, escrever no <html>,
// migrar o formato antigo e animar a troca.
//
// AS 5 LEIS seguem valendo: tema = arquivo theme-<key>.css (tokens) +
// entrada no registro + import no globals.css. A CASCA é a camada de
// cima — casca-<key>.css veste a MESMA estrutura com outra densidade
// e outra superfície. Nenhuma tela sabe qual casca está ativa.
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

export type Aparencia = { casca: CascaDef; tema: TemaKey; modo: Modo };

function ler(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function gravar(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* sem storage */ }
}

/**
 * O que está escolhido (não necessariamente o que está aplicado — a casca
 * pode não suportar o tema/modo guardado; ver `aplicar`).
 */
export function getAparencia(): Aparencia {
  let cascaKey = ler(CASCA_STORAGE);
  let temaSalvo = ler(TEMA_STORAGE);

  // Migração do valor combinado antigo (`hbx:pele = "aurora-mod"`). Roda uma
  // vez: depois de gravar os eixos separados a chave velha é APAGADA.
  if (!cascaKey) {
    const legado = ler(LEGACY_PELE_STORAGE);
    if (legado) {
      const tema = temaDoLegado(legado);
      cascaKey = CASCA_PADRAO;
      if (tema && !temaSalvo) temaSalvo = tema;
      gravar(CASCA_STORAGE, cascaKey);
      if (temaSalvo) gravar(TEMA_STORAGE, temaSalvo);
      try { localStorage.removeItem(LEGACY_PELE_STORAGE); } catch { /* sem storage */ }
    }
  }

  const casca = getCasca(cascaKey);
  return {
    casca,
    tema: resolveTema(casca, temaSalvo),
    modo: resolveModo(casca, ler(MODE_STORAGE)),
  };
}

/** Escreve os 3 atributos no <html>. Escrita ÚNICA de aparência do app. */
function aplicar({ casca, tema, modo }: Aparencia) {
  const html = document.documentElement;
  html.setAttribute("data-casca", casca.attr);
  html.setAttribute("data-theme", tema);
  html.setAttribute("data-theme-mode", modo);
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
export function setAparencia(casca: CascaKey, tema: TemaKey, modo: Modo) {
  applyCascaChange(casca, () => {
    gravar(CASCA_STORAGE, casca);
    gravar(TEMA_STORAGE, tema);
    gravar(MODE_STORAGE, modo);
    aplicar(getAparencia());
  });
}

/** Troca o TEMA de cor (só faz sentido em casca que escolhe tema). */
export function setTema(key: TemaKey) {
  applyThemeSoft(() => {
    gravar(TEMA_STORAGE, key);
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

/** Tema ativo lido do DOM. */
export function getTemaAtivo(): TemaKey {
  return (document.documentElement.getAttribute("data-theme") as TemaKey) || "login";
}

export function ThemeAttributes() {
  const pathname = usePathname();
  useEffect(() => {
    applyThemeForPath(pathname || "/");
  }, [pathname]);
  return <HbxMotionRuntime />;
}
