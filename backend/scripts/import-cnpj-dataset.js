#!/usr/bin/env node
/**
 * Importa dados abertos do CNPJ (Receita Federal) para a tabela CnpjPublicCompany,
 * que alimenta a fonte cnpj_public do Radar (modos deep / night_factory).
 *
 * ── MODO RFB (dump oficial completo, ~28M ativas) ──────────────────────────────
 *   node scripts/import-cnpj-dataset.js rfb                         # download + carga do mês mais recente
 *   node scripts/import-cnpj-dataset.js rfb --month 2026-06         # mês específico
 *   node scripts/import-cnpj-dataset.js rfb --download-only         # só baixa os zips
 *   node scripts/import-cnpj-dataset.js rfb --no-download           # só carga (zips já baixados)
 *   node scripts/import-cnpj-dataset.js rfb --verify                # só mede o aceite (contagens + timing)
 *   node scripts/import-cnpj-dataset.js rfb --force                 # re-executa etapas já concluídas
 *
 *   Fonte: repositório Nextcloud oficial da RFB (URL vigente desde jan/2026):
 *     https://arquivos.receitafederal.gov.br/index.php/s/YggdBLfdninEJX9  (pasta <AAAA-MM>/)
 *   Se o share oficial cair de novo (já mudou 1x em jan/26), aponte pro mirror sem editar
 *   código: HBX_RFB_WEBDAV_BASE=https://dados-abertos-rf-cnpj.casadosdados.com.br/... ou
 *   --webdav-base <url> (ambos por cima do default acima).
 *   Arquivos: Empresas0-9.zip, Estabelecimentos0-9.zip, Socios0-9.zip, Simples.zip + auxiliares
 *   (Cnaes, Municipios, Qualificacoes). CSV ';' com aspas, SEM cabeçalho, LATIN1.
 *
 *   Estratégia de carga (escala 28M — upsert de 1000 em 1000 NÃO escala):
 *     1. unzip -p (stream) → docker exec psql COPY FROM STDIN → staging UNLOGGED
 *     2. transform set-based: INSERT ... SELECT ... ON CONFLICT (cnpj) DO UPDATE
 *        (só estabelecimentos ATIVOS/situacao 02; join Empresas+Municipios+Cnaes+Sócios+Simples)
 *     3. catálogo CnpjPublicCnae (código→descrição) upsertado do dump Cnaes.zip (HOT-02)
 *     4. anti-contador HOT-03 (phoneShareCount/emailShareCount via GROUP BY na tabela final)
 *     5. índices secundários derrubados ANTES da carga e recriados DEPOIS
 *     6. VACUUM ANALYZE no fim
 *   Idempotente e retomável POR ARQUIVO/ETAPA: ledger cnpj_import_ledger no próprio banco;
 *   re-rodar não duplica (ON CONFLICT + TRUNCATE/reload dos sócios) e pula o que já foi.
 *
 *   Colunas de enriquecimento (HOT-01, aditivas): capitalSocial + naturezaJuridica (Empresas),
 *   simples/mei (Simples.zip), phone2/cnaeSecundarias (Estabelecimentos). regimeTributario
 *   (Lucro Real/Presumido/Arbitrado) é dataset separado da RFB, não vem neste dump — fica NULL,
 *   fase 2.
 *
 *   Matching em 28M: ancorado em normalizedCity+state primeiro (índice composto já existe;
 *   toda query do Radar filtra cidade antes de qualquer LIKE) — dispensa pg_trgm pro caso comum.
 *   pg_trgm em searchText fica como reforço pro recorte dentro da cidade (CREATE_INDEXES).
 *
 *   Requisitos: docker (container Postgres local, default app-db-1), unzip OU tar (bsdtar),
 *   curl. Roda 100% LOCAL — o VPS NUNCA recebe a base crua (decisão travada do dono).
 *
 * ── MODO LEGADO (arquivo avulso JSONL/CSV, lotes pequenos) ──────────────────────
 *   node scripts/import-cnpj-dataset.js --file caminho/para/dados.jsonl
 *   node scripts/import-cnpj-dataset.js --file dados.csv --only-active
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { Transform } = require('stream');
const { spawn, spawnSync } = require('child_process');

// ─────────────────────────────────────────────────────────────────────────────
// CLI helpers
// ─────────────────────────────────────────────────────────────────────────────

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
  console.log(`[import-cnpj] ${new Date().toISOString().slice(11, 19)} ${msg}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// MODO RFB — constantes
// ─────────────────────────────────────────────────────────────────────────────

// Token do share público oficial (link publicado em dados.gov.br / gov.br/receitafederal).
// Layout/URL mudou jan/26 — se o share WebDAV oficial cair de novo, aponte pro mirror
// (ex.: dados-abertos-rf-cnpj.casadosdados.com.br) via env/flag SEM editar código:
//   HBX_RFB_WEBDAV_BASE=https://mirror/... node scripts/import-cnpj-dataset.js rfb
//   node scripts/import-cnpj-dataset.js rfb --webdav-base https://mirror/...
const RFB_SHARE_TOKEN = process.env.HBX_RFB_SHARE_TOKEN || 'YggdBLfdninEJX9';
const RFB_WEBDAV_BASE = arg('webdav-base', process.env.HBX_RFB_WEBDAV_BASE
  || 'https://arquivos.receitafederal.gov.br/public.php/webdav');

// Grupos de arquivos do dump. Shards são descobertos no servidor (hoje 0-9, pode mudar).
// Simples entra aqui pro flag simples/mei (SQL_UPSERT_COMPANIES) — sem ele, ficam sempre NULL.
const RFB_GROUPS = ['Empresas', 'Estabelecimentos', 'Socios', 'Simples', 'Cnaes', 'Municipios', 'Qualificacoes'];

const STAGING_DDL = `
CREATE TABLE IF NOT EXISTS cnpj_import_ledger (
  id bigserial PRIMARY KEY,
  month text NOT NULL,
  step text NOT NULL,
  rows_count bigint,
  completed_at timestamptz DEFAULT now(),
  UNIQUE (month, step)
);
CREATE UNLOGGED TABLE IF NOT EXISTS stg_rfb_empresas (
  cnpj_basico text, razao_social text, natureza_juridica text,
  qualificacao_responsavel text, capital_social text, porte text, ente_federativo text
);
CREATE UNLOGGED TABLE IF NOT EXISTS stg_rfb_estabelecimentos (
  cnpj_basico text, cnpj_ordem text, cnpj_dv text, matriz_filial text,
  nome_fantasia text, situacao text, data_situacao text, motivo_situacao text,
  cidade_exterior text, pais text, data_inicio text, cnae_principal text, cnae_secundario text,
  tipo_logradouro text, logradouro text, numero text, complemento text, bairro text,
  cep text, uf text, municipio text, ddd1 text, telefone1 text, ddd2 text, telefone2 text,
  ddd_fax text, fax text, email text, situacao_especial text, data_situacao_especial text
);
CREATE UNLOGGED TABLE IF NOT EXISTS stg_rfb_socios (
  cnpj_basico text, identificador text, nome_socio text, documento_socio text,
  qualificacao text, data_entrada text, pais text, representante_doc text,
  representante_nome text, representante_qualificacao text, faixa_etaria text
);
-- Simples.zip: 1 linha por cnpj_basico. opcao_simples/opcao_mei = 'S'/'N' (raramente vazio).
CREATE UNLOGGED TABLE IF NOT EXISTS stg_rfb_simples (
  cnpj_basico text, opcao_simples text, data_opcao_simples text, data_exclusao_simples text,
  opcao_mei text, data_opcao_mei text, data_exclusao_mei text
);
CREATE UNLOGGED TABLE IF NOT EXISTS stg_rfb_cnaes (codigo text, descricao text);
CREATE UNLOGGED TABLE IF NOT EXISTS stg_rfb_municipios (codigo text, descricao text);
CREATE UNLOGGED TABLE IF NOT EXISTS stg_rfb_qualificacoes (codigo text, descricao text);

-- Normalização idêntica ao normalizeText do TS (minúsculo, sem acento pt-BR, espaços colapsados).
CREATE OR REPLACE FUNCTION rfb_norm(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $fn$
  SELECT btrim(regexp_replace(lower(translate(coalesce(t, ''),
    'ÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝáàâãäåéèêëíìîïóòôõöúùûüçñýÿ',
    'AAAAAAEEEEIIIIOOOOOUUUUCNYaaaaaaeeeeiiiiooooouuuucnyy')),
    '\\s+', ' ', 'g'))
$fn$;

-- Data AAAAMMDD do dump → timestamp; lixo ('0', '00000000', dia inválido) vira NULL.
CREATE OR REPLACE FUNCTION try_rfb_date(t text) RETURNS timestamp LANGUAGE plpgsql IMMUTABLE AS $fn$
BEGIN
  IF t IS NULL OR t !~ '^\\d{8}$' OR t = '00000000' THEN RETURN NULL; END IF;
  RETURN to_date(t, 'YYYYMMDD')::timestamp;
EXCEPTION WHEN others THEN RETURN NULL;
END $fn$;
`;

// COPY column lists por grupo (ordem EXATA do layout oficial validado em 02/07/2026).
const COPY_COLUMNS = {
  Empresas: 'cnpj_basico, razao_social, natureza_juridica, qualificacao_responsavel, capital_social, porte, ente_federativo',
  Estabelecimentos: 'cnpj_basico, cnpj_ordem, cnpj_dv, matriz_filial, nome_fantasia, situacao, data_situacao, motivo_situacao, cidade_exterior, pais, data_inicio, cnae_principal, cnae_secundario, tipo_logradouro, logradouro, numero, complemento, bairro, cep, uf, municipio, ddd1, telefone1, ddd2, telefone2, ddd_fax, fax, email, situacao_especial, data_situacao_especial',
  Socios: 'cnpj_basico, identificador, nome_socio, documento_socio, qualificacao, data_entrada, pais, representante_doc, representante_nome, representante_qualificacao, faixa_etaria',
  Simples: 'cnpj_basico, opcao_simples, data_opcao_simples, data_exclusao_simples, opcao_mei, data_opcao_mei, data_exclusao_mei',
  Cnaes: 'codigo, descricao',
  Municipios: 'codigo, descricao',
  Qualificacoes: 'codigo, descricao',
};

const STAGING_TABLE = {
  Empresas: 'stg_rfb_empresas',
  Estabelecimentos: 'stg_rfb_estabelecimentos',
  Socios: 'stg_rfb_socios',
  Simples: 'stg_rfb_simples',
  Cnaes: 'stg_rfb_cnaes',
  Municipios: 'stg_rfb_municipios',
  Qualificacoes: 'stg_rfb_qualificacoes',
};

// ─────────────────────────────────────────────────────────────────────────────
// psql via docker exec (sem dependência nova: backend não tem driver pg)
// ─────────────────────────────────────────────────────────────────────────────

function dbConfig() {
  const container = arg('container', process.env.HBX_DB_CONTAINER || 'app-db-1');
  // user/db saem do DATABASE_URL do backend/.env (senha não é necessária dentro do container)
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

/** Roda SQL no psql do container. sql via stdin (-f -) → sem inferno de quoting no Windows. */
function psql(sql, { tuplesOnly = false, singleTransaction = false } = {}) {
  const { container, user, db } = dbConfig();
  const args = ['exec', '-i', container, 'psql', '-U', user, '-d', db, '-v', 'ON_ERROR_STOP=1', '-q'];
  if (tuplesOnly) args.push('-t', '-A');
  if (singleTransaction) args.push('-1'); // fase inteira atômica (VACUUM NÃO pode usar isso)
  args.push('-f', '-');
  const result = spawnSync('docker', args, { input: sql, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`psql falhou: ${(result.stderr || result.stdout || '').trim().slice(0, 2000)}`);
  }
  return (result.stdout || '').trim();
}

