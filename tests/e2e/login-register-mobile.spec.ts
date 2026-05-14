import { expect, test } from "@playwright/test";

test.describe("login e cadastro mobile", () => {
  test("login mobile mantém um HBX e remove copy antiga", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Fluxo validado no viewport mobile.");

    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Automação que conecta." })).toBeVisible();
    await expect(page.getByText("Inteligência que vende")).toHaveCount(0);
    await expect(page.getByText("Entre na sua conta para continuar")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Esqueci minha senha" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Criar conta" })).toBeVisible();

    await page.getByLabel("E-mail").fill("teste@teste.com");
    await page.getByLabel("Senha").fill("12345678");
    await page.getByRole("button", { name: "Entrar" }).click();

    const authBridge = page.locator(".login-authBridge");
    await expect(authBridge).toBeHidden();
  });

  test("cadastro mobile mostra List pago, Lead trial e plano empresarial como notebook", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Fluxo validado no viewport mobile.");

    await page.goto("/register?from=login&start=form");

    const email = `codex-${Date.now()}@teste.com`;
    await page.getByLabel("Empresa").fill("Empresa Codex Mobile");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Nome do atendente/vendedor").fill("Atendente Codex");
    await page.getByRole("textbox", { name: "Senha", exact: true }).fill("12345678");
    await page.getByRole("textbox", { name: "Confirmar senha", exact: true }).fill("12345678");
    await page.getByRole("button", { name: "Continuar para planos" }).click();
    await page.route("**/auth/signup", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          status: "pending_email_confirmation",
          email,
          companyName: "Empresa Codex Mobile",
          selectedPlanKey: "hbx_padrao",
          confirmationPollToken: "poll-token-test",
          canResendConfirmation: true,
          delivery: { failed: false },
        }),
      });
    });
    await page.route("**/auth/email-confirmation-status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, status: "pending_email_confirmation", confirmed: false, email }),
      });
    });

    const plans = page.locator("section[aria-label='Planos']");
    await expect(plans).toBeVisible();
    await expect(plans.getByRole("button", { name: /^HBX List/ })).toBeVisible();
    await expect(plans.getByRole("button", { name: /^HBX Lead/ })).toBeVisible();
    await expect(plans.getByText(/R\$\s*49,90/)).toBeVisible();
    await expect(plans.getByText("R$ 0,00")).toHaveCount(1);
    await expect(plans.getByText(/Após 14 dias/)).toHaveCount(1);
    await expect(plans.getByRole("button", { name: /^Modo empresarial/ })).toBeVisible();
    await expect(plans.getByText("Somente notebook/desktop")).toBeVisible();
    await expect(plans.getByText("R$ 149,90")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Montar plano empresarial no WhatsApp" })).toBeVisible();

    await plans.getByRole("button", { name: /^HBX Lead/ }).click();
    await expect(page.getByRole("heading", { name: "Aguardando confirmação de email" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Antes de liberar seus 14 dias" })).toHaveCount(0);
  });
});
