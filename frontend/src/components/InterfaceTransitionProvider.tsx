"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { useHbxTheme } from "@/components/ThemeProvider";

const ENTER_READY_DELAY_MS = 24;
// Keep shutdown overlay visible long enough for full logout video
const EXIT_DURATION_MS = 5000;
const ROW_SNAP_PX = 18;
const SHUTDOWN_PARTICLE_COUNT = 72;
const NO_REVEAL_SELECTOR = '[data-ui-no-reveal="true"]';

const REVEAL_TARGET_SELECTOR = [
  ".app-topbar__summary",
  ".app-brand",
  ".wa-health-wrap",
  ".app-topbar__queueLabel",
  ".app-topbar__metaPill",
  ".app-topbar__dockChip",
  ".theme-switcher__trigger",
  ".theme-switcher__panel",
  ".theme-card",
  ".app-user__trigger",
  ".incoming-alert",
  ".shell-card",
  ".panel",
  ".card",
  ".stat-card",
  ".btn",
  ".field",
  ".badge",
  ".alert",
  ".msg-info",
  ".msg-error",
  ".page-overline",
  '[data-ui-slot="module-card"]',
].join(", ");

type InterfaceTransitionPhase = "boot" | "active" | "shutdown";

type InterfaceTransitionContextValue = {
  phase: InterfaceTransitionPhase;
  isShuttingDown: boolean;
  replayGlobalTransition: () => void;
  runGlobalShutdown: (task: () => void | Promise<void>) => Promise<void>;
};

type RevealCandidate = {
  element: HTMLElement;
  top: number;
  left: number;
  right: number;
  index: number;
};

type CSSVarStyle = React.CSSProperties & {
  "--i"?: number;
  "--spread-x"?: string;
  "--size"?: string;
  "--orbit-x"?: string;
  "--orbit-y"?: string;
  "--flare-x"?: string;
  "--flare-y"?: string;
  "--exit-x"?: string;
  "--exit-y"?: string;
  "--burst-x"?: string;
  "--burst-y"?: string;
};

function buildShutdownParticleStyle(index: number): CSSVarStyle {
  return {
    "--i": index,
    "--spread-x": `${(index * 37) % 100}%`,
    "--size": `${6 + (index % 5) * 2}px`,
    "--orbit-x": `${((index % 10) - 5) * 48}px`,
    "--orbit-y": `${((index % 8) - 4) * 36}px`,
    "--flare-x": `${((index % 11) - 6) * 86}px`,
    "--flare-y": `${((index % 9) - 4) * 92}px`,
    "--exit-x": `${((index % 13) - 6) * 132}px`,
    "--exit-y": `${((index % 10) - 5) * 132}px`,
    "--burst-x": `${((index % 2) * 2 - 1) * 80}px`,
    "--burst-y": `${-120 - (index % 7) * 18}px`,
  };
}

const InterfaceTransitionContext = React.createContext<InterfaceTransitionContextValue | null>(null);

