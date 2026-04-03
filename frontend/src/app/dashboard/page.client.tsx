"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "./_lib/api";
import { useRequireAuth } from "./_lib/useRequireAuth";
import { resolveWebsiteOnlyDestination } from "@/lib/websiteLaunch";
import {
  compareUserModules,
  getFirstOperationalModule,
  isCommercialEntryCandidate,
  isModuleBlocked,
  normalizeUserModuleKey,
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

function normalizeStatus(value?: string | null) {
  return String(value || "").trim().toUpperCase();
}

function buildFallbackReasons(user: CurrentUser | null, modules: UserModule[]) {
  const reasons: string[] = [];
  const paymentStatus = normalizeStatus(user?.company?.paymentStatus);
  const subscriptionStatus = String(user?.company?.subscriptionStatus || "").trim().toLowerCase();

  if (!user?.company?.id && !user?.isSystemMaster) {
    reasons.push("Seu usuário ainda não está vinculado a uma empresa operacional.");
  }

  if (
    paymentStatus === "EXPIRED" ||
    paymentStatus === "DISABLED" ||
    subscriptionStatus === "expired" ||
    subscriptionStatus === "canceled"
  ) {
    reasons.push("O acesso da empresa está bloqueado por trial encerrado ou cobrança sem regularização.");
  } else if (
    paymentStatus === "OVERDUE" ||
    paymentStatus === "PENDING" ||
    subscriptionStatus === "past_due"
  ) {
    reasons.push("A empresa ainda não tem acesso operacional liberado para os módulos comerciais.");
  }

  const blockedCommercialModules = modules
    .filter((moduleItem) => isCommercialEntryCandidate(moduleItem) && isModuleBlocked(moduleItem))
    .sort(compareUserModules);

  for (const moduleItem of blockedCommercialModules) {
    if (!moduleItem.blockedReason) continue;
    reasons.push(`${moduleItem.name}: ${moduleItem.blockedReason}`);
  }

  if (!reasons.length) {
    reasons.push("Nenhum módulo comercial está disponível para esta empresa no momento.");
  }

  return Array.from(new Set(reasons));
}

export default function DashboardClientPage() {
  const router = useRouter();
  const hasToken = useRequireAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [modules, setModules] = useState<UserModule[]>([]);
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
        setUser(me);
        setModules(Array.isArray(userModules) ? userModules : []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Falha ao carregar o acesso inicial.");
      } finally {
        setLoading(false);
      }
    })();
  }, [hasToken]);

  const isAdmin = String(user?.role || "").trim().toUpperCase() === "ADMIN";
  const isSystemMaster = Boolean(user?.isSystemMaster);

  const preferredEntryModule = useMemo(() => {
    const firstCommercialModule = getFirstOperationalModule(modules);
    if (firstCommercialModule) return firstCommercialModule;

    if (!isSystemMaster) return null;

    return [...modules]
      .filter((moduleItem) => moduleItem.accessible)
      .sort(compareUserModules)[0] || null;
  }, [isSystemMaster, modules]);

  const fallbackReasons = useMemo(() => buildFallbackReasons(user, modules), [modules, user]);

  const blockedCommercialModules = useMemo(
    () =>
      modules
        .filter((moduleItem) => isCommercialEntryCandidate(moduleItem) && isModuleBlocked(moduleItem))
        .sort(compareUserModules),
    [modules],
  );

  useEffect(() => {
    if (hasToken !== true || loading || !preferredEntryModule || redirectingLabel) return;

    let cancelled = false;
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
  }, [hasToken, loading, preferredEntryModule, redirectingLabel, router]);

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
      <DashboardScaffold title="Abrindo módulo" description="Validando o primeiro módulo operacional disponível.">
        <section className={styles.stateCard}>
          <p className={styles.eyebrow}>Entrada inteligente</p>
          <h1 className={styles.title}>
            {redirectingLabel ? `Abrindo ${redirectingLabel}...` : "Encontrando o melhor ponto de entrada..."}
          </h1>
          <p className={styles.lead}>
            O HBX não usa mais dashboard inicial falso. Estamos levando você direto para a área realmente operacional.
          </p>
        </section>
      </DashboardScaffold>
    );
  }

  return (
    <DashboardScaffold
      title="Sem módulo operacional"
      description="A empresa ainda não tem um módulo comercial pronto para abrir automaticamente."
    >
      <div className={styles.page}>
        {error ? <div className="alert alert-error">{error}</div> : null}

        <section className={styles.stateCard}>
          <div className={styles.stateHeader}>
            <p className={styles.eyebrow}>Entrada operacional</p>
            <h1 className={styles.title}>Nenhum módulo comercial pôde ser aberto agora.</h1>
            <p className={styles.lead}>
              A regra nova é simples: entrar direto no primeiro módulo válido. Quando isso não for possível, o sistema precisa dizer o motivo com clareza.
            </p>
          </div>

          <div className={styles.reasonList}>
            {fallbackReasons.map((reason) => (
              <article key={reason} className={styles.reasonItem}>
                {reason}
              </article>
            ))}
          </div>

          <div className={styles.actionRow}>
            {!isSystemMaster && user?.company?.id ? (
              <>
                <Link href="/dashboard/financeiro" className="btn btn-primary btn-sm">
                  Abrir Financeiro
                </Link>
                <Link href="/dashboard/whatsapp" className="btn btn-secondary btn-sm">
                  Ver motor WhatsApp
                </Link>
                {isAdmin ? (
                  <Link href="/dashboard/gerencial" className="btn btn-secondary btn-sm">
                    Abrir Gerencial
                  </Link>
                ) : null}
                <Link href="/dashboard/importacoes/cadastros" className="btn btn-secondary btn-sm">
                  Abrir Cadastro
                </Link>
              </>
            ) : null}
            {isSystemMaster ? (
              <Link href="/dashboard/master" className="btn btn-primary btn-sm">
                Abrir Master
              </Link>
            ) : null}
          </div>
        </section>

        {blockedCommercialModules.length ? (
          <section className={styles.blockedList}>
            {blockedCommercialModules.map((moduleItem) => (
              <article key={moduleItem.key} className={styles.blockedItem}>
                <div className={styles.blockedTop}>
                  <strong>{moduleItem.name}</strong>
                  <span className={styles.blockedPill}>
                    {moduleItem.criticalEngine ? `Motor: ${moduleItem.criticalEngine}` : "Bloqueado"}
                  </span>
                </div>
                <p>{moduleItem.blockedReason || "Módulo indisponível no momento."}</p>
              </article>
            ))}
          </section>
        ) : null}
      </div>
    </DashboardScaffold>
  );
}
