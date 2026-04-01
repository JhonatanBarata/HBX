export const INTEGRATION_PROVIDER_IDS = ['AUVO', 'TAGPLUS'] as const;

export type IntegrationProviderId = (typeof INTEGRATION_PROVIDER_IDS)[number];

export type IntegrationProviderModel = {
  id: IntegrationProviderId;
  label: string;
  category: 'field_service' | 'erp';
  adapterMode: 'scaffold' | 'real-http';
  syncTargets: Array<'CustomerProfile' | 'DebtCase' | 'AuvoExternalRecord'>;
  credentialFields: Array<{
    key: 'token' | 'appKey';
    label: string;
    required: boolean;
    secret: boolean;
  }>;
  connectionFields: Array<{
    key: 'baseUrl' | 'authMode' | 'externalAccountId';
    label: string;
    required: boolean;
    secret: false;
  }>;
  notes: string[];
};

export const INTEGRATION_PROVIDER_MODELS: Record<IntegrationProviderId, IntegrationProviderModel> = {
  AUVO: {
    id: 'AUVO',
    label: 'AUVO',
    category: 'field_service',
    adapterMode: 'real-http',
    syncTargets: ['CustomerProfile', 'DebtCase', 'AuvoExternalRecord'],
    credentialFields: [
      {
        key: 'token',
        label: 'Token AUVO',
        required: true,
        secret: true,
      },
      {
        key: 'appKey',
        label: 'App Key AUVO',
        required: false,
        secret: true,
      },
    ],
    connectionFields: [
      {
        key: 'baseUrl',
        label: 'Base URL AUVO',
        required: false,
        secret: false,
      },
      {
        key: 'authMode',
        label: 'Modo de autenticacao AUVO',
        required: false,
        secret: false,
      },
      {
        key: 'externalAccountId',
        label: 'Conta externa AUVO',
        required: false,
        secret: false,
      },
    ],
    notes: [
      'Adapter HTTP real usa contrato assumido explicito e ajustavel por ambiente.',
      'Sem documentacao oficial versionada no repo, endpoints e auth mode ficam isolados em runtime/config.',
    ],
  },
  TAGPLUS: {
    id: 'TAGPLUS',
    label: 'TagPlus',
    category: 'erp',
    adapterMode: 'real-http',
    syncTargets: ['CustomerProfile', 'DebtCase'],
    credentialFields: [
      {
        key: 'token',
        label: 'Token TagPlus',
        required: true,
        secret: true,
      },
    ],
    connectionFields: [
      {
        key: 'baseUrl',
        label: 'Base URL TagPlus',
        required: false,
        secret: false,
      },
      {
        key: 'authMode',
        label: 'Modo de autenticacao TagPlus',
        required: false,
        secret: false,
      },
      {
        key: 'externalAccountId',
        label: 'Conta externa TagPlus',
        required: false,
        secret: false,
      },
    ],
    notes: [
      'Adapter HTTP real usa contrato assumido explicito e ajustavel por ambiente.',
      'Sem documentacao oficial versionada no repo, endpoints e auth mode ficam isolados em runtime/config.',
    ],
  },
};

export function isIntegrationProviderId(value: unknown): value is IntegrationProviderId {
  return INTEGRATION_PROVIDER_IDS.includes(String(value || '').trim().toUpperCase() as IntegrationProviderId);
}

export function normalizeIntegrationProvider(value: unknown): IntegrationProviderId | null {
  const normalized = String(value || '').trim().toUpperCase();
  return isIntegrationProviderId(normalized) ? normalized : null;
}

export function getIntegrationProviderModel(value: unknown): IntegrationProviderModel | null {
  const provider = normalizeIntegrationProvider(value);
  return provider ? INTEGRATION_PROVIDER_MODELS[provider] : null;
}