"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import styles from "./HbxCorporateShell.module.css";

export type HbxCorporateSection =
  | "dashboard"
  | "leads"
  | "webscraping"
  | "vendas"
  | "atendimento"
  | "bot"
  | "relatorios"
  | "configuracoes"
  | "login";

type IconName =
  | "dash"
  | "leads"
  | "scrape"
  | "vendas"
  | "atend"
  | "bot"
  | "relat"
  | "config"
  | "bell"
  | "msg"
  | "search"
  | "plus"
  | "sun"
  | "moon"
  | "users"
  | "money"
  | "clock"
  | "send"
  | "mail"
  | "phone"
  | "check";

const ICONS: Record<IconName, string[]> = {
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
  plus: ["M12 5v14M5 12h14"],
  sun: ["M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z", "M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"],
  moon: ["M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8Z"],
  users: ["M17 19c0-2.8-2.2-5-5-5s-5 2.2-5 5", "M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"],
  money: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 7v10M15 9.5c0-1.1-1.3-2-3-2s-3 .9-3 2 1 1.8 3 2.2 3 1.1 3 2.3-1.3 2-3 2-3-.9-3-2"],
  clock: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 7v5l3 2"],
  send: ["m4 12 16-7-4 16-4.5-6.5z", "M20 5 11.5 14.5"],
  mail: ["M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z", "m3.5 7 8.5 6 8.5-6"],
  phone: ["M5 4h4l1.5 4.5L8 10a13 13 0 0 0 6 6l1.5-2.5L20 15v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"],
  check: ["M20 6 9 17l-5-5"],
};

const NAV_LINKS: Array<{ id: HbxCorporateSection; icon: IconName; label: string }> = [
  { id: "dashboard", icon: "dash", label: "Dashboard" },
  { id: "leads", icon: "leads", label: "Leads" },
  { id: "webscraping", icon: "scrape", label: "Webscraping" },
  { id: "vendas", icon: "vendas", label: "Vendas" },
  { id: "atendimento", icon: "atend", label: "Atendimento" },
  { id: "bot", icon: "bot", label: "Bot" },
  { id: "relatorios", icon: "relat", label: "Relatórios" },
  { id: "configuracoes", icon: "config", label: "Configurações" },
];

export const CORPORATE_LABELS: Record<HbxCorporateSection, string> = {
  dashboard: "Dashboard",
  leads: "Leads",
  webscraping: "Webscraping",
  vendas: "Vendas",
  atendimento: "Atendimento",
  bot: "Bot",
  relatorios: "Relatórios",
  configuracoes: "Configurações",
  login: "Login",
};

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name].map((d, index) => (
        <path key={index} d={d} />
      ))}
    </svg>
  );
}

export function HbxCorporateIcon(props: { name: IconName; size?: number }) {
  return <Icon {...props} />;
}

export function HbxCorporateAvatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return (
    <span className={styles.avatar} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials}
    </span>
  );
}

function applyMode(mode: "light" | "dark") {
  const kill = document.createElement("style");
  kill.textContent = "* { transition: none !important; }";
  document.head.appendChild(kill);
  document.documentElement.setAttribute("data-theme", "corporate");
  if (mode === "light") document.documentElement.setAttribute("data-theme-mode", "light");
  else document.documentElement.setAttribute("data-theme-mode", "dark");
  document.documentElement.style.colorScheme = mode;
  void document.documentElement.offsetHeight;
  requestAnimationFrame(() => requestAnimationFrame(() => kill.remove()));
}

function Sidebar({
  active,
  onNavigate,
}: {
  active: HbxCorporateSection;
  onNavigate: (section: HbxCorporateSection) => void;
}) {
  return (
    <aside className={styles.side}>
      <div className={styles.logo}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--hbx-brand)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6l6 6-6 6M11 6l6 6-6 6" />
        </svg>
        <strong>HBX</strong>
      </div>
      {NAV_LINKS.map((item) => (
        <button key={item.id} type="button" className={styles.navItem} data-active={item.id === active} onClick={() => onNavigate(item.id)}>
          <Icon name={item.icon} />
          {item.label}
        </button>
      ))}
      <div className={styles.sideBottom}>
        <div className={styles.planCard}>
          <div>
            <strong>Plano Empresarial</strong>
            <br />
            <small>Válido até 30/06/2026</small>
          </div>
          <button type="button">Gerenciar plano</button>
        </div>
        <div className={styles.userCard}>
          <HbxCorporateAvatar name="Mariana Souza" />
          <div>
            <strong>Mariana Souza</strong>
            <small>Gerente Comercial</small>
          </div>
          <span className={styles.muted} style={{ marginLeft: "auto" }}>⋮</span>
        </div>
      </div>
    </aside>
  );
}

