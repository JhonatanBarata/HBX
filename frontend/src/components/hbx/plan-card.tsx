"use client";

// Card de plano CENTRAL (PR17062026). UM card .site-plan2 para Cadastro e
// Configurações → Plano e cobrança. Fonte ÚNICA: copy =
// lib/plans (PLAN_STATIC); número = backend (PublicPlan); visual =
// hbx-theme/screens.css (.site-plan2*, importado global). NÃO duplicar
// card/preço/feature em tela — quem precisar do card de plano importa daqui.
//
// O CTA é um SLOT (prop `cta`): a casca passa o texto da cena (card inteiro é o
// botão); a Configurações passa um <button className="site-plan2__cta"> que sabe
// se é upgrade, downgrade, plano atual ou contato. Lei 5: zero style inline.

import type { ReactNode } from "react";

import { PLAN_STATIC, IC_CHECK, IC_LOGOS, formatBRL, type PublicPlan } from "@/lib/plans";

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
  // is-hot / is-selected / is-exiting (casca) · is-current (Configurações)
  className?: string;
  as?: "button" | "div";
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  // Conteúdo do CTA (.site-plan2__cta). Casca: <div>texto</div>; Config: <button>.
  cta: ReactNode;
  // Ciclo de cobrança exibido (WORM-17). Ausente/"monthly" = idêntico ao de hoje —
  // a Configurações não passa e segue igual. "annual" mostra o /mês já com desconto.
  billingCycle?: "monthly" | "annual";
};

export function PlanCard({ planKey, live, className, as = "div", onClick, disabled, ariaLabel, cta, billingCycle }: Props) {
  const s = PLAN_STATIC[planKey] ?? PLAN_STATIC.hbx_lite;
  // Self-Checkout (F2): plano pausado pelo master → card embaçado e inclicável.
  const paused = Boolean(live.paused);
  const trialText = live.trialDays > 0 ? `${live.trialDays} dias grátis` : undefined;
  const price = live.monthlyPrice !== null ? formatBRL(live.monthlyPrice) : null;
  const discountMonths = Math.floor(12 * (live.annualDiscountPercent / 100));
  // Anual (WORM-17): /mês equivalente JÁ com o desconto — ancora sem virar taxímetro.
  const isAnnual = billingCycle === "annual" && !live.contactOnly && live.monthlyPrice !== null;
  const annualMonthly = live.monthlyPrice !== null
    ? formatBRL(live.monthlyPrice * (1 - live.annualDiscountPercent / 100))
    : null;
  const displayPrice = isAnnual ? annualMonthly : price;
  const allFeats = live.contactOnly
    ? s.feats
    : [...s.feats, ...(live.cardsPerMonth ? [`${live.cardsPerMonth.toLocaleString("pt-BR")} leads por mês`] : [])];

  const inner = (
    <>
      {paused && <span className="site-plan2__paused">Indisponível no momento</span>}
      {s.badge && <span className="site-plan2__badge">{s.badge}</span>}
      {!live.contactOnly && <span className="site-plan2__annual">{discountMonths} meses grátis no anual</span>}
      <span className="site-plan2__ic"><Ic paths={s.ic} /></span>
      <strong className="site-plan2__name">HBX <span className="site-accent">{s.accent}</span></strong>
      {trialText
        ? <span className="site-plan2__trial-wrap"><span className="site-plan2__trial">{trialText}</span><span className="site-plan2__trial-price">{displayPrice}<em>/mês</em>{isAnnual && <small> no anual</small>}</span></span>
        : !live.contactOnly && displayPrice
          ? <span className="site-plan2__price"><b>{displayPrice}</b><em>/mês</em>{isAnnual && <small>no anual</small>}</span>
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
      {cta}
    </>
  );

  const cls = "site-plan2" + (paused ? " is-paused" : "") + (className ? " " + className : "");
  if (as === "button") {
    return (
      <button type="button" className={cls} onClick={onClick} disabled={disabled || paused}
        aria-disabled={paused || undefined} aria-label={ariaLabel}>
        {inner}
      </button>
    );
  }
  return <div className={cls} aria-label={ariaLabel}>{inner}</div>;
}
