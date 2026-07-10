"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LoginClient } from "@/components/hbx/login-client";
import { RadarDisc } from "@/components/hbx/radar-disc";
import { applyThemeSoft, setThemeMode } from "@/components/hbx/theme-attributes";
import { WhatsAppPreview, type WAMessage } from "@/components/hbx/whatsapp-preview";
import { getToken } from "@/lib/api";

type StageKey = "radar" | "vendas" | "whatsapp" | "entrega" | "cobranca";
type IconName =
  | "arrow"
  | "bolt"
  | "check"
  | "chevron"
  | "email"
  | "moon"
  | "radar"
  | "route"
  | "sun"
  | "wallet"
  | "whatsapp";

const STAGES: Array<{ key: StageKey; label: string; eyebrow: string; title: string; signal: string }> = [
  { key: "radar", label: "Radar", eyebrow: "Oportunidade", title: "Encontre quem precisa de você.", signal: "Radar ativo" },
  { key: "vendas", label: "Vendas", eyebrow: "Movimento", title: "Cada oportunidade no lugar certo.", signal: "Funil em movimento" },
  { key: "whatsapp", label: "WhatsApp", eyebrow: "Conversa", title: "Atenda no tempo do cliente.", signal: "Online agora" },
  { key: "entrega", label: "Entrega", eyebrow: "Operação", title: "Da venda para a rua, sem ruído.", signal: "Rota em andamento" },
  { key: "cobranca", label: "Cobrança", eyebrow: "Recebimento", title: "Entregou. Cobrou. Recebeu.", signal: "Fluxo concluído" },
];

const STAGE_ICONS: Record<StageKey, IconName> = {
  radar: "radar",
  vendas: "bolt",
  whatsapp: "whatsapp",
  entrega: "route",
  cobranca: "wallet",
};

const ADS: Record<StageKey, { lines: [string, string, string]; subline: string }> = {
  radar: {
    lines: ["Encontre", "clientes", "de verdade."],
    subline: "Radar de empresas e oportunidades reais.",
  },
  vendas: {
    lines: ["Venda", "sem perder", "o fio."],
    subline: "Funil, propostas e próximos passos.",
  },
  whatsapp: {
    lines: ["Converse", "e retorne", "no tempo."],
    subline: "WhatsApp integrado e retornos organizados.",
  },
  entrega: {
    lines: ["Entregue", "sem perder", "o controle."],
    subline: "Rotas, pedidos e clientes conectados.",
  },
  cobranca: {
    lines: ["Cobre", "e receba", "em dia."],
    subline: "Cobranças e pagamentos acompanhados.",
  },
};

const STAGE_ROTATION_MS = 6300;
const MANUAL_RESUME_MS = 18000;

const ICONS: Record<IconName, string[]> = {
  arrow: ["M5 12h14", "m14 0-5-5", "m5 5-5 5"],
  bolt: ["m13 2-9 12h7l-1 8 9-12h-7l1-8Z"],
  check: ["m5 12 4 4L19 6"],
  chevron: ["m9 18 6-6-6-6"],
  email: ["M3 5h18v14H3z", "m3 8 6 5 6-5"],
  moon: ["M20 15.2A8 8 0 0 1 8.8 4a8 8 0 1 0 11.2 11.2Z"],
  radar: ["M12 12h.01", "M8.5 12a3.5 3.5 0 1 1 3.5 3.5", "M5 12a7 7 0 1 1 7 7", "M2 12a10 10 0 1 1 10 10"],
  route: ["M5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z", "M19 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z", "M5 15V9a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4"],
  sun: ["M12 3v2", "M12 19v2", "M3 12h2", "M19 12h2", "m5.6 5.6-1.4-1.4", "m15.8 15.8-1.4-1.4", "m18.4 5.6 1.4-1.4", "m4.2 19.8 1.4-1.4", "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"],
  wallet: ["M3 6h18v13H3z", "M16 10h5v5h-5a2.5 2.5 0 0 1 0-5Z", "M3 6l3-3h12l3 3"],
  whatsapp: ["M20 11.5a8 8 0 0 1-11.9 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z", "M8.4 8.5c.8 3 3.1 5.3 6.1 6.1", "m14.5 14.6 1.4-1.4"],
};

