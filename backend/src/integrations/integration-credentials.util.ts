import { IntegrationProviderId, getIntegrationProviderModel, normalizeIntegrationProvider } from './integration-provider.types';

export type IntegrationCredentialEnvelope = {
  version: 2;
  provider: IntegrationProviderId;
  credentials: {
    token: string | null;
    appKey: string | null;
  };
  config: {
    authMode: string | null;
    baseUrl: string | null;
    externalAccountId: string | null;
  };
};

export type IntegrationCredentialEnvelopeInput = {
  token?: unknown;
  appKey?: unknown;
  authMode?: unknown;
  baseUrl?: unknown;
  externalAccountId?: unknown;
};

function normalizeText(value: unknown) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

export function buildIntegrationCredentialEnvelope(providerRaw: unknown, input?: IntegrationCredentialEnvelopeInput | unknown) {
  const provider = normalizeIntegrationProvider(providerRaw);
  if (!provider) return null;

  const normalizedInput =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as IntegrationCredentialEnvelopeInput)
      : { token: input };

  return {
    version: 2 as const,
    provider,
    credentials: {
      token: normalizeText(normalizedInput.token),
      appKey: normalizeText(normalizedInput.appKey),
    },
    config: {
      authMode: normalizeText(normalizedInput.authMode),
      baseUrl: normalizeText(normalizedInput.baseUrl),
      externalAccountId: normalizeText(normalizedInput.externalAccountId),
    },
  };
}

export function parseIntegrationCredentialEnvelope(providerRaw: unknown, decryptedSecret: unknown): IntegrationCredentialEnvelope | null {
  const provider = normalizeIntegrationProvider(providerRaw);
  const normalized = normalizeText(decryptedSecret);
  if (!provider || !normalized) return buildIntegrationCredentialEnvelope(provider, normalized);

  try {
    const parsed = JSON.parse(normalized) as Partial<IntegrationCredentialEnvelope> & {
      credentials?: { token?: unknown; appKey?: unknown };
      config?: { authMode?: unknown; baseUrl?: unknown; externalAccountId?: unknown };
      token?: unknown;
      appKey?: unknown;
      authMode?: unknown;
      baseUrl?: unknown;
      externalAccountId?: unknown;
    };
    const parsedProvider = normalizeIntegrationProvider(parsed?.provider || provider) || provider;
    const token = normalizeText(parsed?.credentials?.token ?? parsed?.token);
    const appKey = normalizeText(parsed?.credentials?.appKey ?? parsed?.appKey);
    const authMode = normalizeText(parsed?.config?.authMode ?? parsed?.authMode);
    const baseUrl = normalizeText(parsed?.config?.baseUrl ?? parsed?.baseUrl);
    const externalAccountId = normalizeText(parsed?.config?.externalAccountId ?? parsed?.externalAccountId);
    return buildIntegrationCredentialEnvelope(parsedProvider, {
      token,
      appKey,
      authMode,
      baseUrl,
      externalAccountId,
    });
  } catch {
    return buildIntegrationCredentialEnvelope(provider, normalized);
  }
}

export function serializeIntegrationCredentialEnvelope(envelope: IntegrationCredentialEnvelope | null) {
  if (!envelope) return null;
  return JSON.stringify(envelope);
}

export function buildIntegrationSecretPreview(providerRaw: unknown, envelope: IntegrationCredentialEnvelope | null) {
  const provider = normalizeIntegrationProvider(providerRaw);
  const model = getIntegrationProviderModel(providerRaw);
  const token = normalizeText(envelope?.credentials?.token);
  if (!provider || !token) return null;
  const label = model?.credentialFields[0]?.key || 'token';
  return `${label}: ***${token.slice(-6)}`;
}

export function buildIntegrationCredentialSummary(providerRaw: unknown, envelope: IntegrationCredentialEnvelope | null) {
  const model = getIntegrationProviderModel(providerRaw);
  const token = normalizeText(envelope?.credentials?.token);
  const appKey = normalizeText(envelope?.credentials?.appKey);
  return {
    configured: Boolean(token),
    fields: (model?.credentialFields || []).map((field) => ({
      key: field.key,
      label: field.label,
      configured: field.key === 'token' ? Boolean(token) : field.key === 'appKey' ? Boolean(appKey) : false,
    })),
  };
}

export function buildIntegrationConnectionConfigSummary(envelope: IntegrationCredentialEnvelope | null) {
  return {
    authMode: normalizeText(envelope?.config?.authMode),
    baseUrl: normalizeText(envelope?.config?.baseUrl),
    externalAccountId: normalizeText(envelope?.config?.externalAccountId),
  };
}

export function resolvePrimaryIntegrationSecret(providerRaw: unknown, decryptedSecret: unknown) {
  return parseIntegrationCredentialEnvelope(providerRaw, decryptedSecret)?.credentials?.token || null;
}