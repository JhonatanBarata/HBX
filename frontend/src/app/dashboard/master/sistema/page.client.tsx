"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "../../_lib/api";
import { useRequireAuth } from "../../_lib/useRequireAuth";

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
        title="Saúde do Sistema"
        description="Acesso exclusivo do usuário MASTER."
        actions={<Link href="/dashboard/master" className="btn btn-secondary btn-sm">Voltar ao Master</Link>}
      >
        <section className="panel p-4">
          <p className="text-sm text-muted">Seu usuário não tem permissão para acessar esta tela.</p>
        </section>
      </DashboardScaffold>
    );
  }

  return (
    <DashboardScaffold
      title="Saúde do Sistema"
      description="Consulta on-demand das métricas atuais da VPS e serviços HBX."
      actions={
        <div className="flex flex-wrap gap-2 justify-end">
          <button type="button" className="btn btn-primary btn-sm" onClick={loadHealth} disabled={loading}>
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
          <Link href="/dashboard/master" className="btn btn-secondary btn-sm">
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

      <section className="panel p-4 mt-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Containers</h2>
            <p className="text-sm text-muted mt-1">
              {data?.containers?.note || "docker stats --no-stream para hbx-backend, hbx-postgres e webscraping."}
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
