import { Injectable } from '@nestjs/common';
import type { NormalizedSearchInput, SearchExecutionContext } from '../shared/radar-types';
import type { HbxEngineSearchOutput, SearchExecutionOptions, WebscrapingContactResult } from '../shared/radar-core-shared';
import type { GoogleSearchProviderService } from '../providers/google-search/google-search-provider.service';
import type { RadarInternalReprocessSourceService } from './radar-internal-reprocess-source.service';
import type { RadarLeadSourceKind, RadarLeadSourceResult, RadarLeadSourceStep } from './radar-lead-source.types';
import type { RadarSearchOrchestratorService } from './radar-search-orchestrator.service';
import type { RadarSearchStrategyService } from './radar-search-strategy.service';
import type { RadarSourceExpansionService } from './radar-source-expansion.service';

export type RadarSourceExecutorHost = {
  searchHbxEngine: (
    input: NormalizedSearchInput,
    existing: string[],
    engineUrl: string | undefined,
    options: { queryText?: string; batchLimit?: number; timeoutMs?: number },
  ) => Promise<HbxEngineSearchOutput>;
  getRadarInternalReprocessSource: () => RadarInternalReprocessSourceService;
  getGoogleSearchProvider: () => GoogleSearchProviderService;
  getRadarSourceExpansion: () => RadarSourceExpansionService;
  getRadarSearchStrategy: () => RadarSearchStrategyService;
  getRadarSearchOrchestrator: () => RadarSearchOrchestratorService;
  getRadarClientRequestTimeoutMs: () => number;
  logger?: { warn?: (message: string) => void };
  prisma?: any;
};

export type RadarSourceExecutorResult = {
  optionalSources: Array<{ source: RadarLeadSourceKind; results: WebscrapingContactResult[] }>;
  optionalResults: WebscrapingContactResult[];
  sourceDiagnostics: RadarLeadSourceResult[];
  sourceEnginesUsed: string[];
  updatedSeenPhones: string[];
};

function envEnabled(name: string) {
  return String(process.env[name] || '').trim().toLowerCase() === 'true';
}

function normalizePhoneDigits(raw: unknown) {
  return String(raw || '').replace(/\D/g, '');
}

function addPhones(target: Set<string>, results: WebscrapingContactResult[]) {
  for (const result of results) {
    const digits = normalizePhoneDigits(result.phoneDigits || result.phone);
    if (digits) target.add(digits);
  }
}

function optionalStubFlag(source: RadarLeadSourceKind) {
  const flags: Partial<Record<RadarLeadSourceKind, string>> = {
    website_crawl_light: 'HBX_RADAR_WEBSITE_CRAWL_LIGHT_ENABLED',
    local_directories_stub: 'HBX_RADAR_LOCAL_DIRECTORIES_ENABLED',
    cnpj_public_stub: 'HBX_RADAR_CNPJ_PUBLIC_ENABLED',
  };
  return flags[source] || '';
}

@Injectable()
export class RadarSourceExecutorService {
  async execute(input: {
    context: SearchExecutionContext;
    normalized: NormalizedSearchInput;
    currentResults: WebscrapingContactResult[];
    seenPhones: Set<string> | string[];
    options: SearchExecutionOptions;
    sourcePlan: RadarLeadSourceStep[];
    remainingQuantity: number;
    purpose?: string | null;
    host: RadarSourceExecutorHost;
  }): Promise<RadarSourceExecutorResult> {
    const seenPhones = new Set(Array.from(input.seenPhones || []).map((phone) => normalizePhoneDigits(phone)).filter(Boolean));
    const optionalSources: Array<{ source: RadarLeadSourceKind; results: WebscrapingContactResult[] }> = [];
    const sourceDiagnostics: RadarLeadSourceResult[] = [];
    const sourceEnginesUsed = new Set<string>();
    const activeOptionalSources = (input.sourcePlan || [])
      .filter((step) => step.enabled && step.optional && !['radar_database', 'company_history', 'global_cache', 'hbx_engine'].includes(step.source));

    for (const step of activeOptionalSources) {
      if (input.remainingQuantity <= 0) break;
      if (step.source === 'google_textual') {
        const result = await this.executeGoogleTextual({ ...input, seenPhones });
        this.pushSourceResult(step.source, result, optionalSources, sourceDiagnostics, sourceEnginesUsed, seenPhones);
        continue;
      }
      if (step.source === 'reprocess_missing_social' || step.source === 'reprocess_old_cards') {
        const result = await this.executeInternalReprocess({ ...input, source: step.source });
        this.pushSourceResult(step.source, result, optionalSources, sourceDiagnostics, sourceEnginesUsed, seenPhones);
        continue;
      }
      const flag = optionalStubFlag(step.source);
      const stub = input.host.getRadarSearchOrchestrator().buildSkippedSourceResult(
        step.source,
        `${step.reason || step.source}: stub explicito, ainda nao executa${flag ? `; ${flag}=${envEnabled(flag) ? 'true' : 'false'}` : ''}`,
      );
      sourceDiagnostics.push(stub);
    }

    return {
      optionalSources,
      optionalResults: optionalSources.flatMap((source) => source.results),
      sourceDiagnostics,
      sourceEnginesUsed: Array.from(sourceEnginesUsed),
      updatedSeenPhones: Array.from(seenPhones),
    };
  }

