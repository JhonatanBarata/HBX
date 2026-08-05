'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  planRfbRetention,
  pruneRfbDownloads,
  listMonthDirs,
  resolveKeepMonths,
  evaluateLoadHealth,
  resolveMinCompanies,
  REQUIRED_LEDGER_STEPS,
} = require('./lib/rfb-disk-guard');

// FREIO DO DISCO DA RFB — o que provamos aqui:
//   1. o corte é pelos meses MAIS RECENTES e respeita o teto;
//   2. dry-run NÃO apaga (e reporta exatamente o que apagaria);
//   3. a limpeza real apaga só o que o plano disse;
//   4. lixo no diretório (arquivo solto, pasta com nome fora de AAAA-MM) é ignorado;
//   5. nada disso LANÇA — a carga já foi aceita quando isto roda.

function makeTree(months) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'hbx-rfb-guard-'));
  for (const [month, files] of Object.entries(months)) {
    const dir = path.join(base, month);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, size] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), Buffer.alloc(size, 0));
    }
  }
  return base;
}

test('lista só pastas AAAA-MM, da mais recente pra mais antiga', () => {
  const base = makeTree({ '2026-06': { 'a.zip': 10 }, '2026-08': { 'a.zip': 10 }, '2026-07': { 'a.zip': 10 } });
  fs.writeFileSync(path.join(base, 'solto.zip'), Buffer.alloc(5));
  fs.mkdirSync(path.join(base, 'rascunho'));
  assert.deepEqual(listMonthDirs(base), ['2026-08', '2026-07', '2026-06']);
  fs.rmSync(base, { recursive: true, force: true });
});

test('keepMonths=0 (default): TUDO sai, inclusive o mês da carga', () => {
  const base = makeTree({ '2026-07': { 'Empresas0.zip': 1000 }, '2026-08': { 'Empresas0.zip': 2000 } });
  const plan = planRfbRetention(base, { keepMonths: 0 });
  assert.deepEqual(plan.keep, []);
  assert.deepEqual(plan.remove.map((r) => r.month), ['2026-08', '2026-07']);
  assert.equal(plan.freedBytes, 3000);
  fs.rmSync(base, { recursive: true, force: true });
});

test('keepMonths=1: guarda o mais recente, apaga o resto', () => {
  const base = makeTree({ '2026-06': { 'a.zip': 100 }, '2026-07': { 'a.zip': 200 }, '2026-08': { 'a.zip': 400 } });
  const plan = planRfbRetention(base, { keepMonths: 1 });
  assert.deepEqual(plan.keep, ['2026-08']);
  assert.deepEqual(plan.remove.map((r) => r.month), ['2026-07', '2026-06']);
  assert.equal(plan.freedBytes, 300);
  fs.rmSync(base, { recursive: true, force: true });
});

test('keepMonths maior que o nº de meses: não apaga nada', () => {
  const base = makeTree({ '2026-08': { 'a.zip': 100 } });
  const plan = planRfbRetention(base, { keepMonths: 5 });
  assert.deepEqual(plan.remove, []);
  assert.equal(plan.freedBytes, 0);
  fs.rmSync(base, { recursive: true, force: true });
});

test('DRY-RUN não apaga nada e ainda reporta o que sairia', () => {
  const base = makeTree({ '2026-07': { 'Empresas0.zip': 1024, 'Socios0.zip': 512 } });
  const logged = [];
  const result = pruneRfbDownloads(base, { keepMonths: 0, dryRun: true, currentMonth: '2026-07', log: (m) => logged.push(m) });

  assert.equal(result.dryRun, true);
  assert.equal(result.applied, false);
  assert.equal(result.freedBytes, 1536);
  // A pasta e os arquivos continuam INTACTOS.
  assert.equal(fs.existsSync(path.join(base, '2026-07', 'Empresas0.zip')), true);
  assert.equal(listMonthDirs(base).length, 1);
  // E o log deixa claro que foi simulação, com contagem e tamanho.
  assert.match(logged.join('\n'), /\[DRY-RUN\]/);
  assert.match(logged.join('\n'), /apagaria/);
  assert.match(logged.join('\n'), /2 arquivo\(s\)/);
  fs.rmSync(base, { recursive: true, force: true });
});

