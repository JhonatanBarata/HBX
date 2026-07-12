"use client";

// ================================================================
// Navegação interna do app /entrega.
//
// Mantém as páginas que o Rota já tinha (Rota, Clientes, Produtos, Ajustes)
// e usa a MESMA linguagem visual da casca central: .casca-tabbar, .casca-tab
// e .casca-tab__label.
//
// W4 (PR10072026) — o 5º item é DINÂMICO:
//   · só-logística → o item "HBX" some (de-HBX; a volta vive em Ajustes →
//     "Abrir o HBX completo"); se o módulo financeiro do tenant está ativo,
//     entra a aba "Financeiro" (/entrega/financeiro) no lugar.
//   · com outros módulos → "HBX" continua, mas o destino é /dashboard (o
//     redirect module-aware do mobile-shell decide a tela; nunca mais o
//     /vendas hardcoded que dava 403 pro entregador).
// ================================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { soLogistica } from "@/lib/so-logistica";

import { useEntregaMods } from "./entrega-mods";
import { getEntregaOperationalCapabilities } from "./entrega-user";
import { getConfigCached } from "./gestao-api";
import { I, ICON_PATHS } from "./icons";

const TABS = [
  { href: "/entrega", label: "Rota", icon: "route" },
  { href: "/entrega/clientes", label: "Clientes", icon: "clientes" },
  { href: "/entrega/produtos", label: "Produtos", icon: "produtos" },
  { href: "/entrega/ajustes", label: "Ajustes", icon: "ajustes" },
] as const;

function isActive(href: string, pathname: string): boolean {
  if (href === "/entrega") return pathname === "/entrega";
  return pathname === href || pathname.startsWith(href + "/");
}

export function EntregaTabBar() {
  const pathname = usePathname() || "";
  const mods = useEntregaMods();
  const soLog = soLogistica(mods);

  // Gate da aba Financeiro = moduloFinanceiroAtivo do config (leitura cacheada
  // — a tab bar remonta a cada navegação). Fail-closed: sem config, sem aba.
  const [financeiroOn, setFinanceiroOn] = useState(false);
  const [canSell, setCanSell] = useState(false);
  useEffect(() => {
    let vivo = true;
    void getConfigCached().then((c) => {
      if (vivo) setFinanceiroOn(!!c?.moduloFinanceiroAtivo);
    });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    let vivo = true;
    void getEntregaOperationalCapabilities().then((capabilities) => {
      if (vivo) setCanSell(capabilities.includes("SELLER"));
    });
    return () => { vivo = false; };
  }, []);

  return (
    <nav className="casca-tabbar" aria-label="Navegação do app de entrega">
      {TABS.map((tab) => {
        const active = isActive(tab.href, pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={"casca-tab" + (active ? " is-on" : "")}
            aria-current={active ? "page" : undefined}
          >
            <I d={ICON_PATHS[tab.icon]} size={20} />
            <span className="casca-tab__label">{tab.label}</span>
          </Link>
        );
      })}
      {soLog ? (
        financeiroOn ? (
          <Link
            href="/entrega/financeiro"
            className={"casca-tab" + (isActive("/entrega/financeiro", pathname) ? " is-on" : "")}
            aria-current={isActive("/entrega/financeiro", pathname) ? "page" : undefined}
          >
            <I d={ICON_PATHS.financeiro} size={20} />
            <span className="casca-tab__label">Financeiro</span>
          </Link>
        ) : null
      ) : canSell ? (
        <Link href="/workspace" className="casca-tab" aria-label="Trocar entre Vendas e Entregas">
          <I d={ICON_PATHS.hbx} size={20} />
          <span className="casca-tab__label">Trocar</span>
        </Link>
      ) : null}
    </nav>
  );
}
