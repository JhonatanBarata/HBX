/**
 * Fiscal anti-corte — MOBILE.
 *
 * Pergunta específica do celular: "a página inteira rolou pro lado?". No
 * desktop isso quase nunca acontece; no celular é o defeito clássico, e uma
 * única caixa larga demais estraga a rolagem da tela toda.
 *
 * O corte POR ELEMENTO (pílula que come a própria palavra, altura fixa que
 * decapita a segunda linha) é outro assunto e mora em design-system.spec.ts,
 * que roda o detector fino nas 2 peles e nas 3 larguras de desktop.
 *
 * HISTÓRIA QUE VALE LEMBRAR: este arquivo carregava sua própria cópia dos
 * mocks — 230 linhas — e nela o catch-all `**​/hbx/api/**` era o ÚLTIMO
 * `page.route` registrado. Como o Playwright casa as rotas em ordem INVERSA
 * de registro, o catch-all vencia todos os mocks específicos, respondia `{}`
 * para tudo, e o app montava o popup "Sem conexão com o sistema". O teste
 * passava em 100% das rotas porque um popup de erro realmente não tem
 * overflow horizontal. Verde, e cego.
 *
 * Por isso os mocks agora moram em helpers/app-mocks.ts, num lugar só: cópia
 * de mock é como cópia de CSS — as duas metades saem de sincronia e a que
 * está errada é sempre a que ninguém está olhando.
 */

import { expect, test } from "@playwright/test";

import { injectToken, setupCommonMocks } from "./helpers/app-mocks";

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

test.describe("mobile — sem overflow horizontal (fiscal anti-corte)", () => {
  for (const rota of ROTAS) {
    test(`${rota} — sem corte horizontal`, async ({ page }, testInfo) => {
      test.skip(
        testInfo.project.name !== "mobile-chromium",
        "Teste fiscal só roda no projeto mobile-chromium."
      );

      await setupCommonMocks(page);

      // Passa pelo /login primeiro só para existir origem onde gravar o token.
      await page.goto("/login");
      await injectToken(page);
      await page.goto(rota);

      await page.waitForLoadState("networkidle").catch(() => {
        // SSE/websocket nunca fica ocioso — seguir mesmo assim.
      });
      await page.waitForTimeout(600);

      const overflow = await page.evaluate(() => {
        const el = document.documentElement;
        return { rolou: el.scrollWidth > el.clientWidth + 1, largura: el.scrollWidth, tela: el.clientWidth };
      });

      expect(
        overflow.rolou,
        `Overflow horizontal em ${rota}: conteúdo ${overflow.largura}px numa tela de ${overflow.tela}px`
      ).toBe(false);
    });
  }
});
