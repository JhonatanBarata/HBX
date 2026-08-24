import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NucleoCadastroService,
  enderecoDupKey,
  normalizeDupKey,
} from './nucleo-cadastro.service';

// W5 (10/07) — card de clientes do /entrega:
//   (1) normalização da detecção de duplicidade (pura, sem banco);
//   (2) GET /nucleo/clientes: pendências/dias/duplicata/débito/entregas (mock);
//   (3) DELETE bloqueado por dívida → 409 CLIENTE_COM_DEBITO (mock).

// ── (1) normalização de duplicidade (igualdade exata pós-normalização) ────────
test('W5 normalizeDupKey: lower + sem acento + espaços colapsados', () => {
  assert.equal(normalizeDupKey('  José   da  SILVA '), 'jose da silva');
  assert.equal(normalizeDupKey('PADARIA SÃO JOÃO'), normalizeDupKey('padaria sao joao'));
  assert.equal(normalizeDupKey('Açaí\tDo   Zé'), 'acai do ze');
});

test('W5 normalizeDupKey: vazio/null/só-espaço → null (não forma par)', () => {
  assert.equal(normalizeDupKey(''), null);
  assert.equal(normalizeDupKey('   '), null);
  assert.equal(normalizeDupKey(null), null);
  assert.equal(normalizeDupKey(undefined), null);
});

test('W5 enderecoDupKey: exige AMBOS endereco e numero não-vazios', () => {
  assert.equal(enderecoDupKey('Rua das Flores', '123'), 'rua das flores|123');
  assert.equal(enderecoDupKey('Rua das Flores', ''), null);
  assert.equal(enderecoDupKey('', '123'), null);
  assert.equal(enderecoDupKey(null, null), null);
  // mesma rua com acento/caixa diferente = mesmo par
  assert.equal(enderecoDupKey('RUA DAS  FLÔRES', ' 123 '), enderecoDupKey('rua das flores', '123'));
});

// ── mock de banco pro listClientes/softDeleteConta ────────────────────────────
type MockOpts = {
  pageRows: any[];
  universe?: any[]; // clientes ativos company-wide (detecção de duplicata)
  vinculos?: any[];
  entregasAgg?: any[];
  config?: any; // LogisticaConfig
  chargesPendentes?: any[]; // groupBy FinanceiroCharge pending
  entregasAguardando?: any[]; // groupBy Entrega aguardando_fechamento
  // MULTILOCAL (10/07) — locais ativos (principal primeiro) usados p/ endereco/numero/gps.
  // undefined → default espelha o endereço de cada pageRow (paridade com o backfill);
  // [] → nenhum local ativo (as 3 pendências acendem).
  principalLocais?: any[];
  // PONTE CADASTRO→AGENDA (26/07) — planos ativos (LogisticaPlanoEntrega); só
  // são a fonte de "dia"/diasEntrega quando config.agendaV2Ativa=true.
  planosAgenda?: any[];
};

