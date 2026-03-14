type NullableString = string | null | undefined;

type CompanyConfig = {
  whatsappPhoneNumberId?: NullableString;
  whatsappAccessToken?: NullableString;
};

function normalize(value: NullableString): string {
  return String(value || '').trim();
}

export function allowGlobalCredentialFallback(): boolean {
  return false;
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
