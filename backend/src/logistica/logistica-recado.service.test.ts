import test from 'node:test';
import assert from 'node:assert/strict';
import { LogisticaRecadoService } from './logistica-recado.service';

/**
 * COCKPIT (03/08) — o canal de recado. Os testes cobrem o que MORDE:
 * multi-tenant, o portão (a garantia do clique), broadcast explodido e a
 * diferença entre "chegou no aparelho" e "a pessoa leu".
 */

type Linha = Record<string, any>;

function harness(opts: { linhas?: Linha[]; motoristas?: number[]; entregasPorDono?: number[] } = {}) {
  const linhas: Linha[] = opts.linhas ? [...opts.linhas] : [];
  const criados: Linha[] = [];
  let seq = 0;

  const prisma: any = {
    logisticaRecado: {
      create: async ({ data }: any) => {
        const row = { id: `rec_${++seq}`, createdAt: new Date(), entregueEm: null, vistoEm: null, ackEm: null, loteId: null, ...data };
        linhas.push(row);
        criados.push(row);
        return row;
      },
      findMany: async ({ where, take }: any) => {
        let saida = linhas.filter((row) => {
          if (where.companyId != null && row.companyId !== where.companyId) return false;
          if (where.motoristaUserId != null && row.motoristaUserId !== where.motoristaUserId) return false;
          if (where.origem != null && row.origem !== where.origem) return false;
          if (where.entregueEm === null && row.entregueEm !== null) return false;
          if (where.entregueEm?.not === null && row.entregueEm === null) return false;
          if (where.ackEm === null && row.ackEm !== null) return false;
          if (where.nivel?.in && !where.nivel.in.includes(row.nivel)) return false;
          return true;
        });
        if (take) saida = saida.slice(0, take);
        return saida;
      },
      findFirst: async ({ where }: any) => linhas.find((row) => {
        if (where.id != null && row.id !== where.id) return false;
        if (where.companyId != null && row.companyId !== where.companyId) return false;
        if (where.motoristaUserId != null && row.motoristaUserId !== where.motoristaUserId) return false;
        if (where.origem != null && row.origem !== where.origem) return false;
        return true;
      }) ?? null,
      upsert: async ({ where, create }: any) => {
        const key = where.companyId_motoristaUserId_clientMessageId;
        const existing = linhas.find((row) => row.companyId === key.companyId &&
          row.motoristaUserId === key.motoristaUserId && row.clientMessageId === key.clientMessageId);
        if (existing) return existing;
        return prisma.logisticaRecado.create({ data: create });
      },
      updateMany: async ({ where, data }: any) => {
        let n = 0;
        for (const row of linhas) {
          if (where.companyId != null && row.companyId !== where.companyId) continue;
          if (where.motoristaUserId != null && row.motoristaUserId !== where.motoristaUserId) continue;
          if (where.id?.in && !where.id.in.includes(row.id)) continue;
          if (typeof where.id === 'string' && row.id !== where.id) continue;
          if (where.origem != null && row.origem !== where.origem) continue;
          if (where.entregueEm === null && row.entregueEm !== null) continue;
          if (where.entregueEm?.not === null && row.entregueEm === null) continue;
          if (where.vistoEm === null && row.vistoEm !== null) continue;
          if (where.ackEm === null && row.ackEm !== null) continue;
          if (where.nivel?.in && !where.nivel.in.includes(row.nivel)) continue;
          Object.assign(row, data);
          n++;
        }
        return { count: n };
      },
      groupBy: async ({ where }: any) => {
        const counts = new Map<number, number>();
        linhas.filter((row) => row.companyId === where.companyId && row.origem === where.origem && row.vistoEm === null)
          .forEach((row) => counts.set(row.motoristaUserId, (counts.get(row.motoristaUserId) || 0) + 1));
        return [...counts.entries()].map(([motoristaUserId, count]) => ({ motoristaUserId, _count: { _all: count } }));
      },
    },
    user: {
      findFirst: async ({ where }: any) => {
        const ok = (opts.motoristas ?? [7]).includes(where.id) && where.companyId === 1;
        // `role: ADMIN` = capacidade DRIVER pelo default de
        // `projectOperationalCapabilities` (sem userTeamPolicy no mock, a
        // projeção cai no papel). É a mesma régua de `listarEntregadores`.
        return ok ? { id: where.id, name: `Motorista ${where.id}`, companyId: 1, role: 'ADMIN', isSystemMaster: false } : null;
      },
    },
    entrega: {
      groupBy: async () => (opts.entregasPorDono ?? []).map((id) => ({ entregadorId: id })),
    },
    mobileDevice: { findMany: async () => [] },
    $transaction: async (input: any) => typeof input === 'function' ? input(prisma) : Promise.all(input),
  };

  return { service: new LogisticaRecadoService(prisma), linhas, criados };
}

