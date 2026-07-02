import { RadarCorePublicSearchMixin } from './01-search/radar-core-public-search.mixin';
import { RadarCoreSearchRunnerMixin } from './01-search/radar-core-search-runner.mixin';
import { RadarCoreQualityEnrichmentMixin } from './03-enrichment/radar-core-quality-enrichment.mixin';
import { RadarCoreSearchLoopMixin } from './01-search/radar-core-search-loop.mixin';
import { RadarCorePresentationMixin } from './06-presentation/radar-core-presentation.mixin';
import { RadarCoreDeliveryMixin } from './05-delivery/radar-core-delivery.mixin';
import { RadarCoreDistributionMixin } from './05-delivery/radar-core-distribution.mixin';
import { RadarCoreMasterDatabaseMixin } from './01-search/radar-core-master-database.mixin';
import { RadarCoreHistoryPersistenceMixin } from './persistence/radar-core-history-persistence.mixin';
import { RadarCoreProviderMixin } from './providers/hbx-engine/radar-core-provider.mixin';

const RADAR_CORE_MIXINS = [
  RadarCorePublicSearchMixin,
  RadarCoreSearchRunnerMixin,
  RadarCoreQualityEnrichmentMixin,
  RadarCoreSearchLoopMixin,
  RadarCorePresentationMixin,
  RadarCoreDeliveryMixin,
  RadarCoreDistributionMixin,
  RadarCoreMasterDatabaseMixin,
  RadarCoreHistoryPersistenceMixin,
  RadarCoreProviderMixin,
];

export function applyRadarCoreMixins(targetCtor: any) {
  for (const mixinCtor of RADAR_CORE_MIXINS) {
    for (const name of Object.getOwnPropertyNames(mixinCtor.prototype)) {
      if (name === 'constructor') continue;
      Object.defineProperty(
        targetCtor.prototype,
        name,
        Object.getOwnPropertyDescriptor(mixinCtor.prototype, name) || Object.create(null),
      );
    }
  }
}
