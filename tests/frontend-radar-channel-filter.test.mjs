import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../frontend/src/app/radar-digital/page.client.tsx', import.meta.url), 'utf8');

test('Radar Digital Todos os canais nao seleciona automaticamente os 6 canais', () => {
  assert.match(source, /Todos os canais/);
  assert.match(source, /function requireSelectedChannels\(\)/);
  assert.match(source, /requiredChannels: activeChannels/);
  assert.doesNotMatch(source, /requiredChannels:\s*RADAR_CHANNELS\.map/);
});

test('Radar Digital avisa quando filtros obrigatorios ficam fortes', () => {
  assert.match(source, /requiredCount >= 2/);
  assert.match(source, /Filtro obrigatório forte: pode reduzir muito ou zerar os cards\./);
  assert.match(source, /Rede social obrigatória depende de enriquecimento\. Pode demorar mais e encontrar menos cards\./);
});
