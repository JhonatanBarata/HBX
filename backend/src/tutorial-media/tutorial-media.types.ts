// Formato do manifesto do tutorial (fonte da verdade do conteúdo público).
// v2: o conteúdo virou EDITÁVEL pelo /master — título, descrição, adicionar/
// remover tela e vídeo por upload OU por link (YouTube etc.).

export type TutorialMode = 'video' | 'light';
export type TutorialMediaKind = 'upload' | 'link';

export type TutorialMedia = {
  kind: TutorialMediaKind;
  // upload → caminho relativo (/uploads/tutorial/x.mp4); link → URL externa.
  url: string;
  mode: TutorialMode;
  filename?: string;
  updatedAt: string;
};

export type TutorialStep = {
  id: string;
  title: string;
  desc: string;
  media?: TutorialMedia | null;
};

export type TutorialGuide = {
  id: string;
  label: string;
  hint: string;
  steps: TutorialStep[];
};

export type TutorialManifest = {
  version: number;
  guides: TutorialGuide[];
};
