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

  const closeBtnCount = await page.locator('.casca-sheet__close').count();
  console.log('close btn count:', closeBtnCount);
  const box = await page.locator('.casca-sheet__close').first().boundingBox();
  console.log('close btn box:', box);

  // clicar via coordenadas reais, e loggar se o click chegou
  await page.evaluate(() => {
    const btn = document.querySelector('.casca-sheet__close');
    btn.addEventListener('click', () => console.log('NATIVE CLICK LISTENER FIRED ON CLOSE BTN'));
  });

  await page.locator('.casca-sheet__close').first().click({ force: true });
  await page.waitForTimeout(300);
  console.log('sheet class apos click force:', await page.locator('.casca-sheet').first().getAttribute('class').catch(()=>'GONE'));
  await page.waitForTimeout(1000);
  console.log('sheet class apos +1s:', await page.locator('.casca-sheet').count() > 0 ? await page.locator('.casca-sheet').first().getAttribute('class') : 'GONE (count 0)');

  await browser.close();
})();
