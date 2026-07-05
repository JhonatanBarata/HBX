import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LogisticaRecorrenciaService,
  dueOnDay,
  nextProximaData,
  resolveValorUnit,
  parseDiasSemana,
  isoDow,
} from './logistica-recorrencia.service';

// LOGÍSTICA-MOBILE M2 — prova o CORE do gerador de entregas:
//   1) lógica pura de recorrência (dueOnDay / nextProximaData / valor);
//   2) IDEMPOTÊNCIA do gerarDia: 2 chamadas no mesmo dia = 1 entrega por cliente;
//   3) frequência 7d avança proximaData corretamente (+7 dias).

// ── mock mínimo do Prisma p/ gerarDia ────────────────────────────────────────
// Simula a persistência: entregas ficam num array; o findFirst de idempotência
// enxerga o que já foi criado NAQUELE dia (mesmo comportamento do índice real).
function buildPrismaMock(vinculos: any[]) {
  const entregas: any[] = [];
  const cpUpdates: any[] = [];
  const itensCriados: any[] = [];
  // clona os vínculos p/ o update de proximaData ser observável sem mutar a fixture.
  const vinculosState = vinculos.map((v) => ({ ...v }));

  const prisma: any = {
    clienteProduto: {
      findMany: async (_args: any) => vinculosState,
      update: async (args: any) => {
        const row = vinculosState.find((v) => v.id === args.where.id);
        if (row) Object.assign(row, args.data);
        cpUpdates.push({ id: args.where.id, data: args.data });
        return row;
      },
    },
    entrega: {
      findFirst: async (args: any) => {
        const w = args.where;
        const gte = w.scheduledAt?.gte instanceof Date ? w.scheduledAt.gte.getTime() : -Infinity;
        const lte = w.scheduledAt?.lte instanceof Date ? w.scheduledAt.lte.getTime() : Infinity;
        return (
          entregas.find(
            (e) =>
              e.companyId === w.companyId &&
              e.customerProfileId === w.customerProfileId &&
              e.scheduledAt instanceof Date &&
              e.scheduledAt.getTime() >= gte &&
              e.scheduledAt.getTime() <= lte,
          ) || null
        );
      },
      create: async (args: any) => {
        const id = `entrega-${entregas.length + 1}`;
        const row = { id, ...args.data };
        entregas.push(row);
        // captura os itens aninhados (create nested)
        const itens = args.data.itens?.create || [];
        for (const it of itens) itensCriados.push({ entregaId: id, ...it });
        return { id };
      },
    },
  };

  return { prisma, entregas, cpUpdates, itensCriados, vinculosState };
}

const svc = (prisma: any) => new LogisticaRecorrenciaService(prisma);

// ── 1) lógica pura ────────────────────────────────────────────────────────────
test('isoDow: segunda=1 … domingo=7', () => {
  // 2026-07-06 é uma segunda-feira.
  assert.equal(isoDow(new Date('2026-07-06T12:00:00')), 1);
  // 2026-07-12 é um domingo.
  assert.equal(isoDow(new Date('2026-07-12T12:00:00')), 7);
});

test('parseDiasSemana: limpa/filtra fora de 1..7', () => {
  assert.deepEqual(parseDiasSemana('1,3,5'), [1, 3, 5]);
  assert.deepEqual(parseDiasSemana('0,8, 2 ,x'), [2]);
  assert.deepEqual(parseDiasSemana(null), []);
});

test('dueOnDay: proximaData vencida vence; futura não', () => {
  const dia = new Date('2026-07-06T00:00:00');
  const dow = isoDow(dia);
  assert.equal(
    dueOnDay({ proximaData: new Date('2026-07-05T00:00:00'), frequenciaDias: 7, diasSemana: null }, dia, dow),
    true,
  );
  assert.equal(
    dueOnDay({ proximaData: new Date('2026-07-10T00:00:00'), frequenciaDias: 7, diasSemana: null }, dia, dow),
    false,
  );
});

