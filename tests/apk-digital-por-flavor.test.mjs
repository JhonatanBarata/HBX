// ============================================================
// A DIGITAL É POR APP — o portão que decide QUEM baixa 3 MB.
//
// A CENA que este arquivo existe pra impedir (19/08): o publish sobe DOIS apks,
// mas a impressão digital que decide o versionCode varria `EntregaShell/app/src`
// INTEIRO. Quer dizer: um arquivo criado em `src/vendas/` — um app que o
// motorista não tem, num sourceSet que o Gradle nem empacota no APK dele —
// mudava a digital do LOGÍSTICA, subia o versionCode dele e mandava a frota
// inteira baixar um binário byte-a-byte igual ao que já estava no aparelho.
// Ninguém vê erro: celular baixando à toa não reclama, só gasta o dado do
// motorista e o tempo dele parado no meio da rua.
//
// 🔴 E O ERRO CONTRÁRIO É PIOR, POR ISSO ELE TAMBÉM É MEDIDO AQUI. Recortar
// demais — deixar `src/logistica` fora da conta do logística — congela a frota:
// o servidor serve APK novo, a digital não muda, o versionCode não anda e
// NENHUM aparelho vê atualização. É o caso 95→110 e 156→170 do build.gradle.kts,
// que nesta casa já custou meio conserto no ar sem ninguém enxergar. Por isso
// este teste prova os DOIS sentidos, sempre: o que NÃO pode subir e o que TEM de
// subir.
//
// COMO SE MEDE, e por que não é no repo vivo: as garantias de comportamento
// rodam sobre uma ÁRVORE DE MENTIRA num diretório temporário (o
// `computeApkFingerprint` aceita a raiz por parâmetro justamente pra isso).
// Portão que escreve dentro de `EntregaShell/` pra medir é portão que um dia
// deixa lixo no repo — ou pior, apaga o que outra sessão estava escrevendo.
// As garantias de CONTRATO (o que a lista inclui e exclui) rodam no repo de
// verdade, sem tocar em nada.
// ============================================================

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { computeApkFingerprint, arquivosDaDigital, androidApps, readFlavorVersion, arquivoDeVersaoRel } =
  require_("../scripts/ops/deploy-vps.js");

const REPO = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const PROJETO = path.join(REPO, "EntregaShell");

/* ------------------------------------------------------------------
   A árvore de mentira: um EntregaShell em miniatura, com os dois flavors,
   o `main` compartilhado, o `test` (que não viaja no APK) e o checkout que o
   Gradle copia de um flavor pro outro.
   ------------------------------------------------------------------ */
function escrever(raiz, relativo, conteudo) {
  const destino = path.join(raiz, relativo);
  mkdirSync(path.dirname(destino), { recursive: true });
  writeFileSync(destino, conteudo);
}

