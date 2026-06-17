"use client";

// Tela Leads (template docs/TEMAS/*/corporate/Leads.html) = DISTRIBUIDOR
// (arquitetura aprovada pelo dono em 11/06/2026: Radar acha → Leads
// distribui → Vendas trabalha).
//   - Base → GET /webscraping/radar/leads (mesma base do Radar)
//   - Distribuir manual → POST /webscraping/radar/leads/distribute-to-vendedores
//   - Enviar para Vendas → POST /webscraping/radar/leads/:id/send-to-vendas
//   - Vendedores → GET /users/company (admin; sem acesso = distribuição oculta)
//   - Regra automática (somente leitura) → GET /webscraping/radar/auto-distribution
// Chips de etapa viraram filtro real de status; campos sem dado mostram "—".
// "Iniciar conversa" → POST /inbox/conversations/start e abre o Atendimento
// na conversa criada (handoff via sessionStorage hbx:abrir-conversa).

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";

import { Av, I, ICONS, KpiRow, useCurrentUser } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import { useTabParam } from "@/lib/use-tab-param";
import { PuxarLeadsPanel } from "@/components/hbx/puxar-leads-panel";
import { CanalIcon, toCanal } from "@/components/hbx/canal-icon";

type RadarLead = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  emailStatus: string;
  city: string | null;
  state: string | null;
  segment: string | null;
  businessCategory: string | null;
  website: string | null;
  address: string | null;
  opportunityScore: number;
  status: string;
  recommendedChannel: string | null;
  assignedUserId: number | null;
  lastContactAt: string | null;
  lastSeenAt: string | null;
  source: string | null;
  sourceEngine: string | null;
};

type FilterOption = { value: string; label: string; count: number };

type LeadsResponse = {
  items: RadarLead[];
  total: number;
  meta?: {
    available?: boolean;
    message?: string;
    page?: number;
    limit?: number;
    availableFilters?: {
      statuses?: FilterOption[];
      scoreRanges?: FilterOption[];
    };
    // Dados CONCRETOS do funil (não score): o que o motor confirmou de verdade.
    enrichmentSummary?: {
      cardsAnalyzed?: number;
      whatsappVerified?: number;
      emailConfirmedOrProbable?: number;
      readyToCall?: number;
    };
  };
};

type CompanyUser = { id: number; name?: string | null; username?: string | null; email?: string | null; role?: string | null };

type AutoRuleFields = {
  status?: string;
  includeAdmin?: boolean;
  adminTargetStock?: number;
  targetStockPerSeller?: number;
  adminDailyLimit?: number;
  dailyLimitPerSeller?: number;
  preferredState?: string | null;
  preferredCity?: string | null;
  segment?: string | null;
};

// GET /webscraping/radar/auto-distribution → { ok, activeSellerCount, rule }
type AutoRuleResponse = { ok?: boolean; activeSellerCount?: number; rule?: AutoRuleFields } | null;

const ST_LABEL: Record<string, string> = {
  available: "Novo",
  in_attendance: "Em atendimento",
  sent_to_vendas: "Enviado a Vendas",
  imported: "No CRM",
  negative: "Negativado",
  discarded: "Descartado",
};

const ST_CLS: Record<string, string> = {
  available: "tag",
  in_attendance: "tag teal",
  sent_to_vendas: "tag teal",
  imported: "tag teal",
  negative: "tag warn",
  discarded: "tag warn",
};

// chips do template viraram filtro real de status da base
const ETAPAS: { label: string; status: string }[] = [
  { label: "Todas", status: "" },
  { label: "Novo", status: "available" },
  { label: "Em atendimento", status: "in_attendance" },
  { label: "Enviado a Vendas", status: "sent_to_vendas" },
  { label: "Negativado", status: "negative" },
];

