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
  await page.waitForTimeout(1500);

  // clicar no botao X e, MUITO rapido depois, checar a classe (antes do proximo paint)
  await page.locator('.casca-sheet__close').first().click();

  // poll a cada 20ms por 1s pra ver a transicao de classes ao vivo
  for (let i = 0; i < 30; i++) {
    const cls = await page.evaluate(() => {
      const v = document.querySelector('.casca-sheet-veil');
      return v ? v.className : 'GONE';
    });
    console.log(`t=${i*20}ms veil class:`, cls);
    if (cls === 'GONE') break;
    await page.waitForTimeout(20);
  }

  await browser.close();
})();
