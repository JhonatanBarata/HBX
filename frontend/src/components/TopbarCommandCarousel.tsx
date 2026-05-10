"use client";

import React, { useMemo } from "react";

export type HbxTopbarTone = "success" | "warning" | "danger" | "neutral" | "loading";

export type HbxTopbarMetric = {
  label: string;
  value: string;
  detail?: string | null;
  tone?: HbxTopbarTone;
  usage?: number | null;
};

export type HbxTopbarCard = {
  id: string;
  title: string;
  meta?: string | null;
  score?: string | number | null;
};

export type HbxTopbarSlideKind =
  | "status"
  | "engines"
  | "nightFactoryReward"
  | "whatsapp"
  | "attention";

export type HbxTopbarSlide = {
  id: string;
  kind?: HbxTopbarSlideKind | string;
  eyebrow: string;
  title: string;
  description?: string | null;
  phase?: "idle" | "loading" | "success" | "warning" | string;
  source?: string | null;
  href?: string | null;
  ctaLabel?: string | null;
  progress?: number | null;
  metrics?: HbxTopbarMetric[];
  steps?: string[];
  activeStepIndex?: number;
  cardFeed?: HbxTopbarCard[];
};

export type HbxTopbarEngine = {
  id: string;
  kind?: "hbx" | "google" | string;
  label?: string | null;
  shortLabel?: string | null;
  index?: number | null;
  status?: string | null;
  configured?: boolean | null;
  active?: boolean | null;
  online?: boolean | null;
  busy?: boolean | null;
  dimmed?: boolean | null;
  detail?: string | null;
  usagePercent?: number | null;
  stateLabel?: string | null;
  processedLast10Min?: number | null;
  errorCount?: number | null;
  heartbeatAgeSeconds?: number | null;
  manualPaused?: boolean | null;
  pausedUntil?: string | null;
  cooldownUntil?: string | null;
  lastError?: string | null;
  isTurboForcedNow?: boolean | null;
};

export type HbxTopbarCommandCarouselProps = {
  slides: HbxTopbarSlide[];
  engines?: HbxTopbarEngine[];
  engineCards?: React.ReactNode;
  className?: string;
  activeIndex?: number;
  onIndexChange?: (index: number) => void;
  onNavigate?: (href: string) => void;
  autoRotateMs?: number;
};

