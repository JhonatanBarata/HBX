const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const agentSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const backendModuleSource = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'backend', 'src', 'webscraping', 'webscraping.module.ts'),
  'utf8',
);

test('Night Factory is bound to the local HBX Owner and never proxied to the backend', () => {
  assert.match(agentSource, /const HOST = "127\.0\.0\.1";/);
  assert.match(agentSource, /const PORT = 3107;/);
  assert.doesNotMatch(agentSource, /HBX_OWNER_LOCAL_AGENT_PORT/);
  assert.match(agentSource, /url\.pathname === "\/owner\/fabrica\/start"/);
  assert.match(agentSource, /startEnricher\(\{ budget:/);
  assert.match(agentSource, /if \(!Number\(row\.ownerCompanyId \|\| 0\)\) continue;/);
  assert.equal((agentSource.match(/startEnricher\(/g) || []).length, 2, 'definition + explicit Owner start route only');
  assert.doesNotMatch(agentSource, /backendRequest\("POST", "\/modules\/owner\/fabrica\/start"/);
  assert.doesNotMatch(agentSource, /backendRequest\("POST", "\/modules\/owner\/night-factory\/run-now"/);
});

test('VPS backend contains no executable Radar Fabrica provider or controller', () => {
  assert.doesNotMatch(backendModuleSource, /RadarFabrica(Service|Controller)/);
});