test('dueOnDay: diasSemana bate no dow (seg) e ignora proximaData', () => {
  const dia = new Date('2026-07-06T00:00:00'); // segunda = 1
  const dow = isoDow(dia);
  assert.equal(dueOnDay({ proximaData: null, frequenciaDias: null, diasSemana: '1,3,5' }, dia, dow), true);
  assert.equal(dueOnDay({ proximaData: null, frequenciaDias: null, diasSemana: '3,5' }, dia, dow), false);
});

test('nextProximaData: frequência 7d = dia + 7', () => {
  const dia = new Date('2026-07-06T00:00:00');
  const prox = nextProximaData({ proximaData: dia, frequenciaDias: 7, diasSemana: null }, dia, isoDow(dia));
  assert.ok(prox);
  assert.equal(prox!.toISOString().slice(0, 10), '2026-07-13');
});

test('nextProximaData: diasSemana pega o próximo dia da lista', () => {
  const dia = new Date('2026-07-06T00:00:00'); // segunda(1)
  // lista seg/qua/sex → próximo depois de segunda = quarta (2026-07-08)
  const prox = nextProximaData({ proximaData: null, frequenciaDias: null, diasSemana: '1,3,5' }, dia, isoDow(dia));
  assert.equal(prox!.toISOString().slice(0, 10), '2026-07-08');
});

test('resolveValorUnit: acordado > catálogo > precoPadrao', () => {
  assert.equal(resolveValorUnit({ precoAcordado: 12, product: { price: 20 }, customerProfile: { precoPadrao: 30 } }), 12);
  assert.equal(resolveValorUnit({ precoAcordado: null, product: { priceCents: 2500 }, customerProfile: { precoPadrao: 30 } }), 25);
  assert.equal(resolveValorUnit({ precoAcordado: null, product: null, customerProfile: { precoPadrao: 30 } }), 30);
  assert.equal(resolveValorUnit({ precoAcordado: null, product: null, customerProfile: null }), 0);
});

// ── 2) IDEMPOTÊNCIA do gerarDia ───────────────────────────────────────────────
test('gerarDia: 2 chamadas no mesmo dia = 1 entrega por cliente (idempotente)', async () => {
  // Usa diasSemana batendo em SEGUNDA (2026-07-06 = seg): assim o vínculo continua
  // "vencido hoje" na 2ª passada (diasSemana ignora proximaData) e é a GUARDA de
  // entrega-já-existente que segura a duplicação — o caso real de rodar 2× no dia.
  const dia = '2026-07-06';
  const vinculos = [
    {
      id: 'cp-1',
      customerProfileId: 'conta-1',
      productId: 10,
      qtdPadrao: 2,
      precoAcordado: 15,
      frequenciaDias: null,
      diasSemana: '1,3,5', // seg/qua/sex — hoje (seg) bate nas 2 passadas
      proximaData: null,
      product: { id: 10, price: 20, priceCents: null },
      customerProfile: { id: 'conta-1', precoPadrao: null },
    },
  ];
  const { prisma, entregas, itensCriados } = buildPrismaMock(vinculos);
  const service = svc(prisma);

  const r1 = await service.gerarDia(1, dia);
  assert.equal(r1.criadas, 1, 'primeira passada cria 1 entrega');
  assert.equal(entregas.length, 1);

  const r2 = await service.gerarDia(1, dia);
  assert.equal(r2.criadas, 0, 'segunda passada NÃO cria (idempotência)');
  assert.equal(r2.puladas, 1, 'segunda passada pula o cliente já com entrega no dia');
  assert.equal(entregas.length, 1, 'segue com 1 única entrega');

  // Backward-compat: escalar coerente com o item (qtd 2 × valorUnit 15 acordado = 30).
  assert.equal(entregas[0].quantidade, 2);
  assert.equal(entregas[0].valor, 30);
  assert.equal(itensCriados.length, 1);
  assert.equal(itensCriados[0].qtdPrevista, 2);
  assert.equal(itensCriados[0].valorUnit, 15);
});

