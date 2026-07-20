import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaLeituraService } from './logistica-leitura.service';

/**
 * PR20072026 W1 — testes de "Leitura de Rota" (docs/PLANEJAMENTOS/PR20072026/
 * SPEC-LEITURA-DE-ROTA.md + W1-BACKEND.md). Fake prisma multi-coleção com
 * `$transaction` clone-e-commit (mesmo padrão de logistica-rota-encerrar.service.test.ts):
 * a callback só grava de volta nos stores reais se resolver; se lançar, descarta
 * (rollback), então cada teste também prova atomicidade.
 */

type Row = Record<string, any>;

function matchesWhere(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('in' in cond) return (cond as any).in.includes(row[key]);
      if ('not' in cond) return row[key] !== (cond as any).not;
      if ('equals' in cond) {
        const c = cond as any;
        if (c.mode === 'insensitive') {
          return String(row[key] ?? '').toLowerCase() === String(c.equals ?? '').toLowerCase();
        }
        return row[key] === c.equals;
      }
      // Chave composta (ex.: sessaoId_clientKey: { sessaoId, clientKey }) — compara
      // cada sub-campo contra o próprio row (Prisma achata compound unique assim).
      return Object.entries(cond).every(([k, v]) => row[k] === v);
    }
    return row[key] === cond;
  });
}

function sortRows(rows: Row[], orderBy: Record<string, 'asc' | 'desc'> | undefined): Row[] {
  if (!orderBy) return rows;
  const [field, dir] = Object.entries(orderBy)[0];
  const sorted = [...rows].sort((a, b) => (a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0));
  return dir === 'desc' ? sorted.reverse() : sorted;
}

function projectRow(row: Row, select: Record<string, boolean> | undefined): Row {
  if (!select) return { ...row };
  const out: Row = {};
  for (const key of Object.keys(select)) if (select[key]) out[key] = row[key];
  return out;
}

function makeApi(store: Map<string, Row>, idPrefix: string, counters: Record<string, number>, name: string) {
  return {
    findFirst: async ({ where, select, orderBy }: any = {}) => {
      const rows = sortRows(Array.from(store.values()).filter((r) => matchesWhere(r, where)), orderBy);
      const row = rows[0];
      return row ? projectRow(row, select) : null;
    },
    findUnique: async ({ where, select }: any = {}) => {
      const row = Array.from(store.values()).find((r) => matchesWhere(r, where));
      return row ? projectRow(row, select) : null;
    },
    findMany: async ({ where, select, orderBy, take }: any = {}) => {
      let rows = sortRows(Array.from(store.values()).filter((r) => matchesWhere(r, where)), orderBy);
      if (typeof take === 'number') rows = rows.slice(0, take);
      return rows.map((r) => projectRow(r, select));
    },
    create: async ({ data, select }: any) => {
      const id = data.id || `${idPrefix}${++counters[name]}`;
      const now = new Date();
      const row: Row = { id, createdAt: now, updatedAt: now, ...data };
      store.set(id, row);
      return projectRow(row, select);
    },
    update: async ({ where, data, select }: any) => {
      const row = Array.from(store.values()).find((r) => matchesWhere(r, where));
      if (!row) throw Object.assign(new Error('Record to update not found.'), { code: 'P2025' });
      Object.assign(row, data, { updatedAt: new Date() });
      return projectRow(row, select);
    },
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      for (const row of store.values()) {
        if (!matchesWhere(row, where)) continue;
        Object.assign(row, data, { updatedAt: new Date() });
        count++;
      }
      return { count };
    },
    delete: async ({ where }: any) => {
      const row = Array.from(store.values()).find((r) => matchesWhere(r, where));
      if (row) store.delete(row.id);
      return row;
    },
  };
}

const COLLECTIONS = [
  ['logisticaLeituraSessao', 'sessao-'],
  ['logisticaLeituraParada', 'parada-'],
  ['customerProfile', 'cust-'],
  ['localEntrega', 'local-'],
  ['product', 'prod-'],
  ['clienteProduto', 'cp-'],
  ['logisticaRotaModelo', 'modelo-'],
] as const;

