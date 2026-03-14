import type { ModuleAccess } from '../types/hbx'
import { StatusPill } from './StatusPill'

export function ModuleCard({ module }: { module: ModuleAccess }) {
  return (
    <article className="module-card">
      <div className="module-card__header">
        <div>
          <span className="eyebrow">Modulo</span>
          <h3>{module.name}</h3>
        </div>
        <StatusPill
          label={module.statusLabel}
          tone={module.enabled ? 'success' : 'warning'}
        />
      </div>
      <p>{module.description}</p>
      <div className="module-card__footer">
        <span className="module-audience">Perfil: {module.audience}</span>
        <a className="text-link" href={module.href}>
          Abrir area
        </a>
      </div>
    </article>
  )
}
