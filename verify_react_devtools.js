const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log('[pageerror]', err.message));

  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle', timeout: 20000 });
  await page.fill('#em', 'jhonatan@hbxsystem.com.br');
  await page.fill('#pw', 'monkey123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/vendas', { timeout: 10000 }).catch(() => {});
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const maisBtn = page.getByText('Mais', { exact: true });
  await maisBtn.first().click();
  await page.waitForTimeout(600);

  // Verificar: existe MAIS de um elemento .casca-sheet-veil no DOM (talvez a
  // "Mais" e o "Sair" ambos renderizando, um por cima do outro)?
  const veilCount = await page.locator('.casca-sheet-veil').count();
  const sheetCount = await page.locator('.casca-sheet').count();
  console.log('veils no DOM:', veilCount, 'sheets no DOM:', sheetCount);

  // pegar o texto de titulo de cada sheet
  const titles = await page.locator('.casca-sheet__title').allTextContents();
  console.log('titulos das sheets abertas:', titles);

  // clicar no X e reavaliar apos 1s
  await page.locator('.casca-sheet__close').first().click();
  await page.waitForTimeout(1000);

  const veilCount2 = await page.locator('.casca-sheet-veil').count();
  const sheetCount2 = await page.locator('.casca-sheet').count();
  const titles2 = await page.locator('.casca-sheet__title').allTextContents();
  console.log('APOS X: veils:', veilCount2, 'sheets:', sheetCount2, 'titulos:', titles2);

  await browser.close();
})();
