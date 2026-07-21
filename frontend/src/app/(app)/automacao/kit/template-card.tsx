"use client";

// S08 (PADRAO-MERCADO) — kit/template-card.tsx: "card de template padrao",
// UMA so moldura para os contextos que oferecem "comecar por um modelo
// pronto" (README, benchmark ManyChat/HubSpot: "galeria visual dos seeds
// existentes com mini-preview"). Anatomia fixa (S08.md item 1): icone + nome
// (<=3 palavras) + MiniFluxo do fluxo + metrica curta (ex.: "3 toques - 1
// WhatsApp") + CTA "Usar". O card INTEIRO e o botao (mesmo recibo visual que
// a antiga .ia-tpl-card de assistente.css ja usava so pro passo 3 do
// Atendente) — zero botao aninhado, zero handler extra.
//
// Consumidores: wizard do Atendente (secao-atendente.tsx, ATENDENTE_MODELOS)
// e a faixa "Comecar por um modelo" do hub (page.client.tsx) usam o
// componente inteiro. A grade de personas da Prospeccao (secao-
// prospeccao.tsx) NAO usa este componente — persona-card ja tem
// cabecalho/rodape proprios (Ativar/Aplicar, S05/S06) que nao cabem no slot
// fixo daqui; ela reusa so as classes `.aut-tpl-card__fluxo`/`__metric`
// direto (mesma assinatura visual — MiniFluxo + legenda curta — sem herdar
// a moldura clicavel inteira). Ver comentario em hbx-theme/automacao.css.
import type React from "react";

import { I, ICONS } from "@/components/hbx/shell";
import { MiniFluxo, type MiniFluxoNode } from "./mini-fluxo";

export type TemplateCardOption = {
  icon: keyof typeof ICONS;
  /** Nome do modelo — ate 3 palavras (Lei nº1 do README, teto de copy). */
  title: string;
  /** Selo curto opcional (ex.: "Recomendado pra começar"). */
  tag?: string;
  /** Mini-diagrama do fluxo — 2-4 nós (kit/mini-fluxo.tsx). */
  fluxo: MiniFluxoNode[];
  /** Métrica curta do modelo (ex.: "3 toques · 1 WhatsApp"). */
  metric: string;
};

export function TemplateCard({
  option,
  selected,
  onSelect,
  ctaLabel = "Usar",
  innerRef,
}: {
  option: TemplateCardOption;
  /** Destaque de "escolhido agora" (glass pill do chamador) — opcional: a galeria do hub não tem estado selecionado, só navega. */
  selected?: boolean;
  onSelect: () => void;
  ctaLabel?: string;
  innerRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={innerRef}
      type="button"
      className={"aut-tpl-card" + (selected ? " is-on" : "")}
      onClick={onSelect}
    >
      <div className="aut-tpl-card__head">
        <span className="aut-tpl-card__icon"><I d={ICONS[option.icon]} size={16} /></span>
        <span className="aut-tpl-card__title">{option.title}</span>
      </div>
      {option.tag && <span className="aut-tpl-card__tag">{option.tag}</span>}
      <div className="aut-tpl-card__fluxo"><MiniFluxo nodes={option.fluxo} /></div>
      <span className="aut-tpl-card__metric">{option.metric}</span>
      <div className="aut-tpl-card__foot">
        <span className="aut-tpl-card__cta">{ctaLabel}</span>
      </div>
    </button>
  );
}
