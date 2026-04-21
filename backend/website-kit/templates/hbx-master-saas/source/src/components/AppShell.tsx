import { Link, NavLink } from 'react-router-dom'
import { type PropsWithChildren } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTenant } from '../contexts/TenantContext'
import { formatRelativeTime } from '../lib/formatters'
import { StatusPill } from './StatusPill'

export function AppShell({ title, subtitle, children }: PropsWithChildren<{ title: string; subtitle: string }>) {
  const { signOut } = useAuth()
  const { snapshot } = useTenant()

  const trialRemaining = snapshot ? formatRelativeTime(snapshot.billing.trialEndsAt) : '0 min'
  const isMaster = snapshot?.viewer.role === 'master'

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Link className="brand-lockup" to="/">
          <span className="brand-lockup__mark">HBX</span>
          <span>
            <strong>HBX SaaS</strong>
            <small>Master e Recovery</small>
          </span>
        </Link>
        <nav className="app-nav">
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/modulos">Modulos</NavLink>
          {isMaster ? <NavLink to="/master">Area Master</NavLink> : null}
        </nav>
        <div className="sidebar-card">
          <span className="eyebrow">Tenant atual</span>
          <strong>{snapshot?.company.tradeName ?? 'HBX'}</strong>
          <p>{snapshot?.viewer.email ?? 'Sem sessao ativa'}</p>
          <StatusPill
            label={snapshot?.billing.subscriptionStatus ?? 'Sem status'}
            tone={snapshot?.billing.premiumAccess ? 'success' : 'warning'}
          />
        </div>
        <button className="button button-secondary" type="button" onClick={() => void signOut()}>
          Sair
        </button>
      </aside>
      <div className="app-main">
        <header className="app-header">
          <div>
            <span className="eyebrow">Base SaaS pronta para backend NestJS</span>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <div className="header-summary">
            <span>Trial restante</span>
            <strong>{trialRemaining}</strong>
          </div>
        </header>
        <main className="app-content">{children}</main>
      </div>
    </div>
  )
}
