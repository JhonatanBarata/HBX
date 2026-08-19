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
// 🔴 AGORA SÃO DOIS APPS NA MESMA CASCA (LOTE 1 da esteira). A régua passa a
// valer para TODOS os alvos de `scripts/lib/apps.js`, e não para um `index.html`
// cravado: guardar só o do motorista enquanto o app novo nasce com
// `connect-src 'self'` seria a TERCEIRA perda, e desta vez com o portão verde
// do lado. E a FONTE deixou de ser o template do gerador: o valor mora no MAPA
// (campo `connectSrc`), num lugar só para os dois — é o mapa que este teste lê.
//
// AS QUATRO GARANTIAS:
//   1. a FONTE (o mapa) libera o host do painel no connect-src de cada app, e o
//      template do gerador PERGUNTA ao mapa em vez de cravar a linha;
//   2. o `index.html` de cada app está EM DIA com o gerador (senão a próxima
//      injeção derruba o conserto de novo, exatamente como na 2ª perda);
//   3. o host liberado é o MESMO que o app pergunta em tempo de execução — o
//      `productionWebBaseUrl` do build.gradle.kts, que vira `webBaseUrl`;
//   4. a porta MANUAL continua existindo: linha da versão nos Ajustes com o
//      handler `buscar-update`, e o toque forçado responde SEMPRE.
//   5. as duas decisões de <head> que já se perderam por serem escritas no
//      ARQUIVO GERADO em vez do template — a viewport com
//      `interactive-widget=resizes-content` (o teclado do Android) e o PAR de
//      theme-color claro/escuro — saem do template para TODOS os apps. Mesma
//      lição do cordão, outro pedaço do mesmo <head>: decisão escrita no gerado
//      dura até a próxima injeção.
//
// App que ainda não tem `ponte.js` gerado (o `vendas`, até o lote que criar a
// ponte dele) é PULADO COM RECADO nas garantias 3 e 4 — nunca em silêncio:
// pular calado é como um alvo nasce sem fiscal.
// ============================================================

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const GERADOR = read("scripts/casca-injetar.js");
const GRADLE = read("EntregaShell/app/build.gradle.kts");
// O mapa é CommonJS (os geradores são todos CJS) — mesma fonte que a esteira lê.
const { APPS } = createRequire(import.meta.url)("../scripts/lib/apps.js");
const ALVOS = Object.values(APPS);

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
const fontesDe = (app) => String(app.connectSrc).trim().split(/\s+/);
// A CSP que o gerador ESCREVERIA para este app: o template dele, com o único
// pedaço que vem do mapa já substituído. Comparar a política INTEIRA (e não só
// o connect-src) é o que pega qualquer outra palavra que ande sozinha no gerado.
const cspEsperada = (app) => cspDe(GERADOR).replace("${APP.connectSrc}", app.connectSrc);

// O endereço do painel vive num lugar só (build.gradle.kts) e vira `webBaseUrl`
// no `appInfo()` do NativeAppBridge — é dele que o `checkAppUpdate` monta a URL.
const hostDoPainel = (() => {
  const m = GRADLE.match(/val productionWebBaseUrl = "([^"]+)"/);
  assert.ok(m, "build.gradle.kts precisa declarar productionWebBaseUrl");
  return m[1].replace(/\/+$/, "");
})();

test("1. a FONTE libera o painel no connect-src de TODOS os apps (o mapa, não o gerado)", () => {
  assert.match(
    GERADOR,
    /connect-src \$\{APP\.connectSrc\}/,
    "o template do casca-injetar precisa PERGUNTAR o connect-src ao mapa "
      + "(scripts/lib/apps.js). Cravar a linha aqui de novo, agora com dois apps, "
      + "é a 3ª perda deste cordão esperando a vez.",
  );
  assert.ok(ALVOS.length > 0, "scripts/lib/apps.js precisa declarar pelo menos um app");
  for (const app of ALVOS) {
    const fontes = fontesDe(app);
    assert.ok(
      fontes.includes(hostDoPainel),
      `o app "${app.nome}" precisa liberar ${hostDoPainel} no connect-src — sem isso o `
        + `fetch do version-logistica.json morre calado. Achei: ${fontes.join(" ")}`,
    );
    assert.ok(
      fontes.includes("'self'"),
      `o app "${app.nome}": os tiles do mapa e os assets seguem sendo da própria origem`,
    );
  }
});

test("2. o index.html de CADA app está EM DIA com o gerador", () => {
  let medidos = 0;
  for (const app of ALVOS) {
    if (!existsSync(app.indice)) {
      console.log(`  · ${app.nome}: ainda sem ${app.indiceRel} — nada injetado, nada a conferir.`);
      continue;
    }
    medidos += 1;
    assert.equal(
      cspDe(read(app.indiceRel)),
      cspEsperada(app),
      `${app.indiceRel} é GERADO: rode \`node scripts/casca-injetar.js --app ${app.nome}\`. `
        + "Editar o gerado à mão é a 2ª perda deste cordão se repetindo.",
    );
  }
  assert.ok(medidos > 0, "nenhum index.html injetado — a esteira não gerou app nenhum");
});

