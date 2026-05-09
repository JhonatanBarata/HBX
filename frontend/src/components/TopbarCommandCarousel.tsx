"use client";

import React, { useEffect, useMemo, useState } from "react";

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

export type HbxTopbarTone = "success" | "warning" | "danger" | "neutral" | "loading";

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
  eyebrow: "STATUS OPERACIONAL",
  title: "Central HBX pronta",
  description: "Aguardando dados operacionais em tempo real.",
  phase: "idle",
  progress: 0,
  metrics: [
    { label: "Uso", value: "0%" },
    { label: "Fila", value: "0" },
    { label: "10 min", value: "0" },
  ],
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

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function getSlideTone(slide: HbxTopbarSlide): HbxTopbarTone {
  const phase = String(slide.phase || "").toLowerCase();
  const kind = String(slide.kind || "").toLowerCase();

  if (phase === "warning") return "warning";
  if (phase === "loading") return "loading";
  if (kind.includes("attention")) return "warning";
  if (kind.includes("whatsapp") && clampPercent(slide.progress) < 80) return "warning";
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

function getEngineState(engine: HbxTopbarEngine) {
  const status = String(engine.status || "").trim().toLowerCase();
  const pausedUntil = engine.pausedUntil ? new Date(engine.pausedUntil).getTime() : NaN;

  if (engine.manualPaused || status === "paused" || (Number.isFinite(pausedUntil) && pausedUntil > Date.now())) {
    return "paused";
  }

  if (engine.lastError || status === "offline" || engine.online === false) return "offline";
  if (status === "cooldown" || engine.cooldownUntil) return "cooldown";
  if (!engine.configured || status === "missing") return "missing";
  if (engine.active || engine.busy || status === "busy" || status === "running") return "running";
  if (status === "degraded") return "degraded";
  return "standby";
}

function getEngineTone(engine: HbxTopbarEngine): HbxTopbarTone {
  const state = getEngineState(engine);
  if (state === "running") return "success";
  if (state === "offline") return "danger";
  if (state === "paused" || state === "cooldown" || state === "missing" || state === "degraded") return "warning";
  return "neutral";
}

function getEngineLabel(engine: HbxTopbarEngine) {
  if (engine.shortLabel) return engine.shortLabel;
  if (engine.index !== null && engine.index !== undefined) return `M${Number(engine.index) + 1}`;
  const match = String(engine.label || engine.id).match(/(\d+)/);
  return match ? `M${match[1]}` : String(engine.label || engine.id || "M?");
}

function getEngineStateLabel(engine: HbxTopbarEngine) {
  const explicit = String(engine.stateLabel || "").trim();
  if (explicit) return explicit;

  const state = getEngineState(engine);
  if (state === "running") return "Rodando";
  if (state === "standby") return "Standby";
  if (state === "paused") return "Pausado";
  if (state === "offline") return "Offline";
  if (state === "cooldown") return "Cooldown";
  if (state === "missing") return "Sem config";
  if (state === "degraded") return "Degradado";
  return "Standby";
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function buildSparkPath(engine: HbxTopbarEngine) {
  const usage = clampPercent(engine.usagePercent ?? (engine.active ? 76 : 18));
  const seed = hashString(`${engine.id}:${engine.status}:${engine.index}`);
  const points = Array.from({ length: 18 }, (_, index) => {
    const wave = Math.sin((index + (seed % 11)) * 0.92) * 7;
    const pulse = ((seed >> (index % 8)) & 7) - 3;
    const activity = engine.active || engine.busy ? 11 : 4;
    const y = 30 - usage * 0.16 + wave + pulse - activity;
    return {
      x: Math.round((index / 17) * 100),
      y: Math.max(6, Math.min(42, Math.round(y))),
    };
  });

  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function getVisibleSlides(slides: HbxTopbarSlide[], engines: HbxTopbarEngine[], hasEngineCards = false) {
  const safeSlides = slides.length ? slides : [FALLBACK_SLIDE];
  const hasEngineSlide = safeSlides.some((slide) => String(slide.kind || "").toLowerCase() === "engines");

  if ((!engines.length && !hasEngineCards) || hasEngineSlide) return safeSlides;

  return [
    ...safeSlides,
    {
      id: "hbx-engine-fleet-auto",
      kind: "engines",
      eyebrow: "FROTA HBX",
      title: engines.length ? `${engines.length} motores em observação` : "Frota HBX em operação",
      description: "Mapa vivo da capacidade de prospecção e webscraping.",
      phase: engines.some((engine) => getEngineTone(engine) === "danger") ? "warning" : "success",
      progress: Math.round(
        engines.reduce((sum, engine) => sum + clampPercent(engine.usagePercent ?? (engine.active ? 72 : 12)), 0) /
          Math.max(1, engines.length),
      ),
      metrics: [
        { label: "Ativos", value: String(engines.filter((engine) => engine.active || engine.busy).length) },
        { label: "Standby", value: String(engines.filter((engine) => getEngineState(engine) === "standby").length) },
        { label: "Alertas", value: String(engines.filter((engine) => getEngineTone(engine) !== "success").length) },
      ],
    } satisfies HbxTopbarSlide,
  ];
}

function HbxMetricPill({ metric }: { metric: HbxTopbarMetric }) {
  const usage = typeof metric.usage === "number" ? clampPercent(metric.usage) : null;
  const tone = getMetricTone(metric);

  return (
    <div
      className={cx("hbxp-metric", `hbxp-tone-${tone}`)}
      title={[metric.label, metric.value, metric.detail].filter(Boolean).join(" • ")}
    >
      <span>{metric.label}</span>
      <strong>{metric.value}</strong>
      {metric.detail ? <small>{metric.detail}</small> : null}
      {usage !== null ? (
        <i className="hbxp-metric__bar" style={{ ["--hbxp-usage" as string]: `${usage}%` }} aria-hidden="true" />
      ) : null}
    </div>
  );
}

function HbxRewardProgress({ slide }: { slide: HbxTopbarSlide }) {
  const progress = clampPercent(slide.progress ?? 100);
  const filled = Math.max(1, Math.round((progress / 100) * 5));

  return (
    <div className="hbxp-reward" aria-label={`Progresso ${progress}%`}>
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} data-filled={index < filled ? "true" : "false"}>
          <strong>{index + 1}/5</strong>
        </span>
      ))}
    </div>
  );
}

