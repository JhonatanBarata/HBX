"use client";

// Página PÚBLICA do onboarding do vendedor (restauração pós-reset do front,
// PR12062026005 — destino do {linkConfirmacao} do e-mail de onboarding).
// Sem template dedicado no handoff — moldura reusa o Login (AuthSplit),
// mesmo padrão da /reset-password (ver doc do PR). Contratos públicos:
//   GET    /gerencial/hbx-partners/onboarding/public?token=...
//   POST   /gerencial/hbx-partners/onboarding/public/attachments (file+kind+token)
//   DELETE /gerencial/hbx-partners/onboarding/public/attachments/:kind?token=...
//   POST   /gerencial/hbx-partners/onboarding/public/complete {token}
// Ao completar os obrigatórios e Enviar, o e-mail é confirmado — o usuário e
// a senha chegam depois, quando o admin liberar o acesso (boas-vindas).

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { AuthSplit } from "@/components/hbx/auth-split";
import { SignaturePad, type SignaturePadHandle } from "@/components/hbx/signature-pad";
import { apiFetch } from "@/lib/api";

type PublicDocument = {
  kind: string;
  label: string;
  required?: boolean;
  present?: boolean;
  filename?: string | null;
};

type PublicOnboarding = {
  ok?: boolean;
  partner?: { name?: string | null; email?: string | null };
  documents?: PublicDocument[];
  documentsComplete?: boolean;
  emailConfirmed?: boolean;
  contract?: { text?: string; companySignature?: string | null; signed?: boolean };
  message?: string | null;
} | null;

