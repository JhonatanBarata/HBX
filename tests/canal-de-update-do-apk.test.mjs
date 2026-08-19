// ============================================================
// O CANAL DE UPDATE DE CADA APK — o que a ESTEIRA faz, não o que o git guarda.
//
// A CENA (medida em 19/08, com comando):
//   curl -s -o /dev/null -w "%{http_code}" https://www.hbxsystem.com.br/downloads/version-vendas.json
//     → 404       (o do logistica, mesma pergunta → 200)
// O bloco `location = /downloads/version-vendas.json` ESTAVA no git desde a
// véspera, escrito e comentado. E não adiantou nada: `deploy/nginx/*.conf` era
// um ESPELHO — uma cópia manual do que vive em /etc/nginx/snippets/ — e nenhum
// script deste repo instalava esse arquivo no servidor.
//
// 🔴 POR ISSO ESTE PORTÃO NÃO PODE LER O ESPELHO. Um teste que abrisse o .conf
// do git e assertasse "tem o bloco, logo a rota existe" ficaria VERDE durante
// todo o período em que o canal esteve morto — ele estaria medindo exatamente a
// coisa que mentiu. Verde que mede a coisa errada é pior que vermelho.
// O que dá pra provar sem rede é o COMPORTAMENTO DA ESTEIRA: o script que o
// publish manda pro VPS instala o snippet, valida com `nginx -t`, recarrega sem
// fechar a porta, e o passo do manifesto BARRA o publish se a rota não
// responder. É isso que está medido aqui, lendo o texto que o deploy gera.
//
// (A prova de que o CONTEÚDO do snippet declara as duas rotas continua no
// tests/apk-digital-por-flavor.test.mjs — lá é contrato do arquivo; aqui é
// entrega dele.)
// ============================================================

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const {
  androidApps,
  buildRemoteScript,
  buildVersionJsonRemoteScript,
  costurarPonteDoApp,
} = require_("../scripts/ops/deploy-vps.js");

const CONFIG = {
  sshHost: "vps.exemplo",
  sshUser: "root",
  sshPort: "",
  appDir: "/root/HBX",
  androidApkRemotePath: "/var/www/hbx-downloads/hbx-logistica.apk",
  androidApkUrl: "https://www.hbxsystem.com.br/download/android-logistica",
  androidVendasApkRemotePath: "/var/www/hbx-downloads/hbx-mobile.apk",
  androidVendasApkUrl: "https://www.hbxsystem.com.br/download/android",
};

/* ------------------------------------------------------------------
   1) A ROTA É INSTALADA PELO DEPLOY — em todo publish, não à mão.
   ------------------------------------------------------------------ */
test("🔴 o deploy INSTALA o snippet do nginx no VPS (o git deixou de ser espelho)", () => {
  for (const [rotulo, script] of [
    ["full", buildRemoteScript(CONFIG, true, [])],
    ["seletivo", buildRemoteScript(CONFIG, false, [])],
    ["seletivo só backend", buildRemoteScript(CONFIG, false, ["backend"])],
  ]) {
    assert.match(script, /deploy\/nginx\/hbx-android-download\.conf/,
      `${rotulo}: o deploy não lê o snippet do repo — o arquivo do git seguiria sendo enfeite`);
    assert.match(script, /\/etc\/nginx\/snippets\/hbx-android-download\.conf/,
      `${rotulo}: o deploy não escreve no lugar de onde o nginx lê`);
    assert.match(script, /^\s*instalar_snippet_android\s*$/m,
      `${rotulo}: a função existe mas ninguém CHAMA — rota que só nasce no publish "full" é rota que ` +
      "não existe nas semanas em que só se publica seletivo");
  }
});

test("🔴 valida com `nginx -t` ANTES de recarregar, e reverte se reprovar", () => {
  const script = buildRemoteScript(CONFIG, true, []);
  const instalar = /instalar_snippet_android\(\) \{([\s\S]*?)\n\}/.exec(script);
  assert.ok(instalar, "não achei a função de instalação no script remoto");
  const corpo = instalar[1];

  const posTeste = corpo.indexOf("nginx -t");
  const posReload = corpo.indexOf("systemctl reload nginx");
  assert.ok(posTeste > -1, "sem `nginx -t`: um snippet torto derruba a configuração inteira do site");
  assert.ok(posReload > -1, "sem reload o nginx segue servindo a configuração velha — rota nova nunca sobe");
  assert.ok(posTeste < posReload,
    "o `nginx -t` tem que vir ANTES do reload: validar depois é validar o estrago já feito");
  assert.match(corpo, /cp -a "\$BACKUP" "\$DESTINO"/,
    "sem rollback, um snippet inválido fica no disco e o próximo reload (de qualquer origem) derruba o site");
});

test("🔴 recarrega com `reload`, NUNCA com `restart` puro — 17/08, o :443 caiu por 1s", () => {
  /* `restart` FECHA o listen socket: o celular que bater na fresta leva
     ECONNREFUSED (não 502 — não há ninguém escutando). `reload` (SIGHUP) troca
     os workers mantendo o socket aberto. O `|| systemctl restart nginx` é o
     fallback pro caso do serviço estar PARADO, e só vale nessa ordem. */
  const script = buildRemoteScript(CONFIG, true, []);
  for (const linha of script.split("\n")) {
    if (!/systemctl\s+restart\s+nginx/.test(linha)) continue;
    assert.match(linha, /systemctl reload nginx \|\| systemctl restart nginx/,
      `restart de nginx sem reload antes: ${linha.trim()}`);
  }
  assert.match(script, /systemctl reload nginx \|\| systemctl restart nginx/,
    "o publish precisa recarregar o nginx depois de instalar o snippet");
});

