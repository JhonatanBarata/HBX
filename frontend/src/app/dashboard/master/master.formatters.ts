import type { SummaryMetric } from "./master.types";

export function formatCurrency(value?: number | null) {
  const numericValue = Number(value || 0);
  return numericValue.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function metricValue(metric?: SummaryMetric) {
  if (!metric) return "-";
  return metric.kind === "currency"
    ? formatCurrency(metric.value)
    : metric.value.toLocaleString("pt-BR");
}

export function metricDelta(metric?: SummaryMetric) {
  if (!metric || metric.delta == null || metric.previousValue == null) return "Sem base anterior";
  const sign = metric.delta > 0 ? "+" : metric.delta < 0 ? "-" : "";
  const deltaValue =
    metric.kind === "currency"
      ? formatCurrency(Math.abs(metric.delta))
      : Math.abs(metric.delta).toLocaleString("pt-BR");
  return `${sign}${deltaValue} vs. mês anterior`;
}
