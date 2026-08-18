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
// O buraco virou os cartões de app (foto 6) e, na MESMA noite, os cartões
// ilustrados viraram provas + download sóbrio ("remova o aspecto IA").

// A ordem das abas conta a HISTÓRIA da operação: achar cliente → montar →
// entregar → o gestor acompanhando ao vivo → fechar o caixa. A torre entrou
// em 17/08 (conversa com a Unatimo): é a cena que transportador e gestor de
// frota reconhecem — alerta de parada não prevista, desvio, código da viagem.
const DEMOS: Array<{ key: LogisticaRealScreen; label: string }> = [
  { key: "prospector", label: "Prospector" },
  { key: "montagem", label: "Montar rota" },
  { key: "folha", label: "Entregar" },
  { key: "torre", label: "Torre de controle" },
  { key: "caderneta", label: "Fechar o dia" },
];

const ICONS = {
  arrow: ["M5 12h14", "M14 7l5 5-5 5"],
  bell: ["M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6", "M10.3 19a2 2 0 0 0 3.4 0"],
  check: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "m8.4 12.2 2.4 2.4 4.8-5"],
  chevron: ["m9 18 6-6-6-6"],
  download: ["M12 3v12", "m7 10 5 5 5-5", "M5 21h14"],
  eye: ["M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z", "M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"],
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
          <p>Organize as entregas, acompanhe cada motorista ao vivo e encontre empresas na sua rota.</p>

          <div className="rt-simple__actions">
            <Link className="f1-primary-cta" href="/?criar">Começar agora <Icon name="arrow" /></Link>
            <a className="f1-secondary-cta" href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer">Falar no WhatsApp <Icon name="whatsapp" /></a>
          </div>

          {/* Provas de operação, não promessas: cada linha aqui é feature VIVA
              no produto (comprovante = EntregaComprovante; parada = sentinela
              da rota; link = /acompanhar/[token]). Anunciar o que não roda é
              proibido — se um item sair do produto, sai daqui JUNTO. */}
          <ul className="rt-provas" aria-label="O que a operação registra">
            <li><Icon name="check" /> Comprovante com foto e assinatura</li>
            <li><Icon name="bell" /> Alerta de parada não prevista</li>
            <li><Icon name="eye" /> Cliente acompanha a entrega pelo link</li>
          </ul>

          {/* 17/08 — os dois cartões ilustrados (maçã 3D + robô) saíram por
              ordem do dono ("remova o aspecto IA"): mascote genérico dava cara
              de página feita por máquina. O download continua sendo o ÚNICO
              destino (fonte: lib/app-mobile), agora numa régua sóbria; iPhone
              segue sem fingir ("em breve" é texto, não arte). */}
          <div className="rt-baixar">
            <a href={MOBILE_APK_URL} className="rt-baixar__apk">
              <Icon name="download" />
              <span>Baixar HBX Logística <small>Android · direto da fonte</small></span>
            </a>
            <span className="rt-baixar__ios">iPhone em breve</span>
          </div>
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
