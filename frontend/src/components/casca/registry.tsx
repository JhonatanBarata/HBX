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

import { CascaStub } from "./stub";

// Tela mobile = componente sem props (consome os mesmos hooks/endpoints do
// desktop). O registry casa pelo pathname exato.
export type CascaScreen = React.ComponentType;

// STUBS provisórios (W1) — navegação já vive; miolo entra em W2–W4.
// W2 (Vendas): substituir por <VendasMobile/>.
function VendasStub() {
  return <CascaStub label="Vendas" msg="Funil e Buscar empresas chegam aqui (W2)." />;
}
// W3 (Conversas): substituir por <ConversasMobile/>.
function ConversasStub() {
  return <CascaStub label="Conversas" msg="Caixa de WhatsApp + chat chegam aqui (W3)." />;
}
// W4 (Empresas): substituir por <EmpresasMobile/>.
function EmpresasStub() {
  return <CascaStub label="Empresas" msg="Lista + ficha das contas PJ chegam aqui (W4)." />;
}

// Mapa rota→tela. Chave = pathname canônico (o mesmo do AppShell META).
export const CASCA_SCREENS: Record<string, CascaScreen> = {
  "/vendas": VendasStub,
  "/atendimento": ConversasStub,
  "/empresas": EmpresasStub,
};

// Título do topo por rota (1 linha). Sem entrada = usa o title do AppShell META
// (MobileShell resolve o fallback). Mantido separado pro registry ser a fonte
// única do que a casca conhece.
export const CASCA_TITLES: Record<string, string> = {
  "/vendas": "Vendas",
  "/atendimento": "Conversas",
  "/empresas": "Empresas",
};

/** Devolve a tela mobile registrada para a rota, ou null (→ fallback central). */
export function resolveCascaScreen(pathname: string): CascaScreen | null {
  return CASCA_SCREENS[pathname] || null;
}

/**
 * Renderiza a tela registrada como ELEMENTO (não devolve o componente pra ser
 * usado como JSX no chamador — isso dispara react-hooks/static-components). Se
 * a rota não tem tela mobile, devolve null e o chamador mostra o fallback.
 */
export function renderCascaScreen(pathname: string): React.ReactElement | null {
  const Screen = CASCA_SCREENS[pathname];
  return Screen ? React.createElement(Screen) : null;
}
