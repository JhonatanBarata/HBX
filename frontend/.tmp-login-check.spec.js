const { test } = require("@playwright/test");

for (const viewport of [
  { width: 360, height: 800, name: "360x800" },
  { width: 390, height: 844, name: "390x844" },
  { width: 414, height: 896, name: "414x896" },
]) {
  test(`login mobile ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("http://localhost:3001/login", { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    const metrics = await page.evaluate(() => {
      const read = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return {
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          transform: style.transform,
          zIndex: style.zIndex,
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
        };
      };

      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        scroll: {
          html: document.documentElement.scrollWidth,
          body: document.body.scrollWidth,
          hasHorizontalOverflow:
            document.documentElement.scrollWidth > window.innerWidth ||
            document.body.scrollWidth > window.innerWidth,
        },
        stage: read(".login-stage"),
        console: read(".login-console"),
        shell: read(".login-shell"),
        card: read(".login-card"),
        help: read('.whatsapp-help[data-surface="login"]'),
      };
    });
    console.log(viewport.name, JSON.stringify(metrics));
  });
}
