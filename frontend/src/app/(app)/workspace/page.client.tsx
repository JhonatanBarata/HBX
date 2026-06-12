"use client";

// Porta fiel de docs/TEMAS/*/workspace/index.html (app Friendly).
// Esteira, recovery e inbox permanecem visuais como no template —
// integrações reais serão ligadas em PR próprio (ver doc do PR).

import { useRouter } from "next/navigation";
import React, { useState, useSyncExternalStore } from "react";

import { I, ICONS, subscribeToThemeMode, useEntitlements, type Entitlements } from "@/components/hbx/shell";
import { applyThemeSoft } from "@/components/hbx/theme-attributes";
import { apiFetch, clearToken } from "@/lib/api";

const glass: React.CSSProperties = {
  border: "1px solid var(--border-hairline)",
  borderRadius: "var(--panel-radius)",
  background:
    "radial-gradient(circle at top right, color-mix(in srgb, var(--hbx-brand) 8%, transparent), transparent 48%)," +
    "linear-gradient(180deg, color-mix(in srgb, var(--hbx-surface) 98%, var(--hbx-background)), color-mix(in srgb, var(--hbx-surface-soft) 92%, var(--hbx-background)))",
  boxShadow: "var(--shadow-inset), var(--shadow-sm)",
};

const overline: React.CSSProperties = { fontFamily: "var(--font-display)", fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--text-muted)", whiteSpace: "nowrap" };

const WS_MODE_KEY = "hbx:friendly-mode";   // light | dark
const WS_THEME_KEY = "hbx:ws-theme";       // friendly | corporate

function applyWs(mode: string) {
  // friendly = troca de modo com cross-fade de alto nível (ordem do dono);
  // a classe hbx-theme-anim se remove sozinha — nada fica pendurado.
  applyThemeSoft(() => {
    const html = document.documentElement;
    if (mode === "dark") html.setAttribute("data-theme-mode", "dark");
    else html.removeAttribute("data-theme-mode");
  });
}

function ThemeToggle() {
  const router = useRouter();
  // estado deriva do atributo do <html> — no friendly, ausência = claro
  const mode = useSyncExternalStore(
    subscribeToThemeMode,
    () => (document.documentElement.getAttribute("data-theme-mode") === "dark" ? "dark" : "light"),
    () => "light",
  );
  const theme = "friendly"; // esta página É o app Friendly
  function flipMode() {
    const next = mode === "light" ? "dark" : "light";
    applyWs(next);
    try { localStorage.setItem(WS_MODE_KEY, next); } catch { /* sem storage */ }
  }
  function flipTheme() {
    // navega para o app Corporativo real (painéis/shell próprios)
    try { localStorage.setItem(WS_THEME_KEY, "corporate"); } catch { /* sem storage */ }
    router.push("/dashboard");
  }
  const corp = theme !== "friendly";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button onClick={flipMode} aria-label="Alternar claro/escuro" title={mode === "light" ? "Tema escuro" : "Tema claro"}
        style={{ display: "inline-grid", placeItems: "center", width: 38, height: 38, borderRadius: "var(--control-radius)", border: "1px solid var(--border-hairline)", cursor: "pointer", color: "var(--text-body)",
          background: "linear-gradient(160deg, color-mix(in srgb, var(--hbx-surface) 90%, transparent), color-mix(in srgb, var(--hbx-surface-soft) 70%, transparent))", boxShadow: "var(--shadow-inset), var(--shadow-xs)" }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          {mode === "light"
            ? <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8Z" />
            : <path d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />}
        </svg>
      </button>
      <button onClick={flipTheme} role="switch" aria-checked={corp} aria-label="Alternar Friendly / Corporativo"
        title={corp ? "Voltar ao tema Friendly" : "Ativar tema Corporativo"}
        style={{ position: "relative", width: 46, height: 26, padding: 0, borderRadius: 999, cursor: "pointer",
          border: "1px solid " + (corp ? "color-mix(in srgb, var(--hbx-brand) 55%, var(--hbx-line))" : "var(--border-hairline)"),
          background: corp
            ? "linear-gradient(140deg, color-mix(in srgb, var(--hbx-brand) 85%, transparent), color-mix(in srgb, var(--hbx-brand-strong) 75%, transparent))"
            : "color-mix(in srgb, var(--hbx-surface-raised) 80%, var(--hbx-surface))",
          boxShadow: "var(--shadow-inset)", transition: "background var(--motion-fast), border-color var(--motion-fast)" }}>
        <span style={{ position: "absolute", top: "50%", left: corp ? 22 : 2, width: 20, height: 20, borderRadius: 999,
          background: "#FFFFFF", transform: "translateY(-50%)", transition: "left var(--motion-base)",
          boxShadow: "0 4px 10px -4px color-mix(in srgb, var(--hbx-shadow) 50%, transparent)" }} />
      </button>
      <span style={{ fontSize: "0.66rem", fontWeight: 800, color: corp ? "var(--hbx-brand-strong)" : "var(--text-muted)", letterSpacing: "0.04em", minWidth: 76 }}>
        {corp ? "Corporativo" : "Friendly"}
      </span>
    </span>
  );
}