function buildHarness(seed: Partial<Record<(typeof COLLECTIONS)[number][0], Row[]>> = {}) {
  const stores: Record<string, Map<string, Row>> = {};
  const counters: Record<string, number> = {};
  for (const [name] of COLLECTIONS) {
    stores[name] = new Map((seed[name] ?? []).map((row) => [String(row.id), { ...row }]));
    counters[name] = 0;
  }

  function cloneAll(): Record<string, Map<string, Row>> {
    const clone: Record<string, Map<string, Row>> = {};
    for (const [name] of COLLECTIONS) {
      clone[name] = new Map(Array.from(stores[name].entries()).map(([id, row]) => [id, { ...row }]));
    }
    return clone;
  }

  function buildClient(target: Record<string, Map<string, Row>>) {
    const client: Row = {};
    for (const [name, prefix] of COLLECTIONS) client[name] = makeApi(target[name], prefix, counters, name);
    return client;
  }

  const prisma: Row = {
    ...buildClient(stores),
    $transaction: async (callback: (tx: any) => Promise<any>) => {
      const working = cloneAll();
      const tx = buildClient(working);
      const result = await callback(tx); // se lançar, propaga SEM commitar (rollback)
      for (const [name] of COLLECTIONS) {
        stores[name].clear();
        for (const [id, row] of working[name]) stores[name].set(id, row);
      }
      return result;
    },
  };

  return { prisma, stores };
}

function seedProduct(id: number, overrides: Row = {}): Row {
  return { id, companyId: 7, name: 'Galão 20L', unidade: 'galão 20L', usaLogistica: true, ...overrides };
}

const COMPANY = 7;
const USER = 42;

// ── 1. iniciar idempotente ───────────────────────────────────────────────────

test('iniciar: 2ª chamada retorna a MESMA sessão (idempotente), não cria outra', async () => {
  const { prisma, stores } = buildHarness();
  const svc = new LogisticaLeituraService(prisma as any);

  const first = await svc.iniciar(COMPANY, USER, 'LEITURA');
  const second = await svc.iniciar(COMPANY, USER, 'MANUAL');

  assert.equal(second.id, first.id);
  assert.equal(second.modo, 'LEITURA', 'modo divergente na 2ª chamada não muda a sessão já aberta');
  assert.equal(stores.logisticaLeituraSessao.size, 1);
});

test('atual: sem sessão ABERTA devolve null; com sessão devolve ela + paradas', async () => {
  const { prisma } = buildHarness();
  const svc = new LogisticaLeituraService(prisma as any);
  assert.equal(await svc.atual(COMPANY, USER), null);

  const sessao = await svc.iniciar(COMPANY, USER, 'MANUAL');
  const atual = await svc.atual(COMPANY, USER);
  assert.equal(atual!.id, sessao.id);
  assert.deepEqual(atual!.paradas, []);
});

// ── 2/3. parada idempotente + cliente novo transacional ─────────────────────

test('parada: cliente novo cria CustomerProfile + LocalEntrega (telefone/geoFonte gravados); replay do MESMO clientKey não duplica', async () => {
  const { prisma, stores } = buildHarness({ product: [seedProduct(1)] });
  const svc = new LogisticaLeituraService(prisma as any);
  const sessao = await svc.iniciar(COMPANY, USER, 'LEITURA');

  const payload = {
    clientKey: 'stop-1',
    capturadoEm: '2026-07-20T11:30:00-03:00',
    lat: -22.9,
    lng: -47.06,
    accuracy: 12,
    clienteNovo: { nome: 'Josefina', telefone: '(19) 99999-0001' },
    itens: [{ productId: 1, qtd: 2, valorUnit: 7 }],
    telefoneConfirmado: true,
  };

  const primeira = await svc.registrarParada(COMPANY, USER, sessao.id, payload as any);
  assert.ok(primeira.customerProfileId, 'customerProfileId resolvido na resposta');
  assert.equal(stores.customerProfile.size, 1);
  assert.equal(stores.localEntrega.size, 1);
  assert.equal(stores.logisticaLeituraParada.size, 1);

  const cliente = stores.customerProfile.get(primeira.customerProfileId!)!;
  assert.equal(cliente.name, 'Josefina');
  assert.equal(cliente.phone, '19999990001');
  assert.equal(cliente.isCliente, true);
  assert.equal(cliente.geoFonte, 'gps_cadastro');
  assert.equal(cliente.lat, -22.9);
  assert.equal(cliente.lng, -47.06);

  const local = Array.from(stores.localEntrega.values())[0];
  assert.equal(local.customerProfileId, primeira.customerProfileId);
  assert.equal(local.lat, -22.9);

  // Replay do MESMO clientKey (fila offline reenviando) — NÃO duplica nada.
  const replay = await svc.registrarParada(COMPANY, USER, sessao.id, payload as any);
  assert.equal(replay.id, primeira.id);
  assert.equal(stores.customerProfile.size, 1, 'replay não cria 2º cliente');
  assert.equal(stores.logisticaLeituraParada.size, 1, 'replay não duplica a parada');
});

