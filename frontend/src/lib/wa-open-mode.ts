"use client";

// Preferência "ao clicar no WhatsApp de um lead, abrir onde?": atendimento INTERNO
// (POST /inbox/conversations/start → /atendimento) ou WhatsApp EXTERNO (wa.me).
// É um PADRÃO escolhido uma vez (Topbar → ícone do WhatsApp) e respeitado por todo
// ícone de ação WhatsApp (Vendas, Radar/Leads) — sem perguntar a cada clique.
// Guardado por dispositivo no localStorage (mesma linha dos demais ajustes de cliente,
// ex.: tema/pele). Default = externo (wa.me funciona sem WhatsApp conectado).

import { useSyncExternalStore } from "react";

export type WaOpenMode = "internal" | "external";

const KEY = "hbx:wa-open-mode";
const EVENT = "hbx:wa-open-mode-changed";
const DEFAULT: WaOpenMode = "external";

export function getWaOpenMode(): WaOpenMode {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const v = localStorage.getItem(KEY);
    return v === "internal" || v === "external" ? v : DEFAULT;
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
