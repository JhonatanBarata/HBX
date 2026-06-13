"use client";

// "Gerenciar" da Equipe (ordem do dono, 12/06/2026): abre a TELA DO VENDEDOR
// no mesmo formato do cadastro (Novo acesso), com os DOCUMENTOS RECEBIDOS —
// a liberação do acesso vira um passo explícito (mostra o que chegou e avisa
// que envia as boas-vindas com usuário e senha). Tudo em endpoints que já
// existem no backend:
//   GET   /gerencial/hbx-partners/:userId/onboarding              → estado + anexos
//   GET   /gerencial/hbx-partners/:userId/onboarding/attachments/:id/download
//   PATCH /gerencial/hbx-partners/:userId/onboarding/document-requirement
//   POST  /gerencial/hbx-partners/:userId/onboarding/generate-contract
//   POST  /gerencial/hbx-partners/:userId/onboarding/send-email   → e-mail-gated
//   PATCH /users/:id/profile | /users/:id/role | /users/:id/active
// (a exclusão fica com o pai — ConfirmDialog já existente em /configuracoes)

import React, { useCallback, useEffect, useState } from "react";

import { Av } from "@/components/hbx/shell";
import { TeamPolicyEditor } from "@/components/hbx/team-policy-editor";
import { apiFetch, getApiBase, getToken } from "@/lib/api";

type CompanyUser = { id: number; name?: string | null; username?: string | null; email?: string | null; role?: string | null; isActive?: boolean };

type OnboardingAttachment = { id: string; kind: string; status?: string | null; originalFilename?: string | null };

type Onboarding = {
  status?: string | null;
  emailStatus?: string | null;
  legalName?: string | null;
  email?: string | null;
  phone?: string | null;
  cpf?: string | null;
  commissionPercent?: number | null;
  commissionDueBusinessDays?: number | null;
  attachments?: OnboardingAttachment[];
  user?: { emailConfirmedAt?: string | null } | null;
} | null;

const KIND_LABEL: Record<string, string> = {
  photo_id: "Documento com foto",
  curriculum: "Currículo",
  contract_pdf: "Contrato assinado",
  other: "Outro documento",
  generated_contract: "Contrato gerado (PDF)",
};

const REQUIRED_SLOTS = ["photo_id", "curriculum", "contract_pdf", "other"];

