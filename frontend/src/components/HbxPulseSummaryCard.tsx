"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/app/_lib/api";

type PulseSegment = {
  segment?: string | null;
  count?: number | null;
  estimatedPotentialValue?: number | null;
};

type PulseSummary = {
  ok?: boolean;
  whatsappText?: string | null;
  metrics?: {
    stalledCards?: number | null;
    overdueReturns?: number | null;
    leadsWithoutFirstContact?: number | null;
    pendingActivationClients?: number | null;
    pendingCommissionAmount?: number | null;
    estimatedPotentialValue?: number | null;
    opportunitiesBySegment?: PulseSegment[];
  } | null;
};

type HbxPulseSummaryCardProps = {
  mode?: "mobile" | "desktop";
  refreshKey?: number;
  className?: string;
};

function numeric(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: unknown) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(Math.max(0, numeric(value)));
}

function nextBestStep(summary: PulseSummary | null) {
  const metrics = summary?.metrics || {};
  const overdue = numeric(metrics.overdueReturns);
  const firstContact = numeric(metrics.leadsWithoutFirstContact);
  const pendingActivation = numeric(metrics.pendingActivationClients);
  const stalled = numeric(metrics.stalledCards);

  if (overdue > 0) return `Chamar ${overdue} retorno(s) vencido(s) antes de abrir novos cards.`;
  if (firstContact > 0) return `Fazer primeiro contato em ${firstContact} lead(s) ainda sem abordagem.`;
  if (pendingActivation > 0) return `Confirmar ${pendingActivation} cliente(s) em pending activation.`;
  if (stalled > 0) return "Revisar cards parados e registrar o próximo retorno de cada um.";
  return "Manter a carteira limpa e revisar segmentos com potencial.";
}

export default function HbxPulseSummaryCard({
  mode = "desktop",
  refreshKey = 0,
  className = "",
}: HbxPulseSummaryCardProps) {
  const [summary, setSummary] = useState<PulseSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    apiFetch<PulseSummary>("/pulse/summary")
      .then((payload) => {
        if (!alive) return;
        setSummary(payload || null);
      })
      .catch(() => {
        if (!alive) return;
        setSummary(null);
        setError("Pulse indisponível agora.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const metrics = summary?.metrics || {};
  const topSegment = useMemo(() => {
    const segment = (metrics.opportunitiesBySegment || [])[0];
    if (!segment?.segment) return null;
    return `${segment.segment} (${numeric(segment.count)})`;
  }, [metrics.opportunitiesBySegment]);
  const step = nextBestStep(summary);

  async function copySummary() {
    const text = String(summary?.whatsappText || "").trim();
    if (!text || typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
  }

  const isMobile = mode === "mobile";
  const rootClass = isMobile
    ? `hbx-mobile-card grid gap-3 ${className}`.trim()
    : `panel rounded-[20px] p-4 md:p-5 ${className}`.trim();
  const mutedClass = isMobile ? "text-[var(--hbx-mobile-muted)]" : "text-muted";
  const metricGridClass = isMobile
    ? "grid grid-cols-3 gap-2 text-sm"
    : "grid grid-cols-1 gap-3 sm:grid-cols-3";
  const metricClass = isMobile
    ? "min-w-0 border-l border-[var(--hbx-mobile-border)] pl-3 first:border-l-0 first:pl-0"
    : "min-w-0 border-l border-[var(--line)] pl-3 first:border-l-0 first:pl-0";
  const buttonClass = isMobile ? "hbx-mobile-secondary-button" : "btn btn-secondary btn-sm";

  return (
    <section className={rootClass} aria-label="HBX Pulse dinheiro parado">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={isMobile ? "text-xs font-bold uppercase text-[var(--hbx-mobile-primary)]" : "badge badge-brand"}>
            HBX Pulse
          </span>
          <h2 className={isMobile ? "mt-1 text-lg font-semibold" : "mt-2 text-lg font-semibold"}>
            Dinheiro parado hoje
          </h2>
          <p className={`mt-1 text-sm ${mutedClass}`}>{loading ? "Calculando carteira..." : step}</p>
        </div>
        <button
          type="button"
          className={buttonClass}
          disabled={loading || !summary?.whatsappText}
          onClick={() => void copySummary()}
        >
          {copied ? "Copiado" : "Copiar resumo"}
        </button>
      </div>

      <div className={metricGridClass}>
        <div className={metricClass}>
          <span className={`block text-xs ${mutedClass}`}>Cards parados</span>
          <strong className="block text-lg">{loading ? "..." : numeric(metrics.stalledCards)}</strong>
        </div>
        <div className={metricClass}>
          <span className={`block text-xs ${mutedClass}`}>Retornos vencidos</span>
          <strong className="block text-lg">{loading ? "..." : numeric(metrics.overdueReturns)}</strong>
        </div>
        <div className={metricClass}>
          <span className={`block text-xs ${mutedClass}`}>Pending activation</span>
          <strong className="block text-lg">{loading ? "..." : numeric(metrics.pendingActivationClients)}</strong>
        </div>
      </div>

      <div className={`flex flex-wrap items-center gap-2 text-xs ${mutedClass}`}>
        <span>Potencial: <strong>{formatCurrency(metrics.estimatedPotentialValue)}</strong></span>
        <span>Comissão pendente: <strong>{formatCurrency(metrics.pendingCommissionAmount)}</strong></span>
        {topSegment ? <span>Segmento: <strong>{topSegment}</strong></span> : null}
        {error ? <span>{error}</span> : null}
      </div>
    </section>
  );
}
