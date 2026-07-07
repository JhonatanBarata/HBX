const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  const logs = [];
  page.on('console', (msg) => logs.push(`[console:${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle', timeout: 20000 });
  await page.fill('#em', 'jhonatan@hbxsystem.com.br');
  await page.fill('#pw', 'monkey123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/vendas', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const maisBtn = page.getByText('Mais', { exact: true });
  await maisBtn.first().click();
  await page.waitForTimeout(400);
  console.log('sheet count apos abrir:', await page.locator('.casca-sheet').count());
  console.log('sheet classes:', await page.locator('.casca-sheet').first().getAttribute('class'));

  const closeBtn = page.locator('.casca-sheet__close');
  await closeBtn.first().click();

  for (const t of [50, 200, 400, 700, 1000, 1500, 2000]) {
    await page.waitForTimeout(t === 50 ? 50 : t - [50,200,400,700,1000,1500,2000][[50,200,400,700,1000,1500,2000].indexOf(t)-1] || t);
  }
  await page.waitForTimeout(2000);
  const cnt = await page.locator('.casca-sheet').count();
  console.log('sheet count apos 2s+ total:', cnt);
  if (cnt > 0) {
    console.log('sheet classes (ainda la):', await page.locator('.casca-sheet').first().getAttribute('class'));
  }
  await page.screenshot({ path: 'stuck-sheet.png' });

  console.log('--- console logs ---');
  console.log(logs.join('\n'));
  await browser.close();
})();
