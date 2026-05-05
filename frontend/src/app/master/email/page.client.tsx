"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch, getDirectDashboardApiBaseUrl } from "@/app/_lib/api";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";
import styles from "./page.module.css";

type TemplateKind = "normal" | "password_reset" | "email_confirmation";

type EmailTemplate = {
  kind: TemplateKind;
  subject: string;
  text: string;
  html?: string | null;
  updatedAt?: string | null;
  variables: string[];
  requiredVariable?: string | null;
  usesSignature: boolean;
  usesAttachment: boolean;
};

type MasterEmailState = {
  sender: {
    from: string | null;
    replyTo: string | null;
    ready: boolean;
    mode: string;
    missing: string[];
  };
  attachment: {
    originalName: string;
    uploadedAt: string;
    size: number;
  } | null;
  businessCard: {
    originalName: string;
    uploadedAt: string;
    size: number;
    mimeType?: string | null;
    previewDataUrl?: string | null;
  } | null;
};

type Draft = {
  subject: string;
  text: string;
  html: string;
};

type MasterEmailSendResponse = {
  ok: boolean;
  sentAt: string;
  recipientName: string;
  recipientEmail: string;
  delivery?: {
    transport?: string;
    messageId?: string | null;
    previewUrl?: string | null;
  };
};

const TEMPLATE_LABELS: Record<TemplateKind, string> = {
  normal: "Email normal",
  password_reset: "Recuperação",
  email_confirmation: "Confirmação",
};

const TEMPLATE_ORDER: TemplateKind[] = ["normal", "password_reset", "email_confirmation"];
const DEFAULT_NAME = "Amanda";
const DEFAULT_COMPANY = "Empresa Teste";

