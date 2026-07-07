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
    window.__log = [];
    const veil = document.querySelector('.casca-sheet-veil');
    const sheet = document.querySelector('.casca-sheet');
    window.__t0 = performance.now();
    const rec = (label) => (e) => window.__log.push({ t: Math.round(performance.now() - window.__t0), label, anim: e.animationName, target: e.target === e.currentTarget ? 'self' : 'child' });
    veil.addEventListener('animationstart', rec('veil:start'));
    veil.addEventListener('animationend', rec('veil:end'));
    veil.addEventListener('animationcancel', rec('veil:cancel'));
    sheet.addEventListener('animationstart', rec('sheet:start'));
    sheet.addEventListener('animationend', rec('sheet:end'));
    sheet.addEventListener('animationcancel', rec('sheet:cancel'));

    const btn = document.querySelector('.casca-sheet__close');
    btn.addEventListener('click', () => window.__log.push({ t: Math.round(performance.now() - window.__t0), label: 'BUTTON CLICKED' }));
  });

  await page.locator('.casca-sheet__close').first().click();
  await page.waitForTimeout(1000);

  const log = await page.evaluate(() => window.__log);
  console.log(JSON.stringify(log, null, 2));

  const finalClass = await page.evaluate(() => document.querySelector('.casca-sheet')?.className || 'GONE');
  console.log('classe final apos 1s:', finalClass);

  await browser.close();
})();
