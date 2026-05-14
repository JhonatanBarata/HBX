"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/app/_lib/api";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";
import { normalizeUserModuleKey, type UserModule } from "@/lib/hbx-modules";
import styles from "./page.module.css";

const PAGE_EXIT_MS = 260;
const LOGIN_TO_WELCOME_TRANSITION_KEY = "hbx_login_to_welcome_transition";
const TUTORIAL_COMPLETED_KEY = "hbx:onboarding:tutorial-completed:v1";

type CurrentUser = {
  isSystemMaster?: boolean;
};

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

type InboxPayload = {
  conversations?: unknown[];
  pendingHumanCount?: number | null;
  total?: number | null;
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

type WelcomeStepKind = "loading" | "first-access" | "connect" | "sales";

type WelcomeStep = {
  kind: WelcomeStepKind;
  title: string;
  subtitle: string;
  actionLabel: string;
  path: string;
  loadingText: string;
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

function isSmallViewport() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 640px)").matches;
}

function readTutorialCompleted() {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(TUTORIAL_COMPLETED_KEY) === "true";
  } catch {
    return false;
  }
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

function resolveWelcomeStep(state: WelcomeState, mobileViewport: boolean, tutorialCompleted: boolean): WelcomeStep {
  if (!state.loaded) {
    return {
      kind: "loading",
      title: "Preparando",
      subtitle: "Lendo o estado da sua operação.",
      actionLabel: "Aguarde",
      path: "/boasvindas",
      loadingText: "Preparando sua entrada...",
    };
  }

  if (mobileViewport && !tutorialCompleted && !state.whatsappConnected && !hasOperationalHistory(state)) {
    return {
      kind: "first-access",
      title: "Primeiro acesso",
      subtitle: "Vamos conectar sua tela e preparar os primeiros passos.",
      actionLabel: "Começar tutorial",
      path: "/tutorial?from=boasvindas",
      loadingText: "Montando seu primeiro acesso...",
    };
  }

  if (!state.whatsappConnected) {
    return {
      kind: "connect",
      title: "Próximo passo",
      subtitle: "Vincule seu número para continuar.",
      actionLabel: "Conectar WhatsApp",
      path: mobileViewport ? "/whatsapp?focus=phone&from=boasvindas" : "/whatsapp?focus=qr&from=boasvindas",
      loadingText: "Motor ainda não conectado.",
    };
  }

  if (mobileViewport) {
    return {
      kind: "sales",
      title: "Entrada liberada",
      subtitle: "Abrindo seu módulo de vendas.",
      actionLabel: "Abrir Vendas",
      path: "/vendas",
      loadingText: "Motor conectado. Abrindo Vendas...",
    };
  }

  return {
    kind: "sales",
    title: "Seu centro de operação está pronto.",
    subtitle: "Veja o que já está pronto e siga direto para a próxima ação.",
    actionLabel: "Começar agora",
    path: state.conversationsCount > 0 || state.pendingCount > 0
      ? "/atendimento"
      : state.vendasReady
        ? "/vendas"
        : "/radar-digital",
    loadingText: "Entrada liberada.",
  };
}

