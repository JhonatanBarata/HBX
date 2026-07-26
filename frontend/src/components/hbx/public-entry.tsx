"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LoginClient } from "@/components/hbx/login-client";
import { RadarDisc } from "@/components/hbx/radar-disc";
import { RegisterPanel } from "@/components/hbx/register-client";
import { applyThemeSoft, setThemeMode } from "@/components/hbx/theme-attributes";
import { WhatsAppPreview, type WAMessage } from "@/components/hbx/whatsapp-preview";
import { isTokenLive } from "@/lib/api";
import { CONTACT_WHATSAPP_URL } from "@/lib/contato";

const MOBILE_APK_URL = String(process.env.NEXT_PUBLIC_ANDROID_APK_URL || "/download/android-logistica").trim();

type StageKey = "radar" | "vendas" | "whatsapp" | "entrega" | "cobranca";
type IconName =
  | "arrow"
  | "bolt"
  | "check"
  | "chevron"
  | "email"
  | "moon"
  | "play"
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
    subline: "Do primeiro contato à cobrança.",
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
  arrow: ["M5 12h14", "M14 7l5 5-5 5"],
  bolt: ["m13 2-9 12h7l-1 8 9-12h-7l1-8Z"],
  check: ["m5 12 4 4L19 6"],
  chevron: ["m9 18 6-6-6-6"],
  email: ["M3 5h18v14H3z", "m3 8 6 5 6-5"],
  moon: ["M20 15.2A8 8 0 0 1 8.8 4a8 8 0 1 0 11.2 11.2Z"],
  play: ["M8 5v14l11-7z"],
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
    <div className="f1-phone" aria-label="Prévia do HBX Logística no celular">
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

type EntryScreen = "home" | "login" | "criar";