function buildPrismaMock(opts: MockOpts) {
  const store = {
    deletionRecords: [] as any[],
    accountUpdates: [] as any[],
    customerCountArgs: [] as any[],
    customerFindManyArgs: [] as any[],
  };
  const prisma: any = {
    customerProfile: {
      count: async (args: any) => {
        store.customerCountArgs.push(args);
        return opts.pageRows.length;
      },
      findMany: async (args: any) => {
        store.customerFindManyArgs.push(args);
        // universo da duplicata (company-wide) tem where.status='active'; a página tem skip/take.
        if (args?.where?.status === 'active') return opts.universe ?? opts.pageRows;
        return opts.pageRows;
      },
      findFirst: async (args: any) =>
        opts.pageRows.find(
          (r) => r.id === args?.where?.id && (args?.where?.companyId == null || r.companyId === args.where.companyId),
        ) || null,
      update: async (args: any) => {
        store.accountUpdates.push(args);
        return { id: args.where.id };
      },
    },
    clienteProduto: { findMany: async () => opts.vinculos ?? [] },
    localEntrega: {
      // MULTILOCAL — default: 1 local principal ativo por cliente da página, ESPELHANDO
      // o endereço do perfil (paridade com o backfill) — mantém os testes legados estáveis.
      findMany: async (_args: any) =>
        opts.principalLocais !== undefined
          ? opts.principalLocais
          : opts.pageRows.map((r) => ({
              customerProfileId: r.id,
              endereco: r.endereco,
              numero: r.numero,
              lat: r.lat,
              lng: r.lng,
              isPrincipal: true,
              createdAt: new Date(),
            })),
    },
    entrega: {
      groupBy: async (args: any) =>
        args?.where?.cobrancaStatus === 'aguardando_fechamento'
          ? opts.entregasAguardando ?? []
          : opts.entregasAgg ?? [],
    },
    logisticaConfig: { findFirst: async () => opts.config ?? null },
    logisticaPlanoEntrega: { findMany: async () => opts.planosAgenda ?? [] },
    financeiroCharge: { groupBy: async () => opts.chargesPendentes ?? [] },
    deletionRecord: {
      create: async (args: any) => {
        store.deletionRecords.push(args.data);
        return args.data;
      },
    },
    $transaction: async (fn: any) => fn(prisma),
  };
  return { prisma, store };
}

const baseRow = (over: any = {}) => ({
  id: 'c1',
  companyId: 7,
  name: 'Dona Maria',
  cnpj: null,
  cidade: null,
  uf: null,
  isLead: false,
  isCliente: true,
  isFornecedor: false,
  origin: 'manual',
  status: 'active',
  endereco: 'Rua A',
  numero: '10',
  lat: -4,
  lng: -38,
  phone: '5588999990000',
  phoneNormalized: '5588999990000',
  _count: { contatos: 1 },
  ...over,
});

// ── (2) GET /nucleo/clientes — campos aditivos ────────────────────────────────
test('MOBILE lista só clientes e permite busca por telefone/endereço', async () => {
  const row = baseRow({ endereco: 'Rua das Flores', numero: '10' });
  const { prisma, store } = buildPrismaMock({ pageRows: [row], universe: [row] });

  const res = await new NucleoCadastroService(prisma).listClientes(7, { query: '(88) 99999-0000' });
  const pageArgs = store.customerFindManyArgs.find((args) => Number(args?.take) > 0);
  const filters = pageArgs?.where?.OR || [];

  assert.equal(pageArgs?.where?.companyId, 7);
  assert.equal(pageArgs?.where?.isCliente, true);
  assert.ok(filters.some((filter: any) => filter.phoneNormalized?.contains === '88999990000'));
  assert.ok(filters.some((filter: any) => filter.endereco?.contains === '(88) 99999-0000'));
  assert.equal(res.items[0].phone, '5588999990000');
  assert.equal(res.items[0].phoneNormalized, '5588999990000');
  assert.equal(res.items[0].endereco, 'Rua das Flores');
  assert.equal(res.items[0].numero, '10');
});

test('MOBILE busca alfanumérica não usa o fragmento numérico como telefone/documento', async () => {
  const row = baseRow();
  const { prisma, store } = buildPrismaMock({ pageRows: [row], universe: [row] });

  await new NucleoCadastroService(prisma).listClientes(7, { query: '123teste' });
  const pageArgs = store.customerFindManyArgs.find((args) => Number(args?.take) > 0);
  const filters = pageArgs?.where?.OR || [];

  assert.ok(filters.some((filter: any) => filter.name?.contains === '123teste'));
  assert.equal(filters.some((filter: any) => filter.phoneNormalized), false);
  assert.equal(filters.some((filter: any) => filter.document), false);
  assert.equal(filters.some((filter: any) => filter.cnpj), false);
});

test('W5 listClientes: pendências na ordem fixa endereco→numero→gps→dia→whatsapp', async () => {
  const row = baseRow({ endereco: '  ', numero: null, lat: null, phoneNormalized: null });
  const { prisma } = buildPrismaMock({ pageRows: [row], universe: [row], vinculos: [] });
  const service = new NucleoCadastroService(prisma);
  const res = await service.listClientes(7, {});
  assert.deepEqual(res.items[0].pendencias, ['endereco', 'numero', 'gps', 'dia', 'whatsapp']);
  assert.deepEqual(res.items[0].diasEntrega, []);
  assert.equal(res.items[0].entregasCount, 0);
});

