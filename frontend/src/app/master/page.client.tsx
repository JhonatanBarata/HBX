"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "@/app/_lib/api";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";
import type { CompanySummary, WorkspacePayload } from "./master.types";
import styles from "./page.module.css";

type HealthStatus = "ok" | "error" | "unavailable";
type HealthTone = "green" | "yellow" | "red";

type CurrentUser = {
  username?: string | null;
  email?: string | null;
  isSystemMaster?: boolean;
  masterContext?: {
    active: boolean;
    companyName?: string | null;
  } | null;
};

type CommandPayload<TParsed = unknown> = {
  status: HealthStatus;
  raw?: string | null;
  error?: string | null;
  parsed?: TParsed | null;
};

type SystemHealthPayload = {
  generatedAt: string;
  memory: CommandPayload<{
    totalKb?: number;
    availableKb?: number;
    usedKb?: number;
    usagePercent?: number | null;
  }> & { source?: string | null };
  load: CommandPayload<{
    oneMinute?: string | null;
    fiveMinutes?: string | null;
    fifteenMinutes?: string | null;
  }> & { loadavg?: string | null };
  disk: CommandPayload<{
    filesystem?: string | null;
    size?: string | null;
    used?: string | null;
    available?: string | null;
    usagePercent?: string | null;
    mount?: string | null;
  }>;
  uptime: CommandPayload & {
    seconds?: number | null;
    formatted?: string | null;
  };
  containers: {
    status: HealthStatus;
    note?: string | null;
    error?: string | null;
    items: Array<{
      name: string;
      status?: HealthStatus;
      cpu?: string;
      memory?: string;
      memoryPercent?: string;
      netIo?: string;
      blockIo?: string;
      pids?: string;
    }>;
  };
  postgres: {
    status: HealthStatus;
    responseMs?: number | null;
    error?: string | null;
  };
  api: {
    status: HealthStatus;
    responseMs: number;
    processUptimeSeconds?: number;
  };
  errors: {
    status: HealthStatus;
    source?: string | null;
    lines: string[];
    note?: string | null;
  };
  production?: {
    radar: {
      total: number;
      cardsToday: number;
      cardsLastHour: number;
      cardsLast10Min: number;
      premiumToday: number;
    };
    queue: {
      queued: number;
      running: number;
      failed: number;
    };
  };
  nightFactory?: {
    enabled: boolean;
    status: string;
    leadsEnrichedToday: number;
    premiumOpportunities: number;
    recoveryOpportunities: number;
  };
};

type ActiveSessionPayload = {
  generatedAt: string;
  counters: {
    onlineNow: number;
    activeLast15Min: number;
    activeToday: number;
  };
  sessions: Array<{
    userId: number;
    userName: string;
    email?: string | null;
    companyId?: number | null;
    companyName?: string | null;
    role?: string | null;
    isSystemMaster?: boolean;
    sessionId: string;
    createdAt?: string;
    lastSeenAt: string;
    expiresAt: string;
    online: boolean;
    idleMinutes: number;
    userAgent?: string | null;
    ipFingerprint?: string | null;
    modules?: Array<{
      key: string;
      name: string;
    }>;
  }>;
};

type ActionFilterId =
  | "trial_ending"
  | "no_payment"
  | "pending_checkout"
  | "whatsapp_pending"
  | "operational_error"
  | "no_access"
  | "heavy_webscraping"
  | "weak_activation";

const ACTION_FILTERS: Array<{ id: ActionFilterId; label: string }> = [
  { id: "trial_ending", label: "Trial vencendo" },
  { id: "no_payment", label: "Sem pagamento" },
  { id: "pending_checkout", label: "Checkout pendente" },
  { id: "whatsapp_pending", label: "WhatsApp pendente" },
  { id: "operational_error", label: "Com erro operacional" },
  { id: "no_access", label: "Sem acesso" },
  { id: "heavy_webscraping", label: "Usando webscraping forte" },
  { id: "weak_activation", label: "Ativação fraca" },
];

