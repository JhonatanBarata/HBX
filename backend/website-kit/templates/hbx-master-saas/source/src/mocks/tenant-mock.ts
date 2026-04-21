import type { TenantSnapshot, ViewerProfile } from '../types/hbx'

const trialEnd = new Date(Date.now() + 1000 * 60 * 60 * 24 * 12).toISOString()
const trialStart = new Date(Date.now() - 1000 * 60 * 60 * 24 * 18).toISOString()
const periodEnd = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString()

export function buildMockTenant(viewer?: Partial<ViewerProfile>): TenantSnapshot {
  const resolvedViewer: ViewerProfile = {
    uid: viewer?.uid ?? 'mock-user',
    name: viewer?.name ?? 'Jhonatan Barata',
    email: viewer?.email ?? 'barataimports@gmail.com',
    role: viewer?.role ?? 'master',
    companyId: viewer?.companyId ?? 'hbx-demo',
  }

  return {
    source: 'mock',
    viewer: resolvedViewer,
    company: {
      id: 'company-hbx-001',
      legalName: 'HBX Solutions Ltda.',
      tradeName: 'HBX',
      document: '00.000.000/0001-00',
      contactEmail: 'contato@hbx.app',
      contactPhone: '(19) 99702-4884',
      companyId: resolvedViewer.companyId,
    },
    billing: {
      subscriptionStatus: 'trialing',
      trialStartsAt: trialStart,
      trialEndsAt: trialEnd,
      currentPeriodEnd: periodEnd,
      premiumAccess: true,
      billingProvider: 'mercado_pago',
      paymentMethodLabel: 'Cartao principal do cliente',
    },
    metrics: [
      {
        label: 'Clientes monitorados',
        value: '128',
        helper: 'Base pronta para multi-tenant por companyId',
      },
      {
        label: 'Fluxos ativos',
        value: '2',
        helper: 'Master e Recovery preparados na mesma base',
      },
      {
        label: 'Tempo restante de trial',
        value: '12 dias',
        helper: 'Exibicao futura vinda do backend',
      },
      {
        label: 'Status da assinatura',
        value: 'trialing',
        helper: 'Fonte principal sera o NestJS + Mercado Pago',
      },
    ],
    modules: [
      {
        slug: 'master',
        name: 'HBX Master',
        description: 'Controle de clientes, trial, assinatura e visao operacional do SaaS.',
        enabled: true,
        href: '/master',
        audience: 'master',
        statusLabel: 'Liberado para master',
      },
      {
        slug: 'recovery',
        name: 'HBX Recovery',
        description: 'Automacao de cobranca com score, templates e acompanhamento de retorno.',
        enabled: true,
        href: '/modulos',
        audience: 'operacao',
        statusLabel: 'Ativo para a operacao',
      },
    ],
  }
}