test('parada: cliente EXISTENTE (customerProfileId) não cria CustomerProfile novo', async () => {
  const { prisma, stores } = buildHarness({
    product: [seedProduct(1)],
    customerProfile: [{ id: 'cust-existing', companyId: COMPANY, name: 'José', isCliente: true }],
  });
  const svc = new LogisticaLeituraService(prisma as any);
  const sessao = await svc.iniciar(COMPANY, USER, 'LEITURA');

  const parada = await svc.registrarParada(COMPANY, USER, sessao.id, {
    clientKey: 'stop-1',
    capturadoEm: '2026-07-20T11:40:00-03:00',
    customerProfileId: 'cust-existing',
    itens: [{ productId: 1, qtd: 1, valorUnit: 10 }],
  } as any);

  assert.equal(parada.customerProfileId, 'cust-existing');
  assert.equal(stores.customerProfile.size, 1);
});

test('parada: customerProfileId de OUTRA empresa → 400', async () => {
  const { prisma } = buildHarness({
    product: [seedProduct(1)],
    customerProfile: [{ id: 'cust-x', companyId: 999, name: 'Fulano', isCliente: true }],
  });
  const svc = new LogisticaLeituraService(prisma as any);
  const sessao = await svc.iniciar(COMPANY, USER, 'LEITURA');

  await assert.rejects(
    () =>
      svc.registrarParada(COMPANY, USER, sessao.id, {
        clientKey: 'stop-1',
        capturadoEm: '2026-07-20T11:40:00-03:00',
        customerProfileId: 'cust-x',
        itens: [{ productId: 1, qtd: 1, valorUnit: 10 }],
      } as any),
    /Cliente não encontrado/,
  );
});

// ── 4. atualizarPrecoAcordado ────────────────────────────────────────────────

test('parada: atualizarPrecoAcordado faz UPSERT do ClienteProduto (cria, depois atualiza sem duplicar)', async () => {
  const { prisma, stores } = buildHarness({
    product: [seedProduct(1)],
    customerProfile: [{ id: 'cust-1', companyId: COMPANY, name: 'José', isCliente: true }],
  });
  const svc = new LogisticaLeituraService(prisma as any);
  const sessao = await svc.iniciar(COMPANY, USER, 'LEITURA');

  await svc.registrarParada(COMPANY, USER, sessao.id, {
    clientKey: 'stop-1',
    capturadoEm: '2026-07-20T08:00:00-03:00',
    customerProfileId: 'cust-1',
    itens: [{ productId: 1, qtd: 2, valorUnit: 8 }],
    atualizarPrecoAcordado: true,
  } as any);

  assert.equal(stores.clienteProduto.size, 1);
  let cp = Array.from(stores.clienteProduto.values())[0];
  assert.equal(cp.precoAcordado, 8);

  // 2ª parada do MESMO cliente/produto com valor diferente — UPDATE, não cria outro.
  await svc.registrarParada(COMPANY, USER, sessao.id, {
    clientKey: 'stop-2',
    capturadoEm: '2026-07-20T08:10:00-03:00',
    customerProfileId: 'cust-1',
    itens: [{ productId: 1, qtd: 3, valorUnit: 9 }],
    atualizarPrecoAcordado: true,
  } as any);

  assert.equal(stores.clienteProduto.size, 1, 'não duplica o vínculo cliente×produto');
  cp = Array.from(stores.clienteProduto.values())[0];
  assert.equal(cp.precoAcordado, 9);
});

// ── PR20072026-ROTA-SALVA F2a — ponte Leitura → cadastro (ClienteProduto SEM dia) ─
// A partir de agora o vínculo é garantido SEMPRE (não só quando
// atualizarPrecoAcordado) — produto digitado com preço normal não morre mais
// junto com a sessão de leitura.

test('parada: SEM atualizarPrecoAcordado (produto com preço normal) AINDA cria o vínculo ClienteProduto sem dia', async () => {
  const { prisma, stores } = buildHarness({
    product: [seedProduct(1)],
    customerProfile: [{ id: 'cust-1', companyId: COMPANY, name: 'José', isCliente: true }],
  });
  const svc = new LogisticaLeituraService(prisma as any);
  const sessao = await svc.iniciar(COMPANY, USER, 'LEITURA');

  await svc.registrarParada(COMPANY, USER, sessao.id, {
    clientKey: 'stop-1',
    capturadoEm: '2026-07-20T08:00:00-03:00',
    customerProfileId: 'cust-1',
    itens: [{ productId: 1, qtd: 2, valorUnit: 7 }],
    // atualizarPrecoAcordado OMITIDO de propósito — é exatamente o cenário que
    // antes "morria com a sessão".
  } as any);

  assert.equal(stores.clienteProduto.size, 1, 'vínculo criado mesmo sem atualizarPrecoAcordado');
  const cp = Array.from(stores.clienteProduto.values())[0];
  assert.equal(cp.customerProfileId, 'cust-1');
  assert.equal(cp.productId, 1);
  assert.equal(cp.qtdPadrao, 2);
  assert.equal(cp.precoAcordado, 7);
  assert.equal(cp.diasSemana, null, 'nasce SEM dia — invisível pro gerar-dia/recorrência');
  assert.equal(cp.frequenciaDias, null);
  assert.equal(cp.proximaData, null);
});

