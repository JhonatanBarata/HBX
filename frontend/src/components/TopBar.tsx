"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch, clearToken, getToken } from "../app/dashboard/_lib/api";
import { setActiveThemeUser } from "@/lib/theme-preferences";
import ThemeSwitcher from "./ThemeSwitcher";
import ModuleNav from "./ModuleNav";

type User = {
  id: number;
  username: string;
  role?: string | null;
  isSystemMaster?: boolean;
  company?: { id: number; name?: string | null } | null;
};

type NavItem = {
  href: string;
  label: string;
  matcher: (pathname: string) => boolean;
  adminOnly?: boolean;
  moduleKey?: string;
};

type UserModule = { key: string; accessible: boolean };
type WhatsAppStatusPayload = {
  connected: boolean;
  status: string;
  displayNumber?: string | null;
};
type WhatsAppHealth = "green" | "yellow" | "red";

const hiddenRoutes = new Set(["/login", "/register", "/reset-password"]);

export default function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [modules, setModules] = useState<UserModule[]>([]);
  const [curPass, setCurPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [changing, setChanging] = useState(false);
  const [changeMsg, setChangeMsg] = useState<string | null>(null);
  const [whatsAppHealth, setWhatsAppHealth] = useState<WhatsAppHealth>("yellow");
  const [whatsAppHealthLabel, setWhatsAppHealthLabel] = useState("WhatsApp status: sem validacao");
  const navScrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  function updateScrollButtons() {
    const el = navScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
  }

  const showWorkspaceNav =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/hbx-recovery") ||
    pathname.startsWith("/hbx-music");
  const isAdmin = String(user?.role ?? "").toUpperCase() === "ADMIN";
  const isSystemMaster = Boolean(user?.isSystemMaster);

  const accessibleModules = useMemo(() => {
    return new Set((modules || []).filter((m) => m.accessible).map((m) => m.key));
  }, [modules]);

  const navItems = useMemo<NavItem[]>(() => {
    const items: NavItem[] = [
      {
        href: "/dashboard",
        label: "Menu",
        matcher: (route) => route === "/dashboard",
      },
      {
        href: "/dashboard/inbox",
        label: "Atendimento",
        matcher: (route) =>
          route.startsWith("/dashboard/inbox") ||
          route.startsWith("/dashboard/auto-replies") ||
          route.startsWith("/dashboard/messages"),
        moduleKey: 'atendimento',
      },
      {
        href: "/dashboard/gerencial",
        label: "Gerencial",
        matcher: (route) => route.startsWith("/dashboard/gerencial"),
        adminOnly: true,
        moduleKey: 'gerencial',
      },
      {
        href: "/hbx-recovery",
        label: "HBX Recovery",
        matcher: (route) => route.startsWith("/hbx-recovery"),
        moduleKey: "hbx_recovery",
      },
      {
        href: "/hbx-music",
        label: "HBX Music",
        matcher: (route) => route.startsWith("/hbx-music"),
        moduleKey: "hbx_music",
      },
      {
        href: "/dashboard/webscraping",
        label: "Webscraping",
        matcher: (route) => route.startsWith("/dashboard/webscraping"),
        moduleKey: 'webscraping',
      },
      {
        href: "/dashboard/website",
        label: "Website",
        matcher: (route) => route.startsWith("/dashboard/website"),
        moduleKey: "website",
      },
      {
        href: "/dashboard/importacoes/followup-global",
        label: "Follow Up",
        matcher: (route) =>
          route.startsWith("/dashboard/importacoes/followup-global") ||
          route.startsWith("/dashboard/importacoes/historico") ||
          route.startsWith("/dashboard/importacoes/novo"),
        moduleKey: "follow_up_internacional",
      },
      {
        href: "/dashboard/importacoes/cadastros",
        label: "Cadastros",
        matcher: (route) => route.startsWith("/dashboard/importacoes/cadastros"),
        moduleKey: "cadastros",
      },
      {
        href: "/dashboard/master",
        label: "Master",
        matcher: (route) => route.startsWith("/dashboard/master"),
        adminOnly: true,
        moduleKey: 'master',
      },
    ];

    return items.filter((item) => {
      if (item.moduleKey && !accessibleModules.has(item.moduleKey)) return false;
      if (!item.adminOnly) return true;
      if (item.href === '/dashboard/master') return isSystemMaster;
      return isAdmin;
    });
  }, [accessibleModules, isAdmin, isSystemMaster]);

  useEffect(() => {
    function refreshAuthState() {
      setAuthenticated(Boolean(getToken()));
    }

    refreshAuthState();
    window.addEventListener("auth-change", refreshAuthState);
    window.addEventListener("storage", refreshAuthState);
    return () => {
      window.removeEventListener("auth-change", refreshAuthState);
      window.removeEventListener("storage", refreshAuthState);
    };
  }, []);

  useEffect(() => {
    if (!authenticated) {
      setUser(null);
      setWhatsAppHealth("yellow");
      setWhatsAppHealthLabel("WhatsApp status: sem validacao");
      setActiveThemeUser(null);
      return;
    }

    let mounted = true;

    async function loadUser() {
      try {
        const [profile, myModules] = await Promise.all([
          apiFetch<User>("/profile/current-user"),
          apiFetch<UserModule[]>("/modules/me"),
        ]);
        if (mounted) {
          setUser(profile);
          setModules(myModules || []);
        }
      } catch {
        if (mounted) {
          setUser(null);
          setModules([]);
        }
      }
    }

    loadUser();
    return () => {
      mounted = false;
    };
  }, [authenticated]);

  useEffect(() => {
    setActiveThemeUser(user?.id ?? null);
  }, [user?.id]);

  useEffect(() => {
    if (!authenticated || !user) return;
    if (user.isSystemMaster || !user.company?.id) return;

    let mounted = true;

    const applyStatus = (payload: WhatsAppStatusPayload | null, failed = false) => {
      if (!mounted) return;
      if (failed || !payload) {
        setWhatsAppHealth("red");
        setWhatsAppHealthLabel("WhatsApp status: erro");
        return;
      }

      const normalized = String(payload.status || "").trim().toUpperCase();
      if (normalized === "CONNECTED" && payload.connected) {
        setWhatsAppHealth("green");
        setWhatsAppHealthLabel("WhatsApp status: conectado");
        return;
      }
      if (normalized === "ERROR") {
        setWhatsAppHealth("red");
        setWhatsAppHealthLabel("WhatsApp status: erro");
        return;
      }
      setWhatsAppHealth("yellow");
      setWhatsAppHealthLabel("WhatsApp status: desconectado");
    };

    const loadStatus = async () => {
      try {
        const payload = await apiFetch<WhatsAppStatusPayload>("/companies/me/whatsapp-status");
        applyStatus(payload, false);
      } catch {
        applyStatus(null, true);
      }
    };

    loadStatus();
    const timer = window.setInterval(loadStatus, 30000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [authenticated, user?.id, user?.company?.id, user?.isSystemMaster]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    // initialize scroll button visibility after items load
    const el = navScrollRef.current;
    if (!el) return;
    const onResize = () => updateScrollButtons();
    updateScrollButtons();
    window.addEventListener('resize', onResize);
    el.addEventListener('transitionend', updateScrollButtons);
    return () => {
      window.removeEventListener('resize', onResize);
      el.removeEventListener('transitionend', updateScrollButtons);
    };
  }, [navItems.length]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!userMenuRef.current) return;
      if (!(event.target instanceof Node)) return;
      if (!userMenuRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  function handleLogout() {
    clearToken();
    setAuthenticated(false);
    setUser(null);
    router.push("/login");
  }

  async function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setChanging(true);
    setChangeMsg(null);

    try {
      await apiFetch("/profile/password", {
        method: "PATCH",
        body: JSON.stringify({
          currentPassword: curPass,
          newPassword: newPass,
        }),
      });
      setChangeMsg("Senha atualizada com sucesso.");
      setCurPass("");
      setNewPass("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao atualizar senha.";
      setChangeMsg(message);
    } finally {
      setChanging(false);
    }
  }

  if (hiddenRoutes.has(pathname)) {
    return null;
  }

  return (
    <header className="app-topbar">
      <div className="app-topbar__inner">
        <div className="app-topbar__left">
          <Link href={authenticated ? "/dashboard" : "/login"} className="app-brand">
            <span className="app-brand__mark">HB</span>
            <span className="app-brand__text">HBX Solutions</span>
            {authenticated && user && !user.isSystemMaster && user.company?.id ? (
              <span
                className={`wa-health wa-health--${whatsAppHealth}`}
                title={whatsAppHealthLabel}
                aria-label={whatsAppHealthLabel}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M19.1 4.9A9.9 9.9 0 0 0 12 2a10 10 0 0 0-8.7 14.9L2 22l5.3-1.4A10 10 0 1 0 19.1 4.9Zm-7.1 15.4a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3.1.8.8-3-.2-.3a8.2 8.2 0 1 1 7 3.9Zm4.5-6.2c-.2-.1-1.2-.6-1.4-.7-.2-.1-.3-.1-.5.1-.1.2-.5.7-.6.8-.1.1-.2.1-.4 0s-.9-.3-1.7-1a6.4 6.4 0 0 1-1.2-1.5c-.1-.2 0-.3.1-.4l.3-.3.2-.3c.1-.1.1-.3 0-.4L10.4 8c-.1-.2-.3-.2-.4-.2h-.4c-.1 0-.4.1-.5.3-.2.2-.7.7-.7 1.6 0 1 .7 1.9.8 2 .1.1 1.3 2 3.2 2.8.5.2.9.4 1.2.5.5.1 1 .1 1.4.1.4-.1 1.2-.5 1.4-1 .2-.6.2-1 .1-1.1 0-.1-.2-.1-.4-.2Z" />
                </svg>
              </span>
            ) : null}
          </Link>
        </div>

          {authenticated ? (
            <div style={{ display: 'flex', alignItems: 'center', marginLeft: '6px' }}>
              <ModuleNav inHeader={true} />
            </div>
          ) : null}

        <div className="app-topbar__right">
          {authenticated ? <ThemeSwitcher storageUserId={user?.id ?? null} /> : null}
          {user ? (
            <div ref={userMenuRef} className="app-user">
              <button
                type="button"
                className="app-user__trigger"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
              >
                <span className="app-user__avatar">
                  {user.username ? user.username.charAt(0).toUpperCase() : "U"}
                </span>
                <span className="app-user__meta">
                  <span className="app-user__name">{user.username}</span>
                  <span className="app-user__company">{user.isSystemMaster ? "MASTER" : (user.company?.name ?? "Sem empresa")}</span>
                </span>
              </button>

              {open ? (
                <div className="app-user__menu">
                  <p className="app-user__menu-title">Editar senha</p>
                  <form onSubmit={handlePasswordSubmit} className="app-user__form">
                    <input
                      type="password"
                      placeholder="Senha atual"
                      value={curPass}
                      onChange={(event) => setCurPass(event.target.value)}
                      className="field"
                    />
                    <input
                      type="password"
                      placeholder="Nova senha (min. 4)"
                      value={newPass}
                      onChange={(event) => setNewPass(event.target.value)}
                      className="field"
                    />
                    {changeMsg ? (
                      <p className="text-xs text-[var(--muted)] leading-5">{changeMsg}</p>
                    ) : null}
                    <div className="app-user__menu-actions">
                      <button
                        type="submit"
                        className="btn btn-primary btn-sm"
                        disabled={changing || newPass.length < 4}
                      >
                        {changing ? "Salvando..." : "Salvar senha"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setOpen(false)}
                      >
                        Fechar
                      </button>
                    </div>
                  </form>
                </div>
              ) : null}
            </div>
          ) : null}

          {authenticated ? (
            <button type="button" onClick={handleLogout} className="btn btn-secondary btn-sm">
              Sair
            </button>
          ) : (
            <Link href="/login" className="btn btn-secondary btn-sm">
              Entrar
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
