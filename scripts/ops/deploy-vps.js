'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
  formatTimestamp,
  repoRoot,
  requireEnv,
  resolveOperationsEnv,
  run,
} = require('../lib/runtime');
// FREIO DE DISCO (05/08): a sujeira do build nasce neste publish, então morre
// neste publish. Teto, garantias e o porquê de cada número: scripts/lib/vps-disk-guard.js.
const { buildDiskGuardShellLines } = require('../lib/vps-disk-guard');

const remote = 'origin';
const branch = 'master';
const engineServices = Array.from({ length: 20 }, (_, index) => `hbx-engine-${index + 1}`);
const androidProjectDir = path.join(repoRoot, 'EntregaShell');
const androidDistDir = path.join(androidProjectDir, 'dist');
// ---------------------------------------------------------------------------
// OS DOIS APPS, NUM MAPA SÓ
// ---------------------------------------------------------------------------
// Até 19/08 este arquivo conhecia DOIS apks (ele construía e subia os dois) mas
// UM app: versionCode, digital, manifesto e piso do gradle só existiam para o
// logística. O vendas viajava com o `versionCode = 9` do defaultConfig e sem
// manifesto nenhum — instalado uma vez, congelado para sempre.
//
// Cada campo aqui é um lugar onde o nome do app estava CRAVADO no meio de uma
// função. Alvo repetido é alvo que discorda de si mesmo no dia seguinte, e aqui
// discordar tem forma concreta: os dois flavors têm `applicationId` DIFERENTE
// (`br.com.hbxsystem` × `br.com.hbxsystem.logistica`), então um app que leia o
// manifesto do outro compara a própria versão com a de um pacote que nem é ele
// — anuncia atualização para sempre e ofereceria o app errado pra instalar.
const androidApps = {
  logistica: {
    flavor: 'logistica',
    built: path.join(androidProjectDir, 'app', 'build', 'outputs', 'apk', 'logistica', 'release', 'app-logistica-release.apk'),
    named: path.join(androidDistDir, 'Loghbx.apk'),
    // A propriedade que o publish injeta no gradle. O PISO não mora aqui: mora
    // em `app/versao-<flavor>.properties` (ver `arquivoDeVersaoRel`), um por
    // app e fora do build.gradle.kts — piso num arquivo compartilhado faz a
    // alavanca de um app acordar a frota do outro. O nome do arquivo é DERIVADO
    // do flavor, nunca repetido aqui: dois lugares dizendo o mesmo nome é um
    // lugar que fica pra trás.
    gradleProperty: 'hbxLogisticaVersionCode',
    // O manifesto que ESTE app lê (ponte.js) — nunca o do vizinho.
    manifesto: 'version-logistica.json',
    versionUrlEnv: 'HOSTINGER_ANDROID_LOGISTICA_VERSION_URL',
    remotePath: (config) => config.androidApkRemotePath,
    publicUrl: (config) => config.androidApkUrl,
  },
  vendas: {
    flavor: 'vendas',
    built: path.join(androidProjectDir, 'app', 'build', 'outputs', 'apk', 'vendas', 'release', 'app-vendas-release.apk'),
    named: path.join(androidDistDir, 'Salehbx.apk'),
    gradleProperty: 'hbxVendasVersionCode',
    manifesto: 'version-vendas.json',
    versionUrlEnv: 'HOSTINGER_ANDROID_VENDAS_VERSION_URL',
    remotePath: (config) => config.androidVendasApkRemotePath,
    publicUrl: (config) => config.androidVendasApkUrl,
  },
};

function runStep(command, args, options = {}) {
  console.log(`\n> ${[command, ...args].join(' ')}`);
  return run(command, args, {
    cwd: options.cwd || repoRoot,
    captureOutput: options.captureOutput,
    allowFailure: options.allowFailure,
    stdin: options.stdin,
  });
}

function output(command, args) {
  return String(runStep(command, args, { captureOutput: true }).stdout || '').trim();
}