function HbxProgressRing({ progress, tone }: { progress: number; tone: HbxTopbarTone }) {
  return (
    <div
      className={cx("hbxp-ring", `hbxp-tone-${tone}`)}
      style={{ ["--hbxp-progress" as string]: `${clampPercent(progress)}%` }}
      aria-label={`${clampPercent(progress)}%`}
    >
      <strong>{clampPercent(progress)}%</strong>
      <small>ATUAL</small>
    </div>
  );
}

function HbxGenericSlide({
  slide,
  onNavigate,
}: {
  slide: HbxTopbarSlide;
  onNavigate?: (href: string) => void;
}) {
  const tone = getSlideTone(slide);
  const progress = clampPercent(slide.progress ?? (tone === "success" ? 100 : 0));
  const metrics = Array.isArray(slide.metrics) ? slide.metrics.slice(0, 4) : [];
  const isReward = String(slide.kind || "").toLowerCase() === "nightfactoryreward";

  function handleCta() {
    if (!slide.href) return;
    onNavigate?.(slide.href);
  }

  return (
    <article className={cx("hbxp-slide-card", `hbxp-tone-${tone}`)}>
      <div className="hbxp-slide-card__sheen" aria-hidden="true" />
      <div className="hbxp-slide-card__main">
        <div className="hbxp-slide-card__copy">
          <div className="hbxp-slide-card__eyebrow">
            <span>{slide.eyebrow}</span>
            {slide.source ? <em>{slide.source}</em> : null}
          </div>

          <div className="hbxp-slide-card__titleRow">
            <h2 title={slide.title}>{slide.title}</h2>
            {slide.ctaLabel && slide.href ? (
              onNavigate ? (
                <button type="button" className="hbxp-cta" onClick={handleCta}>
                  {slide.ctaLabel}
                </button>
              ) : (
                <a className="hbxp-cta" href={slide.href}>
                  {slide.ctaLabel}
                </a>
              )
            ) : null}
          </div>

          {slide.description ? <p title={slide.description}>{slide.description}</p> : null}
        </div>

        <HbxProgressRing progress={progress} tone={tone} />
      </div>

      {isReward ? <HbxRewardProgress slide={slide} /> : null}

      {slide.steps?.length ? (
        <div className="hbxp-steps" aria-label="Etapas">
          {slide.steps.slice(0, 5).map((step, index) => (
            <span key={`${slide.id}-step-${index}`} data-active={index === slide.activeStepIndex ? "true" : "false"}>
              {step}
            </span>
          ))}
        </div>
      ) : null}

      {slide.cardFeed?.length ? (
        <div className="hbxp-card-feed" aria-label="Cards recentes">
          {slide.cardFeed.slice(0, 3).map((card) => (
            <span key={card.id} title={[card.title, card.meta, card.score].filter(Boolean).join(" • ")}>
              <strong>{card.title}</strong>
              {card.meta ? <small>{card.meta}</small> : null}
            </span>
          ))}
        </div>
      ) : null}

      <div className="hbxp-metrics" data-count={metrics.length}>
        {metrics.map((metric, index) => (
          <HbxMetricPill key={`${slide.id}-metric-${metric.label}-${index}`} metric={metric} />
        ))}
      </div>
    </article>
  );
}

function HbxEngineCard({ engine }: { engine: HbxTopbarEngine }) {
  const usage = clampPercent(engine.usagePercent ?? (engine.active ? 78 : 14));
  const tone = getEngineTone(engine);
  const state = getEngineState(engine);
  const detail = String(engine.detail || engine.lastError || "").trim();

  return (
    <article
      className={cx("hbxp-engine-card", `hbxp-tone-${tone}`)}
      data-active={state === "running" ? "true" : "false"}
      title={[engine.label, getEngineStateLabel(engine), detail].filter(Boolean).join(" • ")}
    >
      <header>
        <span>{getEngineLabel(engine)}</span>
        <b>{getEngineStateLabel(engine)}</b>
      </header>

      <div className="hbxp-engine-card__body">
        <div
          className="hbxp-engine-card__gauge"
          style={{ ["--hbxp-progress" as string]: `${usage}%` }}
          aria-label={`${usage}% de uso`}
        >
          <strong>{usage}</strong>
        </div>

        <svg className="hbxp-engine-card__spark" viewBox="0 0 100 48" role="img" aria-label="Atividade recente">
          <path d={buildSparkPath(engine)} />
        </svg>
      </div>

      <footer>
        <span>{engine.processedLast10Min ?? 0} / 10m</span>
        {engine.errorCount ? <strong>{engine.errorCount} erro(s)</strong> : <span>OK</span>}
      </footer>
    </article>
  );
}

