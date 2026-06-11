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
  HbxFormField,
  HbxKpiCard,
  HbxKpiGrid,
  HbxPageShell,
  HbxSection,
  HbxStandardList,
  HbxStatusBadge,
} from "@/components/ui";
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
    <HbxSection
      eyebrow="Senha temporária"
      title={userName || "Seu acesso HBX"}
      description={userEmail}
      aside={<HbxStatusBadge tone="warning">Primeiro acesso</HbxStatusBadge>}
    >
      <form onSubmit={submitPassword} aria-label="Trocar senha do primeiro acesso">
        <HbxFormField label="Nova senha" requiredMark>
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            disabled={saving}
            minLength={8}
            required
          />
        </HbxFormField>
        <HbxFormField label="Confirmar senha" requiredMark error={error || undefined} hint={message || undefined}>
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            disabled={saving}
            minLength={8}
            required
          />
        </HbxFormField>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Alterando..." : "Alterar senha e continuar"}
        </button>
      </form>
    </HbxSection>
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
      description: "Sem checkout agora. Primeiro entre, busque oportunidades e organize sua operação comercial.",
      done: false,
      optional: true,
      href: null,
    },
  ];

  return (
    <>
      <HbxKpiGrid>
        <HbxKpiCard
          label="Cards"
          value={state.loaded ? state.leadsCount : "..."}
          description="Oportunidades na sua mesa comercial."
        />
        <HbxKpiCard
          label="Retornos"
          value={state.loaded ? state.pendingReturns : "..."}
          description="Hoje, atrasados e agendados."
          tone={state.pendingReturns > 0 ? "warning" : "default"}
        />
        <HbxKpiCard
          label="WhatsApp"
          value={state.whatsappConnected ? "Conectado" : "Opcional"}
          description={state.whatsappConnected ? "Canal pronto." : "Conecte quando precisar."}
          tone={state.whatsappConnected ? "success" : "default"}
        />
        <HbxKpiCard label="Cobrança" value="Depois" description="Nenhuma ação financeira agora." />
      </HbxKpiGrid>

      <HbxSection
        eyebrow="Rota HBX"
        title="Do login ao primeiro contato"
        description={state.loaded ? "Escolha por onde continuar." : "Preparando seu acesso."}
        aside={
          <Link className="btn btn-primary" href={action.path}>
            {action.label}
          </Link>
        }
      >
        <HbxStandardList
          loading={!state.loaded}
          items={steps.map((step, index) => ({
            id: step.id,
            title: `${String(index + 1).padStart(2, "0")} · ${step.title}`,
            description: step.description,
            badge: step.done ? (
              <HbxStatusBadge tone="success">Feito</HbxStatusBadge>
            ) : step.optional ? (
              <HbxStatusBadge tone="neutral">Opcional</HbxStatusBadge>
            ) : (
              <HbxStatusBadge tone="info">Próximo</HbxStatusBadge>
            ),
            action: step.href ? (
              <Link className="btn" href={step.href}>
                Abrir
              </Link>
            ) : undefined,
          }))}
        />
      </HbxSection>
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
      <HbxPageShell
        eyebrow="HBX pronto"
        title="Sua operação começa aqui"
        description="Busque cards no Radar, chame pelo WhatsApp e organize retornos."
      >
        {content}
      </HbxPageShell>
    );
  }

  return (
    <HbxAppShell title="Boas-vindas" breadcrumb="Home › Boas-vindas">
      {content}
    </HbxAppShell>
  );
}