test('aplicação real apaga só o que o plano disse e loga cada remoção', () => {
  const base = makeTree({ '2026-06': { 'a.zip': 100 }, '2026-07': { 'a.zip': 200 }, '2026-08': { 'a.zip': 400 } });
  const logged = [];
  const result = pruneRfbDownloads(base, { keepMonths: 1, currentMonth: '2026-08', log: (m) => logged.push(m) });

  assert.equal(result.applied, true);
  assert.deepEqual(listMonthDirs(base), ['2026-08']);
  assert.equal(result.freedBytes, 300);
  assert.match(logged.join('\n'), /2026-07/);
  assert.match(logged.join('\n'), /2026-06/);
  assert.doesNotMatch(logged.join('\n'), /apagado .*2026-08/);
  fs.rmSync(base, { recursive: true, force: true });
});

test('marca no log quando o mês apagado é o da carga que acabou de ser aceita', () => {
  const base = makeTree({ '2026-08': { 'a.zip': 100 } });
  const logged = [];
  pruneRfbDownloads(base, { keepMonths: 0, currentMonth: '2026-08', log: (m) => logged.push(m) });
  assert.match(logged.join('\n'), /mes desta carga; ja importado e aceito/);
  fs.rmSync(base, { recursive: true, force: true });
});

test('diretório inexistente: não lança, não apaga, avisa que não há nada', () => {
  const logged = [];
  const result = pruneRfbDownloads(path.join(os.tmpdir(), 'hbx-nao-existe-' + Date.now()), {
    keepMonths: 0,
    log: (m) => logged.push(m),
  });
  assert.equal(result.remove.length, 0);
  assert.match(logged.join('\n'), /nada a limpar/);
});

