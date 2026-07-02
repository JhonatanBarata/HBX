"use client";

// Paywall ÚNICO de limite atingido (WORM-17). Substitui os avisos ad-hoc de cota
// espalhados pelas telas por UM componente central. Regra do concorrente que vale
// roubar: bloquear DEPOIS de mostrar valor, com 2 saídas e SEM humilhar —
// "aguarde a renovação OU aumente seu plano agora". Nada de beco sem saída.
//
// Fonte única de visual: mesmas classes centrais do design system (.bv-veil/.bv-card/
// .bv-hero/.bv-body/.bv-foot/.btn-*) — igual TrocarPlanoModal e ImplantacaoContato.
// Lei 5: zero hex/estilo inline.
//
// Uso:
//   const [limite, setLimite] = useState<null | { title; reason }>(null);
//   {limite && <LimiteAtingidoModal {...limite} onClose={() => setLimite(null)} />}

import type { ReactNode } from "react";

// Contato da HBX — número já usado em ImplantacaoContato/tutorial-coach/configuracoes.
// (duplicação pré-existente no repo; mantido igual para não divergir o canal.)
const WA_SUPPORT = "5519997024884";

type Props = {
  // O que aconteceu (curto): "Buscas do Google de hoje esgotadas".
  title: string;
  // Por quê + o que fazer (1-2 frases). Aceita nó pra permitir <strong>/<br/>.
  reason: ReactNode;
  // Selo do tipo de limite: "diário" | "mensal" | "do plano". Opcional.
  scope?: string;
  // Ação primária (subir plano). Default: navega para a vitrine única de planos.
  onUpgrade?: () => void;
  upgradeLabel?: string;
  // Rótulo do que a renovação libera (ex.: "amanhã", "no dia 1º"). Opcional.
  renewsLabel?: string;
  // Mensagem pré-preenchida do WhatsApp do dono.
  waMessage?: string;
  onClose: () => void;
};

export function LimiteAtingidoModal({
  title,
  reason,
  scope,
  onUpgrade,
  upgradeLabel = "Conheça os planos",
  renewsLabel,
  waMessage = "Olá! Atingi um limite no HBX e quero aumentar meu plano.",
  onClose,
}: Props) {
  const waUrl = `https://wa.me/${WA_SUPPORT}?text=${encodeURIComponent(waMessage)}`;

  function subir() {
    if (onUpgrade) {
      onUpgrade();
      return;
    }
    // Vitrine ÚNICA de planos (lib/plans / MarketingClient). Sem duplicar card aqui.
    window.location.href = "/?ver=planos";
  }

  return (
    <div className="bv-veil" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bv-card">
        <div className="bv-hero">
          <div className="orb" />
          <span className="kicker">{scope ? `Limite ${scope}` : "Limite atingido"}</span>
          <h2>{title}</h2>
          <p>
            {renewsLabel
              ? <>Renova {renewsLabel}. Se não quer esperar, aumente seu plano agora.</>
              : <>Aguarde a renovação ou aumente seu plano agora.</>}
          </p>
        </div>
        <div className="bv-body">
          <p className="bv-msg">{reason}</p>
          <div className="bv-foot">
            <a
              className="btn-ghost"
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Falar com a HBX
            </a>
            <button className="btn-teal grow" onClick={subir}>
              {upgradeLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
