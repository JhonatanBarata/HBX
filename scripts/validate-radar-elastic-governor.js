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

function findFileByName(rootRelativePath, fileName) {
  const root = path.join(repoRoot, rootRelativePath);
  if (!fs.existsSync(root)) return null;
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isFile() && entry.name === fileName) {
      return path.relative(repoRoot, absolutePath).replace(/\\/g, '/');
    }
    if (entry.isDirectory()) {
      const found = findFileByName(path.relative(repoRoot, absolutePath), fileName);
      if (found) return found;
    }
  }
  return null;
}

const rollbackDoc = findFileByName('docs', 'PLANEJAMENTORADAR-08-VALIDACAO-ROLLBACK.md');
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
  'scripts/stop-hbx-engines.ps1',
  /return 3/,
  'engines:down usa 3 motores por padrao',
);
includes(
  'scripts/stop-all.ps1',
  /return 3/,
  'npm run down limpa warm pool dedicado pequeno por padrao',
);
includes(
  'scripts/release.js',
  'const HBX_DEFAULT_ENGINE_CAPACITY = 20;',
  'release seletivo usa capacidade elastica 20 por padrao',
);
includes(
  'scripts/release.js',
  'const HBX_DEFAULT_PUBLISH_WARM_ENGINE_COUNT = 3;',
  'release seletivo usa warm pool 3 por padrao',
);
includes(
  'scripts/release.js',
  'remove_extra_hbx_engines',
  'release seletivo remove motores HBX excedentes',
);
includes(
  'scripts/release.js',
  'if [ "$created_count" -ne "$HBX_ENGINE_COUNT" ]',
  'release seletivo valida capacidade criada',
);
includes(
  'scripts/release.js',
  'HBX_ENGINE_GOVERNOR_ENABLED="${HBX_ENGINE_GOVERNOR_ENABLED:-true}"',
  'release seletivo habilita governor elastico por padrao',
);
includes(
  'scripts/deploy-hostinger.js',
  'const HBX_DEFAULT_ENGINE_CAPACITY = 20;',
  'publish/deploy normal usa capacidade elastica 20 por padrao',
);
includes(
  'scripts/deploy-hostinger.js',
  'const HBX_DEFAULT_PUBLISH_WARM_ENGINE_COUNT = 3;',
  'publish/deploy normal usa warm pool 3 por padrao',
);
includes(
  'scripts/deploy-hostinger.js',
  'remove_extra_hbx_engines',
  'publish/deploy normal remove motores HBX excedentes',
);
includes(
  'scripts/deploy-hostinger.js',
  'if [ "$created_count" -ne "$HBX_ENGINE_COUNT" ]',
  'publish/deploy normal valida capacidade criada',
);
includes(
  'scripts/deploy-hostinger.js',
  'HBX_ENGINE_GOVERNOR_ENABLED="${HBX_ENGINE_GOVERNOR_ENABLED:-true}"',
  'publish/deploy normal habilita governor elastico por padrao',
);
includes(
  'scripts/cleanup-hbx-extra-engines-vps.js',
  'const DEFAULT_KEEP_COUNT = 20;',
  'cleanup de VPS preserva capacidade elastica por padrao',
);
excludes(
  'docker-compose.hostinger.yml',
  /hbx-engine-50/,
  'compose Hostinger nao declara mais hbx-engine-50',
);
excludes(
  'docker-compose.yml',
  /hbx-engine-50/,
  'compose local nao declara mais hbx-engine-50',
);
includes(
  'docker-compose.hostinger.yml',
  'container_name: hbx-engine-20',
  'compose Hostinger declara capacidade padrao de 20 motores',
);
includes(
  'scripts/generate-hbx-engines-compose.js',
  'const DEFAULT_COUNT = 20;',
  'compose gerado usa capacidade padrao 20',
);
excludes(
  'scripts/generate-hbx-engines-compose.js',
  'hbx-engine-watchdog',
  'gerador de compose nao cria watchdog legado',
);
excludes(
  'docker-compose.hostinger.yml',
  'hbx-engine-watchdog',
  'compose Hostinger nao declara watchdog legado',
);
excludes(
  'docker-compose.hbx-engines.generated.yml',
  'hbx-engine-watchdog',
  'compose gerado nao declara watchdog legado',
);
includes(
  'scripts/deploy-hostinger.js',
  'hbx-engine-watchdog',
  'publish remove container watchdog legado se existir',
);
includes(
  'scripts/release.js',
  'hbx-engine-watchdog',
  'release remove container watchdog legado se existir',
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
  'backend/src/webscraping/hbx-engine-governor.service.ts',
  'syncElasticEngineDesiredStates',
  'governor sincroniza alvo elastico antes de acionar Docker',
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
if (rollbackDoc) {
  includes(
    rollbackDoc,
    'HBX_ENGINE_GOVERNOR_ENABLED=false',
    'rollback documenta desativar governor',
  );
  includes(
    rollbackDoc,
    'HBX_ENGINE_DOCKER_ACTUATOR_ENABLED=false',
    'rollback documenta desativar atuador Docker',
  );
} else {
  addCheck('rollback documenta desativar governor', false, 'PLANEJAMENTORADAR-08-VALIDACAO-ROLLBACK.md');
  addCheck('rollback documenta desativar atuador Docker', false, 'PLANEJAMENTORADAR-08-VALIDACAO-ROLLBACK.md');
}

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  console.log(`${check.ok ? '[OK]' : '[FALHA]'} ${check.name}${check.detail ? ` (${check.detail})` : ''}`);
}

if (failed.length) {
  console.error(`\nValidacao Radar Elastic Governor falhou: ${failed.length}/${checks.length}.`);
  process.exit(1);
}

console.log(`\nValidacao Radar Elastic Governor OK: ${checks.length} checks.`);
