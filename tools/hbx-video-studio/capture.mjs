import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { chromium } from '@playwright/test';

import {
  BASE_URL,
  CAPTURE_VIEWPORT,
  FIXED_NOW,
  WORK_DIR,
  parseArgs,
  parseTarget,
} from './config.mjs';
import { VIDEO_TARGETS } from './content.mjs';
import { createDemoState, firstOpenCoordinates } from './lib/demo-data.mjs';
import { ensureDir, resetDir, writeJson } from './lib/fs-utils.mjs';
import { installDemoApi } from './lib/mock-api.mjs';
import { sleep } from './lib/process-utils.mjs';
import { startStudioServer } from './lib/studio-server.mjs';

const ONBOARDING_KEY = 'hbx:entrega:onboarded:v1';

function fakeToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 86_400 })).toString('base64url');
  return `video.${payload}.sig`;
}

async function assertFrontendAvailable(baseUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(baseUrl, { signal: controller.signal, redirect: 'manual' });
    if (response.status >= 500) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(
      `O frontend do HBX não respondeu em ${baseUrl}. Inicie-o com "npm run front:dev" ` +
      `ou informe HBX_VIDEO_BASE_URL. Detalhe: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function addCaptureInitScript(context) {
  await context.addInitScript(
    ({ token, onboardKey, fixedNow }) => {
      try {
        localStorage.setItem('token', token);
        localStorage.setItem(onboardKey, '1');
        localStorage.setItem('hbx:entrega:empresa-nome', 'Distribuidora Água Clara');
        localStorage.setItem('hbx:entrega:queue-owner', '700:77');
      } catch {
        // O script também roda em documentos sem origin; o próximo documento tenta de novo.
      }

      const fixed = new globalThis.Date(fixedNow).valueOf();
      const NativeDate = globalThis.Date;
      class VideoDate extends NativeDate {
        constructor(...args) {
          super(...(args.length === 0 ? [fixed] : args));
        }
        static now() {
          return fixed;
        }
      }
      globalThis.Date = VideoDate;

      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: { request: async () => ({ released: false, release: async () => undefined, addEventListener: () => undefined }) },
      });
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async () => undefined },
      });
      globalThis.open = () => ({ opener: null, close: () => undefined });
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.requestFullscreen = async () => undefined;
        document.exitFullscreen = async () => undefined;
      });
    },
    { token: fakeToken(), onboardKey: ONBOARDING_KEY, fixedNow: FIXED_NOW },
  );
}

async function installCaption(page, caption) {
  if (!caption) return;
  const position = caption.position === 'bottom' ? 'bottom' : 'top';
  await page.addStyleTag({
    content: `
      .hbx-video-caption {
        position:fixed; z-index:2147483646; left:18px; right:18px;
        ${position === 'bottom' ? 'bottom:92px;' : 'top:72px;'}
        pointer-events:none; padding:13px 15px 14px; border-radius:18px;
        color:#f8fbff; background:rgba(4,8,19,.78); border:1px solid rgba(139,226,255,.22);
        box-shadow:0 18px 54px rgba(0,0,0,.34); backdrop-filter:blur(18px) saturate(1.15);
        transform:translateY(${position === 'bottom' ? '16px' : '-16px'}); opacity:0;
        animation:hbxVideoCaptionIn .55s cubic-bezier(.22,1,.36,1) forwards,
                  hbxVideoCaptionOut .45s 3.25s ease forwards;
      }
      .hbx-video-caption__eyebrow { color:#9aea35; font-size:9px; font-weight:900; letter-spacing:.2em; }
      .hbx-video-caption__title { margin-top:7px; font-size:16px; line-height:1.23; font-weight:820; letter-spacing:-.025em; text-wrap:balance; }
      @keyframes hbxVideoCaptionIn { to { opacity:1; transform:none; } }
      @keyframes hbxVideoCaptionOut { to { opacity:0; transform:translateY(${position === 'bottom' ? '9px' : '-9px'}); } }
      .hbx-video-tap {
        position:fixed; z-index:2147483647; width:54px; height:54px; margin:-27px 0 0 -27px;
        border-radius:50%; border:2px solid rgba(255,255,255,.92); pointer-events:none;
        box-shadow:0 0 0 0 rgba(0,229,255,.5),0 0 28px rgba(0,229,255,.42);
        animation:hbxVideoTap .62s ease-out forwards;
      }
      @keyframes hbxVideoTap { 0%{opacity:0;transform:scale(.45)} 22%{opacity:1} 100%{opacity:0;transform:scale(1.55);box-shadow:0 0 0 18px rgba(0,229,255,0)} }
    `,
  });
  await page.evaluate(({ eyebrow, title }) => {
    document.querySelector('.hbx-video-caption')?.remove();
    const root = document.createElement('div');
    root.className = 'hbx-video-caption';
    root.innerHTML = `<div class="hbx-video-caption__eyebrow"></div><div class="hbx-video-caption__title"></div>`;
    root.querySelector('.hbx-video-caption__eyebrow').textContent = eyebrow || '';
    root.querySelector('.hbx-video-caption__title').textContent = title || '';
    document.body.appendChild(root);
  }, caption);
}

async function visualTap(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (box) {
    await page.evaluate(({ x, y }) => {
      const ring = document.createElement('div');
      ring.className = 'hbx-video-tap';
      ring.style.left = `${x}px`;
      ring.style.top = `${y}px`;
      document.body.appendChild(ring);
      setTimeout(() => ring.remove(), 800);
    }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  }
  await sleep(180);
  await locator.click();
  await sleep(320);
}

async function waitForApp(page, route) {
  await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForLoadState('domcontentloaded');
  await page.locator('body').waitFor({ state: 'visible' });
  if (route.startsWith('/entrega')) {
    await page.locator('nav.casca-tabbar').waitFor({ state: 'visible', timeout: 15_000 });
  }
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await sleep(1_100);
}

async function cancelAutoNavigation(page) {
  const cancel = page.getByRole('button', { name: 'Cancelar', exact: true });
  if (await cancel.isVisible().catch(() => false)) {
    await cancel.click();
    await sleep(450);
  }
}

async function prepareRouteReady(page) {
  const arrived = page.getByRole('button', { name: 'Cheguei', exact: true });
  if (await arrived.isVisible().catch(() => false)) return;
  const start = page.getByRole('button', { name: /^Iniciar rota$/ });
  await start.waitFor({ state: 'visible', timeout: 12_000 });
  await start.click();
  await arrived.waitFor({ state: 'visible', timeout: 18_000 });
  await sleep(650);
  await cancelAutoNavigation(page);
  await sleep(650);
}

async function prepareScene(page, scene) {
  if (scene.prepare === 'route-ready') await prepareRouteReady(page);
}

async function runSceneAction(page, scene) {
  switch (scene.action) {
    case undefined:
    case null:
      return;
    case 'client-search-open': {
      const search = page.getByPlaceholder('Buscar cliente');
      await search.waitFor({ state: 'visible' });
      await sleep(650);
      await search.fill('Padaria');
      await sleep(1_150);
      await search.fill('');
      await sleep(800);
      const card = page.locator('button.ent-card').filter({ hasText: 'Padaria Primavera' }).first();
      await visualTap(page, card);
      await page.getByText('Editar cliente', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
      await sleep(1_650);
      return;
    }
    case 'product-open': {
      await sleep(800);
      const card = page.locator('button.ent-card').filter({ hasText: 'Galão 20L' }).first();
      await visualTap(page, card);
      await page.getByText('Editar produto', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
      await sleep(1_800);
      return;
    }
    case 'generate-preview': {
      const button = page.getByRole('button', { name: 'Gerar entregas de hoje', exact: true });
      await visualTap(page, button);
      await page.getByText('Gerar entregas', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
      await page.getByText('Padaria Primavera', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
      await sleep(3_300);
      return;
    }
    case 'start-route': {
      const button = page.getByRole('button', { name: /^Iniciar rota$/ });
      await visualTap(page, button);
      await page.getByRole('button', { name: 'Cheguei', exact: true }).waitFor({ state: 'visible', timeout: 18_000 });
      await sleep(1_100);
      await cancelAutoNavigation(page);
      await sleep(2_600);
      return;
    }
    case 'arrival-adjust': {
      const arrived = page.getByRole('button', { name: 'Cheguei', exact: true });
      await visualTap(page, arrived);
      await page.getByText('Padaria Primavera', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
      await sleep(900);
      const plus = page.getByRole('button', { name: 'Mais um Galão 20L' });
      await visualTap(page, plus);
      await sleep(2_400);
      return;
    }
    case 'arrival-confirm': {
      const arrived = page.getByRole('button', { name: 'Cheguei', exact: true });
      await visualTap(page, arrived);
      await page.getByText('Padaria Primavera', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
      await sleep(700);
      const pix = page.getByRole('button', { name: 'Pix', exact: true });
      if (await pix.isVisible().catch(() => false)) await visualTap(page, pix);
      await sleep(650);
      const qr = page.getByRole('button', { name: /^QR Pix/ });
      if (await qr.isVisible().catch(() => false)) {
        await visualTap(page, qr);
        await sleep(1_250);
      }
      const delivered = page.getByRole('button', { name: 'Entregue', exact: true });
      await visualTap(page, delivered);
      await page.locator('.ent-sucesso').waitFor({ state: 'visible', timeout: 12_000 });
      await sleep(1_650);
      await cancelAutoNavigation(page);
      return;
    }
    default:
      throw new Error(`Ação de cena não implementada: ${scene.action}`);
  }
}

function cardUrl(origin, card) {
  const url = new URL('/card', origin);
  for (const [key, value] of Object.entries(card || {})) {
    if (value != null && value !== '') url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function openingUrl(origin) {
  const url = new URL('/opening', origin);
  url.searchParams.set('title', 'HBX ENTREGAS');
  url.searchParams.set('subtitle', 'Rotas, clientes e recebimentos na mesma operação.');
  return url.toString();
}

async function captureScene({ browser, studioOrigin, target, scene, index, rawDir, errorDir }) {
  const state = createDemoState({ scenario: scene.scenario || 'standard' });
  const geo = firstOpenCoordinates(state);
  const context = await browser.newContext({
    viewport: CAPTURE_VIEWPORT,
    screen: CAPTURE_VIEWPORT,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
    geolocation: geo,
    recordVideo: { dir: rawDir, size: CAPTURE_VIEWPORT },
  });
  await addCaptureInitScript(context);
  await context.grantPermissions(['geolocation'], { origin: BASE_URL });

  const page = await context.newPage();
  const video = page.video();
  const videoStartedAt = performance.now();
  const consoleLines = [];
  page.on('console', (message) => consoleLines.push(`[${message.type()}] ${message.text()}`));
  page.on('pageerror', (error) => consoleLines.push(`[pageerror] ${error.message}`));

  let sceneStartedAt = 0;
  try {
    if (scene.source === 'app') {
      await installDemoApi(page, state);
      await waitForApp(page, scene.route);
    } else if (scene.source === 'opening') {
      await page.goto(openingUrl(studioOrigin), { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.documentElement.dataset.hbxVideoReady === '1');
    } else if (scene.source === 'card') {
      await page.goto(cardUrl(studioOrigin, scene.card), { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.documentElement.dataset.hbxVideoReady === '1');
    } else {
      throw new Error(`Fonte de cena desconhecida: ${scene.source}`);
    }

    await prepareScene(page, scene);
    await installCaption(page, scene.caption);
    await sleep(240);
    sceneStartedAt = performance.now();
    await runSceneAction(page, scene);
    const elapsed = (performance.now() - sceneStartedAt) / 1000;
    if (elapsed < scene.duration) await sleep((scene.duration - elapsed) * 1000);
  } catch (error) {
    await ensureDir(errorDir);
    await page.screenshot({ path: path.join(errorDir, `${String(index + 1).padStart(2, '0')}-${scene.id}.png`), fullPage: true }).catch(() => undefined);
    await fs.writeFile(
      path.join(errorDir, `${String(index + 1).padStart(2, '0')}-${scene.id}.log`),
      `${consoleLines.join('\n')}\n\n${error instanceof Error ? error.stack || error.message : String(error)}\n`,
      'utf8',
    );
    throw error;
  } finally {
    await context.close();
  }

  if (!video) throw new Error(`O Playwright não produziu vídeo para a cena ${scene.id}.`);
  const sourcePath = await video.path();
  const filename = `${String(index + 1).padStart(2, '0')}-${scene.id}.webm`;
  const finalPath = path.join(rawDir, filename);
  if (path.resolve(sourcePath) !== path.resolve(finalPath)) await fs.rename(sourcePath, finalPath);

  return {
    id: scene.id,
    source: scene.source,
    file: finalPath,
    trimStart: Math.max(0, (sceneStartedAt - videoStartedAt) / 1000),
    duration: scene.duration,
    caption: scene.caption || null,
    narration: scene.narration || '',
  };
}

async function captureTarget({ browser, studioOrigin, target }) {
  const targetConfig = VIDEO_TARGETS[target];
  if (!targetConfig) throw new Error(`Configuração ausente para ${target}.`);
  const targetDir = path.join(WORK_DIR, target);
  const rawDir = await resetDir(path.join(targetDir, 'raw'));
  const errorDir = await resetDir(path.join(targetDir, 'errors'));
  const clips = [];

  console.log(`\n[video] ${targetConfig.title}`);
  for (let index = 0; index < targetConfig.scenes.length; index += 1) {
    const scene = targetConfig.scenes[index];
    process.stdout.write(`[video] capturando ${index + 1}/${targetConfig.scenes.length}: ${scene.id}... `);
    const clip = await captureScene({ browser, studioOrigin, target, scene, index, rawDir, errorDir });
    clips.push(clip);
    console.log('ok');
  }

  const manifest = {
    version: 1,
    target,
    title: targetConfig.title,
    capturedAt: new Date().toISOString(),
    viewport: CAPTURE_VIEWPORT,
    clips,
  };
  const manifestPath = path.join(targetDir, 'manifest.json');
  await writeJson(manifestPath, manifest);
  return manifestPath;
}

async function main() {
  const args = parseArgs();
  const targets = parseTarget(args.target || 'all');
  if (targets.some((target) => VIDEO_TARGETS[target].scenes.some((scene) => scene.source === 'app'))) {
    await assertFrontendAvailable(BASE_URL);
  }
  await ensureDir(WORK_DIR);
  const studio = await startStudioServer();
  const browser = await chromium.launch({
    headless: args.headed !== true,
    args: ['--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
  });

  try {
    const manifests = [];
    for (const target of targets) manifests.push(await captureTarget({ browser, studioOrigin: studio.origin, target }));
    console.log('\n[video] Captura concluída:');
    for (const manifest of manifests) console.log(`  - ${manifest}`);
  } finally {
    await browser.close();
    await studio.close();
  }
}

main().catch((error) => {
  console.error(`\n[video] Falha: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exitCode = 1;
});
