'use strict';

// WEBSITE KIT — Sprint 3 / T2 (provisionador semi-automatico) + T4 (assets → Storage).
// Le backend/website-kit/companies/<slug>/site.config.json, valida contra o schema
// (backend/website-kit/schema/site.config.schema.json), copia o template pro
// destino, faz o stamp do config nos arquivos (tokens de cor, firebase-config.js,
// .firebaserc, nome da empresa), gera hbx.website.json (metadado do site
// provisionado) + HBX-DEPLOY.md do cliente, gera o manifest de assets (T4) e
// imprime um checklist do que falta fazer no console Firebase + comando de deploy.
//
// DRY-RUN POR DEFAULT — nenhuma escrita em disco, nenhuma chamada de rede/gcloud
// acontece sem `--execute`. Ver docs/PLANEJAMENTOS/WEBSITE-KIT/WEBSITE-KIT-SPRINT3.md.
//
// Uso:
//   node scripts/website-new-site.js --slug exemplo-cliente                (dry-run)
//   node scripts/website-new-site.js --slug exemplo-cliente --execute      (copia de verdade)
//
// Pre-condicao: backend/website-kit/companies/<slug>/site.config.json deve
// existir (copie backend/website-kit/schema/site.config.example.json e edite).

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const websiteKitRoot = path.join(repoRoot, 'backend', 'website-kit');
const schemaPath = path.join(websiteKitRoot, 'schema', 'site.config.schema.json');
const templatesRoot = path.join(websiteKitRoot, 'templates');
const companiesRoot = path.join(websiteKitRoot, 'companies');

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
const PROJECT_ID_RE = /^[a-z0-9-]{6,30}$/;
const ALLOWED_TEMPLATE_KEYS = ['abner-firebase', 'diego-firebase'];

// Extensoes de texto que recebem o stamp de tokens/nome (busca-substitui). Nunca
// tocamos em binarios (jpg/png/etc) — T4 trata assets separadamente.
const STAMPABLE_EXTENSIONS = new Set(['.html', '.js', '.css', '.json']);
const IGNORED_DIR_NAMES = new Set(['node_modules', '.git', '.firebase', 'dist', 'functions']);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif']);

function log(message) {
  console.log(message);
}

function logStage(title) {
  console.log(`\n=== ${title} ===`);
}

function parseArgs(argv) {
  const args = { execute: false, slug: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--execute' || arg === '-e') {
      args.execute = true;
    } else if (arg === '--slug' || arg === '-s') {
      args.slug = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--slug=')) {
      args.slug = arg.slice('--slug='.length);
    }
  }
  return args;
}

