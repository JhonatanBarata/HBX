"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "./_lib/api";
import { useRequireAuth } from "./_lib/useRequireAuth";
import { resolveWebsiteOnlyDestination } from "@/lib/websiteLaunch";
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
    slug?: string | null;
    onboardingStatus?: string | null;
    paymentStatus?: string | null;
    subscriptionStatus?: string | null;
    premiumAccess?: boolean;
    trialStartsAt?: string | null;
    trialEndsAt?: string | null;
    trialModuleSelection?: "vendas" | "recovery" | null;
    whatsappConnectionMode?: string | null;
    whatsappTemporaryStatus?: string | null;
    whatsappMigrationInterestStatus?: string | null;
    whatsappMigrationInterestAt?: string | null;
    plan?: {
      id: number;
      name?: string | null;
      price?: number | null;
    } | null;
  } | null;
};

type ModuleCard = {
  title: string;
  description: string;
  href: string;
  badge?: string;
};

const CADASTRO_AREA: ModuleCard = {
  title: "Cadastro",
  description: "Area obrigatoria para manter a base central de clientes e tabelas operacionais.",
  href: "/dashboard/importacoes/cadastros",
};

type UserModule = {
  key: string;
  name: string;
  description?: string | null;
  serviceUrl?: string | null;
  accessible: boolean;
};

function formatDate(value?: string | null) {
  const iso = String(value || "").trim();
  if (!iso) return "-";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("pt-BR");
}

