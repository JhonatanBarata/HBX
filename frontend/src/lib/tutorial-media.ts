"use client";

// TUTORIAL FRONT — cliente da mídia do tutorial. GET público (manifesto) + as
// escritas master-only (upload/modo/remover). O vídeo em si mora em
// /uploads/tutorial/* (servido estático pelo backend); a URL absoluta sai do
// mesmo resolvedor da mídia do inbox (getApiBase()+url).

import { apiFetch, getApiBase } from "@/lib/api";

export type TutorialMode = "video" | "light";
export type TutorialStepMedia = { url: string; mode: TutorialMode; filename: string; updatedAt: string };
export type TutorialManifest = { steps: Record<string, TutorialStepMedia> };

export function fetchTutorialManifest(): Promise<TutorialManifest> {
  return apiFetch<TutorialManifest>("/tutorial-media").catch(() => ({ steps: {} }));
}

export function uploadTutorialVideo(stepId: string, file: File): Promise<TutorialStepMedia> {
  const form = new FormData();
  form.append("file", file);
  return apiFetch<TutorialStepMedia>(`/tutorial-media/${stepId}`, { method: "POST", body: form });
}

export function setTutorialMode(stepId: string, mode: TutorialMode): Promise<TutorialStepMedia> {
  return apiFetch<TutorialStepMedia>(`/tutorial-media/${stepId}`, {
    method: "PATCH",
    body: JSON.stringify({ mode }),
  });
}

export function removeTutorialVideo(stepId: string): Promise<TutorialManifest> {
  return apiFetch<TutorialManifest>(`/tutorial-media/${stepId}`, { method: "DELETE" });
}

// Absolutiza a URL relativa do manifesto (mesma regra do resolveMediaUrl do chat).
export function tutorialMediaUrl(u?: string | null): string {
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  const base = getApiBase();
  return u.startsWith("/") ? base + u : `${base}/${u}`;
}
