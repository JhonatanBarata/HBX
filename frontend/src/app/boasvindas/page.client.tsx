"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/app/_lib/api";
import { mobileDestinationFromVendasBoard } from "@/app/_lib/mobileOperationalDestination";
import { toMobileRoute } from "@/app/_lib/mobileRoutes";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";
import { normalizeUserModuleKey, type UserModule } from "@/lib/hbx-modules";
import styles from "./page.module.css";

const PAGE_EXIT_MS = 260;
const LOGIN_TO_WELCOME_TRANSITION_KEY = "hbx_login_to_welcome_transition";
const TUTORIAL_COMPLETED_KEY = "hbx:onboarding:tutorial-completed:mobile:v1";

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
  if (!state.loaded || !hasOperationalHistory(state)) return "";
  return "Operação mobile";
}

function mobilePrimaryAction(state: WelcomeState, tutorialCompleted: boolean) {
  if (state.loaded && !tutorialCompleted && !hasOperationalHistory(state)) {
    return { label: "Abrir tutorial", path: "/tutorial" };
  }
  if (state.loaded && state.leadsCount <= 0) {
    return { label: "Buscar primeiros cards", path: "/vendas?radar=1" };
  }
  return { label: "Abrir Vendas", path: "/vendas" };
}

function desktopRouteFromMobileDestination(path: string) {
  return path
    .replace(/^\/mobile\/boas-vindas/, "/boasvindas")
    .replace(/^\/mobile\/radar-digital/, "/vendas?radar=1")
    .replace(/^\/mobile\/vendas/, "/vendas");
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
  const disabled = leaving || !onNavigate;
  const status = mobileOperationStatus(state);
  const subtitle = "Busque cards no Radar, chame pelo WhatsApp e organize retornos.";
  const desktopCards = [
    {
      label: "Radar",
      title: state.leadsCount > 0 ? "Fonte ativa" : "Buscar primeiros cards",
      text: "Escolha cidade e segmento para montar sua fila comercial.",
      path: "/vendas?radar=1",
    },
    {
      label: "Vendas",
      title: state.leadsCount > 0 ? `${state.leadsCount} cards` : "Fila limpa",
      text: state.leadsCount > 0
        ? "Abra os cards, chame pelo WhatsApp e marque retornos."
        : "Os contatos aprovados pelo Radar aparecem aqui.",
      path: "/vendas",
    },
    {
      label: "Primeiro acesso",
      title: "Tutorial mobile",
      text: "Veja o básico de Conta, Radar e Vendas em poucos passos.",
      path: "/tutorial",
    },
  ];

  return (
    <div className={`${styles.mobileDashboard} ${styles.mobileWelcomeExperience} hbx-mobile-page`} aria-label="Boas-vindas HBX">
      <span className={styles.statusBadge}>{status}</span>
      <div className={styles.brandMark} aria-hidden="true">HBX</div>
      <h1 id="welcome-title" className={styles.mobileTitle}>Sua operação começa aqui</h1>
      <p className={styles.mobileSubtitle}>{subtitle}</p>
      <p className={styles.loadingText}>
        {state.loaded ? "Escolha por onde continuar." : "Preparando seu acesso."}
      </p>

      {state.loaded ? (
        <nav className={styles.actions} aria-label="Começar">
          <button
            type="button"
            className={styles.primaryAction}
            onClick={() => onNavigate?.(primaryAction.path)}
            disabled={disabled}
          >
            {primaryAction.label}
          </button>
        </nav>
      ) : null}

      <section className={styles.desktopWelcomeBoard} aria-label="Resumo da operação HBX">
        <div className={styles.desktopWelcomeHero}>
          <span>Próximo passo</span>
          <strong>{state.loaded ? primaryAction.label : "Preparando sua operação"}</strong>
          <p>{subtitle}</p>
          {state.loaded ? (
            <button
              type="button"
              className={styles.desktopWelcomePrimary}
              onClick={() => onNavigate?.(primaryAction.path)}
              disabled={disabled}
            >
              {primaryAction.label}
            </button>
          ) : null}
        </div>
        <div className={styles.desktopWelcomeMetrics}>
          <span>
            <small>Cards</small>
            <b>{state.loaded ? state.leadsCount : "..."}</b>
          </span>
          <span>
            <small>WhatsApp</small>
            <b>{state.whatsappConnected ? "Conectado" : "Opcional"}</b>
          </span>
          <span>
            <small>Status</small>
            <b>{status}</b>
          </span>
        </div>
        <div className={styles.desktopWelcomeCards}>
          {desktopCards.map((card) => (
            <button
              type="button"
              key={card.label}
              onClick={() => onNavigate?.(card.path)}
              disabled={disabled || !state.loaded}
            >
              <small>{card.label}</small>
              <strong>{card.title}</strong>
              <span>{card.text}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function BoasVindasClientPage({ mobileRoute = false }: { mobileRoute?: boolean } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasToken = useRequireAuth();
  const [leaving, setLeaving] = useState(false);
  const [masterCheckComplete, setMasterCheckComplete] = useState(false);
  const [welcomeState, setWelcomeState] = useState<WelcomeState>(DEFAULT_WELCOME_STATE);
  const [tutorialCompleted] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(TUTORIAL_COMPLETED_KEY) === "true";
    } catch {
      return false;
    }
  });
  const fromLoginEntryParam = String(searchParams.get("entry") || "").trim().toLowerCase() === "mobile";
  const [fromLoginEntry] = useState(() => (
    fromLoginEntryParam ||
    (typeof window !== "undefined" && window.sessionStorage.getItem(LOGIN_TO_WELCOME_TRANSITION_KEY) === "mobile-auth")
  ));
  const [clientReady, setClientReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    try {
      sessionStorage.removeItem(LOGIN_TO_WELCOME_TRANSITION_KEY);
    } catch {
      // ignore storage errors
    }
    if (fromLoginEntryParam && window.location.search.includes("entry=mobile")) {
      window.history.replaceState(null, "", mobileRoute ? "/mobile/boas-vindas" : "/boasvindas");
    }
    const frame = window.requestAnimationFrame(() => {
      setClientReady(true);
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [fromLoginEntryParam, mobileRoute]);

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
        if (!fromLoginEntry) {
          const destination = mobileDestinationFromVendasBoard(vendasBoard);
          router.replace(mobileRoute ? destination : desktopRouteFromMobileDestination(destination));
        }
      } catch {
        if (mounted) {
          setMasterCheckComplete(true);
          if (!fromLoginEntry) {
            router.replace(mobileRoute ? toMobileRoute("/vendas?radar=1") : "/vendas?radar=1");
          }
        }
      }
    }

    void loadWelcomeState();

    return () => {
      mounted = false;
    };
  }, [billingHref, fromLoginEntry, hasToken, mobileRoute, router]);

  function navigateWithTransition(path: string) {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => router.push(mobileRoute ? toMobileRoute(path) : path), PAGE_EXIT_MS);
  }

  const mobilePrimary = mobilePrimaryAction(welcomeState, tutorialCompleted);

  if (hasToken === null || (hasToken === true && !masterCheckComplete && !clientReady)) {
    return (
      <main
        className={`${styles.page} ${styles.fromLoginTransition}`}
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
      className={`${styles.page} ${styles.fromLoginTransition}`}
      data-welcome-mode="single"
      data-welcome-phase={welcomePhase}
      data-welcome-path={hasOperationalHistory(welcomeState) ? "operation" : "first-access"}
    >
      <section className={`${styles.shell} ${leaving ? styles.shellLeaving : ""}`} aria-label="Boas-vindas HBX">
        <MobileDashboard state={welcomeState} primaryAction={mobilePrimary} leaving={leaving} onNavigate={navigateWithTransition} />
      </section>
    </main>
  );
}