test('parada: vínculo EXISTENTE com dia (recorrência já configurada) — leitura NÃO apaga o dia, só atualiza preço', async () => {
  const { prisma, stores } = buildHarness({
    product: [seedProduct(1)],
    customerProfile: [{ id: 'cust-1', companyId: COMPANY, name: 'José', isCliente: true }],
    clienteProduto: [
      {
        id: 'cp-existente',
        companyId: COMPANY,
        customerProfileId: 'cust-1',
        productId: 1,
        qtdPadrao: 1,
        precoAcordado: 5,
        diasSemana: '1,3,5',
        frequenciaDias: null,
        proximaData: new Date('2026-07-21T00:00:00-03:00'),
        ativo: true,
      },
    ],
  });
  const svc = new LogisticaLeituraService(prisma as any);
  const sessao = await svc.iniciar(COMPANY, USER, 'LEITURA');

  await svc.registrarParada(COMPANY, USER, sessao.id, {
    clientKey: 'stop-1',
    capturadoEm: '2026-07-20T08:00:00-03:00',
    customerProfileId: 'cust-1',
    itens: [{ productId: 1, qtd: 3, valorUnit: 9 }],
  } as any);

  assert.equal(stores.clienteProduto.size, 1, 'reusa o vínculo existente, não duplica');
  const cp = stores.clienteProduto.get('cp-existente')!;
  assert.equal(cp.precoAcordado, 9, 'preço atualizado');
  assert.equal(cp.diasSemana, '1,3,5', 'dia da recorrência PRESERVADO — leitura não apaga');
  assert.deepEqual(cp.proximaData, new Date('2026-07-21T00:00:00-03:00'), 'proximaData preservada');
});

test('PATCH parada: também garante o vínculo sem dia de cada item (mesma ponte do registrarParada)', async () => {
  const { prisma, stores } = buildHarness({
    product: [seedProduct(1), seedProduct(2, { name: 'Galão 10L' })],
    customerProfile: [{ id: 'cust-1', companyId: COMPANY, name: 'José', isCliente: true }],
  });
  const svc = new LogisticaLeituraService(prisma as any);
  const sessao = await svc.iniciar(COMPANY, USER, 'LEITURA');
  const parada = await svc.registrarParada(COMPANY, USER, sessao.id, {
    clientKey: 'stop-1',
    capturadoEm: '2026-07-20T08:00:00-03:00',
    customerProfileId: 'cust-1',
    itens: [{ productId: 1, qtd: 1, valorUnit: 10 }],
  } as any);
  assert.equal(stores.clienteProduto.size, 1);

  await svc.updateParada(COMPANY, USER, sessao.id, parada.id, {
    itens: [{ productId: 2, qtd: 1, valorUnit: 12 }],
  } as any);

  assert.equal(stores.clienteProduto.size, 2, 'PATCH garante vínculo do NOVO produto também');
  const novo = Array.from(stores.clienteProduto.values()).find((r: any) => r.productId === 2)!;
  assert.equal(novo.precoAcordado, 12);
  assert.equal(novo.diasSemana, null);
});

// ── PATCH/DELETE parada ──────────────────────────────────────────────────────

test('PATCH parada: edita itens (qtd/valor); DELETE parada: remove', async () => {
  const { prisma, stores } = buildHarness({
    product: [seedProduct(1)],
    customerProfile: [{ id: 'cust-1', companyId: COMPANY, name: 'José', isCliente: true }],
  });
  const svc = new LogisticaLeituraService(prisma as any);
  const sessao = await svc.iniciar(COMPANY, USER, 'LEITURA');
  const parada = await svc.registrarParada(COMPANY, USER, sessao.id, {
    clientKey: 'stop-1',
    capturadoEm: '2026-07-20T08:00:00-03:00',
    customerProfileId: 'cust-1',
    itens: [{ productId: 1, qtd: 1, valorUnit: 10 }],
  } as any);

  const editada = await svc.updateParada(COMPANY, USER, sessao.id, parada.id, {
    itens: [{ productId: 1, qtd: 3, valorUnit: 12 }],
  } as any);
  assert.equal(editada.itens[0].qtd, 3);
  assert.equal(editada.itens[0].valorUnit, 12);

  await svc.removeParada(COMPANY, USER, sessao.id, parada.id);
  assert.equal(stores.logisticaLeituraParada.size, 0);
});