function fail(message) {
  console.error(`\n[website-new-site] ERRO: ${message}\n`);
  process.exit(1);
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

// Validador minimo e propositalmente simples (sem dependencia nova tipo ajv) —
// cobre os campos required do schema.json e os formatos (regex) mais importantes.
// Se o schema crescer muito, revisitar com uma lib de verdade.
function validateConfig(config, schema) {
  const errors = [];

  for (const requiredKey of schema.required || []) {
    if (config[requiredKey] === undefined || config[requiredKey] === null || config[requiredKey] === '') {
      errors.push(`campo obrigatorio ausente: ${requiredKey}`);
    }
  }

  if (config.schemaVersion !== 1) {
    errors.push(`schemaVersion deve ser 1 (recebido: ${JSON.stringify(config.schemaVersion)})`);
  }

  if (config.companySlug && !SLUG_RE.test(config.companySlug)) {
    errors.push(`companySlug invalido (esperado minusculo/hifen): ${config.companySlug}`);
  }

  if (config.templateKey && !ALLOWED_TEMPLATE_KEYS.includes(config.templateKey)) {
    errors.push(`templateKey deve ser um de ${ALLOWED_TEMPLATE_KEYS.join(', ')} (recebido: ${config.templateKey})`);
  }

  if (config.firebaseProjectId && !PROJECT_ID_RE.test(config.firebaseProjectId)) {
    errors.push(`firebaseProjectId invalido (6-30 chars, minusculo/numero/hifen): ${config.firebaseProjectId}`);
  }

  const tokens = config.tokens || {};
  for (const requiredToken of (schema.properties?.tokens?.required || [])) {
    const value = tokens[requiredToken];
    if (!value) {
      errors.push(`tokens.${requiredToken} ausente`);
    } else if (!HEX_COLOR_RE.test(value)) {
      errors.push(`tokens.${requiredToken} nao e uma cor hex valida: ${value}`);
    }
  }
  for (const [key, value] of Object.entries(tokens)) {
    if (value && !HEX_COLOR_RE.test(value)) {
      errors.push(`tokens.${key} nao e uma cor hex valida: ${value}`);
    }
  }

  // additionalProperties:false no schema — avisa (nao bloqueia) sobre chaves
  // de topo desconhecidas, pra pegar erro de digitacao sem travar o dono numa
  // versao antiga do schema.
  const knownKeys = new Set(Object.keys(schema.properties || {}));
  const unknownKeys = Object.keys(config).filter((key) => !knownKeys.has(key));
  const warnings = unknownKeys.map((key) => `campo desconhecido no site.config.json (ignorado): ${key}`);

  return { errors, warnings };
}

function listFilesRecursive(rootDir) {
  const results = [];
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORED_DIR_NAMES.has(entry.name)) continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function copyDirSync(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_DIR_NAMES.has(entry.name)) continue;
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Aviso de dívida conhecida (Sprint 2, 01/07): os templates hoje têm fotos de
 * PRODUTO REAIS de outro cliente embutidas (ex. diego-firebase carrega ~13MB
 * de fotos da MadeireiraDiego). Copiar o template copia essas fotos junto pro
 * cliente novo — nunca deveria ir pro site dele. T4 (assets → Storage) e T1
 * (template config-driven) so resolvem os assets DO CLIENTE NOVO; sanear as
 * imagens de amostra que já vivem dentro do template é tarefa separada (T5 da
 * Sprint 2, ainda não feita). Aqui so avisamos alto, não bloqueamos o
 * provisionamento — o dono decide se aceita ou pede a limpeza antes.
 */
function warnAboutTemplateSampleImages(destRoot) {
  const imageDirs = listFilesRecursive(destRoot).filter((file) => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()));
  if (!imageDirs.length) return;

  const totalBytes = imageDirs.reduce((sum, file) => sum + fs.statSync(file).size, 0);
  const totalMb = totalBytes / (1024 * 1024);
  if (totalMb < 1) return;

  log(
    `[aviso] O template copiou ${imageDirs.length} imagem(ns) (~${totalMb.toFixed(1)} MB) de AMOSTRA — ` +
      'confira se sao fotos de produto de OUTRO cliente (divida conhecida do diego-firebase, ver ' +
      'docs/PLANEJAMENTOS/WEBSITE-KIT/) antes de publicar. Remova/substitua por fotos do cliente novo ou pelo ' +
      'manifest de assets (T4) antes do deploy.',
  );
}

/**
 * Stamp de tokens de cor: procura o bloco `:root { ... }` em arquivos .css
 * (quando existir) e sobrescreve/injeta as custom properties do config.
 * Propositalmente simples (regex, nao um parser CSS) — cobre o formato usado
 * hoje pelos templates (ver site-theme.css do abner-firebase). Se o template
 * nao tiver `:root` em nenhum .css, so avisa (nao falha).
 */
