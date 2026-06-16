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
import { ImplantacaoContato } from "@/components/hbx/implantacao-contato";
import { LegalModal, type LegalKind } from "@/components/hbx/legal-modal";
import { RegisterPanel } from "@/app/register/page.client";
import {
  FALLBACK_PLANS, PLAN_ORDER, PLAN_STATIC, IC_BARS, IC_CHECK, IC_LOGOS,
  fetchPublicPlans, getPlanFallback, formatBRL,
  type PublicPlan,
} from "@/lib/plans";

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

  useEffect(() => { fetchPublicPlans().then(setLivePlans); }, []);

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
            <div className={"site-plans" + (planMode !== "list" ? " is-choosing is-" + planMode : "")}>
                {PLAN_ORDER.map((key) => {
                  const s = PLAN_STATIC[key];
                  const lp = getLivePlan(key);
                  const trialText = lp.trialDays > 0 ? `${lp.trialDays} dias grátis` : undefined;
                  const price = lp.monthlyPrice !== null ? formatBRL(lp.monthlyPrice) : null;
                  const discountMonths = Math.floor(12 * (lp.annualDiscountPercent / 100));
                  const allFeats = lp.contactOnly
                    ? s.feats
                    : [...s.feats, ...(lp.cardsPerMonth ? [`${lp.cardsPerMonth.toLocaleString("pt-BR")} leads por mês`] : [])];
                  return (
                    <button key={key} type="button" className={"site-plan2" + (s.hot ? " is-hot" : "") + (selectedPlan === key ? " is-selected" : "") + (selectedPlan && selectedPlan !== key ? " is-exiting" : "")} onClick={() => choosePlan(key)}>
                      {s.badge && <span className="site-plan2__badge">{s.badge}</span>}
                      {!lp.contactOnly && <span className="site-plan2__annual">{discountMonths} meses grátis no anual</span>}
                      <span className="site-plan2__ic"><Ic paths={s.ic} /></span>
                      <strong className="site-plan2__name">HBX <span className="site-accent">{s.accent}</span></strong>
                      {trialText
                        ? <span className="site-plan2__trial-wrap"><span className="site-plan2__trial">{trialText}</span><span className="site-plan2__trial-price">{price}<em>/mês</em></span></span>
                        : !lp.contactOnly && price
                          ? <span className="site-plan2__price"><b>{price}</b><em>/mês</em></span>
                          : null}
                      <span className="site-plan2__tag">{s.tag}</span>
                      <ul className="site-plan2__feats">
                        {allFeats.map((f) => <li key={f}><Ic paths={IC_CHECK} />{f}</li>)}
                      </ul>
                      {s.logos && (
                        <div className="site-plan2__logos">
                          {IC_LOGOS.map((l, i) => <span key={i}><Ic paths={l} /></span>)}
                        </div>
                      )}
                      <div className="site-plan2__cta">{s.cta}</div>
                    </button>
                  );
                })}
            </div>
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
                  ? <ImplantacaoContato asModal={false} onClose={voltarPlanos} />
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
