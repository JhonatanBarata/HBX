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

  .app-topbar__frame {
    border-radius: 30px !important;
    border: 1px solid color-mix(in srgb, white 54%, var(--line, rgba(148, 163, 184, .3))) !important;
    background:
      linear-gradient(135deg, rgba(255, 255, 255, .54), rgba(232, 242, 255, .34) 48%, rgba(255, 255, 255, .48)),
      linear-gradient(180deg, rgba(255, 255, 255, .78), rgba(255, 255, 255, .28)) !important;
    -webkit-backdrop-filter: blur(34px) saturate(1.75) contrast(1.04) !important;
    backdrop-filter: blur(34px) saturate(1.75) contrast(1.04) !important;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, .92),
      inset 0 -1px 0 rgba(255, 255, 255, .32),
      0 1px 0 rgba(255, 255, 255, .78),
      0 28px 80px -48px rgba(15, 23, 42, .58),
      0 12px 28px -24px color-mix(in srgb, var(--brand, #10b981) 42%, transparent) !important;
    overflow: hidden !important;
  }

  .app-topbar__frame::before {
    content: "";
    position: absolute;
    inset: 1px;
    border-radius: 28px;
    pointer-events: none;
    background:
      linear-gradient(110deg, rgba(255,255,255,.68), transparent 18% 72%, rgba(255,255,255,.48)),
      linear-gradient(180deg, rgba(255,255,255,.44), transparent 42%);
    opacity: .72;
    mix-blend-mode: screen;
    z-index: 0;
  }

  .app-topbar__frame::after {
    content: "";
    position: absolute;
    left: 18px;
    right: 18px;
    top: 7px;
    height: 1px;
    border-radius: 999px;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,.95), transparent);
    opacity: .82;
    pointer-events: none;
    z-index: 2;
  }

  .app-topbar__inner--controlCenter {
    position: relative !important;
    z-index: 1 !important;
    min-height: 92px !important;
    grid-template-columns: minmax(220px, 288px) minmax(0, 1fr) minmax(230px, 296px) !important;
    gap: 0 !important;
    padding: 10px 12px !important;
    border: 0 !important;
    border-radius: 28px !important;
    background: transparent !important;
    box-shadow: none !important;
    overflow: visible !important;
  }

  .hbx-command-brand,
  .hbx-command-side,
  .hbxp-panel {
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  .hbx-command-brand {
    grid-template-columns: 54px minmax(0, 1fr) !important;
    min-height: 72px !important;
    padding: 9px 20px 9px 10px !important;
    border-radius: 24px 0 0 24px !important;
    position: relative !important;
  }

  .hbx-command-brand::after,
  .hbx-command-center::after {
    content: "";
    position: absolute;
    top: 14px;
    bottom: 14px;
    right: 0;
    width: 1px;
    background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--brand, #10b981) 22%, rgba(15, 23, 42, .16)), transparent);
    opacity: .85;
    pointer-events: none;
  }

  .hbx-command-brand__mark {
    width: 54px !important;
    height: 54px !important;
    border-radius: 50% !important;
    background:
      linear-gradient(145deg, rgba(255,255,255,.22), transparent 34%),
      linear-gradient(135deg, color-mix(in srgb, var(--brand, #10b981) 92%, #001b23), color-mix(in srgb, var(--brand-solid, #020617) 82%, #0f766e)) !important;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.42),
      inset 0 -12px 20px rgba(0,0,0,.22),
      0 16px 30px -22px color-mix(in srgb, var(--brand, #10b981) 72%, black) !important;
  }

  .hbx-command-brand__mark span {
    inset: 7px !important;
    border-radius: 50% !important;
    border-color: rgba(255,255,255,.26) !important;
  }

  .hbx-command-brand__copy strong {
    font-size: 16px !important;
    letter-spacing: 0 !important;
    text-shadow: 0 1px 0 rgba(255,255,255,.44);
  }

  .hbx-command-brand__copy span {
    color: color-mix(in srgb, var(--muted, #64748b) 78%, var(--brand, #10b981)) !important;
    font-size: 10px !important;
    letter-spacing: .06em !important;
  }

  .hbx-command-center {
    min-height: 72px !important;
    padding: 0 20px !important;
    position: relative !important;
  }

  .hbxp-panel {
    min-height: 72px !important;
    grid-template-columns: minmax(0, 1fr) minmax(238px, 372px) 54px !important;
    gap: 14px !important;
    padding: 8px 2px !important;
    color: var(--foreground, #0f172a) !important;
    overflow: visible !important;
  }

  .hbxp-panel__eyebrow span {
    color: color-mix(in srgb, var(--hbxp-tone-color, var(--brand, #10b981)) 78%, var(--foreground, #0f172a)) !important;
    text-shadow: 0 1px 0 rgba(255,255,255,.5);
  }

  .hbxp-panel h2 {
    font-size: clamp(18px, 1.45vw, 22px) !important;
    line-height: 1.05 !important;
    letter-spacing: 0 !important;
    text-shadow: 0 1px 0 rgba(255,255,255,.58);
  }

  .hbxp-panel p {
    max-width: 540px;
    color: color-mix(in srgb, var(--muted, #64748b) 90%, var(--foreground, #0f172a)) !important;
    font-weight: 760 !important;
  }

  .hbxp-metric,
  .hbxp-panel__eyebrow button,
  .theme-switcher__trigger,
  .hbx-control-user__trigger,
  .hbx-control-logout,
  .hbx-control-vitals span {
    border: 1px solid rgba(255, 255, 255, .54) !important;
    background:
      linear-gradient(180deg, rgba(255,255,255,.54), rgba(255,255,255,.22)) !important;
    -webkit-backdrop-filter: blur(18px) saturate(1.55) !important;
    backdrop-filter: blur(18px) saturate(1.55) !important;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.84),
      inset 0 -1px 0 rgba(255,255,255,.2),
      0 10px 24px -22px rgba(15,23,42,.55) !important;
  }

  .hbxp-metric {
    height: 50px !important;
    border-radius: 16px !important;
    padding: 8px 10px !important;
  }

  .hbxp-metric::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(120deg, color-mix(in srgb, var(--hbxp-tone-color, var(--brand, #10b981)) 12%, transparent), transparent 62%);
    opacity: .66;
    pointer-events: none;
  }

  .hbxp-metric > * {
    position: relative;
    z-index: 1;
  }

  .hbxp-ring {
    width: 56px !important;
    height: 56px !important;
    background:
      radial-gradient(circle, rgba(255,255,255,.78) 52%, transparent 54%),
      conic-gradient(var(--hbxp-tone-color, var(--brand, #10b981)) var(--hbxp-progress, 100%), rgba(148,163,184,.24) 0) !important;
    -webkit-backdrop-filter: blur(16px) saturate(1.5) !important;
    backdrop-filter: blur(16px) saturate(1.5) !important;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.82),
      0 10px 24px -20px color-mix(in srgb, var(--hbxp-tone-color, var(--brand, #10b981)) 62%, transparent) !important;
  }

  .hbx-command-side {
    min-height: 72px !important;
    align-self: stretch !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    grid-auto-rows: min-content !important;
    align-content: center !important;
    gap: 8px !important;
    padding: 8px 10px 8px 20px !important;
    border-radius: 0 24px 24px 0 !important;
  }

  .hbx-control-accountRow {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    gap: 8px !important;
  }

  .theme-switcher__trigger,
  .hbx-control-user__trigger,
  .hbx-control-logout {
    min-height: 46px !important;
    border-radius: 18px !important;
  }

  .hbx-control-logout {
    width: 46px !important;
    min-width: 46px !important;
    padding: 0 !important;
    display: grid !important;
    place-items: center !important;
    font-size: 0 !important;
  }

  .hbx-control-logout span {
    font-size: 18px !important;
  }

  .app-user__avatar {
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.42),
      0 0 0 3px rgba(255,255,255,.48) !important;
  }

  html[data-theme-mode="dark"] .app-topbar__frame {
    border-color: rgba(255,255,255,.14) !important;
    background:
      linear-gradient(135deg, rgba(15, 23, 42, .58), rgba(30, 41, 59, .34) 46%, rgba(8, 13, 24, .54)),
      linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,.04)) !important;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.18),
      inset 0 -1px 0 rgba(255,255,255,.06),
      0 30px 86px -52px rgba(0,0,0,.82),
      0 12px 30px -24px color-mix(in srgb, var(--brand, #10b981) 50%, transparent) !important;
  }

  html[data-theme-mode="dark"] .app-topbar__frame::before {
    background:
      linear-gradient(110deg, rgba(255,255,255,.12), transparent 22% 70%, rgba(255,255,255,.1)),
      linear-gradient(180deg, rgba(255,255,255,.1), transparent 42%);
    opacity: .82;
  }

  html[data-theme-mode="dark"] .hbxp-metric,
  html[data-theme-mode="dark"] .hbxp-panel__eyebrow button,
  html[data-theme-mode="dark"] .theme-switcher__trigger,
  html[data-theme-mode="dark"] .hbx-control-user__trigger,
  html[data-theme-mode="dark"] .hbx-control-logout,
  html[data-theme-mode="dark"] .hbx-control-vitals span {
    border-color: rgba(255,255,255,.12) !important;
    background:
      linear-gradient(180deg, rgba(255,255,255,.11), rgba(255,255,255,.045)) !important;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.16),
      0 12px 28px -22px rgba(0,0,0,.78) !important;
  }

  html[data-theme-mode="dark"] .hbx-command-brand__copy strong,
  html[data-theme-mode="dark"] .hbxp-panel h2,
  html[data-theme-mode="dark"] .hbxp-metric strong,
  html[data-theme-mode="dark"] .hbxp-ring {
    color: #f8fbff !important;
    text-shadow: 0 1px 0 rgba(0,0,0,.3);
  }

  html[data-theme-mode="dark"] .hbxp-ring {
    background:
      radial-gradient(circle, rgba(15,23,42,.84) 52%, transparent 54%),
      conic-gradient(var(--hbxp-tone-color, var(--brand, #10b981)) var(--hbxp-progress, 100%), rgba(148,163,184,.18) 0) !important;
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
