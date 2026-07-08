"use client";

// CASCA ÚNICA (15/06): UM componente, CINCO views (inicio/esteira/modulos/planos/entrar),
// UM dono do fundo (HbxScene — robô + cor ciclando). A mesma transição em toda troca:
// sai (is-out) → view troca → entra (is-in). onNav sempre goView, nunca route change
// (exceto /register e /reset-password que são telas separadas). A HbxScene NUNCA
// re-monta — o robô e a cor continuam sem interrupção ao navegar entre as 5 views.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { HbxScene, type SceneNav } from "@/components/hbx/hbx-scene";
import { subscribeToThemeMode } from "@/components/hbx/shell";
import { applyThemeSoft, setThemeMode } from "@/components/hbx/theme-attributes";
import { ImplantacaoContato } from "@/components/hbx/implantacao-contato";
import { LegalModal, type LegalKind } from "@/components/hbx/legal-modal";
import { RegisterPanel } from "@/app/register/page.client";
import {
  FALLBACK_PLANS, PLAN_ORDER, PLAN_STATIC, IC_BARS, IC_CHECK,
  IC_CAL, IC_REFRESH, IC_SEARCH, IC_TARGET,
  fetchPublicPlans, formatBRL, getPlanFallback,
  type PublicPlan,
} from "@/lib/plans";
import { PlanCard } from "@/components/hbx/plan-card";
import { PlanDetailCard } from "@/components/hbx/plan-detail-card";
import { fetchCreditStorefront, type CreditPackPublic } from "@/lib/credits-storefront";

// ── types ──────────────────────────────────────────────────────────────────────
// Login saiu da casca (16/06): a view "entrar" foi removida — "Entrar" agora abre
// a rota /login (tela única, por e-mail). A casca é só marketing.
type View = "inicio" | "esteira" | "modulos" | "planos";
type Lado = "corporativo" | "autonomo";

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

// ── carrossel do hero (desktop: palavras; mobile: phone-frames) ───────────────
// Desktop: 4 palavras com ícones (Radar/Vendas/Atendimento/Recovery) — original.
// Mobile: 3 molduras de celular (Radar/Vendas/Atendimento) via CSS display.
const CAROUSEL_ITEMS = [
  { label: "Radar", ic: ["M12 16v5", "M9 21h6", "M12 12h.01", "M8.5 12a3.5 3.5 0 0 1 7 0", "M5 12a7 7 0 0 1 14 0", "M2 12a10 10 0 0 1 20 0"] },
  { label: "Vendas", ic: ["M13 2 3 14h9l-1 8 10-12h-9l1-8Z"] },
  { label: "Atendimento", ic: ["M20 11.5a8 8 0 0 1-11.9 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z", "M8.5 11h.01", "M12 11h.01", "M15.5 11h.01"] },
  { label: "Recovery", ic: ["M12 3 19 6v5c0 4.6-3 7.7-7 9-4-1.3-7-4.4-7-9V6l7-3Z", "M9.3 12l1.9 1.9 3.6-3.7"] },
] as const;
// Apenas os 3 primeiros itens têm phone-frame (mobile)
const CAROUSEL_PHONE_COUNT = 3;

// ── dados de módulos ───────────────────────────────────────────────────────────
const INTEGRATIONS = [
  { n: "WhatsApp", d: "Converse, responda e venda no automático.", ic: ["M20 11.5a8 8 0 0 1-11.9 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z", "M8.5 11h.01", "M12 11h.01", "M15.5 11h.01"] },
  { n: "Mercado Pago", d: "Cobranças, links de pagamento e conciliação.", ic: ["M3 6.5h18a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z", "M2 10h20", "M6 14.5h4"] },
  { n: "HubSpot", d: "Leads, oportunidades e pipeline sempre atualizados.", ic: ["M12 9V4", "M12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M18.5 6.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z", "M16.7 5.6 14 8.4"] },
  { n: "Pipedrive", d: "Atividades, negócios e follow-ups sincronizados.", ic: ["M5 5h6v14H5z", "M14 5h5v9h-5z"] },
  { n: "Google Agenda", d: "Agendamentos e lembretes sem falhas.", ic: ["M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z", "M4 9h16", "M9 3v4", "M15 3v4"] },
  { n: "SAP / ERP", d: "Dados e processos integrados ao seu ERP.", ic: ["M4 5h16v6H4z", "M4 14h16v5H4z", "M8 8h.01", "M8 16.5h.01"] },
];

// ── paths locais ──────────────────────────────────────────────────────────────
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

