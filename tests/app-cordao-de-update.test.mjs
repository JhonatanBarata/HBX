// ============================================================
// O CORDÃO DE ATUALIZAÇÃO DO APK — a linha de CSP que já se perdeu DUAS vezes.
//
// A cena (aparelho do dono, APK 211, 09/08/2026): Ajustes > "Versão alpha1
// (211) · toque para procurar atualização" respondia
//
//     "Não deu certo · Não consegui verificar agora. Confira a internet."
//
// com a internet perfeita e o servidor certo (`version-logistica.json` 200,
// com o Access-Control-Allow-Origin da WebView). Quem barrava era a CSP do
// PRÓPRIO app: `connect-src 'self'`.
//
// POR QUE SÓ O UPDATE QUEBRA: o `checkAppUpdate` é a única coisa deste app que
// fala rede por `fetch` — todo o resto passa pela ponte nativa (Kotlin), que
// não sente CSP. Então a perda dessa palavra não derruba tela nenhuma: ela
// mata, calado, o único caminho pelo qual o aparelho descobre que existe versão
// nova. Aparelho que não descobre update é aparelho congelado pra sempre.
//
// AS DUAS PERDAS, e por que este arquivo existe:
//   1ª — a fusão de 07/08 apagou o app.js e levou o cordão junto;
//   2ª — o conserto (8ea965d1) foi escrito à mão no `index.html`, que é GERADO
//        por `scripts/casca-injetar.js`; a injeção seguinte (e8033eb9, 5 h
//        depois) devolveu o `self` sozinho, sem ninguém tocar no assunto.
//
// AS QUATRO GARANTIAS:
//   1. o GERADOR (a fonte) libera o host do painel no connect-src;
//   2. o `index.html` do APK está EM DIA com o gerador (senão a próxima injeção
//      derruba o conserto de novo, exatamente como na 2ª perda);
//   3. o host liberado é o MESMO que o app pergunta em tempo de execução — o
//      `productionWebBaseUrl` do build.gradle.kts, que vira `webBaseUrl`;
//   4. a porta MANUAL continua existindo: linha da versão nos Ajustes com o
//      handler `buscar-update`, e o toque forçado responde SEMPRE.
// ============================================================

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const GERADOR = read("scripts/casca-injetar.js");
const INDEX = read("EntregaShell/app/src/logistica/assets/app/index.html");
const PONTE = read("EntregaShell/app/src/logistica/assets/app/ponte.js");
const GRADLE = read("EntregaShell/app/build.gradle.kts");

/* 🔴 A RÉGUA MEDE A POLÍTICA, NÃO O COMENTÁRIO (a lição do fiscal que media o
   popup de erro). O comentário que explica este conserto CITA `connect-src` e o
   domínio — medir o arquivo cru daria verde mesmo com a meta tag errada. */
const cspDe = (arquivo) => {
  const m = arquivo.match(
    /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/,
  );
  return m ? m[1] : "";
};
const connectSrcDe = (csp) => {
  const m = csp.match(/connect-src ([^;]+)/);
  return m ? m[1].trim().split(/\s+/) : [];
};

// O endereço do painel vive num lugar só (build.gradle.kts) e vira `webBaseUrl`
// no `appInfo()` do NativeAppBridge — é dele que o `checkAppUpdate` monta a URL.
const hostDoPainel = (() => {
  const m = GRADLE.match(/val productionWebBaseUrl = "([^"]+)"/);
  assert.ok(m, "build.gradle.kts precisa declarar productionWebBaseUrl");
  return m[1].replace(/\/+$/, "");
})();

test("1. o GERADOR libera o painel no connect-src (a fonte, não o gerado)", () => {
  const fontes = connectSrcDe(cspDe(GERADOR));
  assert.ok(fontes.length > 0, "casca-injetar.js precisa escrever uma CSP com connect-src");
  assert.ok(
    fontes.includes(hostDoPainel),
    `o gerador precisa liberar ${hostDoPainel} no connect-src — sem isso o `
      + `fetch do version-logistica.json morre calado. Achei: ${fontes.join(" ")}`,
  );
  assert.ok(fontes.includes("'self'"), "os tiles do mapa e os assets seguem sendo da própria origem");
});

test("2. o index.html do APK está EM DIA com o gerador", () => {
  assert.equal(
    cspDe(INDEX),
    cspDe(GERADOR),
    "index.html é GERADO: rode `node scripts/casca-injetar.js`. Editar o gerado "
      + "à mão é a 2ª perda deste cordão se repetindo.",
  );
});

test("3. o host liberado é o mesmo que o app pergunta em execução", () => {
  assert.match(
    PONTE,
    /fetch\(`\$\{base\}\/downloads\/version-logistica\.json`/,
    "checkAppUpdate precisa ler o manifesto em <webBaseUrl>/downloads/version-logistica.json",
  );
  assert.match(
    PONTE,
    /const base = String\(info\.webBaseUrl \|\| ''\)/,
    "a origem do update vem do webBaseUrl do appInfo() — nunca hardcode",
  );
  assert.ok(
    connectSrcDe(cspDe(INDEX)).includes(hostDoPainel),
    `o painel mudou de endereço (${hostDoPainel}) e a CSP não acompanhou`,
  );
});

test("4. a porta MANUAL continua de pé (garantia; o pop-up é conveniência)", () => {
  assert.match(PONTE, /'buscar-update': \(\) => \{ checkAppUpdate\(true\); \}/, "o toque na linha da versão precisa forçar a checagem");
  assert.match(PONTE, /function linhaDaVersao\(\)/, "a linha da versão dos Ajustes é a porta manual");
  assert.match(PONTE, /respostaSeco\('Tudo certo'/, "forçado sem novidade tem que RESPONDER — botão calado é botão morto");
  // Bloqueio de política e internet caída não podem mais dar a mesma frase: foi
  // essa confusão que mandou o dono conferir o wi-fi por dois dias.
  assert.match(PONTE, /securitypolicyviolation/, "o catch precisa saber distinguir CSP de rede");
});