test('W5 listClientes: telefone do contato principal limpa Tel e aparece no card', async () => {
  const row = baseRow({
    phone: null,
    phoneNormalized: null,
    contatos: [{ whatsapp: '19997024884', phone: '19997024884' }],
  });
  const { prisma } = buildPrismaMock({
    pageRows: [row],
    universe: [row],
    vinculos: [{ customerProfileId: 'c1', diasSemana: '3', frequenciaDias: null }],
  });
  const res = await new NucleoCadastroService(prisma).listClientes(7, {});
  assert.equal(res.items[0].phone, '19997024884');
  assert.ok(!res.items[0].pendencias.includes('whatsapp'));
});

// ── MULTILOCAL (10/07) — endereco/numero/gps olham o LOCAL PRINCIPAL ───────────
test('MULTILOCAL card: SEM local ativo → acende endereco+numero+gps (ignora o perfil)', async () => {
  // o PERFIL tem endereço/numero/gps completos, mas NÃO há local ativo → as 3 acendem.
  const row = baseRow();
  const { prisma } = buildPrismaMock({
    pageRows: [row],
    universe: [row],
    principalLocais: [], // nenhum local ativo
    planosAgenda: [{ customerProfileId: 'c1', diaSemana: 1 }], // limpa "dia" (fonte única)
  });
  const res = await new NucleoCadastroService(prisma).listClientes(7, {});
  assert.deepEqual(res.items[0].pendencias, ['endereco', 'numero', 'gps'], 'sem local → as 3, na ordem');
});

test('MULTILOCAL card: pendências olham o LOCAL principal, não o perfil', async () => {
  // PERFIL sem endereço/gps; LOCAL principal COM endereço/numero/gps → nada acende
  // (dia limpo por vínculo, whatsapp presente). Prova que a fonte virou o local.
  const row = baseRow({ endereco: null, numero: null, lat: null, lng: null });
  const { prisma } = buildPrismaMock({
    pageRows: [row],
    universe: [row],
    principalLocais: [
      { customerProfileId: 'c1', endereco: 'Rua Nova', numero: '99', lat: -3, lng: -39, isPrincipal: true, createdAt: new Date() },
    ],
    planosAgenda: [{ customerProfileId: 'c1', diaSemana: 1 }],
  });
  const res = await new NucleoCadastroService(prisma).listClientes(7, {});
  assert.deepEqual(res.items[0].pendencias, [], 'local completo → nenhuma das 3 acende');
});

test('MULTILOCAL card: local principal com endereço PARCIAL acende só o que falta', async () => {
  const row = baseRow();
  const { prisma } = buildPrismaMock({
    pageRows: [row],
    universe: [row],
    // tem endereco, falta numero e gps
    principalLocais: [
      { customerProfileId: 'c1', endereco: 'Rua Nova', numero: null, lat: null, lng: null, isPrincipal: true, createdAt: new Date() },
    ],
    planosAgenda: [{ customerProfileId: 'c1', diaSemana: 1 }],
  });
  const res = await new NucleoCadastroService(prisma).listClientes(7, {});
  assert.deepEqual(res.items[0].pendencias, ['numero', 'gps']);
});

// ── O DIA É DO CLIENTE (05/08) — plano de entrega é a fonte ÚNICA ─────────────
test('DIA: plano ativo limpa a pendência e une os dias, ordenado', async () => {
  const row = baseRow();
  const { prisma } = buildPrismaMock({
    pageRows: [row],
    universe: [row],
    planosAgenda: [
      { customerProfileId: 'c1', diaSemana: 5 },
      { customerProfileId: 'c1', diaSemana: 1 },
      { customerProfileId: 'c1', diaSemana: 3 },
    ],
    entregasAgg: [{ customerProfileId: 'c1', _count: { _all: 12 } }],
  });
  const service = new NucleoCadastroService(prisma);
  const res = await service.listClientes(7, {});
  assert.ok(!res.items[0].pendencias.includes('dia'));
  assert.deepEqual(res.items[0].diasEntrega, [1, 3, 5], 'união ISO ordenada asc');
  assert.equal(res.items[0].entregasCount, 12);
});