const MASTER_SHORTCUTS = [
  {
    title: "Hostinger",
    eyebrow: "Produção",
    description: "VPS onde rodam backend, webscraping, HBX Scraping Engine, Postgres e processos operacionais.",
    href: "/master/sistema",
    action: "Ver saúde Hostinger",
    tone: "hostinger",
    meta: "api.hbxsystem.com.br",
  },
  {
    title: "Operação MASTER",
    eyebrow: "Command Center",
    description: "Painel completo de empresas, contexto, módulos, cobrança, tokens e operação da base.",
    href: "/master/operacao",
    action: "Abrir operação",
    tone: "master",
    meta: "Empresas e modulos",
  },
  {
    title: "Clientes",
    eyebrow: "Base",
    description: "Tabela dedicada de clientes com situação operacional, financeiro, WhatsApp e atividade.",
    href: "/master/clientes",
    action: "Ver clientes",
    tone: "master",
    meta: "billingSituation + whatsappSituation",
  },
  {
    title: "Financeiro",
    eyebrow: "Cobrança",
    description: "Cockpit financeiro usando a leitura normalizada do billingSituation por cliente.",
    href: "/master/financeiro",
    action: "Ver financeiro",
    tone: "hostinger",
    meta: "Receita, atraso e trials",
  },
  {
    title: "WhatsApp",
    eyebrow: "Operação",
    description: "Leitura dedicada de QR rápido, Meta oficial e Token Master sem expor secrets.",
    href: "/master/whatsapp",
    action: "Ver WhatsApp",
    tone: "support",
    meta: "QR, Meta e Master Token",
  },
  {
    title: "Email",
    eyebrow: "Comercial",
    description: "Envio simples da apresentação HBX com anexo PPTX trocável e mensagem fixa.",
    href: "/master/email",
    action: "Abrir email",
    tone: "support",
    meta: "jhonatan@hbx.com.br",
  },
  {
    title: "Banco dos Motores",
    eyebrow: "Massa de Dados",
    description: "Painel do banco HBX: 20 motores, coleta noturna, filas e saúde resumida.",
    href: "/master/webscraping",
    action: "Abrir banco",
    tone: "hostinger",
    meta: "M1-M20 + Radar",
  },
  {
    title: "Night Factory",
    eyebrow: "Madrugada",
    description: "Servidor ocioso virando Radar Premium, score, scripts e Recovery para vender amanhã.",
    href: "/master/night-factory",
    action: "Abrir fábrica",
    tone: "hostinger",
    meta: "Radar Premium + Recovery",
  },
  {
    title: "Planos/Módulos",
    eyebrow: "Catálogo",
    description: "Preços, módulos vendáveis, padrão para empresas e uso por cliente.",
    href: "/master/planos",
    action: "Ver módulos",
    tone: "master",
    meta: "Catálogo comercial",
  },
  {
    title: "Exclusões",
    eyebrow: "Auditoria",
    description: "Área sensível para revisar remoções, impactos e rastros administrativos.",
    href: "/master/exclusoes",
    action: "Abrir exclusões",
    tone: "danger",
    meta: "Acesso restrito",
  },
] as const;

