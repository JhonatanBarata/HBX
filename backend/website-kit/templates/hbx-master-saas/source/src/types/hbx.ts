export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'expired'

export type UserRole = 'master' | 'user'

export type ModuleSlug = 'master' | 'recovery' | 'music'

export interface ViewerProfile {
  uid: string
  name: string
  email: string
  role: UserRole
  companyId: string
}

export interface CompanySnapshot {
  id: string
  legalName: string
  tradeName: string
  document: string
  contactEmail: string
  contactPhone: string
  companyId: string
}

export interface BillingSnapshot {
  subscriptionStatus: SubscriptionStatus
  trialStartsAt: string
  trialEndsAt: string
  currentPeriodEnd: string | null
  premiumAccess: boolean
  billingProvider: string
  paymentMethodLabel: string
}

export interface ModuleAccess {
  slug: ModuleSlug
  name: string
  description: string
  enabled: boolean
  href: string
  audience: 'master' | 'operacao' | 'todos'
  statusLabel: string
}

export interface DashboardMetric {
  label: string
  value: string
  helper: string
}

export interface TenantSnapshot {
  source: 'mock' | 'api'
  viewer: ViewerProfile
  company: CompanySnapshot
  billing: BillingSnapshot
  modules: ModuleAccess[]
  metrics: DashboardMetric[]
}
