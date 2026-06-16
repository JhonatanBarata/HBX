"use client";

// Checkout na casca (16/06): o passo de pagamento DENTRO da mesma cena, logo após
// o cadastro — pra não parecer "outra empresa". Reusa o backend que JÁ existe
// (/financeiro). Em dev o provider é MOCK (aprova sem MercadoPago), então dá pra
// testar o funil ponta a ponta SEM chave. Em produção (mode:"live") falta plugar
// o Card Brick com a publicKey pra tokenizar de verdade (TODO ao receber as chaves).
// Regras travadas: Lead salva o cartão e NÃO cobra (trial 14d, cobra só no X+14);
// List/Full cobram agora; Company (hbx_melhor) nunca chega aqui (falar com especialista).

import { type FormEvent, useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";
import {
  FALLBACK_PLANS, PLAN_STATIC, fetchPublicPlans, getPlanFallback, formatBRL,
  type PublicPlan,
} from "@/lib/plans";

const onlyDigits = (v: string) => v.replace(/\D/g, "");
const fmtCardNumber = (v: string) => onlyDigits(v).slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ");
const fmtExp = (v: string) => {
  const d = onlyDigits(v).slice(0, 4);
  return d.length >= 3 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

// O Mercado Pago rejeita a tokenização com um objeto/array de causas (não um Error).
// Mostramos a causa real em vez de engolir num "tente de novo" genérico.
function readMpError(err: unknown): string {
  const e = err as { message?: string; cause?: Array<{ description?: string; code?: string | number }> };
  if (Array.isArray(e?.cause) && e.cause.length) {
    const d = e.cause.map(c => c?.description).filter(Boolean).join(" · ");
    if (d) return d;
  }
  if (err instanceof Error) return err.message;
  if (e?.message) return String(e.message);
  if (typeof err === "string") return err;
  try { return `Erro: ${JSON.stringify(err)}`; } catch { return "Não foi possível concluir. Tente novamente."; }
}

type PayConfig = { mode?: "mock" | "live"; publicKey?: string | null };

export function CheckoutPanel({
  planKey, phone, email, taxDoc, name, trialEndsAt, onSuccess,
}: {
  planKey: string;
  phone: string;
  email: string;
  taxDoc: string;
  name: string;
  trialEndsAt?: string | null;
  onSuccess: () => void;
}) {
  const [livePlans, setLivePlans] = useState<PublicPlan[]>(FALLBACK_PLANS);
  const plan = livePlans.find((p) => p.key === planKey) ?? getPlanFallback(planKey);
  const planName = PLAN_STATIC[planKey]?.accent ?? plan.title;
  const isTrial = plan.trialDays > 0;
  const [cycle, setCycle] = useState<"MONTHLY" | "ANNUAL">("MONTHLY");
  const [cfg, setCfg] = useState<PayConfig | null>(null);
  const [card, setCard] = useState({ number: "", holder: "", exp: "", cvv: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPublicPlans().then(setLivePlans);
    apiFetch<PayConfig>("/financeiro/payments-config").then(setCfg).catch(() => setCfg({ mode: "mock" }));
  }, []);

  // Em produção (live) precisamos do SDK do Mercado Pago pra tokenizar o cartão no
  // navegador — o número do cartão NUNCA passa pelo nosso backend, só o token.
  useEffect(() => {
    if (cfg?.mode !== "live" || !cfg?.publicKey) return;
    if (document.getElementById("mp-sdk")) return;
    const s = document.createElement("script");
    s.id = "mp-sdk";
    s.src = "https://sdk.mercadopago.com/js/v2";
    s.async = true;
    document.head.appendChild(s);
  }, [cfg]);

  const monthly = plan.monthlyPrice ?? 0;
  const discount = plan.annualDiscountPercent;
  const total = useMemo(() => (cycle === "ANNUAL" ? monthly * 12 * (1 - discount / 100) : monthly), [cycle, monthly, discount]);
  const trialDate = useMemo(() => {
    if (!trialEndsAt) return null;
    try { return new Date(trialEndsAt).toLocaleDateString("pt-BR"); } catch { return null; }
  }, [trialEndsAt]);

  async function pay(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // Em mock o backend aprova sem SDK. Em live, tokenizamos o cartão no navegador
      // via SDK do Mercado Pago — só o token vai pro backend, nunca o número do cartão.
      let cardTokenId: string;
      if (cfg?.mode === "live") {
        if (!cfg?.publicKey) throw new Error("Pagamento em produção ainda não configurado. Fale com o suporte HBX.");
        const MP = (window as unknown as { MercadoPago?: new (k: string) => { createCardToken: (d: Record<string, string>) => Promise<{ id?: string }> } }).MercadoPago;
        if (!MP) throw new Error("Pagamento seguro ainda carregando. Aguarde um instante e tente de novo.");
        const [mm, yy] = card.exp.split("/").map(s => s.trim());
        const docDigits = taxDoc.replace(/\D/g, "");
        const token = await new MP(cfg.publicKey).createCardToken({
          cardNumber: card.number.replace(/\D/g, ""),
          cardholderName: card.holder,
          cardExpirationMonth: mm || "",
          cardExpirationYear: yy && yy.length === 2 ? `20${yy}` : (yy || ""),
          securityCode: card.cvv,
          identificationType: docDigits.length > 11 ? "CNPJ" : "CPF",
          identificationNumber: docDigits,
        });
        cardTokenId = token?.id || "";
        if (!cardTokenId) throw new Error("Não conseguimos validar o cartão. Confira os dados e tente de novo.");
      } else {
        cardTokenId = `mock-card-${Date.now()}`;
      }
      await apiFetch("/financeiro/subscription/create", {
        method: "POST",
        body: JSON.stringify({
          planKey,
          billingCycle: cycle,
          cardTokenId,
          contactPhone: phone,
          contactName: name,
          taxDocument: taxDoc,
          payerEmail: email,
          acceptedTerms: true,
        }),
      });
      onSuccess();
    } catch (err) {
      console.error("[checkout] falha ao ativar assinatura:", err);
      setError(readMpError(err));
      setBusy(false);
    }
  }

  return (
    <form className="card reg-checkout" onSubmit={pay}>
      <h2>Ativar o HBX {planName}</h2>
      <div className="reg-checkout__summary">
        <div className="reg-checkout__cycle" role="tablist" aria-label="Ciclo de cobrança">
          <button type="button" role="tab" aria-selected={cycle === "MONTHLY"} className={cycle === "MONTHLY" ? "is-on" : ""} onClick={() => setCycle("MONTHLY")}>Mensal</button>
          <button type="button" role="tab" aria-selected={cycle === "ANNUAL"} className={cycle === "ANNUAL" ? "is-on" : ""} onClick={() => setCycle("ANNUAL")}>Anual <span>-{discount}%</span></button>
        </div>
        <div className="reg-checkout__total"><b>{formatBRL(total)}</b><em>{cycle === "ANNUAL" ? "/ano" : "/mês"}</em></div>
      </div>
      {isTrial && (
        <div className="reg-checkout__trial">
          Não cobramos nada por {plan.trialDays} dias.{trialDate ? ` Sua 1ª cobrança é só em ${trialDate}.` : ""} Cancele quando quiser.
        </div>
      )}
      <div className="f">
        <label htmlFor="cc">Número do cartão</label>
        <input id="cc" className="field-dark" inputMode="numeric" placeholder="0000 0000 0000 0000" required maxLength={23}
          value={card.number} onChange={e => setCard(c => ({ ...c, number: fmtCardNumber(e.target.value) }))} />
      </div>
      <div className="f">
        <label htmlFor="cn">Nome impresso no cartão</label>
        <input id="cn" className="field-dark" placeholder="Como está no cartão" required
          value={card.holder} onChange={e => setCard(c => ({ ...c, holder: e.target.value }))} />
      </div>
      <div className="reg-checkout__row">
        <div className="f">
          <label htmlFor="ce">Validade</label>
          <input id="ce" className="field-dark" inputMode="numeric" placeholder="MM/AA" required maxLength={5}
            value={card.exp} onChange={e => setCard(c => ({ ...c, exp: fmtExp(e.target.value) }))} />
        </div>
        <div className="f">
          <label htmlFor="cv">CVV</label>
          <input id="cv" className="field-dark" inputMode="numeric" placeholder="000" required maxLength={4}
            value={card.cvv} onChange={e => setCard(c => ({ ...c, cvv: onlyDigits(e.target.value).slice(0, 4) }))} />
        </div>
      </div>
      {cfg?.mode === "mock" && (
        <p className="reg-checkout__note">Ambiente de teste — pagamento simulado, nenhum cartão real é cobrado.</p>
      )}
      {error && <div className="reg-checkout__err">{error}</div>}
      <button className="btn-teal" type="submit" disabled={busy}>
        {busy ? "Processando…" : isTrial ? "Começar trial sem cobrança" : `Pagar ${formatBRL(total)}`}
      </button>
      <p className="reg-checkout__safe">Pagamento seguro · seu cartão é protegido pelo gateway e nunca fica com a HBX.</p>
    </form>
  );
}
