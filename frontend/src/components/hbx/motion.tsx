"use client";

import {
  useCallback,
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  type AnimationEvent as ReactAnimationEvent,
  type CSSProperties,
  type ReactNode,
  type TransitionEvent as ReactTransitionEvent,
} from "react";
import { createPortal } from "react-dom";

/**
 * Vocabulário ÚNICO de movimento do HBX.
 *
 * A intenção mora aqui; duração, curva e desenho moram em
 * hbx-theme/motion-system.css. Uma tela escolhe o significado do movimento,
 * nunca inventa keyframe, timer ou estado de fechamento.
 */
export const HBX_MOTIONS = [
  "surface",
  "drawer",
  "toast",
  "floating",
  "list",
  "switch",
  "disclosure",
  "view",
] as const;

export type HbxMotionKind = (typeof HBX_MOTIONS)[number];
export type HbxMotionPhase = "entering" | "entered" | "exiting" | "gone";

const PRESENCE_FALLBACK_MS = 520;
const EXIT_CLONE_FALLBACK_MS = 460;

type PresenceState = {
  phase: HbxMotionPhase;
  lastOpen: boolean;
};

type PresenceAction =
  | { type: "sync"; open: boolean }
  | { type: "entered" }
  | { type: "exit" }
  | { type: "gone" };

function presenceReducer(state: PresenceState, action: PresenceAction): PresenceState {
  switch (action.type) {
    case "sync":
      if (action.open === state.lastOpen) return state;
      return action.open
        ? { phase: "entering", lastOpen: true }
        : { phase: state.phase === "gone" ? "gone" : "exiting", lastOpen: false };
    case "entered":
      return state.phase === "entering" ? { ...state, phase: "entered" } : state;
    case "exit":
      return state.phase === "gone" || state.phase === "exiting"
        ? state
        : { ...state, phase: "exiting" };
    case "gone":
      return state.phase === "exiting" ? { ...state, phase: "gone" } : state;
    default:
      return state;
  }
}

