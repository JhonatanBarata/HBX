const { chromium } = require('playwright');

(async () => {
  // browser totalmente novo, sem qualquer contexto compartilhado
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'no-preference',
    bypassCSP: true,
  });
  await context.clearCookies();
  const page = await context.newPage();

  // Cache-Control bypass total
  await page.route('**/*', route => route.continue());

  await page.goto('http://localhost:3001/login?fresh=' + Date.now(), { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('#em', 'jhonatan@hbxsystem.com.br');
  await page.fill('#pw', 'monkey123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/vendas', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(3000);

  await page.getByText('Mais', { exact: true }).first().click();
  await page.waitForFunction(() => document.querySelector('.casca-sheet') !== null);
  await page.waitForTimeout(500);

  const t0 = Date.now();
  await page.locator('.casca-sheet__close').first().click();

  try {
    await page.waitForFunction(() => document.querySelector('.casca-sheet') === null, { timeout: 4000 });
    console.log('RESULTADO: FECHOU em', Date.now() - t0, 'ms');
  } catch {
    console.log('RESULTADO: NAO FECHOU (travou)');
  }

  await browser.close();
})();
