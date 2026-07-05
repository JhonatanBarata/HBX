/**
 * APPIFICAÇÃO A6 — QA mobile do app /entrega (viewport iPhone).
 *
 * Fecha o plano LOGISTICA-MOBILE/PLANO-APPIFICACAO.md: valida no viewport
 * mobile (Pixel 5, 397×860 — o mesmo do playwright.config.ts) o que dá SEM
 * depender de credencial real:
 *   1. As 4 abas do app (Rota · Clientes · Produtos · Ajustes) existem e navegam.
 *   2. Sem overflow horizontal em /entrega e nas 3 subrotas + /logistica (B1) +
 *      /vendas (B4).
 *   3. A folha "Mais" do dashboard lista Empresas/Contatos/Produtos (A1).
 *
 * Auth: token falso no localStorage + mocks de API (mesma técnica de
 * mobile-no-overflow.spec.ts). O onboarding do 1º acesso do app (M9) é
 * dispensado setando a chave de localStorage antes de navegar, senão a tela
 * fica coberta pelo overlay e as abas não renderizam.
 *
 * NÃO é QA autenticado de verdade (não cria cliente/gera dia com backend real):
 * isso é o roteiro manual no A6-RESULTADO.md. Aqui é o QA estrutural/anti-corte
 * que roda no CI sem credencial.
 */

import { expect, test, type Page } from "@playwright/test";

const ONBOARDING_KEY = "hbx:entrega:onboarded:v1";

// ---------- helpers (mesmo padrão de mobile-no-overflow.spec.ts) ----------

function fakeToken() {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })
  ).toString("base64url");
  return `test.${payload}.sig`;
}

/** Mocks das APIs que as telas do app tocam no load (auth/perfil/módulos +
 *  os endpoints de logística/núcleo/produtos).
 *
 *  ORDEM IMPORTA: o Playwright resolve rotas em LIFO (a ÚLTIMA registrada que
 *  casa vence). Por isso o catch-all `**​/hbx/api/**` é registrado PRIMEIRO e as
 *  rotas específicas DEPOIS — senão o catch-all devolveria `{}` pra
 *  /logistica/rota e o app quebraria (items undefined → redireciona pro login). */
async function setupMocks(page: Page) {
  // Catch-all genérico — PRIMEIRO (as rotas específicas abaixo têm precedência).
  await page.route("**/hbx/api/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });

  // Perfil / usuário — módulo logística ligado, admin (passa os @Admin do app).
  await page.route("**/hbx/api/profile/current-user", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 1,
        name: "Entregador Teste",
        email: "test@hbx.com",
        role: "ADMIN",
        userKind: "admin",
        canViewBilling: true,
        isSystemMaster: false,
        company: {
          id: 7,
          name: "Água Teste",
          selectedPlanKey: "hbx_padrao",
          contactPhone: "11999999999",
          paymentStatus: "PAYING",
          subscriptionStatus: "active",
          onboardingStatus: "active",
          premiumAccess: true,
          prospectingSegments: [],
        },
      }),
    });
  });

  await page.route("**/hbx/api/profile/theme-preferences", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });

  // Módulos — logística visível na folha "Mais" + tab do dashboard.
  await page.route("**/hbx/api/modules/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { moduleKey: "vendas", accessible: true },
        { moduleKey: "atendimento", accessible: true },
        { moduleKey: "webscraping", accessible: true },
        { moduleKey: "logistica", accessible: true },
        { moduleKey: "empresas", accessible: true },
        { moduleKey: "contatos", accessible: true },
        { moduleKey: "produtos", accessible: true },
        { moduleKey: "relatorios", accessible: true },
      ]),
    });
  });

  await page.route("**/hbx/api/commercial-plans/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        current: {
          planKey: "hbx_padrao",
          selectedPlanKey: "hbx_padrao",
          accessState: "paying",
          accessStateLabel: "Ativo",
          isTrial: false,
          entitlements: {
            vendas: true,
            atendimento_chat: true,
            webscraping: true,
            logistica: true,
            bot_ia: true,
            radar_premium: true,
          },
        },
        plans: [],
        permissions: { canSelectPlan: true },
      }),
    });
  });

  await page.route("**/hbx/api/companies/me/operational-status**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        context: { available: true, companyId: 7, companyName: "Água Teste", mode: "empresa" },
        statuses: [],
        summary: null,
      }),
    });
  });

  // Rota do dia (app /entrega) — vazio honesto (sem entregas).
  await page.route("**/hbx/api/logistica/rota**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ date: new Date().toISOString().slice(0, 10), total: 0, effectsEnabled: false, moduloFinanceiroAtivo: false, items: [] }),
    });
  });

  // Resumo do dia (faixa de gestão / B2) — 0 / R$ 0,00.
  await page.route("**/hbx/api/logistica/resumo-dia**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ date: new Date().toISOString().slice(0, 10), entregues: 0, recebidoHoje: 0, aReceber: 0 }),
    });
  });

  // Config (Ajustes).
  await page.route("**/hbx/api/logistica/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        avisoWhatsEnabled: false,
        templateAviso: null,
        raioChegadaM: 60,
        velocidadeMediaKmH: 30,
        tempoParadaMin: 5,
        cobrancaNaEntrega: false,
        moduloFinanceiroAtivo: false,
        moduloRecoveryAtivo: false,
        gerarDiaAutomatico: false,
      }),
    });
  });

  // Clientes (lista) + produtos (catálogo/gerenciador).
  await page.route("**/hbx/api/nucleo/clientes**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ page: 1, pageSize: 100, total: 0, totalPages: 0, items: [] }) });
  });
  await page.route("**/hbx/api/logistica/produtos**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });
  await page.route("**/hbx/api/products**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });

  // WhatsApp center (dashboard shell — /logistica desktop e mobile tab bar).
  await page.route("**/hbx/api/companies/me/whatsapp-center", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        generatedAt: new Date().toISOString(),
        company: { id: 7, paymentStatus: "PAYING", whatsappConnectionMode: "NONE", whatsappTemporaryStatus: "NOT_CONNECTED" },
        center: { mode: "NONE", status: "NOT_CONNECTED", statusLabel: "Não conectado", statusHint: "" },
      }),
    });
  });

  // Radar / vendas — pra /vendas montar (B4) sem 500.
  await page.route("**/hbx/api/vendas/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], columns: [], cards: [], total: 0 }) });
  });
  await page.route("**/hbx/api/webscraping/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], total: 0, meta: { available: true } }) });
  });
  await page.route("**/hbx/api/night-factory/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: 0, deltaToday: 0, available: true }) });
  });
}

