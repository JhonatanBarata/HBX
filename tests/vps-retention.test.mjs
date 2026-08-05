import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  CATEGORIES,
  planRetention,
  parseInventory,
  isPathAllowed,
  buildRemovalScript,
} = require('../scripts/ops/vps-retention.js');

// RETENÇÃO DA VPS — o que provamos aqui:
//   1. o corte é por mtime e respeita o teto de cada categoria;
//   2. TODA categoria tem teto (nenhuma é "apaga tudo que for velho");
//   3. a guarda de prefixo recusa caminho perigoso — é a rede que impede um bug
//      de parsing de virar `rm -rf /` ou `rm -rf /root`;
//   4. o script de remoção nunca monta glob: só caminhos literais aprovados.

function item(path, mtime, bytes = 100) {
  return `cat\t${mtime}\t${bytes}\t${path}`;
}

test('parseInventory: lê categoria, mtime, bytes e caminho (inclusive com espaço)', () => {
  const parsed = parseInventory(
    ['hbx-backups\t1750000000\t2048\t/root/hbx-backups/pasta com espaco', 'hbx-backups\t1760000000\t1024\t/root/hbx-backups/b', ''].join('\n'),
  );
  const rows = parsed.get('hbx-backups');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].path, '/root/hbx-backups/pasta com espaco');
  assert.equal(rows[0].bytes, 2048);
  assert.equal(rows[1].mtime, 1760000000);
});

test('parseInventory: linha vazia ou truncada é ignorada, nunca lança', () => {
  const parsed = parseInventory('\n\nlixo\nhbx-backups\t1\t2\t/root/hbx-backups/x\n');
  assert.equal(parsed.get('hbx-backups').length, 1);
});

test('planRetention: guarda os N mais recentes por mtime e remove o resto', () => {
  const inventory = new Map([
    ['t', [
      { path: '/root/hbx-backups/velho', mtime: 100, bytes: 500 },
      { path: '/root/hbx-backups/novo', mtime: 300, bytes: 700 },
      { path: '/root/hbx-backups/medio', mtime: 200, bytes: 900 },
    ]],
  ]);
  const [plan] = planRetention(inventory, [{ id: 't', label: 't', keep: 1 }]);
  assert.deepEqual(plan.keep.map((k) => k.path), ['/root/hbx-backups/novo']);
  assert.deepEqual(plan.remove.map((r) => r.path), ['/root/hbx-backups/medio', '/root/hbx-backups/velho']);
  assert.equal(plan.freedBytes, 1400);
});

test('planRetention: menos itens que o teto = nada sai', () => {
  const inventory = new Map([['t', [{ path: '/root/hbx-backups/a', mtime: 1, bytes: 10 }]]]);
  const [plan] = planRetention(inventory, [{ id: 't', label: 't', keep: 4 }]);
  assert.equal(plan.remove.length, 0);
  assert.equal(plan.freedBytes, 0);
});

test('planRetention: categoria sem nada encontrado não quebra', () => {
  const [plan] = planRetention(new Map(), [{ id: 'vazia', label: 'v', keep: 2 }]);
  assert.deepEqual(plan.keep, []);
  assert.deepEqual(plan.remove, []);
});

test('TODA categoria declarada tem teto >= 1 (nenhuma apaga a coleção inteira)', () => {
  assert.ok(CATEGORIES.length > 0);
  for (const category of CATEGORIES) {
    assert.ok(Number.isInteger(category.keep), `${category.id}: keep precisa ser inteiro`);
    assert.ok(category.keep >= 1, `${category.id}: keep=${category.keep} — teto tem de guardar ao menos 1`);
  }
});

test('a categoria de meses da RFB nunca tira o mês corrente (keep >= 1)', () => {
  const rfb = CATEGORIES.find((c) => c.id === 'rfb-months');
  assert.ok(rfb);
  assert.ok(rfb.keep >= 1);
});

test('guarda de prefixo: RECUSA raiz, /root e caminhos de sistema', () => {
  for (const bad of ['/', '/root', '/root/', '/var/lib/docker', '/etc/passwd', '/root/.ssh', '/root/HBX', '', null, undefined]) {
    assert.equal(isPathAllowed(bad), false, `deveria recusar: ${String(bad)}`);
  }
});

test('guarda de prefixo: RECUSA travessia (..) e injeção de nova linha', () => {
  assert.equal(isPathAllowed('/root/hbx-backups/../../etc'), false);
  assert.equal(isPathAllowed('/root/hbx-backups/x\nrm -rf /'), false);
});

test('guarda de prefixo: ACEITA só filhos das pastas de backup e os tarballs', () => {
  assert.equal(isPathAllowed('/root/hbx-backups/google-pair-20260715-022407'), true);
  assert.equal(isPathAllowed('/root/HBX-backups/git-clean'), true);
  assert.equal(isPathAllowed('/root/hbx-data/rfb/2026-07'), true);
  assert.equal(isPathAllowed('/root/HBX_FULL_2026-05-02_22-15-32.tar.gz'), true);
  assert.equal(isPathAllowed('/root/HBX_BACKUP_2026-05-02_22-05-39.sha256'), true);
});

test('guarda de prefixo: prefixo exato sem filho é recusado (não apaga a pasta-mãe)', () => {
  assert.equal(isPathAllowed('/root/hbx-backups/'), false);
  assert.equal(isPathAllowed('/root/hbx-data/rfb/'), false);
  assert.equal(isPathAllowed('/root/HBX_FULL_'), false);
});

test('script de remoção usa caminho LITERAL entre aspas, nunca glob', () => {
  const script = buildRemovalScript(['/root/hbx-backups/x y', "/root/hbx-backups/o'brien"]);
  assert.match(script, /rm -rf '\/root\/hbx-backups\/x y'/);
  // aspas simples dentro do caminho ficam escapadas no formato do shell
  assert.match(script, /o'\\''brien/);
  assert.doesNotMatch(script, /rm -rf \*/);
  assert.doesNotMatch(script, /rm -rf \$/);
  // e sempre mede o disco antes e depois
  assert.match(script, /disco antes/);
  assert.match(script, /disco depois/);
});

test('script de remoção loga cada item removido (nunca apaga em silêncio)', () => {
  const script = buildRemovalScript(['/root/hbx-backups/alvo']);
  assert.match(script, /REMOVIDO \/root\/hbx-backups\/alvo/);
});
