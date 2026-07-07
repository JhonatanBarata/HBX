const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, devtools: false });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  page.on('console', (msg) => console.log(`[console:${msg.type()}]`, msg.text()));
  page.on('pageerror', (err) => console.log('[pageerror]', err.message));
  page.on('requestfailed', (req) => console.log('[reqfailed]', req.url(), req.failure()?.errorText));

  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle', timeout: 20000 });
  await page.fill('#em', 'jhonatan@hbxsystem.com.br');
  await page.fill('#pw', 'monkey123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/vendas', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const maisBtn = page.getByText('Mais', { exact: true });
  await maisBtn.first().click();
  await page.waitForTimeout(1500);

  // clicar diretamente via dispatchEvent no elemento (bypass qualquer overlay)
  const clicked = await page.evaluate(() => {
    const btn = document.querySelector('.casca-sheet__close');
    if (!btn) return 'NO BUTTON';
    btn.click(); // click() sintetico do DOM, dispara onClick do React tambem
    return 'clicked via .click()';
  });
  console.log(clicked);

  await page.waitForTimeout(100);
  const cls1 = await page.evaluate(() => document.querySelector('.casca-sheet-veil')?.className || 'GONE');
  console.log('class 100ms apos .click() nativo:', cls1);

  await page.waitForTimeout(500);
  const cls2 = await page.evaluate(() => document.querySelector('.casca-sheet-veil')?.className || 'GONE');
  console.log('class 600ms apos .click() nativo:', cls2);

  await browser.close();
})();
