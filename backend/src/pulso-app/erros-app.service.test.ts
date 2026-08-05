import test from 'node:test';
import assert from 'node:assert/strict';
import { ErrosAppService } from './erros-app.service';

/**
 * ERROS QUE O CLIENTE VIU (PR05082026-VER-TELA V3, 05/08).
 *
 * O que morde:
 *  - erro sem mensagem não vira linha (lixo não é erro);
 *  - a hora é do APARELHO, mas relógio torto/absurdo cai pra agora;
 *  - lote grande é cortado (o app já limita, mas o servidor não confia);
 *  - banco caindo NÃO derruba o poll (o recado é operação, isto é enfeite);
 *  - faxina apaga o que passou de 7 dias.
 */

function harness(opts: { explodir?: boolean } = {}) {
  const linhas: any[] = [];
  const apagados: any[] = [];
  const prisma: any = {
    mobileErroTrilha: {
      createMany: async ({ data }: any) => {
        if (opts.explodir) throw new Error('banco fora do ar');
        linhas.push(...data);
        return { count: data.length };
      },
      findMany: async ({ where, take }: any) => {
        const saida = linhas
          .filter((l) => l.deviceId === where.deviceId)
          .sort((a, b) => b.at.getTime() - a.at.getTime());
        return (take ? saida.slice(0, take) : saida).map((l) => ({ tela: l.tela, msg: l.msg, at: l.at }));
      },
      deleteMany: async ({ where }: any) => {
        const corte = where.at.lt as Date;
        let count = 0;
        for (let i = linhas.length - 1; i >= 0; i--) {
          if (linhas[i].at < corte) { apagados.push(...linhas.splice(i, 1)); count++; }
        }
        return { count };
      },
    },
  };
  return { linhas, apagados, service: new ErrosAppService(prisma) };
}

const UM_ERRO = (msg = 'Falha ao salvar o cliente.') => ({ tela: 'clientes', msg, at: new Date().toISOString() });

test('grava o que o cliente viu, com tela e hora', async () => {
  const h = harness();
  assert.equal(await h.service.registrarDoPoll(41, 'e13', 7, [UM_ERRO()]), 1);
  assert.equal(h.linhas.length, 1);
  assert.equal(h.linhas[0].companyId, 41);
  assert.equal(h.linhas[0].deviceId, 'e13');
  assert.equal(h.linhas[0].tela, 'clientes');
  assert.equal(h.linhas[0].msg, 'Falha ao salvar o cliente.');
});

test('lixo não vira linha: sem mensagem, sem array, sem aparelho', async () => {
  const h = harness();
  assert.equal(await h.service.registrarDoPoll(41, 'e13', 7, [{ tela: 'rota', msg: '   ' }]), 0);
  assert.equal(await h.service.registrarDoPoll(41, 'e13', 7, 'não é lista'), 0);
  assert.equal(await h.service.registrarDoPoll(41, '', 7, [UM_ERRO()]), 0);
  assert.equal(await h.service.registrarDoPoll(0, 'e13', 7, [UM_ERRO()]), 0);
  assert.equal(h.linhas.length, 0);
});

test('relógio do aparelho vale — mas data torta, futura ou pré-histórica cai pra agora', async () => {
  const h = harness();
  const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await h.service.registrarDoPoll(41, 'e13', 7, [
    { tela: 'rota', msg: 'de ontem', at: ontem.toISOString() },
    { tela: 'rota', msg: 'data torta', at: 'ontem de manhã' },
    { tela: 'rota', msg: 'do futuro', at: new Date(Date.now() + 999_000_000).toISOString() },
    { tela: 'rota', msg: 'de 2010', at: '2010-01-01T00:00:00.000Z' },
  ]);
  const por = (msg: string) => h.linhas.find((l) => l.msg === msg).at as Date;
  assert.equal(por('de ontem').getTime(), ontem.getTime(), 'hora real do aparelho é respeitada');
  for (const msg of ['data torta', 'do futuro', 'de 2010']) {
    assert.ok(Math.abs(por(msg).getTime() - Date.now()) < 5_000, `${msg} caiu pra agora`);
  }
});

test('mensagem e tela são cortadas no tamanho da coluna', async () => {
  const h = harness();
  await h.service.registrarDoPoll(41, 'e13', 7, [{ tela: 'x'.repeat(80), msg: 'y'.repeat(500) }]);
  assert.equal(h.linhas[0].msg.length, 300);
  assert.equal(h.linhas[0].tela.length, 40);
});

test('lote grande é cortado no teto (o servidor não confia no cliente)', async () => {
  const h = harness();
  const lote = Array.from({ length: 60 }, (_, i) => UM_ERRO(`erro ${i}`));
  assert.equal(await h.service.registrarDoPoll(41, 'e13', 7, lote), 20);
  assert.equal(h.linhas.length, 20);
});

test('banco fora do ar NÃO derruba o poll da rota', async () => {
  const h = harness({ explodir: true });
  assert.equal(await h.service.registrarDoPoll(41, 'e13', 7, [UM_ERRO()]), 0);
});

test('painel lê do mais novo pro mais velho, só do aparelho pedido', async () => {
  const h = harness();
  await h.service.registrarDoPoll(41, 'e13', 7, [
    { tela: 'rota', msg: 'antigo', at: new Date(Date.now() - 60_000).toISOString() },
    { tela: 'clientes', msg: 'recente', at: new Date().toISOString() },
  ]);
  await h.service.registrarDoPoll(41, 'g15', 9, [UM_ERRO('de outro aparelho')]);
  const lista = await h.service.listar('e13');
  assert.deepEqual(lista.map((l) => l.msg), ['recente', 'antigo']);
  assert.equal(typeof lista[0].at, 'string', 'o painel recebe ISO, não Date');
  assert.deepEqual(await h.service.listar('  '), []);
});

test('faxina lazy apaga o que passou de 7 dias (e só depois de 50 gravações)', async () => {
  const h = harness();
  h.linhas.push({ companyId: 41, deviceId: 'e13', userId: 7, tela: 'rota', msg: 'muito velho', at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) });
  for (let i = 0; i < 49; i++) await h.service.registrarDoPoll(41, 'e13', 7, [UM_ERRO(`erro ${i}`)]);
  assert.ok(h.linhas.some((l) => l.msg === 'muito velho'), 'faxina não roda a cada poll');
  await h.service.registrarDoPoll(41, 'e13', 7, [UM_ERRO('o 50º')]);
  assert.equal(h.linhas.some((l) => l.msg === 'muito velho'), false, 'o que passou de 7 dias saiu');
});
