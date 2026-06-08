#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const checks = [];

function file(relativePath) {
  return path.join(repoRoot, relativePath);
}

function read(relativePath) {
  return fs.readFileSync(file(relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(file(relativePath));
}

function addCheck(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail });
}

function includes(relativePath, pattern, name) {
  const text = read(relativePath);
  const ok = typeof pattern === 'string' ? text.includes(pattern) : pattern.test(text);
  addCheck(name, ok, relativePath);
}

function excludes(relativePath, pattern, name) {
  const text = read(relativePath);
  const ok = typeof pattern === 'string' ? !text.includes(pattern) : !pattern.test(text);
  addCheck(name, ok, relativePath);
}

function runCheck(name, command, args) {
  try {
    execFileSync(command, args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    addCheck(name, true, [command, ...args].join(' '));
  } catch (error) {
    const stderr = String(error.stderr || error.stdout || error.message || '').trim();
    addCheck(name, false, stderr.slice(0, 500));
  }
}

const planningRoot = 'docs/PLANEJAMENTOS/OPS CONTROL - NIGHT SCRAPING';
for (const step of [
  '13-contratos-harvest-import.md',
  '14-vps-api-oficial-lead-harvest.md',
  '15-local-lab-api-experimental.md',
  '16-importador-seguro-vps.md',
  '17-enriquecimento-email-gratis-v2.md',
  '18-governanca-custo-api-paga.md',
  '19-observacao-desktop-list-lead-plus.md',
  '20-ops-control-email-lab.md',
  '21-rollout-checklist-codex.md',
]) {
  addCheck(`planejamento ${step} existe`, exists(`${planningRoot}/${step}`), `${planningRoot}/${step}`);
}

for (const flag of [
  'HBX_LEAD_HARVEST_IMPORT_ENABLED=false',
  'HBX_LOCAL_LAB_IMPORT_ENABLED=false',
  'HBX_EMAIL_SMART_ENRICH_V2_ENABLED=false',
  'HBX_PAID_ENRICHMENT_LEDGER_ENABLED=false',
  'HBX_GOOGLE_PAID_FALLBACK_ENABLED=false',
  'HBX_EMAIL_PROVIDER_FALLBACK_ENABLED=false',
]) {
  includes('backend/.env.example', flag, `flag default segura ${flag}`);
}

includes('backend/src/webscraping/webscraping.controller.ts', "@Post('lead-harvest/import')", 'API oficial de import existe');
includes('backend/src/webscraping/webscraping.controller.ts', "@Get('lead-harvest/imports/:id')", 'API oficial de consulta existe');
includes('backend/src/webscraping/lead-harvest/lead-harvest-import.service.ts', 'negative_history', 'importador preserva negativos');
includes('backend/src/webscraping/lead-harvest/lead-harvest-import.service.ts', 'opt_out', 'importador preserva opt-outs');
includes('backend/src/webscraping/lead-harvest/lead-harvest-import.service.ts', 'duplicate_email', 'importador deduplica e-mail');
includes('backend/prisma/schema.prisma', 'model EnrichmentCostLedger', 'ledger de custo esta modelado');
addCheck('migracao do ledger de custo existe', exists('backend/prisma/migrations/20260608_enrichment_cost_ledger/migration.sql'), 'backend/prisma/migrations/20260608_enrichment_cost_ledger/migration.sql');

includes('hbx-local-lab/server.js', 'POST', 'Local Lab expõe servidor HTTP seguro');
includes('hbx-local-lab/server.js', '/local-lab/jobs', 'Local Lab tem rota de jobs');
includes('hbx-local-lab/exporters/hbx-jsonl-exporter.js', 'buildBatchExport', 'Local Lab exporta contrato HBX');
excludes('hbx-local-lab/server.js', /OPS_CONTROL_VPS|VPS_BACKEND|JWT_SECRET|DATABASE_URL/i, 'Local Lab nao conhece credencial da VPS');

includes('ops-control/server.js', "app.get('/api/email-lab/status'", 'Ops Control expõe status Email Lab');
includes('ops-control/server.js', "app.post('/api/email-lab/local/jobs'", 'Ops Control cria job local');
includes('ops-control/server.js', "app.post('/api/email-lab/vps/import'", 'Ops Control importa na VPS');
excludes('ops-control/server.js', /email-lab\/.*(?:shell|exec|cmd|command)/i, 'Ops Control nao abre shell livre no Email Lab');

includes('frontend/src/app/radar-digital/page.client.tsx', 'HBX Lead Plus', 'Observacao desktop separa Lead Plus');
includes('frontend/src/app/radar-digital/page.client.tsx', 'HBX List', 'Observacao desktop separa List');

runCheck('node --check ops-control/server.js', 'node', ['--check', 'ops-control/server.js']);
runCheck('node --check ops-control/public/app.js', 'node', ['--check', 'ops-control/public/app.js']);
runCheck('git diff --check', 'git', ['diff', '--check']);

for (const check of checks) {
  console.log(`${check.ok ? '[OK]' : '[FALHA]'} ${check.name}${check.detail ? ` (${check.detail})` : ''}`);
}

const failed = checks.filter((check) => !check.ok);
if (failed.length) {
  console.error(`\nRollout Email Lab falhou: ${failed.length}/${checks.length} checks.`);
  process.exit(1);
}

console.log(`\nRollout Email Lab OK: ${checks.length} checks.`);