function stampCssTokens(destRoot, tokens) {
  const tokenNameByConfigKey = {
    accent: '--accent',
    accentStrong: '--accent-strong',
    bg: '--bg',
    bgElevated: '--bg-elevated',
    text: '--text',
    muted: '--muted',
  };

  const cssFiles = listFilesRecursive(destRoot).filter((file) => file.endsWith('.css'));
  let stampedAny = false;

  for (const cssFile of cssFiles) {
    let content = fs.readFileSync(cssFile, 'utf8');
    const rootMatch = content.match(/:root\s*\{[^}]*\}/);
    if (!rootMatch) continue;

    let rootBlock = rootMatch[0];
    for (const [configKey, cssVar] of Object.entries(tokenNameByConfigKey)) {
      const value = tokens[configKey];
      if (!value) continue;
      const varRegex = new RegExp(`${cssVar}\\s*:\\s*[^;]+;`);
      if (varRegex.test(rootBlock)) {
        rootBlock = rootBlock.replace(varRegex, `${cssVar}: ${value};`);
      } else {
        rootBlock = rootBlock.replace(/\}$/, `  ${cssVar}: ${value};\n}`);
      }
    }

    content = content.replace(/:root\s*\{[^}]*\}/, rootBlock);
    fs.writeFileSync(cssFile, content, 'utf8');
    stampedAny = true;
  }

  return stampedAny;
}

/**
 * Stamp do firebase-config.js e .firebaserc com o projectId/config do cliente.
 * So sobrescreve quando o campo correspondente esta preenchido no
 * site.config.json — campos em branco (ex. apiKey "PENDENTE-DONO...") viram
 * PENDENTE-DONO no checklist final em vez de gravar lixo no arquivo.
 */
function stampFirebaseConfig(destRoot, config) {
  const pending = [];

  const firebasercPath = path.join(destRoot, '.firebaserc');
  if (fs.existsSync(firebasercPath)) {
    const firebaserc = readJson(firebasercPath);
    firebaserc.projects = firebaserc.projects || {};
    firebaserc.projects.default = config.firebaseProjectId;
    fs.writeFileSync(firebasercPath, `${JSON.stringify(firebaserc, null, 2)}\n`, 'utf8');
  }

  const firebaseConfigCandidates = listFilesRecursive(destRoot).filter(
    (file) => path.basename(file) === 'firebase-config.js',
  );

  for (const configFile of firebaseConfigCandidates) {
    let content = fs.readFileSync(configFile, 'utf8');
    const firebaseBlock = config.firebase || {};
    const fields = {
      projectId: config.firebaseProjectId,
      authDomain: firebaseBlock.authDomain || `${config.firebaseProjectId}.firebaseapp.com`,
      storageBucket: firebaseBlock.storageBucket || `${config.firebaseProjectId}.firebasestorage.app`,
      apiKey: firebaseBlock.apiKey || null,
      messagingSenderId: firebaseBlock.messagingSenderId || null,
      appId: firebaseBlock.appId || null,
    };

    for (const [field, value] of Object.entries(fields)) {
      const fieldRegex = new RegExp(`(${field}\\s*:\\s*)"[^"]*"`);
      if (!fieldRegex.test(content)) continue;
      if (value) {
        content = content.replace(fieldRegex, `$1"${value}"`);
      } else {
        pending.push(`firebase-config.js: campo "${field}" precisa ser preenchido a mao (console Firebase > Config do app) — arquivo: ${path.relative(repoRoot, configFile)}`);
      }
    }

    fs.writeFileSync(configFile, content, 'utf8');
  }

  return pending;
}

/**
 * Stamp de nome da empresa em <title> e ocorrencias simples de placeholder.
 * Deliberadamente conservador: so troca o <title>...</title> do index.html e
 * admin.html quando existir, nunca faz find/replace livre no corpo do site
 * (arriscado demais pra um script semi-automatico).
 */
function stampCompanyName(destRoot, companyName) {
  const htmlFiles = ['index.html', 'admin.html']
    .map((name) => path.join(destRoot, 'my-project', name))
    .filter((file) => fs.existsSync(file));

  for (const file of htmlFiles) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/<title>[^<]*<\/title>/, `<title>${companyName}</title>`);
    fs.writeFileSync(file, content, 'utf8');
  }
}

