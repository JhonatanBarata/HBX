"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "./_lib/api";
import { useRequireAuth } from "./_lib/useRequireAuth";
import { type WhatsAppCenterPayload } from "@/lib/whatsapp-center";
import { resolveWebsiteOnlyDestination } from "@/lib/websiteLaunch";
import {
  compareUserModules,
  getFirstOperationalModule,
  isCommercialEntryCandidate,
  isModuleBlocked,
  normalizeUserModuleKey,
  resolveModuleBlockedHref,
  resolveModuleHref,
  type UserModule,
} from "@/lib/hbx-modules";
import styles from "./page.module.css";

type CurrentUser = {
  id: number;
  name?: string | null;
  username?: string | null;
  role?: string | null;
  isSystemMaster?: boolean;
  company?: {
    id: number;
    name?: string | null;
    paymentStatus?: string | null;
    subscriptionStatus?: string | null;
    trialEndsAt?: string | null;
  } | null;
};

function hasActiveWhatsAppConnection(payload: WhatsAppCenterPayload | null) {
  if (!payload) return false;

  const qrLiveStatus = String(payload.center?.qrConnection?.liveStatus || "").trim().toLowerCase();
  return Boolean(payload.center?.official?.connected) || qrLiveStatus === "connected";
}

function getVendasFirstModule(modules: UserModule[]) {
  const vendasModule = [...modules]
    .filter((moduleItem) => moduleItem.accessible && isCommercialEntryCandidate(moduleItem))
    .find((moduleItem) => normalizeUserModuleKey(moduleItem.key) === "vendas");

  if (vendasModule) return vendasModule;
  return getFirstOperationalModule(modules);
}

function pickPrimarySetupModule(modules: UserModule[]) {
  const blockedModules = modules
    .filter((moduleItem) => isCommercialEntryCandidate(moduleItem) && isModuleBlocked(moduleItem))
    .sort(compareUserModules);

  return (
    blockedModules.find((moduleItem) => String(moduleItem.criticalEngine || "").trim().toLowerCase() === "whatsapp") ||
    blockedModules.find((moduleItem) => normalizeUserModuleKey(moduleItem.key) === "vendas") ||
    blockedModules.find((moduleItem) => String(moduleItem.criticalEngine || "").trim().toLowerCase() === "payment") ||
    blockedModules[0] ||
    null
  );
}

function resolveSetupActionLabel(moduleItem: UserModule | null) {
  const criticalEngine = String(moduleItem?.criticalEngine || "").trim().toLowerCase();
  if (criticalEngine === "whatsapp") return "Configurar WhatsApp";
  if (criticalEngine === "payment") return "Abrir Financeiro";
  if (normalizeUserModuleKey(String(moduleItem?.key || "")) === "vendas") return "Concluir entrada";
  return "Continuar";
}

function resolveFallbackTitle(user: CurrentUser | null, moduleItem: UserModule | null) {
  if (user?.isSystemMaster) return "Nenhum módulo pronto agora.";
  if (moduleItem) return "Falta um ajuste para abrir Vendas.";
  return "Vendas ainda não está pronta.";
}

function resolveFallbackLead(user: CurrentUser | null, moduleItem: UserModule | null) {
  if (user?.isSystemMaster) return "Abra o contexto certo para continuar.";
  if (!user?.company?.id) return "Finalize a operação para entrar sem ruído.";

  const criticalEngine = String(moduleItem?.criticalEngine || "").trim().toLowerCase();
  if (criticalEngine === "whatsapp") return "Conecte o WhatsApp para liberar a entrada operacional.";
  if (criticalEngine === "payment") return "Regularize a operação para liberar a entrada.";
  if (moduleItem) return "Conclua o setup principal e volte para Vendas.";
  return "A operação ainda não liberou a entrada principal.";
}