export default function BoasVindasClientPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasToken = useRequireAuth();
  const [leaving, setLeaving] = useState(false);
  const [masterCheckComplete, setMasterCheckComplete] = useState(false);
  const [welcomeState, setWelcomeState] = useState<WelcomeState>(DEFAULT_WELCOME_STATE);
  const [mobileViewport, setMobileViewport] = useState(() => isSmallViewport());
  const [tutorialCompleted] = useState(() => readTutorialCompleted());
  const [fromLoginTransition] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem(LOGIN_TO_WELCOME_TRANSITION_KEY) === "mobile-auth";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    try {
      sessionStorage.removeItem(LOGIN_TO_WELCOME_TRANSITION_KEY);
    } catch {
      // ignore sessionStorage errors
    }
    const media = window.matchMedia("(max-width: 640px)");
    const onChange = () => setMobileViewport(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const welcomeStep = resolveWelcomeStep(welcomeState, mobileViewport, tutorialCompleted);
  const welcomePhase = masterCheckComplete ? "ready" : "loading";
  const reason = String(searchParams.get("reason") || "").trim().toLowerCase();
  const billingReason = reason === "pending_checkout" || reason === "trial_expired" ? reason : null;
  const billingHref = billingReason ? `/pagamento?focus=payment&reason=${encodeURIComponent(billingReason)}` : null;
  const statusText = billingReason ? "Pagamento pendente" : "Assinatura confirmada";

  useEffect(() => {
    if (hasToken !== true || !billingHref) return;
    setLeaving(true);
    router.replace(billingHref);
  }, [billingHref, hasToken, router]);

  useEffect(() => {
    if (billingHref) return;
    if (hasToken !== true) return;
    let mounted = true;

    async function loadWelcomeState() {
      try {
        const user = await apiFetch<CurrentUser>("/profile/current-user");
        if (!mounted) return;
        if (user?.isSystemMaster) {
          setLeaving(true);
          router.replace("/master");
          return;
        }

        const [center, modal, operational, modules, vendasBoard, inbox] = await Promise.all([
          apiFetch<WhatsAppCenterPayload>("/companies/me/whatsapp-center").catch(() => null),
          apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/status").catch(() => null),
          apiFetch<OperationalStatusPayload>("/companies/me/operational-status?refresh=true").catch(() => null),
          apiFetch<UserModule[]>("/modules/me").catch(() => []),
          apiFetch<VendasBoardPayload>("/vendas/board", { timeoutMs: 12000 }).catch(() => null),
          apiFetch<InboxPayload>("/inbox/conversations?limit=1", { timeoutMs: 12000 }).catch(() => null),
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
        const conversationsCount = Math.max(
          0,
          Math.trunc(
            Number(inbox?.total) ||
              (Array.isArray(inbox?.conversations) ? inbox.conversations.length : 0),
          ),
        );
        const pendingCount = Math.max(0, Math.trunc(Number(inbox?.pendingHumanCount || 0)));

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

  useEffect(() => {
    if (hasToken !== true || !mobileViewport || !masterCheckComplete || leaving) return undefined;
    if (welcomeStep.kind !== "sales") return undefined;

    const destination = welcomeStep.path;
    const timeout = window.setTimeout(() => {
      setLeaving(true);
      window.setTimeout(() => router.replace(destination), PAGE_EXIT_MS);
    }, 1700);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [hasToken, leaving, masterCheckComplete, mobileViewport, router, welcomeStep.kind, welcomeStep.path]);

  function navigateWithTransition(path: string) {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => router.push(path), PAGE_EXIT_MS);
  }

  function resolveNextStep() {
    if (mobileViewport) {
      return welcomeStep.path;
    }
    if (!welcomeState.whatsappConnected) return "/whatsapp";
    if (welcomeState.conversationsCount > 0 || welcomeState.pendingCount > 0) return "/atendimento";
    if (welcomeState.vendasReady) return "/vendas";
    return "/radar-digital";
  }

  if (hasToken === null || (hasToken === true && !masterCheckComplete)) {
    return (
      <main
        className={`${styles.page} ${fromLoginTransition ? styles.fromLoginTransition : ""}`}
        data-welcome-phase="loading"
        data-welcome-path="loading"
      >
        <section className={styles.shell} aria-live="polite">
          <span className={styles.statusBadge}>{statusText}</span>
          <div className={styles.brandMark}>HBX</div>
          <p className={styles.loadingText}>{welcomeStep.loadingText}</p>
        </section>
      </main>
    );
  }

  if (!hasToken) return null;

  return (
    <main
      className={`${styles.page} ${fromLoginTransition ? styles.fromLoginTransition : ""}`}
      data-welcome-phase={welcomePhase}
      data-welcome-path={welcomeStep.kind}
    >
      <section className={`${styles.shell} ${leaving ? styles.shellLeaving : ""}`} aria-labelledby="welcome-title">
        <span className={styles.statusBadge}>{statusText}</span>
        <div className={styles.brandMark} aria-label="HBX">HBX</div>

        <h1 id="welcome-title" className={styles.title}>Seu centro de operação está pronto.</h1>
        <h1 className={styles.mobileTitle}>{welcomeStep.title}</h1>
        <p className={styles.subtitle}>
          Veja o que já está pronto e siga direto para a próxima ação.
        </p>
        <p className={styles.mobileSubtitle}>{welcomeStep.subtitle}</p>
        <p className={styles.loadingText}>{welcomeStep.loadingText}</p>

        <div className={styles.nextStepPanel}>
          <div className={styles.nextStepHeader}>
            <span>Seu próximo passo</span>
            <strong>{nextStepTitle(welcomeState)}</strong>
          </div>

          <div className={styles.checklist} aria-label="Checklist operacional">
            <ChecklistItem label="WhatsApp conectado" active={welcomeState.whatsappConnected} />
            <ChecklistItem label="Leads disponíveis / Radar pronto" active={welcomeState.radarReady || welcomeState.leadsCount > 0} />
            <ChecklistItem label="Atendimento pronto" active={welcomeState.atendimentoReady} />
            <ChecklistItem label="Assistente avançado opcional" active={welcomeState.assistantOptional} optional />
          </div>
        </div>

        <div className={styles.actions}>
          {!(mobileViewport && welcomeStep.kind === "sales") ? (
            <button type="button" className={styles.primaryAction} onClick={() => navigateWithTransition(resolveNextStep())} disabled={leaving}>
              {mobileViewport ? welcomeStep.actionLabel : "Começar agora"}
            </button>
          ) : null}
          {!mobileViewport ? (
            <button type="button" className={styles.secondaryAction} onClick={() => navigateWithTransition("/tutorial")} disabled={leaving}>
              Configuração avançada
            </button>
          ) : null}
        </div>

        <p className={styles.footerHint}>{welcomeState.loaded ? "HBX adaptou esta entrada ao estado da sua operação." : "Carregando leitura da operação..."}</p>
      </section>
    </main>
  );
}

function nextStepTitle(state: WelcomeState, mobile = false) {
  if (!state.whatsappConnected) return "Conectar o WhatsApp";
  if (mobile && (state.vendasReady || state.leadsCount > 0 || state.pendingCount > 0 || state.conversationsCount > 0)) return "Abrir seus cards de venda";
  if (mobile) return "Buscar cards no Radar Digital";
  if (state.conversationsCount > 0 || state.pendingCount > 0) return "Responder atendimento";
  if (state.vendasReady) return "Trabalhar leads em Vendas";
  return "Buscar leads no Radar Digital";
}

function ChecklistItem({ label, active, optional = false }: { label: string; active: boolean; optional?: boolean }) {
  return (
    <div className={styles.checkItem} data-active={active ? "true" : "false"} data-optional={optional ? "true" : "false"}>
      <span aria-hidden="true">{active ? "OK" : optional ? "OP" : "--"}</span>
      <strong>{label}</strong>
    </div>
  );
}