  private async executeGoogleTextual(input: {
    normalized: NormalizedSearchInput;
    seenPhones: Set<string>;
    options: SearchExecutionOptions;
    remainingQuantity: number;
    purpose?: string | null;
    host: RadarSourceExecutorHost;
  }): Promise<RadarLeadSourceResult> {
    if (!envEnabled('HBX_RADAR_GOOGLE_TEXTUAL_ENABLED')) {
      return input.host.getRadarSearchOrchestrator().buildSkippedSourceResult('google_textual', 'flag_google_textual_desativada');
    }
    const remaining = Math.max(1, input.remainingQuantity);
    const strategy = input.host.getRadarSearchStrategy().resolve(input.normalized, { purpose: input.purpose });
    const queries = input.host.getRadarSourceExpansion().buildGoogleTextualQueries(input.normalized, strategy);
    const requests = input.host.getGoogleSearchProvider().buildLeadDiscoveryRequests(
      input.normalized,
      queries,
      { limit: Math.min(5, remaining), timeoutMs: input.host.getRadarClientRequestTimeoutMs() },
    ).slice(0, 3);
    const collected: WebscrapingContactResult[] = [];
    let foundCount = 0;

    for (const request of requests) {
      try {
        const output = await input.host.searchHbxEngine(input.normalized, Array.from(input.seenPhones), input.options.hbxEngineUrl, {
          queryText: request.queryText,
          batchLimit: request.limit,
          timeoutMs: request.timeoutMs || input.host.getRadarClientRequestTimeoutMs(),
        });
        const normalizedTextual = input.host.getGoogleSearchProvider().normalizeTextualResults(output.results || [], request) as any;
        foundCount += Array.isArray(output.results) ? output.results.length : 0;
        collected.push(...normalizedTextual.map((result: WebscrapingContactResult) => ({
          ...result,
          source: 'google_textual',
          sourceEngine: 'google_textual',
        })));
        addPhones(input.seenPhones, normalizedTextual as any);
      } catch (error) {
        input.host.logger?.warn?.(`[radar-source-executor] google_textual falhou sem bloquear delivery: ${String((error as any)?.message || error)}`);
        return input.host.getRadarSearchOrchestrator().buildOptionalSourceFailure({
          source: 'google_textual',
          stage: 'provider_google',
          error,
          foundCount,
          acceptedCount: collected.length,
        });
      }
      if (collected.length >= remaining) break;
    }

    return input.host.getRadarSearchOrchestrator().buildCompletedSourceResult({
      source: 'google_textual',
      results: collected,
      foundCount,
      reason: 'google_textual_executado_via_query_text',
    });
  }

  private async executeInternalReprocess(input: {
    context: SearchExecutionContext;
    normalized: NormalizedSearchInput;
    source: Extract<RadarLeadSourceKind, 'reprocess_missing_social' | 'reprocess_old_cards'>;
    remainingQuantity: number;
    host: RadarSourceExecutorHost;
  }): Promise<RadarLeadSourceResult> {
    if (!envEnabled('HBX_RADAR_INTERNAL_REPROCESS_ENABLED')) {
      return input.host.getRadarSearchOrchestrator().buildSkippedSourceResult(input.source, 'flag_internal_reprocess_desativada');
    }
    try {
      return await input.host.getRadarInternalReprocessSource().run({
        prisma: input.host.prisma,
        context: input.context,
        normalized: input.normalized,
        source: input.source,
        limit: Math.max(1, input.remainingQuantity),
      });
    } catch (error) {
      input.host.logger?.warn?.(`[radar-source-executor] ${input.source} falhou sem bloquear delivery: ${String((error as any)?.message || error)}`);
      return input.host.getRadarSearchOrchestrator().buildOptionalSourceFailure({
        source: input.source,
        stage: 'search',
        error,
      });
    }
  }

  private pushSourceResult(
    source: RadarLeadSourceKind,
    result: RadarLeadSourceResult,
    optionalSources: Array<{ source: RadarLeadSourceKind; results: WebscrapingContactResult[] }>,
    sourceDiagnostics: RadarLeadSourceResult[],
    sourceEnginesUsed: Set<string>,
    seenPhones: Set<string>,
  ) {
    sourceDiagnostics.push(result);
    if (result.results.length > 0) {
      optionalSources.push({
        source,
        results: result.results.map((item) => ({ ...item, source: item.source || source, sourceEngine: item.sourceEngine || source })),
      });
      sourceEnginesUsed.add(source);
      addPhones(seenPhones, result.results);
    }
  }
}
