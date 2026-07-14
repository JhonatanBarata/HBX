import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const NATIVE_SCRIPT = path.resolve(
  process.cwd(),
  "EntregaShell/app/src/main/assets/app/native.js"
);

const APP_SELECTORS = {
  logistica:
    "[data-screen],[data-action],[data-delivery],[data-client],[data-mode]",
  vendas:
    "[data-screen],[data-action],[data-block],[data-lead],[data-wa]",
} as const;

async function mountModalHarness(page: Page, targetSelector: string) {
  await page.setContent(`
    <!doctype html>
    <html lang="pt-BR">
      <body>
        <div id="app" data-actions="" data-submits="0">
          <div id="overlay" class="modal-wrap" data-action="close-modal">
            <section class="modal">
              <form id="delivery-form">
                <label for="product">Produto</label>
                <select id="product" name="productId">
                  <option value="">Sem produto</option>
                  <option value="water">Água 20 L</option>
                </select>

                <label for="quantity">Quantidade</label>
                <input id="quantity" name="quantity" value="1" />

                <button id="save" type="submit">Salvar</button>
                <button id="explicit-close" type="button" data-action="close-modal">
                  Fechar
                </button>
              </form>
            </section>
          </div>
        </div>
      </body>
    </html>
  `);

  // native.js é carregado antes do app.js nos dois flavors. O guard precisa ser
  // registrado nessa mesma ordem para interceptar o fechamento fantasma.
  await page.addScriptTag({ path: NATIVE_SCRIPT });

  await page.evaluate((selector) => {
    const app = document.getElementById("app");
    if (!app) throw new Error("#app ausente no harness");

    // Reproduz o contrato de delegação usado pelos app.js de Logística/Vendas.
    app.addEventListener("click", (event) => {
      const origin = event.target;
      if (!(origin instanceof Element)) return;

      if (
        origin.closest(".sheet,.modal") &&
        !origin.closest(selector)
      ) {
        return;
      }

      const target = origin.closest<HTMLElement>(selector);
      if (!target) return;

      if (target.dataset.action === "close-modal") {
        app.dataset.actions = [app.dataset.actions, "close-modal"]
          .filter(Boolean)
          .join(",");
        document.getElementById("overlay")?.remove();
      }
    });

    app.addEventListener("submit", (event) => {
      event.preventDefault();
      app.dataset.submits = String(Number(app.dataset.submits || "0") + 1);
    });
  }, targetSelector);
}

async function dispatchBubblingClick(page: Page, selector: string) {
  await page.locator(selector).evaluate((element) => {
    element.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        composed: true,
      })
    );
  });
}

test.describe("HBX nativo — controles dentro de modal no mobile", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile-chromium",
      "Regressão específica do WebView/viewport mobile."
    );
  });

  for (const [appName, selector] of Object.entries(APP_SELECTORS)) {
    test(`${appName}: Produto e campos não fecham o modal`, async ({ page }) => {
      await mountModalHarness(page, selector);

      await dispatchBubblingClick(page, "#product");
      await expect(page.locator("#overlay")).toBeVisible();

      await page.locator("#product").selectOption("water");
      await expect(page.locator("#product")).toHaveValue("water");

      await dispatchBubblingClick(page, "#quantity");
      await expect(page.locator("#overlay")).toBeVisible();

      await page.locator("#save").click();
      await expect(page.locator("#app")).toHaveAttribute("data-submits", "1");
      await expect(page.locator("#overlay")).toBeVisible();
    });

    test(`${appName}: ações explícitas e backdrop ainda fecham`, async ({ page }) => {
      await mountModalHarness(page, selector);

      await page.locator("#explicit-close").click();
      await expect(page.locator("#overlay")).toHaveCount(0);
      await expect(page.locator("#app")).toHaveAttribute(
        "data-actions",
        "close-modal"
      );

      await mountModalHarness(page, selector);
      await dispatchBubblingClick(page, "#overlay");
      await expect(page.locator("#overlay")).toHaveCount(0);
      await expect(page.locator("#app")).toHaveAttribute(
        "data-actions",
        "close-modal"
      );
    });
  }
});
