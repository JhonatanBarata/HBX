/**
 * AS PALETAS — o que a cor precisa provar quando a cor é QUALQUER UMA.
 *
 * A rede de corte (design-system.spec.ts) mede GEOMETRIA: se o texto cabe na
 * caixa. Cor não mexe em geometria, então rodar cor lá dentro só multiplicaria
 * o tempo sem descobrir nada novo.
 *
 * O que uma cor pode quebrar é outra coisa, e são exatamente dois riscos:
 *
 *   1. TOKEN ESQUECIDO. Uma paleta deixa um `var(--token)` sem dono. O CSS não
 *      reclama: ele pinta TRANSPARENTE e segue com o build verde. Foi o que
 *      aconteceu em 01/08 quando 4 cores foram removidas e os `--swatch-*` do
 *      menu ficaram órfãos — bolinha invisível, zero aviso. "CSS morre calado".
 *
 *   2. CONTRASTE. Uma paleta bonita no claro pode ficar ilegível no escuro.
 *      Aqui a régua é MEDIDA: WCAG AA, 4,5:1 para texto normal.
 *
 * O QUE MUDOU EM 03/08 — e por que este arquivo ficou mais importante, não menos
 *
 * As 6 cores fixas viraram um painel multicor: a pessoa escolhe qualquer hex e
 * theme-gerado.css deriva a paleta em OKLCH. Com 6 cores dava para conferir 12
 * telas na mão, no limite. Com infinitas, não dá — e é exatamente por isso que
 * a garantia deixou de ser "olhamos todas" e passou a ser ESTRUTURAL: a
 * claridade de cada token é cravada na folha, e só matiz/croma vêm do usuário.
 *
 * Este arquivo é quem prova que a estrutura entrega o que promete. E ele já
 * pegou um erro real: a marca nasceu em L 0,50 porque a varredura do cubo sRGB
 * mostrou que L 0,55 — o valor "óbvio", escolhido confiando na uniformidade
 * perceptual do OKLCH — REPROVAVA 987 das 4096 cores. Uniformidade perceptual
 * não é uniformidade de luminância, e é luminância que o WCAG mede.
 *
 * Por isso o teste varre DUAS famílias:
 *   - as 17 da grade, que é o que a maioria vai clicar;
 *   - HOSTIS escolhidas a dedo (neon, quase-branco, quase-preto, cinza puro),
 *     que é o que a cor livre permite e o que quebra se algo estiver frouxo.
 */

import { expect, test } from "@playwright/test";

import { injectToken, setupCommonMocks } from "./helpers/app-mocks";

/**
 * As 5 do painel — tem que bater com CORES em lib/aparencia.ts e com os
 * `--cor-*` de theme-gerado.css. Eram 17 até o dono ver na tela ("tem muita
 * cor, tem q colocar 5 exemplos bem distintos"): 290° · 240° · 145° · 55° e um
 * neutro. O contínuo inteiro segue coberto pelo seletor livre — que é o que a
 * lista LIVRES abaixo maltrata.
 */
const GRADE = ["violeta", "azul", "verde", "ambar", "grafite"] as const;

/**
 * Cor livre — os casos que a grade nunca produz. Cada um existe por um motivo:
 * neon ciano/verde são o pior par para tinta branca (foi ali que L 0,55 caiu);
 * quase-branco e quase-preto testam se a escada IGNORA mesmo a claridade da
 * semente; cinza puro (croma 0) prova que o piso de croma segura uma marca
 * visível em vez de sumir.
 */
const LIVRES = [
  "#00FFBB", "#00FF00", "#00FFFF", "#FFFF00",
  "#FDFDFD", "#050505", "#808080", "#FF0000", "#0000FF",
] as const;

/**
 * Tokens que TODA cor precisa entregar. A lista é o contrato de pele: se um
 * destes vier vazio, alguma tela pinta transparente e ninguém é avisado.
 */
