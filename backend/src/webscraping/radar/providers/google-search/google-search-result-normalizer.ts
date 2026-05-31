import { Injectable } from '@nestjs/common';
import type {
  GoogleTextualRawResult,
  GoogleTextualSearchRequest,
  GoogleTextualSearchResult,
} from './google-search-types';

function compactText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function phoneDigits(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function firstText(...values: unknown[]) {
  return values.map(compactText).find(Boolean) || '';
}

function pickUrl(result: GoogleTextualRawResult) {
  return firstText(
    result.sourceUrl,
    result.url,
    result.website,
    result.link,
    result.href,
    result.rawUrl,
  );
}

function stablePlaceId(request: GoogleTextualSearchRequest, result: GoogleTextualRawResult, index: number) {
  return firstText(
    result.placeId,
    result.id,
    result.sourceId,
    pickUrl(result),
    `${request.queryText}:${index}`,
  );
}

@Injectable()
export class GoogleSearchResultNormalizer {
  normalize(
    result: GoogleTextualRawResult,
    request: GoogleTextualSearchRequest,
    index = 0,
  ): GoogleTextualSearchResult | null {
    const title = firstText(result.name, result.title, result.displayName);
    const sourceUrl = pickUrl(result) || null;
    const snippet = firstText(result.snippet, result.description, result.summary);
    const rawPhone = firstText(result.phone, result.phoneNumber, result.formattedPhoneNumber, result.whatsapp);
    const digits = phoneDigits(result.phoneDigits || rawPhone);
    const name = title || sourceUrl || snippet;
    if (!name && !sourceUrl && !snippet) return null;

    return {
      ...result,
      provider: 'google_textual',
      intent: request.intent,
      queryText: request.queryText,
      placeId: `google_textual:${stablePlaceId(request, result, index)}`,
      name,
      phone: rawPhone,
      phoneDigits: digits,
      rating: Number.isFinite(Number(result.rating)) ? Number(result.rating) : null,
      reviews: Number.isFinite(Number(result.reviews ?? result.userRatingsTotal))
        ? Math.max(0, Math.trunc(Number(result.reviews ?? result.userRatingsTotal)))
        : null,
      address: firstText(result.address, result.formattedAddress) || null,
      website: firstText(result.website, result.site, sourceUrl) || null,
      source: 'google_textual',
      sourceEngine: 'google_textual',
      sourceUrl,
      title,
      snippet,
      description: firstText(result.description, snippet) || null,
      evidenceJson: {
        provider: 'google_textual',
        intent: request.intent,
        queryText: request.queryText,
        network: request.network || null,
        raw: result,
      },
    };
  }

  normalizeMany(results: GoogleTextualRawResult[], request: GoogleTextualSearchRequest) {
    return (Array.isArray(results) ? results : [])
      .map((result, index) => this.normalize(result, request, index))
      .filter((result): result is GoogleTextualSearchResult => Boolean(result));
  }
}
