import { Injectable, Optional } from '@nestjs/common';
import type { NormalizedSearchInput } from '../shared/radar-types';
import type { WebscrapingContactResult } from '../shared/radar-core-shared';
import { buildRadarStageIssue } from '../shared/radar-stage-policy';
import { RadarSourceExpansionService, type RadarSourceExpansionPlan } from './radar-source-expansion.service';
import { RadarSourcePlannerService, type RadarSearchSourcePlanItem } from './radar-source-planner.service';
import { RadarSearchStrategyService, type RadarSearchStrategy } from './radar-search-strategy.service';
import type {
  RadarLeadSourceKind,
  RadarLeadSourceResult,
} from './radar-lead-source.types';

export type RadarSearchOrchestration = {
  strategy: RadarSearchStrategy;
  sources: RadarSearchSourcePlanItem[];
  expansion: RadarSourceExpansionPlan;
  activeSources: string[];
  implementedSources: string[];
  pendingSources: string[];
  diagnostics: RadarLeadSourceResult[];
};

function publicStrategyMode(mode: string) {
  const aliases: Record<string, string> = {
    fast: 'rapido',
    quality: 'qualidade',
    deep: 'profundo',
    night_factory: 'fabrica_noturna',
  };
  return aliases[mode] || mode;
}

@Injectable()
export class RadarSearchOrchestratorService {
  constructor(
    @Optional() private readonly strategies?: RadarSearchStrategyService,
    @Optional() private readonly sourcePlanner?: RadarSourcePlannerService,
    @Optional() private readonly sourceExpansion?: RadarSourceExpansionService,
  ) {}

  private getStrategies() {
    return this.strategies || new RadarSearchStrategyService();
  }

  private getSourcePlanner() {
    return this.sourcePlanner || new RadarSourcePlannerService();
  }

  private getSourceExpansion() {
    return this.sourceExpansion || new RadarSourceExpansionService();
  }

  plan(input: NormalizedSearchInput, context: {
    purpose?: string | null;
    flags?: {
      allowStoredLeadLookup?: boolean;
      radarEnabled?: boolean;
      historyEnabled?: boolean;
      globalCacheEnabled?: boolean;
      skipRadarLookup?: boolean;
      skipPrivateHistory?: boolean;
      skipTechnicalCache?: boolean;
    };
  } = {}): RadarSearchOrchestration {
    const strategy = this.getStrategies().resolve(input, { purpose: context.purpose });
    const sources = this.getSourcePlanner().plan(input, strategy, context.flags || {});
    const expansion = this.getSourceExpansion().buildExpansionPlan(input, strategy);
    const active = sources.filter((source) => source.enabled);
    return {
      strategy,
      sources,
      expansion,
      activeSources: active.map((source) => source.source),
      implementedSources: active.filter((source) => source.implemented).map((source) => source.source),
      pendingSources: active.filter((source) => !source.implemented).map((source) => source.source),
      diagnostics: active
        .filter((source) => !source.implemented)
        .map((source) => this.buildSkippedSourceResult(source.source, source.reason)),
    };
  }

  buildSkippedSourceResult(source: RadarLeadSourceKind, reason: string): RadarLeadSourceResult {
    return {
      source,
      status: 'skipped',
      retryable: false,
      foundCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      reason,
      results: [],
    };
  }

  buildOptionalSourceFailure(input: {
    source: RadarLeadSourceKind;
    stage?: 'provider_google' | 'search';
    error: unknown;
    foundCount?: number;
    acceptedCount?: number;
  }): RadarLeadSourceResult {
    const issue = buildRadarStageIssue({
      stage: input.stage || (input.source === 'google_textual' ? 'provider_google' : 'search'),
      code: input.source === 'google_textual' ? 'google_textual_failed' : `${input.source}_failed`,
      message: String((input.error as any)?.message || input.error || 'Fonte opcional falhou.'),
      retryable: true,
      blocksDelivery: false,
    });
    return {
      source: input.source,
      status: 'partial_error',
      retryable: true,
      foundCount: input.foundCount || 0,
      acceptedCount: input.acceptedCount || 0,
      rejectedCount: 0,
      reason: issue.message,
      results: [],
      issue,
    };
  }

  buildCompletedSourceResult(input: {
    source: RadarLeadSourceKind;
    results: WebscrapingContactResult[];
    foundCount?: number;
    rejectedCount?: number;
    reason?: string;
  }): RadarLeadSourceResult {
    const results = Array.isArray(input.results) ? input.results : [];
    return {
      source: input.source,
      status: 'completed',
      retryable: false,
      foundCount: input.foundCount ?? results.length,
      acceptedCount: results.length,
      rejectedCount: input.rejectedCount || 0,
      reason: input.reason || (results.length ? 'fonte_complementar_executada' : 'fonte_sem_resultado'),
      results,
    };
  }

  buildMeta(input: NormalizedSearchInput, meta: Record<string, any>, context: {
    purpose?: string | null;
    flags?: Record<string, any>;
  } = {}) {
    const orchestration = this.plan(input, context);
    return {
      searchStrategy: {
        mode: publicStrategyMode(orchestration.strategy.mode),
        reason: orchestration.strategy.reason,
        targetCards: orchestration.strategy.targetCards,
        maxProviderRounds: orchestration.strategy.maxProviderRounds,
      },
      sourcePlan: orchestration.sources.map((source) => ({
        source: source.source,
        enabled: source.enabled,
        implemented: source.implemented,
        stopWhenEnough: source.stopWhenEnough,
      })),
      activeSources: orchestration.activeSources,
      pendingSources: orchestration.pendingSources,
      sourceExpansion: orchestration.expansion,
      sourceDiagnostics: orchestration.diagnostics.map((diagnostic) => ({
        source: diagnostic.source,
        status: diagnostic.status,
        retryable: diagnostic.retryable,
        foundCount: diagnostic.foundCount,
        acceptedCount: diagnostic.acceptedCount,
        rejectedCount: diagnostic.rejectedCount,
        reason: diagnostic.reason,
        issue: diagnostic.issue || null,
      })),
      ...(meta || {}),
    };
  }
}
