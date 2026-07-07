const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  page.on('console', (msg) => console.log(`[console:${msg.type()}]`, msg.text()));
  page.on('pageerror', (err) => console.log('[pageerror]', err.message));

  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle', timeout: 20000 });
  await page.fill('#em', 'jhonatan@hbxsystem.com.br');
  await page.fill('#pw', 'monkey123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/vendas', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(3000); // dar tempo extra pro fast refresh recompilar

  console.log('=== ABRINDO A FOLHA ===');
  const maisBtn = page.getByText('Mais', { exact: true });
  await maisBtn.first().click();
  await page.waitForTimeout(1500);

  console.log('=== CLICANDO NO X ===');
  await page.locator('.casca-sheet__close').first().click();
  await page.waitForTimeout(800);

  const cls = await page.evaluate(() => document.querySelector('.casca-sheet-veil')?.className || 'GONE');
  console.log('class final:', cls);

  await browser.close();
})();
