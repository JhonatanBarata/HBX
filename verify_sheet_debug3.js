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
  // esperar BEM mais que a duracao da animacao de entrada (220ms) antes de clicar
  await page.waitForTimeout(1500);

  await page.evaluate(() => {
    window.__animEvents = [];
    document.addEventListener('animationend', (e) => {
      window.__animEvents.push({ target: e.target.className, animationName: e.animationName, time: performance.now() });
    }, true);
  });

  console.log('clicando no X agora...');
  await page.locator('.casca-sheet__close').first().click();
  await page.waitForTimeout(100);
  console.log('veil class 100ms apos clique:', await page.locator('.casca-sheet-veil').first().getAttribute('class').catch(()=>'GONE'));
  await page.waitForTimeout(500);
  console.log('veil class 600ms apos clique:', await page.locator('.casca-sheet-veil').count() > 0 ? await page.locator('.casca-sheet-veil').first().getAttribute('class') : 'GONE (count 0)');

  const animEvents = await page.evaluate(() => window.__animEvents);
  console.log('animationend events fired apos o clique:', JSON.stringify(animEvents, null, 2));

  await browser.close();
})();
