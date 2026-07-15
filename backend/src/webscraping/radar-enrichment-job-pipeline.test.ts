import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RadarEnrichmentJobPipelineService } from './radar/03-enrichment/radar-enrichment-job-pipeline.service';
import { RadarPostDeliveryVendasUpdateService } from './radar/05-delivery/radar-post-delivery-vendas-update.service';

test('pipeline mantém apenas telemetria pós-aquisição canônica', () => {
  const pipeline = new RadarEnrichmentJobPipelineService();
  const jobs = pipeline.buildJobs({ now: '2026-07-14T10:00:00.000Z' });
  assert.deepEqual(jobs.map((job) => job.type), [
    'radar_web_enrichment',
    'social_lookup',
    'email_enrichment',
    'whatsapp_check',
    'website_crawl_light',
    'cnpj_enrichment',
    'opportunity_signal',
    'post_delivery_update',
  ]);
  assert.equal(jobs.every((job) => job.status === 'queued' && Boolean(job.traceId)), true);
});

test('pipeline não aceita jobs legados de reprocessamento', () => {
  const pipeline = new RadarEnrichmentJobPipelineService();
  assert.equal(pipeline.normalizeJobType('reprocess_missing_social'), 'opportunity_signal');
  assert.equal(pipeline.normalizeJobType('reprocess_old_cards'), 'opportunity_signal');
});

test('pós-entrega cria evento de social possível sem promover contato', () => {
  const service = new RadarPostDeliveryVendasUpdateService();
  const plan = service.buildUpdatePlan({
    currentLead: {},
    row: { id: 'radar-1' },
    data: {
      socialStatus: 'candidate_review',
      possibleSocialCandidates: [{ network: 'instagram', url: 'https://instagram.com/proximo', status: 'possible' }],
    },
    compactEnrichment: null,
    hbxMotor: null,
  });
  assert.equal(plan.timelineEvents.some((event: any) => event.eventType === 'radar_social_possible'), true);
});

test('backend não registra filas autônomas de enriquecimento no DI', () => {
  const moduleSource = readFileSync(join(process.cwd(), 'src/webscraping/webscraping.module.ts'), 'utf8');
  const coreSource = readFileSync(join(process.cwd(), 'src/webscraping/radar/radar-webscraping-core.service.ts'), 'utf8');
  for (const forbidden of [
    'RadarWebEnrichmentJobService',
    'RadarSocialLookupService',
    'RadarPostDeliveryAiSaneamentoService',
    'RadarInternalReprocessSourceService',
  ]) {
    assert.equal(moduleSource.includes(forbidden), false);
    assert.equal(coreSource.includes(forbidden), false);
  }
});