// ── 5. finalizar preserva ordem + horaRef; sessão vazia → 400 ────────────────

test('finalizar: sessão SEM paradas → 400 "Nenhuma parada registrada."', async () => {
  const { prisma } = buildHarness();
  const svc = new LogisticaLeituraService(prisma as any);
  const sessao = await svc.iniciar(COMPANY, USER, 'LEITURA');
  await assert.rejects(
    () => svc.finalizar(COMPANY, USER, sessao.id, { diaSemana: 1 } as any),
    /Nenhuma parada registrada/,
  );
});

test('finalizar: cria LogisticaRotaModelo preservando ORDEM de captura + horaRef; marca sessão FINALIZADA', async () => {
  const { prisma, stores } = buildHarness({
    product: [seedProduct(1)],
    customerProfile: [
      { id: 'cust-1', companyId: COMPANY, name: 'Josefina', isCliente: true },
      { id: 'cust-2', companyId: COMPANY, name: 'José', isCliente: true },
    ],
  });
  const svc = new LogisticaLeituraService(prisma as any);
  const sessao = await svc.iniciar(COMPANY, USER, 'LEITURA');

  await svc.registrarParada(COMPANY, USER, sessao.id, {
    clientKey: 'a',
    capturadoEm: '2026-07-20T08:30:00-03:00',
    customerProfileId: 'cust-1',
    itens: [{ productId: 1, qtd: 2, valorUnit: 7 }],
  } as any);
  await svc.registrarParada(COMPANY, USER, sessao.id, {
    clientKey: 'b',
    capturadoEm: '2026-07-20T08:40:00-03:00',
    customerProfileId: 'cust-2',
    itens: [{ productId: 1, qtd: 1, valorUnit: 10 }],
  } as any);

  const res = await svc.finalizar(COMPANY, USER, sessao.id, { nome: 'Rota Centro', diaSemana: 1 } as any);
  assert.equal(res.nome, 'Rota Centro');
  assert.ok(res.modeloId);

  const modelo = stores.logisticaRotaModelo.get(res.modeloId)!;
  assert.equal(modelo.diaSemana, 1);
  assert.deepEqual(
    modelo.paradasJson.map((p: any) => p.customerProfileId),
    ['cust-1', 'cust-2'],
    'ordem de captura preservada',
  );
  assert.equal(modelo.paradasJson[0].horaRef, '08:30');
  assert.equal(modelo.paradasJson[1].horaRef, '08:40');

  const sessaoFinal = stores.logisticaLeituraSessao.get(sessao.id)!;
  assert.equal(sessaoFinal.status, 'FINALIZADA');
  assert.ok(sessaoFinal.finishedAt);
});

test('finalizar: nome vazio usa default = label do dia da semana', async () => {
  const { prisma, stores } = buildHarness({
    product: [seedProduct(1)],
    customerProfile: [{ id: 'cust-1', companyId: COMPANY, name: 'Josefina', isCliente: true }],
  });
  const svc = new LogisticaLeituraService(prisma as any);
  const sessao = await svc.iniciar(COMPANY, USER, 'LEITURA');
  await svc.registrarParada(COMPANY, USER, sessao.id, {
    clientKey: 'a',
    capturadoEm: '2026-07-20T08:30:00-03:00',
    customerProfileId: 'cust-1',
    itens: [{ productId: 1, qtd: 1, valorUnit: 5 }],
  } as any);

  const res = await svc.finalizar(COMPANY, USER, sessao.id, { diaSemana: 6 } as any);
  assert.equal(res.nome, 'Sábado');
});

// ── PR20072026-ROTA-SALVA F1 — "rota salva sem dia": diaSemana vira opcional ─

test('finalizar: SEM diaSemana (ausente) → modelo com diaSemana null e nome default "Rota dd/mm"', async () => {
  const { prisma, stores } = buildHarness({
    product: [seedProduct(1)],
    customerProfile: [{ id: 'cust-1', companyId: COMPANY, name: 'Josefina', isCliente: true }],
  });
  const svc = new LogisticaLeituraService(prisma as any);
  const sessao = await svc.iniciar(COMPANY, USER, 'LEITURA');
  await svc.registrarParada(COMPANY, USER, sessao.id, {
    clientKey: 'a',
    capturadoEm: '2026-07-20T08:30:00-03:00',
    customerProfileId: 'cust-1',
    itens: [{ productId: 1, qtd: 1, valorUnit: 5 }],
  } as any);

  // Nenhum diaSemana no body (o app novo não manda mais o passo "dia").
  const res = await svc.finalizar(COMPANY, USER, sessao.id, {} as any);
  assert.match(res.nome, /^Rota \d{2}\/\d{2}$/, 'nome default "Rota dd/mm" quando não há dia');
  const modelo = stores.logisticaRotaModelo.get(res.modeloId)!;
  assert.equal(modelo.diaSemana, null);
});