test('arquivo solto e pasta fora do padrão nunca entram na conta', () => {
  const base = makeTree({ '2026-08': { 'a.zip': 100 } });
  fs.writeFileSync(path.join(base, 'README.txt'), Buffer.alloc(9999));
  fs.mkdirSync(path.join(base, 'backup-manual'));
  fs.writeFileSync(path.join(base, 'backup-manual', 'x.zip'), Buffer.alloc(9999));
  pruneRfbDownloads(base, { keepMonths: 0, log: () => {} });
  assert.equal(fs.existsSync(path.join(base, 'README.txt')), true);
  assert.equal(fs.existsSync(path.join(base, 'backup-manual', 'x.zip')), true);
  fs.rmSync(base, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// A GUARDA DURA — é ela que decide perder 7 GB de fonte. O caso que mais importa
// é o do FALSO POSITIVO: `verifyAcceptance()` do importador não reprova nada
// (zero `throw`), então sem esta guarda uma carga vazia apagaria os zips.
// ─────────────────────────────────────────────────────────────────────────────

function healthDeps(overrides = {}) {
  return {
    log: () => {},
    ledgerDone: () => true,
    countCompanies: () => 28_438_116, // medido na VPS em 05/08
    ...overrides,
  };
}

test('carga real da VPS (28.438.116 empresas, ledger completo) → LIBERA apagar', () => {
  const verdict = evaluateLoadHealth('2026-07', healthDeps());
  assert.equal(verdict.healthy, true);
  assert.equal(verdict.reason, 'ok');
});

test('O CASO QUE IMPORTA: carga com 0 empresa NÃO apaga a fonte', () => {
  const logged = [];
  const verdict = evaluateLoadHealth('2026-08', healthDeps({ countCompanies: () => 0, log: (m) => logged.push(m) }));
  assert.equal(verdict.healthy, false);
  assert.equal(verdict.reason, 'poucas_linhas');
  assert.match(logged.join('\n'), /zips MANTIDOS/);
});

test('carga pela metade (5M de 28M) NÃO apaga — piso de sanidade pega', () => {
  const verdict = evaluateLoadHealth('2026-08', healthDeps({ countCompanies: () => 5_000_000 }));
  assert.equal(verdict.healthy, false);
  assert.equal(verdict.companies, 5_000_000);
});

test('fase do ledger faltando NÃO apaga, e diz QUAL faltou', () => {
  const logged = [];
  const verdict = evaluateLoadHealth('2026-08', healthDeps({
    ledgerDone: (_month, step) => step !== 'transform:create_indexes',
    log: (m) => logged.push(m),
  }));
  assert.equal(verdict.healthy, false);
  assert.equal(verdict.reason, 'ledger_incompleto');
  assert.deepEqual(verdict.missing, ['transform:create_indexes']);
  assert.match(logged.join('\n'), /transform:create_indexes/);
});

test('ledger incompleto tem precedência: nem consulta a contagem', () => {
  let contou = false;
  evaluateLoadHealth('2026-08', healthDeps({
    ledgerDone: () => false,
    countCompanies: () => { contou = true; return 28_000_000; },
  }));
  assert.equal(contou, false);
});

test('"não consegui conferir" NUNCA é "está tudo bem" (banco fora do ar)', () => {
  const logged = [];
  const verdict = evaluateLoadHealth('2026-08', healthDeps({
    countCompanies: () => { throw new Error('connection to server was lost'); },
    log: (m) => logged.push(m),
  }));
  assert.equal(verdict.healthy, false);
  assert.equal(verdict.reason, 'conferencia_falhou');
  assert.match(logged.join('\n'), /zips MANTIDOS/);
});

test('contagem não-numérica (psql devolveu lixo) NÃO apaga', () => {
  for (const lixo of ['', 'ERROR', null, undefined, NaN]) {
    const verdict = evaluateLoadHealth('2026-08', healthDeps({ countCompanies: () => lixo }));
    assert.equal(verdict.healthy, false, `deveria recusar contagem: ${String(lixo)}`);
  }
});

test('exatamente no piso passa; um abaixo não', () => {
  assert.equal(evaluateLoadHealth('m', healthDeps({ countCompanies: () => 20_000_000 })).healthy, true);
  assert.equal(evaluateLoadHealth('m', healthDeps({ countCompanies: () => 19_999_999 })).healthy, false);
});

test('piso é configurável por env e nunca vira 0 (que aceitaria base vazia)', () => {
  const original = process.env.HBX_RFB_MIN_COMPANIES;
  try {
    delete process.env.HBX_RFB_MIN_COMPANIES;
    assert.equal(resolveMinCompanies(), 20_000_000);
    process.env.HBX_RFB_MIN_COMPANIES = '1000';
    assert.equal(resolveMinCompanies(), 1000);
    for (const lixo of ['0', '-5', 'abc', '']) {
      process.env.HBX_RFB_MIN_COMPANIES = lixo;
      assert.equal(resolveMinCompanies(), 20_000_000, `lixo "${lixo}" deveria cair no default`);
    }
  } finally {
    if (original === undefined) delete process.env.HBX_RFB_MIN_COMPANIES;
    else process.env.HBX_RFB_MIN_COMPANIES = original;
  }
});

test('as fases exigidas são as que PRODUZEM a base (não uma lista vazia)', () => {
  assert.ok(REQUIRED_LEDGER_STEPS.length >= 2);
  assert.ok(REQUIRED_LEDGER_STEPS.includes('transform:companies'));
});

test('HBX_RFB_KEEP_MONTHS: lê do env, com default 0 e sem aceitar lixo/negativo', () => {
  const original = process.env.HBX_RFB_KEEP_MONTHS;
  try {
    delete process.env.HBX_RFB_KEEP_MONTHS;
    assert.equal(resolveKeepMonths(), 0);
    process.env.HBX_RFB_KEEP_MONTHS = '2';
    assert.equal(resolveKeepMonths(), 2);
    process.env.HBX_RFB_KEEP_MONTHS = '-3';
    assert.equal(resolveKeepMonths(), 0);
    process.env.HBX_RFB_KEEP_MONTHS = 'abc';
    assert.equal(resolveKeepMonths(), 0);
  } finally {
    if (original === undefined) delete process.env.HBX_RFB_KEEP_MONTHS;
    else process.env.HBX_RFB_KEEP_MONTHS = original;
  }
});