function Brand() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <span style={{ display: "inline-grid", placeItems: "center", width: 44, height: 44, borderRadius: 14, color: "#fff", fontFamily: "var(--font-display)", fontWeight: 900, letterSpacing: "0.06em", fontSize: "0.8rem",
        background: "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.34), transparent 30%), linear-gradient(135deg, #18d7c4 0%, #0a5970 48%, #5b39ff 100%)",
        boxShadow: "0 14px 30px -12px rgba(23,195,184,0.5), inset 0 1px 0 rgba(255,255,255,0.3)" }}>HBX</span>
      <div style={{ display: "grid", gap: 1 }}>
        <strong style={{ fontFamily: "var(--font-display)", fontSize: "0.92rem", fontWeight: 800, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>HBX System</strong>
        <small style={{ fontSize: "0.66rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>Workspace</small>
      </div>
    </div>
  );
}

// Paridade de módulos com o corporativo (ordem do dono, 11/06/2026):
// tudo que aparece na sidebar corporate aparece aqui, mantendo os itens
// próprios do friendly (Recovery, Cadastros). Ícones do próprio handoff;
// Configurações usa a engrenagem inline do shell (não há gear nos assets).
const NAV: { id: string; label: string; icon?: string; iconD?: string[] }[] = [
  { id: "inicio", label: "Início", icon: "radar" },
  { id: "leads", label: "Esteira de leads", icon: "lead-plus" },
  { id: "webscraping", label: "Radar", icon: "site" },
  { id: "vendas", label: "Vendas", icon: "opportunity" },
  { id: "atendimento", label: "Atendimento", icon: "channel" },
  { id: "bot", label: "Bot", icon: "action" },
  { id: "relatorios", label: "Relatórios", icon: "quality" },
  { id: "recovery", label: "Recovery", icon: "coins" },
  { id: "cadastros", label: "Cadastros", icon: "cnpj" },
  { id: "configuracoes", label: "Configurações", iconD: ICONS.config },
];

// módulo do friendly → entitlement que o libera (null = sempre visível);
// ocultar módulo não liberado é ordem do dono (12/06/2026) — UX apenas,
// o guard real é do backend.
const RAIL_ENTITLEMENT: Record<string, string | null> = {
  inicio: null,
  leads: "webscraping",
  webscraping: "webscraping",
  vendas: "vendas",
  atendimento: "atendimento_chat",
  bot: "bot_ia",
  relatorios: "vendas",
  recovery: "recovery",
  cadastros: null,
  configuracoes: null,
};

function railVisible(id: string, ent: { loaded: boolean; entitlements: Entitlements }) {
  const key = RAIL_ENTITLEMENT[id] ?? null;
  if (key === null) return true;
  if (!ent.loaded) return false;
  return Boolean(ent.entitlements[key]);
}

function Rail({ view, setView }: { view: string; setView: (v: string) => void }) {
  const router = useRouter();
  const ent = useEntitlements();
  async function sair() {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch { /* sessão já inválida — segue limpando */ }
    clearToken();
    router.replace("/login");
  }
  return (
    <nav style={{ ...glass, display: "flex", flexDirection: "column", padding: 14, gap: 18 }}>
      <Brand />
      <div style={{ display: "grid", gap: 4 }}>
        <span style={{ ...overline, padding: "0 8px 4px" }}>Operação</span>
        {NAV.filter(n => railVisible(n.id, ent)).map((n) => {
          const active = view === n.id;
          return (
            <button key={n.id} onClick={() => setView(n.id)}
              style={{ display: "flex", alignItems: "center", gap: 11, padding: "0.6rem 0.7rem", borderRadius: "var(--control-radius)", cursor: "pointer", textAlign: "left",
                border: "1px solid " + (active ? "color-mix(in srgb, var(--hbx-brand) 32%, var(--hbx-line))" : "transparent"),
                background: active ? "color-mix(in srgb, var(--hbx-brand) 12%, var(--hbx-surface))" : "transparent",
                color: active ? "var(--hbx-brand-strong)" : "var(--text-body)", fontFamily: "var(--font-body)", fontSize: "0.84rem", fontWeight: active ? 800 : 600, transition: "all .18s" }}>
              {n.iconD
                ? <span style={{ display: "inline-grid", placeItems: "center", width: 18, height: 18, opacity: active ? 1 : 0.7 }}><I d={n.iconD} size={18} /></span>
                // eslint-disable-next-line @next/next/no-img-element
                : <img src={"/hbx-theme/assets/icons/" + n.icon + ".svg"} width="18" height="18" alt="" style={{ opacity: active ? 1 : 0.7 }} />}
              {n.label}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: "auto", display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0.6rem 0.7rem", borderRadius: "var(--control-radius)", border: "1px solid var(--border-hairline)", background: "color-mix(in srgb, var(--hbx-surface-raised) 60%, var(--hbx-surface))" }}>
          <span style={{ display: "inline-grid", placeItems: "center", width: 30, height: 30, borderRadius: 10, color: "#fff", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "0.7rem", background: "linear-gradient(140deg, var(--hbx-brand), var(--hbx-brand-strong))" }}>MA</span>
          <div style={{ display: "grid", gap: 0, lineHeight: 1.2 }}>
            <strong style={{ fontSize: "0.76rem" }}>Marina Alves</strong>
            <small style={{ fontSize: "0.64rem", color: "var(--text-muted)" }}>Auto Center Sul</small>
          </div>
        </div>
        <button onClick={sair}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 36, borderRadius: "var(--control-radius)", border: "1px solid var(--border-hairline)", background: "transparent", color: "var(--hbx-danger)", fontFamily: "var(--font-body)", fontSize: "0.74rem", fontWeight: 800, cursor: "pointer" }}>
          Sair
        </button>
      </div>
    </nav>
  );
}

function btn(variant: "primary" | "secondary"): React.CSSProperties {
  const base: React.CSSProperties = { minHeight: 38, padding: "0 14px", borderRadius: "calc(var(--control-radius) + 1px)", border: "1px solid", fontFamily: "var(--font-body)", fontSize: "0.78rem", fontWeight: 800, cursor: "pointer" };
  if (variant === "primary") return { ...base, color: "#FDFDFF", borderColor: "color-mix(in srgb, var(--hbx-primary) 52%, var(--hbx-accent))",
    background: "linear-gradient(140deg, color-mix(in srgb, var(--hbx-primary) 90%, transparent), color-mix(in srgb, var(--hbx-accent) 72%, transparent) 54%, color-mix(in srgb, var(--hbx-secondary) 78%, transparent))",
    boxShadow: "0 18px 34px -22px color-mix(in srgb, var(--hbx-primary) 50%, transparent), inset 0 1px 0 rgba(255,255,255,0.28)" };
  return { ...base, color: "var(--text-strong)", borderColor: "var(--border-hairline)", background: "linear-gradient(160deg, color-mix(in srgb, var(--hbx-surface) 90%, transparent), color-mix(in srgb, var(--hbx-surface-soft) 70%, transparent))", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4)" };
}

function TopBar({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header style={{ ...glass, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "14px 18px", borderRadius: "var(--radius-md)" }}>
      <div style={{ display: "grid", gap: 3 }}>
        <span style={overline}>{subtitle}</span>
        <strong style={{ fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 800, letterSpacing: "-0.03em" }}>{title}</strong>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "0.4rem 0.7rem", borderRadius: 999, border: "1px solid color-mix(in srgb, var(--hbx-success) 28%, var(--hbx-background))", background: "color-mix(in srgb, var(--hbx-success) 12%, var(--hbx-background))", color: "color-mix(in srgb, var(--hbx-success) 74%, var(--hbx-foreground))", fontSize: "0.68rem", fontWeight: 800 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--hbx-success)" }} />WhatsApp conectado
        </span>
        <ThemeToggle />
        <button style={btn("secondary")}>Importar lista</button>
        <button style={btn("primary")}>+ Novo lead</button>
      </div>
    </header>
  );
}

function Stat({ label, value, delta, tone }: { label: string; value: string; delta: string; tone?: string }) {
  const dc = tone === "danger" ? "color-mix(in srgb, var(--hbx-danger) 80%, var(--hbx-foreground))" : "color-mix(in srgb, var(--hbx-success) 76%, var(--hbx-foreground))";
  return (
    <div style={{ ...glass, padding: "0.95rem 1rem", borderRadius: "calc(var(--panel-radius) - 4px)", boxShadow: "var(--shadow-inset), var(--shadow-xs)" }}>
      <p style={{ margin: 0, fontSize: "0.74rem", fontWeight: 700, color: "var(--text-muted)" }}>{label}</p>
      <p style={{ margin: "0.34rem 0 0", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.03em", whiteSpace: "nowrap" }}>{value}</p>
      <p style={{ margin: "0.3rem 0 0", fontSize: "0.72rem", fontWeight: 800, color: dc }}>{delta}</p>
    </div>
  );
}

function LeadCard({ company, segment, channel, priority, hot, action }: { company: string; segment: string; channel: string; priority: number; hot?: boolean; action?: () => void }) {
  return (
    <article style={{ display: "grid", gap: 10, padding: "1rem 1.05rem", borderRadius: "var(--radius-md)",
      border: "1px solid " + (hot ? "color-mix(in srgb, var(--hbx-brand) 36%, var(--hbx-line))" : "var(--border-hairline)"),
      background: hot ? "radial-gradient(circle at top right, color-mix(in srgb, var(--hbx-brand-strong) 16%, transparent), transparent 44%), linear-gradient(180deg, var(--hbx-surface), var(--hbx-surface-soft))" : "linear-gradient(180deg, var(--hbx-surface), var(--hbx-surface-soft))",
      boxShadow: "var(--shadow-inset), var(--shadow-xs)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ ...overline, color: hot ? "var(--hbx-brand-strong)" : "var(--text-muted)" }}>{hot ? "Lead quente" : "Lead"}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", fontWeight: 700, color: "var(--hbx-brand-strong)" }}>{priority}% prioridade</span>
      </div>
      <div style={{ display: "grid", gap: 2 }}>
        <strong style={{ fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 800, letterSpacing: "-0.02em" }}>{company}</strong>
        <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>{segment}</span>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center", padding: "0.3rem 0.55rem", borderRadius: 999, border: "1px solid var(--border-hairline)", background: "color-mix(in srgb, var(--hbx-surface-raised) 60%, var(--hbx-surface))", fontSize: "0.72rem", fontWeight: 700 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/hbx-theme/assets/icons/whatsapp.svg" width="14" height="14" alt="" />{channel}
        </span>
      </div>
      {action && (
        <button onClick={action} style={{ marginTop: 2, minHeight: 40, border: "none", borderRadius: "var(--control-radius)", cursor: "pointer", fontFamily: "var(--font-body)", fontWeight: 800, fontSize: "0.8rem", color: "#06121A", background: "linear-gradient(135deg, var(--hbx-mint) 0%, #fff 100%)", boxShadow: "0 12px 24px -16px color-mix(in srgb, var(--hbx-mint) 70%, transparent)" }}>
          Próxima melhor ação: chamar agora
        </button>
      )}
    </article>
  );
}

function Dashboard() {
  const [toast, setToast] = useState<string | null>(null);
  return (
    <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
      <div style={{ ...glass, padding: "1.1rem 1.25rem", borderRadius: "var(--hero-radius)",
        background: "radial-gradient(circle at top right, var(--hbx-hero-spotlight), transparent 32%), linear-gradient(145deg, var(--hbx-hero-from), var(--hbx-hero-to))" }}>
        <span style={overline}>Resumo do dia</span>
        <h1 style={{ margin: "6px 0 6px", fontFamily: "var(--font-display)", fontSize: "1.7rem", fontWeight: 900, letterSpacing: "-0.05em", lineHeight: 1 }}>Bom dia, Marina. 12 leads quentes esperando.</h1>
        <p style={{ margin: 0, maxWidth: "66ch", fontSize: "0.84rem", lineHeight: 1.5, color: "var(--text-muted)" }}>A esteira priorizou os contatos com maior chance de fechar hoje. Comece pelos quentes e deixe o Recovery rodar a régua automática.</p>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(4, 1fr)" }}>
        <Stat label="Leads na esteira" value="1.284" delta="+18% hoje" />
        <Stat label="Recuperado (mês)" value="R$ 86.4k" delta="+9% vs. abril" />
        <Stat label="Pendente" value="R$ 42.380" delta="-6% vs. ontem" tone="danger" />
        <Stat label="Conversas abertas" value="37" delta="+4 na última hora" />
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1.4fr 1fr", alignItems: "start" }}>
        <section style={{ ...glass, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "grid", gap: 2 }}><span style={overline}>Esteira mobile</span><strong style={{ fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 800, letterSpacing: "-0.03em" }}>Próximos na fila</strong></div>
            <button style={btn("secondary")}>Ver todos</button>
          </div>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
            <LeadCard hot company="Assistência Técnica Local" segment="Eletrônicos · Campinas/SP" channel="WhatsApp provável" priority={87} action={() => setToast("Abrindo conversa com Assistência Técnica Local…")} />
            <LeadCard company="Auto Center Sul" segment="Automotivo · Sorocaba/SP" channel="Telefone" priority={54} />
            <LeadCard company="Padaria Pão Nosso" segment="Alimentação · Campinas/SP" channel="Instagram" priority={61} />
            <LeadCard hot company="Studio Bella Estética" segment="Beleza · Jundiaí/SP" channel="WhatsApp provável" priority={79} action={() => setToast("Abrindo conversa com Studio Bella Estética…")} />
          </div>
        </section>

        <section style={{ ...glass, padding: 16, background: "radial-gradient(circle at top right, color-mix(in srgb, var(--hbx-warning) 16%, transparent), transparent 44%), linear-gradient(180deg, var(--hbx-surface), var(--hbx-surface-soft))" }}>
          <span style={overline}>Recovery</span>
          <strong style={{ display: "block", fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 800, letterSpacing: "-0.03em", margin: "2px 0 12px" }}>Régua de cobrança ativa</strong>
          {([["Parcela atrasada · Auto Center Sul", "R$ 1.240", "Follow-up hoje 14h"],
            ["Orçamento parado · Padaria Pão Nosso", "R$ 680", "Lembrete enviado"],
            ["Cliente sumido · Studio Bella", "R$ 2.100", "Reativação agendada"]] as [string, string, string][]).map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "0.6rem 0", borderTop: i ? "1px solid var(--border-hairline)" : "none" }}>
              <div style={{ display: "grid", gap: 2 }}>
                <span style={{ fontSize: "0.78rem", fontWeight: 700 }}>{r[0]}</span>
                <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{r[2]}</span>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", fontWeight: 700, color: "color-mix(in srgb, var(--hbx-warning) 64%, var(--hbx-foreground))" }}>{r[1]}</span>
            </div>
          ))}
        </section>
      </div>

      {toast && (
        <div onClick={() => setToast(null)} style={{ position: "fixed", bottom: 22, right: 22, ...glass, padding: "0.8rem 1.1rem", borderRadius: "var(--radius-md)", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer", zIndex: 30 }}>
          {toast}
        </div>
      )}
    </div>
  );
}

const CONVOS = [
  { id: 1, name: "Auto Center Sul", last: "Pode marcar 👍", time: "09:34", unread: 0, status: "live" },
  { id: 2, name: "Studio Bella Estética", last: "Qual o valor da limpeza de pele?", time: "09:21", unread: 2, status: "online" },
  { id: 3, name: "Padaria Pão Nosso", last: "Bot: transferido para humano", time: "08:58", unread: 0, status: "busy" },
  { id: 4, name: "Mercado União", last: "Obrigado pelo atendimento!", time: "Ontem", unread: 0, status: "offline" },
];

type WsMsg = { dir: "system" | "in" | "out"; text: string; time?: string; author?: string };

function Inbox() {
  const [active, setActive] = useState(1);
  const [thread, setThread] = useState<WsMsg[]>([
    { dir: "system", text: "Bot HBX iniciou o atendimento" },
    { dir: "in", text: "Oi, a peça que pedi já chegou?", time: "09:32", author: "Auto Center Sul" },
    { dir: "out", text: "Chegou sim! Posso agendar a troca pra amanhã?", time: "09:33" },
    { dir: "in", text: "Perfeito, pode marcar 👍", time: "09:34", author: "Auto Center Sul" },
  ]);
  const [draft, setDraft] = useState("");
  const convo = CONVOS.find((c) => c.id === active)!;

  function send() {
    if (!draft.trim()) return;
    setThread((t) => [...t, { dir: "out", text: draft.trim(), time: "agora" }]);
    setDraft("");
  }

  const dotColor: Record<string, string> = { live: "var(--hbx-brand-strong)", online: "var(--hbx-success)", busy: "var(--hbx-warning)", offline: "var(--hbx-muted)" };

  return (
    <div style={{ ...glass, display: "grid", gridTemplateColumns: "300px 1fr", padding: 0, overflow: "hidden", height: "calc(100vh - 24px - 66px - 12px)" }}>
      <aside style={{ borderRight: "1px solid var(--border-hairline)", display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ padding: 14, borderBottom: "1px solid var(--border-hairline)" }}>
          <span style={overline}>Atendimento</span>
          <input placeholder="Buscar conversa" style={{ marginTop: 8, width: "100%", minHeight: 38, borderRadius: "var(--control-radius)", border: "1px solid var(--border-hairline)", padding: "0 12px", fontFamily: "var(--font-body)", fontSize: "0.82rem", background: "var(--hbx-field-surface)", outline: "none" }} />
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {CONVOS.map((c) => (
            <button key={c.id} onClick={() => setActive(c.id)} style={{ width: "100%", display: "flex", gap: 11, alignItems: "center", padding: "0.7rem 0.85rem", textAlign: "left", cursor: "pointer", border: "none", color: "var(--text-strong)", fontFamily: "var(--font-body)", borderLeft: "3px solid " + (active === c.id ? "var(--hbx-brand)" : "transparent"), background: active === c.id ? "color-mix(in srgb, var(--hbx-brand) 8%, var(--hbx-surface))" : "transparent" }}>
              <span style={{ position: "relative", display: "inline-grid", placeItems: "center", width: 38, height: 38, borderRadius: 12, color: "#fff", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "0.74rem", flex: "0 0 auto", background: "linear-gradient(140deg, var(--hbx-brand), var(--hbx-brand-strong))" }}>
                {c.name.split(" ").slice(0, 2).map((w) => w[0]).join("")}
                <span style={{ position: "absolute", right: -1, bottom: -1, width: 11, height: 11, borderRadius: 999, background: dotColor[c.status], border: "2px solid var(--hbx-surface)" }} />
              </span>
              <span style={{ display: "grid", gap: 1, minWidth: 0, flex: 1 }}>
                <span style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                  <strong style={{ fontSize: "0.8rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</strong>
                  <small style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--text-muted)" }}>{c.time}</small>
                </span>
                <span style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "center" }}>
                  <small style={{ fontSize: "0.72rem", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.last}</small>
                  {c.unread > 0 && <span style={{ flex: "0 0 auto", minWidth: 18, height: 18, borderRadius: 999, display: "grid", placeItems: "center", fontSize: "0.62rem", fontWeight: 800, color: "#fff", background: "var(--hbx-brand)" }}>{c.unread}</span>}
                </span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section style={{ display: "flex", flexDirection: "column", minHeight: 0, background: "var(--hbx-surface-soft)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border-hairline)", background: "var(--hbx-surface)" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ display: "inline-grid", placeItems: "center", width: 36, height: 36, borderRadius: 11, color: "#fff", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "0.72rem", background: "linear-gradient(140deg, var(--hbx-brand), var(--hbx-brand-strong))" }}>
              {convo.name.split(" ").slice(0, 2).map((w) => w[0]).join("")}
            </span>
            <div style={{ display: "grid", gap: 1 }}>
              <strong style={{ fontSize: "0.88rem", fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}>{convo.name}</strong>
              <small style={{ fontSize: "0.66rem", color: "var(--text-muted)" }}>WhatsApp · online agora</small>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btn("secondary")}>Transferir</button>
            <button style={btn("secondary")}>Recovery</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 4 }}>
          {thread.map((m, i) => {
            if (m.dir === "system") return <div key={i} style={{ display: "flex", justifyContent: "center", margin: "4px 0" }}><span style={{ padding: "0.3rem 0.7rem", borderRadius: 999, background: "var(--hbx-chat-system)", border: "1px solid var(--border-hairline)", fontSize: "0.7rem", fontWeight: 600, color: "var(--text-muted)" }}>{m.text}</span></div>;
            const out = m.dir === "out";
            return (
              <div key={i} style={{ display: "flex", justifyContent: out ? "flex-end" : "flex-start", margin: "2px 0" }}>
                <div style={{ maxWidth: "72%", padding: "0.55rem 0.75rem 0.4rem", borderRadius: out ? "16px 16px 4px 16px" : "16px 16px 16px 4px", background: out ? "var(--hbx-chat-outbound)" : "var(--hbx-chat-inbound)", border: "1px solid var(--border-hairline)", boxShadow: "var(--shadow-inset), var(--shadow-xs)" }}>
                  {m.author && !out && <div style={{ fontSize: "0.66rem", fontWeight: 800, color: "var(--hbx-brand-strong)", marginBottom: 2 }}>{m.author}</div>}
                  <div style={{ fontSize: "0.84rem", lineHeight: 1.45 }}>{m.text}</div>
                  {m.time && <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--text-muted)", textAlign: "right", marginTop: 2 }}>{m.time}</div>}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 10, padding: 14, borderTop: "1px solid var(--border-hairline)", background: "var(--hbx-surface)" }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Escreva uma mensagem…"
            style={{ flex: 1, minHeight: 44, borderRadius: "var(--control-radius)", border: "1px solid var(--border-hairline)", padding: "0 14px", fontFamily: "var(--font-body)", fontSize: "0.86rem", background: "var(--hbx-field-surface)", outline: "none" }} />
          <button onClick={send} style={btn("primary")}>Enviar</button>
        </div>
      </section>
    </div>
  );
}

// Vistas friendly dedicadas (embelezamento 12/06/2026, ordem do dono):
// visuais na linguagem glass do handoff — ligam no backend na fase técnica.
function SectionGlass({ over, title, action, children }: { over: string; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section style={{ ...glass, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "grid", gap: 2 }}>
          <span style={overline}>{over}</span>
          <strong style={{ fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 800, letterSpacing: "-0.03em" }}>{title}</strong>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function GlassRow({ titulo, sub, valor, tone }: { titulo: string; sub: string; valor?: string; tone?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "0.6rem 0", borderTop: "1px solid var(--border-hairline)" }}>
      <div style={{ display: "grid", gap: 2 }}>
        <span style={{ fontSize: "0.78rem", fontWeight: 700 }}>{titulo}</span>
        <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{sub}</span>
      </div>
      {valor && <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.78rem", fontWeight: 700, color: tone || "var(--hbx-brand-strong)" }}>{valor}</span>}
    </div>
  );
}

function RadarViewW() {
  return (
    <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(4, 1fr)" }}>
        <Stat label="Leads na base" value="—" delta="coleta liga amanhã" />
        <Stat label="Coletas no mês" value="—" delta="" />
        <Stat label="E-mails validados" value="—" delta="" />
        <Stat label="Quentes (score ≥ 70)" value="—" delta="" />
      </div>
      <SectionGlass over="Radar · procurador" title="Última coleta" action={<button style={btn("primary")}>▶ Executar coleta</button>}>
        <GlassRow titulo="Nenhuma coleta neste dispositivo" sub="Use o modo Corporativo para coletar agora — a vista friendly liga na fase técnica" />
      </SectionGlass>
    </div>
  );
}

function VendasViewW() {
  return (
    <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(4, 1fr)" }}>
        <Stat label="Para hoje" value="—" delta="agenda liga amanhã" />
        <Stat label="Atrasados" value="—" delta="" tone="danger" />
        <Stat label="Agendados" value="—" delta="" />
        <Stat label="Fechados" value="—" delta="" />
      </div>
      <SectionGlass over="Vendas · agenda de retorno" title="Retornos do dia" action={<button style={btn("secondary")}>Abrir pipeline</button>}>
        <GlassRow titulo="Sem retornos carregados" sub="O board real já vive no modo Corporativo — esta vista liga na fase técnica" />
      </SectionGlass>
    </div>
  );
}

function BotViewW() {
  return (
    <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
      <SectionGlass over="Bot · automação" title="HBX Bot" action={<button style={btn("primary")}>Testar bot</button>}>
        <GlassRow titulo="Boas-vindas" sub="Mensagem inicial do atendimento automático" valor="—" />
        <GlassRow titulo="Menu principal" sub="Opções oferecidas ao contato" valor="—" />
        <GlassRow titulo="Transferência humana" sub="Quando o bot chama você" valor="—" />
      </SectionGlass>
      <SectionGlass over="Status" title="Configuração">
        <GlassRow titulo="Setup do bot" sub="Conclui na fase técnica — config real já existe no backend" valor="pendente" tone="var(--hbx-warning)" />
      </SectionGlass>
    </div>
  );
}

function RelatoriosViewW() {
  return (
    <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(4, 1fr)" }}>
        <Stat label="Cards recebidos" value="—" delta="liga amanhã" />
        <Stat label="Chamados" value="—" delta="" />
        <Stat label="Taxa de resposta" value="—" delta="" />
        <Stat label="Conversão" value="—" delta="" />
      </div>
      <SectionGlass over="Relatórios · período" title="Resumo da operação" action={<button style={btn("secondary")}>Exportar</button>}>
        <GlassRow titulo="Top segmento" sub="Melhor origem de resultado no período" valor="—" />
        <GlassRow titulo="Melhor canal" sub="Canal com mais respostas" valor="—" />
        <GlassRow titulo="Melhor cidade" sub="Região mais quente" valor="—" />
      </SectionGlass>
    </div>
  );
}

function ConfigViewW() {
  return (
    <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
      <SectionGlass over="Conta" title="Perfil" action={<button style={btn("primary")}>Salvar</button>}>
        <GlassRow titulo="Nome" sub="Como você aparece para a equipe" valor="—" />
        <GlassRow titulo="E-mail" sub="Acesso e notificações" valor="—" />
      </SectionGlass>
      <SectionGlass over="Empresa" title="Dados da empresa">
        <GlassRow titulo="Razão social" sub="Cadastro da conta" valor="—" />
        <GlassRow titulo="WhatsApp" sub="Conexão do atendimento" valor="—" />
      </SectionGlass>
    </div>
  );
}

const META: Record<string, { title: string; subtitle: string; view: React.ReactNode }> = {
  inicio: { title: "Início", subtitle: "Workspace · operação", view: <Dashboard /> },
  leads: { title: "Esteira de leads", subtitle: "Prospecção · mobile", view: <Dashboard /> },
  webscraping: { title: "Radar", subtitle: "Coleta · enriquecimento", view: <RadarViewW /> },
  vendas: { title: "Vendas", subtitle: "Pipeline · funil", view: <VendasViewW /> },
  atendimento: { title: "Atendimento", subtitle: "Inbox · WhatsApp", view: <Inbox /> },
  bot: { title: "Bot", subtitle: "Automação · fluxos", view: <BotViewW /> },
  relatorios: { title: "Relatórios", subtitle: "Indicadores · desempenho", view: <RelatoriosViewW /> },
  recovery: { title: "Recovery", subtitle: "Cobrança · reativação", view: <Dashboard /> },
  cadastros: { title: "Cadastros", subtitle: "Base · empresas", view: <Dashboard /> },
  configuracoes: { title: "Configurações", subtitle: "Conta · preferências", view: <ConfigViewW /> },
};

export function WorkspaceClient() {
  const [view, setView] = useState("inicio");
  const m = META[view];
  return (
    <div className="shell">
      <Rail view={view} setView={setView} />
      <main style={{ display: "grid", gridTemplateRows: "auto 1fr", gap: 12, minWidth: 0 }}>
        <TopBar title={m.title} subtitle={m.subtitle} />
        {m.view}
      </main>
    </div>
  );
}
