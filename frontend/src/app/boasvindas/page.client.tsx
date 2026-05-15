"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/app/_lib/api";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";
import HbxMobileDock from "@/components/mobile/HbxMobileDock";
import { normalizeUserModuleKey, type UserModule } from "@/lib/hbx-modules";
import styles from "./page.module.css";

const PAGE_EXIT_MS = 260;
const LOGIN_TO_WELCOME_TRANSITION_KEY = "hbx_login_to_welcome_transition";

type OperationalStatusChip = {
  key: "token" | "meta" | "webwhats" | "payment" | "access";
  active?: boolean;
  tone?: string | null;
};

type OperationalStatusPayload = {
  statuses?: OperationalStatusChip[];
};

type WhatsAppCenterPayload = {
  center?: {
    official?: { connected?: boolean | null } | null;
    qrConnection?: { liveStatus?: string | null } | null;
  } | null;
};

type WhatsAppModalPayload = {
  status?: string | null;
};

type VendasBoardPayload = {
  summary?: {
    total?: number | null;
    today?: number | null;
    overdue?: number | null;
    scheduled?: number | null;
  } | null;
};

type WelcomeState = {
  loaded: boolean;
  whatsappConnected: boolean;
  radarReady: boolean;
  atendimentoReady: boolean;
  assistantOptional: boolean;
  leadsCount: number;
  conversationsCount: number;
  pendingCount: number;
  vendasReady: boolean;
};

const DEFAULT_WELCOME_STATE: WelcomeState = {
  loaded: false,
  whatsappConnected: false,
  radarReady: false,
  atendimentoReady: false,
  assistantOptional: false,
  leadsCount: 0,
  conversationsCount: 0,
  pendingCount: 0,
  vendasReady: false,
};

function hasModule(modules: UserModule[], key: string) {
  return modules.some((moduleItem) => (
    normalizeUserModuleKey(moduleItem.key) === key &&
    moduleItem.accessible &&
    moduleItem.visible !== false
  ));
}

function isWhatsAppConnected(
  center: WhatsAppCenterPayload | null,
  modal: WhatsAppModalPayload | null,
  operational: OperationalStatusPayload | null,
) {
  if (modal?.status === "connected") return true;
  if (center?.center?.official?.connected) return true;
  if (center?.center?.qrConnection?.liveStatus === "connected") return true;
  return Boolean((operational?.statuses || []).find((chip) => (
    (chip.key === "meta" || chip.key === "webwhats") &&
    (chip.active || chip.tone === "green")
  )));
}

function hasOperationalHistory(state: WelcomeState) {
  return (
    state.radarReady ||
    state.atendimentoReady ||
    state.vendasReady ||
    state.leadsCount > 0 ||
    state.conversationsCount > 0 ||
    state.pendingCount > 0
  );
}

function mobileOperationStatus(state: WelcomeState) {
  if (!state.loaded || !hasOperationalHistory(state)) return "Primeiro acesso";
  return "Operação mobile";
}

function mobileHeroSubtitle(state: WelcomeState) {
  if (!state.loaded) return "Comece buscando oportunidades no Radar";
  if (state.leadsCount > 0) return `${state.leadsCount} leads prontos para trabalhar`;
  if (state.radarReady) return "Radar pronto para buscar oportunidades";
  return "Comece buscando oportunidades no Radar";
}

function mobilePrimaryAction(state: WelcomeState) {
  if (!state.loaded) return { label: "Carregando", path: "/boasvindas" };
  if (state.vendasReady || state.leadsCount > 0) return { label: "Abrir Vendas", path: "/vendas" };
  return { label: "Buscar leads no Radar", path: "/radar-digital" };
}