test("o snippet é copiado sem CR — o repo é editado no Windows", () => {
  /* `.gitattributes` tem `* text=auto` e o checkout local fica CRLF. No VPS o
     checkout é LF, mas basta um arquivo trazido de outra máquina pra que um
     `\r` no fim de uma diretiva vire erro de sintaxe do nginx — e aí o publish
     inteiro para no `nginx -t` por causa de um caractere invisível. */
  const script = buildRemoteScript(CONFIG, true, []);
  assert.match(script, /sed 's\/\\r\$\/\/'/,
    "a cópia do snippet não tira o CR: um caractere invisível barraria o publish no nginx -t");
});

/* ------------------------------------------------------------------
   2) GRAVAR NÃO É PUBLICAR — a conferência da rota BARRA o publish.
   ------------------------------------------------------------------ */
test("🔴 manifesto que não responde na URL pública DERRUBA o publish", () => {
  /* Era um `echo AVISO` dentro de um `if`. Foi ele que viu o 404 do
     version-vendas.json todas as vezes e não impediu nada. */
  const script = buildVersionJsonRemoteScript({
    app: androidApps.vendas,
    content: '{"versionCode":21}',
    remotePath: "/var/www/hbx-downloads/version-vendas.json",
    remoteTemporaryPath: "/var/www/hbx-downloads/version-vendas.json.tmp",
    publicUrl: "https://www.hbxsystem.com.br/downloads/version-vendas.json",
    versionCode: 21,
  });
  assert.match(script, /curl -fsSL[^\n]*"\$VERSION_URL"/,
    "sem perguntar na URL pública, o publish só sabe que ESCREVEU um arquivo");
  assert.match(script, /PUBLISH BARRADO[\s\S]*exit 1/,
    "a conferência não barra nada: é o aviso mudo que deixou o canal do Vendas morto por semanas");
  assert.doesNotMatch(script, /AVISO: version-vendas\.json/,
    "o caminho do aviso não-bloqueante voltou");

  // 200 não basta: um alias apontando pro manifesto do OUTRO app responde 200.
  assert.match(script, /versionCode\\":\$VERSION_CODE/,
    "responder 200 não prova nada se o corpo for o manifesto do outro app (applicationId diferente)");
});

test("sem URL pública configurada, o passo não inventa uma conferência", () => {
  const script = buildVersionJsonRemoteScript({
    app: androidApps.logistica,
    content: "{}",
    remotePath: "/var/www/hbx-downloads/version-logistica.json",
    remoteTemporaryPath: "/var/www/hbx-downloads/version-logistica.json.tmp",
    publicUrl: null,
    versionCode: 351,
  });
  assert.doesNotMatch(script, /curl/,
    "sem URL não há o que conferir — inventar um curl aqui reprovaria publish por configuração ausente");
  assert.match(script, /mv -f "\$VERSION_TMP" "\$VERSION_TARGET"/,
    "o arquivo ainda tem que ser gravado");
});

/* ------------------------------------------------------------------
   3) A PONTE DE TODO APP É COSTURADA E CONFERIDA — não só a do padrão.
   ------------------------------------------------------------------ */
test("🔴 o publish costura e confere a ponte de TODOS os apps do mapa", () => {
  /* Até 19/08 as duas chamadas iam sem `--app`, e `scripts/lib/apps.js` define
     `PADRAO = 'logistica'`: a ponte do VENDAS nunca era regerada nem conferida.
     Quem editasse `vendas/ponte-src/` e esquecesse de costurar publicava o
     `ponte.js` VELHO — mudo dos dois lados — com o versionCode subindo do mesmo
     jeito, ou seja, a frota baixando 3 MB de um app com a ponte antiga dentro. */
  const chamadas = [];
  costurarPonteDoApp(false, (_cmd, args) => chamadas.push(args.join(" ")));

  for (const nome of Object.keys(androidApps)) {
    assert.ok(chamadas.some((c) => c.includes("ponte-costurar.js") && c.includes(`--app ${nome}`)),
      `a ponte de "${nome}" não é COSTURADA no publish — o ponte.js dela sairia velho no APK`);
    assert.ok(chamadas.some((c) => c.includes("ponte-conferir.js") && c.includes(`--app ${nome}`)),
      `a ponte de "${nome}" não é CONFERIDA no publish — gerado editado à mão passaria batido`);
  }
  assert.ok(!chamadas.some((c) => !/--app \S+/.test(c)),
    "alguma chamada foi sem `--app` e caiu no alvo PADRÃO: é o defeito de origem voltando");
});

test("🔴 em HBX_PUBLISH_COMMITTED_ONLY o publish só CONFERE — nunca gera", () => {
  /* Nesse modo ninguém commita nada: gerar aqui deixaria arquivo FORA do HEAD
     que está sendo publicado — o APK sairia com uma ponte que o commit não tem. */
  const chamadas = [];
  costurarPonteDoApp(true, (_cmd, args) => chamadas.push(args.join(" ")));

  assert.ok(chamadas.length > 0, "no modo committed-only a ponte ainda tem que ser CONFERIDA");
  assert.ok(!chamadas.some((c) => c.includes("ponte-costurar.js")),
    "gerou a ponte no modo committed-only: publicaria arquivo não-commitado");
  for (const nome of Object.keys(androidApps)) {
    assert.ok(chamadas.some((c) => c.includes("ponte-conferir.js") && c.includes(`--app ${nome}`)),
      `a ponte de "${nome}" não é conferida no modo committed-only`);
  }
});
