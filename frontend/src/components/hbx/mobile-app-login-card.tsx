"use client";

// Card do aplicativo no rodapé do login. Antes vendia só o HBX Logística e
// levava direto no APK; desde 06/08 (celular = aplicativo, o HBX do navegador
// é de computador) ele leva pra /baixar, a tela única que tem os DOIS apps e
// diz a verdade sobre o iPhone.

import Link from "next/link";

import styles from "./mobile-app-login-card.module.css";

const MOBILE_ICON = [
  "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z",
  "M10 18h4",
];

export function MobileAppLoginCard() {
  return (
    <section className={styles.card} aria-label="HBX no celular">
      <span className={styles.icon} aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {MOBILE_ICON.map((path, index) => <path key={index} d={path} />)}
        </svg>
      </span>
      <div className={styles.copy}>
        <strong>HBX no celular</strong>
        <span>No telefone o HBX é aplicativo. Baixe e entre com a mesma conta.</span>
      </div>
      <div className={styles.actions}>
        <Link className={styles.download} href="/baixar">
          Baixar o aplicativo
        </Link>
      </div>
    </section>
  );
}
