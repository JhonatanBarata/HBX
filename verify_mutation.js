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

  await page.evaluate(() => {
    window.__mutLog = [];
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'class') {
          const el = m.target;
          if (el.classList && (el.classList.contains('casca-sheet') || el.classList.contains('casca-sheet-veil'))) {
            window.__mutLog.push({ t: performance.now(), tag: el.className, type: 'classChange' });
          }
        }
        for (const node of m.removedNodes) {
          if (node.nodeType === 1 && (node.classList?.contains('casca-sheet-veil'))) {
            window.__mutLog.push({ t: performance.now(), type: 'REMOVED veil' });
          }
        }
        for (const node of m.addedNodes) {
          if (node.nodeType === 1 && (node.classList?.contains('casca-sheet-veil'))) {
            window.__mutLog.push({ t: performance.now(), type: 'ADDED veil' });
          }
        }
      }
    });
    obs.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    window.__mutStart = performance.now();
  });

  await page.getByText('Mais', { exact: true }).first().click();
  await page.waitForTimeout(800);
  await page.locator('.casca-sheet__close').first().click();
  await page.waitForTimeout(1500);

  const mutLog = await page.evaluate(() => window.__mutLog.map(e => ({ ...e, t: Math.round(e.t - window.__mutStart) })));
  console.log('mutation log:', JSON.stringify(mutLog, null, 2));

  await browser.close();
})();
