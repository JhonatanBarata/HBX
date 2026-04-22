"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch, getToken } from "../app/dashboard/_lib/api";
import styles from "./DashboardScaffold.module.css";

type WhatsAppStatusPayload = {
  status?: string | null;
  data?: {
    available?: boolean;
  } | null;
};

const STORAGE_KEY = "hbx.qr-paired-next-step.v1";
export const QR_PAIRED_EVENT = "hbx:qr-paired";

const OPTIONS = [
  {
    label: "Entrar no Fluxo do bot",
    description: "Ajustar mensagens e caminhos do atendimento automatico.",
    href: "/dashboard/vendas/automacao?tab=flow",
  },
  {
    label: "Atendimento",
    description: "Abrir conversas, filas e handoff humano.",
    href: "/dashboard/inbox",
  },
  {
    label: "Webscraping",
    description: "Prospectar contatos e enviar leads para Vendas.",
    href: "/dashboard/webscraping",
  },
];

function hasPromptDismissed() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(STORAGE_KEY) === "hidden";
}

function dismissPrompt() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, "hidden");
}

export default function QrPairedNextStepPrompt() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    if (!getToken() || hasPromptDismissed()) {
      setOpen(false);
      return;
    }

    let mounted = true;

    async function loadQrStatus() {
      try {
        const payload = await apiFetch<WhatsAppStatusPayload>("/companies/me/whatsapp-modal/status");
        if (!mounted || hasPromptDismissed()) return;
        setOpen(payload?.status === "connected");
      } catch {
        if (mounted) setOpen(false);
      }
    }

    void loadQrStatus();
    window.addEventListener(QR_PAIRED_EVENT, loadQrStatus);

    return () => {
      mounted = false;
      window.removeEventListener(QR_PAIRED_EVENT, loadQrStatus);
    };
  }, [pathname]);

  if (!open) return null;

  function handleClose() {
    if (dontShowAgain) {
      dismissPrompt();
    }
    setOpen(false);
  }

  function handleDontShowAgain() {
    setDontShowAgain(true);
    dismissPrompt();
    setOpen(false);
  }

  function handleSelect(href: string) {
    dismissPrompt();
    setOpen(false);
    router.push(href);
  }

  return (
    <div className={styles.qrPromptOverlay} role="dialog" aria-modal="true" aria-labelledby="qr-next-step-title">
      <section className={styles.qrPromptCard}>
        <button type="button" className={styles.qrPromptClose} onClick={handleClose} aria-label="Fechar aviso">
          x
        </button>

        <div className={styles.qrPromptHeader}>
          <span className={styles.qrPromptBadge}>Sucessfully Paired</span>
          <h2 id="qr-next-step-title">Escolha seu próximo passo</h2>
          <p>Seu QRCode foi confirmado. Selecione uma entrada para continuar a configuração do trial.</p>
        </div>

        <div className={styles.qrPromptOptions}>
          {OPTIONS.map((option) => (
            <button
              key={option.href}
              type="button"
              className={styles.qrPromptOption}
              onClick={() => handleSelect(option.href)}
            >
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </button>
          ))}
        </div>

        <label className={styles.qrPromptCheckbox}>
          <input type="checkbox" checked={dontShowAgain} onChange={handleDontShowAgain} />
          <span>Não exibir novamente</span>
        </label>
      </section>
    </div>
  );
}
