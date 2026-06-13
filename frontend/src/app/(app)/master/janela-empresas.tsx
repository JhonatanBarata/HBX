"use client";

// Janela 1 — Empresas (CORAÇÃO do /master). v1 + fase 2 COMPLETA
// (ordem do dono 12/06/2026: "fica de fora nada, ligue tudo").
// Contratos ligados (todos já existentes no backend):
//   GET  /modules/master/companies                       → lista (vem do pai)
//   GET  /modules/master/company/:id/detail              → detalhe completo
//   PUT  /modules/master/company/:id/courtesy            → cortesia
//   PUT  /modules/master/company/:id  {moduleKey,enabled}→ módulo (HBX Full)
//   PUT  /modules/master/company/:id/profile             → dados cadastrais
//   POST /modules/master/company/:id/trial               → {action: grant|end, days, reason}
//   PUT  /modules/master/company/:id/suspension          → {suspended, reason}
//   PUT  /modules/master/company/:id/plan                → {planKey} (ordem explícita)
//   PUT  /modules/master/company/:id/card-quota          → {monthlyCardLimit, dailyCardLimit}
//   PUT  /modules/master/company/:id/finance-settings    → {manualDiscountPercent, freeMonths, billingCycle}
//   PUT  /modules/master/company/:id/global-token-usage  → toggles credencial master
//   POST /modules/master/company/:id/manual-payment      → registrar pagamento (ordem explícita)
//   PUT  .../manual-payment/:entryId/cancel              → cancelar lançamento
//   POST /master/provisioning/tenants                    → nova empresa
//   PATCH users/master/:id | reset-password | delete     → usuários
//   master-context assume → via prop do pai (banner global no layout)

import React, { useState } from "react";

import { apiFetch } from "@/lib/api";

import { fmtData, fmtDataHora, statusLabel, statusTagClass, type MasterCompany } from "./page.client";

type DetailUser = {
  id: number;
  username?: string | null;
  email?: string | null;
  name?: string | null;
  role?: string;
  isActive?: boolean;
  createdAt?: string | null;
};

type LedgerRow = {
  id: string;
  entryType?: string;
  entryGroup?: string;
  status?: string;
  origin?: string | null;
  competence?: string | null;
  amount?: number;
  dueDate?: string | null;
  paidAt?: string | null;
  paymentMethod?: string | null;
  referenceLabel?: string | null;
  observation?: string | null;
  createdAt?: string | null;
};

type AuditRow = {
  id: string;
  scope?: string;
  action?: string;
  severity?: string;
  createdAt?: string | null;
};

type CredEntry = { key?: string; label?: string; configured?: boolean };

type Detail = {
  generatedAt?: string;
  company?: {
    id?: number;
    name?: string;
    slug?: string | null;
    status?: string | null;
    isActive?: boolean;
    primaryContactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    taxDocument?: string | null;
    paymentMethod?: string | null;
    billingProvider?: string | null;
    courtesyReason?: string | null;
    courtesyEndsAt?: string | null;
    trialStartsAt?: string | null;
    trialEndsAt?: string | null;
    selectedPlanKey?: string | null;
    commercialCardsMonthlyLimitOverride?: number | null;
    commercialCardsDailyLimitOverride?: number | null;
    manualDiscountPercent?: number | null;
    freeMonths?: number | null;
    billingCycle?: string | null;
    users?: DetailUser[];
    modules?: { key: string; name: string; enabled: boolean }[];
    plan?: { id?: number; name?: string | null } | null;
    whatsapp?: { usingMasterToken?: boolean; masterCredentialKey?: string | null } | null;
    mercadoPago?: { usingMasterToken?: boolean; masterCredentialKey?: string | null } | null;
    masterIntegrations?: { whatsappLibrary?: CredEntry[]; mercadoPagoLibrary?: CredEntry[] } | null;
    financeHistory?: LedgerRow[];
    auditTimeline?: AuditRow[];
  };
} | null;

const PLANOS = [
  { value: "hbx_lite", label: "HBX Lite" },
  { value: "hbx_padrao", label: "HBX Padrão" },
  { value: "hbx_melhor", label: "HBX Full" },
];

const PROV_VAZIO = {
  companyName: "",
  slug: "",
  planKey: "hbx_padrao",
  billingCycle: "MONTHLY",
  manualAccess: false,
  adminName: "",
  adminEmail: "",
  adminPhone: "",
};

type UserEditForm = { id: number; name: string; email: string; username: string; phone: string; role: string; isActive: boolean };

const EMP_VAZIO = { name: "", primaryContactName: "", contactEmail: "", contactPhone: "", taxDocument: "", paymentMethod: "", billingProvider: "" };
const PAG_VAZIO = { value: "", competence: "", paidAt: "", paymentMethod: "PIX", observation: "", settlePending: true };

const DETAIL_TABS = ["Usuários", "Comercial", "Financeiro", "Auditoria"] as const;

