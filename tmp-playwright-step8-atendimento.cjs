const { chromium } = require("@playwright/test");

const frontendUrl = (process.env.HBX_FRONTEND_URL || "http://localhost:3001").replace(/\/+$/, "");
const backendUrl = (process.env.HBX_BACKEND_URL || "http://localhost:3000").replace(/\/+$/, "");
const username = process.env.HBX_LOGIN_USER;
const password = process.env.HBX_LOGIN_PASS;
const label = process.env.HBX_RUN_LABEL || "local";

if (!username || !password) {
  throw new Error("HBX_LOGIN_USER/HBX_LOGIN_PASS ausentes.");
}

async function login(request) {
  const response = await request.post(`${backendUrl}/auth/login`, {
    data: { username, password, forceSession: true },
    timeout: 20000,
  });
  const text = await response.text();
  if (!response.ok()) {
    throw new Error(`Login falhou em ${label}: HTTP ${response.status()} ${text.slice(0, 160)}`);
  }
  const payload = JSON.parse(text);
  const token = payload.token || payload.access_token || payload.accessToken;
  if (!token) throw new Error(`Login sem token em ${label}.`);
  return String(token);
}

async function safeClick(locator, timeout = 3500) {
  try {
    await locator.first().click({ timeout });
    return true;
  } catch {
    return false;
  }
}

async function countQueueItems(page) {
  return page.locator('[class*="conversationQueueItem"]').count().catch(() => 0);
}

