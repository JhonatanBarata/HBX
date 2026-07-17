"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { I, ICONS } from "@/components/hbx/shell";

type PreviewState = "queued" | "processing" | "released" | "invalidated";
type PreviewTone = "waiting" | "working" | "success" | "danger";
type RadarMode = "active" | "idle" | "error";

type PreviewStateMeta = {
  label: string;
  shortLabel: string;
  icon: keyof typeof ICONS;
  tone: PreviewTone;
};

type StateCounts = Record<PreviewState, number>;
type FlowEntry = { state: PreviewState; target: HTMLElement };
type FlowFlight = FlowEntry & { key: string };

const PREVIEW_STATE_ORDER: PreviewState[] = ["queued", "processing", "released", "invalidated"];

const PREVIEW_STATES: Record<PreviewState, PreviewStateMeta> = {
  queued: {
    label: "Aguardando liberação",
    shortLabel: "Aguardando",
    icon: "clock",
    tone: "waiting",
  },
  processing: {
    label: "Em processo de liberação",
    shortLabel: "Em processo",
    icon: "scrape",
    tone: "working",
  },
  released: {
    label: "Liberado",
    shortLabel: "Liberado",
    icon: "check",
    tone: "success",
  },
  invalidated: {
    label: "Invalidado",
    shortLabel: "Invalidado",
    icon: "minus",
    tone: "danger",
  },
};

const EMPTY_COUNTS: StateCounts = {
  queued: 0,
  processing: 0,
  released: 0,
  invalidated: 0,
};

const FLOW_TARGET_SELECTOR = [
  "tr[id^='vnd-row-']",
  ".vnd-card",
  ".row-dense",
  ".be-card",
  ".vnd-m__row",
  ".radar2-card",
].join(",");

function sameCounts(left: StateCounts, right: StateCounts): boolean {
  return PREVIEW_STATE_ORDER.every((state) => left[state] === right[state]);
}

