type NullableString = string | null | undefined;

export type CompanyWhatsAppEndpointConfig = {
  id?: NullableString;
  label?: NullableString;
  moduleKey?: NullableString;
  whatsappNumber?: NullableString;
  whatsappPhoneNumberId?: NullableString;
  whatsappWabaId?: NullableString;
  whatsappAccessToken?: NullableString;
  whatsappDisplayNumber?: NullableString;
  isActive?: boolean | null;
  isPrimary?: boolean | null;
};

type CompanyConfig = {
  whatsappPhoneNumberId?: NullableString;
  whatsappAccessToken?: NullableString;
  whatsappWabaId?: NullableString;
  whatsappDisplayNumber?: NullableString;
  whatsappNumber?: NullableString;
  whatsappEndpoints?: CompanyWhatsAppEndpointConfig[] | null;
};

export type ResolveWhatsAppCredentialOptions = {
  endpointId?: NullableString;
  phoneNumberId?: NullableString;
  preferredModuleKey?: NullableString;
  sourceModule?: NullableString;
};

function normalize(value: NullableString): string {
  return String(value || '').trim();
}

export function normalizeModuleKeyFromSourceModule(sourceModuleRaw: NullableString) {
  const normalized = normalize(sourceModuleRaw).toLowerCase();
  if (!normalized) return '';
  if (normalized.startsWith('hbx_recovery') || normalized.includes('recovery')) return 'hbx_recovery';
  if (normalized.startsWith('atendimento')) return 'atendimento';
  return '';
}

export function allowGlobalCredentialFallback(): boolean {
  const env = String(process.env.WHATSAPP_ALLOW_GLOBAL_CREDENTIAL_FALLBACK || '')
    .trim()
    .toLowerCase();
  if (env === 'true') return true;
  if (env === 'false') return false;
  return Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
}

export function normalizeCompanyWhatsAppEndpoints(
  endpoints: CompanyWhatsAppEndpointConfig[] | null | undefined,
) {
  return (Array.isArray(endpoints) ? endpoints : [])
    .map((endpoint) => ({
      id: normalize(endpoint?.id),
      label: normalize(endpoint?.label),
      moduleKey: normalize(endpoint?.moduleKey).toLowerCase(),
      whatsappNumber: normalize(endpoint?.whatsappNumber),
      whatsappPhoneNumberId: normalize(endpoint?.whatsappPhoneNumberId),
      whatsappWabaId: normalize(endpoint?.whatsappWabaId),
      whatsappAccessToken: normalize(endpoint?.whatsappAccessToken),
      whatsappDisplayNumber: normalize(endpoint?.whatsappDisplayNumber),
      isActive: endpoint?.isActive !== false,
      isPrimary: Boolean(endpoint?.isPrimary),
    }))
    .filter((endpoint) => endpoint.id || endpoint.whatsappPhoneNumberId || endpoint.whatsappNumber);
}

export function pickWhatsAppEndpoint(
  company: CompanyConfig | null | undefined,
  options?: ResolveWhatsAppCredentialOptions,
) {
  const endpoints = normalizeCompanyWhatsAppEndpoints(company?.whatsappEndpoints);
  if (!endpoints.length) return null;

  const activeEndpoints = endpoints.filter((endpoint) => endpoint.isActive);
  const pool = activeEndpoints.length ? activeEndpoints : endpoints;
  const preferredModuleKey =
    normalize(options?.preferredModuleKey).toLowerCase() ||
    normalizeModuleKeyFromSourceModule(options?.sourceModule);
  const endpointId = normalize(options?.endpointId);
  const phoneNumberId = normalize(options?.phoneNumberId);

  if (endpointId) {
    const byId = pool.find((endpoint) => endpoint.id === endpointId);
    if (byId) return byId;
  }

  if (phoneNumberId) {
    const byPhoneNumberId = pool.find(
      (endpoint) => endpoint.whatsappPhoneNumberId === phoneNumberId,
    );
    if (byPhoneNumberId) return byPhoneNumberId;
  }

  if (preferredModuleKey) {
    const byModule = pool.find((endpoint) => endpoint.moduleKey === preferredModuleKey);
    if (byModule) return byModule;
  }

  const primary = pool.find((endpoint) => endpoint.isPrimary);
  if (primary) return primary;

  return pool[0] || null;
}

export function resolveWhatsAppCredentials(
  company: CompanyConfig | null | undefined,
  options?: ResolveWhatsAppCredentialOptions,
) {
  const endpoint = pickWhatsAppEndpoint(company, options);
  const endpointPhoneNumberId = normalize(endpoint?.whatsappPhoneNumberId);
  const endpointAccessToken = normalize(endpoint?.whatsappAccessToken);
  if (endpointPhoneNumberId && endpointAccessToken) {
    return {
      phoneNumberId: endpointPhoneNumberId,
      accessToken: endpointAccessToken,
      wabaId: normalize(endpoint?.whatsappWabaId),
      displayNumber: normalize(endpoint?.whatsappDisplayNumber),
      whatsappNumber: normalize(endpoint?.whatsappNumber),
      endpointId: normalize(endpoint?.id),
      endpointLabel: normalize(endpoint?.label),
      endpointModuleKey: normalize(endpoint?.moduleKey).toLowerCase(),
      source: 'company_endpoint' as const,
      usingFallback: false,
    };
  }

  const companyPhoneNumberId = normalize(company?.whatsappPhoneNumberId);
  const companyAccessToken = normalize(company?.whatsappAccessToken);
  if (companyPhoneNumberId && companyAccessToken) {
    return {
      phoneNumberId: companyPhoneNumberId,
      accessToken: companyAccessToken,
      wabaId: normalize(company?.whatsappWabaId),
      displayNumber: normalize(company?.whatsappDisplayNumber),
      whatsappNumber: normalize(company?.whatsappNumber),
      endpointId: '',
      endpointLabel: '',
      endpointModuleKey: '',
      source: 'company' as const,
      usingFallback: false,
    };
  }

  if (allowGlobalCredentialFallback()) {
    const fallbackPhoneNumberId = normalize(process.env.WHATSAPP_PHONE_NUMBER_ID);
    const fallbackAccessToken = normalize(process.env.WHATSAPP_ACCESS_TOKEN);
    if (fallbackPhoneNumberId && fallbackAccessToken) {
      return {
        phoneNumberId: fallbackPhoneNumberId,
        accessToken: fallbackAccessToken,
        wabaId: normalize(process.env.WHATSAPP_WABA_ID),
        displayNumber: '',
        whatsappNumber: '',
        endpointId: '',
        endpointLabel: '',
        endpointModuleKey: '',
        source: 'global_fallback' as const,
        usingFallback: true,
      };
    }
  }

  return {
    phoneNumberId: '',
    accessToken: '',
    wabaId: '',
    displayNumber: '',
    whatsappNumber: '',
    endpointId: '',
    endpointLabel: '',
    endpointModuleKey: '',
    source: 'missing' as const,
    usingFallback: false,
  };
}
