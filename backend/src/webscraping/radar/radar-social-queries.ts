import {
  RADAR_SOCIAL_CATEGORY_TOKENS,
  RADAR_SOCIAL_STOP_TOKENS,
  RADAR_SOCIAL_WEAK_TOKENS,
  RADAR_WEBSITE_GENERIC_HOST_TOKENS,
  normalizeLookupValue,
} from './radar-social-matching';

export function buildRadarSocialLookupQueries(name: string, city: string) {
  const safeName = String(name || '').replace(/"/g, '').replace(/\s+/g, ' ').trim();
  const safeCity = String(city || '').replace(/"/g, '').replace(/\s+/g, ' ').trim();
  if (!safeName || !safeCity) return [];
  const tokens = normalizeLookupValue(safeName)
    .split(/\s+/)
    .filter((token) => (
      token.length >= 5
      && !RADAR_SOCIAL_STOP_TOKENS.has(token)
      && !RADAR_SOCIAL_CATEGORY_TOKENS.has(token)
      && !RADAR_SOCIAL_WEAK_TOKENS.has(token)
      && !RADAR_WEBSITE_GENERIC_HOST_TOKENS.has(token)
    ));
  const brandToken = tokens[0] || '';
  const brandName = brandToken
    ? safeName.split(/\s+/).find((part) => normalizeLookupValue(part) === brandToken) || brandToken
    : '';
  const queries = [
    ...(brandName
      ? [
          { network: 'instagram' as const, query: `site:instagram.com "${brandName}" "${safeCity}"` },
          { network: 'instagram' as const, query: `"${brandName}" "${safeCity}" instagram` },
          { network: 'facebook' as const, query: `site:facebook.com "${brandName}" "${safeCity}"` },
          { network: 'facebook' as const, query: `"${brandName}" "${safeCity}" facebook` },
        ]
      : []),
    { network: 'instagram' as const, query: `site:instagram.com "${safeName}" "${safeCity}"` },
    { network: 'instagram' as const, query: `"${safeName}" "${safeCity}" instagram` },
    { network: 'facebook' as const, query: `site:facebook.com "${safeName}" "${safeCity}"` },
    { network: 'facebook' as const, query: `"${safeName}" "${safeCity}" facebook` },
  ];
  const seen = new Set<string>();
  return queries.filter((entry) => {
    const key = `${entry.network}:${entry.query}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
