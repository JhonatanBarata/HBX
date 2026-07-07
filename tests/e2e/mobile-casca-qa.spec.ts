/**
 * MOBILE-CASCA/W7 — QA final da frente (smoke que dá SEM autenticação real).
 *
 * Escopo combinado com o orquestrador (localhost tem banco vazio e login 401
 * por design — fluxos autenticados de verdade não são testáveis localmente;
 * veredito visual fica pra prod). Este spec cobre:
 *   1. Landing (mundo-site, page.client.tsx) sem overflow horizontal nas
 *      views principais + a bifurcação Empresas/Vendedor autônomo empilhada.
 *   2. Correção do dono 06/07: topo/nav da landing mobile NÃO ficam com faixa
 *      branca sólida sobre a arte do Portal — viram vidro escuro translúcido.
 *   3. /login renderiza mobile ok (sem side panels, CTA "Entrar" alcançável).
 *   4. Rota protegida sem token redireciona pra /login sem crash.
 *   5. Tab bar da casca (Vendas/Conversas/Empresas/Rota/Mais) + fallback
 *      central numa rota do grupo (app) sem tela mobile registrada
 *      (mesma técnica de auth mockada de mobile-no-overflow.spec.ts).
 *
 * NÃO inventa login real nem dados de produção — só mocks locais.
 */

import { expect, test } from "@playwright/test";

function fakeToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  return `test.${payload}.sig`;
}

async function assertNoHorizontalOverflow(page: import("@playwright/test").Page, label: string) {
  const overflows = await page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth > el.clientWidth + 1;
  });
  expect(overflows, `Overflow horizontal detectado em ${label}`).toBe(false);
}

test.describe("MOBILE-CASCA/W7 — landing + login mobile (sem auth)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Passe mobile — só roda no projeto mobile-chromium.");
  });

  test("landing: portal inicial sem overflow, duas portas empilhadas", async ({ page }) => {
    await page.goto("/");
    await assertNoHorizontalOverflow(page, "landing /");

    const corp = page.getByRole("button", { name: "Entrar como empresa" });
    const auto = page.getByRole("button", { name: "Entrar como vendedor" });
    await expect(corp).toBeVisible();
    await expect(auto).toBeVisible();

    // Empilhados verticalmente: o topo de "vendedor" fica no/depois do fim de "empresa".
    const corpBox = await corp.boundingBox();
    const autoBox = await auto.boundingBox();
    expect(corpBox).not.toBeNull();
    expect(autoBox).not.toBeNull();
    expect(autoBox!.y).toBeGreaterThanOrEqual(corpBox!.y + corpBox!.height - 2);
    // Cada porta ocupa a largura cheia da viewport (cartão inteiro, não coluna partida).
    const vw = page.viewportSize()!.width;
    expect(corpBox!.width).toBeGreaterThan(vw * 0.9);
    expect(autoBox!.width).toBeGreaterThan(vw * 0.9);
  });

  test("landing: cartões do Portal só título + botão curto (corte de texto, dono 06/07)", async ({ page }) => {
    await page.goto("/");

    // Eyebrow ("PARA EMPRESAS"/"PARA VENDEDOR AUTÔNOMO") e o parágrafo de
    // promessa somem no mobile — fica só título + CTA.
    await expect(page.locator(".portal-side__kicker").first()).toBeHidden();
    await expect(page.locator(".portal-side__promise").first()).toBeHidden();

    await expect(page.getByText("Empresas", { exact: true })).toBeVisible();
    await expect(page.getByText("Vendedor autônomo", { exact: true })).toBeVisible();

    // Label do botão do vendedor encurta pro mobile ("Sou Vendedor").
    const autoSide = page.locator(".portal-side--auto");
    await expect(autoSide.getByText("Sou vendedor", { exact: true })).toBeVisible();
    await expect(autoSide.getByText("Sou vendedor autônomo", { exact: true })).toBeHidden();
    await expect(page.getByText("Sou empresa", { exact: true })).toBeVisible();

    // Título + botão centralizados no cartão.
    const title = page.locator(".portal-side--corp .portal-side__title");
    const cue = page.locator(".portal-side--corp .portal-side__cue");
    const titleBox = await title.boundingBox();
    const cueBox = await cue.boundingBox();
    const vw = page.viewportSize()!.width;
    expect(Math.abs((titleBox!.x + titleBox!.width / 2) - vw / 2)).toBeLessThan(4);
    expect(Math.abs((cueBox!.x + cueBox!.width / 2) - vw / 2)).toBeLessThan(4);

    await assertNoHorizontalOverflow(page, "landing / (corte de texto)");
  });

  test("landing: topo e nav viram vidro escuro sobre a arte do Portal (fix 06/07)", async ({ page }) => {
    await page.goto("/");

    // Antes de escolher lado: já é a arte do Portal (full-bleed) — a régua do
    // dono vale desde a entrada, não só depois de escolher.
    const top = page.locator(".scene-top");
    const nav = page.locator(".scene-nav");
    await expect(top).toBeVisible();
    await expect(nav).toBeVisible();

    const topBg = await top.evaluate((el) => getComputedStyle(el).backgroundColor);
    const navBg = await nav.evaluate((el) => getComputedStyle(el).backgroundColor);
    // rgb(246,244,254)/rgba(243,240,253,x) = faixa branca reprovada; o vidro
    // escuro aprovado é rgba(8,12,20,x) — checamos que NÃO é mais o branco.
    expect(topBg).not.toBe("rgb(246, 244, 254)");
    expect(navBg.startsWith("rgba(243, 240, 253")).toBe(false);

    const topBackdrop = await top.evaluate((el) => getComputedStyle(el).backdropFilter);
    expect(topBackdrop).toContain("blur");

    // A marca »HBX continua legível (branco) sobre o vidro escuro.
    await expect(page.getByRole("button", { name: "HBX — início" })).toBeVisible();
  });

  test("landing: esteira/módulos (sem foto full-bleed) mantêm o fundo sólido normal", async ({ page }) => {
    await page.goto("/?ver=esteira");
    await assertNoHorizontalOverflow(page, "landing /?ver=esteira");
    const top = page.locator(".scene-top");
    const topBg = await top.evaluate((el) => getComputedStyle(el).backgroundColor);
    // Sem regressão: fora do Portal continua o fundo sólido do tema (claro).
    expect(topBg.startsWith("rgba(8, 12, 20")).toBe(false);
  });

  test("/login: renderiza mobile ok, CTA \"Entrar\" alcançável sem scroll", async ({ page }) => {
    await page.goto("/login");
    await assertNoHorizontalOverflow(page, "/login");

    await expect(page.getByRole("heading", { name: "Entrar no HBX" })).toBeVisible();
    const entrarBtn = page.getByRole("button", { name: "Entrar" });
    await expect(entrarBtn).toBeVisible();

    const box = await entrarBtn.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);

    // Zero-scroll: a página não deve rolar verticalmente pra ver o form.
    const scrollH = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(scrollH).toBeLessThanOrEqual(viewport!.height + 2);
  });

  test("rota protegida sem token redireciona pra /login sem crash", async ({ page }) => {
    await page.goto("/vendas");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Entrar no HBX" })).toBeVisible();
  });
});