export function SellerOnboardingClient() {
  const params = useSearchParams();
  const token = params.get("token") || "";

  const [estado, setEstado] = useState<PublicOnboarding>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyKind, setBusyKind] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cpf, setCpf] = useState("");
  const [aceito, setAceito] = useState(false);
  const [copia, setCopia] = useState(false);
  const [assinando, setAssinando] = useState(false);
  const padRef = useRef<SignaturePadHandle | null>(null);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    apiFetch<PublicOnboarding>(`/gerencial/hbx-partners/onboarding/public?token=${encodeURIComponent(token)}`)
      .then(res => { if (alive) { setEstado(res); setLoadError(null); } })
      .catch((err: unknown) => {
        if (alive) setLoadError(err instanceof Error ? err.message : "Link inválido ou expirado.");
      });
    return () => { alive = false; };
  }, [token]);

  async function enviarArquivo(kind: string, file: File | null | undefined) {
    if (!file || busyKind) return;
    setBusyKind(kind);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      fd.append("token", token);
      const res = await apiFetch<PublicOnboarding>("/gerencial/hbx-partners/onboarding/public/attachments", {
        method: "POST",
        body: fd,
      });
      setEstado(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar o arquivo.");
    } finally {
      setBusyKind(null);
    }
  }

  async function removerArquivo(kind: string) {
    if (busyKind) return;
    setBusyKind(kind);
    setError(null);
    try {
      const res = await apiFetch<PublicOnboarding>(
        `/gerencial/hbx-partners/onboarding/public/attachments/${encodeURIComponent(kind)}?token=${encodeURIComponent(token)}`,
        { method: "DELETE" },
      );
      setEstado(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível remover o arquivo.");
    } finally {
      setBusyKind(null);
    }
  }

  async function concluir() {
    if (busyKind) return;
    setBusyKind("__complete");
    setError(null);
    try {
      const res = await apiFetch<PublicOnboarding>("/gerencial/hbx-partners/onboarding/public/complete", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      setEstado(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível concluir o envio.");
    } finally {
      setBusyKind(null);
    }
  }

  async function assinar() {
    if (assinando) return;
    if (padRef.current?.isEmpty()) { setError("Desenhe sua assinatura antes de assinar."); return; }
    if (!aceito) { setError("Marque que leu e aceita os termos do contrato."); return; }
    const cpfDigits = cpf.replace(/\D/g, "");
    if (cpfDigits.length !== 11) { setError("Informe um CPF válido (11 dígitos)."); return; }
    const signatureDataUrl = padRef.current?.toDataUrl() || null;
    setAssinando(true);
    setError(null);
    try {
      await apiFetch("/gerencial/hbx-partners/onboarding/public/sign", {
        method: "POST",
        body: JSON.stringify({ token, signatureDataUrl, cpf: cpfDigits, accepted: true, wantsCopy: copia }),
      });
      const res = await apiFetch<PublicOnboarding>(`/gerencial/hbx-partners/onboarding/public?token=${encodeURIComponent(token)}`);
      setEstado(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível assinar o contrato.");
    } finally {
      setAssinando(false);
    }
  }

  const documentos = estado?.documents || [];
  const confirmado = Boolean(estado?.emailConfirmed);
  const completo = Boolean(estado?.documentsComplete);

  return (
    <AuthSplit>
      <div className="card">
        <h2>Documentos do cadastro</h2>
        <p className="sub">
          {estado?.partner?.name
            ? <>Olá, <b>{estado.partner.name}</b> — envie os documentos abaixo para concluir sua parceria.</>
            : "Envie os documentos do seu cadastro de parceiro HBX."}
        </p>

        {!token && (
          <div className="ok show" style={{ borderColor: "color-mix(in srgb, var(--hbx-danger) 30%, transparent)", background: "color-mix(in srgb, var(--hbx-danger) 8%, transparent)", color: "var(--hbx-danger)" }}>
            Link sem código de acesso — abra o link exatamente como veio no e-mail.
          </div>
        )}
        {token && loadError && (
          <div className="ok show" style={{ borderColor: "color-mix(in srgb, var(--hbx-danger) 30%, transparent)", background: "color-mix(in srgb, var(--hbx-danger) 8%, transparent)", color: "var(--hbx-danger)" }}>
            {loadError}
          </div>
        )}
        {token && !loadError && !estado && (
          <p className="sub">Carregando seu checklist…</p>
        )}

        {estado && (
          <>
            <div style={{ display: "grid", gap: 8 }}>
              {documentos.map(doc => {
                const enviado = Boolean(doc.present);
                return (
                  <div key={doc.kind} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-hairline)", background: "var(--hbx-surface-soft)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ fontSize: "0.78rem", display: "block" }}>{doc.label}</strong>
                      <span style={{ fontSize: "0.64rem", color: enviado ? "var(--hbx-brand-strong)" : "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                        {enviado ? `✓ ${doc.filename || "recebido"}` : "Pendente — PDF, JPG ou PNG (até 5 MB)"}
                      </span>
                    </div>
                    {enviado && !confirmado ? (
                      <button type="button" className="btn-ghost" style={{ minHeight: 30, fontSize: "0.68rem", color: "var(--hbx-danger)" }}
                        disabled={busyKind !== null} onClick={() => removerArquivo(doc.kind)}>
                        {busyKind === doc.kind ? "Removendo…" : "Trocar"}
                      </button>
                    ) : !enviado ? (
                      <label className="btn-ghost" style={{ minHeight: 30, fontSize: "0.68rem", display: "inline-flex", alignItems: "center", cursor: busyKind ? "default" : "pointer" }}>
                        {busyKind === doc.kind ? "Enviando…" : "Escolher arquivo"}
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} disabled={busyKind !== null}
                          onChange={e => { enviarArquivo(doc.kind, e.target.files?.[0]); e.target.value = ""; }} />
                      </label>
                    ) : null}
                  </div>
                );
              })}
              {documentos.length === 0 && (
                <p className="sub" style={{ margin: 0 }}>Nenhum documento obrigatório pendente neste link.</p>
              )}
            </div>

            {estado.contract?.text && (
              <div style={{ display: "grid", gap: 8 }}>
                <h3>Contrato de parceria</h3>
                {estado.contract.signed ? (
                  <div className="ok show">✓ Contrato assinado. Obrigado!</div>
                ) : (
                  <>
                    <div className="doc-slot" style={{ maxHeight: 220, overflow: "auto", whiteSpace: "pre-wrap" }}>
                      {estado.contract.text}
                    </div>
                    {estado.contract.companySignature && (
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <p className="sub" style={{ margin: 0 }}>Assinatura HBX:</p>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={estado.contract.companySignature} alt="Assinatura HBX" style={{ height: 38, width: "auto" }} />
                      </div>
                    )}
                    <p className="sub" style={{ margin: 0 }}>Desenhe sua assinatura abaixo:</p>
                    <SignaturePad ref={padRef} />
                    <input className="field-dark" inputMode="numeric" maxLength={14} placeholder="Seu CPF (só números)"
                      value={cpf} onChange={e => setCpf(e.target.value)} />
                    <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <input type="checkbox" checked={aceito} onChange={e => setAceito(e.target.checked)} />
                      <span>Li e aceito os termos do contrato acima.</span>
                    </label>
                    <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input type="checkbox" checked={copia} onChange={e => setCopia(e.target.checked)} />
                      <span>Gostaria de receber uma cópia por e-mail.</span>
                    </label>
                    <button className="btn-teal" type="button" disabled={assinando || busyKind !== null} onClick={assinar} style={{ minHeight: 42 }}>
                      {assinando ? "Assinando…" : "Assinar contrato"}
                    </button>
                  </>
                )}
              </div>
            )}

            {(estado.message || error) && (
              <div className="ok show" style={error ? { borderColor: "color-mix(in srgb, var(--hbx-danger) 30%, transparent)", background: "color-mix(in srgb, var(--hbx-danger) 8%, transparent)", color: "var(--hbx-danger)" } : {}}>
                {error || estado.message}
              </div>
            )}

            {!confirmado && (
              <button className="btn-teal" type="button" disabled={!completo || busyKind !== null} onClick={concluir}
                style={{ minHeight: 44, fontSize: "0.84rem" }}
                title={completo ? "Confirmar o envio dos documentos" : "Envie todos os documentos obrigatórios primeiro"}>
                {busyKind === "__complete" ? "Enviando…" : "Enviar documentos"}
              </button>
            )}
            {confirmado && (
              <div className="ok show">
                ✓ Documentos confirmados! Em breve chegará seu e-mail de boas-vindas com usuário e senha de acesso.
              </div>
            )}
          </>
        )}
      </div>
    </AuthSplit>
  );
}
