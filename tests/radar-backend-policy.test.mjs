import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const service = readFileSync(new URL('../backend/src/webscraping/webscraping.service.ts', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../backend/prisma/schema.prisma', import.meta.url), 'utf8');

test('backend preserva canais e perfil comercial ao chamar o motor HBX', () => {
  assert.match(service, /preferredChannels: input\.preferredChannels/);
  assert.match(service, /requiredChannels: input\.requiredChannels/);
  assert.match(service, /channelMatchMode: input\.channelMatchMode/);
  assert.match(service, /salesProfile: input\.salesProfile/);
  assert.match(service, /targetAudience: input\.salesProfile\.targetAudience/);
  assert.match(service, /hardRejectSegments/);
});

test('backend aplica requiredChannels com semantica real', () => {
  assert.match(service, /mode === 'all_required' \? matches\.length === required\.length : matches\.length > 0/);
  assert.match(service, /if \(mode === 'prefer'\) return true/);
  assert.match(service, /matchesRadarChannelFilters/);
});

test('RadarLeadPool persiste evidencia e politica de entrega', () => {
  for (const field of ['evidenceJson', 'rejectReasons', 'qualityReason', 'visibilityTier', 'deliveryProduct']) {
    assert.match(schema, new RegExp(`${field}\\s+String\\?`));
    assert.match(service, new RegExp(`${field}:`));
  }
});

test('source quality registra approvalRate e penaliza fonte ruim', () => {
  assert.match(schema, /model WebscrapingSourceQuality[\s\S]*approvalRate\s+Float/);
  assert.match(service, /recordSourceQualityFromRunItems/);
  assert.match(service, /_sourceQualityPenalty/);
});
