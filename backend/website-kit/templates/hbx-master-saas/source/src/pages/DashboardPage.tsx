import { AppShell } from '../components/AppShell'
import { KpiCard } from '../components/KpiCard'
import { LoadingScreen } from '../components/LoadingScreen'
import { ModuleCard } from '../components/ModuleCard'
import { useTenant } from '../contexts/TenantContext'
import { formatDate, formatRelativeTime } from '../lib/formatters'

export function DashboardPage() {
  const { snapshot, loading, source } = useTenant()

  if (loading || !snapshot) {
    return <LoadingScreen label="Montando dashboard SaaS..." />
  }

  return (
    <AppShell
      title="Dashboard HBX"
      subtitle="Visao geral do tenant, assinatura e modulos liberados para a operacao."
    >
      <section className="section-stack">
        <article className="summary-banner">
          <div>
            <span className="eyebrow">Origem dos dados</span>
            <h2>{source === 'api' ? 'Conectado ao backend NestJS' : 'Mock temporario do frontend'}</h2>
            <p>
              companyId atual: <strong>{snapshot.viewer.companyId}</strong>. Trial termina em{' '}
              <strong>{formatRelativeTime(snapshot.billing.trialEndsAt)}</strong> (
              {formatDate(snapshot.billing.trialEndsAt)}).
            </p>
          </div>
          <div className="summary-banner__meta">
            <span>Provider</span>
            <strong>{snapshot.billing.billingProvider}</strong>
          </div>
        </article>

        <div className="kpi-grid">
          {snapshot.metrics.map((metric) => (
            <KpiCard key={metric.label} label={metric.label} value={metric.value} helper={metric.helper} />
          ))}
        </div>

        <div className="content-grid">
          <article className="panel-card">
            <span className="eyebrow">Empresa atual</span>
            <h2>{snapshot.company.tradeName}</h2>
            <dl className="details-list">
              <div>
                <dt>Razao social</dt>
                <dd>{snapshot.company.legalName}</dd>
              </div>
              <div>
                <dt>Contato</dt>
                <dd>{snapshot.company.contactEmail}</dd>
              </div>
              <div>
                <dt>Telefone</dt>
                <dd>{snapshot.company.contactPhone}</dd>
              </div>
              <div>
                <dt>Documento</dt>
                <dd>{snapshot.company.document}</dd>
              </div>
            </dl>
          </article>
          <article className="panel-card">
            <span className="eyebrow">Assinatura</span>
            <h2>Status e governanca</h2>
            <dl className="details-list">
              <div>
                <dt>Status</dt>
                <dd>{snapshot.billing.subscriptionStatus}</dd>
              </div>
              <div>
                <dt>Premium</dt>
                <dd>{snapshot.billing.premiumAccess ? 'Liberado' : 'Bloqueado'}</dd>
              </div>
              <div>
                <dt>Trial</dt>
                <dd>{formatDate(snapshot.billing.trialEndsAt)}</dd>
              </div>
              <div>
                <dt>Metodo previsto</dt>
                <dd>{snapshot.billing.paymentMethodLabel}</dd>
              </div>
            </dl>
          </article>
        </div>

        <section className="module-grid">
          {snapshot.modules.map((module) => (
            <ModuleCard key={module.slug} module={module} />
          ))}
        </section>
      </section>
    </AppShell>
  )
}
