"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "@/app/_lib/api";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";

type HealthStatus = "ok" | "error" | "unavailable";

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
    status: HealthStatus;
    note?: string | null;
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
      completed: number;
      failed: number;
      exhausted: number;
    };
    engines: Array<{
      id: string;
      label: string;
      status: string;
      online: boolean;
      cardsFabricated: number;
      batches: number;
      duplicates: number;
      rejected: number;
      lastActivityAt?: string | null;
      lockUrl?: string | null;
      localhostInProduction?: boolean;
      lastError?: string | null;
    }>;
    alerts: Array<{
      id: string;
      severity: string;
      title: string;
      message: string;
      action?: string;
    }>;
  };
  nightFactory?: {
    enabled: boolean;
    status: string;
    nextWindow?: string | null;
    leadsEnrichedToday: number;
    premiumOpportunities: number;
    recoveryOpportunities: number;
    queue: number;
  };
  alerts?: Array<{
    id: string;
    severity: string;
    title: string;
    message: string;
    action?: string;
  }>;
};

type CurrentUser = {
  isSystemMaster?: boolean;
};

function formatKb(kb?: number | null) {
  const value = Number(kb || 0);
  if (!value) return "-";
  const gb = value / 1024 / 1024;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = value / 1024;
  return `${mb.toFixed(0)} MB`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

function statusLabel(status?: HealthStatus) {
  if (status === "ok") return "OK";
  if (status === "error") return "Erro";
  return "Indisponível";
}

function statusClass(status?: HealthStatus) {
  if (status === "ok") return "text-emerald-700";
  if (status === "error") return "text-red-700";
  return "text-muted";
}

function MetricCard({
  label,
  value,
  detail,
  status = "ok",
}: {
  label: string;
  value: string;
  detail?: string;
  status?: HealthStatus;
}) {
  return (
    <article className="panel p-4">
      <p className="text-xs uppercase tracking-[0.08em] font-semibold text-muted">{label}</p>
      <strong className="block text-2xl mt-2">{value}</strong>
      <p className={`text-sm mt-2 ${statusClass(status)}`}>{detail || statusLabel(status)}</p>
    </article>
  );
}

export default function SystemHealthClientPage() {
  const hasToken = useRequireAuth();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SystemHealthPayload | null>(null);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<SystemHealthPayload>("/admin/system-health", {
        requireAuth: true,
        timeoutMs: 15000,
      });
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar saúde do sistema.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasToken !== true) return;
    let mounted = true;

    async function checkAccessAndLoad() {
      setCheckingAccess(true);
      setError(null);
      try {
        const user = await apiFetch<CurrentUser>("/profile/current-user");
        if (!mounted) return;
        const isMaster = Boolean(user?.isSystemMaster);
        setAllowed(isMaster);
        if (isMaster) {
          await loadHealth();
        }
      } catch (err) {
        if (!mounted) return;
        setAllowed(false);
        setError(err instanceof Error ? err.message : "Falha ao validar acesso.");
      } finally {
        if (mounted) setCheckingAccess(false);
      }
    }

    void checkAccessAndLoad();
    return () => {
      mounted = false;
    };
  }, [hasToken, loadHealth]);

  const memoryValue = useMemo(() => {
    const parsed = data?.memory?.parsed;
    if (!parsed) return data?.memory?.status === "ok" ? "Disponível" : "-";
    const used = formatKb(parsed.usedKb);
    const total = formatKb(parsed.totalKb);
    const percent = parsed.usagePercent != null ? ` (${parsed.usagePercent}%)` : "";
    return `${used} / ${total}${percent}`;
  }, [data?.memory]);

  const loadValue = useMemo(() => {
    const parsed = data?.load?.parsed;
    if (!parsed) return data?.load?.raw || "-";
    return [parsed.oneMinute, parsed.fiveMinutes, parsed.fifteenMinutes].filter(Boolean).join(" / ") || "-";
  }, [data?.load]);

  if (hasToken === null || checkingAccess) {
    return (
      <main className="app-shell">
        <div className="app-container">
          <div className="panel p-4 text-sm text-muted">Carregando saúde do sistema...</div>
        </div>
      </main>
    );
  }

  if (!hasToken) return null;

  if (!allowed) {
    return (
      <DashboardScaffold
        title="Hostinger e Saúde do Sistema"
        description="Acesso exclusivo do usuário MASTER para verificar a VPS Hostinger."
        actions={<Link href="/master" className="btn btn-secondary btn-sm">Voltar ao Master</Link>}
      >
        <section className="panel p-4">
          <p className="text-sm text-muted">Seu usuário não tem permissão para acessar esta tela.</p>
        </section>
      </DashboardScaffold>
    );
  }

  return (
    <DashboardScaffold
      title="Hostinger e Saúde do Sistema"
      description="Consulta on-demand das métricas atuais da VPS Hostinger e serviços HBX."
      actions={
        <div className="flex flex-wrap gap-2 justify-end">
          <a href="https://api.hbxsystem.com.br/health" target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
            Health API
          </a>
          <button type="button" className="btn btn-primary btn-sm" onClick={loadHealth} disabled={loading}>
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
          <Link href="/master" className="btn btn-secondary btn-sm">
            Voltar ao Master
          </Link>
        </div>
      }
    >
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <MetricCard
          label="RAM"
          value={memoryValue}
          detail={data?.memory?.error || data?.memory?.source || "free -h / proc"}
          status={data?.memory?.status || "unavailable"}
        />
        <MetricCard
          label="CPU / Load"
          value={loadValue}
          detail={data?.load?.error || "1m / 5m / 15m"}
          status={data?.load?.status || "unavailable"}
        />
        <MetricCard
          label="Disco"
          value={data?.disk?.parsed?.usagePercent || "-"}
          detail={
            data?.disk?.parsed
              ? `${data.disk.parsed.used || "-"} usados de ${data.disk.parsed.size || "-"} em ${data.disk.parsed.mount || "/"}`
              : data?.disk?.error || "df -h /"
          }
          status={data?.disk?.status || "unavailable"}
        />
        <MetricCard
          label="Uptime"
          value={data?.uptime?.formatted || "-"}
          detail={data?.uptime?.error || "Uptime do sistema"}
          status={data?.uptime?.status || "unavailable"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-3">
        <MetricCard
          label="Postgres"
          value={statusLabel(data?.postgres?.status)}
          detail={data?.postgres?.error || `${data?.postgres?.responseMs ?? "-"} ms`}
          status={data?.postgres?.status || "unavailable"}
        />
        <MetricCard
          label="API"
          value={statusLabel(data?.api?.status)}
          detail={`${data?.api?.responseMs ?? "-"} ms`}
          status={data?.api?.status || "unavailable"}
        />
        <MetricCard
          label="Atualizado em"
          value={formatDateTime(data?.generatedAt)}
          detail="Sem atualização automática"
          status="ok"
        />
      </div>

      {(data?.alerts || []).length ? (
        <section className="panel p-4 mt-3 border-red-200 bg-red-50">
          <h2 className="text-lg font-semibold text-red-800">Alertas operacionais</h2>
          <div className="grid gap-2 mt-3">
            {data?.alerts?.map((alert) => (
              <div key={alert.id} className="rounded-[12px] border border-red-200 bg-white/70 p-3 text-sm text-red-800">
                <strong>{alert.title}</strong>
                <p className="mt-1">{alert.message}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel p-4 mt-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Produção Radar e Night Factory</h2>
            <p className="text-sm text-muted mt-1">
              {data?.production?.note || "Produção, filas e oportunidades geradas pelo servidor ocioso."}
            </p>
          </div>
          <Link href="/master/night-factory" className="btn btn-secondary btn-sm">Abrir Night Factory</Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mt-3">
          <MetricCard label="RadarLeadPool" value={String(data?.production?.radar.total ?? 0)} detail="Total no banco Radar" status={data?.production?.status || "unavailable"} />
          <MetricCard label="Cards hoje" value={String(data?.production?.radar.cardsToday ?? 0)} detail={`${data?.production?.radar.cardsLastHour ?? 0} na última hora`} status={data?.production?.status || "unavailable"} />
          <MetricCard label="Fila" value={`${data?.production?.queue.queued ?? 0} queued`} detail={`${data?.production?.queue.running ?? 0} running • ${data?.production?.queue.failed ?? 0} failed`} status={(data?.production?.queue.queued ?? 0) > 0 && (data?.production?.queue.running ?? 0) === 0 ? "error" : "ok"} />
          <MetricCard label="Night Factory" value={data?.nightFactory?.status || "-"} detail={`${data?.nightFactory?.premiumOpportunities ?? 0} premium • ${data?.nightFactory?.recoveryOpportunities ?? 0} recovery`} status={data?.nightFactory?.enabled ? "ok" : "unavailable"} />
        </div>
        <div className="overflow-auto mt-3">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-2 pr-3">Motor</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Cards</th>
                <th className="py-2 pr-3">Batches</th>
                <th className="py-2 pr-3">Duplicados/Rejeitados</th>
                <th className="py-2 pr-3">Lock URL</th>
              </tr>
            </thead>
            <tbody>
              {(data?.production?.engines || []).map((engine) => (
                <tr key={engine.id} className="border-t border-[var(--line)]">
                  <td className="py-2 pr-3 font-semibold">{engine.label || engine.id}</td>
                  <td className="py-2 pr-3">{engine.status}</td>
                  <td className="py-2 pr-3">{engine.cardsFabricated}</td>
                  <td className="py-2 pr-3">{engine.batches}</td>
                  <td className="py-2 pr-3">{engine.duplicates} / {engine.rejected}</td>
                  <td className={`py-2 pr-3 ${engine.localhostInProduction ? "text-red-700 font-semibold" : ""}`}>{engine.lockUrl || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel p-4 mt-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Containers</h2>
            <p className="text-sm text-muted mt-1">
              {data?.containers?.note || "docker stats --no-stream para backend, Postgres, webscraping, hbx-engine-1..4, frontend e proxy."}
            </p>
          </div>
          <span className={`text-sm font-semibold ${statusClass(data?.containers?.status)}`}>
            {statusLabel(data?.containers?.status)}
          </span>
        </div>
        <div className="overflow-auto mt-3">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-2 pr-3">Container</th>
                <th className="py-2 pr-3">CPU</th>
                <th className="py-2 pr-3">Memória</th>
                <th className="py-2 pr-3">Mem %</th>
                <th className="py-2 pr-3">Net I/O</th>
                <th className="py-2 pr-3">Block I/O</th>
                <th className="py-2 pr-3">PIDs</th>
              </tr>
            </thead>
            <tbody>
              {(data?.containers?.items || []).map((item) => (
                <tr key={item.name} className="border-t border-[var(--line)]">
                  <td className="py-2 pr-3 font-semibold">{item.name}</td>
                  <td className="py-2 pr-3">{item.cpu || "-"}</td>
                  <td className="py-2 pr-3">{item.memory || "-"}</td>
                  <td className="py-2 pr-3">{item.memoryPercent || "-"}</td>
                  <td className="py-2 pr-3">{item.netIo || "-"}</td>
                  <td className="py-2 pr-3">{item.blockIo || "-"}</td>
                  <td className="py-2 pr-3">{item.pids || "-"}</td>
                </tr>
              ))}
              {!data?.containers?.items?.length ? (
                <tr>
                  <td className="py-3 text-muted" colSpan={7}>
                    {loading ? "Carregando containers..." : "Nenhum dado de container disponível."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel p-4 mt-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Últimos erros do backend</h2>
            <p className="text-sm text-muted mt-1">
              {data?.errors?.note || "Linhas recentes filtradas do log local, com dados sensíveis mascarados."}
            </p>
          </div>
          <span className={`text-sm font-semibold ${statusClass(data?.errors?.status)}`}>
            {statusLabel(data?.errors?.status)}
          </span>
        </div>
        <pre className="mt-3 max-h-80 overflow-auto rounded-[12px] bg-[var(--surface-soft)] p-3 text-xs whitespace-pre-wrap">
          {(data?.errors?.lines || []).length
            ? data?.errors.lines.join("\n")
            : loading
              ? "Carregando erros..."
              : "Nenhum erro recente disponível."}
        </pre>
      </section>
    </DashboardScaffold>
  );
}
