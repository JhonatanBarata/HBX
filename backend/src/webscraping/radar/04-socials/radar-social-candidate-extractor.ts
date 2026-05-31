import type { RadarSocialCandidate, RadarSocialLookupHost, RadarSocialNetwork } from './radar-social-types';

function parseJsonObject(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, any>;
  if (typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function collectValues(value: unknown, output: unknown[] = [], depth = 0) {
  if (value == null || depth > 2) return output;
  if (typeof value === 'string' || typeof value === 'number') {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    value.slice(0, 12).forEach((item) => collectValues(item, output, depth + 1));
    return output;
  }
  if (typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, any>).slice(0, 40)) {
      collectValues((value as Record<string, any>)[key], output, depth + 1);
    }
  }
  return output;
}

function resultText(result: any) {
  return [
    result?.name,
    result?.title,
    result?.snippet,
    result?.description,
    result?.address,
    result?.city,
    result?.state,
    result?.sourceUrl,
    result?.website,
  ].filter(Boolean).join(' ');
}

export class RadarSocialCandidateExtractor {
  extract(result: any, network: RadarSocialNetwork, host: RadarSocialLookupHost): RadarSocialCandidate[] {
    const rawPayload = parseJsonObject(result?.rawJson || result?.rawPayload || result?.payload);
    const directKeys = network === 'instagram'
      ? ['instagramUrl', 'instagram', 'instagram_url', 'igUrl', 'ig']
      : ['facebookUrl', 'facebook', 'facebook_url', 'fbUrl', 'fb'];
    const genericKeys = [
      'sourceUrl',
      'url',
      'website',
      'socialUrl',
      'socialProfileUrl',
      'profileUrl',
      'href',
      'link',
      '_pageUrl',
      'pageUrl',
      'title',
      'snippet',
      'description',
      'rawJson',
    ];
    const values = [
      ...directKeys.map((key) => result?.[key]),
      ...genericKeys.map((key) => result?.[key]),
      ...collectValues(rawPayload),
    ];
    const candidates: RadarSocialCandidate[] = [];
    const seen = new Set<string>();
    for (const value of values) {
      const url = host.normalizeRadarSocialUrl(value, network) || host.pickRadarSocialUrl({ value }, network);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      candidates.push({
        network,
        url,
        source: 'hbx_result',
        result,
        rawText: resultText(result),
      });
    }
    const picked = host.pickRadarSocialUrl(result, network);
    if (picked && !seen.has(picked)) {
      candidates.unshift({
        network,
        url: picked,
        source: 'picked',
        result,
        rawText: resultText(result),
      });
    }
    return candidates;
  }
}
