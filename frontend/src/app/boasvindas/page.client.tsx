"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { apiFetch, clearApiCache } from "@/app/_lib/api";
import { mobileDestinationFromVendasBoard } from "@/app/_lib/mobileOperationalDestination";
import { toMobileRoute } from "@/app/_lib/mobileRoutes";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";
import HbxAppShell from "@/components/corporate/HbxAppShell";
import {
  HbxCorporateIcon,
  HbxCorporatePanel,
  HbxCorporateTag,
  hbxCorporateStyles as cs,
} from "@/components/corporate/HbxCorporateShell";
import { normalizeUserModuleKey, type UserModule } from "@/lib/hbx-modules";

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
  userKind?: string | null;
  isSystemMaster?: boolean | null;
  mustChangePassword?: boolean | null;
};

type WelcomeState = {
  loaded: boolean;
  userName: string;
  userEmail: string;
  mustChangePassword: boolean;
  whatsappConnected: boolean;
  radarReady: boolean;
  vendasReady: boolean;
  leadsCount: number;
  pendingReturns: number;
};

const DEFAULT_WELCOME_STATE: WelcomeState = {
  loaded: false,
  userName: "",
  userEmail: "",
  mustChangePassword: false,
  whatsappConnected: false,
  radarReady: false,
  vendasReady: false,
  leadsCount: 0,
  pendingReturns: 0,
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
  return state.radarReady || state.vendasReady || state.leadsCount > 0 || state.pendingReturns > 0;
}

function primaryAction(state: WelcomeState, tutorialCompleted: boolean) {
  if (state.loaded && !tutorialCompleted && !hasOperationalHistory(state)) {
    return { label: "Abrir tutorial", path: "/tutorial" };
  }
  if (state.loaded && state.leadsCount <= 0) {
    return { label: "Buscar primeiros cards", path: "/radar-digital" };
  }
  return { label: "Abrir Vendas", path: "/vendas" };
}

function PasswordChangeSection({
  userName,
  userEmail,
  onChanged,
}: {
  userName: string;
  userEmail: string;
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
        body: JSON.stringify({ newPassword: next }),
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
    <HbxCorporatePanel
      title={userName || "Seu acesso HBX"}
      meta={<HbxCorporateTag tone="warn">Senha temporária</HbxCorporateTag>}
    >
      <form onSubmit={submitPassword} aria-label="Trocar senha do primeiro acesso" className={cs.miniGrid}>
        <label className={cs.miniCard}>
          <span className={cs.muted}>Nova senha</span>
          <input
            className={cs.field}
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            disabled={saving}
            minLength={8}
            required
          />
        </label>
        <label className={cs.miniCard}>
          <span className={cs.muted}>Confirmar senha</span>
          <input
            className={cs.field}
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            disabled={saving}
            minLength={8}
            required
          />
        </label>
        <div className={cs.miniCard}>
          <span className={cs.muted}>{userEmail}</span>
          {error ? <HbxCorporateTag tone="red">{error}</HbxCorporateTag> : null}
          {message ? <HbxCorporateTag tone="teal">{message}</HbxCorporateTag> : null}
          <button type="submit" className={cs.tealButton} disabled={saving}>
            {saving ? "Alterando..." : "Alterar senha e continuar"}
          </button>
        </div>
      </form>
    </HbxCorporatePanel>
  );
}

