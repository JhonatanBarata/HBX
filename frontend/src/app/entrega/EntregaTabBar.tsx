"use client";

// ================================================================
// Navegação interna do app /entrega.
//
// Mantém as páginas que o Rota já tinha (Rota, Clientes, Produtos, Ajustes)
// e uma saída para o HBX, mas usa a MESMA linguagem visual da casca central:
// .casca-tabbar, .casca-tab e .casca-tab__label.
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

function isActive(href: string, pathname: string): boolean {
  if (href === "/entrega") return pathname === "/entrega";
  return pathname === href || pathname.startsWith(href + "/");
}

export function EntregaTabBar() {
  const pathname = usePathname() || "";

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
      <Link href="/vendas" className="casca-tab" aria-label="Voltar para o HBX">
        <I d={ICON_PATHS.hbx} size={20} />
        <span className="casca-tab__label">HBX</span>
      </Link>
    </nav>
  );
}
