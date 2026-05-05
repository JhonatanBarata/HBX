"use client";

import { type ClipboardEvent as ReactClipboardEvent, type DragEvent as ReactDragEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch, getDirectDashboardApiBaseUrl } from "@/app/_lib/api";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";
import styles from "./page.module.css";

type MasterEmailState = {
  subject: string;
  template: string;
  preview: string;
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

const DEFAULT_NAME = "Amanda";

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

function renderTemplate(template: string, name: string) {
  return String(template || "").replace("{{nome}}", String(name || "").trim() || "cliente");
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textToEditorHtml(value: string) {
  return escapeHtml(value)
    .split("\n")
    .map((line) => line || "<br>")
    .join("<br>");
}

function findClipboardImageFile(items?: DataTransferItemList | null) {
  const imageItem = Array.from(items || []).find((item) => item.type.startsWith("image/"));
  return imageItem?.getAsFile() || null;
}

function buildDirectApiPath(path: string) {
  return `${getDirectDashboardApiBaseUrl()}${path}`;
}

export default function MasterEmailClientPage() {
  const hasToken = useRequireAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const businessCardInputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const editorRangeRef = useRef<Range | null>(null);
  const [state, setState] = useState<MasterEmailState | null>(null);
  const [recipientName, setRecipientName] = useState(DEFAULT_NAME);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [subjectDraft, setSubjectDraft] = useState("");
  const [bodyDraft, setBodyDraft] = useState("");
  const [bodyHtmlDraft, setBodyHtmlDraft] = useState("");
  const [bodyDirty, setBodyDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadingBusinessCard, setUploadingBusinessCard] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSent, setLastSent] = useState<MasterEmailSendResponse | null>(null);

  async function loadState() {
    setLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<MasterEmailState>("/master/email", { requireAuth: true });
      const renderedBody = renderTemplate(payload.template || payload.preview || "", recipientName);
      setState(payload);
      setSubjectDraft(payload.subject || "");
      setBodyDraft(renderedBody);
      setBodyHtmlDraft(textToEditorHtml(renderedBody));
      setBodyDirty(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar a tela de email.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (hasToken === true) void loadState();
  }, [hasToken]);

  const defaultBody = useMemo(
    () => renderTemplate(state?.template || state?.preview || "", recipientName),
    [recipientName, state?.preview, state?.template],
  );

  useEffect(() => {
    if (!state || bodyDirty) return;
    setBodyDraft(defaultBody);
    setBodyHtmlDraft(textToEditorHtml(defaultBody));
  }, [bodyDirty, defaultBody, state]);

  useEffect(() => {
    if (!editorRef.current || bodyDirty) return;
    editorRef.current.innerHTML = bodyHtmlDraft;
  }, [bodyDirty, bodyHtmlDraft]);

  function rememberEditorSelection() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      editorRangeRef.current = range.cloneRange();
    }
  }

  function syncEditorDraft() {
    const editor = editorRef.current;
    if (!editor) return;
    setBodyDraft(editor.innerText || "");
    setBodyHtmlDraft(editor.innerHTML || "");
    setBodyDirty(true);
  }

  function insertHtmlIntoEditor(html: string) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    if (editorRangeRef.current) {
      selection.addRange(editorRangeRef.current);
    } else {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.addRange(range);
    }
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const fragment = range.createContextualFragment(html);
    const lastNode = fragment.lastChild;
    range.insertNode(fragment);
    if (lastNode) {
      const nextRange = document.createRange();
      nextRange.setStartAfter(lastNode);
      nextRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(nextRange);
      editorRangeRef.current = nextRange.cloneRange();
    }
    syncEditorDraft();
  }

  function insertBusinessCardIntoEditor(card: MasterEmailState["businessCard"]) {
    if (!card?.previewDataUrl) return;
    insertHtmlIntoEditor(
      `<p><img data-hbx-business-card="true" src="${card.previewDataUrl}" alt="Cartão de visitas" style="max-width:640px;width:100%;height:auto;display:block;margin:12px 0;" /></p>`,
    );
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
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Falha ao enviar o PPTX.");
    } finally {
      setUploading(false);
    }
  }

  function getImageFilename(file: File) {
    if (file.name) return file.name;
    if (file.type === "image/jpeg") return "cartao-visitas.jpg";
    if (file.type === "image/webp") return "cartao-visitas.webp";
    return "cartao-visitas.png";
  }

  async function uploadBusinessCard(file: File | null | undefined) {
    if (!file) return null;
    if (!file.type.startsWith("image/")) {
      setError("O cartão de visitas precisa ser uma imagem PNG, JPG ou WEBP.");
      return null;
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
      setMessage("Cartão de visitas salvo.");
      if (businessCardInputRef.current) businessCardInputRef.current.value = "";
      return payload.businessCard;
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Falha ao salvar o cartão de visitas.");
      return null;
    } finally {
      setUploadingBusinessCard(false);
    }
  }

  async function pasteBusinessCardIntoEditor(file: File | null | undefined) {
    if (!file) return;
    rememberEditorSelection();
    const card = await uploadBusinessCard(file);
    insertBusinessCardIntoEditor(card);
  }

  useEffect(() => {
    if (hasToken !== true) return;

    function handleWindowPaste(event: globalThis.ClipboardEvent) {
      const file = findClipboardImageFile(event.clipboardData?.items);
      if (!file) return;
      event.preventDefault();
      void pasteBusinessCardIntoEditor(file);
    }

    window.addEventListener("paste", handleWindowPaste);
    return () => window.removeEventListener("paste", handleWindowPaste);
  }, [hasToken, uploadBusinessCard]);

  function handleBusinessCardPaste(event: ReactClipboardEvent<HTMLDivElement>) {
    const file = findClipboardImageFile(event.clipboardData?.items);
    if (!file) return;
    event.preventDefault();
    void pasteBusinessCardIntoEditor(file);
  }

  function handleBusinessCardDrop(event: ReactDragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = Array.from(event.dataTransfer?.files || []).find((item) => item.type.startsWith("image/"));
    void pasteBusinessCardIntoEditor(file);
  }

  async function sendEmail() {
    setSending(true);
    setMessage(null);
    setError(null);
    setLastSent(null);
    try {
      const text = editorRef.current?.innerText || bodyDraft;
      const html = editorRef.current?.innerHTML || bodyHtmlDraft;
      const payload = await apiFetch<MasterEmailSendResponse>("/master/email/send", {
        method: "POST",
        body: JSON.stringify({
          recipientName,
          recipientEmail,
          subject: subjectDraft,
          text,
          html,
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

  if (hasToken === null || loading) {
    return (
      <main className="app-shell">
        <div className="app-container">
          <div className="panel p-4 text-sm text-muted">Carregando email MASTER...</div>
        </div>
      </main>
    );
  }

  if (!hasToken) return null;

  const canSend = Boolean(
    recipientName.trim() &&
      recipientEmail.trim() &&
      subjectDraft.trim() &&
      bodyDraft.trim() &&
      state?.attachment &&
      !sending &&
      !uploading &&
      !uploadingBusinessCard,
  );
  const senderReady = state?.sender.ready;

  return (
    <DashboardScaffold
      title="Email"
      description="Envio simples da apresentação HBX pelo email jhonatan@hbx.com.br."
      actions={<Link href="/master" className="btn btn-secondary btn-sm">Voltar ao Master</Link>}
    >
      <div className={styles.page}>
        {error ? <div className="alert alert-error">{error}</div> : null}
        {message ? <div className="alert alert-success">{message}</div> : null}

        <section className={styles.panel}>
          <div className={styles.header}>
            <div>
              <span>Email comercial</span>
              <h2>Apresentação HBX</h2>
            </div>
            <strong data-ready={senderReady ? "true" : "false"}>
              {senderReady ? "SMTP pronto" : "SMTP incompleto"}
            </strong>
          </div>

          <div className={styles.grid}>
            <label className={styles.field}>
              <span>Nome do contato</span>
              <input
                value={recipientName}
                onChange={(event) => setRecipientName(event.target.value)}
                placeholder="Amanda"
              />
            </label>

            <label className={styles.field}>
              <span>Email do contato</span>
              <input
                type="email"
                value={recipientEmail}
                onChange={(event) => setRecipientEmail(event.target.value)}
                placeholder="cliente@empresa.com.br"
              />
            </label>
          </div>

          <label className={styles.field}>
            <span>Assunto</span>
            <input
              value={subjectDraft}
              onChange={(event) => setSubjectDraft(event.target.value)}
              placeholder="Apresentação HBX System"
            />
          </label>

          <div className={styles.field}>
            <span>Mensagem</span>
            <div
              ref={editorRef}
              className={styles.emailEditor}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              tabIndex={0}
              onInput={syncEditorDraft}
              onBlur={rememberEditorSelection}
              onKeyUp={rememberEditorSelection}
              onMouseUp={rememberEditorSelection}
              onPaste={(event) => {
                const file = findClipboardImageFile(event.clipboardData?.items);
                if (!file) return;
                event.preventDefault();
                void pasteBusinessCardIntoEditor(file);
              }}
              data-placeholder="Escreva a mensagem do email"
              dangerouslySetInnerHTML={{ __html: bodyHtmlDraft }}
            />
          </div>

          <div className={styles.inlineActions}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                const html = textToEditorHtml(defaultBody);
                setSubjectDraft(state?.subject || "");
                setBodyDraft(defaultBody);
                setBodyHtmlDraft(html);
                setBodyDirty(false);
                if (editorRef.current) editorRef.current.innerHTML = html;
              }}
              disabled={sending || uploading || uploadingBusinessCard}
            >
              Restaurar padrão
            </button>
          </div>

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
                ref={fileInputRef}
                type="file"
                accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                onChange={(event) => void uploadAttachment(event.target.files?.[0])}
                disabled={uploading || sending}
              />
            </label>
          </div>

          <div
            className={styles.cardUploader}
            role="group"
            tabIndex={0}
            onPaste={handleBusinessCardPaste}
            onDrop={handleBusinessCardDrop}
            onDragOver={(event) => event.preventDefault()}
          >
            <div className={styles.cardUploaderContent}>
              <span>Cartão de visitas</span>
              <strong>{state?.businessCard?.originalName || "Nenhuma imagem salva"}</strong>
              <p>
                {state?.businessCard
                  ? `${formatFileSize(state.businessCard.size)} • salvo em ${formatDate(state.businessCard.uploadedAt)}`
                  : "Cole uma imagem aqui, arraste o arquivo ou selecione uma imagem."}
              </p>
              <div className={styles.cardActions}>
                <label className={styles.uploadButton}>
                  {uploadingBusinessCard ? "Salvando..." : "Selecionar imagem"}
                  <input
                    ref={businessCardInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => void pasteBusinessCardIntoEditor(event.target.files?.[0])}
                    disabled={uploadingBusinessCard || sending}
                  />
                </label>
                <span>Use Ctrl+V em qualquer ponto da tela.</span>
              </div>
            </div>
            {state?.businessCard?.previewDataUrl ? (
              <div className={styles.cardPreview}>
                <img src={state.businessCard.previewDataUrl} alt="Cartão de visitas salvo" />
              </div>
            ) : null}
          </div>

          {!senderReady ? (
            <div className={styles.warning}>
              Configure SMTP/MAIL no backend antes do envio real. Pendências: {state?.sender.missing.join(", ") || "provedor não configurado"}.
            </div>
          ) : null}

          <div className={styles.actions}>
            <button type="button" className="btn btn-primary btn-sm" onClick={sendEmail} disabled={!canSend}>
              {sending ? "Enviando..." : "Enviar email"}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadState()} disabled={loading || sending}>
              Atualizar
            </button>
          </div>
        </section>

        <aside className={styles.side}>
          <div className={styles.sideCard}>
            <span>Remetente</span>
            <strong>{state?.sender.from || "jhonatan@hbx.com.br"}</strong>
            <p>Resposta para {state?.sender.replyTo || "jhonatan@hbx.com.br"}</p>
          </div>
          <div className={styles.sideCard}>
            <span>Assunto</span>
            <strong>{subjectDraft || state?.subject || "Apresentação HBX System"}</strong>
            <p>Editável antes de enviar.</p>
          </div>
          <div className={styles.sideCard}>
            <span>Cartão</span>
            <strong>{state?.businessCard ? "Será incluído no email" : "Opcional"}</strong>
            <p>{state?.businessCard ? "A imagem salva entra abaixo da assinatura." : "Cole a imagem na tela para salvar."}</p>
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
