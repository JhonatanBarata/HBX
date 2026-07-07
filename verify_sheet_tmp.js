const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
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
  console.log('URL:', page.url());

  await page.screenshot({ path: 'step1-vendas.png' });

  // procurar botao "Mais" no bottom nav
  const maisBtn = page.getByText('Mais', { exact: true });
  const maisCount = await maisBtn.count();
  console.log('botao "Mais" encontrado:', maisCount);

  if (maisCount > 0) {
    await maisBtn.first().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'step2-sheet-open.png' });

    const sheetVisible = await page.locator('.casca-sheet').count();
    const veilVisible = await page.locator('.casca-sheet-veil').count();
    console.log('casca-sheet count:', sheetVisible, 'veil count:', veilVisible);

    // clicar no X
    const closeBtn = page.locator('.casca-sheet__close');
    const closeBtnCount = await closeBtn.count();
    console.log('close btn count:', closeBtnCount);
    if (closeBtnCount > 0) {
      await closeBtn.first().click();
      await page.waitForTimeout(800);
      const afterCloseCount = await page.locator('.casca-sheet').count();
      console.log('APOS clicar X, casca-sheet count:', afterCloseCount, '(esperado 0 = fechou)');
      await page.screenshot({ path: 'step3-after-x-click.png' });
    }

    // reabrir e testar clique no veil
    await maisBtn.first().click();
    await page.waitForTimeout(500);
    const veil = page.locator('.casca-sheet-veil');
    const veilBox = await veil.boundingBox();
    console.log('veil box:', veilBox);
    if (veilBox) {
      // clicar no topo do veil (fora da folha, que fica embaixo)
      await page.mouse.click(veilBox.x + veilBox.width / 2, veilBox.y + 10);
      await page.waitForTimeout(800);
      const afterVeilCount = await page.locator('.casca-sheet').count();
      console.log('APOS clicar veil, casca-sheet count:', afterVeilCount, '(esperado 0 = fechou)');
      await page.screenshot({ path: 'step4-after-veil-click.png' });
    }
  }

  console.log('--- console logs ---');
  console.log(logs.join('\n'));
  await browser.close();
})();
