"use client";

// CASCA ÚNICA da cena (15/06) — UM dono do fundo. Robô full-bleed (fixo) + cor
// ciclando (.hbx-scene) + marca » + navegação de acesso. TODA tela de auth
// só entrega o CONTEÚDO em .scene-body. Mexeu aqui, mexeu em todas — sem cópias.
// plain = remove-visual (robô some). nav=false esconde a nav.
// SceneMenu é exportada à parte pro login (que tem cena própria) reusar os 4 guias.

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthThemeControls } from "@/components/hbx/auth-theme-controls";

export type SceneNav = "inicio" | "cadastro" | "entrar";

const NAV: { key: SceneNav; label: string; href: string; cta?: boolean }[] = [
  { key: "inicio", label: "Início", href: "/" },
  { key: "cadastro", label: "Criar conta", href: "/register" },
  { key: "entrar", label: "Entrar", href: "/login", cta: true },
];

function SceneWorldIcon() {
  return (
    <span className="scene-world" aria-hidden>
      <svg className="scene-world__globe" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
        <path d="M3.6 9h16.8M3.6 15h16.8" />
        <path d="M12 3c2.2 2.4 3.3 5.4 3.3 9S14.2 18.6 12 21" />
        <path d="M12 3C9.8 5.4 8.7 8.4 8.7 12s1.1 6.6 3.3 9" />
      </svg>
      <i className="scene-world__orbit" />
    </span>
  );
}

// Os 4 guias (marcador da tela atual). Sem onNav = navega por rota; com onNav,
// a tela controla in-place (ex.: a landing alterna Início↔Esteira sem trocar de rota).
export function SceneMenu({ active = null, onNav, mode = "tabs" }: { active?: SceneNav | null; onNav?: (key: SceneNav) => void; mode?: "tabs" | "world" }) {
  const router = useRouter();
  const goWebHome = () => {
    if (onNav) return onNav("inicio");
    const host = window.location.hostname;
    window.location.assign(host === "localhost" || host === "127.0.0.1" ? "/" : "https://www.hbxsystem.com.br/");
  };

  if (mode === "world") {
    return (
      <nav className="scene-nav scene-nav--world hbx-scene" aria-label="Navegação">
        <button
          type="button"
          className="scene-nav__world"
          aria-label="Voltar ao mundo HBX"
          title="Mundo HBX"
          onClick={goWebHome}
        >
          <SceneWorldIcon />
        </button>
      </nav>
    );
  }

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
  const isBack = active === "cadastro";

  // REGRA DA CASCA: páginas de rota também saem com transição antes de navegar
  // (a próxima entra ao montar via CSS). A landing passa onNav/onBrand próprios
  // (deck in-place) e NÃO usa isto.
  const navTo = (href: string) => { setLeaving(true); window.setTimeout(() => router.push(href), 340); };
  const HREF: Record<SceneNav, string> = { inicio: "/", cadastro: "/register", entrar: "/login" };
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
