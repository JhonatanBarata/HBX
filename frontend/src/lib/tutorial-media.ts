"use client";

// TUTORIAL FRONT — cliente do conteúdo do tutorial. O manifesto (guias → telas)
// é a fonte da verdade e vem do backend: leitura pública, escrita master-only.
// O vídeo de cada tela é upload (arquivo servido em /uploads/tutorial/*) ou LINK
// externo (YouTube, Vimeo, ou url direta de vídeo).

import { apiFetch, getApiBase } from "@/lib/api";

export type TutorialMode = "video" | "light";
export type TutorialMediaKind = "upload" | "link";

export type TutorialMedia = {
  kind: TutorialMediaKind;
  url: string;
  mode: TutorialMode;
  filename?: string;
  updatedAt: string;
};

export type TutorialStep = { id: string; title: string; desc: string; media?: TutorialMedia | null };
export type TutorialGuide = { id: string; label: string; hint: string; steps: TutorialStep[] };
export type TutorialManifest = { version: number; guides: TutorialGuide[] };

export function fetchTutorialManifest(): Promise<TutorialManifest> {
  return apiFetch<TutorialManifest>("/tutorial-media").catch(() => ({ version: 2, guides: [] }));
}

export function saveTutorialStructure(manifest: TutorialManifest): Promise<TutorialManifest> {
  return apiFetch<TutorialManifest>("/tutorial-media", {
    method: "PUT",
    body: JSON.stringify(manifest),
  });
}

export function uploadTutorialVideo(stepId: string, file: File): Promise<TutorialManifest> {
  const form = new FormData();
  form.append("file", file);
  return apiFetch<TutorialManifest>(`/tutorial-media/${stepId}/upload`, { method: "POST", body: form });
}

// Absolutiza a url de upload (mesma regra da mídia do inbox). Link externo passa direto.
export function tutorialMediaUrl(u?: string | null): string {
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  const base = getApiBase();
  return u.startsWith("/") ? base + u : `${base}/${u}`;
}

// Como a tela deve tocar a mídia: player embutido (YouTube/Vimeo) ou <video>.
export type TutorialPlayback = { kind: "iframe" | "video"; src: string } | null;

export function resolvePlayback(media?: TutorialMedia | null): TutorialPlayback {
  if (!media?.url) return null;
  if (media.kind === "upload") return { kind: "video", src: tutorialMediaUrl(media.url) };

  const raw = media.url.trim();
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return null; }
  const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();

  // YouTube: watch?v=ID, youtu.be/ID, /shorts/ID, /embed/ID
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    const id = parsed.searchParams.get("v")
      || (parsed.pathname.match(/^\/(?:shorts|embed|v)\/([\w-]{6,})/)?.[1] ?? "");
    if (id) return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${id}` };
  }
  if (host === "youtu.be") {
    const id = parsed.pathname.replace(/^\//, "").split("/")[0];
    if (id) return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${id}` };
  }

  // Vimeo: vimeo.com/ID
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = parsed.pathname.match(/(\d{6,})/)?.[1];
    if (id) return { kind: "iframe", src: `https://player.vimeo.com/video/${id}` };
  }

  // Qualquer outra url: trata como arquivo de vídeo direto (.mp4 etc.).
  return { kind: "video", src: raw };
}