const TOKENS_OBRIGATORIOS = [
  "--hbx-cor",
  "--hbx-brand", "--hbx-brand-strong", "--hbx-brand-soft", "--hbx-brand-contrast",
  "--hbx-primary", "--hbx-secondary", "--hbx-accent", "--hbx-action-ink",
  "--hbx-success", "--hbx-info", "--hbx-warning", "--hbx-danger", "--hbx-danger-soft",
  "--hbx-background", "--hbx-background-alt",
  "--hbx-surface", "--hbx-surface-soft", "--hbx-surface-raised",
  "--hbx-header-surface", "--hbx-nav-surface", "--hbx-field-surface", "--hbx-table-head",
  "--hbx-chat-inbound", "--hbx-chat-outbound", "--hbx-chat-system",
  "--text-strong", "--text-body", "--text-muted",
  "--hbx-line", "--border-hairline", "--border-strong",
  "--hbx-shadow", "--hbx-overlay", "--ring-brand",
  "--casca-ring-1", "--casca-ring-5", "--casca-mark-1",
  "--shadow-xs", "--shadow-sm", "--shadow-inset",
  // Não nascem na paleta (typography.css / spacing.css são os donos), e é
  // justamente por isso que entram: se a folha de cor um dia voltar a
  // declará-los, ou se o dono deles sumir, é aqui que aparece.
  "--font-body", "--font-display", "--radius-sm", "--radius-md",
] as const;

/** Pares que o usuário LÊ. Régua AA: 4,5:1 (texto normal). */
const PARES = [
  { frente: "--text-strong", fundo: "--hbx-surface", nome: "texto forte sobre painel" },
  { frente: "--text-body", fundo: "--hbx-surface", nome: "texto de corpo sobre painel" },
  { frente: "--text-muted", fundo: "--hbx-surface", nome: "texto apagado sobre painel" },
  { frente: "--text-strong", fundo: "--hbx-background", nome: "texto forte sobre fundo" },
  { frente: "--text-body", fundo: "--hbx-background", nome: "texto de corpo sobre fundo" },
  { frente: "--text-muted", fundo: "--hbx-background", nome: "texto apagado sobre fundo" },
  // O par que mais dói e o que menos se olha: a tinta EM CIMA do botão cheio.
  { frente: "--hbx-action-ink", fundo: "--hbx-brand", nome: "tinta sobre o botão da marca" },
] as const;
const MINIMO = 4.5;

type Rgb = [number, number, number];

/**
 * Mede tokens e converte para RGB usando o MOTOR DO NAVEGADOR.
 *
 * A conversão é feita com canvas, não com getComputedStyle: desde que os
 * tokens viraram `oklch()`, o computado devolve `oklch(...)` de volta (o
 * navegador preserva o espaço de cor) e um parser de `rgb(` leria vazio e
 * passaria calado. O canvas rasteriza de fato — é o mesmo pixel que o usuário
 * enxerga, já com o recorte de gamut aplicado.
 */
async function medir(page: import("@playwright/test").Page, tokens: readonly string[]) {
  return page.evaluate((ts: string[]) => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 1;
    const ctx = cv.getContext("2d", { willReadFrequently: true })!;
    const cs = getComputedStyle(document.documentElement);
    const bruto: Record<string, string> = {};
    const rgb: Record<string, [number, number, number]> = {};
    for (const t of ts) {
      const v = cs.getPropertyValue(t).trim();
      bruto[t] = v;
      if (!v) continue;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      rgb[t] = [d[0], d[1], d[2]];
    }
    return { bruto, rgb };
  }, tokens as unknown as string[]);
}

