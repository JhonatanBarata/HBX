import { expect, test } from "@playwright/test";

function fakeToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  return `test.${payload}.sig`;
}

test("observacao do modo foco mobile abre inteira no viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Fluxo especifico do layout mobile.");

  const now = new Date().toISOString();
  await page.route("**/hbx/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname.replace("/hbx/api", "");
    let body: unknown = {};

    if (pathname === "/profile/current-user") {
      body = {
        id: 1,
        name: "Tester Mobile",
        email: "test@hbx.com",
        role: "ADMIN",
        userKind: "admin",
        isSystemMaster: false,
        company: { id: 7, name: "Empresa Teste", selectedPlanKey: "hbx_padrao", premiumAccess: true },
      };
    } else if (pathname === "/modules/me") {
      body = [{ key: "vendas", moduleKey: "vendas", accessible: true }];
    } else if (pathname === "/commercial-plans/me") {
      body = {
        current: { planKey: "hbx_padrao", accessState: "trial", entitlements: { vendas: true, webscraping: true } },
        plans: [],
        permissions: { canSelectPlan: true },
      };
    } else if (pathname === "/companies/me/operational-status") {
      body = { context: { available: true, companyId: 7, companyName: "Empresa Teste" }, statuses: [], summary: null };
    } else if (pathname === "/vendas/board") {
      body = {
        summary: { total: 1, today: 1, overdue: 0, scheduled: 0, closed: 0 },
        blocks: {
          today: [{
            id: "lead-mobile-1",
            name: "Empresa Teste",
            phone: "5511999999999",
            email: "contato@empresa.test",
            city: "São Paulo",
            state: "SP",
            segment: "Serviços",
            status: "today",
            statusLabel: "Hoje",
            nextAction: "Ligar hoje",
            returnAt: now,
            shortNote: "Retornar no período da tarde",
            lastContactAt: null,
            attemptCount: 0,
            opportunityScore: 82,
            block: "today",
            saleConfirmedAt: null,
            saleStatusLabel: null,
            saleValue: null,
            product: null,
            owner: null,
          }],
          overdue: [],
          scheduled: [],
          closed: [],
        },
      };
    } else if (pathname === "/webscraping/radar/leads") {
      body = { items: [], total: 0, meta: { totalAvailable: 0 } };
    } else if (pathname === "/vendas/bot-status") {
      body = { botModuleEnabled: false, botArmed: false };
    } else if (pathname === "/inbox/whatsapp-session") {
      body = { whatsappSession: { accessible: false } };
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  await page.addInitScript((token) => localStorage.setItem("token", token as string), fakeToken());
  await page.goto("/vendas", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Vendas" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Modo foco" }).click();
  await page.getByRole("button", { name: "Observação" }).click();

  const heading = page.getByRole("heading", { name: "Observação — Empresa Teste" });
  const dialog = page.locator('.vf-sheet[role="dialog"]');
  await expect(dialog).toBeVisible();
  await expect(heading).toBeVisible();

  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
  expect(box!.height).toBeLessThanOrEqual(viewport!.height * 0.82);
});
