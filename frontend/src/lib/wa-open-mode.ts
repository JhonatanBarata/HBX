"use client";

// Preferência "ao clicar no WhatsApp de um lead, abrir onde?": atendimento INTERNO,
// WhatsApp EXTERNO neste computador ou HBX MOBILE (manda número + texto ao celular
// vinculado). É um padrão escolhido uma vez e respeitado pelos atalhos globais.
// Guardado por dispositivo no localStorage. Default = externo.

import { useSyncExternalStore } from "react";

export type WaOpenMode = "internal" | "external" | "mobile";

const KEY = "hbx:wa-open-mode";
const EVENT = "hbx:wa-open-mode-changed";
const DEFAULT: WaOpenMode = "external";

export function getWaOpenMode(): WaOpenMode {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const v = localStorage.getItem(KEY);
    return v === "internal" || v === "external" || v === "mobile" ? v : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function setWaOpenMode(mode: WaOpenMode) {
  try { localStorage.setItem(KEY, mode); } catch { /* sem storage */ }
  // avisa os consumidores na MESMA aba (o evento 'storage' só dispara em outras abas)
  try { window.dispatchEvent(new CustomEvent(EVENT, { detail: { mode } })); } catch { /* */ }
}

function subscribe(cb: () => void) {
  const onCustom = () => cb();
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(); };
  window.addEventListener(EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

// Hook reativo (mesma técnica do seletor de pele): re-renderiza quando o padrão muda.
export function useWaOpenMode(): WaOpenMode {
  return useSyncExternalStore(subscribe, getWaOpenMode, () => DEFAULT);
}
