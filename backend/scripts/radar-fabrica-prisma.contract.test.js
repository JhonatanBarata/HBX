'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const backendRoot = path.resolve(__dirname, '..');
const schema = fs.readFileSync(path.join(backendRoot, 'prisma', 'schema.prisma'), 'utf8');

function modelBlock(name) {
  const match = schema.match(new RegExp(`model\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `model ${name} precisa existir no schema.prisma`);
  return match[1];
}

function migration(name) {
  return fs.readFileSync(path.join(backendRoot, 'prisma', 'migrations', name, 'migration.sql'), 'utf8');
}

test('RadarFabricaRun existe no schema e corresponde à migration já publicada', () => {
  const block = modelBlock('RadarFabricaRun');
  const sql = migration('20260702200000_add_radar_fabrica_run');
  for (const field of [
    'id', 'key', 'running', 'stopRequested', 'budget', 'processed', 'materialized',
    'contactsWritten', 'paidAttempts', 'lastLeadId', 'lastError', 'startedAt',
    'finishedAt', 'createdAt', 'updatedAt',
  ]) {
    assert.match(block, new RegExp(`^\\s*${field}\\s+`, 'm'), `RadarFabricaRun.${field} ausente no schema`);
    assert.match(sql, new RegExp(`"${field}"`), `RadarFabricaRun.${field} ausente na migration`);
  }
});

test('RadarFactoryCursor existe no schema para o freio durável da fábrica e da ponte', () => {
  const block = modelBlock('RadarFactoryCursor');
  const sql = migration('20260509_radar_factory_cursor');
  for (const field of ['id', 'key', 'enabled', 'forcedOn', 'status', 'lastError', 'createdAt', 'updatedAt']) {
    assert.match(block, new RegExp(`^\\s*${field}\\s+`, 'm'), `RadarFactoryCursor.${field} ausente no schema`);
    assert.match(sql, new RegExp(`"${field}"`), `RadarFactoryCursor.${field} ausente na migration`);
  }
});
