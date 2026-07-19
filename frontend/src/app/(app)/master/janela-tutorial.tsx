"use client";

// Janela "Tutorial front" — onde o dono sobe UM vídeo por função do tutorial
// público (/tutorialexterno). Arrasta o vídeo pro espaço do passo (ou clica pra
// escolher); depois pode trocar exibição Vídeo↔Leve, substituir ou remover.
// Conteúdo (guias + descrições de 1 linha) é estático em lib/tutorial-content.
// O vídeo vai pra /uploads/tutorial/* (master-only) e a página pública lê o
// manifesto sem login.

import React, { useCallback, useEffect, useRef, useState } from "react";

import { TUTORIAL_GUIDES, type TutorialStep } from "@/lib/tutorial-content";
import {
  fetchTutorialManifest,
  removeTutorialVideo,
  setTutorialMode,
  tutorialMediaUrl,
  uploadTutorialVideo,
  type TutorialManifest,
  type TutorialMode,
  type TutorialStepMedia,
} from "@/lib/tutorial-media";

function StepCard({
  step,
  media,
  onChange,
}: {
  step: TutorialStep;
  media?: TutorialStepMedia;
  onChange: (stepId: string, next: TutorialStepMedia | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "err" | "ok"; text: string } | null>(null);

  const send = useCallback(async (file: File) => {
    if (!file.type.startsWith("video/") && file.type !== "image/gif" && file.type !== "image/webp") {
      setMsg({ kind: "err", text: "Envie um vídeo (MP4/WebM/MOV)." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const saved = await uploadTutorialVideo(step.id, file);
      onChange(step.id, saved);
      setMsg({ kind: "ok", text: "Vídeo salvo." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao enviar." });
    } finally {
      setBusy(false);
    }
  }, [step.id, onChange]);

  async function trocarModo(mode: TutorialMode) {
    if (busy || media?.mode === mode) return;
    setBusy(true);
    try {
      const saved = await setTutorialMode(step.id, mode);
      onChange(step.id, saved);
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao trocar." });
    } finally {
      setBusy(false);
    }
  }

  async function remover() {
    if (busy) return;
    setBusy(true);
    try {
      await removeTutorialVideo(step.id);
      onChange(step.id, null);
      setMsg(null);
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao remover." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tut-card">
      <div className="tut-card__title">{step.title}</div>
      <div className="tut-card__desc">{step.desc}</div>

      {media ? (
        <div className="tut-media">
          <video src={tutorialMediaUrl(media.url)} controls muted playsInline preload="metadata" />
          <div className="tut-media__row">
            <span className="tut-media__seg" role="group" aria-label="Modo de exibição">
              <button type="button" className={media.mode === "video" ? "is-on" : ""} onClick={() => trocarModo("video")} disabled={busy}>Vídeo</button>
              <button type="button" className={media.mode === "light" ? "is-on" : ""} onClick={() => trocarModo("light")} disabled={busy}>Leve</button>
            </span>
            <button type="button" className="btn-ghost" style={{ minHeight: 26, fontSize: "0.64rem" }} onClick={() => inputRef.current?.click()} disabled={busy}>Trocar</button>
            <button type="button" className="btn-ghost" style={{ minHeight: 26, fontSize: "0.64rem", marginLeft: "auto" }} onClick={remover} disabled={busy}>Remover</button>
          </div>
        </div>
      ) : (
        <div
          className={"tut-drop" + (over ? " is-over" : "") + (busy ? " is-busy" : "")}
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) void send(f); }}
        >
          <strong>{busy ? "Enviando…" : "Arraste o vídeo aqui"}</strong>
          <span>ou clique para escolher</span>
        </div>
      )}

      {msg && <div className={"tut-msg " + (msg.kind === "err" ? "is-err" : "is-ok")}>{msg.text}</div>}

      <input
        ref={inputRef}
        type="file"
        accept="video/*,image/gif,image/webp"
        hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void send(f); e.target.value = ""; }}
      />
    </div>
  );
}

export function JanelaTutorial() {
  const [manifest, setManifest] = useState<TutorialManifest>({ steps: {} });

  useEffect(() => { void fetchTutorialManifest().then(setManifest); }, []);

  const onChange = useCallback((stepId: string, next: TutorialStepMedia | null) => {
    setManifest((prev) => {
      const steps = { ...prev.steps };
      if (next) steps[stepId] = next;
      else delete steps[stepId];
      return { steps };
    });
  }, []);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Tutorial front</h2>
        <div className="meta">exibido em /tutorialexterno</div>
      </div>
      <div style={{ padding: "12px 16px 16px" }}>
        <div className="tut-adm">
          <p className="tut-adm__intro">
            Cada função tem uma descrição fixa (1 linha). Arraste um vídeo curto pro espaço dela — ele aparece
            no tutorial público. Troque a exibição entre <strong>Vídeo</strong> (com som/controles) e <strong>Leve</strong>
            {" "}(mudo em loop, mais leve).
          </p>
          {TUTORIAL_GUIDES.map((guide) => (
            <div className="tut-guide" key={guide.id}>
              <div className="tut-guide__head">
                <strong>{guide.label}</strong>
                <small>{guide.hint}</small>
              </div>
              <div className="tut-grid">
                {guide.steps.map((step) => (
                  <StepCard key={step.id} step={step} media={manifest.steps[step.id]} onChange={onChange} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
