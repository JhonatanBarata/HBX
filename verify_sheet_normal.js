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

  const closeBtn = page.locator('.casca-sheet__close');
  await closeBtn.first().click();
  // checar IMEDIATAMENTE (deve ainda estar leaving, nao sumido de forma abrupta)
  await page.waitForTimeout(50);
  const immediately = await page.locator('.casca-sheet').count();
  console.log('sheet count 50ms apos clicar X (deve ser 1, ainda animando saida):', immediately);
  await page.waitForTimeout(600);
  const afterAnim = await page.locator('.casca-sheet').count();
  console.log('sheet count 650ms apos clicar X (deve ser 0):', afterAnim);

  // reabrir, testar veil
  await maisBtn.first().click();
  await page.waitForTimeout(400);
  const veil = page.locator('.casca-sheet-veil');
  const veilBox = await veil.boundingBox();
  await page.mouse.click(veilBox.x + veilBox.width/2, veilBox.y + 10);
  await page.waitForTimeout(600);
  console.log('sheet count apos clicar veil (normal motion):', await page.locator('.casca-sheet').count());

  console.log('--- console logs ---');
  console.log(logs.join('\n'));
  await browser.close();
})();