function lines(command, args) {
  return output(command, args).split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function ensureMaster() {
  const currentBranch = output('git', ['branch', '--show-current']);
  if (currentBranch !== branch) {
    throw new Error(`Use somente o master. Branch atual: ${currentBranch || '(detached HEAD)'}.`);
  }
}

function workingTreeIsDirty() {
  return Boolean(output('git', ['status', '--short']));
}

function stashBeforePull() {
  if (!workingTreeIsDirty()) return false;
  runStep('git', ['stash', 'push', '--include-untracked', '--message', `hbx-deploy-${formatTimestamp()}`]);
  return true;
}

function restoreStash(stashed) {
  if (stashed) runStep('git', ['stash', 'pop']);
}

function removeNonMasterBranches() {
  const localBranches = lines('git', ['for-each-ref', 'refs/heads', '--format=%(refname:short)']);
  for (const localBranch of localBranches.filter((value) => value !== branch)) {
    runStep('git', ['branch', '-D', localBranch]);
  }

  const remoteBranches = lines('git', ['for-each-ref', `refs/remotes/${remote}`, '--format=%(refname:short)'])
    .filter((value) => value.startsWith(`${remote}/`))
    .map((value) => value.slice(remote.length + 1))
    .filter((value) => value && value !== 'HEAD' && value !== branch);

  for (const remoteBranch of remoteBranches) {
    runStep('git', ['push', remote, '--delete', remoteBranch]);
  }

  runStep('git', ['fetch', remote, '--prune']);
}

function syncMaster(cleanBranches) {
  ensureMaster();
  const stashed = stashBeforePull();
  try {
    runStep('git', ['fetch', remote, '--prune']);
    runStep('git', ['pull', '--ff-only', remote, branch]);
    if (cleanBranches) removeNonMasterBranches();
  } finally {
    restoreStash(stashed);
  }
}

function syncCommittedHead() {
  ensureMaster();
  runStep('git', ['fetch', remote, '--prune']);
  const behind = Number(output('git', ['rev-list', '--count', `HEAD..${remote}/${branch}`])) || 0;
  if (behind > 0) {
    throw new Error(`O master local está ${behind} commit(s) atrás de ${remote}/${branch}.`);
  }
  console.log('Modo committed-only: alterações locais não serão adicionadas nem commitadas.');
}

function commitEverything(label) {
  runStep('git', ['add', '-A']);
  const staged = runStep('git', ['diff', '--cached', '--quiet'], { allowFailure: true });
  if (staged.status === 0) {
    console.log('Nenhuma mudança local para commitar.');
    return false;
  }

  runStep('git', ['commit', '-m', `chore: ${label} ${formatTimestamp()}`]);
  return true;
}

function changedFilesAheadOfRemote() {
  return lines('git', ['diff', '--name-only', `${remote}/${branch}..HEAD`]);
}

function classifyServices(filePaths) {
  const services = new Set();
  const requiresFullDeploy = filePaths.some((filePath) => {
    const normalized = filePath.replace(/\\/g, '/');
    return [
      'docker-compose.hostinger.yml',
      'docker-compose.frontend.yml',
      'docker-compose.yml',
      'frontend/Dockerfile',
      'backend/Dockerfile',
      'hbx-scraping-engine/Dockerfile',
    ].includes(normalized);
  });

  for (const filePath of filePaths) {
    const normalized = filePath.replace(/\\/g, '/');
    if (normalized.startsWith('frontend/')) services.add('frontend');
    if (normalized.startsWith('backend/')) services.add('backend');
    if (normalized.startsWith('webscraping/')) services.add('webscraping');
    if (normalized.startsWith('hbx-scraping-engine/')) services.add('engines');
    if (normalized.startsWith('Webwhats/')) services.add('webwhats');
  }

  return {
    full: requiresFullDeploy,
    services: [...services],
  };
}

function loadConfig() {
  const env = resolveOperationsEnv();
  return {
    sshHost: requireEnv(env, 'HOSTINGER_SSH_HOST'),
    sshUser: requireEnv(env, 'HOSTINGER_SSH_USER'),
    sshPort: String(env.HOSTINGER_SSH_PORT || '').trim(),
    appDir: requireEnv(env, 'HOSTINGER_APP_DIR'),
    androidApkRemotePath: String(
      env.HOSTINGER_ANDROID_LOGISTICA_APK_PATH || '/var/www/hbx-downloads/hbx-logistica.apk',
    ).trim(),
    androidApkUrl: String(
      env.NEXT_PUBLIC_ANDROID_APK_URL || 'https://www.hbxsystem.com.br/download/android-logistica',
    ).trim(),
    androidVendasApkRemotePath: String(
      env.HOSTINGER_ANDROID_VENDAS_APK_PATH || '/var/www/hbx-downloads/hbx-mobile.apk',
    ).trim(),
    androidVendasApkUrl: String(
      // O FRONTEND lê NEXT_PUBLIC_ANDROID_APK_VENDAS_URL (lib/app-mobile.ts).
      // Este arquivo lia NEXT_PUBLIC_ANDROID_..._VENDAS_APK_URL: nome divergente,
      // então o .env do VPS servia um e o build lia outro — sempre o fallback.
      env.NEXT_PUBLIC_ANDROID_APK_VENDAS_URL || 'https://www.hbxsystem.com.br/download/android',
    ).trim(),
  };
}

// ---------------------------------------------------------------------------
// Auto-update do APK: quem decide o versionCode
// ---------------------------------------------------------------------------
// Regra do dono (22/07): "se o app não alterou não tem que ter incrementação".
// Publish de backend/frontend não pode empurrar 1,5 MB de download pro celular
// do motorista. Então o número só sobe quando os FONTES DO APK mudam.
//
// Como sabemos que mudou: impressão digital (SHA-256) dos arquivos que entram
// no APK — tudo de EntregaShell/app/src + os arquivos de build do gradle.
// Ela é publicada junto no version-logistica.json, então a comparação é sempre
// contra o que está DE FATO no ar (fonte da verdade = servidor, não o repo).
//
// Nada de editar build.gradle.kts no meio do deploy (o commit já aconteceu
// antes do build — arquivo mexido aqui viraria sujeira não commitada): o
// número vai por propriedade do gradle, uma por app (ver `androidApps`).
//
// ---------------------------------------------------------------------------
// 🔴 A DIGITAL É POR APP — e é ela que decide QUEM baixa 3 MB (19/08)
// ---------------------------------------------------------------------------
// Até esta leva a lista era uma só e começava em `app/src` INTEIRO. Com um app
// só isso estava certo. Com dois, qualquer arquivo criado em `src/vendas/`
// mudava a digital do LOGÍSTICA e mandava a frota inteira de motoristas baixar
// um APK cujo conteúdo é byte-a-byte o mesmo que eles já têm — o Gradle nem
// empacota o sourceSet do outro flavor. E o pior é que ninguém veria erro:
// aparelho baixando à toa não reclama, só gasta.
//
// O próprio código previu isto, palavra por palavra, quando o flavor de bancada
// morreu na FUSÃO de 07/08: "se um dia voltar uma bancada com flavor próprio, o
// pulo volta COM ela". O flavor voltou (o `vendas` deixou de ser maquete), então
// o pulo volta — mas em vez de um `if (entry === 'x') continue`, que só sabe
// EXCLUIR o caso da vez, cada app passa a declarar o que É dele.
//
// A régua é a do empacotador, não a nossa: entra na digital de um app o que o
// Gradle põe DENTRO daquele APK.
//   · `app/src/main` — o Kotlin e os assets compartilhados: mudou ali, mudou nos dois;
//   · `app/src/<flavor dele>` — o que é só dele;
//   · os arquivos de build (o gradle decide os dois).
// Ficam de FORA `app/src/test` e `app/src/videoStudio`: teste unitário não viaja
// no APK e a variante de vídeo não é distribuída — subir versão da frota por
// causa deles era gasto puro.
const apkFingerprintRootsCompartilhados = [
  path.join('app', 'src', 'main'),
  path.join('app', 'build.gradle.kts'),
  // Estes DOIS entram agora e não entravam antes, e não é enfeite: as regras do
  // R8 (`isMinifyEnabled` no release) e o google-services decidem o que sobra
  // dentro do binário e se o push inicializa. Mudança neles mudava o APK sem
  // mudar a digital — versão nova no servidor, versão velha no celular, calado.
  path.join('app', 'proguard-rules.pro'),
  path.join('app', 'google-services.json'),
  'build.gradle.kts',
  'settings.gradle.kts',
  'gradle.properties',
];

// O que o Gradle empacota de FORA do sourceSet do próprio flavor.
// 🔴 SEM ISTO O CONSERTO VIRA UM BURACO NOVO: o `prepareVendasCheckoutAssets`
// (app/build.gradle.kts) copia a pasta do checkout PARA DENTRO do APK do vendas.
// Recortar a digital "por flavor" sem enxergar esse cano faria uma correção no
// checkout mudar o APK do Vendas sem mudar a digital dele: número parado,
// aparelho nunca atualizando, e nenhum erro em tela. É a mesma classe de defeito
// que este bloco existe pra matar, só que virada do avesso.
//
// 🔴 O CAMINHO MUDOU EM 20/08/2026: era `app/src/logistica/assets/checkout`.
// Quando o Logística virou app só de Google Play, o checkout do Mercado Pago
// teve de sair do sourceSet dele — formulário de cartão de gateway externo não
// pode viajar dentro de um binário de loja, nem que nenhum botão chame a tela.
// A pasta virou NEUTRA (`app/src/checkout-mp/`, fora de qualquer sourceSet
// Android) e hoje só o Vendas a injeta. Por isso ela continua na digital do
// vendas — e SÓ na dele.
const apkFingerprintExtras = {
  vendas: [path.join('app', 'src', 'checkout-mp', 'assets', 'checkout')],
};

// O ARQUIVO DE VERSÃO DE UM APP — o piso do versionCode e o versionName dele.
// Mora fora do `build.gradle.kts` de propósito (19/08): aquele arquivo está na
// digital dos DOIS apks, então subir o piso do VENDAS mudava o hash do
// LOGÍSTICA e acordava a frota inteira de motoristas pra baixar um APK
// byte-a-byte idêntico. Com um arquivo por app, a alavanca de um não move o
// outro. Um nome só, lido pela digital e pelo `readFlavorVersion` — dois
// caminhos que discordem aqui é manifesto contando história diferente do APK.
function arquivoDeVersaoRel(flavor) {
  return path.join('app', `versao-${flavor}.properties`);
}

function apkFingerprintRootsDe(flavor) {
  if (!flavor) throw new Error('apkFingerprintRootsDe: flavor é obrigatório — digital sem dono mede o app errado.');
  return [
    ...apkFingerprintRootsCompartilhados,
    path.join('app', 'src', flavor),
    arquivoDeVersaoRel(flavor),
    ...(apkFingerprintExtras[flavor] || []),
  ];
}

// 🔴 A FONTE DA PONTE NÃO VIAJA NO APK — e por isso não conta na digital (19/08).
// `app/src/<flavor>/ponte-src/` NÃO é sourceSet do Gradle: de dentro de
// `app/src/<flavor>/` o empacotador só leva `assets/`, `java/` e `res/` (o
// único srcDir extra declarado no build.gradle.kts é o do checkout gerado). A
// pasta mora ali por vizinhança, não por empacotamento — está escrito no
// cabeçalho do `scripts/ponte-costurar.js`: a fonte ficou FORA de `assets/`
// justamente pra não embarcar 589 KB que ninguém carrega. Contando ela, editar
// um COMENTÁRIO no `ponte-src/LEIA-ME.md` subia o versionCode e mandava a frota
// baixar um APK byte-a-byte idêntico ao que já estava no aparelho.
//
// ⚠️ E O INVERSO NÃO ABRE BURACO, que é o ponto delicado: `ponte-src/` é a
// FONTE do `ponte.js`, e esse SIM viaja (`assets/app/ponte.js`, que está dentro
// da conta). A costura é concatenação PURA dos `*.js` da pasta na ordem do nome
// (ponte-costurar.js), então todo byte de fonte que importa reaparece no gerado
// — e desde esta mesma leva o publish costura e confere TODOS os alvos ANTES de
// calcular a digital (`costurarPonteDoApp`), de modo que o gerado nunca está
// atrasado em relação à fonte na hora da conta. Mudou a ponte ⇒ mudou o
// `ponte.js` ⇒ mudou a digital. O que deixa de mover a versão é exatamente o que
// NÃO entra na costura: o LEIA-ME e qualquer arquivo que não seja `.js`.
//
// A lista sai do MAPA (`scripts/lib/apps.js`), não de um nome de pasta cravado
// aqui: exclusão escrita à mão é a que envelhece calada quando nasce o 3º app.
let pastasForaDoApkMemo = null;
function pastasForaDoApk() {
  if (pastasForaDoApkMemo) return pastasForaDoApkMemo;
  const fora = new Set();
  try {
    const { APPS } = require(path.join(repoRoot, 'scripts', 'lib', 'apps.js'));
    for (const app of Object.values(APPS)) {
      fora.add(path.relative(androidProjectDir, app.ponteSrc).split(path.sep).join('/'));
    }
  } catch { /* sem mapa: nada a excluir — a digital erra pra MAIS, que é o lado seguro */ }
  pastasForaDoApkMemo = fora;
  return fora;
}

function collectApkInputFiles(absolute, collected, projectDir = androidProjectDir) {
  if (!fs.existsSync(absolute)) return collected;
  const stat = fs.statSync(absolute);
  if (stat.isFile()) {
    collected.push(absolute);
    return collected;
  }
  if (!stat.isDirectory()) return collected;
  // Comparado RELATIVO à raiz do projeto porque o portão mede uma árvore de
  // mentira num tmp — caminho absoluto nunca casaria lá.
  if (pastasForaDoApk().has(path.relative(projectDir, absolute).split(path.sep).join('/'))) {
    return collected;
  }
  for (const entry of fs.readdirSync(absolute).sort()) {
    // `build`/`.gradle` são SAÍDA do compilador — entrariam na conta e fariam
    // a digital mudar sozinha a cada build, quebrando a regra inteira.
    if (entry === 'build' || entry === '.gradle') continue;
    // 🔴 AQUI MORAVA `if (entry === 'logistica2') continue;` — a lista de
    // EXCLUSÃO, que só sabia o caso da vez e envelhecia calada. Quem decide o
    // que entra virou a lista de raízes lá em cima, declarada POR APP: exclusão
    // esquecida deixa lixo na conta; inclusão declarada é conferível.
    collectApkInputFiles(path.join(absolute, entry), collected, projectDir);
  }
  return collected;
}

// Os arquivos que a digital de UM app mede, já ordenados e sem repetição.
// Sai exportado porque é o que um portão consegue APONTAR: comparar a lista do
// logística com a do vendas prova a separação sem precisar mexer no disco.
// `projectDir` existe pra que o teste meça uma árvore de mentira num tmp, e não
// o repo vivo — portão que escreve no repo pra medir é portão que quebra o repo.
function arquivosDaDigital(flavor, projectDir = androidProjectDir) {
  const files = [];
  for (const relative of apkFingerprintRootsDe(flavor)) {
    collectApkInputFiles(path.join(projectDir, relative), files, projectDir);
  }
  // Dedup: um extra pode cair dentro de uma raiz já varrida (hoje não cai, mas
  // um arquivo contado duas vezes muda o hash sem mudar o APK).
  return Array.from(new Set(files)).sort();
}

// 🔴 SEM DEFAULT DE PROPÓSITO. Um `flavor = 'logistica'` aqui faria toda
// chamada esquecida medir o app do motorista e devolver verde — a assinatura
// exata do defeito que este arquivo passou o mês inteiro pagando.
function computeApkFingerprint(flavor, projectDir = androidProjectDir) {
  if (!flavor) throw new Error('computeApkFingerprint: diga de QUAL app é a digital (logistica|vendas).');
  const files = arquivosDaDigital(flavor, projectDir);
  const hash = crypto.createHash('sha256');
  for (const file of files) {
    // Caminho + conteúdo: renomear arquivo também conta como mudança.
    hash.update(path.relative(projectDir, file).split(path.sep).join('/'));
    hash.update('\0');
    hash.update(fs.readFileSync(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

// Lê o manifesto DESTE app que está PUBLICADO. Sem rede/sem arquivo ainda,
// devolve null e o chamador cai no piso do gradle (nunca inventa número).
function readPublishedVersion(config, app) {
  const url = resolveVersionJsonPublicUrl(config, app);
  if (!url) return null;
  // try/catch além do allowFailure: o helper `run` LANÇA quando o executável
  // não existe (ENOENT). Esta leitura nunca pode derrubar o publish — sem
  // resposta, o chamador cai no piso do gradle e avisa no log.
  let result;
  try {
    result = run('curl', ['-fsSL', '--max-time', '20', url], {
      cwd: repoRoot,
      captureOutput: true,
      allowFailure: true,
    });
  } catch (_) { return null; }
  if (!result || result.status !== 0 || !result.stdout) return null;
  try {
    const parsed = JSON.parse(result.stdout);
    return {
      versionCode: Number(parsed.versionCode) || 0,
      fingerprint: String(parsed.fingerprint || ''),
    };
  } catch {
    return null;
  }
}

function resolveAndroidVersion(config, app) {
  const gradle = readFlavorVersion(app);
  const fingerprint = computeApkFingerprint(app.flavor);
  const published = readPublishedVersion(config, app);

  if (!published) {
    console.log(
      `[apk ${app.flavor}] não consegui ler a versão publicada — mantendo o piso do gradle (código ${gradle.versionCode}). ` +
        `Se o app mudou, o celular NÃO vai ver a atualização: confira o ${app.manifesto} no ar.`,
    );
    return { ...gradle, fingerprint, bumped: false };
  }
  if (published.fingerprint && published.fingerprint === fingerprint) {
    // O PISO do gradle vale AQUI TAMBÉM. Antes este ramo devolvia
    // `published.versionCode` cru, e por isso subir o piso não tinha efeito
    // nenhum — o único jeito de mexer na versão era a digital mudar.
    // 22/07: um publish gravou a digital NOVA mantendo um versionCode que os
    // aparelhos já tinham. A partir dali toda tentativa caía aqui ("fontes
    // inalterados"), o APK corrigido ficava no servidor e nenhum celular via
    // atualização — sem saída manual. Com o piso valendo, basta subir o
    // literal em app/build.gradle.kts pra destravar.
    const versionCode = Math.max(published.versionCode, gradle.versionCode);
    if (versionCode > published.versionCode) {
      console.log(
        `[apk ${app.flavor}] digital IGUAL, mas o piso do gradle é maior — versão ${published.versionCode} → ${versionCode}. Os celulares vão atualizar.`,
      );
      return { versionCode, versionName: gradle.versionName, fingerprint, bumped: true };
    }
    console.log(
      `[apk ${app.flavor}] fontes do app INALTERADOS — versão mantida em ${published.versionCode}. Nenhum celular vai baixar nada.`,
    );
    return { versionCode, versionName: gradle.versionName, fingerprint, bumped: false };
  }
  const versionCode = Math.max(published.versionCode, gradle.versionCode) + 1;
  console.log(
    `[apk ${app.flavor}] fontes do app MUDARAM — versão ${published.versionCode} → ${versionCode}. Os celulares vão atualizar sozinhos.`,
  );
  return { versionCode, versionName: gradle.versionName, fingerprint, bumped: true };
}

// ---------------------------------------------------------------------------
// A PONTE DO APP É GERADA — costura ANTES de tudo
// ---------------------------------------------------------------------------
// `assets/app/ponte.js` deixou de ser escrito à mão em 10/08: a fonte é
// `assets/app/ponte/src/*.js` (≤1.000 linhas cada) e o arquivo embarcado sai de
// `scripts/ponte-costurar.js`. A costura roda AQUI, no começo do publish, por
// dois motivos que não são opinião:
//   · o commit do publish (`commitEverything`) precisa levar o gerado junto;
//   · a digital do APK (resolveAndroidVersion) lê `app/src` — costurar depois
//     dela publicaria um APK com ponte velha e versão de ponte nova.
// Com `HBX_PUBLISH_COMMITTED_ONLY=1` ninguém commita nada, então gerar seria
// publicar arquivo não-commitado: nesse modo só CONFERE e reprova alto.
//
// 🔴 TODOS OS ALVOS, SEMPRE — e não "o do argv" (19/08). As duas chamadas iam
// sem `--app`, e `scripts/lib/apps.js` define `PADRAO = 'logistica'`: a ponte do
// VENDAS nunca era regerada nem conferida no publish. Quem editasse
// `src/vendas/ponte-src/` e esquecesse de costurar publicava o `ponte.js` VELHO,
// mudo dos dois lados — e ainda com o versionCode subindo (a fonte da ponte
// contava na digital), ou seja, a frota baixando 3 MB de um app com a ponte
// antiga dentro. Um publish que conhece dois apps não pode costurar um só.
// `executar` é injetável só para o portão poder LER o que este passo manda
// rodar sem disparar 4 subprocessos e reescrever a ponte do repo. Em produção é
// sempre o `runStep`.
function costurarPonteDoApp(committedOnly, executar = runStep) {
  const costurar = path.join(repoRoot, 'scripts', 'ponte-costurar.js');
  const conferir = path.join(repoRoot, 'scripts', 'ponte-conferir.js');
  if (!fs.existsSync(costurar) || !fs.existsSync(conferir)) return;
  let APPS;
  try { ({ APPS } = require(path.join(repoRoot, 'scripts', 'lib', 'apps.js'))); }
  catch { APPS = null; }
  // Sem o mapa, cai no comportamento antigo (o alvo padrão) em vez de não
  // costurar nada: publish sem ponte nenhuma é pior que publish de um app só.
  const alvos = APPS ? Object.entries(APPS) : [[null, null]];
  for (const [nome, app] of alvos) {
    // App sem `ponte-src/` no disco não tem o que costurar, e o costurador
    // reprovaria alto por falta de fonte. Quem cobra o caso PERIGOSO (casca
    // embarcada sem ponte = app que abre mostrando "Empresa 1") é o
    // `conferirCascaTemPonte()` aqui embaixo — este laço não precisa duplicar
    // esse julgamento, só não pode passar por cima dele em silêncio.
    if (app && !fs.existsSync(app.ponteSrc)) {
      console.log(`[ponte ${nome}] sem ${app.ponteSrcRel}/ — nada a costurar neste alvo.`);
      continue;
    }
    const flag = nome ? ['--app', nome] : [];
    if (!committedOnly) executar(process.execPath, [costurar, ...flag]);
    executar(process.execPath, [conferir, ...flag]);
  }
}

// 🔴 A CASCA SEM PONTE É UM APP PINTADO E MORTO (19/08).
// A casca (`mock.js`) desenha as telas; quem as liga no servidor é a `ponte.js`.
// Um app cuja `index.html` carrega a casca mas NÃO tem ponte abre normalmente — a
// cortina até cai, porque o próprio mock chama `appReady` — e fica para sempre
// exibindo o dado de MAQUETE ("Cliente 1", "Empresa 1"). Sem erro em tela nenhuma.
//
// Isso não é hipótese: aconteceu neste repo. Quando a casca do HBX Vendas nasceu, o
// `index.html` do flavor passou a carregar `mock.js` antes de a ponte existir — e o
// publish NÃO é opcional nisso: `buildAndroidApk` monta os DOIS flavors sempre, e o
// site já pendura o botão "Baixar HBX Vendas" nessa mesma URL. Um publish naquele
// instante teria trocado o app vivo por uma maquete, calado.
//
// O freio mora AQUI, e não num aviso que depende de alguém lembrar: quem publica é
// que tem de reprovar. A régua é a INTENÇÃO declarada na index.html — se ela pede
// ponte, a ponte tem de estar no disco.
function conferirCascaTemPonte() {
  let APPS;
  try { ({ APPS } = require(path.join(repoRoot, 'scripts', 'lib', 'apps.js'))); }
  catch { return; } // mapa ainda não existe: nada a conferir
  const mortos = [];
  for (const [nome, app] of Object.entries(APPS)) {
    const indexHtml = path.join(app.destino, 'index.html');
    if (!fs.existsSync(indexHtml)) continue;
    const html = fs.readFileSync(indexHtml, 'utf8');
    // A régua é CARREGAR A CASCA, não declarar a ponte. Um `index.html` que pede
    // `ponte.js` e não a tem quebra alto no console; o caso mudo — o caro — é o que
    // carrega SÓ o `mock.js`: aí ninguém pediu nada, nada falta, e o app fica bonito
    // e mentindo. Foi exatamente esse o estado do HBX Vendas em 19/08.
    const carregaCasca = /<script[^>]+src=["']mock\.js["']/.test(html);
    const pedePonte = /<script[^>]+src=["']ponte\.js["']/.test(html);
    if (!carregaCasca && !pedePonte) continue; // app sem casca (app.js próprio): fora da régua
    if (!fs.existsSync(path.join(app.destino, 'ponte.js'))) {
      const motivo = carregaCasca ? 'carrega mock.js (a casca)' : 'declara ponte.js';
      mortos.push(`  · ${nome}: ${path.relative(repoRoot, indexHtml)} ${motivo}, mas ${path.relative(repoRoot, path.join(app.destino, 'ponte.js'))} NÃO EXISTE — o app abriria mostrando dado de maquete`);
    }
  }
  if (mortos.length) {
    throw new Error([
      'PUBLISH BARRADO — app com casca e SEM ponte (viraria maquete na mão do cliente):',
      ...mortos,
      '',
      'Conserto: escreva a ponte em <flavor>/ponte-src/ e rode',
      '  node scripts/ponte-costurar.js --app <flavor>',
      'Ou tire o app do ar removendo-o de scripts/lib/apps.js — nunca publique a maquete.',
    ].join('\n'));
  }
}

function buildAndroidApk(versoes) {
  // Antes de gastar 4 minutos de Gradle: nenhum alvo pode sair como maquete.
  conferirCascaTemPonte();
  // 🔴 UM `-P` POR APP. Enquanto só o logística tinha propriedade, o vendas era
  // montado no MESMO comando e saía com o versionCode do defaultConfig — o
  // número decidido aqui em cima nunca chegava no binário dele. Propriedade que
  // falta não dá erro no Gradle: ele usa o default e o build fica verde.
  const versionArgs = Object.entries(androidApps)
    .map(([nome, app]) => {
      const versao = versoes && versoes[nome];
      return versao && versao.versionCode ? `-P${app.gradleProperty}=${versao.versionCode}` : null;
    })
    .filter(Boolean);
  const buildTasks = [':app:assembleLogisticaRelease', ':app:assembleVendasRelease'];
  if (process.platform === 'win32') {
    // gradlew.bat pelo CAMINHO ABSOLUTO: ambientes com NoDefaultCurrentDirectoryInExePath=1
    // (sandbox/hardening) fazem o cmd.exe ignorar o diretório atual, então o nome puro
    // "gradlew.bat" não é encontrado mesmo com cwd correto. Caminho absoluto resolve sempre.
    runStep(
      process.env.comspec || 'cmd.exe',
      ['/d', '/s', '/c', path.join(androidProjectDir, 'gradlew.bat'), ...buildTasks, ...versionArgs, '--stacktrace'],
      { cwd: androidProjectDir },
    );
  } else {
    runStep('./gradlew', [...buildTasks, ...versionArgs, '--stacktrace'], { cwd: androidProjectDir });
  }

  fs.mkdirSync(androidDistDir, { recursive: true });
  return Object.fromEntries(Object.entries(androidApps).map(([nome, app]) => {
    if (!fs.existsSync(app.built)) {
      throw new Error(`APK ${nome} não foi gerado em ${app.built}.`);
    }
    fs.copyFileSync(app.built, app.named);
    const stat = fs.statSync(app.named);
    if (!stat.isFile() || stat.size < 100_000) {
      throw new Error(`APK ${nome} inválido: ${app.named} (${stat.size} bytes).`);
    }
    const sha256 = sha256File(app.named);
    console.log(`${path.basename(app.named)} pronto: ${stat.size} bytes, SHA-256 ${sha256}.`);
    return [nome, { filePath: app.named, sha256, size: stat.size }];
  }));
}

// ---------------------------------------------------------------------------
// 🔴 O CANAL DE UPDATE PRECISA DE UMA ROTA, E ROTA NINGUÉM INSTALAVA (19/08)
// ---------------------------------------------------------------------------
// Medido: `https://www.hbxsystem.com.br/downloads/version-vendas.json` → 404,
// enquanto o do logística → 200. Motivo: NENHUM script deste repo instalava o
// `deploy/nginx/hbx-android-download.conf` no VPS. O arquivo do git era uma
// CÓPIA MANUAL do que vive em /etc/nginx/snippets/ — "espelho", diz o cabeçalho
// dele —, e espelho não é esteira: alguém escreveu o bloco novo no git e o
// servidor nunca soube.
//
// A cadeia inteira do estrago, e é toda muda: sem rota, o `publishVersionJson`
// grava o arquivo e o `curl` de conferência falha DENTRO de um aviso não
// bloqueante ("gravado mas NÃO respondeu"); no publish seguinte o
// `readPublishedVersion` devolve null; o `resolveAndroidVersion` cai no ramo
// "não consegui ler a versão publicada" e mantém o piso do gradle. Ou seja: o
// versionCode do Vendas fica CRAVADO no piso, publish após publish, e nenhum
// aparelho jamais vê atualização. Para sempre.
//
// Então a cura mora AQUI, na esteira, e vale em todo publish futuro:
//   · `reload`, NUNCA `restart` — em 17/08 o `restart` fechou o listen socket
//     do :443 por ~1s e o celular que batesse na fresta levou ECONNREFUSED;
//   · `nginx -t` ANTES do reload, com ROLLBACK do arquivo anterior se reprovar:
//     um snippet torto derrubaria a configuração inteira do site, não só a rota
//     do APK;
//   · `install` só se o conteúdo MUDOU, senão todo publish recarregaria o nginx
//     à toa;
//   · o `\\r` sai na cópia: o repo é editado no Windows (`* text=auto`) e um CR
//     no fim de uma diretiva é erro de sintaxe pro nginx.
// O `|| return 1` no fim é o que faz o publish PARAR: rota é canal de update,
// não enfeite.
function nginxSnippetShellLines() {
  return [
    'instalar_snippet_android() {',
    '  ORIGEM="$APP_DIR/deploy/nginx/hbx-android-download.conf"',
    '  DESTINO=/etc/nginx/snippets/hbx-android-download.conf',
    '  if [ ! -f "$ORIGEM" ]; then echo "PUBLISH BARRADO: falta $ORIGEM (a rota do manifesto de update mora nele)."; return 1; fi',
    '  mkdir -p /etc/nginx/snippets',
    '  TMP_SNIPPET="$(mktemp)"',
    '  sed \'s/\\r$//\' "$ORIGEM" > "$TMP_SNIPPET"',
    '  if [ -f "$DESTINO" ] && cmp -s "$TMP_SNIPPET" "$DESTINO"; then rm -f "$TMP_SNIPPET"; echo "nginx: snippet do Android já idêntico ao do git — sem reload."; return 0; fi',
    '  BACKUP=""',
    '  if [ -f "$DESTINO" ]; then BACKUP="$DESTINO.bak-publish-$(date +%Y%m%d%H%M%S)"; cp -a "$DESTINO" "$BACKUP"; fi',
    '  install -m 0644 "$TMP_SNIPPET" "$DESTINO"',
    '  rm -f "$TMP_SNIPPET"',
    '  if ! nginx -t; then',
    '    echo "PUBLISH BARRADO: nginx -t reprovou o snippet do git. Revertendo."',
    '    if [ -n "$BACKUP" ]; then cp -a "$BACKUP" "$DESTINO"; else rm -f "$DESTINO"; fi',
    '    nginx -t || true',
    '    return 1',
    '  fi',
    // O snippet só vale se alguém o INCLUIR. Aviso alto (não barra) porque quem
    // reprova de verdade é a conferência da rota no fim do publish: ali a
    // medida é o 200 de fato, não a presença de uma linha de configuração.
    '  if ! grep -Rqs "snippets/hbx-android-download.conf" /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null; then',
    '    echo "AVISO: nenhum server block inclui snippets/hbx-android-download.conf — as rotas /downloads/ e /download/ não vão existir."',
    '  fi',
    '  systemctl reload nginx || systemctl restart nginx',
    '  echo "nginx: snippet do Android instalado a partir do git e recarregado (reload, sem fechar o :443)."',
    '}',
  ];
}

function buildRemoteScript(config, fullDeploy, services) {
  const compose = 'docker compose --env-file .env -f docker-compose.hostinger.yml';
  const frontendCompose = 'docker compose --env-file .env -f docker-compose.frontend.yml';
  const engineArgs = ['hbx-scraping-engine', ...engineServices].join(' ');
  const lines = [
    'set -euo pipefail',
    `APP_DIR=${shellQuote(config.appDir)}`,
    'cd "$APP_DIR"',
    'git fetch origin master',
    'git checkout master',
    'git reset --hard origin/master',
    ...nginxSnippetShellLines(),
    // Roda ANTES dos serviços e em TODO publish (full ou seletivo): a rota do
    // manifesto tem de estar de pé quando o `publishVersionJson` for conferir
    // o JSON que grava lá no fim, e uma rota que só nasce no publish "full"
    // é uma rota que não existe nas semanas em que só se publica seletivo.
    'instalar_snippet_android',
    'wait_backend() { for attempt in $(seq 1 40); do if curl -fsS http://127.0.0.1:3000/health >/dev/null; then return 0; fi; sleep 3; done; docker logs --tail 120 hbx-backend 2>&1 || true; return 1; }',
    'wait_frontend() { for attempt in $(seq 1 40); do if curl -fsS http://127.0.0.1:3001/ >/dev/null; then return 0; fi; sleep 2; done; docker logs --tail 120 hbx-frontend 2>&1 || true; return 1; }',
    'deploy_webwhats() { if [ -f "$APP_DIR/Webwhats/package.json" ]; then cd "$APP_DIR/Webwhats"; npm ci --no-audit --no-fund --loglevel=error; npm run build -- --silent; node runWithProvider.js "npx prisma generate --schema ./prisma/DATABASE_PROVIDER-schema.prisma --no-hints"; npm run db:deploy; cd "$APP_DIR"; fi; systemctl restart webwhats; systemctl is-active --quiet webwhats; }',
  ];

  if (fullDeploy) {
    lines.push(
      `${compose} build`,
      `docker rm -f hbx-backend webscraping hbx-scraping-engine ${engineServices.join(' ')} 2>/dev/null || true`,
      `${compose} up -d --force-recreate`,
      `${frontendCompose} build frontend`,
      'docker rm -f hbx-frontend frontend 2>/dev/null || true',
      `${frontendCompose} up -d --force-recreate frontend`,
      'deploy_webwhats',
      // 🔴 `restart` FECHA O LISTEN SOCKET DO :443 (17/08, print do dono: "Não deu
      //    certo — Failed to connect to api.hbxsystem.com.br/187.77.47.18:443").
      //    Todo publish parava o nginx por ~1s (journalctl: "Stopped nginx"), e o
      //    celular que batesse nessa fresta levava ECONNREFUSED — não 502, e sim
      //    ConnectException crua, porque não havia ninguém escutando na porta.
      //    `reload` (SIGHUP) troca os workers MANTENDO o socket aberto: as conexões
      //    ficam enfileiradas no backlog em vez de serem recusadas. O `|| restart`
      //    é o fallback pro caso do nginx estar parado (reload não sobe serviço
      //    morto). O publish não troca binário nem `listen`, então reload basta.
      'systemctl reload nginx || systemctl restart nginx',
      'wait_backend',
      'wait_frontend',
    );
  } else {
    if (services.includes('backend')) {
      lines.push(`${compose} up -d --build --force-recreate --no-deps backend`, 'wait_backend');
    }
    if (services.includes('webscraping')) {
      lines.push(`${compose} up -d --build --force-recreate --no-deps webscraping`);
    }
    if (services.includes('engines')) {
      lines.push(`${compose} up -d --build --force-recreate --no-deps ${engineArgs}`);
    }
    if (services.includes('frontend')) {
      lines.push(`${frontendCompose} up -d --build --force-recreate --no-deps frontend`, 'wait_frontend');
    }
    if (services.includes('webwhats')) {
      lines.push('deploy_webwhats');
    }
    if (!services.length) {
      lines.push('echo "Nenhum serviço de produção foi alterado."');
    }
  }

  lines.push('docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"');
  // Faxina por ÚLTIMO: só depois de os serviços estarem de pé e respondendo.
  lines.push(...buildDiskGuardShellLines());
  return lines.join('\n');
}

function deploy(config, fullDeploy, services) {
  const sshArgs = ['-o', 'BatchMode=yes'];
  if (config.sshPort) sshArgs.push('-p', config.sshPort);
  sshArgs.push(`${config.sshUser}@${config.sshHost}`, 'bash', '-s');
  runStep('ssh', sshArgs, { stdin: buildRemoteScript(config, fullDeploy, services) });
}

function publishAndroidApk(config, apk, remotePath, publicUrl) {
  const remoteDirectory = path.posix.dirname(remotePath);
  const remoteFileName = path.posix.basename(remotePath);
  const remoteTemporaryPath = path.posix.join(
    remoteDirectory,
    `.${remoteFileName}.${formatTimestamp()}.tmp`,
  );
  const remoteTarget = `${config.sshUser}@${config.sshHost}`;
  const scpArgs = ['-o', 'BatchMode=yes'];
  if (config.sshPort) scpArgs.push('-P', config.sshPort);
  scpArgs.push(apk.filePath, `${remoteTarget}:${remoteTemporaryPath}`);
  runStep('scp', scpArgs);

  const sshArgs = ['-o', 'BatchMode=yes'];
  if (config.sshPort) sshArgs.push('-p', config.sshPort);
  sshArgs.push(remoteTarget, 'bash', '-s');

  const verificationUrl = new URL(publicUrl);
  verificationUrl.searchParams.set('sha256', apk.sha256.slice(0, 12));
  const remoteScript = [
    'set -euo pipefail',
    `APK_TMP=${shellQuote(remoteTemporaryPath)}`,
    `APK_TARGET=${shellQuote(remotePath)}`,
    `EXPECTED_SHA256=${shellQuote(apk.sha256)}`,
    `EXPECTED_SIZE=${shellQuote(apk.size)}`,
    `APK_URL=${shellQuote(verificationUrl.toString())}`,
    'cleanup() { rm -f "$APK_TMP"; }',
    'trap cleanup EXIT',
    'test "$(stat -c %s "$APK_TMP")" = "$EXPECTED_SIZE"',
    'test "$(sha256sum "$APK_TMP" | awk \'{print $1}\')" = "$EXPECTED_SHA256"',
    'chmod 0644 "$APK_TMP"',
    'mv -f "$APK_TMP" "$APK_TARGET"',
    'trap - EXIT',
    'PUBLIC_SHA256="$(curl -fsSL --retry 3 --retry-delay 2 "$APK_URL" | sha256sum | awk \'{print $1}\')"',
    'test "$PUBLIC_SHA256" = "$EXPECTED_SHA256"',
    'echo "APK Android publicado e validado: $EXPECTED_SIZE bytes, SHA-256 $EXPECTED_SHA256"',
  ].join('\n');
  runStep('ssh', sshArgs, { stdin: remoteScript });
}

// PR20072026-ROTA-SALVA F4 — auto-update do APK: versionCode/versionName saem
// do MESMO arquivo que o Gradle usa pra carimbar o APK que acabou de sair do
// buildAndroidApk() — nunca hardcode, nunca dessincroniza do binário real.
// 🔴 O LEITOR NÃO PODE LER COMENTÁRIO — pego pelo portão em 19/08, escrevendo
// esta própria leva. O arquivo do piso é mais COMENTÁRIO que dado (a história
// de cada subida está lá, e ela cita números o tempo todo: "herdar o
// versionCode = 9 do defaultConfig", "8 → 15 em 22/07"). Uma regex que casasse
// dentro de uma dessas frases devolveria um número que NÃO está no binário — e
// o estrago é mudo dos dois lados: pra menos, o publish carimba uma versão que
// o aparelho recusa por downgrade; pra mais, o manifesto anuncia uma versão que
// o APK não tem e o celular baixa em loop sem nunca "chegar" nela.
// Linha que começa com `#` é comentário e sai inteira — no formato properties
// isso é inequívoco, diferente do `//` no meio de código.
function semComentarios(content) {
  return content
    .split('\n')
    .map((linha) => (/^\s*#/.test(linha) ? '' : linha))
    .join('\n');
}

// 🔴 22/07 e 19/08, o MESMO defeito por duas vias: este leitor era um PARSER DE
// TEXTO sobre o `build.gradle.kts`, e parser de texto sobre código envelhece
// calado. Em 22/07 o flavor trocou o literal por uma variável e todo publish que
// encostasse no APK morria com exit 0, sem subir nada. Em 19/08 a regex casou
// dentro de uma FRASE de comentário ("herdar o versionCode = 9 do
// defaultConfig") e devolveu 9 no lugar de 20 — pra menos, o aparelho recusa
// por downgrade; pra mais, o manifesto anuncia uma versão que o APK não tem e o
// celular baixa em loop sem nunca chegar nela.
// Agora a fonte é um ARQUIVO DE DADOS por app (`app/versao-<flavor>.properties`),
// o MESMO que o Gradle lê pra carimbar o binário — não há dois caminhos pra
// discordar. Comentário (`#`) sai antes da leitura porque o arquivo é quase todo
// história de piso, e ela cita números o tempo todo: é a lição de 19/08, só que
// agora num formato onde "comentário" tem uma marca inequívoca.
function readFlavorVersion(app) {
  const arquivo = path.join(androidProjectDir, arquivoDeVersaoRel(app.flavor));
  if (!fs.existsSync(arquivo)) {
    throw new Error(
      `Não encontrei ${arquivoDeVersaoRel(app.flavor)} — é ele que guarda o piso do versionCode `
        + `do flavor "${app.flavor}". Sem ele o Gradle nem configura.`,
    );
  }
  const content = semComentarios(fs.readFileSync(arquivo, 'utf8'));
  const versionCodeMatch = /^\s*versionCode\s*=\s*(\d+)\s*$/m.exec(content);
  const versionNameMatch = /^\s*versionName\s*=\s*(\S+)\s*$/m.exec(content);
  if (!versionCodeMatch || !versionNameMatch) {
    throw new Error(
      `Não encontrei versionCode/versionName em ${arquivoDeVersaoRel(app.flavor)} `
        + '(o formato é `versionCode=N` e `versionName=texto`, uma por linha).',
    );
  }
  return { versionCode: Number(versionCodeMatch[1]), versionName: versionNameMatch[1] };
}

// URL pública do manifesto DESTE app. Reusa o MESMO domínio do APK dele
// (`/download/android-logistica` ou `/download/android`) + `/downloads/
// version-<app>.json` — contrato travado em
// docs/PLANEJAMENTOS/PR20072026-ROTA-SALVA/00-ORQUESTRACAO.md
// (`${WEB_BASE_URL}/downloads/version-…json`, o mesmo `WEB_BASE_URL` que o APK
// usa pra falar com o backend/frontend), e é literalmente a URL que a ponte de
// cada app monta em tempo de execução.
// O nginx serve `/var/www/hbx-downloads/` sob `/downloads/*` por DUAS rotas
// declaradas uma a uma (deploy/nginx/hbx-android-download.conf) — nunca uma
// pasta estática aberta. Dá pra sobrescrever por
// HOSTINGER_ANDROID_<APP>_VERSION_URL sem mexer no código.
function resolveVersionJsonPublicUrl(config, app) {
  const env = resolveOperationsEnv();
  const explicit = String(env[app.versionUrlEnv] || '').trim();
  if (explicit) return explicit;
  try {
    return `${new URL(app.publicUrl(config)).origin}/downloads/${app.manifesto}`;
  } catch {
    return null;
  }
}

function publishVersionJson(config, apk, version, app) {
  // 🔴 03/08 — `obrigatoria` era um literal `false`. Consequência real: o APK
  // 141 saiu com o CONSERTO do aviso de atualização preso dentro dele, e os
  // aparelhos na 139 (cujo bug é justamente "só aviso se for obrigatória")
  // jamais saberiam. Editar o JSON à mão no VPS não resolve: o publish
  // seguinte regrava o manifesto inteiro e a flag morre — foi medido nesta
  // data (a edição viveu ~40min). A alavanca agora é env de UM publish:
  //   HBX_APK_UPDATE_OBRIGATORIA=1 npm run publish
  // Default continua false — atualização forçada é exceção, não rotina.
  const updateObrigatoria = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.HBX_APK_UPDATE_OBRIGATORIA || '').trim().toLowerCase(),
  );
  const payload = {
    versionCode: version.versionCode,
    versionName: version.versionName,
    // 🔴 A URL É A DO APK DESTE APP. Um manifesto de Vendas apontando pro
    // Loghbx.apk mandaria o aparelho baixar um pacote de `applicationId`
    // diferente: o Android instala AO LADO em vez de atualizar, e o dono fica
    // com dois ícones e nenhuma correção.
    url: app.publicUrl(config),
    sha256: apk.sha256,
    obrigatoria: updateObrigatoria,
    nota: String(process.env.HBX_APK_UPDATE_NOTA || '').trim(),
    // Digital dos fontes do APK: é ela que o PRÓXIMO publish compara pra saber
    // se precisa (ou não) subir o versionCode. O app ignora este campo.
    fingerprint: version.fingerprint,
  };
  const content = JSON.stringify(payload);

  const remoteDirectory = path.posix.dirname(app.remotePath(config));
  const remotePath = path.posix.join(remoteDirectory, app.manifesto);
  const remoteTemporaryPath = `${remotePath}.${formatTimestamp()}.tmp`;
  const remoteTarget = `${config.sshUser}@${config.sshHost}`;
  const sshArgs = ['-o', 'BatchMode=yes'];
  if (config.sshPort) sshArgs.push('-p', config.sshPort);
  sshArgs.push(remoteTarget, 'bash', '-s');

  const publicUrl = resolveVersionJsonPublicUrl(config, app);
  runStep('ssh', sshArgs, {
    stdin: buildVersionJsonRemoteScript({
      app, content, remotePath, remoteTemporaryPath, publicUrl, versionCode: version.versionCode,
    }),
  });
}

// ---------------------------------------------------------------------------
// 🔴 GRAVAR NÃO É PUBLICAR — a conferência da rota BARRA o publish (19/08)
// ---------------------------------------------------------------------------
// Este `curl` já existia, e era um AVISO dentro de um `if`. Foi ele que viu o
// 404 do `version-vendas.json` todas as vezes e não impediu nada: o publish
// seguia verde, o log dizia "AVISO … confira o nginx", e o canal de update do
// Vendas ficou morto do nascimento até 19/08. Um canal que ninguém cobra é um
// canal que ninguém tem.
//
// Agora falha alto, e não é rigor de estimação — é o ÚNICO ponto onde a régua é
// o comportamento real: o arquivo pode estar gravado, a rota pode existir no
// git, o snippet pode estar instalado, e ainda assim o app perguntar e levar
// 404 (server block que não inclui o snippet, cache, alias errado). Só o 200 com
// o versionCode certo prova o canal.
//
// ⚠️ O `versionCode` É CONFERIDO NO CORPO porque "responde 200" não basta: um
// alias apontando pro manifesto do OUTRO app responde 200 lindamente e faz o
// aparelho comparar a própria versão com a de um pacote que nem é ele.
// Sai em função separada pra poder ser LIDA por um portão: o teste deste canal
// não pode "provar" a rota lendo o espelho do nginx no git — o espelho mentiria
// verde, que é exatamente o defeito de origem.
function buildVersionJsonRemoteScript({ app, content, remotePath, remoteTemporaryPath, publicUrl, versionCode }) {
  return [
    'set -euo pipefail',
    `VERSION_TMP=${shellQuote(remoteTemporaryPath)}`,
    `VERSION_TARGET=${shellQuote(remotePath)}`,
    'cleanup() { rm -f "$VERSION_TMP"; }',
    'trap cleanup EXIT',
    `cat > "$VERSION_TMP" <<'HBX_VERSION_JSON_EOF'\n${content}\nHBX_VERSION_JSON_EOF`,
    'chmod 0644 "$VERSION_TMP"',
    'mv -f "$VERSION_TMP" "$VERSION_TARGET"',
    'trap - EXIT',
    ...(publicUrl
      ? [
          `VERSION_URL=${shellQuote(publicUrl)}`,
          `VERSION_CODE=${shellQuote(String(versionCode))}`,
          'if ! curl -fsSL --retry 3 --retry-delay 2 "$VERSION_URL" >/tmp/hbx-version-check.json; then',
          `  echo "PUBLISH BARRADO: ${app.manifesto} foi gravado em $VERSION_TARGET mas NÃO responde em $VERSION_URL."`,
          '  echo "  O aparelho pergunta NESTE endereço — sem ele o app nunca vê atualização, e sem erro em tela nenhuma."',
          '  echo "  Confira o include do snippet: grep -R snippets/hbx-android-download.conf /etc/nginx/sites-enabled/"',
          '  exit 1',
          'fi',
          'if ! grep -q "\\"versionCode\\":$VERSION_CODE[,}]" /tmp/hbx-version-check.json; then',
          `  echo "PUBLISH BARRADO: $VERSION_URL respondeu, mas com outro versionCode (esperado $VERSION_CODE) — a rota está servindo o arquivo errado."`,
          '  head -c 400 /tmp/hbx-version-check.json',
          '  exit 1',
          'fi',
          `echo "${app.manifesto} publicado e CONFERIDO em $VERSION_URL (versionCode $VERSION_CODE)."`,
        ]
      : [`echo "${app.manifesto} gravado em $VERSION_TARGET (sem URL pública configurada pra validar)."`]),
  ].join('\n');
}

function main(requestedMode) {
  const mode = requestedMode || process.argv[2];
  if (!['full', 'selective'].includes(mode)) {
    throw new Error('Use: node scripts/ops/deploy-vps.js full|selective [--dry-run].');
  }

  const dryRun = process.argv.includes('--dry-run');
  const committedOnly = process.env.HBX_PUBLISH_COMMITTED_ONLY === '1';
  ensureMaster();
  const config = loadConfig();

  if (dryRun) {
    const plan = classifyServices(changedFilesAheadOfRemote());
    console.log(JSON.stringify({
      mode,
      full: mode === 'full' || plan.full,
      services: plan.services,
      androidApks: Object.values(androidApps).map((app) => path.basename(app.named)),
    }, null, 2));
    return;
  }

  if (committedOnly) {
    syncCommittedHead();
    // sem commit nenhum nesta rota: aqui a ponte só é CONFERIDA (gerar agora
    // deixaria arquivo fora do HEAD que vai publicar).
    costurarPonteDoApp(true);
  } else {
    syncMaster(mode === 'full');
    // depois do pull (a fonte pode ter chegado de fora) e ANTES do commit —
    // o gerado tem que entrar no mesmo commit da fonte.
    costurarPonteDoApp(false);
    commitEverything(mode === 'full' ? 'publish' : 'new');
  }
  const changedFiles = changedFilesAheadOfRemote();
  const plan = classifyServices(changedFiles);
  // Decide o versionCode ANTES do build (ele entra no binário): só sobe se a
  // digital dos fontes do APK mudou desde a última publicação — ver
  // resolveAndroidVersion(). Nunca deixa o publish cair se der ruim na leitura
  // do que está no ar: cai no piso do gradle e avisa no log.
  // Um número POR APP, cada um contra a digital e o manifesto DELE. Uma conta
  // só (como era até 19/08) fazia o vendas herdar a decisão do logística — e
  // era o logística que levava versão nova por mudança do vendas.
  const androidVersions = Object.fromEntries(
    Object.entries(androidApps).map(([nome, app]) => [nome, resolveAndroidVersion(config, app)]),
  );
  const androidApks = buildAndroidApk(androidVersions);
  runStep('git', ['push', remote, branch]);
  deploy(config, mode === 'full' || plan.full, plan.services);
  for (const [nome, app] of Object.entries(androidApps)) {
    publishAndroidApk(config, androidApks[nome], app.remotePath(config), app.publicUrl(config));
  }

  // PR20072026-ROTA-SALVA F4 — o manifesto de cada app (auto-update do APK).
  // 🔴 O `try` continua sendo POR APP, e pelo mesmo motivo de sempre: um
  // manifesto que falhe não pode PULAR o do vizinho — seria trocar "um app sem
  // aviso de update" por "dois". O que mudou em 19/08 é o desfecho: antes o
  // erro virava um `console.warn` e o publish terminava VERDE. Foi assim que o
  // canal do Vendas nasceu morto e ninguém soube por semanas — o log dizia
  // "AVISO", e aviso no meio de 2.000 linhas de publish é silêncio.
  // Agora as falhas são COLHIDAS (todo mundo tenta) e cobradas no fim, alto.
  const manifestosQuebrados = [];
  for (const [nome, app] of Object.entries(androidApps)) {
    try {
      publishVersionJson(config, androidApks[nome], androidVersions[nome], app);
    } catch (error) {
      manifestosQuebrados.push(`  · ${app.manifesto}: ${error && error.message ? error.message : error}`);
    }
  }
  if (manifestosQuebrados.length) {
    throw new Error([
      'PUBLISH INCOMPLETO — o APK subiu, mas o CANAL DE UPDATE de um app não respondeu:',
      ...manifestosQuebrados,
      '',
      'Enquanto essa rota não responder, o app nunca vê atualização (e não mostra erro nenhum):',
      '  · o publish seguinte não consegue ler a versão publicada,',
      '  · cai no piso do gradle e carimba o MESMO número de novo,',
      '  · o aparelho compara igual com igual e não baixa nada. Para sempre.',
      'A rota é instalada por este mesmo publish (deploy/nginx/hbx-android-download.conf →',
      '/etc/nginx/snippets/). Se ela falhou, confira o include no server block do site.',
    ].join('\n'));
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  }
}

// A digital sai exportada pra ser MEDIDA, não confiada: dá pra calcular antes e
// depois de uma mudança e provar se ela muda (ou não) o que vai pro celular.
// `arquivosDaDigital` e `androidApps` vão junto porque o portão de 19/08
// (tests/apk-digital-por-flavor.test.mjs) precisa APONTAR os arquivos, não só
// comparar hashes: hash diferente diz "mudou", a lista diz "mudou o quê".
// `readFlavorVersion` vai junto porque ele é um PARSER de texto sobre o
// build.gradle.kts, e parser de texto envelhece calado: em 22/07 ele parou de
// achar o versionCode do logística (o flavor trocou o literal por uma variável)
// e TODO publish que encostava no APK morria com exit 0, sem subir nada. Com
// dois apps, a mesma quebra agora atinge um app enquanto o outro segue verde.
// `buildRemoteScript` e `buildVersionJsonRemoteScript` saem exportados porque
// são a ÚNICA forma honesta de um portão medir o item 2 desta leva: a instalação
// da rota do manifesto acontece dentro de um script de shell que roda por SSH.
// Um teste que abrisse `deploy/nginx/hbx-android-download.conf` e dissesse "a
// rota existe" mentiria VERDE — foi exatamente a mentira que deixou o canal do
// Vendas em 404 desde o nascimento: o bloco estava no git e nunca no servidor.
// O que dá pra provar sem rede é o que a ESTEIRA MANDA FAZER, e é isso que estas
// duas funções devolvem em texto.
// `arquivoDeVersaoRel` vai junto porque é ele que separa a alavanca de versão de
// um app da do outro: um portão precisa apontar o arquivo, não confiar no nome.
module.exports = {
  main,
  computeApkFingerprint,
  arquivosDaDigital,
  androidApps,
  readFlavorVersion,
  arquivoDeVersaoRel,
  buildRemoteScript,
  buildVersionJsonRemoteScript,
  costurarPonteDoApp,
};