function motionIsInstant(): boolean {
  if (typeof window === "undefined") return true;
  if (document.documentElement.dataset.casca === "corporativa") return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export type HbxMotionProps = {
  "data-hbx-motion": HbxMotionKind;
  "data-hbx-motion-state": Exclude<HbxMotionPhase, "gone">;
  "data-hbx-motion-managed": "presence";
  onTransitionEnd: (event: ReactTransitionEvent<HTMLElement>) => void;
  onAnimationEnd: (event: ReactAnimationEvent<HTMLElement>) => void;
};

export function useHbxPresence(
  open: boolean,
  options: {
    kind: HbxMotionKind;
    onExited?: () => void;
  },
) {
  const { kind, onExited } = options;
  const [state, dispatch] = useReducer(
    presenceReducer,
    open,
    (initialOpen): PresenceState => ({
      phase: initialOpen ? "entering" : "gone",
      lastOpen: initialOpen,
    }),
  );
  const exitFinishedRef = useRef(false);

  // O prop é o desejo do chamador. O DOM continua montado em "exiting" e só
  // some depois do evento real (ou do fallback de segurança).
  useEffect(() => {
    dispatch({ type: "sync", open });
  }, [open]);

  useEffect(() => {
    if (state.phase !== "entering") return;
    const frame = requestAnimationFrame(() => dispatch({ type: "entered" }));
    return () => cancelAnimationFrame(frame);
  }, [state.phase]);

  useEffect(() => {
    if (state.phase === "exiting") exitFinishedRef.current = false;
  }, [state.phase]);

  const finishExit = useCallback(() => {
    if (state.phase !== "exiting" || exitFinishedRef.current) return;
    exitFinishedRef.current = true;
    dispatch({ type: "gone" });
    onExited?.();
  }, [onExited, state.phase]);

  useEffect(() => {
    if (state.phase !== "exiting") return;
    if (motionIsInstant()) {
      const frame = requestAnimationFrame(finishExit);
      return () => cancelAnimationFrame(frame);
    }
    const timer = window.setTimeout(finishExit, PRESENCE_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [finishExit, state.phase]);

  const requestClose = useCallback(() => {
    dispatch({ type: "exit" });
  }, []);

  const handleMotionEnd = useCallback(
    (event: ReactTransitionEvent<HTMLElement> | ReactAnimationEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) return;
      finishExit();
    },
    [finishExit],
  );

  const renderedPhase = state.phase === "gone" ? "exiting" : state.phase;
  const motionProps: HbxMotionProps = {
    "data-hbx-motion": kind,
    "data-hbx-motion-state": renderedPhase,
    "data-hbx-motion-managed": "presence",
    onTransitionEnd: handleMotionEnd,
    onAnimationEnd: handleMotionEnd,
  };

  return {
    mounted: state.phase !== "gone",
    leaving: state.phase === "exiting",
    phase: state.phase,
    requestClose,
    finishExit,
    motionProps,
  };
}

/**
 * Camada pronta para os próximos modais/drawers. Ela já concentra portal,
 * Escape, clique fora e presença bidirecional.
 */
export function HbxMotionLayer({
  open,
  kind = "surface",
  className,
  children,
  onClose,
  ariaLabel,
}: {
  open: boolean;
  kind?: "surface" | "drawer" | "floating";
  className?: string;
  children: ReactNode;
  onClose: () => void;
  ariaLabel?: string;
}) {
  const presence = useHbxPresence(open, { kind, onExited: onClose });
  const requestClose = presence.requestClose;

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, requestClose]);

  if (!presence.mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      {...presence.motionProps}
      className={className ?? "hbx-veil"}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

const AUTO_MOTION_SELECTOR = [
  ".hbx-page",
  ".app-page",
  ".hbx-veil",
  ".hbx-modal",
  ".hbx-pop",
  ".hbx-drawer",
  ".hbx-drawer-bottom",
  ".hbx-toast",
  ".hot-toast",
  ".hbx-motion-list",
  ".hbx-motion-switch",
  ".hbx-motion-disclosure",
  "[role='dialog']",
  "[role='alertdialog']",
  "[role='menu']",
  "[role='listbox']",
  "[role='tooltip']",
  "[role='tabpanel']",
  "[role='listitem']",
  "[popover]",
  "dialog",
  "details",
  "tbody > tr",
  "li",
  ".deal",
  ".conv",
].join(",");

function classifyMotion(element: HTMLElement): HbxMotionKind | null {
  if (element.dataset.hbxMotionIgnore === "true") return null;
  const explicit = element.dataset.hbxMotion as HbxMotionKind | undefined;
  if (explicit && HBX_MOTIONS.includes(explicit)) return explicit;

  if (element.matches("details, .hbx-motion-disclosure")) return "disclosure";
  if (element.matches(".hbx-page, .app-page")) return "view";
  if (element.matches(".hbx-toast, .hot-toast")) return "toast";
  if (element.matches(".hbx-motion-switch, [role='tabpanel']")) return "switch";
  if (
    element.matches(
      ".hbx-pop, [popover], [role='menu'], [role='listbox'], [role='tooltip']",
    )
  ) {
    return "floating";
  }
  if (element.matches(".hbx-drawer, .hbx-drawer-bottom")) return "drawer";
  if (element.matches(".hbx-veil")) {
    return element.querySelector(
      ":scope > .hbx-drawer, :scope > .hbx-drawer-bottom",
    )
      ? "drawer"
      : "surface";
  }
  if (element.matches("dialog, .hbx-modal, [role='dialog'], [role='alertdialog']")) {
    return "surface";
  }
  if (
    element.matches(
      ".hbx-motion-list, [role='listitem'], tbody > tr, li, .deal, .conv",
    )
  ) {
    return "list";
  }
  return null;
}

function isControlledByOverlay(element: HTMLElement, kind: HbxMotionKind): boolean {
  if (kind === "list" || kind === "switch" || kind === "disclosure") return false;
  const parent = element.parentElement?.closest<HTMLElement>(
    "[data-hbx-motion='surface'], [data-hbx-motion='drawer']",
  );
  return Boolean(parent);
}

function isClosingByLegacyClass(element: HTMLElement): boolean {
  const value = element.className;
  if (typeof value !== "string") return false;
  return /\bis-leaving\b|\bis-closing\b|--closing\b|--leave\b/.test(value);
}

function sanitizeExitClone(source: HTMLElement, clone: HTMLElement) {
  clone.removeAttribute("id");
  clone.removeAttribute("aria-live");
  clone.setAttribute("aria-hidden", "true");
  clone.setAttribute("inert", "");
  clone.dataset.hbxMotionClone = "true";
  clone.dataset.hbxMotionState = "entered";

  clone.querySelectorAll<HTMLElement>("[id]").forEach((node) => node.removeAttribute("id"));
  clone
    .querySelectorAll<HTMLElement>("[aria-live]")
    .forEach((node) => node.removeAttribute("aria-live"));
  clone
    .querySelectorAll<HTMLElement>("[autofocus]")
    .forEach((node) => node.removeAttribute("autofocus"));
  clone.querySelectorAll("script, style, link").forEach((node) => node.remove());

  const sourceFields = source.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >("input, textarea, select");
  const cloneFields = clone.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >("input, textarea, select");
  sourceFields.forEach((field, index) => {
    const copy = cloneFields[index];
    if (!copy) return;
    copy.value = field.value;
    if (field instanceof HTMLInputElement && copy instanceof HTMLInputElement) {
      copy.checked = field.checked;
    }
  });
}

function collectMotionRoots(node: Node): HTMLElement[] {
  if (!(node instanceof HTMLElement)) return [];
  const candidates = [
    ...(node.matches("[data-hbx-motion]") ? [node] : []),
    ...node.querySelectorAll<HTMLElement>("[data-hbx-motion]"),
  ];
  const pool = new Set(candidates);
  return candidates.filter((candidate) => {
    let parent = candidate.parentElement;
    while (parent && parent !== node.parentElement) {
      if (pool.has(parent)) return false;
      parent = parent.parentElement;
    }
    return true;
  });
}

function HbxMotionBridge() {
  useEffect(() => {
    const roots = new Set<HTMLElement>();
    const rects = new WeakMap<HTMLElement, DOMRect>();
    const html = document.documentElement;
    let initialPass = true;

    const canAnimate = () => !motionIsInstant();
    const rememberRect = (element: HTMLElement) => {
      if (!element.isConnected) return;
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) rects.set(element, rect);
    };
    const refreshRects = () => {
      roots.forEach((element) => {
        if (element.isConnected) rememberRect(element);
        else roots.delete(element);
      });
    };

    const enter = (element: HTMLElement, kind: HbxMotionKind, animate: boolean) => {
      if (element.dataset.hbxMotionManaged === "presence") return;
      if (isControlledByOverlay(element, kind)) return;

      element.dataset.hbxMotion = kind;
      element.dataset.hbxMotionRuntime = "true";
      element.dataset.hbxMotionState = animate && canAnimate() ? "entering" : "entered";
      roots.add(element);
      rememberRect(element);

      if (element.dataset.hbxMotionState === "entering") {
        requestAnimationFrame(() => {
          if (element.isConnected && element.dataset.hbxMotionState === "entering") {
            element.dataset.hbxMotionState = "entered";
            rememberRect(element);
          }
        });
      }
    };

    const mapTree = (node: Node, animate = true) => {
      if (!(node instanceof HTMLElement)) return;
      const candidates = [
        ...(node.matches(AUTO_MOTION_SELECTOR) ? [node] : []),
        ...node.querySelectorAll<HTMLElement>(AUTO_MOTION_SELECTOR),
      ];
      candidates.forEach((element) => {
        if (element.dataset.hbxMotionClone === "true") return;
        const kind = classifyMotion(element);
        if (kind) enter(element, kind, animate && !(initialPass && kind === "list"));
      });
    };

    const removeClone = (clone: HTMLElement) => {
      if (!clone.isConnected) return;
      clone.remove();
    };

    const animateRemovedTree = (node: Node) => {
      if (!canAnimate()) return;
      collectMotionRoots(node).forEach((source) => {
        if (source.isConnected) return;
        if (source.dataset.hbxMotionManaged === "presence") return;
        if (source.dataset.hbxMotionState === "exiting") return;
        if (isClosingByLegacyClass(source)) return;

        const rect = rects.get(source);
        if (!rect || rect.width <= 0 || rect.height <= 0) return;

        const clone = source.cloneNode(true) as HTMLElement;
        sanitizeExitClone(source, clone);
        clone.style.setProperty("--hbx-motion-clone-top", `${rect.top}px`);
        clone.style.setProperty("--hbx-motion-clone-left", `${rect.left}px`);
        clone.style.setProperty("--hbx-motion-clone-width", `${rect.width}px`);
        clone.style.setProperty("--hbx-motion-clone-height", `${rect.height}px`);
        document.body.appendChild(clone);

        const finish = (event?: TransitionEvent | AnimationEvent) => {
          if (event && event.target !== clone) return;
          removeClone(clone);
        };
        clone.addEventListener("transitionend", finish);
        clone.addEventListener("animationend", finish);
        window.setTimeout(() => removeClone(clone), EXIT_CLONE_FALLBACK_MS);
        void clone.offsetWidth;
        clone.dataset.hbxMotionState = "exiting";
      });
    };

    mapTree(document.body, true);
    initialPass = false;

    const observer = new MutationObserver((records) => {
      records.forEach((record) => {
        record.removedNodes.forEach(animateRemovedTree);
      });
      records.forEach((record) => {
        record.addedNodes.forEach((node) => mapTree(node, true));
      });
      refreshRects();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const setForward = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(target instanceof HTMLAnchorElement)) return;
      if (target.target && target.target !== "_self") return;
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      try {
        if (new URL(target.href, location.href).origin !== location.origin) return;
      } catch {
        return;
      }
      html.dataset.hbxMotionDirection = "forward";
      refreshRects();
    };
    const setBack = () => {
      html.dataset.hbxMotionDirection = "back";
      refreshRects();
    };
    const refresh = () => refreshRects();

    document.addEventListener("pointerdown", setForward, true);
    window.addEventListener("popstate", setBack);
    window.addEventListener("resize", refresh, { passive: true });
    window.addEventListener("scroll", refresh, { passive: true, capture: true });

    return () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", setForward, true);
      window.removeEventListener("popstate", setBack);
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
      document
        .querySelectorAll<HTMLElement>("[data-hbx-motion-clone='true']")
        .forEach((clone) => clone.remove());
    };
  }, []);

  return null;
}

