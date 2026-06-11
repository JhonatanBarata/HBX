import { expect, test, type APIRequestContext } from "@playwright/test";
import { execSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";

// E2E da Fase D (PR10062026002 D.6) — fluxo completo por API contra o stack
// local (backend :3000 + Postgres via docker compose, PAYMENTS_PROVIDER=mock):
//   cadastro self-service → confirmação (mock confirma no 1º login) → trial →
//   contratante convida vendedor (link de definir senha) → vendedor opera →
//   trial vence → contratante cai no pré-checkout → pagamento ativa a conta.
// Invariantes verificadas em cada passo: vendedor NUNCA recebe campo de
// cobrança, nunca recebe destino de checkout e não toma 403 em navegação
// normal (board/Radar liberados por default — D.1/D.2/D.4).
//
// Passos externos ao backend são simulados na borda real deles:
// - o "clique no link do e-mail" injeta o token hasheado direto na tabela
//   PasswordReset (mesmo artefato que o e-mail carrega);
// - a "ativação pós-checkout" grava o estado único como o webhook de
//   pagamento gravaria (escritor nativo da Fase A.3).

const API = "http://localhost:3000";

function sql(query: string) {
  // SQL via stdin para não depender do quoting do shell (Windows/cmd).
  return execSync("docker compose exec -T db psql -U admin -d jhonatan_dev -t -A", {
    cwd: process.cwd(),
    encoding: "utf8",
    input: `${query};`,
  }).trim();
}

function backendAvailable() {
  try {
    execSync("docker compose exec -T db pg_isready -U admin -d jhonatan_dev", {
      cwd: process.cwd(),
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

async function login(request: APIRequestContext, username: string, password: string) {
  const response = await request.post(`${API}/auth/login`, {
    data: { username, password, forceSession: true },
  });
  expect(response.status(), `login de ${username}`).toBe(201);
  return response.json() as Promise<{ access_token: string; next: string; requiresCheckout: boolean }>;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function expectNoBillingWords(payload: unknown, context: string) {
  const text = JSON.stringify(payload).toLowerCase();
  for (const word of ["cobrança", "cobranca", "pagamento em atraso", "checkout", "r$"]) {
    expect(text.includes(word), `${context} não pode carregar texto de cobrança ("${word}")`).toBe(false);
  }
}

test.describe("fluxo completo: contratante → trial → vendedor → expiração → ativação", () => {
  test.skip(!backendAvailable(), "Stack local (docker compose db/backend) não está de pé.");

  test("vendedor opera sem 403 e sem ver cobrança em nenhum estado da empresa", async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Fluxo de API roda uma vez só.");
    test.setTimeout(120_000);

    const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const adminEmail = `e2e-dono-${stamp}@hbx.test`;
    const sellerEmail = `e2e-vendedor-${stamp}@hbx.test`;
    const password = "SenhaForte#2026";
    const phone = `159${stamp.slice(-8)}`;

    // 1. Cadastro self-service (Lead Plus = único plano com trial).
    const signup = await request.post(`${API}/auth/signup`, {
      data: {
        companyName: `Empresa E2E ${stamp}`,
        name: "Dono E2E",
        email: adminEmail,
        password,
        selectedPlanKey: "hbx_padrao",
        trialModuleSelection: "vendas",
        trialContactName: "Dono E2E",
        trialTaxDocument: "52998224725",
        trialContactPhone: phone,
        acceptedTerms: true,
      },
    });
    expect(signup.ok(), `signup falhou: ${await signup.text()}`).toBe(true);

    // 2. 1º login do contratante: no fluxo mock local confirma o e-mail e a
    //    máquina nativa inicia o trial (C.1). Gate manda para o dashboard.
    const adminLogin = await login(request, adminEmail, password);
    expect(adminLogin.next).toBe("/dashboard");
    expect(adminLogin.requiresCheckout).toBe(false);

    const adminProfile = await (await request.get(`${API}/profile/current-user`, {
      headers: authHeaders(adminLogin.access_token),
    })).json();
    expect(adminProfile.userKind).toBe("admin");
    expect(["trial", "trial_ending"]).toContain(adminProfile.company.accessState);
    const companyId = Number(adminProfile.company.id);
    expect(companyId).toBeGreaterThan(0);

    // 3. Contratante convida o vendedor (nasce sem senha + link — C.3).
    const sellerCreate = await request.post(`${API}/users/company/create`, {
      headers: authHeaders(adminLogin.access_token),
      data: { email: sellerEmail, name: "Vendedor E2E", role: "USER" },
    });
    expect(sellerCreate.ok(), `convite falhou: ${await sellerCreate.text()}`).toBe(true);
    const sellerPayload = await sellerCreate.json();
    const sellerId = Number(sellerPayload.user?.id);
    expect(sellerId).toBeGreaterThan(0);

    // 4. "Clique no link do e-mail": injeta o token hasheado e define a senha
    //    (o reset confirma o e-mail do convidado — C.1c).
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    sql(
      `INSERT INTO "PasswordReset" ("token", "userId", "used", "expiresAt") ` +
        `VALUES ('${tokenHash}', ${sellerId}, false, NOW() + interval '1 day')`,
    );
    const reset = await request.post(`${API}/auth/reset-password`, {
      data: { token: rawToken, password },
    });
    expect(reset.ok(), `definir senha falhou: ${await reset.text()}`).toBe(true);

    // 5. Login do vendedor cai DIRETO em Vendas (D.2), sem flag de checkout.
    const sellerLogin = await login(request, sellerEmail, password);
    expect(sellerLogin.next).toBe("/vendas");
    expect(sellerLogin.requiresCheckout).toBe(false);

    // 6. Vendedor opera: board e Radar respondem sem 403 (D.1/D.4).
    const sellerHeaders = authHeaders(sellerLogin.access_token);
    const board = await request.get(`${API}/vendas/board`, { headers: sellerHeaders });
    expect(board.status(), "board do Vendas para o vendedor").toBe(200);
    const radarLatest = await request.get(`${API}/webscraping/radar/search-runs/latest`, {
      headers: sellerHeaders,
    });
    expect(radarLatest.status(), "Radar liberado por default para o vendedor").toBe(200);

    // 7. Vendedor NÃO recebe nenhum campo de cobrança (D.4). Pós-DROP os
    //    campos crus nem existem no payload (undefined) — ausente ou nulo,
    //    nunca com valor.
    const sellerProfile = await (await request.get(`${API}/profile/current-user`, {
      headers: sellerHeaders,
    })).json();
    expect(sellerProfile.userKind).toBe("seller");
    expect(sellerProfile.company.accessReleased).toBe(true);
    for (const field of [
      "accessState",
      "paymentStatus",
      "subscriptionStatus",
      "premiumAccess",
      "selectedPlanKey",
      "trialEndsAt",
      "trialRemainingDays",
      "billingGraceEndsAt",
      "billingGraceReason",
      "plan",
    ]) {
      expect(sellerProfile.company[field] ?? null, `company.${field} não pode chegar ao vendedor`).toBeNull();
    }

    const sellerOperational = await (await request.get(`${API}/companies/me/operational-status`, {
      headers: sellerHeaders,
    })).json();
    const chipKeys = (sellerOperational.statuses || []).map((chip: any) => chip.key);
    expect(chipKeys).not.toContain("payment");
    const accessChip = (sellerOperational.statuses || []).find((chip: any) => chip.key === "access");
    expect(accessChip?.value).toBe("Liberado");
    expectNoBillingWords(accessChip, "chip de acesso do vendedor");

    const sellerPlans = await (await request.get(`${API}/commercial-plans/me`, {
      headers: sellerHeaders,
    })).json();
    expect(sellerPlans.current.accessState ?? null, "estado de cobrança não chega ao vendedor").toBeNull();
    expect(sellerPlans.current.paymentStatus ?? null, "campo cru morto no DROP").toBeNull();
    expect(sellerPlans.current.billingBreakdown ?? null).toBeNull();
    expect(sellerPlans.permissions.canSelectPlan).toBe(false);
    for (const plan of sellerPlans.plans || []) {
      expect(plan.monthlyPrice, "vendedor não vê preço de plano").toBeNull();
    }

    // 8. Trial vence (data no passado; o estado único decide por datas — A.2).
    sql(`UPDATE "Company" SET "trialEndsAt" = NOW() - interval '1 day' WHERE id = ${companyId}`);

    // Contratante cai no pré-checkout com o motivo certo (C.1b)...
    const adminAfterExpiry = await login(request, adminEmail, password);
    expect(adminAfterExpiry.next).toBe("/pre-checkout?reason=trial_expired");
    expect(adminAfterExpiry.requiresCheckout).toBe(true);

    // ...e o vendedor continua SEM destino nem flag de cobrança (D.2/D.4).
    const sellerAfterExpiry = await login(request, sellerEmail, password);
    expect(sellerAfterExpiry.next).toBe("/vendas");
    expect(sellerAfterExpiry.requiresCheckout).toBe(false);

    const sellerExpiredHeaders = authHeaders(sellerAfterExpiry.access_token);
    const sellerExpiredProfile = await (await request.get(`${API}/profile/current-user`, {
      headers: sellerExpiredHeaders,
    })).json();
    expect(sellerExpiredProfile.company.accessReleased).toBe(false);
    expect(sellerExpiredProfile.company.accessState ?? null).toBeNull();
    expect(sellerExpiredProfile.company.paymentStatus ?? null).toBeNull();

    const sellerExpiredOperational = await (await request.get(`${API}/companies/me/operational-status`, {
      headers: sellerExpiredHeaders,
    })).json();
    const expiredAccessChip = (sellerExpiredOperational.statuses || []).find((chip: any) => chip.key === "access");
    expect(expiredAccessChip?.value).toBe("Pausado");
    expectNoBillingWords(expiredAccessChip, "chip de acesso pausado do vendedor");
    expectNoBillingWords(
      { hint: sellerExpiredOperational.summary?.overallHint, reason: sellerExpiredOperational.summary?.accessReason },
      "resumo operacional do vendedor",
    );

    // Bloqueio operacional do vendedor é neutro: 403 de módulo, sem motivo
    // financeiro (presentModuleBlockForRole).
    const expiredBoard = await request.get(`${API}/vendas/board`, { headers: sellerExpiredHeaders });
    expect(expiredBoard.status()).toBe(403);
    expectNoBillingWords(await expiredBoard.json(), "bloqueio do board para o vendedor");

    // 9. Checkout concluído: o pagamento ativa a conta (escrita do estado
    //    único como o escritor nativo do financeiro — A.3).
    sql(
      `UPDATE "Company" SET "status" = 'active', "isActive" = true, ` +
        `"statusChangedAt" = NOW() WHERE id = ${companyId}`,
    );
    sql(`UPDATE "CompanyModule" SET "enabled" = true WHERE "companyId" = ${companyId}`);

    const adminActive = await login(request, adminEmail, password);
    expect(adminActive.next).toBe("/dashboard");
    expect(adminActive.requiresCheckout).toBe(false);

    const sellerActive = await login(request, sellerEmail, password);
    expect(sellerActive.next).toBe("/vendas");
    const activeBoard = await request.get(`${API}/vendas/board`, {
      headers: authHeaders(sellerActive.access_token),
    });
    expect(activeBoard.status(), "board liberado após ativação").toBe(200);
  });

  test("master cria empresa → convite → contratante define senha e cai no checkout pendente", async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Fluxo de API roda uma vez só.");
    test.setTimeout(120_000);

    // Credenciais do master existem só no env do container (nada commitado).
    const masterUsername = execSync("docker compose exec -T backend printenv SYSTEM_MASTER_USERNAME", {
      cwd: process.cwd(),
      encoding: "utf8",
    }).trim();
    const masterPassword = execSync("docker compose exec -T backend printenv SYSTEM_MASTER_PASSWORD", {
      cwd: process.cwd(),
      encoding: "utf8",
    }).trim();
    test.skip(!masterUsername || !masterPassword, "Master local não configurado.");

    const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const contratanteEmail = `e2e-contratante-${stamp}@hbx.test`;
    const password = "SenhaForte#2026";

    // 1. Master entra no master puro e cria a empresa com o contato do
    //    contratante (B.6/C.1c): nasce pending_checkout + ADMIN sem senha.
    const masterLogin = await login(request, masterUsername, masterPassword);
    expect(masterLogin.next).toBe("/dashboard/master");

    const createCompany = await request.post(`${API}/companies/master`, {
      headers: authHeaders(masterLogin.access_token),
      data: {
        name: `Empresa Master E2E ${stamp}`,
        contactName: "Contratante E2E",
        contactEmail: contratanteEmail,
      },
    });
    expect(createCompany.ok(), `criação pelo master falhou: ${await createCompany.text()}`).toBe(true);
    const createdCompany = await createCompany.json();
    const companyId = Number(createdCompany.id);
    expect(companyId).toBeGreaterThan(0);
    expect(createdCompany.invite?.email).toBe(contratanteEmail);

    // 2. "Clique no link do convite": injeta token e o contratante define a
    //    senha (o reset confirma o e-mail — C.1c).
    const adminId = Number(sql(`SELECT id FROM "User" WHERE email = '${contratanteEmail}'`));
    expect(adminId).toBeGreaterThan(0);
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    sql(
      `INSERT INTO "PasswordReset" ("token", "userId", "used", "expiresAt") ` +
        `VALUES ('${tokenHash}', ${adminId}, false, NOW() + interval '1 day')`,
    );
    const reset = await request.post(`${API}/auth/reset-password`, {
      data: { token: rawToken, password },
    });
    expect(reset.ok(), `definir senha do contratante falhou: ${await reset.text()}`).toBe(true);

    // 3. Login do contratante: empresa criada pelo master fica em checkout
    //    pendente até concluir a contratação (gate canônico C.1b).
    const adminPending = await login(request, contratanteEmail, password);
    expect(adminPending.next).toBe("/pre-checkout?reason=pending_checkout");
    expect(adminPending.requiresCheckout).toBe(true);

    // 4. Checkout concluído (escrita do estado único como o financeiro grava).
    sql(
      `UPDATE "Company" SET "status" = 'active', "isActive" = true, ` +
        `"selectedPlanKey" = 'hbx_padrao', "statusChangedAt" = NOW() WHERE id = ${companyId}`,
    );

    const adminActive = await login(request, contratanteEmail, password);
    expect(adminActive.next).toBe("/dashboard");
    expect(adminActive.requiresCheckout).toBe(false);
  });
});
