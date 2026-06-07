import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const hbxProvider = readFileSync(new URL('../backend/src/webscraping/radar/providers/hbx-engine/radar-core-provider.mixin.ts', import.meta.url), 'utf8');
const leadQuality = readFileSync(new URL('../backend/src/webscraping/lead-quality-v2.ts', import.meta.url), 'utf8');
const sharedNormalizer = readFileSync(new URL('../backend/src/webscraping/radar/shared/radar-shared-normalizer.service.ts', import.meta.url), 'utf8');
const delivery = readFileSync(new URL('../backend/src/webscraping/radar/05-delivery/radar-core-delivery.mixin.ts', import.meta.url), 'utf8');
const presentation = readFileSync(new URL('../backend/src/webscraping/radar/06-presentation/radar-core-presentation.mixin.ts', import.meta.url), 'utf8');
const searchLoop = readFileSync(new URL('../backend/src/webscraping/radar/01-search/radar-core-search-loop.mixin.ts', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../backend/prisma/schema.prisma', import.meta.url), 'utf8');

test('backend preserva canais e perfil comercial ao chamar o motor HBX', () => {
  assert.match(hbxProvider, /preferredChannels: input\.preferredChannels/);
  assert.match(hbxProvider, /requiredChannels: input\.requiredChannels/);
  assert.match(hbxProvider, /channelMatchMode: input\.channelMatchMode/);
  assert.match(hbxProvider, /salesProfile: input\.salesProfile/);
  assert.match(hbxProvider, /targetAudience: input\.salesProfile\.targetAudience/);
  assert.match(hbxProvider, /hardRejectSegments/);
});

test('backend aplica requiredChannels com semantica real', () => {
  assert.match(sharedNormalizer, /normalized === 'any_required' \|\| normalized === 'all_required'/);
  assert.match(leadQuality, /channelMatchMode === 'all_required'/);
  assert.match(leadQuality, /channelMatchMode === 'any_required'/);
  assert.match(leadQuality, /missingRequiredChannels/);
});

test('RadarLeadPool persiste evidencia e politica de entrega', () => {
  for (const field of ['evidenceJson', 'rejectReasons', 'qualityReason', 'visibilityTier', 'deliveryProduct']) {
    assert.match(schema, new RegExp(`${field}\\s+String\\?`));
    assert.match(delivery + presentation + hbxProvider, new RegExp(`${field}:`));
  }
});

test('source quality registra approvalRate e penaliza fonte ruim', () => {
  assert.match(schema, /model WebscrapingSourceQuality[\s\S]*approvalRate\s+Float/);
  assert.match(searchLoop, /recordSourceQualityFromRunItems/);
  assert.match(searchLoop, /approvalRate/);
  assert.match(presentation, /_sourceQualityPenalty/);
});
