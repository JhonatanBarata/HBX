/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useState,
  type PropsWithChildren,
} from 'react'
import { useAuth } from './AuthContext'
import { createApiClient } from '../lib/api-client'
import { buildMockTenant } from '../mocks/tenant-mock'
import type { TenantSnapshot } from '../types/hbx'

interface TenantContextValue {
  snapshot: TenantSnapshot | null
  loading: boolean
  source: 'mock' | 'api' | null
  reload: () => Promise<void>
}

const TenantContext = createContext<TenantContextValue | null>(null)

async function loadTenantSnapshot(uidToken: string | null, userInfo: { uid: string; name: string; email: string }) {
  const api = createApiClient({
    getToken: async () => uidToken,
  })

  const [meResult, billingResult, companyResult, modulesResult] = await Promise.allSettled([
    api.getMe(),
    api.getBillingStatus(),
    api.getCurrentCompany(),
    api.getModules(),
  ])

  if (
    meResult.status === 'fulfilled' &&
    billingResult.status === 'fulfilled' &&
    companyResult.status === 'fulfilled' &&
    modulesResult.status === 'fulfilled'
  ) {
    return {
      source: 'api' as const,
      viewer: meResult.value,
      billing: billingResult.value,
      company: companyResult.value,
      modules: modulesResult.value,
      metrics: [
        {
          label: 'Tenant atual',
          value: meResult.value.companyId,
          helper: 'companyId resolvido pelo backend',
        },
        {
          label: 'Status da assinatura',
          value: billingResult.value.subscriptionStatus,
          helper: 'Mercado Pago e webhooks ficam no backend',
        },
        {
          label: 'Modulos liberados',
          value: String(modulesResult.value.filter((module) => module.enabled).length),
          helper: 'Lista devolvida por /modules/list',
        },
        {
          label: 'Origem dos dados',
          value: 'NestJS',
          helper: `API em ${api.baseUrl}`,
        },
      ],
    }
  }

  return buildMockTenant({
    uid: userInfo.uid,
    name: userInfo.name,
    email: userInfo.email,
  })
}

export function TenantProvider({ children }: PropsWithChildren) {
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [snapshot, setSnapshot] = useState<TenantSnapshot | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!user) {
      return
    }

    setLoading(true)
    const uidToken = await user.getIdToken().catch(() => null)
    const nextSnapshot = await loadTenantSnapshot(uidToken, {
      uid: user.uid,
      name: user.displayName ?? user.email?.split('@')[0] ?? 'Usuario HBX',
      email: user.email ?? 'usuario@hbx.app',
    })
    setSnapshot(nextSnapshot)
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (authLoading || !isAuthenticated || !user) {
      return
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
  }, [authLoading, isAuthenticated, user, reload])

  const value: TenantContextValue = {
    snapshot: isAuthenticated ? snapshot : null,
    loading: authLoading ? true : isAuthenticated ? loading : false,
    source: isAuthenticated ? snapshot?.source ?? null : null,
    reload,
  }

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}

export function useTenant() {
  const context = useContext(TenantContext)

  if (!context) {
    throw new Error('useTenant deve ser usado dentro de TenantProvider')
  }

  return context
}
