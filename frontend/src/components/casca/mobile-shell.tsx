"use client";

// ============================================================
// MOBILE-CASCA/W1 — MobileShell: a MOLDURA única do celular.
//
// Quando NÃO é mobile → devolve `children` PURO (desktop 100% intocado — a
// casca nunca monta, nenhuma classe .casca-* entra no DOM do desktop).
//
// Quando é mobile e a rota é do grupo (app):
//   topo 1 linha (título) + SLOT de conteúdo (registry rota→tela, com transição
//   IR na troca de rota) + tab bar. Rota registrada → a tela; não registrada →
//   fallback central. /dashboard no mobile redireciona pra /vendas.
//
// /master e /entrega têm chrome próprio (o AppShell já passa /master direto; o
// /entrega vive FORA do grupo (app), então nem chega aqui). Este shell é
// montado DENTRO do AppShell (que já pulou /master).
// ============================================================

import { usePathname, useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { useCurrentUser, useEntitlements, useMyModules } from "@/components/hbx/shell";
import { useCascaMobile } from "@/lib/casca-mobile";
import { dismissCascaToast } from "@/lib/casca-toast";

import { CascaFallback } from "./fallback";
import { CascaLoading } from "./loading";
import { CASCA_TABS, CascaTabBar, isCascaTabVisible } from "./tab-bar";
import { CascaToastHost } from "./toast-host";
import { CASCA_TITLES, renderCascaScreen } from "./registry";

// Título do topo: registry tem prioridade; senão um de-para mínimo (o AppShell
// tem o META completo, mas não o exporta — mantemos o que a casca conhece).
const TITLE_FALLBACK: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/agenda": "Agenda",
  "/automacoes": "Automações",
  "/contatos": "Contatos",
  "/produtos": "Produtos",
  "/logistica": "Logística",
  "/bot": "Bot",
  "/assistente": "Assistente IA",
  "/relatorios": "Relatórios",
  "/configuracoes": "Configurações",
  "/gerencial": "Gerencial",
};

function titleFor(pathname: string): string {
  return CASCA_TITLES[pathname] || TITLE_FALLBACK[pathname] || "HBX";
}

// ============================================================
// FIX5 — SWIPE horizontal entre ABAS do app central (Vendas ↔ Conversas ↔
// Empresas).
//
// Fonte única da ordem: CASCA_TABS (tab-bar.tsx) filtrado por
// isCascaTabVisible (mesmo gate isModuleVisible da tab bar — zero duplicação).
// "Mais" NUNCA é destino de swipe (abre sheet, não é aba-tela) e "Rota"
// TAMBÉM não (é OUTRO app, /entrega, casca própria — regra do dono: entrada
// só pelo toque deliberado no ícone); o ciclo para na última tela central.
//
// Limiares: dispara só com |dx| ≥ SWIPE_MIN_PX (~64px) E ângulo claramente
// horizontal (|dx| > 2×|dy|) — nunca rouba o scroll vertical da lista. Solto
// aquém do limiar → volta ao lugar (a própria troca de `drag` para 0 anima via
// transition do CSS, sem key remount).
//
// Bloqueios: (1) uma camada empilhada (CascaView) ou sheet (CascaSheet) aberta
// por cima — checado via querySelector nos containers fixos delas; (2) alvo do
// gesto dentro de elemento com scroll/gesto horizontal próprio — checado por
// closest("[data-swipe-opt-out]") OU por um ancestral scrollável em X
// (scrollWidth > clientWidth), ex.: o carrossel de cards do modo foco.
// ============================================================
const SWIPE_MIN_PX = 64;

function hasOverlayOpen(): boolean {
  if (typeof document === "undefined") return false;
  return !!document.querySelector(".casca-stack-layer, .casca-sheet-veil");
}

function isHorizontalScrollAncestor(el: Element | null): boolean {
  let node: Element | null = el;
  while (node && node !== document.body) {
    if (node.hasAttribute?.("data-swipe-opt-out")) return true;
    if (node instanceof HTMLElement) {
      const style = window.getComputedStyle(node);
      const scrollsX = (style.overflowX === "auto" || style.overflowX === "scroll") && node.scrollWidth > node.clientWidth + 1;
      if (scrollsX) return true;
    }
    node = node.parentElement;
  }
  return false;
}

/**
 * Ordem visível das abas-tela DO APP CENTRAL (exclui "mais", que abre sheet,
 * e "rota", que é outro app /entrega com casca própria — entrada só pelo
 * toque no ícone; o ciclo de swipe para na última tela central).
 */
function useSwipeableTabHrefs(): string[] {
  const user = useCurrentUser();
  const ent = useEntitlements();
  const mods = useMyModules();
  return CASCA_TABS
    .filter((t) => t.key !== "mais" && t.key !== "rota" && isCascaTabVisible(t, ent, user, mods))
    .map((t) => t.href);
}