/** Injeta token + dispensa o onboarding do 1º acesso (senão o overlay cobre a
 *  tela e as abas do app não renderizam). Roda ANTES de navegar pra rota real. */
async function primeSession(page: Page) {
  await page.evaluate(
    ({ token, onboardKey }: { token: string; onboardKey: string }) => {
      window.localStorage.setItem("token", token);
      window.localStorage.setItem(onboardKey, "1");
    },
    { token: fakeToken(), onboardKey: ONBOARDING_KEY }
  );
}

async function assertNoHorizontalOverflow(page: Page, rota: string) {
  const overflows = await page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth > el.clientWidth + 1;
  });
  expect(
    overflows,
    `Overflow horizontal detectado em ${rota}: scrollWidth > clientWidth + 1`
  ).toBe(false);
}

/** Vai ao /login (cria contexto de localStorage do origin), prima a sessão e
 *  então navega pra rota alvo, esperando estabilizar.
 *
 *  waitUntil:"domcontentloaded" é DELIBERADO: com o default "load" a navegação
 *  espera subrecursos e o XHR do app (ex.: getRota) dispara antes da interceptação
 *  de rota assentar pro novo documento → chega no backend real, toma 401 e
 *  redireciona pro /login. Com domcontentloaded os mocks já valem quando o XHR sai. */
async function gotoAutenticado(page: Page, rota: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await primeSession(page);
  await page.goto(rota, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
}

// ---------- suite ----------

test.describe("APPIFICAÇÃO A6 — app /entrega no viewport iPhone", () => {
  // Todo o QA estrutural roda só no projeto mobile (Pixel 5, 397×860).
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile-chromium",
      "QA mobile do app só roda no projeto mobile-chromium."
    );
  });

  // 1) As 4 abas do app existem e navegam.
  test("as 4 abas do app (Rota · Clientes · Produtos · Ajustes) existem e navegam", async ({ page }) => {
    await setupMocks(page);
    await gotoAutenticado(page, "/entrega");

    const tabbar = page.locator("nav.ent-tabbar");
    await expect(tabbar).toBeVisible();

    // As 4 abas presentes com os labels certos.
    for (const label of ["Rota", "Clientes", "Produtos", "Ajustes"]) {
      await expect(tabbar.getByText(label, { exact: true })).toBeVisible();
    }
    // Exatamente 4 abas.
    await expect(tabbar.locator("a.ent-tab")).toHaveCount(4);
    // Na home, a aba "Rota" está ativa (is-on).
    await expect(tabbar.locator("a.ent-tab.is-on")).toHaveCount(1);
    await expect(tabbar.locator("a.ent-tab.is-on")).toContainText("Rota");

    // Navega Clientes → Produtos → Ajustes e confirma que a URL e a aba ativa mudam.
    for (const [label, rota] of [
      ["Clientes", "/entrega/clientes"],
      ["Produtos", "/entrega/produtos"],
      ["Ajustes", "/entrega/ajustes"],
    ] as const) {
      await tabbar.getByText(label, { exact: true }).click();
      await expect(page).toHaveURL(new RegExp(rota.replace(/\//g, "\\/") + "$"));
      await expect(page.locator("nav.ent-tabbar a.ent-tab.is-on")).toContainText(label);
      await assertNoHorizontalOverflow(page, rota);
    }
  });

  // 2) Overflow horizontal nas rotas do app + B1 (/logistica) + B4 (/vendas).
  const ROTAS_ANTICORTE = [
    "/entrega",
    "/entrega/clientes",
    "/entrega/produtos",
    "/entrega/ajustes",
    "/logistica",
    "/vendas",
  ];
  for (const rota of ROTAS_ANTICORTE) {
    test(`${rota} — sem corte horizontal (anti-corte)`, async ({ page }) => {
      await setupMocks(page);
      await gotoAutenticado(page, rota);
      await assertNoHorizontalOverflow(page, rota);
    });
  }

  // 3) Folha "Mais" do dashboard lista Empresas/Contatos/Produtos (A1).
  test('folha "Mais" do dashboard lista Empresas, Contatos e Produtos', async ({ page }) => {
    await setupMocks(page);
    await gotoAutenticado(page, "/dashboard");

    // Abre a folha "Mais" da tab bar do dashboard.
    const maisBtn = page.locator("nav.mobile-tab-bar button", { hasText: "Mais" });
    await expect(maisBtn).toBeVisible();
    await maisBtn.click();

    const sheet = page.locator('.hbx-drawer-bottom[role="dialog"]');
    await expect(sheet).toBeVisible();
    for (const label of ["Empresas", "Contatos", "Produtos"]) {
      await expect(sheet.getByText(label, { exact: true })).toBeVisible();
    }
  });
});