export function PublicEntry({ initialScreen = "home" }: { initialScreen?: EntryScreen } = {}) {
  const router = useRouter();
  const [stageIndex, setStageIndex] = useState(0);
  const [manual, setManual] = useState(false);
  // "/?entrar"/"/?criar" chegam com o card JÁ aberto (SSR — sem flash da home).
  const [screen, setScreen] = useState<EntryScreen>(initialScreen);
  const [themeMode, setThemeModeState] = useState<"dark" | "light">("light");
  const [cookieVisible, setCookieVisible] = useState(true);
  const stage = STAGES[stageIndex];
  const ad = ADS[stage.key];

  // Logado nunca vê a landing: cargas de documento são resolvidas pelo boot
  // inline de app/page.tsx (antes da pintura); este efeito cobre a navegação
  // client-side do Next (o script inline não roda nela).
  useEffect(() => {
    if (isTokenLive()) router.replace("/dashboard");
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lê o atributo do DOM (indisponível no SSR) 1x no mount; efeito legítimo
    setThemeModeState(currentMode === "dark" ? "dark" : "light");
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza a visibilidade com o consentimento persistido no navegador
    if (window.localStorage.getItem("hbx-cookie-consent")) setCookieVisible(false);
  }, []);

  // Navegação client-side pra /?entrar | /?criar (links legados /login e
  // /register redirecionam pra cá) precisa trocar o card mesmo com o
  // componente já montado — o estado segue a prop.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resincroniza a tela quando a prop `initialScreen` muda; efeito legítimo
    setScreen(initialScreen);
  }, [initialScreen]);

  // Foco no primeiro campo dos DOIS cards (login e cadastro usam o mesmo #em).
  useEffect(() => {
    if (screen === "home") return;
    const timer = window.setTimeout(() => document.getElementById("em")?.focus(), 620);
    return () => window.clearTimeout(timer);
  }, [screen]);

  function chooseStage(index: number) {
    setStageIndex(index);
    setManual(true);
  }

  function openLogin() {
    setScreen("login");
    try {
      window.history.replaceState(null, "", "/");
    } catch {}
  }

  function closeCard() {
    setScreen("home");
    try {
      window.history.replaceState(null, "", "/");
    } catch {}
  }

  // Alternância Entrar ↔ Criar Conta SEM navegar: troca o card e mantém a URL
  // rasa coerente pra refresh/deep-link (replaceState nativo — o App Router
  // sincroniza o searchParams).
  function swapCard(next: "login" | "criar") {
    setScreen(next);
    try {
      window.history.replaceState(null, "", next === "criar" ? "/?criar" : "/?entrar");
    } catch { /* sem history */ }
  }

  function toggleTheme() {
    const nextMode = themeMode === "dark" ? "light" : "dark";
    applyThemeSoft(() => setThemeMode(nextMode));
    setThemeModeState(nextMode);
  }

  return (
    <main className={"public-entry" + (screen !== "home" ? " is-login" : "")} data-stage={stage.key}>
      <div className="f1-backdrop" aria-hidden="true">
        <span className="f1-orb f1-orb--one" />
        <span className="f1-orb f1-orb--two" />
        <span className="f1-grid" />
        <span className="f1-noise" />
      </div>

      <header className="f1-header">
        <Link className="f1-brand" href="/" aria-label="HBX System" onClick={screen !== "home" ? closeCard : undefined}>
          <span className="f1-brand__mark"><i /><i /><i /></span>
          <span>HBX</span>
        </Link>
        <nav className="f1-header__actions" aria-label="Ações principais">
          <Link className="f1-icon-button" href="/tutorialexterno" aria-label="Ver o tutorial" title="Tutorial">
            <Icon name="play" />
          </Link>
          <button className="f1-icon-button" type="button" onClick={toggleTheme} aria-label={themeMode === "dark" ? "Usar tema claro" : "Usar tema escuro"} title={themeMode === "dark" ? "Usar tema claro" : "Usar tema escuro"}>
            <Icon name={themeMode === "dark" ? "sun" : "moon"} />
          </button>
          {screen === "home"
            ? <button className="f1-login" type="button" onClick={openLogin}>Entrar <Icon name="arrow" /></button>
            : <button className="f1-login" type="button" onClick={closeCard}>Voltar <Icon name="chevron" /></button>}
        </nav>
      </header>

      <section className="f1-hero f1-home" aria-hidden={screen !== "home"} inert={screen !== "home"}>
        <div className="f1-copy">
          <h1 key={stage.key} aria-label={ad.lines.join(" ")} aria-live="polite">
            <span>{ad.lines[0]}</span>
            <span><em>{ad.lines[1]}</em></span>
            <span>{ad.lines[2]}</span>
          </h1>
          <p key={`${stage.key}-subline`}>{ad.subline}</p>
          <div className="f1-cta-row">
            <a className="f1-primary-cta" href="#produto">
              Conhecer a HBX <Icon name="arrow" />
            </a>
            <a className="f1-secondary-cta" href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer">Fale conosco</a>
          </div>
        </div>

        <div className="f1-product-wrap" id="produto">
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
          <div className="f1-stage-track" role="group" aria-label="Etapas da esteira HBX">
            <span className="f1-stage-pill" aria-hidden="true" />
            {STAGES.map((item, index) => (
              <button className={index === stageIndex ? "is-active" : ""} type="button" key={item.key} onClick={() => chooseStage(index)} aria-pressed={index === stageIndex}>
                <Icon name={STAGE_ICONS[item.key]} />
                <strong>{item.label}</strong>
              </button>
            ))}
          </div>
          <a className="f1-whatsapp-mini" href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer" aria-label="Falar no WhatsApp">
            <Icon name="whatsapp" />
          </a>
        </div>
      </section>

      <section className="f1-login-layer" aria-hidden={screen === "home"} aria-label="Entrar ou criar conta no HBX">
        {screen === "login" && <LoginClient onCriarConta={() => swapCard("criar")} />}
        {screen === "criar" && (
          <div className="hbx-scene login-console--embedded is-register">
            <RegisterPanel onEntrar={() => swapCard("login")} />
          </div>
        )}
      </section>

      {screen === "home" && (
        <section className="f1-mobile-apps" aria-label="Aplicativos móveis HBX">
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
              <a href={MOBILE_APK_URL} className="f1-mobile-app__link">Baixar HBX Logística <Icon name="arrow" /></a>
            </div>
            <div className="f1-mobile-app__art-wrap">
              <img src="/hbx-theme/assets/mobile-apps/android-hero.png" alt="Android futurista do HBX Logística" />
            </div>
          </article>
        </section>
      )}

      <footer className="f1-footer">
        <span>© 2026 HBX</span>
        <nav aria-label="Links legais">
          <a href="/termos">Termos de Uso</a>
          <a href="/politicas">Política de Privacidade</a>
          <a href="/politicas#cookies">Política de Cookies</a>
        </nav>
      </footer>

      {cookieVisible && (
        <aside className="f1-cookie-banner" role="dialog" aria-label="Preferências de privacidade">
          <div>
            <strong>Preferências de privacidade</strong>
            <p>Usamos cookies necessários e, com sua permissão, dados de uso. <a href="/politicas">Ver política</a></p>
          </div>
          <div className="f1-cookie-actions">
            <button type="button" onClick={() => { window.localStorage.setItem("hbx-cookie-consent", "necessary"); setCookieVisible(false); }}>Só necessários</button>
            <button type="button" className="is-accept" onClick={() => { window.localStorage.setItem("hbx-cookie-consent", "all"); setCookieVisible(false); }}>Aceitar</button>
          </div>
        </aside>
      )}
    </main>
  );
}
