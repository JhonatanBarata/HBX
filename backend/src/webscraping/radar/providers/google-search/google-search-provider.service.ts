import { Injectable, Optional } from '@nestjs/common';
import type { NormalizedSearchInput } from '../../shared/radar-types';
import type { RadarSocialLookupQuery } from '../../04-socials/radar-social-types';
import { GoogleSearchQueryBuilder } from './google-search-query-builder';
import { GoogleSearchResultNormalizer } from './google-search-result-normalizer';
import type {
  GoogleTextualRawResult,
  GoogleTextualSearchAdapter,
  GoogleTextualSearchRequest,
} from './google-search-types';

@Injectable()
export class GoogleSearchProviderService {
  constructor(
    @Optional() private readonly queryBuilder?: GoogleSearchQueryBuilder,
    @Optional() private readonly normalizer?: GoogleSearchResultNormalizer,
  ) {}

  private getQueryBuilder() {
    return this.queryBuilder || new GoogleSearchQueryBuilder();
  }

  private getNormalizer() {
    return this.normalizer || new GoogleSearchResultNormalizer();
  }

  buildLeadDiscoveryRequests(
    input: NormalizedSearchInput,
    queries: string[],
    options: { limit?: number; timeoutMs?: number | null } = {},
  ) {
    return this.getQueryBuilder().buildLeadDiscoveryRequests(input, queries, options);
  }

  buildLeadDiscoveryQueries(input: NormalizedSearchInput) {
    return this.getQueryBuilder().buildLeadDiscoveryQueries(input);
  }

  buildSocialRequests(
    lead: { city?: string | null; state?: string | null; segment?: string | null },
    queries: RadarSocialLookupQuery[],
    options: { limit?: number; timeoutMs?: number | null } = {},
  ) {
    return this.getQueryBuilder().buildSocialRequests(lead, queries, options);
  }

  normalizeTextualResults(results: GoogleTextualRawResult[], request: GoogleTextualSearchRequest) {
    return this.getNormalizer().normalizeMany(results, request);
  }

  async searchTextual(request: GoogleTextualSearchRequest, adapter: GoogleTextualSearchAdapter) {
    const output = await adapter(request);
    return {
      request,
      results: this.normalizeTextualResults(output?.results || [], request),
    };
  }
}
