"use client";

// Janela "Cockpit" — command center do MASTER (Camada 5 do onboarding).
// O dono OPERA a plataforma: feed do flywheel ao vivo (vendas + comissões,
// cross-company), métrica-norte "vendedores ativados", roster de empresas
// (status comercial + MRR) e drill-down god-view (empresa → vendedor → negócio).
// Backend: GET /master-cockpit/overview (JWT + MasterGuard) — SÓ leitura.
// Visual em hbx-theme/cockpit-master.css (5 Leis): só layout inline aqui.

import React, { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";

import { fmtDataHora } from "./page.client";

type SaleFeedItem = {
  leadId: string;
  at: string;
  companyId: number;
  companyName: string;
  sellerUserId: number | null;
  sellerName: string;
  planKey: string | null;
  planTitle: string | null;
  saleValue: number;
  setupValue: number;
  commissionAmount: number;
  saleStatus: string;
  commissionStatus: string;
  text: string;
};

type CommissionFeedItem = {
  id: string;
  at: string;
  companyId: number;
  companyName: string;
  sellerUserId: number | null;
  sellerName: string;
  amount: number;
  status: string;
  kind: string;
  text: string;
};

type RosterCompany = {
  id: number;
  name: string;
  slug: string | null;
  state: string;
  statusLabel: string;
  riskLevel: "stable" | "warning" | "critical" | string;
  released: boolean;
  planKey: string | null;
  planTitle: string;
  mrr: number;
  sellsHbxPlans: boolean;
  sellerCount: number;
  activatedSellerCount: number;
  createdAt: string | null;
};

type SellerDrill = {
  userId: number;
  name: string;
  email: string | null;
  companyId: number | null;
  companyName: string | null;
  activated: boolean;
  activatedAt: string | null;
  leadsAssigned: number;
  dealsClosed: number;
  commissionPayable: number;
};

// Sprint 2 — tail da trilha única de eventos do dono (MasterEvent).
type MasterEventItem = {
  id: string;
  type: string;
  severity: "info" | "attention" | "action_required" | string;
  companyId: number | null;
  companyName: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
};

// Sprint 2 — faixa de saúde v1 (cada sub-bloco é best-effort: erro no backend → null).
type WhatsappHealth = {
  total: number;
  open: number;
  connecting: number;
  closed: number;
  other: number;
  checkedAt: string;
} | null;

type HealthBlock = {
  whatsapp: WhatsappHealth;
  billing: { lastWebhookAt: string | null } | null;
  factory: { lastLeadSeenAt: string | null } | null;
} | null;

type Overview = {
  generatedAt: string;
  feed: { sales: SaleFeedItem[]; commissions: CommissionFeedItem[] };
  metrics: {
    activatedSellers: number;
    totalSellers: number;
    activationRate: number;
    salesTodayCount: number;
    salesTodayValue: number;
    salesMonthCount: number;
    salesMonthValue: number;
    commissionPayable: number;
    commissionPaidMonth: number;
    mrrTotal: number;
  };
  funnel: {
    companiesTotal: number;
    companiesReleased: number;
    companiesSelling: number;
    sellersTotal: number;
    sellersActivated: number;
  };
  roster: RosterCompany[];
  sellers: SellerDrill[];
  // Sprint 2 — só adições (opcionais: backend antigo continua rendendo a tela).
  events?: MasterEventItem[];
  health?: HealthBlock;
} | null;

const REFRESH_MS = 30000;

function brl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function riskDot(level: string) {
  if (level === "critical") return "ckm-dot bad";
  if (level === "warning") return "ckm-dot warn";
  return "ckm-dot ok";
}

function saleDot(status: string) {
  if (status === "sale_confirmed") return "ckm-dot ok";
  if (status === "canceled" || status === "inactive") return "ckm-dot bad";
  return "ckm-dot warn";
}

function commissionDot(status: string) {
  if (status === "paid") return "ckm-dot ok";
  if (status === "canceled") return "ckm-dot bad";
  return "ckm-dot warn";
}

// ── Sprint 2: eventos + faixa de saúde ─────────────────────────────────────────

function severityDot(severity: string) {
  if (severity === "action_required") return "ckm-dot bad";
  if (severity === "attention") return "ckm-dot warn";
  return "ckm-dot ok";
}

const EVENT_LABELS: Record<string, string> = {
  "sale.closed": "Venda fechada",
  "implantacao.sold": "Implantação vendida — toque à mão",
  "fullplan.requested": "HBX Full solicitado",
  "bot.config_missing": "Bot IA sem chave-mestra",
  "master_context.assumed": "Contexto de empresa assumido",
  "master_context.exited": "Contexto de empresa encerrado",
  "master_context.expired": "Contexto de empresa expirado",
};

function eventLabel(type: string) {
  return EVENT_LABELS[type] || type;
}

type PillTone = "ok" | "warn" | "bad" | "off";

// Tom da pill por IDADE do sinal: fresco=verde, envelhecendo=âmbar, parado=vermelho,
// sem sinal=neutro. Sinal "do futuro" (skew de relógio) conta como recém-chegado.
function agePillTone(iso: string | null | undefined, warnMs: number, badMs: number): PillTone {
  if (!iso) return "off";
  const age = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(age)) return "off";
  if (age <= warnMs) return "ok";
  if (age <= badMs) return "warn";
  return "bad";
}

