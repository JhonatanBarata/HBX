"use client";

// ================================================================
// LOGÍSTICA-MOBILE A2 — TAB BAR PRÓPRIA DO APP /entrega (skin entrega).
// NÃO reusa a MobileTabBar do dashboard (skin aurora, gates de módulo, folha
// "Mais"): o app tem a SUA barra, com 4 abas grandes e o vocabulário do
// entregador. Fixa no rodapé, safe-area, alvo >=52px, ativo pelo pathname.
//
// As 4 abas: Rota (/entrega = o app M4) · Clientes · Produtos · Ajustes.
// A aba "Rota" acende em /entrega exato; as demais em /entrega/<seção>.
// Classes .ent-tabbar/.ent-tab vivem em hbx-theme/entrega.css (zero visual
// solto aqui — 5 Leis; ícone + label, sem hex/inline).
// ================================================================

import Link from "next/link";
import { usePathname } from "next/navigation";

import { I, ICON_PATHS } from "./icons";

const TABS = [
  { href: "/entrega", label: "Rota", icon: "route" },
  { href: "/entrega/clientes", label: "Clientes", icon: "clientes" },
  { href: "/entrega/produtos", label: "Produtos", icon: "produtos" },
  { href: "/entrega/ajustes", label: "Ajustes", icon: "ajustes" },
] as const;

// Aba ativa: "Rota" só no /entrega exato; as demais quando o pathname bate a
// seção (cobre subrotas futuras tipo /entrega/clientes/novo).
function isActive(href: string, pathname: string): boolean {
  if (href === "/entrega") return pathname === "/entrega";
  return pathname === href || pathname.startsWith(href + "/");
}

export function EntregaTabBar() {
  const pathname = usePathname() || "";
  return (
    <nav className="ent-tabbar" aria-label="Navegação do app">
      {TABS.map((tab) => {
        const active = isActive(tab.href, pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`ent-tab${active ? " is-on" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <I d={ICON_PATHS[tab.icon]} size={22} />
            <span className="ent-tab-label">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
