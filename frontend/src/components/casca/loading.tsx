"use client";

// ============================================================
// MOBILE-CASCA/W1 — CascaLoading (ordem do dono 06/07: "pelo menos a marca
// minha eu quero"). O carregamento PADRÃO da casca inteira.
//
//   • Marca HBX no centro (wordmark + duplo-chevron », como no shell).
//   • Anel ao redor que ENCHE de 0→100%, multi-cor (gradiente cônico), com
//     acabamento 3D (glow, sombra interna, brilho) — nada de spinner genérico.
//   • 2 modos: PROGRESSO real (prop value 0–100, % no centro) e INDETERMINADO
//     (varredura ÚNICA que sobe e segura em ~90%, sem loop — ver casca.css).
//
// REVISÃO 06/07 (queixa do dono: "carrega-zera", "claro horrível", "nem
// aparece direito"): o loop de reset morreu (agora é varredura única, CSS) e
// aqui entra o ANTI-FLASH — o loader só é renderizado depois de um pequeno
// atraso montado; telas que resolvem antes disso nunca chegam a piscar o
// loader na tela.
//
// BOOT (07/07): o atraso acima é ÓTIMO pra trocas de tela in-app (não afoga a
// UI com loader em navegação rápida) mas é o OPOSTO do que o 1º carregamento
// da casca precisa — ali o loader É a marca "carregando" que substitui a
// sidebar desktop/tela crua (mobile-shell.tsx, layout.tsx) e tem que aparecer
// JÁ, inclusive no HTML do servidor (senão o CSS pré-hidratação não tem o que
// revelar). `immediate` pula o atraso: só usar no boot inicial, nunca em
// trocas de tela normais (ali o atraso segue sendo o certo).
//
// É o loading de TELA/AÇÃO da casca; skeleton de linhas continua valendo só
// dentro de listas. Usado nas trocas de rota da casca (MobileShell) e
// exportado pra W2–W6. Cores 100% por token (--casca-ring-* no skeleton, a
// pele veste) — zero hex aqui (5 Leis / check-pele).
// ============================================================

import React from "react";

// Atraso antes do loader aparecer (anti-flash). Trocas de tela que resolvem
// mais rápido que isso nunca chegam a mostrar loader nenhum — "nem aparece
// direito" virava um flash de 1 frame; agora só aparece se a espera for real.
const CASCA_LOADING_APPEAR_DELAY_MS = 180;

// Wordmark HBX = LOGOTIPO (não texto default, ordem do dono): duplo-chevron »
// colorido (herda --hbx-brand-strong via .casca-loading__chevron) + "HBX" em
// Sora black com acabamento metálico platina (gradiente clipado, na classe
// central .casca-loading__mark strong). Visual 100% por classe/token.
function HbxWordmark() {
  return (
    <span className="casca-loading__mark">
      <svg className="casca-loading__chevron" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 6l6 6-6 6M11 6l6 6-6 6" />
      </svg>
      <strong>HBX</strong>
    </span>
  );
}

export function CascaLoading({
  value,
  caption,
  overlay = false,
  immediate = false,
}: {
  /** 0–100 = progresso real (mostra %). undefined = indeterminado (varredura única, segura em ~90%). */
  value?: number;
  /** legenda curta opcional sob a marca (ex.: "Carregando vendas…"). */
  caption?: string;
  /** true = camada semitransparente sobre a tela; false = tela cheia da casca. */
  overlay?: boolean;
  /** true = pula o atraso anti-flash (aparece já no 1º render, inclusive no
   * SSR). Só pro BOOT inicial da casca (mobile-shell.tsx) — trocas de tela
   * normais continuam com o atraso (evita flash em navegação rápida). */
  immediate?: boolean;
}) {
  const determinate = typeof value === "number" && Number.isFinite(value);
  const pct = determinate ? Math.max(0, Math.min(100, Math.round(value as number))) : 0;
  // ângulo de preenchimento do anel (360deg = 100%)
  const fill = determinate ? `${(pct / 100) * 360}deg` : undefined;

  // Anti-flash: só decide "pode aparecer" depois do atraso. Se a tela some
  // antes disso (unmount), o timeout nunca dispara e o loader nunca piscou.
  // `immediate` pula tudo isso (mesmo valor no server e no client — nenhum
  // risco de mismatch, é só um prop estático, não lê nada do browser).
  const [canAppear, setCanAppear] = React.useState(immediate);
  React.useEffect(() => {
    if (immediate) return;
    const timer = window.setTimeout(() => setCanAppear(true), CASCA_LOADING_APPEAR_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [immediate]);
  if (!canAppear) return null;

  return (
    <div
      className={"casca-loading" + (overlay ? " is-overlay" : "")}
      role="status"
      aria-live="polite"
      aria-label={determinate ? `Carregando ${pct}%` : "Carregando"}
    >
      <div
        className={"casca-loading__ring" + (determinate ? "" : " is-indeterminate")}
        style={fill ? ({ ["--casca-fill" as string]: fill } as React.CSSProperties) : undefined}
      >
        <div className="casca-loading__hub">
          <HbxWordmark />
          {determinate ? <span className="casca-loading__pct">{pct}%</span> : null}
        </div>
      </div>
      {caption ? <span className="casca-loading__cap">{caption}</span> : null}
    </div>
  );
}
