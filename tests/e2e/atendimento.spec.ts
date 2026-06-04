import { expect, test, type Page, type Route } from "@playwright/test";

const CONVERSATION_ID = "conv-atendimento-smoke";
const CUSTOMER_NAME = "Cliente Teste Atendimento";
const NOW = "2026-05-20T12:00:00.000Z";

function fakeToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  return `test.${payload}.sig`;
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function delayedJson(route: Route, body: unknown, delayMs: number) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return json(route, body);
}

function makeMessage(id: string, direction: "inbound" | "outbound", content: string, createdAt: string) {
  return {
    id,
    direction,
    content,
    createdAt,
    messageType: "text",
    senderType: direction === "inbound" ? "customer" : "operator",
    status: direction === "inbound" ? "received" : "sent",
    error: null,
    metadata: {},
  };
}

const messages = [
  makeMessage("msg-1", "inbound", "Oi, preciso de atendimento", "2026-05-20T11:58:00.000Z"),
  makeMessage("msg-2", "outbound", "Claro, estou verificando.", "2026-05-20T11:59:00.000Z"),
];

function makeConversation(messagePage = messages) {
  return {
    id: CONVERSATION_ID,
    contact: "5511999999999@s.whatsapp.net",
    status: "open",
    assignedTo: "atendente@hbx.test",
    botActive: false,
    humanAssigned: true,
    createdAt: "2026-05-20T11:55:00.000Z",
    updatedAt: NOW,
    lastMessageAt: NOW,
    lastRealMessageAt: NOW,
    whatsappConnectionSessionId: "session-smoke",
    sourcePhoneNormalized: "5511999999999",
    sourceTenantKey: "company-7",
    currentFlow: null,
    flowResult: null,
    routeTarget: "atendimento",
    routeReason: "human_queue",
    recoveryCustomerId: null,
    recoveryCustomerName: null,
    recoveryOpenAmount: 0,
    recoveryRiskScore: null,
    recoveryTotalPaid: 0,
    recoveryStatus: null,
    recoveryPaymentHistory: [],
    recoveryCurrentStep: null,
    recoverySuggestedPath: "",
    latestSourceModule: "atendimento",
    isBlocked: false,
    blockedAt: null,
    blockedReason: null,
    metadata: {
      whatsappContactName: CUSTOMER_NAME,
      whatsappRemoteJid: "5511999999999@s.whatsapp.net",
      presenceOnline: true,
      presenceTyping: true,
      presenceStatus: "composing",
      presenceUpdatedAt: NOW,
    },
    customer: {
      id: "customer-smoke",
      phone: "+55 11 99999-9999",
      name: CUSTOMER_NAME,
      avatarUrl: null,
    },
    messages: messagePage,
  };
}

const whatsappSession = {
  accessible: true,
  reason: null,
  mode: "current",
  currentSessionId: "session-smoke",
  providerHealth: {
    status: "healthy",
    canSafelyDelete: false,
    reason: null,
    lastCheckedAt: NOW,
    rawStatus: "connected",
    rawError: null,
  },
  currentSession: {
    id: "session-smoke",
    provider: "webwhats",
    phoneNormalized: "5511999999999",
    displayPhone: "+55 11 99999-9999",
    connectedAt: NOW,
  },
};