const lbl = { fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" } as const;

export function GerenciarVendedorModal({ member, isSelf, team = [], onClose, onChanged, onRequestExcluir }: {
  member: CompanyUser;
  isSelf: boolean;
  team?: CompanyUser[];
  onClose: () => void;
  onChanged: (message: string) => void;
  onRequestExcluir: (m: CompanyUser) => void;
}) {
  const ehVendedor = String(member.role || "").toUpperCase() === "USER";
  const [aba, setAba] = useState<"cadastro" | "acessos">("cadastro");
  const [form, setForm] = useState({
    name: member.name || "",
    phone: "",
    commissionPercent: "",
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState<Onboarding>(null);
  const [onboardingErro, setOnboardingErro] = useState<string | null>(null);
  const [emailUsable, setEmailUsable] = useState(false);
  const [liberarArm, setLiberarArm] = useState(false);
  const [senhaTemporaria, setSenhaTemporaria] = useState<string | null>(null);

  const carregarOnboarding = useCallback(() => {
    if (!ehVendedor) return Promise.resolve();
    return apiFetch<Onboarding>(`/gerencial/hbx-partners/${member.id}/onboarding`)
      .then(res => {
        setOnboarding(res);
        setOnboardingErro(null);
        setForm(f => ({
          ...f,
          phone: f.phone || res?.phone || "",
          commissionPercent: f.commissionPercent || (res?.commissionPercent != null ? String(res.commissionPercent) : ""),
        }));
      })
      .catch((err: unknown) => setOnboardingErro(err instanceof Error ? err.message : "Sem dados de documentação."));
  }, [ehVendedor, member.id]);

  useEffect(() => {
    let alive = true;
    carregarOnboarding();
    apiFetch<{ enabled?: boolean; sender?: { ready?: boolean } }>("/company-email")
      .then(res => { if (alive) setEmailUsable(Boolean(res?.enabled && res?.sender?.ready)); })
      .catch(() => { if (alive) setEmailUsable(false); });
    return () => { alive = false; };
  }, [carregarOnboarding]);

  async function salvarPerfil() {
    if (busy) return;
    setBusy("perfil");
    setMsg(null);
    try {
      await apiFetch(`/users/${member.id}/profile`, {
        method: "PATCH",
        body: JSON.stringify({
          ...(form.name.trim() ? { name: form.name.trim() } : {}),
          ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
          ...(form.commissionPercent !== "" ? { commissionPercent: Number(form.commissionPercent) } : {}),
        }),
      });
      setMsg("✓ Perfil salvo.");
      onChanged("✓ Perfil do membro atualizado.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(null);
    }
  }

  async function mudarPapel() {
    if (busy) return;
    const novo = ehVendedor ? "ADMIN" : "USER";
    setBusy("papel");
    setMsg(null);
    try {
      await apiFetch(`/users/${member.id}/role`, { method: "PATCH", body: JSON.stringify({ role: novo }) });
      onChanged("✓ Perfil de acesso atualizado.");
      onClose();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não foi possível alterar o perfil.");
      setBusy(null);
    }
  }

  async function alternarAtivo() {
    if (busy) return;
    setBusy("ativo");
    setMsg(null);
    setSenhaTemporaria(null);
    try {
      const res = await apiFetch<{ message?: string; temporaryPassword?: string | null }>(`/users/${member.id}/active`, {
        method: "PATCH",
        body: JSON.stringify({ active: member.isActive === false }),
      });
      if (res?.temporaryPassword) {
        // e-mail de boas-vindas falhou — credencial fica na tela pra entrega na mão
        setSenhaTemporaria(res.temporaryPassword);
        setMsg(`✓ ${res?.message || "Acesso liberado."}`);
        onChanged(`✓ ${res?.message || "Acesso liberado."}`);
      } else {
        onChanged(`✓ ${res?.message || "Status atualizado."}`);
        onClose();
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não foi possível alterar o status.");
    } finally {
      setBusy(null);
      setLiberarArm(false);
    }
  }

  async function gerarContrato() {
    if (busy) return;
    setBusy("contrato");
    setMsg(null);
    try {
      await apiFetch(`/gerencial/hbx-partners/${member.id}/onboarding/generate-contract`, { method: "POST", body: JSON.stringify({}) });
      setMsg("✓ Contrato PDF gerado.");
      await carregarOnboarding();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não foi possível gerar o contrato.");
    } finally {
      setBusy(null);
    }
  }

  async function solicitarDocumentos() {
    if (busy) return;
    setBusy("email");
    setMsg(null);
    try {
      const res = await apiFetch<{ ok?: boolean; delivery?: { errorMessage?: string | null } }>(
        `/gerencial/hbx-partners/${member.id}/onboarding/send-email`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setMsg(res?.ok ? "✓ E-mail de onboarding enviado." : res?.delivery?.errorMessage || "O envio falhou.");
      await carregarOnboarding();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "O envio do onboarding falhou.");
    } finally {
      setBusy(null);
    }
  }

  async function baixarAnexo(att: OnboardingAttachment) {
    if (busy) return;
    setBusy(`baixar:${att.id}`);
    setMsg(null);
    try {
      const res = await fetch(
        `${getApiBase()}/gerencial/hbx-partners/${member.id}/onboarding/attachments/${encodeURIComponent(att.id)}/download`,
        { headers: { Authorization: `Bearer ${getToken() || ""}` } },
      );
      if (!res.ok) throw new Error("Não foi possível baixar o arquivo.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = att.originalFilename || "documento";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Falha no download.");
    } finally {
      setBusy(null);
    }
  }

  const nomeMembro = member.name || member.username || member.email || `Usuário ${member.id}`;
  const ativo = member.isActive !== false;
  const anexos = (onboarding?.attachments || []).filter(a => a.status !== "deleted");
  const anexoPorKind = new Map(anexos.map(a => [a.kind, a]));
  const emailConfirmado = Boolean(onboarding?.user?.emailConfirmedAt);

  return (
    <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 45, display: "grid", placeItems: "center", padding: 18 }}>
      <div className="hbx-modal" style={{ width: "min(880px, 100%)", maxHeight: "92vh", overflowY: "auto", display: "grid", gap: 14, padding: 22 }}>
        <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
            <Av name={nomeMembro} size={34} />
            <span>
              {nomeMembro}
              <small style={{ display: "block", fontSize: "0.64rem", fontWeight: 600, color: "var(--text-muted)" }}>
                {ehVendedor ? "Vendedor" : "Administrador"} · {ativo ? "Ativo" : "Inativo"}
              </small>
            </span>
          </span>
          <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={onClose}>✕</span>
        </h3>

        <div className="seg-toggle" style={{ width: "fit-content" }}>
          <button type="button" className={"seg" + (aba === "cadastro" ? " on" : "")} onClick={() => setAba("cadastro")}>Cadastro</button>
          <button type="button" className={"seg" + (aba === "acessos" ? " on" : "")} onClick={() => setAba("acessos")}>Acessos</button>
        </div>

        {aba === "acessos" && (
          <TeamPolicyEditor userId={member.id} sellers={team} isSelf={isSelf} />
        )}

        {aba === "cadastro" && (
        <React.Fragment>
        {msg && <div style={{ fontSize: "0.72rem", fontWeight: 700, lineHeight: 1.5, color: msg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{msg}</div>}
        {senhaTemporaria && (
          <div className="ok show" style={{ display: "grid", gap: 4 }}>
            <strong style={{ fontSize: "0.74rem" }}>O e-mail de boas-vindas NÃO saiu — entregue a credencial na mão:</strong>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>{member.email} · {senhaTemporaria}</span>
            <span style={{ fontSize: "0.64rem", color: "var(--text-muted)" }}>Troca obrigatória no primeiro login.</span>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" }}>
          {/* coluna esquerda — dados e ações */}
          <div style={{ display: "grid", gap: 11 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={lbl}>Nome</label>
              <input className="field-dark" maxLength={120} value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={lbl}>E-mail (login)</label>
              <input className="field-dark" readOnly value={member.email || "—"} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={lbl}>WhatsApp</label>
                <input className="field-dark" maxLength={30} value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={lbl}>Comissão (%)</label>
                <input className="field-dark" type="number" min={0} max={100} step="0.01" value={form.commissionPercent}
                  onChange={e => setForm(f => ({ ...f, commissionPercent: e.target.value }))} />
              </div>
            </div>
            {onboarding?.commissionDueBusinessDays != null && (
              <span style={{ fontSize: "0.66rem", color: "var(--text-muted)" }}>Liberação da comissão: D+{onboarding.commissionDueBusinessDays} úteis</span>
            )}
            <button className="btn-teal" onClick={salvarPerfil} disabled={busy !== null} style={{ minHeight: 38 }}>
              {busy === "perfil" ? "Salvando…" : "Salvar dados"}
            </button>

            <div className="sep"></div>
            <div style={{ display: "grid", gap: 8 }}>
              {!ativo && ehVendedor ? (
                liberarArm ? (
                  <button className="btn-teal" onClick={alternarAtivo} disabled={busy !== null || isSelf} style={{ minHeight: 40 }}>
                    {busy === "ativo" ? "Liberando…" : "Confirmar liberação (envia usuário e senha)"}
                  </button>
                ) : (
                  <button className="btn-teal" onClick={() => setLiberarArm(true)} disabled={busy !== null || isSelf} style={{ minHeight: 40 }}
                    title="Confira os documentos recebidos ao lado antes de liberar">
                    Liberar acesso → envia boas-vindas com credenciais
                  </button>
                )
              ) : (
                <button className="btn-ghost" onClick={alternarAtivo} disabled={busy !== null || isSelf}
                  style={{ color: ativo ? "var(--hbx-danger)" : "var(--hbx-brand-strong)" }}>
                  {busy === "ativo" ? "Aguarde…" : ativo ? "Desativar acesso" : "Reativar acesso"}
                </button>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button className="btn-ghost" onClick={mudarPapel} disabled={busy !== null || isSelf}>
                  {ehVendedor ? "Tornar Admin" : "Tornar Vendas"}
                </button>
                <button className="btn-ghost" style={{ color: "var(--hbx-danger)" }} disabled={busy !== null || isSelf}
                  onClick={() => { onClose(); onRequestExcluir(member); }}>
                  Excluir
                </button>
              </div>
              {isSelf && <span style={{ fontSize: "0.64rem", color: "var(--text-muted)" }}>Você não pode alterar o próprio acesso.</span>}
            </div>
          </div>

          {/* coluna direita — documentação recebida */}
          <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
            {!ehVendedor && (
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Administradores não têm fluxo de documentação.</span>
            )}
            {ehVendedor && onboardingErro && (
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{onboardingErro}</span>
            )}
            {ehVendedor && !onboardingErro && (
              <React.Fragment>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span className={"tag" + (emailConfirmado ? " teal" : " warn")}>
                    {emailConfirmado ? "E-mail confirmado" : "E-mail não confirmado"}
                  </span>
                  {onboarding?.emailStatus && (
                    <span className={"tag" + (onboarding.emailStatus === "sent" ? " teal" : onboarding.emailStatus === "email_failed" ? " red" : "")}>
                      Onboarding: {onboarding.emailStatus === "sent" ? "enviado" : onboarding.emailStatus === "email_failed" ? "falhou" : onboarding.emailStatus}
                    </span>
                  )}
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {REQUIRED_SLOTS.map(kind => {
                    const anexo = anexoPorKind.get(kind) || null;
                    return (
                      <div key={kind} style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 11px", borderRadius: "var(--radius-sm)", border: anexo ? "1px solid color-mix(in srgb, var(--hbx-brand) 35%, transparent)" : "1px dashed var(--border-hairline)", background: "var(--hbx-surface-soft)" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <strong style={{ fontSize: "0.74rem", display: "block" }}>{KIND_LABEL[kind] || kind}</strong>
                          <span style={{ fontSize: "0.62rem", color: anexo ? "var(--hbx-brand-strong)" : "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                            {anexo ? `✓ ${anexo.originalFilename || "recebido"}` : "Não recebido"}
                          </span>
                        </div>
                        {anexo && (
                          <button className="btn-ghost" style={{ minHeight: 28, fontSize: "0.66rem" }} disabled={busy !== null}
                            onClick={() => baixarAnexo(anexo)}>
                            {busy === `baixar:${anexo.id}` ? "Baixando…" : "Baixar"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {anexoPorKind.get("generated_contract") && (
                    <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 11px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-hairline)", background: "var(--hbx-surface-soft)" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ fontSize: "0.74rem", display: "block" }}>{KIND_LABEL.generated_contract}</strong>
                        <span style={{ fontSize: "0.62rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                          {anexoPorKind.get("generated_contract")?.originalFilename || "gerado pelo sistema"}
                        </span>
                      </div>
                      <button className="btn-ghost" style={{ minHeight: 28, fontSize: "0.66rem" }} disabled={busy !== null}
                        onClick={() => baixarAnexo(anexoPorKind.get("generated_contract")!)}>
                        {busy === `baixar:${anexoPorKind.get("generated_contract")!.id}` ? "Baixando…" : "Baixar"}
                      </button>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn-ghost" onClick={gerarContrato} disabled={busy !== null}>
                    {busy === "contrato" ? "Gerando…" : "Gerar contrato PDF"}
                  </button>
                  {emailUsable ? (
                    <button className="btn-ghost" onClick={solicitarDocumentos} disabled={busy !== null}>
                      {busy === "email" ? "Enviando…" : "Solicitar documentos"}
                    </button>
                  ) : (
                    <span style={{ fontSize: "0.62rem", color: "var(--text-muted)", alignSelf: "center" }}>
                      Disparo de e-mail indisponível — configure em Configurações → E-mail.
                    </span>
                  )}
                </div>
              </React.Fragment>
            )}
          </div>
        </div>
        </React.Fragment>
        )}
      </div>
    </div>
  );
}
