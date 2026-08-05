#!/usr/bin/env node
'use strict';

// ============================================================================
// FISCAL + APLICADOR DO TUNING DO POSTGRES DE PRODUCAO
// ============================================================================
// Fonte da verdade dos valores: deploy/postgres/hbx-prod-tuning.conf
// Autovacuum por tabela:        deploy/postgres/hbx-prod-tabelas.sql
//
//   node scripts/ops/pg-tune-vps.js            → SO CONFERE (read-only).
//                                                Sai 1 se houver desvio.
//   node scripts/ops/pg-tune-vps.js --apply    → ALTER SYSTEM + reload + tabelas.
//                                                NAO reinicia nada.
//   node scripts/ops/pg-tune-vps.js --apply --restart
//                                              → idem + restart do container
//                                                (DOWNTIME) pros parametros que
//                                                exigem postmaster novo.
//
// Lei da casa "build verde != boot ok": depois de --restart o script PROVA que
// subiu (docker ps + pg_isready + releitura dos pg_settings) e explode se nao.
//
// Porque ALTER SYSTEM e nao um postgresql.conf montado: o container hbx-postgres
// nao e gerenciado por compose (Labels vazios, criado por docker run). Trocar
// pra bind-mount exigiria RECRIAR o container de producao — muito mais risco que
// um restart. ALTER SYSTEM grava em postgresql.auto.conf dentro do volume
// hbx_postgres_data, que sobrevive a restart, a docker rm e ao publish.
// ============================================================================

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const CONF_FILE = path.join(repoRoot, 'deploy', 'postgres', 'hbx-prod-tuning.conf');
const TABLES_FILE = path.join(repoRoot, 'deploy', 'postgres', 'hbx-prod-tabelas.sql');
const VPS_RUN = path.join(repoRoot, 'scripts', 'vps-run.js');

const CONTAINER = 'hbx-postgres';
const DB = 'hbx_prod';
const DB_USER = 'hbx_user';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const RESTART = args.includes('--restart');

// ---------------------------------------------------------------------------
// Ponte SSH: reusa scripts/vps-run.js (credenciais em .env.ops-control)
// ---------------------------------------------------------------------------
function vps(script, { timeoutMs = 180000, allowFailure = false } = {}) {
  const result = spawnSync(process.execPath, [VPS_RUN, '--stdin'], {
    input: script,
    encoding: 'utf8',
    env: { ...process.env, VPS_RUN_TIMEOUT_MS: String(timeoutMs) },
    maxBuffer: 32 * 1024 * 1024,
  });
  const stdout = String(result.stdout || '');
  const stderr = String(result.stderr || '');
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`vps-run falhou (exit ${result.status}).\n${stdout}\n${stderr}`);
  }
  return { status: result.status, stdout, stderr };
}

function psql(sql, { timeoutMs = 180000, allowFailure = false } = {}) {
  // -v ON_ERROR_STOP=1: erro de SQL vira exit != 0 em vez de sumir no output.
  const script = [
    `docker exec -i ${CONTAINER} psql -U ${DB_USER} -d ${DB} -X -q -At -F'|' -v ON_ERROR_STOP=1 -f - <<'__SQL__'`,
    sql,
    '__SQL__',
  ].join('\n');
  return vps(script, { timeoutMs, allowFailure });
}

// ---------------------------------------------------------------------------
// Parser do .conf: "nome = valor   # comentario"
// ---------------------------------------------------------------------------
function loadDesired() {
  const text = fs.readFileSync(CONF_FILE, 'utf8');
  const out = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const name = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (/^'.*'$/.test(value)) value = value.slice(1, -1);
    if (!name) continue;
    out.push({ name, value });
  }
  return out;
}

// Normaliza pra comparar "2GB" com o que o pg_settings devolve.
// current_setting() devolve na unidade do parametro ('2GB', '32MB', '1.1', 'on').
function normalize(value) {
  const v = String(value).trim().toLowerCase().replace(/'/g, '');
  const m = v.match(/^(\d+(?:\.\d+)?)\s*(kb|mb|gb|tb|b)?$/);
  if (!m) return v;
  const n = Number(m[1]);
  const mult = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4 };
  if (!m[2]) return String(n);
  return String(n * mult[m[2]]);
}

function sqlQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

