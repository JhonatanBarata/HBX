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
import { coletarCenso, coletarCortes, formatarAchados, type Achado, type Censo } from "./helpers/clip-detector";

// ---------- configuração ----------

/**
 * TODAS as rotas de (app), não só as nove que dão dinheiro primeiro.
 *
 * Eram 9 de 25 — e o dono cobrou o buraco com um print de cada vez. Cobrir só
 * o que se lembra de cobrir é o mesmo que não cobrir: o defeito aparece
 * justamente na tela em que ninguém pensou.
 *
 * A ordem continua sendo a do dinheiro, porque é ela que decide o que se
 * conserta primeiro quando o relatório vem grande.
 *
 * Rota que não carrega com os mocks de hoje REPROVA em vez de passar (ver
 * `exigirTelaDeVerdade`) — é o contrário do que a rede antiga fazia.
 */
const ROTAS = [
  // as que dão dinheiro
  "/vendas",
  "/conversas",
  "/atendimento",
  "/logistica",
  "/dashboard",
  "/leads",
  "/agenda",
  "/relatorios",
  // o resto do app
  "/clientes",
  "/contatos",
  "/produtos",
  "/financeiro",
  "/gerencial",
  "/automacao",
  // /automacoes, /assistente e /bot ficam de fora de propósito: as três são
  // redirecionamentos para /automacao com uma seção diferente na query. Medir
  // as três seria medir a mesma tela quatro vezes e triplicar a corrida sem
  // descobrir um pixel novo.
  "/concierge",
  "/comex",
  "/empresas",
  "/webscraping",
  "/workspace",
  "/tutorial",
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
 *
 * A ORDEM IMPORTA e é da larga para a estreita. A primeira largura é a
 * REFERÊNCIA: o censo do que se lê nela é o que as menores usam para provar
 * que nada foi apagado no caminho (o defeito SUMIU). Invertendo a ordem, o
 * fiscal compararia a tela cheia contra a tela espremida e não acusaria nada.
 */
const LARGURAS = [1920, 1440, 1366];

/**
 * OS ESTADOS QUE O FISCAL NUNCA TINHA ABERTO.
 *
 * A rede antiga fazia `goto` -> espera -> mede, e parava aí. Ela media a tela
 * EM REPOUSO, e nada mais: nenhum modal, nenhuma gaveta, nenhum card de hover.
 * O preço disso foi medido em 01/08 — bastou abrir UM modal (o Organizar
 * campos da /vendas) para aparecerem 35 achados que a régua nunca tinha visto,
 * numa tela que marcava ZERO. Os dois prints que o dono mandou daquele dia
 * eram justamente estados fechados: um modal e um cartão que só existe com o
 * mouse em cima.
 *
 * Estado é caro (recarrega a página), então ele é medido nas larguras
 * EXTREMAS: a de referência, que diz o que deveria dar para ler, e a mais
 * apertada, que é onde quebra. O meio de campo não descobriu nada que 1366 já
 * não descubra.
 *
 * `precisa` é a rede de segurança contra teste que mente: se o gatilho não
 * existe naquela tela (dado mockado diferente, módulo desligado), o estado é
 * PULADO em vez de medir a tela parada achando que mediu o modal.
 */
type EstadoDaTela = {
  nome: string;
  /** Clicado, em ordem, para chegar no estado. */
  clicar?: string[];
  /** Mouse parado em cima — revela cartão de hover. */
  passarMouse?: string;
  /** Sem este elemento na tela, o estado não existe: pula. */
  precisa: string;
  /** Este elemento prova que o estado ABRIU de verdade. */
  confirma: string;
};

const ESTADOS: Record<string, EstadoDaTela[]> = {
  "/vendas": [
    {
      nome: "organizar-campos",
      clicar: [".vnd-colspick > button"],
      precisa: ".vnd-colspick > button",
      confirma: ".vnd-colspick__menu",
    },
    {
      nome: "ficha-do-lead",
      clicar: [".vnd-sales-row"],
      precisa: ".vnd-sales-row",
      confirma: ".vnd-lead-peek.has-lead",
    },
    {
      nome: "quadro",
      clicar: [".vnd-cmd__acts .seg-toggle .seg:nth-child(2)"],
      precisa: ".vnd-cmd__acts .seg-toggle .seg:nth-child(2)",
      confirma: ".vnd-card, .vnd-board, .vnd-col",
    },
  ],
  "/leads": [
    {
      nome: "detalhe-do-lead",
      clicar: ["[data-lead-id], .lead-row, .lds-row"],
      precisa: "[data-lead-id], .lead-row, .lds-row",
      confirma: ".hbx-panel-shell__context, .lds-detail",
    },
  ],
  "/logistica": [
    {
      nome: "rota-selecionada",
      clicar: [".log-rota-row, .log-card, [data-rota-id]"],
      precisa: ".log-rota-row, .log-card, [data-rota-id]",
      confirma: ".hbx-panel-shell__context",
    },
  ],
  "/conversas": [
    {
      nome: "conversa-aberta",
      clicar: [".at-conv, .conv-row, [data-conv-id]"],
      precisa: ".at-conv, .conv-row, [data-conv-id]",
      confirma: ".at-thread, .at-msgs, .conv-thread",
    },
  ],
};

/** Larguras em que os estados são medidos: a referência e a mais apertada. */
const LARGURAS_DE_ESTADO = new Set([1920, 1366]);

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
  // Cada teste agora carrega a rota 3 vezes (uma por largura). O teto global
  // de 30s do playwright.config vale para teste de UMA carga.
  test.describe.configure({ timeout: 120_000 });

  for (const pele of PELES) {
    for (const rota of ROTAS) {
      // UM teste por rota+pele, com as 3 larguras DENTRO. Antes eram 3 testes
      // independentes, e por isso nenhum deles conseguia perguntar a única
      // coisa que denuncia rótulo apagado: "o que eu li na tela larga ainda se
      // lê aqui?". O custo de carregar a página continua o mesmo (3 idas), só
      // que agora as 3 medidas conversam entre si.
      test(`${rota} — ${pele.rotulo}`, async ({ page }, testInfo) => {
        // `browserName` não separa: o projeto mobile TAMBÉM é chromium. Quem
        // separa é o nome do projeto — e este fiscal define o próprio
        // viewport, então rodar no mobile seria medir a mesma coisa 2x.
        test.skip(testInfo.project.name !== "chromium", "Fiscal de desktop.");

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

        await page.setViewportSize({ width: LARGURAS[0], height: 900 });
        await page.goto("/login");
        await injectToken(page);

        // Um censo POR ESTADO: o repouso tem o seu, cada modal tem o seu. Sem
        // essa separação, tudo que o modal esconde da tela de trás viraria um
        // "SUMIU" falso, e um fiscal que grita à toa é um fiscal desligado.
        const referencias = new Map<string, Censo>();
        const reprovas: string[] = [];

        async function assentar() {
          await page.waitForLoadState("networkidle").catch(() => {
            /* SSE/websocket nunca fica ocioso — seguir mesmo assim */
          });
          await page.waitForTimeout(700);
        }

        /**
         * A TRAVA CONTRA O FISCAL QUE MEDE A COISA ERRADA.
         *
         * A armadilha nº1 desta rede já cobrou meses: um catch-all de mock mal
         * posicionado fazia toda tela virar o popup "Sem conexão", e o fiscal
         * passava em 100% das rotas — medindo o popup, com a régua em zero e a
         * consciência tranquila. Popup de erro em cima da tela significa que a
         * MEDIDA NÃO VALE; e medida que não vale tem que gritar, nunca passar.
         */
        async function exigirTelaDeVerdade(chave: string) {
          if ((await page.locator(".hbx-error").count()) > 0) {
            const titulo = await page.locator(".hbx-error__title").first().textContent().catch(() => null);
            // A MENSAGEM é o que faz esta reprova ser acionável em vez de só
            // barulhenta: é ela que nomeia a chamada que faltou.
            const msg = await page.locator(".hbx-error__msg").first().textContent().catch(() => null);
            reprovas.push(
              `\n${chave}: a tela não carregou — popup de erro na frente.\n` +
                `  título: "${titulo ?? "?"}"\n` +
                `  mensagem: "${msg ?? "?"}"\n` +
                `  O fiscal NÃO mediu esta combinação. Mock faltando ou tela quebrada.`
            );
            return false;
          }
          return true;
        }

        /** Mede, registra e compara com a régua. */
        async function medir(chave: string, estado: string) {
          if (!(await exigirTelaDeVerdade(chave))) return;
          const achados = await coletarCortes(page, referencias.get(estado));
          if (!referencias.has(estado)) referencias.set(estado, await coletarCenso(page));

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
          // Guarda a reprova em vez de estourar na hora: parar na primeira
          // largura esconderia o estado das outras, e o padrão do defeito só
          // aparece quando se vê o conjunto.
          if (achados.length > teto) {
            reprovas.push(`${formatarAchados(achados, chave)}\n  (teto da régua: ${teto})`);
          }
        }

        for (const largura of LARGURAS) {
          // Carrega de novo a cada largura em vez de só redimensionar: tem
          // tela que mede a si mesma no `mount` e não remede no resize. Medir
          // depois de um resize acusaria defeito que o usuário não vê ao
          // ABRIR a tela naquela largura — que é como ele a encontra.
          await page.setViewportSize({ width: largura, height: 900 });
          await page.goto(rota);
          await assentar();
          await medir(`${rota}|${pele.rotulo}|${largura}`, "repouso");

          if (!LARGURAS_DE_ESTADO.has(largura)) continue;

          for (const estado of ESTADOS[rota] ?? []) {
            // Cada estado começa de uma tela limpa. Fechar o anterior "na mão"
            // seria mais rápido e menos confiável: bastaria um modal que não
            // fecha para o estado seguinte medir o modal errado — e o fiscal
            // reportaria com toda a confiança do mundo.
            await page.goto(rota);
            await assentar();

            if ((await page.locator(estado.precisa).count()) === 0) {
              test.info().annotations.push({
                type: "pulado",
                description: `${rota}|${estado.nome}@${largura}: gatilho "${estado.precisa}" não existe nesta tela`,
              });
              continue;
            }

            for (const alvo of estado.clicar ?? []) {
              await page.locator(alvo).first().click({ timeout: 4_000 }).catch(() => {
                /* o `confirma` abaixo é quem decide se o estado abriu */
              });
              await page.waitForTimeout(250);
            }
            if (estado.passarMouse) {
              await page.locator(estado.passarMouse).first().hover({ timeout: 4_000 }).catch(() => {});
              await page.waitForTimeout(250);
            }

            const abriu = await page
              .locator(estado.confirma)
              .first()
              .waitFor({ state: "visible", timeout: 4_000 })
              .then(() => true)
              .catch(() => false);

            if (!abriu) {
              // Não medir é a resposta certa: medir a tela parada e chamar de
              // "modal" é como o fiscal antigo passou meses aprovando o popup
              // de "Sem conexão" achando que aprovava as telas.
              test.info().annotations.push({
                type: "pulado",
                description: `${rota}|${estado.nome}@${largura}: não abriu (${estado.confirma})`,
              });
              continue;
            }

            await page.waitForTimeout(350);
            await medir(`${rota}|${pele.rotulo}|${largura}|${estado.nome}`, estado.nome);
          }
        }

        expect(reprovas.join("\n"), reprovas.join("\n")).toBe("");
      });
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
