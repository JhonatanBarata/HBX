"use client";

// /gerencial — restauração em paralelo (ordem do dono, 12/06/2026).
// Fase 1: PRODUTOS (admin-only — vendedor não edita produto, valor, código
// ou descrição; o backend já barra via team policy, aqui a tela espelha).
// Criar envia priceCents (contorna o bug E3 da fila); editar/arquivar
// esbarram no E4 (PATCH 500 no versionamento) — erro tratado com aviso
// honesto até o lote ser aplicado.
// Equipe: régua do cargo Vendedor (CargoAcessosEditor) + lista de membros +
// Novo acesso (NovoAcessoModal). Acesso por CARGO, não por pessoa.

import React, { useCallback, useEffect, useState } from "react";

import { CargoAcessosEditor } from "@/components/hbx/cargo-acessos-editor";
import { NovoAcessoModal } from "@/components/hbx/novo-acesso-modal";
import { TeamPolicyEditor } from "@/components/hbx/team-policy-editor";
import { Av, I, ICONS, useCurrentUser } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import { useTabIndex, useTabParam } from "@/lib/use-tab-param";

type Produto = {
  id: number;
  name: string;
  sku?: string | null;
  description?: string | null;
  price?: number | null;
  priceCents?: number | null;
  currency?: string | null;
  billingCycle?: string | null;
  defaultCommissionPercent?: number | null;
  status?: string;
};

const CICLOS: { value: string; label: string }[] = [
  { value: "", label: "Cobrança única" },
  { value: "MONTHLY", label: "Mensal" },
  { value: "YEARLY", label: "Anual" },
];

const ABAS = ["Produtos", "Comissões", "Candidaturas", "Visão geral", "Equipe"];

type Candidatura = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  experience?: string | null;
  resumeUrl?: string | null;
  status: string;
  createdAt?: string | null;
};

type ComissaoCliente = {
  leadId: string;
  name: string;
  city?: string | null;
  saleStatusLabel?: string;
  commissionStatusLabel?: string;
  saleValue?: number | null;
  commissionAmount?: number | null;
  commissionDueAt?: string | null;
  commissionPaidAt?: string | null;
};

type TeamMember = {
  id: number;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  role?: string | null;
  isActive?: boolean;
};

type ComissaoSummary = {
  ok?: boolean;
  scope?: string;
  canPayout?: boolean;
  settings?: { dueBusinessDays?: number };
  totals?: {
    assignedCards: number;
    activeClients: number;
    pendingActivation: number;
    payableAmount: number;
    duePayableAmount: number;
    duePayableCount: number;
    pendingAmount: number;
    paidAmount: number;
    nextDueAt?: string | null;
  };
  clients?: {
    payable?: ComissaoCliente[];
    pendingActivation?: ComissaoCliente[];
    paid?: ComissaoCliente[];
  };
  payouts?: { id: string; sellerName?: string | null; status?: string; leadCount?: number; totalAmount?: number; paidAt?: string | null }[];
} | null;

