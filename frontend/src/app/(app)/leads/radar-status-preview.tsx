"use client";

import { type ReactNode, useState } from "react";

import { Av, I, ICONS } from "@/components/hbx/shell";

type PreviewState = "queued" | "processing" | "released" | "invalidated";

type PreviewStateMeta = {
  label: string;
  icon: keyof typeof ICONS;
  tone: "waiting" | "working" | "success" | "danger";
};

const PREVIEW_STATE_ORDER: PreviewState[] = ["queued", "processing", "released", "invalidated"];

const PREVIEW_STATES: Record<PreviewState, PreviewStateMeta> = {
  queued: {
    label: "Aguardando liberação",
    icon: "clock",
    tone: "waiting",
  },
  processing: {
    label: "Em processo de liberação",
    icon: "scrape",
    tone: "working",
  },
  released: {
    label: "Liberado",
    icon: "check",
    tone: "success",
  },
  invalidated: {
    label: "Invalidado",
    icon: "minus",
    tone: "danger",
  },
};

export function RadarStatusPreview({ embedTitle }: { embedTitle?: ReactNode }) {
  const [state, setState] = useState<PreviewState>("processing");
  const status = PREVIEW_STATES[state];

  return (
    <section
      className={`radar-status-preview radar-status-preview--${status.tone}`}
      data-preview-state={state}
      aria-labelledby="radar-status-preview-title"
    >
      <header className="radar-status-preview__header">
        <div className="radar-status-preview__heading">
          <span className="radar-status-preview__eyebrow">Preview</span>
          <h2 id="radar-status-preview-title">{embedTitle ?? "Enriquecimento"}</h2>
        </div>
        <span className="radar-status-preview__sample-label">4 estados</span>
      </header>

      <nav className="radar-status-preview__journey" aria-label="Estados de liberação do card">
        <ol className="radar-status-preview__steps">
          {PREVIEW_STATE_ORDER.map((item) => {
            const itemMeta = PREVIEW_STATES[item];
            const isActive = state === item;

            return (
              <li
                key={item}
                className={`radar-status-preview__step radar-status-preview__step--${itemMeta.tone}`}
                data-active={isActive ? "true" : "false"}
              >
                <button
                  type="button"
                  className="radar-status-preview__step-button"
                  aria-pressed={isActive}
                  onClick={() => setState(item)}
                >
                  <span className="radar-status-preview__step-marker" aria-hidden="true">
                    <I d={ICONS[itemMeta.icon]} size={16} />
                  </span>
                  <strong>{itemMeta.label}</strong>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <article className={`radar-status-preview__lead-card radar-status-preview__lead-card--${state}`}>
        <div className="radar-status-preview__lead-header">
          <div className="radar-status-preview__company">
            <Av name="Empresa Aurora" size={56} />
            <div className="radar-status-preview__company-copy">
              <h3>Empresa Aurora</h3>
              <p>
                <I d={ICONS.mapin} size={13} />
                Xangri-lá, RS
                <span aria-hidden="true">•</span>
                Serviços empresariais
              </p>
            </div>
          </div>
        </div>

        <div className="radar-status-preview__status" role="status" aria-live="polite" aria-atomic="true">
          <span className="radar-status-preview__status-icon" aria-hidden="true">
            <I d={ICONS[status.icon]} size={30} />
          </span>
          <strong>{status.label}</strong>
          <span className="radar-status-preview__status-pulse" aria-hidden="true" />
        </div>
      </article>
    </section>
  );
}