function visible(element: HTMLElement): boolean {
  const layer = element.closest<HTMLElement>(".vnd-layer");
  if (layer && !layer.classList.contains("is-on")) return false;
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function publicState(value: string | undefined): PreviewState | null {
  return PREVIEW_STATE_ORDER.includes(value as PreviewState) ? value as PreviewState : null;
}

function nearestFlowTarget(badge: HTMLElement, root: HTMLElement): HTMLElement | null {
  const target = badge.closest<HTMLElement>(FLOW_TARGET_SELECTOR);
  if (!target || !root.contains(target)) return null;
  if (target.closest(".ctx, .lead-cockpit, .radar-status-preview, .vnd-enrichment-rail-slot")) return null;
  return target;
}

function targetIdentity(target: HTMLElement, index: number): string {
  if (target.id) return target.id;
  if (target.dataset.enrichmentKey) return target.dataset.enrichmentKey;

  const name = target.querySelector<HTMLElement>(
    ".vnd-card__name, .row-dense__name, .be-card__name, .vnd-m__row-name, strong",
  )?.textContent?.trim().replace(/\s+/g, " ").slice(0, 90);
  const key = `${target.className || "lead"}:${name || "lead"}:${index}`;
  target.dataset.enrichmentKey = key;
  return key;
}

function StateButton({
  state,
  count,
  ready,
  active,
  compact = false,
  onSelect,
}: {
  state: PreviewState;
  count: number;
  ready: boolean;
  active: boolean;
  compact?: boolean;
  onSelect: (state: PreviewState) => void;
}) {
  const meta = PREVIEW_STATES[state];
  return (
    <button
      type="button"
      className={`vnd-enrichment-state vnd-enrichment-state--${meta.tone}${active ? " is-active" : ""}${compact ? " is-compact" : ""}`}
      data-enrichment-source={state}
      data-flow-state={state}
      aria-pressed={active}
      aria-label={`${meta.label}: ${ready ? count : "carregando"}`}
      onClick={() => onSelect(state)}
    >
      <span className="vnd-enrichment-state__icon" aria-hidden="true">
        <I d={ICONS[meta.icon]} size={compact ? 14 : 16} />
      </span>
      <span className="vnd-enrichment-state__copy">
        <small>{compact ? meta.shortLabel : meta.label}</small>
        {!compact && <strong>{meta.label}</strong>}
      </span>
      <span className="vnd-enrichment-state__count" aria-hidden="true">
        {ready ? count : "—"}
      </span>
    </button>
  );
}

function RadarActivator({
  mode,
  activeCount,
  onActivate,
}: {
  mode: RadarMode;
  activeCount: number;
  onActivate: () => void;
}) {
  const status = mode === "active" ? "Ativo · girando" : mode === "error" ? "Erro" : "Ocioso";
  const hint = mode === "active"
    ? `${activeCount} na fila`
    : mode === "error"
      ? "Revisar inválidos"
      : "Fila vazia";

  return (
    <button
      type="button"
      className={`vnd-enrichment-radar is-${mode}`}
      onClick={onActivate}
      aria-label={`Radar de enriquecimento: ${status}. ${hint}.`}
    >
      <span className="vnd-enrichment-radar__disc" aria-hidden="true">
        <i className="vnd-enrichment-radar__sweep" />
        <i className="vnd-enrichment-radar__core" />
      </span>
      <span className="vnd-enrichment-radar__copy">
        <small>Ativador</small>
        <strong>Radar de enriquecimento</strong>
        <em>{hint}</em>
      </span>
      <span className="vnd-enrichment-radar__status">{status}</span>
    </button>
  );
}

export function RadarStatusPreview({ embedTitle }: { embedTitle?: ReactNode }) {
  const [state, setState] = useState<PreviewState>("processing");
  const [counts, setCounts] = useState<StateCounts>(EMPTY_COUNTS);
  const [countsReady, setCountsReady] = useState(false);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const modeHostRef = useRef<HTMLElement | null>(null);
  const portalHostRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let disposed = false;
    let locateFrame = 0;

    const locate = () => {
      if (disposed) return;
      const modeHost = document.querySelector<HTMLElement>(".vnd-modehost");
      const header = modeHost?.querySelector<HTMLElement>(".vnd-funhead");
      if (!modeHost || !header || portalHostRef.current === header) return;

      modeHostRef.current?.classList.remove("vnd-has-live-enrichment");
      modeHostRef.current = modeHost;
      portalHostRef.current = header;
      modeHost.classList.add("vnd-has-live-enrichment");
      locateFrame = window.requestAnimationFrame(() => setPortalHost(header));
    };

    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      disposed = true;
      observer.disconnect();
      window.cancelAnimationFrame(locateFrame);
      modeHostRef.current?.classList.remove("vnd-has-live-enrichment");
      modeHostRef.current = null;
      portalHostRef.current = null;
    };
  }, []);

  useEffect(() => {
    const root = modeHostRef.current;
    const header = portalHostRef.current;
    if (!root || !header || !portalHost) return;

    const svgNamespace = "http://www.w3.org/2000/svg";
    const pipe = document.createElementNS(svgNamespace, "svg");
    const pipeShadow = document.createElementNS(svgNamespace, "path");
    const pipeGlass = document.createElementNS(svgNamespace, "path");
    const pipeLight = document.createElementNS(svgNamespace, "path");
    pipe.classList.add("vnd-live-pipe");
    pipe.setAttribute("aria-hidden", "true");
    pipeShadow.classList.add("vnd-live-pipe__shadow");
    pipeGlass.classList.add("vnd-live-pipe__glass");
    pipeLight.classList.add("vnd-live-pipe__light");
    pipe.append(pipeShadow, pipeGlass, pipeLight);
    root.append(pipe);

    let disposed = false;
    let scanFrame = 0;
    let geometryFrame = 0;
    let flying = false;
    let firstScan = true;
    let currentLayer = "";
    let previous = new Map<string, FlowEntry>();
    let latest = new Map<string, FlowEntry>();
    const queue: FlowFlight[] = [];
    const timers = new Set<number>();
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    const setTimer = (callback: () => void, delay: number) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        callback();
      }, delay);
      timers.add(timer);
      return timer;
    };

    const activeScope = (): HTMLElement => {
      const layer = root.querySelector<HTMLElement>(".vnd-layer.is-on");
      if (layer && !layer.classList.contains("vnd-layer--enriquecimento")) return layer;
      return root.querySelector<HTMLElement>("#vendas-panel-funil") || root;
    };

    const layerKey = (scope: HTMLElement): string => scope.id || scope.className || "vendas";

    const pathFor = (source: HTMLElement, target: HTMLElement) => {
      const rootRect = root.getBoundingClientRect();
      const sourceRect = source.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      if (!rootRect.width || !targetRect.width || !targetRect.height) return null;

      const sx = sourceRect.left - rootRect.left + sourceRect.width / 2;
      const sy = sourceRect.bottom - rootRect.top - 1;
      const targetX = targetRect.left - rootRect.left + Math.min(28, Math.max(16, targetRect.width * 0.07));
      const targetY = targetRect.top - rootRect.top + targetRect.height / 2;
      const stageRect = root.querySelector<HTMLElement>(".vnd-stage")?.getBoundingClientRect();
      const trunkX = Math.max(18, (stageRect?.left ?? rootRect.left) - rootRect.left + 22);
      const railBottom = header.getBoundingClientRect().bottom - rootRect.top;
      const collectorY = Math.max(sy + 12, railBottom + 7);
      const entryY = Math.max(targetY, collectorY + 36);
      const radius = 12;
      const direction = sx >= trunkX ? -1 : 1;
      const sourceTurnX = sx + direction * radius;

      const pathData = [
        `M ${sx} ${sy}`,
        `L ${sx} ${collectorY - radius}`,
        `Q ${sx} ${collectorY} ${sourceTurnX} ${collectorY}`,
        `L ${trunkX + radius} ${collectorY}`,
        `Q ${trunkX} ${collectorY} ${trunkX} ${collectorY + radius}`,
        `L ${trunkX} ${entryY - radius}`,
        `Q ${trunkX} ${entryY} ${trunkX + radius} ${entryY}`,
        `L ${targetX} ${entryY}`,
      ].join(" ");

      return {
        pathData,
        points: [
          [sx, sy],
          [sx, collectorY],
          [trunkX, collectorY],
          [trunkX, entryY],
          [targetX, entryY],
        ] as Array<[number, number]>,
      };
    };

    const drawPipe = (stateToDraw: PreviewState, target: HTMLElement) => {
      const source = header.querySelector<HTMLElement>(`[data-enrichment-source="${stateToDraw}"]`);
      if (!source || !visible(source) || !visible(target)) return null;
      const geometry = pathFor(source, target);
      if (!geometry) return null;
      pipe.dataset.flowState = stateToDraw;
      pipeShadow.setAttribute("d", geometry.pathData);
      pipeGlass.setAttribute("d", geometry.pathData);
      pipeLight.setAttribute("d", geometry.pathData);
      return geometry;
    };

    const markArrival = (target: HTMLElement, arrivalState: PreviewState) => {
      target.dataset.enrichmentArrival = arrivalState;
      target.classList.remove("is-enrichment-arrival");
      void target.offsetWidth;
      target.classList.add("is-enrichment-arrival");
      setTimer(() => {
        target.classList.remove("is-enrichment-arrival");
        delete target.dataset.enrichmentArrival;
      }, arrivalState === "released" ? 2600 : 1800);
    };

    const drawIdlePipe = () => {
      if (disposed || flying) return;
      const preferred = ["processing", "queued", "released", "invalidated"]
        .flatMap((preferredState) => Array.from(latest.values()).filter((item) => item.state === preferredState))
        .find((item) => root.contains(item.target) && visible(item.target));
      if (!preferred) {
        pipeShadow.removeAttribute("d");
        pipeGlass.removeAttribute("d");
        pipeLight.removeAttribute("d");
        return;
      }
      drawPipe(preferred.state, preferred.target);
    };

    const runNext = () => {
      if (disposed || flying) return;
      const next = queue.shift();
      if (!next) {
        drawIdlePipe();
        return;
      }
      if (!root.contains(next.target) || !visible(next.target)) {
        runNext();
        return;
      }

      const geometry = drawPipe(next.state, next.target);
      if (!geometry) {
        runNext();
        return;
      }

      flying = true;
      next.target.classList.add("is-enrichment-receiving");
      next.target.dataset.enrichmentArrival = next.state;

      if (reduceMotion) {
        markArrival(next.target, next.state);
        next.target.classList.remove("is-enrichment-receiving");
        flying = false;
        setTimer(runNext, 160);
        return;
      }

      const token = document.createElement("span");
      token.className = `vnd-live-token vnd-live-token--${next.state}`;
      token.dataset.flowState = next.state;
      token.setAttribute("aria-hidden", "true");
      token.append(document.createElement("i"));
      root.append(token);

      const [start, collector, trunkTop, trunkBottom, destination] = geometry.points;
      const duration = next.state === "released" ? 1850 : 1420;
      const animation = token.animate([
        { transform: `translate3d(${start[0] - 13}px, ${start[1] - 9}px, 0) scale(.72)`, opacity: 0 },
        { transform: `translate3d(${start[0] - 13}px, ${start[1] - 9}px, 0) scale(1)`, opacity: 1, offset: 0.08 },
        { transform: `translate3d(${collector[0] - 13}px, ${collector[1] - 9}px, 0) scale(1)`, opacity: 1, offset: 0.23 },
        { transform: `translate3d(${trunkTop[0] - 13}px, ${trunkTop[1] - 9}px, 0) scale(.9)`, opacity: 1, offset: 0.43 },
        { transform: `translate3d(${trunkBottom[0] - 13}px, ${trunkBottom[1] - 9}px, 0) scale(.9)`, opacity: 1, offset: next.state === "released" ? 0.7 : 0.76 },
        { transform: `translate3d(${destination[0] - 13}px, ${destination[1] - 9}px, 0) scale(1.08)`, opacity: 1, offset: 0.94 },
        { transform: `translate3d(${destination[0] - 13}px, ${destination[1] - 9}px, 0) scale(.4)`, opacity: 0 },
      ], {
        duration,
        easing: "cubic-bezier(.2,.78,.2,1)",
        fill: "forwards",
      });

      void animation.finished.then(() => {
        token.remove();
        next.target.classList.remove("is-enrichment-receiving");
        markArrival(next.target, next.state);
        flying = false;
        setTimer(runNext, next.state === "released" ? 520 : 150);
      }).catch(() => {
        token.remove();
        next.target.classList.remove("is-enrichment-receiving");
        flying = false;
      });
    };

    const enqueue = (flight: FlowFlight) => {
      if (queue.some((queued) => queued.key === flight.key && queued.state === flight.state)) return;
      queue.push(flight);
      runNext();
    };

    const scan = () => {
      scanFrame = 0;
      if (disposed) return;

      const scope = activeScope();
      const nextCounts: StateCounts = { ...EMPTY_COUNTS };
      const nextEntries = new Map<string, FlowEntry>();
      const seenTargets = new Set<HTMLElement>();
      const badges = scope.querySelectorAll<HTMLElement>(".radar-ai-badge[data-local-enrichment-state]");

      badges.forEach((badge, index) => {
        const status = publicState(badge.dataset.localEnrichmentState);
        if (!status) return;
        const target = nearestFlowTarget(badge, root);
        if (!target || seenTargets.has(target)) return;
        seenTargets.add(target);
        target.classList.add("vnd-enrichment-target");
        target.dataset.enrichmentState = status;
        const key = targetIdentity(target, index);
        nextCounts[status] += 1;
        nextEntries.set(key, { state: status, target });
      });

      root.querySelectorAll<HTMLElement>(".vnd-enrichment-target").forEach((target) => {
        if (seenTargets.has(target)) return;
        target.classList.remove("vnd-enrichment-target", "is-enrichment-receiving", "is-enrichment-arrival", "is-enrichment-focus");
        delete target.dataset.enrichmentState;
        delete target.dataset.enrichmentArrival;
      });

      setCounts((current) => sameCounts(current, nextCounts) ? current : nextCounts);
      setCountsReady(true);
      latest = nextEntries;

      const nextLayer = layerKey(scope);
      if (firstScan || nextLayer !== currentLayer) {
        firstScan = false;
        currentLayer = nextLayer;
        previous = nextEntries;
        const firstLive = ["processing", "queued", "released", "invalidated"]
          .flatMap((preferredState) => Array.from(nextEntries.entries()).filter(([, entry]) => entry.state === preferredState))
          .find(([, entry]) => visible(entry.target));
        if (firstLive) {
          setTimer(() => enqueue({ key: firstLive[0], ...firstLive[1] }), 620);
        } else {
          drawIdlePipe();
        }
        return;
      }

      let inserted = 0;
      nextEntries.forEach((entry, key) => {
        const before = previous.get(key);
        if (before?.state !== entry.state && inserted < 3) {
          enqueue({ key, ...entry });
          inserted += 1;
        }
      });
      previous = nextEntries;
      drawIdlePipe();
    };

    const scheduleScan = () => {
      if (scanFrame || disposed) return;
      scanFrame = window.requestAnimationFrame(scan);
    };
    const scheduleGeometry = () => {
      if (geometryFrame || disposed) return;
      geometryFrame = window.requestAnimationFrame(() => {
        geometryFrame = 0;
        drawIdlePipe();
      });
    };

    const observer = new MutationObserver(scheduleScan);
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-local-enrichment-state", "aria-hidden"],
    });
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(scheduleGeometry);
    resizeObserver?.observe(root);
    resizeObserver?.observe(header);
    window.addEventListener("resize", scheduleGeometry);
    root.addEventListener("scroll", scheduleGeometry, true);
    header.addEventListener("click", scheduleScan, true);
    scanFrame = window.requestAnimationFrame(scan);

    return () => {
      disposed = true;
      observer.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleGeometry);
      root.removeEventListener("scroll", scheduleGeometry, true);
      header.removeEventListener("click", scheduleScan, true);
      window.cancelAnimationFrame(scanFrame);
      window.cancelAnimationFrame(geometryFrame);
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
      root.querySelectorAll<HTMLElement>(".vnd-enrichment-target").forEach((target) => {
        target.classList.remove("vnd-enrichment-target", "is-enrichment-receiving", "is-enrichment-arrival", "is-enrichment-focus");
        delete target.dataset.enrichmentState;
        delete target.dataset.enrichmentArrival;
        delete target.dataset.enrichmentKey;
      });
      root.querySelectorAll(".vnd-live-token").forEach((token) => token.remove());
      pipe.remove();
    };
  }, [portalHost]);

  const focusState = (nextState: PreviewState) => {
    setState(nextState);
    const root = modeHostRef.current;
    if (!root) return;
    const targets = Array.from(root.querySelectorAll<HTMLElement>(`[data-enrichment-state="${nextState}"]`));
    const target = targets.find(visible);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    target.classList.remove("is-enrichment-focus");
    void target.offsetWidth;
    target.classList.add("is-enrichment-focus");
    window.setTimeout(() => target.classList.remove("is-enrichment-focus"), 1700);
    target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  };

  const activeCount = counts.queued + counts.processing;
  const radarMode: RadarMode = activeCount > 0 ? "active" : counts.invalidated > 0 ? "error" : "idle";
  const activateRadar = () => focusState(counts.processing > 0 ? "processing" : counts.queued > 0 ? "queued" : counts.invalidated > 0 ? "invalidated" : "released");

  const topRail = portalHost ? createPortal(
    <div className="vnd-enrichment-rail-slot" role="region" aria-label="Estados do enriquecimento">
      <div className="vnd-enrichment-rail-slot__states">
        {PREVIEW_STATE_ORDER.map((item) => (
          <StateButton
            key={item}
            state={item}
            count={counts[item]}
            ready={countsReady}
            active={state === item}
            compact
            onSelect={focusState}
          />
        ))}
      </div>
      <RadarActivator mode={radarMode} activeCount={activeCount} onActivate={activateRadar} />
    </div>,
    portalHost,
  ) : null;

  return (
    <>
      {topRail}
      <section
        className={`radar-status-preview radar-status-preview--${PREVIEW_STATES[state].tone} radar-status-preview--live`}
        data-preview-state={state}
        aria-labelledby="radar-status-preview-title"
      >
        <header className="radar-status-preview__header">
          <div className="radar-status-preview__heading">
            <span className="radar-status-preview__eyebrow">Fluxo vivo</span>
            <h2 id="radar-status-preview-title">{embedTitle ?? "Enriquecimento"}</h2>
            <p>Um único cano transparente entrega cada resultado ao lead certo, sem tirar você do Vendas.</p>
          </div>
          <RadarActivator mode={radarMode} activeCount={activeCount} onActivate={activateRadar} />
        </header>

        <div className="radar-status-preview__live-stage">
          <div className="radar-status-preview__live-states">
            {PREVIEW_STATE_ORDER.map((item) => (
              <StateButton
                key={item}
                state={item}
                count={counts[item]}
                ready={countsReady}
                active={state === item}
                onSelect={focusState}
              />
            ))}
          </div>
          <div className="radar-status-preview__live-pipe" aria-hidden="true">
            <i />
            <span className={`radar-status-preview__live-token is-${state}`} />
          </div>
          <div className={`radar-status-preview__result radar-status-preview__result--${state}`}>
            <span className="radar-status-preview__result-icon" aria-hidden="true">
              <I d={ICONS[PREVIEW_STATES[state].icon]} size={20} />
            </span>
            <span>
              <small>Resultado aplicado no card</small>
              <strong>{PREVIEW_STATES[state].label}</strong>
            </span>
            <em>O card recebe cor, brilho de chegada e mantém todos os cliques existentes.</em>
          </div>
        </div>
      </section>
    </>
  );
}