const FALLBACK_SLIDE: HbxTopbarSlide = {
  id: "hbx-operational-fallback",
  kind: "status",
  eyebrow: "STATUS",
  title: "HBX em leitura",
  description: "Carregando dados operacionais.",
  phase: "idle",
  progress: null,
  metrics: [],
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function clampPercent(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : 0;
}

function clampIndex(index: number, length: number) {
  if (!length) return 0;
  return Math.max(0, Math.min(length - 1, index));
}

function getSlideTone(slide: HbxTopbarSlide): HbxTopbarTone {
  const phase = String(slide.phase || "").toLowerCase();
  const kind = String(slide.kind || "").toLowerCase();
  if (phase === "warning" || kind.includes("attention")) return "warning";
  if (phase === "loading") return "loading";
  if (phase === "success") return "success";
  return "neutral";
}

function getMetricTone(metric: HbxTopbarMetric): HbxTopbarTone {
  if (metric.tone) return metric.tone;
  const usage = typeof metric.usage === "number" ? metric.usage : null;
  if (usage === null) return "neutral";
  if (usage >= 88) return "danger";
  if (usage >= 68) return "warning";
  return "success";
}

function HbxMetricPill({ metric }: { metric: HbxTopbarMetric }) {
  const tone = getMetricTone(metric);
  const usage = typeof metric.usage === "number" ? clampPercent(metric.usage) : null;

  return (
    <span
      className={cx("hbxp-metric", `hbxp-tone-${tone}`)}
      title={[metric.label, metric.value, metric.detail].filter(Boolean).join(" - ")}
    >
      <small>{metric.label}</small>
      <strong>{metric.value}</strong>
      {usage !== null ? <i style={{ ["--hbxp-usage" as string]: `${usage}%` }} aria-hidden="true" /> : null}
    </span>
  );
}

function HbxProgressMark({ progress, tone }: { progress: number | null; tone: HbxTopbarTone }) {
  if (progress === null) {
    return <span className={cx("hbxp-status-mark", `hbxp-tone-${tone}`)} aria-hidden="true" />;
  }

  return (
    <span
      className={cx("hbxp-ring", `hbxp-tone-${tone}`)}
      style={{ ["--hbxp-progress" as string]: `${clampPercent(progress)}%` }}
      aria-label={`${clampPercent(progress)}%`}
    >
      <strong>{clampPercent(progress)}%</strong>
    </span>
  );
}

export default function TopbarCommandCarousel({
  slides,
  className,
  activeIndex,
  onIndexChange,
  onNavigate,
}: HbxTopbarCommandCarouselProps) {
  const visibleSlides = slides.length ? slides : [FALLBACK_SLIDE];
  const currentIndex = clampIndex(Number(activeIndex || 0), visibleSlides.length);
  const slide = visibleSlides[currentIndex] || FALLBACK_SLIDE;
  const tone = getSlideTone(slide);
  const metrics = useMemo(() => (Array.isArray(slide.metrics) ? slide.metrics.slice(0, 3) : []), [slide.metrics]);
  const progress = typeof slide.progress === "number" ? clampPercent(slide.progress) : null;

  function handleNavigate() {
    if (!slide.href) return;
    onNavigate?.(slide.href);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (!slide.href || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    handleNavigate();
  }

  return (
    <section className={cx("hbxp-carousel", className)} aria-label="Resumo operacional HBX">
      <style>{HBX_TOPBAR_COMMAND_CAROUSEL_CSS}</style>
      <article
        className={cx("hbxp-panel", slide.href ? "hbxp-panel--clickable" : null, `hbxp-tone-${tone}`)}
        role={slide.href ? "link" : undefined}
        tabIndex={slide.href ? 0 : undefined}
        onClick={slide.href ? handleNavigate : undefined}
        onKeyDown={handleKeyDown}
      >
        <div className="hbxp-panel__copy">
          <div className="hbxp-panel__eyebrow">
            <span>{slide.eyebrow}</span>
            {visibleSlides.length > 1 ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onIndexChange?.((currentIndex + 1) % visibleSlides.length);
                }}
                aria-label="Alternar resumo"
              >
                {currentIndex + 1}/{visibleSlides.length}
              </button>
            ) : null}
          </div>
          <h2 title={slide.title}>{slide.title}</h2>
          {slide.description ? <p title={slide.description}>{slide.description}</p> : null}
        </div>

        <div className="hbxp-panel__metrics" data-count={metrics.length}>
          {metrics.map((metric, index) => (
            <HbxMetricPill key={`${slide.id}-${metric.label}-${index}`} metric={metric} />
          ))}
        </div>

        <HbxProgressMark progress={progress} tone={tone} />
      </article>
    </section>
  );
}

