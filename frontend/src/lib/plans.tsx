"use client";

// Resto útil da antiga fonte de dados de plano (PR16062030 → aposentada no
// W3/PR10072026 com a demolição do fluxo de plano/trial no front): sobraram o
// formatador de moeda e os SVG paths compartilhados da explicação de créditos.
// FALLBACK_PLANS/fetchPublicPlans/PLAN_STATIC morreram junto com o checkout de
// plano — preço agora só existe no modelo crédito (catálogo de packs da API).

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── SVG paths compartilhados ────────────────────────────────────────────────
export const IC_TARGET    = ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M12 12h.01"];
// Ícones da explicação de créditos (carteira) — mesma família 24×24.
export const IC_SEARCH    = ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z", "m21 21-4.3-4.3"];
export const IC_REFRESH   = ["M21 12a9 9 0 1 1-3-6.7", "M21 4v5h-5"];
export const IC_CAL       = ["M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z", "M4 9h16", "M9 3v4", "M15 3v4"];
