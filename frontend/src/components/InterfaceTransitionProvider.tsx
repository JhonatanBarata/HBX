"use client";

import React from "react";
import { usePathname } from "next/navigation";

const ENTER_READY_DELAY_MS = 34;
const EXIT_DURATION_MS = 560;
const ROW_SNAP_PX = 18;

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

export function InterfaceTransitionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const readyTimerRef = React.useRef<number | null>(null);
  const shutdownPromiseRef = React.useRef<Promise<void> | null>(null);
  const [phase, setPhase] = React.useState<InterfaceTransitionPhase>("boot");

  const applyRevealMap = React.useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>(REVEAL_TARGET_SELECTOR))
      .filter((element) => isVisibleElement(element))
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

    const observer = new MutationObserver(() => {
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
          <div className="ui-shutdown-overlay" aria-hidden="true">
            <div className="ui-shutdown-overlay__content">
              <p className="ui-shutdown-overlay__eyebrow">HBX Solutions</p>
              <div className="shutdown-confetti" aria-hidden>
                {Array.from({ length: 26 }).map((_, i) => (
                  <span key={i} className="shutdown-confetti__piece" style={{ ['--i' as any]: i }} />
                ))}
              </div>

              <strong className="ui-shutdown-overlay__title">
                OBRIGADO POR SER CLIENTE HBX
              </strong>
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