function computeTrialRemainingDays(value?: string | null) {
  const iso = String(value || "").trim();
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  const diff = parsed.getTime() - Date.now();
  if (diff <= 0) return 0;
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

function resolveTrialModuleEntry(moduleSelection?: "vendas" | "recovery" | null) {
  if (moduleSelection === "recovery") {
    return {
      href: "/dashboard/inbox?atendimentoTab=recovery",
      title: "Entrar em Recovery",
      subtitle: "Abrir a operação inicial de cobrança e atendimento assistido.",
      label: "Recovery",
    };
  }

  return {
    href: "/dashboard/vendas",
    title: "Entrar em Vendas/CRM",
    subtitle: "Abrir o CRM agenda viva para começar a prospecção com rotina, retornos e próximos passos.",
    label: "Vendas",
  };
}

function resolveWhatsAppCentralStatus(company?: CurrentUser["company"]) {
  const mode = String(company?.whatsappConnectionMode || "").trim().toUpperCase();
  const migrationStatus = String(company?.whatsappMigrationInterestStatus || "").trim().toUpperCase();
  if (migrationStatus === "REQUESTED" || migrationStatus === "CONTACTED") {
    return "Atenção / pendente";
  }
  if (mode === "OFFICIAL") return "Oficial / Meta";
  if (mode === "TEMPORARY") return "Temporário";
  return "Não conectado";
}

export default function DashboardClientPage() {
  const router = useRouter();
  const hasToken = useRequireAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [modules, setModules] = useState<UserModule[]>([]);
  const [redirectingToWebsite, setRedirectingToWebsite] = useState(false);
  const [showPremiumOnboarding, setShowPremiumOnboarding] = useState(false);

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
        setModules(userModules || []);
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : "Falha ao carregar usuário.";
        setError(message);
      } finally {
        setLoading(false);
      }
    })();
  }, [hasToken]);

  const isAdmin = String(user?.role ?? "").toUpperCase() === "ADMIN";
  const roleLabel = String(user?.role ?? "").toUpperCase() || "USUÁRIO";
  const isSystemMaster = Boolean(user?.isSystemMaster);
  const trialModuleSelection =
    user?.company?.trialModuleSelection === "recovery" ? "recovery" : "vendas";
  const trialEntry = resolveTrialModuleEntry(user?.company?.trialModuleSelection as "vendas" | "recovery" | null);
  const whatsappCentralStatus = resolveWhatsAppCentralStatus(user?.company);
  const trialRemainingDays = computeTrialRemainingDays(user?.company?.trialEndsAt);
  const currentPlanLabel =
    String(user?.company?.plan?.name || "").trim() || "Free Trial";
  const onboardingKey =
    user?.company?.id && user?.company?.trialStartsAt
      ? `hbx.premium-onboarding:${user.company.id}:${user.company.trialStartsAt}`
      : null;
  const trialOnboardingEligible =
    !isSystemMaster &&
    String(user?.company?.subscriptionStatus || "").trim().toLowerCase() === "trialing" &&
    String(user?.company?.onboardingStatus || "").trim().toLowerCase() === "active_trial" &&
    Boolean(onboardingKey);

  const moduleCards = useMemo<ModuleCard[]>(() => {
    const moduleRoutes: Record<string, string> = {
      atendimento: "/dashboard/inbox",
      vendas: "/dashboard/vendas",
      gerencial: "/dashboard/gerencial",
      webscraping: "/dashboard/webscraping",
      financeiro: "/dashboard/financeiro",
      website: "/dashboard/website",
      follow_up_internacional: "/dashboard/importacoes/followup-global",
      master: "/dashboard/master",
    };

    const merged = new Map<string, ModuleCard>();
    for (const item of modules) {
      if (!item.accessible) continue;

      const normalizedKey = item.key === "hbx_recovery" ? "atendimento" : item.key;
      if (normalizedKey === "gerencial" && !isAdmin) continue;
      if (merged.has(normalizedKey)) continue;

      merged.set(normalizedKey, {
        title: normalizedKey === "atendimento" ? "Atendimento" : item.name,
        description:
          normalizedKey === "atendimento" && item.key === "hbx_recovery"
            ? "Atendimento, mensagens e cobrança com clientes inadimplentes."
            : item.description || "Módulo disponível para seu usuário.",
        href: moduleRoutes[normalizedKey] || "/dashboard",
        badge: normalizedKey === "gerencial" || normalizedKey === "master" ? "ADMIN" : undefined,
      });
    }

    const base = Array.from(merged.values());

    if (isSystemMaster && !base.some((item) => item.href === "/dashboard/master")) {
      base.push({
        title: "Master",
        description: "Gestão global de empresas, módulos, usuários e billing.",
        href: "/dashboard/master",
        badge: "ADMIN",
      });
    }

    if (!base.some((item) => item.href === CADASTRO_AREA.href)) {
      base.unshift(CADASTRO_AREA);
    }

    if (!isSystemMaster && user?.company?.id && !base.some((item) => item.href === "/dashboard/whatsapp")) {
      base.splice(Math.min(2, base.length), 0, {
        title: "Central WhatsApp",
        description: "Escolha entre conexão rápida para testar ou rota oficial pela Meta com clareza de produto.",
        href: "/dashboard/whatsapp",
        badge: whatsappCentralStatus,
      });
    }

    return base;
  }, [isAdmin, isSystemMaster, modules, user?.company?.id, whatsappCentralStatus]);

  useEffect(() => {
    if (!trialOnboardingEligible || typeof window === "undefined" || !onboardingKey) {
      setShowPremiumOnboarding(false);
      return;
    }

    const alreadySeen = window.localStorage.getItem(onboardingKey) === "seen";
    if (alreadySeen) {
      setShowPremiumOnboarding(false);
      return;
    }

    window.localStorage.setItem(onboardingKey, "seen");
    setShowPremiumOnboarding(true);
  }, [onboardingKey, trialOnboardingEligible]);

  useEffect(() => {
    if (hasToken !== true || loading || redirectingToWebsite) return;
    if (moduleCards.length !== 1 || moduleCards[0]?.href !== "/dashboard/website") return;

    let cancelled = false;
    setRedirectingToWebsite(true);

    resolveWebsiteOnlyDestination()
      .then((destination) => {
        if (cancelled) return;
        if (!destination) {
          setRedirectingToWebsite(false);
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
          setRedirectingToWebsite(false);
          router.replace("/dashboard/website");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hasToken, loading, moduleCards, redirectingToWebsite, router]);

  if (hasToken === null) {
    return (
      <main className="app-shell">
        <div className="app-container">
          <div className="panel p-4 text-sm text-muted">Carregando...</div>
        </div>
      </main>
    );
  }

  if (!hasToken) return null;

  if (redirectingToWebsite) {
    return (
      <DashboardScaffold title="Dashboard">
        <div className="panel p-4 text-sm text-muted">Abrindo o admin do website...</div>
      </DashboardScaffold>
    );
  }

  return (
    <DashboardScaffold title="Dashboard">
      <div className="dashboard-home">
        {error ? <div className="alert alert-error">{error}</div> : null}

        {showPremiumOnboarding ? (
          <section className={styles.welcomeShell}>
            <article className={styles.welcomeHero}>
              <div className={styles.welcomeHeroTop}>
                <p className={styles.welcomeEyebrow}>Onboarding ativo</p>
                <h2 className={styles.welcomeTitle}>
                  {`Bem-vindo${user?.name ? `, ${user.name}` : ""}.`}
                </h2>
                <p className={styles.welcomeLead}>
                  Sua empresa acabou de entrar no HBX com acesso liberado para operar desde já. O foco agora é
                  começar pelo módulo que você escolheu no cadastro, com clareza do que está ativo e do próximo passo.
                </p>
              </div>

              <div className={styles.welcomeStats}>
                <div className={styles.welcomeStat}>
                  <span>Plano atual</span>
                  <strong>{currentPlanLabel}</strong>
                </div>
                <div className={styles.welcomeStat}>
                  <span>Status</span>
                  <strong>{user?.company?.paymentStatus === "TRIAL" ? "Free trial ativo" : "Conta ativa"}</strong>
                </div>
                <div className={styles.welcomeStat}>
                  <span>Dias restantes</span>
                  <strong>
                    {trialRemainingDays === null
                      ? "-"
                      : `${trialRemainingDays} dia${trialRemainingDays === 1 ? "" : "s"}`}
                  </strong>
                </div>
                <div className={styles.welcomeStat}>
                  <span>Módulo inicial</span>
                  <strong>{trialModuleSelection === "recovery" ? "Recovery" : "Vendas"}</strong>
                </div>
              </div>

              <div className={styles.welcomeGrid}>
                <section className={styles.welcomePanel}>
                  <h3 className={styles.panelTitle}>O que já está liberado agora</h3>
                  <p className={styles.panelText}>
                    Seu acesso está ativo em trial, com os módulos disponíveis para a sua empresa e uma trilha inicial
                    pronta para começar a operar sem pressão de upgrade.
                  </p>
                  <div className={styles.moduleChips}>
                    {moduleCards.map((item) => (
                      <span key={item.href} className={styles.moduleChip}>
                        {item.title}
                      </span>
                    ))}
                  </div>
                  <div className={styles.welcomeActions}>
                    <Link href={trialEntry.href} className="btn btn-primary btn-sm">
                      {trialEntry.title}
                    </Link>
                    <Link href="/dashboard/whatsapp" className="btn btn-secondary btn-sm">
                      Central WhatsApp
                    </Link>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setShowPremiumOnboarding(false)}
                    >
                      Ver painel completo
                    </button>
                  </div>
                  <p className={styles.welcomeNote}>{trialEntry.subtitle}</p>
                </section>

                <aside className={styles.welcomeAside}>
                  <h3 className={styles.panelTitle}>Próximos passos</h3>
                  <div className={styles.steps}>
                    <div className={styles.step}>
                      <span className={styles.stepDot} aria-hidden="true" />
                      <div>
                        <strong>E-mail confirmado e conta ativada</strong>
                        <p>Seu acesso já está validado e o ambiente da empresa foi liberado.</p>
                      </div>
                    </div>
                    <div className={styles.step}>
                      <span className={styles.stepDot} aria-hidden="true" />
                      <div>
                        <strong>Trial em andamento até {formatDate(user?.company?.trialEndsAt)}</strong>
                        <p>Você está operando com status premium ativo, sem cobrança nesta fase inicial.</p>
                      </div>
                    </div>
                    <div className={styles.step}>
                      <span className={styles.stepDotActive} aria-hidden="true" />
                      <div>
                        <strong>Começar por {trialEntry.label}</strong>
                        <p>Esse é o melhor ponto de entrada para transformar o trial em operação real.</p>
                      </div>
                    </div>
                    <div className={styles.step}>
                      <span className={styles.stepDotSoon} aria-hidden="true" />
                      <div>
                        <strong>Definir o vínculo do WhatsApp</strong>
                        <p>Escolha entre o caminho rápido para testar ou a rota oficial pela Meta sem misturar os dois.</p>
                      </div>
                    </div>
                    <div className={styles.step}>
                      <span className={styles.stepDotSoon} aria-hidden="true" />
                      <div>
                        <strong>Organizar a rotina inicial</strong>
                        <p>Depois do primeiro uso, siga para os módulos liberados e consolide a operação do dia.</p>
                      </div>
                    </div>
                  </div>
                </aside>
              </div>
            </article>
          </section>
        ) : null}

        <section className="metrics-grid">
          <article className="stat-card">
            <p className="stat-card__label">Empresa</p>
            <p className="stat-card__value text-[1.1rem] leading-tight">
              {isSystemMaster ? "Sistema Global" : user?.company?.name ?? "Não vinculada"}
            </p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Usuário</p>
            <p className="stat-card__value text-[1.1rem] leading-tight">{user?.username ?? "-"}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Perfil</p>
            <p className="stat-card__value text-[1.1rem] leading-tight">{roleLabel}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Areas ativas</p>
            <p className="stat-card__value">{moduleCards.length}</p>
          </article>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {loading ? (
            <div className="panel p-4 text-sm text-muted lg:col-span-2">Carregando módulos...</div>
          ) : (
            moduleCards.map((item) => (
              <Link key={item.href} href={item.href} className="panel panel-interactive p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl md:text-2xl font-extrabold tracking-tight">{item.title}</h2>
                    <p className="text-sm text-muted mt-2 leading-relaxed">{item.description}</p>
                  </div>
                  {item.badge ? <span className="badge badge-brand">{item.badge}</span> : null}
                </div>
                <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-(--brand)">
                  Acessar area
                  <span aria-hidden="true">{"->"}</span>
                </div>
              </Link>
            ))
          )}
        </section>
      </div>

      {/* Navegacao global removida: já existe o menu superior */}
    </DashboardScaffold>
  );
}
