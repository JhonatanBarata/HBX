"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LoginClient } from "@/components/hbx/login-client";
import { LogisticaRealPreview, type LogisticaRealScreen } from "@/components/hbx/logistica-real-preview";
import { RadarDisc } from "@/components/hbx/radar-disc";
import { RegisterPanel } from "@/components/hbx/register-client";
import { applyThemeSoft, setThemeMode } from "@/components/hbx/theme-attributes";
import { WhatsAppPreview, type WAMessage } from "@/components/hbx/whatsapp-preview";
import { isTokenLive } from "@/lib/api";
import { MOBILE_APK_URL } from "@/lib/app-mobile";
import { CONTACT_WHATSAPP_URL } from "@/lib/contato";

type StageKey = "radar" | "vendas" | "whatsapp" | "entrega" | "cobranca";
type IconName =
  | "arrow"
  | "bell"
  | "bolt"
  | "check"
  | "chevron"
  | "download"
  | "email"
  | "eye"
  | "moon"
  | "play"
  | "radar"
  | "route"
  | "sun"
  | "tower"
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

// HBX Logística dentro da vitrine: 4 telas no celular do motorista, 1 no
// monitor do gestor.
const LOGI: Array<{ key: LogisticaRealScreen; label: string; icon: IconName }> = [
  { key: "prospector", label: "Prospector", icon: "radar" },
  { key: "montagem", label: "Montar rota", icon: "route" },
  { key: "folha", label: "Entregar", icon: "check" },
  { key: "torre", label: "Torre de controle", icon: "tower" },
  { key: "caderneta", label: "Fechar o dia", icon: "wallet" },
];

const ADS_LOGI: Record<LogisticaRealScreen, { lines: [string, string, string]; subline: string }> = {
  prospector: { lines: ["Ache", "clientes", "na sua rota."], subline: "Empresas com CNPJ e telefone no corredor da entrega." },
  montagem: { lines: ["Monte", "o dia", "em um toque."], subline: "A ordem das paradas sai pronta." },
  folha: { lines: ["Entregue", "com prova", "na mão."], subline: "Foto, assinatura e código a cada parada." },
  torre: { lines: ["Veja", "a rua", "em tempo real."], subline: "Desvio, parada não prevista e o motorista no mapa." },
  torreFone: { lines: ["Veja", "a rua", "em tempo real."], subline: "Desvio, parada não prevista e o motorista no mapa." },
  caderneta: { lines: ["Feche", "o caixa", "no fim do dia."], subline: "Dinheiro, Pix, cartão e fiado conferidos." },
  rota: { lines: ["Rota", "pronta", "todo dia."], subline: "A operação inteira na palma da mão." },
};

// O que a irmã grande de cada tela do celular mostra no monitor.
const LOGI_DESKTOP: Record<LogisticaRealScreen, string> = {
  prospector: "Empresas do corredor.",
  montagem: "A rota do dia.",
  folha: "A prova da entrega.",
  torre: "A rua em tempo real.",
  torreFone: "A rua em tempo real.",
  caderneta: "O caixa do dia.",
  rota: "A rota do dia.",
};

const PROVAS: Array<{ icon: IconName; texto: string }> = [
  { icon: "check", texto: "Comprovante com foto e assinatura" },
  { icon: "bell", texto: "Alerta de parada não prevista" },
  { icon: "eye", texto: "Cliente acompanha a entrega pelo link" },
];

// Números do mercado que a torre endereça. Fonte junto do dado — sem fonte
// não entra.
const DADOS: Array<{ valor: string; texto: string; fonte: string }> = [
  { valor: "10.478", texto: "roubos de carga em 2024, R$ 1,2 bi de prejuízo", fonte: "NTC&Logística" },
  { valor: "38,5%", texto: "do prejuízo já é na entrega urbana — era 18,9%", fonte: "Overhaul" },
  { valor: "+17,5%", texto: "roubo de utilitários no 2º trimestre de 2026", fonte: "Transporte Moderno" },
  { valor: "2% a 5%", texto: "do frete some em glosa por canhoto perdido", fonte: "Transp.net" },
];

