"use client";

// /tutorialexterno — tutorial PÚBLICO (antes do login). Reusa a casca da landing
// (.public-entry / .f1-backdrop / .f1-header). O conteúdo (guias → telas) vem do
// backend e é editado pelo dono no /master → "Tutorial front".
//
// Navegação: uma tela por vez, com painel Voltar/Próximo. Na última tela de uma
// guia o "Próximo" vira o NOME da próxima guia; na última tela da última guia
// vira o encerramento com o WhatsApp de suporte (o mesmo da página inicial).

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { applyThemeSoft, setThemeMode } from "@/components/hbx/theme-attributes";
import { CONTACT_PHONE_LABEL, CONTACT_WHATSAPP_URL } from "@/lib/contato";
import { fetchTutorialManifest, resolvePlayback, type TutorialGuide } from "@/lib/tutorial-media";

const ICONS: Record<string, string[]> = {
  arrow: ["M5 12h14", "M14 7l5 5-5 5"],
  back: ["M19 12H5", "m10 7-5 5 5 5"],
  chevron: ["m15 18-6-6 6-6"],
  moon: ["M20 15.2A8 8 0 0 1 8.8 4a8 8 0 1 0 11.2 11.2Z"],
  sun: ["M12 3v2", "M12 19v2", "M3 12h2", "M19 12h2", "m5.6 5.6-1.4-1.4", "m15.8 15.8-1.4-1.4", "m18.4 5.6 1.4-1.4", "m4.2 19.8 1.4-1.4", "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"],
  play: ["M8 5v14l11-7z"],
  whatsapp: ["M20 11.5a8 8 0 0 1-11.9 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z", "M8.4 8.5c.8 3 3.1 5.3 6.1 6.1", "m14.5 14.6 1.4-1.4"],
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg className="f1-icon" viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[name].map((d, i) => <path d={d} key={i} />)}
    </svg>
  );
}

export function TutorialExternoClient() {
  const [guides, setGuides] = useState<TutorialGuide[] | null>(null);
  const [gi, setGi] = useState(0);
  const [si, setSi] = useState(0);
  const [themeMode, setThemeModeState] = useState<"dark" | "light">("light");

  useEffect(() => {
    // Guia sem tela nenhuma vira beco sem saída na navegação — fica de fora.
    void fetchTutorialManifest().then((m) =>
      setGuides((m.guides || []).filter((g) => (g.steps || []).length > 0)),
    );
  }, []);

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

  const guide = guides?.[gi] || null;
  const step = guide?.steps[si] || null;
  const playback = useMemo(() => resolvePlayback(step?.media), [step]);

  const isLastStep = guide ? si >= guide.steps.length - 1 : false;
  const nextGuide = guides && isLastStep ? guides[gi + 1] || null : null;
  const isFinish = Boolean(guide && isLastStep && !nextGuide);
  const isFirstOfAll = gi === 0 && si === 0;

  function irGuia(index: number) { setGi(index); setSi(0); }

  function voltar() {
    if (si > 0) { setSi(si - 1); return; }
    if (gi > 0) {
      const prev = guides![gi - 1];
      setGi(gi - 1);
      setSi(Math.max(0, prev.steps.length - 1));
    }
  }

  function proximo() {
    if (!guide) return;
    if (!isLastStep) { setSi(si + 1); return; }
    if (nextGuide) irGuia(gi + 1);
  }

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
          <button className="f1-icon-button" type="button" onClick={toggleTheme} aria-label={themeMode === "dark" ? "Usar tema claro" : "Usar tema escuro"}>
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

        {guides && guides.length > 0 && (
          <div className="f1-tut__tabs" role="tablist" aria-label="Onde você está usando">
            {guides.map((g, i) => (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={i === gi}
                className={"f1-tut__tab" + (i === gi ? " is-active" : "")}
                onClick={() => irGuia(i)}
              >
                <strong>{g.label}</strong>
                <small>{g.hint}</small>
              </button>
            ))}
          </div>
        )}

        {!guides && <p className="f1-tut__desc">Carregando…</p>}
        {guides && guides.length === 0 && <p className="f1-tut__desc">O tutorial está sendo preparado. Volte em breve.</p>}

        {guide && step && (
          <article className="f1-tut__stage" key={`${guide.id}-${step.id}`}>
            <div className={"f1-tut__media" + (playback && playback.kind === "video" ? " f1-tut__media--file" : "")}>
              {playback ? (
                playback.kind === "iframe" ? (
                  <iframe src={playback.src} title={step.title} allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
                ) : (
                  <video
                    src={playback.src}
                    controls={step.media?.mode !== "light"}
                    muted={step.media?.mode === "light"}
                    loop={step.media?.mode === "light"}
                    autoPlay={step.media?.mode === "light"}
                    playsInline
                    preload="metadata"
                  />
                )
              ) : (
                <span className="f1-tut__empty"><Icon name="play" />Vídeo em breve</span>
              )}
            </div>

            <div className="f1-tut__info">
              <span className="f1-tut__num">{guide.label} · passo {si + 1} de {guide.steps.length}</span>
              <h2 className="f1-tut__title">{step.title}</h2>
              {step.desc && <p className="f1-tut__desc">{step.desc}</p>}
            </div>

            <div className="f1-tut__nav">
              <button type="button" className="f1-tut__btn" onClick={voltar} disabled={isFirstOfAll}>
                <Icon name="back" /> Voltar
              </button>

              <span className="f1-tut__dots" aria-hidden="true">
                {guide.steps.map((s, i) => (
                  <i key={s.id} className={i === si ? "is-on" : ""} />
                ))}
              </span>

              {isFinish ? (
                <a className="f1-tut__btn is-primary" href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer">
                  <Icon name="whatsapp" /> Falar com o suporte
                </a>
              ) : (
                <button type="button" className="f1-tut__btn is-primary" onClick={proximo}>
                  {nextGuide ? nextGuide.label : "Próximo"} <Icon name="arrow" />
                </button>
              )}
            </div>

            {isFinish && (
              <div className="f1-tut__done">
                <strong>Terminou! Qualquer dúvida, nos acione.</strong>
                <a href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer">
                  <Icon name="whatsapp" /> {CONTACT_PHONE_LABEL}
                </a>
              </div>
            )}
          </article>
        )}
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
