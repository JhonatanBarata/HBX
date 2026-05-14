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
    return state.vendasReady || state.leadsCount > 0 ? "/vendas" : "/radar-digital";
  }
  if (state.conversationsCount > 0 || state.pendingCount > 0) return "/atendimento";
  if (state.vendasReady || state.leadsCount > 0) return "/vendas";
  return "/radar-digital";
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
  if (!state.loaded) return "Primeiro acesso";
  if (!state.whatsappConnected) return "Falta conectar WhatsApp";
  return "Operação pronta";
}

function mobileHeroSubtitle(state: WelcomeState) {
  if (!state.loaded) return "Carregando seus módulos e próximos passos.";
  if (!state.whatsappConnected) return "Conecte o WhatsApp para liberar o fluxo completo.";
  if (state.vendasReady) return "Seus leads já estão prontos para atendimento.";
  if (state.pendingCount > 0) return "Existem conversas aguardando resposta.";
  if (state.radarReady) return "Use o Radar para alimentar seus cards de venda.";
  return "Comece pelo Radar Digital para buscar oportunidades.";
}

function mobilePrimaryAction(state: WelcomeState) {
  if (!state.loaded) return { label: "Carregando", path: "/boasvindas" };
  if (!state.whatsappConnected) return { label: "Conectar WhatsApp", path: "/whatsapp" };
  if (state.vendasReady) return { label: "Abrir Vendas", path: "/vendas" };
  if (state.pendingCount > 0) return { label: "Abrir Atendimento", path: "/atendimento" };
  return { label: "Buscar leads no Radar", path: "/radar-digital" };
}

function mobileStatusLabel(ready: boolean, loaded: boolean) {
  if (!loaded) return "Carregando";
  return ready ? "Pronto" : "Configurar";
}