function arvoreDeMentira() {
  const raiz = mkdtempSync(path.join(tmpdir(), "hbx-digital-"));
  escrever(raiz, "app/build.gradle.kts", "android { }\n");
  escrever(raiz, "app/proguard-rules.pro", "-keep class **\n");
  escrever(raiz, "app/google-services.json", '{"project_info":{}}\n');
  escrever(raiz, "build.gradle.kts", "plugins { }\n");
  escrever(raiz, "settings.gradle.kts", "include(\":app\")\n");
  escrever(raiz, "gradle.properties", "org.gradle.jvmargs=-Xmx2g\n");
  escrever(raiz, "app/src/main/java/Ponte.kt", "class Ponte\n");
  escrever(raiz, "app/src/logistica/assets/app/mock.js", "// motorista\n");
  escrever(raiz, "app/src/logistica/assets/app/ponte.js", "// ponte do motorista, COSTURADA\n");
  escrever(raiz, "app/src/checkout-mp/assets/checkout/checkout.js", "// recarga\n");
  escrever(raiz, "app/src/logistica/ponte-src/00-nucleo.js", "// fonte da ponte do motorista\n");
  escrever(raiz, "app/src/vendas/assets/app/mock.js", "// vendedor\n");
  escrever(raiz, "app/src/vendas/assets/app/ponte.js", "// ponte do vendedor, COSTURADA\n");
  escrever(raiz, "app/src/vendas/ponte-src/00-nucleo.js", "// fonte da ponte do vendedor\n");
  escrever(raiz, "app/src/vendas/ponte-src/LEIA-ME.md", "# como se pica a ponte\n");
  escrever(raiz, "app/src/test/java/Fiscal.kt", "class Fiscal\n");
  escrever(raiz, "app/src/videoStudio/java/Video.kt", "class Video\n");
  // A ALAVANCA DE VERSÃO DE CADA APP: um arquivo por app, FORA do build.gradle.kts.
  escrever(raiz, "app/versao-logistica.properties", "versionCode=346\nversionName=alpha1\n");
  escrever(raiz, "app/versao-vendas.properties", "versionCode=20\nversionName=2.0.1\n");
  return raiz;
}

