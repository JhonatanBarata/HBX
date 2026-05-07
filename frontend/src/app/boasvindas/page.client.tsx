"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/app/_lib/api";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";
import styles from "./page.module.css";

const PAGE_EXIT_MS = 260;

type CurrentUser = {
  isSystemMaster?: boolean;
};

export default function BoasVindasClientPage() {
  const router = useRouter();
  const hasToken = useRequireAuth();
  const [leaving, setLeaving] = useState(false);
  const [masterCheckComplete, setMasterCheckComplete] = useState(false);

  useEffect(() => {
    if (hasToken !== true) return;
    let mounted = true;

    apiFetch<CurrentUser>("/profile/current-user")
      .then((user) => {
        if (!mounted) return;
        if (user?.isSystemMaster) {
          setLeaving(true);
          router.replace("/master");
          return;
        }
        setMasterCheckComplete(true);
      })
      .catch(() => {
        if (mounted) setMasterCheckComplete(true);
      });

    return () => {
      mounted = false;
    };
  }, [hasToken, router]);

  function navigateWithTransition(path: string) {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => router.push(path), PAGE_EXIT_MS);
  }

  function handleStartSetup() {
    navigateWithTransition("/tutorial");
  }

  function handleSkip() {
    navigateWithTransition("/radar-digital");
  }

  if (hasToken === null || (hasToken === true && !masterCheckComplete)) {
    return (
      <main className={styles.page}>
      <section className={styles.shell} aria-live="polite">
          <span className={styles.statusBadge}>Assinatura confirmada</span>
          <div className={styles.brandMark}>HBX</div>
          <p className={styles.loadingText}>Preparando sua entrada...</p>
        </section>
      </main>
    );
  }

  if (!hasToken) return null;

  return (
    <main className={styles.page}>
      <section className={`${styles.shell} ${leaving ? styles.shellLeaving : ""}`} aria-labelledby="welcome-title">
        <span className={styles.statusBadge}>Assinatura confirmada</span>
        <div className={styles.brandMark} aria-label="HBX">HBX</div>

        <h1 id="welcome-title" className={styles.title}>Seu centro de operação está pronto.</h1>
        <p className={styles.subtitle}>
          Antes de abrir os módulos, vamos entender sua empresa, preparar o HBX conforme seu plano e te levar para o melhor ponto de partida.
        </p>

        <div className={styles.guideGrid} aria-label="Resumo do onboarding guiado">
          <article className={styles.guideCard}>
            <span className={styles.guideIcon}>01</span>
            <h2>Entender sua empresa</h2>
            <p>Mapeamos quem vende, atende e acompanha seus clientes.</p>
          </article>

          <article className={styles.guideCard}>
            <span className={styles.guideIcon}>02</span>
            <h2>Preparar seus módulos</h2>
            <p>Liberamos o caminho certo conforme o plano contratado.</p>
          </article>

          <article className={styles.guideCard}>
            <span className={styles.guideIcon}>03</span>
            <h2>Começar pela rota certa</h2>
            <p>Você entra direto no primeiro módulo útil, sem cair perdido no sistema.</p>
          </article>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.primaryAction} onClick={handleStartSetup} disabled={leaving}>
            Iniciar configuração →
          </button>
          <button type="button" className={styles.secondaryAction} onClick={handleSkip} disabled={leaving}>
            Entrar direto no sistema
          </button>
        </div>

        <p className={styles.footerHint}>HBX vai adaptar essa jornada ao plano contratado.</p>
      </section>
    </main>
  );
}