function formatFileSize(value?: number | null) {
  const size = Number(value || 0);
  if (!size) return "-";
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("pt-BR");
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textToHtml(value: string) {
  return escapeHtml(value)
    .split("\n")
    .map((line) => line || "&nbsp;")
    .join("<br>");
}

function renderTemplate(value: string, variables: Record<string, string | number>) {
  return String(value || "").replace(/\{\{\s*(nome|email|empresa|linkRecuperacao|linkConfirmacao|ano)\s*\}\}/g, (_, key: string) => {
    return String(variables[key] ?? "");
  });
}

function buildDirectApiPath(path: string) {
  return `${getDirectDashboardApiBaseUrl()}${path}`;
}

function getImageFilename(file: File) {
  if (file.name) return file.name;
  if (file.type === "image/jpeg") return "cartao-visitas.jpg";
  if (file.type === "image/webp") return "cartao-visitas.webp";
  return "cartao-visitas.png";
}

function emptyDraft(): Draft {
  return { subject: "", text: "", html: "" };
}

function templateToDraft(template: EmailTemplate): Draft {
  return {
    subject: template.subject || "",
    text: template.text || "",
    html: template.html || "",
  };
}

export default function MasterEmailClientPage() {
  const hasToken = useRequireAuth();
  const [activeTemplate, setActiveTemplate] = useState<TemplateKind>("normal");
  const [templates, setTemplates] = useState<Record<TemplateKind, EmailTemplate | null>>({
    normal: null,
    password_reset: null,
    email_confirmation: null,
  });
  const [drafts, setDrafts] = useState<Record<TemplateKind, Draft>>({
    normal: emptyDraft(),
    password_reset: emptyDraft(),
    email_confirmation: emptyDraft(),
  });
  const [state, setState] = useState<MasterEmailState | null>(null);
  const [recipientName, setRecipientName] = useState(DEFAULT_NAME);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [sampleName, setSampleName] = useState(DEFAULT_NAME);
  const [sampleCompany, setSampleCompany] = useState(DEFAULT_COMPANY);
  const [loadingKind, setLoadingKind] = useState<TemplateKind | "all" | null>("all");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingBusinessCard, setUploadingBusinessCard] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSent, setLastSent] = useState<MasterEmailSendResponse | null>(null);

  async function loadAll() {
    setLoadingKind("all");
    setError(null);
    try {
      const [templatePayload, masterPayload] = await Promise.all([
        apiFetch<{ templates: EmailTemplate[] }>("/master/email/templates", { requireAuth: true }),
        apiFetch<MasterEmailState>("/master/email", { requireAuth: true }),
      ]);
      const nextTemplates = { normal: null, password_reset: null, email_confirmation: null } as Record<TemplateKind, EmailTemplate | null>;
      const nextDrafts = { normal: emptyDraft(), password_reset: emptyDraft(), email_confirmation: emptyDraft() };
      for (const template of templatePayload.templates) {
        nextTemplates[template.kind] = template;
        nextDrafts[template.kind] = templateToDraft(template);
      }
      setTemplates(nextTemplates);
      setDrafts(nextDrafts);
      setState(masterPayload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar templates de email.");
    } finally {
      setLoadingKind(null);
    }
  }

  useEffect(() => {
    if (hasToken === true) void loadAll();
  }, [hasToken]);

  const activeDraft = drafts[activeTemplate];
  const activeTemplateData = templates[activeTemplate];
  const senderReady = state?.sender.ready;
  const isNormal = activeTemplate === "normal";
  const requiredVariable = activeTemplateData?.requiredVariable || null;
  const operationBusy = saving || testing || sending || uploading || uploadingBusinessCard || Boolean(loadingKind);

  const sampleVariables = useMemo(() => ({
    nome: sampleName.trim() || DEFAULT_NAME,
    email: testEmail.trim() || "cliente@empresa.com.br",
    empresa: sampleCompany.trim() || DEFAULT_COMPANY,
    linkRecuperacao: "https://hbxsystem.com.br/reset-password?token=exemplo",
    linkConfirmacao: "https://hbxsystem.com.br/confirm-email?token=exemplo",
    ano: new Date().getFullYear(),
  }), [sampleCompany, sampleName, testEmail]);

  const preview = useMemo(() => {
    const subject = renderTemplate(activeDraft.subject, sampleVariables);
    const text = renderTemplate(activeDraft.text, sampleVariables);
    return {
      subject,
      text,
      html: textToHtml(text),
    };
  }, [activeDraft.subject, activeDraft.text, sampleVariables]);

  function updateDraft(patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [activeTemplate]: {
        ...current[activeTemplate],
        ...patch,
      },
    }));
  }

  function validateDraft(kind: TemplateKind, draft: Draft) {
    if (!draft.subject.trim()) return "Informe o assunto do template.";
    if (!draft.text.trim()) return "Informe o corpo do template.";
    const template = templates[kind];
    const required = template?.requiredVariable || null;
    if (required && !draft.text.includes(required)) {
      return `Este template precisa conter ${required}.`;
    }
    return null;
  }

  async function saveTemplate() {
    const validationError = validateDraft(activeTemplate, activeDraft);
    if (validationError) {
      setError(validationError);
      setMessage(null);
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = await apiFetch<{ ok: boolean; template: EmailTemplate }>(`/master/email/templates/${activeTemplate}`, {
        method: "PUT",
        body: JSON.stringify({
          subject: activeDraft.subject,
          text: activeDraft.text,
          html: activeDraft.html || "",
        }),
        requireAuth: true,
      });
      setTemplates((current) => ({ ...current, [activeTemplate]: payload.template }));
      setDrafts((current) => ({ ...current, [activeTemplate]: templateToDraft(payload.template) }));
      setMessage("Template salvo com sucesso.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao salvar template.");
    } finally {
      setSaving(false);
    }
  }

  async function restoreTemplate() {
    setLoadingKind(activeTemplate);
    setError(null);
    setMessage(null);
    try {
      const payload = await apiFetch<{ ok: boolean; template: EmailTemplate }>(`/master/email/templates/${activeTemplate}/restore`, {
        method: "POST",
        requireAuth: true,
      });
      setTemplates((current) => ({ ...current, [activeTemplate]: payload.template }));
      setDrafts((current) => ({ ...current, [activeTemplate]: templateToDraft(payload.template) }));
      setMessage("Modelo padrão restaurado.");
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Falha ao restaurar template.");
    } finally {
      setLoadingKind(null);
    }
  }

  async function sendTemplateTest() {
    const validationError = validateDraft(activeTemplate, activeDraft);
    if (validationError) {
      setError(validationError);
      setMessage(null);
      return;
    }
    if (!testEmail.trim()) {
      setError("Informe o email que receberá o teste.");
      setMessage(null);
      return;
    }
    setTesting(true);
    setError(null);
    setMessage(null);
    try {
      const savePayload = await apiFetch<{ ok: boolean; template: EmailTemplate }>(`/master/email/templates/${activeTemplate}`, {
        method: "PUT",
        body: JSON.stringify({
          subject: activeDraft.subject,
          text: activeDraft.text,
          html: activeDraft.html || "",
        }),
        requireAuth: true,
      });
      setTemplates((current) => ({ ...current, [activeTemplate]: savePayload.template }));
      setDrafts((current) => ({ ...current, [activeTemplate]: templateToDraft(savePayload.template) }));
      const payload = await apiFetch<{ ok: boolean; sentAt: string }>(`/master/email/templates/${activeTemplate}/test`, {
        method: "POST",
        body: JSON.stringify({
          to: testEmail,
          sampleName,
          sampleCompany,
        }),
        requireAuth: true,
        timeoutMs: 30000,
      });
      setMessage(payload.ok ? `Teste enviado para ${testEmail}.` : "Teste processado, mas o provedor não confirmou envio.");
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "Falha ao enviar teste.");
    } finally {
      setTesting(false);
    }
  }

  async function uploadAttachment(file: File | null | undefined) {
    if (!file) return;
    setUploading(true);
    setMessage(null);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const payload = await apiFetch<{ ok: boolean; attachment: MasterEmailState["attachment"] }>(buildDirectApiPath("/master/email/attachment"), {
        method: "POST",
        body: form,
        requireAuth: true,
        timeoutMs: 120000,
      });
      setState((current) => current ? { ...current, attachment: payload.attachment } : current);
      setMessage("Anexo PPTX atualizado.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Falha ao enviar o PPTX.");
    } finally {
      setUploading(false);
    }
  }

  async function uploadBusinessCard(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("A assinatura precisa ser uma imagem PNG, JPG ou WEBP.");
      return;
    }
    setUploadingBusinessCard(true);
    setMessage(null);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file, getImageFilename(file));
      const payload = await apiFetch<{ ok: boolean; businessCard: MasterEmailState["businessCard"] }>(buildDirectApiPath("/master/email/business-card"), {
        method: "POST",
        body: form,
        requireAuth: true,
        timeoutMs: 60000,
      });
      setState((current) => current ? { ...current, businessCard: payload.businessCard } : current);
      setMessage("Assinatura atualizada.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Falha ao salvar assinatura.");
    } finally {
      setUploadingBusinessCard(false);
    }
  }

  async function sendNormalEmail() {
    const validationError = validateDraft("normal", drafts.normal);
    if (validationError) {
      setError(validationError);
      setMessage(null);
      return;
    }
    setSending(true);
    setMessage(null);
    setError(null);
    setLastSent(null);
    try {
      const payload = await apiFetch<MasterEmailSendResponse>("/master/email/send", {
        method: "POST",
        body: JSON.stringify({
          recipientName,
          recipientEmail,
          subject: drafts.normal.subject,
          text: drafts.normal.text,
          html: drafts.normal.html || "",
        }),
        requireAuth: true,
        timeoutMs: 30000,
      });
      setLastSent(payload);
      setMessage(`Email enviado para ${payload.recipientEmail}.`);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Falha ao enviar o email.");
    } finally {
      setSending(false);
    }
  }

  if (hasToken === null || loadingKind === "all") {
    return (
      <main className="app-shell">
        <div className="app-container">
          <div className="panel p-4 text-sm text-muted">Carregando central de emails...</div>
        </div>
      </main>
    );
  }

  if (!hasToken) return null;

  const canSendNormal = Boolean(
    recipientName.trim() &&
      recipientEmail.trim() &&
      drafts.normal.subject.trim() &&
      drafts.normal.text.trim() &&
      state?.attachment &&
      !operationBusy,
  );

  return (
    <DashboardScaffold
      title="Email"
      description="Central MASTER de templates comerciais e transacionais do HBX."
      actions={<Link href="/master" className="btn btn-secondary btn-sm">Voltar ao Master</Link>}
    >
      <div className={styles.page}>
        {error || message ? (
          <div className={styles.alertArea}>
            {error ? <div className="alert alert-error">{error}</div> : null}
            {message ? <div className="alert alert-success">{message}</div> : null}
          </div>
        ) : null}

        <section className={styles.panel}>
          <div className={styles.header}>
            <div>
              <span>Central de templates</span>
              <h2>{TEMPLATE_LABELS[activeTemplate]}</h2>
            </div>
            <strong data-ready={senderReady ? "true" : "false"}>
              {senderReady ? "SMTP pronto" : "SMTP incompleto"}
            </strong>
          </div>

          <div className={styles.tabs} role="tablist" aria-label="Templates de email">
            {TEMPLATE_ORDER.map((kind) => (
              <button
                key={kind}
                type="button"
                role="tab"
                aria-selected={activeTemplate === kind}
                className={styles.tabButton}
                data-active={activeTemplate === kind ? "true" : "false"}
                onClick={() => {
                  setActiveTemplate(kind);
                  setError(null);
                  setMessage(null);
                }}
              >
                {TEMPLATE_LABELS[kind]}
              </button>
            ))}
          </div>

          {!isNormal ? (
            <div className={styles.warning}>
              {activeTemplate === "password_reset"
                ? "Este template é usado automaticamente quando o usuário pede recuperação de senha."
                : "Este template é usado automaticamente no cadastro e reenvio de confirmação."}
            </div>
          ) : null}

          {isNormal ? (
            <div className={styles.grid}>
              <label className={styles.field}>
                <span>Nome do contato</span>
                <input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} placeholder="Amanda" />
              </label>
              <label className={styles.field}>
                <span>Email do contato</span>
                <input type="email" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} placeholder="cliente@empresa.com.br" />
              </label>
            </div>
          ) : null}

          <label className={styles.field}>
            <span>Assunto</span>
            <input value={activeDraft.subject} onChange={(event) => updateDraft({ subject: event.target.value })} placeholder="Assunto do email" />
          </label>

          <div className={styles.editorHeader}>
            <span>Mensagem</span>
            <div className={styles.editorTools}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => updateDraft({ text: "", html: "" })} disabled={operationBusy}>
                Limpar mensagem
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={restoreTemplate} disabled={operationBusy}>
                Usar modelo padrão
              </button>
            </div>
          </div>

          <textarea
            className={styles.emailEditor}
            value={activeDraft.text}
            onChange={(event) => updateDraft({ text: event.target.value, html: "" })}
            onPaste={(event) => {
              const hasImage = Array.from(event.clipboardData?.items || []).some((item) => item.kind === "file" && item.type.startsWith("image/"));
              if (hasImage) event.preventDefault();
            }}
            onDrop={(event) => {
              if (Array.from(event.dataTransfer?.files || []).some((file) => file.type.startsWith("image/"))) {
                event.preventDefault();
              }
            }}
            placeholder="Escreva o corpo do email"
            spellCheck
            disabled={loadingKind === activeTemplate}
          />

          {activeTemplateData?.variables?.length ? (
            <div className={styles.variables}>
              <span>Variáveis disponíveis</span>
              <div>
                {activeTemplateData.variables.map((variable) => (
                  <button
                    key={variable}
                    type="button"
                    onClick={() => updateDraft({ text: `${activeDraft.text}${activeDraft.text ? "\n" : ""}${variable}`, html: "" })}
                    className={styles.variableChip}
                  >
                    {variable}
                  </button>
                ))}
              </div>
              {requiredVariable ? <p>Obrigatória: {requiredVariable}</p> : null}
            </div>
          ) : null}

          {isNormal ? (
            <div className={styles.attachmentBox}>
              <div>
                <span>Anexo PPTX</span>
                <strong>{state?.attachment?.originalName || "Nenhum PPTX enviado"}</strong>
                <p>
                  {state?.attachment
                    ? `${formatFileSize(state.attachment.size)} • atualizado em ${formatDate(state.attachment.uploadedAt)}`
                    : "Faça upload da apresentação antes do primeiro envio."}
                </p>
              </div>
              <label className={styles.uploadButton}>
                {uploading ? "Enviando..." : "Trocar PPTX"}
                <input
                  type="file"
                  accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                  onChange={(event) => void uploadAttachment(event.target.files?.[0])}
                  disabled={uploading || sending}
                />
              </label>
            </div>
          ) : null}

          {!senderReady ? (
            <div className={styles.warning}>
              Configure SMTP/MAIL no backend antes do envio real. Pendências: {state?.sender.missing.join(", ") || "provedor não configurado"}.
            </div>
          ) : null}

          <div className={styles.actions}>
            <button type="button" className="btn btn-primary btn-sm" onClick={saveTemplate} disabled={operationBusy}>
              {saving ? "Salvando..." : "Salvar template"}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={restoreTemplate} disabled={operationBusy}>
              Restaurar padrão
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={sendTemplateTest} disabled={operationBusy}>
              {testing ? "Enviando teste..." : "Enviar teste"}
            </button>
            {isNormal ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={sendNormalEmail} disabled={!canSendNormal}>
                {sending ? "Enviando..." : "Enviar email"}
              </button>
            ) : null}
          </div>
        </section>

        <aside className={styles.side}>
          <div className={styles.sideCard}>
            <span>Teste</span>
            <label className={styles.sideField}>
              Email
              <input type="email" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} placeholder="email@teste.com" />
            </label>
            <label className={styles.sideField}>
              Nome
              <input value={sampleName} onChange={(event) => setSampleName(event.target.value)} placeholder="Amanda" />
            </label>
            <label className={styles.sideField}>
              Empresa
              <input value={sampleCompany} onChange={(event) => setSampleCompany(event.target.value)} placeholder="Empresa Teste" />
            </label>
          </div>

          {isNormal ? (
            <div className={styles.sideCard}>
              <span>Assinatura comercial</span>
              <strong>{state?.businessCard ? "Imagem ativa no final do email" : "Sem imagem"}</strong>
              <p>{state?.businessCard ? `${formatFileSize(state.businessCard.size)} • ${formatDate(state.businessCard.uploadedAt)}` : "Opcional. Não entra dentro do editor."}</p>
              <label className={`${styles.uploadButton} ${styles.fullButton}`}>
                {uploadingBusinessCard ? "Salvando..." : "Atualizar assinatura"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => void uploadBusinessCard(event.target.files?.[0])}
                  disabled={uploadingBusinessCard || sending}
                />
              </label>
              {state?.businessCard?.previewDataUrl ? (
                <img className={styles.signaturePreview} src={state.businessCard.previewDataUrl} alt="Assinatura comercial" />
              ) : null}
            </div>
          ) : null}

          <div className={styles.previewCard}>
            <span>Preview</span>
            <strong>{preview.subject || "Sem assunto"}</strong>
            <div className={styles.previewBody} dangerouslySetInnerHTML={{ __html: preview.html || "&nbsp;" }} />
            {isNormal && state?.businessCard?.previewDataUrl ? (
              <img className={styles.previewSignature} src={state.businessCard.previewDataUrl} alt="Assinatura comercial no email" />
            ) : null}
          </div>

          <div className={styles.sideCard}>
            <span>Remetente</span>
            <strong>{state?.sender.from || "jhonatan@hbx.com.br"}</strong>
            <p>Resposta para {state?.sender.replyTo || "jhonatan@hbx.com.br"}</p>
          </div>

          {lastSent ? (
            <div className={styles.sideCard}>
              <span>Último envio</span>
              <strong>{lastSent.recipientName}</strong>
              <p>{lastSent.recipientEmail} • {formatDate(lastSent.sentAt)}</p>
            </div>
          ) : null}
        </aside>
      </div>
    </DashboardScaffold>
  );
}
