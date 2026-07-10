"use client";

// ============================================================
// MOBILE-CASCA/W1 — MobileShell: a MOLDURA única do celular.
//
// Quando NÃO é mobile → devolve `children` PURO (desktop 100% intocado — a
// casca nunca monta, nenhuma classe .casca-* entra no DOM do desktop) + um
// overlay estático de boot que fica sempre invisível de verdade (ver BOOT
// abaixo — é CSS puro, não pesa nada visual/comportamental no desktop real).
//
// Quando é mobile e a rota é do grupo (app):
//   topo 1 linha (título) + SLOT de conteúdo (registry rota→tela, com transição
//   IR na troca de rota) + tab bar. Rota registrada → a tela; não registrada →
//   fallback central. /dashboard no mobile redireciona module-aware (W4
//   PR10072026): vendas acessível → /vendas; só-logística → /entrega; senão a
//   primeira aba visível da tab bar (fallback /empresas) — mata o /vendas-403
//   do entregador só-logística.
//
// /master e /entrega têm chrome próprio (o AppShell já passa /master direto; o
// /entrega vive FORA do grupo (app), então nem chega aqui). Este shell é
// montado DENTRO do AppShell (que já pulou /master).
// ============================================================

import { usePathname, useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { useCurrentUser, useEntitlements, useMyModules } from "@/components/hbx/shell";
import { CASCA_BOOT_ATTR, QUERY as CASCA_MOBILE_QUERY, useCascaMobile } from "@/lib/casca-mobile";
import { dismissCascaToast } from "@/lib/casca-toast";
import { soLogistica } from "@/lib/so-logistica";

import { CascaFallback } from "./fallback";
import { HbxMarkViva } from "./hbx-mark";
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
// Limiares (afrouxados 07/07, dono: "não está dando certo arrastar em todos"):
// dispara com |dx| ≥ SWIPE_MIN_PX (~52px) E ângulo horizontal (|dx| > 1.4×|dy|
// — o 2× antigo exigia gesto de régua e falhava no dedão real). Nunca rouba o
// scroll vertical: a decisão só acontece depois de 10px E com o ângulo claro;
// vertical/ambíguo deixa a lista rolar. Solto aquém do limiar → volta ao lugar
// (is-snapping, transition CSS). Na PONTA do ciclo (primeira/última aba) o
// arrasto vira borracha (0.35×) — o dedo sente que ali não tem próxima tela.
//
// Bloqueios: (1) uma camada empilhada (CascaView) ou sheet (CascaSheet) aberta
// por cima — checado via querySelector nos containers fixos delas; (2) alvo do
// gesto dentro de elemento com scroll/gesto horizontal próprio — checado por
// closest("[data-swipe-opt-out]") OU por um ancestral scrollável em X
// (scrollWidth > clientWidth), ex.: o carrossel de cards do modo foco.
// ============================================================
const SWIPE_MIN_PX = 52;
const SWIPE_EDGE_DAMP = 0.35;

// /leads é alias de /vendas (registry: mesma tela) — pro swipe e pra direção
// da transição, conta como a aba Vendas.
function normalizeTabPath(pathname: string): string {
  return pathname === "/leads" ? "/vendas" : pathname;
}

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

function useModuleSwipe(pathname: string, hrefs: string[]) {
  const router = useRouter();
  const [drag, setDrag] = useState(0); // px de deslocamento em tempo real (feedback)
  const [snapping, setSnapping] = useState(false); // true = voltando ao lugar (transição)
  const start = useRef<{ x: number; y: number; el: Element | null } | null>(null);
  const active = useRef(false); // já decidiu que é gesto horizontal (não é mais scroll vertical)
  const idx = hrefs.indexOf(normalizeTabPath(pathname));

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
      if (Math.abs(dx) < 10) return;
      if (Math.abs(dx) <= Math.abs(dy) * 1.4) return; // ambíguo/vertical → deixa o scroll da lista agir
      if (hasOverlayOpen() || isHorizontalScrollAncestor(start.current.el)) {
        start.current = null; // opt-out: nunca mais decide neste gesto
        return;
      }
      active.current = true;
    }
    // PONTA do ciclo (ou rota fora das abas): borracha — anda 0.35× do dedo
    const atEdge = idx === -1 || (dx > 0 && idx === 0) || (dx < 0 && idx === hrefs.length - 1);
    setDrag(atEdge ? dx * SWIPE_EDGE_DAMP : dx);
  }, [idx, hrefs.length]);

  const endSwipe = useCallback(() => {
    if (!start.current || !active.current) {
      start.current = null;
      active.current = false;
      return;
    }
    const dx = drag;
    start.current = null;
    active.current = false;

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
  }, [drag, hrefs, idx, router]);

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