function Topbar({
  title,
  mode,
  onModeChange,
}: {
  title: string;
  mode: "light" | "dark";
  onModeChange: () => void;
}) {
  return (
    <header className={styles.topbar}>
      <button type="button" className={styles.burger} aria-label="Menu">
        <span />
        <span />
        <span />
      </button>
      <div className={styles.pageId}>
        <h1>{title}</h1>
        <div className={styles.crumbs}>Home › Corporativo › {title}</div>
      </div>
      <div className={styles.search}>
        <Icon name="search" size={15} />
        Buscar leads, empresas, propostas...
        <span className={styles.kbd}>⌘ K</span>
      </div>
      <div className={styles.topActions}>
        <button type="button" className={styles.roundBtn} onClick={onModeChange} aria-label="Alternar claro e escuro">
          <Icon name={mode === "dark" ? "sun" : "moon"} size={17} />
        </button>
        <span className={styles.themeSwitch}>
          <button type="button" className={styles.switchTrack} aria-label="Tema Corporativo ativo" role="switch" aria-checked="true">
            <span className={styles.switchThumb} />
          </button>
          <span className={styles.themeLabel}>Corporativo</span>
        </span>
        <button type="button" className={styles.roundBtn} data-tone="add" aria-label="Novo registro">
          <Icon name="plus" size={16} />
        </button>
        <button type="button" className={styles.roundBtn} aria-label="Notificações">
          <Icon name="bell" size={17} />
          <span className={styles.bubble}>8</span>
        </button>
        <button type="button" className={styles.roundBtn} aria-label="Mensagens">
          <Icon name="msg" size={17} />
          <span className={styles.bubble}>3</span>
        </button>
        <HbxCorporateAvatar name="Mariana Souza" size={34} />
      </div>
    </header>
  );
}

export function HbxCorporateKpis({
  items,
}: {
  items: Array<{ label: string; value: string; delta: string; icon: IconName; down?: boolean }>;
}) {
  return (
    <div className={styles.kpis}>
      {items.map((item) => (
        <article key={item.label} className={styles.kpi}>
          <span className={styles.kpiIcon}>
            <Icon name={item.icon} />
          </span>
          <div>
            <div className={styles.kpiLabel}>{item.label}</div>
            <div className={styles.kpiValue}>{item.value}</div>
            <div className={styles.kpiFoot}>
              <span className={styles.kpiDelta} data-down={item.down ? "true" : "false"}>
                {item.delta} <small className={styles.muted}>vs mês anterior</small>
              </span>
              <svg width="64" height="22" viewBox="0 0 64 22" fill="none" aria-hidden="true">
                <path
                  d={item.down ? "M2 7 L12 10 L22 8 L32 13 L42 12 L52 16 L62 15" : "M2 16 L12 12 L22 14 L32 8 L42 11 L52 5 L62 7"}
                  stroke={item.down ? "var(--hbx-danger)" : "var(--hbx-brand-strong)"}
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export function HbxCorporatePanel({
  title,
  meta,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.panel}>
      <header className={styles.panelHead}>
        <h2>{title}</h2>
        {meta ? <div className={styles.panelMeta}>{meta}</div> : null}
      </header>
      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}

export function HbxCorporateTag({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "teal" | "warn" | "red" }) {
  return (
    <span className={styles.tag} data-tone={tone}>
      {children}
    </span>
  );
}

export function HbxCorporateShell({
  active,
  onNavigate,
  children,
  context,
}: {
  active: HbxCorporateSection;
  onNavigate: (section: HbxCorporateSection) => void;
  children: ReactNode;
  context?: ReactNode;
}) {
  const [mode, setMode] = useState<"light" | "dark">("dark");
  const title = CORPORATE_LABELS[active];

  useEffect(() => {
    const saved = window.localStorage.getItem("hbx:corporate-mode");
    const initialMode = saved === "light" ? "light" : "dark";
    setMode(initialMode);
    applyMode(initialMode);
    const timers = [window.setTimeout(() => applyMode(initialMode), 0), window.setTimeout(() => applyMode(initialMode), 300)];
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const handleModeChange = () => {
    const next = mode === "dark" ? "light" : "dark";
    setMode(next);
    applyMode(next);
    window.localStorage.setItem("hbx:corporate-mode", next);
  };

  const memoContext = useMemo(() => context, [context]);

  return (
    <main className={styles.app}>
      <Sidebar active={active} onNavigate={onNavigate} />
      <section className={styles.main}>
        <Topbar title={title} mode={mode} onModeChange={handleModeChange} />
        <div className={styles.content}>
          <div className={styles.work}>{children}</div>
          {memoContext ? <aside className={styles.context}>{memoContext}</aside> : null}
        </div>
      </section>
    </main>
  );
}

export { styles as hbxCorporateStyles };
