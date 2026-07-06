// ============================================================
// MOBILE-CASCA/W1 — API pública da casca (o que W2–W6 consomem).
// Importe daqui: `import { CascaView, CascaSheet, CascaLoading } from "@/components/casca";`
// ============================================================

// Moldura + integração (o AppShell já monta a MobileShell; workers raramente
// precisam disto, mas fica exportado).
export { MobileShell } from "./mobile-shell";

// Registry rota→tela mobile (registrar/ler telas).
export {
  CASCA_SCREENS,
  CASCA_TITLES,
  resolveCascaScreen,
  type CascaScreen,
} from "./registry";

// Transições centrais (LEI: nada abre/fecha seco) — a ÚNICA forma de empilhar.
export { CascaView, CascaSheet, useCascaExitGate } from "./transitions";

// Carregamento padrão da casca (marca HBX + anel que enche).
export { CascaLoading } from "./loading";

// Peças de apoio.
export { CascaFallback } from "./fallback";
export { CascaStub } from "./stub";

// Utilitários (libs) re-exportados pra API única.
export { useCascaMobile, CASCA_BP } from "@/lib/casca-mobile";
export { showCascaToast, dismissCascaToast, useCascaToast } from "@/lib/casca-toast";
export {
  enterCascaFullscreen,
  exitCascaFullscreen,
  toggleCascaFullscreen,
  isFullscreenActive,
  isFullscreenSupported,
} from "@/lib/casca-fullscreen";
