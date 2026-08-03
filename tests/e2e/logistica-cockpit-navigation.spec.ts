import { expect, test } from "@playwright/test";

import { injectToken, setupCommonMocks } from "./helpers/app-mocks";

// O service worker de produção não participa desta vacina de interface. Se ele
// atender a chamada antes do Playwright, a tela recebe o 401 do backend real e
// o teste mede a landing em vez do cockpit.
test.use({ serviceWorkers: "block" });

const json = (body: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

test("Hoje, Semana e Endereços permanecem no mesmo cockpit", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await setupCommonMocks(page);

  await page.route("**/hbx/api/logistica/rota", (route) => route.fulfill(json({
    date: "2026-08-03",
    total: 0,
    effectsEnabled: false,
    items: [],
  })));
  await page.route("**/hbx/api/logistica/resumo-dia**", (route) => route.fulfill(json({
    date: "2026-08-03",
    entregues: 0,
    recebidoHoje: 0,
    aReceber: 0,
  })));
  await page.route("**/hbx/api/logistica/entregadores**", (route) => route.fulfill(json([
    { id: 1, nome: "Ana Souza", email: "ana@teste.local" },
  ])));
  await page.route("**/hbx/api/logistica/rota-avisos**", (route) => route.fulfill(json([])));
  await page.route("**/hbx/api/logistica/rota-indicadas**", (route) => route.fulfill(json([])));
  await page.route("**/hbx/api/logistica/recados-nao-lidos**", (route) => route.fulfill(json({})));
  await page.route("**/hbx/api/logistica/tracking/live**", (route) => route.fulfill(json({ routes: [] })));
  await page.route("**/hbx/api/logistica/base-saude**", (route) => route.fulfill(json({
    totalClientes: 1,
    verdes: 0,
    amarelos: 0,
    vermelhos: 1,
    resolvemSozinhos: 0,
    percentVerde: 0,
    clientes: [{
      id: "cliente-1",
      nome: "Cliente sem pino",
      semaforo: "vermelho",
      motivos: ["sem_pino"],
      localId: null,
      localApelido: null,
      resolveSozinho: false,
    }],
  })));
  await page.route("**/hbx/api/logistica/agenda**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const migracao = { necessaria: false, totalVinculos: 0, totalPlanosProjetados: 0, avisos: [] };
    if (/\/agenda\/dias\/\d+$/.test(path)) {
      return route.fulfill(json({
        modo: "V2",
        agendaV2Ativa: true,
        migracao,
        diaSemana: 1,
        nome: "Segunda",
        ativo: false,
        rota: null,
        planos: [],
        paradas: [],
        totais: { planos: 0, paradas: 0, clientes: 0, itens: 0 },
        avisos: [],
      }));
    }
    if (path.endsWith("/agenda")) {
      return route.fulfill(json({ modo: "V2", agendaV2Ativa: true, migracao, dias: [] }));
    }
    return route.fulfill(json({ total: 0, itens: [], avisos: [] }));
  });

  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await injectToken(page);
  await page.evaluate(() => {
    localStorage.setItem("hbx:rail", "expanded");
    localStorage.setItem("hbx:costas", "1");
  });
  await page.goto("/logistica", { waitUntil: "domcontentloaded" });

  const cockpitNav = page.getByRole("tablist", { name: "Visão da logística" });
  await expect(cockpitNav).toHaveCount(1);
  await expect(cockpitNav.getByRole("tab", { name: "Hoje" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Expandir menu" })).toBeVisible();

  const palco = page.getByRole("region", { name: "Operação de hoje" });
  const mapa = palco.getByLabel("Mapa das paradas de hoje");
  await expect(mapa).toBeVisible();
  const medidas = await page.evaluate(() => {
    const el = document.querySelector(".cok__mapa");
    return {
      alturaMapa: el?.getBoundingClientRect().height ?? 0,
      pagina: document.documentElement.scrollHeight,
      viewport: document.documentElement.clientHeight,
    };
  });
  expect(medidas.alturaMapa).toBeGreaterThan(300);
  expect(medidas.pagina).toBe(medidas.viewport);

  const medirPele = (modo: "light" | "dark") => page.evaluate((themeMode) => {
    document.documentElement.setAttribute("data-theme-mode", themeMode);
    const nav = document.querySelector(".log-admin-shell__nav");
    const style = nav ? getComputedStyle(nav) : null;
    return {
      background: style?.backgroundColor ?? "",
      border: style?.borderBottomColor ?? "",
    };
  }, modo);
  const peleClara = await medirPele("light");
  const peleEscura = await medirPele("dark");
  expect(peleClara.background).not.toBe(peleEscura.background);
  expect(peleClara.border).not.toBe("rgba(0, 0, 0, 0)");
  expect(peleEscura.border).not.toBe("rgba(0, 0, 0, 0)");

  await cockpitNav.getByRole("tab", { name: "Semana" }).click();
  await expect(cockpitNav.getByRole("tab", { name: "Semana" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Expandir menu" })).toBeVisible();
  await expect(page.locator(".costas")).toHaveCount(0);

  await cockpitNav.getByRole("tab", { name: "Endereços" }).click();
  await expect(cockpitNav.getByRole("tab", { name: "Endereços" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Endereços que precisam de atenção" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Expandir menu" })).toBeVisible();

  await cockpitNav.getByRole("tab", { name: "Hoje" }).click();
  await expect(cockpitNav.getByRole("tab", { name: "Hoje" })).toHaveAttribute("aria-selected", "true");
  await expect(palco).toBeVisible();
});
