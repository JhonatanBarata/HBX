"use client";

// Detalhe do plano — UI/UX ÚNICO (extraído da landing `site-plan-intruder`).
// O MESMO corpo de "Detalhes do plano" da casca (/?ver=planos) servindo também o
// modal de troca de plano (Configurações → Plano e cobrança). Fonte única: copy =
// lib/plans (PLAN_STATIC); número = backend (PublicPlan); visual = screens.css
// (.site-plan-intruder__*). NÃO duplicar copy/estrutura — quem precisa do detalhe
// importa daqui (igual ao PlanCard).

import { PLAN_STATIC, IC_CHECK, type PublicPlan } from "@/lib/plans";

function Ic({ paths }: { paths: string[] }) {
  return (
    <svg className="site-ic" viewBox="0 0 24 24" aria-hidden>
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

type Props = {
  planKey: string;
  live: PublicPlan;
  // A casca mostra o cabeçalho "digitado" (HBX X · tipo); o modal já tem seu título
  // no hero, então oculta este.
  showHeader?: boolean;
  // "Como funciona" (a esteira de passos) — opcional pra contextos mais enxutos.
  showHow?: boolean;
  // Rodapé de reforço (s.foot) — a casca usa; o modal pode ocultar.
  showFoot?: boolean;
};

export function PlanDetailCard({ planKey, live, showHeader = true, showHow = true, showFoot = true }: Props) {
  const s = PLAN_STATIC[planKey] ?? PLAN_STATIC.hbx_lite;
  return (
    <>
      {showHeader && <h2 className="site-plan-intruder__type">HBX {s.accent} · {s.temp}</h2>}
      <div className="site-plan-intruder__body">
        <p className="site-plan-intruder__tag">{s.pitch}</p>
        {showHow && (
          <div className="site-plan-intruder__sec">
            <span className="site-plan-intruder__label">Como funciona</span>
            <ol className="site-plan-intruder__how">
              {s.how.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </div>
        )}
        <div className="site-plan-intruder__sec">
          <span className="site-plan-intruder__label">No plano</span>
          <ul className="site-plan-intruder__feats">
            {s.points(live.includedUsers, live.cardsPerMonth || 0).map((f) => (
              <li key={f}><Ic paths={IC_CHECK} />{f}</li>
            ))}
          </ul>
        </div>
        <p className="site-plan-intruder__for">{s.forWho}</p>
      </div>
      {showFoot && <p className="sub site-plan-intruder__safe">{s.foot}</p>}
    </>
  );
}
