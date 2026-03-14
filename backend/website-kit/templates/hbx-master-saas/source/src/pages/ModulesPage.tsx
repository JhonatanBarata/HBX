import { AppShell } from '../components/AppShell'
import { LoadingScreen } from '../components/LoadingScreen'
import { ModuleCard } from '../components/ModuleCard'
import { useTenant } from '../contexts/TenantContext'

export function ModulesPage() {
  const { snapshot, loading } = useTenant()

  if (loading || !snapshot) {
    return <LoadingScreen label="Organizando modulos..." />
  }

  return (
    <AppShell
      title="Modulos do HBX"
      subtitle="O frontend ja separa o que esta liberado, em preparacao e restrito por perfil."
    >
      <div className="module-grid">
        {snapshot.modules.map((module) => (
          <ModuleCard key={module.slug} module={module} />
        ))}
      </div>
    </AppShell>
  )
}
