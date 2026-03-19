export type HbxWindowResizeHandle =
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw";

export type HbxWindowTransitionStage = "idle" | "enter" | "exit";

export type HbxWindowSurfaceTone = "default" | "info" | "error" | "success";

export type HbxWindowShadowSpec = {
  whiteHalo: string;
  depth: string;
  inset: string;
};

export type HbxWindowMotionSpec = {
  enterMs: number;
  exitMs: number;
  enterEasing: string;
  exitEasing: string;
  enterFrom: {
    opacity: number;
    translateY: number;
    scale: number;
    blur: number;
  };
  exitTo: {
    opacity: number;
    translateY: number;
    scale: number;
    blur: number;
  };
};

export type HbxWindowStandardSpec = {
  version: "2026-03-14";
  owner: "Recovery";
  designIntent:
    | "premium-admin"
    | "overlay-first"
    | "mobile-aware"
    | "module-standard";
  resizeHandles: readonly HbxWindowResizeHandle[];
  minimumSize: {
    width: number;
    height: number;
  };
  borderRadius: number;
  borderColor: string;
  background: string;
  shadow: HbxWindowShadowSpec;
  motion: HbxWindowMotionSpec;
  organizer: {
    compactCardsPerRowMin: number;
    darkBackdrop: string;
    showGripButton: true;
  };
  preview: {
    renderMode: "portal-fixed";
    zIndex: number;
    keepAboveWorkspace: true;
  };
};

export const HBX_WINDOW_STANDARD: HbxWindowStandardSpec = {
  version: "2026-03-14",
  owner: "Recovery",
  designIntent: "module-standard",
  resizeHandles: ["n", "s", "e", "w", "ne", "nw", "se", "sw"],
  minimumSize: {
    width: 280,
    height: 220,
  },
  borderRadius: 22,
  borderColor: "color-mix(in srgb, var(--line) 88%, white)",
  background:
    "radial-gradient(circle at top left, rgba(255,255,255,0.92), transparent 42%), linear-gradient(180deg, #ffffff, #f8fbff 72%, #f3f7fb)",
  shadow: {
    whiteHalo: "0 0 0 10px rgba(255, 255, 255, 1), 0 0 38px 14px rgba(255, 255, 255, 1)",
    depth: "0 34px 80px -36px rgba(15, 23, 42, 0.72), 0 22px 42px -28px rgba(15, 23, 42, 0.46)",
    inset: "inset 0 1px 0 rgba(255, 255, 255, 0.92)",
  },
  motion: {
    enterMs: 240,
    exitMs: 170,
    enterEasing: "cubic-bezier(0.22, 1, 0.36, 1)",
    exitEasing: "cubic-bezier(0.4, 0, 1, 1)",
    enterFrom: {
      opacity: 0,
      translateY: 16,
      scale: 0.988,
      blur: 8,
    },
    exitTo: {
      opacity: 0,
      translateY: -10,
      scale: 0.992,
      blur: 6,
    },
  },
  organizer: {
    compactCardsPerRowMin: 6,
    darkBackdrop: "rgba(9, 15, 27, 0.58)",
    showGripButton: true,
  },
  preview: {
    renderMode: "portal-fixed",
    zIndex: 90,
    keepAboveWorkspace: true,
  },
};

export const HBX_INTENSITY_DEFAULT = 0;

export function buildHbxIntensityStorageKey(userId?: string | number | null) {
  const suffix = String(userId || "anonymous").trim() || "anonymous";
  return `hbx:intensity:${suffix}`;
}

export function isHbxWindowStandardResizeHandle(value: string): value is HbxWindowResizeHandle {
  return HBX_WINDOW_STANDARD.resizeHandles.includes(value as HbxWindowResizeHandle);
}
