/**
 * REDE DO DESIGN SYSTEM — o fiscal de aparência que roda sozinho.
 *
 * Responde a pergunta que nenhum humano consegue responder olhando: "nas 2
 * peles, nos 2 modos, nas 3 larguras, alguma tela está comendo texto?".
 * São 12 combinações por rota. Ninguém abre 12 abas por tela; a máquina abre.
 *
 * ---- A CATRACA (o que faz este teste sobreviver) ----
 * A base tem defeito de corte acumulado de mais de um ano. Um teste que exige
 * ZERO no primeiro dia nasce vermelho, e teste que nasce vermelho é
 * desligado na primeira sexta-feira — aí a rede não existe mais, só o
 * arquivo dela.
 *
 * Então ele não exige zero: exige NÃO PIORAR. `clip-baseline.json` guarda
 * quantos defeitos cada rota tem hoje. O teste reprova se o número SUBIR.
 * Quando o número cai, a catraca desce sozinha e não sobe mais.
 *
 * Isso transforma uma dívida intratável ("conserta 500 cortes") numa régua
 * que só anda para um lado. É como se conserta base grande sem parar a
 * fábrica: o novo já nasce certo, o velho melhora quando se passa por perto.
 *
 * ---- COMO RODAR ----
 * Medir (reprova se piorou):
 *   npm run clip
 * Baixar a régua depois de consertar de verdade:
 *   npm run clip:regua
 *
 * Os dois scripts APAGAM clip-report.txt e clip-medido.jsonl antes de rodar —
 * os dois são acumulados em disco (ver nota do MEDIDO_PATH) e sem a limpeza a
 * corrida de hoje leria o achado de ontem.
 */

import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { injectToken, setupCommonMocks } from "./helpers/app-mocks";
import { coletarCortes, formatarAchados, type Achado } from "./helpers/clip-detector";

// ---------- configuração ----------

/** As telas que dão dinheiro primeiro; o resto na sequência. */
const ROTAS = [
  "/vendas",
  "/conversas",
  "/logistica",
  "/entrega",
  "/dashboard",
  "/leads",
  "/agenda",
  "/relatorios",
  "/configuracoes",
];

/**
 * Os 2 PADRÕES, cada um no seu padrão de fábrica. `backup` lê-se Premium —
 * ver lib/aparencia.ts.
 *
 * As 6 cores NÃO entram aqui de propósito: cor é só token e não mexe em um
 * pixel de geometria, então repeti-las multiplicaria 54 testes por 6 sem
 * descobrir um defeito novo. O que as cores precisam provar (token esquecido,
 * contraste) mora em paletas.spec.ts. Quem separa os dois arquivos é a
 * pergunta que cada um responde, não o assunto.
 */
const PELES = [
  { casca: "backup", tema: "aurora", rotulo: "premium" },
  { casca: "corporativa", tema: "corporativa", rotulo: "corporativo" },
] as const;

/**
 * 1366 está aqui de propósito: é a largura onde o cockpit já cortou antes
 * (notebook comum de vendedor). 1920 pega o monitor do escritório; 1440 é o
 * meio de campo e o que vale para o screenshot de referência.
 */
const LARGURAS = [1366, 1440, 1920];

const BASELINE_PATH = path.join(process.cwd(), "tests/e2e/clip-baseline.json");
const REPORT_PATH = path.join(process.cwd(), "tests/e2e/clip-report.txt");
/**
 * O medido vai para DISCO, uma linha por teste, e não para uma variável.
 *
 * O Playwright REINICIA O PROCESSO DO WORKER depois de cada teste que falha —
 * é isolamento de estado, e é o comportamento certo dele. O efeito colateral
 * aqui é que qualquer acumulador de módulo é zerado junto: a primeira corrida
 * com falha relatou "2 defeitos em 1 combinações" tendo medido 54. Relatório
 * que só está certo quando tudo passa é relatório inútil, porque o momento em
 * que ele importa é exatamente o momento em que algo falhou.
 */
const MEDIDO_PATH = path.join(process.cwd(), "tests/e2e/clip-medido.jsonl");
const ATUALIZAR = process.env.HBX_CLIP_UPDATE === "1";

type Baseline = Record<string, number>;

function lerBaseline(): Baseline {
  try {
    return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as Baseline;
  } catch {
    return {};
  }
}

const baseline = lerBaseline();