function mobileNumberLabel(value: number, singular: string, plural: string) {
  if (value <= 0) return null;
  return `${value} ${value === 1 ? singular : plural}`;
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
  const welcomePhase = masterCheckComplete ? "ready" : "loading";
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
    if (hasToken !== true || !mobileViewport || !masterCheckComplete || leaving || !fromLoginTransition) return undefined;
    if (welcomeStep.kind !== "sales") return undefined;

    const destination = welcomeStep.path;
    const timeout = window.setTimeout(() => {
      setLeaving(true);
      window.setTimeout(() => router.replace(destination), PAGE_EXIT_MS);
    }, 1700);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [fromLoginTransition, hasToken, leaving, masterCheckComplete, mobileViewport, router, welcomeStep.kind, welcomeStep.path]);

  function navigateWithTransition(path: string) {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => router.push(path), PAGE_EXIT_MS);
  }

  function resolveNextStep() {
    return welcomeStep.path || resolveOperationalEntryPath(welcomeState, mobileViewport);
  }

  const mobilePrimary = mobilePrimaryAction(welcomeState);
  const mobileCards = [
    {
      key: "whatsapp",
      title: "WhatsApp",
      state: !welcomeState.loaded
        ? "Carregando"
        : welcomeState.whatsappConnected
          ? "Pronto"
          : "Configurar",
      value: null,
      ready: welcomeState.whatsappConnected,
    },
    {
      key: "vendas",
      title: "Vendas",
      state: !welcomeState.loaded ? "Carregando" : welcomeState.vendasReady ? "Pronto" : "Pendente",
      value: mobileNumberLabel(welcomeState.leadsCount, "lead", "leads"),
      ready: welcomeState.vendasReady,
    },
    {
      key: "radar",
      title: "Radar",
      state: mobileStatusLabel(welcomeState.radarReady, welcomeState.loaded),
      value: mobileNumberLabel(welcomeState.leadsCount, "card", "cards"),
      ready: welcomeState.radarReady,
    },
    {
      key: "atendimento",
      title: "Atendimento",
      state: !welcomeState.loaded ? "Carregando" : welcomeState.atendimentoReady ? "Pronto" : "Pendente",
      value: welcomeState.pendingCount > 0
        ? mobileNumberLabel(welcomeState.pendingCount, "pendência", "pendências")
        : mobileNumberLabel(welcomeState.conversationsCount, "conversa", "conversas"),
      ready: welcomeState.atendimentoReady,
    },
  ];

  const entryDestinationLabel = welcomeStep.path.includes("radar")
    ? "Radar Digital"
    : welcomeStep.path.includes("vendas")
      ? "Vendas"
      : welcomeStep.path.includes("atendimento")
        ? "Atendimento"
        : "Operação";

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
            <span className={styles.entryEyebrow}>Acesso validado</span>
            <h1>Entrando no HBX</h1>
            <p>{masterCheckComplete ? `Abrindo ${entryDestinationLabel}.` : "Preparando sua operação."}</p>
          </div>

          <div className={styles.entrySteps} aria-hidden="true">
            <span data-active="true">Sessão</span>
            <span data-active={masterCheckComplete ? "true" : "false"}>{entryDestinationLabel}</span>
            <span data-active={leaving ? "true" : "false"}>Cards</span>
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
          <div className={`${styles.mobileDashboard} hbx-mobile-page`} aria-label="Painel inicial mobile">
            <header className={`${styles.mobileHeader} hbx-mobile-header`}>
              <strong>HBX</strong>
              <span>{mobileOperationStatus(welcomeState)}</span>
            </header>

            <section className={`${styles.mobileHero} hbx-mobile-hero`}>
              <span>Olá</span>
              <h1>Sua operação hoje</h1>
              <p>{mobileHeroSubtitle(welcomeState)}</p>
            </section>

            <section className={`${styles.mobileStatusGrid} hbx-mobile-grid`} aria-label="Status da operação">
              {mobileCards.map((card) => (
                <article key={card.key} className={`${styles.mobileStatusCard} hbx-mobile-card`} data-ready={card.ready ? "true" : "false"}>
                  <span>{card.title}</span>
                  <strong>{card.state}</strong>
                  {card.value ? <small>{card.value}</small> : null}
                </article>
              ))}
            </section>

            <button type="button" className={`${styles.mobilePrimaryAction} hbx-mobile-primary-button`} disabled>
              {mobilePrimary.label}
            </button>
          </div>

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
        <div className={`${styles.mobileDashboard} hbx-mobile-page`} aria-label="Painel inicial mobile">
          <header className={`${styles.mobileHeader} hbx-mobile-header`}>
            <strong>HBX</strong>
            <span>{mobileOperationStatus(welcomeState)}</span>
          </header>

          <section className={`${styles.mobileHero} hbx-mobile-hero`}>
            <span>Olá</span>
            <h1>Sua operação hoje</h1>
            <p>{mobileHeroSubtitle(welcomeState)}</p>
          </section>

          <section className={`${styles.mobileStatusGrid} hbx-mobile-grid`} aria-label="Status da operação">
            {mobileCards.map((card) => (
              <article key={card.key} className={`${styles.mobileStatusCard} hbx-mobile-card`} data-ready={card.ready ? "true" : "false"}>
                <span>{card.title}</span>
                <strong>{card.state}</strong>
                {card.value ? <small>{card.value}</small> : null}
              </article>
            ))}
          </section>

          <button
            type="button"
            className={`${styles.mobilePrimaryAction} hbx-mobile-primary-button`}
            onClick={() => navigateWithTransition(mobilePrimary.path)}
            disabled={leaving || !welcomeState.loaded}
          >
            {mobilePrimary.label}
          </button>

          <nav className={styles.mobileSecondaryActions} aria-label="Atalhos">
            <button type="button" className="hbx-mobile-secondary-button" onClick={() => navigateWithTransition("/radar-digital")} disabled={leaving}>Radar Digital</button>
            <button type="button" className="hbx-mobile-secondary-button" onClick={() => navigateWithTransition("/vendas")} disabled={leaving}>Vendas</button>
            <button type="button" className="hbx-mobile-secondary-button" onClick={() => navigateWithTransition("/atendimento")} disabled={leaving}>Atendimento</button>
            <button type="button" className="hbx-mobile-secondary-button" onClick={() => navigateWithTransition("/tutorial")} disabled={leaving}>Tutorial</button>
          </nav>
        </div>

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
