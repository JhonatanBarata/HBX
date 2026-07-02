import { Injectable, Optional } from '@nestjs/common';
import { buildRadarStageIssue } from '../shared/radar-stage-policy';
import type { NormalizedSearchInput } from '../shared/radar-types';
import { CnpjPublicDatasetService } from '../providers/cnpj-public/cnpj-public-dataset.service';
import { CnpjPublicProviderService } from '../providers/cnpj-public/cnpj-public-provider.service';
import { CnpjDiscoveryService, isCnpjDiscoveryEnabled } from '../providers/cnpj-public/cnpj-discovery.service';
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

function normalizeCnpjKey(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

/** Merge dedup por cnpj — dataset primeiro (fonte já validada), discovery só completa. */
function mergeRecordsByCnpj(
  datasetRecords: CnpjPublicCompanyRecord[],
  discoveredRecords: CnpjPublicCompanyRecord[],
): CnpjPublicCompanyRecord[] {
  const seen = new Set<string>();
  const merged: CnpjPublicCompanyRecord[] = [];
  for (const record of datasetRecords) {
    const key = normalizeCnpjKey(record.cnpj);
    if (key) seen.add(key);
    merged.push(record);
  }
  for (const record of discoveredRecords) {
    const key = normalizeCnpjKey(record.cnpj);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(record);
  }
  return merged;
}

@Injectable()
export class RadarCnpjPublicSourceService {
  constructor(
    @Optional() private readonly provider?: CnpjPublicProviderService,
    @Optional() private readonly dataset?: CnpjPublicDatasetService,
    @Optional() private readonly discovery?: CnpjDiscoveryService,
  ) {}

  async run(input: {
    normalized: NormalizedSearchInput;
    seeds?: Array<Record<string, any>>;
    limit?: number;
    records?: CnpjPublicCompanyRecord[];
    prisma?: any;
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
      let records = input.records;
      if (!records?.length && input.prisma) {
        records = await (this.dataset || new CnpjPublicDatasetService()).fetchRecords({
          prisma: input.prisma,
          normalized: input.normalized,
          limit: input.limit,
        });
      }
      records = records || [];

      // Furo comprovado 01/07 (docs/PLANEJAMENTOS/PR01072026/30-motor-receita.md): o dataset
      // local não tinha nada a alimentá-lo por nicho+cidade. Quando o dataset não bastou e a
      // flag está ligada, descobre CNPJs via busca web (queries segmento+cidade) e hidrata via
      // L4 — merge dedup por cnpj, dataset sempre primeiro. Falha do discovery NUNCA derruba a
      // fonte: segue só com o que o dataset já tinha (degrade gracioso).
      const targetLimit = input.limit || 20;
      let discoveredCount = 0;
      if (records.length < targetLimit && isCnpjDiscoveryEnabled() && input.prisma) {
        try {
          const discovered = await (this.discovery || new CnpjDiscoveryService()).discover({
            normalized: input.normalized,
            needed: targetLimit - records.length,
            prisma: input.prisma,
          });
          discoveredCount = discovered.length;
          records = mergeRecordsByCnpj(records, discovered);
        } catch {
          // degrade gracioso: discovery falhou, segue só com o dataset
        }
      }

      const result = await (this.provider || new CnpjPublicProviderService()).search({
        normalized: input.normalized,
        seeds: input.seeds,
        limit: input.limit,
        records,
      });
      const reason = discoveredCount
        ? `${result.reason}; discovery_encontrou_${discoveredCount}`
        : result.reason;
      return {
        source: 'cnpj_public',
        status: result.status,
        retryable: result.retryable,
        foundCount: result.foundCount,
        acceptedCount: result.acceptedCount,
        rejectedCount: result.rejectedCount,
        reason,
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
