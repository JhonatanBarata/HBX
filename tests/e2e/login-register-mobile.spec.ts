import { expect, test } from "@playwright/test";

test.describe("login e cadastro mobile", () => {
  test("login mobile exibe a esteira HBX e mantém o formulário acessível", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Fluxo validado no viewport mobile.");

    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Sua Esteira de Leads até Vendas" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Entrar no HBX" })).toBeVisible();
    await expect(page.getByText("Inteligência que vende")).toHaveCount(0);
    await expect(page.getByText("Entre na sua conta para continuar")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Esqueci minha senha" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Criar Conta" })).toBeVisible();

    await page.getByLabel("E-mail").fill("teste@teste.com");
    await page.getByLabel("Senha").fill("12345678");
    await page.getByRole("button", { name: "Entrar" }).click();

    const authBridge = page.locator(".login-authBridge");
    await expect(authBridge).toBeHidden();
  });

  test("cadastro mobile passa pelo funil único de planos e abre o Lead trial", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Fluxo validado no viewport mobile.");

    const email = `codex-${Date.now()}@teste.com`;
    await page.route("**/auth/signup", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          pendingEmailConfirmation: true,
          email,
          message: `Enviamos um link de confirmação para ${email}.`,
          confirmationPollToken: "poll-token-test",
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

    await page.goto("/register");
    await expect(page).toHaveURL(/\?ver=planos/);
    await expect(page.getByRole("button", { name: /^2 meses grátis no anual HBX List/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /HBX Lead 14 dias grátis/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^HBX Implantação/ })).toBeVisible();

    await page.goto("/register?plan=hbx_padrao");
    await page.getByLabel("Empresa", { exact: true }).fill("Empresa Codex Mobile");
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByLabel("Como deseja ser chamado?", { exact: true }).fill("Atendente Codex");
    await page.getByRole("textbox", { name: "Senha", exact: true }).fill("12345678");
    await page.getByRole("textbox", { name: "Confirmar senha", exact: true }).fill("12345678");
    await page.getByRole("button", { name: "Começar teste grátis" }).click();

    await expect(page.getByRole("heading", { name: "HBX Lead — Aguardando confirmação" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Antes de liberar seus 14 dias" })).toHaveCount(0);
  });
});
