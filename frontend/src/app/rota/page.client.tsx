"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  LogisticaRealPreview,
  type LogisticaRealScreen,
} from "@/components/hbx/logistica-real-preview";
import { applyThemeSoft, setThemeMode } from "@/components/hbx/theme-attributes";
import { MOBILE_APK_URL } from "@/lib/app-mobile";
import { CONTACT_WHATSAPP_URL } from "@/lib/contato";

// 🔴 PREÇO SAIU DA VITRINE (17/08, ordem do dono: "remover esses planos da
// tela"). Junto com os 3 cartões morreram o catálogo local, o fetch de
// `/public/logistica/planos` e a linha da Rota Avulsa — nada de deixar estado
// morto buscando preço que ninguém mostra. O endpoint continua vivo pra
// janela-de-créditos; quem quiser o preço fala no WhatsApp ou cria a conta.
// O buraco que os planos deixaram virou os cartões de app (foto 6 do dono).

const DEMOS: Array<{ key: LogisticaRealScreen; label: string }> = [
  { key: "prospector", label: "Prospector" },
  { key: "montagem", label: "Montar rota" },
  { key: "folha", label: "Entregar" },
  { key: "caderneta", label: "Fechar o dia" },
];

const ICONS = {
  arrow: ["M5 12h14", "M14 7l5 5-5 5"],
  chevron: ["m9 18 6-6-6-6"],
  download: ["M12 3v12", "m7 10 5 5 5-5", "M5 21h14"],
  moon: ["M20 15.2A8 8 0 0 1 8.8 4a8 8 0 1 0 11.2 11.2Z"],
  sun: ["M12 3v2", "M12 19v2", "M3 12h2", "M19 12h2", "m5.6 5.6-1.4-1.4", "m15.8 15.8-1.4-1.4", "m18.4 5.6 1.4-1.4", "m4.2 19.8 1.4-1.4", "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"],
  whatsapp: ["M20 11.5a8 8 0 0 1-11.9 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z", "M8.4 8.5c.8 3 3.1 5.3 6.1 6.1", "m14.5 14.6 1.4-1.4"],
} satisfies Record<string, string[]>;

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg className="f1-icon" viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[name].map((d, index) => <path d={d} key={`${name}-${index}`} />)}
    </svg>
  );
}

export function RotaSiteClient() {
  const [demo, setDemo] = useState<LogisticaRealScreen>("prospector");
  const [themeMode, setThemeModeState] = useState<"dark" | "light">("light");

  useEffect(() => {
    const mode = document.documentElement.getAttribute("data-theme-mode");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lê o tema aplicado antes da hidratação
    setThemeModeState(mode === "dark" ? "dark" : "light");
  }, []);

  function toggleTheme() {
    const next = themeMode === "dark" ? "light" : "dark";
    applyThemeSoft(() => setThemeMode(next));
    setThemeModeState(next);
  }

  return (
    <main className="public-entry rota-site">
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
          <Link className="f1-login" href="/?entrar">Entrar <Icon name="chevron" /></Link>
        </nav>
      </header>

      <section className="rt-simple">
        <div className="rt-simple__copy">
          <span className="rt-simple__name">HBX Logística</span>
          <h1>Rota pronta.<br /><em>Clientes novos no caminho.</em></h1>
          <p>Organize as entregas, navegue e encontre empresas na sua rota.</p>

          <div className="rt-simple__actions">
            <Link className="f1-primary-cta" href="/?criar">Começar agora <Icon name="arrow" /></Link>
            <a className="f1-secondary-cta" href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer">Falar no WhatsApp <Icon name="whatsapp" /></a>
          </div>

          {/* Os cartões de app são os MESMOS da porta única (`f1-mobile-apps`
              em public-entry) — mesma marcação, mesma pele, mesmos tokens. O
              /rota só aperta a régua de tamanho (`rt-apps`) pra caber no rodapé
              da coluna sem rolar a tela. Peça copiada perde tudo que a original
              ganha depois; aqui ela é REUSADA. */}
          <section className="f1-mobile-apps rt-apps" aria-label="Aplicativos móveis HBX">
            <article className="f1-mobile-app f1-mobile-app--apple">
              <div className="f1-mobile-app__art-wrap">
                <img src="/hbx-theme/assets/mobile-apps/apple-coming.png" alt="Ilustração de uma maçã tecnológica" />
                <span className="f1-mobile-app__ribbon">Em breve</span>
              </div>
              <div className="f1-mobile-app__copy">
                <small>HBX para iPhone</small>
                <strong>Seu negócio também<br />no iOS.</strong>
              </div>
            </article>
            <article className="f1-mobile-app f1-mobile-app--android">
              <div className="f1-mobile-app__copy">
                <small>HBX Logística para Android</small>
                <strong>A operação na<br />palma da mão.</strong>
                <span className="f1-mobile-app__links">
                  {/* Aqui o download é o ÚNICO destino: o link solto "Baixar app
                      para Android" saiu, e "Ver planos e preços" apontaria pra
                      esta mesma página. Dois botões pro mesmo lugar é ruído. */}
                  <a href={MOBILE_APK_URL} className="f1-mobile-app__link">
                    <Icon name="download" /> Baixar HBX Logística
                  </a>
                </span>
              </div>
              <div className="f1-mobile-app__art-wrap">
                <img src="/hbx-theme/assets/mobile-apps/android-hero.png" alt="Android futurista do HBX Logística" />
              </div>
            </article>
          </section>
        </div>

        <div className="rt-demo">
          <nav className="rt-demo__nav" aria-label="Telas do HBX Logística">
            {DEMOS.map((item) => (
              <button
                className={item.key === demo ? "is-active" : ""}
                key={item.key}
                type="button"
                aria-pressed={item.key === demo}
                onClick={() => setDemo(item.key)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="rt-demo__frame" data-demo={demo}>
            <LogisticaRealPreview
              className="rt-demo__iframe"
              key={`${demo}-${themeMode}`}
              screen={demo}
              themeMode={themeMode}
            />
          </div>
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
