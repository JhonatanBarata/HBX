import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../frontend/src/app/radar-digital/page.client.tsx', import.meta.url), 'utf8');

test('Radar Digital canais clicados viram obrigatorios sem modo preferir no mobile', () => {
  assert.doesNotMatch(source, /Todos os canais/);
  assert.doesNotMatch(source, /function requireSelectedChannels\(\)/);
  assert.match(source, /const activeChannels = value\.requiredChannels/);
  assert.match(source, /preferredChannels: \[\]/);
  assert.match(source, /channelMatchMode: nextRequiredChannels\.length \? "any_required" : "prefer"/);
  assert.doesNotMatch(source, /requiredChannels:\s*RADAR_CHANNELS\.map/);
});

test('Radar Digital avisa quando filtros obrigatorios ficam fortes', () => {
  assert.match(source, /requiredCount >= 2/);
  assert.match(source, /data-density=\{requiredCount >= 3 \? "strong" : "normal"\}/);
  assert.match(source, /Toque nos ícones para exigir canais obrigatórios\./);
  assert.match(source, /Tudo que estiver marcado será obrigatório\. Isso pode reduzir bastante os cards encontrados\./);
  assert.match(source, /Nenhum canal obrigatório selecionado\./);
  assert.match(source, /Exigindo: \{requiredLabels\[0\]\}/);
  assert.match(source, /Filtro forte: exigindo \{requiredCount\} canais\. Pode reduzir muito os resultados\./);
  assert.match(source, /Filtro obrigatório forte: pode reduzir muito os cards\./);
  assert.match(source, /Rede social obrigatória depende de enriquecimento\. Pode demorar mais e encontrar menos cards\./);
});

test('Radar Digital mostra icone Instagram e aviso quando obrigatorio nao veio confirmado', () => {
  assert.match(source, /function RadarLeadChannelIcons/);
  assert.match(source, /lead\.instagramUrl \? "instagram" : null/);
  assert.match(source, /Instagram foi exigido, mas nenhum perfil foi confirmado nos cards entregues/);
});
