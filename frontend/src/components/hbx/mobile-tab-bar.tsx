"use client";

// Barra de abas inferior — render APENAS quando useIsMobile() = true.
// 5 abas fixas: Início · Vendas · Conversas · Buscar · Mais (27/06: 2 lugares —
// Vendas=funil, Conversas=caixa; "Buscar" é a boca do funil/Radar). Respeita
// isModuleVisible (mesma fonte da Sidebar). Item ativo = pathname. Folha "Mais"
// (bottom sheet) usa .hbx-veil.to-bottom / .hbx-drawer-bottom da central — NUNCA
// re-posiciona inline.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useState } from "react";

import { I, ICONS, ModeToggle, PeleSwitch, isModuleVisible, useCurrentUser, useEntitlements, useMyModules } from "@/components/hbx/shell";
import { apiFetch, clearToken } from "@/lib/api";
import { useIsMobile } from "@/lib/use-is-mobile";

// Abas fixas da barra inferior (Master/Gerencial NÃO entram aqui).
const TABS = [
  { id: "dash",   label: "Início",     href: "/dashboard",   icon: "dash" },
  { id: "vendas", label: "Vendas",     href: "/vendas",       icon: "vendas" },
  { id: "atend",  label: "Conversas",  href: "/atendimento",  icon: "atend" },
  { id: "leads",  label: "Buscar",     href: "/leads",        icon: "leads" },
] as const;

// Mapeamento rota → id de aba (para calcular a aba ativa)
const ROUTE_TO_TAB: Record<string, string> = {
  "/dashboard": "dash",
  "/leads": "leads",
  "/vendas": "vendas",
  "/atendimento": "atend",
};

export function MobileTabBar() {
  const isMobile = useIsMobile();
  const pathname = usePathname() || "";
  const user = useCurrentUser();
  const ent = useEntitlements();
  const mods = useMyModules();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Não renderiza no desktop
  if (!isMobile) return null;
  // Não renderiza em /master (tem chrome próprio)
  if (pathname.startsWith("/master")) return null;

  const activeTab = ROUTE_TO_TAB[pathname] ?? "";

  // Filtra abas pelo gate isModuleVisible (mesma lógica da Sidebar)
  const visibleTabs = TABS.filter(t => isModuleVisible(t.id, ent, user, mods));

  async function sairMobile() {
    if (signingOut) return;
    setSigningOut(true);
    setMoreOpen(false);
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // sessão já inválida — segue
    }
    clearToken();
    try { localStorage.removeItem("hbx:brain:session-start"); } catch { /* */ }
    router.replace("/login");
  }

  return (
    <>
      {/* Barra de abas */}
      <nav className="mobile-tab-bar" aria-label="Navegação principal">
        {visibleTabs.map(tab => (
          <Link
            key={tab.id}
            href={tab.href}
            className={"mobile-tab-bar__item" + (activeTab === tab.id ? " active" : "")}
            aria-current={activeTab === tab.id ? "page" : undefined}
          >
            <I d={ICONS[tab.icon]} size={20} />
            {tab.label}
          </Link>
        ))}
        {/* Aba "Mais" */}
        <button
          className={"mobile-tab-bar__item" + (moreOpen ? " active" : "")}
          onClick={() => setMoreOpen(o => !o)}
          aria-label="Mais opções"
          aria-expanded={moreOpen}
        >
          <I d={ICONS.config} size={20} />
          Mais
        </button>
      </nav>

      {/* Folha "Mais" — bottom sheet via central .hbx-veil.to-bottom */}
      {moreOpen && (
        <div
          className="hbx-veil to-bottom"
          onClick={e => { if (e.target === e.currentTarget) setMoreOpen(false); }}
        >
          <div className="hbx-drawer-bottom" role="dialog" aria-label="Mais opções" aria-modal="true">
            {/* Handle */}
            <div className="hbx-drawer-bottom__handle" aria-hidden />

            {/* Relatórios */}
            <Link
              href="/relatorios"
              className="more-sheet__item"
              onClick={() => setMoreOpen(false)}
            >
              <span className="more-sheet__icon"><I d={ICONS.relat} size={20} /></span>
              Relatórios
            </Link>

            {/* Configurações */}
            <Link
              href="/configuracoes"
              className="more-sheet__item"
              onClick={() => setMoreOpen(false)}
            >
              <span className="more-sheet__icon"><I d={ICONS.config} size={20} /></span>
              Configurações
            </Link>

            {/* Tutorial */}
            <Link
              href="/tutorial"
              className="more-sheet__item"
              onClick={() => setMoreOpen(false)}
            >
              <span className="more-sheet__icon"><I d={ICONS.bolt} size={20} /></span>
              Tutorial
            </Link>

            <div className="more-sheet__sep" />

            {/* Controles de tema + pele */}
            <div className="more-sheet__controls">
              <ModeToggle />
              <PeleSwitch />
            </div>

            <div className="more-sheet__sep" />

            {/* Sair */}
            <button
              className="more-sheet__item danger"
              onClick={sairMobile}
              disabled={signingOut}
            >
              <span className="more-sheet__icon"><I d={ICONS.x} size={20} /></span>
              {signingOut ? "Saindo…" : "Sair"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