function psqlValue(sql) {
  return psql(sql, { tuplesOnly: true }).split('\n')[0].trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Ledger (idempotência / retomada)
// ─────────────────────────────────────────────────────────────────────────────

function ledgerDone(month, step) {
  const count = psqlValue(`SELECT count(*) FROM cnpj_import_ledger WHERE month = '${month}' AND step = '${step}';`);
  return Number(count) > 0;
}

function ledgerMark(month, step, rows = null) {
  const rowsSql = rows == null ? 'NULL' : String(Number(rows) || 0);
  psql(`INSERT INTO cnpj_import_ledger (month, step, rows_count) VALUES ('${month}', '${step}', ${rowsSql})
        ON CONFLICT (month, step) DO UPDATE SET rows_count = EXCLUDED.rows_count, completed_at = now();`);
}

function ledgerClear(month) {
  psql(`DELETE FROM cnpj_import_ledger WHERE month = '${month}';`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Download (WebDAV público da RFB, resume com curl -C -)
// ─────────────────────────────────────────────────────────────────────────────

function curlText(url, extraArgs = []) {
  const result = spawnSync('curl', ['-sf', '-u', `${RFB_SHARE_TOKEN}:`, ...extraArgs, url], {
    encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`curl falhou (${url}): ${(result.stderr || '').trim().slice(0, 500)}`);
  return result.stdout || '';
}

/** Lista pastas/arquivos de um caminho do share via PROPFIND. */
function webdavList(subPath = '') {
  const url = `${RFB_WEBDAV_BASE}/${subPath}`;
  const xml = curlText(url, ['-X', 'PROPFIND', '-H', 'Depth: 1']);
  const entries = [];
  const blocks = xml.split('<d:response>').slice(1);
  for (const block of blocks) {
    const href = (block.match(/<d:href>([^<]+)<\/d:href>/) || [])[1] || '';
    const size = Number((block.match(/<d:getcontentlength>(\d+)<\/d:getcontentlength>/) || [])[1] || 0);
    const name = decodeURIComponent(href).replace(/\/+$/, '').split('/').pop();
    if (!name || name === subPath.replace(/\/+$/, '')) continue;
    entries.push({ name, size, isDir: !/<d:getcontentlength>/.test(block) });
  }
  return entries;
}

function latestMonth() {
  const dirs = webdavList('')
    .filter((e) => e.isDir && /^\d{4}-\d{2}$/.test(e.name))
    .map((e) => e.name)
    .sort();
  if (!dirs.length) throw new Error('nenhuma pasta AAAA-MM encontrada no share da RFB');
  return dirs[dirs.length - 1];
}

/** Zips do mês pertencentes aos grupos que a carga usa. */
function remoteFiles(month) {
  const wanted = new RegExp(`^(${RFB_GROUPS.join('|')})\\d*\\.zip$`);
  return webdavList(month).filter((e) => !e.isDir && wanted.test(e.name));
}

function downloadFile(month, file, destDir) {
  const dest = path.join(destDir, file.name);
  if (fs.existsSync(dest)) {
    const localSize = fs.statSync(dest).size;
    if (localSize === file.size) return false; // já baixado e íntegro
    // maior que o remoto = resto de upload antigo re-publicado → resume corromperia
    if (localSize > file.size) fs.unlinkSync(dest);
  }
  log(`baixando ${file.name} (${(file.size / 1024 / 1024).toFixed(0)} MB)...`);
  const result = spawnSync('curl', [
    '-sf', '-u', `${RFB_SHARE_TOKEN}:`, '-C', '-', '--retry', '5', '--retry-delay', '10',
    '-o', dest, `${RFB_WEBDAV_BASE}/${month}/${file.name}`,
  ], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`download de ${file.name} falhou`);
  const got = fs.statSync(dest).size;
  if (got !== file.size) throw new Error(`${file.name}: tamanho ${got} != esperado ${file.size}`);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage: unzip -p (stream) → docker exec psql COPY FROM STDIN
// ─────────────────────────────────────────────────────────────────────────────

function findUnzipCommand() {
  for (const candidate of [
    { cmd: 'unzip', args: ['-p'], probe: ['-v'] },
    { cmd: 'C:\\Program Files\\Git\\usr\\bin\\unzip.exe', args: ['-p'], probe: ['-v'] },
    { cmd: 'C:\\Windows\\System32\\tar.exe', args: ['-xOf'], probe: ['--version'] },
    { cmd: 'tar', args: ['-xOf'], probe: ['--version'] },
  ]) {
    try {
      const probe = spawnSync(candidate.cmd, candidate.probe, { encoding: 'utf8' });
      if (probe.status === 0) return candidate;
    } catch { /* tenta o próximo */ }
  }
  throw new Error('nem unzip nem tar (bsdtar) encontrados — instale um dos dois');
}

/**
 * Sanitizador de CSV da RFB (stream, LATIN1 byte-a-byte): o dump traz aspas SOLTAS dentro de
 * campo (ex.: nome fantasia `PEG"PAG`) que estouram o parser CSV do COPY ("unterminated CSV
 * quoted field" — comprovado no Estabelecimentos1 de 2026-06). Como o formato é estritamente
 * `"c1";"c2";...;"cN"` sem quebra de linha dentro de campo, dá pra re-escapar com segurança:
 * tira aspas das pontas, separa por `";"`, dobra aspas internas e re-emite. Linha cujo nº de
 * colunas não bate (campo contendo `";"` literal — raríssimo) é DROPADA e contada no relatório
 * em vez de abortar a carga inteira.
 *
 * Bytes NUL (0x00) dentro de campo (comprovado: COMPLEMENTO da linha 96301 do
 * Estabelecimentos1 de 2026-06) TRUNCAM a string no parser do COPY → o fecha-aspas some e o
 * campo "não termina" até estourar 1GB. Postgres TEXT não aceita NUL de jeito nenhum → strip.
 */
function rfbCsvSanitizer(expectedCols, stats) {
  const sanitizeLine = (rawLine) => {
    let line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line.indexOf('\u0000') !== -1) {
      stats.nulStripped += 1;
      line = line.replace(/\u0000/g, '');
    }
    if (!line) return null;
    let core = line;
    if (core.startsWith('"')) core = core.slice(1);
    if (core.endsWith('"')) core = core.slice(0, -1);
    const cells = core.split('";"');
    if (cells.length !== expectedCols) {
      stats.dropped += 1;
      if (stats.samples.length < 3) stats.samples.push(line.slice(0, 160));
      return null;
    }
    stats.rows += 1;
    return cells.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(';');
  };
  let carry = '';
  return new Transform({
    transform(chunk, _enc, cb) {
      const text = carry + chunk.toString('latin1');
      const lines = text.split('\n');
      carry = lines.pop();
      const out = [];
      for (const line of lines) {
        const fixed = sanitizeLine(line);
        if (fixed !== null) out.push(fixed);
      }
      cb(null, Buffer.from(out.length ? `${out.join('\n')}\n` : '', 'latin1'));
    },
    flush(cb) {
      const fixed = carry ? sanitizeLine(carry) : null;
      carry = '';
      cb(null, fixed !== null ? Buffer.from(`${fixed}\n`, 'latin1') : Buffer.alloc(0));
    },
  });
}

/** COPY streaming de um zip pro staging (unzip → sanitizador → psql). Atômico: COPY é 1 statement. */
function stageZip(zipPath, group) {
  const table = STAGING_TABLE[group];
  const columns = COPY_COLUMNS[group];
  const expectedCols = columns.split(',').length;
  const unzipCmd = findUnzipCommand();
  const { container, user, db } = dbConfig();
  const copySql = `COPY ${table} (${columns}) FROM STDIN WITH (FORMAT csv, DELIMITER ';', QUOTE '"', ENCODING 'LATIN1');`;

  return new Promise((resolve, reject) => {
    const stats = { rows: 0, dropped: 0, nulStripped: 0, samples: [] };
    const unzip = spawn(unzipCmd.cmd, [...unzipCmd.args, zipPath]);
    const psqlProc = spawn('docker', [
      'exec', '-i', container, 'psql', '-U', user, '-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-c', copySql,
    ]);
    let stderrAll = '';
    unzip.stderr.on('data', (d) => { stderrAll += d; });
    psqlProc.stderr.on('data', (d) => { stderrAll += d; });
    const sanitizer = rfbCsvSanitizer(expectedCols, stats);
    // psql pode fechar o stdin no meio (erro de COPY) → EPIPE no pipe não pode derrubar o processo
    psqlProc.stdin.on('error', () => {});
    sanitizer.on('error', reject);
    unzip.stdout.pipe(sanitizer).pipe(psqlProc.stdin);
    unzip.on('error', reject);
    psqlProc.on('error', reject);
    let unzipCode = null;
    unzip.on('close', (code) => { unzipCode = code; });
    psqlProc.on('close', (code) => {
      if (code === 0 && (unzipCode === 0 || unzipCode === null)) {
        if (stats.dropped > 0) {
          log(`AVISO ${path.basename(zipPath)}: ${stats.dropped} linha(s) dropada(s) por nº de colunas != ${expectedCols}. Amostra: ${stats.samples.join(' | ')}`);
        }
        if (stats.nulStripped > 0) {
          log(`AVISO ${path.basename(zipPath)}: bytes NUL removidos de ${stats.nulStripped} linha(s)`);
        }
        resolve(stats);
      } else {
        reject(new Error(`stage ${path.basename(zipPath)} falhou (psql=${code}, unzip=${unzipCode}): ${stderrAll.trim().slice(0, 2000)}`));
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Transform: SQL set-based (cada fase = 1 transação, re-executável)
// ─────────────────────────────────────────────────────────────────────────────

// Tuning calibrado 02/07 p/ mount degradada do Docker Desktop WSL: work_mem alto mantém o
// DISTINCT ON de ~28M linhas em RAM (32GB na máquina) e elimina o spill de ~4,5GB em arquivo
// temp — que era exatamente onde o transform travava (DataFileRead no virtiofs). parallel=0
// serializa a varredura (paralelo multiplicava a pressão de IO e o consumo de work_mem).
const TUNING = `SET work_mem = '8GB'; SET maintenance_work_mem = '4GB'; SET max_parallel_workers_per_gather = 0;`;

// Ranking do "dono": Sócio-Administrador > Administrador > Titular PF > Diretor > Presidente >
// Titular Emp. Individual > Sócio-Gerente > Sócio... ; PF (identificador 2) ganha de PJ no empate.
const SQL_OWNER_STAGING = `${TUNING}
DROP TABLE IF EXISTS stg_rfb_owner;
CREATE UNLOGGED TABLE stg_rfb_owner AS
SELECT DISTINCT ON (cnpj_basico) cnpj_basico, nome, qualificacao_descricao
FROM (
  SELECT s.cnpj_basico, btrim(s.nome_socio) AS nome,
         coalesce(q.descricao, btrim(s.qualificacao)) AS qualificacao_descricao,
         (CASE btrim(s.qualificacao)
            WHEN '49' THEN 0 WHEN '05' THEN 1 WHEN '65' THEN 2 WHEN '10' THEN 3
            WHEN '16' THEN 4 WHEN '34' THEN 5 WHEN '28' THEN 6 WHEN '22' THEN 7
            WHEN '23' THEN 8 WHEN '47' THEN 9 WHEN '74' THEN 10 ELSE 20 END) * 2
         + (CASE WHEN btrim(s.identificador) = '2' THEN 0 ELSE 1 END) AS pref
  FROM stg_rfb_socios s
  LEFT JOIN stg_rfb_qualificacoes q ON q.codigo = btrim(s.qualificacao)
  WHERE coalesce(btrim(s.nome_socio), '') <> ''
) t
ORDER BY cnpj_basico, pref, nome;
CREATE INDEX ON stg_rfb_owner (cnpj_basico);
ANALYZE stg_rfb_owner;`;

const SQL_DROP_INDEXES = `
DROP INDEX IF EXISTS "CnpjPublicCompany_normalizedCity_state_idx";
DROP INDEX IF EXISTS "CnpjPublicCompany_normalizedCity_cnae_idx";
DROP INDEX IF EXISTS "CnpjPublicCompany_state_cnae_idx";
DROP INDEX IF EXISTS "CnpjPublicCompany_phoneDigits_idx";
DROP INDEX IF EXISTS "CnpjPublicCompany_searchText_trgm_idx";`;

// Telefone: ddd1+telefone1 só dígitos; celular legado 10-dig (3º dígito 6-9) ganha o 9 da Anatel
// (mesma regra de normalizeLegacyBrCellphone do backend). `pd.d`/`pd2.d` vêm do LATERAL no FROM.
const PHONE_EXPR = `
  CASE WHEN length(pd.d) = 10 AND substr(pd.d, 3, 1) BETWEEN '6' AND '9'
       THEN substr(pd.d, 1, 2) || '9' || substr(pd.d, 3)
       ELSE pd.d END`;
const PHONE2_EXPR = `
  CASE WHEN length(pd2.d) = 10 AND substr(pd2.d, 3, 1) BETWEEN '6' AND '9'
       THEN substr(pd2.d, 1, 2) || '9' || substr(pd2.d, 3)
       ELSE pd2.d END`;

// capital_social do dump vem "1000,00" (vírgula decimal, PT-BR) — troca por ponto antes do cast.
// Lixo ('', não-numérico) vira NULL em vez de estourar a carga inteira.
const CAPITAL_SOCIAL_EXPR = `
  CASE WHEN NULLIF(btrim(emp.capital_social), '') ~ '^-?[0-9]+([.,][0-9]+)?$'
       THEN replace(btrim(emp.capital_social), ',', '.')::numeric(18,2)
       ELSE NULL END`;

const SQL_UPSERT_COMPANIES = `${TUNING}
INSERT INTO "CnpjPublicCompany" (
  "id", "cnpj", "razaoSocial", "nomeFantasia", "situacao", "cnae", "cnaeDescription", "porte",
  "matrizFilial", "openedAt", "phone", "phoneDigits", "email", "address", "city", "state",
  "normalizedCity", "searchText", "ownerName", "ownerQualification",
  "capitalSocial", "naturezaJuridica", "simples", "mei", "phone2", "cnaeSecundarias",
  "firstSeenAt", "importedAt", "createdAt", "updatedAt"
)
SELECT DISTINCT ON (full_cnpj) * FROM (
  SELECT
    'rfb_' || e.cnpj_basico || e.cnpj_ordem || e.cnpj_dv AS row_id,
    e.cnpj_basico || e.cnpj_ordem || e.cnpj_dv AS full_cnpj,
    emp.razao_social,
    NULLIF(btrim(e.nome_fantasia), ''),
    'ativa',
    NULLIF(btrim(e.cnae_principal), ''),
    cn.descricao,
    CASE emp.porte WHEN '01' THEN 'MICRO EMPRESA' WHEN '03' THEN 'EMPRESA DE PEQUENO PORTE'
                   WHEN '05' THEN 'DEMAIS' ELSE NULL END,
    CASE e.matriz_filial WHEN '1' THEN 'MATRIZ' WHEN '2' THEN 'FILIAL' ELSE NULL END,
    try_rfb_date(e.data_inicio),
    NULLIF(${PHONE_EXPR}, ''),
    NULLIF(${PHONE_EXPR}, ''),
    NULLIF(lower(btrim(e.email)), ''),
    NULLIF(btrim(concat_ws(', ',
      NULLIF(btrim(concat_ws(' ', NULLIF(btrim(e.tipo_logradouro), ''), NULLIF(btrim(e.logradouro), ''))), ''),
      NULLIF(btrim(e.numero), ''),
      NULLIF(btrim(e.bairro), ''))), ''),
    mun.descricao,
    NULLIF(btrim(e.uf), ''),
    rfb_norm(mun.descricao),
    rfb_norm(concat_ws(' ', NULLIF(btrim(e.nome_fantasia), ''), emp.razao_social,
                       NULLIF(btrim(e.cnae_principal), ''), cn.descricao)),
    own.nome,
    own.qualificacao_descricao,
    ${CAPITAL_SOCIAL_EXPR},
    NULLIF(btrim(emp.natureza_juridica), ''),
    CASE WHEN btrim(sim.opcao_simples) = 'S' THEN true
         WHEN btrim(sim.opcao_simples) = 'N' THEN false ELSE NULL END,
    CASE WHEN btrim(sim.opcao_mei) = 'S' THEN true
         WHEN btrim(sim.opcao_mei) = 'N' THEN false ELSE NULL END,
    NULLIF(${PHONE2_EXPR}, ''),
    NULLIF(btrim(e.cnae_secundario), ''),
    now(), now(), now(), now()
  FROM stg_rfb_estabelecimentos e
  CROSS JOIN LATERAL (
    SELECT regexp_replace(coalesce(e.ddd1, '') || coalesce(e.telefone1, ''), '\\D', '', 'g') AS d
  ) pd
  CROSS JOIN LATERAL (
    SELECT regexp_replace(coalesce(e.ddd2, '') || coalesce(e.telefone2, ''), '\\D', '', 'g') AS d
  ) pd2
  JOIN stg_rfb_empresas emp ON emp.cnpj_basico = e.cnpj_basico
  LEFT JOIN stg_rfb_municipios mun ON mun.codigo = e.municipio
  LEFT JOIN stg_rfb_cnaes cn ON cn.codigo = e.cnae_principal
  LEFT JOIN stg_rfb_owner own ON own.cnpj_basico = e.cnpj_basico
  LEFT JOIN stg_rfb_simples sim ON sim.cnpj_basico = e.cnpj_basico
  WHERE e.situacao = '02' AND coalesce(btrim(emp.razao_social), '') <> ''
) src
ON CONFLICT ("cnpj") DO UPDATE SET
  "razaoSocial" = EXCLUDED."razaoSocial",
  "nomeFantasia" = COALESCE(EXCLUDED."nomeFantasia", "CnpjPublicCompany"."nomeFantasia"),
  "situacao" = EXCLUDED."situacao",
  "cnae" = COALESCE(EXCLUDED."cnae", "CnpjPublicCompany"."cnae"),
  "cnaeDescription" = COALESCE(EXCLUDED."cnaeDescription", "CnpjPublicCompany"."cnaeDescription"),
  "porte" = COALESCE(EXCLUDED."porte", "CnpjPublicCompany"."porte"),
  "matrizFilial" = COALESCE(EXCLUDED."matrizFilial", "CnpjPublicCompany"."matrizFilial"),
  "openedAt" = COALESCE(EXCLUDED."openedAt", "CnpjPublicCompany"."openedAt"),
  "phone" = COALESCE(EXCLUDED."phone", "CnpjPublicCompany"."phone"),
  "phoneDigits" = COALESCE(EXCLUDED."phoneDigits", "CnpjPublicCompany"."phoneDigits"),
  "email" = COALESCE(EXCLUDED."email", "CnpjPublicCompany"."email"),
  "address" = COALESCE(EXCLUDED."address", "CnpjPublicCompany"."address"),
  "city" = COALESCE(EXCLUDED."city", "CnpjPublicCompany"."city"),
  "state" = COALESCE(EXCLUDED."state", "CnpjPublicCompany"."state"),
  "normalizedCity" = CASE WHEN EXCLUDED."normalizedCity" <> '' THEN EXCLUDED."normalizedCity"
                          ELSE "CnpjPublicCompany"."normalizedCity" END,
  "searchText" = CASE WHEN EXCLUDED."searchText" <> '' THEN EXCLUDED."searchText"
                      ELSE "CnpjPublicCompany"."searchText" END,
  "ownerName" = COALESCE(EXCLUDED."ownerName", "CnpjPublicCompany"."ownerName"),
  "ownerQualification" = COALESCE(EXCLUDED."ownerQualification", "CnpjPublicCompany"."ownerQualification"),
  "capitalSocial" = COALESCE(EXCLUDED."capitalSocial", "CnpjPublicCompany"."capitalSocial"),
  "naturezaJuridica" = COALESCE(EXCLUDED."naturezaJuridica", "CnpjPublicCompany"."naturezaJuridica"),
  "simples" = COALESCE(EXCLUDED."simples", "CnpjPublicCompany"."simples"),
  "mei" = COALESCE(EXCLUDED."mei", "CnpjPublicCompany"."mei"),
  "phone2" = COALESCE(EXCLUDED."phone2", "CnpjPublicCompany"."phone2"),
  "cnaeSecundarias" = COALESCE(EXCLUDED."cnaeSecundarias", "CnpjPublicCompany"."cnaeSecundarias"),
  "importedAt" = now(),
  "updatedAt" = now();
-- website e rawJson preservados de propósito: acumulados pelo L4/BrasilAPI, o dump não os tem.
-- regimeTributario fica de fora (dataset separado da RFB, não vem neste dump) — fase 2.
-- firstSeenAt só entra no INSERT (default now()); update de conflito nunca o toca de propósito
-- (é a data em que o HBX viu o CNPJ pela 1ª vez, não a data do dump).`;

// Linha antiga que o dump do mês diz não estar mais ativa → recebe a situação real.
// Cobre tanto linhas rfb_ de meses anteriores quanto cache BrasilAPI que fechou.
const SQL_SITUACAO_SYNC = `${TUNING}
UPDATE "CnpjPublicCompany" c SET
  "situacao" = CASE e.situacao WHEN '01' THEN 'nula' WHEN '03' THEN 'suspensa'
                               WHEN '04' THEN 'inapta' WHEN '08' THEN 'baixada'
                               ELSE 'inativa' END,
  "updatedAt" = now()
FROM stg_rfb_estabelecimentos e
WHERE c.cnpj = e.cnpj_basico || e.cnpj_ordem || e.cnpj_dv
  AND e.situacao <> '02'
  AND c."situacao" IN ('ativa', 'ativo', 'active', '02', '2', '');`;

const SQL_RELOAD_PARTNERS = `${TUNING}
TRUNCATE "CnpjPublicPartner" RESTART IDENTITY;
INSERT INTO "CnpjPublicPartner" (
  "cnpjBasico", "identificador", "nome", "documento", "qualificationCode",
  "qualificationDescription", "entradaAt", "faixaEtaria", "importedAt"
)
SELECT DISTINCT
  s.cnpj_basico,
  NULLIF(btrim(s.identificador), ''),
  btrim(s.nome_socio),
  NULLIF(btrim(s.documento_socio), ''),
  NULLIF(btrim(s.qualificacao), ''),
  q.descricao,
  try_rfb_date(s.data_entrada),
  NULLIF(btrim(s.faixa_etaria), ''),
  now()
FROM stg_rfb_socios s
LEFT JOIN stg_rfb_qualificacoes q ON q.codigo = btrim(s.qualificacao)
WHERE coalesce(btrim(s.nome_socio), '') <> ''
  AND EXISTS (SELECT 1 FROM stg_rfb_estabelecimentos e
              WHERE e.cnpj_basico = s.cnpj_basico AND e.situacao = '02');`;

// Catálogo CNAE (código→descrição) do dump Cnaes.zip — usado pelo HOT-02 (picker por texto).
// upsert simples: o catálogo da RFB não muda de sentido mês a mês, só ganha/perde código.
const SQL_UPSERT_CNAE_CATALOG = `${TUNING}
INSERT INTO "CnpjPublicCnae" ("codigo", "descricao", "updatedAt")
SELECT DISTINCT ON (btrim(codigo)) btrim(codigo), btrim(descricao), now()
FROM stg_rfb_cnaes
WHERE coalesce(btrim(codigo), '') <> ''
ORDER BY btrim(codigo)
ON CONFLICT ("codigo") DO UPDATE SET
  "descricao" = EXCLUDED."descricao",
  "updatedAt" = now();`;

// Anti-contador (base do HOT-03): quantos CNPJs ATIVOS compartilham o mesmo phone/email —
// sinal de "central telefônica"/franquia/contador terceirizado, não dono real do negócio.
// Roda DEPOIS do upsert de companies (precisa dos valores finais na tabela real, não na
// staging) e cobre a base inteira via GROUP BY, não só o lote do mês corrente.
const SQL_ANTI_COUNTER = `${TUNING}
WITH phone_counts AS (
  SELECT "phoneDigits" AS key, count(*) AS n
  FROM "CnpjPublicCompany"
  WHERE "situacao" = 'ativa' AND "phoneDigits" IS NOT NULL AND "phoneDigits" <> ''
  GROUP BY "phoneDigits"
)
UPDATE "CnpjPublicCompany" c SET "phoneShareCount" = pc.n
FROM phone_counts pc
WHERE c."phoneDigits" = pc.key AND c."situacao" = 'ativa'
  AND c."phoneShareCount" IS DISTINCT FROM pc.n;

WITH email_counts AS (
  SELECT lower("email") AS key, count(*) AS n
  FROM "CnpjPublicCompany"
  WHERE "situacao" = 'ativa' AND "email" IS NOT NULL AND "email" <> ''
  GROUP BY lower("email")
)
UPDATE "CnpjPublicCompany" c SET "emailShareCount" = ec.n
FROM email_counts ec
WHERE lower(c."email") = ec.key AND c."situacao" = 'ativa'
  AND c."emailShareCount" IS DISTINCT FROM ec.n;`;

// HOT-02: contagem por opção de filtro (estilo "Empresário (Individual) (44.889.600)"), cacheada
// na tabela CnpjBaseStats — o endpoint /modules/owner/cnpj-base/stats só LÊ esta tabela, nunca
// faz GROUP BY ao vivo em 28M linhas. Roda 1x pós-import, junto do anti-contador.
const SQL_BASE_STATS = `${TUNING}
INSERT INTO "CnpjBaseStats" ("id", "group", "key", "label", "count", "updatedAt")
SELECT 'stat_' || md5('naturezaJuridica|' || COALESCE("naturezaJuridica", '')), 'naturezaJuridica',
       COALESCE("naturezaJuridica", '(vazio)'), COALESCE("naturezaJuridica", '(vazio)'), count(*), now()
FROM "CnpjPublicCompany" WHERE "situacao" = 'ativa' GROUP BY "naturezaJuridica"
ON CONFLICT ("group", "key") DO UPDATE SET "count" = EXCLUDED."count", "updatedAt" = now();

INSERT INTO "CnpjBaseStats" ("id", "group", "key", "label", "count", "updatedAt")
SELECT 'stat_' || md5('porte|' || COALESCE("porte", '')), 'porte',
       COALESCE("porte", '(vazio)'), COALESCE("porte", '(vazio)'), count(*), now()
FROM "CnpjPublicCompany" WHERE "situacao" = 'ativa' GROUP BY "porte"
ON CONFLICT ("group", "key") DO UPDATE SET "count" = EXCLUDED."count", "updatedAt" = now();

INSERT INTO "CnpjBaseStats" ("id", "group", "key", "label", "count", "updatedAt")
SELECT 'stat_' || md5('situacao|' || "situacao"), 'situacao', "situacao", "situacao", count(*), now()
FROM "CnpjPublicCompany" GROUP BY "situacao"
ON CONFLICT ("group", "key") DO UPDATE SET "count" = EXCLUDED."count", "updatedAt" = now();

INSERT INTO "CnpjBaseStats" ("id", "group", "key", "label", "count", "updatedAt")
SELECT 'stat_' || md5('matrizFilial|' || COALESCE("matrizFilial", '')), 'matrizFilial',
       COALESCE("matrizFilial", '(vazio)'), COALESCE("matrizFilial", '(vazio)'), count(*), now()
FROM "CnpjPublicCompany" WHERE "situacao" = 'ativa' GROUP BY "matrizFilial"
ON CONFLICT ("group", "key") DO UPDATE SET "count" = EXCLUDED."count", "updatedAt" = now();

INSERT INTO "CnpjBaseStats" ("id", "group", "key", "label", "count", "updatedAt")
SELECT 'stat_' || md5('state|' || COALESCE("state", '')), 'state',
       COALESCE("state", '(vazio)'), COALESCE("state", '(vazio)'), count(*), now()
FROM "CnpjPublicCompany" WHERE "situacao" = 'ativa' GROUP BY "state"
ON CONFLICT ("group", "key") DO UPDATE SET "count" = EXCLUDED."count", "updatedAt" = now();

INSERT INTO "CnpjBaseStats" ("id", "group", "key", "label", "count", "updatedAt")
SELECT 'stat_' || md5('mei|' || COALESCE("mei"::text, '')), 'mei',
       COALESCE("mei"::text, '(vazio)'), CASE WHEN "mei" THEN 'MEI' WHEN "mei" IS FALSE THEN 'Nao MEI' ELSE '(vazio)' END, count(*), now()
FROM "CnpjPublicCompany" WHERE "situacao" = 'ativa' GROUP BY "mei"
ON CONFLICT ("group", "key") DO UPDATE SET "count" = EXCLUDED."count", "updatedAt" = now();

INSERT INTO "CnpjBaseStats" ("id", "group", "key", "label", "count", "updatedAt")
SELECT 'stat_' || md5('simples|' || COALESCE("simples"::text, '')), 'simples',
       COALESCE("simples"::text, '(vazio)'), CASE WHEN "simples" THEN 'Simples Nacional' WHEN "simples" IS FALSE THEN 'Nao optante' ELSE '(vazio)' END, count(*), now()
FROM "CnpjPublicCompany" WHERE "situacao" = 'ativa' GROUP BY "simples"
ON CONFLICT ("group", "key") DO UPDATE SET "count" = EXCLUDED."count", "updatedAt" = now();`;

const SQL_CREATE_INDEXES = `${TUNING}
CREATE INDEX IF NOT EXISTS "CnpjPublicCompany_normalizedCity_state_idx"
  ON "CnpjPublicCompany"("normalizedCity", "state");
CREATE INDEX IF NOT EXISTS "CnpjPublicCompany_normalizedCity_cnae_idx"
  ON "CnpjPublicCompany"("normalizedCity", "cnae");
CREATE INDEX IF NOT EXISTS "CnpjPublicCompany_state_cnae_idx"
  ON "CnpjPublicCompany"("state", "cnae");
CREATE INDEX IF NOT EXISTS "CnpjPublicCompany_phoneDigits_idx"
  ON "CnpjPublicCompany"("phoneDigits");
-- Índice operacional (fora do Prisma): match de segmento por token (searchText LIKE '%tok%')
-- em cidade grande precisa de trigram pra ficar <500ms.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "CnpjPublicCompany_searchText_trgm_idx"
  ON "CnpjPublicCompany" USING gin ("searchText" gin_trgm_ops);
-- HOT-02: picker de CNAE por texto livre (ex. "salao de beleza" → lista de códigos).
CREATE INDEX IF NOT EXISTS "CnpjPublicCnae_descricao_trgm_idx"
  ON "CnpjPublicCnae" USING gin ("descricao" gin_trgm_ops);`;

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline RFB
// ─────────────────────────────────────────────────────────────────────────────

function fileGroup(fileName) {
  const match = fileName.match(/^([A-Za-z]+?)\d*\.zip$/);
  return match ? match[1] : null;
}

async function runRfb() {
  const startedAt = Date.now();
  const baseDir = String(arg('dir', path.join(os.homedir(), 'hbx-data', 'rfb')));
  const downloadOnly = hasFlag('download-only');
  const noDownload = hasFlag('no-download');
  const force = hasFlag('force');
  const keepStaging = hasFlag('keep-staging');
  const verifyOnly = hasFlag('verify');

  // 0. mês de referência
  let month = arg('month');
  if (!month || month === true) {
    month = latestMonth();
    log(`mês mais recente no share da RFB: ${month}`);
  }
  const monthDir = path.join(baseDir, month);
  fs.mkdirSync(monthDir, { recursive: true });

  psql(STAGING_DDL);
  if (verifyOnly) return verifyAcceptance(month);
  if (force) {
    log('--force: limpando ledger e staging do mês');
    ledgerClear(month);
    psql('TRUNCATE stg_rfb_empresas, stg_rfb_estabelecimentos, stg_rfb_socios, stg_rfb_simples, stg_rfb_cnaes, stg_rfb_municipios, stg_rfb_qualificacoes;');
  }

  // 1. inventário remoto + download (retomável: curl -C - e checagem de tamanho)
  let files;
  if (noDownload) {
    files = fs.readdirSync(monthDir)
      .filter((f) => /\.zip$/i.test(f) && fileGroup(f) && RFB_GROUPS.includes(fileGroup(f)))
      .map((f) => ({ name: f, size: fs.statSync(path.join(monthDir, f)).size }));
    if (!files.length) throw new Error(`--no-download mas não há zips em ${monthDir}`);
  } else {
    files = remoteFiles(month);
    if (!files.length) throw new Error(`nenhum zip esperado encontrado em ${month}/ no share da RFB`);
    const totalMb = files.reduce((acc, f) => acc + f.size, 0) / 1024 / 1024;
    log(`${files.length} arquivos no mês ${month} (${(totalMb / 1024).toFixed(1)} GB) → ${monthDir}`);
    for (const file of files) {
      const fresh = downloadFile(month, file, monthDir);
      ledgerMark(month, `download:${file.name}`, file.size);
      if (fresh) log(`ok ${file.name}`);
    }
    log('download completo');
  }
  if (downloadOnly) return;

  // 2. staging (por arquivo; ledger pula o que já entrou — COPY é atômico por arquivo)
  const staged = [];
  for (const file of files.sort((a, b) => a.name.localeCompare(b.name))) {
    const group = fileGroup(file.name);
    if (!group) continue;
    const step = `stage:${file.name}`;
    if (ledgerDone(month, step)) { staged.push(file.name); continue; }
    const zipPath = path.join(monthDir, file.name);
    if (!fs.existsSync(zipPath)) throw new Error(`zip ausente: ${zipPath}`);
    log(`staging ${file.name} → ${STAGING_TABLE[group]}...`);
    const t0 = Date.now();
    await stageZip(zipPath, group);
    ledgerMark(month, step);
    staged.push(file.name);
    log(`ok ${file.name} em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }

  for (const [group, table] of Object.entries(STAGING_TABLE)) {
    const count = psqlValue(`SELECT count(*) FROM ${table};`);
    log(`staging ${group}: ${Number(count).toLocaleString('pt-BR')} linhas`);
  }

  // 3. transform (cada fase é atômica e re-executável; ledger só pula trabalho já feito)
  const phases = [
    ['transform:owner_staging', SQL_OWNER_STAGING],
    ['transform:drop_indexes', SQL_DROP_INDEXES],
    ['transform:companies', SQL_UPSERT_COMPANIES],
    ['transform:situacao_sync', SQL_SITUACAO_SYNC],
    ['transform:partners', SQL_RELOAD_PARTNERS],
    ['transform:cnae_catalog', SQL_UPSERT_CNAE_CATALOG],
    ['transform:create_indexes', SQL_CREATE_INDEXES],
    // Depois dos índices: phoneDigits/email já indexados, o GROUP BY do anti-contador
    // (base do HOT-03) fica mais barato correndo por cima da tabela final já pronta.
    ['transform:anti_counter', SQL_ANTI_COUNTER],
    // HOT-02: contagem por opção de filtro cacheada (CnpjBaseStats) — mesma lógica, roda
    // depois dos índices pelo mesmo motivo (GROUP BY em cima da tabela final indexada).
    ['transform:base_stats', SQL_BASE_STATS],
  ];
  for (const [step, sql] of phases) {
    if (ledgerDone(month, step)) { log(`pulo ${step} (já feito)`); continue; }
    log(`${step}...`);
    const t0 = Date.now();
    psql(sql, { singleTransaction: true });
    ledgerMark(month, step);
    log(`ok ${step} em ${((Date.now() - t0) / 60000).toFixed(1)}min`);
  }

  // 4. VACUUM ANALYZE (fora de transação — statement único)
  if (!ledgerDone(month, 'vacuum')) {
    log('VACUUM ANALYZE...');
    psql('VACUUM ANALYZE "CnpjPublicCompany";');
    psql('VACUUM ANALYZE "CnpjPublicPartner";');
    psql('VACUUM ANALYZE "CnpjPublicCnae";');
    ledgerMark(month, 'vacuum');
  }

  // 5. staging fora (libera ~25GB) — a menos que --keep-staging
  if (!keepStaging) {
    log('derrubando staging (use --keep-staging pra manter)');
    psql('TRUNCATE stg_rfb_empresas, stg_rfb_estabelecimentos, stg_rfb_socios;');
  }

  verifyAcceptance(month);
  log(`FIM em ${((Date.now() - startedAt) / 60000).toFixed(1)} min`);
}

/** Aceite do sprint: contagens + SELECT cidade+segmento com timing. */
function verifyAcceptance(month) {
  const companies = psqlValue('SELECT count(*) FROM "CnpjPublicCompany";');
  const withOwner = psqlValue('SELECT count(*) FROM "CnpjPublicCompany" WHERE "ownerName" IS NOT NULL;');
  const withCapital = psqlValue('SELECT count(*) FROM "CnpjPublicCompany" WHERE "capitalSocial" IS NOT NULL;');
  const withSimples = psqlValue('SELECT count(*) FROM "CnpjPublicCompany" WHERE "simples" IS NOT NULL;');
  const withShareCount = psqlValue('SELECT count(*) FROM "CnpjPublicCompany" WHERE "phoneShareCount" IS NOT NULL;');
  const partners = psqlValue('SELECT count(*) FROM "CnpjPublicPartner";');
  const cnaes = psqlValue('SELECT count(*) FROM "CnpjPublicCnae";');
  const size = psqlValue(`SELECT pg_size_pretty(pg_total_relation_size('"CnpjPublicCompany"') + pg_total_relation_size('"CnpjPublicPartner"'));`);
  log(`mês ${month} → CnpjPublicCompany=${Number(companies).toLocaleString('pt-BR')} (com dono: ${Number(withOwner).toLocaleString('pt-BR')}, capital: ${Number(withCapital).toLocaleString('pt-BR')}, simples/mei: ${Number(withSimples).toLocaleString('pt-BR')}, phoneShareCount: ${Number(withShareCount).toLocaleString('pt-BR')}) | CnpjPublicPartner=${Number(partners).toLocaleString('pt-BR')} | CnpjPublicCnae=${Number(cnaes).toLocaleString('pt-BR')} | tamanho=${size}`);

  // Timing medido NO SERVIDOR (EXPLAIN ANALYZE) — sem o overhead do docker exec (~200ms).
  const timingSamples = [
    ["cidade+token ('fortaleza' pizzaria)", `SELECT 1 FROM "CnpjPublicCompany" WHERE "normalizedCity" = 'fortaleza' AND "searchText" LIKE '%pizzaria%' LIMIT 500`],
    ["cidade+CNAE ('sao paulo' 561*)", `SELECT 1 FROM "CnpjPublicCompany" WHERE "normalizedCity" = 'sao paulo' AND "cnae" LIKE '561%' LIMIT 500`],
    ["cidade+token ('sao paulo' barbearia)", `SELECT 1 FROM "CnpjPublicCompany" WHERE "normalizedCity" = 'sao paulo' AND "searchText" LIKE '%barbearia%' LIMIT 500`],
  ];
  for (const [label, sql] of timingSamples) {
    const plan = psql(`EXPLAIN (ANALYZE, TIMING OFF) ${sql};`);
    const ms = Number((plan.match(/Execution Time: ([\d.]+) ms/) || [])[1] || NaN);
    const rows = (plan.match(/rows=(\d+)/) || [])[1] || '?';
    log(`aceite ${label}: ~${rows} candidatos em ${ms.toFixed(0)}ms ${ms < 500 ? 'OK <500ms' : 'ATENCAO >=500ms'}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MODO LEGADO (arquivo avulso JSONL/CSV via Prisma — inalterado)
// ─────────────────────────────────────────────────────────────────────────────

const BATCH_SIZE = 1000;

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function pick(row, keys) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return null;
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',' || char === ';') {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function toRecord(row) {
  const cnpj = digits(pick(row, ['cnpj', 'cnpj_basico', 'CNPJ']));
  const razaoSocial = pick(row, ['razaoSocial', 'razao_social', 'razao', 'RAZAO_SOCIAL']);
  if (!cnpj || cnpj.length < 8 || !razaoSocial) return null;

  const nomeFantasia = pick(row, ['nomeFantasia', 'nome_fantasia', 'fantasia']);
  const situacao = normalizeText(pick(row, ['situacao', 'situacao_cadastral', 'descricao_situacao_cadastral']) || 'ativa');
  const cnae = pick(row, ['cnae', 'cnae_fiscal', 'cnae_fiscal_principal']);
  const cnaeDescription = pick(row, ['cnaeDescription', 'cnae_descricao', 'cnae_fiscal_descricao']);
  const porte = pick(row, ['porte', 'porte_empresa', 'descricao_porte']);
  const matrizFilial = pick(row, ['matrizFilial', 'identificador_matriz_filial', 'matriz_filial']);
  const openedAtRaw = pick(row, ['openedAt', 'data_inicio_atividade', 'data_abertura']);
  const ddd = digits(pick(row, ['ddd1', 'ddd_1']));
  const phoneBase = pick(row, ['phone', 'telefone', 'ddd_telefone_1', 'telefone1', 'telefone_1']);
  const phone = phoneBase ? `${ddd && !digits(phoneBase).startsWith(ddd) ? ddd : ''}${phoneBase}`.trim() : null;
  const email = (pick(row, ['email', 'correio_eletronico']) || '').toLowerCase() || null;
  const website = pick(row, ['website', 'site']);
  const address = pick(row, ['address', 'endereco'])
    || [pick(row, ['logradouro']), pick(row, ['numero']), pick(row, ['bairro'])].filter(Boolean).join(', ')
    || null;
  const city = pick(row, ['city', 'municipio', 'cidade']);
  const state = (pick(row, ['state', 'uf', 'estado']) || '').toUpperCase() || null;

  let openedAt = null;
  if (openedAtRaw) {
    const iso = /^\d{8}$/.test(openedAtRaw)
      ? `${openedAtRaw.slice(0, 4)}-${openedAtRaw.slice(4, 6)}-${openedAtRaw.slice(6, 8)}`
      : openedAtRaw;
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) openedAt = parsed;
  }

  return {
    cnpj,
    razaoSocial,
    nomeFantasia,
    situacao: situacao || 'ativa',
    cnae,
    cnaeDescription,
    porte,
    matrizFilial,
    openedAt,
    phone: phone || null,
    phoneDigits: digits(phone) || null,
    email,
    website,
    address: address || null,
    city,
    state,
    normalizedCity: normalizeText(city),
    searchText: normalizeText([nomeFantasia, razaoSocial, cnaeDescription].filter(Boolean).join(' ')),
    rawJson: JSON.stringify(row),
  };
}

async function flush(prisma, batch, stats) {
  if (!batch.length) return;
  const result = await prisma.cnpjPublicCompany.createMany({ data: batch, skipDuplicates: true });
  stats.inserted += result.count;
  stats.duplicated += batch.length - result.count;
  batch.length = 0;
}

async function runLegacy() {
  const { PrismaClient } = require('@prisma/client');
  const file = arg('file');
  const filePath = path.resolve(String(file));
  if (!fs.existsSync(filePath)) {
    console.error(`Arquivo nao encontrado: ${filePath}`);
    process.exit(1);
  }
  const onlyActive = Boolean(arg('only-active', false));
  const isCsv = /\.(csv|tsv)$/i.test(filePath);

  const prisma = new PrismaClient();
  const stats = { read: 0, skipped: 0, inserted: 0, duplicated: 0 };
  const batch = [];
  let headers = null;

  const stream = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of stream) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let row = null;
    if (isCsv) {
      const cells = parseCsvLine(trimmed);
      if (!headers) {
        headers = cells.map((cell) => cell.trim());
        continue;
      }
      row = {};
      headers.forEach((header, index) => {
        row[header] = cells[index] !== undefined ? cells[index] : null;
      });
    } else {
      try {
        row = JSON.parse(trimmed);
      } catch {
        stats.skipped += 1;
        continue;
      }
    }

    stats.read += 1;
    const record = toRecord(row);
    if (!record) {
      stats.skipped += 1;
      continue;
    }
    if (onlyActive && !['ativa', 'ativo', 'active', '02', '2'].includes(record.situacao)) {
      stats.skipped += 1;
      continue;
    }

    batch.push(record);
    if (batch.length >= BATCH_SIZE) {
      await flush(prisma, batch, stats);
      if (stats.read % 50000 === 0) {
        console.log(`[import-cnpj] lidos=${stats.read} inseridos=${stats.inserted} duplicados=${stats.duplicated} pulados=${stats.skipped}`);
      }
    }
  }

  await flush(prisma, batch, stats);
  await prisma.$disconnect();
  console.log(`[import-cnpj] FIM lidos=${stats.read} inseridos=${stats.inserted} duplicados=${stats.duplicated} pulados=${stats.skipped}`);
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  if (process.argv[2] === 'rfb') {
    return runRfb();
  }
  const file = arg('file');
  if (!file || file === true) {
    console.error('Uso:');
    console.error('  node scripts/import-cnpj-dataset.js rfb [--month AAAA-MM] [--dir <pasta>] [--download-only|--no-download] [--force] [--verify] [--keep-staging]');
    console.error('  node scripts/import-cnpj-dataset.js --file <jsonl|csv> [--only-active]');
    process.exit(1);
  }
  return runLegacy();
}

main().catch((error) => {
  console.error('[import-cnpj] falhou:', error);
  process.exit(1);
});
