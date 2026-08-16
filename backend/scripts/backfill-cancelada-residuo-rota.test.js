'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * FURO 5 (15/08, LOTE 1.2 — revisão adversarial ao lote 1.1) —
 * `backfill-cancelada-residuo-rota.js`:
 *   1. o recorte usava `startedAt: { not: null }` como MOTIVO pra selecionar
 *      (e zerava `startedAt` no update) — `startedAt` preenchido é SINAL DE
 *      VIDA (a mesma régua `SEM_SINAL_DE_VIDA` de `logistica-expurgo.util`),
 *      não resíduo. O fix vira filtro NEGATIVO (`startedAt: null` no where,
 *      e NUNCA no `data` do update).
 *   2. `--rollback` era escrita sem freio: sem dry-run, sem `--company`, sem
 *      escopo de tenant no update, sem CAS de status.
 *
 * 🔴 NUNCA UM `PrismaClient` DE VERDADE. Este script escreve em produção sob
 * `--apply`; um teste que deixasse `coletarCandidatas`/`rollback` chegar a um
 * banco de verdade violaria "PROIBIDO rodar --apply" na primeira distração.
 * O stub abaixo troca a resolução de `@prisma/client` (mesmo caminho
 * resolvido, `require.cache`) por uma classe que CONTA chamadas e nunca
 * conecta em nada — os testes RED-FIRST chegam a chamar o `rollback()`
 * ANTIGO (sem `--apply`/CAS) de propósito, e é o stub que torna isso seguro.
 */
const PRISMA_PATH = require.resolve('@prisma/client');

function instalarStubDoPrisma() {
  const chamadas = { entregaUpdate: [], entregaUpdateMany: [], entregaFindMany: [] };
  class FakePrismaClient {
    constructor() {
      this.entrega = {
        findMany: async (args) => { chamadas.entregaFindMany.push(args); return []; },
        update: async (args) => { chamadas.entregaUpdate.push(args); return args; },
        updateMany: async (args) => { chamadas.entregaUpdateMany.push(args); return { count: 0 }; },
      };
    }
    async $disconnect() {}
  }
  require.cache[PRISMA_PATH] = {
    id: PRISMA_PATH, filename: PRISMA_PATH, loaded: true, exports: { PrismaClient: FakePrismaClient },
  };
  return chamadas;
}

/** require() fresco, com `process.argv` mutado e o Prisma STUBADO — o script
 * lê os flags e cria `new PrismaClient()` no escopo do módulo, então cada
 * cenário precisa de um require() novo com o stub já instalado. */
function carregarCom(argvExtra) {
  const chamadas = instalarStubDoPrisma();
  const modulePath = require.resolve('./backfill-cancelada-residuo-rota.js');
  delete require.cache[modulePath];
  const argvOriginal = process.argv;
  process.argv = ['node', modulePath, ...argvExtra];
  try {
    return { mod: require('./backfill-cancelada-residuo-rota.js'), chamadas };
  } finally {
    process.argv = argvOriginal;
  }
}

test('FURO 5 · whereCandidatas() NUNCA usa startedAt como motivo de seleção — só rotaOrdem/etaAt no OR', () => {
  const { mod } = carregarCom([]);
  const where = mod.whereCandidatas();

  assert.equal(where.status, 'cancelada');
  assert.ok(Array.isArray(where.OR), 'o OR de motivos existe');
  const chavesDoOr = where.OR.map((cl) => Object.keys(cl)[0]);
  assert.deepEqual(
    [...chavesDoOr].sort(),
    ['etaAt', 'rotaOrdem'],
    'HOJE (antes do fix): startedAt entra no OR como motivo — apagaria o "saiu às 08:12" de uma cancelada-durante-a-rota',
  );
});

