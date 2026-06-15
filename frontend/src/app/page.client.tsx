"use client";

// Landing = conteúdo dentro da CASCA ÚNICA (HbxScene). A casca dá o fundo (robô +
// cor ciclando), a marca » e os 4 guias. Aqui vive um DECK de telas com a MESMA
// transição (sai → troca → entra): Início → Esteira → Integrações → (rota) Planos.
// Avança pelo ">" grande no fim de cada tela. Tudo remove-visual (robô some), mesma
// cor ciclando. É tudo a mesma coisa.

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import { HbxScene, type SceneNav } from "@/components/hbx/hbx-scene";
import { subscribeToThemeMode } from "@/components/hbx/shell";
import { applyThemeSoft, setThemeMode } from "@/components/hbx/theme-attributes";

const FEATURES = [
  { ic: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z", "M12 12h.01"], tx: "Mais clientes" },
  { ic: ["M13 2 3 14h9l-1 8 10-12h-9l1-8Z"], tx: "Atendimento até 100% automático" },
  { ic: ["M12 3 19 6v5c0 4.6-3 7.7-7 9-4-1.3-7-4.4-7-9V6l7-3Z", "M9.3 12l1.9 1.9 3.6-3.7"], tx: "Cobrança facilitada" },
];
const STATIONS = [
  { k: "01", t: "Acha", d: "Encontramos empresas com o perfil ideal pro seu negócio, todo dia.", ic: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M12 12h.01"] },
  { k: "02", t: "Organiza", d: "Validamos e enriquecemos os dados pra você falar com as pessoas certas.", ic: ["M3 5h18l-7 8v6l-4 2v-8L3 5Z"] },
  { k: "03", t: "Conecta", d: "Conversas no WhatsApp e em outros canais, no automático e com a sua cara.", ic: ["M20 11.5a8 8 0 0 1-11.9 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z", "M8.5 11h.01", "M12 11h.01", "M15.5 11h.01"] },
  { k: "04", t: "Automatiza", d: "Follow-up inteligente: respostas, objeções e agendamentos, 24/7.", ic: ["M13 2 4 14h7l-1 8 10-12h-9l1-8Z"] },
  { k: "05", t: "Cobra", d: "Cobramos quem some e aumentamos suas chances de receber.", ic: ["M3 6.5h18a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z", "M2 10h20", "M6 14.5h4"] },
];
const METRICS = ["Mais conversas", "Menos trabalho manual", "Mais recebimentos"];
// Integrações (2ª tela da esteira). Ícones de linha no padrão — logos reais o dono
// sobe no /public depois e a gente troca por imagem.
const INTEGRATIONS = [
  { n: "WhatsApp", d: "Converse, responda e venda no automático.", ic: ["M20 11.5a8 8 0 0 1-11.9 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z", "M8.5 11h.01", "M12 11h.01", "M15.5 11h.01"] },
  { n: "Mercado Pago", d: "Cobranças, links de pagamento e conciliação.", ic: ["M3 6.5h18a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z", "M2 10h20", "M6 14.5h4"] },
  { n: "HubSpot", d: "Leads, oportunidades e pipeline sempre atualizados.", ic: ["M12 9V4", "M12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M18.5 6.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z", "M16.7 5.6 14 8.4"] },
  { n: "Pipedrive", d: "Atividades, negócios e follow-ups sincronizados.", ic: ["M5 5h6v14H5z", "M14 5h5v9h-5z"] },
  { n: "Google Agenda", d: "Agendamentos e lembretes sem falhas.", ic: ["M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z", "M4 9h16", "M9 3v4", "M15 3v4"] },
  { n: "SAP / ERP", d: "Dados e processos integrados ao seu ERP.", ic: ["M4 5h16v6H4z", "M4 14h16v5H4z", "M8 8h.01", "M8 16.5h.01"] },
];
const BARS = ["M4 19V5", "M4 19h16", "M8 19v-6", "M13 19V9", "M18 19v-4"];
const CHEVRON = ["M9 5l7 7-7 7"];
const PLUG = ["M9 7V3", "M15 7V3", "M7 7h10v4a5 5 0 0 1-10 0V7Z", "M12 16v5"];
const SUN = ["M12 3v2.2", "M12 18.8V21", "M4.6 4.6l1.6 1.6", "M17.8 17.8l1.6 1.6", "M3 12h2.2", "M18.8 12H21", "M4.6 19.4l1.6-1.6", "M17.8 6.2l1.6-1.6", "M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z"];
const MOON = ["M20.5 14.4A8.3 8.3 0 0 1 9.6 3.5a6.6 6.6 0 1 0 10.9 10.9Z"];

function Ic({ paths }: { paths: string[] }) {
  return (
    <svg className="site-ic" viewBox="0 0 24 24" aria-hidden>
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

function DiaNoite() {
  const mode = useSyncExternalStore(
    subscribeToThemeMode,
    () => document.documentElement.getAttribute("data-theme-mode"),
    () => null,
  );
  const isDark = mode === "dark";
  return (
    <button type="button" className="site-btn site-btn--ghost"
      onClick={() => applyThemeSoft(() => setThemeMode(isDark ? "light" : "dark"))}
      aria-label={isDark ? "Tema escuro (Noite) — tocar para Dia" : "Tema claro (Dia) — tocar para Noite"}>
      <Ic paths={isDark ? MOON : SUN} />
      {isDark ? "Noite" : "Dia"}
    </button>
  );
}

// O ">" grande do fim da tela (transparente, do tamanho de um card) que avança.
function Next({ hint, onClick }: { hint: string; onClick: () => void }) {
  return (
    <button type="button" className="scene-next" onClick={onClick} aria-label={hint}>
      <Ic paths={CHEVRON} />
      <span className="scene-next__hint">{hint}</span>
    </button>
  );
}

type View = "inicio" | "esteira" | "integra";

export function MarketingClient() {
  const router = useRouter();
  const [view, setView] = useState<View>("inicio");
  const [phase, setPhase] = useState<"in" | "out">("in");
  const [activeCard, setActiveCard] = useState<string | null>(null);

  // vindo de outra tela (?ver=esteira): abre na esteira. Deferido (igual login).
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (!alive) return;
      try { if (new URLSearchParams(window.location.search).get("ver") === "esteira") setView("esteira"); } catch { /* sem window */ }
    });
    return () => { alive = false; };
  }, []);

  // REGRA DA CASCA: nada troca seco. Sai (out) → troca → entra (in). Vale pra
  // trocar de tela do deck E pra sair pra outra rota (some, depois navega).
  function transition(action: () => void) {
    setPhase("out");
    window.setTimeout(() => { action(); setPhase("in"); }, 360);
  }
  const goView = (v: View) => { if (v !== view) transition(() => setView(v)); };
  const goRoute = (href: string) => transition(() => router.push(href));

  const onNav = (k: SceneNav) => {
    if (k === "inicio") goView("inicio");
    else if (k === "esteira") goView("esteira");
    else if (k === "planos") goRoute("/planos");
    else if (k === "entrar") goRoute("/login");
  };

  return (
    <HbxScene
      active={view === "inicio" ? "inicio" : "esteira"}
      plain={view !== "inicio"}
      themeControls={false}
      onBrand={() => goView("inicio")}
      onNav={onNav}
    >
      <div className={"scene-view is-" + phase}>
        {view === "inicio" && (
          <div className="scene-hero">
            <span className="site-eyebrow">Radar · Vendas · Atendimento · Recovery</span>
            <h1 className="site-title">Do anúncio<br />à <span className="site-accent">cobrança</span>.</h1>
            <p className="site-sub">Tudo num fluxo só. Nós achamos o cliente, atendemos no automático e cobramos quem some. Você fecha.</p>
            <div className="site-cta">
              <button className="site-btn site-btn--solid" onClick={() => goView("esteira")}>Conhecer o HBX</button>
              <DiaNoite />
            </div>
            <div className="site-feats">
              {FEATURES.map((f) => (
                <div key={f.tx} className="site-feat">
                  <span className="site-feat__ic"><Ic paths={f.ic} /></span>
                  <span className="site-feat__tx">{f.tx}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === "esteira" && (
          <div className="scene-center scene-esteira">
            <span className="site-eyebrow">Como funciona</span>
            <h2 className="site-esteira-title">A esteira <span className="site-accent">HBX</span>.</h2>
            <p className="site-sub">Do primeiro contato até a cobrança. Tudo no automático.</p>
            <div className="site-esteira">
              {STATIONS.map((s) => (
                <button key={s.t} type="button"
                  className={"site-station" + (activeCard === s.t ? " is-active" : "")}
                  aria-pressed={activeCard === s.t}
                  onClick={() => setActiveCard(activeCard === s.t ? null : s.t)}>
                  <span className="site-station__ic"><Ic paths={s.ic} /></span>
                  <span className="site-station__k">{s.k}</span>
                  <strong className="site-station__t">{s.t}</strong>
                  <span className="site-station__d">{s.d}</span>
                </button>
              ))}
            </div>
            <div className="site-metrics">
              <span className="site-metrics__lead"><Ic paths={BARS} />Menos trabalho manual. Mais conversas, reuniões e vendas.</span>
              <span className="site-metrics__tags">
                {METRICS.map((m) => <span key={m} className="site-metric">{m}</span>)}
              </span>
            </div>
            <Next hint="Integrações" onClick={() => goView("integra")} />
          </div>
        )}

        {view === "integra" && (
          <div className="scene-center scene-esteira">
            <span className="site-eyebrow">Tudo conectado</span>
            <h2 className="site-esteira-title">Integra, sincroniza e <span className="site-accent">entrega resultado</span>.</h2>
            <p className="site-sub">Conectamos os canais e sistemas que seu negócio já usa — os dados fluem, as tarefas acontecem e o resultado aparece.</p>
            <div className="site-integra">
              {INTEGRATIONS.map((it) => (
                <div key={it.n} className="site-station">
                  <span className="site-station__ic"><Ic paths={it.ic} /></span>
                  <strong className="site-station__t">{it.n}</strong>
                  <span className="site-station__d">{it.d}</span>
                </div>
              ))}
            </div>
            <div className="site-metrics">
              <span className="site-metrics__lead"><Ic paths={PLUG} />APIs abertas e flexíveis — integre o que faz sentido pro seu negócio.</span>
              <span className="site-metrics__tags">
                <span className="site-metric">+50 integrações</span>
                <span className="site-metric">Novas conexões sempre</span>
              </span>
            </div>
            <Next hint="Ver planos" onClick={() => goRoute("/planos")} />
          </div>
        )}
      </div>
    </HbxScene>
  );
}