function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg className={`f1-icon ${className}`} viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[name].map((path, index) => <path d={path} key={`${name}-${index}`} />)}
    </svg>
  );
}

// Radar REAL do sistema (W1): o mesmo disco da tela /leads
// (components/hbx/radar-disc.tsx) no lugar do mapa fake.
function RadarScreen() {
  return (
    <div className="f1-screen f1-radar-screen">
      <div className="f1-radar-live" aria-hidden="true">
        <RadarDisc />
      </div>
      <div className="f1-float-list">
        <article><i /><span><small>Novo sinal</small><strong>Solar Prime</strong></span><b>98%</b></article>
        <article><i /><span><small>Visitou agora</small><strong>Casa Norte</strong></span><b>91%</b></article>
        <article><i /><span><small>Perfil ideal</small><strong>Armazém 22</strong></span><b>87%</b></article>
      </div>
    </div>
  );
}

function SalesScreen() {
  return (
    <div className="f1-screen f1-sales-screen">
      <div className="f1-kanban">
        <section><small>Entrada</small><article><b>Solar Prime</b><span>Novo lead</span></article><article><b>Vista Sul</b><span>Hoje</span></article></section>
        <section><small>Conversa</small><article className="is-hot"><b>Casa Norte</b><span>Respondeu</span></article></section>
        <section><small>Proposta</small><article><b>Armazém 22</b><span>Enviada</span></article></section>
        <section><small>Fechado</small><article className="is-done"><Icon name="check" /><b>Viva Café</b></article></section>
      </div>
      <div className="f1-flow-line"><span /></div>
    </div>
  );
}

// Conversa demo estática (nomes do pool fake da landing — nunca empresa real).
const WA_DEMO_MESSAGES: WAMessage[] = [
  { dir: "in", text: "Olá! Quero conhecer o HBX.", time: "09:41" },
  { dir: "out", text: "Perfeito. Já te mostro a esteira.", time: "09:41", status: "read" },
  { dir: "in", text: "Pode ser agora?", time: "09:42" },
];

// WhatsApp REAL do sistema (W1): o mesmo <WhatsAppPreview> usado no app
// (bot/assistente) com uma conversa demo curta, no lugar do chat fake.
function WhatsAppScreen() {
  return (
    <div className="f1-screen f1-chat-screen">
      <WhatsAppPreview messages={WA_DEMO_MESSAGES} typing header={{ name: "Solar Prime", status: "online" }} />
    </div>
  );
}

function DeliveryScreen() {
  return (
    <div className="f1-screen f1-delivery-screen">
      <div className="f1-route-map">
        <svg viewBox="0 0 560 300" aria-hidden="true">
          <path className="f1-street f1-street--one" d="M-10 75C130 20 170 170 310 126s160-40 270 32" />
          <path className="f1-street f1-street--two" d="M80-10c20 90-22 170 60 330M390-10c-50 120 60 180 8 330" />
          <path className="f1-route" d="M85 230c58-70 90-24 145-90s145 34 238-75" />
        </svg>
        <span className="f1-pin f1-pin--start"><Icon name="route" /></span>
        <span className="f1-pin f1-pin--end"><Icon name="check" /></span>
        <span className="f1-van"><Icon name="arrow" /></span>
      </div>
      <article className="f1-delivery-card">
        <span className="f1-delivery-card__icon"><Icon name="route" /></span>
        <span><small>Pedido 0428</small><strong>Chega em breve</strong></span>
        <b>Em rota</b>
      </article>
    </div>
  );
}

function BillingScreen() {
  return (
    <div className="f1-screen f1-billing-screen">
      <section className="f1-billing-result">
        <div className="f1-pay-ring"><Icon name="check" /></div>
        <small>Pagamento confirmado</small>
        <strong>Recebido</strong>
        <span>Venda e entrega conciliadas</span>
      </section>
      <aside className="f1-payment-list">
        <article><span><i /><b>Viva Café</b></span><small>Pago</small></article>
        <article><span><i /><b>Solar Prime</b></span><small>Pago</small></article>
        <article><span><i /><b>Casa Norte</b></span><small>Agendado</small></article>
      </aside>
    </div>
  );
}