/* 🔴 O MANIFESTO É POR APP, E ISSO APERTA A RÉGUA — não a afrouxa (19/08).
   Até aqui esta garantia exigia, de TODO alvo, o literal
   `version-logistica.json`. Ela nasceu quando só um app tinha ponte, e a partir
   do momento em que o segundo nasceu ela passaria a exigir o CRUZAMENTO DOS
   FIOS: os dois flavors têm `applicationId` diferente (`br.com.hbxsystem` ×
   `br.com.hbxsystem.logistica`), e um app que lê o manifesto do outro compara a
   própria versão com a de um pacote que nem é ele — anuncia atualização pra
   sempre e, com instalador nativo ligado, instalaria O OUTRO APP ao lado.
   Agora cada alvo é cobrado pelo manifesto DELE (`version-<app>.json`), o que
   torna o cruzamento um teste VERMELHO em vez de o comportamento exigido. O que
   a garantia sempre mediu de verdade continua igual: a URL é montada a partir do
   `webBaseUrl` do `appInfo()` (nunca hardcode de domínio) e o host está liberado
   no `connect-src` daquele app. */
const manifestoDe = (app) => `version-${app.nome}.json`;

test("3. o host liberado é o mesmo que o app pergunta em execução", () => {
  const comPonte = ALVOS.filter((app) => existsSync(app.pontePath));
  assert.ok(comPonte.length > 0, "nenhum app tem ponte.js gerada — rode scripts/ponte-costurar.js");
  for (const app of ALVOS) {
    if (!existsSync(app.pontePath)) {
      console.log(`  · ${app.nome}: ainda sem ${app.ponteRel} — a ponte dele nasce noutro lote.`);
      continue;
    }
    const ponte = read(app.ponteRel);
    assert.ok(
      ponte.includes(`/downloads/${manifestoDe(app)}`),
      `${app.nome}: checkAppUpdate precisa ler o manifesto em <webBaseUrl>/downloads/${manifestoDe(app)} `
        + "— cada app tem o SEU (applicationId diferente); ler o do outro anuncia (ou instala) o app errado.",
    );
    assert.match(
      ponte,
      /fetch\(`\$\{base\}\/downloads\//,
      `${app.nome}: a URL do manifesto se monta a partir do webBaseUrl — nunca um domínio escrito à mão`,
    );
    // Cruzar os fios é vermelho: nenhum app pode citar o manifesto de outro.
    for (const outro of ALVOS) {
      if (outro.nome === app.nome) continue;
      assert.ok(
        !ponte.includes(`/downloads/${manifestoDe(outro)}`),
        `${app.nome}: está lendo o manifesto do "${outro.nome}" (${manifestoDe(outro)}). `
          + "São pacotes DIFERENTES — isso oferece o app errado a quem pediu atualização.",
      );
    }
    assert.match(
      ponte,
      /const base = String\(info\.webBaseUrl \|\| ''\)/,
      `${app.nome}: a origem do update vem do webBaseUrl do appInfo() — nunca hardcode`,
    );
    assert.ok(
      connectSrcDe(cspDe(read(app.indiceRel))).includes(hostDoPainel),
      `${app.nome}: o painel mudou de endereço (${hostDoPainel}) e a CSP não acompanhou`,
    );
  }
});

test("4. a porta MANUAL continua de pé (garantia; o pop-up é conveniência)", () => {
  /* 🔴 O CONTADOR NÃO É ENFEITE — é o que separa "passou" de "não mediu nada".
     As garantias 2 e 3 já contam; esta ficou de fora e virava um `for` que dava
     VERDE sem executar UMA assertiva no dia em que nenhum alvo tivesse ponte.js
     (basta a ponte não ter sido costurada antes do teste). Portão que não mede
     nada é pior que portão vermelho: ele afirma que a porta manual existe. */
  let medidos = 0;
  for (const app of ALVOS) {
    if (!existsSync(app.pontePath)) {
      console.log(`  · ${app.nome}: ainda sem ${app.ponteRel} — porta manual nasce com a ponte dele.`);
      continue;
    }
    medidos += 1;
    const ponte = read(app.ponteRel);
    assert.match(ponte, /'buscar-update': \(\) => \{ checkAppUpdate\(true\); \}/, `${app.nome}: o toque na linha da versão precisa forçar a checagem`);
    assert.match(ponte, /function linhaDaVersao\(\)/, `${app.nome}: a linha da versão dos Ajustes é a porta manual`);
    assert.match(ponte, /respostaSeco\('Tudo certo'/, `${app.nome}: forçado sem novidade tem que RESPONDER — botão calado é botão morto`);
    // Bloqueio de política e internet caída não podem mais dar a mesma frase: foi
    // essa confusão que mandou o dono conferir o wi-fi por dois dias.
    assert.match(ponte, /securitypolicyviolation/, `${app.nome}: o catch precisa saber distinguir CSP de rede`);
  }
  assert.ok(medidos > 0, "nenhum app tem ponte.js gerada — rode scripts/ponte-costurar.js; sem isso esta garantia não mediu porta manual nenhuma");
});

/* 🔴 A MESMA DOENÇA DO CORDÃO, EM OUTROS DOIS <meta> — e uma cura que quase
   virou defeito novo.

   O `index.html` do vendas tinha, antes de virar gerado, a viewport com
   `interactive-widget=resizes-content`; ela sumiu CALADA na primeira injeção,
   porque o template só parametrizava título/theme-color/scripts/connect-src.
   Sem ela o teclado do Android EMPURRA a página em vez de re-layoutar, e o
   campo focado some atrás do próprio teclado. Voltou — mas pelo MAPA, porque
   ela DIVERGE por app: o vendas é de formulário e a quer; o do motorista está
   em produção com tela cheia de mapa e não muda de comportamento sem pedido.

   🔴 E O THEME-COLOR CONTINUA SENDO UM VALOR SÓ. Em 19/08 tentou-se o par
   `media="(prefers-color-scheme: …)"` "para a barra não ficar preta no modo
   claro". Ele MENTE: quem decide o modo de luz deste app é `temaResolvido()`
   (native.js) — escolha manual do dono › virada de turno (noite ⇒ escuro) › e
   só então o aparelho. Uma `<meta media>` enxerga APENAS o aparelho. À noite o
   app fica escuro sozinho; com o Android no claro, a barra pintaria CLARA sobre
   tela ESCURA — pior que o defeito que ela ia curar. A cura de verdade é o
   `applyTheme()` reescrever esta meta junto com o `data-luz` (um dono só do
   tema). Enquanto isso não nasce, o valor fixo erra menos — e este teste existe
   para que o par não volte por engano. */
test("5. o <head> gerado pergunta viewport e theme-color ao mapa (e o theme-color NÃO vira par de media)", () => {
  assert.match(
    GERADOR,
    /<meta name="viewport" content="\$\{APP\.viewport\}">/,
    "o template do casca-injetar precisa PERGUNTAR a viewport ao mapa (scripts/lib/apps.js): "
      + "ela diverge por app e cravá-la aqui apagaria a divergência.",
  );
  assert.match(
    GERADOR,
    /<meta name="theme-color" content="\$\{APP\.themeColor\}">/,
    "o template precisa PERGUNTAR o theme-color ao mapa — e escrever UM valor.",
  );
  assert.doesNotMatch(
    GERADOR,
    /name="theme-color"[^>]*prefers-color-scheme/,
    "theme-color com `media=(prefers-color-scheme)` MENTE neste app: quem manda no modo de luz é "
      + "temaResolvido() (dono › turno › aparelho) e a media query só vê o aparelho. "
      + "À noite pintaria a barra ao contrário da tela. Leia o comentário acima antes de reintroduzir.",
  );

  let medidos = 0;
  for (const app of ALVOS) {
    assert.ok(
      typeof app.viewport === "string" && app.viewport.includes("width=device-width"),
      `o app "${app.nome}": \`viewport\` tem que estar no mapa (scripts/lib/apps.js)`,
    );
    assert.ok(
      typeof app.themeColor === "string" && /^#[0-9a-fA-F]{3,8}$/.test(app.themeColor),
      `o app "${app.nome}": \`themeColor\` é UM valor (string hex), não o par { claro, escuro }`,
    );
    if (!existsSync(app.indice)) {
      console.log(`  · ${app.nome}: ainda sem ${app.indiceRel} — nada injetado, nada a conferir.`);
      continue;
    }
    medidos += 1;
    const indice = read(app.indiceRel);
    const viewport = indice.match(/<meta name="viewport" content="([^"]+)"/);
    assert.equal(
      viewport && viewport[1],
      app.viewport,
      `${app.indiceRel} é GERADO: rode \`node scripts/casca-injetar.js --app ${app.nome}\`.`,
    );
    const tinta = indice.match(/<meta name="theme-color" content="([^"]+)"\s*>/);
    assert.equal(
      tinta && tinta[1],
      app.themeColor,
      `${app.indiceRel}: o theme-color tem que bater com o mapa — barra do sistema e fundo da tela são a mesma tinta.`,
    );
  }
  assert.ok(medidos > 0, "nenhum index.html injetado — esta garantia não mediu <head> nenhum");
});
