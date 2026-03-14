import type {
  BillingSnapshot,
  CompanySnapshot,
  ModuleAccess,
  ViewerProfile,
} from '../types/hbx'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() || 'http://localhost:3000'

interface ApiClientOptions {
  getToken?: () => Promise<string | null>
}

interface RequestOptions extends RequestInit {
  skipAuth?: boolean
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
  getToken?: ApiClientOptions['getToken'],
) {
  const headers = new Headers(options.headers)

  if (!options.skipAuth && getToken) {
    const token = await getToken()
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
  }

  headers.set('Content-Type', 'application/json')

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    throw new Error(`Falha ao carregar ${path}: ${response.status}`)
  }

  return (await response.json()) as T
}

export function createApiClient(options: ApiClientOptions = {}) {
  return {
    baseUrl: apiBaseUrl,
    getMe: () => request<ViewerProfile>('/auth/me', {}, options.getToken),
    getBillingStatus: () =>
      request<BillingSnapshot>('/billing/status', {}, options.getToken),
    getCurrentCompany: () =>
      request<CompanySnapshot>('/companies/current', {}, options.getToken),
    getModules: () => request<ModuleAccess[]>('/modules/list', {}, options.getToken),
  }
}
