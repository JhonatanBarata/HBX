"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  LogisticaRealPreview,
  type LogisticaRealScreen,
} from "@/components/hbx/logistica-real-preview";
import { applyThemeSoft, setThemeMode } from "@/components/hbx/theme-attributes";
import { apiFetch } from "@/lib/api";
import { MOBILE_APK_URL } from "@/lib/app-mobile";
import { CONTACT_WHATSAPP_URL } from "@/lib/contato";

type NivelKey = "BASIC" | "ADVANCED" | "FULL";

interface NivelPublico {
  nivel: NivelKey;
  titulo: string;
  precoMensal: number;
  franquiaParadasMes: number;
}

const ORDEM: NivelKey[] = ["BASIC", "ADVANCED", "FULL"];

const FALLBACK: Record<NivelKey, NivelPublico> = {
  BASIC: { nivel: "BASIC", titulo: "Rota Basic", precoMensal: 99, franquiaParadasMes: 300 },
  ADVANCED: { nivel: "ADVANCED", titulo: "Rota Advanced", precoMensal: 199, franquiaParadasMes: 600 },
  FULL: { nivel: "FULL", titulo: "Rota Full", precoMensal: 299, franquiaParadasMes: 1000 },
};

const NIVEL_LABEL: Record<NivelKey, string> = {
  BASIC: "Basic",
  ADVANCED: "Advanced",
  FULL: "Full",
};

const DEMOS: Array<{ key: LogisticaRealScreen; label: string }> = [
  { key: "prospector", label: "Prospector" },
  { key: "montagem", label: "Montar rota" },
  { key: "folha", label: "Entregar" },
  { key: "fechamento", label: "Fechar o dia" },
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

function moeda(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: Number.isInteger(valor) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function RotaSiteClient() {
  const [niveis, setNiveis] = useState<Record<NivelKey, NivelPublico>>(FALLBACK);
  const [nivel, setNivel] = useState<NivelKey>("ADVANCED");
  const [demo, setDemo] = useState<LogisticaRealScreen>("prospector");
  const [themeMode, setThemeModeState] = useState<"dark" | "light">("light");

  useEffect(() => {
    let vivo = true;
    void apiFetch<{ niveis?: NivelPublico[] }>("/public/logistica/planos")
      .then((res) => {
        const recebidos = res?.niveis;
        if (!vivo || !Array.isArray(recebidos)) return;
        setNiveis((atual) => {
          const proximo = { ...atual };
          for (const item of recebidos) {
            if (item?.nivel !== "BASIC" && item?.nivel !== "ADVANCED" && item?.nivel !== "FULL") continue;
            proximo[item.nivel] = { ...atual[item.nivel], ...item };
          }
          return proximo;
        });
      })
      .catch(() => { /* O catálogo local mantém os preços visíveis sem a API. */ });
    return () => { vivo = false; };
  }, []);

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
    <main className="public-entry rota-site" data-nivel={nivel}>
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

          <a className="rt-simple__apk" href={MOBILE_APK_URL}>
            <Icon name="download" /> Baixar app para Android
          </a>

          <div className="rt-planos" role="group" aria-label="Planos do HBX Logística">
            {ORDEM.map((chave) => {
              const plano = niveis[chave];
              return (
                <button
                  className={chave === nivel ? "is-active" : ""}
                  key={chave}
                  type="button"
                  aria-pressed={chave === nivel}
                  onClick={() => setNivel(chave)}
                >
                  <strong>{NIVEL_LABEL[chave]}</strong>
                  <span>R$ {moeda(plano.precoMensal)}<small>/mês</small></span>
                  <em>{plano.franquiaParadasMes.toLocaleString("pt-BR")} paradas</em>
                </button>
              );
            })}
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
