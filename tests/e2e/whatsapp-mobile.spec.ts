import { expect, test } from "@playwright/test";

function fakeToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  return `test.${payload}.sig`;
}

test.describe("whatsapp mobile", () => {
  test("HBX Lead em trial usa somente vínculo por telefone com telefone bloqueado", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Fluxo validado no viewport mobile.");

    await page.route("**/hbx/api/profile/current-user", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: 1,
          email: "lead@teste.com",
          isSystemMaster: false,
          company: {
            id: 7,
            name: "Empresa Lead",
            selectedPlanKey: "hbx_padrao",
            contactPhone: "19997024884",
            paymentStatus: "TRIAL",
            subscriptionStatus: "trialing",
            onboardingStatus: "active_trial",
            premiumAccess: true,
          },
        }),
      });
    });
    await page.route("**/hbx/api/companies/me/whatsapp-center", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          generatedAt: new Date().toISOString(),
          company: {
            id: 7,
            name: "Empresa Lead",
            selectedPlanKey: "hbx_padrao",
            contactPhone: "19997024884",
            paymentStatus: "TRIAL",
            subscriptionStatus: "trialing",
            onboardingStatus: "active_trial",
            premiumAccess: true,
            trialModuleSelection: "vendas",
            whatsappConnectionMode: "NONE",
            whatsappTemporaryStatus: "NOT_CONNECTED",
          },
          center: {
            mode: "NONE",
            status: "NOT_CONNECTED",
            statusLabel: "Não conectado",
            statusHint: "Escolha o trilho ideal para ativar o WhatsApp da empresa.",
            qrConnection: {
              selected: false,
              status: "NOT_CONNECTED",
              available: true,
              configured: true,
              note: "Disponível",
              liveStatus: "idle",
              provider: "external_modal",
              instanceKey: "company-7",
              pairingCode: null,
              qrCodeDataUrl: null,
              displayNumber: null,
              connectedAt: null,
              lastSyncAt: null,
              errorMessage: null,
              missingConfigKeys: [],
              setupHint: null,
            },
            official: {
              selected: false,
              configured: false,
              connected: false,
              status: null,
              displayNumber: null,
              usingMasterToken: false,
              credentialLabel: null,
              phoneNumberId: null,
              wabaId: null,
            },
            migration: {
              interestRequested: false,
              requestedAt: null,
            },
          },
        }),
      });
    });
    await page.route("**/hbx/api/companies/me/whatsapp-modal/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          status: "offline",
          message: "Nenhuma sessão ativa.",
          data: {
            companyId: 7,
            companyName: "Empresa Lead",
            companySlug: "empresa-lead",
            tenantKey: "company-7",
            provider: "external_modal",
            enabled: true,
            configured: true,
            available: true,
            providerHealth: "healthy",
            missingConfigKeys: [],
            phone: null,
            connectedAt: null,
            updatedAt: null,
            lastError: null,
            qrCodeDataUrl: null,
            rawStatus: null,
          },
          errorCode: null,
        }),
      });
    });
    await page.route("**/hbx/api/modules/me", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.route("**/hbx/api/profile/theme-preferences", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
    });
    await page.route("**/hbx/api/commercial-plans/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          current: {
            planKey: "hbx_padrao",
            selectedPlanKey: "hbx_padrao",
            contactPhone: "19997024884",
            onboardingStatus: "active_trial",
            subscriptionStatus: "trialing",
            paymentStatus: "TRIAL",
            premiumAccess: true,
            isTrial: true,
            entitlements: {
              vendas: true,
              atendimento_chat: true,
              webscraping: true,
              bot_ia: false,
              recovery: false,
              night_factory: true,
              radar_premium: true,
              recovery_intelligence: false,
              digital_audit: false,
              opportunity_score: true,
              ai_sales_scripts: true,
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
          context: { available: true, companyId: 7, companyName: "Empresa Lead", mode: "empresa" },
          statuses: [],
          summary: null,
        }),
      });
    });

    await page.goto("/login");
    await page.evaluate((token) => {
      window.localStorage.setItem("token", token as string);
    }, fakeToken());
    await page.goto("/whatsapp?focus=qr&from=boasvindas");

    await expect(page.getByText("Vincular por telefone")).toBeVisible();
    await expect(page.getByText("QRCODE")).toHaveCount(0);
    await expect(page.getByText("META")).toHaveCount(0);
    await expect(page.getByLabel("Telefone do trial")).toHaveValue("+55 (19) 99702-4884");
    await expect(page.getByText("Para trocar, acione o suporte.")).toBeVisible();
  });
});
