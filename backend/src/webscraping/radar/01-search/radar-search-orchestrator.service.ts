import { Injectable, Optional } from '@nestjs/common';
import type { NormalizedSearchInput } from '../shared/radar-types';
import { RadarSourceExpansionService, type RadarSourceExpansionPlan } from './radar-source-expansion.service';
import { RadarSourcePlannerService, type RadarSearchSourcePlanItem } from './radar-source-planner.service';
import { RadarSearchStrategyService, type RadarSearchStrategy } from './radar-search-strategy.service';

export type RadarSearchOrchestration = {
  strategy: RadarSearchStrategy;
  sources: RadarSearchSourcePlanItem[];
  expansion: RadarSourceExpansionPlan;
  activeSources: string[];
  implementedSources: string[];
  pendingSources: string[];
};

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
    };
  }

  buildMeta(input: NormalizedSearchInput, meta: Record<string, any>, context: {
    purpose?: string | null;
    flags?: Record<string, any>;
  } = {}) {
    const orchestration = this.plan(input, context);
    return {
      searchStrategy: {
        mode: orchestration.strategy.mode,
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
      ...(meta || {}),
    };
  }
}
