/**
 * O VERSO É ENFEITE — E ENFEITE NÃO DERRUBA TELA.
 *
 * O painel das costas (components/hbx/costas-panel.tsx) promete no comentário
 * do topo: "Falhou? O verso simplesmente não existe e o menu segue normal".
 * A promessa cobria o endpoint FORA DO AR. Não cobria o caso mais comum na
 * vida real: o endpoint RESPONDE, com HTTP 200, mas pela METADE — proxy que
 * devolve `{}`, servidor numa versão mais velha que o front, mock que ninguém
 * atualizou. O `.catch()` do fetch nunca vê nada disso.
 *
 * Eram DUAS promessas quebradas, e este arquivo tranca as duas:
 *
 *  1. "não derruba" — `painel.serie.length` estourava TypeError NO RENDER, o
 *     erro subia até o error.tsx da rota e a /vendas INTEIRA virava popup. Com
 *     o título "Sem conexão com o sistema", porque lib/errors.ts lia TypeError
 *     cru como falha de rede: o usuário conferia o wi-fi por um bug nosso.
 *
 *  2. "o menu segue normal" — o menu NÃO seguia normal. O atributo
 *     data-costas="on" (que apaga os módulos pra dar lugar ao painel) é ligado
 *     pelo React ANTES de saber se existe painel. Sem painel, os módulos
 *     apagavam e nada entrava no lugar: barra lateral vazia, menu só de volta
 *     no hover.
 *
 * Por isso o teste MEDE opacidade com getComputedStyle em vez de olhar o DOM:
 * a lei da casa é que prova de CSS se mede (memória: css-morre-calado). Item
 * presente no HTML e invisível na tela é o defeito exato que esta rede pega.
 *
 * REGRA PRA QUEM MEXER: a lista de respostas tortas só ANDA PRA PIOR. Tirar um
 * caso porque "não acontece" é desligar o fiscal sem apagar o arquivo — o `{}`
 * do catch-all também "não acontecia".
 */

import { expect, test } from "@playwright/test";

import { injectToken, setupCommonMocks } from "./helpers/app-mocks";
import { painelModuloHostil } from "./helpers/dados-hostis";

type Caso = {
  nome: string;
  corpo: unknown;
  /** `monta` = a resposta tem título, então o verso existe e cobre o menu. */
  verso: "monta" | "some";
};

const CASOS: Caso[] = [
  {
    nome: "CONTROLE — resposta inteira e saudável",
    corpo: painelModuloHostil("vendas"),
    verso: "monta",
  },
  {
    nome: "null (o que o próprio backend devolve pra módulo sem painel)",
    corpo: null,
    verso: "some",
  },
  {
    nome: "objeto vazio (o que um proxy/catch-all devolve)",
    corpo: {},
    verso: "some",
  },
  {
    nome: "cabeçalho sem nenhum dos arrays",
    corpo: { modulo: "vendas", titulo: "Vendas", legenda: "Últimos 7 dias", tom: "ok" },
    verso: "monta",
  },
  {
    nome: "arrays pela metade (só metricas veio)",
    corpo: {
      modulo: "vendas",
      titulo: "Vendas",
      legenda: "Últimos 7 dias",
      tom: "atencao",
      metricas: [{ rotulo: "Taxa de resposta", valor: "12,4%" }],
    },
    verso: "monta",
  },
  {
    nome: "campos com o TIPO errado (null e string onde se espera lista)",
    corpo: {
      modulo: "vendas",
      titulo: "Vendas",
      legenda: "Últimos 7 dias",
      tom: "ok",
      hero: null,
      serie: "4,9,2",
      serieRotulo: 12,
      metricas: null,
      barras: {},
      fatos: "nada",
      rodape: false,
    },
    verso: "monta",
  },
  {
    nome: "listas com lixo dentro (null e string no lugar do item)",
    corpo: {
      modulo: "vendas",
      titulo: "Vendas",
      legenda: "Últimos 7 dias",
      tom: "risco",
      serie: [4, null, "9", null, 2, "x", 7],
      metricas: [null, "texto solto", { rotulo: "Ok", valor: "1" }],
      barras: [null, { rotulo: "Sem pct", valor: 3 }],
      fatos: [null, { rotulo: "Último disparo", valor: "ontem" }],
    },
    verso: "monta",
  },
];

for (const caso of CASOS) {
  test(`/vendas de pé — painel-modulo responde ${caso.nome}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Fiscal de render roda no desktop.");

    await setupCommonMocks(page);
    // Registrado DEPOIS do helper de propósito: o Playwright casa as rotas em
    // ordem INVERSA de registro, então esta vence a versão saudável de lá.
    await page.route("**/hbx/api/painel-modulo/**", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(caso.corpo) })
    );

    const estouros: string[] = [];
    page.on("pageerror", (erro) => estouros.push(erro.message));

    await page.goto("/login");
    await injectToken(page);
    await page.goto("/vendas");
    await page.waitForLoadState("networkidle").catch(() => {
      /* SSE nunca fica ocioso — seguir mesmo assim */
    });
    // O ponteiro nasce em 0,0 — dentro da barra lateral. Isso ligaria o :hover
    // que devolve os módulos e faria a medição de opacidade mentir nos dois
    // sentidos. Tirar o mouse de cima é parte da montagem do teste.
    await page.mouse.move(900, 500);
    // O verso se monta em dois quadros + rede de 260ms; esperar a cascata toda.
    await page.waitForTimeout(900);

    // 1) Nada pode ter estourado no render.
    expect(estouros, `Crash de render:\n${estouros.join("\n")}`).toEqual([]);

    // 2) O popup de erro não pode ter comido a tela — e MUITO menos culpando a
    //    internet do usuário por um dado torto que chegou com HTTP 200.
    await expect(page.locator(".hbx-error__title")).toHaveCount(0);

    // 3) A tela de verdade continua montada.
    await expect(page.locator("aside.side")).toBeVisible();

    const barra = await page.evaluate(() => {
      const item = document.querySelector<HTMLElement>(".nav-item");
      return {
        temPainel: Boolean(document.querySelector(".costas")),
        itens: document.querySelectorAll(".nav-item").length,
        opacidade: item ? Number(getComputedStyle(item).opacity) : null,
        clicavel: item ? getComputedStyle(item).pointerEvents !== "none" : null,
      };
    });

    expect(barra.itens, "a barra lateral perdeu os módulos").toBeGreaterThan(0);

    if (caso.verso === "monta") {
      // O verso existe: ele cobre o menu de propósito (é a função dele) e o
      // menu volta no hover. Este ramo é o CONTROLE — prova que a rede não foi
      // paga desligando o recurso.
      expect(barra.temPainel, "o verso deveria ter montado com esta resposta").toBe(true);
      expect(barra.opacidade, "com painel na tela os módulos saem de cena").toBe(0);
    } else {
      // Sem verso, a promessa em vigor é a do comentário: o menu segue NORMAL.
      expect(barra.temPainel, "não havia dado pra montar verso nenhum").toBe(false);
      expect(barra.opacidade, "sem painel, o menu não pode ficar invisível").toBe(1);
      expect(barra.clicavel, "sem painel, o menu não pode ficar sem clique").toBe(true);
    }
  });
}
