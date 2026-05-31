import { Injectable } from '@nestjs/common';
import type { NormalizedSearchInput } from '../../shared/radar-types';
import type { RadarSocialLookupQuery } from '../../04-socials/radar-social-types';
import type { GoogleTextualSearchIntent, GoogleTextualSearchRequest } from './google-search-types';

function compactText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function clampLimit(value: unknown, fallback = 5) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(100, Math.trunc(parsed)));
}

@Injectable()
export class GoogleSearchQueryBuilder {
  buildRequest(input: {
    queryText: string;
    intent: GoogleTextualSearchIntent;
    city?: string | null;
    state?: string | null;
    segment?: string | null;
    network?: GoogleTextualSearchRequest['network'];
    limit?: number;
    timeoutMs?: number | null;
  }): GoogleTextualSearchRequest | null {
    const queryText = compactText(input.queryText);
    if (!queryText) return null;
    return {
      provider: 'google_textual',
      intent: input.intent,
      queryText,
      city: compactText(input.city) || null,
      state: compactText(input.state).toUpperCase() || null,
      segment: compactText(input.segment) || null,
      network: input.network || null,
      limit: clampLimit(input.limit),
      timeoutMs: input.timeoutMs == null ? null : Math.max(1_000, Math.trunc(Number(input.timeoutMs) || 0)),
      usePlacesApi: false,
    };
  }

  buildLeadDiscoveryRequests(
    input: NormalizedSearchInput,
    queries: string[],
    options: { limit?: number; timeoutMs?: number | null; intent?: GoogleTextualSearchIntent } = {},
  ) {
    return this.uniqueRequests(queries.map((queryText) => this.buildRequest({
      queryText,
      intent: options.intent || 'lead_discovery',
      city: input.city,
      state: input.state,
      segment: input.segment,
      limit: options.limit || input.quantity,
      timeoutMs: options.timeoutMs || null,
    })));
  }

  buildSocialRequests(
    lead: { city?: string | null; state?: string | null; segment?: string | null },
    queries: RadarSocialLookupQuery[],
    options: { limit?: number; timeoutMs?: number | null } = {},
  ) {
    return this.uniqueRequests(queries.map((entry) => this.buildRequest({
      queryText: entry.query,
      intent: 'social_enrichment',
      city: lead.city || null,
      state: lead.state || null,
      segment: lead.segment || null,
      network: entry.network,
      limit: options.limit || 5,
      timeoutMs: options.timeoutMs || null,
    })));
  }

  private uniqueRequests(requests: Array<GoogleTextualSearchRequest | null>) {
    const seen = new Set<string>();
    return requests.filter((request): request is GoogleTextualSearchRequest => {
      if (!request) return false;
      const key = `${request.intent}:${request.network || ''}:${request.queryText.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
