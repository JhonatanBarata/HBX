const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  page.on('console', (msg) => console.log(`[console:${msg.type()}]`, msg.text()));
  page.on('pageerror', (err) => console.log('[PAGEERROR]', err.message, err.stack));

  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle', timeout: 20000 });
  await page.fill('#em', 'jhonatan@hbxsystem.com.br');
  await page.fill('#pw', 'monkey123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/vendas', { timeout: 10000 }).catch(() => {});
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  await page.getByText('Mais', { exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'dbg-1-open.png' });

  console.log('--- clicando no X agora ---');
  await page.locator('.casca-sheet__close').first().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'dbg-2-after-close-click.png' });

  // pegar o innerHTML resumido do que esta la
  const html = await page.locator('.casca-sheet-veil').innerHTML().catch(() => 'NO VEIL');
  console.log('HTML do veil apos 1.2s (primeiros 500 chars):', html.slice(0, 500));

  await browser.close();
})();