test('finalizar: diaSemana explicitamente null (compat) → mesmo comportamento de ausente', async () => {
  const { prisma, stores } = buildHarness({
    product: [seedProduct(1)],
    customerProfile: [{ id: 'cust-1', companyId: COMPANY, name: 'Josefina', isCliente: true }],
  });
  const svc = new LogisticaLeituraService(prisma as any);
  const sessao = await svc.iniciar(COMPANY, USER, 'LEITURA');
  await svc.registrarParada(COMPANY, USER, sessao.id, {
    clientKey: 'a',
    capturadoEm: '2026-07-20T08:30:00-03:00',
    customerProfileId: 'cust-1',
    itens: [{ productId: 1, qtd: 1, valorUnit: 5 }],
  } as any);

  const res = await svc.finalizar(COMPANY, USER, sessao.id, { diaSemana: null, nome: 'Minha lista' } as any);
  assert.equal(res.nome, 'Minha lista');
  const modelo = stores.logisticaRotaModelo.get(res.modeloId)!;
  assert.equal(modelo.diaSemana, null);
});

test('finalizar: diaSemana fora de 1..7 (quando informado) continua rejeitando 400', async () => {
  const { prisma } = buildHarness({
    product: [seedProduct(1)],
    customerProfile: [{ id: 'cust-1', companyId: COMPANY, name: 'Josefina', isCliente: true }],
  });
  const svc = new LogisticaLeituraService(prisma as any);
  const sessao = await svc.iniciar(COMPANY, USER, 'LEITURA');
  await svc.registrarParada(COMPANY, USER, sessao.id, {
    clientKey: 'a',
    capturadoEm: '2026-07-20T08:30:00-03:00',
    customerProfileId: 'cust-1',
    itens: [{ productId: 1, qtd: 1, valorUnit: 5 }],
  } as any);

  await assert.rejects(
    () => svc.finalizar(COMPANY, USER, sessao.id, { diaSemana: 8 } as any),
    /1 \(segunda\) a 7/,
  );
});

test('finalizar: APK velho continua mandando diaSemana 1..7 → compat intacta (nome = label do dia)', async () => {
  const { prisma, stores } = buildHarness({
    product: [seedProduct(1)],
    customerProfile: [{ id: 'cust-1', companyId: COMPANY, name: 'Josefina', isCliente: true }],
  });
  const svc = new LogisticaLeituraService(prisma as any);
  const sessao = await svc.iniciar(COMPANY, USER, 'LEITURA');
  await svc.registrarParada(COMPANY, USER, sessao.id, {
    clientKey: 'a',
    capturadoEm: '2026-07-20T08:30:00-03:00',
    customerProfileId: 'cust-1',
    itens: [{ productId: 1, qtd: 1, valorUnit: 5 }],
  } as any);

  const res = await svc.finalizar(COMPANY, USER, sessao.id, { diaSemana: 2 } as any);
  assert.equal(res.nome, 'Terça-feira');
  const modelo = stores.logisticaRotaModelo.get(res.modeloId)!;
  assert.equal(modelo.diaSemana, 2);
});

