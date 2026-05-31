import { Injectable, Optional } from '@nestjs/common';
import { buildRadarStageIssue } from '../shared/radar-stage-policy';
import type { NormalizedSearchInput } from '../shared/radar-types';
import { CnpjPublicProviderService } from '../providers/cnpj-public/cnpj-public-provider.service';
import type { CnpjPublicCompanyRecord } from '../providers/cnpj-public/cnpj-public-types';
import type { RadarLeadSourceResult } from './radar-lead-source.types';

function envEnabled(name: string) {
  return String(process.env[name] || '').trim().toLowerCase() === 'true';
}

function sourceIssue(message: string) {
  return buildRadarStageIssue({
    stage: 'search',
    code: 'cnpj_public_failed',
    message,
    retryable: true,
    blocksDelivery: false,
  });
}

@Injectable()
export class RadarCnpjPublicSourceService {
  constructor(@Optional() private readonly provider?: CnpjPublicProviderService) {}

  async run(input: {
    normalized: NormalizedSearchInput;
    seeds?: Array<Record<string, any>>;
    limit?: number;
    records?: CnpjPublicCompanyRecord[];
  }): Promise<RadarLeadSourceResult> {
    if (!envEnabled('HBX_RADAR_CNPJ_PUBLIC_ENABLED')) {
      return {
        source: 'cnpj_public',
        status: 'skipped',
        retryable: false,
        foundCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        reason: 'flag_cnpj_public_desativada',
        results: [],
      };
    }

    try {
      const result = await (this.provider || new CnpjPublicProviderService()).search({
        normalized: input.normalized,
        seeds: input.seeds,
        limit: input.limit,
        records: input.records,
      });
      return {
        source: 'cnpj_public',
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
      const issue = sourceIssue(String((error as any)?.message || error || 'cnpj_public falhou'));
      return {
        source: 'cnpj_public',
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
