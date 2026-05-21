"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch, clearToken } from "@/app/_lib/api";
import { mobileRouteIsActive, toMobileRoute } from "@/app/_lib/mobileRoutes";
import { useInterfaceTransition } from "@/components/InterfaceTransitionProvider";

const MOBILE_THEME_STORAGE_KEY = "hbx-mobile-theme";

type MobileTheme = "light" | "dark";

type HbxMobileDockProps = {
  primaryHref?: string;
  primaryLabel?: string;
  primaryTone?: "default" | "danger" | "warning";
  primaryIcon?: "plus" | "play" | "pause" | "stop";
  onPrimaryAction?: () => void;
  onConta?: () => void;
  onRelatorio?: () => void;
};

function normalizeMobileTheme(value: unknown): MobileTheme {
  return value === "light" ? "light" : "dark";
}

function applyMobileTheme(theme: MobileTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.hbxMobileTheme = theme;
}

function DockIcon({
  name,
}: {
  name:
    | "sales"
    | "radar"
    | "plus"
    | "play"
    | "pause"
    | "stop"
    | "theme"
    | "more"
    | "support"
    | "tutorial"
    | "report"
    | "settings"
    | "account"
    | "logout";
}) {
  if (name === "sales") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 21V5.8C5 4.8 5.8 4 6.8 4h10.4c1 0 1.8.8 1.8 1.8V21" />
        <path d="M8 9h8" />
        <path d="M8 13h8" />
        <path d="M10 21v-4h4v4" />
      </svg>
    );
  }
  if (name === "radar") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 21a9 9 0 1 0-9-9" />
        <path d="M12 17a5 5 0 1 0-5-5" />
        <path d="M12 13a1 1 0 1 0-1-1" />
        <path d="M12 3v3" />
      </svg>
    );
  }
  if (name === "plus") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
    );
  }
  if (name === "play") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 5.8v12.4L18.2 12 8 5.8Z" />
      </svg>
    );
  }
  if (name === "pause") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="7.2" y="5.6" width="3.6" height="12.8" rx="1.2" />
        <rect x="13.2" y="5.6" width="3.6" height="12.8" rx="1.2" />
      </svg>
    );
  }
  if (name === "stop") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <defs>
          <linearGradient id="hbxStopIconGloss" x1="7" y1="5" x2="17" y2="19">
            <stop offset="0" stopColor="rgba(255,255,255,0.98)" />
            <stop offset="1" stopColor="rgba(255,255,255,0.84)" />
          </linearGradient>
        </defs>
        <rect x="6.8" y="6.8" width="10.4" height="10.4" rx="2.3" fill="url(#hbxStopIconGloss)" />
      </svg>
    );
  }
  if (name === "theme") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v2" />
        <path d="M12 19v2" />
        <path d="m4.2 4.2 1.4 1.4" />
        <path d="m18.4 18.4 1.4 1.4" />
        <path d="M3 12h2" />
        <path d="M19 12h2" />
        <path d="m4.2 19.8 1.4-1.4" />
        <path d="m18.4 5.6 1.4-1.4" />
        <path d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      </svg>
    );
  }
  if (name === "more") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12h.01" />
        <path d="M12 12h.01" />
        <path d="M19 12h.01" />
      </svg>
    );
  }
  if (name === "support") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5h16v11H7l-3 3V5Z" />
        <path d="M8 9h8" />
        <path d="M8 13h5" />
      </svg>
    );
  }
  if (name === "tutorial") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 0-4-4V4Z" />
        <path d="M9 8h6" />
        <path d="M9 12h5" />
      </svg>
    );
  }
  if (name === "report") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="M8 16v-5" />
        <path d="M12 16V8" />
        <path d="M16 16v-3" />
      </svg>
    );
  }
  if (name === "settings") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
        <path d="M19 12a7.1 7.1 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.3 3.1a7 7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7.1 7.1 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.3 3.1h5l.3-3.1a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z" />
      </svg>
    );
  }
  if (name === "account") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
        <path d="M5 21v-1a7 7 0 0 1 14 0v1" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 5h4v14h-4" />
      <path d="M10 17 5 12l5-5" />
      <path d="M5 12h10" />
    </svg>
  );
}

