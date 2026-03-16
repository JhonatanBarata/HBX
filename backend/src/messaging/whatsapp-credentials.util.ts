type NullableString = string | null | undefined;

type CompanyConfig = {
  whatsappPhoneNumberId?: NullableString;
  whatsappAccessToken?: NullableString;
};

function normalize(value: NullableString): string {
  return String(value || '').trim();
}

export function allowGlobalCredentialFallback(): boolean {
  const env = String(process.env.WHATSAPP_ALLOW_GLOBAL_CREDENTIAL_FALLBACK || '').trim().toLowerCase();
  if (env === 'true') return true;
  if (env === 'false') return false;
  // Default behaviour: allow fallback when explicit global credentials are configured in env
  return Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
}

export function resolveWhatsAppCredentials(company: CompanyConfig | null | undefined) {
  const companyPhoneNumberId = normalize(company?.whatsappPhoneNumberId);
  const companyAccessToken = normalize(company?.whatsappAccessToken);
  if (companyPhoneNumberId && companyAccessToken) {
    return {
      phoneNumberId: companyPhoneNumberId,
      accessToken: companyAccessToken,
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
        source: 'global_fallback' as const,
        usingFallback: true,
      };
    }
  }

  return {
    phoneNumberId: '',
    accessToken: '',
    source: 'missing' as const,
    usingFallback: false,
  };
}
