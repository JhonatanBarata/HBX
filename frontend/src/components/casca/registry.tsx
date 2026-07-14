"use client";

// ============================================================
// MOBILE-CASCA/W1 — REGISTRY rota→tela mobile.
//
// SÓ o que está registrado aqui renderiza no celular. Rota do grupo (app) sem
// versão mobile → FALLBACK central ("Disponível no computador"). Assim a casca
// NUNCA quebra por construção — uma tela nova só aparece quando alguém a
// registra. W2–W6 substituem os stubs pelo miolo real (mesma chave).
//
// Como registrar (W2–W6):
//   1. Crie a tela mobile (ex.: components/casca/screens/vendas.tsx).
//   2. Troque o stub abaixo pelo seu componente em CASCA_SCREENS[<rota>].
//   O título do topo vem de CASCA_TITLES (ou do AppShell META, se preferir).
// ============================================================

import React from "react";

import { MobileDevicePanel } from "@/app/(app)/configuracoes/aplicativo/mobile-device-panel";
import { LeadRunClient } from "@/app/(app)/leads/runs/[runId]/page.client";
import { ConfiguracoesMobile } from "./screens/configuracoes";
import { ConversasMobile } from "./screens/conversas";
import { EmpresasMobile } from "./screens/empresas";
import { VendasMobile } from "./screens/vendas";

// Tela mobile = componente sem props (consome os mesmos hooks/endpoints do
// desktop). O registry casa pelo pathname exato.
export type CascaScreen = React.ComponentType;

// Mapa rota→tela. Chave = pathname canônico (o mesmo do AppShell META).
// W2 (Vendas): /vendas E /leads usam <VendasMobile/> (uma tela, dois modos —
// spec do W2). Em /leads a tela abre direto no modo Buscar (ela lê o pathname);
// assim quem chega pelo alias (/webscraping → /leads) ou por link interno vê a
// tela na hora, sem fallback, mesmo antes do redirect client-side
// (leads/redirect.client.tsx) resolver.
// W3 (Conversas): <ConversasMobile/> — lista + chat takeover.
// W4 (Empresas): <EmpresasMobile/> — lista + ficha bottom sheet.
// W5 (Mais/Config): <ConfiguracoesMobile/> — whitelist curada (Conta/WhatsApp/
// Equipe/Aparência); o resto (IA/avançado/cobrança/automações) NÃO é
// registrado aqui de propósito — cai no fallback central. A folha "Mais" em
// si (components/casca/screens/mais-sheet.tsx) é uma CascaSheet acionada pela
// tab bar, não uma tela registrada no pathname.
export const CASCA_SCREENS: Record<string, CascaScreen> = {
  "/vendas": VendasMobile,
  "/leads": VendasMobile,
  "/atendimento": ConversasMobile,
  "/empresas": EmpresasMobile,
  "/configuracoes": ConfiguracoesMobile,
  "/configuracoes/aplicativo": MobileDevicePanel,
};

// Título do topo por rota (1 linha). Sem entrada = usa o title do AppShell META
// (MobileShell resolve o fallback). Mantido separado pro registry ser a fonte
// única do que a casca conhece.
export const CASCA_TITLES: Record<string, string> = {
  "/vendas": "Vendas",
  "/leads": "Vendas",
  "/atendimento": "Conversas",
  "/empresas": "Empresas",
  "/configuracoes": "Configurações",
  "/configuracoes/aplicativo": "Aplicativo móvel",
};

/** Devolve a tela mobile registrada para a rota, ou null (→ fallback central). */
export function resolveCascaScreen(pathname: string): CascaScreen | null {
  if (/^\/leads\/runs\/[^/]+$/.test(pathname)) return LeadRunClient;
  return CASCA_SCREENS[pathname] || null;
}

/**
 * Renderiza a tela registrada como ELEMENTO (não devolve o componente pra ser
 * usado como JSX no chamador — isso dispara react-hooks/static-components). Se
 * a rota não tem tela mobile, devolve null e o chamador mostra o fallback.
 */
export function renderCascaScreen(pathname: string): React.ReactElement | null {
  const Screen = resolveCascaScreen(pathname);
  return Screen ? React.createElement(Screen) : null;
}