/**
 * T4 — manifest de assets: em vez de copiar fotos do cliente pro repo (regra
 * dura do dominio: nunca foto real de cliente no git), gera um JSON com a
 * lista de arquivos encontrados em `assets.sourceDir` + o comando gsutil pra
 * subir pro Storage do projeto. NENHUM upload acontece aqui.
 */
function buildAssetsManifest(config) {
  const assets = config.assets || {};
  const sourceDir = assets.sourceDir;
  const bucketPath = String(assets.storageBucketPath || '').replace(/^\/+/, '');
  const bucket = `${config.firebaseProjectId}.firebasestorage.app`;

  if (!sourceDir) {
    return {
      manifest: null,
      warnings: ['assets.sourceDir nao configurado no site.config.json — pulei o manifest de assets (T4).'],
    };
  }

  if (!fs.existsSync(sourceDir)) {
    return {
      manifest: null,
      warnings: [`assets.sourceDir aponta pra pasta inexistente: ${sourceDir} — confira o caminho antes do deploy.`],
    };
  }

  const files = listFilesRecursive(sourceDir).filter((file) =>
    IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()),
  );

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceDir,
    firebaseProjectId: config.firebaseProjectId,
    storageBucket: bucket,
    storageBucketPath: bucketPath,
    fileCount: files.length,
    files: files.map((file) => ({
      localPath: file,
      relativeName: path.relative(sourceDir, file).replace(/\\/g, '/'),
      storageDestination: `gs://${bucket}/${bucketPath}${path.relative(sourceDir, file).replace(/\\/g, '/')}`,
    })),
    uploadCommand:
      files.length > 0
        ? `gsutil -m cp -r "${sourceDir}/*" "gs://${bucket}/${bucketPath}"`
        : null,
    consoleAlternative: `https://console.firebase.google.com/project/${config.firebaseProjectId}/storage`,
  };

  return { manifest, warnings: [] };
}