function MobileDashboard({
  state,
  primaryAction,
  leaving = false,
  onNavigate,
}: {
  state: WelcomeState;
  primaryAction: { label: string; path: string };
  leaving?: boolean;
  onNavigate?: (path: string) => void;
}) {
  const metrics = [
    { key: "leads", label: "Leads", value: state.loaded ? String(state.leadsCount) : "--" },
    { key: "radar", label: "Radar", value: state.loaded && state.radarReady ? "Pronto" : "Configurar" },
    { key: "pending", label: "Pendências", value: state.loaded ? String(state.pendingCount) : "--" },
  ];
  const disabled = leaving || !state.loaded || !onNavigate;

  return (
    <div className={`${styles.mobileDashboard} hbx-mobile-page`} aria-label="Painel inicial mobile">
      <header className={`${styles.mobileHeader} hbx-mobile-header`}>
        <strong>HBX</strong>
        <span>{mobileOperationStatus(state)}</span>
      </header>

      <section className={`${styles.mobileHero} hbx-mobile-hero`}>
        <div className={styles.mobileHeroCopy}>
          <span>Operação</span>
          <h1>Sua operação hoje</h1>
          <p>{mobileHeroSubtitle(state)}</p>
        </div>
        <div className={styles.mobileHeroVisual} aria-hidden="true">
          <Image
            src="/hbx-visuals/onboarding/welcome-mobile.webp"
            alt=""
            width={320}
            height={220}
            priority
          />
        </div>
      </section>

      <button
        type="button"
        className={`${styles.mobilePrimaryAction} hbx-mobile-primary-button`}
        onClick={() => onNavigate?.(primaryAction.path)}
        disabled={disabled}
      >
        {primaryAction.label}
      </button>

      <nav className={styles.mobileSecondaryActions} aria-label="Atalhos">
        <button type="button" className="hbx-mobile-secondary-button" onClick={() => onNavigate?.("/radar-digital")} disabled={disabled}>Radar Digital</button>
        <button type="button" className="hbx-mobile-secondary-button" onClick={() => onNavigate?.("/atendimento")} disabled={disabled}>Atendimento</button>
      </nav>

      <section className={styles.mobileMetricStrip} aria-label="Resumo operacional">
        {metrics.map((metric) => (
          <div key={metric.key} className={styles.mobileMetricPill}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </section>

      <HbxMobileDock primaryHref="/radar-digital" primaryLabel="Buscar leads no Radar" />
    </div>
  );
}

export default function BoasVindasClientPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasToken = useRequireAuth();
  const [leaving, setLeaving] = useState(false);
  const [masterCheckComplete, setMasterCheckComplete] = useState(false);
  const [welcomeState, setWelcomeState] = useState<WelcomeState>(DEFAULT_WELCOME_STATE);
  const fromLoginEntryParam = String(searchParams.get("entry") || "").trim().toLowerCase() === "mobile";
  const [clientReady, setClientReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    try {
      sessionStorage.removeItem(LOGIN_TO_WELCOME_TRANSITION_KEY);
    } catch {
      // ignore sessionStorage errors
    }
    if (fromLoginEntryParam && window.location.search.includes("entry=mobile")) {
      window.history.replaceState(null, "", "/boasvindas");
    }
    const media = window.matchMedia("(max-width: 560px)");
    const frame = window.requestAnimationFrame(() => {
      setClientReady(true);
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [fromLoginEntryParam]);

  const welcomePhase = masterCheckComplete ? "ready" : "loading";
  const reason = String(searchParams.get("reason") || "").trim().toLowerCase();
  const billingReason = reason === "pending_checkout" || reason === "trial_expired" ? reason : null;
  const billingHref = billingReason ? `/pagamento?focus=payment&reason=${encodeURIComponent(billingReason)}` : null;

  useEffect(() => {
    if (hasToken !== true || !billingHref) return;
    router.replace(billingHref);
  }, [billingHref, hasToken, router]);

  useEffect(() => {
    if (billingHref) return;
    if (hasToken !== true) return;
    let mounted = true;

    async function loadWelcomeState() {
      try {
        const [center, modal, operational, modules, vendasBoard] = await Promise.all([
          apiFetch<WhatsAppCenterPayload>("/companies/me/whatsapp-center").catch(() => null),
          apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/status").catch(() => null),
          apiFetch<OperationalStatusPayload>("/companies/me/operational-status?refresh=true").catch(() => null),
          apiFetch<UserModule[]>("/modules/me").catch(() => []),
          apiFetch<VendasBoardPayload>("/vendas/board", { timeoutMs: 12000 }).catch(() => null),
        ]);

        if (!mounted) return;

        const safeModules = Array.isArray(modules) ? modules : [];
        const summary = vendasBoard?.summary || {};
        const leadsCount = Math.max(0, Math.trunc(Number(summary.total || 0)));
        const vendasPending = Math.max(
          0,
          Math.trunc(Number(summary.today || 0)) +
            Math.trunc(Number(summary.overdue || 0)) +
            Math.trunc(Number(summary.scheduled || 0)),
        );
        const conversationsCount = 0;
        const pendingCount = 0;

        setWelcomeState({
          loaded: true,
          whatsappConnected: isWhatsAppConnected(center, modal, operational),
          radarReady: hasModule(safeModules, "webscraping") || leadsCount > 0,
          atendimentoReady: hasModule(safeModules, "atendimento") || conversationsCount > 0 || pendingCount > 0,
          assistantOptional: hasModule(safeModules, "atendimento") || hasModule(safeModules, "vendas"),
          leadsCount,
          conversationsCount,
          pendingCount,
          vendasReady: leadsCount > 0 || vendasPending > 0,
        });
        setMasterCheckComplete(true);
      } catch {
        if (mounted) setMasterCheckComplete(true);
      }
    }

    void loadWelcomeState();

    return () => {
      mounted = false;
    };
  }, [billingHref, hasToken, router]);

  function navigateWithTransition(path: string) {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => router.push(path), PAGE_EXIT_MS);
  }

  const mobilePrimary = mobilePrimaryAction(welcomeState);

  if (hasToken === null || (hasToken === true && !masterCheckComplete && !clientReady)) {
    return (
      <main
        className={styles.page}
        data-welcome-mode="single"
        data-welcome-phase="loading"
        data-welcome-path="loading"
      >
        <section className={styles.shell} aria-live="polite">
          <MobileDashboard state={welcomeState} primaryAction={mobilePrimary} onNavigate={navigateWithTransition} />
        </section>
      </main>
    );
  }

  if (!hasToken) return null;

  return (
    <main
      className={styles.page}
      data-welcome-mode="single"
      data-welcome-phase={welcomePhase}
      data-welcome-path={hasOperationalHistory(welcomeState) ? "operation" : "first-access"}
    >
      <section className={`${styles.shell} ${leaving ? styles.shellLeaving : ""}`} aria-labelledby="welcome-title">
        <MobileDashboard state={welcomeState} primaryAction={mobilePrimary} leaving={leaving} onNavigate={navigateWithTransition} />
      </section>
    </main>
  );
}
