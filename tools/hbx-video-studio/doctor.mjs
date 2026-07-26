import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

import { BASE_URL, OPENING_SOURCE, ROOT_DIR, parseArgs } from './config.mjs';
import { exists } from './lib/fs-utils.mjs';
import { commandExists } from './lib/process-utils.mjs';

const args = parseArgs();
const checks = [];

function add(name, ok, detail, required = true) {
  checks.push({ name, ok, detail, required });
}

function parseNodeMajor() {
  return Number(process.versions.node.split('.')[0] || 0);
}

async function checkFrontend() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(BASE_URL, { signal: controller.signal, redirect: 'manual' });
    add('Frontend HBX', response.status < 500, `${BASE_URL} respondeu HTTP ${response.status}`);
  } catch (error) {
    add('Frontend HBX', false, `${BASE_URL} não respondeu: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  add('Node.js', parseNodeMajor() >= 20, `v${process.versions.node} (mínimo: 20)`);

  for (const relative of ['package.json', 'frontend/package.json', 'playwright.config.ts']) {
    const file = path.join(ROOT_DIR, relative);
    add(relative, await exists(file), file);
  }
  add('Abertura Android real', await exists(OPENING_SOURCE), OPENING_SOURCE);

  const opening = await fs.readFile(OPENING_SOURCE, 'utf8').catch(() => '');
  const hasOpeningCore = opening.includes('HBX Logística — Abertura') && opening.includes('class="hub-wrap"');
  const hasOpeningHandoff = opening.includes('class="pairing"') || opening.includes('class="handoff"');
  add(
    'Contrato da abertura',
    hasOpeningCore && hasOpeningHandoff,
    'opening.html contém núcleo, animação e superfície de transição',
  );

  add('FFmpeg', commandExists('ffmpeg', ['-version']), 'necessário para MP4, transições, poster e áudio');

  const browserPath = chromium.executablePath();
  add('Chromium do Playwright', await exists(browserPath), browserPath || 'não instalado');

  const adbOk = commandExists('adb', ['version']);
  add('ADB', adbOk, adbOk ? 'disponível para tomadas Android opcionais' : 'ausente; só afeta cenas nativas opcionais', args.requireAdb === true);

  if (args.skipFrontend !== true) await checkFrontend();
  else add('Frontend HBX', true, 'checagem pulada por --skip-frontend', false);

  const width = Math.max(...checks.map((item) => item.name.length));
  console.log('\nHBX Video Studio — diagnóstico\n');
  for (const item of checks) {
    const marker = item.ok ? 'OK' : item.required ? 'ERRO' : 'AVISO';
    console.log(`${marker.padEnd(5)} ${item.name.padEnd(width)}  ${item.detail}`);
  }

  const failures = checks.filter((item) => item.required && !item.ok);
  if (failures.length > 0) {
    console.error(`\n${failures.length} requisito(s) obrigatório(s) não atendido(s).`);
    if (!checks.find((item) => item.name === 'Chromium do Playwright')?.ok) {
      console.error('Instale o navegador com: npx playwright install chromium');
    }
    process.exitCode = 1;
    return;
  }
  console.log('\nAmbiente pronto para captura.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