// Palco animado (REVISÃO 07/07, dono: "quero transição em TUDO... sem graça"):
// a cada troca de rota o palco mantém a tela ANTERIOR viva por um ciclo de
// animação (casca-view--leave) enquanto a nova entra (casca-view--enter) — o
// par anda junto, nada some seco. A DIREÇÃO é real: destino à direita na ordem
// das abas = IR (desliza ←); à esquerda = VOLTAR (desliza →, classe is-back).
// A camada que sai preserva a instância React (key = pathname antigo), então
// ela sai mostrando o estado que estava na tela — não remonta, não pisca
// loader. animationend solta a camada; timeout de 600ms é o cinto de segurança
// (aba em background não toca animação).
// FIX5: pointer handlers no próprio palco resolvem o swipe entre abas — o
// deslocamento (--casca-swipe-drag) dá o feedback barato (translateX via CSS,
// sem re-layout); soltar dispara router.push (a transição direcional acima
// cuida do resto) ou volta ao lugar (classe is-snapping, transition do CSS).
function CascaStage({ pathname }: { pathname: string }) {
  const hrefs = useSwipeableTabHrefs();
  const swipe = useModuleSwipe(pathname, hrefs);

  // cena = tela atual + (durante a transição) a anterior saindo + direção
  const [scene, setScene] = useState<{ cur: string; prev: string | null; back: boolean }>(
    { cur: pathname, prev: null, back: false },
  );
  if (scene.cur !== pathname) {
    // derivação em render (padrão React de estado derivado de prop)
    const from = hrefs.indexOf(normalizeTabPath(scene.cur));
    const to = hrefs.indexOf(normalizeTabPath(pathname));
    setScene({ cur: pathname, prev: scene.cur, back: from !== -1 && to !== -1 && to < from });
  }
  const clearPrev = useCallback(() => {
    setScene((s) => (s.prev ? { ...s, prev: null } : s));
  }, []);
  // animationend BORBULHA — só solta a camada quando é a animação DELA
  // (casca-view-out*), não a de um filho (linha de lista entrando etc.).
  const onLeaveEnd = useCallback((e: React.AnimationEvent) => {
    if (e.target === e.currentTarget) clearPrev();
  }, [clearPrev]);
  useEffect(() => {
    if (!scene.prev) return;
    const t = window.setTimeout(clearPrev, 600);
    return () => window.clearTimeout(t);
  }, [scene.prev, clearPrev]);

  const dir = scene.back ? " is-back" : "";
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
      {scene.prev ? (
        <div
          className={"casca-view casca-view--leave" + dir}
          key={scene.prev}
          aria-hidden
          onAnimationEnd={onLeaveEnd}
        >
          {renderCascaScreen(scene.prev) ?? <CascaFallback title={titleFor(scene.prev)} />}
        </div>
      ) : null}
      <div className={"casca-view casca-view--enter" + dir} key={scene.cur}>
        {renderCascaScreen(pathname) ?? <CascaFallback title={titleFor(pathname)} />}
      </div>
    </div>
  );
}

export function MobileShell({ children }: { children: React.ReactNode }) {
  const isMobile = useCascaMobile();
  const pathname = usePathname() || "";
  const router = useRouter();

  // BOOT (07/07, queixa do dono: reload no celular piscava a sidebar desktop
  // antes da casca aparecer) — o gate de verdade é por CSS puro e roda ANTES
  // do 1º paint (script + <style> em layout.tsx, mesmo padrão do THEME_BOOT,
  // lendo matchMedia direto — não espera o React hidratar; ver nota BOOT em
  // casca-mobile.ts). Este efeito só MANTÉM <html data-casca-boot> em
  // sincronia depois do boot inicial (resize/rotate). Lê matchMedia FRESCO
  // (não o `isMobile` deste render): durante a correção pós-hidratação esse
  // efeito roda 1 volta ANTES do isMobile virar true (efeito passivo do
  // useSyncExternalStore roda depois do nosso, useCascaMobile é chamado
  // primeiro) — se confiasse no `isMobile` capturado aqui, reabriria a janela
  // de flash que o CSS pré-hidratação já fechou.
  useEffect(() => {
    const real = typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia(CASCA_MOBILE_QUERY).matches
      : isMobile;
    document.documentElement.setAttribute(CASCA_BOOT_ATTR, real ? "mobile" : "desktop");
  }, [isMobile]);

  // 1º paint mobile depois que isMobile confirma (ordem do dono: "colocar
  // sempre o carregando primeiro HBX") — o commit em que a casca nasce NUNCA
  // mostra a tela real crua; 1 frame depois libera pra tela de verdade. Não
  // reseta por navegação (troca de rota usa a transição normal do
  // CascaStage/casca-view, não o loader cheio de novo). requestAnimationFrame
  // (não setState direto no corpo do efeito — react-hooks/set-state-in-effect)
  // garante que o loader pintou pelo menos 1 frame antes de trocar.
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    if (!isMobile || booted) return;
    const raf = requestAnimationFrame(() => setBooted(true));
    return () => cancelAnimationFrame(raf);
  }, [isMobile, booted]);

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

  // DESKTOP (e SSR, e a 1ª passada de hidratação no celular — coberta pelo CSS
  // de boot, não por este `if`): children puro + o overlay estático de boot.
  // No desktop de VERDADE o overlay fica sempre invisível (CSS só mostra sob
  // html[data-casca-boot="mobile"]) — zero mudança visual, zero timer (a
  // CascaLoading com `immediate` não agenda nada). A casca nunca monta fora do
  // celular — LEI: desktop 100% intocado.
  if (!isMobile) {
    return (
      <>
        <div className="casca-boot-loading"><CascaLoading immediate /></div>
        {children}
      </>
    );
  }

  // Enquanto o redirect do /dashboard não resolve, evita piscar o fallback.
  const redirecting = pathname === "/dashboard";

  return (
    <div className="casca">
      <div className="casca-top">
        {/* marca »HBX viva no lugar do título (dono 07/07: a tab bar já diz
            onde você está); o título fica só pra leitor de tela */}
        <h1 className="casca-top__title hbx-sr-only">{titleFor(pathname)}</h1>
        <HbxMarkViva />
      </div>
      {(!booted || redirecting) ? (
        <div className="casca-stage"><CascaLoading immediate={!booted} /></div>
      ) : (
        <CascaStage pathname={pathname} />
      )}
      <CascaTabBar />
      <CascaToastHost />
    </div>
  );
}
