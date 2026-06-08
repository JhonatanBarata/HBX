import { Module } from '@nestjs/common';
import { LeadHarvestImportService } from './lead-harvest-import.service';
import { LeadHarvestNormalizerService } from './lead-harvest-normalizer.service';

@Module({
  providers: [LeadHarvestNormalizerService, LeadHarvestImportService],
  exports: [LeadHarvestNormalizerService, LeadHarvestImportService],
})
export class LeadHarvestModule {}
