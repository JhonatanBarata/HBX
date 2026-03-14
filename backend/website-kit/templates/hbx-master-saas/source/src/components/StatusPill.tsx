interface StatusPillProps {
  label: string
  tone?: 'success' | 'warning' | 'neutral' | 'danger'
}

export function StatusPill({ label, tone = 'neutral' }: StatusPillProps) {
  return <span className={`status-pill status-pill--${tone}`}>{label}</span>
}
