"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./page.module.css";

const DEFAULT_API_URL =
  process.env.NODE_ENV === "production"
    ? "https://api.hbxsystem.com.br"
    : "http://localhost:3000";
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL).replace(/\/+$/, "");

type DocumentSlot = {
  kind: string;
  label: string;
  required: boolean;
  present: boolean;
  filename?: string | null;
};

type PublicOnboardingPayload = {
  ok?: boolean;
  partner?: {
    name?: string | null;
    email?: string | null;
  } | null;
  documents?: DocumentSlot[];
  documentsComplete?: boolean;
  emailConfirmed?: boolean;
  message?: string | null;
};

type ApiErrorPayload = {
  message?: string | string[];
  error?: string;
};

function errorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;
  const payload = data as ApiErrorPayload;
  if (typeof payload.message === "string") return payload.message;
  if (Array.isArray(payload.message)) return payload.message.join(", ");
  if (typeof payload.error === "string") return payload.error;
  return fallback;
}

function PublicSellerOnboarding() {
  const searchParams = useSearchParams();
  const token = useMemo(() => String(searchParams.get("token") || "").trim(), [searchParams]);
  const [payload, setPayload] = useState<PublicOnboardingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingKind, setUploadingKind] = useState<string | null>(null);
  const [removingKind, setRemovingKind] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File | null>>({});
  const [completing, setCompleting] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!token) {
      setError("Link inválido. Solicite um novo envio ao HBX.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/gerencial/hbx-partners/onboarding/public?token=${encodeURIComponent(token)}`);
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(errorMessage(data, "Não foi possível carregar seus documentos pendentes."));
        setPayload(null);
        return;
      }
      setPayload((data as PublicOnboardingPayload) || null);
    } catch {
      setError("Não foi possível conectar ao HBX agora. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function uploadDocument(kind: string, file?: File | null) {
    if (!file || !token) return;
    setUploadingKind(kind);
    setError(null);
    try {
      const form = new FormData();
      form.append("token", token);
      form.append("kind", kind);
      form.append("file", file);
      const response = await fetch(`${API_URL}/gerencial/hbx-partners/onboarding/public/attachments`, {
        method: "POST",
        body: form,
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(errorMessage(data, "Falha ao enviar documento."));
        setSelectedFiles((current) => ({ ...current, [kind]: null }));
        return;
      }
      setPayload((data as PublicOnboardingPayload) || null);
      setSelectedFiles((current) => ({ ...current, [kind]: null }));
    } catch {
      setError("Falha ao enviar documento. Verifique sua conexão e tente novamente.");
      setSelectedFiles((current) => ({ ...current, [kind]: null }));
    } finally {
      setUploadingKind(null);
    }
  }

  async function removeDocument(kind: string) {
    if (!token) return;
    setRemovingKind(kind);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/gerencial/hbx-partners/onboarding/public/attachments/${encodeURIComponent(kind)}?token=${encodeURIComponent(token)}`, {
        method: "DELETE",
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(errorMessage(data, "Falha ao remover documento."));
        return;
      }
      setPayload((data as PublicOnboardingPayload) || null);
      setSelectedFiles((current) => ({ ...current, [kind]: null }));
    } catch {
      setError("Falha ao remover documento. Tente novamente em instantes.");
    } finally {
      setRemovingKind(null);
    }
  }

  async function completeDocuments() {
    if (!token) return;
    setCompleting(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/gerencial/hbx-partners/onboarding/public/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(errorMessage(data, "Falha ao confirmar documentos."));
        return;
      }
      setPayload((data as PublicOnboardingPayload) || null);
      setSelectedFiles({});
    } catch {
      setError("Falha ao confirmar documentos. Tente novamente em instantes.");
    } finally {
      setCompleting(false);
    }
  }

  const documents = payload?.documents || [];
  const readyToConfirm = Boolean(payload?.documentsComplete && !payload?.emailConfirmed);
  const done = Boolean(payload?.emailConfirmed);

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <span className={styles.confirmedGlow} aria-hidden="true" />
        <span className={styles.orbit} aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>

        {loading ? (
          <div className={styles.loading}>
            <span />
            Carregando checklist...
          </div>
        ) : error && !payload ? (
          <div className={styles.error}>{error}</div>
        ) : (
          <>
            <div className={styles.heroIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M6 3.5h8.5L19 8v12.5H6z" />
                <path d="M14.5 3.5V8H19" />
                <path d="M9 13h6" />
                <path d="M9 16h4" />
              </svg>
              <b>
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="m5 12 4 4L19 6" />
                </svg>
              </b>
            </div>

            <div className={styles.copy}>
              <span className={done ? styles.successBadge : styles.pendingBadge}>
                {done ? "Documentos recebidos" : "Documentos pendentes"}
              </span>
              <h1>{done ? "Tudo enviado" : readyToConfirm ? "Anexos aceitos" : "Envie seus documentos"}</h1>
              <p className={styles.lead}>{done ? "E-mail confirmado" : payload?.partner?.name || "Parceiro HBX"}</p>
              <p>
                {payload?.message || (done
                  ? "Assim que confirmado, chegará um e-mail com seu usuário e senha."
                  : readyToConfirm
                    ? "Confira os anexos aceitos e clique em Enviar para confirmar."
                  : "Envie os documentos obrigatórios pendentes para confirmar seu e-mail.")}
              </p>
              {readyToConfirm ? (
                <button type="button" className={styles.finalButton} onClick={() => void completeDocuments()} disabled={completing}>
                  {completing ? "Enviando..." : "Enviar documentos"}
                </button>
              ) : null}
              {error ? <div className={styles.inlineError}>{error}</div> : null}
            </div>

            <div className={styles.grid}>
              {documents.map((document) => {
                const selectedFile = selectedFiles[document.kind] || null;
                return (
                  <article key={document.kind} className={styles.document} data-present={document.present}>
                    <div>
                      <strong>{document.label}</strong>
                      <span>
                        {document.present
                          ? document.filename || "Anexo aceito"
                          : selectedFile
                            ? selectedFile.name
                            : "Pendente"}
                      </span>
                    </div>
                    <div className={styles.documentActions}>
                      {document.present ? (
                        <>
                          <b>Anexo aceito</b>
                          {!done ? (
                            <button
                              type="button"
                              className={styles.removeButton}
                              onClick={() => void removeDocument(document.kind)}
                              disabled={removingKind === document.kind}
                              aria-label={`Remover ${document.label}`}
                            >
                              ×
                            </button>
                          ) : null}
                        </>
                      ) : selectedFile ? (
                        <b>{uploadingKind === document.kind ? "Enviando..." : "Anexo carregado"}</b>
                      ) : (
                        <label>
                          Escolher arquivo
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                            disabled={Boolean(uploadingKind)}
                            onChange={(event) => {
                              const file = event.target.files?.[0] || null;
                              setError(null);
                              setSelectedFiles((current) => ({ ...current, [document.kind]: file }));
                              if (file) void uploadDocument(document.kind, file);
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

          </>
        )}
      </section>
    </main>
  );
}

export default function HbxSellerOnboardingPage() {
  return (
    <Suspense fallback={<main className={styles.page}><section className={styles.shell}>Carregando...</section></main>}>
      <PublicSellerOnboarding />
    </Suspense>
  );
}
