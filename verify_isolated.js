const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('[console]', msg.text()));

  await page.goto('file://' + path.resolve('test-isolated.html'));
  await page.waitForTimeout(500); // esperar entrada terminar

  await page.click('#closeBtn');
  await page.waitForTimeout(500);

  const cls = await page.evaluate(() => document.getElementById('sheet').className);
  console.log('classe final do sheet:', cls);

  await browser.close();
})();