function buildDeployMarkdown(config, siteMeta, assetsManifestPath, pendingItems) {
  const lines = [];
  lines.push(`# Deploy — ${config.companyName}`);
  lines.push('');
  lines.push(`Gerado por \`scripts/website-new-site.js\` em ${siteMeta.generatedAt}. NAO commitar segredos.`);
  lines.push('');
  lines.push('## Dados do provisionamento');
  lines.push('');
  lines.push(`- Slug: \`${config.companySlug}\``);
  lines.push(`- Template: \`${config.templateKey}\``);
  lines.push(`- Firebase Project ID: \`${config.firebaseProjectId}\``);
  lines.push(`- Mint central habilitado no site.config.json: ${config.mint?.useCentralMint !== false ? 'sim' : 'nao'}`);
  lines.push('');
  lines.push('## Checklist manual no console Firebase (PENDENTE-DONO)');
  lines.push('');
  lines.push('1. Criar o projeto Firebase novo com o Project ID exato acima (console.firebase.google.com > Adicionar projeto).');
  lines.push('2. Registrar um app Web no projeto e copiar apiKey/messagingSenderId/appId pro `firebase-config.js` (campos marcados PENDENTE-DONO abaixo, se houver).');
  lines.push('3. Ativar Firebase Auth (metodo Email/Senha) se o template usar login direto.');
  lines.push('4. Ativar Firestore (modo producao) e Storage.');
  if (config.mint?.useCentralMint !== false) {
    lines.push('5. Projeto pode ficar em plano **Spark** (sem billing) — mint central do HBX substitui a Cloud Function por projeto (ver WEBSITE-KIT-SPRINT3.md T3). So migrar pra Blaze se o cliente precisar de outra Function paga.');
    lines.push('6. Dar a role `roles/iam.serviceAccountTokenCreator` pra service account central do HBX (`WEBSITE_MINT_SA_EMAIL`) sobre a service account default deste projeto — sem isso o mint central falha e o site cai no fallback antigo (se existir) ou fica sem login automatico.');
  } else {
    lines.push('5. Projeto precisa de plano **Blaze** (Cloud Functions v2 = `hbx-auth-flow.js`) — mint central desligado pra este cliente.');
    lines.push('6. Fazer deploy da Function `createHbxAdminFirebaseToken` (copiar de `backend/website-kit/companies/madeireiradiego/site/my-project/functions/hbx-auth-flow.js`).');
  }
  lines.push('7. Configurar `CORS_ALLOWED_FIREBASE_ORIGINS` no `.env` da VPS incluindo o dominio deste site (ver docs/Rules/WEBSITE-KIT.md).');
  lines.push('8. Ligar o site no HBX: `PATCH /website/master/company/:id/config` com `websiteEnabled`, `websitePublicUrl`, `websiteProjectId`.');
  if (assetsManifestPath) {
    lines.push(`9. Subir os assets pro Storage — ver manifest em \`${assetsManifestPath}\` (comando gsutil ja pronto la dentro) ou arrastar manualmente pelo console.`);
  }
  lines.push('');
  lines.push('## Comando de deploy (depois do console configurado)');
  lines.push('');
  lines.push('```powershell');
  lines.push(`firebase deploy --only hosting --project ${config.firebaseProjectId}`);
  if (config.mint?.useCentralMint === false) {
    lines.push(`firebase deploy --only functions --project ${config.firebaseProjectId}`);
  }
  lines.push('```');
  lines.push('');
  if (pendingItems.length) {
    lines.push('## PENDENTE-DONO (gerado automaticamente pelo stamp)');
    lines.push('');
    for (const item of pendingItems) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.slug) {
    fail('Passe --slug <companySlug>. Ex.: node scripts/website-new-site.js --slug exemplo-cliente');
  }

  logStage('WEBSITE KIT — new-site (Sprint 3 / T2 + T4)');
  log(`Slug: ${args.slug}`);
  log(`Modo: ${args.execute ? 'EXECUTAR (grava arquivos)' : 'DRY-RUN (so mostra o que faria)'}`);

  const configPath = path.join(companiesRoot, args.slug, 'site.config.json');
  if (!fs.existsSync(configPath)) {
    fail(
      `Nao encontrei ${path.relative(repoRoot, configPath)}. Copie ` +
        `backend/website-kit/schema/site.config.example.json pra esse caminho e edite antes de rodar de novo.`,
    );
  }

  const schema = readJson(schemaPath);
  const config = readJson(configPath);

  logStage('Validacao do site.config.json');
  const { errors, warnings } = validateConfig(config, schema);
  for (const warning of warnings) log(`[aviso] ${warning}`);
  if (errors.length) {
    for (const error of errors) console.error(`[erro] ${error}`);
    fail(`site.config.json invalido (${errors.length} erro(s) acima). Corrija e rode de novo.`);
  }
  log('site.config.json valido.');

  if (config.companySlug !== args.slug) {
    fail(`companySlug do config ("${config.companySlug}") nao bate com --slug ("${args.slug}").`);
  }

  const templateRoot = path.join(templatesRoot, config.templateKey, 'source');
  if (!fs.existsSync(templateRoot)) {
    fail(`Template "${config.templateKey}" nao encontrado em ${path.relative(repoRoot, templateRoot)}.`);
  }

  const destRoot = path.join(companiesRoot, args.slug, 'site');

  logStage('Copia do template');
  log(`Origem: ${path.relative(repoRoot, templateRoot)}`);
  log(`Destino: ${path.relative(repoRoot, destRoot)}`);
  if (fs.existsSync(destRoot)) {
    log(`[aviso] Destino ja existe. ${args.execute ? 'Arquivos serao sobrescritos onde o stamp mexe (copia nao apaga extras).' : '(dry-run, nada e alterado)'}`);
  }

  if (args.execute) {
    copyDirSync(templateRoot, destRoot);
    warnAboutTemplateSampleImages(destRoot);
  } else {
    const fileCount = listFilesRecursive(templateRoot).length;
    log(`(dry-run) copiaria ${fileCount} arquivo(s).`);
  }

  const pendingItems = [];

  logStage('Stamp do config nos arquivos');
  if (args.execute) {
    const stampedCss = stampCssTokens(destRoot, config.tokens || {});
    log(stampedCss ? 'Tokens de cor aplicados em pelo menos 1 arquivo .css.' : '[aviso] Nenhum bloco :root encontrado nos .css do template — tokens NAO foram aplicados (template pode nao ser config-driven ainda para cor).');

    const firebasePending = stampFirebaseConfig(destRoot, config);
    pendingItems.push(...firebasePending);

    stampCompanyName(destRoot, config.companyName);
    log('Nome da empresa aplicado em <title> de index.html/admin.html (quando existentes).');
  } else {
    log('(dry-run) stamp de tokens/firebase-config/nome seria aplicado aqui.');
  }

  logStage('Manifest de assets (T4 — sem upload live)');
  const { manifest, warnings: assetWarnings } = buildAssetsManifest(config);
  for (const warning of assetWarnings) log(`[aviso] ${warning}`);
  let assetsManifestRelPath = null;
  if (manifest) {
    log(`${manifest.fileCount} imagem(ns) encontrada(s) em ${manifest.sourceDir}.`);
    const manifestPath = path.join(companiesRoot, args.slug, 'assets-manifest.json');
    assetsManifestRelPath = path.relative(repoRoot, manifestPath);
    if (args.execute) {
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      log(`Manifest gravado em ${assetsManifestRelPath} (NENHUM arquivo de imagem foi copiado pro repo).`);
    } else {
      log(`(dry-run) manifest seria gravado em ${assetsManifestRelPath}.`);
    }
    if (manifest.uploadCommand) {
      log(`Comando de upload (PENDENTE-DONO, rodar manualmente): ${manifest.uploadCommand}`);
    }
  }

  logStage('hbx.website.json + HBX-DEPLOY.md');
  const siteMeta = {
    schemaVersion: 1,
    companySlug: config.companySlug,
    companyName: config.companyName,
    companyId: config.companyId || null,
    templateKey: config.templateKey,
    firebaseProjectId: config.firebaseProjectId,
    useCentralMint: config.mint?.useCentralMint !== false,
    generatedAt: new Date().toISOString(),
    generatedBy: 'scripts/website-new-site.js',
  };

  const deployMarkdown = buildDeployMarkdown(config, siteMeta, assetsManifestRelPath, pendingItems);

  if (args.execute) {
    fs.writeFileSync(path.join(companiesRoot, args.slug, 'hbx.website.json'), `${JSON.stringify(siteMeta, null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(companiesRoot, args.slug, 'HBX-DEPLOY.md'), `${deployMarkdown}\n`, 'utf8');
    log(`Gravados: backend/website-kit/companies/${args.slug}/hbx.website.json e HBX-DEPLOY.md`);
  } else {
    log('(dry-run) hbx.website.json e HBX-DEPLOY.md seriam gravados aqui — preview do checklist abaixo:');
    console.log(`\n${deployMarkdown}\n`);
  }

  logStage('Resumo');
  if (!args.execute) {
    log('DRY-RUN concluido. Nenhum arquivo foi alterado. Rode com --execute para gravar de verdade.');
  } else {
    log('Provisionamento LOCAL concluido. Nenhuma chamada de rede/gcloud foi feita — siga o checklist do HBX-DEPLOY.md gerado.');
  }
  if (pendingItems.length) {
    log(`\n${pendingItems.length} item(ns) PENDENTE-DONO (preenchimento manual necessario):`);
    for (const item of pendingItems) log(` - ${item}`);
  }
}

main();
