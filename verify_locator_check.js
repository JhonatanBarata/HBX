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

  const maisMatches = await page.getByText('Mais', { exact: true }).count();
  console.log('quantos elementos com texto exato "Mais":', maisMatches);
  for (let i = 0; i < maisMatches; i++) {
    const el = page.getByText('Mais', { exact: true }).nth(i);
    console.log(i, await el.evaluate(e => e.outerHTML.slice(0, 200)));
  }

  await browser.close();
})();
