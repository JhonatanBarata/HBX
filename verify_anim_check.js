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

  const maisBtn = page.getByText('Mais', { exact: true });
  await maisBtn.first().click();
  await page.waitForTimeout(600);

  // checar prefers-reduced-motion real no browser
  const prm = await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  console.log('prefers-reduced-motion: reduce matches?', prm);

  await page.evaluate(() => {
    window.__events = [];
    const veil = document.querySelector('.casca-sheet-veil');
    veil.addEventListener('animationstart', (e) => window.__events.push('start:' + e.animationName));
    veil.addEventListener('animationend', (e) => window.__events.push('end:' + e.animationName));
    veil.addEventListener('animationcancel', (e) => window.__events.push('cancel:' + e.animationName));
  });

  await page.locator('.casca-sheet__close').first().click();
  await page.waitForTimeout(500);

  const events = await page.evaluate(() => window.__events);
  console.log('eventos no veil apos clicar X:', events);

  const cls = await page.evaluate(() => document.querySelector('.casca-sheet-veil')?.className);
  console.log('classe do veil:', cls);

  const computed = await page.evaluate(() => {
    const veil = document.querySelector('.casca-sheet-veil');
    const cs = getComputedStyle(veil);
    return { animationName: cs.animationName, animationDuration: cs.animationDuration, animationPlayState: cs.animationPlayState };
  });
  console.log('computed style:', computed);

  await browser.close();
})();