function StageVisual({ stage }: { stage: StageKey }) {
  if (stage === "radar") return <RadarScreen />;
  if (stage === "vendas") return <SalesScreen />;
  if (stage === "whatsapp") return <WhatsAppScreen />;
  if (stage === "entrega") return <DeliveryScreen />;
  return <BillingScreen />;
}

function PhoneVisual({ stage }: { stage: StageKey }) {
  return (
    <div className="f1-phone" aria-label="Prévia da esteira HBX no celular">
      <div className="f1-phone__notch" />
      <div className="f1-phone__screen">
        <header className="f1-phone__status"><span>9:41</span><b>HBX</b><span><i /> 100%</span></header>
        <div className="f1-phone__canvas" key={stage}>
          <StageVisual stage={stage} />
        </div>
        <nav className="f1-phone__nav" aria-hidden="true">
          {STAGES.map((item) => (
            <span className={item.key === stage ? "is-active" : ""} key={item.key}>
              <Icon name={STAGE_ICONS[item.key]} />
            </span>
          ))}
        </nav>
      </div>
    </div>
  );
}

export function PublicEntry({ initialScreen = "home" }: { initialScreen?: "home" | "login" } = {}) {
  const router = useRouter();
  const [stageIndex, setStageIndex] = useState(0);
  const [manual, setManual] = useState(false);
  // "/?entrar" chega com o card de login JÁ aberto (SSR — sem flash da home).
  const [screen, setScreen] = useState<"home" | "login">(initialScreen);
  const [themeMode, setThemeModeState] = useState<"dark" | "light">("light");
  const stage = STAGES[stageIndex];
  const ad = ADS[stage.key];

  // Logado nunca vê a landing: cargas de documento são resolvidas pelo boot
  // inline de app/page.tsx (antes da pintura); este efeito cobre a navegação
  // client-side do Next (o script inline não roda nela).
  useEffect(() => {
    if (getToken()) router.replace("/dashboard");
  }, [router]);

  useEffect(() => {
    if (manual || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setStageIndex((current) => (current + 1) % STAGES.length), STAGE_ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [manual]);

  useEffect(() => {
    if (!manual) return;
    const timer = window.setTimeout(() => setManual(false), MANUAL_RESUME_MS);
    return () => window.clearTimeout(timer);
  }, [manual, stageIndex]);

  useEffect(() => {
    const currentMode = document.documentElement.getAttribute("data-theme-mode");
    setThemeModeState(currentMode === "dark" ? "dark" : "light");
  }, []);

  useEffect(() => {
    if (screen !== "login") return;
    const timer = window.setTimeout(() => document.getElementById("em")?.focus(), 620);
    return () => window.clearTimeout(timer);
  }, [screen]);

  function chooseStage(index: number) {
    setStageIndex(index);
    setManual(true);
  }

  function openLogin() {
    setScreen("login");
  }

  function closeLogin() {
    setScreen("home");
  }

  function toggleTheme() {
    const nextMode = themeMode === "dark" ? "light" : "dark";
    applyThemeSoft(() => setThemeMode(nextMode));
    setThemeModeState(nextMode);
  }

  return (
    <main className={"public-entry" + (screen === "login" ? " is-login" : "")} data-stage={stage.key}>
      <div className="f1-backdrop" aria-hidden="true">
        <span className="f1-orb f1-orb--one" />
        <span className="f1-orb f1-orb--two" />
        <span className="f1-grid" />
        <span className="f1-noise" />
      </div>

      <header className="f1-header">
        <Link className="f1-brand" href="/" aria-label="HBX System" onClick={screen === "login" ? closeLogin : undefined}>
          <span className="f1-brand__mark"><i /><i /><i /></span>
          <span>HBX</span>
        </Link>
        <nav className="f1-header__actions" aria-label="Ações principais">
          {screen === "home" && <a className="f1-icon-button f1-email-button" href="mailto:jhonatan@hbxsystem.com.br?subject=Quero%20conhecer%20o%20HBX" title="Enviar e-mail para o HBX">
            <Icon name="email" />
            <span>E-mail</span>
          </a>}
          <button className="f1-icon-button" type="button" onClick={toggleTheme} aria-label={themeMode === "dark" ? "Usar tema claro" : "Usar tema escuro"} title={themeMode === "dark" ? "Usar tema claro" : "Usar tema escuro"}>
            <Icon name={themeMode === "dark" ? "sun" : "moon"} />
          </button>
          {screen === "home"
            ? <button className="f1-login" type="button" onClick={openLogin}>Entrar <Icon name="arrow" /></button>
            : <button className="f1-login" type="button" onClick={closeLogin}>Voltar <Icon name="chevron" /></button>}
        </nav>
      </header>

      <section className="f1-hero f1-home" aria-hidden={screen === "login"} inert={screen === "login"}>
        <div className="f1-copy">
          <div className="f1-kicker"><span /><Icon name="bolt" /> Uma esteira. Do início ao fim.</div>
          <h1 key={stage.key} aria-label={ad.lines.join(" ")} aria-live="polite">
            <span>{ad.lines[0]}</span>
            <span><em>{ad.lines[1]}</em></span>
            <span>{ad.lines[2]}</span>
          </h1>
          <p key={`${stage.key}-subline`}>{ad.subline}</p>
          <div className="f1-cta-row">
            <button className="f1-primary-cta" type="button" onClick={openLogin}>
              Quero conhecer <Icon name="arrow" />
            </button>
            <a className="f1-round-cta" href="mailto:jhonatan@hbxsystem.com.br?subject=Quero%20conhecer%20o%20HBX" aria-label="Falar por e-mail" title="jhonatan@hbxsystem.com.br">
              <Icon name="email" />
            </a>
          </div>
          <div className="f1-trust-line"><span><Icon name="check" /> Tudo conectado</span><i /><span>HBX System</span></div>
        </div>

        <div className="f1-product-wrap">
          <div className="f1-product-aura" aria-hidden="true" />
          <article className="f1-product">
            <header className="f1-product__bar">
              <span className="f1-product__dots"><i /><i /><i /></span>
              <span className="f1-product__brand"><b>HBX</b><small>/ cockpit</small></span>
              <span className="f1-live"><i /> AO VIVO</span>
            </header>
            <div className="f1-product__body">
              <aside className="f1-product__rail" aria-hidden="true">
                {STAGES.map((item) => (
                  <span className={item.key === stage.key ? "is-active" : ""} key={item.key}>
                    <Icon name={STAGE_ICONS[item.key]} />
                  </span>
                ))}
              </aside>
              <section className="f1-product__content">
                <header className="f1-screen-head">
                  <span><small>{stage.eyebrow}</small><strong>{stage.title}</strong></span>
                  <b><i /> {stage.signal}</b>
                </header>
                <div className="f1-screen-slot" key={stage.key}>
                  <StageVisual stage={stage.key} />
                </div>
              </section>
            </div>
          </article>
          <PhoneVisual stage={stage.key} />
        </div>

        <div className="f1-stage-shell">
          <div className="f1-stage-intro"><span>01 — 05</span><strong>A esteira completa</strong></div>
          <div className="f1-stage-track" role="group" aria-label="Etapas da esteira HBX">
            <span className="f1-stage-pill" aria-hidden="true" />
            {STAGES.map((item, index) => (
              <button className={index === stageIndex ? "is-active" : ""} type="button" key={item.key} onClick={() => chooseStage(index)} aria-pressed={index === stageIndex}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{item.label}</strong>
              </button>
            ))}
          </div>
          <a className="f1-whatsapp-mini" href="https://wa.me/5519997024884?text=Ol%C3%A1%2C%20quero%20conhecer%20o%20HBX." target="_blank" rel="noreferrer" aria-label="Falar no WhatsApp">
            <Icon name="whatsapp" />
          </a>
        </div>
      </section>

      <section className="f1-login-layer" aria-hidden={screen !== "login"} aria-label="Entrar no HBX">
        {screen === "login" && <LoginClient />}
      </section>
    </main>
  );
}
