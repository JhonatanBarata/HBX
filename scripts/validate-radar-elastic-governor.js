#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const checks = [];

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function addCheck(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail });
}

function includes(relativePath, pattern, label) {
  const text = read(relativePath);
  const ok = typeof pattern === 'string' ? text.includes(pattern) : pattern.test(text);
  addCheck(label || `${relativePath} contem ${pattern}`, ok, relativePath);
}

function excludes(relativePath, pattern, label) {
  const text = read(relativePath);
  const ok = typeof pattern === 'string' ? !text.includes(pattern) : !pattern.test(text);
  addCheck(label || `${relativePath} nao contem ${pattern}`, ok, relativePath);
}

const compose = read('docker-compose.yml');
addCheck(
  'docker-compose deixa hbx-engine-* fora do up padrao via profile',
  /x-hbx-engine-common:[\s\S]*profiles:\s*\["hbx-engines"\]/.test(compose),
  'docker-compose.yml',
);
addCheck(
  'backend local inicia com governor desligado por padrao',
  compose.includes('HBX_ENGINE_GOVERNOR_ENABLED: ${HBX_ENGINE_GOVERNOR_ENABLED:-false}'),
  'docker-compose.yml',
);

excludes(
  'scripts/start-all.ps1',
  /hbx-engine-\d+|start-hbx-engines/i,
  'npm run up nao chama frota hbx-engine-* explicitamente',
);
includes(
  'scripts/start-hbx-engines.ps1',
  /return 3/,
  'warm pool local explicito usa 3 motores por padrao',
);
includes(
  'scripts/release.js',
  'const HBX_DEFAULT_PUBLISH_ENGINE_COUNT = 3;',
  'release seletivo usa warm pool pequeno por padrao',
);
includes(
  'scripts/deploy-hostinger.js',
  'const HBX_DEFAULT_PUBLISH_ENGINE_COUNT = 3;',
  'publish/deploy normal usa warm pool pequeno por padrao',
);
includes(
  'scripts/generate-hbx-engines-compose.js',
  'HBX_LEGACY_ENGINE_WATCHDOG_ENABLED:-false',
  'watchdog legado fica desligado por padrao',
);
includes(
  'backend/src/webscraping/hbx-engine-governor.service.ts',
  'HBX_ENGINE_GOVERNOR_ENABLED',
  'governor continua opt-in por env',
);
includes(
  'backend/src/webscraping/hbx-engine-governor.service.ts',
  'if (!shouldEnableHbxEngineGovernor()) return;',
  'governor nao agenda loop quando flag nao esta explicita',
);
includes(
  'backend/src/webscraping/hbx-engine-docker-adapter.service.ts',
  "/^hbx-engine-\\d+$/.test",
  'docker adapter atua somente em hbx-engine-N',
);
includes(
  'hbx-owner/local-agent/server.js',
  'return /^hbx-engine-\\d+$/.test',
  'local-agent Owner bloqueia container fora de hbx-engine-N',
);
includes(
  'docs/PLANEJAMENTORADAR-08-VALIDACAO-ROLLBACK.md',
  'HBX_ENGINE_GOVERNOR_ENABLED=false',
  'rollback documenta desativar governor',
);
includes(
  'docs/PLANEJAMENTORADAR-08-VALIDACAO-ROLLBACK.md',
  'HBX_ENGINE_DOCKER_ACTUATOR_ENABLED=false',
  'rollback documenta desativar atuador Docker',
);

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  console.log(`${check.ok ? '[OK]' : '[FALHA]'} ${check.name}${check.detail ? ` (${check.detail})` : ''}`);
}

if (failed.length) {
  console.error(`\nValidacao Radar Elastic Governor falhou: ${failed.length}/${checks.length}.`);
  process.exit(1);
}

console.log(`\nValidacao Radar Elastic Governor OK: ${checks.length} checks.`);