const ICONS: Record<IconName, string[]> = {
  arrow: ["M5 12h14", "M14 7l5 5-5 5"],
  bell: ["M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6", "M10.3 19a2 2 0 0 0 3.4 0"],
  bolt: ["m13 2-9 12h7l-1 8 9-12h-7l1-8Z"],
  check: ["m5 12 4 4L19 6"],
  chevron: ["m9 18 6-6-6-6"],
  download: ["M12 3v12", "m7 10 5 5 5-5", "M5 21h14"],
  email: ["M3 5h18v14H3z", "m3 8 6 5 6-5"],
  eye: ["M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z", "M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"],
  moon: ["M20 15.2A8 8 0 0 1 8.8 4a8 8 0 1 0 11.2 11.2Z"],
  play: ["M8 5v14l11-7z"],
  radar: ["M12 12h.01", "M8.5 12a3.5 3.5 0 1 1 3.5 3.5", "M5 12a7 7 0 1 1 7 7", "M2 12a10 10 0 1 1 10 10"],
  route: ["M5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z", "M19 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z", "M5 15V9a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4"],
  tower: ["M12 20v-7", "m8 20 4-16 4 16", "M6.5 8.5 12 6l5.5 2.5", "M4 13a9 9 0 0 1 2-5", "M20 13a9 9 0 0 0-2-5"],
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

// ---------------------------------------------------------------------------
// AS TELAS DE DESKTOP DO HBX ROTA. Cada tela do celular tem a irmã grande: o
// motorista faz, o gestor confere. Tudo com as classes do tema — nenhuma cor
// nasce aqui.
// ---------------------------------------------------------------------------
function RotaProspectorScreen() {
  return (
    <div className="f1-screen f1-rota-screen f1-rota-prospector">
      <div className="f1-rota-mapa" aria-hidden="true">
        <svg viewBox="0 0 460 260">
          <path className="f1-rota-mapa__rua" d="M-10 70h480M-10 150h480M-10 218h480M90-10v280M215-10v280M340-10v280" />
          <path className="f1-rota-mapa__corredor" d="M20 218h195V70h225" />
        </svg>
        <span className="f1-rota-pino f1-rota-pino--um" />
        <span className="f1-rota-pino f1-rota-pino--dois" />
        <span className="f1-rota-pino f1-rota-pino--tres" />
      </div>
      <div className="f1-rota-lista">
        <span className="f1-rota-lista__topo">4 empresas no corredor</span>
        <article><strong>Pet Shop Amigo Fiel</strong><span><small>28.192.110/0001-11</small><b>(11) 95555-0669</b></span></article>
        <article><strong>Auto Center Avenida</strong><span><small>68.043.458/0001-03</small><b>(11) 95555-0347</b></span></article>
        <article><strong>Mercado Bela Vista</strong><span><small>12.660.907/0001-70</small><b>(11) 95555-0912</b></span></article>
      </div>
    </div>
  );
}

function RotaMontagemScreen() {
  return (
    <div className="f1-screen f1-rota-screen f1-rota-montagem">
      <div className="f1-rota-paradas">
        <span className="f1-rota-lista__topo">Rota de hoje · 23 paradas</span>
        <ol>
          <li><i>1</i><span><strong>João da Silva</strong><small>R. das Acácias, 218</small></span><b>08:10</b></li>
          <li><i>2</i><span><strong>Mercadinho Bom Preço</strong><small>Av. Campos Sales, 90</small></span><b>08:26</b></li>
          <li className="is-arrastando"><i>3</i><span><strong>Maria Aparecida</strong><small>R. Barão de Itapura, 41</small></span><b>08:41</b></li>
          <li><i>4</i><span><strong>Padaria Rio Novo</strong><small>R. Quatro, 77</small></span><b>08:58</b></li>
        </ol>
      </div>
      <aside className="f1-rota-resumo">
        <article><small>Distância</small><strong>38,4 km</strong></article>
        <article><small>Tempo</small><strong>4h12</strong></article>
        <article><small>Carga do dia</small><strong>180 galões</strong></article>
        <span className="f1-rota-botao">Iniciar rota</span>
      </aside>
    </div>
  );
}

function RotaEntregarScreen() {
  return (
    <div className="f1-screen f1-rota-screen f1-rota-entregar">
      <article className="f1-rota-prova">
        <header><span><small>Parada 3 de 23</small><strong>Maria Aparecida</strong></span><b className="is-ok">Entregue</b></header>
        <div className="f1-rota-prova__grade">
          <span className="f1-rota-prova__foto"><i /></span>
          <span className="f1-rota-prova__assina"><svg viewBox="0 0 120 44" aria-hidden="true"><path d="M6 34c14-26 22 4 33-8s16 14 27 2 18-16 28-6" /></svg></span>
        </div>
        <footer><span><small>Código</small><strong>4F2K-90</strong></span><span><small>Recebido às</small><strong>08:41</strong></span></footer>
      </article>
      <aside className="f1-rota-vasilhame">
        <span className="f1-rota-lista__topo">Vasilhames</span>
        <article><small>Levou</small><strong>3</strong></article>
        <article><small>Voltou</small><strong>2</strong></article>
        <article className="is-saldo"><small>Saldo do cliente</small><strong>+1</strong></article>
      </aside>
    </div>
  );
}

function RotaFecharScreen() {
  return (
    <div className="f1-screen f1-rota-screen f1-rota-fechar">
      <div className="f1-rota-caixa">
        <span className="f1-rota-lista__topo">Fechamento do dia</span>
        <div className="f1-rota-caixa__grade">
          <article><small>Dinheiro</small><strong>R$ 132,00</strong></article>
          <article><small>Pix</small><strong>R$ 98,00</strong></article>
          <article><small>Cartão</small><strong>R$ 68,00</strong></article>
          <article><small>Fiado</small><strong>R$ 38,00</strong></article>
        </div>
        <footer><span>Total do dia</span><strong>R$ 336,00</strong></footer>
      </div>
      <aside className="f1-rota-conferido">
        <article><small>Entregas</small><strong>23</strong></article>
        <article><small>Comprovantes</small><strong>23</strong></article>
        <article><small>Vasilhames na rua</small><strong>14</strong></article>
        <span className="f1-rota-botao">Fechar o caixa</span>
      </aside>
    </div>
  );
}

const ROTA_SCREENS: Partial<Record<LogisticaRealScreen, () => React.JSX.Element>> = {
  prospector: RotaProspectorScreen,
  montagem: RotaMontagemScreen,
  folha: RotaEntregarScreen,
  caderneta: RotaFecharScreen,
};

function StageVisual({ stage }: { stage: StageKey }) {
  if (stage === "radar") return <RadarScreen />;
  if (stage === "vendas") return <SalesScreen />;
  if (stage === "whatsapp") return <WhatsAppScreen />;
  if (stage === "entrega") return <DeliveryScreen />;
  return <BillingScreen />;
}

function PhoneVisual({ screen, themeMode }: { screen: LogisticaRealScreen; themeMode: "dark" | "light" }) {
  return (
    <div className="f1-real-phone" aria-label="HBX Logística em funcionamento">
      <LogisticaRealPreview
        className="f1-real-phone__iframe"
        key={`${screen}-${themeMode}`}
        screen={screen}
        themeMode={themeMode}
      />
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
  // 10 passos numa fita só: 0-4 é o HBX Desktop, 5-9 é o HBX Rota. Chegou no
  // fim do Desktop, cai sozinho no Rota e volta.
  const noRota = stageIndex >= STAGES.length;
  const logi = noRota ? LOGI[stageIndex - STAGES.length].key : null;
  const stage = noRota ? STAGES[3] : STAGES[stageIndex];
  const ad = noRota && logi ? ADS_LOGI[logi] : ADS[stage.key];
  const naTorre = logi === "torre";
  const noFone: LogisticaRealScreen = naTorre ? "torreFone" : (logi ?? "prospector");
  const RotaDesktop = logi ? ROTA_SCREENS[logi] : undefined;

  // Logado nunca vê a landing: cargas de documento são resolvidas pelo boot
  // inline de app/page.tsx (antes da pintura); este efeito cobre a navegação
  // client-side do Next (o script inline não roda nela).
  useEffect(() => {
    if (isTokenLive()) router.replace("/dashboard");
  }, [router]);

  useEffect(() => {
    if (manual || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const total = STAGES.length + LOGI.length;
    const timer = window.setInterval(() => setStageIndex((current) => (current + 1) % total), STAGE_ROTATION_MS);
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
    <main className={"public-entry" + (screen !== "home" ? " is-login" : "")} data-stage={stage.key} data-logi={logi ?? "off"}>
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
          <ul className="f1-provas">
            {PROVAS.map((prova) => (
              <li key={prova.texto}><Icon name={prova.icon} />{prova.texto}</li>
            ))}
          </ul>
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
                  <span>
                    <small>{logi ? "No computador" : stage.eyebrow}</small>
                    <strong>{logi ? LOGI_DESKTOP[logi] : stage.title}</strong>
                  </span>
                  <b><i /> {logi ? "Rota em andamento" : stage.signal}</b>
                </header>
                <div className="f1-screen-slot" key={logi ?? stage.key}>
                  {naTorre
                    ? <LogisticaRealPreview className="f1-torre-frame" screen="torre" themeMode={themeMode} />
                    : RotaDesktop
                      ? <RotaDesktop />
                      : <StageVisual stage={stage.key} />}
                </div>
              </section>
            </div>
          </article>
        </div>

        <aside className="f1-logi" aria-label="HBX Logística">
          <PhoneVisual screen={noFone} themeMode={themeMode} />
          <nav className="f1-logi__nav" aria-label="HBX Rota">
            <span className="f1-trilha-nome">HBX Rota</span>
            {LOGI.map((item, index) => (
              <button
                className={item.key === logi ? "is-active" : ""}
                key={item.key}
                type="button"
                aria-pressed={item.key === logi}
                onClick={() => chooseStage(STAGES.length + index)}
              >
                <Icon name={item.icon} />
                <strong>{item.label}</strong>
              </button>
            ))}
          </nav>
          <div className="f1-baixar">
            <a href={MOBILE_APK_URL} className="f1-baixar__apk">
              <Icon name="download" />
              <span>Baixar HBX Logística <small>Android</small></span>
            </a>
            <span className="f1-baixar__ios">iPhone em breve</span>
          </div>
        </aside>

        <div className="f1-dados">
          <span className="f1-dados__titulo">O que acontece na rua</span>
          {DADOS.map((dado) => (
            <article key={dado.valor}>
              <b>{dado.valor}</b>
              <span>{dado.texto}</span>
              <small>{dado.fonte}</small>
            </article>
          ))}
        </div>

        <div className="f1-stage-shell">
          <span className="f1-trilha-nome f1-trilha-nome--barra">HBX Desktop</span>
          <div className="f1-stage-track" role="group" aria-label="Etapas do HBX Desktop">
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
              <span className="f1-mobile-app__links">
                <a href={MOBILE_APK_URL} className="f1-mobile-app__link">Baixar HBX Logística <Icon name="arrow" /></a>
              </span>
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