function isVisibleElement(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  if (element.hidden) return false;

  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function compareByVisualOrder(left: RevealCandidate, right: RevealCandidate) {
  if (Math.abs(left.top - right.top) > ROW_SNAP_PX) {
    return left.top - right.top;
  }

  if (Math.abs(left.right - right.right) > 6) {
    return right.right - left.right;
  }

  if (Math.abs(left.left - right.left) > 6) {
    return right.left - left.left;
  }

  return left.index - right.index;
}

function isInsideNoRevealBoundary(node: Node | null) {
  if (!node) return false;
  const element = node instanceof Element ? node : node.parentElement;
  return Boolean(element?.closest(NO_REVEAL_SELECTOR));
}

export function InterfaceTransitionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const readyTimerRef = React.useRef<number | null>(null);
  const shutdownPromiseRef = React.useRef<Promise<void> | null>(null);
  const [phase, setPhase] = React.useState<InterfaceTransitionPhase>("boot");
  const { selection } = useHbxTheme();

  const applyRevealMap = React.useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>(REVEAL_TARGET_SELECTOR))
      .filter((element) => isVisibleElement(element) && !isInsideNoRevealBoundary(element))
      .map<RevealCandidate>((element, index) => {
        const rect = element.getBoundingClientRect();
        return {
          element,
          top: rect.top,
          left: rect.left,
          right: rect.right,
          index,
        };
      })
      .sort(compareByVisualOrder);

    const total = targets.length;
    root.style.setProperty("--ui-reveal-count", String(total));

    targets.forEach((target, index) => {
      target.element.dataset.uiReveal = "true";
      target.element.style.setProperty("--ui-reveal-order", String(index));
      target.element.style.setProperty("--ui-reveal-exit-order", String(Math.max(total - index - 1, 0)));
    });
  }, []);

  const scheduleRevealMap = React.useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
    }

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      applyRevealMap();
    });
  }, [applyRevealMap]);

  const startRevealCycle = React.useCallback(() => {
    if (shutdownPromiseRef.current) return;

    setPhase("boot");
    scheduleRevealMap();

    if (readyTimerRef.current !== null) {
      window.clearTimeout(readyTimerRef.current);
    }

    readyTimerRef.current = window.setTimeout(() => {
      scheduleRevealMap();
      setPhase("active");
    }, ENTER_READY_DELAY_MS);
  }, [scheduleRevealMap]);

  React.useEffect(() => {
    scheduleRevealMap();

    const handleResize = () => {
      scheduleRevealMap();
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [scheduleRevealMap]);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const observer = new MutationObserver((records) => {
      const shouldRefreshReveal = records.some((record) => {
        if (!isInsideNoRevealBoundary(record.target)) {
          return true;
        }

        return [...record.addedNodes, ...record.removedNodes].some(
          (node) => !isInsideNoRevealBoundary(node),
        );
      });

      if (!shouldRefreshReveal) {
        return;
      }

      scheduleRevealMap();
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, [scheduleRevealMap]);

  React.useEffect(() => {
    startRevealCycle();
    return () => {
      if (readyTimerRef.current !== null) {
        window.clearTimeout(readyTimerRef.current);
        readyTimerRef.current = null;
      }
    };
  }, [pathname, startRevealCycle]);

  const runGlobalShutdown = React.useCallback(
    async (task: () => void | Promise<void>) => {
      if (shutdownPromiseRef.current) {
        await shutdownPromiseRef.current;
        return;
      }

      setPhase("shutdown");
      scheduleRevealMap();

      const pending = new Promise<void>((resolve) => {
        window.setTimeout(resolve, EXIT_DURATION_MS);
      });

      shutdownPromiseRef.current = pending;

      try {
        await pending;
        await task();
      } finally {
        shutdownPromiseRef.current = null;
      }
    },
    [scheduleRevealMap],
  );

  const value = React.useMemo<InterfaceTransitionContextValue>(
    () => ({
      phase,
      isShuttingDown: phase === "shutdown",
      replayGlobalTransition: startRevealCycle,
      runGlobalShutdown,
    }),
    [phase, runGlobalShutdown, startRevealCycle],
  );

  return (
    <InterfaceTransitionContext.Provider value={value}>
      <div ref={rootRef} className="ui-orchestrator" data-ui-phase={phase}>
        {children}

        {phase === "shutdown" ? (
          <div className="ui-shutdown-overlay" data-ui-no-reveal="true">
            <div
              className="ui-shutdown-overlay__frame login-stage logout-stage"
              data-login-theme={selection.themeId}
              data-login-mode={selection.mode}
              data-login-state="success"
              data-login-video="on"
            >
              <div className="login-stage__grid" aria-hidden />

              <div className="login-video-layer" aria-hidden="true">
                <video
                  className="login-video-layer__clip login-video-layer__clip--auth"
                  src="/login-media/login-logout.mp4"
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="auto"
                  onCanPlay={(event) => {
                    event.currentTarget.play().catch(() => undefined);
                  }}
                />
                <div className="login-video-layer__veil" />
              </div>

              <div className="login-shell logout-shell">
                <section
                  className="login-card login-card--logout card"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <div className="login-card__chrome" aria-hidden />

                  <header className="login-card__header">
                    <div className="login-card__themeRow">
                      <div className="page-overline login-card__overline">Saída segura HBX</div>
                      <span className="login-card__modeBadge">{selection.mode === "dark" ? "Escuro" : "Claro"}</span>
                    </div>

                    <div className="login-card__brandBlock">
                      <div className="login-card__brandMark" aria-hidden>
                        <span className="login-card__brandMarkCore">HBX</span>
                      </div>
                      <div className="login-card__themeCopy">
                        <p className="login-card__themeLabel">Encerrando sessão</p>
                        <p className="login-card__themeHint">Aguarde enquanto finalizamos sua sessão com segurança.</p>
                      </div>
                    </div>

                    <h1 className="login-card__title">Até já.</h1>
                  </header>

                  <div className="msg-info">
                    <div className="text-sm">Obrigado por usar o sistema HBX. Estamos finalizando a sessão.</div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </InterfaceTransitionContext.Provider>
  );
}

export function useInterfaceTransition() {
  const context = React.useContext(InterfaceTransitionContext);
  if (!context) {
    throw new Error("useInterfaceTransition must be used inside InterfaceTransitionProvider.");
  }
  return context;
}
