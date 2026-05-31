import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarDiagnosticService } from './radar/shared/radar-diagnostic.service';
import { RadarSearchOrchestratorService } from './radar/01-search/radar-search-orchestrator.service';
import { RadarRunPresenterService } from './radar/06-presentation/radar-run-presenter.service';

function presenterHost() {
  return {
    parseMaybeJsonObject: (value: unknown) => {
      if (!value) return {};
      if (typeof value === 'object') return value as Record<string, any>;
      try {
        const parsed = JSON.parse(String(value));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
    },
    extractLeadQualityV2FromObject: () => null,
    extractLeadQualityFromObject: () => null,
    buildRunInputFromRow: () => ({ requiredChannels: [], channelMatchMode: 'prefer', qualityMode: 'list' }),
    normalizeSearchRunStatus: (status: unknown) => String(status || 'completed'),
    normalizeRunItemStatus: (status: unknown) => String(status || 'found'),
    normalizeRadarChannels: (value: unknown) => Array.isArray(value) ? value : [],
    normalizeChannelMatchMode: (value: unknown) => String(value || 'prefer'),
    isRunItemQualityDeliverable: () => true,
    attachDeliveryClassification: (item: any) => item,
    stripListPremiumFields: (item: any) => item,
    normalizeRadiusKm: () => 0,
    getHbxRunBatchLimit: () => 20,
    getHbxRunMaxAttempts: () => 3,
    buildSearchRunInsufficientMessage: () => 'insuficiente',
    resolveRadarRunOperationalState: () => ({ state: 'parado', reason: null, message: null }),
  } as any;
}

test('diagnostic service padroniza source diagnostic completo e nao bloqueante', () => {
  const diagnostics = new RadarDiagnosticService();
  const issue = diagnostics.issue({
    stage: 'social',
    operation: 'social_lookup',
    source: 'instagram',
    status: 'partial_error',
    code: 'social_lookup_failed',
    message: 'Social falhou',
    traceId: 'trace-1',
    runId: 'run-1',
    leadId: 'lead-1',
  });
  const sourceDiagnostic = diagnostics.sourceDiagnostic({
    stage: 'social',
    operation: 'social_lookup',
    source: 'instagram',
    status: 'partial_error',
    retryable: true,
    reason: 'Social falhou',
    traceId: 'trace-1',
    runId: 'run-1',
    leadId: 'lead-1',
    issue,
  });

  assert.equal(sourceDiagnostic.stage, 'social');
  assert.equal(sourceDiagnostic.operation, 'social_lookup');
  assert.equal(sourceDiagnostic.source, 'instagram');
  assert.equal(sourceDiagnostic.status, 'partial_error');
  assert.equal(sourceDiagnostic.retryable, true);
  assert.equal(sourceDiagnostic.blocksDelivery, false);
  assert.equal(sourceDiagnostic.traceId, 'trace-1');
  assert.equal(sourceDiagnostic.runId, 'run-1');
  assert.equal(sourceDiagnostic.leadId, 'lead-1');
});

test('source diagnostics preservam campos padrao em falha opcional', () => {
  const orchestrator = new RadarSearchOrchestratorService();
  const diagnostic = orchestrator.buildOptionalSourceFailure({
    source: 'google_textual',
    stage: 'provider_google',
    error: new Error('timeout'),
  });

  assert.equal(diagnostic.source, 'google_textual');
  assert.equal(diagnostic.stage, 'provider_google');
  assert.equal(diagnostic.operation, 'optional_source_execute');
  assert.equal(diagnostic.status, 'partial_error');
  assert.equal(diagnostic.retryable, true);
  assert.equal(diagnostic.blocksDelivery, false);
  assert.equal(diagnostic.issue?.blocksDelivery, false);
});

test('presentation expoe status issues nao bloqueantes e blockers reais', () => {
  const diagnostics = new RadarDiagnosticService();
  const presenter = new RadarRunPresenterService(diagnostics);
  const nonBlocking = diagnostics.issue({
    stage: 'social',
    operation: 'social_lookup',
    source: 'social',
    status: 'partial_error',
    code: 'social_lookup_failed',
    message: 'Social indisponivel',
  });
  const blocker = diagnostics.issue({
    stage: 'quality_gate',
    operation: 'quality_gate',
    source: 'quality_gate',
    status: 'blocked',
    code: 'missing_minimum_contact',
    message: 'Contato minimo ausente',
  });
  const response = presenter.buildSearchRunResponse({
    id: 'run-1',
    status: 'completed',
    city: 'Curitiba',
    state: 'PR',
    segment: 'clinica',
    engine: 'hbx',
    targetType: 'pj',
    targetQuantity: 1,
    foundCount: 1,
    importedCount: 0,
    duplicateCount: 0,
    skippedCount: 0,
    metricsJson: JSON.stringify({
      sourceDiagnostics: [{
        stage: 'search',
        operation: 'optional_source_execute',
        source: 'google_textual',
        status: 'partial_error',
        retryable: true,
        blocksDelivery: false,
        reason: 'timeout',
      }],
      radarStageIssues: [nonBlocking],
    }),
    items: [{
      id: 'lead-1',
      status: 'found',
      name: 'Clinica Real',
      phone: '41999999999',
      phoneDigits: '41999999999',
      rawJson: JSON.stringify({
        deliveryStatus: 'delivered',
        enrichmentStatus: 'partial',
        socialStatus: 'error',
        sourceDiagnostics: [{ source: 'google_textual', status: 'partial_error', retryable: true, reason: 'timeout' }],
        radarStageIssues: [nonBlocking, blocker],
      }),
      createdAt: new Date('2026-05-31T12:00:00.000Z'),
    }],
    createdAt: new Date('2026-05-31T12:00:00.000Z'),
    updatedAt: new Date('2026-05-31T12:00:00.000Z'),
  }, undefined, presenterHost());

  assert.equal(response.meta.sourceDiagnostics?.[0].operation, 'optional_source_execute');
  assert.equal(response.meta.nonBlockingIssues?.[0].stage, 'social');
  assert.equal(response.items[0].deliveryStatus, 'delivered');
  assert.equal(response.items[0].socialStatus, 'error');
  assert.equal(response.items[0].enrichmentStatus, 'partial');
  assert.equal(response.items[0].nonBlockingIssues?.length, 1);
  assert.equal(response.items[0].deliveryBlockers?.length, 1);
  assert.equal(response.items[0].deliveryBlockers?.[0].stage, 'quality_gate');
});
