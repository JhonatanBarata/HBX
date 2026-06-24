"use client";

// Modal de confirmação de troca de plano (B6 — PR17062026043).
// Regra de Ouro: NADA muda só por clicar — o Confirmar é que dispara.
//
// Assinatura ATIVA (accessState='paying') → POST /financeiro/subscription/change-plan:
//   - upgrade  → cobra a diferença proporcional e libera na hora (mock: ponta a ponta;
//                live com cobrança da diferença volta NEEDS_CHECKOUT/TODO → cai pro cartão).
//   - downgrade → não cobra, mantém o acesso até o fim do período e gera crédito.
// Sem assinatura ativa → upgrade abre o cartão (CheckoutPanel pelo pai);
//   downgrade só registra a intenção (/commercial-plans/select).
// Os números do preview vêm do backend (dryRun) — nunca calculados na tela.
// Lei 5: zero style={{}} inline.

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { type PublicPlan } from "@/lib/plans";
import { PlanDetailCard } from "@/components/hbx/plan-detail-card";

export type TrocarPlanoDirection = "upgrade" | "downgrade" | "same";

type ChangePreview = {
  chargeNow?: number;
  creditGenerated?: number;
  remainingDays?: number;
  effectiveAt?: string | null;
};

type ChangeResult = {
  ok?: boolean;
  code?: string;
  creditGenerated?: number;
  message?: string;
};

type Props = {
  fromPlan: PublicPlan | null;
  toPlan: PublicPlan;
  direction: TrocarPlanoDirection;
  accessState?: string | null;
  trialRemainingDays?: number | null;
  onClose: () => void;
  // Cartão na ficha (assinatura vigente): mostra "•••• 4242 — confirmar" e deixa
  // o pagante reusar sem redigitar (change-plan reusa o preapproval).
  savedCard?: { brand: string | null; last4: string | null } | null;
  // Fallback p/ cartão: assinar do zero (sem chargeNow) ou cobrar a diferença
  // proporcional no live (chargeNow = valor da diferença, do preview).
  onConfirmUpgrade: (plan: PublicPlan, chargeNow?: number) => void;
  // Troca aplicada no backend (refresh + mensagem).
  onApplied: (msg: string) => void;
};

function fmt(n?: number | null) {
  if (n == null || !Number.isFinite(n)) return null;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Métrica "antes → depois" da faixa de comparação. up=null → seta neutra (→).
function Metric({ k, from, to, up }: { k: string; from: string | null; to: string; up: boolean | null }) {
  const cls = up == null ? "" : up ? "is-up" : "is-down";
  return (
    <div className="bv-metric">
      <span className="bv-metric__k">{k}</span>
      <span className="bv-metric__row">
        {from != null && <span className="bv-metric__from">{from}</span>}
        <span className={`bv-metric__arrow ${cls}`} aria-hidden="true">{up == null ? "→" : up ? "↑" : "↓"}</span>
        <span className="bv-metric__to">{to}</span>
      </span>
    </div>
  );
}

const fmtInt = (n?: number | null) =>
  n != null && Number.isFinite(n) ? n.toLocaleString("pt-BR") : null;

// Direção da seta: sobe (true) / desce (false) / neutra (null, sem base ou igual).
const cmp = (a?: number | null, b?: number | null): boolean | null => {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) || a === b) return null;
  return b > a;
};

const NEEDS_CARD_CODES = ["NEEDS_CHECKOUT", "LIVE_PRORATION_TODO", "CARD_REQUIRED"];

