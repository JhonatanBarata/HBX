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

function quote(value: unknown) {
  const safe = compactText(value).replace(/"/g, '');
  return safe ? `"${safe}"` : '';
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
    const sourceQueries = queries.length ? queries : this.buildLeadDiscoveryQueries(input);
    return this.uniqueRequests(sourceQueries.map((queryText) => this.buildRequest({
      queryText,
      intent: options.intent || 'lead_discovery',
      city: input.city,
      state: input.state,
      segment: input.segment,
      limit: options.limit || input.quantity,
      timeoutMs: options.timeoutMs || null,
    })));
  }

  buildLeadDiscoveryQueries(input: NormalizedSearchInput) {
    const segment = quote(input.segment);
    const city = quote(input.city);
    const state = compactText(input.state).toUpperCase();
    const location = [city, state].filter(Boolean).join(' ');
    return Array.from(new Set([
      `${segment} ${location} whatsapp`,
      `${segment} ${location} instagram`,
      `${segment} ${location} telefone`,
      `${segment} ${location} site`,
      `${segment} ${location} contato`,
      `${segment} ${location} orcamento`,
      `site:instagram.com ${segment} ${city}`,
      `site:facebook.com ${segment} ${city}`,
      `${segment} ${location} CNPJ`,
      `${segment} ${location} endereco`,
    ].map((query) => compactText(query)).filter(Boolean)));
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