function agoShort(iso: string | null | undefined): string {
  if (!iso) return "sem sinal";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "sem sinal";
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} d`;
}

// Pill do zap: estado dos chips lido do MOTOR AO VIVO (null = sem leitura/motor off).
function whatsappPill(wa: WhatsappHealth | undefined): { tone: PillTone; hint: string } {
  if (!wa) return { tone: "off", hint: "sem leitura do motor" };
  if (wa.total === 0) return { tone: "warn", hint: "nenhum chip no motor" };
  if (wa.open === wa.total) return { tone: "ok", hint: `${wa.open}/${wa.total} conectados` };
  if (wa.open > 0) return { tone: "warn", hint: `${wa.open}/${wa.total} conectados` };
  return { tone: "bad", hint: `0/${wa.total} conectados` };
}

// Dot interno da pill: reusa .ckm-dot (off = neutro da base, sem sufixo).
function pillDot(tone: PillTone) {
  return tone === "off" ? "ckm-dot" : "ckm-dot " + tone;
}

const H = 3600_000;
const D = 24 * H;

export function JanelaCockpit() {
  const [data, setData] = useState<Overview>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(true);
  const [feedTab, setFeedTab] = useState<"events" | "sales" | "commissions">("events");
  // Drill-down god-view: empresa selecionada → vendedores dela → negócios.
  const [drillCompanyId, setDrillCompanyId] = useState<number | null>(null);
  const [drillSellerId, setDrillSellerId] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const carregar = useCallback(() => {
    return apiFetch<Overview>("/master-cockpit/overview")
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Falha ao carregar o cockpit.");
      });
  }, []);

  const atualizar = useCallback(() => {
    setLoading(true);
    carregar().finally(() => setLoading(false));
  }, [carregar]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (!auto) {
      if (timer.current) { clearInterval(timer.current); timer.current = null; }
      return;
    }
    timer.current = setInterval(() => { carregar(); }, REFRESH_MS);
    return () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  }, [auto, carregar]);

  const m = data?.metrics;
  const funnel = data?.funnel;
  const roster = data?.roster || [];
  const sellers = data?.sellers || [];
  const sales = data?.feed.sales || [];
  const commissions = data?.feed.commissions || [];
  const events = data?.events || [];
  const health = data?.health || null;

  // Feed: eventos quando presentes; vazio → fallback pro feed atual (vendas).
  const effectiveTab = feedTab === "events" && events.length === 0 ? "sales" : feedTab;

  // Faixa de saúde v1 — zap (estado dos chips no motor), cobrança (idade do último
  // webhook de pagamento) e fábrica (idade do último lead visto pelo Radar).
  const waPill = whatsappPill(health?.whatsapp ?? undefined);
  const billingAt = health?.billing?.lastWebhookAt ?? null;
  const billingTone = health?.billing ? agePillTone(billingAt, 2 * D, 7 * D) : "off";
  const factoryAt = health?.factory?.lastLeadSeenAt ?? null;
  const factoryTone = health?.factory ? agePillTone(factoryAt, D, 3 * D) : "off";

  const drillCompany = drillCompanyId ? roster.find((r) => r.id === drillCompanyId) || null : null;
  const drillSeller = drillSellerId ? sellers.find((s) => s.userId === drillSellerId) || null : null;

  // Drill: vendedores da empresa selecionada (ou todos quando nada selecionado).
  const drillSellers = drillCompanyId
    ? sellers.filter((s) => s.companyId === drillCompanyId)
    : sellers;

  // Drill: negócios do vendedor selecionado (a partir do feed de vendas).
  const drillDeals = drillSellerId
    ? sales.filter((s) => s.sellerUserId === drillSellerId)
    : drillCompanyId
      ? sales.filter((s) => s.companyId === drillCompanyId)
      : sales;

  // Funil: maior degrau = base 100% das barras.
  const funnelSteps = funnel
    ? [
        { name: "Empresas na base", num: funnel.companiesTotal, hint: "todas as empresas cadastradas", north: false },
        { name: "Empresas operando", num: funnel.companiesReleased, hint: "com acesso liberado", north: false },
        { name: "Empresas revendedoras", num: funnel.companiesSelling, hint: "habilitadas a vender HBX", north: false },
        { name: "Vendedores na base", num: funnel.sellersTotal, hint: "usuários do tipo vendedor", north: false },
        { name: "Vendedores ATIVADOS", num: funnel.sellersActivated, hint: "iniciaram a 1ª conversa", north: true },
      ]
    : [];
  const funnelBase = Math.max(1, ...funnelSteps.map((s) => s.num));

  return (
    <React.Fragment>
      {/* Faixa de saúde v1 (Sprint 2): zap · cobrança · fábrica */}
      <div className="ckm-health">
        <span className={"ckm-pill " + waPill.tone} title="Estado dos chips lido do motor ao vivo (cache de 60 s)">
          <span className={pillDot(waPill.tone)} />
          WhatsApp <em>{waPill.hint}</em>
        </span>
        <span className={"ckm-pill " + billingTone} title="Último webhook de pagamento processado">
          <span className={pillDot(billingTone)} />
          Cobrança <em>{health?.billing ? (billingAt ? `webhook ${agoShort(billingAt)}` : "sem webhook ainda") : "sem leitura"}</em>
        </span>
        <span className={"ckm-pill " + factoryTone} title="Último lead visto pela fábrica (Radar)">
          <span className={pillDot(factoryTone)} />
          Fábrica <em>{health?.factory ? (factoryAt ? `lead ${agoShort(factoryAt)}` : "sem lead ainda") : "sem leitura"}</em>
        </span>
      </div>

      {/* Faixa de KPIs */}
      <div className="ckm-kpis">
        <div className="ckm-kpi ckm-kpi-north">
          <span className="ckm-kpi-label">Vendedores ativados</span>
          <strong className="ckm-kpi-value">{m ? m.activatedSellers : "—"}</strong>
          <span className="ckm-kpi-sub">
            {m ? `${m.activatedSellers}/${m.totalSellers} · ${m.activationRate}% da base` : "indicador-líder do flywheel"}
          </span>
        </div>
        <div className="ckm-kpi">
          <span className="ckm-kpi-label">Vendas hoje</span>
          <strong className="ckm-kpi-value">{m ? m.salesTodayCount : "—"}</strong>
          <span className="ckm-kpi-sub">{m ? brl(m.salesTodayValue) : "fechamentos do dia"}</span>
        </div>
        <div className="ckm-kpi">
          <span className="ckm-kpi-label">Vendas no mês</span>
          <strong className="ckm-kpi-value">{m ? m.salesMonthCount : "—"}</strong>
          <span className="ckm-kpi-sub">{m ? brl(m.salesMonthValue) : "fechamentos do mês"}</span>
        </div>
        <div className="ckm-kpi ckm-kpi-money">
          <span className="ckm-kpi-label">MRR ativo</span>
          <strong className="ckm-kpi-value">{m ? brl(m.mrrTotal) : "—"}</strong>
          <span className="ckm-kpi-sub">receita recorrente das empresas pagantes</span>
        </div>
        <div className="ckm-kpi ckm-kpi-money">
          <span className="ckm-kpi-label">Comissão a pagar</span>
          <strong className="ckm-kpi-value">{m ? brl(m.commissionPayable) : "—"}</strong>
          <span className="ckm-kpi-sub">{m ? `pagas no mês: ${brl(m.commissionPaidMonth)}` : "fila de comissão"}</span>
        </div>
      </div>

      {/* Feed do flywheel + funil */}
      <div className="ckm-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Feed do flywheel</h2>
            <div className="meta" style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {error && <span className="ckm-error">{error}</span>}
              {data?.generatedAt && (
                <span style={{ fontSize: "0.62rem" }}>atualizado {fmtDataHora(data.generatedAt)}</span>
              )}
              <label style={{ display: "flex", gap: 5, alignItems: "center", fontSize: "0.66rem", cursor: "pointer" }}>
                <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                auto (30s)
              </label>
              <button className="btn-ghost" style={{ minHeight: 26, fontSize: "0.62rem" }} disabled={loading} onClick={atualizar}>
                {loading ? "…" : "Atualizar"}
              </button>
            </div>
          </div>
          <div style={{ padding: "12px 16px 6px" }}>
            <div className="ckm-tabs">
              {events.length > 0 && (
                <button className={"ckm-tab" + (effectiveTab === "events" ? " active" : "")} onClick={() => setFeedTab("events")}>
                  Eventos ({events.length})
                </button>
              )}
              <button className={"ckm-tab" + (effectiveTab === "sales" ? " active" : "")} onClick={() => setFeedTab("sales")}>
                Vendas ({sales.length})
              </button>
              <button className={"ckm-tab" + (effectiveTab === "commissions" ? " active" : "")} onClick={() => setFeedTab("commissions")}>
                Comissões ({commissions.length})
              </button>
            </div>
          </div>
          <div className="ckm-feed">
            {data === null && !error && <div className="ckm-empty">Carregando o feed…</div>}
            {effectiveTab === "sales" && data !== null && sales.length === 0 && (
              <div className="ckm-empty">Nenhuma venda no feed ainda — o fluxo nasce no primeiro fechamento.</div>
            )}
            {effectiveTab === "commissions" && data !== null && commissions.length === 0 && (
              <div className="ckm-empty">Nenhuma comissão no feed ainda.</div>
            )}
            {effectiveTab === "events" &&
              events.map((ev) => (
                <div
                  key={ev.id}
                  className={"ckm-feed-item" + (ev.companyId && drillCompanyId === ev.companyId ? " sel" : "")}
                  onClick={() => {
                    if (ev.companyId) { setDrillCompanyId(ev.companyId); setDrillSellerId(null); }
                  }}
                  title={ev.companyId ? "Abrir no drill-down" : undefined}
                >
                  <span className={severityDot(ev.severity)} />
                  <div className="ckm-feed-body">
                    <span className="ckm-feed-line">
                      <strong>{ev.companyName || "Plataforma"}</strong> · {eventLabel(ev.type)}
                    </span>
                    <span className="ckm-feed-meta">{ev.severity} · {fmtDataHora(ev.createdAt)}</span>
                  </div>
                </div>
              ))}
            {effectiveTab === "sales" &&
              sales.map((s) => (
                <div
                  key={s.leadId}
                  className={"ckm-feed-item" + (drillCompanyId === s.companyId ? " sel" : "")}
                  onClick={() => { setDrillCompanyId(s.companyId); setDrillSellerId(s.sellerUserId); }}
                  title="Abrir no drill-down"
                >
                  <span className={saleDot(s.saleStatus)} />
                  <div className="ckm-feed-body">
                    <span className="ckm-feed-line">
                      <strong>{s.companyName}</strong> · {s.sellerName} fechou {s.planTitle || "venda"}
                    </span>
                    <span className="ckm-feed-meta">{s.saleStatus} · {fmtDataHora(s.at)}</span>
                  </div>
                  <span className="ckm-feed-amount">{brl(s.saleValue)}</span>
                </div>
              ))}
            {effectiveTab === "commissions" &&
              commissions.map((c) => (
                <div
                  key={c.id}
                  className={"ckm-feed-item" + (drillSellerId === c.sellerUserId ? " sel" : "")}
                  onClick={() => { setDrillCompanyId(c.companyId); setDrillSellerId(c.sellerUserId); }}
                  title="Abrir no drill-down"
                >
                  <span className={commissionDot(c.status)} />
                  <div className="ckm-feed-body">
                    <span className="ckm-feed-line">
                      <strong>{c.companyName}</strong> · comissão de {c.sellerName}
                    </span>
                    <span className="ckm-feed-meta">{c.status} · {fmtDataHora(c.at)}</span>
                  </div>
                  <span className={"ckm-feed-amount" + (c.status === "canceled" ? " muted" : "")}>{brl(c.amount)}</span>
                </div>
              ))}
          </div>
        </section>

        {/* Funil de aquisição */}
        <section className="panel">
          <div className="panel-head">
            <h2>Funil de aquisição</h2>
            <div className="meta">indicador-líder</div>
          </div>
          <div className="ckm-funnel">
            {funnelSteps.length === 0 && <div className="ckm-empty">Sem leitura ainda.</div>}
            {funnelSteps.map((step) => (
              <div key={step.name} className="ckm-funnel-step">
                <div className="ckm-funnel-top">
                  <span className="ckm-funnel-name">{step.name}</span>
                  <span className="ckm-funnel-num">{step.num}</span>
                </div>
                <div className="ckm-funnel-bar">
                  <div
                    className={"ckm-funnel-fill" + (step.north ? " north" : "")}
                    style={{ width: `${Math.round((step.num / funnelBase) * 100)}%` }}
                  />
                </div>
                <span className="ckm-funnel-hint">{step.hint}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Roster de empresas (status comercial + MRR) */}
      <section className="panel">
        <div className="panel-head">
          <h2>Empresas ({roster.length})</h2>
          <div className="meta">status comercial · MRR · vendedores</div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Status</th>
                <th>Plano</th>
                <th>MRR</th>
                <th>Vendedores</th>
                <th>Ativados</th>
              </tr>
            </thead>
            <tbody>
              {data === null && !error && (
                <tr><td colSpan={6} className="ckm-muted-cell">Carregando…</td></tr>
              )}
              {data !== null && roster.length === 0 && (
                <tr><td colSpan={6} className="ckm-muted-cell">Nenhuma empresa na base.</td></tr>
              )}
              {roster.map((r) => (
                <tr
                  key={r.id}
                  className={drillCompanyId === r.id ? "sel" : ""}
                  onClick={() => { setDrillCompanyId(drillCompanyId === r.id ? null : r.id); setDrillSellerId(null); }}
                >
                  <td>
                    <div className="co" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span className={riskDot(r.riskLevel)} />
                      <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                        <strong>{r.name}</strong>
                        <span className="sub2">#{r.id}{r.sellsHbxPlans ? " · revende HBX" : ""}</span>
                      </div>
                    </div>
                  </td>
                  <td><span className="ckm-funnel-name">{r.statusLabel}</span></td>
                  <td>{r.planTitle}</td>
                  <td style={{ fontWeight: 700 }}>{r.mrr > 0 ? brl(r.mrr) : "—"}</td>
                  <td>{r.sellerCount}</td>
                  <td>{r.activatedSellerCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Drill-down god-view: empresa → vendedor → negócio */}
      <section className="panel">
        <div className="panel-head">
          <h2>Drill-down god-view</h2>
          <div className="meta">empresa → vendedor → negócio</div>
        </div>
        <div className="ckm-drill-bar">
          <span
            className={"ckm-crumb" + (!drillCompanyId ? " active" : "")}
            onClick={() => { setDrillCompanyId(null); setDrillSellerId(null); }}
          >
            Todas as empresas
          </span>
          {drillCompany && (
            <React.Fragment>
              <span className="ckm-crumb-sep">›</span>
              <span
                className={"ckm-crumb" + (!drillSellerId ? " active" : "")}
                onClick={() => setDrillSellerId(null)}
              >
                {drillCompany.name}
              </span>
            </React.Fragment>
          )}
          {drillSeller && (
            <React.Fragment>
              <span className="ckm-crumb-sep">›</span>
              <span className="ckm-crumb active">{drillSeller.name}</span>
            </React.Fragment>
          )}
        </div>

        {/* Nível 2: vendedores */}
        {!drillSellerId && (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th>Empresa</th>
                  <th>Ativação</th>
                  <th>Leads</th>
                  <th>Vendas</th>
                  <th>Comissão a pagar</th>
                </tr>
              </thead>
              <tbody>
                {drillSellers.length === 0 && (
                  <tr><td colSpan={6} className="ckm-muted-cell">Nenhum vendedor neste recorte.</td></tr>
                )}
                {drillSellers.map((s) => (
                  <tr key={s.userId} onClick={() => setDrillSellerId(s.userId)}>
                    <td>
                      <div className="co">
                        <strong>{s.name}</strong>
                        <span className="sub2">{s.email || `#${s.userId}`}</span>
                      </div>
                    </td>
                    <td>{s.companyName || "—"}</td>
                    <td>
                      <span className={"ckm-act" + (s.activated ? "" : " off")}>
                        {s.activated ? "ativado" : "dormindo"}
                      </span>
                    </td>
                    <td>{s.leadsAssigned}</td>
                    <td>{s.dealsClosed}</td>
                    <td style={{ fontWeight: 700 }}>{s.commissionPayable > 0 ? brl(s.commissionPayable) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Nível 3: negócios do vendedor */}
        {drillSellerId && (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Cliente / lead</th>
                  <th>Plano</th>
                  <th>Valor</th>
                  <th>Comissão</th>
                  <th>Situação</th>
                  <th>Quando</th>
                </tr>
              </thead>
              <tbody>
                {drillDeals.length === 0 && (
                  <tr><td colSpan={6} className="ckm-muted-cell">Nenhum negócio fechado por este vendedor.</td></tr>
                )}
                {drillDeals.map((d) => (
                  <tr key={d.leadId} style={{ cursor: "default" }}>
                    <td><strong>{d.companyName}</strong></td>
                    <td>{d.planTitle || "—"}</td>
                    <td>{brl(d.saleValue)}</td>
                    <td>{d.commissionAmount > 0 ? brl(d.commissionAmount) : "—"}</td>
                    <td><span className="ckm-funnel-name">{d.saleStatus}</span></td>
                    <td>{fmtDataHora(d.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </React.Fragment>
  );
}
