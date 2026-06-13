"use client";

// Regra geral de navegação (ordem do dono, 13/06/2026): a aba/seção ativa de
// QUALQUER tela é estado de NAVEGAÇÃO, não estado volátil de componente — então
// vive na URL (?key=valor), nunca só em useState. Assim a tela "lembra" onde
// você está depois de remount, F5, voltar/avançar do browser ou recarga em
// volta de uma ação (ex.: excluir um membro na Equipe e CONTINUAR na Equipe,
// em vez de cair na primeira aba).
//
// Hook ÚNICO e CENTRAL (Lei 2 do design system): toda tela troca o seu
// useState de aba por useTabParam (string) ou useTabIndex (índice). Não é
// visual, não é tema — puro estado de navegação refletido na URL.
//
// Build-safe de propósito: NÃO usa useSearchParams (que exigiria Suspense no
// build do Next 16). Lê window.location.search e escreve com
// history.replaceState (atualiza a URL sem navegação/remount). Inicializa no
// default para casar com o SSR (sem hydration mismatch) e corrige a partir da
// URL num efeito de mount.

import { useCallback, useEffect, useState } from "react";

function readParam(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return new URLSearchParams(window.location.search).get(key);
  } catch {
    return null;
  }
}

function writeParam(key: string, value: string, fallback: string) {
  if (typeof window === "undefined") return;
  try {
    const params = new URLSearchParams(window.location.search);
    // valor == default → tira o param (URL limpa; "estar no default" não suja a URL)
    if (value === fallback) params.delete(key);
    else params.set(key, value);
    const qs = params.toString();
    const url = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
    window.history.replaceState(window.history.state, "", url);
  } catch {
    /* sem history — o estado segue só em memória */
  }
}

// Aba/seção por string (ex.: "Equipe", "list"/"board", "empresas").
// allowed (opcional) protege contra URL adulterada: valor fora da lista cai no default.
export function useTabParam<T extends string>(
  key: string,
  fallback: T,
  allowed?: readonly T[],
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(fallback);

  // mount: corrige a partir da URL; segue também voltar/avançar do browser
  useEffect(() => {
    const sync = () => {
      const raw = readParam(key);
      if (raw != null && (!allowed || (allowed as readonly string[]).includes(raw))) {
        setValue(raw as T);
      } else {
        setValue(fallback);
      }
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
    // fallback/allowed são constantes por tela; a key identifica o param.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback((next: T) => {
    setValue(next);
    writeParam(key, next, fallback);
  }, [key, fallback]);

  return [value, set];
}

// Aba por índice numérico (ex.: tab = 0,1,2). Mesmo contrato, serializa na URL.
export function useTabIndex(key: string, fallback = 0): [number, (next: number) => void] {
  const [raw, setRaw] = useTabParam(key, String(fallback));
  const n = Number.parseInt(raw, 10);
  const idx = Number.isFinite(n) && n >= 0 ? n : fallback;
  const set = useCallback((next: number) => setRaw(String(next)), [setRaw]);
  return [idx, set];
}
