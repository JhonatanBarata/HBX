const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  page.on('console', (msg) => console.log(`[console:${msg.type()}]`, msg.text()));

  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle', timeout: 20000 });
  await page.fill('#em', 'jhonatan@hbxsystem.com.br');
  await page.fill('#pw', 'monkey123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/vendas', { timeout: 10000 }).catch(() => {});
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  await page.getByText('Mais', { exact: true }).first().click();
  await page.waitForTimeout(1000);

  console.log('=== clicando no X (observando TODOS os console logs, incl erros do React) ===');
  await page.locator('.casca-sheet__close').first().click();
  await page.waitForTimeout(2000);

  // checar se o Error Popup apareceu
  const errorPopup = await page.locator('text=/erro|error/i').count();
  console.log('elementos com texto erro/error visiveis:', errorPopup);

  await browser.close();
})();
