import { Injectable } from '@nestjs/common';
import type { NormalizedSearchInput, SearchExecutionContext } from '../shared/radar-types';
import type { HbxEngineSearchOutput, SearchExecutionOptions, WebscrapingContactResult } from '../shared/radar-core-shared';
import type { GoogleSearchProviderService } from '../providers/google-search/google-search-provider.service';
import type { RadarLeadSourceKind, RadarLeadSourceResult, RadarLeadSourceStep } from './radar-lead-source.types';
import type { RadarSearchOrchestratorService } from './radar-search-orchestrator.service';
import type { RadarSearchStrategyService } from './radar-search-strategy.service';
import type { RadarSourceExpansionService } from './radar-source-expansion.service';
import { RadarCnpjPublicSourceService } from './radar-cnpj-public-source.service';
import { RadarLocalDirectorySourceService } from './radar-local-directory-source.service';
import { RadarVerticalSourceService } from './radar-vertical-source.service';
import { RadarDiagnosticService } from '../shared/radar-diagnostic.service';

export type RadarSourceExecutorHost = {
  searchHbxEngine: (
    input: NormalizedSearchInput,
    existing: string[],
    engineUrl: string | undefined,
    options: { queryText?: string; batchLimit?: number; timeoutMs?: number },
  ) => Promise<HbxEngineSearchOutput>;
  getGoogleSearchProvider: () => GoogleSearchProviderService;
  getRadarSourceExpansion: () => RadarSourceExpansionService;
  getRadarSearchStrategy: () => RadarSearchStrategyService;
  getRadarSearchOrchestrator: () => RadarSearchOrchestratorService;
  getRadarCnpjPublicSource?: () => RadarCnpjPublicSourceService;
  getRadarLocalDirectorySource?: () => RadarLocalDirectorySourceService;
  getRadarVerticalSource?: () => RadarVerticalSourceService;
  getRadarClientRequestTimeoutMs: () => number;
  logger?: { warn?: (message: string) => void };
  prisma?: any;
  fetcher?: typeof fetch;
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

const SEARCH_SOURCE_KINDS = new Set<RadarLeadSourceKind>([
  'radar_database',
  'company_history',
  'global_cache',
  'hbx_engine',
  'google_textual',
  'cnpj_public',
  'local_directory',
  'vertical_source',
  'local_directories_stub',
  'cnpj_public_stub',
]);

function isSearchSourceKind(source: unknown): source is RadarLeadSourceKind {
  return SEARCH_SOURCE_KINDS.has(String(source || '') as RadarLeadSourceKind);
}

function optionalStubFlag(source: RadarLeadSourceKind) {
  const flags: Partial<Record<RadarLeadSourceKind, string>> = {
    local_directories_stub: 'HBX_RADAR_LOCAL_DIRECTORIES_ENABLED',
    cnpj_public_stub: 'HBX_RADAR_CNPJ_PUBLIC_ENABLED',
  };
  return flags[source] || '';
}

@Injectable()
export class RadarSourceExecutorService {
  private readonly diagnostics = new RadarDiagnosticService();

  async execute(input: {
    context: SearchExecutionContext;
    normalized: NormalizedSearchInput;
    currentResults: WebscrapingContactResult[];
    seenPhones: Set<string> | string[];
    options: SearchExecutionOptions;
    // O plano pode vir de snapshot persistido antigo. Trate-o como entrada não
    // confiável e aceite no executor apenas o vocabulário atual de descoberta.
    sourcePlan: Array<Omit<RadarLeadSourceStep, 'source'> & { source: string }>;
    remainingQuantity: number;
    purpose?: string | null;
    host: RadarSourceExecutorHost;
  }): Promise<RadarSourceExecutorResult> {
    const seenPhones = new Set(Array.from(input.seenPhones || []).map((phone) => normalizePhoneDigits(phone)).filter(Boolean));
    const optionalSources: Array<{ source: RadarLeadSourceKind; results: WebscrapingContactResult[] }> = [];
    const sourceDiagnostics: RadarLeadSourceResult[] = [];
    const sourceEnginesUsed = new Set<string>();
    const activeOptionalSources = (input.sourcePlan || [])
      .filter((step): step is Omit<RadarLeadSourceStep, 'source'> & { source: RadarLeadSourceKind } => isSearchSourceKind(step.source))
      .filter((step) => step.enabled && step.optional && !['radar_database', 'company_history', 'global_cache', 'hbx_engine'].includes(step.source));
    for (const step of activeOptionalSources) {
      if (input.remainingQuantity <= 0) break;
      if (step.source === 'google_textual') {
        const result = await this.executeGoogleTextual({ ...input, seenPhones });
        this.pushSourceResult(step.source, result, optionalSources, sourceDiagnostics, sourceEnginesUsed, seenPhones);
        continue;
      }
      if (step.source === 'cnpj_public') {
        const result = await this.executeCnpjPublic({ ...input });
        this.pushSourceResult(step.source, result, optionalSources, sourceDiagnostics, sourceEnginesUsed, seenPhones);
        continue;
      }
      if (step.source === 'local_directory') {
        const result = await this.executeLocalDirectory({ ...input });
        this.pushSourceResult(step.source, result, optionalSources, sourceDiagnostics, sourceEnginesUsed, seenPhones);
        continue;
      }
      if (step.source === 'vertical_source') {
        const result = await this.executeVerticalSource({ ...input });
        this.pushSourceResult(step.source, result, optionalSources, sourceDiagnostics, sourceEnginesUsed, seenPhones);
        continue;
      }
      const flag = optionalStubFlag(step.source);
      const stub = input.host.getRadarSearchOrchestrator().buildSkippedSourceResult(
        step.source,
        `${step.reason || step.source}: stub explicito, ainda nao executa${flag ? `; ${flag}=${envEnabled(flag) ? 'true' : 'false'}` : ''}`,
      );
      this.pushSourceResult(step.source, stub, optionalSources, sourceDiagnostics, sourceEnginesUsed, seenPhones);
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
        const output = await input.host.searchHbxEngine({
          ...input.normalized,
          requiredChannels: [],
          channelMatchMode: 'prefer',
        }, Array.from(input.seenPhones), input.options.hbxEngineUrl, {
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

  private async executeCnpjPublic(input: {
    normalized: NormalizedSearchInput;
    remainingQuantity: number;
    host: RadarSourceExecutorHost;
  }): Promise<RadarLeadSourceResult> {
    const source = input.host.getRadarCnpjPublicSource?.() || new RadarCnpjPublicSourceService();
    try {
      const orchestration = input.host.getRadarSearchOrchestrator().plan(input.normalized);
      return await source.run({
        normalized: input.normalized,
        seeds: orchestration.expansion.cnpjSeeds,
        limit: Math.max(1, input.remainingQuantity),
        prisma: input.host.prisma,
      });
    } catch (error) {
      input.host.logger?.warn?.(`[radar-source-executor] cnpj_public falhou sem bloquear delivery: ${String((error as any)?.message || error)}`);
      return input.host.getRadarSearchOrchestrator().buildOptionalSourceFailure({
        source: 'cnpj_public',
        stage: 'search',
        error,
      });
    }
  }

  private async executeLocalDirectory(input: {
    normalized: NormalizedSearchInput;
    remainingQuantity: number;
    host: RadarSourceExecutorHost;
  }): Promise<RadarLeadSourceResult> {
    const source = input.host.getRadarLocalDirectorySource?.() || new RadarLocalDirectorySourceService();
    try {
      const strategy = input.host.getRadarSearchStrategy().resolve(input.normalized);
      const seeds = input.host.getRadarSourceExpansion().buildDirectorySeeds(input.normalized, strategy);
      return await source.run({
        normalized: input.normalized,
        seeds,
        limit: Math.max(1, input.remainingQuantity),
      });
    } catch (error) {
      input.host.logger?.warn?.(`[radar-source-executor] local_directory falhou sem bloquear delivery: ${String((error as any)?.message || error)}`);
      return input.host.getRadarSearchOrchestrator().buildOptionalSourceFailure({
        source: 'local_directory',
        stage: 'search',
        error,
      });
    }
  }

  private async executeVerticalSource(input: {
    normalized: NormalizedSearchInput;
    remainingQuantity: number;
    host: RadarSourceExecutorHost;
  }): Promise<RadarLeadSourceResult> {
    const source = input.host.getRadarVerticalSource?.() || new RadarVerticalSourceService();
    try {
      const strategies = input.host.getRadarSourceExpansion().buildVerticalStrategies(input.normalized);
      return await source.run({
        normalized: input.normalized,
        strategies,
        limit: Math.max(1, input.remainingQuantity),
      });
    } catch (error) {
      input.host.logger?.warn?.(`[radar-source-executor] vertical_source falhou sem bloquear delivery: ${String((error as any)?.message || error)}`);
      return input.host.getRadarSearchOrchestrator().buildOptionalSourceFailure({
        source: 'vertical_source',
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
    const diagnostic = this.diagnostics.sourceDiagnostic({
      stage: result.stage || result.issue?.stage || 'search',
      operation: result.operation || 'optional_source_execute',
      source,
      status: result.status,
      retryable: result.retryable,
      blocksDelivery: result.blocksDelivery ?? result.issue?.blocksDelivery ?? false,
      reason: result.reason,
      traceId: result.traceId || null,
      runId: result.runId || null,
      leadId: result.leadId || null,
      foundCount: result.foundCount,
      acceptedCount: result.acceptedCount,
      rejectedCount: result.rejectedCount,
      issue: result.issue || null,
    });
    sourceDiagnostics.push({
      ...result,
      stage: diagnostic.stage,
      operation: diagnostic.operation,
      status: diagnostic.status as any,
      retryable: diagnostic.retryable,
      blocksDelivery: diagnostic.blocksDelivery,
      traceId: diagnostic.traceId,
      runId: diagnostic.runId,
      leadId: diagnostic.leadId,
      foundCount: diagnostic.foundCount || 0,
      acceptedCount: diagnostic.acceptedCount || 0,
      rejectedCount: diagnostic.rejectedCount || 0,
      reason: diagnostic.reason,
      issue: diagnostic.issue || null,
    });
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
