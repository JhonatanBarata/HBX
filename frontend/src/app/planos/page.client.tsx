"use client";

// /planos — na CASCA ÚNICA (HbxScene): mesmo fundo (robô + cor ciclando), nav com
// marcador "Planos". Cards no padrão da foto (ícone, nome + accent, tagline, features,
// "Mais escolhido"/Score no Lead, logos no Company). ESCRITAS = minha; cor cicla;
// fundo do card é o mesmo. PREÇO não se hardcoda (PAGAMENTOS.md) — aparece no
// register/checkout via catálogo. "Escolher plano" → register COM TRANSIÇÃO (regra
// da casca): a tela sai, e o register entra com o plano escolhido (?plan=).

import { useRouter } from "next/navigation";
import { useState } from "react";

import { HbxScene, type SceneNav } from "@/components/hbx/hbx-scene";

const SNOW = ["M12 2v20", "M3.34 7l17.32 10", "M20.66 7L3.34 17", "M2 12h20"];
const TARGET = ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M12 12h.01"];
const BOLT = ["M13 2 4 14h7l-1 8 10-12h-9l1-8Z"];
const CUBE = ["M12 2 21 7v10l-9 5-9-5V7l9-5Z", "M3.3 7.2 12 12l8.7-4.8", "M12 12v10"];
const CHECK = ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M8.4 12l2.4 2.4 4.8-5"];
const BARS = ["M4 19V5", "M4 19h16", "M8 19v-6", "M13 19V9", "M18 19v-4"];
const LOGOS = [
  ["M20 11.5a8 8 0 0 1-11.9 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z"],            // whatsapp
  ["M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Z", "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M17 7h.01"], // instagram
  ["M3 16c0-5 2-9 4.5-9S11 16 12 16s2-9 4.5-9S21 11 21 16"],               // meta-ish
  ["M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z", "M4 9h16", "M9 3v4", "M15 3v4"], // calendar
  ["M21 12a9 9 0 1 1-3-6.7", "M21 4v5h-5"],                                 // google-ish
];

type Plan = { key: string; accent: string; ic: string[]; tag: string; feats: string[]; cta: string; hot?: boolean; badge?: string; score?: string; logos?: boolean };
const PLANS: Plan[] = [
  { key: "hbx_lite", accent: "List", ic: SNOW, tag: "Entregamos frio. Você esquenta.", feats: ["Leads frios para prospecção", "Telefone, cidade e segmento", "Base simples para começar"], cta: "Escolher plano" },
  { key: "hbx_padrao", accent: "Lead", ic: TARGET, hot: true, badge: "Mais escolhido", score: "85", tag: "Lista com enriquecimento.", feats: ["Enriquecimento de leads", "Score e análise", "Mais contexto para vender melhor"], cta: "Escolher plano" },
  { key: "hbx_pro", accent: "Full", ic: BOLT, tag: "Aquecimento moderado + integrações automáticas.", feats: ["Aquecimento de lead moderado", "Integrações automáticas", "Fluxos e follow-ups"], cta: "Escolher plano" },
  { key: "hbx_melhor", accent: "Company", ic: CUBE, tag: "Você monta do seu jeito.", feats: ["Nós negociamos e montamos com você", "Integrações sob medida"], logos: true, cta: "Falar com especialista" },
];

function Ic({ paths }: { paths: string[] }) {
  return <svg className="site-ic" viewBox="0 0 24 24" aria-hidden>{paths.map((d, i) => <path key={i} d={d} />)}</svg>;
}

export function PlanosClient() {
  const router = useRouter();
  const [phase, setPhase] = useState<"in" | "out">("in");

  // regra da casca: sai (out) → navega. A próxima entra ao montar.
  const transition = (action: () => void) => { setPhase("out"); window.setTimeout(action, 360); };
  const onNav = (k: SceneNav) => {
    const href = k === "inicio" ? "/" : k === "esteira" ? "/?ver=esteira" : k === "planos" ? "/planos" : "/login";
    if (k === "planos") return;
    transition(() => router.push(href));
  };
  const choose = (key: string) => transition(() => router.push(`/register?plan=${key}`));

  return (
    <HbxScene active="planos" onNav={onNav} onBrand={() => transition(() => router.push("/"))}>
      <div className={"scene-center scene-planos scene-view is-" + phase}>
        <span className="site-eyebrow">Planos HBX</span>
        <h2 className="site-esteira-title">O plano certo para <span className="site-accent">o seu momento</span>.</h2>
        <p className="site-sub">Do frio ao automatizado: escolha como a HBX entra na sua operação.</p>
        <div className="site-plans">
          {PLANS.map((p) => (
            <article key={p.key} className={"site-plan2" + (p.hot ? " is-hot" : "")}>
              {p.badge && <span className="site-plan2__badge">{p.badge}</span>}
              <span className="site-plan2__ic"><Ic paths={p.ic} /></span>
              <strong className="site-plan2__name">HBX <span className="site-accent">{p.accent}</span></strong>
              <span className="site-plan2__tag">{p.tag}</span>
              {p.score && <span className="site-plan2__score"><Ic paths={BARS} />Score médio <b>{p.score}</b></span>}
              <ul className="site-plan2__feats">
                {p.feats.map((f) => <li key={f}><Ic paths={CHECK} />{f}</li>)}
              </ul>
              {p.logos && (
                <div className="site-plan2__logos">
                  {LOGOS.map((l, i) => <span key={i}><Ic paths={l} /></span>)}
                </div>
              )}
              <button type="button" className="site-plan2__cta" onClick={() => choose(p.key)}>{p.cta}</button>
            </article>
          ))}
        </div>
      </div>
    </HbxScene>
  );
}
