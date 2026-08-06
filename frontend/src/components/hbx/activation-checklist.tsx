"use client";

// Configuração assistida: o backend continua sendo a fonte da verdade pelo
// GET /onboarding/checklist. A casca mostra só um ícone e, quando aberta, uma
// única pendência por vez. Ações especiais são uma whitelist local; nenhuma IA
// escolhe rota, endpoint ou efeito colateral.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { I, ICONS, useMyModules } from "@/components/hbx/shell";
import { WhatsAppConnectModal, WhatsAppSetupQrModal } from "@/components/hbx/whatsapp-connect-modal";
import { apiFetch, getToken } from "@/lib/api";
import { subscribeChecklistBump } from "@/lib/onboarding";
import { getSetupOffer, isAllowedSetupNavigation, type SetupAction } from "@/lib/setup-concierge";

type Step = {
  key: string;
  label: string;
  hint: string;
  href: string;
  cta: string;
  milestone: boolean;
  done: boolean;
  doneAt: string | null;
};

type Checklist = {
  applicable: boolean;
  role: string;
  complete: boolean;
  activated: boolean;
  progress: { done: number; total: number };
  steps: Step[];
};

export function ActivationChecklist() {
  const router = useRouter();
  const pathname = usePathname() || "";
  const modules = useMyModules();
  const [data, setData] = useState<Checklist | null>(null);
  const [open, setOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [whatsappPanel, setWhatsAppPanel] = useState<"code" | "full" | null>(null);
  const [segmentOpen, setSegmentOpen] = useState(false);
  const [guidanceKey, setGuidanceKey] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [reply, setReply] = useState<{ text: string; tone: "success" | "info" | "error" } | null>(null);
  const launchRef = useRef<HTMLButtonElement | null>(null);
  const panelCloseRef = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(() => {
    if (!getToken()) return;
    apiFetch<Checklist>("/onboarding/checklist")
      .then((res) => setData(res || null))
      .catch(() => { /* sem checklist → não aparece */ });
  }, []);

  useEffect(() => { load(); }, [load, pathname]);
  useEffect(() => subscribeChecklistBump(load), [load]);

  const closeQr = useCallback(() => {
    setQrOpen(false);
    setOpen(true);
    window.requestAnimationFrame(() => launchRef.current?.focus());
  }, []);
  const closeWhatsappPanel = useCallback(() => {
    setWhatsAppPanel(null);
    setOpen(true);
    window.requestAnimationFrame(() => launchRef.current?.focus());
  }, []);
  const whatsappConnected = useCallback(() => {
    setQrOpen(false);
    setWhatsAppPanel(null);
    setOpen(true);
    setReply({ text: "Conexão feita.", tone: "success" });
    load();
  }, [load]);

  const closePanel = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => launchRef.current?.focus());
  }, []);
  const closeSegment = useCallback(() => {
    setSegmentOpen(false);
    setOpen(true);
    window.requestAnimationFrame(() => launchRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => panelCloseRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closePanel, open]);

  if (!data || !data.applicable) return null;

  const pending = data.steps.filter((step) => !step.done);
  const next = pending[0] || null;
  const offer = next && modules.loaded ? getSetupOffer(next, {
    conciergeAccessible: modules.byKey.concierge?.accessible === true,
    radarAccessible: modules.byKey.radar?.accessible === true || modules.byKey.webscraping?.accessible === true,
    vendasAccessible: modules.byKey.vendas?.accessible === true,
    atendimentoAccessible: modules.byKey.atendimento?.accessible === true,
    gerencialAccessible: modules.byKey.gerencial?.accessible === true,
  }) : null;
  const guidanceOpen = Boolean(next && guidanceKey === next.key);
  const showingCompletion = data.complete && Boolean(reply) && open;
  if (data.complete && !showingCompletion) return null;
  if (!next && !showingCompletion) return null;

  async function runAction(action: SetupAction) {
    setReply(null);
    if (action.kind === "whatsapp_qr") {
      setOpen(false);
      setQrOpen(true);
    } else if (action.kind === "whatsapp_code" || action.kind === "whatsapp_full") {
      setOpen(false);
      setWhatsAppPanel(action.kind === "whatsapp_code" ? "code" : "full");
    } else if (action.kind === "company_segment") {
      setOpen(false);
      setSegmentOpen(true);
    } else if (action.kind === "notice") {
      setReply({ text: action.message, tone: "info" });
    } else if (action.kind === "concierge_search") {
      if (actionBusy) return;
      setActionBusy(true);
      try {
        const availability = await apiFetch<{ code?: string }>("/concierge");
        if (availability?.code === "feature_disabled") {
          setReply({ text: "A busca por conversa não está liberada nesta instalação. Use “Preencher a busca”.", tone: "info" });
          return;
        }
        setOpen(false);
        router.push("/concierge");
      } catch {
        setReply({ text: "Não consegui abrir a busca por conversa agora. Use “Preencher a busca”.", tone: "error" });
      } finally {
        setActionBusy(false);
      }
    } else {
      if (!isAllowedSetupNavigation(action)) {
        setReply({ text: "Este atalho não está disponível. Abra a configuração novamente.", tone: "error" });
        return;
      }
      try {
        for (const [key, value] of Object.entries(action.hints || {})) sessionStorage.setItem(key, value);
      } catch { /* sem storage */ }
      setOpen(false);
      const targetPath = action.href.split("?")[0];
      if (targetPath === pathname && action.hints?.["hbx:abrir-novo-lead"] === "1") {
        try { window.dispatchEvent(new Event("hbx:abrir-novo-lead")); } catch { /* sem evento */ }
      } else if (targetPath === pathname && action.href.includes("?")) {
        // Configurações/Gerencial leem seus deep-links no mount. Na mesma rota,
        // um reload curto garante que aba e modal sejam realmente consumidos.
        window.location.assign(action.href);
      } else {
        router.push(action.href);
      }
    }
  }

  return (
    <>
      <button
        type="button"
        ref={launchRef}
        className="ac-launch"
        data-tut="ac-checklist"
        aria-label={`Terminar configuração. ${pending.length} ${pending.length === 1 ? "pendência" : "pendências"}.`}
        title="Terminar configuração"
        aria-expanded={open}
        aria-controls="hbx-setup-concierge"
        onClick={() => setOpen((value) => !value)}
      >
        <I d={ICONS.concierge} size={21} />
        {pending.length > 0 && <span className="ac-launch__count" aria-hidden="true">{pending.length}</span>}
      </button>

      {open && (
        <aside id="hbx-setup-concierge" className="ac-card" data-tut="ac-checklist" aria-label="Concierge de configuração">
          <header className="ac-head">
            <span className="ac-head__icon" aria-hidden="true"><I d={ICONS.concierge} size={17} /></span>
            <span className="ac-head__text">
              <strong>{showingCompletion ? "Configuração concluída" : "Terminar configuração"}</strong>
              <small>{showingCompletion ? "Tudo pronto" : `${pending.length} ${pending.length === 1 ? "pendência" : "pendências"}`}</small>
            </span>
            <button ref={panelCloseRef} type="button" className="ac-close" onClick={closePanel} aria-label="Fechar">×</button>
          </header>

          <div className="ac-conversation" aria-live="polite">
            {reply && (
              <p className={`ac-reply is-${reply.tone}`}>
                <I d={reply.tone === "success" ? ICONS.check : ICONS.help} size={14} /> {reply.text}
              </p>
            )}
            {next && (
              <>
                <p className="ac-reply">Vamos fazer uma coisa por vez. Agora falta:</p>
                <div className="ac-task">
                  <strong>{next.label}</strong>
                  <span>{next.hint}</span>
                </div>
                {!offer && <p className="ac-reply">Preparando as opções seguras…</p>}
                {offer && (
                  <div className="ac-offer">
                    <p>{offer.intro}</p>
                    <div className="ac-solutions">
                      {offer.solutions.map((solution, index) => (
                        <button
                          key={solution.id}
                          type="button"
                          className={"ac-solution" + (index === 0 ? " is-primary" : "")}
                          disabled={actionBusy}
                          onClick={() => { void runAction(solution.action); }}
                        >
                          <strong>{solution.label}</strong>
                          {solution.description ? <span>{solution.description}</span> : null}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="ac-how"
                      aria-expanded={guidanceOpen}
                      aria-controls={`ac-guidance-${next.key}`}
                      onClick={() => setGuidanceKey(guidanceOpen ? null : next.key)}
                    >
                      {guidanceOpen ? "Ocultar orientação" : "Como fazer?"}
                    </button>
                    {guidanceOpen && (
                      <ol id={`ac-guidance-${next.key}`} className="ac-guidance">
                        {offer.guidance.map((item) => <li key={item}>{item}</li>)}
                      </ol>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </aside>
      )}

      <WhatsAppSetupQrModal open={qrOpen} onClose={closeQr} onConnected={whatsappConnected} />
      {whatsappPanel && (
        <WhatsAppConnectModal
          open
          initialMethod={whatsappPanel === "code" ? "code" : "qr"}
          onClose={closeWhatsappPanel}
          onConnected={whatsappConnected}
        />
      )}
      {segmentOpen && (
        <CompanySegmentSetupModal
          onClose={closeSegment}
          onSaved={() => {
            setSegmentOpen(false);
            setOpen(true);
            setReply({ text: "Ramo salvo.", tone: "success" });
            load();
          }}
        />
      )}
    </>
  );
}

function CompanySegmentSetupModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(modalRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])") || []);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function save() {
    const segments = value.split(",").map((item) => item.trim()).filter(Boolean);
    if (segments.length === 0) {
      setError("Informe pelo menos um ramo.");
      return;
    }
    if (segments.length > 12) {
      setError("Use no máximo 12 ramos.");
      return;
    }
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/profile/prospecting-segments", {
        method: "POST",
        body: JSON.stringify({ segments }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar agora.");
      setBusy(false);
    }
  }

  return (
    <div className="hbx-veil" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form ref={modalRef} className="hbx-modal ac-segment-modal" role="dialog" aria-modal="true" aria-labelledby="ac-segment-title" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <button type="button" className="ac-close ac-segment-close" onClick={onClose} aria-label="Fechar">×</button>
        <div className="ac-segment-copy">
          <strong id="ac-segment-title">Que tipo de empresa você quer encontrar?</strong>
          <span>Você pode informar até 12 ramos, separados por vírgula.</span>
        </div>
        <input
          autoFocus
          className="field-dark"
          value={value}
          maxLength={240}
          onChange={(event) => setValue(event.target.value)}
          aria-label="Ramos que deseja prospectar"
        />
        {error && <span className="ac-segment-error" role="alert">{error}</span>}
        <button type="submit" className="btn-teal" disabled={busy || !value.split(",").some((item) => item.trim())}>{busy ? "Salvando…" : "Salvar e continuar"}</button>
      </form>
    </div>
  );
}
