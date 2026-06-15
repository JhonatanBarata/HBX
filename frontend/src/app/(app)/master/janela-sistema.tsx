"use client";

// Janela Sistema — fase 3 do /master (ordem do dono 12/06/2026: "ligue tudo").
// Contratos ligados (ModulesController, todos JWT+MasterGuard):
//   GET/PUT modules/master/system-modules[/:key]   → catálogo de módulos
//   GET     modules/master/global-integrations     → política + bibliotecas
//   PUT     modules/master/billing-policy          → desconto anual/assento extra/indicação
//   PUT     modules/master/global-integrations     → bibliotecas de credenciais
//     (accessToken vazio MANTÉM o segredo atual — preserve*Secrets do service)
//   GET     modules/master/exclusoes               → lixeira global (records + radar)
//   PATCH   .../exclusoes/radar-cards/:id/restore  → devolve card removido
//   DELETE  .../exclusoes/:id | /exclusoes/batch   → exclusão definitiva
//   GET     modules/master/vendas-complaints       → reclamações de cards
//   PATCH   .../vendas-complaints/:id              → {status, internalNote, refundCards}
//   DELETE  .../vendas-complaints/batch            → limpeza

import React, { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { useTabIndex } from "@/lib/use-tab-param";
import { PlanosEditor } from "@/components/hbx/planos-editor";
import { MetaWhatsAppEditor } from "@/components/hbx/meta-whatsapp-editor";
import { MetaTemplatesEditor } from "@/components/hbx/meta-templates-editor";

import { MasterWhatsappChip } from "./master-whatsapp-chip";
import { fmtDataHora } from "./page.client";

const SUBTABS = ["Módulos", "Política comercial", "Credenciais", "Exclusões", "Reclamações", "Planos", "WhatsApp (Meta)"];

type SystemModule = {
  id: number;
  key: string;
  name: string;
  description?: string | null;
  monthlyPrice?: number;
  defaultEnabled?: boolean;
  companyAssignable?: boolean;
  serviceUrl?: string | null;
};

type CredWa = { key?: string; label?: string; phoneNumberId?: string; wabaId?: string; displayNumber?: string; accessTokenPreview?: string | null; configured?: boolean; accessToken?: string };
type CredMp = { key?: string; label?: string; accessTokenPreview?: string | null; configured?: boolean; accessToken?: string };

type GlobalIntegrations = {
  annualPlanDiscountPercent?: number;
  extraSeatMonthlyAmount?: number;
  referralDiscountActive?: boolean;
  referralDiscountPercent?: number;
  referralDiscountMode?: string;
  whatsappLibrary?: CredWa[];
  mercadoPagoLibrary?: CredMp[];
} | null;

type ExclusaoRecord = {
  id: number;
  moduleKey?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  motivo?: string | null;
  deletedAt?: string | null;
  company?: { id: number; name: string } | null;
  deletedBy?: { id: number; username?: string | null; email?: string | null } | null;
};

type ExclusaoRadarCard = {
  id: string;
  name?: string | null;
  city?: string | null;
  status?: string | null;
  companyName?: string | null;
  motivo?: string | null;
  removedAt?: string | null;
};

type Exclusoes = {
  modules?: { key: string; name: string }[];
  records?: ExclusaoRecord[];
  radarCards?: ExclusaoRadarCard[];
  radarSummary?: Record<string, number>;
} | null;

type Complaint = {
  id: string;
  companyId?: number;
  companyName?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  leadName?: string | null;
  leadPhone?: string | null;
  leadCity?: string | null;
  reason?: string;
  status?: string;
  refundedCards?: number;
  internalNote?: string | null;
  createdAt?: string | null;
};

const COMPLAINT_STATUS = [
  { value: "", label: "Todas" },
  { value: "new", label: "Novas" },
  { value: "reviewing", label: "Em análise" },
  { value: "refunded", label: "Reembolsadas" },
  { value: "denied", label: "Negadas" },
  { value: "resolved", label: "Resolvidas" },
];

export function JanelaSistema() {
  const [sub, setSub] = useTabIndex("sistema", 0);

  // módulos
  const [modulos, setModulos] = useState<SystemModule[] | null>(null);
  const [modEdit, setModEdit] = useState<Record<string, { name: string; monthlyPrice: string; description: string }>>({});
  const [modBusy, setModBusy] = useState<string | null>(null);
  const [modMsg, setModMsg] = useState<string | null>(null);

  // política + credenciais
  const [integ, setInteg] = useState<GlobalIntegrations>(null);
  const [polForm, setPolForm] = useState({ annual: "", extraSeat: "", refActive: false, refPercent: "", refMode: "ONCE" });
  const [polBusy, setPolBusy] = useState(false);
  const [polMsg, setPolMsg] = useState<string | null>(null);
  const [waLib, setWaLib] = useState<CredWa[] | null>(null);
  const [mpLib, setMpLib] = useState<CredMp[] | null>(null);
  const [credBusy, setCredBusy] = useState(false);
  const [credMsg, setCredMsg] = useState<string | null>(null);

  // exclusões
  const [excl, setExcl] = useState<Exclusoes>(null);
  const [exclMsg, setExclMsg] = useState<string | null>(null);
  const [exclBusy, setExclBusy] = useState<string | null>(null);
  const [exclArm, setExclArm] = useState<string | null>(null);

  // reclamações
  const [compStatus, setCompStatus] = useState("");
  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  const [compMsg, setCompMsg] = useState<string | null>(null);
  const [compBusy, setCompBusy] = useState<string | null>(null);

  const carregarModulos = useCallback(() => {
    return apiFetch<SystemModule[]>("/modules/master/system-modules")
      .then(res => setModulos(Array.isArray(res) ? res : []))
      .catch(() => setModulos([]));
  }, []);

  const carregarInteg = useCallback(() => {
    return apiFetch<GlobalIntegrations>("/modules/master/global-integrations")
      .then(res => {
        setInteg(res);
        setPolForm({
          annual: res?.annualPlanDiscountPercent != null ? String(res.annualPlanDiscountPercent) : "",
          extraSeat: res?.extraSeatMonthlyAmount != null ? String(res.extraSeatMonthlyAmount) : "",
          refActive: Boolean(res?.referralDiscountActive),
          refPercent: res?.referralDiscountPercent != null ? String(res.referralDiscountPercent) : "",
          refMode: String(res?.referralDiscountMode || "ONCE"),
        });
        setWaLib((res?.whatsappLibrary || []).map(c => ({ ...c, accessToken: "" })));
        setMpLib((res?.mercadoPagoLibrary || []).map(c => ({ ...c, accessToken: "" })));
      })
      .catch(() => setInteg(null));
  }, []);

  const carregarExclusoes = useCallback(() => {
    return apiFetch<Exclusoes>("/modules/master/exclusoes")
      .then(res => setExcl(res))
      .catch(() => setExcl({ records: [], radarCards: [] }));
  }, []);

  const carregarComplaints = useCallback((st: string) => {
    const q = new URLSearchParams();
    if (st) q.set("status", st);
    q.set("limit", "200");
    return apiFetch<{ complaints?: Complaint[] } | Complaint[]>(`/modules/master/vendas-complaints?${q.toString()}`)
      .then(res => {
        const lista = Array.isArray(res) ? res : Array.isArray((res as { complaints?: Complaint[] })?.complaints) ? (res as { complaints: Complaint[] }).complaints : [];
        setComplaints(lista);
      })
      .catch(() => setComplaints([]));
  }, []);

  useEffect(() => { carregarModulos(); carregarInteg(); }, [carregarModulos, carregarInteg]);
  useEffect(() => { if (sub === 3 && excl === null) carregarExclusoes(); }, [sub, excl, carregarExclusoes]);
  useEffect(() => { if (sub === 4 && complaints === null) carregarComplaints(compStatus); }, [sub, complaints, compStatus, carregarComplaints]);

  function modValor(m: SystemModule) {
    return modEdit[m.key] ?? {
      name: m.name,
      monthlyPrice: m.monthlyPrice != null ? String(m.monthlyPrice) : "",
      description: m.description || "",
    };
  }

  async function salvarModulo(m: SystemModule) {
    if (modBusy) return;
    const v = modValor(m);
    setModBusy(m.key);
    setModMsg(null);
    try {
      await apiFetch(`/modules/master/system-modules/${encodeURIComponent(m.key)}`, {
        method: "PUT",
        body: JSON.stringify({
          name: v.name,
          description: v.description,
          ...(v.monthlyPrice !== "" ? { monthlyPrice: Number(String(v.monthlyPrice).replace(",", ".")) || 0 } : {}),
        }),
      });
      setModMsg(`✓ Módulo ${m.key} atualizado.`);
      setModEdit(prev => { const next = { ...prev }; delete next[m.key]; return next; });
      await carregarModulos();
    } catch (err) {
      setModMsg(err instanceof Error ? err.message : "Falha ao salvar o módulo.");
    } finally {
      setModBusy(null);
    }
  }

  async function alternarDefault(m: SystemModule) {
    if (modBusy) return;
    setModBusy(m.key);
    setModMsg(null);
    try {
      await apiFetch(`/modules/master/system-modules/${encodeURIComponent(m.key)}`, {
        method: "PUT",
        body: JSON.stringify({ defaultEnabled: !m.defaultEnabled }),
      });
      await carregarModulos();
    } catch (err) {
      setModMsg(err instanceof Error ? err.message : "Falha ao alternar o padrão.");
    } finally {
      setModBusy(null);
    }
  }

  async function salvarPolitica(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (polBusy) return;
    setPolBusy(true);
    setPolMsg(null);
    try {
      const body: Record<string, unknown> = { referralDiscountActive: polForm.refActive, referralDiscountMode: polForm.refMode };
      if (polForm.annual !== "") body.annualPlanDiscountPercent = Number(String(polForm.annual).replace(",", ".")) || 0;
      if (polForm.extraSeat !== "") body.extraSeatMonthlyAmount = Number(String(polForm.extraSeat).replace(",", ".")) || 0;
      if (polForm.refPercent !== "") body.referralDiscountPercent = Number(String(polForm.refPercent).replace(",", ".")) || 0;
      await apiFetch("/modules/master/billing-policy", { method: "PUT", body: JSON.stringify(body) });
      setPolMsg("✓ Política comercial atualizada.");
      await carregarInteg();
    } catch (err) {
      setPolMsg(err instanceof Error ? err.message : "Falha ao salvar a política.");
    } finally {
      setPolBusy(false);
    }
  }

  async function salvarCredenciais() {
    if (credBusy) return;
    setCredBusy(true);
    setCredMsg(null);
    try {
      await apiFetch("/modules/master/global-integrations", {
        method: "PUT",
        body: JSON.stringify({
          whatsappLibrary: (waLib || []).map(c => ({
            key: c.key,
            label: c.label,
            phoneNumberId: c.phoneNumberId,
            wabaId: c.wabaId,
            displayNumber: c.displayNumber,
            ...(String(c.accessToken || "").trim() ? { accessToken: String(c.accessToken).trim() } : {}),
          })),
          mercadoPagoLibrary: (mpLib || []).map(c => ({
            key: c.key,
            label: c.label,
            ...(String(c.accessToken || "").trim() ? { accessToken: String(c.accessToken).trim() } : {}),
          })),
        }),
      });
      setCredMsg("✓ Bibliotecas de credenciais salvas (tokens vazios mantêm o segredo atual).");
      await carregarInteg();
    } catch (err) {
      setCredMsg(err instanceof Error ? err.message : "Falha ao salvar as credenciais.");
    } finally {
      setCredBusy(false);
    }
  }

  async function restaurarRadarCard(stateId: string) {
    if (exclBusy) return;
    setExclBusy(`restore:${stateId}`);
    setExclMsg(null);
    try {
      await apiFetch(`/modules/master/exclusoes/radar-cards/${encodeURIComponent(stateId)}/restore`, {
        method: "PATCH",
        body: JSON.stringify({ motivo: "Restaurado pelo painel /master" }),
      });
      setExclMsg("✓ Card devolvido à base.");
      await carregarExclusoes();
    } catch (err) {
      setExclMsg(err instanceof Error ? err.message : "Falha ao restaurar.");
    } finally {
      setExclBusy(null);
    }
  }

  async function excluirRegistro(id: number) {
    if (exclBusy) return;
    setExclBusy(`del:${id}`);
    setExclMsg(null);
    try {
      await apiFetch(`/modules/master/exclusoes/${id}`, {
        method: "DELETE",
        body: JSON.stringify({ motivo: "Exclusão definitiva pelo /master" }),
      });
      setExclMsg("✓ Registro excluído definitivamente.");
      setExclArm(null);
      await carregarExclusoes();
    } catch (err) {
      setExclMsg(err instanceof Error ? err.message : "Falha ao excluir.");
    } finally {
      setExclBusy(null);
    }
  }

  async function atualizarComplaint(c: Complaint, patch: { status?: string; refundCards?: number; internalNote?: string }) {
    if (compBusy) return;
    setCompBusy(c.id);
    setCompMsg(null);
    try {
      await apiFetch(`/modules/master/vendas-complaints/${encodeURIComponent(c.id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setCompMsg("✓ Reclamação atualizada.");
      await carregarComplaints(compStatus);
    } catch (err) {
      setCompMsg(err instanceof Error ? err.message : "Falha ao atualizar a reclamação.");
    } finally {
      setCompBusy(null);
    }
  }

  const radarSummary = excl?.radarSummary || {};

  return (
    <React.Fragment>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {SUBTABS.map((t, i) => (
          <button key={t} className="btn-ghost" onClick={() => setSub(i)}
            style={i === sub ? { borderColor: "var(--hbx-brand)", color: "var(--hbx-brand-strong)", background: "var(--hbx-brand-soft)" } : {}}>
            {t}
          </button>
        ))}
      </div>

      {sub === 0 && (
        <section className="panel">
          <div className="panel-head">
            <h2>Catálogo de módulos do sistema</h2>
            {modMsg && <div className="meta" style={{ fontWeight: 700, color: modMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-warning)" }}>{modMsg}</div>}
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Módulo</th><th>Nome</th><th>Preço mensal</th><th>Padrão ON</th><th>Atribuível</th><th></th></tr>
              </thead>
              <tbody>
                {modulos === null && <tr><td colSpan={6} style={{ color: "var(--text-muted)" }}>Carregando…</td></tr>}
                {(modulos || []).map(m => {
                  const v = modValor(m);
                  return (
                    <tr key={m.key} style={{ cursor: "default" }}>
                      <td><span style={{ fontFamily: "var(--font-mono)", fontSize: "0.68rem" }}>{m.key}</span></td>
                      <td>
                        <input className="field-dark" style={{ minHeight: 30, fontSize: "0.7rem", width: 170 }} value={v.name}
                          onChange={e => setModEdit(prev => ({ ...prev, [m.key]: { ...v, name: e.target.value } }))} />
                      </td>
                      <td>
                        <input className="field-dark" style={{ minHeight: 30, fontSize: "0.7rem", width: 90 }} inputMode="decimal" value={v.monthlyPrice}
                          onChange={e => setModEdit(prev => ({ ...prev, [m.key]: { ...v, monthlyPrice: e.target.value } }))} />
                      </td>
                      <td>
                        <button className="btn-ghost" disabled={modBusy != null}
                          style={{ minHeight: 26, fontSize: "0.62rem", ...(m.defaultEnabled ? { borderColor: "var(--hbx-brand)", color: "var(--hbx-brand-strong)" } : {}) }}
                          onClick={() => alternarDefault(m)}>
                          {modBusy === m.key ? "…" : m.defaultEnabled ? "ON" : "OFF"}
                        </button>
                      </td>
                      <td>{m.companyAssignable ? "sim" : "não"}</td>
                      <td>
                        <button className="btn-ghost" style={{ minHeight: 26, fontSize: "0.62rem" }} disabled={modBusy != null || !modEdit[m.key]}
                          onClick={() => salvarModulo(m)}>
                          {modBusy === m.key ? "…" : "Salvar"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {sub === 1 && (
        <section className="panel" style={{ maxWidth: 640 }}>
          <div className="panel-head"><h2>Política comercial global</h2></div>
          <form onSubmit={salvarPolitica} style={{ padding: "12px 16px 16px", display: "grid", gap: 12 }}>
            {polMsg && <div style={{ fontSize: "0.72rem", fontWeight: 700, color: polMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-warning)" }}>{polMsg}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Desconto do plano anual (%)</label>
                <input className="field-dark" inputMode="decimal" value={polForm.annual}
                  onChange={e => setPolForm(f => ({ ...f, annual: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Assento extra (R$/mês)</label>
                <input className="field-dark" inputMode="decimal" value={polForm.extraSeat}
                  onChange={e => setPolForm(f => ({ ...f, extraSeat: e.target.value }))} />
              </div>
            </div>
            <div style={{ borderTop: "1px solid var(--border-hairline)", paddingTop: 10, display: "grid", gap: 10 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.74rem", fontWeight: 600 }}>
                <input type="checkbox" checked={polForm.refActive} onChange={e => setPolForm(f => ({ ...f, refActive: e.target.checked }))} />
                Desconto por indicação ativo
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Desconto da indicação (%)</label>
                  <input className="field-dark" inputMode="decimal" value={polForm.refPercent}
                    onChange={e => setPolForm(f => ({ ...f, refPercent: e.target.value }))} />
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Modo</label>
                  <select className="field-dark" value={polForm.refMode} onChange={e => setPolForm(f => ({ ...f, refMode: e.target.value }))}>
                    <option value="ONCE">Uma vez</option>
                    <option value="RECURRING">Recorrente</option>
                  </select>
                </div>
              </div>
            </div>
            <button className="btn-teal" type="submit" disabled={polBusy} style={{ minHeight: 42 }}>
              {polBusy ? "Salvando…" : "Salvar política"}
            </button>
          </form>
        </section>
      )}

      {sub === 2 && (
        <React.Fragment>
        <section className="panel">
          <div className="panel-head">
            <h2>Bibliotecas de credenciais master</h2>
            <div className="meta">
              <button className="btn-teal" disabled={credBusy} onClick={salvarCredenciais}>{credBusy ? "Salvando…" : "Salvar bibliotecas"}</button>
            </div>
          </div>
          <div style={{ padding: "12px 16px 16px", display: "grid", gap: 14 }}>
            {credMsg && <div style={{ fontSize: "0.72rem", fontWeight: 700, lineHeight: 1.5, color: credMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-warning)" }}>{credMsg}</div>}
            <span style={{ fontSize: "0.66rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
              Token em branco mantém o segredo atual (o backend preserva pelo “key”). Remover uma linha exclui a credencial da biblioteca ao salvar.
            </span>

            <div style={{ display: "grid", gap: 8 }}>
              <strong style={{ fontSize: "0.76rem" }}>WhatsApp (Meta Cloud)</strong>
              {(waLib || []).length === 0 && <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Sem credenciais — adicione a primeira.</span>}
              {(waLib || []).map((c, i) => (
                <div key={c.key || i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 6, alignItems: "center" }}>
                  <input className="field-dark" style={{ minHeight: 32, fontSize: "0.68rem" }} placeholder="Rótulo" value={c.label || ""}
                    onChange={e => setWaLib(prev => (prev || []).map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                  <input className="field-dark" style={{ minHeight: 32, fontSize: "0.68rem" }} placeholder="Phone Number ID" value={c.phoneNumberId || ""}
                    onChange={e => setWaLib(prev => (prev || []).map((x, j) => j === i ? { ...x, phoneNumberId: e.target.value } : x))} />
                  <input className="field-dark" style={{ minHeight: 32, fontSize: "0.68rem" }} placeholder="WABA ID" value={c.wabaId || ""}
                    onChange={e => setWaLib(prev => (prev || []).map((x, j) => j === i ? { ...x, wabaId: e.target.value } : x))} />
                  <input className="field-dark" type="password" style={{ minHeight: 32, fontSize: "0.68rem" }}
                    placeholder={c.accessTokenPreview ? `manter ${c.accessTokenPreview}` : "Access token"} value={c.accessToken || ""}
                    onChange={e => setWaLib(prev => (prev || []).map((x, j) => j === i ? { ...x, accessToken: e.target.value } : x))} />
                  <button className="icon-ghost" title="Remover da biblioteca" aria-label="Remover credencial"
                    onClick={() => setWaLib(prev => (prev || []).filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
              <button className="btn-ghost" style={{ width: "fit-content", minHeight: 28, fontSize: "0.66rem" }}
                onClick={() => setWaLib(prev => ([...(prev || []), { key: `wa_${Date.now().toString(36)}`, label: "", phoneNumberId: "", wabaId: "", accessToken: "" }]))}>
                + Adicionar credencial WhatsApp
              </button>
            </div>

            <div style={{ borderTop: "1px solid var(--border-hairline)", paddingTop: 12, display: "grid", gap: 8 }}>
              <strong style={{ fontSize: "0.76rem" }}>Mercado Pago</strong>
              {(mpLib || []).length === 0 && <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Sem credenciais — adicione a primeira.</span>}
              {(mpLib || []).map((c, i) => (
                <div key={c.key || i} style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: 6, alignItems: "center" }}>
                  <input className="field-dark" style={{ minHeight: 32, fontSize: "0.68rem" }} placeholder="Rótulo" value={c.label || ""}
                    onChange={e => setMpLib(prev => (prev || []).map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                  <input className="field-dark" type="password" style={{ minHeight: 32, fontSize: "0.68rem" }}
                    placeholder={c.accessTokenPreview ? `manter ${c.accessTokenPreview}` : "Access token"} value={c.accessToken || ""}
                    onChange={e => setMpLib(prev => (prev || []).map((x, j) => j === i ? { ...x, accessToken: e.target.value } : x))} />
                  <button className="icon-ghost" title="Remover da biblioteca" aria-label="Remover credencial"
                    onClick={() => setMpLib(prev => (prev || []).filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
              <button className="btn-ghost" style={{ width: "fit-content", minHeight: 28, fontSize: "0.66rem" }}
                onClick={() => setMpLib(prev => ([...(prev || []), { key: `mp_${Date.now().toString(36)}`, label: "", accessToken: "" }]))}>
                + Adicionar credencial Mercado Pago
              </button>
            </div>

            <div style={{ display: "flex", gap: 12, fontSize: "0.68rem", color: "var(--text-muted)" }}>
              <span>Status: WhatsApp {integ?.whatsappLibrary?.some(c => c.configured) ? "configurado ✓" : "pendente"}</span>
              <span>· Mercado Pago {integ?.mercadoPagoLibrary?.some(c => c.configured) ? "configurado ✓" : "pendente"}</span>
            </div>
          </div>
        </section>
        <MasterWhatsappChip />
        </React.Fragment>
      )}

      {sub === 3 && (
        <React.Fragment>
          {exclMsg && <div style={{ fontSize: "0.72rem", fontWeight: 700, color: exclMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-warning)" }}>{exclMsg}</div>}
          <section className="panel">
            <div className="panel-head">
              <h2>Cards do Radar removidos</h2>
              <div className="meta">
                {Object.entries(radarSummary).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                <button className="btn-ghost" style={{ minHeight: 26, fontSize: "0.62rem" }} onClick={carregarExclusoes}>Atualizar</button>
              </div>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Card</th><th>Empresa</th><th>Status</th><th>Motivo</th><th>Removido em</th><th></th></tr></thead>
                <tbody>
                  {excl === null && <tr><td colSpan={6} style={{ color: "var(--text-muted)" }}>Carregando…</td></tr>}
                  {excl !== null && (excl.radarCards || []).length === 0 && (
                    <tr><td colSpan={6} style={{ color: "var(--text-muted)" }}>Nenhum card removido.</td></tr>
                  )}
                  {(excl?.radarCards || []).map(card => (
                    <tr key={card.id} style={{ cursor: "default" }}>
                      <td><strong>{card.name || "—"}</strong>{card.city ? <span className="sub2" style={{ display: "block" }}>{card.city}</span> : null}</td>
                      <td>{card.companyName || "—"}</td>
                      <td><span className="tag warn">{card.status || "—"}</span></td>
                      <td style={{ whiteSpace: "normal", maxWidth: 220, fontSize: "0.68rem" }}>{card.motivo || "—"}</td>
                      <td>{fmtDataHora(card.removedAt)}</td>
                      <td>
                        <button className="btn-ghost" style={{ minHeight: 26, fontSize: "0.62rem" }} disabled={exclBusy != null}
                          onClick={() => restaurarRadarCard(card.id)}>
                          {exclBusy === `restore:${card.id}` ? "…" : "Restaurar"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Registros de exclusão (todos os módulos)</h2></div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Entidade</th><th>Módulo</th><th>Empresa</th><th>Por</th><th>Motivo</th><th>Quando</th><th></th></tr></thead>
                <tbody>
                  {excl !== null && (excl.records || []).length === 0 && (
                    <tr><td colSpan={7} style={{ color: "var(--text-muted)" }}>Lixeira vazia.</td></tr>
                  )}
                  {(excl?.records || []).map(r => (
                    <tr key={r.id} style={{ cursor: "default" }}>
                      <td><strong>{r.entityType || "—"}</strong><span className="sub2" style={{ display: "block" }}>{r.entityId || ""}</span></td>
                      <td>{r.moduleKey || "—"}</td>
                      <td>{r.company?.name || "—"}</td>
                      <td>{r.deletedBy?.username || r.deletedBy?.email || "—"}</td>
                      <td style={{ whiteSpace: "normal", maxWidth: 200, fontSize: "0.68rem" }}>{r.motivo || "—"}</td>
                      <td>{fmtDataHora(r.deletedAt)}</td>
                      <td>
                        {exclArm === `rec:${r.id}` ? (
                          <button className="btn-ghost" style={{ minHeight: 26, fontSize: "0.62rem", borderColor: "var(--hbx-danger)", color: "var(--hbx-danger)" }}
                            disabled={exclBusy != null} onClick={() => excluirRegistro(r.id)}>Confirmar</button>
                        ) : (
                          <button className="btn-ghost" style={{ minHeight: 26, fontSize: "0.62rem", color: "var(--hbx-danger)" }}
                            disabled={exclBusy != null} onClick={() => setExclArm(`rec:${r.id}`)}>Excluir de vez</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </React.Fragment>
      )}

      {sub === 4 && (
        <section className="panel">
          <div className="panel-head">
            <h2>Reclamações de cards (Vendas)</h2>
            <div className="meta">
              {compMsg && <span style={{ fontWeight: 700, color: compMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-warning)" }}>{compMsg}</span>}
            </div>
          </div>
          <div style={{ padding: "12px 16px 4px", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {COMPLAINT_STATUS.map(o => (
              <button key={o.value} className="btn-ghost"
                onClick={() => { setCompStatus(o.value); setComplaints(null); }}
                style={{ minHeight: 28, fontSize: "0.66rem", ...(o.value === compStatus ? { borderColor: "var(--hbx-brand)", color: "var(--hbx-brand-strong)", background: "var(--hbx-brand-soft)" } : {}) }}>
                {o.label}
              </button>
            ))}
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Card reclamado</th><th>Empresa / vendedor</th><th>Motivo</th><th>Status</th><th>Criada</th><th>Triagem</th></tr></thead>
              <tbody>
                {complaints === null && <tr><td colSpan={6} style={{ color: "var(--text-muted)" }}>Carregando…</td></tr>}
                {complaints !== null && complaints.length === 0 && (
                  <tr><td colSpan={6} style={{ color: "var(--text-muted)" }}>Nenhuma reclamação {compStatus ? "neste status" : "registrada"}.</td></tr>
                )}
                {(complaints || []).map(c => (
                  <tr key={c.id} style={{ cursor: "default" }}>
                    <td>
                      <div className="co">
                        <strong>{c.leadName || "—"}</strong>
                        <span className="sub2">{[c.leadPhone, c.leadCity].filter(Boolean).join(" · ") || "—"}</span>
                      </div>
                    </td>
                    <td>
                      <div className="co">
                        <strong>{c.companyName || "—"}</strong>
                        <span className="sub2">{c.userName || c.userEmail || "—"}</span>
                      </div>
                    </td>
                    <td style={{ whiteSpace: "normal", maxWidth: 220, fontSize: "0.68rem" }}>{c.reason || "—"}</td>
                    <td><span className={c.status === "refunded" || c.status === "resolved" ? "tag teal" : c.status === "denied" ? "tag red" : "tag warn"}>{c.status || "—"}</span></td>
                    <td>{fmtDataHora(c.createdAt)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {["new", "reviewing"].includes(String(c.status)) && (
                          <React.Fragment>
                            <button className="btn-ghost" style={{ minHeight: 24, fontSize: "0.6rem", padding: "0 7px" }} disabled={compBusy != null}
                              onClick={() => atualizarComplaint(c, { status: "refunded", refundCards: 1 })} title="Aceitar e devolver 1 card à cota">
                              {compBusy === c.id ? "…" : "Reembolsar"}
                            </button>
                            <button className="btn-ghost" style={{ minHeight: 24, fontSize: "0.6rem", padding: "0 7px", color: "var(--hbx-danger)" }} disabled={compBusy != null}
                              onClick={() => atualizarComplaint(c, { status: "denied" })}>Negar</button>
                            <button className="btn-ghost" style={{ minHeight: 24, fontSize: "0.6rem", padding: "0 7px" }} disabled={compBusy != null}
                              onClick={() => atualizarComplaint(c, { status: "reviewing" })}>Em análise</button>
                          </React.Fragment>
                        )}
                        {!["new", "reviewing"].includes(String(c.status)) && (
                          <span style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>{c.refundedCards ? `${c.refundedCards} card(s) devolvido(s)` : "triada"}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {sub === 5 && <PlanosEditor />}

      {sub === 6 && (<><MetaWhatsAppEditor /><MetaTemplatesEditor /></>)}

    </React.Fragment>
  );
}
