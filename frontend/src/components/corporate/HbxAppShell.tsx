"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { apiFetch, clearApiCache, clearToken, getToken } from "@/app/_lib/api";
import ModuleNav from "@/components/ModuleNav";
import HbxPersistentNotice from "@/components/ui/HbxPersistentNotice";
import { dispatchMasterContextChanged, MASTER_CONTEXT_CHANGED_EVENT } from "@/lib/masterContextEvents";
import { commercialPlanByKey, getCommercialPlanTitle, type CommercialPlansPayload } from "@/lib/commercial-plans";
import {
  HbxCorporateAvatar,
  HbxCorporateIcon,
  hbxCorporateStyles as styles,
  useHbxCorporateMode,
} from "./HbxCorporateShell";

type AppShellUser = {
  id?: number;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  role?: string | null;
  userKind?: string | null;
  isSystemMaster?: boolean;
  company?: { id: number; name?: string | null } | null;
  masterContext?: {
    active: boolean;
    companyId?: number | null;
    companyName?: string | null;
  } | null;
};

type MasterNotice = {
  id: string;
  title: string;
  body: string;
  tone?: string | null;
  createdAt?: string | null;
  acknowledged?: boolean | null;
};

type NoticeTone = "info" | "success" | "warning" | "danger";

function resolveNoticeTone(tone?: string | null): NoticeTone {
  const normalized = String(tone || "").trim().toLowerCase();
  if (["danger", "error", "red", "critical"].includes(normalized)) return "danger";
  if (["warning", "warn", "yellow"].includes(normalized)) return "warning";
  if (["success", "green", "ok"].includes(normalized)) return "success";
  return "info";
}

function subscribeAuth(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("auth-change", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("auth-change", callback);
    window.removeEventListener("storage", callback);
  };
}

function getAuthSnapshot() {
  return Boolean(getToken());
}

function getAuthServerSnapshot() {
  return false;
}

function isBillingAudience(user: AppShellUser | null) {
  return Boolean(user?.isSystemMaster) || String(user?.userKind || "").trim().toLowerCase() === "admin";
}

export type HbxAppShellProps = {
  title: string;
  breadcrumb?: string;
  children: ReactNode;
  context?: ReactNode;
};