function useModuleSwipe(pathname: string) {
  const router = useRouter();
  const hrefs = useSwipeableTabHrefs();
  const [drag, setDrag] = useState(0); // px de deslocamento em tempo real (feedback)
  const [snapping, setSnapping] = useState(false); // true = voltando ao lugar (transição)
  const start = useRef<{ x: number; y: number; el: Element | null } | null>(null);
  const active = useRef(false); // já decidiu que é gesto horizontal (não é mais scroll vertical)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.buttons !== 1) return;
    start.current = { x: e.clientX, y: e.clientY, el: e.target as Element };
    active.current = false;
    setSnapping(false);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (!active.current) {
      // ainda indeciso: só assume horizontal quando o ângulo é claro E já
      // moveu o suficiente pra não ser ruído de toque.
      if (Math.abs(dx) < 12) return;
      if (Math.abs(dx) <= Math.abs(dy) * 2) return; // ambíguo/vertical → deixa o scroll da lista agir
      if (hasOverlayOpen() || isHorizontalScrollAncestor(start.current.el)) {
        start.current = null; // opt-out: nunca mais decide neste gesto
        return;
      }
      active.current = true;
    }
    setDrag(dx);
  }, []);

  const endSwipe = useCallback(() => {
    if (!start.current || !active.current) {
      start.current = null;
      active.current = false;
      return;
    }
    const dx = drag;
    start.current = null;
    active.current = false;

    const idx = hrefs.indexOf(pathname);
    if (Math.abs(dx) >= SWIPE_MIN_PX && idx !== -1) {
      if (dx < 0 && idx < hrefs.length - 1) {
        setDrag(0);
        router.push(hrefs[idx + 1]); // esquerda = próxima aba (IR)
        return;
      }
      if (dx > 0 && idx > 0) {
        setDrag(0);
        router.push(hrefs[idx - 1]); // direita = anterior (VOLTAR)
        return;
      }
    }
    // aquém do limiar (ou ponta do ciclo) → volta ao lugar com transição
    setSnapping(true);
    setDrag(0);
  }, [drag, hrefs, pathname, router]);

  return {
    drag,
    snapping,
    onPointerDown,
    onPointerMove,
    onPointerUp: endSwipe,
    onPointerCancel: endSwipe,
    onTransitionEnd: () => setSnapping(false),
  };
}

// Palco animado: remonta a cada troca de rota (key=pathname) e toca a transição
// IR (desliza da direita). O VOLTAR de sub-telas é do CascaView (sub-camada).
// FIX5: pointer handlers no próprio palco resolvem o swipe entre abas — o
// deslocamento (--casca-swipe-drag) dá o feedback barato (translateX via CSS,
// sem re-layout); soltar dispara router.push (a MobileShell reage ao pathname
// e a transição IR/VOLTAR de tela cuida do resto) ou volta ao lugar (classe
// is-snapping, transition do CSS).
function CascaStage({ pathname }: { pathname: string }) {
  const screen = renderCascaScreen(pathname);
  const swipe = useModuleSwipe(pathname);
  const style = swipe.drag !== 0 ? ({ "--casca-swipe-drag": `${swipe.drag}px` } as React.CSSProperties) : undefined;
  return (
    <div
      className={"casca-stage" + (swipe.snapping ? " is-snapping" : "")}
      style={style}
      onPointerDown={swipe.onPointerDown}
      onPointerMove={swipe.onPointerMove}
      onPointerUp={swipe.onPointerUp}
      onPointerCancel={swipe.onPointerCancel}
      onTransitionEnd={swipe.onTransitionEnd}
    >
      <div className="casca-view casca-view--enter" key={pathname}>
        {screen ?? <CascaFallback title={titleFor(pathname)} />}
      </div>
    </div>
  );
}

export function MobileShell({ children }: { children: React.ReactNode }) {
  const isMobile = useCascaMobile();
  const pathname = usePathname() || "";
  const router = useRouter();

  // Redirect mobile /dashboard → /vendas (a aba inicial do celular é Vendas).
  useEffect(() => {
    if (isMobile && pathname === "/dashboard") router.replace("/vendas");
  }, [isMobile, pathname, router]);

  // Fecha qualquer toast pendente ao trocar de rota (não arrasta aviso de uma
  // tela pra outra).
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      dismissCascaToast();
    }
  }, [pathname]);

  // DESKTOP (e SSR): children puro. A casca não existe fora do celular.
  if (!isMobile) return <>{children}</>;

  // Enquanto o redirect do /dashboard não resolve, evita piscar o fallback.
  const redirecting = pathname === "/dashboard";

  return (
    <div className="casca">
      <div className="casca-top">
        <h1 className="casca-top__title">{titleFor(pathname)}</h1>
      </div>
      {redirecting ? (
        <div className="casca-stage"><CascaLoading /></div>
      ) : (
        <CascaStage pathname={pathname} />
      )}
      <CascaTabBar />
      <CascaToastHost />
    </div>
  );
}
