"use client";

import styles from "../page.module.css";
import type { RecoveryTrendPoint } from "../recovery-model";

type RecoveryChartProps = {
  points: RecoveryTrendPoint[];
};

export default function RecoveryChart({ points }: RecoveryChartProps) {
  if (points.length === 0) {
    return null;
  }

  const width = 660;
  const height = 248;
  const paddingX = 28;
  const paddingY = 24;

  let minValue = points[0].amount;
  let maxValue = points[0].amount;

  for (const point of points) {
    if (point.amount < minValue) minValue = point.amount;
    if (point.amount > maxValue) maxValue = point.amount;
  }

  const safeMin = Math.min(minValue, 0);
  const range = Math.max(1, maxValue - safeMin);
  const stepX =
    points.length > 1 ? (width - paddingX * 2) / (points.length - 1) : width / 2;
  const baselineY = height - paddingY;

  const coords = points.map((point, index) => {
    const x = paddingX + stepX * index;
    const normalized = (point.amount - safeMin) / range;
    const y = baselineY - normalized * (height - paddingY * 2);
    return { ...point, x, y };
  });

  const linePath = coords
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const firstPoint = coords[0];
  const lastPoint = coords[coords.length - 1];
  const areaPath = `${linePath} L ${lastPoint.x} ${baselineY} L ${firstPoint.x} ${baselineY} Z`;
  const guideLines = [0.2, 0.45, 0.7, 0.95];

  return (
    <div className={styles.chartSurface}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={styles.chartSvg}
        role="img"
        aria-label="Linha do tempo da inadimplencia"
      >
        {guideLines.map((line) => {
          const y = paddingY + (height - paddingY * 2) * line;
          return (
            <line
              key={line}
              x1={paddingX}
              x2={width - paddingX}
              y1={y}
              y2={y}
              className={styles.chartGridLine}
            />
          );
        })}

        <path d={areaPath} className={styles.chartArea} />
        <path d={linePath} className={styles.chartLine} />

        {coords.map((point, index) => {
          const strongPoint = index === 0 || index === coords.length - 1;
          return (
            <g key={point.id}>
              <circle
                cx={point.x}
                cy={point.y}
                r={strongPoint ? 5 : 4}
                className={`${styles.chartPoint} ${
                  strongPoint ? styles.chartPointStrong : ""
                }`}
              />
              <text x={point.x} y={baselineY + 20} textAnchor="middle" className={styles.chartAxis}>
                {point.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className={styles.chartLegend}>
        {points.map((point) => (
          <div key={point.id} className={styles.chartLegendItem}>
            <span className={styles.chartLegendLabel}>{point.label}</span>
            <strong className={styles.chartLegendValue}>
              {point.amount.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
                maximumFractionDigits: 0,
              })}
            </strong>
            <span className={styles.chartLegendNote}>{point.note}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
