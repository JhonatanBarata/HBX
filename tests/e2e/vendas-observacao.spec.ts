import { expect, test } from "@playwright/test";

test("observacao mobile abre centralizada e visivel", async ({ page }) => {
  test.skip(test.info().project.name !== "mobile-chromium", "Fluxo especifico do layout mobile.");
  await page.setViewportSize({ width: 397, height: 860 });

  const loginResponse = await page.request.post("http://localhost:3000/auth/login", {
    data: {
      username: "teste@teste.com",
      password: "12345678",
      forceSession: true,
    },
  });
  expect(loginResponse.ok()).toBeTruthy();
  const loginPayload = await loginResponse.json();
  const token = String(loginPayload.access_token || loginPayload.accessToken || loginPayload.token || "");
  expect(token).toBeTruthy();

  await page.addInitScript((accessToken) => {
    localStorage.setItem("token", accessToken);
  }, token);
  await page.goto("/vendas", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("region", { name: "Vendas mobile" })).toBeVisible({ timeout: 20_000 });
  const noteButton = page.locator('button[aria-label^="Abrir observação"]').first();
  await expect(noteButton).toBeVisible({ timeout: 20_000 });
  await noteButton.click();

  const dialog = page.locator('[role="dialog"][aria-labelledby="mobile-vendas-note-title"]');
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByText("Observação")).toBeVisible();

  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(8);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height - 8);
  expect(box!.height).toBeLessThanOrEqual(viewport!.height * 0.82);
});
