import { Injectable, Optional } from '@nestjs/common';
import { buildRadarStageIssue } from '../shared/radar-stage-policy';
import type { NormalizedSearchInput } from '../shared/radar-types';
import { CnpjPublicDatasetService } from '../providers/cnpj-public/cnpj-public-dataset.service';
import { CnpjPublicProviderService } from '../providers/cnpj-public/cnpj-public-provider.service';
import type { CnpjPublicCompanyRecord } from '../providers/cnpj-public/cnpj-public-types';
import type { RadarLeadSourceResult } from './radar-lead-source.types';

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
  constructor(
    @Optional() private readonly provider?: CnpjPublicProviderService,
    @Optional() private readonly dataset?: CnpjPublicDatasetService,
  ) {}

  async run(input: {
    normalized: NormalizedSearchInput;
    seeds?: Array<Record<string, any>>;
    limit?: number;
    records?: CnpjPublicCompanyRecord[];
    prisma?: any;
  }): Promise<RadarLeadSourceResult> {
    try {
      let records = input.records;
      if (!records?.length && input.prisma) {
        records = await (this.dataset || new CnpjPublicDatasetService()).fetchRecords({
          prisma: input.prisma,
          normalized: input.normalized,
          limit: input.limit,
        });
      }
      records = records || [];

      const result = await (this.provider || new CnpjPublicProviderService()).search({
        normalized: input.normalized,
        seeds: input.seeds,
        limit: input.limit,
        records,
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
