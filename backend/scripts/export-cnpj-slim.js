#!/usr/bin/env node
/**
 * Exporta um EXTRATO MAGRO da CnpjPublicCompany local para subir na VPS (F1 —
 * docs/PLANEJAMENTOS/PR02072026/F1-rfb-carga-extrato-vps.md).
 *
 * A "lei" travada (MOTOR-RFB-FILA sprint 2, item 5) é "VPS nunca recebe o dump cru" — isso
 * vale pro dump cru da RFB (Empresas/Estabelecimentos/Socios .zip). O extrato normalizado de
 * BUSCA (razão, fantasia, CNAE, cidade/UF, situação e contatos oficiais) contém somente o que
 * a fonte `cnpj_public` do Radar precisa — sem endereço completo, sócio ou rawJson.
 *
 * Uso:
 *   node scripts/export-cnpj-slim.js                       # exporta ativas p/ ~/hbx-data/rfb/export/
 *   node scripts/export-cnpj-slim.js --out caminho/arq.csv.gz
 *   node scripts/export-cnpj-slim.js --all-situacoes        # inclui inativas/baixadas (default: só 'ativa')
 *
 * Saída: CSV com header, gzip, colunas na ordem do COPY (ver COLUMNS abaixo) — pronto pra
 * `COPY "CnpjPublicCompany" (<COLUMNS>) FROM STDIN WITH (FORMAT csv, HEADER, DELIMITER ',')`
 * (após gunzip) no postgres de destino. Colunas ausentes no extrato (address, website,
 * rawJson, ownerQualification) ficam NULL no destino — só a busca funciona lá, que é o objetivo.
 *
 * Roda 100% LOCAL: fala com o postgres via `docker exec` (mesmo padrão do import-cnpj-dataset.js,
 * sem dependência nova). Não escreve nada no banco — só lê e exporta.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const { spawn } = require('child_process');

function arg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : true;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function log(msg) {
  console.log(`[export-cnpj-slim] ${new Date().toISOString().slice(11, 19)} ${msg}`);
}

// Colunas do extrato magro — só o que a fonte cnpj_public precisa pra resolver por
// nome+cidade/CNAE e entregar contatos RFB normalizados. SEM address, website, rawJson, sócio.
const COLUMNS = [
  'id', 'cnpj', 'razaoSocial', 'nomeFantasia', 'situacao', 'cnae', 'cnaeDescription',
  'porte', 'matrizFilial', 'openedAt', 'phone', 'phone2', 'phoneDigits', 'email', 'city', 'state',
  'normalizedCity', 'searchText', 'ownerName', 'importedAt', 'createdAt', 'updatedAt',
];

function dbConfig() {
  const container = arg('container', process.env.HBX_DB_CONTAINER || 'app-db-1');
  let user = 'admin';
  let db = 'jhonatan_dev';
  const envPath = path.join(__dirname, '..', '.env');
  try {
    const envText = fs.readFileSync(envPath, 'utf8');
    const match = envText.match(/^DATABASE_URL\s*=\s*"?postgresql:\/\/([^:@/]+)[^@]*@[^/]+\/([^?"\s]+)/m);
    if (match) {
      user = match[1];
      db = match[2];
    }
  } catch { /* usa defaults */ }
  return { container: String(container), user, db };
}

/** COPY (SELECT ...) TO STDOUT streaming direto pro gzip → arquivo. Não materializa em memória. */
function exportSlim(destPath, { allSituacoes }) {
  const { container, user, db } = dbConfig();
  const whereClause = allSituacoes ? '' : `WHERE "situacao" = 'ativa'`;
  const copySql = `COPY (SELECT ${COLUMNS.map((c) => `"${c}"`).join(', ')} FROM "CnpjPublicCompany" ${whereClause} ORDER BY cnpj) TO STDOUT WITH (FORMAT csv, HEADER, DELIMITER ',', QUOTE '"')`;

  return new Promise((resolve, reject) => {
    const psqlProc = spawn('docker', [
      'exec', '-i', container, 'psql', '-U', user, '-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-c', copySql,
    ]);
    const gzip = zlib.createGzip({ level: 6 });
    const outStream = fs.createWriteStream(destPath);
    let stderrAll = '';
    let bytesOut = 0;
    let linesOut = 0;
    let headerSeen = false;
    let carry = '';

    psqlProc.stderr.on('data', (d) => { stderrAll += d; });
    // conta linhas de dados (exclui o header) sem armazenar o CSV inteiro em memória
    psqlProc.stdout.on('data', (chunk) => {
      const text = carry + chunk.toString('utf8');
      const parts = text.split('\n');
      carry = parts.pop();
      for (const _line of parts) {
        if (!headerSeen) { headerSeen = true; continue; }
        linesOut += 1;
      }
    });
    gzip.on('data', (chunk) => { bytesOut += chunk.length; });

    psqlProc.stdout.pipe(gzip).pipe(outStream);
    psqlProc.on('error', reject);
    gzip.on('error', reject);
    outStream.on('error', reject);

    outStream.on('finish', () => {
      if (carry && carry.trim()) linesOut += 1; // última linha sem \n final
      resolve({ bytesOut, linesOut });
    });

    psqlProc.on('close', (code) => {
      if (code !== 0) reject(new Error(`psql COPY falhou (${code}): ${stderrAll.trim().slice(0, 2000)}`));
    });
  });
}

async function main() {
  const allSituacoes = hasFlag('all-situacoes');
  const outArg = arg('out');
  const destPath = outArg && outArg !== true
    ? path.resolve(String(outArg))
    : path.join(os.homedir(), 'hbx-data', 'rfb', 'export', `cnpj-slim-${new Date().toISOString().slice(0, 10)}.csv.gz`);

  fs.mkdirSync(path.dirname(destPath), { recursive: true });

  const totalLocal = (() => {
    try {
      const { spawnSync } = require('child_process');
      const { container, user, db } = dbConfig();
      const whereClause = allSituacoes ? '' : `WHERE situacao = 'ativa'`;
      const r = spawnSync('docker', ['exec', '-i', container, 'psql', '-U', user, '-d', db, '-t', '-A',
        '-c', `SELECT count(*) FROM "CnpjPublicCompany" ${whereClause};`], { encoding: 'utf8' });
      return Number((r.stdout || '0').trim().split('\n')[0]) || 0;
    } catch { return null; }
  })();
  log(`fonte: CnpjPublicCompany local${allSituacoes ? ' (todas as situações)' : " (situacao='ativa')"} — ${totalLocal != null ? totalLocal.toLocaleString('pt-BR') : '?'} linhas esperadas`);
  log(`colunas (${COLUMNS.length}): ${COLUMNS.join(', ')}`);
  log(`destino: ${destPath}`);

  const t0 = Date.now();
  const { bytesOut, linesOut } = await exportSlim(destPath, { allSituacoes });
  const elapsedS = (Date.now() - t0) / 1000;

  log(`FIM: ${linesOut.toLocaleString('pt-BR')} linhas · ${(bytesOut / 1024 / 1024).toFixed(1)} MB gzip · ${elapsedS.toFixed(0)}s`);
  if (totalLocal != null && linesOut !== totalLocal) {
    log(`AVISO: linhas exportadas (${linesOut}) != contagem esperada (${totalLocal}) — conferir.`);
  }
  console.log(destPath);
}

main().catch((error) => {
  console.error('[export-cnpj-slim] falhou:', error);
  process.exit(1);
});
