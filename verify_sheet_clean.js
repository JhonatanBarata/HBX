const { chromium } = require('playwright');

async function run(reducedMotion, label) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle', timeout: 20000 });
  await page.fill('#em', 'jhonatan@hbxsystem.com.br');
  await page.fill('#pw', 'monkey123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/vendas', { timeout: 10000 }).catch(() => {});
  // hard reload pra garantir bundle fresco, sem HMR residual
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  console.log(`\n=== [${label}] TESTE 1: abrir + fechar via X ===`);
  const maisBtn = page.getByText('Mais', { exact: true });
  await maisBtn.first().click();
  await page.waitForTimeout(600);
  console.log('sheet aberta?', await page.locator('.casca-sheet').count() === 1);
  await page.locator('.casca-sheet__close').first().click();
  await page.waitForTimeout(800);
  const afterX = await page.locator('.casca-sheet').count();
  console.log(`[${label}] apos X + 800ms, sheet count:`, afterX, afterX === 0 ? 'FECHOU OK' : 'AINDA ABERTA - BUG');

  console.log(`\n=== [${label}] TESTE 2: abrir + fechar via veil ===`);
  await maisBtn.first().click();
  await page.waitForTimeout(600);
  const veilBox = await page.locator('.casca-sheet-veil').boundingBox();
  await page.mouse.click(veilBox.x + veilBox.width/2, veilBox.y + 10);
  await page.waitForTimeout(800);
  const afterVeil = await page.locator('.casca-sheet').count();
  console.log(`[${label}] apos veil + 800ms, sheet count:`, afterVeil, afterVeil === 0 ? 'FECHOU OK' : 'AINDA ABERTA - BUG');

  console.log(`[${label}] erros de pagina:`, errors.length ? errors : 'nenhum');

  await browser.close();
}

(async () => {
  await run('no-preference', 'ANIMACAO NORMAL');
  await run('reduce', 'REDUCED MOTION');
})();
