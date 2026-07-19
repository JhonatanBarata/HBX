"use client";

// /tutorialexterno — tutorial PÚBLICO (antes do login). Reusa a casca da landing
// (.public-entry / .f1-backdrop / .f1-header). 3 guias (Sistema / Android /
// iPhone-web); cada função tem descrição de 1 linha + vídeo (subido pelo dono no
// /master → "Tutorial front"). Lê o manifesto sem login. Sem vídeo = "Em breve".

import Link from "next/link";
import { useEffect, useState } from "react";

import { applyThemeSoft, setThemeMode } from "@/components/hbx/theme-attributes";
import { TUTORIAL_GUIDES } from "@/lib/tutorial-content";
import { fetchTutorialManifest, tutorialMediaUrl, type TutorialManifest } from "@/lib/tutorial-media";

const ICONS: Record<string, string[]> = {
  arrow: ["M5 12h14", "M14 7l5 5-5 5"],
  chevron: ["m15 18-6-6 6-6"],
  moon: ["M20 15.2A8 8 0 0 1 8.8 4a8 8 0 1 0 11.2 11.2Z"],
  sun: ["M12 3v2", "M12 19v2", "M3 12h2", "M19 12h2", "m5.6 5.6-1.4-1.4", "m15.8 15.8-1.4-1.4", "m18.4 5.6 1.4-1.4", "m4.2 19.8 1.4-1.4", "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"],
  play: ["M8 5v14l11-7z"],
};

function Icon({ name, className = "" }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg className={`f1-icon ${className}`} viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[name].map((d, i) => <path d={d} key={i} />)}
    </svg>
  );
}

export function TutorialExternoClient() {
  const [manifest, setManifest] = useState<TutorialManifest>({ steps: {} });
  const [guideId, setGuideId] = useState(TUTORIAL_GUIDES[0].id);
  const [themeMode, setThemeModeState] = useState<"dark" | "light">("light");

  useEffect(() => { void fetchTutorialManifest().then(setManifest); }, []);

  useEffect(() => {
    const mode = document.documentElement.getAttribute("data-theme-mode");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lê o atributo do DOM 1x no mount
    setThemeModeState(mode === "dark" ? "dark" : "light");
  }, []);

  function toggleTheme() {
    const next = themeMode === "dark" ? "light" : "dark";
    applyThemeSoft(() => setThemeMode(next));
    setThemeModeState(next);
  }

  const guide = TUTORIAL_GUIDES.find((g) => g.id === guideId) || TUTORIAL_GUIDES[0];

  return (
    <main className="public-entry f1-tut">
      <div className="f1-backdrop" aria-hidden="true">
        <span className="f1-orb f1-orb--one" />
        <span className="f1-orb f1-orb--two" />
        <span className="f1-grid" />
        <span className="f1-noise" />
      </div>

      <header className="f1-header">
        <Link className="f1-brand" href="/" aria-label="HBX System">
          <span className="f1-brand__mark"><i /><i /><i /></span>
          <span>HBX</span>
        </Link>
        <nav className="f1-header__actions" aria-label="Ações">
          <button className="f1-icon-button" type="button" onClick={toggleTheme} aria-label={themeMode === "dark" ? "Usar tema claro" : "Usar tema escuro"} title={themeMode === "dark" ? "Usar tema claro" : "Usar tema escuro"}>
            <Icon name={themeMode === "dark" ? "sun" : "moon"} />
          </button>
          <Link className="f1-login" href="/">Voltar <Icon name="chevron" /></Link>
        </nav>
      </header>

      <section className="f1-tut__wrap">
        <div className="f1-tut__head">
          <h1>Como usar o HBX</h1>
          <p>Passo a passo em vídeo — escolha onde você está usando.</p>
        </div>

        <div className="f1-tut__tabs" role="tablist" aria-label="Onde você está usando">
          {TUTORIAL_GUIDES.map((g) => (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={g.id === guideId}
              className={"f1-tut__tab" + (g.id === guideId ? " is-active" : "")}
              onClick={() => setGuideId(g.id)}
            >
              <strong>{g.label}</strong>
              <small>{g.hint}</small>
            </button>
          ))}
        </div>

        <div className="f1-tut__grid" key={guide.id}>
          {guide.steps.map((step, i) => {
            const media = manifest.steps[step.id];
            const light = media?.mode === "light";
            return (
              <article className="f1-tut__card" key={step.id} style={{ animationDelay: `${Math.min(i, 8) * 0.04}s` }}>
                <div className="f1-tut__media">
                  {media ? (
                    <video
                      src={tutorialMediaUrl(media.url)}
                      controls={!light}
                      muted={light}
                      loop={light}
                      autoPlay={light}
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <span className="f1-tut__empty">
                      <Icon name="play" />
                      Em breve
                    </span>
                  )}
                </div>
                <span className="f1-tut__num">PASSO {i + 1}</span>
                <div className="f1-tut__title">{step.title}</div>
                <div className="f1-tut__desc">{step.desc}</div>
              </article>
            );
          })}
        </div>
      </section>

      <footer className="f1-footer">
        <span>© 2026 HBX</span>
        <nav aria-label="Links legais">
          <a href="/termos">Termos de Uso</a>
          <a href="/politicas">Política de Privacidade</a>
        </nav>
      </footer>
    </main>
  );
}
