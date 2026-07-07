const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  const logs = [];
  page.on('console', (msg) => { logs.push(msg.text()); });

  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle', timeout: 20000 });
  await page.fill('#em', 'jhonatan@hbxsystem.com.br');
  await page.fill('#pw', 'monkey123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/vendas', { timeout: 10000 }).catch(() => {});
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  logs.length = 0;
  await page.getByText('Mais', { exact: true }).first().click();
  await page.waitForTimeout(800);
  logs.length = 0;

  await page.locator('.casca-sheet__close').first().click();
  await page.waitForTimeout(1500);
  console.log(logs.filter(l => l.includes('DEBUG-TABBAR') || (l.includes('DEBUG-GATE') )).join('\n'));

  await browser.close();
})();