export default function HbxAppShell({ title, breadcrumb, children, context }: HbxAppShellProps) {
  const router = useRouter();
  const authenticated = useSyncExternalStore(subscribeAuth, getAuthSnapshot, getAuthServerSnapshot);
  const { mode, toggleMode } = useHbxCorporateMode();
  const [user, setUser] = useState<AppShellUser | null>(null);
  const [planTitle, setPlanTitle] = useState<string | null>(null);
  const [notices, setNotices] = useState<MasterNotice[]>([]);
  const [contextBusy, setContextBusy] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      return;
    }
    try {
      const profile = await apiFetch<AppShellUser>("/profile/current-user");
      setUser(profile);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    if (!authenticated) {
      setUser(null);
      setNotices([]);
      setPlanTitle(null);
      return;
    }
    void loadProfile();

    const handleMasterContextChanged = () => {
      void loadProfile();
    };
    window.addEventListener(MASTER_CONTEXT_CHANGED_EVENT, handleMasterContextChanged);
    return () => {
      window.removeEventListener(MASTER_CONTEXT_CHANGED_EVENT, handleMasterContextChanged);
    };
  }, [authenticated, loadProfile]);

  // Card de plano na sidebar: assunto de cobrança — SÓ para o público de
  // cobrança (admin/master). Vendedor nunca vê (PR-002 D.4).
  useEffect(() => {
    if (!authenticated || !user || !isBillingAudience(user) || !user.company?.id) {
      setPlanTitle(null);
      return;
    }
    let mounted = true;
    apiFetch<CommercialPlansPayload>("/commercial-plans/me")
      .then((payload) => {
        if (!mounted) return;
        const key = payload?.current?.planKey || payload?.current?.selectedPlanKey || null;
        const plan = key ? commercialPlanByKey(payload, key as never) : null;
        setPlanTitle(plan?.title || (key ? getCommercialPlanTitle(key as never) : null));
      })
      .catch(() => {
        if (mounted) setPlanTitle(null);
      });
    return () => {
      mounted = false;
    };
  }, [authenticated, user]);

  useEffect(() => {
    if (!authenticated || !user) return;
    let mounted = true;
    const audience =
      String(user.role || "").toUpperCase() === "ADMIN" || user.isSystemMaster ? "customer" : "seller";
    apiFetch<{ notices?: MasterNotice[] }>(`/vendas/master-notices?audience=${encodeURIComponent(audience)}`)
      .then((payload) => {
        if (!mounted) return;
        const pending = (Array.isArray(payload?.notices) ? payload.notices : []).filter(
          (notice) => notice.acknowledged !== true,
        );
        setNotices(pending);
      })
      .catch(() => {
        if (mounted) setNotices([]);
      });
    return () => {
      mounted = false;
    };
  }, [authenticated, user]);

  async function acknowledgeNotice(noticeId: string) {
    setNotices((previous) => previous.filter((notice) => notice.id !== noticeId));
    try {
      await apiFetch(`/vendas/master-notices/${encodeURIComponent(noticeId)}/ack`, { method: "POST" });
      window.dispatchEvent(new CustomEvent("hbx:vendas-master-notices"));
    } catch {
      // aviso volta no próximo carregamento se o ack falhou
    }
  }

  async function exitMasterContext() {
    if (contextBusy) return;
    setContextBusy(true);
    try {
      await apiFetch("/master-context/exit", {
        method: "POST",
        body: JSON.stringify({ reason: "manual_exit" }),
      });
      clearApiCache("/profile/current-user");
      clearApiCache("/modules/me");
      dispatchMasterContextChanged({ mode: "exited" });
      await loadProfile();
    } catch {
      // mantém contexto atual; usuário pode tentar de novo
    } finally {
      setContextBusy(false);
    }
  }

  async function handleLogout() {
    if (logoutBusy) return;
    setLogoutBusy(true);
    try {
      await apiFetch("/auth/logout", { method: "POST", requireAuth: true });
    } catch {
      // logout local continua mesmo se a API falhar
    } finally {
      clearToken();
      router.push("/login");
    }
  }

  const displayName = String(user?.name || user?.username || user?.email || "—");
  const assumedCompany = user?.masterContext?.active ? user.masterContext.companyName || "empresa" : null;
  const subtitle = assumedCompany
    ? `Master · ${assumedCompany}`
    : user?.isSystemMaster
      ? "Master"
      : String(user?.role || "");

  return (
    <main className={styles.app}>
      <aside className={styles.side}>
        <div className={styles.logo}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--hbx-brand)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6l6 6-6 6M11 6l6 6-6 6" />
          </svg>
          <strong>HBX</strong>
        </div>
        <ModuleNav variant="corporate" />
        <div className={styles.sideBottom}>
          {planTitle ? (
            <div className={styles.planCard}>
              <div>
                <strong>{planTitle}</strong>
              </div>
              <Link href="/planos" prefetch={false} style={{ textDecoration: "none" }}>
                <button type="button">Gerenciar plano</button>
              </Link>
            </div>
          ) : null}
          <div className={styles.userCard}>
            <HbxCorporateAvatar name={displayName} />
            <div>
              <strong>{displayName}</strong>
              <small>{subtitle}</small>
            </div>
          </div>
        </div>
      </aside>
      <section className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.pageId}>
            <h1>{title}</h1>
            <div className={styles.crumbs}>{breadcrumb || `Home › ${title}`}</div>
          </div>
          <div className={styles.search}>
            <HbxCorporateIcon name="search" size={15} />
            Buscar leads, empresas, propostas...
            <span className={styles.kbd}>⌘ K</span>
          </div>
          <div className={styles.topActions}>
            {assumedCompany ? (
              <button
                type="button"
                className={styles.ghostButton}
                onClick={exitMasterContext}
                disabled={contextBusy}
                title="Sair do contexto de empresa assumida"
              >
                {contextBusy ? "Saindo..." : `Operando: ${assumedCompany} ×`}
              </button>
            ) : null}
            <button type="button" className={styles.roundBtn} onClick={toggleMode} aria-label="Alternar claro e escuro">
              <HbxCorporateIcon name={mode === "dark" ? "sun" : "moon"} size={17} />
            </button>
            <span className={styles.themeSwitch}>
              <button type="button" className={styles.switchTrack} aria-label="Tema Corporativo ativo" role="switch" aria-checked="true">
                <span className={styles.switchThumb} />
              </button>
              <span className={styles.themeLabel}>Corporativo</span>
            </span>
            {notices.length > 0 ? (
              <button
                type="button"
                className={styles.roundBtn}
                aria-label={`${notices.length} avisos do master`}
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              >
                <HbxCorporateIcon name="bell" size={17} />
                <span className={styles.bubble}>{notices.length}</span>
              </button>
            ) : null}
            <button
              type="button"
              className={styles.ghostButton}
              onClick={handleLogout}
              disabled={logoutBusy}
            >
              {logoutBusy ? "Saindo..." : "Sair"}
            </button>
            <HbxCorporateAvatar name={displayName} size={34} />
          </div>
        </header>
        <div className={styles.content}>
          <div className={styles.work}>
            {notices.map((notice) => (
              <HbxPersistentNotice
                key={notice.id}
                tone={resolveNoticeTone(notice.tone)}
                title={notice.title}
                description={notice.body}
                onDismiss={() => void acknowledgeNotice(notice.id)}
                dismissLabel="Confirmar leitura do aviso"
              />
            ))}
            {children}
          </div>
          {context ? <aside className={styles.context}>{context}</aside> : null}
        </div>
      </section>
    </main>
  );
}
