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
const fmtDoc = (digits: string): string => {
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3}\.\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3}\.\d{3}\.\d{3})(\d{1,2})/, "$1-$2");
  }
  return digits
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{2}\.\d{3})(\d)/, "$1.$2")
    .replace(/(\d{2}\.\d{3}\.\d{3})(\d)/, "$1/$2")
    .replace(/(\d{2}\.\d{3}\.\d{3}\/\d{4})(\d{1,2})/, "$1-$2");
};
const fmtExp = (v: string) => {
  const d = onlyDigits(v).slice(0, 4);
  return d.length >= 3 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};
// Telefone BR com DDD (10 fixo / 11 celular). Guardamos só dígitos; exibimos formatado.
const fmtPhone = (digits: string): string => {
  const d = digits.slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

// Bandeira pelo BIN (mesma heurística do gateway): Visa (4), Mastercard (51–55
// ou 2221–2720), Amex (34/37), Elo (prefixos comuns BR), senão genérico.
function detectBrand(raw: string): string {
  const n = onlyDigits(raw);
  if (!n) return "";
  if (/^4/.test(n)) return "VISA";
  if (/^3[47]/.test(n)) return "AMEX";
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(n)) return "MASTERCARD";
  // Elo — alguns prefixos mais comuns no Brasil
  if (/^(4011|4312|4389|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/.test(n)) return "ELO";
  return "CARTÃO";
}

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
  planKey, phone: initialPhone = "", email, name, trialEndsAt, onSuccess, demoOutcome,
  reactivation = false,
}: {
  planKey: string;
  phone?: string;
  email: string;
  name: string;
  trialEndsAt?: string | null;
  onSuccess: () => void;
  // Reativação (bloqueio-gate, inadimplente): sem moldura de trial — é pagamento
  // direto pra religar o acesso, não início de teste grátis.
  reactivation?: boolean;
  // dev-only: a prévia /dev/checkout força a fase (aprovado/recusado) sem tocar
  // na rede, pra mostrar o efeito. O funil real nunca passa isto.
  demoOutcome?: "approved" | "declined";
}) {
  const [livePlans, setLivePlans] = useState<PublicPlan[]>(FALLBACK_PLANS);
  const plan = livePlans.find((p) => p.key === planKey) ?? getPlanFallback(planKey);
  const planName = PLAN_STATIC[planKey]?.accent ?? plan.title;
  const isTrial = !reactivation && plan.trialDays > 0;
  const [cycle, setCycle] = useState<"MONTHLY" | "ANNUAL">("MONTHLY");
  const [cfg, setCfg] = useState<PayConfig | null>(null);
  const [card, setCard] = useState({ number: "", holder: "", exp: "", cvv: "" });
  // CPF/CNPJ do pagador é pedido AQUI (ordem do dono 19/06: saiu do cadastro,
  // entra na tela do cartão). Alimenta a identificação na tokenização do MP.
  const [doc, setDoc] = useState("");
  // Telefone de contato/cobrança. Vem pré-preenchido do cadastro (confirmação por
  // WhatsApp) quando existe; no login por Gmail vem vazio e é coletado AQUI.
  const [phone, setPhone] = useState(() => onlyDigits(initialPhone).slice(0, 11));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Fases do "momento da aprovação" (ordem do dono 19/06): o cartão mock é o
  // ator — flutua processando, vira herói no verde, treme no vermelho.
  const [phase, setPhase] = useState<"idle" | "paying" | "approved" | "declined">("idle");
  const [cvvFocus, setCvvFocus] = useState(false); // vira o cartão pra mostrar o CVV
  const brand = useMemo(() => detectBrand(card.number), [card.number]);

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
    if (!demoOutcome && phone.length < 10) {
      setError("Informe um telefone com DDD (10 ou 11 dígitos).");
      return;
    }
    setBusy(true);
    setError(null);
    setCvvFocus(false);
    setPhase("paying");
    if (demoOutcome) {
      // Prévia /dev/checkout: força o desfecho, sem rede.
      window.setTimeout(() => {
        setBusy(false);
        if (demoOutcome === "declined") setError("Pagamento recusado (simulação) — confira os dados do cartão.");
        setPhase(demoOutcome);
      }, 900);
      return;
    }
    try {
      // Em mock o backend aprova sem SDK. Em live, tokenizamos o cartão no navegador
      // via SDK do Mercado Pago — só o token vai pro backend, nunca o número do cartão.
      let cardTokenId: string;
      if (cfg?.mode === "live") {
        if (!cfg?.publicKey) throw new Error("Pagamento em produção ainda não configurado. Fale com o suporte HBX.");
        const MP = (window as unknown as { MercadoPago?: new (k: string) => { createCardToken: (d: Record<string, string>) => Promise<{ id?: string }> } }).MercadoPago;
        if (!MP) throw new Error("Pagamento seguro ainda carregando. Aguarde um instante e tente de novo.");
        const [mm, yy] = card.exp.split("/").map(s => s.trim());
        const docDigits = doc.replace(/\D/g, "");
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
          taxDocument: doc,
          payerEmail: email,
          acceptedTerms: true,
        }),
      });
      // APROVADO: o cartão vira herói (verde + ✓) e SÓ depois de ~1,2s o funil
      // avança. Em prefers-reduced-motion mostramos o estado final e seguimos rápido.
      setPhase("approved");
      const reduce = typeof window !== "undefined"
        && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      window.setTimeout(onSuccess, reduce ? 300 : 1200);
    } catch (err) {
      console.error("[checkout] falha ao ativar assinatura:", err);
      setError(readMpError(err));
      setBusy(false);
      setPhase("declined");
    }
  }

  // Espelhos do cartão (placeholders quando vazio).
  const showNumber = card.number || "•••• •••• •••• ••••";
  const showName = card.holder ? card.holder.toUpperCase() : "SEU NOME";
  const showExp = card.exp || "MM/AA";
  const showCvv = card.cvv ? "***" : "•••";

  const resolving = phase === "paying";
  const approved = phase === "approved";
  const declined = phase === "declined";
  const inPhase = resolving || approved || declined;
  const stageCls = [
    "hbx-checkout-stage",
    resolving ? "is-resolving is-busy" : "",
    approved ? "is-approved is-busy" : "",
    declined ? "is-declined is-busy" : "",
  ].filter(Boolean).join(" ");

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
      <div className={stageCls}>
        {/* anel girando ao redor do cartão enquanto processa */}
        {resolving && <span className="hbx-approve-ring" aria-hidden="true" />}
        {/* WASH que respira + anéis na aprovação / recusa */}
        {(approved || declined) && (
          <span className={`hbx-approve-wash is-on ${approved ? "ok" : "bad"}`} aria-hidden="true" />
        )}
        {approved && (
          <>
            <span className="hbx-approve-pulse" aria-hidden="true" />
            <span className="hbx-approve-pulse d2" aria-hidden="true" />
          </>
        )}

        {/* O cartão MOCK — ator central. Vira ao focar o CVV. */}
        <div
          className={`hbx-mockcard ${cvvFocus ? "is-flipped" : ""}`}
          role="img"
          aria-label={`Cartão ${brand || "de crédito"} terminando em ${onlyDigits(card.number).slice(-4) || "••••"}`}
        >
          {/* FRENTE */}
          <div className="hbx-mockcard__face hbx-mockcard__front">
            <div className="hbx-mockcard__top">
              <span className="hbx-mockcard__chip" aria-hidden="true" />
              <span className="hbx-mockcard__brand">{brand}</span>
            </div>
            <div className={`hbx-mockcard__number ${card.number ? "" : "is-empty"}`}>{showNumber}</div>
            <div className="hbx-mockcard__foot">
              <div className="hbx-mockcard__field hbx-mockcard__name">
                <span className="hbx-mockcard__cap">Titular</span>
                <span className={`hbx-mockcard__val ${card.holder ? "" : "is-empty"}`}>{showName}</span>
              </div>
              <div className="hbx-mockcard__field">
                <span className="hbx-mockcard__cap">Validade</span>
                <span className={`hbx-mockcard__val ${card.exp ? "" : "is-empty"}`}>{showExp}</span>
              </div>
            </div>
          </div>

          {/* VERSO: tarja + CVV (visível quando o cartão vira) */}
          <div className="hbx-mockcard__face hbx-mockcard__back" aria-hidden="true">
            <span className="hbx-mockcard__stripe" />
            <div className="hbx-mockcard__cvvbox">
              <span className="hbx-mockcard__cvvcap">CVV</span>
              <span className="hbx-mockcard__cvv">{showCvv}</span>
            </div>
          </div>
        </div>

        {/* Selo da aprovação/recusa: disco com "V" que se desenha ou "✕" */}
        {approved && (
          <div className="hbx-approve-seal" role="status">
            <span className="hbx-approve-disc ok">
              <svg viewBox="0 0 48 48" aria-hidden="true">
                <path className="hbx-approve-check" d="M13 25 L21 33 L36 15" />
              </svg>
            </span>
            <span className="hbx-approve-label ok">Aprovado ✓</span>
          </div>
        )}
        {declined && (
          <div className="hbx-approve-seal" role="status">
            <span className="hbx-approve-disc bad">
              <svg viewBox="0 0 48 48" aria-hidden="true">
                <path className="hbx-approve-cross" d="M16 16 L32 32" />
                <path className="hbx-approve-cross x2" d="M32 16 L16 32" />
              </svg>
            </span>
            <span className="hbx-approve-label bad">Recusado</span>
          </div>
        )}

        {/* Campos do form — recolhem/desbotam durante as fases */}
        <div className="hbx-checkout-fields">
          <div className="f">
            <label htmlFor="payer-doc">CPF ou CNPJ do pagador</label>
            <input id="payer-doc" className="field-dark" inputMode="numeric" placeholder="000.000.000-00" required maxLength={18}
              value={fmtDoc(doc)} onChange={e => setDoc(onlyDigits(e.target.value).slice(0, 14))} />
          </div>
          <div className="f">
            <label htmlFor="payer-phone">Telefone com DDD</label>
            <input id="payer-phone" className="field-dark" inputMode="numeric" type="tel" placeholder="(11) 99999-9999" required maxLength={16}
              value={fmtPhone(phone)} onChange={e => setPhone(onlyDigits(e.target.value).slice(0, 11))} />
          </div>
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
              <input id="cv" className="field-dark" type="password" inputMode="numeric" placeholder="000" required maxLength={4}
                value={card.cvv}
                onFocus={() => setCvvFocus(true)}
                onBlur={() => setCvvFocus(false)}
                onChange={e => setCard(c => ({ ...c, cvv: onlyDigits(e.target.value).slice(0, 4) }))} />
            </div>
          </div>
        </div>
      </div>

      {cfg?.mode === "mock" && !inPhase && (
        <p className="reg-checkout__note">Ambiente de teste — pagamento simulado, nenhum cartão real é cobrado.</p>
      )}
      {error && (declined || phase === "idle") && <div className="reg-checkout__err">{error}</div>}

      {declined ? (
        <div className="hbx-decline-foot">
          <button type="button" className="btn-teal" onClick={() => { setError(null); setPhase("idle"); }}>
            Tentar outro cartão
          </button>
        </div>
      ) : (
        <button className="btn-teal" type="submit" disabled={busy}>
          {resolving ? "Processando…" : approved ? "Aprovado ✓" : isTrial ? "Começar trial sem cobrança" : `Pagar ${formatBRL(total)}`}
        </button>
      )}
      {!inPhase && (
        <p className="reg-checkout__safe">Pagamento seguro · seu cartão é protegido pelo gateway e nunca fica com a HBX.</p>
      )}
    </form>
  );
}
