"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React from "react";
import { apiFetch, getToken } from "@/app/_lib/api";
import { buildCheckoutPath } from "@/lib/billing-access";
import {
  HbxCorporatePanel,
  HbxCorporateTag,
  hbxCorporateStyles as cs,
  useHbxCorporateMode,
} from "@/components/corporate/HbxCorporateShell";

const REDIRECT_SECONDS = 5;

// Tela de APRESENTAÇÃO pura (PR-010 R2.1): a razão vem da query string e a
// audiência é decidida pelo PreCheckoutGate antes desta tela renderizar.
// Único consumo de backend: /profile/current-user (nome da conta e datas).
type CurrentUser = {
  company?: {
    name?: string | null;
    trialStartsAt?: string | null;
    trialEndsAt?: string | Date | null;
  } | null;
};

function formatDate(value?: string | Date | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function reasonCopy(reason: string) {
  if (reason === "trial_expired") {
    return {
      title: "Seu período free trial terminou.",
      text: "O acesso operacional foi pausado para manter sua conta protegida. Agora vamos abrir o checkout para você escolher a forma de pagamento e continuar usando o HBX.",
      status: "Trial finalizado",
    };
  }

  if (reason === "payment_failed") {
    return {
      title: "Seu pagamento precisa de atenção.",
      text: "A cobrança da assinatura não foi autorizada. Para evitar perda de operação, vamos abrir o checkout para você atualizar o pagamento com segurança.",
      status: "Pagamento não autorizado",
    };
  }

  return {
    title: "Sua contratação está quase pronta.",
    text: "Antes de liberar os módulos comerciais, vamos abrir o checkout para concluir o pagamento da conta.",
    status: "Checkout pendente",
  };
}

export default function PreCheckoutClientPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useHbxCorporateMode();
  const rawReason = searchParams.get("reason");
  const reason = rawReason === "trial_expired" || rawReason === "payment_failed" ? rawReason : "pending_checkout";
  const checkoutHref = buildCheckoutPath(reason);
  const copy = reasonCopy(reason);
  const [seconds, setSeconds] = React.useState(REDIRECT_SECONDS);
  const [company, setCompany] = React.useState<CurrentUser["company"]>(null);

  React.useEffect(() => {
    if (!getToken()) return;
    let active = true;
    apiFetch<CurrentUser>("/profile/current-user")
      .then((profile) => {
        if (active) setCompany(profile.company || null);
      })
      .catch(() => {
        if (active) setCompany(null);
      });
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

  const trialStart = formatDate(company?.trialStartsAt);
  const trialEnd = formatDate(company?.trialEndsAt);

  const timeline = [
    {
      id: "trial",
      title: "Trial",
      description: trialStart || "Período gratuito",
      tag: <HbxCorporateTag tone="teal">Concluído</HbxCorporateTag>,
    },
    {
      id: "pre-checkout",
      title: "Pré-checkout",
      description: trialEnd ? `Encerrado em ${trialEnd}` : "Aviso de transição",
      tag: <HbxCorporateTag tone="warn">Você está aqui</HbxCorporateTag>,
    },
    {
      id: "checkout",
      title: "Checkout",
      description: `Abrindo em ${seconds}s`,
      tag: <HbxCorporateTag tone="info">Próximo passo</HbxCorporateTag>,
    },
  ];

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "var(--hbx-bg, var(--background))",
      }}
    >
      <div style={{ width: "min(680px, 100%)", display: "grid", gap: 14 }}>
        <div className={cs.logo} style={{ justifySelf: "start" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--hbx-brand)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6l6 6-6 6M11 6l6 6-6 6" />
          </svg>
          <strong>HBX</strong>
          <span className={cs.muted}>· {company?.name || "Conta HBX"}</span>
        </div>

        <HbxCorporatePanel
          title={copy.title}
          meta={<HbxCorporateTag tone={reason === "payment_failed" ? "red" : "warn"}>{copy.status}</HbxCorporateTag>}
        >
          <p className={cs.muted} style={{ marginTop: 0 }}>{copy.text}</p>

          <div className={cs.list}>
            {timeline.map((step) => (
              <div key={step.id} className={cs.listItem}>
                <span className={cs.dot} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{step.title}</strong>
                  <p className={cs.muted} style={{ margin: 0 }}>{step.description}</p>
                </div>
                {step.tag}
              </div>
            ))}
          </div>

          <footer style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <Link className={cs.tealButton} style={{ textDecoration: "none" }} href={checkoutHref}>
              Ir para o checkout
            </Link>
            <p className={cs.muted} role="status" aria-live="polite" style={{ margin: 0 }}>
              Encaminhamento automático em {seconds} segundos.
            </p>
          </footer>
        </HbxCorporatePanel>
      </div>
    </main>
  );
}