test('finalizar: ordemParadaIds (modo MANUAL) reordena; id estranho ao final → 400', async () => {
  const { prisma, stores } = buildHarness({
    product: [seedProduct(1)],
    customerProfile: [
      { id: 'cust-1', companyId: COMPANY, name: 'A', isCliente: true },
      { id: 'cust-2', companyId: COMPANY, name: 'B', isCliente: true },
      { id: 'cust-3', companyId: COMPANY, name: 'C', isCliente: true },
    ],
  });
  const svc = new LogisticaLeituraService(prisma as any);
  const sessao = await svc.iniciar(COMPANY, USER, 'MANUAL');
  const p1 = await svc.registrarParada(COMPANY, USER, sessao.id, {
    clientKey: 'a',
    capturadoEm: '2026-07-20T08:00:00-03:00',
    customerProfileId: 'cust-1',
    itens: [{ productId: 1, qtd: 1, valorUnit: 5 }],
  } as any);
  const p2 = await svc.registrarParada(COMPANY, USER, sessao.id, {
    clientKey: 'b',
    capturadoEm: '2026-07-20T08:10:00-03:00',
    customerProfileId: 'cust-2',
    itens: [{ productId: 1, qtd: 1, valorUnit: 5 }],
  } as any);
  const p3 = await svc.registrarParada(COMPANY, USER, sessao.id, {
    clientKey: 'c',
    capturadoEm: '2026-07-20T08:20:00-03:00',
    customerProfileId: 'cust-3',
    itens: [{ productId: 1, qtd: 1, valorUnit: 5 }],
  } as any);

  // id estranho → 400 (transação inteira descartada, nada commitado).
  await assert.rejects(
    () => svc.finalizar(COMPANY, USER, sessao.id, { diaSemana: 2, ordemParadaIds: [p2.id, 'nao-existe'] } as any),
    /ordemParadaIds contém id inválido/,
  );
  assert.equal(stores.logisticaRotaModelo.size, 0, 'rollback: nada foi criado');

  const res = await svc.finalizar(COMPANY, USER, sessao.id, {
    diaSemana: 2,
    ordemParadaIds: [p3.id, p1.id], // p2 ausente da lista → vai pro fim mantendo ordem relativa
  } as any);
  const modelo = stores.logisticaRotaModelo.get(res.modeloId)!;
  assert.deepEqual(
    modelo.paradasJson.map((p: any) => p.customerProfileId),
    ['cust-3', 'cust-1', 'cust-2'],
  );
});

test('finalizar: parada sem customerProfileId (cliente deletado) é pulada com aviso', async () => {
  const { prisma, stores } = buildHarness({
    product: [seedProduct(1)],
    customerProfile: [{ id: 'cust-1', companyId: COMPANY, name: 'A', isCliente: true }],
  });
  const svc = new LogisticaLeituraService(prisma as any);
  const sessao = await svc.iniciar(COMPANY, USER, 'LEITURA');
  await svc.registrarParada(COMPANY, USER, sessao.id, {
    clientKey: 'a',
    capturadoEm: '2026-07-20T08:00:00-03:00',
    customerProfileId: 'cust-1',
    itens: [{ productId: 1, qtd: 1, valorUnit: 5 }],
  } as any);
  // Simula cliente removido no meio da captura: zera o vínculo direto no store.
  const paradaRow = Array.from(stores.logisticaLeituraParada.values())[0];
  paradaRow.customerProfileId = null;

  const res = await svc.finalizar(COMPANY, USER, sessao.id, { diaSemana: 3 } as any);
  assert.ok(res.avisos && res.avisos.length === 1);
  const modelo = stores.logisticaRotaModelo.get(res.modeloId)!;
  assert.deepEqual(modelo.paradasJson, []);
});

// ── 6. nome duplicado (case-insensitive) no finalizar → 409 ROTA_NOME_DUPLICADO ─

test('finalizar: nome duplicado (case-insensitive) na empresa → 409 ROTA_NOME_DUPLICADO', async () => {
  const { prisma, stores } = buildHarness({
    product: [seedProduct(1)],
    customerProfile: [{ id: 'cust-1', companyId: COMPANY, name: 'A', isCliente: true }],
    logisticaRotaModelo: [{ id: 'modelo-existente', companyId: COMPANY, nome: 'Rota Centro', diaSemana: 1, paradasJson: [] }],
  });
  const svc = new LogisticaLeituraService(prisma as any);
  const sessao = await svc.iniciar(COMPANY, USER, 'LEITURA');
  await svc.registrarParada(COMPANY, USER, sessao.id, {
    clientKey: 'a',
    capturadoEm: '2026-07-20T08:00:00-03:00',
    customerProfileId: 'cust-1',
    itens: [{ productId: 1, qtd: 1, valorUnit: 5 }],
  } as any);

  await assert.rejects(
    () => svc.finalizar(COMPANY, USER, sessao.id, { nome: '  rota centro  ', diaSemana: 1 } as any),
    (err: any) => {
      assert.equal(err.status, 409);
      assert.equal(err.getResponse().code, 'ROTA_NOME_DUPLICADO');
      return true;
    },
  );
  // Rollback: sessão continua ABERTA, nenhum 2º modelo foi criado.
  assert.equal(stores.logisticaRotaModelo.size, 1);
  assert.equal(stores.logisticaLeituraSessao.get(sessao.id)!.status, 'ABERTA');
});

// ── cancelar ─────────────────────────────────────────────────────────────────

