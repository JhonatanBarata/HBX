"use client";

// Janela "Tutorial front" — o dono monta o tutorial público (/tutorialexterno)
// inteiro daqui: edita título e descrição, adiciona/remove tela, muda a ordem e
// põe o vídeo (arrastando o arquivo OU colando um link do YouTube).
//
// Modelo de edição: só o UPLOAD bate no servidor na hora (precisa dos bytes);
// texto, link, ordem, adicionar e remover são edições locais confirmadas no
// "Salvar". Antes de subir arquivo a gente salva a estrutura pendente — senão o
// backend não acha a tela nova e o texto não salvo seria sobrescrito pela
// resposta do upload.

import React, { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchTutorialManifest,
  resolvePlayback,
  saveTutorialStructure,
  uploadTutorialVideo,
  type TutorialGuide,
  type TutorialManifest,
  type TutorialMode,
  type TutorialStep,
} from "@/lib/tutorial-media";

function novaTelaId() {
  return `tela-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

function clone(manifest: TutorialManifest): TutorialManifest {
  return JSON.parse(JSON.stringify(manifest));
}

function StepEditor({
  step,
  index,
  total,
  onPatch,
  onMove,
  onRemove,
  onUpload,
  busy,
}: {
  step: TutorialStep;
  index: number;
  total: number;
  onPatch: (patch: Partial<TutorialStep>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
  onUpload: (file: File) => void;
  busy: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);
  const [link, setLink] = useState("");
  const playback = resolvePlayback(step.media);

  function aplicarLink() {
    const url = link.trim();
    if (!url) return;
    onPatch({ media: { kind: "link", url, mode: step.media?.mode || "video", updatedAt: new Date().toISOString() } });
    setLink("");
  }

  return (
    <div className="tut-card">
      <div className="tut-card__bar">
        <span className="tut-card__pos">{index + 1}</span>
        <button type="button" className="tut-mini" onClick={() => onMove(-1)} disabled={index === 0} title="Subir">↑</button>
        <button type="button" className="tut-mini" onClick={() => onMove(1)} disabled={index === total - 1} title="Descer">↓</button>
        <button type="button" className="tut-mini tut-mini--danger" onClick={onRemove} title="Remover esta tela">✕</button>
      </div>

      <input
        className="tut-inp tut-inp--title"
        value={step.title}
        placeholder="Título da tela"
        onChange={(e) => onPatch({ title: e.target.value })}
      />
      <textarea
        className="tut-inp tut-inp--desc"
        value={step.desc}
        rows={2}
        placeholder="Descrição em 1 linha"
        onChange={(e) => onPatch({ desc: e.target.value })}
      />

      {playback ? (
        <div className="tut-media">
          {playback.kind === "iframe" ? (
            <iframe className="tut-media__frame" src={playback.src} title={step.title} allowFullScreen />
          ) : (
            <video src={playback.src} controls muted playsInline preload="metadata" />
          )}
          <div className="tut-media__row">
            <span className="tut-media__seg" role="group" aria-label="Modo de exibição">
              {(["video", "light"] as TutorialMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={step.media?.mode === m ? "is-on" : ""}
                  onClick={() => step.media && onPatch({ media: { ...step.media, mode: m } })}
                >
                  {m === "video" ? "Vídeo" : "Leve"}
                </button>
              ))}
            </span>
            <span className="tut-media__tag">{step.media?.kind === "link" ? "link" : "arquivo"}</span>
            <button type="button" className="tut-mini" onClick={() => inputRef.current?.click()} disabled={busy}>Trocar</button>
            <button type="button" className="tut-mini tut-mini--danger" onClick={() => onPatch({ media: null })}>Tirar vídeo</button>
          </div>
        </div>
      ) : (
        <React.Fragment>
          <div
            className={"tut-drop" + (over ? " is-over" : "") + (busy ? " is-busy" : "")}
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onUpload(f); }}
          >
            <strong>{busy ? "Enviando…" : "Arraste o vídeo aqui"}</strong>
            <span>ou clique para escolher</span>
          </div>
          <div className="tut-link">
            <input
              className="tut-inp"
              value={link}
              placeholder="ou cole um link (YouTube, Vimeo…)"
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aplicarLink(); } }}
            />
            <button type="button" className="tut-mini" onClick={aplicarLink} disabled={!link.trim()}>Usar</button>
          </div>
        </React.Fragment>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="video/*,image/gif,image/webp"
        hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }}
      />
    </div>
  );
}

export function JanelaTutorial() {
  const [manifest, setManifest] = useState<TutorialManifest | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "err" | "ok"; text: string } | null>(null);

  useEffect(() => { void fetchTutorialManifest().then(setManifest); }, []);

  const edit = useCallback((fn: (draft: TutorialManifest) => void) => {
    setManifest((prev) => {
      if (!prev) return prev;
      const draft = clone(prev);
      fn(draft);
      return draft;
    });
    setDirty(true);
    setMsg(null);
  }, []);

  const salvar = useCallback(async (): Promise<TutorialManifest | null> => {
    if (!manifest) return null;
    setBusy(true);
    try {
      const saved = await saveTutorialStructure(manifest);
      setManifest(saved);
      setDirty(false);
      setMsg({ kind: "ok", text: "Tutorial salvo." });
      return saved;
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao salvar." });
      return null;
    } finally {
      setBusy(false);
    }
  }, [manifest]);

  // Upload precisa que a tela já exista no servidor (e não pode descartar texto
  // não salvo): salva a estrutura pendente antes de mandar o arquivo.
  async function enviarVideo(stepId: string, file: File) {
    if (busy) return;
    if (dirty && !(await salvar())) return;
    setBusy(true);
    setMsg(null);
    try {
      setManifest(await uploadTutorialVideo(stepId, file));
      setMsg({ kind: "ok", text: "Vídeo enviado." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao enviar." });
    } finally {
      setBusy(false);
    }
  }

  function addTela(guideId: string) {
    edit((draft) => {
      const guide = draft.guides.find((g) => g.id === guideId);
      guide?.steps.push({ id: novaTelaId(), title: "Nova tela", desc: "", media: null });
    });
  }

  function patchTela(guideId: string, stepId: string, patch: Partial<TutorialStep>) {
    edit((draft) => {
      const guide = draft.guides.find((g) => g.id === guideId);
      const step = guide?.steps.find((s) => s.id === stepId);
      if (step) Object.assign(step, patch);
    });
  }

  function moverTela(guideId: string, index: number, delta: number) {
    edit((draft) => {
      const guide = draft.guides.find((g) => g.id === guideId);
      if (!guide) return;
      const target = index + delta;
      if (target < 0 || target >= guide.steps.length) return;
      const [item] = guide.steps.splice(index, 1);
      guide.steps.splice(target, 0, item);
    });
  }

  function removerTela(guideId: string, stepId: string) {
    edit((draft) => {
      const guide = draft.guides.find((g) => g.id === guideId);
      if (guide) guide.steps = guide.steps.filter((s) => s.id !== stepId);
    });
  }

  function patchGuia(guideId: string, patch: Partial<TutorialGuide>) {
    edit((draft) => {
      const guide = draft.guides.find((g) => g.id === guideId);
      if (guide) Object.assign(guide, patch);
    });
  }

  if (!manifest) {
    return (
      <section className="panel">
        <div className="panel-head"><h2>Tutorial front</h2></div>
        <div style={{ padding: 20, fontSize: "0.76rem" }}>Carregando…</div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Tutorial front</h2>
        <div className="meta">
          {msg && <span className={"tut-msg " + (msg.kind === "err" ? "is-err" : "is-ok")}>{msg.text}</span>}
          {dirty && <span className="tag warn">alterações não salvas</span>}
          <button className="btn-teal" style={{ minHeight: 30, fontSize: "0.7rem" }} onClick={() => void salvar()} disabled={busy || !dirty}>
            {busy ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>

      <div style={{ padding: "12px 16px 16px" }}>
        <div className="tut-adm">
          <p className="tut-adm__intro">
            Isto é o que o cliente vê em <strong>/tutorialexterno</strong>. Edite o título e a descrição, use ↑↓ para
            ordenar, ✕ para remover a tela e <strong>Adicionar tela</strong> para criar. O vídeo pode ser arquivo
            (arrastando) ou link do YouTube. <strong>Vídeo</strong> = com controles; <strong>Leve</strong> = mudo em loop.
          </p>

          {manifest.guides.map((guide) => (
            <div className="tut-guide" key={guide.id}>
              <div className="tut-guide__head">
                <input
                  className="tut-inp tut-inp--guide"
                  value={guide.label}
                  placeholder="Nome da guia"
                  onChange={(e) => patchGuia(guide.id, { label: e.target.value })}
                />
                <input
                  className="tut-inp tut-inp--hint"
                  value={guide.hint}
                  placeholder="Subtítulo da guia"
                  onChange={(e) => patchGuia(guide.id, { hint: e.target.value })}
                />
                <button type="button" className="tut-mini" onClick={() => addTela(guide.id)}>+ Adicionar tela</button>
              </div>
              <div className="tut-grid">
                {guide.steps.map((step, index) => (
                  <StepEditor
                    key={step.id}
                    step={step}
                    index={index}
                    total={guide.steps.length}
                    busy={busy}
                    onPatch={(patch) => patchTela(guide.id, step.id, patch)}
                    onMove={(delta) => moverTela(guide.id, index, delta)}
                    onRemove={() => removerTela(guide.id, step.id)}
                    onUpload={(file) => void enviarVideo(step.id, file)}
                  />
                ))}
                {guide.steps.length === 0 && (
                  <p className="tut-adm__intro">Nenhuma tela nesta guia — use “Adicionar tela”.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
