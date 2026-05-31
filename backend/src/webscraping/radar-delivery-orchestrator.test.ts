import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarDeliveryOrchestratorService } from './radar/05-delivery/radar-delivery-orchestrator.service';
import { RadarPostDeliveryUpdateService } from './radar/05-delivery/radar-post-delivery-update.service';

test('radar delivery schedules post-delivery jobs after Vendas import', () => {
  const postDelivery = new RadarPostDeliveryUpdateService();
  const orchestrator = new RadarDeliveryOrchestratorService(postDelivery);

  const delivered = orchestrator.buildDeliveredState({
    lead: {
      id: 'radar-1',
      name: 'Empresa Real',
      socialStatus: 'pending',
    },
    vendasLeadId: 42,
    metadata: { targetType: 'pj' },
    enrichment: { enrichmentStatus: 'partial' },
    now: '2026-05-30T12:00:00.000Z',
  });

  assert.equal(delivered.snapshot.leadStatus, 'qualified');
  assert.equal(delivered.snapshot.deliveryStatus, 'delivered');
  assert.equal(delivered.postDeliveryUpdate.status, 'scheduled');
  assert.deepEqual(
    delivered.jobs.map((job) => job.type),
    ['social', 'email', 'whatsapp', 'site', 'score_update', 'post_delivery_update'],
  );
  assert.equal(delivered.metadataPatch.vendasLeadId, 42);
});

test('social failure after delivery stays delivered and becomes retryable', () => {
  const postDelivery = new RadarPostDeliveryUpdateService();
  const orchestrator = new RadarDeliveryOrchestratorService(postDelivery);
  const delivered = orchestrator.buildDeliveredState({
    lead: { id: 'radar-1', name: 'Empresa Real', socialStatus: 'pending' },
    vendasLeadId: 42,
    now: '2026-05-30T12:00:00.000Z',
  });

  const failed = orchestrator.markPostDeliveryFailure({
    metadata: delivered.metadataPatch,
    enrichment: delivered.enrichmentPatch,
    stage: 'social',
    error: new Error('Motor social indisponivel'),
    now: '2026-05-30T12:05:00.000Z',
  });

  assert.equal(failed.metadata.deliveryStatus, 'delivered');
  assert.equal(failed.metadata.leadStatus, 'qualified');
  assert.equal(failed.metadata.socialStatus, 'error');
  assert.equal(failed.metadata.postDeliveryUpdate.status, 'retryable');
  assert.equal(failed.metadata.postDeliveryUpdate.retryable, true);
  assert.equal(failed.metadata.radarStageIssues.at(-1).blocksDelivery, false);
  assert.equal(failed.enrichment.deliveryStatus, 'delivered');
});
