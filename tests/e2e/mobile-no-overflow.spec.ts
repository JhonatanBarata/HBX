/**
 * Fiscal anti-corte — mobile-no-overflow.spec.ts
 *
 * Visita as rotas principais no viewport mobile (Pixel 5, 397×860) e
 * FALHA se houver overflow horizontal: scrollWidth > clientWidth + 1.
 *
 * Projeto-alvo: mobile-chromium (definido em playwright.config.ts).
 * Rotas que precisam de auth: token falso no localStorage (mesma técnica
 * de whatsapp-mobile.spec.ts).
 */

import { expect, test } from "@playwright/test";

// ---------- helpers ----------

function fakeToken() {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })
  ).toString("base64url");
  return `test.${payload}.sig`;
}

/** Mock completo de APIs para a rota montar sem erro de auth / 500. */
async function setupCommonMocks(page: import("@playwright/test").Page) {
  // Perfil / usuário
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
        canViewBilling: true,
        isSystemMaster: false,
        company: {
          id: 7,
          name: "Empresa Teste",
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

  // Preferências de tema
  await page.route("**/hbx/api/profile/theme-preferences", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  // Módulos
  await page.route("**/hbx/api/modules/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { moduleKey: "atendimento", accessible: true },
        { moduleKey: "vendas", accessible: true },
        { moduleKey: "webscraping", accessible: true },
        { moduleKey: "bot_ia", accessible: true },
        { moduleKey: "relatorios", accessible: true },
      ]),
    });
  });

  // Planos comerciais
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
            bot_ia: true,
            recovery: false,
            night_factory: true,
            radar_premium: true,
          },
        },
        plans: [],
        permissions: { canSelectPlan: true },
      }),
    });
  });

  // Status operacional
  await page.route("**/hbx/api/companies/me/operational-status**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        context: { available: true, companyId: 7, companyName: "Empresa Teste", mode: "empresa" },
        statuses: [],
        summary: null,
      }),
    });
  });

  // WhatsApp center
  await page.route("**/hbx/api/companies/me/whatsapp-center", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        generatedAt: new Date().toISOString(),
        company: { id: 7, paymentStatus: "PAYING", whatsappConnectionMode: "NONE", whatsappTemporaryStatus: "NOT_CONNECTED" },
        center: {
          mode: "NONE",
          status: "NOT_CONNECTED",
          statusLabel: "Não conectado",
          statusHint: "",
          qrConnection: { selected: false, status: "NOT_CONNECTED", available: true, configured: true, note: "", liveStatus: "idle", provider: "external_modal", instanceKey: "company-7", pairingCode: null, qrCodeDataUrl: null, displayNumber: null, connectedAt: null, lastSyncAt: null, errorMessage: null, missingConfigKeys: [], setupHint: null },
          official: { selected: false, configured: false, connected: false, status: null, displayNumber: null, usingMasterToken: false, credentialLabel: null, phoneNumberId: null, wabaId: null },
          migration: { interestRequested: false, requestedAt: null },
        },
      }),
    });
  });

  // WhatsApp modal status
  await page.route("**/hbx/api/companies/me/whatsapp-modal/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, status: "offline", message: "Nenhuma sessão ativa.", data: null, errorCode: null }),
    });
  });

  // Planos públicos
  await page.route("**/hbx/api/commercial-plans/public-catalog", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });

  // Equipe (configurações)
  await page.route("**/hbx/api/users/company", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });

  // Seat billing
  await page.route("**/hbx/api/users/company/seat-billing", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ seats: 1, price: 0 }) });
  });

  // Dashboard / KPIs
  await page.route("**/hbx/api/vendas/kpis**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ cardsAtivos: 0, chamadosHoje: 0, respostas: 0, fechamentos: 0 }) });
  });

  // Atendimento (conversas)
  await page.route("**/hbx/api/inbox/conversations**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], total: 0 }) });
  });

  // Bot config
  await page.route("**/hbx/api/inbox/bot-config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        setup: { completed: true, botType: "hbx" },
        welcomeMessage: "Olá! Como posso ajudar?",
        routingRules: { globalBotEnabled: false },
        actionCatalog: [],
      }),
    });
  });

  // Relatórios
  await page.route("**/hbx/api/vendas/report**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, metrics: { cardsRecebidos: 0, cardsChamados: 0, respostas: 0, retornos: 0, interessados: 0, recusas: 0, bloqueios: 0, descartados: 0, taxaResposta: 0, taxaConversao: 0, melhorSegmento: "", melhorCidade: "", melhorCanal: "" }, rankings: { segments: [], cities: [], channels: [], discardReasons: [] } }),
    });
  });

  await page.route("**/hbx/api/vendas/seller-audit**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [] }) });
  });

  // Radar / leads
  await page.route("**/hbx/api/webscraping/radar/leads**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], total: 0, meta: { available: true } }) });
  });

  await page.route("**/hbx/api/night-factory/leads-bank", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: 0, deltaToday: 0, available: true }) });
  });

  await page.route("**/hbx/api/vendas/usage", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ cards: { used: 0, limit: 10, remaining: 10 } }) });
  });

  await page.route("**/hbx/api/webscraping/radar/search-runs/latest", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(null) });
  });

  await page.route("**/hbx/api/webscraping/radar/standing-order", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ standingOrder: null }) });
  });

  // Vendas (kanban)
  await page.route("**/hbx/api/vendas/pipeline**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ columns: [], cards: [] }) });
  });

  await page.route("**/hbx/api/vendas/funnel**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ columns: [] }) });
  });

  // Dashboard
  await page.route("**/hbx/api/dashboard/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });

  // Email / SMTP
  await page.route("**/hbx/api/company-email/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });

  // Catch-all genérico para qualquer outra rota da API
  await page.route("**/hbx/api/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });
}

/** Injeta o fakeToken no localStorage antes de navegar para a rota. */
async function injectToken(page: import("@playwright/test").Page) {
  await page.evaluate((token: string) => {
    window.localStorage.setItem("token", token);
  }, fakeToken());
}

/** Verifica ausência de overflow horizontal no document.documentElement. */
async function assertNoHorizontalOverflow(page: import("@playwright/test").Page, route: string) {
  const overflows = await page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth > el.clientWidth + 1;
  });
  expect(
    overflows,
    `Overflow horizontal detectado em ${route}: scrollWidth > clientWidth + 1`
  ).toBe(false);
}

// ---------- suite ----------

test.describe("mobile — sem overflow horizontal (fiscal anti-corte)", () => {
  const ROTAS = [
    "/login",
    "/dashboard",
    "/leads",
    "/vendas",
    "/atendimento",
    "/bot",
    "/relatorios",
    "/configuracoes",
  ];

  for (const rota of ROTAS) {
    test(`${rota} — sem corte horizontal`, async ({ page }, testInfo) => {
      test.skip(
        testInfo.project.name !== "mobile-chromium",
        "Teste fiscal só roda no projeto mobile-chromium."
      );

      await setupCommonMocks(page);

      // Primeiro vai ao login para criar o contexto do localStorage
      await page.goto("/login");
      await injectToken(page);

      // Navega para a rota real
      await page.goto(rota);

      // Aguarda a página estabilizar (hidratação Next.js + mocks)
      await page.waitForLoadState("networkidle").catch(() => {
        // networkidle pode timeout em SSE/websockets — ignorar
      });
      // Pequena pausa para hidratação React terminar
      await page.waitForTimeout(600);

      await assertNoHorizontalOverflow(page, rota);
    });
  }
});