test('enviar: recado individual nasce sem loteId e no estado "enviado"', async () => {
  const h = harness();
  const saida = await h.service.enviar(1, { id: 9, nome: 'Dono' }, { paraUserId: 7, texto: 'Passa na central', nivel: 'normal' });
  assert.equal(saida.length, 1);
  assert.equal(saida[0].loteId, null, 'recado de 1 pessoa não é lote');
  assert.equal(saida[0].estado, 'enviado');
  assert.equal(saida[0].origem, 'escritorio');
});

test('enviar: broadcast EXPLODE em uma linha por pessoa, com o mesmo loteId', async () => {
  const h = harness({ motoristas: [7, 8, 9], entregasPorDono: [7, 8, 9] });
  const saida = await h.service.enviar(1, { id: 9, nome: 'Dono' }, { texto: 'Todos na central às 18h' });
  assert.equal(saida.length, 3, 'uma linha por motorista na rua');
  const lotes = new Set(saida.map((r) => r.loteId));
  assert.equal(lotes.size, 1, 'mesmo disparo = mesmo loteId');
  assert.ok(saida[0].loteId, 'broadcast carimba lote');
});

test('enviar: broadcast sem ninguém na rua RECUSA em vez de mandar pro vazio', async () => {
  const h = harness({ entregasPorDono: [] });
  await assert.rejects(
    () => h.service.enviar(1, { id: 9, nome: 'Dono' }, { texto: 'oi' }),
    /Ninguém com entrega hoje/,
  );
});

test('enviar: texto vazio é recusado (recado em branco não é recado)', async () => {
  const h = harness();
  await assert.rejects(() => h.service.enviar(1, { id: 9, nome: 'Dono' }, { paraUserId: 7, texto: '   ' }), /Escreva o recado/);
});

test('multi-tenant: pessoa de OUTRA empresa nunca recebe recado', async () => {
  const h = harness();
  await assert.rejects(() => h.service.enviar(2, { id: 9, nome: 'Dono' }, { paraUserId: 7, texto: 'oi' }), /não encontrada/i);
});

test('nível inválido cai em normal — nunca inventa força que o app não sabe tratar', async () => {
  const h = harness();
  const [row] = await h.service.enviar(1, { id: 9, nome: 'Dono' }, { paraUserId: 7, texto: 'oi', nivel: 'PÂNICO' as any });
  assert.equal(row.nivel, 'normal');
});

test('puxar: não mente ✓✓; repete até o aparelho confirmar recebimento', async () => {
  const h = harness({
    linhas: [{ id: 'r1', companyId: 1, motoristaUserId: 7, origem: 'escritorio', autorNome: 'Dono', texto: 'oi', nivel: 'normal', loteId: null, createdAt: new Date(), entregueEm: null, vistoEm: null, ackEm: null }],
  });
  const primeira = await h.service.puxar(1, 7);
  assert.equal(primeira.length, 1);
  assert.equal(primeira[0].estado, 'enviado', 'resposta HTTP ainda pode cair no caminho');
  const segunda = await h.service.puxar(1, 7);
  assert.equal(segunda.length, 1, 'sem confirmação, o servidor tenta de novo');
  assert.equal(await h.service.marcarRecebidos(1, 7, ['r1']), 1);
  assert.equal((await h.service.puxar(1, 7)).length, 0, 'só a confirmação encerra a entrega');
});

