import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../frontend/src/app/radar-digital/page.client.tsx', import.meta.url), 'utf8');

test('Radar Digital envia canais reais na busca', () => {
  assert.match(source, /function RadarChannelFilterControls/);
  assert.match(source, /preferredChannels: nextFilters\.preferredChannels/);
  assert.match(source, /requiredChannels: nextFilters\.requiredChannels/);
  assert.match(source, /channelMatchMode: nextFilters\.channelMatchMode/);
  const runBody = source.slice(source.indexOf('/webscraping/radar/search-runs'), source.indexOf('applyRadarRunPayload(payload)'));
  assert.doesNotMatch(runBody, /preferredChannels:\s*\[\]\s*,\s*requiredChannels:\s*\[\]/);
});

test('Radar Digital nao calcula ranking comercial final no front', () => {
  assert.doesNotMatch(source, /function radarCommercialRank/);
  assert.doesNotMatch(source, /sortRadarLeadsForSales/);
  assert.match(source, /const visibleItems = useMemo\(\s*\(\) => searchMatchedItems/);
});

test('Radar Digital mostra explicacao e canais vindos do backend', () => {
  assert.match(source, /function leadExplanation/);
  assert.match(source, /Por que apareceu/);
  assert.match(source, /function RadarLeadChannelIcons/);
  assert.match(source, /aria-label="Canais encontrados"/);
  assert.match(source, /radarCardStatus/);
});