// ── Explicação pública de créditos (cena planos do modelo grátis, 07/07) ──────
// Mesma história contada na carteira logada (credits-wallet-section): honesta
// com o backend — débito só na entrega, estorno on-failure, FIFO por validade.
const SITE_CREDITS_HOW = [
  { ic: IC_SEARCH, t: "Buscar é grátis", d: "Pesquise e filtre empresas à vontade. Procurar não gasta crédito." },
  { ic: IC_TARGET, t: "1 crédito = 1 lead", d: "Só desconta quando um lead novo é entregue e validado na sua lista." },
  { ic: IC_REFRESH, t: "Falhou, voltou", d: "Entrega que falha é estornada na hora. Saldo nunca fica negativo." },
  { ic: IC_CAL, t: "Validade por lote", d: "Cada recarga tem prazo próprio; o sistema gasta primeiro o que vence antes." },
];
const SITE_CREDITS_FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Preciso de cartão pra começar?",
    a: "Não. O cadastro é grátis: confirmando email e telefone, seus créditos de boas-vindas entram na hora — sem cartão, sem mensalidade e sem fidelidade.",
  },
  {
    q: "O que gasta e o que não gasta crédito?",
    a: "Gasta: receber um lead novo, entregue e validado, na sua lista (1 crédito por lead — e cada lead é cobrado uma única vez). Não gasta: buscar, filtrar, conversar, agendar retorno e usar o funil.",
  },
  {
    q: "Créditos expiram?",
    a: "Cada lote tem validade própria, mostrada no pacote. O sistema consome primeiro os créditos que vencem primeiro — nada morre na mão à toa.",
  },
];

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
  // PORTAL v3.0 — bifurcação Empresa × Vendedor na entrada da casca
  const [lado, setLado] = useState<Lado | null>(null);
  const [hoverLado, setHoverLado] = useState<Lado | null>(null);
  const SHOW_LEGACY_HERO: boolean = false; // hero antigo parkeado (substituído pelo Portal v3.0)
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [planMode, setPlanMode] = useState<"list" | "choosing" | "register" | "detailReturning" | "detail2Returning" | "returning" | "restoring">("list");
  const [intruderVisible, setIntruderVisible] = useState(false);
  const [intruder2Visible, setIntruder2Visible] = useState(false);
  const [livePlans, setLivePlans] = useState<PublicPlan[]>(FALLBACK_PLANS);
  // CRÉDITOS (cutover 06/07) — chavinha HBX_CREDITS_ENABLED. true → troca a
  // vitrine de PLANOS pela pitch do modelo grátis; false (ou ainda carregando)
  // → mantém a vitrine de planos de hoje intacta (regressão zero).
  const [creditsEnabled, setCreditsEnabled] = useState(false);
  const [welcomeCredits, setWelcomeCredits] = useState(0);
  // Pacotes de recarga públicos (mesmo /credits/public-catalog): a vitrine mostra
  // preço/validade com transparência (padrão da categoria — CNPJ Biz e afins);
  // pack `paused` aparece embaçado "Em breve" (dono ainda não cravou preço).
  const [creditPacks, setCreditPacks] = useState<CreditPackPublic[]>([]);
  // Modelo grátis: nem o cadastro nem o card Company/Implantação usam a
  // esteira animada de planos (não existe mais escolha de plano) — cada um
  // só abre a tela seguinte direto (sem plano pra "escolher").
  const [freeImplantacaoOpen, setFreeImplantacaoOpen] = useState(false);
  const [freeRegisterOpen, setFreeRegisterOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchCreditStorefront().then((sf) => {
      if (!alive) return;
      setCreditsEnabled(sf.enabled);
      setWelcomeCredits(sf.welcomeCredits);
      setCreditPacks(Array.isArray(sf.packs) ? sf.packs : []);
    });
    return () => { alive = false; };
  }, []);
  // Documento legal aberto como pop-up central (Lei 2). Plugado nas rotas
  // /politicas e /termos (redirect → ?ver=) e nos links do rodapé da home.
  const [legal, setLegal] = useState<LegalKind | null>(null);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [prevCarouselIdx, setPrevCarouselIdx] = useState<number | null>(null);
  const carouselIdxRef = useRef(carouselIdx);
  // Mantém o ref sincronizado sem violação de hooks (não atualizar no render)
  useEffect(() => { carouselIdxRef.current = carouselIdx; }, [carouselIdx]);

  // Dot ativo do carrossel de planos (mobile scroll-snap)
  const [activePlanDot, setActivePlanDot] = useState(0);
  // WORM-17: ciclo de cobrança da vitrine — ancora no anual. Default mensal.
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const plansTrackRef = useRef<HTMLDivElement>(null);

  const advance = useCallback(() => {
    const cur = carouselIdxRef.current;
    const next = (cur + 1) % CAROUSEL_ITEMS.length;
    setPrevCarouselIdx(cur);
    setCarouselIdx(next);
    setTimeout(() => setPrevCarouselIdx(null), 480);
  }, []);

  const goCarousel = useCallback((idx: number) => {
    const cur = carouselIdxRef.current;
    if (idx === cur) return;
    setPrevCarouselIdx(cur);
    setCarouselIdx(idx);
    setTimeout(() => setPrevCarouselIdx(null), 480);
  }, []);

  useEffect(() => {
    const timer = setInterval(advance, 2800);
    return () => clearInterval(timer);
  }, [advance]);

  useEffect(() => { fetchPublicPlans().then(setLivePlans); }, []);

  // IntersectionObserver: detecta qual card de plano está centrado no scroll-snap mobile
  useEffect(() => {
    const track = plansTrackRef.current;
    if (!track) return;
    const cards = Array.from(track.querySelectorAll<HTMLElement>(".site-plan2"));
    if (cards.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = cards.indexOf(entry.target as HTMLElement);
            if (idx >= 0) setActivePlanDot(idx);
          }
        });
      },
      { root: track, threshold: 0.5 },
    );
    cards.forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [view, planMode]); // re-observa ao entrar na view de planos

  function getLivePlan(key: string): PublicPlan {
    return livePlans.find((p) => p.key === key) ?? getPlanFallback(key);
  }

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (!alive) return;
      try {
        const params = new URLSearchParams(window.location.search);
        const ver = params.get("ver");
        // Login saiu da casca (16/06): /?ver=entrar legado redireciona pro /login
        // (lá o aviso de sessão expirada/empresa removida já é tratado).
        if (ver === "entrar") { router.replace("/login"); return; }
        // F4 (19/06): RETOMADA. ?resume=1 + dica guardada → pula direto pra
        // tela do plano/cadastro onde a pessoa parou, sem reanimar a escolha.
        // A VERDADE do passo (aguardando × confirmado) o RegisterPanel resolve
        // no backend (/auth/onboarding/resume); aqui só posicionamos a cena.
        if (params.get("resume") === "1") {
          let storedPoll: string | null = null;
          let storedPlan: string | null = null;
          try {
            storedPoll = sessionStorage.getItem("hbx:onboarding-poll");
            storedPlan = sessionStorage.getItem("hbx:onboarding-plan");
          } catch { /* sem storage */ }
          if (storedPoll) {
            setView("planos");
            setSelectedPlan(storedPlan && storedPlan in PLAN_STATIC ? storedPlan : "hbx_padrao");
            setIntruderVisible(true);
            setPlanMode("register");
            return;
          }
        }
        // Documento legal por deep-link/rota: abre o pop-up sobre a home.
        if (ver === "politicas" || ver === "termos") { setLegal(ver); return; }
        // /register consolidado (16/06): a rota /register e os links de contratação
        // do vendedor (hbx-handoff) chegam como ?plan=X — abre o plano direto no
        // funil único, sem a animação de escolha (deep-link já decidiu o plano).
        const plan = params.get("plan");
        if (plan && (plan in PLAN_STATIC)) {
          setView("planos");
          setSelectedPlan(plan);
          setIntruderVisible(true);
          if (plan === "hbx_melhor") setIntruder2Visible(true);
          setPlanMode("register");
          return;
        }
        // CRÉDITOS (cutover 06/07) — /register sem ?plan= (modelo grátis não tem
        // plano pra decidir): a rota /register cai em /?ver=planos e, com a
        // chavinha ON, pula direto pro form de cadastro (sem passar pela pitch).
        if (ver === "planos" && !plan) {
          fetchCreditStorefront().then((sf) => {
            if (!alive || !sf.enabled) return;
            setFreeRegisterOpen(true);
          });
        }
        if (ver === "esteira" || ver === "modulos" || ver === "planos") setView(ver);
      } catch { /* sem storage */ }
    });
    return () => { alive = false; };
  }, [router]);

  // REGRA DA CASCA: nada troca seco. Sai (out) → troca → entra (in).
  function transition(action: () => void) {
    setPhase("out");
    window.setTimeout(() => { action(); setPhase("in"); }, 360);
  }

  const goView = (v: View) => {
    if (v === view) return;
    transition(() => {
      setView(v);
      if (v === "inicio") setLado(null); // volta ao split; demais views herdam o mundo escolhido
      setHoverLado(null);
      setSelectedPlan(null);
      setPlanMode("list");
      setIntruderVisible(false);
      setIntruder2Visible(false);
      setFreeImplantacaoOpen(false);
      setFreeRegisterOpen(false);
      const param = v === "inicio" ? "" : `?ver=${v}`;
      try { window.history.replaceState(null, "", `/${param}`); } catch { /* no-op */ }
    });
  };

  const goRoute = (href: string) => transition(() => router.push(href));

  // Pop-up legal: abre sem trocar de view (fica sobre o fundo atual) e reflete
  // a rota na URL (/politicas | /termos) sem recarregar. Fechar volta à view.
  const openLegal = (k: LegalKind) => {
    setLegal(k);
    try { window.history.replaceState(null, "", `/${k}`); } catch { /* no-op */ }
  };
  const closeLegal = () => {
    setLegal(null);
    const param = view === "inicio" ? "" : `?ver=${view}`;
    try { window.history.replaceState(null, "", `/${param}`); } catch { /* no-op */ }
  };

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
    if (k === "entrar") { goRoute("/login" + (lado ? "?lado=" + lado : "")); return; }
    if (k === "inicio") goView("inicio");
    else if (k === "esteira") goView("esteira");
    else if (k === "modulos") goView("modulos");
    else if (k === "planos") goView("planos");
  };

  // PORTAL v3.0 é o palco da entrada → robô oculto em toda a casca de marketing
  const plain = true;

  // Marca: na entrada apenas reseta a escolha (volta ao split); nas outras views, vai pra entrada
  const goBrand = () => { if (view === "inicio") setLado(null); else goView("inicio"); };

  // PORTAL v3.0 — mesmo esqueleto (achar → atender → cobrar), pele por público
  type PortalEntry = {
    label: string; img: string; kicker: string; shortTitle: string; promise: string;
    ideal: string[]; enterLabel: string; enterLabelMobile?: string;
    title: string; sub: string; bullets: string[];
    primary: { label: string; go: () => void };
    secondary: { label: string; go: () => void };
  };
  const PORTAL_COPY: Record<Lado, PortalEntry> = {
    corporativo: {
      label: "empresa",
      img: "/portal/corporativo.png",
      kicker: "Para empresas",
      shortTitle: "Empresas",
      promise: "Prospecção, atendimento, equipe e cobrança numa operação comercial única.",
      ideal: ["Pequenas que querem vender com método", "Médias que precisam organizar equipe e retorno", "Operações que exigem implantação e integração"],
      enterLabel: "Sou empresa",
      title: "Sua operação comercial em uma única esteira.",
      sub: "O HBX organiza prospecção, atendimento, retorno, cobrança e integração — sua empresa vende com mais controle e menos processo solto.",
      bullets: ["Leads entram com contexto e responsável", "Atendimento e WhatsApp no mesmo fluxo", "Recovery de inadimplentes e clientes parados", "Integração com ERP e planilhas"],
      primary: { label: "Falar com especialista", go: () => goView("planos") },
      secondary: { label: "Ver como funciona", go: () => goView("esteira") },
    },
    autonomo: {
      label: "vendedor",
      img: "/portal/autonomo.png",
      kicker: "Para vendedor autônomo",
      shortTitle: "Vendedor autônomo",
      promise: "Leads acionáveis e lista organizada pra prospectar sem garimpar empresa por empresa.",
      ideal: ["Vendedor independente e representante", "Prestador que prospecta sozinho", "Quem quer começar grátis, sem cartão"],
      enterLabel: "Sou vendedor autônomo",
      enterLabelMobile: "Sou vendedor",
      title: "Pare de procurar cliente no escuro.",
      sub: "O HBX entrega listas e leads acionáveis pra você abordar com mais velocidade, contexto e organização.",
      bullets: ["Empresas reais organizadas em cards", "Telefone, cidade, segmento e site", "Score e mensagem pronta no lead", "Retorno e histórico pra não perder a hora"],
      primary: { label: "Começar grátis", go: () => goView("planos") },
      secondary: { label: "Ver como funciona", go: () => goView("esteira") },
    },
  };

  // Telas internas herdam o MUNDO escolhido (foto de fundo + accent + cópia por público)
  const worldOn = !!lado && view !== "inicio";
  const PLAN_BY_LADO: Record<Lado, readonly string[]> = {
    corporativo: ["hbx_pro", "hbx_melhor"],
    autonomo: ["hbx_lite", "hbx_padrao"],
  };
  const planOrder: readonly string[] = (lado && PLAN_BY_LADO[lado]) || PLAN_ORDER;

  type InnerCopy = { eyebrow: string; pre: string; accent: string; pos: string; sub: string };
  const INNER_COPY: Record<"esteira" | "modulos" | "planos", Record<"base" | Lado, InnerCopy>> = {
    esteira: {
      base:        { eyebrow: "Como funciona", pre: "A esteira ", accent: "HBX", pos: ".", sub: "Do primeiro contato até a cobrança. Tudo no automático." },
      corporativo: { eyebrow: "Como funciona", pre: "Da prospecção à ", accent: "recuperação", pos: ", numa esteira só.", sub: "Encontrar, organizar, acionar, atender e recuperar — sua operação comercial num fluxo único, com contexto e histórico." },
      autonomo:    { eyebrow: "Como funciona", pre: "Do lead pronto ao ", accent: "fechamento", pos: ".", sub: "Você recebe a empresa certa com a mensagem na mão. O trabalho chato fica com o HBX." },
    },
    modulos: {
      base:        { eyebrow: "Tudo conectado", pre: "Integra, sincroniza e ", accent: "entrega resultado", pos: ".", sub: "Conectamos os canais e sistemas que seu negócio já usa — os dados fluem e o resultado aparece." },
      corporativo: { eyebrow: "Tudo conectado", pre: "Plugamos no seu ", accent: "ERP e CRM", pos: ".", sub: "WhatsApp, Mercado Pago, HubSpot, SAP/TOTVS — o HBX entra na operação que você já roda." },
      autonomo:    { eyebrow: "Tudo na sua mão", pre: "WhatsApp, agenda e ", accent: "cobrança", pos: ".", sub: "Tudo pra prospectar e fechar no celular — sem planilha, sem complicação." },
    },
    planos: {
      base:        { eyebrow: "Planos HBX", pre: "O plano certo para ", accent: "o seu momento", pos: ".", sub: "Do frio ao automatizado: escolha como a HBX entra na sua operação." },
      corporativo: { eyebrow: "Planos · Empresas", pre: "Operação pronta para ", accent: "escalar", pos: ".", sub: "Atendimento no painel, Bot IA e implantação feita pela HBX — com Recovery e ERP." },
      autonomo:    { eyebrow: "Planos · Vendedor", pre: "Comece a vender ", accent: "hoje", pos: ".", sub: "Lead pronto na mão a partir de R$49/mês. Sem fidelidade, cancele quando quiser." },
    },
  };
  const innerCopy = (v: "esteira" | "modulos" | "planos"): InnerCopy =>
    (lado ? INNER_COPY[v][lado] : INNER_COPY[v].base);

  return (
    <HbxScene
      active={view as SceneNav}
      plain={plain}
      themeControls={false}
      onBrand={goBrand}
      onNav={onNav}
    >
      <div className={"scene-view is-" + phase + (worldOn && lado ? " world world--" + lado : "")}>

        {/* Mundo escolhido herdado pelas telas internas: foto de fundo + chip "trocar" */}
        {worldOn && lado && (
          <>
            <div className="world-bg" aria-hidden>
              <i className="pframe" /><i className="pframe" /><i className="pframe" /><i className="pframe" /><i className="pframe" />
            </div>
            <button type="button" className="world-chip" onClick={() => goView("inicio")} aria-label="Trocar de mundo">
              <span className="world-chip__label">{PORTAL_COPY[lado].shortTitle}</span>
              <span className="world-chip__swap"><Ic paths={CHEVRON} />trocar</span>
            </button>
          </>
        )}

        {/* ── INÍCIO ──────────────────────────────────────────────────────── */}
        {view === "inicio" && (
          <div className={"portal" + (lado ? " is-chosen chose-" + lado : "") + (!lado && hoverLado ? " is-hover-" + hoverLado : "")}>

            {(["corporativo", "autonomo"] as Lado[]).map((side) => {
              const c = PORTAL_COPY[side];
              return (
                <button
                  key={side}
                  type="button"
                  className={"portal-side portal-side--" + (side === "corporativo" ? "corp" : "auto")}
                  onMouseEnter={() => { if (!lado) setHoverLado(side); }}
                  onMouseLeave={() => setHoverLado(null)}
                  onClick={() => { if (!lado) setLado(side); }}
                  aria-label={"Entrar como " + c.label}
                >
                  <span className="portal-side__photo" aria-hidden>
                    <i className="pframe" /><i className="pframe" /><i className="pframe" /><i className="pframe" /><i className="pframe" />
                  </span>
                  <span className="portal-side__veil" aria-hidden />
                  <span className="portal-side__label">
                    <span className="portal-side__kicker">{c.kicker}</span>
                    <span className="portal-side__title">{c.shortTitle}</span>
                    <span className="portal-side__promise">{c.promise}</span>
                    <span className="portal-side__ideal">
                      {c.ideal.map((it) => <span key={it} className="portal-side__ideal-item">{it}</span>)}
                    </span>
                    <span className="portal-side__cue">
                      {/* Mobile pede label curto (dono 06/07: "Sou Vendedor" em vez de
                          "Sou vendedor autônomo") — CSS não troca texto, então os 2
                          spans coexistem no DOM e a media query decide qual mostra. */}
                      {c.enterLabelMobile ? (
                        <>
                          <span className="portal-side__cue-full">{c.enterLabel}</span>
                          <span className="portal-side__cue-short">{c.enterLabelMobile}</span>
                        </>
                      ) : c.enterLabel}
                      <Ic paths={CHEVRON} />
                    </span>
                  </span>
                </button>
              );
            })}

            <span className="portal-seam" aria-hidden />

            {/* Hero central da escolha (some no takeover) */}
            <div className="portal-hero" aria-hidden={!!lado}>
              <span className="portal-hero__eyebrow">Como você quer usar o HBX?</span>
              <h1 className="portal-hero__title">Uma esteira comercial.<br />Dois modos de operação.</h1>
              <p className="portal-hero__sub">O HBX encontra oportunidades, organiza contatos e transforma intenção em ação comercial. Escolha o modo que faz sentido pra você.</p>
            </div>

            {/* Microprova: a mesma base por trás dos dois modos */}
            <p className="portal-foot" aria-hidden={!!lado}>Radar · Vendas · Atendimento · Recovery — numa base só</p>

            <div className="site-legal-links portal-legal" aria-hidden={!!lado}>
              <button type="button" className="site-legal-link" onClick={() => openLegal("politicas")}>Política de Privacidade</button>
              <span className="site-legal-sep" aria-hidden>·</span>
              <button type="button" className="site-legal-link" onClick={() => openLegal("termos")}>Termos de Serviço</button>
            </div>

            <div className="portal-stage" aria-hidden={!lado}>
              {lado && (() => {
                const c = PORTAL_COPY[lado];
                return (
                  <div className="portal-copy">
                    <span className="portal-copy__kicker">{c.kicker}</span>
                    <h1 className="portal-copy__title">{c.title}</h1>
                    <p className="portal-copy__sub">{c.sub}</p>
                    <ul className="portal-copy__list">
                      {c.bullets.map((b) => <li key={b}><Ic paths={IC_CHECK} />{b}</li>)}
                    </ul>
                    <div className="portal-copy__cta">
                      <button type="button" className="portal-btn portal-btn--solid" onClick={c.primary.go}>{c.primary.label}</button>
                      <button type="button" className="portal-btn portal-btn--ghost" onClick={c.secondary.go}>{c.secondary.label}</button>
                    </div>
                  </div>
                );
              })()}
            </div>

            {lado && (
              <button type="button" className="portal-back" onClick={() => setLado(null)}>
                <Ic paths={CHEVRON} />trocar
              </button>
            )}
          </div>
        )}

        {/* ── HERO ANTIGO — parkeado (substituído pelo Portal v3.0) ─────────── */}
        {SHOW_LEGACY_HERO && (
          <div className="scene-hero">
            {/* Carrossel desktop: palavras (Radar/Vendas/Atendimento/Recovery) — original */}
            <div className="site-carousel site-carousel--words" role="region" aria-label="Módulos HBX" onClick={advance}>
              <div className="site-carousel__track">
                {CAROUSEL_ITEMS.map((item, i) => (
                  <span
                    key={item.label}
                    className="site-carousel__word"
                    data-state={i === carouselIdx ? "active" : i === prevCarouselIdx ? "exit" : "idle"}
                    aria-hidden={i !== carouselIdx}
                  >
                    <span className="site-carousel__ic"><Ic paths={[...item.ic]} /></span>
                    {item.label}
                  </span>
                ))}
              </div>
              <div className="site-carousel__dots" role="tablist" onClick={e => e.stopPropagation()}>
                {CAROUSEL_ITEMS.map((item, i) => (
                  <button
                    key={item.label}
                    type="button"
                    role="tab"
                    aria-selected={i === carouselIdx}
                    aria-label={item.label}
                    className={"site-carousel__dot" + (i === carouselIdx ? " is-active" : "")}
                    onClick={() => goCarousel(i)}
                  />
                ))}
              </div>
            </div>

            {/* Carrossel mobile: phone-frames (Radar/Vendas/Atendimento) — oculto no desktop via CSS */}
            <div className="site-carousel site-carousel--phones" role="region" aria-label="Módulos HBX" onClick={advance}>
              <div className="site-carousel__track">

                {/* ── SLIDE 0: Radar / Leads ───────────────────────────────── */}
                <div
                  className="site-carousel__slide"
                  data-state={0 === (carouselIdx % CAROUSEL_PHONE_COUNT) ? "active" : 0 === (prevCarouselIdx !== null ? prevCarouselIdx % CAROUSEL_PHONE_COUNT : -1) ? "exit" : "idle"}
                  aria-hidden={0 !== (carouselIdx % CAROUSEL_PHONE_COUNT)}
                  role="group"
                  aria-label="Módulo Radar"
                >
                  <span className="site-carousel__ic" aria-hidden><Ic paths={["M12 16v5", "M9 21h6", "M12 12h.01", "M8.5 12a3.5 3.5 0 0 1 7 0", "M5 12a7 7 0 0 1 14 0", "M2 12a10 10 0 0 1 20 0"]} /></span>
                  <span className="site-carousel__mobile-tx">Radar</span>
                  <div className="site-phone" aria-label="Tela Radar — exemplo de uso">
                    <div className="site-phone__status">
                      <span>09:41</span>
                      <span>■■■ 100%</span>
                    </div>
                    <div className="site-phone__screen">
                      <div className="lead-card" style={{ position: "relative", inset: "auto", borderRadius: 0, border: "none", boxShadow: "none", display: "flex", flexDirection: "column" }}>
                        <div className="lead-card__hero" style={{ padding: "10px 12px 8px", gap: 10, display: "flex", alignItems: "flex-start", borderBottom: "1px solid var(--border-hairline)", flexShrink: 0 }}>
                          <span className="avatar" style={{ width: 36, height: 36, fontSize: 14, borderRadius: "50%" }}>
                            <span className="avatar-ini">DP</span>
                          </span>
                          <div className="lead-card__hero-body">
                            <span className="lead-card__name">Darling Paws Pet Shop</span>
                            <span className="lead-card__sub">Pet Shop · Florianópolis, SC</span>
                            <div className="lead-card__badges">
                              <span className="radar2-fit radar2-fit--hi">FIT 94</span>
                              <span className="radar2-sig radar2-sig--hot">🆕 Abriu recente</span>
                            </div>
                          </div>
                        </div>
                        <div className="lead-card__body" style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
                          <div className="lead-card__reason">
                            Pet shop recém-inaugurado, sem presença digital — momento ideal para entrar.
                          </div>
                          <div className="radar2-signals">
                            <span className="radar2-sig radar2-sig--warn">🌐 Sem site</span>
                            <span className="radar2-sig radar2-sig--warn">📵 Instagram parado</span>
                          </div>
                          <div className="lead-card__contact">
                            <span className="chan-ico chan-ico--whatsapp chan-ico--sm" role="img" aria-label="WhatsApp" />
                            <span className="lead-card__contact-label">(48) ●●●●●-●●●●</span>
                          </div>
                        </div>
                        <div className="lead-card__foot" style={{ padding: "7px 12px 10px", display: "flex", gap: 8, borderTop: "1px solid var(--border-hairline)", flexShrink: 0 }}>
                          <button type="button" className="btn btn--solid btn--sm" style={{ flex: 1, pointerEvents: "none" }}>Puxar</button>
                        </div>
                      </div>
                      <div className="lead-deck__nav" style={{ padding: "4px 10px 6px", display: "flex", alignItems: "center", gap: 6, justifyContent: "center", flexShrink: 0 }}>
                        <button type="button" className="lead-deck__arrow" style={{ pointerEvents: "none" }}>‹</button>
                        <div className="lead-deck__dots">
                          <span className="lead-deck__dot lead-deck__dot--active" />
                          <span className="lead-deck__dot" />
                          <span className="lead-deck__dot" />
                        </div>
                        <span className="lead-deck__progress">1 / 12</span>
                        <button type="button" className="lead-deck__arrow" style={{ pointerEvents: "none" }}>›</button>
                      </div>
                    </div>
                  </div>
                  <span className="site-carousel__caption">Radar</span>
                </div>

                {/* ── SLIDE 1: Vendas ──────────────────────────────────────── */}
                <div
                  className="site-carousel__slide"
                  data-state={1 === (carouselIdx % CAROUSEL_PHONE_COUNT) ? "active" : 1 === (prevCarouselIdx !== null ? prevCarouselIdx % CAROUSEL_PHONE_COUNT : -1) ? "exit" : "idle"}
                  aria-hidden={1 !== (carouselIdx % CAROUSEL_PHONE_COUNT)}
                  role="group"
                  aria-label="Módulo Vendas"
                >
                  <span className="site-carousel__ic" aria-hidden><Ic paths={["M13 2 3 14h9l-1 8 10-12h-9l1-8Z"]} /></span>
                  <span className="site-carousel__mobile-tx">Vendas</span>
                  <div className="site-phone" aria-label="Tela Vendas — exemplo de uso">
                    <div className="site-phone__status">
                      <span>09:41</span>
                      <span>■■■ 100%</span>
                    </div>
                    <div className="site-phone__screen">
                      <div className="site-phone-board">
                        <div className="site-phone-col-head">
                          <span className="site-phone-col-label">Hoje</span>
                          <span className="site-phone-col-count">3</span>
                        </div>
                        <div className="deal">
                          <strong>Espaço Cross Box</strong>
                          <span className="who">Academia · São Paulo, SP</span>
                          <span className="val">R$ 1.490 / mês</span>
                          <div className="foot">
                            <span className="badge-win">Quente</span>
                            <span className="when">Retornar hoje</span>
                          </div>
                        </div>
                        <div className="deal">
                          <strong>Studio Ânima Dança</strong>
                          <span className="who">Escola de Dança · Curitiba, PR</span>
                          <span className="val">R$ 890 / mês</span>
                          <div className="foot">
                            <span className="when">10:30 · 2ª tentativa</span>
                          </div>
                        </div>
                        <div className="site-phone-col-head" style={{ marginTop: 4 }}>
                          <span className="site-phone-col-label">Agendados</span>
                          <span className="site-phone-col-count">5</span>
                        </div>
                        <div className="deal">
                          <strong>Clínica Bem Estar</strong>
                          <span className="who">Saúde · Porto Alegre, RS</span>
                          <span className="val">R$ 2.200 / mês</span>
                          <div className="foot">
                            <span className="when">amanhã 14h</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <span className="site-carousel__caption">Vendas</span>
                </div>

                {/* ── SLIDE 2: Atendimento ─────────────────────────────────── */}
                <div
                  className="site-carousel__slide"
                  data-state={2 === (carouselIdx % CAROUSEL_PHONE_COUNT) ? "active" : 2 === (prevCarouselIdx !== null ? prevCarouselIdx % CAROUSEL_PHONE_COUNT : -1) ? "exit" : "idle"}
                  aria-hidden={2 !== (carouselIdx % CAROUSEL_PHONE_COUNT)}
                  role="group"
                  aria-label="Módulo Atendimento"
                >
                  <span className="site-carousel__ic" aria-hidden><Ic paths={["M20 11.5a8 8 0 0 1-11.9 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z", "M8.5 11h.01", "M12 11h.01", "M15.5 11h.01"]} /></span>
                  <span className="site-carousel__mobile-tx">Atendimento</span>
                  <div className="site-phone" aria-label="Tela Atendimento — exemplo de uso">
                    <div className="site-phone__status">
                      <span>09:41</span>
                      <span>■■■ 100%</span>
                    </div>
                    <div className="site-phone__screen">
                      <div className="site-phone-chat-head">
                        <span className="avatar" style={{ width: 28, height: 28, fontSize: 11, borderRadius: "50%" }}>
                          <span className="avatar-ini">CB</span>
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="site-phone-chat-name">Carla Beatriz</div>
                          <div className="site-phone-chat-sub">Online agora</div>
                        </div>
                        <span className="chan-ico chan-ico--whatsapp chan-ico--sm" role="img" aria-label="WhatsApp" />
                      </div>
                      <div className="site-phone-thread">
                        <div className="msg in">
                          <div className="bubble">
                            Oi! Vi o anúncio e quero saber mais sobre os planos 😊
                            <div className="tm"><span>09:38</span></div>
                          </div>
                        </div>
                        <div className="msg out">
                          <div className="bubble">
                            Olá, Carla! Tudo bem? Aqui é o assistente HBX 🤖 Me conta — você busca automatizar o quê?
                            <div className="tm"><span>09:38</span><span className="ck read">✓✓</span></div>
                          </div>
                        </div>
                        <div className="msg in">
                          <div className="bubble">
                            Quero prospectar mais clientes sem precisar ligar um por um!
                            <div className="tm"><span>09:40</span></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <span className="site-carousel__caption">Atendimento</span>
                </div>

              </div>
              {/* Dots de navegação (3 itens — só mobile) */}
              <div className="site-carousel__dots" role="tablist" onClick={e => e.stopPropagation()}>
                {Array.from({ length: CAROUSEL_PHONE_COUNT }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    role="tab"
                    aria-selected={i === (carouselIdx % CAROUSEL_PHONE_COUNT)}
                    aria-label={CAROUSEL_ITEMS[i].label}
                    className={"site-carousel__dot" + (i === (carouselIdx % CAROUSEL_PHONE_COUNT) ? " is-active" : "")}
                    onClick={() => goCarousel(i)}
                  />
                ))}
              </div>
            </div>
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
            <div className="site-legal-links">
              <button type="button" className="site-legal-link" onClick={() => openLegal("politicas")}>Política de Privacidade</button>
              <span className="site-legal-sep" aria-hidden>·</span>
              <button type="button" className="site-legal-link" onClick={() => openLegal("termos")}>Termos de Serviço</button>
            </div>
          </div>
        )}

        {/* ── ESTEIRA ─────────────────────────────────────────────────────── */}
        {view === "esteira" && (
          <div className="scene-center scene-esteira">
            {(() => { const c = innerCopy("esteira"); return (<>
              <span className="site-eyebrow">{c.eyebrow}</span>
              <h2 className="site-esteira-title">{c.pre}<span className="site-accent">{c.accent}</span>{c.pos}</h2>
              <p className="site-sub">{c.sub}</p>
            </>); })()}
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
              <span className="site-metrics__lead"><Ic paths={IC_BARS} />Menos trabalho manual. Mais conversas, reuniões e vendas.</span>
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
            {(() => { const c = innerCopy("modulos"); return (<>
              <span className="site-eyebrow">{c.eyebrow}</span>
              <h2 className="site-esteira-title">{c.pre}<span className="site-accent">{c.accent}</span>{c.pos}</h2>
              <p className="site-sub">{c.sub}</p>
            </>); })()}
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

        {/* ── PLANOS (modelo GRÁTIS — chavinha HBX_CREDITS_ENABLED) ─────────── */}
        {view === "planos" && creditsEnabled && (
          <div className={"scene-center scene-planos" + (freeImplantacaoOpen || freeRegisterOpen ? " is-choosing is-register" : "")}>
            {!freeImplantacaoOpen && !freeRegisterOpen && (
              <>
                <span className="site-eyebrow">Cadastro grátis</span>
                <h2 className="site-esteira-title">Cadastre-se <span className="site-accent">grátis</span>.</h2>
                <p className="site-sub">Ganhe {welcomeCredits} créditos confirmando email e telefone — sem cartão e sem mensalidade. Recarregue só quando precisar.</p>
                <div className="site-plans site-plans--free">
                  <div className="site-plan2">
                    <span className="site-plan2__ic"><Ic paths={PLAN_STATIC.hbx_padrao.ic} /></span>
                    <strong className="site-plan2__name">HBX <span className="site-accent">Grátis</span></strong>
                    <span className="site-plan2__price"><b>{welcomeCredits} créditos</b><em>de boas-vindas</em></span>
                    <span className="site-plan2__tag">Sem plano, sem cartão. Cadastre-se, confirme email e telefone e comece a puxar leads na hora.</span>
                    <ul className="site-plan2__feats">
                      <li><Ic paths={IC_CHECK} />A busca é sempre grátis</li>
                      <li><Ic paths={IC_CHECK} />1 crédito = 1 lead entregue e validado</li>
                      <li><Ic paths={IC_CHECK} />{welcomeCredits} créditos grátis ao confirmar email e telefone</li>
                    </ul>
                    <button type="button" className="site-plan2__cta" onClick={() => setFreeRegisterOpen(true)}>Cadastrar grátis</button>
                  </div>
                  <PlanCard
                    planKey="hbx_melhor"
                    live={getLivePlan("hbx_melhor")}
                    as="button"
                    onClick={() => setFreeImplantacaoOpen(true)}
                    cta={<div className="site-plan2__cta">{PLAN_STATIC.hbx_melhor.cta}</div>}
                  />
                </div>

                {/* Explicação de créditos (07/07): mesma tela, sem sair da cena —
                    4 regras + pacotes públicos + FAQ. Pacote paused = "Em breve". */}
                <h3 className="site-credits-title">Como funcionam os <span className="site-accent">créditos</span></h3>
                <div className="site-credits-how">
                  {SITE_CREDITS_HOW.map((item) => (
                    <div key={item.t} className="site-credits-how__item">
                      <span className="site-credits-how__ic"><Ic paths={item.ic} /></span>
                      <span className="site-credits-how__t">{item.t}</span>
                      <span className="site-credits-how__d">{item.d}</span>
                    </div>
                  ))}
                </div>

                {creditPacks.length > 0 && (
                  <>
                    <h3 className="site-credits-title">Recargas <span className="site-accent">sem assinatura</span></h3>
                    <p className="site-credits-sub">Acabaram os créditos? Recarregue na hora, só quando precisar — o preço por lead cai conforme o pacote.</p>
                    <div className="site-credits-packs">
                      {creditPacks.map((p) => (
                        <div key={p.key} className={"site-credits-pack" + (p.recommended ? " is-best" : "") + (p.paused ? " is-paused" : "")}>
                          {p.paused && <span className="site-credits-pack__paused">Em breve</span>}
                          {p.badge && <span className="site-credits-pack__badge">{p.badge}</span>}
                          <span className="site-credits-pack__credits"><b>{p.credits.toLocaleString("pt-BR")}</b><em>créditos</em></span>
                          <span className="site-credits-pack__price">{formatBRL(p.price)}</span>
                          {p.credits > 0 && p.price > 0 && (
                            <span className="site-credits-pack__unit">{formatBRL(p.price / p.credits)} por lead · {p.expiryDays} dias</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <div className="site-credits-faq">
                  {SITE_CREDITS_FAQ.map((item) => (
                    <details key={item.q}>
                      <summary>{item.q}</summary>
                      <p>{item.a}</p>
                    </details>
                  ))}
                </div>
                <p className="site-credits-note">Precisa de implantação assistida, Recovery e integração com o seu ERP? Esse é o HBX Company — toque no card e fale com um especialista.</p>
              </>
            )}
            {freeImplantacaoOpen && (
              <div className="site-plan-register">
                <button type="button" className="scene-next scene-next--back" onClick={() => setFreeImplantacaoOpen(false)} aria-label="Voltar">
                  <Ic paths={CHEVRON} />
                  <span className="scene-next__hint">Voltar</span>
                </button>
                <div className="reg-form"><ImplantacaoContato asModal={false} onClose={() => setFreeImplantacaoOpen(false)} /></div>
              </div>
            )}
            {freeRegisterOpen && (
              <div className="site-plan-register">
                <button type="button" className="scene-next scene-next--back" onClick={() => setFreeRegisterOpen(false)} aria-label="Voltar">
                  <Ic paths={CHEVRON} />
                  <span className="scene-next__hint">Voltar</span>
                </button>
                <RegisterPanel embedded />
              </div>
            )}
          </div>
        )}

        {/* ── PLANOS (modelo de planos — fallback, chavinha OFF) ────────────── */}
        {view === "planos" && !creditsEnabled && (
          <div className={"scene-center scene-planos" + (planMode !== "list" ? " is-choosing is-" + planMode : "") + (intruderVisible ? " has-intruder" : "") + (intruder2Visible ? " has-intruder2" : "")}>
            {(() => { const c = innerCopy("planos"); return (<>
              <span className="site-eyebrow">{c.eyebrow}</span>
              <h2 className="site-esteira-title">{c.pre}<span className="site-accent">{c.accent}</span>{c.pos}</h2>
              <p className="site-sub">{c.sub}</p>
            </>); })()}
            {planMode === "list" && (
              <div className="seg-toggle site-plan-cycle" role="tablist" aria-label="Ciclo de cobrança">
                <button type="button" role="tab" aria-selected={billingCycle === "monthly"}
                  className={"seg" + (billingCycle === "monthly" ? " on" : "")}
                  onClick={() => setBillingCycle("monthly")}>Mensal</button>
                <button type="button" role="tab" aria-selected={billingCycle === "annual"}
                  className={"seg" + (billingCycle === "annual" ? " on" : "")}
                  onClick={() => setBillingCycle("annual")}>Anual −{getLivePlan("hbx_padrao").annualDiscountPercent}%</button>
              </div>
            )}
            <div ref={plansTrackRef} className={"site-plans" + (lado ? " is-filtered" : "") + (planMode !== "list" ? " is-choosing is-" + planMode : "")}>
                {planOrder.map((key) => {
                  const s = PLAN_STATIC[key];
                  const lp = getLivePlan(key);
                  return (
                    <PlanCard
                      key={key}
                      planKey={key}
                      live={lp}
                      billingCycle={billingCycle}
                      as="button"
                      onClick={() => choosePlan(key)}
                      className={[
                        s.hot ? "is-hot" : "",
                        selectedPlan === key ? "is-selected" : "",
                        selectedPlan && selectedPlan !== key ? "is-exiting" : "",
                      ].filter(Boolean).join(" ")}
                      cta={<div className="site-plan2__cta">{s.cta}</div>}
                    />
                  );
                })}
            </div>
            {/* Dots de paginação do carrossel de planos — visíveis apenas no mobile via CSS */}
            {planMode === "list" && (
              <div className="site-plans-dots" aria-hidden>
                {planOrder.map((key, i) => (
                  <button
                    key={key}
                    type="button"
                    className={"site-plans-dot" + (i === activePlanDot ? " is-active" : "")}
                    onClick={() => {
                      const track = plansTrackRef.current;
                      if (!track) return;
                      const cards = track.querySelectorAll<HTMLElement>(".site-plan2");
                      cards[i]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
                    }}
                    aria-label={PLAN_STATIC[key]?.accent ?? key}
                  />
                ))}
              </div>
            )}
            {selectedPlan && (planMode === "register" || planMode === "detailReturning" || planMode === "detail2Returning" || planMode === "returning") && (
              <div className="site-plan-register">
                <button type="button" className="scene-next scene-next--back" onClick={voltarPlanos} aria-label="Voltar">
                  <Ic paths={CHEVRON} />
                  <span className="scene-next__hint">Voltar</span>
                </button>
                {intruderVisible && selectedPlan && (() => {
                  const lp = getLivePlan(selectedPlan);
                  return (
                    <aside className="site-plan-intruder card" aria-label="Detalhes do plano">
                      <PlanDetailCard planKey={selectedPlan} live={lp} />
                    </aside>
                  );
                })()}
                {intruder2Visible && selectedPlan === "hbx_melhor" && (
                  <aside className="site-plan-intruder site-plan-intruder--second card" aria-label="Por que a Implantação é o mais forte">
                    <h2 className="site-plan-intruder__type">Por que a Implantação é o mais forte</h2>
                    <div className="site-plan-intruder__body">
                      <p className="site-plan-intruder__tag">O lead quente é o que te dá menos trabalho e mais fechamento. O Company existe pra isso.</p>
                      <ul className="site-plan-intruder__feats">
                        <li><Ic paths={IC_CHECK} />Resposta na hora, 24/7 — ninguém fica no vácuo, nem de madrugada</li>
                        <li><Ic paths={IC_CHECK} />Fala com a sua cara: parece você no WhatsApp, não um robô</li>
                        <li><Ic paths={IC_CHECK} />Escala sem contratar — o sistema segura o primeiro contato</li>
                        <li><Ic paths={IC_CHECK} />Quando esquenta de verdade, cai no colo do vendedor certo</li>
                      </ul>
                    </div>
                    <p className="sub site-plan-intruder__safe">Um especialista monta tudo com você</p>
                  </aside>
                )}
                {selectedPlan === "hbx_melhor"
                  ? <div className="reg-form"><ImplantacaoContato asModal={false} onClose={voltarPlanos} /></div>
                  : <RegisterPanel selectedPlanKey={selectedPlan} embedded />}
              </div>
            )}
          </div>
        )}

      </div>

      {legal && <LegalModal kind={legal} onClose={closeLegal} onSwitch={openLegal} />}
    </HbxScene>
  );
}
