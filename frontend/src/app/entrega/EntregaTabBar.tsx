"use client";

// ================================================================
// MOBILE-CASCA/W6 — TAB BAR do app /entrega, agora nas MESMAS classes
// estruturais .casca-tabbar/.casca-tab da casca central (casca.css) —
// "outra cor, mesma casca" (regra nº5 do dono). 5 abas: Rota · Clientes ·
// Produtos · Ajustes · HBX (a exigência "voltar pro HBX central nos
// ícones" — navega pra /vendas, o app do dashboard).
//
// HBX NÃO é uma aba deste app (não acende como ativa) — é a porta de
// saída, sempre no mesmo lugar da tab bar (ordem visual: por último).
// Ativo pelo pathname: "Rota" só no /entrega exato; as demais quando o
// pathname bate a seção.
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
      {/* HBX — volta pro app central (regra nº5: "como voltar nos ÍCONES"). */}
      <Link
        href="/vendas"
        className="casca-tab"
        aria-label="Voltar para o HBX"
      >
        <I d={ICON_PATHS.hbx} size={20} />
        <span className="casca-tab__label">HBX</span>
      </Link>
    </nav>
  );
}