async function mockAtendimentoApi(page: Page) {
  const seen = new Set<string>();
  const summaryConversation = makeConversation([messages[0]]);
  const detailedConversation = makeConversation([]);

  await page.route("**/hbx/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname.replace(/^\/hbx\/api/, "");
    const method = request.method();

    if (pathname === "/profile/current-user") {
      return json(route, {
        id: 1,
        email: "atendimento@hbx.test",
        role: "admin",
        isSystemMaster: false,
        company: {
          id: 7,
          name: "Empresa Atendimento",
          selectedPlanKey: "hbx_padrao",
          contactPhone: "19997024884",
          paymentStatus: "TRIAL",
          subscriptionStatus: "trialing",
          onboardingStatus: "active_trial",
          premiumAccess: true,
        },
      });
    }

    if (pathname === "/modules/me") {
      return json(route, [{ key: "atendimento", name: "Atendimento", accessible: true, active: true }]);
    }

    if (pathname === "/profile/theme-preferences") {
      return json(route, {});
    }

    if (pathname === "/commercial-plans/me") {
      return json(route, {
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
            radar_premium: true,
            recovery_intelligence: false,
            digital_audit: false,
            opportunity_score: true,
            ai_sales_scripts: true,
          },
        },
        plans: [],
        permissions: { canSelectPlan: true },
      });
    }

    if (pathname === "/companies/me/whatsapp-center") {
      return json(route, {
        generatedAt: NOW,
        company: {
          id: 7,
          name: "Empresa Atendimento",
          selectedPlanKey: "hbx_padrao",
          contactPhone: "19997024884",
          paymentStatus: "TRIAL",
          subscriptionStatus: "trialing",
          onboardingStatus: "active_trial",
          premiumAccess: true,
          whatsappConnectionMode: "QR",
          whatsappTemporaryStatus: "CONNECTED",
        },
        center: {
          mode: "QR",
          status: "QR",
          statusLabel: "Conectado por QR",
          statusHint: "Sessao mockada para smoke.",
          qrConnection: {
            selected: true,
            status: "QR",
            available: true,
            configured: true,
            note: "Conectado",
            liveStatus: "connected",
            provider: "external_modal",
            instanceKey: "company-7",
            pairingCode: null,
            qrCodeDataUrl: null,
            displayNumber: "+55 11 99999-9999",
            connectedAt: NOW,
            lastSyncAt: NOW,
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
      });
    }

    if (pathname === "/companies/me/whatsapp-modal/status") {
      return json(route, {
        success: true,
        status: "connected",
        message: "Sessao conectada.",
        errorCode: null,
        data: {
          companyId: 7,
          companyName: "Empresa Atendimento",
          companySlug: "empresa-atendimento",
          tenantKey: "company-7",
          provider: "external_modal",
          enabled: true,
          configured: true,
          available: true,
          providerHealth: "healthy",
          missingConfigKeys: [],
          phone: "+55 11 99999-9999",
          connectedAt: NOW,
          updatedAt: NOW,
          lastError: null,
          qrCodeDataUrl: null,
          rawStatus: "connected",
        },
      });
    }

    if (pathname === "/companies/me/whatsapp-live-health") {
      return json(route, {
        status: "healthy",
        connected: true,
        liveConfirmed: true,
        storedStatus: "connected",
        providerStatus: "connected",
        providerReachable: true,
        lastCheckedAt: NOW,
        lastProviderSyncAt: NOW,
        lastInboundMessageAt: NOW,
        lastOutboundMessageAt: NOW,
        staleSeconds: null,
        reason: "Mock conectado",
        actionLabel: "Verificar",
        actionHref: "/atendimento",
        recommendedAction: "none",
        providerHealth: "healthy",
        ttlSeconds: 60,
      });
    }

    if (pathname === "/companies/me/operational-status") {
      return json(route, {
        context: { available: true, companyId: 7, companyName: "Empresa Atendimento", mode: "empresa" },
        statuses: [],
        summary: null,
      });
    }

    if (pathname === "/inbox/bootstrap") {
      seen.add("bootstrap");
      return delayedJson(route, {
        conversations: [summaryConversation],
        selectedConversation: null,
        selectedConversationId: CONVERSATION_ID,
        bootstrapMode: "light",
        hasMoreConversations: false,
        nextSkip: null,
        providerWarning: null,
        whatsappSession,
        whatsappSessionCleanup: null,
      }, 350);
    }

    if (pathname === "/inbox/whatsapp-session") {
      return json(route, {
        providerWarning: null,
        whatsappSession,
        whatsappSessionCleanup: null,
      });
    }

    if (pathname === "/inbox/events") {
      seen.add("events");
      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: `event: inbox\ndata: ${JSON.stringify({
          kind: "presence",
          conversationId: CONVERSATION_ID,
          presence: {
            remoteJid: "5511999999999@s.whatsapp.net",
            presence: "composing",
            providerStatus: "composing",
            online: true,
            typing: true,
            recording: false,
            lastSeenAt: null,
            updatedAt: NOW,
          },
        })}\n\n`,
      });
    }

    if (pathname === "/inbox/conversations") {
      seen.add("list");
      return json(route, [summaryConversation]);
    }

    if (pathname === `/inbox/conversations/${CONVERSATION_ID}/messages`) {
      seen.add("messages");
      return json(route, {
        messages,
        hasMore: false,
        nextBefore: null,
      });
    }

    if (pathname === `/inbox/conversations/${CONVERSATION_ID}/presence`) {
      seen.add("presence");
      return json(route, {
        remoteJid: "5511999999999@s.whatsapp.net",
        presence: "composing",
        providerStatus: "composing",
        online: true,
        typing: true,
        recording: false,
        lastSeenAt: null,
        updatedAt: NOW,
      });
    }

    if (pathname === `/inbox/conversations/${CONVERSATION_ID}/status-card`) {
      return json(route, {
        customer: {
          profileId: "customer-smoke",
          name: CUSTOMER_NAME,
          phone: "+55 11 99999-9999",
          phoneNormalized: "5511999999999",
          doNotCall: false,
          observations: null,
          updatedAt: NOW,
        },
        lead: null,
        history: [],
      });
    }

    if (pathname === `/inbox/conversations/${CONVERSATION_ID}` && method === "GET") {
      seen.add("detail");
      return delayedJson(route, detailedConversation, 150);
    }

    if (pathname === `/inbox/conversations/${CONVERSATION_ID}/read`) {
      return json(route, detailedConversation);
    }

    if (pathname === "/hbx-recovery/interactions") {
      return json(route, { items: [], total: 0, counters: {} });
    }

    if (pathname.includes("/webscraping/engines/status")) {
      return json(route, { status: "idle", engines: [] });
    }

    if (pathname === "/pulse/summary") {
      return json(route, null);
    }

    return json(route, {});
  });

  return seen;
}

test.describe("Atendimento", () => {
  test("carrega lista, conversa e presenca com API mockada", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Smoke validado no desktop.");

    const seen = await mockAtendimentoApi(page);

    await page.addInitScript((token) => {
      window.localStorage.setItem("token", token as string);
    }, fakeToken());

    await page.goto("/atendimento?atendimentoQueue=scheduled");

    await expect(page.getByLabel("Carregando conversas")).toBeVisible();
    const conversation = page.getByRole("button", { name: new RegExp(CUSTOMER_NAME) });
    await expect(conversation).toBeVisible();

    await conversation.click();

    const messageBubbles = page.locator('[class*="whatsAppBubbleText"]');
    await expect(messageBubbles.filter({ hasText: "Oi, preciso de atendimento" })).toBeVisible();
    await expect(messageBubbles.filter({ hasText: "Claro, estou verificando." })).toBeVisible();
    await expect(page.getByLabel("Contato online")).toBeVisible();
    await expect(page.getByText("digitando...").first()).toBeVisible();

    expect(Array.from(seen)).toEqual(expect.arrayContaining(["bootstrap", "detail", "messages", "presence"]));
  });
});