function WelcomeKpis({ state }: { state: WelcomeState }) {
  const kpis = [
    {
      label: "Cards",
      value: state.loaded ? String(state.leadsCount) : "...",
      foot: "Oportunidades na sua mesa comercial",
      icon: "leads" as const,
    },
    {
      label: "Retornos",
      value: state.loaded ? String(state.pendingReturns) : "...",
      foot: "Hoje, atrasados e agendados",
      icon: "clock" as const,
    },
    {
      label: "WhatsApp",
      value: state.whatsappConnected ? "Conectado" : "Opcional",
      foot: state.whatsappConnected ? "Canal pronto" : "Conecte quando precisar",
      icon: "phone" as const,
    },
    {
      label: "Cobrança",
      value: "Depois",
      foot: "Nenhuma ação financeira agora",
      icon: "money" as const,
    },
  ];

  return (
    <div className={cs.kpis}>
      {kpis.map((item) => (
        <article key={item.label} className={cs.kpi}>
          <span className={cs.kpiIcon}>
            <HbxCorporateIcon name={item.icon} />
          </span>
          <div>
            <div className={cs.kpiLabel}>{item.label}</div>
            <div className={cs.kpiValue}>{item.value}</div>
            <div className={cs.kpiFoot}>
              <span className={cs.muted}>{item.foot}</span>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function WelcomeContent({
  state,
  tutorialCompleted,
  onPasswordChanged,
}: {
  state: WelcomeState;
  tutorialCompleted: boolean;
  onPasswordChanged: () => void;
}) {
  const action = primaryAction(state, tutorialCompleted);

  if (state.loaded && state.mustChangePassword) {
    return (
      <PasswordChangeSection
        userName={state.userName}
        userEmail={state.userEmail}
        onChanged={onPasswordChanged}
      />
    );
  }

  const firstName = state.userName.split(" ")[0] || "";
  const steps = [
    {
      id: "radar",
      title: "Buscar cards",
      description: "Escolha cidade e segmento para montar sua fila comercial.",
      done: state.loaded && (state.radarReady || state.leadsCount > 0),
      optional: false,
      href: "/radar-digital",
    },
    {
      id: "vendas",
      title: "Organizar retornos",
      description: "Abra os cards, chame pelo WhatsApp e marque retornos.",
      done: state.loaded && state.vendasReady,
      optional: false,
      href: "/vendas",
    },
    {
      id: "whatsapp",
      title: state.whatsappConnected ? "Canal conectado" : "Conectar depois",
      description: state.whatsappConnected
        ? "Canal pronto para acionar oportunidades."
        : "Você pode buscar cards antes de conectar o canal.",
      done: state.loaded && state.whatsappConnected,
      optional: true,
      href: state.whatsappConnected ? "/vendas" : "/atendimento/automacao?tab=connection",
    },
    {
      id: "billing",
      title: "Cobrança depois",
      description: "Sem checkout agora. Primeiro entre, busque oportunidades e organize sua operação.",
      done: false,
      optional: true,
      href: null,
    },
  ];

  return (
    <>
      <HbxCorporatePanel
        title={
          state.loaded
            ? `${firstName ? `${firstName}, sua` : "Sua"} operação começa aqui.`
            : "Preparando seu acesso."
        }
        meta={
          <Link href={action.path} prefetch={false} style={{ textDecoration: "none" }}>
            <button type="button" className={cs.tealButton}>{action.label}</button>
          </Link>
        }
      >
        <p className={cs.muted} style={{ margin: 0 }}>
          Comece pelo Radar. Sem checkout agora — primeiro entre, busque oportunidades e organize
          sua operação comercial.
        </p>
      </HbxCorporatePanel>

      <WelcomeKpis state={state} />

      <HbxCorporatePanel title="Do login ao primeiro contato" meta={<span className={cs.muted}>Rota HBX</span>}>
        <div className={cs.list}>
          {steps.map((step, index) => (
            <div key={step.id} className={cs.listItem}>
              <span className={cs.dot} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>
                  <span className={cs.mono}>{String(index + 1).padStart(2, "0")}</span> · {step.title}
                </strong>
                <p className={cs.muted} style={{ margin: 0 }}>{step.description}</p>
              </div>
              {step.done ? (
                <HbxCorporateTag tone="teal">Feito</HbxCorporateTag>
              ) : step.optional ? (
                <HbxCorporateTag tone="info">Opcional</HbxCorporateTag>
              ) : (
                <HbxCorporateTag tone="warn">Próximo</HbxCorporateTag>
              )}
              {step.href ? (
                <Link href={step.href} prefetch={false} style={{ textDecoration: "none" }}>
                  <button type="button" className={cs.ghostButton}>Abrir</button>
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      </HbxCorporatePanel>
    </>
  );
}

export default function BoasVindasClientPage({ mobileRoute = false }: { mobileRoute?: boolean } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasToken = useRequireAuth();
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.removeItem(LOGIN_TO_WELCOME_TRANSITION_KEY);
    } catch {
      // ignore storage errors
    }
    if (fromLoginEntryParam && window.location.search.includes("entry=mobile")) {
      window.history.replaceState(null, "", mobileRoute ? "/mobile/boas-vindas" : "/boasvindas");
    }
  }, [fromLoginEntryParam, mobileRoute]);

  // Deep-link de cobrança preservado: ?reason= encaminha o público de cobrança
  // direto para o financeiro (a audiência é decidida pelo PreCheckoutGate).
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
        // O diagnóstico do WhatsApp (center/modal) é endpoint de ADMIN no
        // backend: vendedor não chama (PR-002 D.4 — zero 403 em navegação
        // normal). O chip de conexão do vendedor sai do operational-status.
        const currentUser = await apiFetch<CurrentUserPayload>("/profile/current-user").catch(() => null);
        const whatsappAdminAudience = Boolean(
          currentUser?.isSystemMaster ||
            String(currentUser?.userKind || "").trim().toLowerCase() === "admin",
        );
        const [center, modal, operational, modules, vendasBoard] = await Promise.all([
          whatsappAdminAudience
            ? apiFetch<WhatsAppCenterPayload>("/companies/me/whatsapp-center").catch(() => null)
            : Promise.resolve(null),
          whatsappAdminAudience
            ? apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/status").catch(() => null)
            : Promise.resolve(null),
          apiFetch<OperationalStatusPayload>("/companies/me/operational-status?refresh=true").catch(() => null),
          apiFetch<UserModule[]>("/modules/me").catch(() => []),
          apiFetch<VendasBoardPayload>("/vendas/board", { timeoutMs: 12000 }).catch(() => null),
        ]);

        if (!mounted) return;

        const safeModules = Array.isArray(modules) ? modules : [];
        const summary = vendasBoard?.summary || {};
        const leadsCount = Math.max(0, Math.trunc(Number(summary.total || 0)));
        const pendingReturns = Math.max(
          0,
          Math.trunc(Number(summary.today || 0)) +
            Math.trunc(Number(summary.overdue || 0)) +
            Math.trunc(Number(summary.scheduled || 0)),
        );

        setWelcomeState({
          loaded: true,
          userName: String(currentUser?.name || currentUser?.username || currentUser?.email || "").trim(),
          userEmail: String(currentUser?.email || currentUser?.username || "").trim(),
          mustChangePassword: Boolean(currentUser?.mustChangePassword),
          whatsappConnected: isWhatsAppConnected(center, modal, operational),
          radarReady: hasModule(safeModules, "webscraping") || leadsCount > 0,
          vendasReady: leadsCount > 0 || pendingReturns > 0,
          leadsCount,
          pendingReturns,
        });

        if (!fromLoginEntry && !currentUser?.mustChangePassword && mobileRoute) {
          router.replace(mobileDestinationFromVendasBoard(vendasBoard));
        }
      } catch {
        if (mounted) {
          setWelcomeState((current) => ({ ...current, loaded: true }));
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

  function handlePasswordChanged() {
    setWelcomeState((current) => ({ ...current, mustChangePassword: false }));
  }

  if (hasToken !== true) return null;

  const content = (
    <WelcomeContent
      state={welcomeState}
      tutorialCompleted={tutorialCompleted}
      onPasswordChanged={handlePasswordChanged}
    />
  );

  if (mobileRoute) {
    return (
      <main className="hbx-mobile-page" style={{ display: "grid", gap: 14, padding: 16 }}>
        {content}
      </main>
    );
  }

  return (
    <HbxAppShell title="Início" breadcrumb="Home › Operação › Início">
      {content}
    </HbxAppShell>
  );
}
