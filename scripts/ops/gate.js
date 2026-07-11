'use strict';

// G4 — Quality gate local (docs/PLANEJAMENTOS/GOLIVE-DELTA/G4-QUALITY-GATE.md).
//
// Roda os checks-chave de cada workspace EM SEQUENCIA e para no primeiro vermelho.
// So executa checks (build/lint/test) — nunca publica, nunca toca VPS/credenciais.
//
// Uso:
//   npm run gate            (raiz)
//   node ./scripts/ops/gate.js
//
// Chamado automaticamente pelo `npm run publish` antes do deploy (ver scripts/ops/publish.js).
// Escape de emergencia (NAO usar por rotina): --skip-gate ou HBX_SKIP_GATE=1 no publish —
// o proprio `npm run gate` sempre roda tudo quando chamado direto.

const path = require('path');
const {
  logStage,
  quietToolEnv,
  repoRoot,
  runStep,
} = require('./common');

const steps = [
  {
    label: 'backend: build (tsc + prisma generate)',
    cwd: path.join(repoRoot, 'backend'),
    command: 'npm',
    args: ['run', 'build'],
  },
  {
    label: 'backend: test:credits (créditos, carteira, débito master, estorno)',
    cwd: path.join(repoRoot, 'backend'),
    command: 'npm',
    args: ['run', 'test:credits'],
  },
  {
    label: 'backend: test:tenant-guard (unit — trava de tenant sem banco)',
    cwd: path.join(repoRoot, 'backend'),
    command: 'npm',
    args: ['run', 'test:tenant-guard'],
  },
  {
    label: 'backend: tenant isolation (integration — pula sozinho se Postgres local indisponível)',
    cwd: path.join(repoRoot, 'backend'),
    command: 'node',
    args: ['--test', 'dist/prisma/tenant-isolation.integration.test.js'],
  },
  {
    label: 'frontend: lint (0 errors)',
    cwd: path.join(repoRoot, 'frontend'),
    command: 'npm',
    args: ['run', 'lint'],
  },
  {
    label: 'frontend: build',
    cwd: path.join(repoRoot, 'frontend'),
    command: 'npm',
    args: ['run', 'build'],
  },
  {
    label: 'Webwhats: typecheck',
    cwd: path.join(repoRoot, 'Webwhats'),
    command: 'npm',
    args: ['run', 'typecheck'],
  },
  {
    label: 'hbx-scraping-engine: pytest -q',
    cwd: path.join(repoRoot, 'hbx-scraping-engine'),
    command: 'python',
    args: ['-m', 'pytest', '-q'],
  },
];

function main() {
  const startedAt = Date.now();
  console.log('\n=== HBX Quality Gate (G4) ===');
  console.log(`${steps.length} checks em sequencia. Para no primeiro vermelho — nada de deploy/VPS aqui.\n`);

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    logStage(`[${i + 1}/${steps.length}] ${step.label}`);
    try {
      runStep(step.command, step.args, { cwd: step.cwd, env: quietToolEnv() });
    } catch (error) {
      console.error(`\n>>> GATE VERMELHO na etapa: ${step.label}`);
      console.error(error && error.message ? error.message : error);
      console.error(`\nGate abortado (${i + 1}/${steps.length} etapas rodadas, ${i} verdes). Corrija "${step.label}" e rode de novo: npm run gate`);
      process.exitCode = 1;
      return;
    }
  }

  const elapsedSeconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  console.log(`\n=== GATE VERDE: ${steps.length}/${steps.length} checks passaram (${elapsedSeconds}s) ===`);
}

try {
  main();
} catch (error) {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
}
