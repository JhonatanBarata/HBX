const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();

  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle', timeout: 20000 });
  await page.fill('#em', 'jhonatan@hbxsystem.com.br');
  await page.fill('#pw', 'monkey123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/vendas', { timeout: 10000 }).catch(() => {});
  await page.reload({ waitUntil: 'networkidle' });
  console.log('esperando 20s...');
  await page.waitForTimeout(20000);

  await page.getByText('Mais', { exact: true }).first().click();
  await page.waitForFunction(() => document.querySelector('.casca-sheet') !== null);
  console.log('sheet aberta, esperando animacao de entrada quietar (1s)...');
  await page.waitForTimeout(1000);

  console.log('clicando no X...');
  const t0 = Date.now();
  await page.locator('.casca-sheet__close').first().click();

  try {
    await page.waitForFunction(() => document.querySelector('.casca-sheet') === null, { timeout: 5000 });
    console.log('FECHOU em', Date.now() - t0, 'ms - SUCESSO');
  } catch (e) {
    console.log('NAO FECHOU em 5000ms - BUG CONFIRMADO');
    const cls = await page.evaluate(() => document.querySelector('.casca-sheet')?.className);
    console.log('classe travada:', cls);
  }

  await browser.close();
})();