// 🔴 REGRESSÃO (05/08, cena do dono: filtrei SEG e a lista mostrou "Entrega
// SEX/QUI/SÁB"). O produto NÃO decide dia: dia só no vínculo de produto tem de
// acender a pendência, senão o filtro e a legenda leem tabelas diferentes e a
// tela mente. Sem flag nenhuma — não existe mais caminho legado.
//
// F2 (09/08) tornou isto ESTRUTURAL: `ClienteProduto` não guarda mais dia
// nenhum. A fixture continua alimentando `diasSemana` de propósito — é o
// tripwire: se alguém reabrir essa porta, o teste cai aqui.
test('DIA: produto NÃO decide dia — vínculo com diasSemana não limpa nada', async () => {
  const row = baseRow();
  const { prisma } = buildPrismaMock({
    pageRows: [row],
    universe: [row],
    vinculos: [{ customerProfileId: 'c1', diasSemana: '3', frequenciaDias: 7 }],
    planosAgenda: [],
  });
  const res = await new NucleoCadastroService(prisma).listClientes(7, {});
  assert.ok(res.items[0].pendencias.includes('dia'), 'sem plano = pendência honesta');
  assert.deepEqual(res.items[0].diasEntrega, [], 'dia do produto nunca vira dia do cliente');
});

test('AGENDA V2: plano ativo limpa "dia" e diasEntrega une os dias dos planos', async () => {
  const row = baseRow();
  const { prisma } = buildPrismaMock({
    pageRows: [row],
    universe: [row],
    config: { agendaV2Ativa: true },
    vinculos: [],
    planosAgenda: [
      { customerProfileId: 'c1', diaSemana: 6 },
      { customerProfileId: 'c1', diaSemana: 2 },
    ],
  });
  const res = await new NucleoCadastroService(prisma).listClientes(7, {});
  assert.ok(!res.items[0].pendencias.includes('dia'));
  assert.deepEqual(res.items[0].diasEntrega, [2, 6]);
});

// A flag `agendaV2Ativa` não decide mais nada aqui: com ou sem ela, o dia sai
// do PLANO. Este teste provava o caminho legado (vínculo mandando no dia) e
// morreu junto com ele em 05/08 — o substituto é o par de testes "DIA:" acima.
test('DIA: a flag agendaV2Ativa não muda mais a fonte — plano sempre vence', async () => {
  const row = baseRow();
  const { prisma } = buildPrismaMock({
    pageRows: [row],
    universe: [row],
    config: { agendaV2Ativa: false },
    vinculos: [{ customerProfileId: 'c1', diasSemana: '3', frequenciaDias: null }],
    planosAgenda: [{ customerProfileId: 'c1', diaSemana: 6 }],
  });
  const res = await new NucleoCadastroService(prisma).listClientes(7, {});
  assert.ok(!res.items[0].pendencias.includes('dia'));
  assert.deepEqual(res.items[0].diasEntrega, [6], 'o 3 do produto é ignorado; vale o 6 do plano');
});

test('W5 listClientes: duplicata por NOME normalizado marca os dois lados', async () => {
  const a = baseRow({ id: 'a', name: 'Padaria São João', endereco: null, numero: null });
  const b = baseRow({ id: 'b', name: '  padaria   sao joao ', endereco: null, numero: null });
  const { prisma } = buildPrismaMock({ pageRows: [a, b], universe: [a, b] });
  const service = new NucleoCadastroService(prisma);
  const res = await service.listClientes(7, {});
  assert.equal(res.items[0].duplicataDe?.id, 'b');
  assert.equal(res.items[1].duplicataDe?.id, 'a');
});