function fmtBRL(v?: number | null) {
  return (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function JanelaEmpresas({ companies, error, reload, assumirContexto }: {
  companies: MasterCompany[] | null;
  error: string | null;
  reload: () => Promise<void> | void;
  assumirContexto?: (companyId: number) => Promise<void> | void;
}) {
  const [selId, setSelId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<(typeof DETAIL_TABS)[number]>("Usuários");

  // provisioning
  const [provOpen, setProvOpen] = useState(false);
  const [provForm, setProvForm] = useState(PROV_VAZIO);
  const [provBusy, setProvBusy] = useState(false);
  const [provMsg, setProvMsg] = useState<string | null>(null);
  const [provResult, setProvResult] = useState<{ companyId?: number; temporaryPassword?: string | null } | null>(null);

  // cortesia
  const [cortesiaForm, setCortesiaForm] = useState({ reason: "", endsAt: "" });
  const [cortesiaBusy, setCortesiaBusy] = useState(false);
  const [cortesiaMsg, setCortesiaMsg] = useState<string | null>(null);

  // usuários
  const [userMsg, setUserMsg] = useState<string | null>(null);
  const [userBusy, setUserBusy] = useState(false);
  const [resetResult, setResetResult] = useState<{ id: number; temporaryPassword: string } | null>(null);
  const [userEdit, setUserEdit] = useState<UserEditForm | null>(null);
  const [deleteArm, setDeleteArm] = useState<number | null>(null);

  // módulos
  const [moduloBusy, setModuloBusy] = useState<string | null>(null);
  const [moduloMsg, setModuloMsg] = useState<string | null>(null);

  // perfil da empresa
  const [empOpen, setEmpOpen] = useState(false);
  const [empForm, setEmpForm] = useState(EMP_VAZIO);
  const [empBusy, setEmpBusy] = useState(false);
  const [empMsg, setEmpMsg] = useState<string | null>(null);

  // comercial (fase 2)
  const [comBusy, setComBusy] = useState<string | null>(null); // qual ação está rodando
  const [comMsg, setComMsg] = useState<string | null>(null);
  const [trialDias, setTrialDias] = useState("14");
  const [suspReason, setSuspReason] = useState("");
  const [planoSel, setPlanoSel] = useState("");
  const [planoArm, setPlanoArm] = useState(false);
  const [quotaForm, setQuotaForm] = useState({ monthly: "", daily: "" });
  const [finForm, setFinForm] = useState({ discount: "", freeMonths: "", billingCycle: "" });

  // financeiro (fase 2)
  const [pagOpen, setPagOpen] = useState(false);
  const [pagForm, setPagForm] = useState(PAG_VAZIO);
  const [pagBusy, setPagBusy] = useState(false);
  const [pagMsg, setPagMsg] = useState<string | null>(null);
  const [cancelArm, setCancelArm] = useState<string | null>(null);

  function carregarDetail(id: number) {
    setSelId(id);
    setDetail(null);
    setDetailError(null);
    setCortesiaMsg(null);
    setUserMsg(null);
    setModuloMsg(null);
    setComMsg(null);
    setPagMsg(null);
    setResetResult(null);
    setDeleteArm(null);
    setCancelArm(null);
    setPlanoArm(false);
    apiFetch<Detail>(`/modules/master/company/${id}/detail`)
      .then(res => {
        setDetail(res);
        const c = res?.company;
        setCortesiaForm({
          reason: String(c?.courtesyReason || ""),
          endsAt: c?.courtesyEndsAt ? String(c.courtesyEndsAt).slice(0, 10) : "",
        });
        setPlanoSel(String(c?.selectedPlanKey || ""));
        setQuotaForm({
          monthly: c?.commercialCardsMonthlyLimitOverride != null ? String(c.commercialCardsMonthlyLimitOverride) : "",
          daily: c?.commercialCardsDailyLimitOverride != null ? String(c.commercialCardsDailyLimitOverride) : "",
        });
        setFinForm({
          discount: c?.manualDiscountPercent != null ? String(c.manualDiscountPercent) : "",
          freeMonths: c?.freeMonths != null ? String(c.freeMonths) : "",
          billingCycle: String(c?.billingCycle || ""),
        });
      })
      .catch((err: unknown) => setDetailError(err instanceof Error ? err.message : "Falha ao carregar o detalhe."));
  }

  function recarregarTudo() {
    if (selId != null) carregarDetail(selId);
    return reload();
  }

  // empresa selecionada sumiu da lista (ex.: recarga) → detalhe some junto
  const selVisivel = selId != null && (!companies || companies.some(c => c.id === selId));

  async function provisionar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (provBusy) return;
    setProvBusy(true);
    setProvMsg(null);
    try {
      const body: Record<string, unknown> = {
        companyName: provForm.companyName.trim(),
        planKey: provForm.planKey,
        billingCycle: provForm.billingCycle,
        manualAccess: provForm.manualAccess,
      };
      if (provForm.slug.trim()) body.slug = provForm.slug.trim();
      if (provForm.adminEmail.trim()) {
        body.admin = {
          email: provForm.adminEmail.trim(),
          ...(provForm.adminName.trim() ? { name: provForm.adminName.trim() } : {}),
          ...(provForm.adminPhone.trim() ? { phone: provForm.adminPhone.trim() } : {}),
        };
      }
      const res = await apiFetch<{ ok?: boolean; companyId?: number; temporaryPassword?: string | null }>(
        "/master/provisioning/tenants",
        { method: "POST", body: JSON.stringify(body) },
      );
      setProvResult(res || null);
      setProvForm(PROV_VAZIO);
      setProvOpen(false);
      await reload();
      if (res?.companyId) carregarDetail(res.companyId);
    } catch (err) {
      setProvMsg(err instanceof Error ? err.message : "Falha ao criar a empresa.");
    } finally {
      setProvBusy(false);
    }
  }

  async function salvarCortesia(active: boolean) {
    if (cortesiaBusy || selId == null) return;
    setCortesiaBusy(true);
    setCortesiaMsg(null);
    try {
      await apiFetch(`/modules/master/company/${selId}/courtesy`, {
        method: "PUT",
        body: JSON.stringify({
          active,
          ...(cortesiaForm.reason.trim() ? { reason: cortesiaForm.reason.trim() } : {}),
          ...(active && cortesiaForm.endsAt ? { endsAt: cortesiaForm.endsAt } : {}),
        }),
      });
      setCortesiaMsg(active ? "✓ Cortesia ativada." : "✓ Cortesia encerrada.");
      await recarregarTudo();
    } catch (err) {
      setCortesiaMsg(err instanceof Error ? err.message : "Falha ao salvar a cortesia.");
    } finally {
      setCortesiaBusy(false);
    }
  }

  async function salvarEmpresa(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (empBusy || selId == null) return;
    setEmpBusy(true);
    setEmpMsg(null);
    try {
      const body: Record<string, string> = {};
      for (const [k, v] of Object.entries(empForm)) {
        if (String(v).trim()) body[k] = String(v).trim();
      }
      await apiFetch(`/modules/master/company/${selId}/profile`, { method: "PUT", body: JSON.stringify(body) });
      setEmpOpen(false);
      await recarregarTudo();
    } catch (err) {
      setEmpMsg(err instanceof Error ? err.message : "Falha ao salvar a empresa.");
    } finally {
      setEmpBusy(false);
    }
  }

  async function trialAcao(action: "grant" | "end") {
    if (comBusy || selId == null) return;
    setComBusy(`trial-${action}`);
    setComMsg(null);
    try {
      await apiFetch(`/modules/master/company/${selId}/trial`, {
        method: "POST",
        body: JSON.stringify(action === "grant"
          ? { action, days: Math.max(1, Number(trialDias) || 14) }
          : { action }),
      });
      setComMsg(action === "grant" ? `✓ Trial concedido (${trialDias} dias).` : "✓ Trial encerrado (vai para checkout).");
      await recarregarTudo();
    } catch (err) {
      setComMsg(err instanceof Error ? err.message : "Falha na ação de trial.");
    } finally {
      setComBusy(null);
    }
  }

  async function setSuspensao(suspended: boolean) {
    if (comBusy || selId == null) return;
    setComBusy("susp");
    setComMsg(null);
    try {
      await apiFetch(`/modules/master/company/${selId}/suspension`, {
        method: "PUT",
        body: JSON.stringify({ suspended, ...(suspReason.trim() ? { reason: suspReason.trim() } : {}) }),
      });
      setComMsg(suspended ? "✓ Empresa suspensa." : "✓ Suspensão removida.");
      setSuspReason("");
      await recarregarTudo();
    } catch (err) {
      setComMsg(err instanceof Error ? err.message : "Falha na suspensão.");
    } finally {
      setComBusy(null);
    }
  }

  async function mudarPlano() {
    if (comBusy || selId == null || !planoSel) return;
    setComBusy("plano");
    setComMsg(null);
    try {
      await apiFetch(`/modules/master/company/${selId}/plan`, {
        method: "PUT",
        body: JSON.stringify({ planKey: planoSel }),
      });
      setComMsg(`✓ Plano alterado para ${PLANOS.find(p => p.value === planoSel)?.label || planoSel}.`);
      setPlanoArm(false);
      await recarregarTudo();
    } catch (err) {
      setComMsg(err instanceof Error ? err.message : "Falha ao mudar o plano.");
    } finally {
      setComBusy(null);
    }
  }

  async function salvarQuota() {
    if (comBusy || selId == null) return;
    setComBusy("quota");
    setComMsg(null);
    try {
      const body: Record<string, number> = {};
      if (quotaForm.monthly !== "") body.monthlyCardLimit = Math.max(0, Number(quotaForm.monthly) || 0);
      if (quotaForm.daily !== "") body.dailyCardLimit = Math.max(0, Number(quotaForm.daily) || 0);
      await apiFetch(`/modules/master/company/${selId}/card-quota`, { method: "PUT", body: JSON.stringify(body) });
      setComMsg("✓ Quota de cards atualizada.");
      await recarregarTudo();
    } catch (err) {
      setComMsg(err instanceof Error ? err.message : "Falha ao salvar a quota.");
    } finally {
      setComBusy(null);
    }
  }

  async function salvarFinanceSettings() {
    if (comBusy || selId == null) return;
    setComBusy("fin");
    setComMsg(null);
    try {
      const body: Record<string, unknown> = {};
      if (finForm.discount !== "") body.manualDiscountPercent = Number(finForm.discount) || 0;
      if (finForm.freeMonths !== "") body.freeMonths = Math.max(0, Number(finForm.freeMonths) || 0);
      if (finForm.billingCycle) body.billingCycle = finForm.billingCycle;
      await apiFetch(`/modules/master/company/${selId}/finance-settings`, { method: "PUT", body: JSON.stringify(body) });
      setComMsg("✓ Condições de cobrança atualizadas.");
      await recarregarTudo();
    } catch (err) {
      setComMsg(err instanceof Error ? err.message : "Falha ao salvar as condições.");
    } finally {
      setComBusy(null);
    }
  }

  async function salvarTokens(patch: Record<string, unknown>) {
    if (comBusy || selId == null) return;
    setComBusy("token");
    setComMsg(null);
    try {
      await apiFetch(`/modules/master/company/${selId}/global-token-usage`, { method: "PUT", body: JSON.stringify(patch) });
      setComMsg("✓ Uso de credencial master atualizado.");
      await recarregarTudo();
    } catch (err) {
      setComMsg(err instanceof Error ? err.message : "Falha ao atualizar credenciais.");
    } finally {
      setComBusy(null);
    }
  }

  async function registrarPagamento(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pagBusy || selId == null) return;
    setPagBusy(true);
    setPagMsg(null);
    try {
      const body: Record<string, unknown> = {
        value: Number(String(pagForm.value).replace(",", ".")) || 0,
        settlePending: pagForm.settlePending,
      };
      if (pagForm.competence.trim()) body.competence = pagForm.competence.trim();
      if (pagForm.paidAt) body.paidAt = pagForm.paidAt;
      if (pagForm.paymentMethod) body.paymentMethod = pagForm.paymentMethod;
      if (pagForm.observation.trim()) body.observation = pagForm.observation.trim();
      await apiFetch(`/modules/master/company/${selId}/manual-payment`, { method: "POST", body: JSON.stringify(body) });
      setPagOpen(false);
      setPagForm(PAG_VAZIO);
      setPagMsg("✓ Pagamento manual registrado.");
      await recarregarTudo();
    } catch (err) {
      setPagMsg(err instanceof Error ? err.message : "Falha ao registrar o pagamento.");
    } finally {
      setPagBusy(false);
    }
  }

  async function cancelarLancamento(entryId: string) {
    if (pagBusy || selId == null) return;
    setPagBusy(true);
    setPagMsg(null);
    try {
      await apiFetch(`/modules/master/company/${selId}/manual-payment/${encodeURIComponent(entryId)}/cancel`, {
        method: "PUT",
        body: JSON.stringify({}),
      });
      setPagMsg("✓ Lançamento cancelado.");
      setCancelArm(null);
      await recarregarTudo();
    } catch (err) {
      setPagMsg(err instanceof Error ? err.message : "Falha ao cancelar o lançamento.");
    } finally {
      setPagBusy(false);
    }
  }

  async function resetSenha(u: DetailUser) {
    if (userBusy) return;
    setUserBusy(true);
    setUserMsg(null);
    setResetResult(null);
    try {
      const res = await apiFetch<{ ok?: boolean; id: number; temporaryPassword: string }>(
        `/users/master/${u.id}/reset-password`,
        { method: "PATCH", body: JSON.stringify({}) },
      );
      setResetResult({ id: u.id, temporaryPassword: res?.temporaryPassword || "" });
    } catch (err) {
      setUserMsg(err instanceof Error ? err.message : "Falha ao resetar a senha.");
    } finally {
      setUserBusy(false);
    }
  }

  async function salvarUsuario(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (userBusy || !userEdit) return;
    setUserBusy(true);
    setUserMsg(null);
    try {
      await apiFetch(`/users/master/${userEdit.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: userEdit.name,
          email: userEdit.email,
          username: userEdit.username,
          phone: userEdit.phone,
          role: userEdit.role,
          isActive: userEdit.isActive,
        }),
      });
      setUserEdit(null);
      setUserMsg("✓ Usuário atualizado.");
      await recarregarTudo();
    } catch (err) {
      setUserMsg(err instanceof Error ? err.message : "Falha ao salvar o usuário.");
    } finally {
      setUserBusy(false);
    }
  }

  async function excluirUsuario(id: number) {
    if (userBusy) return;
    setUserBusy(true);
    setUserMsg(null);
    try {
      await apiFetch(`/users/master/${id}/delete`, { method: "PATCH", body: JSON.stringify({}) });
      setDeleteArm(null);
      setUserMsg("✓ Usuário removido.");
      await recarregarTudo();
    } catch (err) {
      setUserMsg(err instanceof Error ? err.message : "Falha ao remover o usuário.");
    } finally {
      setUserBusy(false);
    }
  }

  async function alternarModulo(key: string, enabled: boolean) {
    if (moduloBusy || selId == null) return;
    setModuloBusy(key);
    setModuloMsg(null);
    try {
      await apiFetch(`/modules/master/company/${selId}`, {
        method: "PUT",
        body: JSON.stringify({ moduleKey: key, enabled }),
      });
      await recarregarTudo();
    } catch (err) {
      setModuloMsg(err instanceof Error ? err.message : "Falha ao alterar o módulo.");
    } finally {
      setModuloBusy(null);
    }
  }

  const lista = companies || [];
  const totais = {
    total: lista.length,
    ativas: lista.filter(c => c.isActive).length,
    trial: lista.filter(c => String(c.status || "").toLowerCase() === "trial").length,
    cortesia: lista.filter(c => String(c.status || "").toLowerCase() === "courtesy").length,
  };
  const c = detail?.company;
  const emCortesia = String(c?.status || "").toLowerCase() === "courtesy";
  const emTrial = String(c?.status || "").toLowerCase() === "trial";
  const suspensa = String(c?.status || "").toLowerCase() === "suspended";
  const ledger = c?.financeHistory || [];
  const auditoria = c?.auditTimeline || [];
  const credsWa = c?.masterIntegrations?.whatsappLibrary || [];
  const credsMp = c?.masterIntegrations?.mercadoPagoLibrary || [];

  return (
    <React.Fragment>
      {error && <div style={{ fontSize: "0.74rem", fontWeight: 600, color: "var(--hbx-danger)" }}>{error}</div>}

      {provResult && (
        <section className="panel" style={{ borderColor: "var(--hbx-brand)" }}>
          <div style={{ padding: 16, display: "grid", gap: 6 }}>
            <strong style={{ fontSize: "0.8rem" }}>✓ Empresa criada (#{provResult.companyId})</strong>
            {provResult.temporaryPassword ? (
              <span style={{ fontSize: "0.74rem", lineHeight: 1.5 }}>
                Senha temporária do admin: <b style={{ fontFamily: "var(--font-mono)" }}>{provResult.temporaryPassword}</b>
                {" "}— anote agora, ela não aparece de novo.
              </span>
            ) : (
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Sem usuário admin inicial (criado sem senha ou não informado).</span>
            )}
            <button className="btn-ghost" style={{ width: "fit-content", minHeight: 28, fontSize: "0.66rem" }} onClick={() => setProvResult(null)}>Fechar</button>
          </div>
        </section>
      )}

      <div className="kpis">
        {[
          { label: "Empresas", value: companies ? String(totais.total) : "—" },
          { label: "Com acesso ativo", value: companies ? String(totais.ativas) : "—" },
          { label: "Em trial", value: companies ? String(totais.trial) : "—" },
          { label: "Em cortesia", value: companies ? String(totais.cortesia) : "—" },
        ].map(k => (
          <div className="kpi" key={k.label}>
            <span className="kpi-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M17 19c0-2.8-2.2-5-5-5s-5 2.2-5 5M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" /></svg></span>
            <div>
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value">{k.value}</div>
            </div>
          </div>
        ))}
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Empresas clientes</h2>
          <div className="meta">
            <button className="btn-teal" onClick={() => { setProvOpen(true); setProvMsg(null); }}>+ Nova empresa</button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Status</th>
                <th>Cobrança</th>
                <th>Trial / Período</th>
                <th>Usuários</th>
                <th>Módulos ON</th>
                <th>WhatsApp</th>
              </tr>
            </thead>
            <tbody>
              {!companies && (
                <tr><td colSpan={7} style={{ color: "var(--text-muted)" }}>Carregando…</td></tr>
              )}
              {companies && lista.length === 0 && (
                <tr><td colSpan={7} style={{ color: "var(--text-muted)" }}>Nenhuma empresa cliente ainda — crie a primeira em “Nova empresa”.</td></tr>
              )}
              {lista.map(emp => (
                <tr key={emp.id} className={emp.id === selId ? "sel" : ""} onClick={() => carregarDetail(emp.id)}>
                  <td>
                    <div className="co">
                      <strong>{emp.name}</strong>
                      <span className="sub2">#{emp.id}{emp.slug ? ` · ${emp.slug}` : ""}</span>
                    </div>
                  </td>
                  <td><span className={statusTagClass(emp.status, emp.isActive)}>{statusLabel(emp.status)}</span></td>
                  <td>{emp.paymentMethod || emp.billingProvider || "—"}</td>
                  <td>
                    {String(emp.status || "").toLowerCase() === "trial"
                      ? `até ${fmtData(emp.trialEndsAt)}`
                      : emp.subscriptionCurrentPeriodEnd
                        ? `até ${fmtData(emp.subscriptionCurrentPeriodEnd)}`
                        : "—"}
                  </td>
                  <td>{emp.users?.length ?? 0}</td>
                  <td>{(emp.modules || []).filter(m => m.enabled).length}</td>
                  <td>{emp.whatsappStatus || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selVisivel && (
        <React.Fragment>
          {detailError && <div style={{ fontSize: "0.74rem", fontWeight: 600, color: "var(--hbx-danger)" }}>{detailError}</div>}
          {!detail && !detailError && <div style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>Carregando detalhe…</div>}
          {c && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 14, alignItems: "start" }}>
              <div style={{ display: "grid", gap: 14 }}>
                <section className="panel">
                  <div className="panel-head">
                    <h2>{c.name}</h2>
                    <div className="meta">
                      <span className={statusTagClass(c.status, c.isActive)}>{statusLabel(c.status)}</span>
                      <button className="btn-ghost" style={{ minHeight: 28, fontSize: "0.64rem" }}
                        onClick={() => {
                          setEmpForm({
                            name: c.name || "",
                            primaryContactName: c.primaryContactName || "",
                            contactEmail: c.contactEmail || "",
                            contactPhone: c.contactPhone || "",
                            taxDocument: c.taxDocument || "",
                            paymentMethod: c.paymentMethod || "",
                            billingProvider: c.billingProvider || "",
                          });
                          setEmpMsg(null);
                          setEmpOpen(true);
                        }}>Editar</button>
                    </div>
                  </div>
                  <div style={{ padding: "12px 16px 16px", display: "grid", gap: 8, fontSize: "0.74rem" }}>
                    {[
                      ["Contato", c.primaryContactName],
                      ["E-mail", c.contactEmail],
                      ["Telefone", c.contactPhone],
                      ["Documento", c.taxDocument],
                      ["Plano", c.plan?.name || PLANOS.find(p => p.value === c.selectedPlanKey)?.label],
                      ["Slug", c.slug],
                    ].map(([label, value]) => (
                      <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <span style={{ color: "var(--text-muted)" }}>{label}</span>
                        <span style={{ fontWeight: 600, textAlign: "right" }}>{value || "—"}</span>
                      </div>
                    ))}
                    {assumirContexto && c.id != null && (
                      <button className="btn-ghost" style={{ marginTop: 4, width: "fit-content", minHeight: 30, fontSize: "0.68rem" }}
                        onClick={() => assumirContexto(Number(c.id))}>
                        Assumir contexto desta empresa
                      </button>
                    )}
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-head"><h2>Cortesia</h2></div>
                  <div style={{ padding: "12px 16px 16px", display: "grid", gap: 10 }}>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                      Cortesia é a única liberação grátis do sistema. {emCortesia
                        ? `Ativa${c.courtesyEndsAt ? ` até ${fmtData(c.courtesyEndsAt)}` : " (permanente)"}${c.courtesyReason ? ` — ${c.courtesyReason}` : ""}.`
                        : "Esta empresa não está em cortesia."}
                    </span>
                    {cortesiaMsg && (
                      <div style={{ fontSize: "0.72rem", fontWeight: 700, color: cortesiaMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-warning)" }}>{cortesiaMsg}</div>
                    )}
                    <div style={{ display: "grid", gap: 6 }}>
                      <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Motivo</label>
                      <input className="field-dark" maxLength={200} placeholder="Ex.: Empresa interna HBX"
                        value={cortesiaForm.reason} onChange={e => setCortesiaForm(f => ({ ...f, reason: e.target.value }))} />
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Fim (vazio = permanente)</label>
                      <input className="field-dark" type="date"
                        value={cortesiaForm.endsAt} onChange={e => setCortesiaForm(f => ({ ...f, endsAt: e.target.value }))} />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn-teal" disabled={cortesiaBusy} onClick={() => salvarCortesia(true)}>
                        {cortesiaBusy ? "Salvando…" : emCortesia ? "Atualizar cortesia" : "Ativar cortesia"}
                      </button>
                      {emCortesia && (
                        <button className="btn-ghost" disabled={cortesiaBusy} onClick={() => salvarCortesia(false)}>Encerrar</button>
                      )}
                    </div>
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-head"><h2>Módulos</h2></div>
                  <div style={{ padding: "10px 16px 14px", display: "grid", gap: 8 }}>
                    {moduloMsg && <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--hbx-warning)", lineHeight: 1.5 }}>{moduloMsg}</div>}
                    {(c.modules || []).length === 0 && <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Sem módulos atribuíveis.</span>}
                    {(c.modules || []).map(m => (
                      <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.74rem" }}>
                        <span style={{ fontWeight: 600 }}>{m.name}</span>
                        <button className="btn-ghost" disabled={moduloBusy === m.key}
                          style={{ marginLeft: "auto", minHeight: 26, fontSize: "0.62rem", padding: "0 10px", ...(m.enabled ? { borderColor: "var(--hbx-brand)", color: "var(--hbx-brand-strong)" } : {}) }}
                          onClick={() => alternarModulo(m.key, !m.enabled)}>
                          {moduloBusy === m.key ? "…" : m.enabled ? "ON" : "OFF"}
                        </button>
                      </div>
                    ))}
                    <span style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>Ajuste fino por empresa só no HBX Full — nos demais planos o catálogo do plano manda (o backend barra).</span>
                  </div>
                </section>
              </div>

              <section className="panel">
                <div className="tabs">
                  {DETAIL_TABS.map(t => (
                    <button key={t} className={"tab" + (detailTab === t ? " active" : "")} onClick={() => setDetailTab(t)}
                      style={detailTab === t ? { color: "var(--hbx-brand-strong)", borderBottomColor: "var(--hbx-brand)" } : {}}>
                      {t}{t === "Usuários" ? <span className="n">{(c.users || []).length}</span> : null}{t === "Financeiro" ? <span className="n">{ledger.length}</span> : null}
                    </button>
                  ))}
                </div>

                {detailTab === "Usuários" && (
                  <React.Fragment>
                    {userMsg && (
                      <div style={{ padding: "10px 16px 0", fontSize: "0.72rem", fontWeight: 700, color: userMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-warning)" }}>{userMsg}</div>
                    )}
                    {resetResult && (
                      <div style={{ margin: "10px 16px 0", padding: "10px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--hbx-brand)", fontSize: "0.74rem", lineHeight: 1.5 }}>
                        ✓ Senha resetada (usuário #{resetResult.id}). Senha temporária:{" "}
                        <b style={{ fontFamily: "var(--font-mono)" }}>{resetResult.temporaryPassword}</b> — anote agora; o usuário troca no primeiro login.
                      </div>
                    )}
                    <div className="tbl-wrap">
                      <table className="tbl">
                        <thead>
                          <tr><th>Usuário</th><th>Papel</th><th>Status</th><th>Criado</th><th>Ações</th></tr>
                        </thead>
                        <tbody>
                          {(c.users || []).length === 0 && (
                            <tr><td colSpan={5} style={{ color: "var(--text-muted)" }}>Sem usuários.</td></tr>
                          )}
                          {(c.users || []).map(u => (
                            <tr key={u.id} style={{ cursor: "default" }}>
                              <td>
                                <div className="co">
                                  <strong>{u.name || u.username || "—"}</strong>
                                  <span className="sub2">{u.email || "—"}</span>
                                </div>
                              </td>
                              <td>{String(u.role || "").toUpperCase() === "ADMIN" ? "Admin" : "Vendedor"}</td>
                              <td><span className={u.isActive ? "tag teal" : "tag red"}>{u.isActive ? "Ativo" : "Inativo"}</span></td>
                              <td>{fmtDataHora(u.createdAt)}</td>
                              <td>
                                <div style={{ display: "flex", gap: 6 }}>
                                  <button className="btn-ghost" style={{ minHeight: 26, fontSize: "0.62rem", padding: "0 8px" }} disabled={userBusy}
                                    onClick={() => resetSenha(u)}>Reset senha</button>
                                  <button className="btn-ghost" style={{ minHeight: 26, fontSize: "0.62rem", padding: "0 8px" }} disabled={userBusy}
                                    onClick={() => { setUserEdit({ id: u.id, name: u.name || "", email: u.email || "", username: u.username || "", phone: "", role: String(u.role || "USER").toUpperCase(), isActive: u.isActive !== false }); setUserMsg(null); }}>Editar</button>
                                  {deleteArm === u.id ? (
                                    <button className="btn-ghost" style={{ minHeight: 26, fontSize: "0.62rem", padding: "0 8px", borderColor: "var(--hbx-danger)", color: "var(--hbx-danger)" }} disabled={userBusy}
                                      onClick={() => excluirUsuario(u.id)}>Confirmar exclusão</button>
                                  ) : (
                                    <button className="btn-ghost" style={{ minHeight: 26, fontSize: "0.62rem", padding: "0 8px", color: "var(--hbx-danger)" }} disabled={userBusy}
                                      onClick={() => setDeleteArm(u.id)}>Excluir</button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </React.Fragment>
                )}

                {detailTab === "Comercial" && (
                  <div style={{ padding: "12px 16px 16px", display: "grid", gap: 14 }}>
                    {comMsg && (
                      <div style={{ fontSize: "0.72rem", fontWeight: 700, lineHeight: 1.5, color: comMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-warning)" }}>{comMsg}</div>
                    )}

                    <div style={{ display: "grid", gap: 8 }}>
                      <strong style={{ fontSize: "0.76rem" }}>Trial</strong>
                      <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                        {emTrial ? `Em trial até ${fmtData(c.trialEndsAt)}.` : "Sem trial ativo."} Encerrar leva a empresa ao checkout (PR-002 B).
                      </span>
                      <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
                        <div style={{ display: "grid", gap: 4 }}>
                          <label style={{ fontSize: "0.64rem", fontWeight: 700, color: "var(--text-muted)" }}>Dias</label>
                          <input className="field-dark" type="number" min={1} max={365} style={{ width: 90 }} value={trialDias}
                            onChange={e => setTrialDias(e.target.value)} />
                        </div>
                        <button className="btn-teal" disabled={comBusy != null} onClick={() => trialAcao("grant")}>
                          {comBusy === "trial-grant" ? "Concedendo…" : emTrial ? "Estender trial" : "Conceder trial"}
                        </button>
                        {emTrial && (
                          <button className="btn-ghost" disabled={comBusy != null} onClick={() => trialAcao("end")}>
                            {comBusy === "trial-end" ? "…" : "Encerrar trial"}
                          </button>
                        )}
                      </div>
                    </div>

                    <div style={{ borderTop: "1px solid var(--border-hairline)", paddingTop: 12, display: "grid", gap: 8 }}>
                      <strong style={{ fontSize: "0.76rem" }}>Suspensão</strong>
                      <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{suspensa ? "Empresa SUSPENSA — sem acesso." : "Empresa não está suspensa."}</span>
                      <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
                        <div style={{ display: "grid", gap: 4, flex: 1, minWidth: 180 }}>
                          <label style={{ fontSize: "0.64rem", fontWeight: 700, color: "var(--text-muted)" }}>Motivo</label>
                          <input className="field-dark" maxLength={200} value={suspReason} onChange={e => setSuspReason(e.target.value)} />
                        </div>
                        {suspensa ? (
                          <button className="btn-teal" disabled={comBusy != null} onClick={() => setSuspensao(false)}>
                            {comBusy === "susp" ? "…" : "Remover suspensão"}
                          </button>
                        ) : (
                          <button className="btn-ghost" style={{ borderColor: "var(--hbx-danger)", color: "var(--hbx-danger)" }} disabled={comBusy != null}
                            onClick={() => setSuspensao(true)}>
                            {comBusy === "susp" ? "…" : "Suspender empresa"}
                          </button>
                        )}
                      </div>
                    </div>

                    <div style={{ borderTop: "1px solid var(--border-hairline)", paddingTop: 12, display: "grid", gap: 8 }}>
                      <strong style={{ fontSize: "0.76rem" }}>Plano</strong>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <select className="field-dark" style={{ minWidth: 160 }} value={planoSel} onChange={e => { setPlanoSel(e.target.value); setPlanoArm(false); }}>
                          <option value="">Escolha…</option>
                          {PLANOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                        {planoArm ? (
                          <button className="btn-ghost" style={{ borderColor: "var(--hbx-danger)", color: "var(--hbx-danger)" }} disabled={comBusy != null} onClick={mudarPlano}>
                            {comBusy === "plano" ? "Mudando…" : "Confirmar mudança de plano"}
                          </button>
                        ) : (
                          <button className="btn-ghost" disabled={comBusy != null || !planoSel || planoSel === String(c.selectedPlanKey || "")}
                            onClick={() => setPlanoArm(true)}>Mudar plano</button>
                        )}
                      </div>
                      <span style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>Mudar plano redefine módulos e entitlements pelo catálogo do plano.</span>
                    </div>

                    <div style={{ borderTop: "1px solid var(--border-hairline)", paddingTop: 12, display: "grid", gap: 8 }}>
                      <strong style={{ fontSize: "0.76rem" }}>Quota de cards (override)</strong>
                      <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
                        <div style={{ display: "grid", gap: 4 }}>
                          <label style={{ fontSize: "0.64rem", fontWeight: 700, color: "var(--text-muted)" }}>Mensal</label>
                          <input className="field-dark" type="number" min={0} style={{ width: 110 }} placeholder="padrão do plano"
                            value={quotaForm.monthly} onChange={e => setQuotaForm(f => ({ ...f, monthly: e.target.value }))} />
                        </div>
                        <div style={{ display: "grid", gap: 4 }}>
                          <label style={{ fontSize: "0.64rem", fontWeight: 700, color: "var(--text-muted)" }}>Diária</label>
                          <input className="field-dark" type="number" min={0} style={{ width: 110 }} placeholder="padrão do plano"
                            value={quotaForm.daily} onChange={e => setQuotaForm(f => ({ ...f, daily: e.target.value }))} />
                        </div>
                        <button className="btn-ghost" disabled={comBusy != null} onClick={salvarQuota}>
                          {comBusy === "quota" ? "Salvando…" : "Salvar quota"}
                        </button>
                      </div>
                    </div>

                    <div style={{ borderTop: "1px solid var(--border-hairline)", paddingTop: 12, display: "grid", gap: 8 }}>
                      <strong style={{ fontSize: "0.76rem" }}>Condições de cobrança</strong>
                      <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
                        <div style={{ display: "grid", gap: 4 }}>
                          <label style={{ fontSize: "0.64rem", fontWeight: 700, color: "var(--text-muted)" }}>Desconto manual (%)</label>
                          <input className="field-dark" type="number" min={0} max={100} step="0.01" style={{ width: 130 }}
                            value={finForm.discount} onChange={e => setFinForm(f => ({ ...f, discount: e.target.value }))} />
                        </div>
                        <div style={{ display: "grid", gap: 4 }}>
                          <label style={{ fontSize: "0.64rem", fontWeight: 700, color: "var(--text-muted)" }}>Meses grátis</label>
                          <input className="field-dark" type="number" min={0} max={24} style={{ width: 100 }}
                            value={finForm.freeMonths} onChange={e => setFinForm(f => ({ ...f, freeMonths: e.target.value }))} />
                        </div>
                        <div style={{ display: "grid", gap: 4 }}>
                          <label style={{ fontSize: "0.64rem", fontWeight: 700, color: "var(--text-muted)" }}>Ciclo</label>
                          <select className="field-dark" value={finForm.billingCycle} onChange={e => setFinForm(f => ({ ...f, billingCycle: e.target.value }))}>
                            <option value="">manter</option>
                            <option value="MONTHLY">Mensal</option>
                            <option value="ANNUAL">Anual</option>
                          </select>
                        </div>
                        <button className="btn-ghost" disabled={comBusy != null} onClick={salvarFinanceSettings}>
                          {comBusy === "fin" ? "Salvando…" : "Salvar condições"}
                        </button>
                      </div>
                    </div>

                    <div style={{ borderTop: "1px solid var(--border-hairline)", paddingTop: 12, display: "grid", gap: 8 }}>
                      <strong style={{ fontSize: "0.76rem" }}>Credenciais master</strong>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: "0.72rem" }}>
                        <span style={{ fontWeight: 600 }}>WhatsApp:</span>
                        <button className="btn-ghost" disabled={comBusy != null}
                          style={{ minHeight: 26, fontSize: "0.62rem", ...(c.whatsapp?.usingMasterToken ? { borderColor: "var(--hbx-brand)", color: "var(--hbx-brand-strong)" } : {}) }}
                          onClick={() => salvarTokens({ useMasterWhatsAppToken: !c.whatsapp?.usingMasterToken })}>
                          {c.whatsapp?.usingMasterToken ? "usando master" : "token próprio"}
                        </button>
                        {credsWa.length > 0 && (
                          <select className="field-dark" style={{ minHeight: 30, fontSize: "0.66rem", width: 170 }}
                            value={String(c.whatsapp?.masterCredentialKey || "")}
                            onChange={e => salvarTokens({ useMasterWhatsAppToken: true, masterWhatsAppCredentialKey: e.target.value })}>
                            <option value="">credencial…</option>
                            {credsWa.map(cr => <option key={cr.key} value={cr.key}>{cr.label || cr.key}{cr.configured ? "" : " (incompleta)"}</option>)}
                          </select>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: "0.72rem" }}>
                        <span style={{ fontWeight: 600 }}>Mercado Pago:</span>
                        <button className="btn-ghost" disabled={comBusy != null}
                          style={{ minHeight: 26, fontSize: "0.62rem", ...(c.mercadoPago?.usingMasterToken ? { borderColor: "var(--hbx-brand)", color: "var(--hbx-brand-strong)" } : {}) }}
                          onClick={() => salvarTokens({ useMasterMercadoPagoToken: !c.mercadoPago?.usingMasterToken })}>
                          {c.mercadoPago?.usingMasterToken ? "usando master" : "token próprio"}
                        </button>
                        {credsMp.length > 0 && (
                          <select className="field-dark" style={{ minHeight: 30, fontSize: "0.66rem", width: 170 }}
                            value={String(c.mercadoPago?.masterCredentialKey || "")}
                            onChange={e => salvarTokens({ useMasterMercadoPagoToken: true, masterMercadoPagoCredentialKey: e.target.value })}>
                            <option value="">credencial…</option>
                            {credsMp.map(cr => <option key={cr.key} value={cr.key}>{cr.label || cr.key}{cr.configured ? "" : " (incompleta)"}</option>)}
                          </select>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {detailTab === "Financeiro" && (
                  <React.Fragment>
                    <div style={{ padding: "10px 16px 0", display: "flex", gap: 8, alignItems: "center" }}>
                      <button className="btn-teal" style={{ minHeight: 32, fontSize: "0.7rem" }}
                        onClick={() => { setPagForm(PAG_VAZIO); setPagMsg(null); setPagOpen(true); }}>+ Registrar pagamento</button>
                      {pagMsg && (
                        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: pagMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-warning)" }}>{pagMsg}</span>
                      )}
                    </div>
                    <div className="tbl-wrap">
                      <table className="tbl">
                        <thead>
                          <tr><th>Lançamento</th><th>Status</th><th>Competência</th><th>Valor</th><th>Pago em</th><th>Método</th><th></th></tr>
                        </thead>
                        <tbody>
                          {ledger.length === 0 && (
                            <tr><td colSpan={7} style={{ color: "var(--text-muted)" }}>Sem lançamentos financeiros.</td></tr>
                          )}
                          {ledger.map(l => {
                            // backend grava CANCELLED (2 L); cobre as duas grafias
                            const cancelado = String(l.status || "").toUpperCase().startsWith("CANCEL");
                            const manual = String(l.origin || "").toLowerCase().includes("manual") || String(l.entryType || "").toLowerCase().includes("manual");
                            return (
                              <tr key={l.id} style={{ cursor: "default", opacity: cancelado ? 0.55 : 1 }}>
                                <td>
                                  <div className="co">
                                    <strong>{l.referenceLabel || l.entryType || "—"}</strong>
                                    <span className="sub2">{l.observation || l.origin || "—"}</span>
                                  </div>
                                </td>
                                <td><span className={cancelado ? "tag red" : String(l.status || "").toUpperCase() === "PAID" ? "tag teal" : "tag warn"}>{l.status || "—"}</span></td>
                                <td>{l.competence || "—"}</td>
                                <td style={{ fontFamily: "var(--font-mono)" }}>{fmtBRL(l.amount)}</td>
                                <td>{l.paidAt ? fmtData(l.paidAt) : "—"}</td>
                                <td>{l.paymentMethod || "—"}</td>
                                <td>
                                  {manual && !cancelado && (cancelArm === l.id ? (
                                    <button className="btn-ghost" style={{ minHeight: 26, fontSize: "0.62rem", borderColor: "var(--hbx-danger)", color: "var(--hbx-danger)" }}
                                      disabled={pagBusy} onClick={() => cancelarLancamento(l.id)}>Confirmar</button>
                                  ) : (
                                    <button className="btn-ghost" style={{ minHeight: 26, fontSize: "0.62rem", color: "var(--hbx-danger)" }}
                                      disabled={pagBusy} onClick={() => setCancelArm(l.id)}>Cancelar</button>
                                  ))}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </React.Fragment>
                )}

                {detailTab === "Auditoria" && (
                  <div style={{ padding: "12px 16px 16px", display: "grid", gap: 8, maxHeight: 480, overflowY: "auto" }}>
                    {auditoria.length === 0 && <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Sem eventos de auditoria.</span>}
                    {auditoria.map(a => (
                      <div key={a.id} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: "0.72rem", padding: "7px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-hairline)" }}>
                        <span className={String(a.severity || "").toUpperCase() === "WARN" ? "tag warn" : "tag"}>{a.scope || "—"}</span>
                        <strong style={{ fontSize: "0.7rem" }}>{a.action || "—"}</strong>
                        <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: "0.62rem", color: "var(--text-muted)" }}>{fmtDataHora(a.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </React.Fragment>
      )}

      {provOpen && (
        <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) setProvOpen(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 45, display: "grid", placeItems: "center", padding: 24 }}>
          <form className="hbx-modal" onSubmit={provisionar}
            style={{ width: "min(480px, 100%)", maxHeight: "90vh", overflowY: "auto", display: "grid", gap: 12, padding: 24 }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Nova empresa cliente
              <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={() => setProvOpen(false)}>✕</span>
            </h3>
            {provMsg && <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--hbx-warning)", lineHeight: 1.5 }}>{provMsg}</div>}
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Nome da empresa *</label>
              <input className="field-dark" required maxLength={140} value={provForm.companyName}
                onChange={e => setProvForm(f => ({ ...f, companyName: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Plano</label>
                <select className="field-dark" value={provForm.planKey} onChange={e => setProvForm(f => ({ ...f, planKey: e.target.value }))}>
                  {PLANOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Ciclo</label>
                <select className="field-dark" value={provForm.billingCycle} onChange={e => setProvForm(f => ({ ...f, billingCycle: e.target.value }))}>
                  <option value="MONTHLY">Mensal</option>
                  <option value="ANNUAL">Anual</option>
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Slug (opcional)</label>
              <input className="field-dark" maxLength={80} placeholder="gerado do nome se vazio" value={provForm.slug}
                onChange={e => setProvForm(f => ({ ...f, slug: e.target.value }))} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.74rem", fontWeight: 600 }}>
              <input type="checkbox" checked={provForm.manualAccess} onChange={e => setProvForm(f => ({ ...f, manualAccess: e.target.checked }))} />
              Acesso manual (cortesia desde o início)
            </label>
            <div style={{ borderTop: "1px solid var(--border-hairline)", paddingTop: 10, display: "grid", gap: 10 }}>
              <strong style={{ fontSize: "0.74rem" }}>Admin inicial (opcional)</strong>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>E-mail do admin</label>
                <input className="field-dark" type="email" maxLength={180} value={provForm.adminEmail}
                  onChange={e => setProvForm(f => ({ ...f, adminEmail: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Nome</label>
                  <input className="field-dark" maxLength={120} value={provForm.adminName}
                    onChange={e => setProvForm(f => ({ ...f, adminName: e.target.value }))} />
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Telefone</label>
                  <input className="field-dark" maxLength={30} value={provForm.adminPhone}
                    onChange={e => setProvForm(f => ({ ...f, adminPhone: e.target.value }))} />
                </div>
              </div>
              <span style={{ fontSize: "0.64rem", color: "var(--text-muted)" }}>Com e-mail preenchido o backend cria o admin com senha temporária (mostrada uma única vez).</span>
            </div>
            <button className="btn-teal" type="submit" disabled={provBusy} style={{ minHeight: 42 }}>
              {provBusy ? "Criando…" : "Criar empresa"}
            </button>
          </form>
        </div>
      )}

      {empOpen && (
        <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) setEmpOpen(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 45, display: "grid", placeItems: "center", padding: 24 }}>
          <form className="hbx-modal" onSubmit={salvarEmpresa}
            style={{ width: "min(460px, 100%)", display: "grid", gap: 12, padding: 24 }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Editar empresa
              <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={() => setEmpOpen(false)}>✕</span>
            </h3>
            {empMsg && <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--hbx-warning)", lineHeight: 1.5 }}>{empMsg}</div>}
            {([
              ["name", "Razão social / nome"],
              ["primaryContactName", "Contato principal"],
              ["contactEmail", "E-mail de contato"],
              ["contactPhone", "Telefone"],
              ["taxDocument", "CNPJ / documento"],
            ] as [keyof typeof EMP_VAZIO, string][]).map(([k, label]) => (
              <div key={k} style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>{label}</label>
                <input className="field-dark" maxLength={200} value={empForm[k]}
                  onChange={e => setEmpForm(f => ({ ...f, [k]: e.target.value }))} />
              </div>
            ))}
            <button className="btn-teal" type="submit" disabled={empBusy} style={{ minHeight: 42 }}>
              {empBusy ? "Salvando…" : "Salvar empresa"}
            </button>
          </form>
        </div>
      )}

      {pagOpen && (
        <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) setPagOpen(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 45, display: "grid", placeItems: "center", padding: 24 }}>
          <form className="hbx-modal" onSubmit={registrarPagamento}
            style={{ width: "min(420px, 100%)", display: "grid", gap: 12, padding: 24 }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Registrar pagamento manual
              <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={() => setPagOpen(false)}>✕</span>
            </h3>
            {pagMsg && !pagMsg.startsWith("✓") && (
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--hbx-warning)", lineHeight: 1.5 }}>{pagMsg}</div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Valor (R$) *</label>
                <input className="field-dark" required inputMode="decimal" placeholder="0,00" value={pagForm.value}
                  onChange={e => setPagForm(f => ({ ...f, value: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Competência</label>
                <input className="field-dark" placeholder="ex.: 2026-06" maxLength={20} value={pagForm.competence}
                  onChange={e => setPagForm(f => ({ ...f, competence: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Pago em</label>
                <input className="field-dark" type="date" value={pagForm.paidAt}
                  onChange={e => setPagForm(f => ({ ...f, paidAt: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Método</label>
                <select className="field-dark" value={pagForm.paymentMethod} onChange={e => setPagForm(f => ({ ...f, paymentMethod: e.target.value }))}>
                  <option value="PIX">PIX</option>
                  <option value="BOLETO">Boleto</option>
                  <option value="TRANSFER">Transferência</option>
                  <option value="CASH">Dinheiro</option>
                  <option value="OTHER">Outro</option>
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Observação</label>
              <input className="field-dark" maxLength={280} value={pagForm.observation}
                onChange={e => setPagForm(f => ({ ...f, observation: e.target.value }))} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.74rem", fontWeight: 600 }}>
              <input type="checkbox" checked={pagForm.settlePending} onChange={e => setPagForm(f => ({ ...f, settlePending: e.target.checked }))} />
              Quitar pendências em aberto com este pagamento
            </label>
            <button className="btn-teal" type="submit" disabled={pagBusy} style={{ minHeight: 42 }}>
              {pagBusy ? "Registrando…" : "Registrar pagamento"}
            </button>
          </form>
        </div>
      )}

      {userEdit && (
        <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) setUserEdit(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 45, display: "grid", placeItems: "center", padding: 24 }}>
          <form className="hbx-modal" onSubmit={salvarUsuario}
            style={{ width: "min(440px, 100%)", display: "grid", gap: 12, padding: 24 }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Editar usuário #{userEdit.id}
              <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={() => setUserEdit(null)}>✕</span>
            </h3>
            {userMsg && !userMsg.startsWith("✓") && (
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--hbx-warning)", lineHeight: 1.5 }}>{userMsg}</div>
            )}
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Nome</label>
              <input className="field-dark" maxLength={120} value={userEdit.name}
                onChange={e => setUserEdit(u => u && ({ ...u, name: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>E-mail</label>
              <input className="field-dark" type="email" maxLength={180} value={userEdit.email}
                onChange={e => setUserEdit(u => u && ({ ...u, email: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Username</label>
                <input className="field-dark" maxLength={120} value={userEdit.username}
                  onChange={e => setUserEdit(u => u && ({ ...u, username: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Telefone</label>
                <input className="field-dark" maxLength={30} value={userEdit.phone}
                  onChange={e => setUserEdit(u => u && ({ ...u, phone: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Papel</label>
                <select className="field-dark" value={userEdit.role} onChange={e => setUserEdit(u => u && ({ ...u, role: e.target.value }))}>
                  <option value="USER">Vendedor</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.74rem", fontWeight: 600, alignSelf: "end", paddingBottom: 8 }}>
                <input type="checkbox" checked={userEdit.isActive} onChange={e => setUserEdit(u => u && ({ ...u, isActive: e.target.checked }))} />
                Ativo
              </label>
            </div>
            <button className="btn-teal" type="submit" disabled={userBusy} style={{ minHeight: 42 }}>
              {userBusy ? "Salvando…" : "Salvar usuário"}
            </button>
          </form>
        </div>
      )}
    </React.Fragment>
  );
}
