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
  fetchPublicPlans, getPlanFallback,
  type PublicPlan,
} from "@/lib/plans";
import { PlanCard } from "@/components/hbx/plan-card";

// ── types ──────────────────────────────────────────────────────────────────────
// Login saiu da casca (16/06): a view "entrar" foi removida — "Entrar" agora abre
// a rota /login (tela única, por e-mail). A casca é só marketing.
type View = "inicio" | "esteira" | "modulos" | "planos";

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
  const [livePlans, setLivePlans] = useState<PublicPlan[]>(FALLBACK_PLANS);
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
      setSelectedPlan(null);
      setPlanMode("list");
      setIntruderVisible(false);
      setIntruder2Visible(false);
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
    if (k === "entrar") { goRoute("/login"); return; }
    if (k === "inicio") goView("inicio");
    else if (k === "esteira") goView("esteira");
    else if (k === "modulos") goView("modulos");
    else if (k === "planos") goView("planos");
  };

  // plain: inicio mostra robô; demais views (marketing) escondem
  const plain = view !== "inicio";

  return (
    <HbxScene
      active={view as SceneNav}
      plain={plain}
      themeControls={false}
      onBrand={() => goView("inicio")}
      onNav={onNav}
    >
      <div className={"scene-view is-" + phase}>

        {/* ── INÍCIO ──────────────────────────────────────────────────────── */}
        {view === "inicio" && (
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
            <div ref={plansTrackRef} className={"site-plans" + (planMode !== "list" ? " is-choosing is-" + planMode : "")}>
                {PLAN_ORDER.map((key) => {
                  const s = PLAN_STATIC[key];
                  const lp = getLivePlan(key);
                  return (
                    <PlanCard
                      key={key}
                      planKey={key}
                      live={lp}
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
                {PLAN_ORDER.map((key, i) => (
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
                  const s = PLAN_STATIC[selectedPlan] ?? PLAN_STATIC.hbx_lite;
                  const lp = getLivePlan(selectedPlan);
                  return (
                    <aside className="site-plan-intruder card" aria-label="Detalhes do plano">
                      <h2 className="site-plan-intruder__type">HBX {s.accent} · {s.temp}</h2>
                      <div className="site-plan-intruder__body">
                        <p className="site-plan-intruder__tag">{s.pitch}</p>
                        <div className="site-plan-intruder__sec">
                          <span className="site-plan-intruder__label">Como funciona</span>
                          <ol className="site-plan-intruder__how">
                            {s.how.map(step => <li key={step}>{step}</li>)}
                          </ol>
                        </div>
                        <div className="site-plan-intruder__sec">
                          <span className="site-plan-intruder__label">No plano</span>
                          <ul className="site-plan-intruder__feats">
                            {s.points(lp.includedUsers, lp.cardsPerMonth || 0).map(f => <li key={f}><Ic paths={IC_CHECK} />{f}</li>)}
                          </ul>
                        </div>
                        <p className="site-plan-intruder__for">{s.forWho}</p>
                      </div>
                      <p className="sub site-plan-intruder__safe">{s.foot}</p>
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
