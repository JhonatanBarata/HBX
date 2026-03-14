import { AppShell } from '../components/AppShell'
import { LoadingScreen } from '../components/LoadingScreen'
import { StatusPill } from '../components/StatusPill'
import { useTenant } from '../contexts/TenantContext'

export function MasterPage() {
  const { snapshot, loading } = useTenant()

  if (loading || !snapshot) {
    return <LoadingScreen label="Abrindo area master..." />
  }

  if (snapshot.viewer.role !== 'master') {
    return (
      <AppShell title="Area Master" subtitle="Acesso reservado ao perfil master.">
        <article className="panel-card">
          <h2>Sem permissao neste tenant</h2>
          <p>
            O backend NestJS vai consolidar esse controle por role, modulo e companyId. No frontend,
            a rota ja fica preparada para esconder a area de quem nao for master.
          </p>
        </article>
      </AppShell>
    )
  }

  return (
    <AppShell
      title="Area Master"
      subtitle="Camada de governanca para clientes, trial, billing e liberacao de modulos."
    >
      <div className="content-grid">
        <article className="panel-card">
          <span className="eyebrow">Conta atual</span>
          <h2>{snapshot.company.tradeName}</h2>
          <p>
            Esta area concentra o que um SaaS precisa enxergar: tenant, assinatura, metodo de
            pagamento, status do trial e o que cada empresa pode usar.
          </p>
          <div className="pill-row">
            <StatusPill label={`companyId: ${snapshot.company.companyId}`} />
            <StatusPill label={snapshot.billing.subscriptionStatus} tone="success" />
          </div>
        </article>

        <article className="panel-card">
          <span className="eyebrow">Proximos endpoints</span>
          <h2>Contratos ja preparados</h2>
          <ul className="plain-list">
            <li>/auth/me resolve o usuario autenticado e seu role.</li>
            <li>/companies/current devolve o tenant atual.</li>
            <li>/billing/status concentra trial e assinatura.</li>
            <li>/modules/list define o que fica liberado por tenant.</li>
          </ul>
        </article>
      </div>

      <div className="content-grid">
        <article className="panel-card">
          <span className="eyebrow">Estrutura SaaS</span>
          <h2>Decisoes que ja estao refletidas no frontend</h2>
          <ul className="plain-list">
            <li>Frontend no Firebase Hosting, desacoplado do backend principal.</li>
            <li>Backend NestJS como fonte de verdade para autorizacao e regras.</li>
            <li>PostgreSQL como banco principal do core.</li>
            <li>Mercado Pago e webhooks idempotentes somente no backend.</li>
            <li>companyId como eixo do multi-tenant.</li>
          </ul>
        </article>

        <article className="panel-card">
          <span className="eyebrow">Pendencias do backend</span>
          <h2>O que ainda sera conectado</h2>
          <ul className="plain-list">
            <li>Provisionamento real de empresas e usuarios.</li>
            <li>Resolucao de assinatura ativa, inadimplencia e cancelamento.</li>
            <li>Lista de modulos por plano e por tenant.</li>
            <li>Validacao server-side do token Firebase.</li>
          </ul>
        </article>
      </div>
    </AppShell>
  )
}