test('FURO 5 · whereCandidatas() exige startedAt NULO como FILTRO (sinal de vida barra a candidatura)', () => {
  const { mod } = carregarCom([]);
  const where = mod.whereCandidatas();

  assert.equal(where.startedAt, null, 'startedAt tem que ser filtro negativo (SEM_SINAL_DE_VIDA), nunca motivo positivo');
  assert.equal(where.arrivedAt, null);
  assert.equal(where.deliveredAt, null);
  assert.deepEqual(where.logisticaRouteStop, { is: null });
});

test('FURO 5 · whereCandidatas() com --company= escopa por empresa (nada atravessa empresa)', () => {
  const { mod } = carregarCom(['--company=41']);
  const where = mod.whereCandidatas();
  assert.equal(where.companyId, 41);
});

test('FURO 5 · rollback SEM --company recusa (nada atravessa empresa) — nunca chega a escrever', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hbx-backfill-residuo-'));
  const arquivo = path.join(dir, 'backup.json');
  fs.writeFileSync(arquivo, JSON.stringify({ linhas: [{ id: 'd1', companyId: 41, rotaOrdem: 3, etaAt: null }] }));
  const { mod, chamadas } = carregarCom(['--rollback=' + arquivo]);
  const exitCodeOriginal = process.exitCode;
  try {
    await assert.doesNotReject(() => mod.rollback(arquivo));
    assert.equal(
      chamadas.entregaUpdate.length + chamadas.entregaUpdateMany.length, 0,
      'HOJE (antes do fix): sem --company o rollback ANTIGO escreve do mesmo jeito — nada atravessa empresa é letra morta',
    );
  } finally {
    // O guard usa `process.exitCode` (global do processo) pra avisar o CLI
    // sem lançar — mas isso vaza pro runner do `node --test` inteiro se não
    // for desfeito aqui: o arquivo de teste inteiro sairia marcado como
    // falho mesmo com todas as asserções verdes.
    process.exitCode = exitCodeOriginal;
  }
});

test('FURO 5 · rollback é dry-run por DEFAULT mesmo com --company (só grava com --apply)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hbx-backfill-residuo-'));
  const arquivo = path.join(dir, 'backup.json');
  fs.writeFileSync(arquivo, JSON.stringify({
    geradoEm: new Date().toISOString(),
    escopo: 41,
    linhas: [{ id: 'd1', companyId: 41, rotaOrdem: 3, etaAt: null }],
  }));
  const { mod, chamadas } = carregarCom(['--rollback=' + arquivo, '--company=41']);
  await assert.doesNotReject(() => mod.rollback(arquivo));
  assert.equal(
    chamadas.entregaUpdate.length + chamadas.entregaUpdateMany.length, 0,
    'HOJE (antes do fix): rollback escreve SEMPRE, não existe dry-run — sem --apply já grava',
  );
});

test('FURO 5 · rollback com --company e --apply escreve só as linhas DAQUELA empresa, com CAS de status', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hbx-backfill-residuo-'));
  const arquivo = path.join(dir, 'backup.json');
  fs.writeFileSync(arquivo, JSON.stringify({
    geradoEm: new Date().toISOString(),
    escopo: 'todas',
    linhas: [
      { id: 'd1', companyId: 41, rotaOrdem: 3, etaAt: null },
      { id: 'd2', companyId: 5, rotaOrdem: 7, etaAt: null }, // OUTRA empresa — não pode entrar
    ],
  }));
  const { mod, chamadas } = carregarCom(['--rollback=' + arquivo, '--company=41', '--apply']);
  await mod.rollback(arquivo);

  assert.equal(chamadas.entregaUpdateMany.length, 1, 'só a linha da empresa 41 é revertida — a d2 (empresa 5) fica de fora');
  const [chamada] = chamadas.entregaUpdateMany;
  assert.equal(chamada.where.id, 'd1');
  assert.equal(chamada.where.companyId, 41, 'nada atravessa empresa: o where escopa por companyId');
  assert.equal(chamada.where.status, 'cancelada', 'CAS: só reverte quem ainda está cancelada');
  assert.equal('startedAt' in chamada.data, false, 'FURO 5: o rollback NUNCA escreve startedAt — este script não é dono desse campo');
});
