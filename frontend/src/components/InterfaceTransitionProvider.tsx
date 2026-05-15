"use client";

import React from "react";
import { usePathname } from "next/navigation";

const ENTER_READY_DELAY_MS = 24;
// Keep shutdown feedback visible without delaying the login return.
const EXIT_DURATION_MS = 3000;
const ROW_SNAP_PX = 18;
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
  ".page-content > *",
  '[data-ui-reveal-target="true"]',
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

declare global {
  interface Window {
    __hbxPreviewShutdown?: () => Promise<void>;
  }
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

  React.useEffect(() => {
    if (process.env.NODE_ENV === "production") return undefined;

    window.__hbxPreviewShutdown = () => runGlobalShutdown(async () => undefined);
    return () => {
      if (window.__hbxPreviewShutdown) {
        delete window.__hbxPreviewShutdown;
      }
    };
  }, [runGlobalShutdown]);

  return (
    <InterfaceTransitionContext.Provider value={value}>
      <div ref={rootRef} className="ui-orchestrator" data-ui-phase={phase}>
        {children}

        {phase === "shutdown" ? <HBXLogoutScreen /> : null}
      </div>
    </InterfaceTransitionContext.Provider>
  );
}

function HBXLogoutScreen() {
  const [seconds, setSeconds] = React.useState(3);

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setSeconds((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="hbx-logout-screen" data-ui-no-reveal="true" role="status" aria-live="polite" aria-atomic="true">
      <div className="hbx-logout-screen__background" aria-hidden />
      <div className="hbx-logout-screen__grid" aria-hidden />
      <div className="hbx-logout-screen__line hbx-logout-screen__line--strong" aria-hidden />
      <div className="hbx-logout-screen__line hbx-logout-screen__line--soft" aria-hidden />
      <span className="hbx-logout-screen__particle hbx-logout-screen__particle--one" aria-hidden />
      <span className="hbx-logout-screen__particle hbx-logout-screen__particle--two" aria-hidden />
      <span className="hbx-logout-screen__particle hbx-logout-screen__particle--three" aria-hidden />

      <section className="hbx-logout-screen__content">
        <div className="hbx-logout-screen__top">
          <h1>
            HB<span>X</span>
          </h1>
          <div>Sessão finalizada</div>
        </div>

        <div className="hbx-logout-screen__center">
          <div className="hbx-logout-screen__glow" aria-hidden />
          <TechRobot />
          <div className="hbx-logout-screen__copy">
            <h2>
              Até logo,
              <br />
              operador.
            </h2>
            <p>O radar continua em silêncio. Suas vendas, cards e oportunidades ficaram protegidos no HBX.</p>
            <strong>Encerrando conexão segura...</strong>
          </div>
        </div>

        <div className="hbx-logout-screen__bottom">
          <button type="button" disabled>Entrar novamente</button>
          <button type="button" disabled>Voltar para o início</button>
          <p>Redirecionamento automático em {seconds}s</p>
        </div>
      </section>

      <style>{`
        .hbx-logout-screen {
          position: fixed;
          inset: 0;
          z-index: 2147483000;
          min-height: 100vh;
          overflow: hidden;
          background: #061426;
          color: #fff;
          font-family: var(--font-body, Inter, system-ui, sans-serif);
        }

        .hbx-logout-screen__background,
        .hbx-logout-screen__grid,
        .hbx-logout-screen__line,
        .hbx-logout-screen__particle,
        .hbx-logout-screen__glow {
          position: absolute;
          pointer-events: none;
        }

        .hbx-logout-screen__background {
          inset: 0;
          background:
            radial-gradient(circle at 70% 18%, rgba(70, 180, 255, 0.25), transparent 28%),
            radial-gradient(circle at 25% 65%, rgba(20, 255, 190, 0.12), transparent 34%),
            linear-gradient(180deg, #061426 0%, #071a33 55%, #040b16 100%);
        }

        .hbx-logout-screen__grid {
          inset: 0;
          opacity: 0.12;
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.12) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.12) 1px, transparent 1px);
          background-size: 34px 34px;
        }

        .hbx-logout-screen__line {
          top: -20%;
          height: 140%;
          transform: rotate(24deg);
          transform-origin: center;
        }

        .hbx-logout-screen__line--strong {
          left: -5rem;
          width: 2px;
          background: rgba(186, 230, 253, 0.35);
          box-shadow: 0 0 24px rgba(125, 220, 255, 0.45);
        }

        .hbx-logout-screen__line--soft {
          left: 4rem;
          width: 1px;
          height: 80%;
          background: rgba(96, 165, 250, 0.2);
        }

        .hbx-logout-screen__particle {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          animation: hbxLogoutPulse 1.8s ease-in-out infinite;
        }

        .hbx-logout-screen__particle--one {
          left: 26%;
          top: 13%;
          background: rgba(255, 255, 255, 0.6);
        }

        .hbx-logout-screen__particle--two {
          right: 24%;
          top: 19%;
          background: rgba(165, 243, 252, 0.5);
        }

        .hbx-logout-screen__particle--three {
          right: 18%;
          top: 42%;
          width: 4px;
          height: 4px;
          background: rgba(147, 197, 253, 0.5);
        }

        .hbx-logout-screen__content {
          position: relative;
          z-index: 1;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          padding: 40px 28px;
        }

        .hbx-logout-screen__top,
        .hbx-logout-screen__center,
        .hbx-logout-screen__bottom {
          width: 100%;
          text-align: center;
        }

        .hbx-logout-screen__top {
          padding-top: 16px;
        }

        .hbx-logout-screen__top h1 {
          margin: 0;
          font-size: clamp(3.75rem, 14vw, 5.4rem);
          line-height: 0.9;
          font-weight: 1000;
          letter-spacing: -0.05em;
        }

        .hbx-logout-screen__top h1 span {
          background: linear-gradient(90deg, #67e8f9, #3b82f6);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .hbx-logout-screen__top div {
          display: inline-flex;
          align-items: center;
          min-height: 34px;
          margin-top: 16px;
          padding: 0 16px;
          border: 1px solid rgba(103, 232, 249, 0.2);
          border-radius: 999px;
          background: rgba(103, 232, 249, 0.1);
          color: #a5f3fc;
          box-shadow: 0 0 30px rgba(34, 211, 238, 0.12);
          font-size: 11px;
          font-weight: 1000;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }

        .hbx-logout-screen__center {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .hbx-logout-screen__glow {
          top: 40px;
          width: 192px;
          height: 192px;
          border-radius: 999px;
          background: rgba(103, 232, 249, 0.1);
          filter: blur(32px);
        }

        .hbx-logout-robot {
          position: relative;
          z-index: 1;
          width: 245px;
          height: 245px;
          filter: drop-shadow(0 0 35px rgba(34, 211, 238, 0.22));
          animation: hbxLogoutFloatBot 3.4s ease-in-out infinite;
        }

        .hbx-logout-robot__wave {
          transform-origin: 156px 102px;
          animation: hbxLogoutWave 1.15s ease-in-out infinite;
        }

        .hbx-logout-robot__scan {
          animation: hbxLogoutScan 2.1s ease-in-out infinite;
        }

        .hbx-logout-screen__copy {
          margin-top: 28px;
        }

        .hbx-logout-screen__copy h2 {
          margin: 0;
          font-size: clamp(2.5rem, 10vw, 3.8rem);
          font-weight: 1000;
          line-height: 0.95;
          letter-spacing: -0.03em;
        }

        .hbx-logout-screen__copy p {
          max-width: 310px;
          margin: 20px auto 0;
          color: #cbd5e1;
          font-size: 0.9rem;
          font-weight: 650;
          line-height: 1.7;
        }

        .hbx-logout-screen__copy strong {
          display: block;
          margin-top: 16px;
          color: #67e8f9;
          font-size: 0.75rem;
          font-weight: 1000;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }

        .hbx-logout-screen__bottom {
          max-width: 340px;
          padding-bottom: 8px;
        }

        .hbx-logout-screen__bottom button {
          width: 100%;
          border: 0;
          border-radius: 18px;
          font-family: inherit;
          font-weight: 1000;
        }

        .hbx-logout-screen__bottom button:first-child {
          min-height: 56px;
          background: linear-gradient(90deg, #2563eb, #22d3ee);
          color: #fff;
          box-shadow: 0 18px 50px rgba(37, 99, 235, 0.35);
        }

        .hbx-logout-screen__bottom button:nth-child(2) {
          min-height: 48px;
          margin-top: 12px;
          border: 1px solid rgba(186, 230, 253, 0.15);
          background: rgba(255, 255, 255, 0.03);
          color: #cbd5e1;
          backdrop-filter: blur(12px);
        }

        .hbx-logout-screen__bottom p {
          margin: 20px 0 0;
          color: #64748b;
          font-size: 11px;
          font-weight: 800;
        }

        @keyframes hbxLogoutPulse {
          0%, 100% { opacity: 0.42; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }

        @keyframes hbxLogoutWave {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-14deg); }
          50% { transform: rotate(12deg); }
          75% { transform: rotate(-10deg); }
        }

        @keyframes hbxLogoutFloatBot {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }

        @keyframes hbxLogoutScan {
          0% { transform: translateY(-22px); opacity: 0; }
          35% { opacity: 1; }
          100% { transform: translateY(72px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function TechRobot() {
  return (
    <svg width="245" height="245" viewBox="0 0 245 245" fill="none" className="hbx-logout-robot" aria-hidden="true">
      <circle cx="122.5" cy="122.5" r="92" stroke="rgba(103,232,249,0.13)" />
      <circle cx="122.5" cy="122.5" r="68" stroke="rgba(103,232,249,0.10)" />
      <path d="M122 55V38" stroke="#7DD3FC" strokeWidth="4" strokeLinecap="round" />
      <circle cx="122" cy="31" r="6" fill="#38BDF8" />
      <circle cx="122" cy="31" r="14" fill="#38BDF8" opacity="0.12" />
      <rect x="64" y="58" width="116" height="88" rx="28" fill="url(#hbxLogoutHeadGradient)" stroke="rgba(103,232,249,0.45)" strokeWidth="2" />
      <rect x="75" y="77" width="94" height="3" rx="999" fill="#67E8F9" opacity="0.65" className="hbx-logout-robot__scan" />
      <rect x="80" y="80" width="84" height="44" rx="16" fill="rgba(2,8,23,0.62)" stroke="rgba(148,226,255,0.18)" />
      <rect x="96" y="96" width="14" height="10" rx="5" fill="#67E8F9" />
      <rect x="135" y="96" width="14" height="10" rx="5" fill="#67E8F9" />
      <path d="M104 115C113 123 132 123 142 115" stroke="#BAE6FD" strokeWidth="4" strokeLinecap="round" />
      <rect x="78" y="143" width="90" height="58" rx="24" fill="rgba(15,23,42,0.78)" stroke="rgba(103,232,249,0.28)" />
      <text x="123" y="178" textAnchor="middle" fontSize="22" fontWeight="900" fill="white" letterSpacing="2">HBX</text>
      <path d="M78 157C55 161 47 178 48 193" stroke="#7DD3FC" strokeWidth="10" strokeLinecap="round" />
      <circle cx="49" cy="196" r="9" fill="#38BDF8" />
      <g className="hbx-logout-robot__wave">
        <path d="M166 156C190 143 197 121 191 102" stroke="#7DD3FC" strokeWidth="10" strokeLinecap="round" />
        <circle cx="190" cy="99" r="9" fill="#38BDF8" />
        <path d="M201 78C211 84 215 94 214 105" stroke="#BAE6FD" strokeWidth="4" strokeLinecap="round" opacity="0.9" />
        <path d="M212 68C228 80 232 96 229 112" stroke="#38BDF8" strokeWidth="3" strokeLinecap="round" opacity="0.45" />
      </g>
      <path d="M101 201V216" stroke="#64748B" strokeWidth="8" strokeLinecap="round" />
      <path d="M145 201V216" stroke="#64748B" strokeWidth="8" strokeLinecap="round" />
      <rect x="88" y="216" width="31" height="10" rx="5" fill="#94A3B8" />
      <rect x="130" y="216" width="31" height="10" rx="5" fill="#94A3B8" />
      <rect x="38" y="94" width="20" height="20" rx="6" fill="rgba(34,211,238,0.12)" />
      <path d="M43 104H53" stroke="#67E8F9" strokeWidth="2" strokeLinecap="round" />
      <rect x="188" y="153" width="22" height="22" rx="7" fill="rgba(59,130,246,0.14)" />
      <path d="M194 164H204" stroke="#93C5FD" strokeWidth="2" strokeLinecap="round" />
      <defs>
        <linearGradient id="hbxLogoutHeadGradient" x1="64" y1="58" x2="180" y2="146">
          <stop stopColor="#11243F" />
          <stop offset="0.55" stopColor="#0B172D" />
          <stop offset="1" stopColor="#082F49" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function useInterfaceTransition() {
  const context = React.useContext(InterfaceTransitionContext);
  if (!context) {
    throw new Error("useInterfaceTransition must be used inside InterfaceTransitionProvider.");
  }
  return context;
}
