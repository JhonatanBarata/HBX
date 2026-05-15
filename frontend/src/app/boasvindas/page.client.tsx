"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/app/_lib/api";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";
import HbxMobileDock from "@/components/mobile/HbxMobileDock";
import { normalizeUserModuleKey, type UserModule } from "@/lib/hbx-modules";
import styles from "./page.module.css";

const PAGE_EXIT_MS = 260;
const MOBILE_ENTRY_MIN_VISIBLE_MS = 2100;
const MOBILE_ENTRY_FINAL_VISIBLE_MS = 900;
const LOGIN_TO_WELCOME_TRANSITION_KEY = "hbx_login_to_welcome_transition";
const TUTORIAL_COMPLETED_KEY = "hbx:onboarding:tutorial-completed:v1";
const MOBILE_ENTRY_LOADING_PHRASES = [
  "Validando sessão",
  "Analisando sua operação",
  "Conectando Radar Digital",
  "Sincronizando Vendas",
  "Verificando Atendimento",
  "Preparando cards",
  "Abrindo sua operação",
];

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
  return window.matchMedia("(max-width: 560px)").matches;
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

function resolveOperationalEntryPath(state: WelcomeState, mobileViewport: boolean) {
  if (mobileViewport) {
    if (!state.vendasReady && state.leadsCount <= 0 && (state.conversationsCount > 0 || state.pendingCount > 0)) {
      return "/atendimento";
    }
    return state.vendasReady || state.leadsCount > 0 ? "/vendas" : "/radar-digital";
  }
  if (state.conversationsCount > 0 || state.pendingCount > 0) return "/atendimento";
  if (state.vendasReady || state.leadsCount > 0) return "/vendas";
  return "/radar-digital";
}

function resolveEntryReadySubtitle(state: WelcomeState) {
  if (state.leadsCount > 0) return `${state.leadsCount} leads prontos para trabalhar.`;
  if (state.radarReady) return "Radar Digital pronto para buscar oportunidades.";
  if (state.atendimentoReady) return "Atendimento sincronizado.";
  return "Radar Digital pronto para começar sua busca.";
}

