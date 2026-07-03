"use client";

// /master — a casa do USERMASTER (PLAN12062026002 FOCO 1).
// Tela master-only: não vem do handoff docs/TEMAS (não existe lá); usa o
// padrão único do kit (tokens hbx-theme + classes do shell) com navegação
// própria de janelas. Guard: useCurrentUser().isSystemMaster.
// Backend: controllers master já existentes — esta tela só liga endpoints.

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";

import { Av, I, ICONS, ModeToggle, currentUserDisplayName, useCurrentUser } from "@/components/hbx/shell";
import { apiFetch, clearToken } from "@/lib/api";
import { useTabParam } from "@/lib/use-tab-param";

import { JanelaCockpit } from "./janela-cockpit";
import { JanelaContabil } from "./janela-contabil";
import { JanelaEmails } from "./janela-emails";
import { JanelaEmpresas } from "./janela-empresas";
import { JanelaOnline } from "./janela-online";
import { JanelaIntegracoes } from "./janela-integracoes";
import { JanelaSelfCheckout } from "./janela-self-checkout";
import { JanelaPagamentos } from "./janela-pagamentos";
import { JanelaSistema } from "./janela-sistema";
import { JanelaTickets } from "./janela-tickets";

// Shape de GET /modules/master/companies (modules.service.listMasterOverview)
export type MasterCompany = {
  id: number;
  name: string;
  slug?: string | null;
  primaryContactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  taxDocument?: string | null;
  isActive?: boolean;
  status?: string | null;
  paymentMethod?: string | null;
  billingProvider?: string | null;
  trialStartsAt?: string | null;
  trialEndsAt?: string | null;
  subscriptionCurrentPeriodStart?: string | null;
  subscriptionCurrentPeriodEnd?: string | null;
  whatsappStatus?: string | null;
  whatsappSituation?: {
    mode?: string | null;
    status?: "connected" | "attention" | "disconnected" | "error" | "unknown" | string | null;
    statusLabel?: string | null;
    numberLabel?: string | null;
  } | null;
  users?: {
    id: number;
    username?: string | null;
    email?: string | null;
    name?: string | null;
    role?: string;
    isActive?: boolean;
    createdAt?: string | null;
  }[];
  modules?: { key: string; name: string; enabled: boolean }[];
  tastePlanKey?: string | null;
  tasteRevertsAt?: string | null;
};

export const STATUS_LABEL: Record<string, string> = {
  trial: "Trial",
  courtesy: "Cortesia",
  pending_checkout: "Aguardando checkout",
  active: "Ativa",
  charging: "Cobrança ativa",
  suspended: "Suspensa",
  past_due: "Pagamento pendente",
  canceled: "Cancelada",
};

export function statusTagClass(status?: string | null, isActive?: boolean) {
  const s = String(status || "").toLowerCase();
  if (s === "courtesy" || s === "active" || s === "charging") return "tag teal";
  if (s === "pending_checkout" || s === "past_due") return "tag warn";
  if (s === "suspended" || s === "canceled" || isActive === false) return "tag red";
  return "tag";
}

export function statusLabel(status?: string | null) {
  const s = String(status || "").toLowerCase();
  return STATUS_LABEL[s] || (status ? String(status) : "—");
}