export const HBX_TOPBAR_COMMAND_CAROUSEL_CSS = `
  .hbx-command-carouselNav,
  .hbxp-carousel__nav,
  .hbxp-carousel__dots,
  .hbxp-engine-fleet__pager {
    display: none !important;
  }

  .app-topbar__inner--controlCenter {
    min-height: 76px !important;
    grid-template-columns: minmax(174px, 218px) minmax(0, 1fr) minmax(196px, 260px) !important;
    gap: 8px !important;
    padding: 8px !important;
    border-radius: 20px !important;
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--surface-raised, #fff) 94%, transparent), color-mix(in srgb, var(--surface-soft, #f8fafc) 90%, transparent)),
      linear-gradient(90deg, color-mix(in srgb, var(--brand, #10b981) 8%, transparent), color-mix(in srgb, var(--button-accent, #0ea5e9) 7%, transparent)) !important;
    border: 1px solid color-mix(in srgb, var(--line, rgba(148, 163, 184, .24)) 82%, transparent) !important;
    box-shadow: 0 22px 50px -36px rgba(15, 23, 42, .38) !important;
    overflow: visible !important;
  }

  .hbx-command-brand,
  .hbx-command-side {
    min-height: 64px !important;
    border-radius: 16px !important;
    background: color-mix(in srgb, var(--surface-raised, #fff) 72%, transparent) !important;
    border: 1px solid color-mix(in srgb, var(--line, rgba(148, 163, 184, .24)) 76%, transparent) !important;
    box-shadow: none !important;
  }

  .hbx-command-center {
    width: 100% !important;
    padding: 0 !important;
    margin: 0 !important;
  }

  .hbx-command-center::before,
  .hbx-command-center::after {
    display: none !important;
  }

  .hbx-command-center__body,
  .hbxp-carousel {
    width: 100%;
    height: 100%;
    min-width: 0;
  }

  .hbxp-panel {
    height: 100%;
    min-height: 64px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(240px, 360px) 54px;
    align-items: center;
    gap: 14px;
    padding: 10px 12px 10px 14px;
    border-radius: 16px;
    border: 1px solid color-mix(in srgb, var(--hbxp-tone-color, var(--brand, #10b981)) 18%, var(--line, rgba(148, 163, 184, .24)));
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--surface-raised, #fff) 90%, transparent), color-mix(in srgb, var(--surface-soft, #f8fafc) 82%, transparent)),
      linear-gradient(90deg, color-mix(in srgb, var(--hbxp-tone-color, var(--brand, #10b981)) 9%, transparent), transparent 56%);
    color: var(--foreground, #0f172a);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .58);
    overflow: hidden;
  }

  .hbxp-panel--clickable {
    cursor: pointer;
    transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease;
  }

  .hbxp-panel--clickable:hover,
  .hbxp-panel--clickable:focus-visible {
    transform: translateY(-1px);
    border-color: color-mix(in srgb, var(--hbxp-tone-color, var(--brand, #10b981)) 34%, var(--line, rgba(148, 163, 184, .24)));
    box-shadow: 0 18px 36px -30px color-mix(in srgb, var(--hbxp-tone-color, var(--brand, #10b981)) 54%, transparent);
    outline: none;
  }

  .hbxp-panel__copy {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .hbxp-panel__eyebrow {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .hbxp-panel__eyebrow span {
    min-width: 0;
    color: color-mix(in srgb, var(--hbxp-tone-color, var(--brand, #10b981)) 76%, var(--foreground, #0f172a));
    font-size: 10px;
    font-weight: 950;
    letter-spacing: .05em;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hbxp-panel__eyebrow button {
    height: 20px;
    min-width: 40px;
    border: 1px solid color-mix(in srgb, var(--hbxp-tone-color, var(--brand, #10b981)) 24%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--surface-raised, #fff) 72%, transparent);
    color: var(--muted, #64748b);
    font-size: 10px;
    font-weight: 900;
    cursor: pointer;
  }

  .hbxp-panel h2 {
    margin: 0;
    min-width: 0;
    color: var(--foreground, #0f172a);
    font-size: 20px;
    line-height: 1.08;
    font-weight: 950;
    letter-spacing: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hbxp-panel p {
    margin: 0;
    min-width: 0;
    color: var(--muted, #64748b);
    font-size: 12px;
    line-height: 1.25;
    font-weight: 750;
    letter-spacing: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hbxp-panel__metrics {
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .hbxp-metric {
    position: relative;
    min-width: 0;
    height: 48px;
    display: grid;
    align-content: center;
    gap: 2px;
    padding: 7px 8px;
    border-radius: 13px;
    border: 1px solid color-mix(in srgb, var(--hbxp-tone-color, var(--brand, #10b981)) 18%, var(--line, rgba(148, 163, 184, .24)));
    background: color-mix(in srgb, var(--surface-raised, #fff) 66%, transparent);
    overflow: hidden;
  }

  .hbxp-metric small {
    color: var(--muted, #64748b);
    font-size: 9px;
    line-height: 1;
    font-weight: 900;
    letter-spacing: .04em;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hbxp-metric strong {
    color: var(--foreground, #0f172a);
    font-size: 16px;
    line-height: 1;
    font-weight: 950;
    letter-spacing: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hbxp-metric i {
    position: absolute;
    left: 8px;
    right: 8px;
    bottom: 5px;
    height: 3px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--line, rgba(148, 163, 184, .24)) 72%, transparent);
    overflow: hidden;
  }

  .hbxp-metric i::before {
    content: "";
    display: block;
    width: var(--hbxp-usage, 0%);
    height: 100%;
    border-radius: inherit;
    background: var(--hbxp-tone-color, var(--brand, #10b981));
  }

  .hbxp-ring,
  .hbxp-status-mark {
    justify-self: end;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: var(--foreground, #0f172a);
    background:
      radial-gradient(circle, color-mix(in srgb, var(--surface-raised, #fff) 94%, transparent) 54%, transparent 56%),
      conic-gradient(var(--hbxp-tone-color, var(--brand, #10b981)) var(--hbxp-progress, 100%), color-mix(in srgb, var(--line, rgba(148, 163, 184, .24)) 70%, transparent) 0);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--hbxp-tone-color, var(--brand, #10b981)) 16%, transparent);
  }

  .hbxp-ring strong {
    font-size: 13px;
    font-weight: 950;
    letter-spacing: 0;
  }

  .hbxp-status-mark {
    width: 14px;
    height: 14px;
    margin-right: 16px;
    background: var(--hbxp-tone-color, var(--brand, #10b981));
    box-shadow: 0 0 0 7px color-mix(in srgb, var(--hbxp-tone-color, var(--brand, #10b981)) 12%, transparent);
  }

  .hbxp-tone-success {
    --hbxp-tone-color: var(--success, var(--brand, #10b981));
  }

  .hbxp-tone-warning {
    --hbxp-tone-color: var(--warning, #f59e0b);
  }

  .hbxp-tone-danger {
    --hbxp-tone-color: var(--danger, #ef4444);
  }

  .hbxp-tone-loading {
    --hbxp-tone-color: var(--info, var(--button-accent, #0ea5e9));
  }

  .hbxp-tone-neutral {
    --hbxp-tone-color: var(--brand, #10b981);
  }

  html[data-theme-mode="dark"] .app-topbar__inner--controlCenter {
    background:
      linear-gradient(135deg, rgba(15, 23, 42, .96), rgba(19, 33, 54, .92)),
      linear-gradient(90deg, rgba(20, 184, 166, .09), rgba(96, 165, 250, .08)) !important;
    border-color: rgba(148, 163, 184, .22) !important;
  }

  html[data-theme-mode="dark"] .hbx-command-brand,
  html[data-theme-mode="dark"] .hbx-command-side,
  html[data-theme-mode="dark"] .hbxp-panel,
  html[data-theme-mode="dark"] .hbxp-metric {
    background-color: rgba(15, 23, 42, .58) !important;
    border-color: rgba(148, 163, 184, .18) !important;
  }

  html[data-theme-mode="dark"] .hbxp-panel h2,
  html[data-theme-mode="dark"] .hbxp-metric strong,
  html[data-theme-mode="dark"] .hbxp-ring {
    color: #f8fbff;
  }

  html[data-theme-mode="dark"] .hbxp-panel p,
  html[data-theme-mode="dark"] .hbxp-metric small {
    color: rgba(226, 232, 240, .7);
  }

  @media (max-width: 1180px) {
    .app-topbar__inner--controlCenter {
      grid-template-columns: minmax(160px, 210px) minmax(0, 1fr) !important;
    }

    .hbx-command-side {
      grid-column: 1 / -1;
    }

    .hbxp-panel {
      grid-template-columns: minmax(0, 1fr) minmax(210px, 320px) 48px;
    }
  }

  @media (max-width: 860px) {
    .app-topbar__inner--controlCenter {
      grid-template-columns: 1fr !important;
    }

    .hbxp-panel {
      grid-template-columns: minmax(0, 1fr);
      gap: 9px;
    }

    .hbxp-panel__metrics {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .hbxp-ring,
    .hbxp-status-mark {
      display: none;
    }
  }

  @media (max-width: 560px) {
    .hbxp-panel {
      padding: 10px;
    }

    .hbxp-panel h2 {
      font-size: 17px;
    }

    .hbxp-panel p {
      font-size: 11px;
    }

    .hbxp-panel__metrics {
      gap: 6px;
    }

    .hbxp-metric {
      height: 42px;
      padding: 6px;
    }

    .hbxp-metric strong {
      font-size: 14px;
    }
  }
`;
