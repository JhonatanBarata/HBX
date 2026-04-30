import type { PaymentPoint, RevenuePoint, SummaryMetric } from "../master.types";
import { formatCurrency, metricDelta, metricValue } from "../master.formatters";
import styles from "../page.module.css";

type PaymentMode = "approved" | "failed" | "manual" | "pending";

export function MetricCard({ title, metric, accent }: { title: string; metric?: SummaryMetric; accent?: string }) {
  return (
    <article className={styles.metricCard} data-accent={accent || "default"}>
      <div className={styles.metricCardHeader}>
        <p className={styles.metricEyebrow}>{title}</p>
        <span className={styles.metricTrend}>{metricDelta(metric)}</span>
      </div>
      <strong className={styles.metricValue}>{metricValue(metric)}</strong>
      {metric?.auxValue ? <span className={styles.metricAux}>Auxiliar: {formatCurrency(metric.auxValue)}</span> : null}
      <p className={styles.metricNote}>{metric?.note || "Sem dados consolidados."}</p>
    </article>
  );
}

export function RevenueChart({ points }: { points: RevenuePoint[] }) {
  if (!points.length) return <div className={styles.emptyPanel}>Sem histórico suficiente.</div>;

  const width = 860;
  const height = 280;
  const paddingX = 28;
  const paddingY = 28;
  const maxValue = Math.max(1, ...points.flatMap((point) => [point.received, point.projected, point.loss]));
  const stepX = points.length > 1 ? (width - paddingX * 2) / (points.length - 1) : width - paddingX * 2;
  const baselineY = height - paddingY;

  const build = (key: keyof RevenuePoint) =>
    points.map((point, index) => {
      const x = paddingX + stepX * index;
      const value = Number(point[key] || 0);
      const y = baselineY - (value / maxValue) * (height - paddingY * 2);
      return { x, y, label: point.label };
    });

  const received = build("received");
  const projected = build("projected");
  const loss = build("loss");
  const path = (items: Array<{ x: number; y: number }>) =>
    items.map((item, index) => `${index === 0 ? "M" : "L"} ${item.x} ${item.y}`).join(" ");
  const projectedArea = `${path(projected)} L ${projected[projected.length - 1]?.x || 0} ${baselineY} L ${projected[0]?.x || 0} ${baselineY} Z`;

  return (
    <div className={styles.chartCard}>
      <div className={styles.panelCardHeader}>
        <div>
          <p className={styles.sectionEyebrow}>Financeiro</p>
          <h3>Receita recebida, prevista e perda</h3>
        </div>
        <div className={styles.chartLegend}>
          <span><i className={styles.legendDot} data-tone="received" />Recebida</span>
          <span><i className={styles.legendDot} data-tone="projected" />Prevista</span>
          <span><i className={styles.legendDot} data-tone="loss" />Perda</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className={styles.chartSvg}>
        {[0.2, 0.45, 0.7, 0.95].map((guide) => {
          const y = paddingY + (height - paddingY * 2) * guide;
          return <line key={guide} x1={paddingX} x2={width - paddingX} y1={y} y2={y} className={styles.chartGrid} />;
        })}
        <path d={projectedArea} className={styles.chartProjectedArea} />
        <path d={path(projected)} className={styles.chartProjectedLine} />
        <path d={path(received)} className={styles.chartReceivedLine} />
        <path d={path(loss)} className={styles.chartLossLine} />
        {received.map((point) => (
          <g key={point.label}>
            <circle cx={point.x} cy={point.y} r={4.5} className={styles.chartPoint} />
            <text x={point.x} y={baselineY + 18} textAnchor="middle" className={styles.chartAxis}>
              {point.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function DistributionCard({
  title,
  eyebrow,
  points,
  currency = false,
}: {
  title: string;
  eyebrow: string;
  points: Array<{ label: string; value: number }>;
  currency?: boolean;
}) {
  const max = Math.max(1, ...points.map((point) => point.value));

  return (
    <div className={styles.panelCard}>
      <div className={styles.panelCardHeader}>
        <div>
          <p className={styles.sectionEyebrow}>{eyebrow}</p>
          <h3>{title}</h3>
        </div>
      </div>
      <div className={styles.distributionList}>
        {points.length ? (
          points.map((point) => (
            <div key={point.label} className={styles.distributionItem}>
              <div className={styles.distributionMeta}>
                <span>{point.label}</span>
                <strong>{currency ? formatCurrency(point.value) : point.value.toLocaleString("pt-BR")}</strong>
              </div>
              <div className={styles.distributionTrack}>
                <div className={styles.distributionFill} style={{ width: `${(point.value / max) * 100}%` }} />
              </div>
            </div>
          ))
        ) : (
          <div className={styles.emptyPanel}>Nenhum dado suficiente.</div>
        )}
      </div>
    </div>
  );
}

function paymentModeLabel(mode: PaymentMode) {
  if (mode === "approved") return "Aprovados";
  if (mode === "failed") return "Falhos";
  if (mode === "manual") return "Manuais";
  return "Pendentes";
}

export function PaymentChart({
  points,
  mode,
  onModeChange,
}: {
  points: PaymentPoint[];
  mode: PaymentMode;
  onModeChange: (mode: PaymentMode) => void;
}) {
  if (!points.length) return <div className={styles.emptyPanel}>Sem volume suficiente para pagamentos.</div>;

  const max = Math.max(1, ...points.map((point) => Number(point[mode] || 0)));

  return (
    <div className={styles.panelCard}>
      <div className={styles.panelCardHeader}>
        <div>
          <p className={styles.sectionEyebrow}>Pagamentos</p>
          <h3>{paymentModeLabel(mode)} por período</h3>
        </div>
        <div className={styles.filterChips}>
          {(["approved", "failed", "manual", "pending"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={mode === option ? styles.filterChipActive : styles.filterChip}
              onClick={() => onModeChange(option)}
            >
              {paymentModeLabel(option)}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.paymentBars}>
        {points.map((point) => {
          const value = Number(point[mode] || 0);
          return (
            <article key={`${point.id}-${mode}`} className={styles.paymentBar}>
              <div className={styles.paymentBarTrack}>
                <div
                  className={styles.paymentBarFill}
                  data-mode={mode}
                  style={{ height: `${Math.max(10, (value / max) * 100)}%` }}
                />
              </div>
              <strong className={styles.paymentBarValue}>{value.toLocaleString("pt-BR")}</strong>
              <span className={styles.paymentBarLabel}>{point.label}</span>
            </article>
          );
        })}
      </div>
      <p className={styles.paymentHint}>
        Alterne entre aprovados, falhos, manuais e pendentes para localizar rapidamente a pressão do funil de cobrança.
      </p>
    </div>
  );
}
