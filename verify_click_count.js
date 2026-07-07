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
  await page.waitForTimeout(2000);

  await page.getByText('Mais', { exact: true }).first().click();
  await page.waitForTimeout(800);

  await page.evaluate(() => {
    window.__clickLog = [];
    document.querySelector('.casca-sheet__close').addEventListener('click', (e) => {
      window.__clickLog.push({ t: performance.now(), phase: e.eventPhase });
    }, true);
    document.querySelector('.casca-sheet-veil').addEventListener('click', (e) => {
      window.__clickLog.push({ t: performance.now(), where: 'veil', target: e.target.className });
    }, true);
    window.__clickStart = performance.now();
  });

  await page.locator('.casca-sheet__close').first().click();
  await page.waitForTimeout(1500);

  const clickLog = await page.evaluate(() => window.__clickLog.map(e => ({ ...e, t: Math.round(e.t - window.__clickStart) })));
  console.log('click log:', JSON.stringify(clickLog, null, 2));

  await browser.close();
})();