// ---------------------------------------------------------------------------
// Leitura do estado atual
// ---------------------------------------------------------------------------
function readCurrent(names) {
  const list = names.map(sqlQuote).join(',');
  // pg_settings nao lista os pg_stat_statements.* enquanto a lib nao esta
  // carregada — por isso o LEFT JOIN contra a lista desejada.
  const sql = `
SELECT n.name,
       COALESCE(s.setting, '<AUSENTE>'),
       COALESCE(s.unit, ''),
       COALESCE(s.source, ''),
       COALESCE(s.pending_restart::text, 'false'),
       COALESCE(s.context, '')
FROM (SELECT unnest(ARRAY[${list}]::text[]) AS name) n
LEFT JOIN pg_settings s ON s.name = n.name
ORDER BY 1;`;
  const { stdout } = psql(sql);
  const map = new Map();
  for (const line of stdout.split(/\r?\n/)) {
    const parts = line.split('|');
    if (parts.length < 6) continue;
    const [name, setting, unit, source, pendingRestart, context] = parts;
    map.set(name.trim(), {
      setting: setting.trim(),
      unit: unit.trim(),
      source: source.trim(),
      pendingRestart: pendingRestart.trim() === 't' || pendingRestart.trim() === 'true',
      context: context.trim(),
    });
  }
  return map;
}

// pg_settings devolve setting+unit separados (ex.: 262144 + '8kB'). Junta pra bytes.
function currentAsComparable(entry) {
  if (!entry) return '<AUSENTE>';
  const { setting, unit } = entry;
  if (!unit) return normalize(setting);
  const m = unit.match(/^(\d*)(kB|MB|GB|TB|B|ms|s|min)$/);
  if (!m) return normalize(setting);
  const factorPrefix = m[1] ? Number(m[1]) : 1;
  const scale = { B: 1, kB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 }[m[2]];
  if (!scale) return normalize(setting); // ms/s/min: compara cru
  return String(Number(setting) * factorPrefix * scale);
}

// ---------------------------------------------------------------------------
// FISCAL DO /dev/shm
// ---------------------------------------------------------------------------
// Por que isto e fiscalizado aqui: com dynamic_shared_memory_type=posix, query
// PARALELA aloca memoria compartilhada dinamica em /dev/shm. O default do DOCKER
// e 64 MB, e um no de hash paralelo pede
//   work_mem(32MB) x hash_mem_multiplier(2) x participantes(3) = 192 MB.
// Estourar isso NAO deixa a query lenta: derruba com
//   "could not resize shared memory segment ... No space left on device".
// `shm_size: 1g` vive em docker-compose.postgres.yml, mas SO entra RECRIANDO o
// container. Em 05/08/2026 foi aplicado AO VIVO por remount (sem downtime) — e um
// `docker restart` REVERTE esse remount pra 64 MB em silencio. Este check e o que
// impede a regressao passar batida.
const SHM_MINIMO_BYTES = 1024 ** 3;

function checkDevShm() {
  const { stdout } = vps(
    `docker exec ${CONTAINER} sh -lc "df -B1 /dev/shm | awk 'NR==2{print \\$2}'"\n` +
      `docker inspect ${CONTAINER} --format '{{.HostConfig.ShmSize}}'`,
    { allowFailure: true },
  );
  const [vivo, declarado] = stdout.trim().split(/\r?\n/).map((v) => Number(String(v).trim()));
  const problemas = [];
  const mb = (n) => `${Math.round(Number(n) / 1024 / 1024)} MB`;

  if (!Number.isFinite(vivo)) {
    problemas.push('/dev/shm: nao foi possivel medir');
  } else if (vivo < SHM_MINIMO_BYTES) {
    problemas.push(
      `/dev/shm esta em ${mb(vivo)} (minimo ${mb(SHM_MINIMO_BYTES)}). Query paralela pode ` +
        'MORRER com "could not resize shared memory segment". Conserto ao vivo, sem downtime:\n' +
        `      PID=$(docker inspect -f '{{.State.Pid}}' ${CONTAINER})\n` +
        '      nsenter --target $PID --mount -- /bin/mount -t tmpfs ' +
        '-o remount,size=1g,nosuid,nodev,noexec shm /dev/shm\n' +
        '      Definitivo (RECRIA o container, exige downtime autorizado):\n' +
        '      docker compose --env-file .env -f docker-compose.postgres.yml up -d',
    );
  }

  console.log(
    `${vivo >= SHM_MINIMO_BYTES ? '  ' : '! '}/dev/shm  vivo=${Number.isFinite(vivo) ? mb(vivo) : '?'}  ` +
      `ShmSize_do_container=${Number.isFinite(declarado) ? mb(declarado) : '?'}  ` +
      `${vivo >= SHM_MINIMO_BYTES ? 'ok' : 'DESVIO'}`,
  );
  if (Number.isFinite(declarado) && declarado < SHM_MINIMO_BYTES && vivo >= SHM_MINIMO_BYTES) {
    console.log(
      '  AVISO: o valor VIVO esta bom, mas o ShmSize gravado no container segue ' +
        `${mb(declarado)} — um \`docker restart\` volta pros ${mb(declarado)}. ` +
        'Pra virar permanente: docker compose -f docker-compose.postgres.yml up -d (RECRIA).',
    );
  }
  return problemas;
}