function fmtBRL(v?: number | null) {
  return (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtData(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

function precoDe(p: Produto) {
  if (p.priceCents != null && Number.isFinite(p.priceCents)) return p.priceCents / 100;
  if (p.price != null && Number.isFinite(p.price)) return p.price;
  return 0;
}

function fmtPreco(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function cicloLabel(c?: string | null) {
  return CICLOS.find(x => x.value === String(c || ""))?.label || (c ? String(c) : "Única");
}

// Comissão NÃO é do produto (ordem do dono 12/06/2026): o percentual é
// acordado por VENDEDOR (user.commissionPercent) e o cálculo do backend lê
// de lá — produto fixando % atropelaria o acordo da equipe.
const FORM_VAZIO = { name: "", sku: "", description: "", preco: "", billingCycle: "" };

export function GerencialClient() {
  const user = useCurrentUser() as { role?: string; isSystemMaster?: boolean; username?: string | null; email?: string | null } | null;
  const isAdmin = Boolean(user && (String(user.role || "").toUpperCase() === "ADMIN" || user.isSystemMaster));

  const [aba, setAba] = useTabIndex("aba", 0);

  // aviso do sino → abre direto na aba (mesmo padrão do "+" → Novo lead);
  // a dica vem por NOME da aba (ex.: "Candidaturas", "Comissões")
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const dica = sessionStorage.getItem("hbx:gerencial-aba");
        if (dica) {
          sessionStorage.removeItem("hbx:gerencial-aba");
          const idx = ABAS.indexOf(dica);
          if (idx >= 0) setAba(idx);
        }
      } catch { /* sem storage */ }
    }, 0);
    return () => clearTimeout(t);
  }, [setAba]);

  const [produtos, setProdutos] = useState<Produto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [arquivarArm, setArquivarArm] = useState<number | null>(null);

  // aba Comissões: resumo real + ações de payout (gerar/cancelar)
  const [comissoes, setComissoes] = useState<ComissaoSummary>(null);
  const [comissoesErro, setComissoesErro] = useState<string | null>(null);

  // E5: casos de cancelamento — triagem do master (manter/estornar/desvincular)
  type CasoCancelamento = { leadId: string; name: string; sellerName?: string | null; saleStatusLabel?: string; saleValue?: number; commissionStatusLabel?: string; commissionAmount?: number; refundAmount?: number; openedAt?: string | null };
  const [casos, setCasos] = useState<CasoCancelamento[] | null>(null);
  const [casoBusy, setCasoBusy] = useState(false);
  const [casoMsg, setCasoMsg] = useState<string | null>(null);
  const [casoArm, setCasoArm] = useState<string | null>(null); // `${leadId}:${resolution}`
  const [soComSaldo, setSoComSaldo] = useState(false);

  useEffect(() => {
    if (aba !== 1 || casos) return;
    let alive = true;
    apiFetch<{ cases?: CasoCancelamento[] }>("/vendas/cancellation-cases")
      .then(res => { if (alive) setCasos(Array.isArray(res?.cases) ? res.cases : []); })
      .catch(() => { if (alive) setCasos([]); });
    return () => { alive = false; };
  }, [aba, casos]);

  async function decidirCaso(leadId: string, resolution: "kept" | "reversed" | "unlinked") {
    if (casoBusy) return;
    setCasoBusy(true);
    setCasoMsg(null);
    try {
      await apiFetch(`/vendas/lead/${encodeURIComponent(leadId)}/cancellation-case`, {
        method: "PATCH",
        body: JSON.stringify({ resolution }),
      });
      setCasoMsg(resolution === "kept" ? "✓ Comissão mantida." : resolution === "reversed" ? "✓ Comissão estornada." : "✓ Venda desvinculada do vendedor.");
      setCasos(null); // recarrega casos
      setComissoes(null); // recarrega resumo
    } catch (err) {
      setCasoMsg(err instanceof Error ? err.message : "Não foi possível registrar a decisão.");
    } finally {
      setCasoBusy(false);
      setCasoArm(null);
    }
  }
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payoutSellers, setPayoutSellers] = useState<{ id: number; name?: string | null; username?: string | null; email?: string | null }[] | null>(null);
  const [payoutForm, setPayoutForm] = useState({ sellerUserId: "", includeNotYetDue: false, referenceLabel: "" });
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [payoutMsg, setPayoutMsg] = useState<string | null>(null);
  const [cancelArm, setCancelArm] = useState<string | null>(null);

  function abrirPayout() {
    setPayoutMsg(null);
    setPayoutForm({ sellerUserId: "", includeNotYetDue: false, referenceLabel: "" });
    setPayoutOpen(true);
    if (payoutSellers === null) {
      apiFetch<{ id: number; name?: string | null; username?: string | null; email?: string | null }[]>("/users/company")
        .then(res => setPayoutSellers(Array.isArray(res) ? res : []))
        .catch(() => setPayoutSellers([]));
    }
  }

  async function gerarPayout(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (payoutBusy) return;
    setPayoutBusy(true);
    setPayoutMsg(null);
    try {
      await apiFetch("/vendas/commission/payout", {
        method: "POST",
        body: JSON.stringify({
          ...(payoutForm.sellerUserId ? { sellerUserId: Number(payoutForm.sellerUserId) } : {}),
          includeNotYetDue: payoutForm.includeNotYetDue,
          ...(payoutForm.referenceLabel ? { referenceLabel: payoutForm.referenceLabel } : {}),
        }),
      });
      setPayoutMsg("✓ Payout gerado — comissões marcadas como pagas.");
      setPayoutOpen(false);
      setComissoes(null); // força recarga do resumo
    } catch (err) {
      setPayoutMsg(err instanceof Error ? err.message : "Não foi possível gerar o payout.");
    } finally {
      setPayoutBusy(false);
    }
  }

  async function cancelarPayout(id: string) {
    if (payoutBusy) return;
    setPayoutBusy(true);
    setPayoutMsg(null);
    try {
      await apiFetch(`/vendas/commission/payout/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
        body: JSON.stringify({ notes: "Cancelado pelo gerencial" }),
      });
      setPayoutMsg("✓ Payout cancelado — comissões reabertas.");
      setComissoes(null);
    } catch (err) {
      setPayoutMsg(err instanceof Error ? err.message : "Não foi possível cancelar o payout.");
    } finally {
      setPayoutBusy(false);
      setCancelArm(null);
    }
  }

  useEffect(() => {
    if (aba !== 1 || comissoes) return;
    let alive = true;
    apiFetch<ComissaoSummary>("/vendas/commission/summary")
      .then(res => { if (alive) { setComissoes(res); setComissoesErro(null); } })
      .catch((err: unknown) => { if (alive) setComissoesErro(err instanceof Error ? err.message : "Falha ao carregar comissões."); });
    return () => { alive = false; };
  }, [aba, comissoes]);

  // aba Candidaturas (Trabalhe Conosco): triagem do admin
  const [cands, setCands] = useState<Candidatura[] | null>(null);
  const [candMsg, setCandMsg] = useState<string | null>(null);
  const [candBusy, setCandBusy] = useState(false);
  const [candArm, setCandArm] = useState<string | null>(null); // `${id}:${action}`

  useEffect(() => {
    if (aba !== 2 || cands) return;
    let alive = true;
    apiFetch<{ applications?: Candidatura[] }>("/gerencial/trabalhe-conosco")
      .then(res => { if (alive) setCands(Array.isArray(res?.applications) ? res.applications : []); })
      .catch(() => { if (alive) setCands([]); });
    return () => { alive = false; };
  }, [aba, cands]);

  async function revisarCandidatura(id: string, action: "approve" | "reject") {
    if (candBusy) return;
    setCandBusy(true);
    setCandMsg(null);
    try {
      const res = await apiFetch<{ nextStep?: string }>(`/gerencial/trabalhe-conosco/${encodeURIComponent(id)}/review`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      setCandMsg(`✓ ${res?.nextStep || (action === "approve" ? "Aprovada." : "Rejeitada.")}`);
      setCands(null);
    } catch (err) {
      setCandMsg(err instanceof Error ? err.message : "Não foi possível revisar.");
    } finally {
      setCandBusy(false);
      setCandArm(null);
    }
  }

  // aba Equipe: lista de membros + novo-acesso modal (acesso por CARGO via CargoAcessosEditor)
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [teamDenied, setTeamDenied] = useState(false);
  const [teamMsg, setTeamMsg] = useState<string | null>(null);
  const [novoParam, setNovoParam] = useTabParam<string>("novo", "");
  const [membroParam, setMembroParam] = useTabParam<string>("membro", "");
  const [acessoParam, setAcessoParam] = useTabParam<string>("acesso", "");
  const novoAcessoOpen = novoParam === "1";
  const gerirMembro = (team || []).find(m => String(m.id) === membroParam) || null;
  const acessoMembro = (team || []).find(m => String(m.id) === acessoParam) || null;

  function abrirNovoAcesso() {
    try { localStorage.removeItem("hbx:novo-acesso-draft"); } catch { /* sem storage */ }
    setMembroParam("");
    setNovoParam("1");
  }
  function abrirGerir(m: TeamMember) {
    setNovoParam("");
    setAcessoParam("");
    setMembroParam(String(m.id));
  }
  function abrirAcessos(m: TeamMember) {
    setNovoParam("");
    setMembroParam("");
    setAcessoParam(String(m.id));
  }
  function recarregarEquipe() {
    return apiFetch<TeamMember[]>("/users/company")
      .then(res => setTeam(Array.isArray(res) ? res : []))
      .catch(() => setTeamDenied(true));
  }

  // Excluir vendedor (restaurado 22/06): o backend já tinha DELETE /users/:id/delete
  // (admin-only, hard delete). Aqui o front liga o botão + confirmação.
  const [excluirAlvo, setExcluirAlvo] = useState<TeamMember | null>(null);
  const [excluirBusy, setExcluirBusy] = useState(false);
  async function excluirMembro() {
    if (!excluirAlvo || excluirBusy) return;
    setExcluirBusy(true);
    setTeamMsg(null);
    try {
      await apiFetch(`/users/${excluirAlvo.id}/delete`, { method: "DELETE" });
      setTeamMsg("✓ Vendedor excluído definitivamente.");
      setExcluirAlvo(null);
      await recarregarEquipe();
    } catch (err) {
      setTeamMsg(err instanceof Error ? err.message : "Não foi possível excluir.");
    } finally {
      setExcluirBusy(false);
    }
  }
  function ehProprioUsuario(m: TeamMember): boolean {
    if (!user) return false;
    const uEmail = String(user.email || "").toLowerCase();
    const uUser = String(user.username || "").toLowerCase();
    return Boolean(
      (uEmail && m.email && uEmail === String(m.email).toLowerCase()) ||
      (uUser && m.username && uUser === String(m.username).toLowerCase()),
    );
  }

  useEffect(() => {
    if (aba !== 4 || team !== null) return;
    recarregarEquipe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, team]);

  const carregar = useCallback(() => {
    return apiFetch<Produto[] | { items?: Produto[] }>("/products")
      .then(res => {
        const list = Array.isArray(res) ? res : (Array.isArray(res?.items) ? res.items : []);
        setProdutos(list);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        setProdutos([]);
        setLoadError(err instanceof Error ? err.message : "Falha ao carregar produtos.");
      });
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function abrirNovo() {
    setEditId(null);
    setForm(FORM_VAZIO);
    setMsg(null);
    setModalOpen(true);
  }

  function abrirEditar(p: Produto) {
    setEditId(p.id);
    setForm({
      name: p.name || "",
      sku: p.sku || "",
      description: p.description || "",
      preco: String(precoDe(p) || ""),
      billingCycle: String(p.billingCycle || ""),
    });
    setMsg(null);
    setModalOpen(true);
  }

  function erroHonesto(err: unknown, acao: string) {
    const texto = err instanceof Error ? err.message : "";
    if (/internal server error/i.test(texto)) {
      return `${acao} esbarrou na correção E4 da fila do backend (versionamento de produto) — destrava no próximo "aplica a fila".`;
    }
    return texto || `Não foi possível ${acao.toLowerCase()}.`;
  }

  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const body = {
      name: form.name,
      sku: form.sku || undefined,
      description: form.description || undefined,
      // priceCents direto: contorna o bug E3 (price → 0) sem tocar o backend
      priceCents: Math.max(0, Math.round(Number(form.preco || 0) * 100)),
      billingCycle: form.billingCycle || undefined,
    };
    try {
      if (editId == null) {
        await apiFetch("/products", { method: "POST", body: JSON.stringify(body) });
        setMsg("✓ Produto criado.");
      } else {
        await apiFetch(`/products/${editId}`, { method: "PATCH", body: JSON.stringify(body) });
        setMsg("✓ Produto atualizado.");
      }
      setModalOpen(false);
      await carregar();
    } catch (err) {
      setMsg(erroHonesto(err, editId == null ? "Criar produto" : "Editar produto"));
    } finally {
      setBusy(false);
    }
  }

  async function arquivar(p: Produto) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await apiFetch(`/products/${p.id}`, { method: "DELETE" });
      setMsg(`✓ "${p.name}" arquivado.`);
      await carregar();
    } catch (err) {
      setMsg(erroHonesto(err, "Arquivar produto"));
    } finally {
      setBusy(false);
      setArquivarArm(null);
    }
  }

  return (
    <React.Fragment>
        <div className="work ger-page" style={{ flex: 1 }}>
          {user && !isAdmin && (
            <section className="panel">
              <div style={{ padding: 18 }}>
                <strong style={{ fontSize: "0.86rem" }}>Área do administrador</strong>
                <p style={{ margin: "6px 0 0", fontSize: "0.74rem", color: "var(--text-muted)" }}>
                  Produtos, comissões e governança da equipe são geridos pelo Admin da empresa.
                </p>
              </div>
            </section>
          )}

          {isAdmin && (
            <React.Fragment>
              <div className="ger-nav" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {ABAS.map((a, i) => (
                  <button key={a} className="btn-ghost" onClick={() => setAba(i)}
                    style={i === aba ? { borderColor: "var(--hbx-brand)", color: "var(--hbx-brand-strong)", background: "var(--hbx-brand-soft)" } : {}}>
                    {a}
                  </button>
                ))}
              </div>

              {aba === 0 && (
                <section className="panel">
                  <div className="panel-head">
                    <h2>Produtos da empresa</h2>
                    <div className="meta">
                      {msg && <span style={{ fontWeight: 700, color: msg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-warning)" }}>{msg}</span>}
                      <button className="btn-teal" onClick={abrirNovo}><I d={ICONS.plus} size={14} /> Novo produto</button>
                    </div>
                  </div>
                  <div className="tbl-wrap">
                    <table className="tbl">
                      <thead>
                        <tr><th>Produto</th><th>Código</th><th>Preço</th><th>Ciclo</th><th>Status</th><th></th></tr>
                      </thead>
                      <tbody>
                        {produtos === null && (
                          <tr style={{ cursor: "default" }}><td colSpan={6} style={{ textAlign: "center", color: "var(--text-muted)", padding: "22px" }}>Carregando…</td></tr>
                        )}
                        {produtos !== null && produtos.length === 0 && (
                          <tr style={{ cursor: "default" }}>
                            <td colSpan={6} style={{ textAlign: "center", color: "var(--text-muted)", padding: "22px" }}>
                              {loadError || "Nenhum produto — cadastre o que a sua equipe vende."}
                            </td>
                          </tr>
                        )}
                        {(produtos || []).map(p => (
                          <tr key={p.id} style={{ cursor: "default" }}>
                            <td><div className="co"><strong>{p.name}</strong>{p.description ? <span className="sub2" style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.description}</span> : null}</div></td>
                            <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.68rem" }}>{p.sku || "—"}</td>
                            <td style={{ fontFamily: "var(--font-mono)" }}>{fmtPreco(precoDe(p))}</td>
                            <td>{cicloLabel(p.billingCycle)}</td>
                            <td><span className={"tag" + (p.status === "active" ? " teal" : " warn")}>{p.status === "active" ? "Ativo" : p.status === "archived" ? "Arquivado" : p.status || "—"}</span></td>
                            <td>
                              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                <button className="btn-ghost" style={{ minHeight: 28, fontSize: "0.68rem" }} onClick={() => abrirEditar(p)}>Editar</button>
                                {arquivarArm === p.id ? (
                                  <button className="btn-ghost" style={{ minHeight: 28, fontSize: "0.68rem", color: "var(--hbx-danger)", borderColor: "color-mix(in srgb, var(--hbx-danger) 40%, transparent)" }} onClick={() => arquivar(p)} disabled={busy}>Confirmar</button>
                                ) : (
                                  <button className="btn-ghost" style={{ minHeight: 28, fontSize: "0.68rem" }} onClick={() => setArquivarArm(p.id)} disabled={p.status === "archived"}>Arquivar</button>
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

              {aba === 1 && (
                <React.Fragment>
                  {comissoesErro && (
                    <section className="panel"><div style={{ padding: 16, fontSize: "0.74rem", color: "var(--hbx-danger)", fontWeight: 600 }}>{comissoesErro}</div></section>
                  )}

                  {(casos?.length ?? 0) > 0 && (
                    <section className="panel" style={{ borderColor: "color-mix(in srgb, var(--hbx-warning) 40%, transparent)" }}>
                      <div className="panel-head">
                        <h2>Casos de cancelamento — sua triagem</h2>
                        <div className="meta">
                          {casoMsg && <span style={{ fontWeight: 700, color: casoMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{casoMsg}</span>}
                          <button className="btn-ghost" onClick={() => setSoComSaldo(v => !v)}
                            style={soComSaldo ? { borderColor: "var(--hbx-warning)", color: "var(--hbx-warning)" } : {}}>
                            {soComSaldo ? "✓ " : ""}Só com saldo a restituir
                          </button>
                        </div>
                      </div>
                      <div className="tbl-wrap">
                        <table className="tbl">
                          <thead><tr><th>Cliente</th><th>Vendedor</th><th>Venda</th><th>Comissão em revisão</th><th>Saldo a restituir</th><th>Decisão</th></tr></thead>
                          <tbody>
                            {(casos || []).filter(c => !soComSaldo || (c.refundAmount ?? 0) > 0).map(c => (
                              <tr key={c.leadId} style={{ cursor: "default" }}>
                                <td><strong>{c.name}</strong><span className="sub2" style={{ display: "block" }}>{fmtData(c.openedAt)}</span></td>
                                <td>{c.sellerName || "—"}</td>
                                <td style={{ fontFamily: "var(--font-mono)" }}>{fmtBRL(c.saleValue)}</td>
                                <td style={{ fontFamily: "var(--font-mono)" }}>{fmtBRL(c.commissionAmount)} <span className="tag warn" style={{ marginLeft: 4 }}>{c.commissionStatusLabel || "—"}</span></td>
                                <td style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: (c.refundAmount ?? 0) > 0 ? "var(--hbx-warning)" : "var(--text-muted)" }}>{fmtBRL(c.refundAmount)}</td>
                                <td>
                                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                                    {(["kept", "reversed", "unlinked"] as const).map(r => {
                                      const rotulo = r === "kept" ? "Manter" : r === "reversed" ? "Estornar" : "Desvincular";
                                      const armado = casoArm === `${c.leadId}:${r}`;
                                      return (
                                        <button key={r} className="btn-ghost" disabled={casoBusy}
                                          style={{ minHeight: 26, fontSize: "0.64rem", ...(armado ? { color: "var(--hbx-danger)", borderColor: "color-mix(in srgb, var(--hbx-danger) 40%, transparent)" } : r === "kept" ? { color: "var(--hbx-brand-strong)" } : {}) }}
                                          onClick={() => armado ? decidirCaso(c.leadId, r) : setCasoArm(`${c.leadId}:${r}`)}>
                                          {armado ? `Confirmar ${rotulo.toLowerCase()}` : rotulo}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}
                  <div className="kpis">
                    {[
                      { l: "A pagar", v: fmtBRL(comissoes?.totals?.payableAmount), d: comissoes?.totals?.nextDueAt ? `próx. venc. ${fmtData(comissoes.totals.nextDueAt)}` : "" },
                      { l: "Vencidas (pagar agora)", v: fmtBRL(comissoes?.totals?.duePayableAmount), d: `${comissoes?.totals?.duePayableCount ?? 0} comissão(ões)` },
                      { l: "Aguardando ativação", v: fmtBRL(comissoes?.totals?.pendingAmount), d: `${comissoes?.totals?.pendingActivation ?? 0} cliente(s)` },
                      { l: "Pagas (histórico)", v: fmtBRL(comissoes?.totals?.paidAmount), d: `D+${comissoes?.settings?.dueBusinessDays ?? 3} úteis` },
                    ].map(k => (
                      <div className="kpi" key={k.l}>
                        <div>
                          <div className="kpi-label">{k.l}</div>
                          <div className="kpi-value" style={{ fontSize: "1.05rem" }}>{comissoes ? k.v : "—"}</div>
                          <div className="kpi-foot"><span className="kpi-delta" style={{ color: "var(--text-muted)" }}>{k.d}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <section className="panel">
                    <div className="panel-head">
                      <h2>Comissões a pagar</h2>
                      <div className="meta">
                        {payoutMsg && <span style={{ fontWeight: 700, color: payoutMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-warning)" }}>{payoutMsg}</span>}
                        {comissoes?.canPayout && (
                          <button className="btn-teal" onClick={abrirPayout}><I d={ICONS.check} size={13} /> Marcar como pago</button>
                        )}
                      </div>
                    </div>
                    <div className="tbl-wrap">
                      <table className="tbl">
                        <thead><tr><th>Cliente</th><th>Venda</th><th>Valor da venda</th><th>Comissão</th><th>Vence em</th></tr></thead>
                        <tbody>
                          {(comissoes?.clients?.payable || []).length === 0 && (
                            <tr style={{ cursor: "default" }}><td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)", padding: 18 }}>Nenhuma comissão a pagar.</td></tr>
                          )}
                          {(comissoes?.clients?.payable || []).map(c => (
                            <tr key={c.leadId} style={{ cursor: "default" }}>
                              <td><strong>{c.name}</strong>{c.city ? <span className="sub2" style={{ display: "block" }}>{c.city}</span> : null}</td>
                              <td><span className="tag teal">{c.saleStatusLabel || "—"}</span></td>
                              <td style={{ fontFamily: "var(--font-mono)" }}>{fmtBRL(c.saleValue)}</td>
                              <td style={{ fontFamily: "var(--font-mono)", color: "var(--hbx-brand-strong)", fontWeight: 700 }}>{fmtBRL(c.commissionAmount)}</td>
                              <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}>{fmtData(c.commissionDueAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <section className="panel">
                      <div className="panel-head"><h2>Aguardando ativação</h2></div>
                      <div className="tbl-wrap">
                        <table className="tbl">
                          <tbody>
                            {(comissoes?.clients?.pendingActivation || []).length === 0 && (
                              <tr style={{ cursor: "default" }}><td style={{ textAlign: "center", color: "var(--text-muted)", padding: 16 }}>Nenhum cliente aguardando.</td></tr>
                            )}
                            {(comissoes?.clients?.pendingActivation || []).map(c => (
                              <tr key={c.leadId} style={{ cursor: "default" }}>
                                <td><strong>{c.name}</strong></td>
                                <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>{fmtBRL(c.saleValue)}</td>
                                <td><span className="tag warn">{c.commissionStatusLabel || "Pendente"}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                    <section className="panel">
                      <div className="panel-head"><h2>Pagamentos (payouts)</h2></div>
                      <div className="tbl-wrap">
                        <table className="tbl">
                          <tbody>
                            {(comissoes?.payouts || []).length === 0 && (
                              <tr style={{ cursor: "default" }}><td style={{ textAlign: "center", color: "var(--text-muted)", padding: 16 }}>Nenhum payout ainda — ações de pagamento chegam na próxima fase.</td></tr>
                            )}
                            {(comissoes?.payouts || []).map(p => (
                              <tr key={p.id} style={{ cursor: "default" }}>
                                <td><strong>{p.sellerName || "Vendedor"}</strong><span className="sub2" style={{ display: "block" }}>{p.leadCount ?? 0} comissão(ões)</span></td>
                                <td style={{ fontFamily: "var(--font-mono)" }}>{fmtBRL(p.totalAmount)}</td>
                                <td><span className={"tag" + (p.status === "paid" ? " teal" : " warn")}>{p.status === "paid" ? `Pago ${fmtData(p.paidAt)}` : p.status || "—"}</span></td>
                                <td>
                                  {comissoes?.canPayout && p.status === "paid" && (
                                    cancelArm === p.id ? (
                                      <button className="btn-ghost" style={{ minHeight: 26, fontSize: "0.64rem", color: "var(--hbx-danger)", borderColor: "color-mix(in srgb, var(--hbx-danger) 40%, transparent)" }}
                                        onClick={() => cancelarPayout(p.id)} disabled={payoutBusy}>Confirmar</button>
                                    ) : (
                                      <button className="btn-ghost" style={{ minHeight: 26, fontSize: "0.64rem" }} onClick={() => setCancelArm(p.id)}>Cancelar</button>
                                    )
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </div>
                </React.Fragment>
              )}

              {aba === 2 && (
                <section className="panel">
                  <div className="panel-head">
                    <h2>Candidaturas — Trabalhe Conosco</h2>
                    <div className="meta">
                      {candMsg && <span style={{ fontWeight: 700, color: candMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{candMsg}</span>}
                    </div>
                  </div>
                  <div className="tbl-wrap">
                    <table className="tbl">
                      <thead><tr><th>Candidato</th><th>Contato</th><th>Cidade</th><th>Experiência</th><th>Currículo</th><th>Status</th><th></th></tr></thead>
                      <tbody>
                        {cands === null && (
                          <tr style={{ cursor: "default" }}><td colSpan={7} style={{ textAlign: "center", color: "var(--text-muted)", padding: 18 }}>Carregando…</td></tr>
                        )}
                        {cands !== null && cands.length === 0 && (
                          <tr style={{ cursor: "default" }}>
                            <td colSpan={7} style={{ textAlign: "center", color: "var(--text-muted)", padding: 18 }}>
                              Nenhuma candidatura ainda — divulgue a página /trabalhe-conosco.
                            </td>
                          </tr>
                        )}
                        {(cands || []).map(c => (
                          <tr key={c.id} style={{ cursor: "default", opacity: c.status === "pending" ? 1 : 0.65 }}>
                            <td><strong>{c.name}</strong><span className="sub2" style={{ display: "block" }}>{fmtData(c.createdAt)}</span></td>
                            <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.68rem" }}>{c.phone || "—"}{c.email ? <span style={{ display: "block" }}>{c.email}</span> : null}</td>
                            <td>{c.city || "—"}</td>
                            <td style={{ maxWidth: 220 }}><span style={{ display: "block", fontSize: "0.68rem", lineHeight: 1.4, maxHeight: 54, overflow: "hidden" }}>{c.experience || "—"}</span></td>
                            <td>{c.resumeUrl ? <a href={c.resumeUrl} target="_blank" rel="noopener noreferrer">abrir ↗</a> : "—"}</td>
                            <td><span className={"tag" + (c.status === "pending" ? " warn" : c.status === "approved" ? " teal" : "")}>{c.status === "pending" ? "Pendente" : c.status === "approved" ? "Aprovada" : "Rejeitada"}</span></td>
                            <td>
                              {c.status === "pending" && (
                                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                  {(["approve", "reject"] as const).map(a => {
                                    const rotulo = a === "approve" ? "Aprovar" : "Rejeitar";
                                    const armado = candArm === `${c.id}:${a}`;
                                    return (
                                      <button key={a} className="btn-ghost" disabled={candBusy}
                                        style={{ minHeight: 26, fontSize: "0.64rem", ...(armado ? { color: "var(--hbx-danger)", borderColor: "color-mix(in srgb, var(--hbx-danger) 40%, transparent)" } : a === "approve" ? { color: "var(--hbx-brand-strong)" } : {}) }}
                                        onClick={() => armado ? revisarCandidatura(c.id, a) : setCandArm(`${c.id}:${a}`)}>
                                        {armado ? `Confirmar` : rotulo}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {aba === 3 && (
                <section className="panel">
                  <div style={{ padding: 18, fontSize: "0.76rem", color: "var(--text-muted)" }}>
                    Visão geral chega na sequência — o backend já está pronto (GET /gerencial/overview).
                  </div>
                </section>
              )}

              {aba === 4 && (
                <React.Fragment>
                  <section className="panel">
                    <div className="panel-head">
                      <h2>Equipe</h2>
                      <div className="meta">
                        {teamMsg && (
                          <span style={{ fontWeight: 700, color: teamMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{teamMsg}</span>
                        )}
                        <button className="btn-teal" onClick={abrirNovoAcesso} disabled={teamDenied}>
                          <I d={ICONS.plus} size={13} /> Novo acesso
                        </button>
                      </div>
                    </div>
                    <div className="tbl-wrap">
                      <table className="tbl">
                        <thead><tr><th>Membro</th><th>E-mail</th><th>Perfil de acesso</th><th></th></tr></thead>
                        <tbody>
                          {teamDenied && (
                            <tr style={{ cursor: "default" }}>
                              <td colSpan={4} style={{ textAlign: "center", color: "var(--text-muted)", padding: "22px 12px" }}>
                                Lista de equipe visível apenas para Administrador.
                              </td>
                            </tr>
                          )}
                          {!teamDenied && team === null && (
                            <tr style={{ cursor: "default" }}>
                              <td colSpan={4} style={{ textAlign: "center", color: "var(--text-muted)", padding: "22px 12px" }}>Carregando…</td>
                            </tr>
                          )}
                          {!teamDenied && team !== null && team.length === 0 && (
                            <tr style={{ cursor: "default" }}>
                              <td colSpan={4} style={{ textAlign: "center", color: "var(--text-muted)", padding: "22px 12px" }}>
                                Nenhum membro na equipe.
                              </td>
                            </tr>
                          )}
                          {(team || []).map(m => {
                            const nomeMembro = m.name || m.username || m.email || `Usuário ${m.id}`;
                            const ehAdmin = String(m.role || "").toUpperCase() === "ADMIN";
                            return (
                              <tr key={m.id} style={{ cursor: "default" }}>
                                <td>
                                  <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
                                    <Av name={nomeMembro} size={28} />
                                    <div>
                                      <strong>{nomeMembro}</strong>
                                      <div style={{ fontSize: "0.64rem", color: "var(--text-muted)" }}>{m.isActive === false ? "Inativo" : "Ativo"}</div>
                                    </div>
                                  </div>
                                </td>
                                <td>{m.email || "—"}</td>
                                <td><span className={"tag" + (ehAdmin ? " teal" : "")}>{ehAdmin ? "Administrador" : "Vendas"}</span></td>
                                <td>
                                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                                    <button className="btn-ghost" style={{ minHeight: 28, fontSize: "0.68rem" }}
                                      onClick={() => { setTeamMsg(null); abrirAcessos(m); }}>Acessos</button>
                                    <button className="btn-ghost" style={{ minHeight: 28, fontSize: "0.68rem" }}
                                      onClick={() => { setTeamMsg(null); abrirGerir(m); }}>Gerenciar</button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                  {!teamDenied && <CargoAcessosEditor />}
                </React.Fragment>
              )}
            </React.Fragment>
          )}
        </div>

      {novoAcessoOpen && (
        <NovoAcessoModal
          onClose={() => setNovoParam("")}
          onDone={msg => { setTeamMsg(msg); recarregarEquipe(); }}
          team={team || []}
        />
      )}

      {gerirMembro && (
        <NovoAcessoModal
          member={gerirMembro}
          team={team || []}
          isSelf={ehProprioUsuario(gerirMembro)}
          onClose={() => setMembroParam("")}
          onDone={msg => { setTeamMsg(msg); recarregarEquipe(); }}
          onRequestExcluir={m => setExcluirAlvo(m as TeamMember)}
        />
      )}

      {acessoMembro && (
        <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) setAcessoParam(""); }}>
          <div className="hbx-modal tp-modal" style={{ width: "min(880px, 100%)", display: "grid", gridTemplateRows: "auto 1fr", gap: 14, padding: 24 }}>
            <div className="tp-modal-head">
              <div className="tp-modal-titles">
                <h3>Acessos de {acessoMembro.name || acessoMembro.username || acessoMembro.email || `Usuário ${acessoMembro.id}`}</h3>
                <p>Admin &gt; Gerente &gt; Vendedor: Administrador e Gerente herdam tudo. Aqui você ajusta o que esta pessoa pode fazer — cada módulo com todos os seus acessos.</p>
              </div>
              <button type="button" className="btn-ghost btn-xs" style={{ minHeight: 30 }} onClick={() => setAcessoParam("")}>Fechar</button>
            </div>
            <div className="tp-modal-body">
              <TeamPolicyEditor
                userId={acessoMembro.id}
                sellers={team || []}
                isSelf={ehProprioUsuario(acessoMembro)}
              />
            </div>
          </div>
        </div>
      )}

      {excluirAlvo && (
        <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget && !excluirBusy) setExcluirAlvo(null); }}>
          <div className="hbx-modal" style={{ width: "min(420px, 100%)", display: "grid", gap: 14, padding: 24 }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 800 }}>
              Excluir vendedor
            </h3>
            <p style={{ margin: 0, fontSize: "0.78rem", lineHeight: 1.5, color: "var(--text-muted)" }}>
              Tem certeza que deseja excluir <b>{excluirAlvo.name || excluirAlvo.username || excluirAlvo.email || `Usuário ${excluirAlvo.id}`}</b> definitivamente?
              Esta ação não pode ser desfeita.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button type="button" className="btn-ghost" disabled={excluirBusy} onClick={() => setExcluirAlvo(null)} style={{ minHeight: 40 }}>
                Cancelar
              </button>
              <button type="button" className="btn-ghost btn-danger" disabled={excluirBusy} onClick={excluirMembro} style={{ minHeight: 40 }}>
                {excluirBusy ? "Excluindo…" : "Excluir definitivamente"}
              </button>
            </div>
          </div>
        </div>
      )}

      {payoutOpen && (
        <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) setPayoutOpen(false); }}>
          <form className="hbx-modal" onSubmit={gerarPayout}
            style={{ width: "min(420px, 100%)", display: "grid", gap: 12, padding: 24 }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Marcar comissões como pagas
              <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={() => setPayoutOpen(false)}>✕</span>
            </h3>
            <p style={{ margin: 0, fontSize: "0.68rem", lineHeight: 1.5, color: "var(--text-muted)" }}>
              Gera um payout com as comissões LIBERADAS e VENCIDAS (o D+{comissoes?.settings?.dueBusinessDays ?? 3} úteis já passou).
            </p>
            {payoutMsg && !payoutMsg.startsWith("✓") && (
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--hbx-warning)", lineHeight: 1.5 }}>{payoutMsg}</div>
            )}
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Vendedor</label>
              <select className="select-dark" value={payoutForm.sellerUserId}
                onChange={e => setPayoutForm(f => ({ ...f, sellerUserId: e.target.value }))} style={{ width: "100%" }}>
                <option value="">Todos os vendedores</option>
                {(payoutSellers || []).map(s => (
                  <option key={s.id} value={String(s.id)}>{s.name || s.username || s.email || `Usuário ${s.id}`}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: "0.76rem" }}>Incluir não vencidas</strong>
                <div style={{ fontSize: "0.64rem", color: "var(--text-muted)" }}>Paga também o que ainda está dentro do prazo D+{comissoes?.settings?.dueBusinessDays ?? 3}.</div>
              </div>
              <button type="button" className={"sw" + (payoutForm.includeNotYetDue ? " on" : "")} role="switch" aria-checked={payoutForm.includeNotYetDue}
                onClick={() => setPayoutForm(f => ({ ...f, includeNotYetDue: !f.includeNotYetDue }))}><i></i></button>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Referência</label>
              <input className="field-dark" maxLength={120} placeholder='Ex.: "Comissões junho/2026"'
                value={payoutForm.referenceLabel} onChange={e => setPayoutForm(f => ({ ...f, referenceLabel: e.target.value }))} />
            </div>
            <button className="btn-teal" type="submit" disabled={payoutBusy} style={{ minHeight: 42 }}>
              {payoutBusy ? "Gerando…" : "Gerar payout e marcar como pago"}
            </button>
          </form>
        </div>
      )}

      {modalOpen && (
        <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <form className="hbx-modal" onSubmit={salvar}
            style={{ width: "min(440px, 100%)", display: "grid", gap: 12, padding: 24 }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {editId == null ? "Novo produto" : "Editar produto"}
              <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={() => setModalOpen(false)}>✕</span>
            </h3>
            {msg && !msg.startsWith("✓") && (
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--hbx-warning)", lineHeight: 1.5 }}>{msg}</div>
            )}
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Nome *</label>
              <input className="field-dark" required maxLength={140} value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Código (SKU)</label>
                <input className="field-dark" maxLength={80} placeholder="opcional" value={form.sku}
                  onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Preço (R$) *</label>
                <input className="field-dark" type="number" min={0} step="0.01" required value={form.preco}
                  onChange={e => setForm(f => ({ ...f, preco: e.target.value }))} />
              </div>
            </div>
            <p style={{ margin: 0, fontSize: "0.62rem", lineHeight: 1.5, color: "var(--text-muted)" }}>
              O preço acima é o BASE (mensal). Ciclo de cobrança é escolha do CLIENTE no pagamento
              (anual tem o desconto do catálogo) — e a comissão é o % acordado com cada vendedor,
              calculado sobre o que o cliente pagou de verdade.
            </p>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Descrição</label>
              <textarea className="field-dark" rows={3} maxLength={1000} style={{ resize: "vertical", padding: "9px 12px" }}
                value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <button className="btn-teal" type="submit" disabled={busy} style={{ minHeight: 42 }}>
              {busy ? "Salvando…" : editId == null ? "Criar produto" : "Salvar alterações"}
            </button>
          </form>
        </div>
      )}
    </React.Fragment>
  );
}