function HbxEngineFleetSlide({ engines, slide, engineCards }: { engines: HbxTopbarEngine[]; slide: HbxTopbarSlide; engineCards?: React.ReactNode }) {
  const sortedEngines = useMemo(() => {
    return [...engines].sort((left, right) => {
      const a = left.index ?? 9999;
      const b = right.index ?? 9999;
      return a - b;
    });
  }, [engines]);

  const pages = useMemo(() => chunkArray(sortedEngines, 5), [sortedEngines]);
  const [pageIndex, setPageIndex] = useState(0);
  const safePageIndex = clampIndex(pageIndex, Math.max(1, pages.length));

  const activeCount = sortedEngines.filter((engine) => engine.active || engine.busy).length;
  const alertCount = sortedEngines.filter((engine) => getEngineTone(engine) !== "success" && getEngineState(engine) !== "standby").length;
  const avgUsage = sortedEngines.length
    ? Math.round(
        sortedEngines.reduce((sum, engine) => sum + clampPercent(engine.usagePercent ?? (engine.active ? 78 : 14)), 0) /
          sortedEngines.length,
      )
    : clampPercent(slide.progress);
  const shouldUseTopBarEngineCards = !sortedEngines.length && Boolean(engineCards);

  return (
    <article className="hbxp-slide-card hbxp-engine-fleet">
      <div className="hbxp-slide-card__sheen" aria-hidden="true" />

      <div className="hbxp-engine-fleet__head">
        <div>
          <div className="hbxp-slide-card__eyebrow">
            <span>{slide.eyebrow || "FROTA HBX"}</span>
            <em>
              {safePageIndex + 1}/{Math.max(1, pages.length)}
            </em>
          </div>
          <h2 title={slide.title}>{slide.title || `${sortedEngines.length} motores HBX`}</h2>
          {slide.description ? <p title={slide.description}>{slide.description}</p> : null}
        </div>

        <div className="hbxp-engine-fleet__kpis">
          <HbxMetricPill metric={{ label: "Ativos", value: String(activeCount), tone: activeCount ? "success" : "neutral" }} />
          <HbxMetricPill metric={{ label: "Alertas", value: String(alertCount), tone: alertCount ? "warning" : "success" }} />
          <HbxMetricPill metric={{ label: "Uso médio", value: `${avgUsage}%`, usage: avgUsage }} />
        </div>
      </div>

      <div className="hbxp-engine-fleet__viewport">
        {shouldUseTopBarEngineCards ? (
          <div className="hbxp-engine-fleet__legacy" aria-label="Motores HBX">
            {engineCards}
          </div>
        ) : (
          <div className="hbxp-engine-fleet__track" style={{ transform: `translate3d(-${safePageIndex * 100}%, 0, 0)` }}>
            {(pages.length ? pages : [[]]).map((page, index) => (
              <div className="hbxp-engine-fleet__page" key={`engine-page-${index}`}>
                {page.length ? (
                  page.map((engine) => <HbxEngineCard key={engine.id} engine={engine} />)
                ) : (
                  <div className="hbxp-engine-empty">Sem motores HBX carregados.</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {!shouldUseTopBarEngineCards && pages.length > 1 ? (
        <div className="hbxp-engine-fleet__pager">
          <button
            type="button"
            onClick={() => setPageIndex((current) => {
              const currentSafePage = clampIndex(current, Math.max(1, pages.length));
              return currentSafePage <= 0 ? pages.length - 1 : currentSafePage - 1;
            })}
            aria-label="Motores anteriores"
          >
            ‹
          </button>
          <span>
            Motores {safePageIndex * 5 + 1}-{Math.min(sortedEngines.length, safePageIndex * 5 + 5)}
          </span>
          <button
            type="button"
            onClick={() => setPageIndex((current) => {
              const currentSafePage = clampIndex(current, Math.max(1, pages.length));
              return currentSafePage >= pages.length - 1 ? 0 : currentSafePage + 1;
            })}
            aria-label="Próximos motores"
          >
            ›
          </button>
        </div>
      ) : null}
    </article>
  );
}

export default function TopbarCommandCarousel({
  slides,
  engines = [],
  engineCards,
  className,
  activeIndex,
  onIndexChange,
  onNavigate,
  autoRotateMs = 6500,
}: HbxTopbarCommandCarouselProps) {
  const visibleSlides = useMemo(() => getVisibleSlides(slides, engines, Boolean(engineCards)), [slides, engines, engineCards]);
  const [internalIndex, setInternalIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const isControlled = typeof activeIndex === "number";
  const currentIndex = clampIndex(isControlled ? Number(activeIndex) : internalIndex, visibleSlides.length);

  function goTo(nextIndex: number) {
    const safeNext = ((nextIndex % visibleSlides.length) + visibleSlides.length) % visibleSlides.length;
    if (!isControlled) setInternalIndex(safeNext);
    onIndexChange?.(safeNext);
  }

  useEffect(() => {
    if (!visibleSlides.length || currentIndex <= visibleSlides.length - 1) return;
    goTo(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSlides.length, currentIndex]);

  useEffect(() => {
    if (paused || visibleSlides.length <= 1 || autoRotateMs <= 0) return undefined;

    const interval = window.setInterval(() => {
      goTo(currentIndex + 1);
    }, autoRotateMs);

    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, visibleSlides.length, currentIndex, autoRotateMs, isControlled]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(currentIndex - 1);
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(currentIndex + 1);
    }
  }

  return (
    <section
      className={cx("hbxp-carousel", className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      aria-roledescription="carousel"
      aria-label="Central operacional HBX"
    >
      <style>{HBX_TOPBAR_COMMAND_CAROUSEL_CSS}</style>

      <div className="hbxp-carousel__viewport">
        <div className="hbxp-carousel__track" style={{ transform: `translate3d(-${currentIndex * 100}%, 0, 0)` }}>
          {visibleSlides.map((slide) => (
            <div className="hbxp-carousel__slide" key={slide.id} aria-hidden={slide.id !== visibleSlides[currentIndex]?.id}>
              {String(slide.kind || "").toLowerCase() === "engines" ? (
                <HbxEngineFleetSlide engines={engines} slide={slide} engineCards={engineCards} />
              ) : (
                <HbxGenericSlide slide={slide} onNavigate={onNavigate} />
              )}
            </div>
          ))}
        </div>
      </div>

      {visibleSlides.length > 1 ? (
        <>
          <button
            type="button"
            className="hbxp-carousel__nav hbxp-carousel__nav--prev"
            onClick={() => goTo(currentIndex - 1)}
            aria-label="Slide anterior"
          >
            ‹
          </button>
          <button
            type="button"
            className="hbxp-carousel__nav hbxp-carousel__nav--next"
            onClick={() => goTo(currentIndex + 1)}
            aria-label="Próximo slide"
          >
            ›
          </button>

          <div className="hbxp-carousel__dots" aria-label="Slides">
            {visibleSlides.map((slide, index) => (
              <button
                key={`${slide.id}-dot`}
                type="button"
                onClick={() => goTo(index)}
                data-active={index === currentIndex ? "true" : "false"}
                aria-label={`Ir para ${slide.eyebrow || slide.title}`}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

export const HBX_TOPBAR_COMMAND_CAROUSEL_CSS = `

  .hbx-command-carouselNav,
  .hbx-command-carouselNav--prev,
  .hbx-command-carouselNav--next {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }

  .app-topbar__inner--controlCenter {
    --hbxp-card-h: 100px;
    min-height: 100px !important;
    grid-template-columns: minmax(210px, 248px) minmax(0, 1fr) minmax(210px, 270px) !important;
    align-items: stretch !important;
    gap: 6px !important;
    padding-block: 0 !important;
  }

  .app-topbar__inner--controlCenter .hbx-command-center {
    width: 100% !important;
    min-width: 0 !important;
    max-width: none !important;
    height: var(--hbxp-card-h, 100px) !important;
    min-height: var(--hbxp-card-h, 100px) !important;
    max-height: var(--hbxp-card-h, 100px) !important;
    align-self: stretch !important;
    justify-self: stretch !important;
    display: grid !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 20px !important;
    background: transparent !important;
    box-shadow: none !important;
    overflow: visible !important;
  }

  .app-topbar__inner--controlCenter .hbx-command-center__body {
    width: 100% !important;
    min-width: 0 !important;
    height: var(--hbxp-card-h, 100px) !important;
    min-height: var(--hbxp-card-h, 100px) !important;
    max-height: var(--hbxp-card-h, 100px) !important;
    display: grid !important;
    align-items: stretch !important;
    justify-items: stretch !important;
    padding: 0 !important;
    margin: 0 !important;
    overflow: visible !important;
  }

  .hbxp-carousel {
    --hbxp-safe-x: 38px;
    position: relative;
    width: 100%;
    max-width: none;
    height: var(--hbxp-card-h, 100px);
    min-height: var(--hbxp-card-h, 100px);
    max-height: var(--hbxp-card-h, 100px);
    border-radius: 20px;
    border: 1px solid color-mix(in srgb, var(--brand, #10b981) 38%, var(--line, rgba(148, 163, 184, .24)));
    background:
      radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--selection-accent, var(--brand, #10b981)) 24%, transparent), transparent 34%),
      radial-gradient(circle at 82% 8%, color-mix(in srgb, var(--button-accent, #0ea5e9) 22%, transparent), transparent 32%),
      radial-gradient(circle at 58% 110%, color-mix(in srgb, var(--warning, #f59e0b) 12%, transparent), transparent 38%),
      linear-gradient(135deg, color-mix(in srgb, var(--header-surface, var(--surface, #fff)) 96%, transparent), color-mix(in srgb, var(--surface-soft, #f8fafc) 98%, transparent));
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, var(--surface-raised, #fff) 82%, transparent),
      0 0 0 1px color-mix(in srgb, var(--brand, #10b981) 14%, transparent),
      0 18px 42px -28px color-mix(in srgb, var(--brand, #10b981) 42%, transparent),
      var(--shadow-sm, 0 18px 42px -24px rgba(15, 23, 42, .26));
    overflow: hidden;
    isolation: isolate;
    outline: none;
  }

  .hbxp-carousel:focus-visible {
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, var(--surface-raised, #fff) 82%, transparent),
      0 0 0 3px color-mix(in srgb, var(--brand, #10b981) 20%, transparent),
      var(--shadow-md, 0 30px 72px -32px rgba(15, 23, 42, .38));
  }

  html[data-theme-mode="dark"] .hbxp-carousel {
    border-color: rgba(59, 130, 246, .34);
    background:
      radial-gradient(circle at 6% 0%, rgba(34, 197, 94, .26), transparent 32%),
      radial-gradient(circle at 86% 8%, rgba(14, 165, 233, .24), transparent 31%),
      radial-gradient(circle at 56% 112%, rgba(245, 158, 11, .13), transparent 38%),
      linear-gradient(135deg, rgba(6, 18, 40, .98), rgba(8, 25, 55, .96));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, .09),
      0 0 0 1px rgba(34, 197, 94, .14),
      0 18px 46px -28px rgba(34, 197, 94, .46),
      0 22px 62px -42px rgba(14, 165, 233, .52);
  }

  .hbxp-carousel::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      linear-gradient(90deg, color-mix(in srgb, var(--surface-raised, #fff) 58%, transparent), transparent 18%, transparent 82%, color-mix(in srgb, var(--surface-raised, #fff) 52%, transparent)),
      repeating-linear-gradient(90deg, color-mix(in srgb, var(--foreground, #0f172a) 5%, transparent) 0 1px, transparent 1px 32px);
    opacity: .42;
    z-index: 2;
  }

  html[data-theme-mode="dark"] .hbxp-carousel::before {
    background:
      linear-gradient(90deg, rgba(255, 255, 255, .08), transparent 17%, transparent 83%, rgba(255, 255, 255, .07)),
      repeating-linear-gradient(90deg, rgba(125, 211, 252, .045) 0 1px, transparent 1px 32px);
    opacity: .78;
  }

  .hbxp-carousel__viewport {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: inherit;
    z-index: 3;
  }

  .hbxp-carousel__track {
    display: flex;
    width: 100%;
    height: 100%;
    will-change: transform;
    transition: transform 520ms cubic-bezier(.22, .72, .18, 1);
  }

  .hbxp-carousel__slide {
    min-width: 100%;
    width: 100%;
    height: 100%;
    display: grid;
    padding: 0 var(--hbxp-safe-x);
    box-sizing: border-box;
  }

  .hbxp-slide-card {
    position: relative;
    height: 100%;
    min-width: 0;
    display: grid;
    grid-template-rows: minmax(0, auto) auto;
    gap: 6px;
    padding: 7px 12px 8px;
    border-radius: 18px;
    border: 1px solid color-mix(in srgb, var(--hbxp-tone-color, var(--brand, #10b981)) 20%, var(--line, rgba(148, 163, 184, .24)));
    background:
      radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--hbxp-tone-color, var(--brand, #10b981)) 16%, transparent), transparent 34%),
      radial-gradient(circle at 98% 10%, color-mix(in srgb, var(--button-accent, #0ea5e9) 11%, transparent), transparent 28%),
      linear-gradient(180deg, color-mix(in srgb, var(--surface-raised, #fff) 92%, transparent), color-mix(in srgb, var(--surface, #fff) 88%, transparent));
    box-shadow: var(--shadow-xs, 0 12px 24px -18px rgba(15, 23, 42, .22));
    overflow: hidden;
  }

  html[data-theme-mode="dark"] .hbxp-slide-card {
    border-color: color-mix(in srgb, var(--hbxp-tone-color, #22c55e) 32%, rgba(96, 165, 250, .26));
    background:
      radial-gradient(circle at 1% 0%, color-mix(in srgb, var(--hbxp-tone-color, #22c55e) 24%, transparent), transparent 32%),
      radial-gradient(circle at 98% 10%, rgba(56, 189, 248, .16), transparent 30%),
      linear-gradient(180deg, rgba(13, 31, 65, .72), rgba(8, 20, 43, .82));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, .07),
      0 14px 30px -24px color-mix(in srgb, var(--hbxp-tone-color, #22c55e) 56%, transparent);
  }

  .hbxp-slide-card__sheen {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(110deg, transparent 0%, color-mix(in srgb, var(--surface-raised, #fff) 42%, transparent) 42%, transparent 58%);
    transform: translateX(-118%);
    opacity: .32;
    animation: hbxp-sheen 7s ease-in-out infinite;
  }

  .hbxp-slide-card__main {
    position: relative;
    z-index: 2;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 54px;
    align-items: center;
    gap: 12px;
    min-height: 42px;
  }

  .hbxp-slide-card__copy {
    min-width: 0;
  }

  .hbxp-slide-card__eyebrow {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    margin-bottom: 2px;
  }

  .hbxp-slide-card__eyebrow span {
    display: inline-flex;
    align-items: center;
    min-width: 0;
    max-width: 64%;
    padding: 3px 8px;
    border-radius: 999px;
    color: color-mix(in srgb, var(--brand, #10b981) 74%, var(--foreground, #0f172a));
    background: color-mix(in srgb, var(--brand, #10b981) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--brand, #10b981) 18%, transparent);
    font-size: 9px;
    font-weight: 950;
    letter-spacing: 0;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  html[data-theme-mode="dark"] .hbxp-slide-card__eyebrow span {
    color: color-mix(in srgb, var(--hbxp-tone-color, #22c55e) 82%, #eaf2ff);
    background: color-mix(in srgb, var(--hbxp-tone-color, #22c55e) 17%, transparent);
    border-color: color-mix(in srgb, var(--hbxp-tone-color, #22c55e) 24%, transparent);
    text-shadow: 0 0 16px color-mix(in srgb, var(--hbxp-tone-color, #22c55e) 30%, transparent);
  }

  .hbxp-slide-card__eyebrow em {
    min-width: 0;
    color: var(--muted, #64748b);
    font-size: 9px;
    font-style: normal;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hbxp-slide-card__titleRow {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .hbxp-slide-card h2,
  .hbxp-engine-fleet h2 {
    margin: 0;
    min-width: 0;
    color: var(--foreground, #0f172a);
    font-size: 20px;
    font-weight: 950;
    letter-spacing: 0;
    line-height: 1.04;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  html[data-theme-mode="dark"] .hbxp-slide-card h2,
  html[data-theme-mode="dark"] .hbxp-engine-fleet h2 {
    color: #f8fbff;
    text-shadow: 0 0 18px rgba(125, 211, 252, .18);
  }

  .hbxp-slide-card p,
  .hbxp-engine-fleet p {
    margin: 3px 0 0;
    min-width: 0;
    color: var(--foreground-soft, #475569);
    font-size: 11.5px;
    font-weight: 680;
    letter-spacing: 0;
    line-height: 1.25;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  html[data-theme-mode="dark"] .hbxp-slide-card p,
  html[data-theme-mode="dark"] .hbxp-engine-fleet p {
    color: rgba(221, 232, 255, .78);
  }

  .hbxp-cta {
    flex: 0 0 178px;
    width: 178px;
    max-width: 178px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 30px;
    padding: 0 13px;
    border: 0;
    border-radius: 999px;
    color: var(--brand-contrast, #fff);
    background:
      radial-gradient(circle at 22% 15%, rgba(255, 255, 255, .34), transparent 30%),
      linear-gradient(135deg, color-mix(in srgb, var(--brand, #10b981) 88%, var(--foreground, #0f172a)), color-mix(in srgb, var(--button-accent, #0ea5e9) 76%, var(--brand, #10b981)));
    box-shadow: 0 14px 24px -18px color-mix(in srgb, var(--brand, #10b981) 55%, transparent);
    font-size: 10px;
    font-weight: 950;
    letter-spacing: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    text-decoration: none;
  }

  .hbxp-cta:hover {
    transform: translateY(-1px);
    box-shadow: 0 18px 34px -18px color-mix(in srgb, var(--brand, #10b981) 70%, transparent);
  }

  .hbxp-ring,
  .hbxp-engine-card__gauge {
    --hbxp-progress: 0%;
    position: relative;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background:
      conic-gradient(var(--hbxp-tone-color, var(--brand, #10b981)) var(--hbxp-progress), color-mix(in srgb, var(--line, rgba(148, 163, 184, .24)) 82%, transparent) 0),
      color-mix(in srgb, var(--surface, #fff) 90%, transparent);
    box-shadow:
      inset 0 0 0 8px color-mix(in srgb, var(--surface-raised, #fff) 96%, transparent),
      0 12px 22px -17px color-mix(in srgb, var(--hbxp-tone-color, var(--brand, #10b981)) 50%, transparent);
  }

  .hbxp-ring {
    width: 52px;
    height: 52px;
    grid-template-rows: 1fr auto;
    align-content: center;
  }

  .hbxp-ring strong {
    position: relative;
    z-index: 1;
    color: var(--foreground, #0f172a);
    font-size: 13px;
    font-weight: 950;
    letter-spacing: 0;
    line-height: 1;
  }

  .hbxp-ring small {
    position: relative;
    z-index: 1;
    margin-top: -10px;
    color: var(--muted, #64748b);
    font-size: 6px;
    font-weight: 950;
    letter-spacing: 0;
    line-height: 1;
  }

  html[data-theme-mode="dark"] .hbxp-ring strong {
    color: #f8fbff;
  }

  html[data-theme-mode="dark"] .hbxp-ring small {
    color: rgba(221, 232, 255, .68);
  }

  .hbxp-metrics {
    position: relative;
    z-index: 2;
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    align-items: stretch;
  }

  .hbxp-metrics[data-count="1"] {
    grid-template-columns: minmax(0, 1fr);
  }

  .hbxp-metrics[data-count="2"] {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .hbxp-metrics[data-count="4"],
  .hbxp-metrics[data-count="5"],
  .hbxp-metrics[data-count="6"],
  .hbxp-metrics[data-count="7"] {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .hbxp-metric {
    position: relative;
    min-width: 0;
    min-height: 30px;
    display: grid;
    align-content: center;
    gap: 1px;
    padding: 4px 8px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--hbxp-tone-color, var(--brand, #10b981)) 16%, var(--line, rgba(148, 163, 184, .22)));
    background: color-mix(in srgb, var(--surface-raised, #fff) 68%, transparent);
    overflow: hidden;
  }

  html[data-theme-mode="dark"] .hbxp-metric {
    border-color: color-mix(in srgb, var(--hbxp-tone-color, #22c55e) 24%, rgba(96, 165, 250, .22));
    background: rgba(16, 36, 72, .58);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, .055),
      0 10px 18px -18px color-mix(in srgb, var(--hbxp-tone-color, #22c55e) 55%, transparent);
  }

  .hbxp-metric span {
    min-width: 0;
    color: var(--muted, #64748b);
    font-size: 8px;
    font-weight: 950;
    letter-spacing: 0;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hbxp-metric strong {
    min-width: 0;
    color: var(--foreground, #0f172a);
    font-size: 12px;
    font-weight: 950;
    letter-spacing: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  html[data-theme-mode="dark"] .hbxp-metric span {
    color: rgba(221, 232, 255, .62);
  }

  html[data-theme-mode="dark"] .hbxp-metric strong {
    color: #f8fbff;
  }

  .hbxp-metric small {
    min-width: 0;
    color: var(--foreground-soft, #475569);
    font-size: 9px;
    font-weight: 750;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  html[data-theme-mode="dark"] .hbxp-metric small {
    color: rgba(221, 232, 255, .7);
  }

  .hbxp-metric__bar {
    position: absolute;
    left: 8px;
    right: 8px;
    bottom: 4px;
    height: 3px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--line, rgba(148, 163, 184, .24)) 72%, transparent);
    overflow: hidden;
  }

  .hbxp-metric__bar::before {
    content: "";
    display: block;
    width: var(--hbxp-usage, 0%);
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, color-mix(in srgb, var(--hbxp-tone-color, var(--brand, #10b981)) 82%, transparent), var(--hbxp-tone-color, var(--brand, #10b981)));
  }

  .hbxp-reward {
    position: relative;
    z-index: 2;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
    margin-top: -1px;
  }

  .hbxp-reward span {
    height: 18px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--brand, #10b981) 22%, transparent);
    background: color-mix(in srgb, var(--surface-raised, #fff) 66%, transparent);
    overflow: hidden;
    position: relative;
  }

  .hbxp-reward strong {
    position: relative;
    z-index: 2;
    color: var(--foreground, #0f172a);
    font-size: 9px;
    font-weight: 950;
    letter-spacing: 0;
    line-height: 1;
  }

  .hbxp-reward span[data-filled="true"]::before {
    content: "";
    position: absolute;
    inset: 2px;
    border-radius: inherit;
    background:
      linear-gradient(90deg, color-mix(in srgb, var(--success, var(--brand, #10b981)) 88%, transparent), color-mix(in srgb, var(--brand, #10b981) 86%, var(--button-accent, #0ea5e9))),
      radial-gradient(circle at 20% 50%, rgba(255,255,255,.55), transparent 28%);
    box-shadow: 0 0 18px color-mix(in srgb, var(--brand, #10b981) 22%, transparent);
  }

  html[data-theme-mode="dark"] .hbxp-reward span {
    border-color: rgba(34, 197, 94, .34);
    background: rgba(14, 35, 66, .74);
  }

  html[data-theme-mode="dark"] .hbxp-reward strong {
    color: #f8fbff;
    text-shadow: 0 0 10px rgba(34, 197, 94, .42);
  }

  .hbxp-steps,
  .hbxp-card-feed {
    position: relative;
    z-index: 2;
    display: flex;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
  }

  .hbxp-steps span,
  .hbxp-card-feed span {
    min-width: 0;
    flex: 1 1 0;
    padding: 5px 7px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--line, rgba(148, 163, 184, .24)) 82%, transparent);
    background: color-mix(in srgb, var(--surface-raised, #fff) 58%, transparent);
    color: var(--foreground-soft, #475569);
    font-size: 9px;
    font-weight: 850;
    letter-spacing: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  html[data-theme-mode="dark"] .hbxp-steps span,
  html[data-theme-mode="dark"] .hbxp-card-feed span {
    border-color: rgba(96, 165, 250, .2);
    background: rgba(16, 36, 72, .52);
    color: rgba(221, 232, 255, .75);
  }

  .hbxp-steps span[data-active="true"] {
    color: color-mix(in srgb, var(--brand, #10b981) 76%, var(--foreground, #0f172a));
    border-color: color-mix(in srgb, var(--brand, #10b981) 26%, transparent);
    background: color-mix(in srgb, var(--brand, #10b981) 10%, transparent);
  }

  .hbxp-card-feed strong,
  .hbxp-card-feed small {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hbxp-card-feed strong {
    color: var(--foreground, #0f172a);
    font-size: 9px;
    font-weight: 950;
    letter-spacing: 0;
  }

  .hbxp-card-feed small {
    color: var(--muted, #64748b);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0;
  }

  html[data-theme-mode="dark"] .hbxp-card-feed strong {
    color: #f8fbff;
  }

  html[data-theme-mode="dark"] .hbxp-card-feed small {
    color: rgba(221, 232, 255, .62);
  }

  .hbxp-engine-fleet {
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 5px;
  }

  .hbxp-engine-fleet__head {
    position: relative;
    z-index: 2;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(170px, 244px);
    gap: 9px;
    align-items: start;
  }

  .hbxp-engine-fleet__kpis {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }

  .hbxp-engine-fleet__viewport {
    position: relative;
    z-index: 2;
    min-height: 0;
    overflow: hidden;
    border-radius: 16px;
  }


  .hbxp-engine-fleet__legacy {
    min-height: 42px;
    display: grid;
    align-items: stretch;
    overflow: hidden;
  }

  .hbxp-engine-fleet__legacy .hbx-command-engines,
  .hbxp-engine-fleet__legacy .hbx-command-engines--billboard {
    display: grid !important;
    grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
    gap: 7px !important;
    width: 100% !important;
    min-width: 0 !important;
    overflow: hidden !important;
  }

  .hbxp-engine-fleet__legacy * {
    min-width: 0;
  }

  .hbxp-engine-fleet__legacy .hbx-command-engine {
    height: 42px !important;
    min-height: 42px !important;
    display: grid !important;
    grid-template-rows: auto minmax(0, 1fr) !important;
    gap: 1px !important;
    padding: 4px 6px !important;
    border-radius: 12px !important;
    overflow: hidden !important;
  }

  .hbxp-engine-fleet__legacy .hbx-command-engine__top {
    align-items: center !important;
    gap: 4px !important;
  }

  .hbxp-engine-fleet__legacy .hbx-command-engine__range,
  .hbxp-engine-fleet__legacy .hbx-command-engine__dots {
    display: none !important;
  }

  .hbxp-engine-fleet__legacy .hbx-command-engine__top strong {
    margin: 0 !important;
    font-size: 13px !important;
    line-height: 1 !important;
    letter-spacing: 0 !important;
  }

  .hbxp-engine-fleet__legacy .hbx-command-engine__top > span:last-child {
    max-width: 64px !important;
    min-height: 16px !important;
    padding: 0 5px !important;
    font-size: 7px !important;
    letter-spacing: 0 !important;
  }

  .hbxp-engine-fleet__legacy .hbx-command-engine__mid {
    min-height: 0 !important;
    grid-template-columns: 28px minmax(0, 1fr) !important;
    gap: 5px !important;
    align-items: center !important;
  }

  .hbxp-engine-fleet__legacy .hbx-command-engine__gauge {
    width: 26px !important;
    height: 26px !important;
  }

  .hbxp-engine-fleet__legacy .hbx-command-engine__gauge b {
    font-size: 8px !important;
    letter-spacing: 0 !important;
  }

  .hbxp-engine-fleet__legacy .hbx-command-engine__gauge small {
    display: none !important;
  }

  .hbxp-engine-fleet__legacy .hbx-command-engine__bars {
    height: 20px !important;
    padding: 0 !important;
  }

  .hbxp-engine-fleet__track {
    display: flex;
    height: 100%;
    transition: transform 460ms cubic-bezier(.22, .72, .18, 1);
  }

  .hbxp-engine-fleet__page {
    min-width: 100%;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 7px;
  }

  .hbxp-engine-card {
    min-width: 0;
    height: 44px;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 1px;
    padding: 4px 6px;
    border-radius: 16px;
    border: 1px solid color-mix(in srgb, var(--hbxp-tone-color, var(--brand, #10b981)) 18%, var(--line, rgba(148, 163, 184, .22)));
    background:
      radial-gradient(circle at 10% 0%, color-mix(in srgb, var(--hbxp-tone-color, var(--brand, #10b981)) 14%, transparent), transparent 34%),
      color-mix(in srgb, var(--surface-raised, #fff) 62%, transparent);
    overflow: hidden;
  }

  .hbxp-engine-card[data-active="true"] {
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--hbxp-tone-color, var(--brand, #10b981)) 12%, transparent),
      0 14px 24px -22px color-mix(in srgb, var(--hbxp-tone-color, var(--brand, #10b981)) 70%, transparent);
    animation: hbxp-engine-pulse 2.5s ease-in-out infinite;
  }

  .hbxp-engine-card header,
  .hbxp-engine-card footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    min-width: 0;
  }

  .hbxp-engine-card header span {
    color: var(--foreground, #0f172a);
    font-size: 12px;
    font-weight: 950;
    letter-spacing: 0;
  }

  .hbxp-engine-card header b {
    min-width: 0;
    max-width: 72px;
    padding: 2px 5px;
    border-radius: 999px;
    color: color-mix(in srgb, var(--hbxp-tone-color, var(--brand, #10b981)) 76%, var(--foreground, #0f172a));
    background: color-mix(in srgb, var(--hbxp-tone-color, var(--brand, #10b981)) 11%, transparent);
    font-size: 7px;
    font-weight: 950;
    text-transform: uppercase;
    letter-spacing: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hbxp-engine-card__body {
    min-width: 0;
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    gap: 4px;
    align-items: center;
  }

  .hbxp-engine-card__gauge {
    width: 26px;
    height: 26px;
    box-shadow:
      inset 0 0 0 5px color-mix(in srgb, var(--surface-raised, #fff) 96%, transparent),
      0 8px 16px -14px color-mix(in srgb, var(--hbxp-tone-color, var(--brand, #10b981)) 50%, transparent);
  }

  .hbxp-engine-card__gauge strong {
    color: var(--foreground, #0f172a);
    font-size: 8px;
    font-weight: 950;
  }

  .hbxp-engine-card__spark {
    width: 100%;
    height: 20px;
    color: var(--hbxp-tone-color, var(--brand, #10b981));
    opacity: .78;
  }

  .hbxp-engine-card__spark path {
    fill: none;
    stroke: currentColor;
    stroke-width: 3.2;
    stroke-linecap: round;
    stroke-linejoin: round;
    filter: drop-shadow(0 4px 6px color-mix(in srgb, currentColor 18%, transparent));
  }

  .hbxp-engine-card footer span,
  .hbxp-engine-card footer strong {
    min-width: 0;
    color: var(--muted, #64748b);
    font-size: 7px;
    font-weight: 850;
    letter-spacing: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  html[data-theme-mode="dark"] .hbxp-engine-card header span,
  html[data-theme-mode="dark"] .hbxp-engine-card__gauge strong {
    color: #f8fbff;
  }

  html[data-theme-mode="dark"] .hbxp-engine-card footer span {
    color: rgba(221, 232, 255, .62);
  }

  .hbxp-engine-card footer strong {
    color: color-mix(in srgb, var(--danger, #ef4444) 75%, var(--foreground, #0f172a));
  }

  .hbxp-engine-fleet__pager {
    position: relative;
    z-index: 2;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 6px;
    min-height: 10px;
  }

  .hbxp-engine-fleet__pager button,
  .hbxp-carousel__nav,
  .hbxp-carousel__dots button {
    border: 1px solid color-mix(in srgb, var(--line, rgba(148, 163, 184, .24)) 82%, transparent);
    background: color-mix(in srgb, var(--surface-raised, #fff) 66%, transparent);
    color: var(--foreground, #0f172a);
    cursor: pointer;
  }

  .hbxp-engine-fleet__pager button {
    width: 30px;
    min-width: 30px;
    height: 18px;
    border-radius: 999px;
    font-size: 16px;
    font-weight: 950;
    line-height: 1;
  }

  .hbxp-engine-fleet__pager span {
    color: var(--muted, #64748b);
    font-size: 8px;
    font-weight: 950;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .hbxp-engine-empty {
    grid-column: 1 / -1;
    display: grid;
    place-items: center;
    min-height: 56px;
    color: var(--muted, #64748b);
    font-size: 10px;
    font-weight: 850;
    border-radius: 16px;
    border: 1px dashed color-mix(in srgb, var(--line, rgba(148, 163, 184, .24)) 92%, transparent);
  }

  .hbxp-carousel__nav {
    position: absolute;
    top: 50%;
    z-index: 8;
    width: 32px;
    min-width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    transform: translateY(-50%);
    -webkit-backdrop-filter: blur(10px) saturate(140%);
    backdrop-filter: blur(10px) saturate(140%);
    box-shadow: var(--shadow-xs, 0 12px 24px -18px rgba(15, 23, 42, .22));
    opacity: .78;
    font-size: 24px;
    font-weight: 950;
    line-height: 1;
    transition: opacity .16s ease, transform .16s ease, border-color .16s ease, box-shadow .16s ease;
  }

  .hbxp-carousel__nav:hover,
  .hbxp-carousel__nav:focus-visible {
    opacity: 1;
    border-color: color-mix(in srgb, var(--brand, #10b981) 34%, var(--line, rgba(148, 163, 184, .24)));
    outline: none;
  }

  .hbxp-carousel__nav--prev {
    left: 3px;
  }

  .hbxp-carousel__nav--next {
    right: 3px;
  }

  .hbxp-carousel__dots {
    position: absolute;
    right: 42px;
    bottom: 6px;
    z-index: 9;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--surface-raised, #fff) 42%, transparent);
    -webkit-backdrop-filter: blur(9px);
    backdrop-filter: blur(9px);
  }

  .hbxp-carousel__dots button {
    width: 9px;
    min-width: 9px;
    height: 9px;
    padding: 0;
    border-radius: 999px;
    opacity: .58;
    transition: transform .18s ease, opacity .18s ease, background .18s ease, box-shadow .18s ease;
  }

  .hbxp-carousel__dots button[data-active="true"] {
    width: 9px;
    min-width: 9px;
    opacity: 1;
    transform: scale(1.18);
    border-color: color-mix(in srgb, var(--brand, #10b981) 44%, transparent);
    background: linear-gradient(90deg, var(--brand, #10b981), var(--button-accent, #0ea5e9));
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--brand, #10b981) 16%, transparent), 0 0 14px color-mix(in srgb, var(--button-accent, #0ea5e9) 40%, transparent);
  }

  html[data-theme-mode="dark"] .hbxp-carousel__nav,
  html[data-theme-mode="dark"] .hbxp-carousel__dots button,
  html[data-theme-mode="dark"] .hbxp-engine-fleet__pager button {
    border-color: rgba(96, 165, 250, .26);
    background: rgba(15, 35, 68, .78);
    color: #f8fbff;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, .07),
      0 10px 20px -16px rgba(14, 165, 233, .48);
  }

  html[data-theme-mode="dark"] .hbxp-carousel__dots {
    background: rgba(6, 16, 33, .64);
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


  .hbxp-slide-card p,
  .hbxp-engine-fleet p {
    max-width: none;
  }

  .hbxp-slide-card__titleRow {
    align-items: center;
  }

  .hbxp-engine-fleet__pager {
    display: none;
  }

  @keyframes hbxp-sheen {
    0%, 45% { transform: translateX(-118%); }
    70%, 100% { transform: translateX(118%); }
  }

  @keyframes hbxp-engine-pulse {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-1px); }
  }

  @media (prefers-reduced-motion: reduce) {
    .hbxp-carousel__track,
    .hbxp-engine-fleet__track,
    .hbxp-carousel__nav,
    .hbxp-carousel__dots button {
      transition: none;
    }

    .hbxp-slide-card__sheen,
    .hbxp-engine-card[data-active="true"] {
      animation: none;
    }
  }

  @media (max-width: 1180px) {
    .app-topbar__inner--controlCenter {
      --hbxp-card-h: 108px;
      grid-template-columns: minmax(190px, 240px) minmax(0, 1fr) !important;
    }

    .hbx-command-side {
      grid-column: 1 / -1;
    }

    .hbxp-carousel {
      --hbxp-safe-x: 34px;
    }

    .hbxp-engine-fleet__head {
      grid-template-columns: minmax(0, 1fr) 210px;
    }

    .hbxp-engine-fleet__page {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .hbxp-engine-fleet__page .hbxp-engine-card:nth-child(n+5) {
      display: none;
    }

    .hbxp-slide-card p,
    .hbxp-engine-fleet p {
      display: none;
    }
  }

  @media (max-width: 860px) {
    .app-topbar__inner--controlCenter {
      --hbxp-card-h: 120px;
      grid-template-columns: 1fr !important;
    }

    .hbxp-carousel {
      --hbxp-safe-x: 32px;
    }

    .hbxp-slide-card {
      padding: 9px 10px;
      gap: 7px;
    }

    .hbxp-slide-card__main {
      grid-template-columns: minmax(0, 1fr) 48px;
    }

    .hbxp-ring {
      width: 46px;
      height: 46px;
    }

    .hbxp-metrics,
    .hbxp-metrics[data-count="4"],
    .hbxp-metrics[data-count="5"],
    .hbxp-metrics[data-count="6"],
    .hbxp-metrics[data-count="7"] {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .hbxp-metric {
      min-height: 31px;
      padding: 5px 7px;
    }

    .hbxp-metric small,
    .hbxp-card-feed,
    .hbxp-steps {
      display: none;
    }

    .hbxp-engine-fleet__head {
      grid-template-columns: minmax(0, 1fr);
    }

    .hbxp-engine-fleet__kpis {
      display: none;
    }

    .hbxp-engine-fleet__page {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .hbxp-engine-fleet__page .hbxp-engine-card:nth-child(n+3) {
      display: none;
    }
  }

  @media (max-width: 560px) {
    .app-topbar__inner--controlCenter {
      --hbxp-card-h: 124px;
    }

    .hbxp-carousel {
      --hbxp-safe-x: 30px;
    }

    .hbxp-carousel__slide {
      padding-block: 0;
    }

    .hbxp-slide-card__eyebrow em,
    .hbxp-cta,
    .hbxp-ring {
      display: none;
    }

    .hbxp-slide-card__main {
      grid-template-columns: minmax(0, 1fr);
      min-height: auto;
    }

    .hbxp-slide-card h2,
    .hbxp-engine-fleet h2 {
      font-size: 17px;
    }

    .hbxp-metrics,
    .hbxp-metrics[data-count="4"],
    .hbxp-metrics[data-count="5"],
    .hbxp-metrics[data-count="6"],
    .hbxp-metrics[data-count="7"] {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .hbxp-reward {
      gap: 5px;
    }

    .hbxp-reward span {
      height: 14px;
    }

    .hbxp-carousel__dots {
      right: 38px;
      bottom: 8px;
    }
  }
`;