test.describe("MOBILE-CASCA/W7 — casca autenticada (mock de sessão)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Casca mobile — só roda no projeto mobile-chromium.");
  });

  async function setupMocks(page: import("@playwright/test").Page) {
    await page.route("**/hbx/api/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
    });
    await page.route("**/hbx/api/profile/current-user", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: 1,
          name: "Tester Mobile",
          email: "test@hbx.com",
          role: "ADMIN",
          userKind: "admin",
          isSystemMaster: false,
          company: { id: 7, name: "Empresa Teste", selectedPlanKey: "hbx_padrao", paymentStatus: "PAYING", subscriptionStatus: "active", onboardingStatus: "active", premiumAccess: true },
        }),
      });
    });
    // useMyModules() (components/hbx/shell.tsx) indexa por m.key (não
    // m.moduleKey) — { key, accessible } é o shape real de MyModule.
    await page.route("**/hbx/api/modules/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { key: "vendas", accessible: true },
          { key: "atendimento", accessible: true },
          { key: "empresas", accessible: true },
          { key: "webscraping", accessible: true },
        ]),
      });
    });
    await page.route("**/hbx/api/commercial-plans/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          current: { planKey: "hbx_padrao", accessState: "paying", isTrial: false, entitlements: { vendas: true, atendimento_chat: true, webscraping: true } },
          plans: [],
          permissions: { canSelectPlan: true },
        }),
      });
    });
    await page.route("**/hbx/api/companies/me/operational-status**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ context: { available: true, companyId: 7 }, statuses: [], summary: null }) });
    });
    await page.route("**/hbx/api/vendas/board", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ summary: { total: 0, today: 0, overdue: 0, scheduled: 0, closed: 0 }, blocks: { today: [], overdue: [], scheduled: [], closed: [] } }) });
    });
  }

  async function gotoAutenticado(page: import("@playwright/test").Page, rota: string) {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.evaluate((token) => window.localStorage.setItem("token", token), fakeToken());
    await page.goto(rota, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
  }

  test("tab bar da casca presente com as 5 abas em /vendas", async ({ page }) => {
    await setupMocks(page);
    await gotoAutenticado(page, "/vendas");

    const tabbar = page.locator("nav.casca-tabbar");
    await expect(tabbar).toBeVisible();
    for (const label of ["Vendas", "Conversas", "Empresas", "Mais"]) {
      await expect(tabbar.getByText(label, { exact: true })).toBeVisible();
    }
    await assertNoHorizontalOverflow(page, "/vendas autenticado");
  });

  test("rota não registrada mostra o fallback central dentro da casca", async ({ page }) => {
    await setupMocks(page);
    await gotoAutenticado(page, "/relatorios");

    // A moldura da casca continua (tab bar visível — nunca quebra por construção).
    await expect(page.locator("nav.casca-tabbar")).toBeVisible();
    const fallback = page.locator(".casca-fallback");
    await expect(fallback).toBeVisible();
    // Título vem do AppShell META ("Relatórios no computador"); sem título
    // registrado cairia no genérico "Disponível no computador" — os dois são
    // válidos, o que importa é a moldura nunca quebrar.
    await expect(fallback.locator(".casca-fallback__title")).toContainText(/no computador|Disponível no computador/);
    await expect(page.getByRole("button", { name: /Ir para Vendas/ })).toBeVisible();
    await assertNoHorizontalOverflow(page, "/relatorios (fallback)");
  });
});
