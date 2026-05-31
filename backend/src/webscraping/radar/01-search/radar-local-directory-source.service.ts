import { Injectable, Optional } from '@nestjs/common';
import { buildRadarStageIssue } from '../shared/radar-stage-policy';
import type { NormalizedSearchInput } from '../shared/radar-types';
import { LocalDirectoryProviderService } from '../providers/local-directories/local-directory-provider.service';
import type { LocalDirectoryRecord } from '../providers/local-directories/local-directory-types';
import type { RadarLeadSourceResult } from './radar-lead-source.types';

function envEnabled(name: string) {
  return String(process.env[name] || '').trim().toLowerCase() === 'true';
}

function sourceIssue(message: string) {
  return buildRadarStageIssue({
    stage: 'search',
    code: 'local_directory_failed',
    message,
    retryable: true,
    blocksDelivery: false,
  });
}

@Injectable()
export class RadarLocalDirectorySourceService {
  constructor(@Optional() private readonly provider?: LocalDirectoryProviderService) {}

  async run(input: {
    normalized: NormalizedSearchInput;
    seeds?: string[];
    limit?: number;
    records?: LocalDirectoryRecord[];
  }): Promise<RadarLeadSourceResult> {
    if (!envEnabled('HBX_RADAR_LOCAL_DIRECTORIES_ENABLED')) {
      return {
        source: 'local_directory',
        status: 'skipped',
        retryable: false,
        foundCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        reason: 'flag_local_directories_desativada',
        results: [],
      };
    }

    try {
      const result = await (this.provider || new LocalDirectoryProviderService()).search({
        normalized: input.normalized,
        seeds: input.seeds,
        limit: input.limit,
        records: input.records,
      });
      return {
        source: 'local_directory',
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
      const issue = sourceIssue(String((error as any)?.message || error || 'local_directory falhou'));
      return {
        source: 'local_directory',
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