test('cancelar: marca CANCELADA; sessão cancelada não aceita mais parada nem finalizar', async () => {
  const { prisma, stores } = buildHarness();
  const svc = new LogisticaLeituraService(prisma as any);
  const sessao = await svc.iniciar(COMPANY, USER, 'LEITURA');
  await svc.cancelar(COMPANY, USER, sessao.id);
  assert.equal(stores.logisticaLeituraSessao.get(sessao.id)!.status, 'CANCELADA');

  await assert.rejects(
    () =>
      svc.registrarParada(COMPANY, USER, sessao.id, {
        clientKey: 'x',
        capturadoEm: '2026-07-20T08:00:00-03:00',
        customerProfileId: 'cust-1',
        itens: [{ productId: 1, qtd: 1, valorUnit: 5 }],
      } as any),
    /não encontrada/,
  );
});

test('cancelar: sessão inexistente/já fechada → 404', async () => {
  const { prisma } = buildHarness();
  const svc = new LogisticaLeituraService(prisma as any);
  await assert.rejects(() => svc.cancelar(COMPANY, USER, 'sessao-fantasma'), /não encontrada/);
});

// ── 7. multi-tenant: sessão de OUTRA company → not found ────────────────────

test('multi-tenant: sessão de OUTRA empresa → not found em resumo/parada/finalizar/cancelar', async () => {
  const { prisma } = buildHarness();
  const svc = new LogisticaLeituraService(prisma as any);
  const sessao = await svc.iniciar(COMPANY, USER, 'LEITURA');

  await assert.rejects(() => svc.resumo(999, USER, sessao.id), /não encontrada/);
  await assert.rejects(
    () =>
      svc.registrarParada(999, USER, sessao.id, {
        clientKey: 'x',
        capturadoEm: '2026-07-20T08:00:00-03:00',
        customerProfileId: 'cust-1',
        itens: [{ productId: 1, qtd: 1, valorUnit: 5 }],
      } as any),
    /não encontrada/,
  );
  await assert.rejects(() => svc.finalizar(999, USER, sessao.id, { diaSemana: 1 } as any), /não encontrada/);
  await assert.rejects(() => svc.cancelar(999, USER, sessao.id), /não encontrada/);
});

test('multi-tenant: sessão de OUTRO usuário na MESMA empresa → not found (escopo por usuário)', async () => {
  const { prisma } = buildHarness();
  const svc = new LogisticaLeituraService(prisma as any);
  const sessao = await svc.iniciar(COMPANY, USER, 'LEITURA');
  await assert.rejects(() => svc.resumo(COMPANY, USER + 1, sessao.id), /não encontrada/);
});

// ── resumo ───────────────────────────────────────────────────────────────────

test('resumo: timeline com hora/cliente/subtotal/total no formato do contrato', async () => {
  const { prisma } = buildHarness({
    product: [seedProduct(1)],
    customerProfile: [
      { id: 'cust-1', companyId: COMPANY, name: 'Josefina', isCliente: true },
      { id: 'cust-2', companyId: COMPANY, name: 'José', isCliente: true },
    ],
  });
  const svc = new LogisticaLeituraService(prisma as any);
  const sessao = await svc.iniciar(COMPANY, USER, 'LEITURA');
  await svc.registrarParada(COMPANY, USER, sessao.id, {
    clientKey: 'a',
    capturadoEm: '2026-07-20T08:30:00-03:00',
    customerProfileId: 'cust-1',
    itens: [{ productId: 1, qtd: 2, valorUnit: 7 }],
  } as any);
  await svc.registrarParada(COMPANY, USER, sessao.id, {
    clientKey: 'b',
    capturadoEm: '2026-07-20T08:40:00-03:00',
    customerProfileId: 'cust-2',
    itens: [{ productId: 1, qtd: 1, valorUnit: 10 }],
  } as any);

  const resumo = await svc.resumo(COMPANY, USER, sessao.id);
  assert.equal(resumo.count, 2);
  assert.equal(resumo.total, 24);
  assert.equal(resumo.paradas[0].hora, '08:30');
  assert.equal(resumo.paradas[0].clienteNome, 'Josefina');
  assert.equal(resumo.paradas[0].subtotal, 14);
  assert.equal(resumo.paradas[1].subtotal, 10);
});

test('parada: item com produto de OUTRA empresa → 400', async () => {
  const { prisma } = buildHarness({
    product: [seedProduct(1, { companyId: 999 })],
    customerProfile: [{ id: 'cust-1', companyId: COMPANY, name: 'A', isCliente: true }],
  });
  const svc = new LogisticaLeituraService(prisma as any);
  const sessao = await svc.iniciar(COMPANY, USER, 'LEITURA');
  await assert.rejects(
    () =>
      svc.registrarParada(COMPANY, USER, sessao.id, {
        clientKey: 'a',
        capturadoEm: '2026-07-20T08:00:00-03:00',
        customerProfileId: 'cust-1',
        itens: [{ productId: 1, qtd: 1, valorUnit: 5 }],
      } as any),
    /não encontrado nesta empresa/,
  );
});