function buildEntrySteps(state: WelcomeState) {
  return [
    { key: "session", label: "Sessão", active: true },
    { key: "radar", label: "Radar Digital", active: state.radarReady || state.leadsCount > 0 },
    { key: "sales", label: "Vendas", active: state.vendasReady || state.leadsCount > 0 },
    { key: "support", label: "Atendimento", active: state.atendimentoReady || state.conversationsCount > 0 || state.pendingCount > 0 },
    { key: "cards", label: "Cards", active: state.leadsCount > 0 },
  ];
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
      kind: "sales",
      title: "Entrada liberada",
      subtitle: "Vamos começar pelos cards e oportunidades.",
      actionLabel: "Começar agora",
      path: "/radar-digital",
      loadingText: "Abrindo sua operação...",
    };
  }

  if (mobileViewport) {
    const path = resolveOperationalEntryPath(state, mobileViewport);
    return {
      kind: "sales",
      title: state.vendasReady || state.leadsCount > 0 ? "Entrada liberada" : "Buscar oportunidades",
      subtitle: state.vendasReady || state.leadsCount > 0
        ? "Abrindo seus cards de venda."
        : "Abrindo o Radar Digital para gerar cards.",
      actionLabel: state.vendasReady || state.leadsCount > 0 ? "Abrir Vendas" : "Abrir Radar",
      path,
      loadingText: state.vendasReady || state.leadsCount > 0
        ? "Abrindo Vendas..."
        : "Abrindo Radar Digital...",
    };
  }

  return {
    kind: "sales",
    title: "Seu centro de operação está pronto.",
    subtitle: "Veja o que já está pronto e siga direto para a próxima ação.",
    actionLabel: "Começar agora",
    path: resolveOperationalEntryPath(state, mobileViewport),
    loadingText: "Entrada liberada.",
  };
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
  const [mobileViewport, setMobileViewport] = useState(() => isSmallViewport());
  const [tutorialCompleted] = useState(() => readTutorialCompleted());
  const fromLoginEntryParam = String(searchParams.get("entry") || "").trim().toLowerCase() === "mobile";
  const [clientReady, setClientReady] = useState(false);
  const [fromLoginTransition, setFromLoginTransition] = useState(fromLoginEntryParam);
  const [entryStartedAt] = useState(() => Date.now());
  const [entryPhraseIndex, setEntryPhraseIndex] = useState(0);
  const [entryFinalVisible, setEntryFinalVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let cameFromLogin = fromLoginEntryParam;
    try {
      cameFromLogin = cameFromLogin || sessionStorage.getItem(LOGIN_TO_WELCOME_TRANSITION_KEY) === "mobile-auth";
      sessionStorage.removeItem(LOGIN_TO_WELCOME_TRANSITION_KEY);
    } catch {
      // ignore sessionStorage errors
    }
    if (fromLoginEntryParam && window.location.search.includes("entry=mobile")) {
      window.history.replaceState(null, "", "/boasvindas");
    }
    const media = window.matchMedia("(max-width: 560px)");
    const onChange = () => setMobileViewport(media.matches);
    const frame = window.requestAnimationFrame(() => {
      setClientReady(true);
      setFromLoginTransition(cameFromLogin);
      setMobileViewport(media.matches);
    });
    media.addEventListener("change", onChange);
    return () => {
      window.cancelAnimationFrame(frame);
      media.removeEventListener("change", onChange);
    };
  }, [fromLoginEntryParam]);

  const welcomeStep = resolveWelcomeStep(welcomeState, mobileViewport, tutorialCompleted);
  const welcomePhase =
    fromLoginTransition && mobileViewport
      ? entryFinalVisible ? "ready" : "loading"
      : masterCheckComplete ? "ready" : "loading";
  const reason = String(searchParams.get("reason") || "").trim().toLowerCase();
  const billingReason = reason === "pending_checkout" || reason === "trial_expired" ? reason : null;
  const billingHref = billingReason ? `/pagamento?focus=payment&reason=${encodeURIComponent(billingReason)}` : null;
  const statusText = billingReason ? "Pagamento pendente" : "Assinatura confirmada";

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
        const user = await apiFetch<CurrentUser>("/profile/current-user");
        if (!mounted) return;
        if (user?.isSystemMaster) {
          setLeaving(true);
          router.replace("/master");
          return;
        }

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

  useEffect(() => {
    if (hasToken !== true || !mobileViewport || !masterCheckComplete || leaving || !fromLoginTransition) return undefined;
    if (welcomeStep.kind !== "sales") return undefined;

    const destination = welcomeStep.path;
    const elapsed = Date.now() - entryStartedAt;
    const finalDelay = Math.max(0, MOBILE_ENTRY_MIN_VISIBLE_MS - elapsed);

    const finalTimer = window.setTimeout(() => {
      setEntryFinalVisible(true);
    }, finalDelay);

    const redirectTimer = window.setTimeout(() => {
      setLeaving(true);
      window.setTimeout(() => router.replace(destination), PAGE_EXIT_MS);
    }, finalDelay + MOBILE_ENTRY_FINAL_VISIBLE_MS);

    return () => {
      window.clearTimeout(finalTimer);
      window.clearTimeout(redirectTimer);
    };
  }, [entryStartedAt, fromLoginTransition, hasToken, leaving, masterCheckComplete, mobileViewport, router, welcomeStep.kind, welcomeStep.path]);

  function navigateWithTransition(path: string) {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => router.push(path), PAGE_EXIT_MS);
  }

  function resolveNextStep() {
    return welcomeStep.path || resolveOperationalEntryPath(welcomeState, mobileViewport);
  }

  const mobilePrimary = mobilePrimaryAction(welcomeState);

  const entryDestinationLabel = welcomeStep.path.includes("radar")
    ? "Radar Digital"
    : welcomeStep.path.includes("vendas")
      ? "Vendas"
      : welcomeStep.path.includes("atendimento")
        ? "Atendimento"
        : "Operação";
  const entrySteps = useMemo(() => buildEntrySteps(welcomeState), [welcomeState]);
  const entryLoadingPhrase = MOBILE_ENTRY_LOADING_PHRASES[entryPhraseIndex % MOBILE_ENTRY_LOADING_PHRASES.length];
  const entryReadySubtitle = resolveEntryReadySubtitle(welcomeState);

  useEffect(() => {
    if (!clientReady || !mobileViewport || !fromLoginTransition || entryFinalVisible || leaving) return undefined;
    const interval = window.setInterval(() => {
      setEntryPhraseIndex((current) => current + 1);
    }, 520);
    return () => window.clearInterval(interval);
  }, [clientReady, entryFinalVisible, fromLoginTransition, leaving, mobileViewport]);

  if (clientReady && mobileViewport && fromLoginTransition && hasToken !== false && !billingHref) {
    return (
      <main
        className={styles.entryPage}
        data-entry-phase={welcomePhase}
        data-entry-leaving={leaving ? "true" : "false"}
      >
        <section className={styles.entryStage} role="status" aria-live="polite" aria-atomic="true">
          <div className={styles.entryAtmosphere} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>

          <div className={styles.entryCoreWrap} aria-hidden="true">
            <div className={styles.entryOrbit} />
            <div className={styles.entryCore}>
              <span>HBX</span>
            </div>
          </div>

          <div className={styles.entryCopy}>
            <span className={styles.entryEyebrow}>{entryFinalVisible ? "Leitura concluída" : "Acesso validado"}</span>
            <h1>{entryFinalVisible ? "Operação pronta" : "Entrando no HBX"}</h1>
            <p>{entryFinalVisible ? entryReadySubtitle : entryLoadingPhrase}</p>
          </div>

          <div className={styles.entrySteps} aria-hidden="true">
            {entryFinalVisible ? (
              entrySteps.map((step) => (
                <span key={step.key} data-active={step.active ? "true" : "false"}>{step.label}</span>
              ))
            ) : (
              <>
                <span data-active="true">Sessão</span>
                <span data-active={entryPhraseIndex >= 2 || masterCheckComplete ? "true" : "false"}>Radar Digital</span>
                <span data-active={entryPhraseIndex >= 3 || masterCheckComplete ? "true" : "false"}>Vendas</span>
                <span data-active={entryPhraseIndex >= 4 || masterCheckComplete ? "true" : "false"}>Atendimento</span>
                <span data-active={entryPhraseIndex >= 5 || masterCheckComplete ? "true" : "false"}>Cards</span>
              </>
            )}
          </div>

          <div className={styles.entryFacts} aria-label="Resumo da operação">
            <span>
              Leads
              <strong>{welcomeState.loaded ? welcomeState.leadsCount : "--"}</strong>
            </span>
            <span>
              Pendências
              <strong>{welcomeState.loaded ? welcomeState.pendingCount : "--"}</strong>
            </span>
            <span>
              Destino
              <strong>{entryDestinationLabel}</strong>
            </span>
          </div>

          <div className={styles.entryProgress} aria-hidden="true">
            <span />
          </div>
        </section>
      </main>
    );
  }

  if (hasToken === null || (hasToken === true && !masterCheckComplete)) {
    return (
      <main
        className={`${styles.page} ${fromLoginTransition ? styles.fromLoginTransition : ""}`}
        data-welcome-phase="loading"
        data-welcome-path="loading"
      >
        <section className={styles.shell} aria-live="polite">
          <MobileDashboard state={welcomeState} primaryAction={mobilePrimary} />

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
        <MobileDashboard state={welcomeState} primaryAction={mobilePrimary} leaving={leaving} onNavigate={navigateWithTransition} />

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
            <strong>{nextStepTitle(welcomeState, mobileViewport)}</strong>
          </div>

          <div className={styles.checklist} aria-label="Checklist operacional">
            <ChecklistItem label="Acesso liberado" active />
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