test('W5 listClientes: duplicata por endereco+numero (ambos não-vazios); nomes distintos', async () => {
  const a = baseRow({ id: 'a', name: 'Maria', endereco: 'Rua das Flores', numero: '123' });
  const b = baseRow({ id: 'b', name: 'Maria da Silva', endereco: 'RUA DAS FLÔRES', numero: ' 123 ' });
  const c = baseRow({ id: 'c', name: 'Outra', endereco: 'Rua das Flores', numero: null }); // sem numero → fora
  const { prisma } = buildPrismaMock({ pageRows: [a, b, c], universe: [a, b, c] });
  const service = new NucleoCadastroService(prisma);
  const res = await service.listClientes(7, {});
  assert.equal(res.items[0].duplicataDe?.id, 'b');
  assert.equal(res.items[1].duplicataDe?.id, 'a');
  assert.equal(res.items[2].duplicataDe, null, 'endereco sem numero não forma par');
});

// 24/08/2026 — o gate moduloFinanceiroAtivo MORREU (financeiro é sempre
// ligado): debitoAtual é SEMPRE presente, mesmo em linha antiga com false.
test('W5 listClientes: debitoAtual SEMPRE presente (o gate do módulo morreu)', async () => {
  const row = baseRow();
  // linha antiga com false gravado → campo presente mesmo assim (0 sem dívida)
  {
    const { prisma } = buildPrismaMock({ pageRows: [row], universe: [row], config: { moduloFinanceiroAtivo: false } });
    const res = await new NucleoCadastroService(prisma).listClientes(7, {});
    assert.ok('debitoAtual' in res.items[0], 'o campo sempre viaja');
    assert.equal(res.items[0].debitoAtual, 0);
  }
  // pending charges + entregas aguardando_fechamento somados
  {
    const { prisma } = buildPrismaMock({
      pageRows: [row],
      universe: [row],
      config: { moduloFinanceiroAtivo: true },
      chargesPendentes: [{ customerProfileId: 'c1', _sum: { amount: 30.5 } }],
      entregasAguardando: [{ customerProfileId: 'c1', _sum: { valor: 12 } }],
    });
    const res = await new NucleoCadastroService(prisma).listClientes(7, {});
    assert.equal(res.items[0].debitoAtual, 42.5, 'espelho da regra saldoAbertoPorClientes');
  }
});

// ── (3) DELETE bloqueado por dívida → 409 ─────────────────────────────────────
test('W5 softDeleteConta: cliente com débito → 409 CLIENTE_COM_DEBITO (mesmo sem módulo financeiro)', async () => {
  const row = baseRow();
  const { prisma, store } = buildPrismaMock({
    pageRows: [row],
    // débito SEMPRE conta no delete — nem passamos config (moduloFinanceiroAtivo off)
    chargesPendentes: [{ customerProfileId: 'c1', _sum: { amount: 55.9 } }],
  });
  const service = new NucleoCadastroService(prisma);
  await assert.rejects(
    () => service.softDeleteConta(7, 'c1', { deletedByUserId: 5 }),
    (err: any) => {
      assert.equal(err?.constructor?.name, 'ConflictException', 'HTTP 409');
      const body = err?.getResponse?.();
      assert.equal(body?.error, 'CLIENTE_COM_DEBITO');
      assert.equal(body?.saldo, 55.9);
      return true;
    },
  );
  assert.equal(store.deletionRecords.length, 0, 'nada deletado com dívida');
  assert.equal(store.accountUpdates.length, 0);
});

test('W5 softDeleteConta: sem débito → soft-delete segue normal', async () => {
  const row = baseRow();
  const { prisma, store } = buildPrismaMock({ pageRows: [row] });
  const service = new NucleoCadastroService(prisma);
  const res = await service.softDeleteConta(7, 'c1', { deletedByUserId: 5 });
  assert.equal(res?.id, 'c1');
  assert.equal(store.deletionRecords.length, 1);
  const upd = store.accountUpdates.find((u) => u.where.id === 'c1');
  assert.equal(upd.data.status, 'deleted');
});