export function TrocarPlanoModal({
  fromPlan, toPlan, direction, accessState, trialRemainingDays,
  savedCard, onClose, onConfirmUpgrade, onApplied,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<ChangePreview | null>(null);

  const isPaying = accessState === "paying";
  const isInTrial = accessState === "trial" || accessState === "trial_ending";
  const hasTrial = isInTrial && trialRemainingDays != null && trialRemainingDays > 0;

  // Preview real (dryRun) só faz sentido com assinatura ativa.
  useEffect(() => {
    if (!isPaying) return;
    let alive = true;
    apiFetch<{ preview?: ChangePreview }>("/financeiro/subscription/change-plan", {
      method: "POST",
      body: JSON.stringify({ planKey: toPlan.key, dryRun: true }),
    })
      .then(r => { if (alive && r?.preview) setPreview(r.preview); })
      .catch(() => { /* segue com copy genérica */ });
    return () => { alive = false; };
  }, [isPaying, toPlan.key]);

  const chargeNow = preview?.chargeNow ?? null;
  const creditGenerated = preview?.creditGenerated ?? null;

  async function confirmar() {
    setBusy(true);
    setErr(null);
    try {
      if (isPaying) {
        const res = await apiFetch<ChangeResult>("/financeiro/subscription/change-plan", {
          method: "POST",
          body: JSON.stringify({ planKey: toPlan.key }),
        });
        if (res?.ok) {
          onApplied(
            direction === "upgrade"
              ? `Upgrade para ${toPlan.title} aplicado. Acesso liberado.`
              : `Redução para ${toPlan.title} agendada para o fim do período já pago.${res.creditGenerated ? ` Crédito de ${fmt(res.creditGenerated)} na próxima fatura.` : ""}`,
          );
          return;
        }
        if (res?.code && NEEDS_CARD_CODES.includes(res.code)) {
          onConfirmUpgrade(toPlan, chargeNow ?? undefined); // cai pro cartão (diferença proporcional no live)
          return;
        }
        throw new Error(res?.message || "Não foi possível aplicar a troca.");
      }

      // Sem assinatura ativa.
      if (direction === "downgrade") {
        await apiFetch("/commercial-plans/select", {
          method: "POST",
          body: JSON.stringify({ planKey: toPlan.key }),
        });
        onApplied(`Plano alterado para ${toPlan.title}.`);
      } else {
        onConfirmUpgrade(toPlan); // assinar do zero (cartão)
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
      <div className="bv-card bv-card--plan">
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

          {/* Faixa diferença atual → destino (preço, acessos, leads/mês). */}
          {fromPlan && (
            <div className="bv-compare">
              <Metric
                k="Preço/mês"
                from={fmt(fromPlan.monthlyPrice)}
                to={fmt(toPlan.monthlyPrice) ?? "—"}
                up={cmp(fromPlan.monthlyPrice, toPlan.monthlyPrice)}
              />
              <Metric
                k="Acessos"
                from={fmtInt(fromPlan.includedUsers)}
                to={fmtInt(toPlan.includedUsers) ?? "—"}
                up={cmp(fromPlan.includedUsers, toPlan.includedUsers)}
              />
              <Metric
                k="Leads/mês"
                from={fmtInt(fromPlan.cardsPerMonth)}
                to={fmtInt(toPlan.cardsPerMonth) ?? "—"}
                up={cmp(fromPlan.cardsPerMonth, toPlan.cardsPerMonth)}
              />
            </div>
          )}

          {/* Detalhe do destino — MESMO UI/UX de "Detalhes do plano" da landing. */}
          <div className="bv-plan-details">
            <PlanDetailCard planKey={toPlan.key} live={toPlan} showHeader={false} showHow={false} />
          </div>

          <div className="bv-steps">

            {/* Cartão na ficha: o pagante reusa o cartão já cadastrado (change-plan
                reusa o preapproval) — sem redigitar. "usar outro cartão" cai no form. */}
            {isPaying && savedCard?.last4 && (
              <div className="bv-step">
                <span className="n">💳</span>
                <span className="tx">
                  <strong>Cobrança no cartão{savedCard.brand ? ` ${savedCard.brand}` : ""} •••• {savedCard.last4}</strong>
                  <small>
                    Confirmar usa o cartão que você já cadastrou — sem digitar de novo.{" "}
                    {direction === "upgrade" && (
                      <button type="button" className="bv-link" onClick={() => onConfirmUpgrade(toPlan, chargeNow ?? undefined)} disabled={busy}>usar outro cartão</button>
                    )}
                  </small>
                </span>
              </div>
            )}

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

            {/* Upgrade: já pagante → diferença proporcional (número real do preview) */}
            {direction === "upgrade" && isPaying && (
              <div className="bv-step">
                <span className="n">💳</span>
                <span className="tx">
                  <strong>{chargeNow != null ? `Diferença de ${fmt(chargeNow)} cobrada agora` : "Diferença proporcional cobrada agora"}</strong>
                  <small>Você paga só o proporcional ao que falta do período já pago. O acesso ao {toPlan.title} libera na hora.</small>
                </span>
              </div>
            )}

            {/* Upgrade: sem plano pago nem trial → assinar do zero */}
            {direction === "upgrade" && !isPaying && !hasTrial && (
              <div className="bv-step">
                <span className="n">✓</span>
                <span className="tx">
                  <strong>Assinar {toPlan.title}</strong>
                  <small>Você paga {fmt(toPlan.monthlyPrice) ?? "—"}/mês. O acesso libera após confirmação do pagamento.</small>
                </span>
              </div>
            )}

            {/* Downgrade: pagante → troca AGORA (modelo B), com crédito da sobra */}
            {direction === "downgrade" && isPaying && (
              <div className="bv-step">
                <span className="n">↓</span>
                <span className="tx">
                  <strong>Troca para {toPlan.title} agora</strong>
                  <small>O acesso ao {fromPlan?.title ?? "plano atual"} encerra na hora — a sobra proporcional do que você já pagou volta como crédito.</small>
                </span>
              </div>
            )}

            {/* Downgrade: pagante → crédito gerado (número real do preview) */}
            {direction === "downgrade" && isPaying && (
              <div className="bv-step">
                <span className="n">💰</span>
                <span className="tx">
                  <strong>{creditGenerated != null && creditGenerated > 0 ? `Crédito de ${fmt(creditGenerated)} — sem cobrança agora` : "Sem cobrança agora"}</strong>
                  <small>A sobra proporcional do {fromPlan?.title ?? "plano atual"} fica como crédito e abate na próxima fatura do {toPlan.title}.</small>
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
