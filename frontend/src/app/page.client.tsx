"use client";

// CASCA ÚNICA (15/06): UM componente, CINCO views (inicio/esteira/modulos/planos/entrar),
// UM dono do fundo (HbxScene — robô + cor ciclando). A mesma transição em toda troca:
// sai (is-out) → view troca → entra (is-in). onNav sempre goView, nunca route change
// (exceto /register e /reset-password que são telas separadas). A HbxScene NUNCA
// re-monta — o robô e a cor continuam sem interrupção ao navegar entre as 5 views.

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import { HbxScene, type SceneNav } from "@/components/hbx/hbx-scene";
import { subscribeToThemeMode } from "@/components/hbx/shell";
import { applyThemeSoft, setThemeMode } from "@/components/hbx/theme-attributes";
import { RegisterPanel } from "@/app/register/page.client";
import { apiFetch, setToken, type ApiError } from "@/lib/api";

// ── utils ─────────────────────────────────────────────────────────────────────
function formatCpfCnpj(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

// ── types ──────────────────────────────────────────────────────────────────────
type View = "inicio" | "esteira" | "modulos" | "planos" | "entrar";
type LoginResponse = { access_token?: string; next?: string; requiresCheckout?: boolean };
type LoginErrorPayload = { code?: string; message?: string; forceAvailable?: boolean; activeSession?: { lastSeenAt?: string | null; userAgent?: string | null } };

// ── dados de inicio ────────────────────────────────────────────────────────────
const FEATURES = [
  { ic: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z", "M12 12h.01"], tx: "Mais clientes" },
  { ic: ["M13 2 3 14h9l-1 8 10-12h-9l1-8Z"], tx: "Atendimento até 100% automático" },
  { ic: ["M12 3 19 6v5c0 4.6-3 7.7-7 9-4-1.3-7-4.4-7-9V6l7-3Z", "M9.3 12l1.9 1.9 3.6-3.7"], tx: "Cobrança facilitada" },
];
const STATIONS = [
  { k: "01", t: "Acha", d: "Encontramos empresas com o perfil ideal pro seu negócio, todo dia.", ic: [
    "M12 16v5", "M9 21h6",
    "M12 12h.01",
    "M8.5 12a3.5 3.5 0 0 1 7 0",
    "M5 12a7 7 0 0 1 14 0",
    "M2 12a10 10 0 0 1 20 0",
  ]},
  { k: "02", t: "Organiza", d: "Validamos e enriquecemos os dados pra você falar com as pessoas certas.", ic: [
    "M3 4.5h18L13 13.5v6l-2 1.5V13.5L3 4.5Z",
    "M7.5 8.5h9", "M9.5 11.5h5",
  ]},
  { k: "03", t: "Conecta", d: "Conversas no WhatsApp e em outros canais, no automático e com a sua cara.", ic: [
    "M20 11.5a8 8 0 0 1-11.9 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z",
    "M8.5 11h.01", "M12 11h.01", "M15.5 11h.01",
  ]},
  { k: "04", t: "Automatiza", d: "Follow-up inteligente: respostas, objeções e agendamentos, 24/7.", ic: [
    "M21 12a9 9 0 1 1-4.6-7.9",
    "M21 3.5v5h-5",
    "M12 8v4l2.5 2.5",
  ]},
  { k: "05", t: "Cobra", d: "Cobramos quem some e aumentamos suas chances de receber.", ic: [
    "M4 3h12l4 4v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z",
    "M16 3v4h4",
    "M8 14l2.5 2.5 5.5-5.5",
  ]},
];
const METRICS = ["Mais conversas", "Menos trabalho manual", "Mais recebimentos"];

// ── dados de módulos ───────────────────────────────────────────────────────────
const INTEGRATIONS = [
  { n: "WhatsApp", d: "Converse, responda e venda no automático.", ic: ["M20 11.5a8 8 0 0 1-11.9 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z", "M8.5 11h.01", "M12 11h.01", "M15.5 11h.01"] },
  { n: "Mercado Pago", d: "Cobranças, links de pagamento e conciliação.", ic: ["M3 6.5h18a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z", "M2 10h20", "M6 14.5h4"] },
  { n: "HubSpot", d: "Leads, oportunidades e pipeline sempre atualizados.", ic: ["M12 9V4", "M12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M18.5 6.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z", "M16.7 5.6 14 8.4"] },
  { n: "Pipedrive", d: "Atividades, negócios e follow-ups sincronizados.", ic: ["M5 5h6v14H5z", "M14 5h5v9h-5z"] },
  { n: "Google Agenda", d: "Agendamentos e lembretes sem falhas.", ic: ["M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z", "M4 9h16", "M9 3v4", "M15 3v4"] },
  { n: "SAP / ERP", d: "Dados e processos integrados ao seu ERP.", ic: ["M4 5h16v6H4z", "M4 14h16v5H4z", "M8 8h.01", "M8 16.5h.01"] },
];

// ── dados de planos ────────────────────────────────────────────────────────────
const SNOW = ["M12 2v20", "M3.34 7l17.32 10", "M20.66 7L3.34 17", "M2 12h20"];
const TARGET = ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M12 12h.01"];
const BOLT = ["M13 2 4 14h7l-1 8 10-12h-9l1-8Z"];
const CUBE = ["M12 2 21 7v10l-9 5-9-5V7l9-5Z", "M3.3 7.2 12 12l8.7-4.8", "M12 12v10"];
const CHECK = ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M8.4 12l2.4 2.4 4.8-5"];
const PLAN_BARS = ["M4 19V5", "M4 19h16", "M8 19v-6", "M13 19V9", "M18 19v-4"];
const LOGOS = [
  ["M20 11.5a8 8 0 0 1-11.9 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z"],
  ["M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Z", "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M17 7h.01"],
  ["M3 16c0-5 2-9 4.5-9S11 16 12 16s2-9 4.5-9S21 11 21 16"],
  ["M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z", "M4 9h16", "M9 3v4", "M15 3v4"],
  ["M21 12a9 9 0 1 1-3-6.7", "M21 4v5h-5"],
];
type Plan = { key: string; accent: string; ic: string[]; tag: string; price: string; pricePrefix?: string; feats: string[]; cta: string; hot?: boolean; badge?: string; score?: string; trial?: string; logos?: boolean };
const PLANS: Plan[] = [
  { key: "hbx_lite", accent: "List", ic: SNOW, tag: "Você pede, o Radar entrega. Cards crus pra você esquentar e prospectar.", price: "R$ 49,00", feats: ["Telefone, cidade, segmento e site", "Redes sociais quando encontradas", "880 leads por mês"], cta: "Escolher plano" },
  { key: "hbx_padrao", accent: "Lead", ic: TARGET, hot: true, badge: "Mais escolhido", trial: "14 dias grátis", tag: "Leads inteligentes: você já sabe quem ligar e o que dizer.", price: "R$ 99,00", feats: ["WhatsApp verificado pela HBX", "Score, motivo e canal recomendado", "Mensagem pronta por segmento", "2.200 leads por mês"], cta: "Testar 14 dias grátis" },
  { key: "hbx_pro", accent: "Full", ic: BOLT, tag: "Atendimento no painel e Bot IA prospectando por você.", price: "R$ 249,00", feats: ["Tudo do Lead", "Atendimento interno pelo painel", "Bot IA + prospecção pós-resposta", "3.500 leads por mês"], cta: "Escolher plano" },
  { key: "hbx_melhor", accent: "Company", ic: CUBE, tag: "Tudo do Full + Recovery e integração com o seu ERP.", pricePrefix: "A partir de", price: "R$ 445,90", feats: ["Recovery de inadimplentes", "Cobrança integrada ao seu ERP", "Implantação feita pela HBX"], logos: true, cta: "Falar com especialista" },
];

// Detalhes do plano (painel que desliza ao escolher) — NÃO repete o card: expande
// a história e VENDE. Espinha = temperatura (Fria→Morna→Quente). Ordem do dono:
// NUNCA "CRM"/"SAAS" — fala "sistema integrado", "painel", "central de clientes".
type PlanDetail = { temp: string; pitch: string; how: string[]; points: string[]; forWho: string; foot: string };
const DETAILS: Record<string, PlanDetail> = {
  hbx_lite: {
    temp: "Lista Fria",
    pitch: "Pare de garimpar empresa no Google. Você escolhe o filtro — cidade, segmento, raio — e o HBX localiza empresas no perfil e te entrega prontas pra abordar.",
    how: [
      "Você define o alvo: cidade, segmento e até onde quer alcançar",
      "O HBX localiza empresas reais no seu perfil e abastece a sua lista",
      "Você toca o card e o WhatsApp ou a ligação já abrem prontos, sem copiar número",
    ],
    points: [
      "Seus contatos em cards, com agenda e aviso de retorno pra não perder a hora",
      "Telefone, endereço e segmento de cada empresa encontrada",
      "1 acesso, sem custos extras",
      "Lista crua e barata — score e mensagem pronta ficam no Lead",
    ],
    forWho: "Pra quem precisa de volume de contato barato e faz a abordagem no braço.",
    foot: "Lista nova sempre · Você no controle",
  },
  hbx_padrao: {
    temp: "Lista Fria enriquecida",
    pitch: "Tudo do List, mas o HBX vai além do telefone: enriquece cada empresa e lê a oportunidade pra você saber por quem começar.",
    how: [
      "O HBX acha a empresa e ainda cava redes, CNPJ, e-mail e site",
      "A IA lê a oportunidade: te dá um score e o motivo por trás dele",
      "Você começa pelos melhores, com a mensagem pronta do segmento na mão",
    ],
    points: [
      "Contexto que abre conversa: o que a empresa faz e por onde falar com ela",
      "Canal recomendado pra cada contato: ligar, WhatsApp ou rede social",
      "Painel com administrador + 1 funcionário",
      "Dado de sobra pra quem trabalha marketing e precisa segmentar",
    ],
    forWho: "Pra quem cansou de ligar no escuro e quer priorizar quem realmente vale.",
    foot: "14 dias grátis · Não cobramos nada antes",
  },
  hbx_pro: {
    temp: "Lista Morna",
    pitch: "Tudo do Lead, e o WhatsApp passa pra dentro do HBX. Em até 7 dias a gente configura um Bot IA pra você (com acesso remoto).",
    how: [
      "Você conecta seu chip e o HBX lê suas conversas recentes de clientes",
      "A IA monta a árvore de respostas (URA) — ou você desenha do seu jeito",
      "O bot responde e qualifica sozinho, e passa pro humano quando aperta",
    ],
    points: [
      "Prospecção e atendimento rodando dentro de um lugar só",
      "O bot reaquece quem respondeu antes do lead chegar em você",
      "Painel com gerencial e administrador + 5 funcionários",
      "Configuração assistida: a HBX deixa tudo de pé com você",
    ],
    forWho: "Pra equipe que já não dá conta de responder todo mundo na mão.",
    foot: "Bot IA configurado em até 7 dias",
  },
  hbx_melhor: {
    temp: "Lista Quente",
    pitch: "Pro cliente que quer do jeito dele. A HBX estuda a sua empresa, integra ao que você já usa e traz lead QUENTE: quem te procurou nas redes e deixou o telefone.",
    how: [
      "A gente estuda sua empresa: altos, baixos, público e perfil de quem você atende",
      "Integra ao que você já tem: planilha do Google, Outlook ou ERP (TOTVS, SAP…)",
      "O inbound do Insta e Face vira conversa: o sistema fala, desenrola e passa pro humano",
    ],
    points: [
      "Lead que já te procurou: você entra pra fechar, não pra convencer",
      "Recovery de inadimplentes e cobrança ligada ao seu ERP",
      "Método montado com você, por um especialista de verdade",
      "Foco em cortar custo: menos tempo perdido, menos lead frio",
    ],
    forWho: "Pra quem quer escala e topa investir pra receber lead pronto pra fechar.",
    foot: "A partir de R$ 445,90/mês · Falar com especialista",
  },
};

// ── dados de entrar (painéis laterais) ─────────────────────────────────────────
type SideIconName = "headset" | "recovery" | "website" | "shield" | "building" | "pulse";
const SIDE_ICON: Record<SideIconName, string[]> = {
  headset: ["M4.5 13.8v-2.2a7.5 7.5 0 0 1 15 0v2.2", "M7.5 17.5h-1a2 2 0 0 1-2-2v-1.1a2 2 0 0 1 2-2h1v5.1Z", "M16.5 17.5h1a2 2 0 0 0 2-2v-1.1a2 2 0 0 0-2-2h-1v5.1Z"],
  recovery: ["M20 12a8 8 0 0 1-13.5 5.8", "M4 12A8 8 0 0 1 17.5 6.2", "M17.5 2.8v3.4h-3.4", "M6.5 21.2v-3.4h3.4"],
  website: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M3.5 12h17", "M12 3a14 14 0 0 1 0 18", "M12 3a14 14 0 0 0 0 18"],
  shield: ["M12 21s7-3.4 7-9.4V5.8L12 3 5 5.8v5.8c0 6 7 9.4 7 9.4Z", "m9.2 12 1.9 1.9 4-4.2"],
  building: ["M4.5 20.5h15", "M6 20.5V7l6-2.5 6 2.5v13.5", "M9 10h.1M12 10h.1M15 10h.1M9 14h.1M12 14h.1M15 14h.1"],
  pulse: ["M3 13h4l2.2-5.5L14 18l2.5-5H21"],
};
const SOLUTIONS: { icon: SideIconName; title: string; desc: string }[] = [
  { icon: "headset", title: "Atendimento", desc: "Suporte rápido e humanizado sempre que precisar." },
  { icon: "recovery", title: "Recovery", desc: "Recuperação de dados ágil e segura." },
  { icon: "website", title: "Website", desc: "Acesse informações e novidades online." },
];
const TRUST: { icon: SideIconName; title: string; desc: string }[] = [
  { icon: "shield", title: "Modo seguro ativo", desc: "Seus dados protegidos 24/7 com criptografia." },
  { icon: "building", title: "Multiempresa", desc: "Gerencie múltiplas empresas em um único ambiente." },
  { icon: "pulse", title: "Tempo real", desc: "Informações sempre atualizadas para decisões." },
];

// ── paths compartilhados ───────────────────────────────────────────────────────
const BARS = ["M4 19V5", "M4 19h16", "M8 19v-6", "M13 19V9", "M18 19v-4"];
const CHEVRON = ["M9 5l7 7-7 7"];
const PLUG = ["M9 7V3", "M15 7V3", "M7 7h10v4a5 5 0 0 1-10 0V7Z", "M12 16v5"];
const SUN = ["M12 3v2.2", "M12 18.8V21", "M4.6 4.6l1.6 1.6", "M17.8 17.8l1.6 1.6", "M3 12h2.2", "M18.8 12H21", "M4.6 19.4l1.6-1.6", "M17.8 6.2l1.6-1.6", "M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z"];
const MOON = ["M20.5 14.4A8.3 8.3 0 0 1 9.6 3.5a6.6 6.6 0 1 0 10.9 10.9Z"];

// ── componentes auxiliares ─────────────────────────────────────────────────────
function Ic({ paths }: { paths: string[] }) {
  return (
    <svg className="site-ic" viewBox="0 0 24 24" aria-hidden>
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

function SideIcon({ name, size = 17 }: { name: SideIconName; size?: number }) {
  return (
    <svg className="hbx-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {SIDE_ICON[name].map((d, i) => <path key={i} d={d} />)}
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

function Next({ hint, onClick }: { hint: string; onClick: () => void }) {
  return (
    <button type="button" className="scene-next" onClick={onClick} aria-label={hint}>
      <Ic paths={CHEVRON} />
      <span className="scene-next__hint">{hint}</span>
    </button>
  );
}

// ── componente principal ───────────────────────────────────────────────────────
export function MarketingClient() {
  const router = useRouter();
  const [view, setView] = useState<View>("inicio");
  const [phase, setPhase] = useState<"in" | "out">("in");
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [planMode, setPlanMode] = useState<"list" | "choosing" | "register" | "detailReturning" | "detail2Returning" | "returning" | "restoring">("list");
  const [intruderVisible, setIntruderVisible] = useState(false);
  const [intruder2Visible, setIntruder2Visible] = useState(false);

  // estado do formulário de login (view "entrar")
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginOk, setLoginOk] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginConflict, setLoginConflict] = useState(false);
  const [loginNotice, setLoginNotice] = useState<string | null>(null);
  const [loginPlain, setLoginPlain] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (!alive) return;
      try {
        const params = new URLSearchParams(window.location.search);
        const ver = params.get("ver") as View | null;
        let initial: View = "inicio";
        if (ver === "esteira" || ver === "modulos" || ver === "planos" || ver === "entrar") initial = ver;

        const notice = sessionStorage.getItem("hbx:session-notice");
        if (notice === "expired") {
          sessionStorage.removeItem("hbx:session-notice");
          setLoginNotice("Sua sessão expirou ou foi conectada em outro dispositivo. Entre novamente.");
          initial = "entrar";
        } else if (notice === "company-removed") {
          sessionStorage.removeItem("hbx:session-notice");
          setLoginNotice("Sua empresa foi removida. Se isso não era esperado, fale com o suporte HBX.");
          initial = "entrar";
        }

        setView(initial);
        setLoginPlain(localStorage.getItem("hbx:login-plain") === "1");
      } catch { /* sem storage */ }
    });
    return () => { alive = false; };
  }, []);

  // REGRA DA CASCA: nada troca seco. Sai (out) → troca → entra (in).
  function transition(action: () => void) {
    setPhase("out");
    window.setTimeout(() => { action(); setPhase("in"); }, 360);
  }

  const goView = (v: View) => {
    if (v === view) return;
    transition(() => {
      setView(v);
      setSelectedPlan(null);
      setPlanMode("list");
      setIntruderVisible(false);
      setIntruder2Visible(false);
      const param = v === "inicio" ? "" : `?ver=${v}`;
      try { window.history.replaceState(null, "", `/${param}`); } catch { /* no-op */ }
    });
  };

  const goRoute = (href: string) => transition(() => router.push(href));

  function choosePlan(key: string) {
    if (planMode !== "list") return;
    setSelectedPlan(key);
    setIntruderVisible(false);
    setIntruder2Visible(false);
    setPlanMode("choosing");
    window.setTimeout(() => {
      setPlanMode("register");
      window.setTimeout(() => {
        setIntruderVisible(true);
        if (key === "hbx_melhor") {
          window.setTimeout(() => setIntruder2Visible(true), 800);
        }
      }, 3000);
    }, 1500);
  }

  function voltarPlanos() {
    if (planMode !== "register") return;
    if (intruder2Visible) {
      setPlanMode("detail2Returning");
      window.setTimeout(() => {
        setIntruder2Visible(false);
        setPlanMode("detailReturning");
        window.setTimeout(() => {
          setIntruderVisible(false);
          setPlanMode("returning");
          window.setTimeout(() => {
            setSelectedPlan(null);
            setPlanMode("restoring");
            window.setTimeout(() => setPlanMode("list"), 1500);
          }, 1500);
        }, 800);
      }, 800);
      return;
    }
    if (intruderVisible) {
      setPlanMode("detailReturning");
      window.setTimeout(() => {
        setIntruderVisible(false);
        setPlanMode("returning");
        window.setTimeout(() => {
          setSelectedPlan(null);
          setPlanMode("restoring");
          window.setTimeout(() => setPlanMode("list"), 1500);
        }, 1500);
      }, 800);
      return;
    }
    setPlanMode("returning");
    window.setTimeout(() => {
      setSelectedPlan(null);
      setPlanMode("restoring");
      window.setTimeout(() => setPlanMode("list"), 1500);
    }, 1500);
  }

  const onNav = (k: SceneNav) => {
    if (k === "inicio") goView("inicio");
    else if (k === "esteira") goView("esteira");
    else if (k === "modulos") goView("modulos");
    else if (k === "planos") goView("planos");
    else if (k === "entrar") goView("entrar");
  };

  function toggleLoginPlain() {
    setLoginPlain(p => {
      const next = !p;
      try { localStorage.setItem("hbx:login-plain", next ? "1" : "0"); } catch { /* no-op */ }
      return next;
    });
  }

  async function doLogin(force: boolean) {
    if (loginBusy) return;
    setLoginBusy(true);
    setLoginError(null);
    setLoginNotice(null);
    try {
      const res = await apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: loginEmail, password: loginPassword, ...(force ? { forceSession: true } : {}) }),
      });
      if (!res?.access_token) throw new Error("Resposta de login sem token.");
      setToken(res.access_token);
      setLoginOk(true);
      setLoginConflict(false);
      if (loginPlain) router.replace(res.next || "/dashboard");
      else window.setTimeout(() => router.replace(res.next || "/dashboard"), 750);
    } catch (err) {
      const apiErr = err as ApiError;
      const payload = (apiErr?.payload ?? {}) as LoginErrorPayload;
      setLoginOk(false);
      if (payload?.code === "SESSION_ALREADY_ACTIVE" && payload?.forceAvailable) {
        setLoginConflict(true);
        setLoginError(payload?.message || "Você já está conectado em outra máquina.");
      } else {
        setLoginConflict(false);
        setLoginError(err instanceof Error ? err.message : "Não foi possível entrar. Tente novamente.");
      }
      setLoginBusy(false);
    }
  }

  // plain: inicio mostra robô; entrar segue toggle Visual; demais escondem robô
  const plain = view === "inicio" ? false : view === "entrar" ? loginPlain : true;

  return (
    <HbxScene
      active={view as SceneNav}
      plain={plain}
      themeControls={view === "entrar"}
      onBrand={() => goView("inicio")}
      onNav={onNav}
    >
      {/* Toggle Visual — fixo topo-direito, só aparece no view entrar */}
      {view === "entrar" && (
        <div className="login-visual-toggle">
          <span>Visual</span>
          <button type="button" className={"sw" + (!loginPlain ? " on" : "")} role="switch"
            aria-checked={!loginPlain} aria-label="Ligar ou desligar os efeitos visuais" onClick={toggleLoginPlain}>
            <i />
          </button>
        </div>
      )}

      <div className={"scene-view is-" + phase}>

        {/* ── INÍCIO ──────────────────────────────────────────────────────── */}
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

        {/* ── ESTEIRA ─────────────────────────────────────────────────────── */}
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
            <Next hint="Módulos" onClick={() => goView("modulos")} />
          </div>
        )}

        {/* ── MÓDULOS ─────────────────────────────────────────────────────── */}
        {view === "modulos" && (
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
            <Next hint="Ver planos" onClick={() => goView("planos")} />
          </div>
        )}

        {/* ── PLANOS ──────────────────────────────────────────────────────── */}
        {view === "planos" && (
          <div className={"scene-center scene-planos" + (planMode !== "list" ? " is-choosing is-" + planMode : "") + (intruderVisible ? " has-intruder" : "") + (intruder2Visible ? " has-intruder2" : "")}>
            <span className="site-eyebrow">Planos HBX</span>
            <h2 className="site-esteira-title">O plano certo para <span className="site-accent">o seu momento</span>.</h2>
            <p className="site-sub">Do frio ao automatizado: escolha como a HBX entra na sua operação.</p>
            <div className={"site-plans" + (planMode !== "list" ? " is-choosing is-" + planMode : "")}>
                {PLANS.map((p) => (
                  <button key={p.key} type="button" className={"site-plan2" + (p.hot ? " is-hot" : "") + (selectedPlan === p.key ? " is-selected" : "") + (selectedPlan && selectedPlan !== p.key ? " is-exiting" : "")} onClick={() => choosePlan(p.key)}>
                    {p.badge && <span className="site-plan2__badge">{p.badge}</span>}
                    {p.key !== "hbx_melhor" && <span className="site-plan2__annual">2 meses grátis no anual</span>}
                    <span className="site-plan2__ic"><Ic paths={p.ic} /></span>
                    <strong className="site-plan2__name">HBX <span className="site-accent">{p.accent}</span></strong>
                    {p.trial
                      ? <span className="site-plan2__trial-wrap"><span className="site-plan2__trial">{p.trial}</span><span className="site-plan2__trial-price">{p.price}<em>/mês</em></span></span>
                      : <span className="site-plan2__price">{p.pricePrefix && <small>{p.pricePrefix}</small>}<b>{p.price}</b><em>/mês</em></span>}
                    <span className="site-plan2__tag">{p.tag}</span>
                    {p.score && <span className="site-plan2__score"><Ic paths={PLAN_BARS} />{p.score}</span>}
                    <ul className="site-plan2__feats">
                      {p.feats.map((f) => <li key={f}><Ic paths={CHECK} />{f}</li>)}
                    </ul>
                    {p.logos && (
                      <div className="site-plan2__logos">
                        {LOGOS.map((l, i) => <span key={i}><Ic paths={l} /></span>)}
                      </div>
                    )}
                    <div className="site-plan2__cta">{p.cta}</div>
                  </button>
                ))}
            </div>
            {selectedPlan && (planMode === "register" || planMode === "detailReturning" || planMode === "detail2Returning" || planMode === "returning") && (
              <div className="site-plan-register">
                <button type="button" className="scene-next scene-next--back" onClick={voltarPlanos} aria-label="Voltar">
                  <Ic paths={CHEVRON} />
                  <span className="scene-next__hint">Voltar</span>
                </button>
                {intruderVisible && (() => {
                  const d = DETAILS[selectedPlan || ""] || DETAILS.hbx_lite;
                  const accent = PLANS.find(p => p.key === selectedPlan)?.accent || "";
                  return (
                    <aside className="site-plan-intruder card" aria-label="Detalhes do plano">
                      <h2 className="site-plan-intruder__type">HBX {accent} · {d.temp}</h2>
                      <div className="site-plan-intruder__body">
                        <p className="site-plan-intruder__tag">{d.pitch}</p>
                        <div className="site-plan-intruder__sec">
                          <span className="site-plan-intruder__label">Como funciona</span>
                          <ol className="site-plan-intruder__how">
                            {d.how.map(s => <li key={s}>{s}</li>)}
                          </ol>
                        </div>
                        <div className="site-plan-intruder__sec">
                          <span className="site-plan-intruder__label">No plano</span>
                          <ul className="site-plan-intruder__feats">
                            {d.points.map(f => <li key={f}><Ic paths={CHECK} />{f}</li>)}
                          </ul>
                        </div>
                        <p className="site-plan-intruder__for">{d.forWho}</p>
                      </div>
                      <p className="sub site-plan-intruder__safe">{d.foot}</p>
                    </aside>
                  );
                })()}
                {intruder2Visible && selectedPlan === "hbx_melhor" && (
                  <aside className="site-plan-intruder site-plan-intruder--second card" aria-label="Por que o Company é o mais forte">
                    <h2 className="site-plan-intruder__type">Por que o Company é o mais forte</h2>
                    <div className="site-plan-intruder__body">
                      <p className="site-plan-intruder__tag">O lead quente é o que te dá menos trabalho e mais fechamento. O Company existe pra isso.</p>
                      <ul className="site-plan-intruder__feats">
                        <li><Ic paths={CHECK} />Resposta na hora, 24/7 — ninguém fica no vácuo, nem de madrugada</li>
                        <li><Ic paths={CHECK} />Fala com a sua cara: parece você no WhatsApp, não um robô</li>
                        <li><Ic paths={CHECK} />Escala sem contratar — o sistema segura o primeiro contato</li>
                        <li><Ic paths={CHECK} />Quando esquenta de verdade, cai no colo do vendedor certo</li>
                      </ul>
                    </div>
                    <p className="sub site-plan-intruder__safe">Um especialista monta tudo com você</p>
                  </aside>
                )}
                <RegisterPanel selectedPlanKey={selectedPlan} embedded />
              </div>
            )}
          </div>
        )}

        {/* ── ENTRAR ──────────────────────────────────────────────────────── */}
        {view === "entrar" && (
          <div className={"login-console" + (loginOk && !loginPlain ? " is-leaving" : "") + (loginPlain ? " is-plain" : "")}>
            {/* .login-art do robô vem do HbxScene externo (position:fixed) — não duplicar aqui */}
            <div className="login-fog" aria-hidden />

            <aside className="login-side login-side--left" aria-label="Soluções integradas">
              <div className="login-side__panel">
                <div className="login-side__header">Soluções integradas</div>
                {SOLUTIONS.map(it => (
                  <article key={it.title} className="login-microcard">
                    <span className="ic"><SideIcon name={it.icon} /></span>
                    <span className="tx"><strong>{it.title}</strong><span>{it.desc}</span></span>
                    <span className="login-dot" aria-hidden />
                  </article>
                ))}
                <div className="login-side__footer"><span>Todos os serviços operacionais</span><SideIcon name="shield" size={16} /></div>
              </div>
            </aside>

            <main className="login-shell">
              <div className="login-intro">
                <h1 className="login-intro__title">Seu próximo cliente já está lá fora.</h1>
                <p className="login-intro__sub">Radar encontra, vendas trabalha, WhatsApp fecha. Tudo num fluxo só.</p>
              </div>
              <form className="card" onSubmit={(e) => { e.preventDefault(); doLogin(false); }}>
                <div className="bl">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--login-accent, var(--hbx-brand))" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 6l6 6-6 6M11 6l6 6-6 6" />
                  </svg>
                  <strong>HBX</strong>
                </div>
                <h2>Entrar no HBX</h2>
                <p className="sub">Acesse sua conta com segurança e continue de onde parou.</p>
                <div className="f">
                  <label htmlFor="em">CPF ou CNPJ</label>
                  <input id="em" className="field-dark" type="text" placeholder="000.000.000-00" required autoComplete="username"
                    value={loginEmail} onChange={e => setLoginEmail(formatCpfCnpj(e.target.value))} />
                </div>
                <div className="f">
                  <label htmlFor="pw">Senha</label>
                  <input id="pw" className="field-dark" type="password" placeholder="••••••••" required autoComplete="current-password"
                    value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
                </div>
                <div className="row">
                  <label><input type="checkbox" defaultChecked />Manter conectado</label>
                  <button type="button" className="link" style={{ background: "none", border: "none", padding: 0, font: "inherit", cursor: "pointer" }}
                    onClick={() => goRoute("/reset-password")}>Esqueci minha senha</button>
                </div>
                {loginNotice && !loginError && !loginOk && (<div className="ok show warn">{loginNotice}</div>)}
                <div className={"ok" + (loginOk ? " show" : "")} id="ok">✓ Autenticado — redirecionando para o Dashboard…</div>
                {loginError && (<div className={"ok show " + (loginConflict ? "warn" : "bad")}>{loginError}</div>)}
                {loginConflict && (
                  <button className="btn-ghost" type="button" disabled={loginBusy} style={{ minHeight: 40, fontSize: "0.78rem" }} onClick={() => doLogin(true)}>
                    Conectar aqui mesmo (desconecta a outra máquina)
                  </button>
                )}
                <button className="btn-teal" type="submit" disabled={loginBusy} style={{ minHeight: 44, fontSize: "0.84rem" }}>
                  {loginBusy ? "Entrando…" : "Entrar"}
                </button>
                <div className="alt">Ainda não tem conta?{" "}
                  <button type="button" className="link" style={{ background: "none", border: "none", padding: 0, font: "inherit", cursor: "pointer" }}
                    onClick={() => goRoute("/?ver=planos")}>Criar Conta</button>
                </div>
              </form>
            </main>

            <aside className="login-side login-side--right" aria-label="Confiança e tecnologia">
              <div className="login-side__panel">
                <div className="login-side__header">Confiança e tecnologia</div>
                {TRUST.map(it => (
                  <article key={it.title} className="login-microcard">
                    <span className="ic"><SideIcon name={it.icon} /></span>
                    <span className="tx"><strong>{it.title}</strong><span>{it.desc}</span></span>
                    <span className="login-dot" aria-hidden />
                  </article>
                ))}
              </div>
            </aside>
          </div>
        )}

      </div>
    </HbxScene>
  );
}
