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

// NÚCLEO-CRM N6 — aba "Rota" (Logística). Só entra na barra quando o módulo
// 'logistica' está ativo pro tenant (mesmo gate isModuleVisible da Sidebar);
// aditiva, não substitui nenhuma aba fixa acima. APPIFICAÇÃO A1: a aba "Rota"
// abre o APP de entrega (/entrega, skin entrega) — NÃO a tela ERP /logistica do
// dashboard (essa segue existindo pro desktop, alcançável pela folha "Mais").
const LOGISTICA_TAB = { id: "logistica", label: "Rota", href: "/entrega", icon: "logistica" } as const;

// Folha "Mais" — módulos do NÚCLEO-CRM disponíveis no celular (cadastrar
// cliente/produto direto no app). Cada item usa o MESMO gate isModuleVisible da
// Sidebar + ícone das ICONS. "Logística" aqui = a gestão ERP (/logistica), já
// que a aba "Rota" passou a abrir o app /entrega.
const MORE_MODULES = [
  { id: "empresas",  label: "Empresas",  href: "/empresas",  icon: "empresas" },
  { id: "contatos",  label: "Contatos",  href: "/contatos",  icon: "contatos" },
  { id: "produtos",  label: "Produtos",  href: "/produtos",  icon: "produtos" },
  { id: "logistica", label: "Logística", href: "/logistica", icon: "logistica" },
] as const;

// Mapeamento rota → id de aba (para calcular a aba ativa). A aba "Rota" acende
// em qualquer rota do app de entrega (/entrega e subrotas).
const ROUTE_TO_TAB: Record<string, string> = {
  "/dashboard": "dash",
  "/leads": "leads",
  "/vendas": "vendas",
  "/atendimento": "atend",
  "/entrega": "logistica",
};

// A aba "Rota" acende em /entrega e QUALQUER subrota (/entrega/clientes etc.).
function resolveActiveTab(pathname: string): string {
  if (pathname === "/entrega" || pathname.startsWith("/entrega/")) return "logistica";
  return ROUTE_TO_TAB[pathname] ?? "";
}

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

  const activeTab = resolveActiveTab(pathname);

  // Filtra abas pelo gate isModuleVisible (mesma lógica da Sidebar)
  const baseTabs = TABS.filter(t => isModuleVisible(t.id, ent, user, mods));
  // Aba "Rota" só aparece quando o módulo Logística está ativo pro tenant (aditiva).
  const visibleTabs = isModuleVisible(LOGISTICA_TAB.id, ent, user, mods)
    ? [...baseTabs, LOGISTICA_TAB]
    : baseTabs;

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

            {/* Módulos do NÚCLEO-CRM (Empresas/Contatos/Produtos/Logística) —
                cadastrar cliente/produto pelo celular. Mesmo gate isModuleVisible
                da Sidebar: some quem o usuário não acessa. */}
            {MORE_MODULES
              .filter(m => isModuleVisible(m.id, ent, user, mods))
              .map(m => (
                <Link
                  key={m.id}
                  href={m.href}
                  className="more-sheet__item"
                  onClick={() => setMoreOpen(false)}
                >
                  <span className="more-sheet__icon"><I d={ICONS[m.icon]} size={20} /></span>
                  {m.label}
                </Link>
              ))}

            <div className="more-sheet__sep" />

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