export default function HbxMobileDock({
  primaryHref,
  primaryLabel = "Ação principal",
  primaryTone = "default",
  primaryIcon,
  onPrimaryAction,
  onConta,
  onRelatorio,
}: HbxMobileDockProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { runGlobalShutdown, isShuttingDown } = useInterfaceTransition();
  const [theme, setTheme] = useState<MobileTheme>("dark");
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const storedTheme = normalizeMobileTheme(window.localStorage.getItem(MOBILE_THEME_STORAGE_KEY));
      setTheme(storedTheme);
      applyMobileTheme(storedTheme);
    } catch {
      // localStorage can be blocked in private contexts.
      applyMobileTheme("dark");
    }
  }, []);

  useEffect(() => {
    applyMobileTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const items = useMemo(
    () => [
      { key: "sales", label: "Vendas", path: toMobileRoute("/vendas"), icon: "sales" as const },
    ],
    [],
  );

  function navigate(path: string) {
    setMenuOpen(false);
    router.push(path);
  }

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    applyMobileTheme(nextTheme);
    try {
      window.localStorage.setItem(MOBILE_THEME_STORAGE_KEY, nextTheme);
    } catch {
      // localStorage can be blocked in private contexts.
    }
  }

  function runPrimaryAction() {
    if (onPrimaryAction) {
      onPrimaryAction();
      return;
    }
    router.push(toMobileRoute(primaryHref || "/vendas?radar=1"));
  }

  const resolvedPrimaryIcon = primaryIcon || (primaryTone === "danger" ? "stop" : "plus");
  const primaryShouldPulse = ["play", "pause", "stop"].includes(resolvedPrimaryIcon);

  async function handleLogout() {
    await runGlobalShutdown(async () => {
      try {
        await apiFetch("/auth/logout", {
          method: "POST",
          requireAuth: true,
        });
      } finally {
        clearToken();
        router.push(toMobileRoute("/login"));
      }
    });
  }

  const dock = (
    <>
      <nav className="hbx-mobile-dock-root" aria-label="Navegação mobile HBX" data-menu-open={menuOpen ? "true" : "false"}>
        <div className="hbx-mobile-dock">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              className="hbx-mobile-dock-item"
              data-active={mobileRouteIsActive(pathname, item.path) ? "true" : "false"}
              onClick={() => navigate(item.path)}
              aria-label={item.label}
            >
              <DockIcon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}

          <button
            type="button"
            className="hbx-mobile-dock-primary"
            data-tone={primaryTone}
            onClick={runPrimaryAction}
            aria-label={primaryLabel}
            title={primaryLabel}
            data-radar-pulse={primaryShouldPulse ? "true" : "false"}
          >
            <DockIcon name={resolvedPrimaryIcon} />
          </button>

          <button
            type="button"
            className="hbx-mobile-dock-item"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Ativar tema claro no mobile" : "Ativar tema escuro no mobile"}
          >
            <DockIcon name="theme" />
            <span>{theme === "dark" ? "Escuro" : "Claro"}</span>
          </button>

          <button
            type="button"
            className="hbx-mobile-dock-item"
            data-active={menuOpen ? "true" : "false"}
            onClick={() => setMenuOpen((current) => !current)}
            aria-expanded={menuOpen}
            aria-controls="hbx-mobile-more-sheet"
            aria-label="Mais opções"
          >
            <DockIcon name="more" />
            <span>Mais</span>
          </button>
        </div>
      </nav>

      {menuOpen ? (
        <div className="hbx-mobile-sheet-backdrop" onClick={() => setMenuOpen(false)}>
          <section
            id="hbx-mobile-more-sheet"
            className="hbx-mobile-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Mais opções"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="hbx-mobile-sheet-handle" aria-hidden="true" />
            <button
              type="button"
              className="hbx-mobile-sheet-item"
              onClick={() => {
                setMenuOpen(false);
                if (onConta) onConta();
                else navigate(toMobileRoute("/vendas?mobileSheet=account"));
              }}
            >
              <DockIcon name="account" />
              <span>Conta</span>
            </button>
            <button type="button" className="hbx-mobile-sheet-item" onClick={() => navigate(toMobileRoute("/tutorial"))}>
              <DockIcon name="tutorial" />
              <span>Tutorial</span>
            </button>
            <button
              type="button"
              className="hbx-mobile-sheet-item"
              onClick={() => {
                setMenuOpen(false);
                if (onRelatorio) onRelatorio();
                else navigate(toMobileRoute("/vendas?mobileSection=report"));
              }}
            >
              <DockIcon name="report" />
              <span>Relatório</span>
            </button>
            <button
              type="button"
              className="hbx-mobile-sheet-item"
              data-tone="danger"
              onClick={() => void handleLogout()}
              disabled={isShuttingDown}
            >
              <DockIcon name="logout" />
              <span>{isShuttingDown ? "Saindo..." : "Sair"}</span>
            </button>
          </section>
        </div>
      ) : null}
    </>
  );

  if (!mounted) return null;
  return createPortal(dock, document.body);
}