type TooltipPayload = {
  target: HTMLElement;
  text: string;
  top: number;
  left: number;
  placement: "top" | "bottom";
};

type TooltipPositionStyle = CSSProperties & {
  "--hbx-tooltip-top": string;
  "--hbx-tooltip-left": string;
};

function tooltipPosition(target: HTMLElement): Omit<TooltipPayload, "target" | "text"> {
  const rect = target.getBoundingClientRect();
  const placement = rect.top > 52 ? "top" : "bottom";
  const safeHalf = Math.max(12, Math.min(150, window.innerWidth / 2 - 12));
  return {
    top: placement === "top" ? rect.top - 8 : rect.bottom + 8,
    left: Math.min(window.innerWidth - safeHalf, Math.max(safeHalf, rect.left + rect.width / 2)),
    placement,
  };
}

function HbxTooltipHost() {
  const tooltipId = useId();
  const [payload, setPayload] = useState<TooltipPayload | null>(null);
  const [visible, setVisible] = useState(false);
  const currentRef = useRef<HTMLElement | null>(null);
  const titlesRef = useRef(new WeakMap<HTMLElement, string>());
  const descriptionsRef = useRef(new WeakMap<HTMLElement, string | null>());
  const presence = useHbxPresence(visible, { kind: "floating" });

  const restore = useCallback(
    (target: HTMLElement | null) => {
      if (!target) return;
      const originalTitle = titlesRef.current.get(target);
      if (originalTitle !== undefined) {
        target.setAttribute("title", originalTitle);
        titlesRef.current.delete(target);
      }
      const originalDescription = descriptionsRef.current.get(target);
      if (originalDescription === null) target.removeAttribute("aria-describedby");
      else if (originalDescription !== undefined) {
        target.setAttribute("aria-describedby", originalDescription);
      }
      descriptionsRef.current.delete(target);
    },
    [],
  );

  const hide = useCallback(
    (target?: HTMLElement) => {
      if (target && currentRef.current !== target) return;
      restore(currentRef.current);
      currentRef.current = null;
      setVisible(false);
    },
    [restore],
  );

  const show = useCallback(
    (target: HTMLElement) => {
      const title = target.getAttribute("title");
      if (!title?.trim() || target.dataset.hbxTooltipDisabled === "true") return;
      if (currentRef.current && currentRef.current !== target) restore(currentRef.current);

      titlesRef.current.set(target, title);
      descriptionsRef.current.set(target, target.getAttribute("aria-describedby"));
      target.removeAttribute("title");
      const describedBy = target.getAttribute("aria-describedby");
      target.setAttribute(
        "aria-describedby",
        describedBy ? `${describedBy} ${tooltipId}` : tooltipId,
      );
      currentRef.current = target;
      setPayload({ target, text: title, ...tooltipPosition(target) });
      setVisible(true);
    },
    [restore, tooltipId],
  );

  useEffect(() => {
    const findTrigger = (event: Event) =>
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[title]:not([data-hbx-tooltip-disabled='true'])")
        : null;
    const onPointerOver = (event: PointerEvent) => {
      const target = findTrigger(event);
      if (target) show(target);
    };
    const onPointerOut = (event: PointerEvent) => {
      const target = currentRef.current;
      if (!target) return;
      if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return;
      if (document.activeElement === target) return;
      hide(target);
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = findTrigger(event);
      if (target) show(target);
    };
    const onFocusOut = (event: FocusEvent) => {
      const target = currentRef.current;
      if (!target) return;
      if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return;
      if (target.matches(":hover")) return;
      hide(target);
    };
    const reposition = () => {
      const target = currentRef.current;
      if (!target?.isConnected) {
        hide(target ?? undefined);
        return;
      }
      setPayload((current) =>
        current ? { ...current, ...tooltipPosition(target) } : current,
      );
    };

    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    window.addEventListener("resize", reposition, { passive: true });
    window.addEventListener("scroll", reposition, { passive: true, capture: true });
    return () => {
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerout", onPointerOut, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      restore(currentRef.current);
    };
  }, [hide, restore, show]);

  if (!payload || !presence.mounted || typeof document === "undefined") return null;

  const style: TooltipPositionStyle = {
    "--hbx-tooltip-top": `${payload.top}px`,
    "--hbx-tooltip-left": `${payload.left}px`,
  };

  return createPortal(
    <span
      className="hbx-tooltip-anchor"
      data-placement={payload.placement}
      style={style}
      aria-hidden={!visible}
    >
      <span
        {...presence.motionProps}
        id={tooltipId}
        className="hbx-tooltip"
        role="tooltip"
      >
        {payload.text}
      </span>
    </span>,
    document.body,
  );
}

/** Montado uma vez na casca: ponte para legados + tooltips centralizados. */
export function HbxMotionRuntime() {
  return (
    <>
      <HbxMotionBridge />
      <HbxTooltipHost />
    </>
  );
}