export function fmtData(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

export function fmtDataHora(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

const JANELAS = [
  { id: "cockpit", label: "Cockpit", icon: "vendas" },
  { id: "empresas", label: "Empresas", icon: "users" },
  { id: "online", label: "Quem está online", icon: "clock" },
  { id: "self-checkout", label: "Self-Checkout", icon: "money" },
  { id: "integracoes", label: "Integrações", icon: "config" },
  { id: "emails", label: "E-mails", icon: "mail" },
  { id: "tickets", label: "Tickets", icon: "doc" },
  { id: "pagamentos", label: "Pagamentos", icon: "money" },
  { id: "contabil", label: "Contabil", icon: "doc" },
  { id: "sistema", label: "Sistema", icon: "mark" },
] as const;

type JanelaId = (typeof JANELAS)[number]["id"];

export function MasterClient() {
  const user = useCurrentUser();
  const router = useRouter();
  const isMaster = Boolean(user?.isSystemMaster);

  const [janela, setJanela] = useTabParam<JanelaId>("janela", "empresas", JANELAS.map(j => j.id));
  const [signingOut, setSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Badge do Contabil no seletor de janelas (contagem de obrigações
  // 🔴 atrasadas / 🟡 próximas 7 dias) — a janela reporta via onBadgeChange.
  const [contabilBadge, setContabilBadge] = useState<{ atrasadas: number; proximas: number } | null>(null);

  // Lista de empresas compartilhada entre janelas (Empresas, Integrações):
  // uma chamada, recarregável após provisioning/edição.
  const [companies, setCompanies] = useState<MasterCompany[] | null>(null);
  const [companiesError, setCompaniesError] = useState<string | null>(null);

  const reloadCompanies = useCallback(() => {
    return apiFetch<MasterCompany[]>("/modules/master/companies")
      .then(res => {
        setCompanies(Array.isArray(res) ? res : []);
        setCompaniesError(null);
      })
      .catch((err: unknown) => {
        setCompanies([]);
        setCompaniesError(err instanceof Error ? err.message : "Falha ao carregar empresas.");
      });
  }, []);

  useEffect(() => {
    if (!isMaster) return;
    reloadCompanies();
  }, [isMaster, reloadCompanies]);

  // master-context (fase 2): contexto de suporte assumido — banner global
  // + assumir pela janela Empresas + sair. Tudo auditado no backend
  // (registerSupportAction via master-context.service).
  type MasterContext = { active?: boolean; companyId?: number | null; companyName?: string | null } | null;
  const [ctx, setCtx] = useState<MasterContext>(null);
  const [ctxBusy, setCtxBusy] = useState(false);
  const [ctxMsg, setCtxMsg] = useState<string | null>(null);

  const reloadContext = useCallback(() => {
    return apiFetch<MasterContext>("/master-context/current")
      .then(res => setCtx(res))
      .catch(() => setCtx(null));
  }, []);

  useEffect(() => {
    if (!isMaster) return;
    reloadContext();
  }, [isMaster, reloadContext]);

  const assumirContexto = useCallback(async (companyId: number) => {
    if (ctxBusy) return;
    setCtxBusy(true);
    setCtxMsg(null);
    try {
      await apiFetch("/master-context/assume", {
        method: "POST",
        body: JSON.stringify({ companyId, reason: "Suporte pelo painel /master" }),
      });
      await reloadContext();
      setCtxMsg(null);
    } catch (err) {
      setCtxMsg(err instanceof Error ? err.message : "Falha ao assumir o contexto.");
    } finally {
      setCtxBusy(false);
    }
  }, [ctxBusy, reloadContext]);

  async function sairContexto() {
    if (ctxBusy) return;
    setCtxBusy(true);
    setCtxMsg(null);
    try {
      await apiFetch("/master-context/exit", {
        method: "POST",
        body: JSON.stringify({ reason: "Fim do suporte pelo painel /master" }),
      });
      await reloadContext();
    } catch (err) {
      setCtxMsg(err instanceof Error ? err.message : "Falha ao sair do contexto.");
    } finally {
      setCtxBusy(false);
    }
  }

  async function sair() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // sessão já inválida — segue limpando o cliente
    }
    clearToken();
    router.replace("/login");
  }

  // perfil demorando (falha de rede/500 — o 401 já redireciona pelo
  // apiFetch): oferece saída em vez de "Carregando…" eterno
  const [perfilLento, setPerfilLento] = useState(false);
  useEffect(() => {
    if (user) return;
    const t = setTimeout(() => setPerfilLento(true), 6000);
    return () => clearTimeout(t);
  }, [user]);

  // Guard isSystemMaster: enquanto o perfil não chega, estado neutro; se o
  // usuário logado não é master, aviso amigável (mesmo padrão do dashboard).
  if (!user) {
    return (
      <div className="app">
        <div className="main" style={{ display: "grid", placeItems: "center", minHeight: "60vh", padding: 24 }}>
          {perfilLento ? (
            <section className="panel" style={{ maxWidth: 420 }}>
              <div style={{ padding: 20, display: "grid", gap: 10 }}>
                <strong style={{ fontSize: "0.86rem" }}>Não foi possível carregar seu perfil</strong>
                <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", lineHeight: 1.55 }}>
                  Sua sessão pode ter expirado ou o servidor está fora do ar.
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn-teal" onClick={() => window.location.reload()}>Recarregar</button>
                  <button className="btn-ghost" onClick={() => { clearToken(); router.replace("/login"); }}>Ir para o login</button>
                </div>
              </div>
            </section>
          ) : (
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Carregando…</span>
          )}
        </div>
      </div>
    );
  }

  if (!isMaster) {
    return (
      <div className="app">
        <div className="main" style={{ display: "grid", placeItems: "center", minHeight: "60vh", padding: 24 }}>
          <section className="panel" style={{ maxWidth: 460 }}>
            <div style={{ padding: 20, display: "grid", gap: 10 }}>
              <strong style={{ fontSize: "0.88rem" }}>Acesso restrito</strong>
              <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", lineHeight: 1.55 }}>
                O painel /master é exclusivo do usuário master do sistema. Sua conta opera pelas telas da empresa.
              </span>
              <button className="btn-teal" style={{ width: "fit-content" }} onClick={() => router.replace("/dashboard")}>
                Ir para o Dashboard
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  const ativa = JANELAS.find(j => j.id === janela) || JANELAS[0];

  return (
    <div className="app">
      <aside className="side">
        <div className="logo">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--hbx-brand)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l6 6-6 6M11 6l6 6-6 6" /></svg>
          <strong>HBX</strong>
          <span className="tag teal" style={{ marginLeft: 6 }}>Master</span>
        </div>
        {JANELAS.map(j => (
          <button key={j.id} className={"nav-item" + (j.id === janela ? " active" : "")}
            style={{ width: "100%", border: "none", background: j.id === janela ? undefined : "transparent", textAlign: "left", cursor: "pointer", font: "inherit" }}
            onClick={() => setJanela(j.id)}>
            <I d={ICONS[j.icon]} />
            {j.label}
            {j.id === "contabil" && contabilBadge && (contabilBadge.atrasadas > 0 || contabilBadge.proximas > 0) && (
              <span className={"ctb-nav-badge" + (contabilBadge.atrasadas === 0 ? " warn" : "")}>
                {contabilBadge.atrasadas > 0 ? contabilBadge.atrasadas : contabilBadge.proximas}
              </span>
            )}
          </button>
        ))}
        <div className="side-bottom">
          <button className="nav-item" style={{ width: "100%", border: "none", background: "transparent", textAlign: "left", cursor: "pointer", font: "inherit" }}
            onClick={() => router.push("/dashboard")}>
            <I d={ICONS.dash} />
            Voltar ao app
          </button>
          <div className="user-card" style={{ position: "relative" }}>
            <Av name={currentUserDisplayName(user)} size={32} />
            <div><strong>{currentUserDisplayName(user)}</strong><small>Master</small></div>
            <span className="dots" role="button" aria-label="Menu do usuário" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>⋮</span>
            {menuOpen && (
              <div className="hbx-pop" style={{ position: "absolute", right: 8, bottom: "calc(100% + 6px)", zIndex: 20, minWidth: 120, padding: 6 }}>
                <button className="btn-ghost" style={{ width: "100%", minHeight: 32, fontSize: "0.72rem" }} onClick={sair} disabled={signingOut}>
                  {signingOut ? "Saindo…" : "Sair"}
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="burger" aria-label="Menu"><span></span><span></span><span></span></button>
          <div className="page-id">
            <h1>{ativa.label}</h1>
            <div className="crumbs">Master &rsaquo; <b>{ativa.label}</b></div>
          </div>
          <div className="top-actions" style={{ marginLeft: "auto" }}>
            <ModeToggle />
            <Av name={currentUserDisplayName(user)} size={34} />
          </div>
        </header>

        <div className="work" style={{ flex: 1 }}>
          {(ctx?.active || ctxMsg) && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--hbx-warning)", background: "color-mix(in srgb, var(--hbx-warning) 8%, transparent)", fontSize: "0.74rem" }}>
              {ctx?.active ? (
                <React.Fragment>
                  <span className="tag warn">contexto assumido</span>
                  <strong>{ctx.companyName || `Empresa #${ctx.companyId}`}</strong>
                  <span style={{ color: "var(--text-muted)" }}>— suas ações de suporte são auditadas nesta empresa.</span>
                  <button className="btn-ghost" style={{ marginLeft: "auto", minHeight: 28, fontSize: "0.66rem" }} disabled={ctxBusy} onClick={sairContexto}>
                    {ctxBusy ? "Saindo…" : "Sair do contexto"}
                  </button>
                </React.Fragment>
              ) : (
                <span style={{ fontWeight: 700, color: "var(--hbx-warning)" }}>{ctxMsg}</span>
              )}
            </div>
          )}
          {janela === "cockpit" && <JanelaCockpit />}
          {janela === "empresas" && (
            <JanelaEmpresas companies={companies} error={companiesError} reload={reloadCompanies} assumirContexto={assumirContexto} />
          )}
          {janela === "online" && <JanelaOnline />}
          {janela === "self-checkout" && <JanelaSelfCheckout />}
          {janela === "integracoes" && <JanelaIntegracoes companies={companies} />}
          {janela === "emails" && <JanelaEmails />}
          {janela === "tickets" && <JanelaTickets />}
          {janela === "pagamentos" && <JanelaPagamentos />}
          {janela === "contabil" && <JanelaContabil onBadgeChange={setContabilBadge} />}
          {janela === "sistema" && <JanelaSistema />}
        </div>
      </div>
    </div>
  );
}
