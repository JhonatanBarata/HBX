"use client";

// HBX Corporativo — shell compartilhado (ícones, Sidebar, Topbar, KPIs).
// Porta fiel de docs/TEMAS/*/corporate/shell.jsx para Next/TSX.
// Pontos dinâmicos ligados ao backend: identidade do usuário no
// user-card/avatar via GET /profile/current-user. O restante permanece
// visual como no template (ver doc do PR).

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useState, useSyncExternalStore } from "react";

import { applyThemeSoft, setCorporateTheme, setFriendlyTheme, setThemeMode } from "@/components/hbx/theme-attributes";
import { apiFetch, clearToken, getToken } from "@/lib/api";

export function I({ d, size = 18 }: { d: string[]; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {d.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

export const ICONS: Record<string, string[]> = {
  dash: ["M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z"],
  leads: ["M16 18c0-2.2-1.8-4-4-4s-4 1.8-4 4", "M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", "M19 8v4M21 10h-4"],
  scrape: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M3.5 12h17", "M12 3a14 14 0 0 1 0 18"],
  vendas: ["M7 17l4-6 3 3 4-7", "M3 3v18h18"],
  atend: ["M4.5 13.8v-2.2a7.5 7.5 0 0 1 15 0v2.2", "M7.5 17.5h-1a2 2 0 0 1-2-2v-1.1a2 2 0 0 1 2-2h1v5.1Z", "M16.5 17.5h1a2 2 0 0 0 2-2v-1.1a2 2 0 0 0-2-2h-1v5.1Z"],
  bot: ["M12 6V3", "M7 9h10a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2Z", "M9.5 13h.01M14.5 13h.01"],
  relat: ["M5 20V10M12 20V4M19 20v-7"],
  config: ["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", "M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.1-1.2L14 3h-4l-.5 2.7a7 7 0 0 0-2.1 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1c.6.5 1.3.9 2.1 1.2L10 21h4l.5-2.7a7 7 0 0 0 2.1-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z"],
  bell: ["M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9", "M10.3 21a2 2 0 0 0 3.4 0"],
  msg: ["M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 20l1-5.2a8.4 8.4 0 1 1 17-3.3Z"],
  search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z", "m21 21-4.3-4.3"],
  users: ["M17 19c0-2.8-2.2-5-5-5s-5 2.2-5 5", "M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"],
  doc: ["M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z", "M14 3v5h5", "M9 13h6M9 17h6"],
  check: ["M20 6 9 17l-5-5"],
  money: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 7v10M15 9.5c0-1.1-1.3-2-3-2s-3 .9-3 2 1 1.8 3 2.2 3 1.1 3 2.3-1.3 2-3 2-3-.9-3-2"],
  plus: ["M12 5v14M5 12h14"],
  clock: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 7v5l3 2"],
  filter: ["M4 5h16l-6.5 7.5V19l-3 2v-8.5z"],
  send: ["m4 12 16-7-4 16-4.5-6.5z", "M20 5 11.5 14.5"],
  clip: ["M21 12.5 12.7 20.8a5 5 0 0 1-7-7L14 5.5a3.3 3.3 0 0 1 4.7 4.7L10.4 18.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"],
  smile: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M8.5 14.5s1.2 1.5 3.5 1.5 3.5-1.5 3.5-1.5", "M9 10h.01M15 10h.01"],
  mark: ["M18 21 12 17 6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"],
  mail: ["M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z", "m3.5 7 8.5 6 8.5-6"],
  phone: ["M5 4h4l1.5 4.5L8 10a13 13 0 0 0 6 6l1.5-2.5L20 15v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"],
  mapin: ["M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z", "M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"],
  arrow: ["M5 12h14", "m13 6 6 6-6 6"],
  sun: ["M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z", "M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"],
  moon: ["M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8Z"],
};

export function Spark({ tone = "var(--hbx-brand-strong)", down = false }: { tone?: string; down?: boolean }) {
  const d = down ? "M2 7 L12 10 L22 8 L32 13 L42 12 L52 16 L62 15" : "M2 16 L12 12 L22 14 L32 8 L42 11 L52 5 L62 7";
  return (
    <svg width="64" height="22" viewBox="0 0 64 22" fill="none">
      <path className="hbx-spark-path" d={d} stroke={tone} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Av({ name, size = 20 }: { name?: string; size?: number }) {
  const ini = String(name || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("") || "?";
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>{ini}</span>;
}

// Confirm padrão do kit (substitui window.confirm). Mesma cara do hbx-modal.
export function ConfirmDialog({ open, title, message, confirmLabel = "Confirmar", danger = false, busy = false, onConfirm, onCancel }: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--hbx-overlay)", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="hbx-modal" role="dialog" aria-modal="true"
        style={{ width: "min(400px, 100%)", display: "grid", gap: 14, padding: 24, borderRadius: "var(--radius-xl)", border: "1px solid var(--border-hairline)", background: "var(--hbx-surface)", boxShadow: "var(--shadow-md)" }}>
        <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 800 }}>{title}</h3>
        <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button className="btn-ghost" disabled={busy} onClick={onCancel}>Cancelar</button>
          <button className="btn-ghost" disabled={busy} onClick={onConfirm}
            style={{ color: danger ? "var(--hbx-danger)" : "var(--hbx-brand-strong)", fontWeight: 700 }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export const NAV_LINKS = [
  { id: "dash", label: "Dashboard", href: "/dashboard" },
  { id: "leads", label: "Leads", href: "/leads" },
  { id: "scrape", label: "Radar", href: "/webscraping" },
  { id: "vendas", label: "Vendas", href: "/vendas", chevron: true },
  { id: "atend", label: "Atendimento", href: "/atendimento" },
  { id: "bot", label: "Bot", href: "/bot" },
  { id: "relat", label: "Relatórios", href: "/relatorios" },
  { id: "config", label: "Configurações", href: "/configuracoes" },
];

// ---------------------------------------------------------------
// Identidade do usuário — único ponto do shell ligado ao backend.
// Fallback: texto visual do template enquanto não há sessão/resposta.
// ---------------------------------------------------------------
type CurrentUser = {
  name?: string | null;
  email?: string | null;
  username?: string | null;
  userKind?: string | null;
  role?: string | null;
  isSystemMaster?: boolean | null;
};

const USER_KIND_LABEL: Record<string, string> = {
  system_master: "Master",
  admin: "Administrador",
  seller: "Vendas",
  user: "Usuário",
};

let currentUserPromise: Promise<CurrentUser | null> | null = null;

function fetchCurrentUserOnce(): Promise<CurrentUser | null> {
  if (!currentUserPromise) {
    currentUserPromise = apiFetch<CurrentUser>("/profile/current-user").catch(() => {
      currentUserPromise = null;
      return null;
    });
  }
  return currentUserPromise;
}

export function useCurrentUser(): CurrentUser | null {
  const [user, setUser] = useState<CurrentUser | null>(null);
  useEffect(() => {
    let alive = true;
    if (!getToken()) return;
    fetchCurrentUserOnce().then(u => {
      if (alive && u) setUser(u);
    });
    return () => { alive = false; };
  }, []);
  return user;
}

export function currentUserDisplayName(user: CurrentUser | null): string {
  return user?.name || user?.username || user?.email || "Mariana Souza";
}

export function currentUserRoleLabel(user: CurrentUser | null): string {
  if (!user) return "Gerente Comercial";
  return USER_KIND_LABEL[String(user.userKind || "")] || "Usuário";
}

// ---------------------------------------------------------------
// Entitlements do plano (GET /commercial-plans/me → current.entitlements):
// fonte única para OCULTAR módulos não liberados (ordem do dono,
// 12/06/2026). UX apenas — o guard real continua no backend.
// ---------------------------------------------------------------
export type Entitlements = Record<string, boolean>;

type PlanMe = { current?: { planKey?: string | null; entitlements?: Entitlements } } | null;

let planMeCache: { at: number; data: PlanMe } | null = null;

export async function fetchPlanMeCached(): Promise<PlanMe> {
  if (planMeCache && Date.now() - planMeCache.at < 60_000) return planMeCache.data;
  const data = await apiFetch<PlanMe>("/commercial-plans/me").catch(() => null);
  planMeCache = { at: Date.now(), data };
  return data;
}

export function useEntitlements() {
  const [state, setState] = useState<{ loaded: boolean; planKey: string | null; entitlements: Entitlements }>({
    loaded: false,
    planKey: null,
    entitlements: {},
  });
  useEffect(() => {
    let alive = true;
    if (!getToken()) return;
    fetchPlanMeCached().then(res => {
      if (!alive) return;
      setState({
        loaded: true,
        planKey: res?.current?.planKey || null,
        entitlements: res?.current?.entitlements || {},
      });
    });
    return () => { alive = false; };
  }, []);
  return state;
}

// módulo da navegação → entitlement que o libera (null = sempre visível)
const NAV_ENTITLEMENT: Record<string, string | null> = {
  dash: null,
  leads: "webscraping",
  scrape: "webscraping",
  vendas: "vendas",
  atend: "atendimento_chat",
  bot: "bot_ia",
  relat: "vendas",
  config: null,
};

export function isModuleVisible(
  id: string,
  ent: { loaded: boolean; entitlements: Entitlements },
  user?: { isSystemMaster?: boolean | null } | null,
) {
  // master enxerga TUDO: o backend bypassa entitlements para isSystemMaster
  // (commercial-plans.service.assertEntitlementForUser), mas /commercial-plans/me
  // falha sem empresa — sem este bypass a sidebar encolhia para o dono.
  if (user?.isSystemMaster) return true;
  const key = NAV_ENTITLEMENT[id] ?? null;
  if (key === null) return true;
  // sem flash de módulo proibido: condicionais só aparecem após carregar
  if (!ent.loaded) return false;
  return Boolean(ent.entitlements[key]);
}

export function Sidebar({ active }: { active: string }) {
  const user = useCurrentUser();
  const ent = useEntitlements();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Logout no "⋮" do user-card (ordem do dono, 11/06/2026) —
  // POST /auth/logout, limpa o token e volta para /login.
  async function sair() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // sessão já inválida no backend — segue limpando o cliente
    }
    currentUserPromise = null;
    clearToken();
    router.replace("/login");
  }

  return (
    <aside className="side">
      <div className="logo">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--hbx-brand)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l6 6-6 6M11 6l6 6-6 6" /></svg>
        <strong>HBX</strong>
      </div>
      {NAV_LINKS.filter(n => isModuleVisible(n.id, ent, user)).map(n => {
        const cls = "nav-item" + (n.id === active ? " active" : "");
        return (
          <Link key={n.id} className={cls} href={n.href}>
            <I d={ICONS[n.id]} />
            {n.label}
            {n.chevron && <svg className="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6-6 6" /></svg>}
          </Link>
        );
      })}
      <div className="side-bottom">
        <div className="plan-card">
          <div><strong>Plano Empresarial</strong><br /><small>Válido até 30/06/2026</small></div>
          <button>Gerenciar plano</button>
        </div>
        <div className="user-card" style={{ position: "relative" }}>
          <Av name={currentUserDisplayName(user)} size={32} />
          <div><strong>{currentUserDisplayName(user)}</strong><small>{currentUserRoleLabel(user)}</small></div>
          <span className="dots" role="button" aria-label="Menu do usuário" aria-expanded={menuOpen}
            onClick={() => setMenuOpen(o => !o)}>⋮</span>
          {menuOpen && (
            <div className="hbx-pop" style={{ position: "absolute", right: 8, bottom: "calc(100% + 6px)", zIndex: 20, minWidth: 120, padding: 6, borderRadius: "var(--radius-md)", border: "1px solid var(--border-hairline)", background: "var(--hbx-surface)", boxShadow: "var(--shadow-md)" }}>
              <button className="btn-ghost" style={{ width: "100%", minHeight: 32, fontSize: "0.72rem" }} onClick={sair} disabled={signingOut}>
                {signingOut ? "Saindo…" : "Sair"}
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------
// Tema é SÓ PELE (REGRA DURA do FRONTEND.md, 12/06/2026): um app, as
// mesmas telas; Friendly ⇄ Corporativo troca APENAS atributos/tokens do
// <html> (como o claro/escuro), sem navegação. O app paralelo /workspace
// foi morto na unificação — a rota redireciona para /dashboard.
// ---------------------------------------------------------------

export function applyCorpMode(mode: string) {
  // suprime transições durante a troca de modo — transições penduradas
  // congelam a cor antiga (diagnóstico: CSSTransition presa em currentTime 0)
  const kill = document.createElement("style");
  kill.textContent = "* { transition: none !important; }";
  document.head.appendChild(kill);
  setThemeMode("corporate", mode === "light" ? "light" : "dark");
  void document.documentElement.offsetHeight; // força reflow com transições desligadas
  requestAnimationFrame(() => requestAnimationFrame(() => kill.remove()));
}

export function subscribeToThemeMode(callback: () => void) {
  const obs = new MutationObserver(callback);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-theme-mode"] });
  return () => obs.disconnect();
}

export function useActiveTheme(): "corporate" | "friendly" {
  return useSyncExternalStore(
    subscribeToThemeMode,
    () => (document.documentElement.getAttribute("data-theme") === "corporate" ? "corporate" : "friendly"),
    () => "corporate",
  );
}

export function ModeToggle() {
  // estado deriva dos atributos do <html> (aplicados pelo boot de tema);
  // semântica por tema: corporate escuro padrão, friendly claro padrão.
  const theme = useActiveTheme();
  const modeAttr = useSyncExternalStore(
    subscribeToThemeMode,
    () => document.documentElement.getAttribute("data-theme-mode"),
    () => null,
  );
  const corp = theme === "corporate";
  const isDark = corp ? modeAttr !== "light" : modeAttr === "dark";
  function flip() {
    const next = isDark ? "light" : "dark";
    if (corp) applyCorpMode(next); // corporativo = troca seca (handoff)
    else applyThemeSoft(() => setThemeMode("friendly", next)); // friendly = cross-fade
  }
  return (
    <button className="round-btn" onClick={flip} title={isDark ? "Tema claro" : "Tema escuro"} aria-label="Alternar tema">
      <I d={isDark ? ICONS.sun : ICONS.moon} size={17} />
    </button>
  );
}

export function ThemeSwitch() {
  // chavinha Friendly ←→ Corporativo: troca de PELE na MESMA tela
  // (setFriendlyTheme/setCorporateTheme persistem hbx:ws-theme e aplicam
  // os atributos com cross-fade) — nunca navega.
  const theme = useActiveTheme();
  const corp = theme === "corporate";
  function flip() {
    if (corp) setFriendlyTheme();
    else setCorporateTheme();
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button onClick={flip} role="switch" aria-checked={corp} aria-label="Alternar Friendly / Corporativo"
        title={corp ? "Mudar para o tema Friendly" : "Mudar para o tema Corporativo"}
        style={{ position: "relative", width: 46, height: 26, padding: 0, borderRadius: 999, cursor: "pointer",
          border: "1px solid " + (corp ? "var(--hbx-brand)" : "var(--border-hairline)"),
          background: corp
            ? "linear-gradient(140deg, var(--hbx-brand), var(--hbx-brand-strong))"
            : "color-mix(in srgb, var(--hbx-surface-raised) 80%, var(--hbx-surface))",
          transition: "background var(--motion-fast), border-color var(--motion-fast)" }}>
        <span style={{ position: "absolute", top: "50%", left: corp ? 22 : 2, width: 20, height: 20, borderRadius: 999, background: "#FFFFFF", transform: "translateY(-50%)", transition: "left var(--motion-base)" }} />
      </button>
      <span style={{ fontSize: "0.66rem", fontWeight: 800, color: corp ? "var(--hbx-brand-strong)" : "var(--text-muted)", letterSpacing: "0.04em", minWidth: 76 }}>
        {corp ? "Corporativo" : "Friendly"}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------
// Topbar real: sino = avisos do master (GET /vendas/master-notices,
// badge = não lidos, ack por clique); balão = conversas não lidas do
// inbox; "+" abre o Novo lead do Vendas. Cache de 30s por módulo para
// não martelar a API a cada navegação.
// ---------------------------------------------------------------
type MasterNotice = {
  id: string;
  title: string;
  body: string;
  tone?: string | null;
  acknowledged?: boolean;
  createdAt?: string | null;
};

// Aviso clicável (ordem do dono, 12/06/2026): os títulos são FIXOS no backend
// (seller-onboarding / job-application / cancellation-case) e o próprio texto
// já aponta a tela — aqui é só o de-para, nada inventado. A dica de seção/aba
// usa o mesmo padrão sessionStorage do "+" (hbx:abrir-novo-lead).
function noticeTarget(notice: MasterNotice): { href: string; hintKey?: string; hintValue?: string } | null {
  const title = String(notice.title || "");
  if (/^Ticket aberto: documentos confirmados/i.test(title)) {
    return { href: "/configuracoes", hintKey: "hbx:config-sec", hintValue: "Equipe" };
  }
  if (/^Nova candidatura:/i.test(title)) {
    return { href: "/gerencial", hintKey: "hbx:gerencial-aba", hintValue: "Candidaturas" };
  }
  if (/^Cancelamento:/i.test(title)) {
    return { href: "/gerencial", hintKey: "hbx:gerencial-aba", hintValue: "Comissões" };
  }
  return null;
}

const TOPBAR_CACHE_TTL = 30_000;
let noticesCache: { at: number; data: MasterNotice[] } | null = null;
let unreadCache: { at: number; count: number } | null = null;

async function fetchNoticesCached(force = false): Promise<MasterNotice[]> {
  if (!force && noticesCache && Date.now() - noticesCache.at < TOPBAR_CACHE_TTL) return noticesCache.data;
  const res = await apiFetch<{ notices?: MasterNotice[] }>("/vendas/master-notices").catch(() => null);
  const data = Array.isArray(res?.notices) ? res.notices : [];
  noticesCache = { at: Date.now(), data };
  return data;
}

async function fetchUnreadChatsCached(): Promise<number> {
  if (unreadCache && Date.now() - unreadCache.at < TOPBAR_CACHE_TTL) return unreadCache.count;
  const res = await apiFetch<Array<{ metadata?: Record<string, unknown> | null }>>("/inbox/conversations?take=50").catch(() => null);
  const list = Array.isArray(res) ? res : [];
  const count = list.filter(c => Number((c.metadata || {})["whatsappUnreadCount"] ?? 0) > 0).length;
  unreadCache = { at: Date.now(), count };
  return count;
}

export function Topbar({ title, crumbs }: { title: string; crumbs: React.ReactNode }) {
  const user = useCurrentUser();
  const router = useRouter();
  const [notices, setNotices] = useState<MasterNotice[]>([]);
  const [unreadChats, setUnreadChats] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  // logoff também pelo avatar (pedido do dono: o "⋮" da sidebar estava escondido)
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function sairTopo() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // sessão já inválida — segue limpando o cliente
    }
    currentUserPromise = null;
    clearToken();
    router.replace("/login");
  }

  useEffect(() => {
    let alive = true;
    if (!getToken()) return;
    fetchNoticesCached().then(data => { if (alive) setNotices(data); });
    fetchUnreadChatsCached().then(count => { if (alive) setUnreadChats(count); });
    return () => { alive = false; };
  }, []);

  const naoLidos = notices.filter(n => !n.acknowledged);

  async function marcarLido(notice: MasterNotice) {
    try {
      await apiFetch(`/vendas/master-notices/${encodeURIComponent(notice.id)}/ack`, { method: "POST", body: JSON.stringify({}) });
      const data = await fetchNoticesCached(true);
      setNotices(data);
    } catch { /* mantém estado */ }
  }

  function abrirNovoLead() {
    try { sessionStorage.setItem("hbx:abrir-novo-lead", "1"); } catch { /* sem storage */ }
    router.push("/vendas");
  }

  return (
    <header className="topbar">
      <button className="burger" aria-label="Menu"><span></span><span></span><span></span></button>
      <div className="page-id">
        <h1>{title}</h1>
        <div className="crumbs">{crumbs}</div>
      </div>
      <div className="search">
        <I d={ICONS.search} size={15} />
        Buscar leads, empresas, propostas...
        <span className="kbd">⌘ K</span>
      </div>
      <div className="top-actions">
        <ModeToggle />
        <ThemeSwitch />
        <button className="round-btn add" title="Novo lead" aria-label="Novo lead" onClick={abrirNovoLead}><I d={ICONS.plus} size={16} /></button>
        <span style={{ position: "relative", display: "inline-flex" }}>
          <button className="round-btn" title="Avisos" aria-label="Avisos" onClick={() => setBellOpen(o => !o)}>
            <I d={ICONS.bell} size={17} />
            {naoLidos.length > 0 && <span className="bub">{naoLidos.length}</span>}
          </button>
          {bellOpen && (
            <div className="hbx-pop" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 30, width: 320, maxHeight: 380, overflowY: "auto", padding: 10, borderRadius: "var(--radius-md)", border: "1px solid var(--border-hairline)", background: "var(--hbx-surface)", boxShadow: "var(--shadow-md)", display: "grid", gap: 8 }}>
              <strong style={{ fontFamily: "var(--font-display)", fontSize: "0.82rem" }}>Avisos</strong>
              {notices.length === 0 && <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Nenhum aviso no momento.</span>}
              {notices.map(n => {
                const alvo = noticeTarget(n);
                return (
                  <div key={n.id} role={alvo ? "button" : undefined} tabIndex={alvo ? 0 : undefined}
                    title={alvo ? "Abrir a tela deste aviso" : undefined}
                    onClick={() => {
                      if (!alvo) return;
                      if (alvo.hintKey && alvo.hintValue) {
                        try { sessionStorage.setItem(alvo.hintKey, alvo.hintValue); } catch { /* sem storage */ }
                      }
                      setBellOpen(false);
                      router.push(alvo.href);
                    }}
                    style={{ display: "grid", gap: 4, padding: "9px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-hairline)", background: n.acknowledged ? "transparent" : "var(--hbx-surface-soft)", cursor: alvo ? "pointer" : "default" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                      <strong style={{ fontSize: "0.74rem" }}>{n.title}</strong>
                      {!n.acknowledged && (
                        <button className="btn-ghost" style={{ minHeight: 24, fontSize: "0.62rem", padding: "0 8px" }}
                          onClick={e => { e.stopPropagation(); marcarLido(n); }}>Marcar lido</button>
                      )}
                    </div>
                    <span style={{ fontSize: "0.68rem", lineHeight: 1.45, color: "var(--text-muted)", whiteSpace: "pre-line" }}>{n.body}</span>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      {n.createdAt ? <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.58rem", color: "var(--text-muted)" }}>{new Date(n.createdAt).toLocaleDateString("pt-BR")}</span> : <span />}
                      {alvo && <span className="link" style={{ fontSize: "0.62rem" }}>Abrir tela →</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </span>
        <button className="round-btn" title="Atendimento" aria-label="Atendimento" onClick={() => router.push("/atendimento")}>
          <I d={ICONS.msg} size={17} />
          {unreadChats > 0 && <span className="bub">{unreadChats}</span>}
        </button>
        <span style={{ position: "relative", display: "inline-flex" }}>
          <button className="round-btn" title="Conta" aria-label="Conta" style={{ width: "auto", height: "auto", padding: 0 }} onClick={() => setAvatarOpen(o => !o)}>
            <Av name={currentUserDisplayName(user)} size={34} />
          </button>
          {avatarOpen && (
            <div className="hbx-pop" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 30, minWidth: 180, padding: 8, borderRadius: "var(--radius-md)", border: "1px solid var(--border-hairline)", background: "var(--hbx-surface)", boxShadow: "var(--shadow-md)", display: "grid", gap: 6 }}>
              <div style={{ padding: "4px 6px" }}>
                <strong style={{ display: "block", fontSize: "0.76rem" }}>{currentUserDisplayName(user)}</strong>
                <small style={{ fontSize: "0.64rem", color: "var(--text-muted)" }}>{user?.email || currentUserRoleLabel(user)}</small>
              </div>
              <button className="btn-ghost" style={{ width: "100%", minHeight: 32, fontSize: "0.72rem" }} onClick={() => router.push("/configuracoes")}>Configurações</button>
              {user?.isSystemMaster && (
                <button className="btn-ghost" style={{ width: "100%", minHeight: 32, fontSize: "0.72rem" }} onClick={() => router.push("/master")}>Master</button>
              )}
              {(String(user?.role || "").toUpperCase() === "ADMIN" || user?.isSystemMaster) && (
                <button className="btn-ghost" style={{ width: "100%", minHeight: 32, fontSize: "0.72rem" }} onClick={() => router.push("/gerencial")}>Gerencial</button>
              )}
              <button className="btn-ghost" style={{ width: "100%", minHeight: 32, fontSize: "0.72rem", color: "var(--hbx-danger)" }} onClick={sairTopo} disabled={signingOut}>
                {signingOut ? "Saindo…" : "Sair"}
              </button>
            </div>
          )}
        </span>
      </div>
    </header>
  );
}

export type KpiItem = { icon: string; label: string; value: string; delta: string; down?: boolean };

export function KpiRow({ items }: { items: KpiItem[] }) {
  return (
    <div className="kpis">
      {items.map(k => (
        <div className="kpi" key={k.label}>
          <span className="kpi-icon"><I d={ICONS[k.icon]} /></span>
          <div>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-foot">
              <span className={"kpi-delta" + (k.down ? " down" : "")}>{k.delta} <small>vs mês anterior</small></span>
              <Spark down={k.down} tone={k.down ? "var(--hbx-danger)" : "var(--hbx-brand-strong)"} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