// ---------------------------------------------------------------------------
// Autovacuum por tabela: le os ALTER TABLE do .sql e compara com reloptions
// ---------------------------------------------------------------------------
function loadDesiredTableOptions() {
  const text = fs.readFileSync(TABLES_FILE, 'utf8');
  const stripped = text.replace(/^\s*--.*$/gm, '');
  const out = new Map();
  const re = /ALTER\s+TABLE\s+"([^"]+)"\s+SET\s*\(([^)]*)\)/gi;
  let m;
  while ((m = re.exec(stripped)) !== null) {
    const table = m[1];
    const opts = new Map();
    for (const pair of m[2].split(',')) {
      const [k, v] = pair.split('=').map((s) => (s || '').trim());
      if (k && v) opts.set(k, v);
    }
    out.set(table, opts);
  }
  return out;
}

function readCurrentTableOptions(tables) {
  const list = tables.map(sqlQuote).join(',');
  const sql = `SELECT relname, COALESCE(array_to_string(reloptions, ','), '')
FROM pg_class WHERE relname IN (${list});`;
  const { stdout } = psql(sql);
  const map = new Map();
  for (const line of stdout.split(/\r?\n/)) {
    const [name, opts] = line.split('|');
    if (!name) continue;
    const parsed = new Map();
    for (const pair of String(opts || '').split(',')) {
      const [k, v] = pair.split('=').map((s) => (s || '').trim());
      if (k && v) parsed.set(k, v);
    }
    map.set(name.trim(), parsed);
  }
  return map;
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
function main() {
  const desired = loadDesired();
  const desiredTables = loadDesiredTableOptions();

  console.log(`Tuning de referencia: ${path.relative(repoRoot, CONF_FILE)} (${desired.length} parametros)`);
  console.log(`Autovacuum por tabela: ${path.relative(repoRoot, TABLES_FILE)} (${desiredTables.size} tabelas)`);
  console.log('');

  if (APPLY) {
    const statements = desired
      .map((d) => `ALTER SYSTEM SET ${d.name} = ${sqlQuote(d.value)};`)
      .join('\n');
    console.log('Aplicando ALTER SYSTEM...');
    psql(`${statements}\nSELECT pg_reload_conf();`);
    console.log('Aplicando autovacuum por tabela...');
    const tablesSql = fs.readFileSync(TABLES_FILE, 'utf8');
    psql(tablesSql, { timeoutMs: 300000 });
    console.log('Aplicado. (ALTER SYSTEM + reload; nada foi reiniciado ainda)');
    console.log('');
  }

  // --- confere parametros ---
  const names = desired.map((d) => d.name);
  let current = readCurrent(names);
  const pending = [];
  const drift = [];
  const rows = [];

  for (const d of desired) {
    const entry = current.get(d.name);
    const cur = currentAsComparable(entry);
    const want = normalize(d.value);
    const ok = cur === want;
    if (entry?.pendingRestart) pending.push(d.name);
    if (!ok && !entry?.pendingRestart) drift.push(`${d.name}: quer ${d.value}, esta ${entry?.setting ?? '<AUSENTE>'}${entry?.unit ? ' ' + entry.unit : ''}`);
    rows.push({
      name: d.name,
      want: d.value,
      have: entry ? `${entry.setting}${entry.unit ? ' ' + entry.unit : ''}` : '<AUSENTE>',
      source: entry?.source ?? '-',
      status: entry?.pendingRestart ? 'PENDENTE-RESTART' : ok ? 'ok' : 'DESVIO',
    });
  }

  const width = Math.max(...rows.map((r) => r.name.length));
  for (const r of rows) {
    console.log(`${r.status === 'ok' ? '  ' : '! '}${r.name.padEnd(width)}  quer=${String(r.want).padEnd(24)} tem=${String(r.have).padEnd(24)} ${r.source.padEnd(20)} ${r.status}`);
  }
  console.log('');

  // --- restart, se pedido e necessario ---
  if (RESTART) {
    if (!pending.length) {
      console.log('Nenhum parametro pendente de restart. Restart NAO executado (downtime de graca e desperdicio).');
    } else {
      console.log(`Pendentes de restart: ${pending.join(', ')}`);
      console.log('REINICIANDO hbx-postgres — DOWNTIME AGORA.');
      const script = [
        'set -u',
        'T0=$(date +%s%3N)',
        `docker restart --time 30 ${CONTAINER} >/dev/null`,
        `for i in $(seq 1 120); do if docker exec ${CONTAINER} pg_isready -U ${DB_USER} -d ${DB} >/dev/null 2>&1; then break; fi; sleep 1; done`,
        'T1=$(date +%s%3N)',
        'echo "DOWNTIME_MS=$((T1-T0))"',
        `docker inspect -f "RUNNING={{.State.Running}} RESTARTS={{.RestartCount}}" ${CONTAINER}`,
        `docker exec ${CONTAINER} pg_isready -U ${DB_USER} -d ${DB} || { echo "FALHOU: pg_isready nao respondeu"; docker logs --tail 60 ${CONTAINER}; exit 1; }`,
      ].join('\n');
      const res = vps(script, { timeoutMs: 300000, allowFailure: true });
      console.log(res.stdout.trim());
      if (res.status !== 0) {
        console.error('');
        console.error('!!! POSTGRES NAO VOLTOU. ROLLBACK IMEDIATO:');
        console.error(`  docker stop ${CONTAINER}`);
        console.error(`  docker run --rm -v hbx_postgres_data:/d alpine sh -c 'mv /d/postgresql.auto.conf /d/postgresql.auto.conf.RUIM'`);
        console.error(`  docker start ${CONTAINER}`);
        process.exitCode = 1;
        return;
      }
      // Relemos DEPOIS do boot: "build verde != boot ok".
      current = readCurrent(names);
      console.log('');
      console.log('Releitura pos-restart:');
      let stillWrong = 0;
      for (const d of desired) {
        const entry = current.get(d.name);
        const ok = currentAsComparable(entry) === normalize(d.value);
        if (!ok) {
          stillWrong += 1;
          console.log(`! ${d.name}: quer ${d.value}, tem ${entry?.setting ?? '<AUSENTE>'}${entry?.unit ? ' ' + entry.unit : ''}`);
        }
      }
      console.log(stillWrong === 0 ? 'Todos os parametros pegaram.' : `${stillWrong} parametro(s) ainda fora.`);
      if (stillWrong) process.exitCode = 1;
    }
  }

  // --- confere autovacuum por tabela ---
  const tableNames = [...desiredTables.keys()];
  if (tableNames.length) {
    const currentTables = readCurrentTableOptions(tableNames);
    for (const [table, opts] of desiredTables) {
      const have = currentTables.get(table);
      if (!have) {
        drift.push(`tabela ${table}: nao encontrada`);
        console.log(`! ${table}: NAO ENCONTRADA`);
        continue;
      }
      for (const [k, v] of opts) {
        const got = have.get(k);
        const ok = got != null && Number(got) === Number(v);
        if (!ok) drift.push(`${table}.${k}: quer ${v}, tem ${got ?? '<AUSENTE>'}`);
        console.log(`${ok ? '  ' : '! '}${table}.${k}  quer=${v}  tem=${got ?? '<AUSENTE>'}  ${ok ? 'ok' : 'DESVIO'}`);
      }
    }
    console.log('');
  }

  // --- fiscal do /dev/shm (parallel query morre sem isso) ---
  drift.push(...checkDevShm());
  console.log('');

  if (pending.length && !RESTART) {
    console.log(`AVISO: ${pending.length} parametro(s) exigem restart do hbx-postgres pra valer: ${pending.join(', ')}`);
    console.log('       Rodar com --restart quando o dono autorizar o downtime.');
  }

  if (drift.length) {
    console.error('');
    console.error(`DESVIO DE TUNING (${drift.length}):`);
    for (const d of drift) console.error(`  - ${d}`);
    console.error('Corrigir com: node scripts/ops/pg-tune-vps.js --apply');
    process.exitCode = 1;
    return;
  }

  if (!process.exitCode) console.log('Tuning do Postgres de producao CONFERE com o repo.');
}

try {
  main();
} catch (error) {
  console.error(`Falhou: ${error.message}`);
  process.exitCode = 1;
}