const CH_LABEL: Record<string, { label: string; cls: string }> = {
  whatsapp: { label: "WhatsApp", cls: "chan wa" },
  email: { label: "E-mail", cls: "chan mail" },
  instagram: { label: "Instagram", cls: "chan ig" },
  call: { label: "Ligação", cls: "tag" },
  discard: { label: "Descartar", cls: "tag warn" },
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

function userLabel(u: CompanyUser) {
  return u.name || u.username || u.email || `Usuário ${u.id}`;
}

export function LeadsClient() {
  const router = useRouter();
  const me = useCurrentUser();
  const isSeller = me?.userKind === "seller";
  // comissão de venda do próprio vendedor (ordem do dono 13/06/2026: mostrar
  // a comissão dele nas ações do lead). Só aparece para vendedor e quando o
  // backend já expõe o percentual (sellerProfile.commissionPercent).
  const commissionPct = isSeller ? Number(me?.sellerProfile?.commissionPercent ?? 0) || 0 : 0;
  const [etapa, setEtapa] = useTabParam<string>("etapa", "");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [data, setData] = useState<LeadsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sel, setSel] = useState<RadarLead | null>(null);
  const [sellers, setSellers] = useState<CompanyUser[]>([]);
  const [canDistribute, setCanDistribute] = useState(false);
  const [sellerId, setSellerId] = useState("");
  const [autoRule, setAutoRule] = useState<AutoRuleResponse>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // editor da regra de auto-distribuição (decisão D do dono: edição neste PR)
  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState<AutoRuleFields>({});
  const [ruleBusy, setRuleBusy] = useState(false);
  const [ruleMsg, setRuleMsg] = useState<string | null>(null);
  // Quantos leads a lagoa tem disponíveis AGORA (vitrine) — pra a tela não
  // parecer morta quando a carteira está vazia. É o que dá pra PUXAR.
  const [poolDisponivel, setPoolDisponivel] = useState<number | null>(null);

  const loadLeads = useCallback((opts?: { page?: number; status?: string; limit?: number }) => {
    const params = new URLSearchParams();
    params.set("page", String(opts?.page ?? 1));
    // 8 linhas/página como o template — tela cabe sem rolagem (mesmo ajuste
    // do Radar, pedido do dono em 11/06/2026); o seletor "Linhas por página"
    // troca esse valor.
    params.set("limit", String(opts?.limit ?? pageSize));
    const st = opts?.status ?? etapa;
    if (st) params.set("status", st);
    return apiFetch<LeadsResponse>(`/webscraping/radar/leads?${params.toString()}`)
      .then(res => {
        setData(res);
        setLoadError(null);
        const first = res?.items?.[0] || null;
        setSel(prev => (prev && res?.items?.some(i => i.id === prev.id) ? prev : first));
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "Falha ao carregar a base de leads.");
        setData(null);
        setSel(null);
      });
  }, [etapa, pageSize]);

  useEffect(() => {
    loadLeads({ page: 1 });
    apiFetch<{ total?: number }>("/webscraping/radar/leads?scope=vitrine&limit=1")
      .then(res => setPoolDisponivel(Math.max(0, Math.trunc(Number(res?.total || 0)) || 0)))
      .catch(() => setPoolDisponivel(null));
    apiFetch<CompanyUser[]>("/users/company")
      .then(res => {
        const list = Array.isArray(res) ? res : [];
        setSellers(list);
        setCanDistribute(true);
      })
      .catch(() => {
        // sem permissão de gerencial — distribuição fica oculta
        setCanDistribute(false);
      });
    apiFetch<AutoRuleResponse>("/webscraping/radar/auto-distribution")
      .then(res => {
        setAutoRule(res);
        if (res?.rule) setRuleForm(res.rule);
      })
      .catch(() => setAutoRule(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function trocarEtapa(status: string) {
    setEtapa(status);
    setPage(1);
    setActionMsg(null);
    loadLeads({ page: 1, status });
  }

  function irParaPagina(p: number) {
    if (p < 1) return;
    setPage(p);
    loadLeads({ page: p });
  }

  function trocarPageSize(n: number) {
    const size = Number(n) || 8;
    setPageSize(size);
    setPage(1);
    loadLeads({ page: 1, limit: size });
  }

  function selecionar(row: RadarLead) {
    setSel(row);
    setActionMsg(null);
  }

  async function distribuir() {
    if (!sel?.id || !sellerId || busy) return;
    setBusy(true);
    setActionMsg(null);
    try {
      await apiFetch("/webscraping/radar/leads/distribute-to-vendedores", {
        method: "POST",
        body: JSON.stringify({ leadIds: [sel.id], userIds: [Number(sellerId)] }),
      });
      const seller = sellers.find(s => String(s.id) === sellerId);
      setActionMsg(`✓ Lead distribuído para ${seller ? userLabel(seller) : "o vendedor"}.`);
      loadLeads({ page });
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : "Não foi possível distribuir o lead.");
    } finally {
      setBusy(false);
    }
  }

  async function salvarRegra() {
    if (ruleBusy) return;
    setRuleBusy(true);
    setRuleMsg(null);
    try {
      const body: AutoRuleFields = {
        status: (ruleForm.status as AutoRuleFields["status"]) || "draft",
        includeAdmin: Boolean(ruleForm.includeAdmin),
        targetStockPerSeller: Number(ruleForm.targetStockPerSeller || 30),
        dailyLimitPerSeller: Number(ruleForm.dailyLimitPerSeller || 20),
        adminTargetStock: Number(ruleForm.adminTargetStock || 0),
        adminDailyLimit: Number(ruleForm.adminDailyLimit || 0),
        preferredState: ruleForm.preferredState || undefined,
        preferredCity: ruleForm.preferredCity || undefined,
        segment: ruleForm.segment || undefined,
      };
      await apiFetch("/webscraping/radar/auto-distribution", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setRuleMsg("✓ Regra salva.");
      const res = await apiFetch<AutoRuleResponse>("/webscraping/radar/auto-distribution").catch(() => null);
      if (res) {
        setAutoRule(res);
        if (res.rule) setRuleForm(res.rule);
      }
    } catch (err) {
      setRuleMsg(err instanceof Error ? err.message : "Não foi possível salvar a regra.");
    } finally {
      setRuleBusy(false);
    }
  }

  async function executarRegra() {
    if (ruleBusy) return;
    setRuleBusy(true);
    setRuleMsg(null);
    try {
      await apiFetch("/webscraping/radar/auto-distribution/run", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setRuleMsg("✓ Distribuição executada.");
      loadLeads({ page });
    } catch (err) {
      setRuleMsg(err instanceof Error ? err.message : "Não foi possível executar a distribuição.");
    } finally {
      setRuleBusy(false);
    }
  }

  async function enviarParaVendas() {
    if (!sel?.id || busy) return;
    setBusy(true);
    setActionMsg(null);
    try {
      await apiFetch(`/webscraping/radar/leads/${encodeURIComponent(sel.id)}/send-to-vendas`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setActionMsg("✓ Lead enviado para Vendas.");
      loadLeads({ page });
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : "Não foi possível enviar para Vendas.");
    } finally {
      setBusy(false);
    }
  }

  // POST /inbox/conversations/start (contrato do Atendimento) — abre a
  // conversa criada direto na tela de Atendimento
  async function iniciarConversa() {
    if (!sel?.phone || busy) return;
    setBusy(true);
    setActionMsg(null);
    try {
      const res = await apiFetch<{ id?: number | string }>("/inbox/conversations/start", {
        method: "POST",
        body: JSON.stringify({ phone: sel.phone, ...(sel.name ? { name: sel.name } : {}) }),
      });
      if (res?.id != null) {
        try { sessionStorage.setItem("hbx:abrir-conversa", String(res.id)); } catch { /* sem storage */ }
      }
      router.push("/atendimento");
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : "Não foi possível iniciar a conversa.");
      setBusy(false);
    }
  }

  const items = data?.items || [];
  const total = data?.total || 0;
  const limit = data?.meta?.limit || 25;
  const lastPage = Math.max(1, Math.ceil(total / limit));
  const statuses = data?.meta?.availableFilters?.statuses || [];
  const countOf = (opts: FilterOption[], value: string) => opts.find(o => o.value === value)?.count ?? 0;
  // Dados concretos (ordem do dono 14/06: "não quero quentes, nenhum é — dados concretos").
  const summary = data?.meta?.enrichmentSummary;
  const disponiveis = countOf(statuses, "available");
  const enviados = countOf(statuses, "sent_to_vendas") + countOf(statuses, "in_attendance");
  const sellerName = (id: number | null) => {
    if (!id) return null;
    const s = sellers.find(u => u.id === id);
    return s ? userLabel(s) : `Usuário ${id}`;
  };
  const l = sel;
  const ruleStatus = String(autoRule?.rule?.status || "");
  // Default do "Puxar leads": vendedor usa a própria preferência salva (gravada
  // de forma invisível ao puxar); admin/dono usa o ramo da empresa.
  const pullDefaultSegment =
    (isSeller
      ? me?.sellerProfile?.preferredSegments?.[0]
      : me?.company?.prospectingSegments?.[0]) || "";

  return (
    <React.Fragment>
        <div className="content">
          <div className="work">
            {(isSeller || canDistribute) && (
              <PuxarLeadsPanel
                key={`pull-${pullDefaultSegment || "none"}`}
                onPulled={() => loadLeads({ page: 1 })}
                defaultSegment={pullDefaultSegment}
                poolDisponivel={poolDisponivel}
                rememberOnPull={isSeller}
              />
            )}
            <KpiRow items={[
              { icon: "users", label: "Total na base", value: data ? total.toLocaleString("pt-BR") : "—", delta: "—" },
              { icon: "msg", label: "Com WhatsApp", value: summary ? (summary.whatsappVerified ?? 0).toLocaleString("pt-BR") : "—", delta: "—" },
              { icon: "plus", label: "Disponíveis na lagoa", value: poolDisponivel != null ? poolDisponivel.toLocaleString("pt-BR") : "—", delta: "—" },
              { icon: "relat", label: "Em atendimento / Vendas", value: data ? enviados.toLocaleString("pt-BR") : "—", delta: "—" },
            ]} />

            <section className="panel">
              <div className="panel-head">
                <h2>{isSeller && !canDistribute ? "Leads disponíveis" : "Leads do Radar"}</h2>
                <div className="meta">
                  {canDistribute && (
                    <button className={"tag" + (ruleStatus === "active" ? " teal" : ruleStatus === "paused" ? " warn" : "")}
                      style={{ cursor: "pointer", background: "transparent" }}
                      onClick={() => setRuleOpen(true)} title="Configurar distribuição automática">
                      Distribuição automática: {ruleStatus === "active" ? "ativa" : ruleStatus === "paused" ? "pausada" : "rascunho"} ⚙
                    </button>
                  )}
                  {ETAPAS.map(e => (
                    <button key={e.label} className="btn-ghost" onClick={() => trocarEtapa(e.status)}
                      style={e.status === etapa ? { borderColor: "var(--hbx-brand)", color: "var(--hbx-brand-strong)", background: "var(--hbx-brand-soft)" } : {}}>
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Lead</th><th>Segmento</th><th>Cidade</th><th>Canal</th><th>Score</th><th>Etapa</th><th>Responsável</th><th>Último contato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 && (
                      <tr style={{ cursor: "default" }}>
                        <td colSpan={8} style={{ textAlign: "center", color: "var(--text-muted)", padding: "26px 12px" }}>
                          {loadError
                            ? loadError
                            : data?.meta?.available === false
                              ? data?.meta?.message || "Banco do Radar indisponível neste ambiente."
                              : <React.Fragment>Nada aqui ainda. Use <strong>Puxar leads</strong> aqui em cima pra trazer leads da lagoa pra sua carteira{poolDisponivel ? ` — tem ${poolDisponivel.toLocaleString("pt-BR")} esperando` : ""}.</React.Fragment>}
                        </td>
                      </tr>
                    )}
                    {items.map(row => {
                      const ch = row.recommendedChannel ? CH_LABEL[row.recommendedChannel] : null;
                      const resp = sellerName(row.assignedUserId);
                      return (
                        <tr key={row.id} className={sel?.id === row.id ? "sel" : ""} onClick={() => selecionar(row)}>
                          <td><div style={{ display: "flex", gap: 9, alignItems: "center" }}><Av name={row.name || "—"} size={28} /><strong>{row.name || "—"}</strong></div></td>
                          <td>{row.segment || "—"}</td>
                          <td>{row.city ? `${row.city}${row.state ? ", " + row.state : ""}` : "—"}</td>
                          <td>{ch ? <span className={ch.cls + " with-ico"}>{toCanal(row.recommendedChannel) ? <CanalIcon canal={toCanal(row.recommendedChannel)!} size="sm" /> : null}{ch.label}</span> : "—"}</td>
                          <td><span className={"score-ring " + (row.opportunityScore >= 70 ? "hi" : "mid")}>{row.opportunityScore}</span></td>
                          <td><span className={ST_CLS[row.status] || "tag"}>{ST_LABEL[row.status] || row.status}</span></td>
                          <td>{resp ? <div style={{ display: "flex", gap: 7, alignItems: "center" }}><Av name={resp} size={20} />{resp}</div> : "—"}</td>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--text-muted)" }}>{fmtDate(row.lastContactAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="pager">
                Linhas por página: <select className="select-dark" style={{ minWidth: 0, minHeight: 30, padding: "0 8px" }}
                  value={pageSize} onChange={e => trocarPageSize(Number(e.target.value))} aria-label="Linhas por página">
                  {[8, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <span style={{ marginLeft: "auto" }}>
                  {total > 0
                    ? `${((page - 1) * limit + 1).toLocaleString("pt-BR")}–${Math.min(page * limit, total).toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")}`
                    : "0 de 0"}
                </span>
                <button className="pg" onClick={() => irParaPagina(page - 1)} disabled={page <= 1}>‹</button>
                {[page - 1, page, page + 1].filter(p => p >= 1 && p <= lastPage).map(p => (
                  <button key={p} className={"pg" + (p === page ? " on" : "")} onClick={() => irParaPagina(p)}>{p}</button>
                ))}
                {page + 1 < lastPage && <span>…</span>}
                {page + 1 < lastPage && <button className="pg" onClick={() => irParaPagina(lastPage)}>{lastPage}</button>}
                <button className="pg" onClick={() => irParaPagina(page + 1)} disabled={page >= lastPage}>›</button>
              </div>
            </section>
          </div>

          <aside className="ctx">
            <h3>Contexto do lead <span className="x" role="button" aria-label="Fechar contexto" title="Limpar seleção" onClick={() => { setSel(null); setActionMsg(null); }}>✕</span></h3>
            <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
              <Av name={l?.name || "—"} size={44} />
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="company">{l?.name || "Selecione um lead"}</span>
                  <span className="tag teal">Lead</span>
                </div>
                <div className="sub">{l?.segment || l?.businessCategory || "—"}</div>
              </div>
            </div>
            <div className="kv">
              <div className="row"><span className="k" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><CanalIcon canal="email" size="sm" /> E-mail</span><span className="v" style={{ fontWeight: 600, fontSize: "0.68rem" }}>{l?.email || "—"}</span></div>
              <div className="row"><span className="k" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><CanalIcon canal="telefone" size="sm" /> Telefone</span><span className="v" style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}>{l?.phone || "—"}</span></div>
              <div className="row"><span className="k" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><I d={ICONS.mapin} size={13} /> Local</span><span className="v">{l?.city ? `${l.city}${l.state ? ", " + l.state : ""}` : "—"}</span></div>
            </div>
            <div className="sep"></div>
            <div className="kv">
              <div className="row"><span className="k">Etapa atual</span><span className="v">{l ? (ST_LABEL[l.status] || l.status) : "—"}</span></div>
              <div className="row"><span className="k">Lead score</span><span className="v" style={{ fontFamily: "var(--font-mono)" }}>{l ? l.opportunityScore : "—"}</span></div>
              <div className="row"><span className="k">Canal recomendado</span><span className="v with-ico">{l?.recommendedChannel && toCanal(l.recommendedChannel) ? <CanalIcon canal={toCanal(l.recommendedChannel)!} size="sm" /> : null}{l?.recommendedChannel ? (CH_LABEL[l.recommendedChannel]?.label || l.recommendedChannel) : "—"}</span></div>
              <div className="row"><span className="k">Responsável</span><span className="v" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>{l && sellerName(l.assignedUserId) ? <React.Fragment><Av name={sellerName(l.assignedUserId)!} size={18} />{sellerName(l.assignedUserId)}</React.Fragment> : "—"}</span></div>
              <div className="row"><span className="k">Origem</span><span className="v">{l?.sourceEngine || l?.source || "—"}</span></div>
            </div>
            <div className="sep"></div>
            <div style={{ display: "grid", gap: 8 }}>
              <h3>Ações rápidas</h3>
              {actionMsg && (
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: actionMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{actionMsg}</div>
              )}
              {canDistribute && (
                <React.Fragment>
                  <select className="select-dark" value={sellerId} onChange={e => setSellerId(e.target.value)} style={{ width: "100%" }}>
                    <option value="">Escolher vendedor…</option>
                    {sellers.map(s => <option key={s.id} value={String(s.id)}>{userLabel(s)}</option>)}
                  </select>
                  <button className="btn-teal" onClick={distribuir} disabled={!sel?.id || !sellerId || busy}>
                    <I d={ICONS.users} size={14} /> {busy ? "Distribuindo…" : "Distribuir para vendedor"}
                  </button>
                </React.Fragment>
              )}
              {isSeller && commissionPct > 0 && (
                <div className="tag teal" style={{ display: "inline-flex", gap: 6, alignItems: "center", width: "fit-content" }} title="Percentual que você recebe quando este lead fecha venda">
                  <I d={ICONS.money} size={12} /> Sua comissão por venda: {commissionPct}%
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button className="btn-ghost" onClick={enviarParaVendas} disabled={!sel?.id || busy}>
                  <I d={ICONS.arrow} size={13} /> Enviar p/ Vendas{isSeller && commissionPct > 0 ? ` · ${commissionPct}%` : ""}
                </button>
                <button className="btn-ghost" onClick={iniciarConversa} disabled={!sel?.phone || busy} title={sel && !sel.phone ? "Lead sem telefone" : undefined}><I d={ICONS.msg} size={13} /> Iniciar conversa</button>
              </div>
            </div>
          </aside>
        </div>

      {ruleOpen && (
        <div className="hbx-veil to-right" onClick={e => { if (e.target === e.currentTarget) setRuleOpen(false); }}>
          <div className="hbx-drawer" style={{ width: 360, height: "100vh", overflowY: "auto", padding: "18px 16px", display: "grid", gap: 14, alignContent: "start" }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "0.9rem", fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Distribuição automática
              <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={() => setRuleOpen(false)}>✕</span>
            </h3>
            <p style={{ margin: 0, fontSize: "0.7rem", lineHeight: 1.5, color: "var(--text-muted)" }}>
              Reabastece o estoque de cards dos vendedores automaticamente.
              Vendedores ativos: <strong>{autoRule?.activeSellerCount ?? "—"}</strong>
            </p>
            {ruleMsg && (
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: ruleMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{ruleMsg}</div>
            )}
            <div className="f" style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Status da regra</label>
              <select className="select-dark" value={ruleForm.status || "draft"} onChange={e => setRuleForm(f => ({ ...f, status: e.target.value }))}>
                <option value="draft">Rascunho (não roda)</option>
                <option value="active">Ativa</option>
                <option value="paused">Pausada</option>
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div className="f" style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Estoque por vendedor</label>
                <input className="field-dark" type="number" min={1} max={500} value={ruleForm.targetStockPerSeller ?? 30}
                  onChange={e => setRuleForm(f => ({ ...f, targetStockPerSeller: Number(e.target.value) }))} />
              </div>
              <div className="f" style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Limite diário/vendedor</label>
                <input className="field-dark" type="number" min={0} max={500} value={ruleForm.dailyLimitPerSeller ?? 20}
                  onChange={e => setRuleForm(f => ({ ...f, dailyLimitPerSeller: Number(e.target.value) }))} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: "0.78rem" }}>Incluir administrador</strong>
                <div style={{ fontSize: "0.66rem", color: "var(--text-muted)" }}>O admin também recebe cards na distribuição.</div>
              </div>
              <button className={"sw" + (ruleForm.includeAdmin ? " on" : "")} role="switch" aria-checked={Boolean(ruleForm.includeAdmin)}
                onClick={() => setRuleForm(f => ({ ...f, includeAdmin: !f.includeAdmin }))}><i></i></button>
            </div>
            {ruleForm.includeAdmin && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div className="f" style={{ display: "grid", gap: 6 }}>
                  <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Estoque do admin</label>
                  <input className="field-dark" type="number" min={0} max={500} value={ruleForm.adminTargetStock ?? 0}
                    onChange={e => setRuleForm(f => ({ ...f, adminTargetStock: Number(e.target.value) }))} />
                </div>
                <div className="f" style={{ display: "grid", gap: 6 }}>
                  <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Limite diário do admin</label>
                  <input className="field-dark" type="number" min={0} max={500} value={ruleForm.adminDailyLimit ?? 0}
                    onChange={e => setRuleForm(f => ({ ...f, adminDailyLimit: Number(e.target.value) }))} />
                </div>
              </div>
            )}
            <div className="f" style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Segmento preferido</label>
              <input className="field-dark" placeholder="Ex.: clínica" value={ruleForm.segment || ""}
                onChange={e => setRuleForm(f => ({ ...f, segment: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.6fr", gap: 10 }}>
              <div className="f" style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Cidade preferida</label>
                <input className="field-dark" placeholder="Ex.: Campinas" value={ruleForm.preferredCity || ""}
                  onChange={e => setRuleForm(f => ({ ...f, preferredCity: e.target.value }))} />
              </div>
              <div className="f" style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>UF</label>
                <input className="field-dark" placeholder="SP" maxLength={2} value={ruleForm.preferredState || ""}
                  onChange={e => setRuleForm(f => ({ ...f, preferredState: e.target.value.toUpperCase() }))} />
              </div>
            </div>
            <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
              <button className="btn-teal" onClick={salvarRegra} disabled={ruleBusy}>{ruleBusy ? "Salvando…" : "Salvar regra"}</button>
              <button className="btn-ghost" onClick={executarRegra} disabled={ruleBusy || ruleStatus !== "active"}
                title={ruleStatus !== "active" ? "Ative a regra para executar" : "Distribuir agora"}>
                {ruleBusy ? "Aguarde…" : "Executar agora"}
              </button>
            </div>
          </div>
        </div>
      )}
    </React.Fragment>
  );
}
