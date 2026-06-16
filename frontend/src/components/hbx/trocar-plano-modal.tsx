"use client";

// Modal de confirmação de troca de plano (bloco PR16062026027).
// Regra de Ouro: NADA muda só por clicar — o Confirmar é que dispara.
// Upgrade → abre o cartão (SubscribeCardModal, chamado pelo pai).
// Downgrade → registra intenção via /commercial-plans/select; crédito/período via 029.
// Lei 5: zero style={{}} inline.

import { useState } from "react";
import { apiFetch } from "@/lib/api";

export type TrocarPlanoDirection = "upgrade" | "downgrade" | "same";

type PlanInfo = {
  key: string;
  title: string;
  monthlyPrice?: number | null;
};

type Props = {
  fromPlan: PlanInfo | null;
  toPlan: PlanInfo;
  direction: TrocarPlanoDirection;
  accessState?: string | null;
  trialRemainingDays?: number | null;
  onClose: () => void;
  onConfirmUpgrade: (plan: PlanInfo) => void;
  onDoneDowngrade: (msg: string) => void;
};

function fmt(n?: number | null) {
  if (n == null || !Number.isFinite(n)) return null;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function TrocarPlanoModal({
  fromPlan, toPlan, direction, accessState, trialRemainingDays,
  onClose, onConfirmUpgrade, onDoneDowngrade,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isPaying = accessState === "paying";
  const isInTrial = accessState === "trial" || accessState === "trial_ending";
  const hasTrial = isInTrial && trialRemainingDays != null && trialRemainingDays > 0;

  async function confirmar() {
    setBusy(true);
    setErr(null);
    try {
      if (direction === "upgrade" || (direction === "downgrade" && !isPaying)) {
        onConfirmUpgrade(toPlan);
      } else if (direction === "downgrade" && isPaying) {
        await apiFetch("/commercial-plans/select", {
          method: "POST",
          body: JSON.stringify({ planKey: toPlan.key }),
        });
        onDoneDowngrade(
          `Redução agendada para ${toPlan.title}. O acesso ao plano atual continua até o fim do período já pago.`,
        );
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível aplicar a troca. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  const upgradeLabel = `Assinar ${toPlan.title}`;
  const downgradeLabel = "Confirmar redução";

  return (
    <div className="bv-veil" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bv-card">
        <div className="bv-hero">
          <div className="orb" />
          <span className="kicker">{direction === "upgrade" ? "Upgrade de plano" : "Redução de plano"}</span>
          <h2>{direction === "upgrade" ? `Mudar para ${toPlan.title}` : `Reduzir para ${toPlan.title}`}</h2>
          {fromPlan && (
            <p>
              {fromPlan.title}{fmt(fromPlan.monthlyPrice) ? ` · ${fmt(fromPlan.monthlyPrice)}/mês` : ""}
              {" → "}
              {toPlan.title}{fmt(toPlan.monthlyPrice) ? ` · ${fmt(toPlan.monthlyPrice)}/mês` : ""}
            </p>
          )}
        </div>
        <div className="bv-body">
          <div className="bv-steps">

            {/* Upgrade: aviso de trial perdido */}
            {direction === "upgrade" && hasTrial && (
              <div className="bv-step">
                <span className="n">⚠</span>
                <span className="tx">
                  <strong>Você perde {trialRemainingDays} {trialRemainingDays === 1 ? "dia" : "dias"} de trial</strong>
                  <small>Ao confirmar o pagamento, o trial encerra e a cobrança começa imediatamente.</small>
                </span>
              </div>
            )}

            {/* Upgrade: usuário já pagante → diferença proporcional */}
            {direction === "upgrade" && isPaying && (
              <div className="bv-step">
                <span className="n">💳</span>
                <span className="tx">
                  <strong>Diferença proporcional cobrada agora</strong>
                  <small>O valor relativo ao que falta do mês é cobrado no cartão. O acesso ao {toPlan.title} libera assim que o pagamento confirmar.</small>
                </span>
              </div>
            )}

            {/* Upgrade: usuário sem plano pago nem trial → assinar do zero */}
            {direction === "upgrade" && !isPaying && !hasTrial && (
              <div className="bv-step">
                <span className="n">✓</span>
                <span className="tx">
                  <strong>Assinar {toPlan.title}</strong>
                  <small>Você paga {fmt(toPlan.monthlyPrice) ?? "—"}/mês. O acesso libera após confirmação do pagamento.</small>
                </span>
              </div>
            )}

            {/* Downgrade: pagante → mantém acesso até o fim do período */}
            {direction === "downgrade" && isPaying && (
              <div className="bv-step">
                <span className="n">📅</span>
                <span className="tx">
                  <strong>Mantém o {fromPlan?.title ?? "plano atual"} até o fim do período</strong>
                  <small>O que já está pago você usa até o vencimento. Depois o acesso cai para o {toPlan.title}.</small>
                </span>
              </div>
            )}

            {/* Downgrade: pagante → crédito gerado */}
            {direction === "downgrade" && isPaying && (
              <div className="bv-step">
                <span className="n">💰</span>
                <span className="tx">
                  <strong>Sem cobrança agora — crédito registrado</strong>
                  <small>A diferença fica como crédito e abate na próxima fatura do {toPlan.title}.</small>
                </span>
              </div>
            )}

            {/* Downgrade: trial/sem pagamento → troca simples */}
            {direction === "downgrade" && !isPaying && (
              <div className="bv-step">
                <span className="n">↓</span>
                <span className="tx">
                  <strong>Trocar para {toPlan.title}</strong>
                  <small>Sua seleção de plano será atualizada. O {toPlan.title} custa {fmt(toPlan.monthlyPrice) ?? "—"}/mês.</small>
                </span>
              </div>
            )}
          </div>

          {err && <span className="bv-msg bad">{err}</span>}

          <div className="bv-foot">
            <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
            <button className="btn-teal grow" onClick={confirmar} disabled={busy}>
              {busy ? "Processando…" : direction === "upgrade" ? upgradeLabel : downgradeLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
