import { Module } from '@nestjs/common';
import { EnrichmentCostService } from './enrichment-cost.service';
import { ExternalDisabledEmailEnrichmentProvider } from './external-disabled-email-enrichment.provider';

@Module({
  providers: [EnrichmentCostService, ExternalDisabledEmailEnrichmentProvider],
  exports: [EnrichmentCostService, ExternalDisabledEmailEnrichmentProvider],
})
export class EnrichmentCostModule {}
