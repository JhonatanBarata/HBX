import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, '..');
const guard = require('../scripts/lib/vps-disk-guard.js');

// FREIO DE DISCO DO PUBLISH — o que provamos aqui:
//   1. o teto do cache é finito e vai em BYTES (não em "15GB", que dependeria do
//      docker de plantão aceitar o sufixo);
//   2. o prune de imagem é só de DANGLING com filtro de tempo — nunca `-a`, que
//      levaria imagem com tag;
//   3. VOLUME nunca aparece: `docker volume prune` mataria o banco de produção;
//   4. todo comando tem `|| true` — a faxina não derruba o publish;
//   5. o freio está de fato PENDURADO nos DOIS caminhos de deploy (foi a falta
//      disso que deixou 65 GB de sujeira acumular por 3 meses).

function lines(env = {}) {
  const original = {};
  for (const key of Object.keys(env)) {
    original[key] = process.env[key];
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  try {
    return guard.buildDiskGuardShellLines();
  } finally {
    for (const key of Object.keys(env)) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}

test('default: teto de 15 GB em BYTES, imagens dangling > 48h', () => {
  const config = guard.resolveDiskGuardConfig();
  assert.equal(config.keepGb, 15);
  assert.equal(config.keepBytes, 15 * 1024 * 1024 * 1024);
  assert.equal(config.imageUntilHours, 48);
  assert.equal(config.skipped, false);

  const script = lines({ HBX_PUBLISH_BUILD_CACHE_KEEP_GB: undefined, HBX_PUBLISH_IMAGE_PRUNE_UNTIL_H: undefined, HBX_PUBLISH_SKIP_CLEANUP: undefined }).join('\n');
  assert.match(script, /docker builder prune -f --keep-storage 16106127360/);
  assert.match(script, /docker image prune -f --filter "until=48h"/);
});

test('o teto NUNCA vai como sufixo ("15GB") — só dígitos', () => {
  const script = lines({}).join('\n');
  const match = /--keep-storage (\S+)/.exec(script);
  assert.ok(match, 'esperava encontrar --keep-storage');
  assert.match(match[1], /^\d+$/, `--keep-storage deve ser bytes puros, veio: ${match[1]}`);
});

test('NUNCA usa prune de imagem com -a (levaria imagem COM tag)', () => {
  const script = lines({}).join('\n');
  assert.doesNotMatch(script, /image prune\s+-af/);
  assert.doesNotMatch(script, /image prune\s+-a\b/);
  assert.doesNotMatch(script, /builder prune\s+-af/);
});

test('VOLUME nunca entra em prune (mataria o banco de produção)', () => {
  const script = lines({}).join('\n');
  assert.doesNotMatch(script, /volume prune/);
  assert.doesNotMatch(script, /system prune/);
});

test('todo comando destrutivo tem || true — faxina não derruba o publish', () => {
  for (const line of lines({})) {
    if (/^docker (builder|image) prune/.test(line)) {
      assert.match(line, /\|\| true$/, `sem guarda: ${line}`);
    }
  }
});

test('LOGA antes e depois (df + docker system df) — nunca apaga em silêncio', () => {
  const script = lines({}).join('\n');
  assert.match(script, /ANTES/);
  assert.match(script, /DEPOIS/);
  assert.equal((script.match(/df -hP \//g) || []).length, 2);
  assert.equal((script.match(/docker system df/g) || []).length, 2);
});

test('env customiza o teto; valor inválido cai no default', () => {
  assert.match(lines({ HBX_PUBLISH_BUILD_CACHE_KEEP_GB: '30' }).join('\n'), new RegExp(`--keep-storage ${30 * 1024 * 1024 * 1024}`));
  assert.match(lines({ HBX_PUBLISH_IMAGE_PRUNE_UNTIL_H: '72' }).join('\n'), /until=72h/);
  // 0 e lixo não podem virar "prune sem teto"
  assert.match(lines({ HBX_PUBLISH_BUILD_CACHE_KEEP_GB: '0' }).join('\n'), new RegExp(`--keep-storage ${15 * 1024 * 1024 * 1024}`));
  assert.match(lines({ HBX_PUBLISH_BUILD_CACHE_KEEP_GB: 'abc' }).join('\n'), new RegExp(`--keep-storage ${15 * 1024 * 1024 * 1024}`));
});

test('HBX_PUBLISH_SKIP_CLEANUP=1 desliga e AVISA que o disco vai crescer', () => {
  const script = lines({ HBX_PUBLISH_SKIP_CLEANUP: '1' }).join('\n');
  assert.doesNotMatch(script, /prune/);
  assert.match(script, /disco vai crescer/);
});

test('CONTRATO: o freio está pendurado nos DOIS caminhos de deploy', () => {
  for (const relative of ['scripts/ops/deploy-vps.js', 'scripts/deploy-hostinger.js']) {
    const source = fs.readFileSync(path.join(repoRoot, relative), 'utf8');
    assert.match(source, /vps-disk-guard/, `${relative} não requer o freio`);
    assert.match(source, /buildDiskGuardShellLines\(\)/, `${relative} não chama o freio`);
  }
});

test('CONTRATO: nenhum deploy voltou a usar prune cego direto', () => {
  for (const relative of ['scripts/ops/deploy-vps.js', 'scripts/deploy-hostinger.js']) {
    const source = fs.readFileSync(path.join(repoRoot, relative), 'utf8');
    // Só comentários podem mencionar; linha de comando não.
    const code = source
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    assert.doesNotMatch(code, /'docker image prune -f'/, `${relative}: prune cego de imagem voltou`);
    assert.doesNotMatch(code, /'docker builder prune -f \|\| true'/, `${relative}: prune cego de cache voltou`);
  }
});
