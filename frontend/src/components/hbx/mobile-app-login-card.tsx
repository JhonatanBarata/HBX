"use client";

import { useState } from "react";

import { requestMobileLinkAfterLogin } from "@/lib/mobile-link-intent";

import styles from "./mobile-app-login-card.module.css";

const VENDAS_APK_URL = String(process.env.NEXT_PUBLIC_ANDROID_APK_URL || "/download/android").trim();
const LOGISTICA_APK_URL = "/download/android-logistica";

const MOBILE_ICON = [
  "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z",
  "M10 18h4",
];

export function MobileAppLoginCard() {
  const [linkRequested, setLinkRequested] = useState(false);

  function prepareLinking() {
    requestMobileLinkAfterLogin();
    setLinkRequested(true);
    window.requestAnimationFrame(() => {
      const field = document.getElementById("em") as HTMLInputElement | null;
      field?.focus();
      field?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  return (
    <section className={styles.card} aria-label="Aplicativo móvel HBX">
      <span className={styles.icon} aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {MOBILE_ICON.map((path, index) => <path key={index} d={path} />)}
        </svg>
      </span>
      <div className={styles.copy}>
        <strong>HBX no celular</strong>
        <span>Escolha Vendas ou Logística e vincule o aparelho à mesma conta do HBX.</span>
      </div>
      <div className={styles.actions}>
        <a className={styles.download} href={VENDAS_APK_URL} target="_blank" rel="noreferrer">
          APK Vendas
        </a>
        <a className={styles.download} href={LOGISTICA_APK_URL} target="_blank" rel="noreferrer">
          APK Logística
        </a>
        <button type="button" className={styles.linkButton} onClick={prepareLinking}>
          {linkRequested ? "Vínculo preparado" : "Entrar e vincular"}
        </button>
      </div>
      {linkRequested && (
        <small className={styles.note}>Depois do login, o HBX abrirá direto na tela de vinculação.</small>
      )}
    </section>
  );
}
