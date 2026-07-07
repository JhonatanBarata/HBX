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
  await page.waitForTimeout(2000);

  const maisBtn = page.getByText('Mais', { exact: true });
  await maisBtn.first().click();
  await page.waitForTimeout(400);

  // instrumentar animationend a nivel nativo antes do clique
  await page.evaluate(() => {
    window.__animEvents = [];
    document.addEventListener('animationend', (e) => {
      window.__animEvents.push({ target: e.target.className, animationName: e.animationName });
    }, true);
  });

  await page.locator('.casca-sheet__close').first().click();
  await page.waitForTimeout(600);

  const animEvents = await page.evaluate(() => window.__animEvents);
  console.log('animationend events fired:', JSON.stringify(animEvents, null, 2));

  const sheetEl = await page.locator('.casca-sheet-veil').first();
  const cls = await sheetEl.getAttribute('class').catch(() => 'GONE');
  console.log('veil class after 600ms:', cls);

  const computedAnim = await page.evaluate(() => {
    const veil = document.querySelector('.casca-sheet-veil');
    if (!veil) return 'NO VEIL';
    const cs = getComputedStyle(veil);
    return { animationName: cs.animationName, animationDuration: cs.animationDuration, className: veil.className };
  });
  console.log('computed style of veil:', computedAnim);

  await browser.close();
})();
