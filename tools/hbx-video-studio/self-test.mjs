import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { OPENING_SOURCE, TARGET_NAMES, parseTarget } from './config.mjs';
import { VIDEO_TARGETS } from './content.mjs';
import {
  DEMO_CLIENTS,
  DEMO_PRODUCTS,
  buildClientDetail,
  buildClientsResult,
  buildRoute,
  buildSummary,
  confirmDelivery,
  createDemoState,
} from './lib/demo-data.mjs';
import { exists } from './lib/fs-utils.mjs';
import { startStudioServer } from './lib/studio-server.mjs';

function validateContent() {
  assert.deepEqual(parseTarget('all'), [...TARGET_NAMES]);
  assert.deepEqual(parseTarget('commercial'), ['commercial']);
  assert.throws(() => parseTarget('inexistente'), /Alvo inválido/);

  for (const target of TARGET_NAMES) {
    const config = VIDEO_TARGETS[target];
    assert.ok(config, `configuração ausente: ${target}`);
    assert.ok(config.title.trim().length > 0, `título ausente: ${target}`);
    assert.ok(Array.isArray(config.scenes) && config.scenes.length >= 4, `poucas cenas: ${target}`);
    const ids = new Set();
    for (const scene of config.scenes) {
      assert.ok(!ids.has(scene.id), `cena duplicada em ${target}: ${scene.id}`);
      ids.add(scene.id);
      assert.ok(['app', 'opening', 'card'].includes(scene.source), `fonte inválida: ${scene.id}`);
      assert.ok(Number(scene.duration) >= 2, `duração curta/inválida: ${scene.id}`);
      assert.ok(String(scene.narration || '').trim().length > 0, `narração ausente: ${scene.id}`);
      if (scene.source === 'app') assert.match(scene.route, /^\/entrega(?:\/|$)/, `rota fora do app: ${scene.id}`);
    }
  }
}

function validateDemoData() {
  assert.equal(DEMO_CLIENTS.length, 8);
  assert.equal(DEMO_PRODUCTS.length, 4);
  assert.ok(DEMO_CLIENTS.every((item) => item.phoneNormalized.startsWith('19')));
  assert.ok(DEMO_CLIENTS.every((item) => !/jhonatan|hbxsystem\.com\.br/i.test(JSON.stringify(item))));

  const standard = createDemoState({ scenario: 'standard' });
  const route = buildRoute(standard);
  assert.equal(route.items.length, 6);
  assert.equal(route.items.filter((item) => item.status === 'entregue').length, 2);
  assert.equal(route.items.filter((item) => item.status === 'agendada').length, 4);
  assert.equal(buildSummary(standard).entregues, 2);

  const driver = createDemoState({ scenario: 'fresh-driver' });
  assert.equal(buildRoute(driver).items.filter((item) => item.status === 'entregue').length, 0);
  confirmDelivery(driver, 'entrega-001');
  assert.equal(buildRoute(driver).items.filter((item) => item.status === 'entregue').length, 1);

  assert.equal(buildClientsResult('Padaria').items[0].name, 'Padaria Primavera');
  const detail = buildClientDetail('cliente-padaria');
  assert.equal(detail.name, 'Padaria Primavera');
  assert.equal(detail.geoFonte, 'gps_entrega');
}

async function validateStudioServer() {
  assert.equal(await exists(OPENING_SOURCE), true, `opening.html não existe: ${OPENING_SOURCE}`);
  const before = await fs.readFile(OPENING_SOURCE, 'utf8');
  const studio = await startStudioServer();
  try {
    const health = await fetch(`${studio.origin}/health`).then((response) => response.json());
    assert.deepEqual(health, { ok: true });

    const opening = await fetch(`${studio.origin}/opening?title=HBX%20ENTREGAS`).then((response) => response.text());
    assert.match(opening, /id="hbx-video-opening-mode"/);
    assert.match(opening, /HBX ENTREGAS/);
    assert.match(opening, /\.pairing \{ display:none !important; \}/);
    assert.match(opening, /data-hbx-video-ready|hbxVideoReady/);

    const card = await fetch(`${studio.origin}/card?title=Primeira%20rota&cta=Come%C3%A7ar`).then((response) => response.text());
    assert.match(card, /Primeira rota/);
    assert.match(card, /Começar/);
    assert.match(card, /hbxVideoReady/);
  } finally {
    await studio.close();
  }
  const after = await fs.readFile(OPENING_SOURCE, 'utf8');
  assert.equal(after, before, 'o estúdio alterou o opening.html de produção');
}

async function main() {
  validateContent();
  validateDemoData();
  await validateStudioServer();
  console.log('HBX Video Studio: contratos, dados demo e servidor validados.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
