const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  page.on('request', r => console.log('>>', r.method(), r.url()));
  page.on('response', r => console.log('<<', r.status(), r.url()));

  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle', timeout: 20000 });
  await page.fill('#em', 'jhonatan@hbxsystem.com.br');
  await page.fill('#pw', 'monkey123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/vendas', { timeout: 10000 }).catch(() => {});
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  console.log('=== abrindo ===');
  await page.getByText('Mais', { exact: true }).first().click();
  await page.waitForTimeout(800);

  console.log('=== clicando no X ===');
  await page.locator('.casca-sheet__close').first().click();
  await page.waitForTimeout(1500);

  console.log('=== fim ===');
  await browser.close();
})();
