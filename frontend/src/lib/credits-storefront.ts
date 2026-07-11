"use client";

// CRÉDITOS (cutover 06/07) — vitrine PÚBLICA do modelo grátis. Gêmeo de
// `plans.tsx` (fetchPublicPlans): alimenta o cadastro e o
// cadastro (/register) SEM auth, só dados de marketing. Fonte da verdade é o
// backend (`GET /credits/public-catalog`, credits-public.controller.ts):
//   - HBX_CREDITS_ENABLED OFF → { enabled:false, packs:[] } → front mantém a
//     vitrine de PLANOS de hoje (regressão zero).
//   - HBX_CREDITS_ENABLED ON  → { enabled:true, packs:[...], welcomeCredits }
//     → front troca pra pitch "cadastre-se grátis, ganhe X créditos".
// Pro modelo grátis (D1) o front só usa `enabled` + `welcomeCredits` — os
// pacotes pagos (`packs`) ficam pra fase paga (recarga), fora de escopo aqui.

import { apiFetch } from "@/lib/api";

export type CreditPackPublic = {
  key: string;
  title: string;
  credits: number;
  price: number;
  badge: string | null;
  recommended: boolean;
  paused: boolean;
  observation: string;
  expiryDays: number;
};

export type CreditStorefront = {
  enabled: boolean;
  packs: CreditPackPublic[];
  welcomeCredits: number;
  welcomeExpiryDays: number;
  // F3 (CONFIRMACAO-TELEFONE): quando true, o cadastro grátis exige confirmar o
  // WhatsApp por código pra soltar o brinde. Default false → front não muda nada.
  requiresPhoneVerification: boolean;
};

const FALLBACK_STOREFRONT: CreditStorefront = {
  enabled: false,
  packs: [],
  welcomeCredits: 0,
  welcomeExpiryDays: 0,
  requiresPhoneVerification: false,
};

let _cache: CreditStorefront | null = null;

export async function fetchCreditStorefront(): Promise<CreditStorefront> {
  if (_cache) return _cache;
  try {
    const data = await apiFetch<CreditStorefront>("/credits/public-catalog");
    if (data && typeof data.enabled === "boolean") {
      _cache = {
        enabled: data.enabled,
        packs: Array.isArray(data.packs) ? data.packs : [],
        welcomeCredits: Number(data.welcomeCredits) || 0,
        welcomeExpiryDays: Number(data.welcomeExpiryDays) || 0,
        requiresPhoneVerification: Boolean(data.requiresPhoneVerification),
      };
      return _cache;
    }
  } catch { /* usa fallback (regressão zero: cai no modelo de planos) */ }
  return FALLBACK_STOREFRONT;
}
