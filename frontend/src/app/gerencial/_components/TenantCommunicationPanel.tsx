"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/app/_lib/api";
import { HbxEmptyState } from "@/components/ui";

type TenantCommunicationPanelProps = {
  surface?: "desktop" | "mobile";
};

type TenantCommunicationSettings = {
  supportEmail: string | null;
  replyToEmail: string | null;
  supportWhatsapp: string | null;
  communicationSettingsJson: string | null;
  canEdit?: boolean;
  canUseCompanyReplyTo?: boolean;
};

type TenantCommunicationDraft = {
  supportEmail: string;
  replyToEmail: string;
  supportWhatsapp: string;
  communicationSettingsJson: string;
};

const EMPTY_DRAFT: TenantCommunicationDraft = {
  supportEmail: "",
  replyToEmail: "",
  supportWhatsapp: "",
  communicationSettingsJson: "",
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Nao foi possivel concluir a operacao.";
}

function draftFromSettings(settings: TenantCommunicationSettings | null): TenantCommunicationDraft {
  return {
    supportEmail: settings?.supportEmail || "",
    replyToEmail: settings?.replyToEmail || "",
    supportWhatsapp: settings?.supportWhatsapp || "",
    communicationSettingsJson: settings?.communicationSettingsJson || "",
  };
}

function fieldValue(value: string | null | undefined) {
  return value?.trim() || "-";
}

export default function TenantCommunicationPanel({ surface = "desktop" }: TenantCommunicationPanelProps) {
  const [settings, setSettings] = useState<TenantCommunicationSettings | null>(null);
  const [draft, setDraft] = useState<TenantCommunicationDraft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isMobile = surface === "mobile";
  const canEdit = Boolean(settings?.canEdit);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<TenantCommunicationSettings>("/tenant-communication/settings", {
        requireAuth: true,
      });
      setSettings(payload);
      setDraft(draftFromSettings(payload));
    } catch (loadError) {
      setSettings(null);
      setDraft(EMPTY_DRAFT);
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  function patchDraft(patch: Partial<TenantCommunicationDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = await apiFetch<TenantCommunicationSettings>("/tenant-communication/settings", {
        method: "PATCH",
        requireAuth: true,
        body: JSON.stringify({
          supportEmail: draft.supportEmail,
          replyToEmail: draft.replyToEmail,
          supportWhatsapp: draft.supportWhatsapp,
          communicationSettingsJson: draft.communicationSettingsJson,
        }),
      });
      setSettings(payload);
      setDraft(draftFromSettings(payload));
      setNotice("Canais de comunicacao salvos.");
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  const shellClass = isMobile ? "grid gap-3" : "panel p-4 md:p-5 rounded-[20px] grid gap-4";
  const cardClass = isMobile
    ? "hbx-mobile-card grid gap-3"
    : "rounded-[16px] border border-[var(--line)] bg-[var(--surface-soft)] p-4";
  const innerCardClass = isMobile
    ? "rounded-[16px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface-soft)] p-3"
    : "rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-3";
  const primaryButtonClass = isMobile ? "hbx-mobile-primary-button" : "btn btn-primary btn-sm";
  const secondaryButtonClass = isMobile ? "hbx-mobile-secondary-button" : "btn btn-secondary btn-sm";

  if (loading) {
    return (
      <section className={shellClass} aria-label="Comunicacao">
        <div className={cardClass}>
          <p className="text-sm text-muted">Carregando canais de comunicacao...</p>
        </div>
      </section>
    );
  }

  if (!settings) {
    return (
      <section className={shellClass} aria-label="Comunicacao">
        <HbxEmptyState
          title="Canais restritos."
          description="A politica da equipe nao liberou visualizacao dos canais de suporte desta empresa."
          actions={
            <button type="button" onClick={() => void loadSettings()} className={secondaryButtonClass}>
              Atualizar
            </button>
          }
        />
        {error ? (
          <div className="rounded-[14px] border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600" role="alert">
            {error}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className={shellClass} aria-label="Comunicacao">
      <div className={isMobile ? "hbx-mobile-card grid gap-3" : "flex flex-col xl:flex-row xl:items-start xl:justify-between gap-3"}>
        <div className="min-w-0">
          <span className="badge badge-brand">Comunicacao</span>
          <h2 className="mt-2 text-lg font-semibold">Canais da empresa</h2>
          <p className="mt-1 text-sm text-muted">
            E-mail de suporte, reply-to e WhatsApp usados pelos fluxos comerciais do tenant.
          </p>
        </div>
        <button type="button" onClick={() => void loadSettings()} disabled={loading} className={secondaryButtonClass}>
          Atualizar
        </button>
      </div>

      {error ? (
        <div className="rounded-[14px] border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-[14px] border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700" role="status">
          {notice}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <article className={innerCardClass}>
          <p className="text-xs text-muted">E-mail de suporte</p>
          <strong className="mt-1 block truncate">{fieldValue(settings.supportEmail)}</strong>
        </article>
        <article className={innerCardClass}>
          <p className="text-xs text-muted">Reply-to da empresa</p>
          <strong className="mt-1 block truncate">{fieldValue(settings.replyToEmail)}</strong>
        </article>
        <article className={innerCardClass}>
          <p className="text-xs text-muted">WhatsApp de suporte</p>
          <strong className="mt-1 block truncate">{fieldValue(settings.supportWhatsapp)}</strong>
        </article>
      </div>

      <form onSubmit={(event) => void handleSubmit(event)} className={cardClass}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div>
            <span className="badge">{canEdit ? "Edicao liberada" : "Somente leitura"}</span>
            <h3 className="mt-2 font-semibold">Configuracao de comunicacao</h3>
          </div>
          {settings.canUseCompanyReplyTo ? <span className="badge badge-success">Reply-to liberado</span> : <span className="badge">Reply-to restrito</span>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-semibold text-muted">E-mail de suporte</span>
            <input
              className="field disabled:opacity-60"
              type="email"
              disabled={!canEdit || saving}
              value={draft.supportEmail}
              onChange={(event) => patchDraft({ supportEmail: event.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-semibold text-muted">Reply-to da empresa</span>
            <input
              className="field disabled:opacity-60"
              type="email"
              disabled={!canEdit || saving}
              value={draft.replyToEmail}
              onChange={(event) => patchDraft({ replyToEmail: event.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-semibold text-muted">WhatsApp de suporte</span>
            <input
              className="field disabled:opacity-60"
              type="tel"
              disabled={!canEdit || saving}
              value={draft.supportWhatsapp}
              onChange={(event) => patchDraft({ supportWhatsapp: event.target.value })}
            />
          </label>
        </div>

        <label className="grid gap-1 text-sm">
          <span className="text-xs font-semibold text-muted">Config JSON</span>
          <textarea
            className="field min-h-24 resize-y font-mono text-xs disabled:opacity-60"
            disabled={!canEdit || saving}
            value={draft.communicationSettingsJson}
            onChange={(event) => patchDraft({ communicationSettingsJson: event.target.value })}
            placeholder='{"observacao":"atendimento comercial"}'
          />
        </label>

        {canEdit ? (
          <button type="submit" disabled={saving} className={primaryButtonClass}>
            {saving ? "Salvando..." : "Salvar comunicacao"}
          </button>
        ) : null}
      </form>
    </section>
  );
}
