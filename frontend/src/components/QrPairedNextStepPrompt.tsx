"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch, getToken } from "@/app/_lib/api";
import styles from "./DashboardScaffold.module.css";

type WhatsAppStatusPayload = {
  status?: string | null;
  data?: {
    available?: boolean;
  } | null;
};

const STORAGE_KEY = "hbx.qr-paired-next-step.v2";
export const QR_PAIRED_EVENT = "hbx:qr-paired";

const OPTIONS = [
  {
    label: "Concluir Bot",
    description: "Finalizar o tutorial obrigatório antes de ativar respostas automáticas.",
    href: "/tutorial?start=bot&from=qr_popup",
  },
  {
    label: "Atendimento",
    description: "Abrir conversas, filas e handoff humano.",
    href: "/atendimento",
  },
  {
    label: "Radar Digital",
    description: "Prospectar contatos e enviar leads para Vendas.",
    href: "/vendas?radar=1",
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
  const suppressedByPath = Boolean(
    pathname?.startsWith("/master/webscraping") || pathname?.startsWith("/dashboard/master/webscraping"),
  );

  useEffect(() => {
    if (suppressedByPath) return;
    if (!getToken() || hasPromptDismissed()) {
      return;
    }

    let mounted = true;

    async function loadQrStatus() {
      try {
        const payload = await apiFetch<WhatsAppStatusPayload>("/companies/me/whatsapp-modal/status");
        if (!mounted || hasPromptDismissed()) return;
        const shouldOpen = payload?.status === "connected";
        if (shouldOpen) {
          setOpen(true);
          return;
        }
        if (payload?.status !== "connected") {
          setOpen(false);
        }
      } catch {
        if (mounted) setOpen(false);
      }
    }

    window.addEventListener(QR_PAIRED_EVENT, loadQrStatus);
    void loadQrStatus();

    return () => {
      mounted = false;
      window.removeEventListener(QR_PAIRED_EVENT, loadQrStatus);
    };
  }, [suppressedByPath]);

  if (suppressedByPath || !open) return null;

  function handleClose() {
    dismissPrompt();
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
          <span className={styles.qrPromptBadge}>Conectado</span>
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