export default function DashboardClientPage() {
  const router = useRouter();
  const hasToken = useRequireAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [modules, setModules] = useState<UserModule[]>([]);
  const [whatsAppReady, setWhatsAppReady] = useState(false);
  const [redirectingLabel, setRedirectingLabel] = useState<string | null>(null);

  useEffect(() => {
    if (hasToken !== true) return;
    setError(null);
    setLoading(true);

    (async () => {
      try {
        const [me, userModules] = await Promise.all([
          apiFetch<CurrentUser>("/profile/current-user"),
          apiFetch<UserModule[]>("/modules/me"),
        ]);

        const shouldCheckWhatsApp = !me?.isSystemMaster && Boolean(me?.company?.id);
        const whatsAppCenter = shouldCheckWhatsApp
          ? await apiFetch<WhatsAppCenterPayload>("/companies/me/whatsapp-center").catch(() => null)
          : null;

        setUser(me);
        setModules(Array.isArray(userModules) ? userModules : []);
        setWhatsAppReady(shouldCheckWhatsApp ? hasActiveWhatsAppConnection(whatsAppCenter) : true);
      } catch (loadError) {
        setWhatsAppReady(false);
        setError(loadError instanceof Error ? loadError.message : "Falha ao carregar o acesso inicial.");
      } finally {
        setLoading(false);
      }
    })();
  }, [hasToken]);

  const isSystemMaster = Boolean(user?.isSystemMaster);

  const preferredEntryModule = useMemo(() => {
    const firstCommercialModule = getVendasFirstModule(modules);
    if (firstCommercialModule) return firstCommercialModule;

    if (!isSystemMaster) return null;

    return [...modules]
      .filter((moduleItem) => moduleItem.accessible)
      .sort(compareUserModules)[0] || null;
  }, [isSystemMaster, modules]);

  const primarySetupModule = useMemo(() => pickPrimarySetupModule(modules), [modules]);

  useEffect(() => {
    if (hasToken !== true || loading || redirectingLabel) return;

    let cancelled = false;

    if (!isSystemMaster && user?.company?.id && whatsAppReady === false) {
      setRedirectingLabel("setup de vendas");
      router.replace("/dashboard/vendas/automacao");
      return () => {
        cancelled = true;
      };
    }

    if (!preferredEntryModule) return;

    const normalizedKey = normalizeUserModuleKey(preferredEntryModule.key);
    setRedirectingLabel(preferredEntryModule.name || "módulo inicial");

    if (normalizedKey === "website") {
      resolveWebsiteOnlyDestination()
        .then((destination) => {
          if (cancelled) return;
          if (!destination) {
            router.replace("/dashboard/website");
            return;
          }
          if (/^https?:\/\//i.test(destination)) {
            window.location.assign(destination);
            return;
          }
          router.replace(destination);
        })
        .catch(() => {
          if (!cancelled) {
            router.replace("/dashboard/website");
          }
        });
      return () => {
        cancelled = true;
      };
    }

    router.replace(resolveModuleHref(preferredEntryModule.key, preferredEntryModule.serviceUrl));
    return () => {
      cancelled = true;
    };
  }, [hasToken, isSystemMaster, loading, preferredEntryModule, redirectingLabel, router, user?.company?.id, whatsAppReady]);

  if (hasToken === null) {
    return (
      <main className="app-shell">
        <div className="app-container">
          <div className="panel p-4 text-sm text-muted">Carregando acesso inicial...</div>
        </div>
      </main>
    );
  }

  if (!hasToken) return null;

  if (loading || redirectingLabel) {
    return (
      <DashboardScaffold title="Abrindo operação" description="Entrada direta no módulo principal.">
        <section className={styles.stateCard}>
          <p className={styles.eyebrow}>Entrada</p>
          <h1 className={styles.title}>
            {redirectingLabel ? `Abrindo ${redirectingLabel}...` : "Preparando sua operação..."}
          </h1>
          <p className={styles.lead}>Você entra direto no que já está pronto.</p>
        </section>
      </DashboardScaffold>
    );
  }

  return (
    <DashboardScaffold
      title="Entrada operacional"
      description="Acesso direto ao módulo principal quando ele estiver pronto."
    >
      <div className={styles.page}>
        {error ? <div className="alert alert-error">Não foi possível validar a entrada agora.</div> : null}

        <section className={styles.stateCard}>
          <div className={styles.stateHeader}>
            <p className={styles.eyebrow}>{isSystemMaster ? "MASTER" : "Vendas-first"}</p>
            <h1 className={styles.title}>{resolveFallbackTitle(user, primarySetupModule)}</h1>
            <p className={styles.lead}>{resolveFallbackLead(user, primarySetupModule)}</p>
          </div>

          <div className={styles.actionRow}>
            {!isSystemMaster && primarySetupModule ? (
              <Link href={resolveModuleBlockedHref(primarySetupModule)} className="btn btn-primary btn-sm">
                {resolveSetupActionLabel(primarySetupModule)}
              </Link>
            ) : null}
            {isSystemMaster && !primarySetupModule ? (
              <Link href="/dashboard/master" className="btn btn-primary btn-sm">
                Abrir Master
              </Link>
            ) : null}
          </div>
        </section>
      </div>
    </DashboardScaffold>
  );
}
