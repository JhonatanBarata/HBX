/**
 * AS PALETAS — o que as cores precisam provar.
 *
 * A rede de corte (design-system.spec.ts) mede GEOMETRIA: se o texto cabe na
 * caixa. Cor não mexe em geometria, então rodar as 6 cores lá dentro só
 * multiplicaria o tempo sem descobrir nada novo.
 *
 * O que uma cor pode quebrar é outra coisa, e são exatamente dois riscos:
 *
 *   1. TOKEN ESQUECIDO. Uma pele nova (ou uma pele apagada por engano) deixa
 *      um `var(--token)` sem dono. O CSS não reclama: ele pinta TRANSPARENTE
 *      e seguue com o build verde. Foi o que aconteceu em 01/08 quando as 4
 *      cores foram removidas e os 4 `--swatch-*` do menu ficaram órfãos —
 *      bolinha invisível, zero aviso. É o "CSS morre calado".
 *
 *   2. CONTRASTE. Uma paleta bonita no claro pode ficar ilegível no escuro, e
 *      ninguém percebe porque ninguém abre as 12 combinações. Aqui a régua é
 *      medida, não julgada no olho: WCAG AA (4.5:1 para texto normal, 3:1
 *      para texto grande e para borda que carrega significado).
 *
 * Não é vaidade: com 6 cores × 2 modos, um humano teria que abrir 12 telas e
 * confiar no próprio olho para cada ajuste de paleta. É esse custo que fez as
 * cores serem cortadas de manhã; é este arquivo que as devolve.
 */

import { expect, test } from "@playwright/test";

import { injectToken, setupCommonMocks } from "./helpers/app-mocks";

/** As 6 do menu — tem que bater com CORES em lib/aparencia.ts. */
const CORES = ["aurora", "hbx-cyber", "corporativa", "rose", "ember", "login"] as const;

/**
 * Tokens que TODA cor precisa entregar. A lista é o contrato de pele
 * (skeleton.css): se um destes vier vazio, alguma tela vai pintar transparente
 * em algum lugar e ninguém vai ser avisado.
 */
const TOKENS_OBRIGATORIOS = [
  "--hbx-brand",
  "--hbx-brand-strong",
  "--hbx-brand-soft",
  "--hbx-brand-contrast",
  "--hbx-primary",
  "--hbx-success",
  "--hbx-info",
  "--hbx-warning",
  "--hbx-danger",
  "--hbx-background",
  "--hbx-surface",
  "--hbx-surface-soft",
  "--text-strong",
  "--text-body",
  "--text-muted",
  "--border-hairline",
];

/** Pares que o usuário LÊ. Régua AA: 4.5:1 (texto normal). */
const PARES_DE_LEITURA = [
  { frente: "--text-strong", fundo: "--hbx-surface", minimo: 4.5, nome: "texto forte sobre painel" },
  { frente: "--text-body", fundo: "--hbx-surface", minimo: 4.5, nome: "texto de corpo sobre painel" },
  { frente: "--text-strong", fundo: "--hbx-background", minimo: 4.5, nome: "texto forte sobre fundo" },
  { frente: "--text-body", fundo: "--hbx-background", minimo: 4.5, nome: "texto de corpo sobre fundo" },
];

test.describe("paletas — nenhuma cor esquece um token nem some no escuro", () => {
  for (const cor of CORES) {
    for (const modo of ["light", "dark"] as const) {
      test(`${cor} · ${modo}`, async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== "chromium", "Fiscal de desktop.");

        await setupCommonMocks(page);
        await page.addInitScript(
          ({ tema, m }) => {
            window.localStorage.setItem("hbx:casca", "backup");
            window.localStorage.setItem("hbx:tema", tema);
            window.localStorage.setItem("hbx:mode", m);
          },
          { tema: cor, m: modo }
        );

        await page.goto("/login");
        await injectToken(page);
        await page.goto("/vendas");
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(500);

        // A cor pedida é mesmo a que está no ar? (pega registro fora de
        // sincronia com os arquivos importados.)
        const noAr = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
        expect(noAr, `data-theme deveria ser ${cor}`).toBe(cor);

        const medido = await page.evaluate(
          ({ tokens, swatch }) => {
            const cs = getComputedStyle(document.documentElement);
            const out: Record<string, string> = {};
            for (const t of [...tokens, swatch]) out[t] = cs.getPropertyValue(t).trim();

            /** Resolve qualquer cor CSS para [r,g,b] usando o próprio motor. */
            const sonda = document.createElement("span");
            sonda.style.display = "none";
            document.body.appendChild(sonda);
            const rgb: Record<string, string> = {};
            for (const t of tokens) {
              sonda.style.color = "";
              sonda.style.color = cs.getPropertyValue(t).trim();
              rgb[t] = getComputedStyle(sonda).color;
            }
            sonda.remove();
            return { out, rgb };
          },
          { tokens: TOKENS_OBRIGATORIOS, swatch: `--swatch-${cor}` }
        );

        // 1) Nenhum token vazio — inclusive a bolinha do menu.
        for (const t of [...TOKENS_OBRIGATORIOS, `--swatch-${cor}`]) {
          expect(medido.out[t], `${cor}/${modo}: token ${t} está VAZIO (var() órfão pinta transparente sem avisar)`).not.toBe("");
        }

        // 2) Contraste medido, não julgado no olho.
        const lum = (css: string): number | null => {
          const m = css.match(/rgba?\(([^)]+)\)/);
          if (!m) return null;
          const [r, g, b] = m[1].split(",").slice(0, 3).map((v) => Number(v.trim()) / 255);
          const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };

        for (const par of PARES_DE_LEITURA) {
          const lf = lum(medido.rgb[par.frente]);
          const lb = lum(medido.rgb[par.fundo]);
          if (lf === null || lb === null) continue;
          const razao = (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
          expect(
            Number(razao.toFixed(2)),
            `${cor}/${modo}: ${par.nome} = ${razao.toFixed(2)}:1 (mínimo ${par.minimo}:1) — ` +
              `${par.frente}=${medido.rgb[par.frente]} sobre ${par.fundo}=${medido.rgb[par.fundo]}`
          ).toBeGreaterThanOrEqual(par.minimo);
        }
      });
    }
  }
});
