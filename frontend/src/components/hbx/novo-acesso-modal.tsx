"use client";

// "Novo acesso" (PR12062026005) — cadastro COMPLETO de membro para TODO
// admin (restauração da tela do front antigo, ordem do dono 12/06/2026).
// Contratos:
//   POST /users/company/create        → cria (senha opcional; "salvar
//        documentação" = requiresSellerOnboarding → nasce inativa)
//   GET  /users/company/seat-billing  → aviso de custo do assento
//   GET  /company-email               → gate do disparo de e-mail (manual;
//        só aparece com módulo ativo + envio pronto — ninguém usa o SMTP
//        do Master; HBX admin compartilha só o transporte, via backend)
//   GET  /gerencial/hbx-partners/:userId/onboarding            → estado
//   POST /gerencial/hbx-partners/:userId/onboarding/attachments (file+kind)
//   PATCH /gerencial/hbx-partners/:userId/onboarding/document-requirement
//   GET/PATCH /gerencial/hbx-partners/onboarding/contract-template
//   POST /gerencial/hbx-partners/:userId/onboarding/generate-contract
//   POST /gerencial/hbx-partners/:userId/onboarding/send-email  → Solicitar
//        documentos (template de onboarding escolhido em Configurações → E-mail)

import React, { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";

type CompanyUser = { id: number; name?: string | null; username?: string | null; email?: string | null; role?: string | null; isActive?: boolean };

type SeatBilling = { planTitle?: string; activeUsers?: number; includedUsers?: number; extraUserMonthlyPrice?: number; nextUserIsExtra?: boolean } | null;

type OnboardingAttachment = { id: string; kind: string; status?: string | null; originalFilename?: string | null };

type Onboarding = {
  id?: string;
  status?: string | null;
  emailStatus?: string | null;
  attachments?: OnboardingAttachment[];
  documentRequirements?: Record<string, boolean> | null;
} | null;

const DOC_SLOTS: { kind: string; label: string; defaultRequired: boolean }[] = [
  { kind: "photo_id", label: "Documento", defaultRequired: true },
  { kind: "curriculum", label: "Currículo", defaultRequired: false },
  { kind: "contract_pdf", label: "Contrato assinado", defaultRequired: false },
  { kind: "other", label: "Outro", defaultRequired: false },
];

const FORM_VAZIO = {
  role: "USER" as "USER" | "ADMIN",
  name: "",
  email: "",
  phone: "",
  commissionPercent: "",
  commissionDueBusinessDays: "3",
  salvarDocumentacao: false,
  cpf: "",
  password: "",
  declaredAddress: "",
  referredByUserId: "",
  dailyLimit: "30",
};

const lbl = { fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" } as const;

// O componente monta APENAS aberto (o pai condiciona a renderização) — assim
// cada abertura nasce com estado limpo, sem reset síncrono em effect.
export function NovoAcessoModal({ onClose, onDone, team }: {
  onClose: () => void;
  onDone: (message: string) => void;
  team: CompanyUser[];
}) {
  const [form, setForm] = useState({ ...FORM_VAZIO });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [seatInfo, setSeatInfo] = useState<SeatBilling>(null);
  const [emailUsable, setEmailUsable] = useState(false);
  const [createdUserId, setCreatedUserId] = useState<number | null>(null);
  const [onboarding, setOnboarding] = useState<Onboarding>(null);
  const [docBusy, setDocBusy] = useState<string | null>(null);
  const [reqState, setReqState] = useState<Record<string, boolean>>(
    () => Object.fromEntries(DOC_SLOTS.map(s => [s.kind, s.defaultRequired])),
  );

  // Editar modelo do contrato
  const [modeloOpen, setModeloOpen] = useState(false);
  const [modeloText, setModeloText] = useState("");
  const [modeloBusy, setModeloBusy] = useState(false);
  const [modeloMsg, setModeloMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    apiFetch<SeatBilling>("/users/company/seat-billing")
      .then(res => { if (alive) setSeatInfo(res); })
      .catch(() => { if (alive) setSeatInfo(null); });
    apiFetch<{ enabled?: boolean; sender?: { ready?: boolean } }>("/company-email")
      .then(res => { if (alive) setEmailUsable(Boolean(res?.enabled && res?.sender?.ready)); })
      .catch(() => { if (alive) setEmailUsable(false); });
    return () => { alive = false; };
  }, []);

  function fechar() {
    if (createdUserId) onDone("✓ Acesso criado — documentação salva no cadastro do vendedor.");
    onClose();
  }

  async function refreshOnboarding(userId: number) {
    try {
      const res = await apiFetch<Onboarding>(`/gerencial/hbx-partners/${userId}/onboarding`);
      setOnboarding(res);
      const reqs = (res as { documentRequirements?: Record<string, boolean> | null } | null)?.documentRequirements;
      if (reqs && typeof reqs === "object") {
        setReqState(prev => ({ ...prev, ...reqs }));
      }
    } catch { /* painel segue com o estado local */ }
  }

  async function criar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || createdUserId) return;
    setBusy(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        email: form.email.trim(),
        role: form.role,
        ...(form.name.trim() ? { name: form.name.trim() } : {}),
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        ...(form.commissionPercent !== "" ? { commissionPercent: Number(form.commissionPercent) } : {}),
        ...(form.commissionDueBusinessDays !== "" ? { commissionDueBusinessDays: Number(form.commissionDueBusinessDays) } : {}),
        ...(form.password.trim() ? { password: form.password.trim() } : {}),
        ...(form.role === "USER" && form.salvarDocumentacao ? { requiresSellerOnboarding: true } : {}),
        ...(form.role === "USER" && form.cpf.trim() ? { cpf: form.cpf.trim() } : {}),
        ...(form.role === "USER" && form.declaredAddress.trim() ? { declaredAddress: form.declaredAddress.trim() } : {}),
        ...(form.role === "USER" && form.referredByUserId ? { referredByUserId: Number(form.referredByUserId) } : {}),
        ...(form.dailyLimit !== "" ? { sellerDistributionDailyLimitOverride: Number(form.dailyLimit) } : {}),
      };
      const res = await apiFetch<{ user?: { id?: number; isActive?: boolean } }>("/users/company/create", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const userId = Number(res?.user?.id || 0);
      const comDocumentacao = form.role === "USER" && (form.salvarDocumentacao || form.cpf.trim() || form.declaredAddress.trim());
      if (comDocumentacao && userId) {
        setCreatedUserId(userId);
        setMsg("✓ Acesso criado — agora anexe a documentação e gere o contrato.");
        await refreshOnboarding(userId);
      } else {
        onDone(form.password.trim()
          ? "✓ Acesso criado com senha definida (troca obrigatória no 1º login)."
          : "✓ Acesso criado. Sem senha definida — libere o acesso pelo Gerenciar (boas-vindas) ou edite e defina a senha.");
        onClose();
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não foi possível criar o acesso.");
    } finally {
      setBusy(false);
    }
  }

  function anexoDe(kind: string) {
    return (onboarding?.attachments || []).find(a => a.kind === kind && a.status !== "deleted") || null;
  }

  async function uploadDoc(kind: string, file: File | null | undefined) {
    if (!file || !createdUserId || docBusy) return;
    setDocBusy(kind);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      await apiFetch(`/gerencial/hbx-partners/${createdUserId}/onboarding/attachments`, { method: "POST", body: fd });
      await refreshOnboarding(createdUserId);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Falha no upload do documento.");
    } finally {
      setDocBusy(null);
    }
  }

  async function alternarObrigatorio(kind: string) {
    if (!createdUserId || docBusy) return;
    const next = !reqState[kind];
    setDocBusy(kind);
    try {
      await apiFetch(`/gerencial/hbx-partners/${createdUserId}/onboarding/document-requirement`, {
        method: "PATCH",
        body: JSON.stringify({ kind, required: next }),
      });
      setReqState(prev => ({ ...prev, [kind]: next }));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não foi possível alterar a exigência.");
    } finally {
      setDocBusy(null);
    }
  }

  async function gerarContrato() {
    if (!createdUserId || docBusy) return;
    setDocBusy("contrato");
    setMsg(null);
    try {
      await apiFetch(`/gerencial/hbx-partners/${createdUserId}/onboarding/generate-contract`, { method: "POST", body: JSON.stringify({}) });
      setMsg("✓ Contrato PDF gerado — vai junto no e-mail de onboarding.");
      await refreshOnboarding(createdUserId);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não foi possível gerar o contrato.");
    } finally {
      setDocBusy(null);
    }
  }

  async function solicitarDocumentos() {
    if (!createdUserId || docBusy) return;
    setDocBusy("email");
    setMsg(null);
    try {
      const res = await apiFetch<{ ok?: boolean; delivery?: { errorMessage?: string | null } }>(
        `/gerencial/hbx-partners/${createdUserId}/onboarding/send-email`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setMsg(res?.ok ? "✓ E-mail de onboarding enviado — documentos solicitados." : res?.delivery?.errorMessage || "O envio falhou.");
      await refreshOnboarding(createdUserId);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "O envio do onboarding falhou.");
    } finally {
      setDocBusy(null);
    }
  }

  async function abrirModelo() {
    setModeloMsg(null);
    setModeloOpen(true);
    setModeloBusy(true);
    try {
      const res = await apiFetch<{ template?: string; contractTemplate?: string; text?: string }>("/gerencial/hbx-partners/onboarding/contract-template");
      setModeloText(String(res?.template ?? res?.contractTemplate ?? res?.text ?? ""));
    } catch (err) {
      setModeloMsg(err instanceof Error ? err.message : "Não foi possível carregar o modelo.");
    } finally {
      setModeloBusy(false);
    }
  }

  async function salvarModelo() {
    if (modeloBusy) return;
    setModeloBusy(true);
    setModeloMsg(null);
    try {
      await apiFetch("/gerencial/hbx-partners/onboarding/contract-template", {
        method: "PATCH",
        body: JSON.stringify({ template: modeloText }),
      });
      setModeloMsg("✓ Modelo de contrato salvo.");
    } catch (err) {
      setModeloMsg(err instanceof Error ? err.message : "Não foi possível salvar o modelo.");
    } finally {
      setModeloBusy(false);
    }
  }

  const vendedor = form.role === "USER";
  const indicador = team.find(m => String(m.id) === form.referredByUserId) || null;
  const sellers = team.filter(m => String(m.role || "").toUpperCase() === "USER" && m.isActive !== false);
  const painelAtivo = Boolean(createdUserId);

  return (
    <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) fechar(); }}
      style={{ position: "fixed", inset: 0, zIndex: 45, display: "grid", placeItems: "center", padding: 18 }}>
      <div className="hbx-modal" style={{ width: "min(880px, 100%)", maxHeight: "92vh", overflowY: "auto", display: "grid", gap: 14, padding: 22 }}>
        <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Novo acesso <small style={{ display: "block", fontSize: "0.64rem", fontWeight: 600, color: "var(--text-muted)" }}>Cadastro</small></span>
          <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={fechar}>✕</span>
        </h3>

        {seatInfo && !painelAtivo && (
          <div style={{ padding: "9px 11px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-hairline)", background: "var(--hbx-surface-soft)", fontSize: "0.68rem", lineHeight: 1.5 }}>
            {seatInfo.planTitle ? <b>{seatInfo.planTitle}: </b> : null}
            {seatInfo.activeUsers ?? "—"} de {seatInfo.includedUsers ?? "—"} assentos do plano em uso.
            {seatInfo.nextUserIsExtra && seatInfo.extraUserMonthlyPrice
              ? ` Este acesso adiciona assento EXTRA de R$ ${Number(seatInfo.extraUserMonthlyPrice).toLocaleString("pt-BR")}/mês.`
              : ""}
          </div>
        )}
        {msg && <div style={{ fontSize: "0.72rem", fontWeight: 700, lineHeight: 1.5, color: msg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{msg}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" }}>
          {/* coluna esquerda — formulário */}
          <form onSubmit={criar} style={{ display: "grid", gap: 11 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {(["USER", "ADMIN"] as const).map(r => (
                <button key={r} type="button" className="btn-ghost" disabled={painelAtivo}
                  style={form.role === r ? { borderColor: "var(--hbx-brand)", color: "var(--hbx-brand-strong)", background: "var(--hbx-brand-soft)" } : {}}
                  onClick={() => setForm(f => ({ ...f, role: r }))}>
                  {r === "USER" ? "Vendedor" : "Admin"}
                </button>
              ))}
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={lbl}>Nome</label>
              <input className="field-dark" maxLength={120} value={form.name} disabled={painelAtivo}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={lbl}>E-mail *</label>
              <input className="field-dark" type="email" required maxLength={180} value={form.email} disabled={painelAtivo}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={lbl}>WhatsApp</label>
              <input className="field-dark" maxLength={30} placeholder="(11) 99999-9999" value={form.phone} disabled={painelAtivo}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={lbl}>Comissão (%)</label>
                <input className="field-dark" type="number" min={0} max={100} step="0.01" value={form.commissionPercent} disabled={painelAtivo}
                  onChange={e => setForm(f => ({ ...f, commissionPercent: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={lbl}>D+ (dias úteis)</label>
                <input className="field-dark" type="number" min={0} max={30} value={form.commissionDueBusinessDays} disabled={painelAtivo}
                  onChange={e => setForm(f => ({ ...f, commissionDueBusinessDays: e.target.value }))} />
              </div>
            </div>
            {vendedor && (
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-hairline)", background: "var(--hbx-surface-soft)", cursor: painelAtivo ? "default" : "pointer" }}>
                <input type="checkbox" checked={form.salvarDocumentacao} disabled={painelAtivo}
                  onChange={e => setForm(f => ({ ...f, salvarDocumentacao: e.target.checked }))} style={{ marginTop: 2 }} />
                <span style={{ fontSize: "0.7rem", lineHeight: 1.5 }}>
                  <strong>Salvar documentação deste vendedor</strong>
                  <span style={{ display: "block", color: "var(--text-muted)" }}>
                    Use quando quiser guardar documentos, contrato e liberar depois (o acesso nasce inativo). Desmarcado cria o acesso normalmente.
                  </span>
                </span>
              </label>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {vendedor && (
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={lbl}>CPF</label>
                  <input className="field-dark" maxLength={20} value={form.cpf} disabled={painelAtivo}
                    onChange={e => setForm(f => ({ ...f, cpf: e.target.value }))} />
                </div>
              )}
              <div style={{ display: "grid", gap: 6, gridColumn: vendedor ? undefined : "1 / -1" }}>
                <label style={lbl}>Senha</label>
                <input className="field-dark" type="password" minLength={8} maxLength={120} placeholder="opcional — mín. 8" value={form.password} disabled={painelAtivo}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))} autoComplete="new-password" />
              </div>
            </div>
            {vendedor && (
              <div style={{ display: "grid", gap: 6 }}>
                <label style={lbl}>Endereço</label>
                <input className="field-dark" maxLength={280} value={form.declaredAddress} disabled={painelAtivo}
                  onChange={e => setForm(f => ({ ...f, declaredAddress: e.target.value }))} />
              </div>
            )}
            {vendedor && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={lbl}>Indicado por</label>
                  <select className="field-dark" value={form.referredByUserId} disabled={painelAtivo}
                    onChange={e => setForm(f => ({ ...f, referredByUserId: e.target.value }))}>
                    <option value="">Direto</option>
                    {sellers.map(s => <option key={s.id} value={String(s.id)}>{s.name || s.username || s.email || `Usuário ${s.id}`}</option>)}
                  </select>
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={lbl}>Herança</label>
                  <input className="field-dark" readOnly value={indicador ? "definida pelo indicador" : "—"} />
                </div>
              </div>
            )}
            <div style={{ display: "grid", gap: 6 }}>
              <label style={lbl}>Enriquecimentos/dia</label>
              <input className="field-dark" type="number" min={0} max={500} value={form.dailyLimit} disabled={painelAtivo}
                onChange={e => setForm(f => ({ ...f, dailyLimit: e.target.value }))} />
            </div>
            {!painelAtivo && (
              <button className="btn-teal" type="submit" disabled={busy} style={{ minHeight: 42 }}>
                {busy ? "Criando…" : "Criar acesso"}
              </button>
            )}
          </form>

          {/* coluna direita — documentação */}
          <div style={{ display: "grid", gap: 10, alignContent: "start", opacity: vendedor ? 1 : 0.45 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {DOC_SLOTS.map(slot => {
                const anexo = anexoDe(slot.kind);
                const obrigatorio = Boolean(reqState[slot.kind]);
                return (
                  <div key={slot.kind} style={{ display: "grid", gap: 6, padding: "10px 12px", borderRadius: "var(--radius-sm)", border: "1px dashed var(--border-hairline)", background: "var(--hbx-surface-soft)" }}>
                    <strong style={{ fontSize: "0.74rem" }}>{slot.label}</strong>
                    <span style={{ fontSize: "0.62rem", color: anexo ? "var(--hbx-brand-strong)" : "var(--text-muted)" }}>
                      {anexo ? `✓ ${anexo.originalFilename || "anexado"}` : obrigatorio ? "Obrigatório pendente" : "Opcional"}
                    </span>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <label className="btn-ghost" style={{ minHeight: 26, fontSize: "0.62rem", padding: "0 8px", display: "inline-flex", alignItems: "center", cursor: painelAtivo ? "pointer" : "not-allowed", opacity: painelAtivo ? 1 : 0.55 }}>
                        {docBusy === slot.kind ? "Enviando…" : "Escolher arquivo"}
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} disabled={!painelAtivo || docBusy !== null}
                          onChange={e => { uploadDoc(slot.kind, e.target.files?.[0]); e.target.value = ""; }} />
                      </label>
                      <button type="button" className="btn-ghost" disabled={!painelAtivo || docBusy !== null}
                        style={{ minHeight: 26, fontSize: "0.62rem", padding: "0 8px", ...(obrigatorio ? { color: "var(--hbx-warning)", borderColor: "color-mix(in srgb, var(--hbx-warning) 40%, transparent)" } : {}) }}
                        onClick={() => alternarObrigatorio(slot.kind)}>
                        {obrigatorio ? "Obrigatório" : "Opcional"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn-ghost" onClick={abrirModelo} disabled={!vendedor}>Editar modelo</button>
              <button type="button" className="btn-ghost" onClick={gerarContrato} disabled={!painelAtivo || docBusy !== null}>
                {docBusy === "contrato" ? "Gerando…" : "Gerar contrato PDF"}
              </button>
              {emailUsable ? (
                <button type="button" className="btn-teal" onClick={solicitarDocumentos} disabled={!painelAtivo || docBusy !== null}>
                  {docBusy === "email" ? "Enviando…" : "Solicitar documentos"}
                </button>
              ) : (
                <span style={{ fontSize: "0.64rem", color: "var(--text-muted)", alignSelf: "center", lineHeight: 1.4 }}>
                  Disparo de e-mail indisponível — ative e configure em Configurações → E-mail.
                </span>
              )}
            </div>
            {painelAtivo && (
              <button type="button" className="btn-teal" onClick={fechar} style={{ minHeight: 40 }}>
                Concluir cadastro
              </button>
            )}
            {!painelAtivo && vendedor && (
              <span style={{ fontSize: "0.64rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                Crie o acesso para habilitar uploads, contrato e solicitação de documentos.
              </span>
            )}
          </div>
        </div>
      </div>

      {modeloOpen && (
        <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) setModeloOpen(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 47, display: "grid", placeItems: "center", padding: 24 }}>
          <div className="hbx-modal" style={{ width: "min(640px, 100%)", maxHeight: "86vh", overflowY: "auto", display: "grid", gap: 12, padding: 22 }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Modelo do contrato
              <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={() => setModeloOpen(false)}>✕</span>
            </h3>
            {modeloMsg && <div style={{ fontSize: "0.72rem", fontWeight: 700, color: modeloMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{modeloMsg}</div>}
            <p style={{ margin: 0, fontSize: "0.66rem", lineHeight: 1.5, color: "var(--text-muted)" }}>
              Use as variáveis {"{{sellerName}}"}, {"{{sellerCpf}}"}, {"{{sellerEmail}}"}, {"{{sellerPhone}}"}, {"{{sellerAddress}}"}, {"{{commissionPercent}}"}, {"{{commissionDueBusinessDays}}"} e {"{{contractDate}}"} — preenchidas na geração do PDF.
            </p>
            <textarea className="field-dark" rows={16} value={modeloText} disabled={modeloBusy}
              style={{ resize: "vertical", fontFamily: "var(--font-mono)", fontSize: "0.7rem", lineHeight: 1.55, padding: "10px 12px" }}
              onChange={e => setModeloText(e.target.value)} />
            <button className="btn-teal" onClick={salvarModelo} disabled={modeloBusy} style={{ minHeight: 40 }}>
              {modeloBusy ? "Salvando…" : "Salvar modelo"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
