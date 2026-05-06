"use client";

export const TOPBAR_PROGRESS_EVENT = "hbx:topbar-progress";

export type TopbarProgressMetric = {
  label: string;
  value: string;
};

export type TopbarProgressState = {
  source: string;
  phase: "loading" | "success";
  title: string;
  status: string;
  progress: number;
  metrics?: TopbarProgressMetric[];
};

export type TopbarProgressEventDetail =
  | { action: "show"; payload: TopbarProgressState }
  | { action: "clear"; source?: string };

export function dispatchTopbarProgress(payload: TopbarProgressState) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<TopbarProgressEventDetail>(TOPBAR_PROGRESS_EVENT, {
      detail: { action: "show", payload },
    }),
  );
}

export function clearTopbarProgress(source?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<TopbarProgressEventDetail>(TOPBAR_PROGRESS_EVENT, {
      detail: { action: "clear", source },
    }),
  );
}