function razao(a: Rgb, b: Rgb): number {
  const lum = (c: Rgb) => {
    const f = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const CASOS = [
  ...GRADE.map(c => ({ rotulo: c as string, valor: c as string })),
  ...LIVRES.map(h => ({ rotulo: `livre ${h}`, valor: h as string })),
];

test.describe("paletas — qualquer cor entrega todo token e passa AA nos dois modos", () => {
  for (const caso of CASOS) {
    for (const modo of ["light", "dark"] as const) {
      test(`${caso.rotulo} · ${modo}`, async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== "chromium", "Fiscal de desktop.");

        await setupCommonMocks(page);
        await page.addInitScript(
          ({ cor, m }) => {
            window.localStorage.setItem("hbx:casca", "backup");
            window.localStorage.setItem("hbx:cor", cor);
            window.localStorage.setItem("hbx:mode", m);
          },
          { cor: caso.valor, m: modo }
        );

        await page.goto("/login");
        await injectToken(page);
        await page.goto("/vendas");
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(500);

        // A cor pedida é MESMO a que está no ar? Pega registro fora de
        // sincronia com a folha, e pega o boot escolhendo o caminho errado
        // entre `data-cor` e `--hbx-cor` inline — os dois juntos deixariam o
        // inline vencendo para sempre e o atalho da grade mudo.
        const noAr = await page.evaluate(() => {
          const h = document.documentElement;
          return { grade: h.getAttribute("data-cor"), livre: h.style.getPropertyValue("--hbx-cor").trim() };
        });
        if ((GRADE as readonly string[]).includes(caso.valor)) {
          expect(noAr.grade, `data-cor deveria ser ${caso.valor}`).toBe(caso.valor);
          expect(noAr.livre, "cor da grade não pode escrever --hbx-cor inline").toBe("");
        } else {
          expect(noAr.livre.toUpperCase(), `--hbx-cor inline deveria ser ${caso.valor}`).toBe(caso.valor);
          expect(noAr.grade, "cor livre não pode deixar data-cor pendurado").toBeNull();
        }

        const { bruto, rgb } = await medir(page, TOKENS_OBRIGATORIOS);

        // 1) Nenhum token vazio.
        for (const t of TOKENS_OBRIGATORIOS) {
          expect(bruto[t], `${caso.rotulo}/${modo}: token ${t} está VAZIO (var() órfão pinta transparente sem avisar)`).not.toBe("");
        }

        // 2) Contraste medido, não julgado no olho.
        for (const par of PARES) {
          const f = rgb[par.frente] as Rgb | undefined;
          const b = rgb[par.fundo] as Rgb | undefined;
          expect(f, `${par.frente} não rasterizou`).toBeTruthy();
          expect(b, `${par.fundo} não rasterizou`).toBeTruthy();
          const r = razao(f!, b!);
          expect(
            Number(r.toFixed(2)),
            `${caso.rotulo}/${modo}: ${par.nome} = ${r.toFixed(2)}:1 (mínimo ${MINIMO}:1) — ` +
              `${par.frente}=rgb(${f}) sobre ${par.fundo}=rgb(${b})`
          ).toBeGreaterThanOrEqual(MINIMO);
        }
      });
    }
  }
});

/**
 * O MATERIAL é outro eixo, e tem outra pergunta: "Chapado apaga MESMO o vidro?"
 *
 * Vale um teste próprio porque o modo de falhar é silencioso e já aconteceu na
 * construção: a primeira versão de material.css zerava `--blur-chrome` com
 * especificidade (0,1,0) e perdia para `[data-casca="modern"][data-theme]`, que
 * é (0,2,0). O token continuava 24px e nada avisava — só apareceu porque foi
 * MEDIDO no navegador.
 */
test.describe("material — Chapado apaga o vidro, Vidro devolve", () => {
  for (const material of ["vidro", "chapado"] as const) {
    test(`${material}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "chromium", "Fiscal de desktop.");

      await setupCommonMocks(page);
      await page.addInitScript(({ m }) => {
        window.localStorage.setItem("hbx:casca", "backup");
        window.localStorage.setItem("hbx:material", m);
      }, { m: material });

      await page.goto("/login");
      await injectToken(page);
      await page.goto("/vendas");
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(500);

      const medido = await page.evaluate(() => {
        const cs = getComputedStyle(document.documentElement);
        return {
          attr: document.documentElement.getAttribute("data-material"),
          chrome: cs.getPropertyValue("--blur-chrome").trim(),
          glass: cs.getPropertyValue("--blur-glass").trim(),
          inset: cs.getPropertyValue("--shadow-inset").trim(),
        };
      });

      expect(medido.attr).toBe(material);
      if (material === "chapado") {
        expect(medido.chrome, "Chapado tem que ZERAR o desfoque de cromo").toBe("0px");
        expect(medido.glass, "Chapado tem que ZERAR o desfoque de vidro").toBe("0px");
        // `none` quebraria `box-shadow: var(--shadow-inset), var(--shadow-xs)`
        // — a regra inteira cai e a sombra some junto.
        expect(medido.inset, "sombra invisível é `transparent`, NUNCA `none`").not.toBe("none");
      } else {
        expect(Number.parseFloat(medido.chrome), "Vidro precisa de desfoque de verdade").toBeGreaterThan(0);
        expect(medido.inset, "Vidro precisa do realce de topo").toContain("inset");
      }
    });
  }
});
