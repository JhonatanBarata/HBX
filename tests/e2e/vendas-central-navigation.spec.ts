import { expect, test, type Locator, type Page } from "@playwright/test";

import { injectToken, setupCommonMocks } from "./helpers/app-mocks";

async function contrasteDoBotao(botao: Locator): Promise<number> {
  return botao.evaluate((elemento) => {
    const estilo = getComputedStyle(elemento);
    const rgb = (valor: string) => {
      // As peles usam OKLCH; Chromium preserva esse formato no computedStyle.
      // Forçar um color-mix em sRGB entrega `color(srgb r g b)`, que pode ser
      // medido sem reimplementar a conversão de espaço de cor no teste.
      const prova = document.createElement("span");
      prova.style.color = `color-mix(in srgb, ${valor} 100%, transparent)`;
      document.body.appendChild(prova);
      const normalizado = getComputedStyle(prova).color;
      prova.remove();
      const partes = normalizado.match(/[\d.]+/g)?.slice(0, 3).map(Number) || [0, 0, 0];
      const canais = normalizado.startsWith("color(srgb")
        ? partes.map((canal) => canal * 255)
        : partes;
      return canais.map((canal) => {
        const normalizado = canal / 255;
        return normalizado <= 0.04045
          ? normalizado / 12.92
          : ((normalizado + 0.055) / 1.055) ** 2.4;
      });
    };
    const luminancia = (valor: string) => {
      const [r, g, b] = rgb(valor);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const frente = luminancia(estilo.color);
    const fundo = luminancia(estilo.backgroundColor);
    return (Math.max(frente, fundo) + 0.05) / (Math.min(frente, fundo) + 0.05);
  });
}

async function abrirVendas(page: Page, modo: "light" | "dark") {
  await page.setViewportSize({ width: 1896, height: 922 });
  await setupCommonMocks(page);
  await page.addInitScript((temaModo) => {
    localStorage.setItem("hbx:casca", "backup");
    localStorage.setItem("hbx:tema", "corporativa");
    localStorage.setItem("hbx:mode", temaModo);
  }, modo);
  await page.goto("/login");
  await injectToken(page);
  await page.goto("/vendas");
  await expect(page.locator("#vnd-row-lead-today-0")).toBeVisible();
}

for (const modo of ["light", "dark"] as const) {
  test(`Central do Lead navega sem circular e ocupa o vão — ${modo}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Cena exclusiva de desktop.");
    await abrirVendas(page, modo);
    const quantidadeVisivel = await page.locator("[id^='vnd-row-']").count();
    expect(quantidadeVisivel).toBeGreaterThan(1);

    await page.locator("#vnd-row-lead-today-0 button[aria-label='Abrir ficha completa']").click();

    const ficha = page.getByRole("dialog", { name: /Central do lead/ });
    const anterior = page.getByRole("button", { name: /Lead anterior:/ });
    const proximo = page.getByRole("button", { name: /Próximo lead:/ });
    await expect(ficha).toBeVisible();

    // Primeiro lead: só existe próximo. A ausência do botão é o próprio
    // freio — não há disabled nem caminho circular pro último.
    await expect(anterior).toHaveCount(0);
    await expect(proximo).toHaveCount(1);
    expect(await contrasteDoBotao(proximo)).toBeGreaterThanOrEqual(4.5);

    await proximo.click();
    await expect(ficha).toHaveAttribute("aria-label", /COMERCIAL DE ALIMENTOS/);
    await expect(anterior).toHaveCount(1);
    await expect(proximo).toHaveCount(1);

    // No miolo, as setas ficam inteiras no vão externo — nenhuma cobre a ficha.
    const caixaFicha = await ficha.boundingBox();
    const caixaAnterior = await anterior.boundingBox();
    const caixaProximo = await proximo.boundingBox();
    expect(caixaFicha).not.toBeNull();
    expect(caixaAnterior).not.toBeNull();
    expect(caixaProximo).not.toBeNull();
    expect(caixaAnterior!.x + caixaAnterior!.width).toBeLessThanOrEqual(caixaFicha!.x + 1);
    expect(caixaProximo!.x).toBeGreaterThanOrEqual(caixaFicha!.x + caixaFicha!.width - 1);

    // Percorre até o último sem usar índice mágico: o teste acompanha a lista
    // mockada e grita se a seta reaparecer no fim ou reiniciar no primeiro.
    // Primeiro e segundo já foram vistos nas asserções acima.
    let quantidadeVisitada = 2;
    for (let seguranca = 0; seguranca < 20 && await proximo.count(); seguranca++) {
      await proximo.click();
      quantidadeVisitada++;
    }
    expect(quantidadeVisitada).toBe(quantidadeVisivel);
    await expect(proximo).toHaveCount(0);
    await expect(anterior).toHaveCount(1);

    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  });
}