/** roda `medir` com a árvore de mentira e limpa o tmp mesmo se a assertiva quebrar. */
function comArvore(medir) {
  const raiz = arvoreDeMentira();
  try {
    return medir(raiz, (flavor) => computeApkFingerprint(flavor, path.join(raiz)));
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}

test("🔴 mexer SÓ em src/vendas NÃO move o versionCode do logística (a frota não baixa nada)", () => {
  comArvore((raiz, digital) => {
    const antesLog = digital("logistica");
    const antesVen = digital("vendas");

    // ARQUIVO NOVO no que VIAJA no APK do vendas — o caso da cena, a casca dele crescendo.
    escrever(raiz, "app/src/vendas/assets/app/tela-nova.js", "// tela nova do vendedor\n");
    // E arquivo EDITADO, que é o dia a dia depois que ela nasce.
    escrever(raiz, "app/src/vendas/assets/app/mock.js", "// vendedor, outra tela\n");

    assert.equal(
      digital("logistica"),
      antesLog,
      "a digital do LOGÍSTICA mudou por causa de arquivo do VENDAS — é a frota inteira de "
        + "motoristas baixando ~3 MB por uma mudança que o Gradle nem empacota no APK deles.",
    );
    assert.notEqual(
      digital("vendas"),
      antesVen,
      "a digital do VENDAS não mudou com o próprio código mudando — o versionCode dele ficaria "
        + "parado e nenhum aparelho veria a correção (o caso 95→110 do build.gradle.kts).",
    );
  });
});

test("🔴 mexer em src/logistica MOVE o versionCode do logística (senão a frota congela)", () => {
  comArvore((raiz, digital) => {
    const antesLog = digital("logistica");
    const antesVen = digital("vendas");

    escrever(raiz, "app/src/logistica/assets/app/mock.js", "// motorista, tela nova\n");

    assert.notEqual(
      digital("logistica"),
      antesLog,
      "recorte apertado demais: o app do motorista mudou e a digital ficou igual. O servidor "
        + "serviria APK novo com versionCode parado e NENHUM celular veria a atualização.",
    );
    assert.equal(
      digital("vendas"),
      antesVen,
      "a digital do VENDAS mudou por causa de arquivo do LOGÍSTICA que não entra no APK dele.",
    );
  });
});

test("o que é de MAIN e do GRADLE move os DOIS — é o que vai dentro dos dois binários", () => {
  comArvore((raiz, digital) => {
    const log0 = digital("logistica");
    const ven0 = digital("vendas");

    escrever(raiz, "app/src/main/java/Ponte.kt", "class Ponte { fun nova() {} }\n");
    const log1 = digital("logistica");
    const ven1 = digital("vendas");
    assert.notEqual(log1, log0, "app/src/main é o Kotlin dos dois apps: mudou ali, mudou nos dois");
    assert.notEqual(ven1, ven0, "app/src/main é o Kotlin dos dois apps: mudou ali, mudou nos dois");

    escrever(raiz, "app/build.gradle.kts", "android { compileSdk = 36 }\n");
    assert.notEqual(digital("logistica"), log1, "o gradle decide os dois binários");
    assert.notEqual(digital("vendas"), ven1, "o gradle decide os dois binários");
  });
});

test("🔴 o checkout move o VENDAS e NÃO move o Logística — ele só viaja num dos dois APKs", () => {
  /* `prepareVendasCheckoutAssets` (EntregaShell/app/build.gradle.kts) faz
     `from("src/checkout-mp/assets/checkout")` para dentro do sourceSet do vendas.
     Recortar a digital "por flavor" sem enxergar esse cano faria uma correção no
     checkout mudar o APK do Vendas SEM mudar a digital dele — versão parada,
     aparelho nunca atualizando, e nenhum erro em tela.

     🔴 A SEGUNDA METADE DESTE PORTÃO NASCEU EM 20/08/2026, e é a mais importante:
     até então o checkout morava DENTRO de `app/src/logistica/` e entrava nos dois
     APKs. Quando o Logística virou app só de Google Play, ele teve de sair de lá —
     formulário de cartão de gateway externo não pode viajar num binário de loja,
     nem que nenhum botão chame a tela (o revisor extrai o .aab e acha).
     Se um dia alguém devolver a pasta para o sourceSet do logística, a digital
     dele volta a sentir o checkout — e é ISSO que a segunda asserção pega, antes
     que o binário chegue na revisão da Google. */
  comArvore((raiz, digital) => {
    const antesLog = digital("logistica");
    const antesVen = digital("vendas");
    escrever(raiz, "app/src/checkout-mp/assets/checkout/checkout.js", "// recarga corrigida\n");
    assert.notEqual(digital("vendas"), antesVen,
      "o checkout entra no APK do Vendas e a digital dele não sentiu — correção de recarga "
      + "publicada e nenhum aparelho de Vendas vendo versão nova.");
    assert.equal(digital("logistica"), antesLog,
      "o checkout do Mercado Pago voltou a contar na digital do LOGÍSTICA — ou seja, voltou a "
      + "ser empacotado no app que vai para a Google Play. Isso reprova em Pagamentos. "
      + "Confira o sourceSet em app/build.gradle.kts e docs/Rules/ANDROID-PLAY.md §3.2.");
  });
});

test("🔴 a FONTE da ponte não move ninguém sozinha — quem viaja é o ponte.js costurado", () => {
  /* `app/src/<flavor>/ponte-src/` NÃO é sourceSet do Gradle: de dentro de
     `app/src/<flavor>/` só `assets/`, `java/` e `res/` entram no APK. A pasta
     mora ali por vizinhança (o cabeçalho do ponte-costurar.js explica: a fonte
     ficou FORA de `assets/` pra não embarcar 589 KB que ninguém carrega).
     Contando ela, editar um COMENTÁRIO no `ponte-src/LEIA-ME.md` subia o
     versionCode e mandava a frota baixar um APK byte-a-byte idêntico.

     🔴 E O INVERSO É O QUE ESTE TESTE MEDE JUNTO, porque é o buraco fácil de
     abrir aqui: a ponte de verdade TEM que mover a versão. Ela move pelo
     GERADO — `assets/app/ponte.js`, que o publish costura e confere para TODOS
     os alvos antes de calcular a digital. Fonte que muda ⇒ costura muda ⇒
     ponte.js muda ⇒ digital muda. */
  comArvore((raiz, digital) => {
    const antesVen = digital("vendas");
    const antesLog = digital("logistica");

    // (a) o que NÃO viaja: o LEIA-ME da fonte, e uma fonte cuja costura ainda
    //     não foi rodada (o publish roda antes da conta — ver costurarPonteDoApp).
    escrever(raiz, "app/src/vendas/ponte-src/LEIA-ME.md", "# como se pica a ponte, agora com exemplo\n");
    escrever(raiz, "app/src/vendas/ponte-src/00-nucleo.js", "// fonte da ponte do vendedor, mexida\n");
    assert.equal(digital("vendas"), antesVen,
      "editar a FONTE/LEIA-ME da ponte moveu a digital do Vendas sem o gerado mudar: é 3 MB de "
      + "download pra frota por um arquivo que o Gradle nem empacota");
    assert.equal(digital("logistica"), antesLog, "e muito menos pode mover o app do outro");

    // (b) o que VIAJA: o ponte.js costurado, que é o efeito real da mudança acima.
    escrever(raiz, "app/src/vendas/assets/app/ponte.js", "// ponte do vendedor, COSTURADA de novo\n");
    assert.notEqual(digital("vendas"), antesVen,
      "o ponte.js embarcado mudou e a digital não sentiu — o APK novo iria pro servidor com o "
      + "versionCode parado e NENHUM aparelho veria a correção");
    assert.equal(digital("logistica"), antesLog,
      "a ponte do Vendas não pode mover a versão do app do MOTORISTA");
  });
});

test("🔴 a alavanca de versão de um app não acorda a frota do outro", () => {
  /* O piso do versionCode morava dentro de `app/build.gradle.kts`, que está na
     digital dos DOIS apks (e tem que estar: o Gradle decide os dois binários).
     Consequência medida: subir SÓ o piso do Vendas mudava o hash do LOGÍSTICA e
     mandava todo motorista baixar um APK byte-a-byte idêntico ao que já tinha.
     O próprio arquivo documenta 5+ subidas manuais do piso do logística — cinco
     downloads inúteis da frota do outro app, um por subida. */
  comArvore((raiz, digital) => {
    const antesLog = digital("logistica");
    const antesVen = digital("vendas");

    escrever(raiz, "app/versao-vendas.properties", "versionCode=21\nversionName=2.0.1\n");
    assert.equal(digital("logistica"), antesLog,
      "subir o piso do VENDAS moveu a digital do LOGÍSTICA — é a frota inteira de motoristas "
      + "baixando por causa de um número que não entra no APK deles");
    assert.notEqual(digital("vendas"), antesVen,
      "subir o próprio piso não moveu a digital do app: a alavanca manual não teria efeito nenhum");

    const meioLog = digital("logistica");
    const meioVen = digital("vendas");
    escrever(raiz, "app/versao-logistica.properties", "versionCode=347\nversionName=alpha1\n");
    assert.notEqual(digital("logistica"), meioLog,
      "o piso do logística é a ALAVANCA MANUAL de update da frota: sem efeito na digital, ela some");
    assert.equal(digital("vendas"), meioVen,
      "o piso do LOGÍSTICA moveu a digital do VENDAS — o mesmo defeito, virado do avesso");
  });
});

test("teste unitário e variante de vídeo NÃO movem ninguém — não viajam no APK", () => {
  comArvore((raiz, digital) => {
    const log0 = digital("logistica");
    const ven0 = digital("vendas");
    escrever(raiz, "app/src/test/java/Fiscal.kt", "class Fiscal { fun novo() {} }\n");
    escrever(raiz, "app/src/videoStudio/java/Video.kt", "class Video { fun novo() {} }\n");
    assert.equal(digital("logistica"), log0, "app/src/test e app/src/videoStudio não vão pro celular do motorista");
    assert.equal(digital("vendas"), ven0, "app/src/test e app/src/videoStudio não vão pro celular do vendedor");
  });
});

test("digital SEM DONO reprova alto — nunca cai no app do motorista por default", () => {
  /* Um `flavor = 'logistica'` de default faria toda chamada esquecida medir o
     app errado e devolver VERDE. Verde que mede a coisa errada é pior que
     vermelho: é assim que se publica APK com a versão do vizinho. */
  assert.throws(() => computeApkFingerprint(), /de QUAL app/);
  assert.throws(() => arquivosDaDigital(), /obrigatório/);
});

/* ------------------------------------------------------------------
   CONTRATO, medido no repo VIVO (sem escrever nada).
   ------------------------------------------------------------------ */
test("no repo de verdade, a lista de cada app não invade o sourceSet do outro", () => {
  const rel = (p) => path.relative(PROJETO, p).split(path.sep).join("/");
  const listas = Object.fromEntries(
    Object.keys(androidApps).map((nome) => [nome, arquivosDaDigital(nome).map(rel)]),
  );

  assert.ok(listas.logistica.length > 0 && listas.vendas.length > 0,
    "as duas listas precisam ter arquivo — lista vazia dá hash constante e o versionCode nunca anda");

  const invasores = listas.logistica.filter((f) => f.startsWith("app/src/vendas/"));
  assert.deepEqual(invasores, [],
    "a digital do LOGÍSTICA está lendo arquivos de app/src/vendas — cada um deles é um publish "
      + "que manda a frota de motoristas baixar por nada:\n  " + invasores.join("\n  "));

  // O vendas pode ler do logística UMA coisa só: o checkout que o Gradle copia.
  const doOutro = listas.vendas.filter((f) => f.startsWith("app/src/checkout-mp/"));
  for (const arquivo of doOutro) {
    assert.ok(
      arquivo.startsWith("app/src/checkout-mp/assets/checkout/"),
      `a digital do VENDAS está lendo ${arquivo}, que não é o checkout compartilhado. `
        + "Ou o Gradle passou a copiar mais coisa (e aí a lista de extras tem que dizer isso), "
        + "ou a digital voltou a varrer o sourceSet do vizinho.",
    );
  }
  assert.ok(doOutro.length > 0,
    "o checkout compartilhado sumiu da digital do VENDAS — ele É empacotado no APK dele "
      + "(prepareVendasCheckoutAssets), então correção de recarga sairia sem versão nova");

  // A FONTE da ponte não pode estar na conta de ninguém: ela não viaja no APK
  // (só `assets/`, `java/` e `res/` do sourceSet viajam). Quem carrega a
  // mudança dela é o `ponte.js` COSTURADO, que está em assets/ e é regerado
  // pelo publish antes desta conta.
  for (const [nome, lista] of Object.entries(listas)) {
    const fontes = lista.filter((f) => f.includes("/ponte-src/"));
    assert.deepEqual(fontes, [],
      `${nome}: a digital conta a FONTE da ponte, que o Gradle não empacota. Editar um comentário `
        + `no LEIA-ME dela subiria o versionCode e mandaria a frota baixar um APK idêntico:\n  `
        + fontes.join("\n  "));
    assert.ok(lista.some((f) => f.endsWith(`app/src/${androidApps[nome].flavor}/assets/app/ponte.js`)),
      `${nome}: o ponte.js COSTURADO sumiu da digital. É ele que carrega a mudança da ponte pra `
        + "dentro do APK — fora da conta, correção de ponte sai publicada e nenhum aparelho atualiza");
  }

  // Os dois têm que ver o que é comum, senão a frota congela.
  for (const [nome, lista] of Object.entries(listas)) {
    assert.ok(lista.some((f) => f.startsWith("app/src/main/")),
      `${nome}: app/src/main é o Kotlin que roda nos dois apps e sumiu da digital`);
    assert.ok(lista.includes("app/build.gradle.kts"),
      `${nome}: o build.gradle.kts decide o binário — fora da digital, mudança de build sai sem versão nova`);
    // 🔴 E O ARQUIVO DE VERSÃO É SÓ DELE. É a alavanca manual do update daquele
    // app; na conta do vizinho, subir um piso acorda a frota do outro.
    const versaoDele = arquivoDeVersaoRel(androidApps[nome].flavor).split(path.sep).join("/");
    assert.ok(lista.includes(versaoDele),
      `${nome}: ${versaoDele} fora da digital — subir o piso não teria efeito nenhum`);
    const versaoAlheia = Object.values(androidApps)
      .filter((outro) => outro.flavor !== androidApps[nome].flavor)
      .map((outro) => arquivoDeVersaoRel(outro.flavor).split(path.sep).join("/"))
      .filter((f) => lista.includes(f));
    assert.deepEqual(versaoAlheia, [],
      `${nome}: a digital lê o arquivo de versão de OUTRO app (${versaoAlheia.join(", ")}) — `
        + "subir o piso de um mandaria a frota do outro baixar um APK idêntico");
    assert.ok(lista.some((f) => f.startsWith(`app/src/${androidApps[nome].flavor}/`)),
      `${nome}: o sourceSet do próprio app sumiu da digital — o app mudaria sem versão nova`);
    assert.ok(!lista.some((f) => f.startsWith("app/src/test/") || f.startsWith("app/src/videoStudio/")),
      `${nome}: teste unitário/variante de vídeo não viajam no APK e não podem mover a versão`);
    assert.ok(!lista.some((f) => f.includes("/build/") || f.includes("/.gradle/")),
      `${nome}: saída de compilador na digital faz o hash mudar sozinho a cada build`);
  }
});

test("🔴 os DOIS apps têm piso próprio, e o publish consegue LER o de cada um", () => {
  /* Em 22/07 este parser parou de achar o versionCode do logística (o flavor
     trocou o literal por uma variável) e TODO publish que encostava no APK
     morria com exit 0, sem subir nada e sem ninguém ver. Com dois apps a mesma
     quebra passa a atingir um enquanto o outro segue verde — pior ainda.
     🔴 E O PISO DO VENDAS TEM UM NÚMERO MÍNIMO QUE NÃO É OPINIÃO: o
     `applicationId` dele é `br.com.hbxsystem`, o do app ANTIGO já instalado em
     campo, e o que está publicado hoje é versionCode 9 (medido com `aapt dump
     badging` no APK servido em /download/android). Piso ≤ 9 = aparelho
     recusando o pacote (INSTALL_FAILED_VERSION_DOWNGRADE) ou instalando sem
     nunca ver "versão nova". */
  const VERSIONCODE_JA_DISTRIBUIDO_NO_VENDAS = 9;

  for (const [nome, app] of Object.entries(androidApps)) {
    const versao = readFlavorVersion(app);
    assert.ok(Number.isInteger(versao.versionCode) && versao.versionCode > 0,
      `${nome}: o publish não conseguiu ler o versionCode do flavor — é o publish de 22/07 `
        + "morrendo com exit 0 e nenhum celular atualizando");
    assert.ok(typeof versao.versionName === "string" && versao.versionName.length > 0,
      `${nome}: sem versionName o manifesto anuncia uma versão que ninguém sabe nomear`);
    assert.ok(app.gradleProperty,
      `${nome}: sem propriedade do gradle o número decidido no publish não chega no binário`);
  }

  assert.ok(
    readFlavorVersion(androidApps.vendas).versionCode > VERSIONCODE_JA_DISTRIBUIDO_NO_VENDAS,
    `o piso do Vendas precisa ficar ACIMA de ${VERSIONCODE_JA_DISTRIBUIDO_NO_VENDAS}, que é o `
      + "versionCode do Salehbx.apk publicado (br.com.hbxsystem, o mesmo pacote do app antigo em "
      + "campo). Igual ou abaixo, o aparelho recusa a instalação por downgrade — ou instala e nunca "
      + "enxerga atualização nenhuma.",
  );

  /* 🔴 O NÚMERO LIDO É O DECLARADO, NÃO UM QUE APARECE NUM COMENTÁRIO.
     Isto não é hipótese: aconteceu escrevendo esta leva. O arquivo do piso é
     mais comentário que dado — a história de cada subida mora nele e cita
     números o tempo todo ("herdar o versionCode = 9 do defaultConfig") — e a
     regex do publish casou dentro de uma dessas FRASES, devolvendo 9 no lugar
     de 20. Estrago mudo dos dois lados: pra menos, o publish carimba uma versão
     que o aparelho recusa por downgrade; pra mais, o manifesto anuncia uma
     versão que o APK não tem e o celular baixa em loop sem nunca chegar nela.
     Aqui o valor é conferido contra a linha `versionCode=N` ancorada em início
     de linha — caminho independente do leitor que está sendo medido. */
  for (const [nome, app] of Object.entries(androidApps)) {
    const arquivo = arquivoDeVersaoRel(app.flavor);
    const texto = readFileSync(path.join(PROJETO, arquivo), "utf8");
    const declarado = /^versionCode=(\d+)$/m.exec(texto);
    assert.ok(declarado, `${nome}: não achei a linha \`versionCode=N\` em ${arquivo}`);
    assert.equal(
      readFlavorVersion(app).versionCode,
      Number(declarado[1]),
      `${nome}: o publish leu um versionCode diferente do que o arquivo DECLARA — quase certamente `
        + "casou dentro de um comentário. O número que o publish carimba tem que ser o número que "
        + "entra no binário, senão o manifesto e o APK contam histórias diferentes.",
    );
    /* 🔴 E O GRADLE TEM QUE LER O MESMO ARQUIVO. Se o build.gradle.kts voltar a
       carregar um literal próprio, o publish carimba um número no manifesto e o
       Gradle carimba OUTRO no binário — o celular baixa e continua "desatualizado"
       para sempre, sem erro em tela. */
    const gradleTexto = readFileSync(path.join(PROJETO, "app", "build.gradle.kts"), "utf8");
    assert.match(gradleTexto, new RegExp(`versionCodeDoApp\\("${app.flavor}", "${app.gradleProperty}"\\)`),
      `${nome}: o build.gradle.kts não lê o piso de ${arquivo} — manifesto e binário passariam a `
        + "contar histórias diferentes");
    assert.match(gradleTexto, new RegExp(`versionNameDoApp\\("${app.flavor}"\\)`),
      `${nome}: o versionName do flavor voltou a ser literal no gradle — o publish leria outro`);
  }

  // Cada app com o SEU arquivo de piso: um piso compartilhado faz o número de um
  // andar por causa do outro, que é justamente o que esta leva veio matar.
  const pisos = Object.values(androidApps).map((app) => arquivoDeVersaoRel(app.flavor));
  assert.equal(new Set(pisos).size, pisos.length, "dois apps não podem dividir o mesmo arquivo de piso");
  const props = Object.values(androidApps).map((app) => app.gradleProperty);
  assert.equal(new Set(props).size, props.length, "dois apps não podem dividir a mesma propriedade do gradle");
  const manifestos = Object.values(androidApps).map((app) => app.manifesto);
  assert.equal(new Set(manifestos).size, manifestos.length,
    "dois apps não podem dividir o mesmo manifesto: applicationId diferente, ler o do outro oferece o app errado");
});

test("cada manifesto declarado tem um bloco escrito no snippet do nginx (o CONTEÚDO)", () => {
  /* ⚠️ ESTE TESTE NÃO PROVA QUE A ROTA EXISTE NO AR, e é importante dizer isso
     em voz alta: até 19/08 o bloco do version-vendas.json estava neste arquivo,
     comentado e correto, enquanto a rota respondia 404 em produção — porque
     `deploy/nginx/*.conf` era um ESPELHO do servidor e ninguém instalava nada.
     Um portão que lesse só isto ficaria VERDE o tempo todo em que o canal
     esteve morto. Aqui se mede o CONTEÚDO do arquivo; que ele seja INSTALADO
     em todo publish (e que o publish barre se a rota não responder) é medido em
     tests/canal-de-update-do-apk.test.mjs, lendo o que a esteira manda fazer.

     O manifesto é gravado em /var/www/hbx-downloads/, mas essa pasta NÃO é
     servida como diretório: cada arquivo tem um `location =` exato. E o
     `Access-Control-Allow-Origin` é tão obrigatório quanto a rota: o fetch sai
     de dentro da WebView, cuja origem é https://appassets.androidplatform.net,
     então sem ele o pedido é cross-origin rejeitado — o caso de 22/07,
     "confira a internet" com a internet perfeita. */
  const conf = readFileSync(path.join(REPO, "deploy", "nginx", "hbx-android-download.conf"), "utf8");
  for (const app of Object.values(androidApps)) {
    const bloco = new RegExp(
      `location = /downloads/${app.manifesto.replace(/\./g, "\\.")} \\{([^}]*)\\}`,
    ).exec(conf);
    assert.ok(bloco,
      `falta o bloco \`location = /downloads/${app.manifesto}\` em `
        + "deploy/nginx/hbx-android-download.conf — o publish grava o arquivo e o app leva 404 pra sempre");
    assert.match(bloco[1], /Access-Control-Allow-Origin "https:\/\/appassets\.androidplatform\.net"/,
      `${app.manifesto}: sem o CORS da WebView o fetch é rejeitado e o aviso de atualização nunca acende`);
    assert.match(bloco[1], new RegExp(`alias /var/www/hbx-downloads/${app.manifesto.replace(/\./g, "\\.")}`),
      `${app.manifesto}: o alias tem que apontar pro arquivo que o publish grava`);
  }
  assert.doesNotMatch(conf, /^\s*autoindex\s+on/m,
    "a pasta guarda os dois .apk e os dois manifestos: autoindex entregaria o diretório inteiro");
});

test("🔴 se o Gradle passar a copiar OUTRA pasta entre flavors, este portão avisa", () => {
  /* A lista de extras (`apkFingerprintExtras`) é uma cópia HUMANA de uma decisão
     que mora no Gradle. Cópia humana envelhece calada: no dia em que alguém
     acrescentar um segundo `from("src/…")` — outro asset compartilhado — o
     arquivo copiado entraria no APK sem entrar na digital, e o app que o recebe
     pararia de ver atualização. Aqui a decisão do Gradle é LIDA, não lembrada. */
  const gradle = readFileSync(path.join(PROJETO, "app", "build.gradle.kts"), "utf8");
  const copias = [...gradle.matchAll(/from\("(src\/[^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(copias.length > 0,
    "nenhum `from(\"src/…\")` no build.gradle.kts: ou a cópia entre flavors morreu (e então "
      + "apkFingerprintExtras em scripts/ops/deploy-vps.js tem lixo), ou a sintaxe mudou e este "
      + "portão parou de medir. Confira antes de mexer na lista de extras.");

  const extrasDoVendas = arquivosDaDigital("vendas")
    .map((p) => path.relative(PROJETO, p).split(path.sep).join("/"));
  for (const origem of copias) {
    const dentro = `app/${origem.replace(/\/$/, "")}/`;
    assert.ok(
      extrasDoVendas.some((f) => f.startsWith(dentro)),
      `o Gradle copia ${origem} para dentro do APK do Vendas, mas a digital do Vendas não lê essa `
        + "pasta. Mudança ali trocaria o binário sem trocar o versionCode: o aparelho ficaria "
        + "para sempre na versão velha, sem erro nenhum em tela. "
        + "Conserto: acrescente a pasta em `apkFingerprintExtras.vendas` (scripts/ops/deploy-vps.js).",
    );
  }
});