function displayName(user: CurrentUser | null) {
  return String(user?.username || user?.email || "MASTER").trim();
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

function formatKb(kb?: number | null) {
  const value = Number(kb || 0);
  if (!value) return "-";
  const gb = value / 1024 / 1024;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(value / 1024).toFixed(0)} MB`;
}

function formatCurrency(value?: number | null) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function parsePercent(value?: string | number | null) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value || "").replace("%", "").replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function healthStatusLabel(status?: HealthStatus) {
  if (status === "ok") return "OK";
  if (status === "error") return "Erro";
  return "Indisponível";
}

function healthToneLabel(tone: HealthTone) {
  if (tone === "green") return "OK";
  if (tone === "yellow") return "Atenção: monitorar";
  return "Crítico: considerar limpeza/upgrade Hostinger";
}

function healthCardToneFromPercent(value?: string | number | null): "green" | "yellow" {
  const percent = parsePercent(value);
  return percent !== null && percent >= 70 ? "yellow" : "green";
}

function computeHealthTone(data: SystemHealthPayload | null, unavailable = false): HealthTone {
  if (unavailable || !data) return "red";
  const memoryPercent = parsePercent(data.memory?.parsed?.usagePercent);
  const diskPercent = parsePercent(data.disk?.parsed?.usagePercent);
  const apiMs = Number(data.api?.responseMs || 0);
  const postgresMs = Number(data.postgres?.responseMs || 0);

  if (
    data.api?.status !== "ok" ||
    data.postgres?.status === "error" ||
    memoryPercent !== null && memoryPercent >= 85 ||
    diskPercent !== null && diskPercent >= 85 ||
    apiMs >= 2000
  ) {
    return "red";
  }

  if (
    memoryPercent !== null && memoryPercent >= 70 ||
    diskPercent !== null && diskPercent >= 70 ||
    apiMs >= 800 ||
    postgresMs >= 500 ||
    (data.errors?.lines || []).length > 0
  ) {
    return "yellow";
  }

  return "green";
}

function planLabel(company: CompanySummary) {
  if (company.selectedPlanKey === "hbx_lite") return "HBX List";
  if (company.selectedPlanKey === "hbx_padrao") return "HBX Lead";
  if (company.selectedPlanKey === "hbx_melhor") return "HBX Full";
  return company.plan?.name || "Sem plano";
}

function paymentLabel(value?: string | null) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "PAID") return "Pago";
  if (normalized === "TRIAL") return "Trial";
  if (normalized === "MANUAL") return "Manual";
  if (normalized === "PENDING") return "Pendente";
  if (normalized === "OVERDUE") return "Atrasado";
  if (normalized === "EXPIRED") return "Expirado";
  if (normalized === "DISABLED") return "Suspenso";
  return normalized || "-";
}

function subscriptionLabel(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "active") return "Ativa";
  if (normalized === "trialing") return "Trial";
  if (normalized === "manual") return "Manual";
  if (normalized === "pending_checkout") return "Checkout pendente";
  if (normalized === "past_due") return "Em atraso";
  if (normalized === "expired") return "Expirada";
  if (normalized === "canceled") return "Cancelada";
  return normalized || "-";
}

function companyWhatsappPending(company: CompanySummary) {
  const situation = company.whatsappSituation;
  return Boolean(
    situation?.hasPendingMigration ||
      situation?.hasError ||
      situation?.mode === "none" ||
      situation?.status === "disconnected" ||
      situation?.status === "attention" ||
      situation?.status === "error" ||
      company.whatsappCenter?.status === "ATTENTION" ||
      company.whatsappCenter?.status === "NOT_CONNECTED",
  );
}

function companyNoAccess(company: CompanySummary) {
  return Boolean(
    !company.isActive ||
      company.billingSituation?.canUse === false ||
      company.operationalStatus?.accessActive === false ||
      ["expired", "canceled"].includes(String(company.subscriptionStatus || "").trim().toLowerCase()) ||
      ["EXPIRED", "DISABLED"].includes(String(company.paymentStatus || "").trim().toUpperCase()),
  );
}

function companyMatchesActionFilter(company: CompanySummary, filterId: ActionFilterId) {
  const paymentStatus = String(company.paymentStatus || "").trim().toUpperCase();
  const subscriptionStatus = String(company.subscriptionStatus || "").trim().toLowerCase();
  const onboardingStatus = String(company.onboardingStatus || "").trim().toLowerCase();
  if (filterId === "trial_ending") {
    const days = Number(company.trialRemainingDays ?? 99);
    return company.statusBucket === "TRIAL_ENDING" || (days >= 0 && days <= 3);
  }
  if (filterId === "no_payment") {
    return company.statusBucket === "NO_METHOD" || company.statusBucket === "OVERDUE" || paymentStatus === "OVERDUE" || paymentStatus === "EXPIRED";
  }
  if (filterId === "pending_checkout") {
    return paymentStatus === "PENDING" || subscriptionStatus === "pending_checkout" || onboardingStatus === "pending_checkout";
  }
  if (filterId === "whatsapp_pending") return companyWhatsappPending(company);
  if (filterId === "operational_error") {
    return company.riskLevel === "critical" || company.operationalStatus?.overallHealth === "red" || Boolean(company.whatsappSituation?.hasError);
  }
  if (filterId === "no_access") return companyNoAccess(company);
  if (filterId === "heavy_webscraping") {
    return Number(company.webscrapingUsage?.searchesToday || 0) >= 3 || Number(company.webscrapingUsage?.fetchedToday || 0) >= 20;
  }
  if (filterId === "weak_activation") {
    return Boolean(
      company.activationNeedsAttention ||
        !company.emailConfirmation?.confirmed ||
        ["needs_activation", "pending_email_confirmation"].includes(String(company.activationStatus || "").trim().toLowerCase()),
    );
  }
  return false;
}

function recommendedAction(company: CompanySummary) {
  if (companyNoAccess(company) || company.statusBucket === "OVERDUE" || company.statusBucket === "NO_METHOD") {
    return { label: "Abrir financeiro", href: `/master/operacao?companyId=${company.id}&tab=finance` };
  }
  if (companyWhatsappPending(company)) {
    return { label: "Abrir WhatsApp", href: `/master/operacao?companyId=${company.id}&tab=integrations` };
  }
  if (company.activationNeedsAttention || !company.emailConfirmation?.confirmed) {
    const phone = String(company.contactPhone || "").replace(/\D/g, "");
    return phone
      ? { label: "Chamar no WhatsApp", href: `https://wa.me/55${phone}` }
      : { label: "Assumir empresa", href: `/master/operacao?companyId=${company.id}` };
  }
  if (company.auditCount) {
    return { label: "Ver auditoria", href: `/master/operacao?companyId=${company.id}&tab=audit` };
  }
  return { label: "Assumir empresa", href: `/master/operacao?companyId=${company.id}` };
}