test('PORTÃO: urgente entregue e sem "Entendi" TRAVA; normal nunca trava', async () => {
  const h = harness({
    linhas: [
      { id: 'r1', companyId: 1, motoristaUserId: 7, origem: 'escritorio', nivel: 'urgente', autorNome: 'D', texto: 'não entrega', loteId: null, createdAt: new Date(), entregueEm: new Date(), vistoEm: null, ackEm: null },
      { id: 'r2', companyId: 1, motoristaUserId: 7, origem: 'escritorio', nivel: 'normal', autorNome: 'D', texto: 'fyi', loteId: null, createdAt: new Date(), entregueEm: new Date(), vistoEm: null, ackEm: null },
    ],
  });
  const portao = await h.service.portao(1, 7);
  assert.equal(portao.length, 1, 'só o urgente cobra o clique');
  assert.equal(portao[0].id, 'r1');
});

test('PORTÃO: recado que ainda NÃO chegou no aparelho não pode travar a rua', async () => {
  const h = harness({
    linhas: [{ id: 'r1', companyId: 1, motoristaUserId: 7, origem: 'escritorio', nivel: 'urgente', autorNome: 'D', texto: 'x', loteId: null, createdAt: new Date(), entregueEm: null, vistoEm: null, ackEm: null }],
  });
  assert.equal((await h.service.portao(1, 7)).length, 0);
});

test('PORTÃO: o "Entendi" libera e não conta duas vezes', async () => {
  const h = harness({
    linhas: [{ id: 'r1', companyId: 1, motoristaUserId: 7, origem: 'escritorio', nivel: 'urgente', autorNome: 'D', texto: 'x', loteId: null, createdAt: new Date(), entregueEm: new Date(), vistoEm: null, ackEm: null }],
  });
  assert.equal(await h.service.confirmar(1, 7, 'r1'), true);
  assert.equal((await h.service.portao(1, 7)).length, 0, 'depois do Entendi o caminho abre');
  assert.equal(await h.service.confirmar(1, 7, 'r1'), false, 'segundo clique não reconta');
});

test('multi-tenant: "Entendi" de outra empresa não altera nada', async () => {
  const h = harness({
    linhas: [{ id: 'r1', companyId: 1, motoristaUserId: 7, origem: 'escritorio', nivel: 'urgente', autorNome: 'D', texto: 'x', loteId: null, createdAt: new Date(), entregueEm: new Date(), vistoEm: null, ackEm: null }],
  });
  assert.equal(await h.service.confirmar(2, 7, 'r1'), false);
  assert.equal(h.linhas[0].ackEm, null);
});

test('responder: a resposta nasce NÃO LIDA para acender o badge da central', async () => {
  const h = harness();
  const row = await h.service.responder(1, 7, 'Cliente não atende');
  assert.equal(row.origem, 'motorista');
  assert.equal(row.vistoEm, null);
  assert.deepEqual(await h.service.naoLidosPorMotorista(1), { 7: 1 });
});

test('responder: retry é idempotente e confirma o recado na mesma transação', async () => {
  const h = harness({
    linhas: [{ id: 'r1', companyId: 1, motoristaUserId: 7, origem: 'escritorio', nivel: 'alarme', autorNome: 'D', texto: 'Responda', loteId: null, createdAt: new Date(), entregueEm: new Date(), vistoEm: null, ackEm: null }],
  });
  const options = { clientMessageId: 'msg_teste_123', recadoId: 'r1' };
  const primeira = await h.service.responder(1, 7, 'Estou indo', undefined, options);
  const retry = await h.service.responder(1, 7, 'Estou indo', undefined, options);
  assert.equal(retry.id, primeira.id, 'retry devolve a mesma mensagem');
  assert.equal(h.linhas.filter((row) => row.origem === 'motorista').length, 1, 'não duplica balão');
  assert.ok(h.linhas[0].ackEm, 'resposta já destrava o recado original');
  assert.ok(h.linhas[0].vistoEm, 'responder também prova leitura');
});
