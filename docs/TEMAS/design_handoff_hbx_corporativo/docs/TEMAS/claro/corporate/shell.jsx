/* HBX Corporativo — shell compartilhado (ícones, Sidebar, Topbar, KPIs)
   Carregar com <script type="text/babel" src="shell.jsx"></script> após React+Babel. */

function I({ d, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {d.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

const ICONS = {
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

function Spark({ tone = "var(--hbx-brand-strong)", down = false }) {
  const d = down ? "M2 7 L12 10 L22 8 L32 13 L42 12 L52 16 L62 15" : "M2 16 L12 12 L22 14 L32 8 L42 11 L52 5 L62 7";
  return (
    <svg width="64" height="22" viewBox="0 0 64 22" fill="none">
      <path d={d} stroke={tone} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Av({ name, size = 20 }) {
  const ini = name.split(" ").slice(0, 2).map(w => w[0]).join("");
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>{ini}</span>;
}

const NAV_LINKS = [
  { id: "dash", label: "Dashboard", href: "Dashboard.html" },
  { id: "leads", label: "Leads", href: "Leads.html" },
  { id: "scrape", label: "Webscraping", href: "Webscraping.html" },
  { id: "vendas", label: "Vendas", href: "index.html", chevron: true },
  { id: "atend", label: "Atendimento", href: "Atendimento.html" },
  { id: "bot", label: "Bot", href: "Bot.html" },
  { id: "relat", label: "Relatórios", href: "Relatorios.html" },
  { id: "config", label: "Configurações", href: "Configuracoes.html" },
];

function Sidebar({ active }) {
  return (
    <aside className="side">
      <div className="logo">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--hbx-brand)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l6 6-6 6M11 6l6 6-6 6" /></svg>
        <strong>HBX</strong>
      </div>
      {NAV_LINKS.map(n => {
        const cls = "nav-item" + (n.id === active ? " active" : "");
        const inner = (
          <React.Fragment>
            <I d={ICONS[n.id]} />
            {n.label}
            {n.chevron && <svg className="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>}
          </React.Fragment>
        );
        return n.href
          ? <a key={n.id} className={cls} href={n.href}>{inner}</a>
          : <button key={n.id} className={cls}>{inner}</button>;
      })}
      <div className="side-bottom">
        <div className="plan-card">
          <div><strong>Plano Empresarial</strong><br /><small>Válido até 30/06/2026</small></div>
          <button>Gerenciar plano</button>
        </div>
        <div className="user-card">
          <Av name="Mariana Souza" size={32} />
          <div><strong>Mariana Souza</strong><small>Gerente Comercial</small></div>
          <span className="dots">⋮</span>
        </div>
      </div>
    </aside>
  );
}

const CORP_MODE_KEY = "hbx:corporate-mode";

function applyCorpMode(mode) {
  // suprime transições durante a troca de tema — transições penduradas
  // congelam a cor antiga (diagnóstico: CSSTransition presa em currentTime 0)
  const kill = document.createElement("style");
  kill.textContent = "* { transition: none !important; }";
  document.head.appendChild(kill);
  if (mode === "light") document.documentElement.setAttribute("data-theme-mode", "light");
  else document.documentElement.removeAttribute("data-theme-mode");
  void document.documentElement.offsetHeight; // força reflow com transições desligadas
  requestAnimationFrame(() => requestAnimationFrame(() => kill.remove()));
}

/* docs/TEMAS: modo fixado no markup — preferência salva não é aplicada no load */

function ModeToggle() {
  const [mode, setMode] = React.useState(() => {
    try {
      return document.documentElement.getAttribute("data-theme-mode") === "light" ? "light" : "dark";
    } catch (e) { return "dark"; }
  });
  function flip() {
    const next = mode === "dark" ? "light" : "dark";
    setMode(next);
    applyCorpMode(next);
    try { localStorage.setItem(CORP_MODE_KEY, next); } catch (e) {}
  }
  return (
    <button className="round-btn" onClick={flip} title={mode === "dark" ? "Tema claro" : "Tema escuro"} aria-label="Alternar tema">
      <I d={mode === "dark" ? ICONS.sun : ICONS.moon} size={17} />
    </button>
  );
}

function ThemeSwitch() {
  // chavinha Friendly ←→ Corporativo: navega entre os dois apps reais
  function toFriendly() {
    try { localStorage.setItem("hbx:ws-theme", "friendly"); } catch (e) {}
    window.location.href = "../workspace/index.html";
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button onClick={toFriendly} role="switch" aria-checked={true} aria-label="Alternar Friendly / Corporativo" title="Voltar ao tema Friendly"
        style={{ position: "relative", width: 46, height: 26, padding: 0, borderRadius: 999, cursor: "pointer",
          border: "1px solid var(--hbx-brand)",
          background: "linear-gradient(140deg, var(--hbx-brand), var(--hbx-brand-strong))" }}>
        <span style={{ position: "absolute", top: "50%", left: 22, width: 20, height: 20, borderRadius: 999, background: "#FFFFFF", transform: "translateY(-50%)" }} />
      </button>
      <span style={{ fontSize: "0.66rem", fontWeight: 800, color: "var(--hbx-brand-strong)", letterSpacing: "0.04em" }}>Corporativo</span>
    </span>
  );
}

function Topbar({ title, crumbs }) {
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
        <button className="round-btn add"><I d={ICONS.plus} size={16} /></button>
        <button className="round-btn"><I d={ICONS.bell} size={17} /><span className="bub">8</span></button>
        <button className="round-btn"><I d={ICONS.msg} size={17} /><span className="bub">3</span></button>
        <Av name="Mariana Souza" size={34} />
      </div>
    </header>
  );
}

function KpiRow({ items }) {
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

Object.assign(window, { I, ICONS, Spark, Av, Sidebar, Topbar, KpiRow, NAV_LINKS, ModeToggle, ThemeSwitch, applyCorpMode });
