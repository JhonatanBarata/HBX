"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React from "react";
import { apiFetch } from "@/app/_lib/api";
import { buildCheckoutPath, type BillingAccessCompany } from "@/lib/billing-access";
import styles from "./page.module.css";

const REDIRECT_SECONDS = 5;

type CurrentUser = {
  company?: (BillingAccessCompany & {
    name?: string | null;
    selectedPlanKey?: string | null;
    trialStartsAt?: string | null;
  }) | null;
};

function formatDate(value?: string | Date | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function reasonCopy(reason: string | null) {
  if (reason === "trial_expired") {
    return {
      eyebrow: "Pre-checkout HBX",
      title: "Seu periodo free trial terminou.",
      text: "O acesso operacional foi pausado para manter sua conta protegida. Agora vamos abrir o checkout para voce escolher a forma de pagamento e continuar usando o HBX.",
      status: "Trial finalizado",
    };
  }

  if (reason === "payment_failed") {
    return {
      eyebrow: "Pre-checkout HBX",
      title: "Seu pagamento precisa de atenção.",
      text: "A cobrança da assinatura não foi autorizada. Para evitar perda de operação, vamos abrir o checkout para você atualizar o pagamento com segurança.",
      status: "Pagamento não autorizado",
    };
  }

  return {
    eyebrow: "Pre-checkout HBX",
    title: "Sua contratacao esta quase pronta.",
    text: "Antes de liberar os modulos comerciais, vamos abrir o checkout para concluir o pagamento da conta.",
    status: "Checkout pendente",
  };
}

export default function PreCheckoutClientPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawReason = searchParams.get("reason");
  const reason = rawReason === "trial_expired" || rawReason === "payment_failed" ? rawReason : "pending_checkout";
  const checkoutHref = buildCheckoutPath(reason);
  const copy = reasonCopy(reason);
  const [seconds, setSeconds] = React.useState(REDIRECT_SECONDS);
  const [company, setCompany] = React.useState<CurrentUser["company"]>(null);

  React.useEffect(() => {
    let active = true;
    apiFetch<CurrentUser>("/profile/current-user")
      .then((profile) => {
        if (active) setCompany(profile.company || null);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    const tick = window.setInterval(() => {
      setSeconds((current) => Math.max(current - 1, 0));
    }, 1000);
    const redirectTimer = window.setTimeout(() => {
      router.replace(checkoutHref);
    }, REDIRECT_SECONDS * 1000);

    return () => {
      window.clearInterval(tick);
      window.clearTimeout(redirectTimer);
    };
  }, [checkoutHref, router]);

  const trialEnd = formatDate(company?.trialEndsAt);
  const trialStart = formatDate(company?.trialStartsAt);

  return (
    <main className={styles.page}>
      <section className={styles.stage} aria-labelledby="precheckout-title">
        <div className={styles.backdrop} aria-hidden>
          <span className={styles.signalOne} />
          <span className={styles.signalTwo} />
          <span className={styles.signalThree} />
        </div>

        <article className={styles.card} data-ui-reveal-target="true">
          <div className={styles.brandRow}>
            <div className={styles.brandMark} aria-hidden>HBX</div>
            <div>
              <p className={styles.eyebrow}>{copy.eyebrow}</p>
              <strong>{company?.name || "Conta HBX"}</strong>
            </div>
          </div>

          <div className={styles.orbit} aria-hidden>
            <span />
            <span />
            <span />
            <div className={styles.orbitCore}>R$</div>
          </div>

          <div className={styles.copy}>
            <span className={styles.statusPill}>{copy.status}</span>
            <h1 id="precheckout-title">{copy.title}</h1>
            <p>{copy.text}</p>
          </div>

          <div className={styles.timeline} aria-label="Fluxo de conversao comercial">
            <div data-state="done">
              <span />
              <strong>Trial</strong>
              <small>{trialStart || "periodo gratuito"}</small>
            </div>
            <div data-state="current">
              <span />
              <strong>Pre-checkout</strong>
              <small>{trialEnd ? `encerrado em ${trialEnd}` : "aviso de transicao"}</small>
            </div>
            <div>
              <span />
              <strong>Checkout</strong>
              <small>abrindo em {seconds}s</small>
            </div>
          </div>

          <div className={styles.actions}>
            <Link className="btn btn-primary" href={checkoutHref}>
              Ir para o checkout
            </Link>
            <p role="status" aria-live="polite">Encaminhamento automatico em {seconds} segundos.</p>
          </div>
        </article>
      </section>
    </main>
  );
}
