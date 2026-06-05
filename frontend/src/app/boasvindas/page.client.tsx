"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { apiFetch, clearApiCache } from "@/app/_lib/api";
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

type CurrentUserPayload = {
  id?: number | null;
  username?: string | null;
  email?: string | null;
  name?: string | null;
  mustChangePassword?: boolean | null;
};

type WelcomeState = {
  loaded: boolean;
  userName: string;
  userEmail: string;
  mustChangePassword: boolean;
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
  userName: "",
  userEmail: "",
  mustChangePassword: false,
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
  if (state.mustChangePassword) return "Primeiro acesso";
  if (!state.loaded || !hasOperationalHistory(state)) return "";
  return "Operação mobile";
}

function mobilePrimaryAction(state: WelcomeState, tutorialCompleted: boolean) {
  if (state.mustChangePassword) {
    return { label: "Troque a senha para continuar", path: "/boasvindas" };
  }
  if (state.loaded && !tutorialCompleted && !hasOperationalHistory(state)) {
    return { label: "Abrir tutorial", path: "/tutorial" };
  }
  if (state.loaded && state.leadsCount <= 0) {
    return { label: "Buscar primeiros cards", path: "/radar-digital" };
  }
  return { label: "Abrir Vendas", path: "/vendas" };
}

function PasswordChangePanel({
  userName,
  userEmail,
  disabled = false,
  onChanged,
}: {
  userName: string;
  userEmail: string;
  disabled?: boolean;
  onChanged: () => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = newPassword.trim();
    setMessage("");
    setError("");

    if (next.length < 8) {
      setError("A nova senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (next !== confirmPassword.trim()) {
      setError("A confirmação precisa ser igual à nova senha.");
      return;
    }

    setSaving(true);
    try {
      await apiFetch("/profile/password", {
        method: "PATCH",
        body: JSON.stringify({
          newPassword: next,
        }),
      });
      clearApiCache("/profile/current-user");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Senha alterada. Seu acesso está pronto.");
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível alterar a senha.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.passwordChangePanel} onSubmit={submitPassword} aria-label="Trocar senha do primeiro acesso">
      <div className={styles.passwordChangeHeader}>
        <span>{"Senha temporária"}</span>
        <strong>{userName || "Seu acesso HBX"}</strong>
        <small>{userEmail}</small>
      </div>
      <label>
        <span>{"Nova senha"}</span>
        <input
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          autoComplete="new-password"
          disabled={disabled || saving}
          minLength={8}
          required
        />
      </label>
      <label>
        <span>{"Confirmar senha"}</span>
        <input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          autoComplete="new-password"
          disabled={disabled || saving}
          minLength={8}
          required
        />
      </label>
      {error ? <p className={styles.passwordChangeError}>{error}</p> : null}
      {message ? <p className={styles.passwordChangeSuccess}>{message}</p> : null}
      <button type="submit" className={styles.primaryAction} disabled={disabled || saving}>
        {saving ? "Alterando..." : "Alterar senha e continuar"}
      </button>
    </form>
  );
}

function MobileDashboard({
  state,
  primaryAction,
  leaving = false,
  onNavigate,
  onPasswordChanged,
}: {
  state: WelcomeState;
  primaryAction: { label: string; path: string };
  leaving?: boolean;
  onNavigate?: (path: string) => void;
  onPasswordChanged?: () => void;
}) {
  const disabled = leaving || !onNavigate;
  const status = mobileOperationStatus(state) || "HBX pronto";
  const subtitle = state.mustChangePassword
    ? "Troque a senha temporária antes de abrir sua rotina comercial."
    : "Busque cards no Radar, chame pelo WhatsApp e organize retornos.";
  const loadingLabel = state.loaded
    ? (state.mustChangePassword ? "Primeiro login protegido." : "Escolha por onde continuar.")
    : "Preparando seu acesso.";
  const desktopCards = [
    {
      label: "Radar",
      title: "Buscar cards",
      text: "Escolha cidade e segmento para montar sua fila comercial.",
      path: "/vendas",
    },
    {
      label: "Vendas",
      title: state.leadsCount > 0 ? `${state.leadsCount} cards` : "Abrir Vendas",
      text: state.leadsCount > 0
        ? "Abra os cards, chame pelo WhatsApp e marque retornos."
        : "Sua mesa comercial fica aqui depois da primeira busca.",
      path: "/vendas",
    },
    {
      label: "WhatsApp",
      title: state.whatsappConnected ? "Conectado" : "Conectar depois",
      text: state.whatsappConnected ? "Canal pronto para acionar oportunidades." : "Você pode buscar cards antes de conectar o canal.",
      path: state.whatsappConnected ? "/vendas" : "/atendimento/automacao?tab=connection",
    },
  ];
  const desktopSteps = [
    {
      key: "radar",
      marker: "01",
      title: "Buscar cards",
      active: state.loaded && (state.radarReady || state.leadsCount > 0),
      optional: false,
    },
    {
      key: "vendas",
      marker: "02",
      title: "Organizar retornos",
      active: state.loaded && state.vendasReady,
      optional: false,
    },
    {
      key: "whatsapp",
      marker: "03",
      title: state.whatsappConnected ? "Canal conectado" : "Conectar depois",
      active: state.loaded && state.whatsappConnected,
      optional: true,
    },
    {
      key: "billing",
      marker: "04",
      title: "Cobrança depois",
      active: false,
      optional: true,
    },
  ];

  return (
    <div className={`${styles.mobileDashboard} ${styles.mobileWelcomeExperience} hbx-mobile-page`} aria-label="Boas-vindas HBX">
      <span className={styles.statusBadge}>{status}</span>
      <div className={styles.brandMark} aria-hidden="true">{"HBX"}</div>
      <h1 id="welcome-title" className={styles.mobileTitle}>{"Sua operação começa aqui"}</h1>
      <p className={styles.mobileSubtitle}>{subtitle}</p>
      <p className={styles.loadingText}>{loadingLabel}</p>

      {state.loaded && state.mustChangePassword ? (
        <PasswordChangePanel
          userName={state.userName}
          userEmail={state.userEmail}
          disabled={disabled}
          onChanged={() => onPasswordChanged?.()}
        />
      ) : null}

      {state.loaded && !state.mustChangePassword ? (
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
          <span>{"HBX pronto"}</span>
          <strong>{"Comece pelo Radar."}</strong>
          <p>{"Sem checkout agora. Primeiro entre, busque oportunidades e organize sua operação comercial."}</p>
          {state.loaded && !state.mustChangePassword ? (
            <button
              type="button"
              className={styles.desktopWelcomePrimary}
              onClick={() => onNavigate?.("/vendas")}
              disabled={disabled}
            >
              {"Buscar cards agora"}
            </button>
          ) : null}
        </div>
        <div className={styles.desktopWelcomeMetrics}>
          <span>
            <small>{"Cards"}</small>
            <b>{state.loaded ? state.leadsCount : "..."}</b>
          </span>
          <span>
            <small>{"WhatsApp"}</small>
            <b>{state.whatsappConnected ? "Conectado" : "Opcional"}</b>
          </span>
          <span>
            <small>{"Cobrança"}</small>
            <b>{"Depois"}</b>
          </span>
        </div>
        <section className={styles.nextStepPanel} aria-label="Rota recomendada HBX">
          <div className={styles.nextStepHeader}>
            <div>
              <span>{"Rota HBX"}</span>
              <strong>{"Do login ao primeiro contato"}</strong>
            </div>
          </div>
          <div className={styles.checklist}>
            {desktopSteps.map((step) => (
              <div
                key={step.key}
                className={styles.checkItem}
                data-active={step.active ? "true" : "false"}
                data-optional={step.optional ? "true" : "false"}
              >
                <span>{step.marker}</span>
                <strong>{step.title}</strong>
              </div>
            ))}
          </div>
        </section>
        <div className={styles.desktopWelcomeCards}>
          {desktopCards.map((card) => (
            <button
              type="button"
              key={card.label}
              onClick={() => onNavigate?.(card.path)}
              disabled={disabled || !state.loaded || state.mustChangePassword}
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
        const [center, modal, operational, modules, vendasBoard, currentUser] = await Promise.all([
          apiFetch<WhatsAppCenterPayload>("/companies/me/whatsapp-center").catch(() => null),
          apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/status").catch(() => null),
          apiFetch<OperationalStatusPayload>("/companies/me/operational-status?refresh=true").catch(() => null),
          apiFetch<UserModule[]>("/modules/me").catch(() => []),
          apiFetch<VendasBoardPayload>("/vendas/board", { timeoutMs: 12000 }).catch(() => null),
          apiFetch<CurrentUserPayload>("/profile/current-user").catch(() => null),
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
          userName: String(currentUser?.name || currentUser?.username || currentUser?.email || "").trim(),
          userEmail: String(currentUser?.email || currentUser?.username || "").trim(),
          mustChangePassword: Boolean(currentUser?.mustChangePassword),
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
        if (!fromLoginEntry && !currentUser?.mustChangePassword) {
          if (mobileRoute) {
            const destination = mobileDestinationFromVendasBoard(vendasBoard);
            router.replace(destination);
          }
        }
      } catch {
        if (mounted) {
          setMasterCheckComplete(true);
          if (!fromLoginEntry && mobileRoute) {
            router.replace(toMobileRoute("/radar-digital"));
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

  function handlePasswordChanged() {
    setWelcomeState((current) => ({
      ...current,
      mustChangePassword: false,
    }));
  }

  if (hasToken === null || (hasToken === true && !masterCheckComplete && !clientReady)) {
    return (
      <main
        className={`${styles.page} ${styles.fromLoginTransition}`}
        data-welcome-mode="single"
        data-welcome-phase="loading"
        data-welcome-path="loading"
      >
        <section className={styles.shell} aria-live="polite">
          <MobileDashboard
            state={welcomeState}
            primaryAction={mobilePrimary}
            onNavigate={navigateWithTransition}
            onPasswordChanged={handlePasswordChanged}
          />
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
      data-welcome-path={welcomeState.mustChangePassword ? "password" : hasOperationalHistory(welcomeState) ? "operation" : "first-access"}
    >
      <section className={`${styles.shell} ${leaving ? styles.shellLeaving : ""}`} aria-label="Boas-vindas HBX">
        <MobileDashboard
          state={welcomeState}
          primaryAction={mobilePrimary}
          leaving={leaving}
          onNavigate={navigateWithTransition}
          onPasswordChanged={handlePasswordChanged}
        />
      </section>
    </main>
  );
}
