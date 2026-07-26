"use client";

import styles from "./mobile-app-login-card.module.css";

const MOBILE_APK_URL = String(process.env.NEXT_PUBLIC_ANDROID_APK_URL || "/download/android-logistica").trim();

const MOBILE_ICON = [
  "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z",
  "M10 18h4",
];

export function MobileAppLoginCard() {
  return (
    <section className={styles.card} aria-label="HBX Logística">
      <span className={styles.icon} aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {MOBILE_ICON.map((path, index) => <path key={index} d={path} />)}
        </svg>
      </span>
      <div className={styles.copy}>
        <strong>HBX Logística</strong>
        <span>Baixe o HBX Logística e vincule o aparelho à mesma conta do HBX.</span>
      </div>
      <div className={styles.actions}>
        <a className={styles.download} href={MOBILE_APK_URL} target="_blank" rel="noreferrer">
          Baixar HBX Logística
        </a>
      </div>
    </section>
  );
}