async function waitForAtendimento(page, report) {
  const queueTab = page.getByRole("tab", { name: /Pessoais|Atendimento|Prospecção|Encerrado/i }).first();
  const shell = page.locator('[class*="premiumInboxShell"]').first();

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await page.goto(`${frontendUrl}/atendimento`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await Promise.race([
      queueTab.waitFor({ state: "visible", timeout: 30000 }),
      shell.waitFor({ state: "visible", timeout: 30000 }),
    ]).catch(() => undefined);

    const currentUrl = page.url();
    const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    if (/\/atendimento(?:[?#]|$)/.test(currentUrl) && /Pessoais|Atendimento|Prospecção|WhatsApp/i.test(bodyText)) {
      return { currentUrl, bodyText };
    }

    report.notes.push(`Atendimento nao estabilizou na tentativa ${attempt}: ${currentUrl}`);
    await page.waitForTimeout(1200);
  }

  return {
    currentUrl: page.url(),
    bodyText: await page.locator("body").innerText({ timeout: 5000 }).catch(() => ""),
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1498, height: 869 } });
  const token = await login(context.request);
  await context.addInitScript((value) => {
    window.localStorage.setItem("token", value);
  }, token);

  const page = await context.newPage();
  const report = {
    label,
    frontendUrl,
    backendUrl,
    checks: {},
    notes: [],
    console: [],
    pageErrors: [],
    screenshots: [],
  };

  page.on("console", (message) => {
    const type = message.type();
    if (["error", "warning"].includes(type)) {
      report.console.push({ type, text: message.text().slice(0, 500) });
    }
  });
  page.on("pageerror", (error) => {
    report.pageErrors.push(String(error?.stack || error?.message || error).slice(0, 1000));
  });

  const initial = await waitForAtendimento(page, report);
  report.checks.currentUrl = initial.currentUrl;
  await page.screenshot({ path: `tmp-playwright-step8-${label}-home.png`, fullPage: true });
  report.screenshots.push(`tmp-playwright-step8-${label}-home.png`);

  const bodyText = initial.bodyText;
  report.checks.loadedAtendimento = /Atendimento|WhatsApp|Pessoais|Prospecção/.test(bodyText);
  report.checks.noLoginRedirect = !/Entrar|Login|senha/i.test(bodyText.slice(0, 1200));

  const expectedTabs = ["Pessoais", "Atendimento", "Prospecção", "Grupos", "Encerrado"];
  report.checks.queueTabs = {};
  for (const tab of expectedTabs) {
    report.checks.queueTabs[tab] = await page.getByRole("tab", { name: new RegExp(tab, "i") }).count().then((n) => n > 0).catch(() => false);
  }

  const beforeBlockedCount = await countQueueItems(page);
  await safeClick(page.getByTitle(/Bloqueados/i));
  await page.waitForTimeout(1800);
  const afterBlockedCount = await countQueueItems(page);
  await page.screenshot({ path: `tmp-playwright-step8-${label}-blocked.png`, fullPage: true });
  report.screenshots.push(`tmp-playwright-step8-${label}-blocked.png`);
  report.checks.blockedClickDoesNotCrash = await page.locator("body").innerText().then((text) => !/Ocorreu um erro|Unhandled|Application error/i.test(text)).catch(() => false);
  report.checks.blockedQueueObserved = { beforeBlockedCount, afterBlockedCount };

  const archivedTab = page.getByRole("tab", { name: /Encerrado/i });
  await safeClick(archivedTab);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `tmp-playwright-step8-${label}-archived.png`, fullPage: true });
  report.screenshots.push(`tmp-playwright-step8-${label}-archived.png`);
  const archivedText = await page.locator("body").innerText().catch(() => "");
  report.checks.archivedTabVisible = await archivedTab.count().then((n) => n > 0).catch(() => false);
  report.checks.archivedPhone1978154334Visible = archivedText.includes("97815-4334") || archivedText.includes("1978154334");

  const search = page.getByRole("searchbox", { name: /Buscar conversa/i });
  if (await search.count().catch(() => 0)) {
    await search.fill("97815-4334");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `tmp-playwright-step8-${label}-archived-phone.png`, fullPage: true });
    report.screenshots.push(`tmp-playwright-step8-${label}-archived-phone.png`);
    const phoneSearchText = await page.locator("body").innerText().catch(() => "");
    report.checks.archivedPhoneSearchVisible = phoneSearchText.includes("97815-4334") || phoneSearchText.includes("1978154334");
    await search.fill("");
  }

  await safeClick(page.getByRole("tab", { name: /Pessoais/i }));
  await page.waitForTimeout(1500);
  const avatarButton = page.getByRole("button", { name: /Abrir foto do contato/i });
  const avatarCount = await avatarButton.count().catch(() => 0);
  report.checks.contactPhotoButtonPresent = avatarCount > 0;
  if (avatarCount > 0 && await avatarButton.first().isEnabled().catch(() => false)) {
    await avatarButton.first().click();
    await page.waitForTimeout(800);
    report.checks.contactPhotoLightboxOpens = await page.getByRole("dialog", { name: /Visualizador de imagem/i }).count().then((n) => n > 0).catch(() => false);
    await page.keyboard.press("Escape").catch(() => undefined);
  } else {
    report.notes.push("Contato selecionado sem avatar; botao de foto ficou desabilitado.");
    report.checks.contactPhotoLightboxOpens = null;
  }

  const operatorButton = page.getByRole("button", { name: /Operador/i });
  report.checks.operatorButtonPresent = await operatorButton.count().then((n) => n > 0).catch(() => false);
  await safeClick(operatorButton);
  await page.waitForTimeout(700);
  const statusDialogVisible = await page.getByText("Meu status").count().then((n) => n > 0).catch(() => false);
  report.checks.operatorStatusDialogOpens = statusDialogVisible;
  if (statusDialogVisible) {
    await page.locator("select").selectOption("ocupado").catch(() => undefined);
    await page.getByPlaceholder(/disponível para atendimento/i).fill("Ocupado em validação Playwright").catch(() => undefined);
    await safeClick(page.getByRole("button", { name: /Salvar status/i }));
    await page.waitForTimeout(700);
    await safeClick(operatorButton);
    await page.waitForTimeout(500);
    const dialogText = await page.locator('[role="dialog"]').last().innerText().catch(() => "");
    report.checks.operatorStatusPersists = /Ocupado em validação Playwright|ocupado/i.test(dialogText);
    await page.keyboard.press("Escape").catch(() => undefined);
  }

  const allText = await page.locator("body").innerText().catch(() => "");
  report.checks.presenceBadgeRendered = /presença|online agora|digitando|visto/i.test(allText);
  const timerText = await page.locator("body").innerText().catch(() => "");
  report.checks.hhmmssTimerRendered = /\b\d{2}:\d{2}:\d{2}\b/.test(timerText);
  if (!report.checks.hhmmssTimerRendered) {
    report.notes.push("Nenhum contador de proxima prospeccao estava renderizado no momento do smoke.");
  }

  report.checks.finalUrlBeforeScreenshot = page.url();
  if (!/\/atendimento(?:[?#]|$)/.test(page.url())) {
    report.notes.push(`URL final saiu do Atendimento antes da captura: ${page.url()}`);
    await waitForAtendimento(page, report);
  }

  await page.screenshot({ path: `tmp-playwright-step8-${label}-final.png`, fullPage: true });
  report.screenshots.push(`tmp-playwright-step8-${label}-final.png`);
  require("fs").writeFileSync(`tmp-playwright-step8-${label}-report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
