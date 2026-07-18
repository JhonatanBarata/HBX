import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LogisticaRecorrenciaService,
  dueOnDay,
  nextProximaData,
  resolveValorUnit,
  parseDiasSemana,
  isoDow,
  parseDateOrNull,
} from './logistica-recorrencia.service';

// LOGÍSTICA-MOBILE M2 — prova o CORE do gerador de entregas:
//   1) lógica pura de recorrência (dueOnDay / nextProximaData / valor);
//   2) IDEMPOTÊNCIA do gerarDia: 2 chamadas no mesmo dia = 1 entrega por cliente;
//   3) frequência 7d avança proximaData corretamente (+7 dias).

// ── mock mínimo do Prisma p/ gerarDia ────────────────────────────────────────
// Simula a persistência: entregas ficam num array; o findFirst de idempotência
// enxerga o que já foi criado NAQUELE dia (mesmo comportamento do índice real).
// BUGFIX (09/07) — BUG 1: `contatos` é a "tabela" injetável de Contato (isPrincipal
// + updatedAt), lida por resolvePrincipalContatoId ao criar a Entrega.
function buildPrismaMock(vinculos: any[], contatos: any[] = []) {
  const entregas: any[] = [];
  const cpUpdates: any[] = [];
  const itensCriados: any[] = [];
  // clona os vínculos p/ o update de proximaData ser observável sem mutar a fixture.
  const vinculosState = vinculos.map((v) => ({ ...v }));

  const cpDeletes: string[] = [];
  const prisma: any = {
    contato: {
      findFirst: async (args: any) => {
        const w = args?.where || {};
        const candidatos = contatos.filter(
          (c) =>
            c.companyId === w.companyId &&
            c.customerProfileId === w.customerProfileId &&
            (w.isPrincipal === undefined || c.isPrincipal === w.isPrincipal),
        );
        if (candidatos.length === 0) return null;
        if (args?.orderBy?.updatedAt === 'desc') {
          return [...candidatos].sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))[0];
        }
        return candidatos[0];
      },
    },
    clienteProduto: {
      findMany: async (_args: any) => vinculosState,
      // findFirst company-scoped (usado por remove): só acha se id E companyId batem.
      findFirst: async (args: any) => {
        const w = args.where || {};
        const row = vinculosState.find(
          (v) => v.id === w.id && (w.companyId === undefined || v.companyId === w.companyId),
        );
        return row ? { id: row.id } : null;
      },
      update: async (args: any) => {
        const row = vinculosState.find((v) => v.id === args.where.id);
        if (row) Object.assign(row, args.data);
        cpUpdates.push({ id: args.where.id, data: args.data });
        return row;
      },
      delete: async (args: any) => {
        const idx = vinculosState.findIndex((v) => v.id === args.where.id);
        if (idx >= 0) vinculosState.splice(idx, 1);
        cpDeletes.push(args.where.id);
        return { id: args.where.id };
      },
    },
    entrega: {
      findFirst: async (args: any) => {
        const w = args.where;
        const gte = w.scheduledAt?.gte instanceof Date ? w.scheduledAt.gte.getTime() : -Infinity;
        const lte = w.scheduledAt?.lte instanceof Date ? w.scheduledAt.lte.getTime() : Infinity;
        // MULTILOCAL — idempotência agora inclui localId (semântica do Prisma real):
        // undefined = não filtra; null = "IS NULL" (entrega sem local); string = match
        // exato do local. Fixtures sem localId (null/undefined) caem no ramo null.
        const localMatch = (e: any) =>
          w.localId === undefined ? true : w.localId === null ? e.localId == null : e.localId === w.localId;
        return (
          entregas.find(
            (e) =>
              e.companyId === w.companyId &&
              e.customerProfileId === w.customerProfileId &&
              localMatch(e) &&
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

  return { prisma, entregas, cpUpdates, itensCriados, vinculosState, cpDeletes };
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
  // L4-A (18/07) — gerarDia materializa recorrência: origem sempre 'recorrente'.
  assert.equal(entregas[0].origem, 'recorrente');
  assert.equal(itensCriados.length, 1);
  assert.equal(itensCriados[0].qtdPrevista, 2);
  assert.equal(itensCriados[0].valorUnit, 15);
});

// ── 1b) BUG 1 (09/07, incidente Josefino) — contatoId resolvido ao criar ──────
// Antes do fix, a Entrega nascia SEMPRE com contatoId=null; o aviso "entregue"
// caía direto no CustomerProfile.phone (podendo estar desatualizado). Agora
// gerarDia resolve o contato PRINCIPAL (ou o mais recente, na ausência de um
// principal) e grava em Entrega.contatoId.
test('gerarDia: resolve o Contato PRINCIPAL e grava em Entrega.contatoId', async () => {
  const dia = '2026-07-06';
  const vinculos = [
    {
      id: 'cp-1',
      customerProfileId: 'conta-1',
      productId: 10,
      qtdPadrao: 1,
      precoAcordado: 10,
      frequenciaDias: null,
      diasSemana: '1',
      proximaData: null,
      product: { id: 10, price: 10, priceCents: null },
      customerProfile: { id: 'conta-1', precoPadrao: null },
    },
  ];
  const contatos = [
    { id: 'contato-velho', companyId: 1, customerProfileId: 'conta-1', isPrincipal: false, updatedAt: new Date('2026-06-01') },
    { id: 'contato-principal', companyId: 1, customerProfileId: 'conta-1', isPrincipal: true, updatedAt: new Date('2026-06-15') },
  ];
  const { prisma, entregas } = buildPrismaMock(vinculos, contatos);
  const r = await svc(prisma).gerarDia(1, dia);

  assert.equal(r.criadas, 1);
  assert.equal(entregas[0].contatoId, 'contato-principal', 'usa o contato marcado isPrincipal, não o mais antigo');
});

test('gerarDia: sem contato PRINCIPAL, usa o mais recente (updatedAt desc)', async () => {
  const dia = '2026-07-06';
  const vinculos = [
    {
      id: 'cp-1',
      customerProfileId: 'conta-1',
      productId: 10,
      qtdPadrao: 1,
      precoAcordado: 10,
      frequenciaDias: null,
      diasSemana: '1',
      proximaData: null,
      product: { id: 10, price: 10, priceCents: null },
      customerProfile: { id: 'conta-1', precoPadrao: null },
    },
  ];
  const contatos = [
    { id: 'contato-antigo', companyId: 1, customerProfileId: 'conta-1', isPrincipal: false, updatedAt: new Date('2026-06-01') },
    { id: 'contato-recente', companyId: 1, customerProfileId: 'conta-1', isPrincipal: false, updatedAt: new Date('2026-07-01') },
  ];
  const { prisma, entregas } = buildPrismaMock(vinculos, contatos);
  const r = await svc(prisma).gerarDia(1, dia);

  assert.equal(r.criadas, 1);
  assert.equal(entregas[0].contatoId, 'contato-recente');
});

test('gerarDia: cliente SEM nenhum contato → contatoId fica null (fallback do dispararWhatsapp decide)', async () => {
  const dia = '2026-07-06';
  const vinculos = [
    {
      id: 'cp-1',
      customerProfileId: 'conta-1',
      productId: 10,
      qtdPadrao: 1,
      precoAcordado: 10,
      frequenciaDias: null,
      diasSemana: '1',
      proximaData: null,
      product: { id: 10, price: 10, priceCents: null },
      customerProfile: { id: 'conta-1', precoPadrao: null },
    },
  ];
  const { prisma, entregas } = buildPrismaMock(vinculos, []);
  const r = await svc(prisma).gerarDia(1, dia);

  assert.equal(r.criadas, 1);
  assert.equal(entregas[0].contatoId, null);
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

// ── 4) TASK 5 (08/07) — agregação multi-vínculo (mesmo produto pode repetir) ──
// Antes do fix, gerarDia criava 1 Entrega com o item do PRIMEIRO vínculo vencido
// e PULAVA o resto (o `existente` é por cliente+dia, não por vínculo) — os demais
// vínculos eram avançados mas o item deles NUNCA virava EntregaItem. Estes testes
// prezam que TODOS os vínculos vencidos do cliente entram na mesma Entrega.

test('gerarDia: agrega vínculos DIFERENTES do mesmo cliente vencendo no mesmo dia (1 entrega, N itens)', async () => {
  const dia = '2026-07-06'; // segunda
  const vinculos = [
    {
      id: 'cp-1',
      customerProfileId: 'conta-1',
      productId: 10,
      qtdPadrao: 2,
      precoAcordado: 15,
      frequenciaDias: null,
      diasSemana: '1', // segunda
      proximaData: null,
      product: { id: 10, name: 'Galão 20L', price: 20, priceCents: null },
      customerProfile: { id: 'conta-1', name: 'Dona Maria', precoPadrao: null },
    },
    {
      id: 'cp-2',
      customerProfileId: 'conta-1',
      productId: 20,
      qtdPadrao: 1,
      precoAcordado: null,
      frequenciaDias: null,
      diasSemana: '1', // segunda também
      proximaData: null,
      product: { id: 20, name: 'Água com gás', price: 8, priceCents: null },
      customerProfile: { id: 'conta-1', name: 'Dona Maria', precoPadrao: null },
    },
  ];
  const { prisma, entregas, itensCriados, cpUpdates } = buildPrismaMock(vinculos);
  const r = await svc(prisma).gerarDia(1, dia);

  assert.equal(r.criadas, 1, '1 cliente = 1 entrega, mesmo com 2 vínculos vencidos');
  assert.equal(entregas.length, 1);
  assert.equal(itensCriados.length, 2, '2 vínculos vencidos = 2 EntregaItem (nenhum perdido)');
  assert.deepEqual(
    itensCriados.map((i) => i.productId).sort(),
    [10, 20],
  );
  // Backward-compat: quantidade/valor = SOMA dos itens (2×15 + 1×8 = 38; qtd 2+1=3).
  assert.equal(entregas[0].quantidade, 3);
  assert.equal(entregas[0].valor, 38);
  // Os DOIS vínculos avançam proximaData (nenhum fica preso).
  assert.equal(r.avancados, 2);
  assert.equal(cpUpdates.length, 2);
});

test('gerarDia: mesmo produto vinculado 2× no MESMO dia gera 2 EntregaItem separados (não funde)', async () => {
  const dia = '2026-07-06'; // segunda
  const vinculos = [
    {
      id: 'cp-1',
      customerProfileId: 'conta-1',
      productId: 10, // MESMO produto
      qtdPadrao: 1,
      precoAcordado: 10,
      frequenciaDias: null,
      diasSemana: '1',
      proximaData: null,
      product: { id: 10, name: 'Galão 20L', price: 10, priceCents: null },
      customerProfile: { id: 'conta-1', name: 'Dona Maria', precoPadrao: null },
    },
    {
      id: 'cp-2',
      customerProfileId: 'conta-1',
      productId: 10, // MESMO produto, outro vínculo (galão extra)
      qtdPadrao: 1,
      precoAcordado: 12,
      frequenciaDias: null,
      diasSemana: '1',
      proximaData: null,
      product: { id: 10, name: 'Galão 20L', price: 10, priceCents: null },
      customerProfile: { id: 'conta-1', name: 'Dona Maria', precoPadrao: null },
    },
  ];
  const { prisma, entregas, itensCriados } = buildPrismaMock(vinculos);
  const r = await svc(prisma).gerarDia(1, dia);

  assert.equal(r.criadas, 1);
  assert.equal(itensCriados.length, 2, 'os 2 vínculos do MESMO produto não se fundem em 1 item');
  assert.deepEqual(itensCriados.map((i) => i.productId), [10, 10]);
  assert.deepEqual(itensCriados.map((i) => i.valorUnit), [10, 12]);
  assert.equal(entregas[0].quantidade, 2);
  assert.equal(entregas[0].valor, 22); // 1×10 + 1×12
});

test('gerarDia: mesmo produto vinculado 2× em DIAS DIFERENTES — só o vínculo do dia vence', async () => {
  const vinculos = [
    {
      id: 'cp-1',
      customerProfileId: 'conta-1',
      productId: 10,
      qtdPadrao: 1,
      precoAcordado: 10,
      frequenciaDias: null,
      diasSemana: '1', // segunda
      proximaData: null,
      product: { id: 10, name: 'Galão 20L', price: 10, priceCents: null },
      customerProfile: { id: 'conta-1', name: 'Dona Maria', precoPadrao: null },
    },
    {
      id: 'cp-2',
      customerProfileId: 'conta-1',
      productId: 10, // mesmo produto, vínculo da SEXTA
      qtdPadrao: 1,
      precoAcordado: 12,
      frequenciaDias: null,
      diasSemana: '5', // sexta
      proximaData: null,
      product: { id: 10, name: 'Galão 20L', price: 10, priceCents: null },
      customerProfile: { id: 'conta-1', name: 'Dona Maria', precoPadrao: null },
    },
  ];
  const { prisma, entregas, itensCriados } = buildPrismaMock(vinculos);
  // 2026-07-06 é segunda → só cp-1 vence; cp-2 (sexta) fica de fora.
  const r = await svc(prisma).gerarDia(1, '2026-07-06');
  assert.equal(r.criadas, 1);
  assert.equal(itensCriados.length, 1);
  assert.equal(itensCriados[0].productId, 10);
  assert.equal(itensCriados[0].valorUnit, 10);
  assert.equal(entregas[0].valor, 10);
  // Só o vínculo vencido (cp-1) avança — cp-2 (sexta) fica intocado.
  assert.equal(r.avancados, 1);
});

// ── 4b) MULTILOCAL (10/07) — agrupa por (cliente, LOCAL), não só por cliente ──
// Antes, um cliente com 2 endereços vencendo no mesmo dia geraria 1 entrega só (o
// 2º local seria PULADO pela idempotência cliente+dia). Agora sub-agrupa por local:
// 1 Entrega por (cliente, local), com o localId gravado, preservando a agregação
// multi-item DENTRO de cada local.

test('gerarDia MULTILOCAL: 2 locais do mesmo cliente no mesmo dia → 2 entregas, cada uma com seu localId', async () => {
  const dia = '2026-07-06'; // segunda
  const vinculos = [
    {
      id: 'cp-A', customerProfileId: 'conta-1', localId: 'loc-casa', productId: 10,
      qtdPadrao: 2, precoAcordado: 15, frequenciaDias: null, diasSemana: '1', proximaData: null,
      product: { id: 10, name: 'Galão 20L', price: 20, priceCents: null },
      customerProfile: { id: 'conta-1', name: 'Dona Maria', precoPadrao: null },
    },
    {
      id: 'cp-B', customerProfileId: 'conta-1', localId: 'loc-loja', productId: 20,
      qtdPadrao: 1, precoAcordado: 8, frequenciaDias: null, diasSemana: '1', proximaData: null,
      product: { id: 20, name: 'Água com gás', price: 8, priceCents: null },
      customerProfile: { id: 'conta-1', name: 'Dona Maria', precoPadrao: null },
    },
  ];
  const { prisma, entregas, itensCriados } = buildPrismaMock(vinculos);
  const r = await svc(prisma).gerarDia(1, dia);

  assert.equal(r.criadas, 2, '1 entrega POR LOCAL — o 2º local não é mais pulado');
  assert.equal(entregas.length, 2);
  assert.deepEqual(entregas.map((e) => e.localId).sort(), ['loc-casa', 'loc-loja']);
  // Cada entrega leva SÓ o item do seu local.
  const casa = entregas.find((e) => e.localId === 'loc-casa');
  const loja = entregas.find((e) => e.localId === 'loc-loja');
  assert.equal(itensCriados.filter((i) => i.entregaId === casa.id).length, 1);
  assert.equal(itensCriados.filter((i) => i.entregaId === loja.id).length, 1);
  assert.equal(r.avancados, 2, 'os 2 vínculos (1 por local) avançam');
});

test('gerarDia MULTILOCAL: idempotência por (cliente, local) — 2ª passada não recria nenhum', async () => {
  const dia = '2026-07-06';
  const vinculos = [
    {
      id: 'cp-A', customerProfileId: 'conta-1', localId: 'loc-casa', productId: 10,
      qtdPadrao: 1, precoAcordado: 10, frequenciaDias: null, diasSemana: '1', proximaData: null,
      product: { id: 10, name: 'Galão', price: 10, priceCents: null },
      customerProfile: { id: 'conta-1', name: 'Dona Maria', precoPadrao: null },
    },
    {
      id: 'cp-B', customerProfileId: 'conta-1', localId: 'loc-loja', productId: 20,
      qtdPadrao: 1, precoAcordado: 8, frequenciaDias: null, diasSemana: '1', proximaData: null,
      product: { id: 20, name: 'Gás', price: 8, priceCents: null },
      customerProfile: { id: 'conta-1', name: 'Dona Maria', precoPadrao: null },
    },
  ];
  const { prisma, entregas } = buildPrismaMock(vinculos);
  const service = svc(prisma);

  const r1 = await service.gerarDia(1, dia);
  assert.equal(r1.criadas, 2);

  const r2 = await service.gerarDia(1, dia);
  assert.equal(r2.criadas, 0, '2ª passada não recria');
  assert.equal(r2.puladas, 2, 'os 2 locais são pulados (idempotência por local)');
  assert.equal(entregas.length, 2, 'segue com 2 entregas');
});

test('gerarDia MULTILOCAL: vínculos do MESMO local agregam em 1 entrega (TASK 5 dentro do local)', async () => {
  const dia = '2026-07-06';
  const vinculos = [
    {
      id: 'cp-1', customerProfileId: 'conta-1', localId: 'loc-casa', productId: 10,
      qtdPadrao: 2, precoAcordado: 15, frequenciaDias: null, diasSemana: '1', proximaData: null,
      product: { id: 10, name: 'Galão', price: 20, priceCents: null },
      customerProfile: { id: 'conta-1', name: 'Dona Maria', precoPadrao: null },
    },
    {
      id: 'cp-2', customerProfileId: 'conta-1', localId: 'loc-casa', productId: 20,
      qtdPadrao: 1, precoAcordado: null, frequenciaDias: null, diasSemana: '1', proximaData: null,
      product: { id: 20, name: 'Gás', price: 8, priceCents: null },
      customerProfile: { id: 'conta-1', name: 'Dona Maria', precoPadrao: null },
    },
  ];
  const { prisma, entregas, itensCriados } = buildPrismaMock(vinculos);
  const r = await svc(prisma).gerarDia(1, dia);

  assert.equal(r.criadas, 1, '2 vínculos do MESMO local = 1 entrega');
  assert.equal(entregas.length, 1);
  assert.equal(entregas[0].localId, 'loc-casa');
  assert.equal(itensCriados.length, 2, 'os 2 itens entram na MESMA entrega do local');
  assert.equal(entregas[0].quantidade, 3); // 2 + 1
  assert.equal(entregas[0].valor, 38); // 2×15 + 1×8
});

// ── 5) TASK 7 — preview READ-ONLY do dia (pop-up "Gerar entregas") ───────────
test('getDiaPreview: agrupa por cliente, traz nomes e NÃO escreve nada (read-only)', async () => {
  const dia = '2026-07-06'; // segunda
  const vinculos = [
    {
      id: 'cp-1',
      customerProfileId: 'conta-1',
      productId: 10,
      qtdPadrao: 2,
      precoAcordado: null,
      frequenciaDias: null,
      diasSemana: '1',
      proximaData: null,
      product: { id: 10, name: 'Galão 20L', price: 20, priceCents: null },
      customerProfile: { id: 'conta-1', name: 'Dona Maria', precoPadrao: null },
    },
    {
      id: 'cp-2',
      customerProfileId: 'conta-2',
      productId: 20,
      qtdPadrao: 1,
      precoAcordado: null,
      frequenciaDias: null,
      diasSemana: '2', // terça — NÃO vence na segunda
      proximaData: null,
      product: { id: 20, name: 'Água com gás', price: 8, priceCents: null },
      customerProfile: { id: 'conta-2', name: 'Seu João', precoPadrao: null },
    },
  ];
  const { prisma, entregas, cpUpdates } = buildPrismaMock(vinculos);
  const preview = await svc(prisma).getDiaPreview(1, dia);

  assert.equal(preview.date, '2026-07-06');
  assert.equal(preview.clientes.length, 1, 'só conta-1 vence na segunda');
  assert.equal(preview.clientes[0].customerProfileId, 'conta-1');
  assert.equal(preview.clientes[0].nome, 'Dona Maria');
  assert.deepEqual(preview.clientes[0].itens, [{ productId: 10, nome: 'Galão 20L', qtd: 2 }]);
  // MULTILOCAL — cliente sem local (legado) = 1 linha com localId/apelido null.
  assert.equal(preview.clientes[0].localId ?? null, null);
  assert.equal(preview.clientes[0].localApelido ?? null, null);
  // READ-ONLY de verdade: nenhuma Entrega criada, nenhum vínculo avançado.
  assert.equal(entregas.length, 0);
  assert.equal(cpUpdates.length, 0);
});

// MULTILOCAL (11/07) — o preview espelha o gerarDia: 1 linha por (cliente, LOCAL).
// Antes, um cliente com 2 portas vencendo no mesmo dia virava 1 linha só (somava
// itens dos 2 locais), sub-representando o multi-local. Agora são 2 linhas, cada
// uma com seu localId + apelido do LocalEntrega.
test('getDiaPreview MULTILOCAL: cliente com 2 locais no mesmo dia → 2 linhas (1 por local, com apelido)', async () => {
  const dia = '2026-07-06'; // segunda
  const vinculos = [
    {
      id: 'cp-A', customerProfileId: 'conta-1', localId: 'loc-casa', local: { apelido: 'Casa' },
      productId: 10, qtdPadrao: 2, precoAcordado: null, frequenciaDias: null, diasSemana: '1', proximaData: null,
      product: { id: 10, name: 'Galão 20L', price: 20, priceCents: null },
      customerProfile: { id: 'conta-1', name: 'Dona Maria', precoPadrao: null },
    },
    {
      id: 'cp-B', customerProfileId: 'conta-1', localId: 'loc-loja', local: { apelido: 'Loja' },
      productId: 20, qtdPadrao: 1, precoAcordado: null, frequenciaDias: null, diasSemana: '1', proximaData: null,
      product: { id: 20, name: 'Água com gás', price: 8, priceCents: null },
      customerProfile: { id: 'conta-1', name: 'Dona Maria', precoPadrao: null },
    },
  ];
  const { prisma, entregas, cpUpdates } = buildPrismaMock(vinculos);
  const preview = await svc(prisma).getDiaPreview(1, dia);

  assert.equal(preview.clientes.length, 2, 'mesmo cliente, 2 locais = 2 linhas de preview');
  const casa = preview.clientes.find((c) => c.localId === 'loc-casa');
  const loja = preview.clientes.find((c) => c.localId === 'loc-loja');
  assert.ok(casa && loja, 'as 2 linhas trazem o localId de cada porta');
  assert.equal(casa!.nome, 'Dona Maria');
  assert.equal(casa!.localApelido, 'Casa');
  assert.equal(loja!.localApelido, 'Loja');
  assert.deepEqual(casa!.itens, [{ productId: 10, nome: 'Galão 20L', qtd: 2 }]);
  assert.deepEqual(loja!.itens, [{ productId: 20, nome: 'Água com gás', qtd: 1 }]);
  // READ-ONLY: nada materializado.
  assert.equal(entregas.length, 0);
  assert.equal(cpUpdates.length, 0);
});

// ── 6) TASK 9 — remove (hard delete) do vínculo produto×cliente ──────────────
test('remove: apaga o vínculo da própria empresa e devolve true', async () => {
  const vinculos = [
    {
      id: 'cp-1',
      companyId: 1,
      customerProfileId: 'conta-1',
      productId: 10,
      qtdPadrao: 1,
      precoAcordado: null,
      frequenciaDias: null,
      diasSemana: '1',
      proximaData: null,
      product: { id: 10, name: 'Galão 20L', price: 10, priceCents: null },
      customerProfile: { id: 'conta-1', name: 'Dona Maria', precoPadrao: null },
    },
  ];
  const { prisma, cpDeletes, vinculosState } = buildPrismaMock(vinculos);
  const ok = await svc(prisma).remove(1, 'cp-1');
  assert.equal(ok, true);
  assert.deepEqual(cpDeletes, ['cp-1']);
  assert.equal(vinculosState.length, 0, 'o vínculo some de vez');
});

test('remove: vínculo de OUTRA empresa → false (company-scoped, não apaga)', async () => {
  const vinculos = [
    {
      id: 'cp-1',
      companyId: 1,
      customerProfileId: 'conta-1',
      productId: 10,
      qtdPadrao: 1,
      precoAcordado: null,
      frequenciaDias: null,
      diasSemana: '1',
      proximaData: null,
      product: { id: 10, name: 'Galão 20L', price: 10, priceCents: null },
      customerProfile: { id: 'conta-1', name: 'Dona Maria', precoPadrao: null },
    },
  ];
  const { prisma, cpDeletes, vinculosState } = buildPrismaMock(vinculos);
  // empresa 999 tenta apagar o vínculo da empresa 1 → não acha → false, nada apagado.
  const ok = await svc(prisma).remove(999, 'cp-1');
  assert.equal(ok, false);
  assert.equal(cpDeletes.length, 0);
  assert.equal(vinculosState.length, 1);
});

test('remove: id inexistente → false', async () => {
  const { prisma } = buildPrismaMock([]);
  assert.equal(await svc(prisma).remove(1, 'nao-existe'), false);
});

// ── 7) BUG 4 (11/07) — parseDateOrNull rejeita data de calendário IMPOSSÍVEL ──
// Antes, "YYYY-MM-DD" bem-formado mas com mês/dia fora do calendário (13/40, 00/00)
// fazia overflow SILENCIOSO do JS Date (new Date(y, m-1, d) rola pro mês/ano
// seguinte) e getTime() nunca virava NaN — a data rolada passava como válida e
// podia materializar Entrega/PATCH proximaData no dia ERRADO. Round-trip fecha o buraco.
test('parseDateOrNull: mês/dia impossíveis (overflow) → null, não rola pro dia seguinte', () => {
  assert.equal(parseDateOrNull('2026-13-40'), null, 'mês 13 + dia 40 não é uma data válida');
  assert.equal(parseDateOrNull('2026-02-30'), null, '30 de fevereiro não existe');
  assert.equal(parseDateOrNull('2026-00-00'), null, 'mês/dia 00 não é uma data válida');
});

test('parseDateOrNull: "YYYY-MM-DD" válido continua parseando certo (fuso local)', () => {
  const d = parseDateOrNull('2026-07-11');
  assert.ok(d instanceof Date);
  assert.equal(d!.getFullYear(), 2026);
  assert.equal(d!.getMonth(), 6, 'julho = índice 6');
  assert.equal(d!.getDate(), 11);
});

test('parseDateOrNull: entrada vazia/lixo → null (contrato preservado)', () => {
  assert.equal(parseDateOrNull(null), null);
  assert.equal(parseDateOrNull(undefined), null);
  assert.equal(parseDateOrNull('abc'), null);
});

function assertNoRecurrencePrices(value: unknown, path = 'response'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRecurrencePrices(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    assert.equal(
      key === 'precoAcordado' || key === 'precoCatalogo' || key === 'price' || key === 'priceCents',
      false,
      `chave de preço ${path}.${key} deve estar ausente`,
    );
    assertNoRecurrencePrices(nested, `${path}.${key}`);
  }
}

const GERENTE_SEM_COBRANCA = {
  id: 9,
  companyId: 7,
  role: 'ADMIN',
  canViewBilling: false,
};

test('listProdutos: ator sem cobrança não consulta nem serializa preço do catálogo', async () => {
  let query: any;
  const prisma: any = {
    product: {
      findMany: async (args: any) => {
        query = args;
        return [
          {
            id: 10,
            name: 'Galão',
            unidade: 'un',
            usaLogistica: true,
            price: 20,
            priceCents: 2000,
          },
        ];
      },
    },
  };

  const result = await svc(prisma).listProdutos(7, GERENTE_SEM_COBRANCA);
  assert.deepEqual(result, [{ id: 10, nome: 'Galão', unidade: 'un', usaLogistica: true }]);
  assertNoRecurrencePrices(result);
  assert.equal('price' in query.select, false);
  assert.equal('priceCents' in query.select, false);
});

test('listByCliente: ator sem cobrança recebe vínculo operacional sem preços', async () => {
  let query: any;
  const prisma: any = {
    clienteProduto: {
      findMany: async (args: any) => {
        query = args;
        return [
          {
            id: 'cp-1',
            customerProfileId: 'cliente-1',
            productId: 10,
            qtdPadrao: 2,
            precoAcordado: 15,
            frequenciaDias: 7,
            diasSemana: null,
            proximaData: new Date('2026-07-20T00:00:00Z'),
            ativo: true,
            product: {
              id: 10,
              name: 'Galão',
              unidade: 'un',
              price: 20,
              priceCents: 2000,
            },
          },
        ];
      },
    },
  };

  const result = await svc(prisma).listByCliente(7, 'cliente-1', GERENTE_SEM_COBRANCA);
  assert.equal(result[0].qtdPadrao, 2);
  assert.equal(result[0].produto?.nome, 'Galão');
  assertNoRecurrencePrices(result);
  assert.equal('precoAcordado' in query.select, false);
  assert.equal('price' in query.select.product.select, false);
  assert.equal('priceCents' in query.select.product.select, false);
});

test('getDiaPreview: ator sem cobrança não carrega insumos monetários', async () => {
  let query: any;
  const prisma: any = {
    clienteProduto: {
      findMany: async (args: any) => {
        query = args;
        return [
          {
            id: 'cp-1',
            customerProfileId: 'cliente-1',
            localId: null,
            local: null,
            productId: 10,
            qtdPadrao: 2,
            precoAcordado: 15,
            frequenciaDias: null,
            diasSemana: '1',
            proximaData: null,
            product: { id: 10, name: 'Galão', price: 20, priceCents: 2000 },
            customerProfile: { id: 'cliente-1', name: 'Cliente', precoPadrao: 18 },
          },
        ];
      },
    },
  };

  const result = await svc(prisma).getDiaPreview(7, '2026-07-13', GERENTE_SEM_COBRANCA);
  assert.equal(result.clientes[0].itens[0].nome, 'Galão');
  assertNoRecurrencePrices(result);
  assert.equal('precoAcordado' in query.select, false);
  assert.equal('price' in query.select.product.select, false);
  assert.equal('priceCents' in query.select.product.select, false);
  assert.equal('precoPadrao' in query.select.customerProfile.select, false);
});

test('catálogo e vínculo preservam preços para dono/master', async () => {
  const owner = { id: 1, companyId: 7, role: 'ADMIN', canViewBilling: true };
  const prisma: any = {
    product: {
      findMany: async () => [
        { id: 10, name: 'Galão', unidade: 'un', usaLogistica: true, price: null, priceCents: 2150 },
      ],
    },
    clienteProduto: {
      findMany: async () => [
        {
          id: 'cp-1',
          customerProfileId: 'cliente-1',
          productId: 10,
          qtdPadrao: 2,
          precoAcordado: 19,
          frequenciaDias: 7,
          diasSemana: null,
          proximaData: null,
          ativo: true,
          product: { id: 10, name: 'Galão', unidade: 'un', price: null, priceCents: 2150 },
        },
      ],
    },
  };

  const produtos = await svc(prisma).listProdutos(7, owner);
  const vinculos = await svc(prisma).listByCliente(7, 'cliente-1', owner);
  assert.equal(produtos[0].precoCatalogo, 21.5);
  assert.equal(vinculos[0].precoAcordado, 19);
  assert.equal(vinculos[0].produto?.precoCatalogo, 21.5);
});

// ══════════════════════════════════════════════════════════════════════════════
// PR18072026 W1 — façade de produtos sob /logistica (POST/PATCH /logistica/produtos)
// ══════════════════════════════════════════════════════════════════════════════

function buildProdutoPrisma(seed: any[] = []) {
  const store = new Map<number, any>(seed.map((row) => [row.id, { ...row }]));
  let nextId = 100;
  const prisma: any = {
    product: {
      create: async (args: any) => {
        const id = nextId++;
        const row = { id, ...args.data };
        store.set(id, row);
        return row;
      },
      findFirst: async (args: any) => {
        const where = args?.where || {};
        const row = store.get(where.id);
        if (!row) return null;
        if (where.companyId != null && row.companyId !== where.companyId) return null;
        return { id: row.id };
      },
      update: async (args: any) => {
        const row = store.get(args.where.id);
        Object.assign(row, args.data);
        return row;
      },
    },
  };
  return { prisma, store };
}

test('createProduto: cria produto tenant_product/active/usaLogistica=true company-scoped', async () => {
  const { prisma, store } = buildProdutoPrisma();
  const dto = await svc(prisma).createProduto(7, { nome: 'Galão 20L', unidade: 'galão', preco: 12.5, estoque: 30 });

  assert.equal(dto.nome, 'Galão 20L');
  assert.equal(dto.unidade, 'galão');
  assert.equal(dto.preco, 12.5);
  assert.equal(dto.estoque, 30);
  assert.equal(dto.ativo, true);
  const row = store.get(dto.id)!;
  assert.equal(row.companyId, 7);
  assert.equal(row.kind, 'tenant_product');
  assert.equal(row.status, 'active');
  assert.equal(row.usaLogistica, true);
  assert.equal(row.priceCents, 1250);
});

test('createProduto: nome vazio rejeita; preco/estoque omitidos nascem 0', async () => {
  const { prisma } = buildProdutoPrisma();
  await assert.rejects(() => svc(prisma).createProduto(7, { nome: '' }), /Nome é obrigatório/);
  const dto = await svc(prisma).createProduto(7, { nome: 'Sem preço' });
  assert.equal(dto.preco, 0);
  assert.equal(dto.estoque, 0);
});

test('updateProduto: edita nome/unidade/preco/estoque (PATCH parcial)', async () => {
  const { prisma, store } = buildProdutoPrisma([
    { id: 501, companyId: 7, name: 'Galão', unidade: 'un', price: 10, priceCents: 1000, stock: 5, status: 'active' },
  ]);
  const dto = await svc(prisma).updateProduto(7, '501', { preco: 15, estoque: 8 });
  assert.equal(dto!.preco, 15);
  assert.equal(dto!.estoque, 8);
  assert.equal(dto!.nome, 'Galão', 'nome omitido não muda');
  assert.equal(store.get(501)!.priceCents, 1500);
});

test('updateProduto: ativo=false ARQUIVA (status=archived), some do picker sem apagar o produto', async () => {
  const { prisma, store } = buildProdutoPrisma([
    { id: 501, companyId: 7, name: 'Galão', unidade: 'un', price: 10, priceCents: 1000, stock: 5, status: 'active' },
  ]);
  const dto = await svc(prisma).updateProduto(7, '501', { ativo: false });
  assert.equal(dto!.ativo, false);
  assert.equal(store.get(501)!.status, 'archived');
  assert.ok(store.has(501), 'produto continua existindo — vínculos não quebram');
});

test('updateProduto: id de OUTRA empresa → null (404 no controller), nada é escrito', async () => {
  const { prisma, store } = buildProdutoPrisma([
    { id: 501, companyId: 7, name: 'Galão', unidade: 'un', price: 10, priceCents: 1000, stock: 5, status: 'active' },
  ]);
  const res = await svc(prisma).updateProduto(999, '501', { preco: 999 });
  assert.equal(res, null);
  assert.equal(store.get(501)!.price, 10, 'preço original intocado');
});

test('updateProduto: id inexistente/inválido → null', async () => {
  const { prisma } = buildProdutoPrisma();
  assert.equal(await svc(prisma).updateProduto(7, 'nao-numero', {}), null);
  assert.equal(await svc(prisma).updateProduto(7, '999', {}), null);
});
