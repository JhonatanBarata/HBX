import { Injectable, Optional } from '@nestjs/common';
import { buildRadarStageIssue } from '../shared/radar-stage-policy';
import type { NormalizedSearchInput } from '../shared/radar-types';
import { VerticalSourceProviderService } from '../providers/vertical-sources/vertical-source-provider.service';
import type { VerticalSourceRecord } from '../providers/vertical-sources/vertical-source-types';
import type { RadarLeadSourceResult } from './radar-lead-source.types';

function envEnabled(name: string) {
  return String(process.env[name] || '').trim().toLowerCase() === 'true';
}

function sourceIssue(message: string) {
  return buildRadarStageIssue({
    stage: 'search',
    code: 'vertical_source_failed',
    message,
    retryable: true,
    blocksDelivery: false,
  });
}

@Injectable()
export class RadarVerticalSourceService {
  constructor(@Optional() private readonly provider?: VerticalSourceProviderService) {}

  async run(input: {
    normalized: NormalizedSearchInput;
    strategies?: Array<Record<string, any>>;
    limit?: number;
    records?: VerticalSourceRecord[];
  }): Promise<RadarLeadSourceResult> {
    if (!envEnabled('HBX_RADAR_VERTICAL_SOURCES_ENABLED')) {
      return {
        source: 'vertical_source',
        status: 'skipped',
        retryable: false,
        foundCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        reason: 'flag_vertical_sources_desativada',
        results: [],
      };
    }

    try {
      const result = await (this.provider || new VerticalSourceProviderService()).search({
        normalized: input.normalized,
        strategies: input.strategies,
        limit: input.limit,
        records: input.records,
      });
      return {
        source: 'vertical_source',
        status: result.status,
        retryable: result.retryable,
        foundCount: result.foundCount,
        acceptedCount: result.acceptedCount,
        rejectedCount: result.rejectedCount,
        reason: result.reason,
        results: result.results,
        issue: result.issue ? sourceIssue(result.issue.message) : null,
      };
    } catch (error) {
      const issue = sourceIssue(String((error as any)?.message || error || 'vertical_source falhou'));
      return {
        source: 'vertical_source',
        status: 'partial_error',
        retryable: true,
        foundCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        reason: issue.message,
        results: [],
        issue,
      };
    }
  }
}
