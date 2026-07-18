"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { I, ICONS } from "@/components/hbx/shell";

type PreviewState = "queued" | "processing" | "released" | "invalidated";
type PreviewTone = "waiting" | "working" | "success" | "danger";
type RadarMode = "active" | "idle" | "error";
type Point = [number, number];

type PreviewStateMeta = {
  label: string;
  shortLabel: string;
  icon: keyof typeof ICONS;
  tone: PreviewTone;
};

type StateCounts = Record<PreviewState, number>;
type FlowEntry = { state: PreviewState; target: HTMLElement };
type FlowFlight = FlowEntry & { key: string };
type FlowTargetGeometry = FlowEntry & {
  key: string;
  x: number;
  y: number;
};
type FlowSourceGeometry = {
  element: HTMLElement;
  point: Point;
};
type FlowNetworkLayout = {
  width: number;
  height: number;
  collectorY: number;
  trunkX: number;
  trunkBottomY: number;
  sources: Map<PreviewState, FlowSourceGeometry>;
  targets: FlowTargetGeometry[];
};

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
    let observer: MutationObserver | null = null;

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
      // Achou a casca — para de observar o body inteiro (era subtree:true genérico
      // rodando em TODA mutação da página; o modehost é estável depois de montado).
      observer?.disconnect();
    };

    locate();
    if (!portalHostRef.current) {
      observer = new MutationObserver(locate);
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      disposed = true;
      observer?.disconnect();
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
    const network = document.createElementNS(svgNamespace, "g");
    pipe.classList.add("vnd-live-pipe");
    pipe.setAttribute("aria-hidden", "true");
    pipe.setAttribute("preserveAspectRatio", "none");
    network.classList.add("vnd-live-pipe__network");
    pipe.append(network);
    root.prepend(pipe);

    let disposed = false;
    let scanFrame = 0;
    let geometryFrame = 0;
    let flying = false;
    let firstScan = true;
    let currentLayer = "";
    let lastSignature = "";
    let previous = new Map<string, FlowEntry>();
    let latest = new Map<string, FlowEntry>();
    const queue: FlowFlight[] = [];
    const timers = new Set<number>();
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    // Teto de braços desenhados: só os leads na faixa visível do cano, no máximo
    // este número. Pipeline cheio (20+) virava emaranhado e ainda pesava o SVG.
    const MAX_BRANCHES = 8;

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

    const buildLayout = (entries: Map<string, FlowEntry>): FlowNetworkLayout | null => {
      const rootRect = root.getBoundingClientRect();
      if (!rootRect.width || !rootRect.height) return null;

      const sources = new Map<PreviewState, FlowSourceGeometry>();
      PREVIEW_STATE_ORDER.forEach((sourceState) => {
        const element = header.querySelector<HTMLElement>(`[data-enrichment-source="${sourceState}"]`);
        if (!element || !visible(element)) return;
        const rect = element.getBoundingClientRect();
        sources.set(sourceState, {
          element,
          point: [
            rect.left - rootRect.left + rect.width / 2,
            rect.bottom - rootRect.top - 1,
          ],
        });
      });

      const headerBottom = header.getBoundingClientRect().bottom - rootRect.top;
      const bandBottom = rootRect.height - 6;

      const allTargets: FlowTargetGeometry[] = [];
      entries.forEach((entry, key) => {
        if (!root.contains(entry.target) || !visible(entry.target)) return;
        const rect = entry.target.getBoundingClientRect();
        allTargets.push({
          key,
          ...entry,
          x: rect.left - rootRect.left + 1,
          y: rect.top - rootRect.top + rect.height / 2,
        });
      });
      // Só o lead que está de fato na faixa visível do cano (abaixo do cabeçalho,
      // acima do rodapé) ganha braço — e no máximo MAX_BRANCHES.
      const targets = allTargets
        .filter((target) => target.y >= headerBottom + 8 && target.y <= bandBottom)
        .sort((left, right) => left.y - right.y)
        .slice(0, MAX_BRANCHES);

      if (sources.size === 0 || targets.length === 0) return null;

      const sourcePoints = Array.from(sources.values(), ({ point }) => point);
      const collectorY = Math.max(
        headerBottom + 15,
        Math.max(...sourcePoints.map((point) => point[1])) + 14,
      );
      const firstTargetX = Math.min(...targets.map((target) => target.x));
      const stageLeft = (root.querySelector<HTMLElement>(".vnd-stage")?.getBoundingClientRect().left ?? rootRect.left) - rootRect.left;
      const trunkX = Math.max(8, Math.min(firstTargetX - 18, stageLeft - 12));
      const trunkBottomY = Math.max(collectorY + 30, ...targets.map((target) => target.y));

      return {
        width: rootRect.width,
        height: rootRect.height,
        collectorY,
        trunkX,
        trunkBottomY,
        sources,
        targets,
      };
    };

    const createPath = (className: string, pathData: string) => {
      const path = document.createElementNS(svgNamespace, "path");
      path.classList.add(className);
      path.setAttribute("d", pathData);
      return path;
    };

    const appendSegment = (
      pathData: string,
      kind: "inlet" | "main" | "branch",
      flowState?: PreviewState,
    ) => {
      const group = document.createElementNS(svgNamespace, "g");
      group.classList.add("vnd-live-pipe__segment", `is-${kind}`);
      if (flowState) group.dataset.flowState = flowState;
      group.append(
        createPath("vnd-live-pipe__shadow", pathData),
        createPath("vnd-live-pipe__rim", pathData),
        createPath("vnd-live-pipe__glass", pathData),
        createPath("vnd-live-pipe__core", pathData),
        createPath("vnd-live-pipe__shine", pathData),
      );
      network.append(group);
    };

    const appendCoupler = (x: number, y: number, flowState?: PreviewState) => {
      const group = document.createElementNS(svgNamespace, "g");
      group.classList.add("vnd-live-pipe__coupler");
      if (flowState) group.dataset.flowState = flowState;
      const ring = document.createElementNS(svgNamespace, "circle");
      const core = document.createElementNS(svgNamespace, "circle");
      ring.classList.add("vnd-live-pipe__coupler-ring");
      core.classList.add("vnd-live-pipe__coupler-core");
      ring.setAttribute("cx", String(x));
      ring.setAttribute("cy", String(y));
      ring.setAttribute("r", "6.2");
      core.setAttribute("cx", String(x));
      core.setAttribute("cy", String(y));
      core.setAttribute("r", "3.1");
      group.append(ring, core);
      network.append(group);
    };

    const renderNetwork = (entries: Map<string, FlowEntry>) => {
      const layout = buildLayout(entries);
      root.classList.toggle("vnd-live-pipe-ready", Boolean(layout));
      if (!layout) {
        network.replaceChildren();
        lastSignature = "";
        delete pipe.dataset.branchCount;
        return null;
      }

      // Assinatura barata da geometria: se nada mudou, não reconstrói o SVG (o
      // scan roda a cada mutação — sem isso, redesenhava o cano inteiro à toa).
      const signature = [
        Math.round(layout.width),
        Math.round(layout.height),
        Math.round(layout.collectorY),
        Math.round(layout.trunkX),
        Math.round(layout.trunkBottomY),
        Array.from(layout.sources.keys()).join(","),
        layout.targets.map((target) => `${target.key}@${Math.round(target.x)},${Math.round(target.y)}:${target.state}`).join("|"),
      ].join(";");
      if (signature === lastSignature && network.childNodes.length > 0) {
        return layout;
      }
      lastSignature = signature;
      network.replaceChildren();

      pipe.setAttribute("viewBox", `0 0 ${Math.ceil(layout.width)} ${Math.ceil(layout.height)}`);
      pipe.dataset.branchCount = String(layout.targets.length);

      const sourcePoints = Array.from(layout.sources.values(), ({ point }) => point);
      const rightmostSourceX = Math.max(...sourcePoints.map((point) => point[0]));
      const corner = Math.min(16, Math.max(9, (layout.trunkBottomY - layout.collectorY) * 0.06));

      layout.sources.forEach(({ point }, sourceState) => {
        appendSegment(
          `M ${point[0]} ${point[1]} L ${point[0]} ${layout.collectorY}`,
          "inlet",
          sourceState,
        );
        appendCoupler(point[0], layout.collectorY, sourceState);
      });

      appendSegment([
        `M ${rightmostSourceX} ${layout.collectorY}`,
        `L ${layout.trunkX + corner} ${layout.collectorY}`,
        `Q ${layout.trunkX} ${layout.collectorY} ${layout.trunkX} ${layout.collectorY + corner}`,
        `L ${layout.trunkX} ${layout.trunkBottomY}`,
      ].join(" "), "main");

      layout.targets.forEach((target) => {
        appendSegment(`M ${layout.trunkX} ${target.y} L ${target.x} ${target.y}`, "branch");
        appendCoupler(target.x, target.y, target.state);
      });

      return layout;
    };

    const pathFor = (source: HTMLElement, target: HTMLElement) => {
      const layout = buildLayout(latest);
      if (!layout) return null;
      const rootRect = root.getBoundingClientRect();
      const sourceRect = source.getBoundingClientRect();
      const destination = layout.targets.find((item) => item.target === target);
      if (!destination) return null;

      const start: Point = [
        sourceRect.left - rootRect.left + sourceRect.width / 2,
        sourceRect.bottom - rootRect.top - 1,
      ];
      return {
        points: [
          start,
          [start[0], layout.collectorY] as Point,
          [layout.trunkX, layout.collectorY] as Point,
          [layout.trunkX, destination.y] as Point,
          [destination.x, destination.y] as Point,
        ],
      };
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

    const runNext = () => {
      if (disposed || flying) return;
      const next = queue.shift();
      if (!next) return;
      if (!root.contains(next.target) || !visible(next.target)) {
        runNext();
        return;
      }

      const source = header.querySelector<HTMLElement>(`[data-enrichment-source="${next.state}"]`);
      if (!source || !visible(source)) {
        runNext();
        return;
      }
      const geometry = pathFor(source, next.target);
      if (!geometry) {
        renderNetwork(latest);
        runNext();
        return;
      }

      window.requestAnimationFrame(() => {
        if (!disposed) setState(next.state);
      });
      flying = true;
      source.classList.remove("is-discharging");
      void source.offsetWidth;
      source.classList.add("is-discharging");
      setTimer(() => source.classList.remove("is-discharging"), 760);
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
      const halfX = 19;
      const halfY = 10;
      const duration = next.state === "released" ? 1580 : 1320;
      const at = (point: Point, scale = 1) =>
        `translate3d(${point[0] - halfX}px, ${point[1] - halfY}px, 0) scale(${scale})`;
      const animation = token.animate([
        { transform: at(start, 0.66), opacity: 0 },
        { transform: at(start, 1), opacity: 1, offset: 0.08 },
        { transform: at(collector, 1), opacity: 1, offset: 0.25 },
        { transform: at(trunkTop, 0.94), opacity: 1, offset: 0.47 },
        { transform: at(trunkBottom, 0.94), opacity: 1, offset: next.state === "released" ? 0.76 : 0.8 },
        { transform: at(destination, 1.08), opacity: 1, offset: 0.95 },
        { transform: at(destination, 0.38), opacity: 0 },
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
        setTimer(runNext, next.state === "released" ? 420 : 140);
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
      renderNetwork(latest);

      const nextLayer = layerKey(scope);
      if (firstScan || nextLayer !== currentLayer) {
        firstScan = false;
        currentLayer = nextLayer;
        previous = nextEntries;
        const firstLive = ["processing", "queued", "released", "invalidated"]
          .flatMap((preferredState) => Array.from(nextEntries.entries()).filter(([, entry]) => entry.state === preferredState))
          .find(([, entry]) => visible(entry.target));
        if (firstLive) setTimer(() => enqueue({ key: firstLive[0], ...firstLive[1] }), 680);
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
    };

    const scheduleScan = () => {
      if (scanFrame || disposed) return;
      scanFrame = window.requestAnimationFrame(scan);
    };
    const scheduleGeometry = () => {
      if (geometryFrame || disposed) return;
      geometryFrame = window.requestAnimationFrame(() => {
        geometryFrame = 0;
        renderNetwork(latest);
      });
    };

    const isOwnNode = (node: Node): boolean => {
      if (node === pipe || pipe.contains(node)) return true;
      return node instanceof HTMLElement && node.classList.contains("vnd-live-token");
    };

    const observer = new MutationObserver((mutations) => {
      // Ignora mutações que são só as nossas próprias injeções (SVG do cano e os
      // tokens que voam): sem isso, cada token disparava rescan + rebuild completo.
      const meaningful = mutations.some((mutation) => {
        if (pipe.contains(mutation.target)) return false;
        if (mutation.type === "attributes") return true;
        const touched = [...mutation.addedNodes, ...mutation.removedNodes];
        return touched.some((node) => !isOwnNode(node));
      });
      if (meaningful) scheduleScan();
    });
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
      header.querySelectorAll<HTMLElement>(".vnd-enrichment-state.is-discharging").forEach((source) => {
        source.classList.remove("is-discharging");
      });
      root.querySelectorAll(".vnd-live-token").forEach((token) => token.remove());
      root.classList.remove("vnd-live-pipe-ready");
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
            <p>Quatro entradas fixas viram um único encanamento de vidro, com um braço dedicado para cada lead.</p>
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
            <em>O cartão de status percorre o braço fixo, toca a lateral do lead e aplica a nova cor.</em>
          </div>
        </div>
      </section>
    </>
  );
}