function lastCompanySession(company: CompanySummary, sessions: ActiveSessionPayload | null) {
  return (sessions?.sessions || [])
    .filter((session) => Number(session.companyId || 0) === Number(company.id))
    .sort((left, right) => new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime())[0] || null;
}

function compactModuleName(value: string) {
  return String(value || "")
    .replace(/^HBX\s+/i, "")
    .replace("Radar Digital", "Radar")
    .trim();
}

export default function MasterHomeClientPage() {
  const hasToken = useRequireAuth();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [loadingCockpit, setLoadingCockpit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cockpitError, setCockpitError] = useState<string | null>(null);
  const [health, setHealth] = useState<SystemHealthPayload | null>(null);
  const [sessions, setSessions] = useState<ActiveSessionPayload | null>(null);
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [actionFilter, setActionFilter] = useState<ActionFilterId>("trial_ending");
  const [expandedSessionUserId, setExpandedSessionUserId] = useState<number | null>(null);

  const loadCockpit = useCallback(async () => {
    setLoadingCockpit(true);
    setCockpitError(null);
    const [healthResult, sessionsResult, workspaceResult] = await Promise.allSettled([
      apiFetch<SystemHealthPayload>("/admin/system-health", { requireAuth: true, timeoutMs: 15000 }),
      apiFetch<ActiveSessionPayload>("/admin/active-sessions", { requireAuth: true, timeoutMs: 15000 }),
      apiFetch<WorkspacePayload>("/modules/master/workspace", { requireAuth: true, timeoutMs: 25000 }),
    ]);

    if (healthResult.status === "fulfilled") setHealth(healthResult.value);
    if (sessionsResult.status === "fulfilled") setSessions(sessionsResult.value);
    if (workspaceResult.status === "fulfilled") setWorkspace(workspaceResult.value);

    const failures = [healthResult, sessionsResult, workspaceResult].filter((result) => result.status === "rejected");
    if (failures.length) {
      setCockpitError("Alguma leitura do cockpit falhou. A home continua aberta; use Atualizar agora para tentar novamente.");
    }
    setLoadingCockpit(false);
  }, []);

  useEffect(() => {
    if (hasToken !== true) return;
    let mounted = true;

    async function loadUser() {
      setCheckingAccess(true);
      setError(null);
      try {
        const payload = await apiFetch<CurrentUser>("/profile/current-user");
        if (!mounted) return;
        setUser(payload);
        if (payload?.isSystemMaster) void loadCockpit();
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : "Falha ao validar acesso MASTER.");
        }
      } finally {
        if (mounted) setCheckingAccess(false);
      }
    }

    void loadUser();
    return () => {
      mounted = false;
    };
  }, [hasToken, loadCockpit]);

  const actionCompanies = useMemo(
    () =>
      (workspace?.companies || [])
        .filter((company) => companyMatchesActionFilter(company, actionFilter))
        .sort((left, right) => {
          const leftRisk = left.riskLevel === "critical" ? 0 : left.riskLevel === "warning" ? 1 : 2;
          const rightRisk = right.riskLevel === "critical" ? 0 : right.riskLevel === "warning" ? 1 : 2;
          if (leftRisk !== rightRisk) return leftRisk - rightRisk;
          return Number(left.trialRemainingDays ?? 99) - Number(right.trialRemainingDays ?? 99);
        })
        .slice(0, 12),
    [actionFilter, workspace?.companies],
  );
  const sessionUsers = useMemo(() => {
    const groups = new Map<number, {
      userId: number;
      userName: string;
      email: string | null;
      companyName: string | null;
      role: string | null;
      isSystemMaster: boolean;
      online: boolean;
      latest: ActiveSessionPayload["sessions"][number];
      sessions: ActiveSessionPayload["sessions"];
      modules: Array<{ key: string; name: string }>;
    }>();

    for (const session of sessions?.sessions || []) {
      const current = groups.get(session.userId);
      const sessionTime = new Date(session.lastSeenAt).getTime();
      const currentTime = current ? new Date(current.latest.lastSeenAt).getTime() : 0;
      const latest = !current || sessionTime > currentTime ? session : current.latest;
      const modules = new Map<string, { key: string; name: string }>();
      for (const moduleEntry of current?.modules || []) modules.set(moduleEntry.key, moduleEntry);
      for (const moduleEntry of session.modules || []) modules.set(moduleEntry.key, moduleEntry);

      groups.set(session.userId, {
        userId: session.userId,
        userName: session.userName,
        email: session.email || null,
        companyName: session.companyName || (session.isSystemMaster ? "MASTER" : null),
        role: session.isSystemMaster ? "MASTER" : session.role || null,
        isSystemMaster: Boolean(session.isSystemMaster),
        online: Boolean(current?.online || session.online),
        latest,
        sessions: [...(current?.sessions || []), session].sort(
          (left, right) => new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime(),
        ),
        modules: [...modules.values()].sort((left, right) => left.name.localeCompare(right.name)),
      });
    }

    return [...groups.values()].sort((left, right) => {
      if (left.online !== right.online) return left.online ? -1 : 1;
      return new Date(right.latest.lastSeenAt).getTime() - new Date(left.latest.lastSeenAt).getTime();
    });
  }, [sessions?.sessions]);

  if (hasToken === null || checkingAccess) {
    return (
      <main className="app-shell">
        <div className="app-container">
          <div className="panel p-4 text-sm text-muted">Carregando home MASTER...</div>
        </div>
      </main>
    );
  }

  if (!hasToken) return null;

  const isSystemMaster = Boolean(user?.isSystemMaster);

  if (!isSystemMaster) {
    return (
      <DashboardScaffold title="Master" description="Entrada exclusiva do usuário MASTER.">
        <section className={styles.masterHomeAccess}>
          <h2>Acesso exclusivo do MASTER</h2>
          <p>Seu usuário autenticado não tem permissão para abrir esta central.</p>
          {error ? <p className={styles.masterHomeError}>{error}</p> : null}
          <Link href="/boasvindas" className="btn btn-secondary btn-sm">
            Voltar ao painel
          </Link>
        </section>
      </DashboardScaffold>
    );
  }

  return (
    <DashboardScaffold
      title="Master"
      hideHeader
    >
      <div className={styles.masterHome}>
        {error ? <div className="alert alert-error">{error}</div> : null}
        {cockpitError ? <div className="alert alert-warning">{cockpitError}</div> : null}

        <section className={styles.masterCommandTop} aria-label="Atalhos MASTER">
          <div>
            <span className={styles.masterHomeEyebrow}>MASTER</span>
            <strong>Command Center</strong>
            <small>{displayName(user)} • {sessions?.counters.onlineNow ?? 0} online agora</small>
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={loadCockpit} disabled={loadingCockpit}>
            {loadingCockpit ? "Atualizando..." : "Atualizar agora"}
          </button>
        </section>

        <section className={styles.masterHomeGrid} aria-label="Atalhos MASTER">
          {MASTER_SHORTCUTS.map((item) => (
            <Link key={item.href} href={item.href} className={styles.masterHomeCard} data-tone={item.tone}>
              <span>{item.eyebrow}</span>
              <strong>{item.title}</strong>
              <small>{item.meta}</small>
              <b>{item.action}</b>
            </Link>
          ))}
        </section>

        <section className={styles.masterNightHero}>
          <div>
            <span className={styles.masterHomeEyebrow}>Night Factory</span>
            <h2>Enquanto você dormia, o HBX produziu:</h2>
            <p>
              A madrugada transforma webscraping em inteligência comercial pronta para ação humana.
            </p>
          </div>
          <div className={styles.masterNightGrid}>
            <article><span>Leads fabricados</span><strong>{health?.production?.radar.cardsToday ?? 0}</strong></article>
            <article><span>Leads limpos</span><strong>{health?.nightFactory?.leadsEnrichedToday ?? 0}</strong></article>
            <article><span>Oportunidades Premium</span><strong>{health?.nightFactory?.premiumOpportunities ?? 0}</strong></article>
            <article><span>Leads para Recovery</span><strong>{health?.nightFactory?.recoveryOpportunities ?? 0}</strong></article>
            <article><span>Fila Radar</span><strong>{health?.production?.queue.queued ?? 0}</strong></article>
            <article><span>Cards últimos 10 min</span><strong>{health?.production?.radar.cardsLast10Min ?? 0}</strong></article>
          </div>
          <div className={styles.masterNightActions}>
            <Link href="/master/night-factory" className="btn btn-primary btn-sm">Ver Top 20 de hoje</Link>
            <Link href="/master/webscraping" className="btn btn-secondary btn-sm">Motores HBX</Link>
            <Link href="/master/sistema" className="btn btn-secondary btn-sm">Command Center</Link>
          </div>
        </section>

        <section className={styles.masterCockpitSection} aria-labelledby="master-sessions-title">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Sessões</p>
              <h2 id="master-sessions-title">Usuários e acessos</h2>
            </div>
            <div className={styles.sessionCounters}>
              <span><strong>{sessions?.counters.onlineNow ?? 0}</strong> online agora</span>
              <span><strong>{sessions?.counters.activeLast15Min ?? 0}</strong> 15 min</span>
              <span><strong>{sessions?.counters.activeToday ?? 0}</strong> hoje</span>
            </div>
          </div>

          <div className={styles.sessionUserGrid}>
            {sessionUsers.slice(0, 12).map((entry) => {
              const expanded = expandedSessionUserId === entry.userId;
              return (
                <article key={entry.userId} className={styles.sessionUserCard} data-online={entry.online ? "true" : "false"}>
                  <button
                    type="button"
                    className={styles.sessionUserButton}
                    onClick={() => setExpandedSessionUserId(expanded ? null : entry.userId)}
                    aria-expanded={expanded}
                  >
                    <span className={styles.sessionAvatar}>{entry.userName.charAt(0).toUpperCase()}</span>
                    <span>
                      <strong>{entry.userName}</strong>
                      <small>{entry.companyName || entry.email || `ID ${entry.userId}`}</small>
                    </span>
                    <em>{entry.online ? "Online" : "Ausente"}</em>
                  </button>

                  <div className={styles.sessionUserMeta}>
                    <span>{entry.role || "-"}</span>
                    <span>{entry.latest.idleMinutes} min parado</span>
                    <span>{entry.sessions.length} sessão{entry.sessions.length === 1 ? "" : "s"}</span>
                  </div>

                  {expanded ? (
                    <div className={styles.sessionDetails}>
                      <div>
                        <strong>Último acesso</strong>
                        <span>{formatDateTime(entry.latest.lastSeenAt)}</span>
                      </div>
                      <div>
                        <strong>IP</strong>
                        <span>{entry.latest.ipFingerprint ? `fingerprint ${entry.latest.ipFingerprint}` : "Não armazenado em texto puro"}</span>
                      </div>
                      <div>
                        <strong>Dispositivo</strong>
                        <span>{entry.latest.userAgent || "-"}</span>
                      </div>
                      <div>
                        <strong>Módulos</strong>
                        <span>{entry.modules.length ? entry.modules.slice(0, 8).map((module) => compactModuleName(module.name)).join(" • ") : "Sem módulos ativos"}</span>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
            {!sessionUsers.length ? <div className={styles.emptyPanel}>Nenhuma sessão recente encontrada.</div> : null}
          </div>
        </section>

        <section className={styles.masterCockpitSection} aria-labelledby="master-action-title">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Comercial</p>
              <h2 id="master-action-title">Ação agora</h2>
            </div>
            <Link href="/master/operacao" className="btn btn-secondary btn-sm">Abrir operação completa</Link>
          </div>

          <div className={styles.filterChips} role="tablist" aria-label="Filtros de ação imediata">
            {ACTION_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                className={actionFilter === filter.id ? styles.filterChipActive : styles.filterChip}
                onClick={() => setActionFilter(filter.id)}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.masterTable}>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Plano</th>
                  <th>Pagamento</th>
                  <th>Assinatura</th>
                  <th>Trial</th>
                  <th>Último login/sessão</th>
                  <th>Saúde</th>
                  <th>WhatsApp</th>
                  <th>Ação recomendada</th>
                </tr>
              </thead>
              <tbody>
                {actionCompanies.map((company) => {
                  const action = recommendedAction(company);
                  const lastSession = lastCompanySession(company, sessions);
                  return (
                    <tr key={company.id}>
                      <td>
                        <div className={styles.secondaryCell}>
                          <strong>{company.name}</strong>
                          <span>{company.contactPhone || company.contactEmail || `ID ${company.id}`}</span>
                        </div>
                      </td>
                      <td>{planLabel(company)} • {formatCurrency(company.monthlyValue)}</td>
                      <td>{company.billingSituation?.statusLabel || paymentLabel(company.paymentStatus)}</td>
                      <td>{subscriptionLabel(company.subscriptionStatus)}</td>
                      <td>{company.trialRemainingDays ?? "-"} dia(s)</td>
                      <td>{lastSession ? formatDateTime(lastSession.lastSeenAt) : "Sem sessão hoje"}</td>
                      <td>{company.operationalStatus?.overallLabel || company.financialSituation || company.riskLevel}</td>
                      <td>{company.whatsappSituation?.statusLabel || company.whatsappCenter?.statusLabel || "Sem leitura"}</td>
                      <td>
                        <Link
                          href={action.href}
                          target={action.href.startsWith("https://") ? "_blank" : undefined}
                          rel={action.href.startsWith("https://") ? "noreferrer" : undefined}
                          className="btn btn-secondary btn-sm"
                        >
                          {action.label}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!actionCompanies.length ? <div className={styles.emptyPanel}>Nenhuma empresa neste filtro agora.</div> : null}
          </div>
        </section>

      </div>
    </DashboardScaffold>
  );
}
