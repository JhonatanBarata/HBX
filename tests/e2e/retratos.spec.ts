/**
 * RETRATOS — as telas que dão dinheiro, nos 2 padrões e nos 2 modos.
 *
 * Não é teste: é o olho. O fiscal de corte (design-system.spec.ts) responde
 * "sumiu alguma coisa?" com número, o que é a pergunta certa para a máquina.
 * Ele não responde "ficou bonito?" — e essa pergunta continua sendo humana.
 *
 * Roda sob demanda, escreve em visual-check/hbx-system/ e não reprova nada:
 *   npx playwright test retratos --project=chromium
 */

import fs from "node:fs";
import path from "node:path";

import { test } from "@playwright/test";

import { injectToken, setupCommonMocks } from "./helpers/app-mocks";

const DESTINO = path.join(process.cwd(), "visual-check/hbx-system");

const PADROES = [
  { casca: "backup", tema: "aurora", rotulo: "premium" },
  { casca: "corporativa", tema: "corporativa", rotulo: "corporativo" },
] as const;

/** Varredura de cor: a mesma tela, as 6 paletas, para escolher no olho. */
const CORES = ["aurora", "hbx-cyber", "corporativa", "rose", "ember", "login"] as const;

const CENAS = [
  { rota: "/vendas", largura: 1366 },
  { rota: "/vendas", largura: 1920 },
  { rota: "/conversas", largura: 1366 },
  { rota: "/logistica", largura: 1366 },
];

test.describe("retratos", () => {
  for (const padrao of PADROES) {
    for (const modo of ["light", "dark"] as const) {
      for (const cena of CENAS) {
        // Escuro só na largura de referência: o objetivo é conferir a PELE, e
        // repetir as 3 larguras no escuro dobraria o tempo sem mostrar nada
        // novo (o que muda com a largura já está retratado no claro).
        if (modo === "dark" && cena.largura !== 1366) continue;

        const nome = `${cena.rota.slice(1)}-${padrao.rotulo}-${modo}-${cena.largura}`;

        test(nome, async ({ page }, testInfo) => {
          test.skip(testInfo.project.name !== "chromium", "Retrato de desktop.");
          fs.mkdirSync(DESTINO, { recursive: true });

          await page.setViewportSize({ width: cena.largura, height: 900 });
          await setupCommonMocks(page);
          await page.addInitScript(
            ({ casca, tema, modo: m }) => {
              window.localStorage.setItem("hbx:casca", casca);
              window.localStorage.setItem("hbx:tema", tema);
              window.localStorage.setItem("hbx:mode", m);
            },
            { casca: padrao.casca, tema: padrao.tema, modo }
          );

          await page.goto("/login");
          await injectToken(page);
          await page.goto(cena.rota);
          await page.waitForLoadState("networkidle").catch(() => {});
          await page.waitForTimeout(900);

          await page.screenshot({ path: path.join(DESTINO, `${nome}.png`) });
        });
      }
    }
  }

  // ── A prateleira de cores ──
  // Mesma tela, mesma largura, mesmo dado: só a paleta muda. É assim que se
  // escolhe cor — comparando o MESMO quadro, não lembrando de telas
  // diferentes vistas em momentos diferentes.
  for (const cor of CORES) {
    test(`cor-${cor}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "chromium", "Retrato de desktop.");
      fs.mkdirSync(DESTINO, { recursive: true });

      await page.setViewportSize({ width: 1440, height: 900 });
      await setupCommonMocks(page);
      await page.addInitScript((tema) => {
        window.localStorage.setItem("hbx:casca", "backup");
        window.localStorage.setItem("hbx:tema", tema);
        window.localStorage.setItem("hbx:mode", "light");
      }, cor);

      await page.goto("/login");
      await injectToken(page);
      await page.goto("/vendas");
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(900);

      await page.screenshot({ path: path.join(DESTINO, `cor-${cor}.png`) });
    });
  }
});