/** Registra o resultado de UMA combinação, à prova de reinício de worker. */
function registrar(chave: string, achados: Achado[]): void {
  fs.appendFileSync(MEDIDO_PATH, `${JSON.stringify({ chave, n: achados.length })}\n`, "utf8");
  if (achados.length > 0) fs.appendFileSync(REPORT_PATH, `${formatarAchados(achados, chave)}\n`, "utf8");
}

/** Lê tudo que a corrida gravou. Última linha de cada chave vence. */
function lerMedido(): Baseline {
  try {
    const out: Baseline = {};
    for (const linha of fs.readFileSync(MEDIDO_PATH, "utf8").split("\n")) {
      if (!linha.trim()) continue;
      const { chave, n } = JSON.parse(linha) as { chave: string; n: number };
      out[chave] = n;
    }
    return out;
  } catch {
    return {};
  }
}

// ---------- suite ----------

test.describe("design system — nada some da tela", () => {
  for (const pele of PELES) {
    for (const largura of LARGURAS) {
      for (const rota of ROTAS) {
        const chave = `${rota}|${pele.rotulo}|${largura}`;

        test(`${rota} — ${pele.rotulo} @${largura}`, async ({ page }, testInfo) => {
          // `browserName` não separa: o projeto mobile TAMBÉM é chromium. Quem
          // separa é o nome do projeto — e este fiscal define o próprio
          // viewport, então rodar no mobile seria medir a mesma coisa 2x.
          test.skip(testInfo.project.name !== "chromium", "Fiscal de desktop.");

          await page.setViewportSize({ width: largura, height: 900 });
          await setupCommonMocks(page);

          // A aparência precisa estar gravada ANTES do primeiro paint: o boot
          // inline do layout.tsx lê o localStorage e escreve <html data-casca>.
          // Gravar depois faria o teste medir a pele errada no primeiro frame.
          await page.addInitScript(
            ({ casca, tema }) => {
              window.localStorage.setItem("hbx:casca", casca);
              window.localStorage.setItem("hbx:tema", tema);
              window.localStorage.setItem("hbx:mode", "light");
            },
            { casca: pele.casca, tema: pele.tema }
          );

          await page.goto("/login");
          await injectToken(page);
          await page.goto(rota);

          await page.waitForLoadState("networkidle").catch(() => {
            /* SSE/websocket nunca fica ocioso — seguir mesmo assim */
          });
          await page.waitForTimeout(700);

          const achados = await coletarCortes(page);
          registrar(chave, achados);

          if (ATUALIZAR) {
            test.info().annotations.push({ type: "baseline", description: `${chave} = ${achados.length}` });
            return;
          }

          const teto = baseline[chave];
          if (teto === undefined) {
            // Combinação nova: registra e não reprova — a régua nasce aqui.
            test.info().annotations.push({ type: "novo", description: `${chave} = ${achados.length}` });
            return;
          }

          expect(achados.length, formatarAchados(achados, chave)).toBeLessThanOrEqual(teto);
        });
      }
    }
  }
});

/**
 * Grava a régua no fim da corrida. Só com HBX_CLIP_UPDATE=1 — para nunca
 * acontecer de uma rodada distraída "aprovar" a piora que ela mesma mediu.
 */
test.afterAll(() => {
  const medido = lerMedido();
  const total = Object.values(medido).reduce((s, n) => s + n, 0);
  if (Object.keys(medido).length === 0) return;

  console.log(`\n[clip] ${total} defeito(s) em ${Object.keys(medido).length} combinações — detalhe em ${REPORT_PATH}`);

  if (!ATUALIZAR) {
    // Placar do que MELHOROU, para a catraca poder descer de propósito.
    const melhoras = Object.entries(medido).filter(([k, n]) => baseline[k] !== undefined && n < baseline[k]);
    if (melhoras.length > 0) {
      const ganho = melhoras.reduce((s, [k, n]) => s + (baseline[k] - n), 0);
      console.log(
        `[clip] ${melhoras.length} combinação(ões) melhoraram, -${ganho} defeito(s). ` +
          `Baixe a régua com: HBX_CLIP_UPDATE=1`
      );
    }
    return;
  }

  const combinado = { ...baseline, ...medido };
  const ordenado: Baseline = {};
  for (const k of Object.keys(combinado).sort()) ordenado[k] = combinado[k];
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(ordenado, null, 2)}\n`, "utf8");
  console.log(`[clip] régua gravada em ${BASELINE_PATH} (${Object.keys(ordenado).length} combinações)`);
});
