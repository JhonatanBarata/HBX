"use client";

// CASCA ÚNICA da cena (15/06) — UM dono do fundo. Robô full-bleed (fixo) + cor
// ciclando (.hbx-scene) + marca » + nav Início/Esteira/Planos/Entrar com o
// marcador da tela atual. TODA tela (site, register, planos, checkout, pagamentos)
// só entrega o CONTEÚDO em .scene-body. Mexeu aqui, mexeu em todas — sem cópias.
// plain = remove-visual (robô some). nav=false esconde a nav.
// SceneMenu é exportada à parte pro login (que tem cena própria) reusar os 4 guias.

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthThemeControls } from "@/components/hbx/auth-theme-controls";

export type SceneNav = "inicio" | "esteira" | "modulos" | "planos" | "entrar";

const NAV: { key: SceneNav; label: string; href: string; cta?: boolean }[] = [
  { key: "inicio", label: "Início", href: "/" },
  { key: "esteira", label: "Esteira", href: "/?ver=esteira" },
  { key: "modulos", label: "Módulos", href: "/?ver=modulos" },
  { key: "planos", label: "Planos", href: "/?ver=planos" },
  { key: "entrar", label: "Entrar", href: "/?ver=entrar", cta: true },
];

// Os 4 guias (marcador da tela atual). Sem onNav = navega por rota; com onNav,
// a tela controla in-place (ex.: a landing alterna Início↔Esteira sem trocar de rota).
export function SceneMenu({ active = null, onNav }: { active?: SceneNav | null; onNav?: (key: SceneNav) => void }) {
  const router = useRouter();
  return (
    <nav className="scene-nav" aria-label="Navegação">
      {NAV.map((it) => (
        <button
          type="button"
          key={it.key}
          className={["scene-nav__item", it.cta ? "site-enter" : "", active === it.key ? "is-current" : ""].filter(Boolean).join(" ")}
          aria-current={active === it.key ? "page" : undefined}
          onClick={() => (onNav ? onNav(it.key) : router.push(it.href))}
        >
          {it.label}
        </button>
      ))}
    </nav>
  );
}

export function HbxScene({
  children,
  active = null,
  nav = true,
  plain = false,
  themeControls = true,
  onBrand,
  onNav,
}: {
  children: React.ReactNode;
  active?: SceneNav | null;
  nav?: boolean;
  plain?: boolean;
  themeControls?: boolean;
  onBrand?: () => void;
  onNav?: (key: SceneNav) => void;
}) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const isBack = active === "esteira";

  // REGRA DA CASCA: páginas de rota também saem com transição antes de navegar
  // (a próxima entra ao montar via CSS). A landing passa onNav/onBrand próprios
  // (deck in-place) e NÃO usa isto.
  const navTo = (href: string) => { setLeaving(true); window.setTimeout(() => router.push(href), 340); };
  const HREF: Record<SceneNav, string> = { inicio: "/", esteira: "/?ver=esteira", modulos: "/?ver=modulos", planos: "/?ver=planos", entrar: "/?ver=entrar" };
  const handleNav = onNav ?? ((k: SceneNav) => navTo(HREF[k]));
  const handleBrand = onBrand ?? (() => navTo("/"));

  return (
    <>
      {themeControls && <AuthThemeControls />}
      <section className={"scene hbx-scene" + (plain ? " is-plain" : "")}>
        <div className="login-art" aria-hidden>
          <i className="login-art__frame" />
          <i className="login-art__frame" />
          <i className="login-art__frame" />
          <i className="login-art__frame" />
          <i className="login-art__frame" />
        </div>

        <header className="scene-top">
          <button type="button" className="site-brand" onClick={handleBrand} aria-label={isBack ? "Voltar ao início" : "HBX — início"}>
            <span className="site-brand__arrow" aria-hidden>&gt;&gt;</span>
            <span>HBX</span>
          </button>
        </header>

        <div className={"scene-body" + (leaving ? " is-leaving" : "")}>{children}</div>

        {nav && <SceneMenu active={active} onNav={handleNav} />}
      </section>
    </>
  );
}