// ── 3) frequência 7d avança proximaData ───────────────────────────────────────
test('gerarDia: frequência 7d avança proximaData +7 dias', async () => {
  const dia = '2026-07-06';
  const vinculos = [
    {
      id: 'cp-1',
      customerProfileId: 'conta-1',
      productId: 10,
      qtdPadrao: 1,
      precoAcordado: null,
      frequenciaDias: 7,
      diasSemana: null,
      proximaData: new Date('2026-07-06T00:00:00'),
      product: { id: 10, price: 10, priceCents: null },
      customerProfile: { id: 'conta-1', precoPadrao: null },
    },
  ];
  const { prisma, cpUpdates, vinculosState } = buildPrismaMock(vinculos);
  const service = svc(prisma);

  const r = await service.gerarDia(1, dia);
  assert.equal(r.criadas, 1);
  assert.equal(r.avancados, 1, 'o vínculo avançou');
  const nova = vinculosState[0].proximaData as Date;
  assert.equal(nova.toISOString().slice(0, 10), '2026-07-13', 'proximaData avançou +7 dias');
  assert.equal(cpUpdates.length, 1);

  // Rodar de novo no dia 06 não cria (idempotência) e proximaData já está no 13.
  const r2 = await service.gerarDia(1, dia);
  assert.equal(r2.criadas, 0);
});

// diasSemana que INCLUI o dia simulado → gerarDia CRIA a entrega.
test('gerarDia: diasSemana inclui o dia (seg) → cria', async () => {
  // 2026-07-06 é segunda (ISO dow = 1). Lista seg/qua/sex inclui hoje.
  const vinculos = [
    {
      id: 'cp-1',
      customerProfileId: 'conta-1',
      productId: 10,
      qtdPadrao: 1,
      precoAcordado: null,
      frequenciaDias: null,
      diasSemana: '1,3,5',
      proximaData: null,
      product: { id: 10, price: 10, priceCents: null },
      customerProfile: { id: 'conta-1', precoPadrao: null },
    },
  ];
  const { prisma, entregas } = buildPrismaMock(vinculos);
  const r = await svc(prisma).gerarDia(1, '2026-07-06');
  assert.equal(r.criadas, 1);
  assert.equal(entregas.length, 1);
});

// diasSemana que NÃO inclui o dia simulado → gerarDia NÃO cria (coração do pedido).
test('gerarDia: diasSemana NÃO inclui o dia (seg) → não cria', async () => {
  // 2026-07-06 é segunda (ISO dow = 1). Lista ter/qui NÃO inclui hoje.
  const vinculos = [
    {
      id: 'cp-1',
      customerProfileId: 'conta-1',
      productId: 10,
      qtdPadrao: 1,
      precoAcordado: null,
      frequenciaDias: null,
      diasSemana: '2,4',
      proximaData: null,
      product: { id: 10, price: 10, priceCents: null },
      customerProfile: { id: 'conta-1', precoPadrao: null },
    },
  ];
  const { prisma, entregas } = buildPrismaMock(vinculos);
  const r = await svc(prisma).gerarDia(1, '2026-07-06');
  assert.equal(r.criadas, 0);
  assert.equal(entregas.length, 0);
});

// Vínculo com proximaData no FUTURO não vence hoje (não gera nada).
test('gerarDia: vínculo com proximaData futura não gera', async () => {
  const vinculos = [
    {
      id: 'cp-1',
      customerProfileId: 'conta-1',
      productId: 10,
      qtdPadrao: 1,
      precoAcordado: null,
      frequenciaDias: 7,
      diasSemana: null,
      proximaData: new Date('2026-07-20T00:00:00'),
      product: { id: 10, price: 10, priceCents: null },
      customerProfile: { id: 'conta-1', precoPadrao: null },
    },
  ];
  const { prisma, entregas } = buildPrismaMock(vinculos);
  const r = await svc(prisma).gerarDia(1, '2026-07-06');
  assert.equal(r.criadas, 0);
  assert.equal(entregas.length, 0);
});
