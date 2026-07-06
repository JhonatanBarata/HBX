"use client";

// MOBILE-CASCA/W1+W5 — TAB BAR da casca (54–56px): Vendas · Conversas ·
// Empresas · Rota (gate isModuleVisible) · Mais. A aba "Buscar" NÃO existe
// (Buscar vive dentro de Vendas). Item ativo pelo pathname. Rota → /entrega
// (app próprio, skin do W6).
//
// "Mais" (W5): NÃO navega — abre a folha CascaSheet (mais-sheet.tsx) direto
// por cima da tela atual, com a MESMA transição central de sheet (LEI: nada
// abre seco). De dentro da folha, "Configurações" navega de verdade pra
// /configuracoes (transição IR, tela registrada no registry).
//
// Navegar (demais abas) troca a rota; a MobileShell reage ao pathname e anima
// IR/VOLTAR. Zero visual solto — classes .casca-tab* (casca.css). Ícones do
// ICONS central.

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useState } from "react";

import {
  I,
  ICONS,
  isModuleVisible,
  useCurrentUser,
  useEntitlements,
  useMyModules,
} from "@/components/hbx/shell";

import { MaisSheet } from "./screens/mais-sheet";

type Tab = { key: string; label: string; href: string; icon: string; navId?: string };

// navId (quando existe) = a chave do gate isModuleVisible (mesmo do desktop).
const TABS: Tab[] = [
  { key: "vendas", label: "Vendas", href: "/vendas", icon: "vendas", navId: "vendas" },
  { key: "atend", label: "Conversas", href: "/atendimento", icon: "atend", navId: "atend" },
  { key: "empresas", label: "Empresas", href: "/empresas", icon: "empresas", navId: "empresas" },
  // Rota = módulo Logística (app /entrega). Gate = navId "logistica" (mesmo do
  // desktop). href /entrega (skin própria, W6).
  { key: "rota", label: "Rota", href: "/entrega", icon: "logistica", navId: "logistica" },
  // "Mais" nunca é gated — é a folha de tudo que não coube nas 4 abas. href
  // fica só como fallback de acessibilidade/SSR; o clique é interceptado (abre
  // sheet) antes de navegar de verdade.
  { key: "mais", label: "Mais", href: "/configuracoes", icon: "config" },
];

function isTabActive(tab: Tab, pathname: string): boolean {
  if (tab.href === "/entrega") return pathname === "/entrega" || pathname.startsWith("/entrega/");
  if (tab.key === "mais") {
    // "Mais" acende em /configuracoes (destino real da folha) e em qualquer
    // rota fora das outras 4 abas fixas (comportamento herdado do W1).
    const fixed = ["/vendas", "/atendimento", "/empresas"];
    if (fixed.includes(pathname) || pathname.startsWith("/entrega")) return false;
    return true;
  }
  return pathname === tab.href;
}

export function CascaTabBar() {
  const pathname = usePathname() || "";
  const user = useCurrentUser();
  const ent = useEntitlements();
  const mods = useMyModules();
  const [maisOpen, setMaisOpen] = useState(false);

  const visible = TABS.filter((t) => (t.navId ? isModuleVisible(t.navId, ent, user, mods) : true));

  return (
    <>
      <nav className="casca-tabbar" aria-label="Navegação">
        {visible.map((tab) => {
          const active = isTabActive(tab, pathname);
          if (tab.key === "mais") {
            return (
              <button
                key={tab.key}
                type="button"
                className={"casca-tab" + (active ? " is-on" : "")}
                aria-current={active ? "page" : undefined}
                onClick={() => setMaisOpen(true)}
              >
                <I d={ICONS[tab.icon]} size={20} />
                <span className="casca-tab__label">{tab.label}</span>
              </button>
            );
          }
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={"casca-tab" + (active ? " is-on" : "")}
              aria-current={active ? "page" : undefined}
            >
              <I d={ICONS[tab.icon]} size={20} />
              <span className="casca-tab__label">{tab.label}</span>
            </Link>
          );
        })}
      </nav>
      <MaisSheet open={maisOpen} onClose={() => setMaisOpen(false)} />
    </>
  );
}
