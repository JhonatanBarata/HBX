interface KpiCardProps {
  label: string
  value: string
  helper: string
}

export function KpiCard({ label, value, helper }: KpiCardProps) {
  return (
    <article className="kpi-card">
      <span className="kpi-card__label">{label}</span>
      <strong className="kpi-card__value">{value}</strong>
      <p className="kpi-card__helper">{helper}</p>
    </article>
  )
}
