// ================================================================
// GEOLOCALIZAÇÃO DO RADAR — fonte ÚNICA (MOBILE-CASCA/FIX3, 06/07).
//
// Extraído de components/hbx/shell.tsx (toggleGeo/geoState) pra virar lib
// compartilhada: o pin "Usar minha localização no Radar" do desktop (topbar,
// shell.tsx ~linha 1467) e o item equivalente no mobile (folha Mais) usam o
// MESMO estado — nunca duas lógicas. Contrato mantido 100% idêntico ao que já
// existia (nada muda pro desktop):
//   - localStorage["hbx:geo"] = { lat, lng } | ausente
//   - CustomEvent("hbx:geo-updated", { detail: {lat,lng} | null }) — quem
//     consome (ex.: app/(app)/leads/page.client.tsx) continua reagindo igual.
//
// SignalState (off|active|error) é o MESMO tri-estado visual do resto dos
// sinalizadores do topo (shell.tsx) — reexportado daqui pra não duplicar tipo.
// ================================================================

import type { SignalState } from "@/components/hbx/shell";

const GEO_KEY = "hbx:geo";
const GEO_EVENT = "hbx:geo-updated";

export type GeoPoint = { lat: number; lng: number };

function readStored(): GeoPoint | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(GEO_KEY);
    if (!stored) return null;
    const p = JSON.parse(stored);
    if (p?.lat && p?.lng) return { lat: p.lat, lng: p.lng };
  } catch { /* sem storage */ }
  return null;
}

/** Estado inicial SEMPRE "off" (evita mismatch de hidratação) — leitura real
 * do localStorage só acontece depois da montagem, via subscribeGeoUpdated. */
export function getInitialGeoState(): SignalState {
  return "off";
}

export function hasStoredGeo(): boolean {
  return readStored() !== null;
}

/** Assina mudanças (o próprio toggle já dispara o evento) — usado por
 * useSyncExternalStore ou useEffect nos consumidores (desktop e mobile). */
export function subscribeGeoUpdated(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(GEO_EVENT, cb);
  return () => window.removeEventListener(GEO_EVENT, cb);
}

/** Liga/desliga a geolocalização (mesmo fluxo pro desktop e pro mobile).
 * Devolve o novo SignalState pro chamador atualizar o próprio state visual. */
export function toggleGeoRadar(
  current: SignalState,
  onChange: (next: SignalState) => void,
): void {
  if (current === "active") {
    try { localStorage.removeItem(GEO_KEY); } catch { /* sem storage */ }
    onChange("off");
    window.dispatchEvent(new CustomEvent(GEO_EVENT, { detail: null }));
    return;
  }
  if (!navigator.geolocation) {
    onChange("error");
    return;
  }
  onChange("error"); // amarelo enquanto aguarda
  navigator.geolocation.getCurrentPosition(
    pos => {
      const payload: GeoPoint = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      try { localStorage.setItem(GEO_KEY, JSON.stringify(payload)); } catch { /* sem storage */ }
      onChange("active");
      window.dispatchEvent(new CustomEvent(GEO_EVENT, { detail: payload }));
    },
    () => {
      onChange("off");
      try { localStorage.removeItem(GEO_KEY); } catch { /* sem storage */ }
    },
    { timeout: 10_000 },
  );
}
