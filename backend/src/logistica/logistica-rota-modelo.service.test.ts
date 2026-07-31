import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaRotaModeloService } from './logistica-rota-modelo.service';

/**
 * PR18072026 W1 — CRUD de rota-modelo (roteiro salvo): nome + diaSemana
 * opcional + paradas em ordem. Company-scoped fail-closed (404 cross-tenant).
 */

function buildPrisma(seed: any[] = []) {
  const store = new Map<string, any>(seed.map((row) => [row.id, { ...row }]));
  let nextId = 1;
  const prisma: any = {
    logisticaRotaModelo: {
      findMany: async (args: any) => {
        const where = args?.where || {};
        return Array.from(store.values()).filter((row) => row.companyId === where.companyId);
      },
      // PR20072026 W1 — findFirst também serve o lookup por NOME (case-insensitive)
      // de assertNomeUnico (where.id ausente, where.nome = {equals, mode}).
      findFirst: async (args: any) => {
        const where = args?.where || {};
        let rows = Array.from(store.values());
        if (where.id != null) rows = rows.filter((r) => r.id === where.id);
        if (where.companyId != null) rows = rows.filter((r) => r.companyId === where.companyId);
        if (where.nome && typeof where.nome === 'object') {
          const alvo = String(where.nome.equals ?? '').toLowerCase();
          rows = rows.filter((r) => String(r.nome ?? '').toLowerCase() === alvo);
        }
        const row = rows[0];
        if (!row) return null;
        return { id: row.id, nome: row.nome };
      },
      create: async (args: any) => {
        const id = `modelo-${nextId++}`;
        const row = { id, createdAt: new Date(), updatedAt: new Date(), ...args.data };
        store.set(id, row);
        return row;
      },
      update: async (args: any) => {
        const row = store.get(args.where.id);
        Object.assign(row, args.data, { updatedAt: new Date() });
        return row;
      },
      delete: async (args: any) => {
        store.delete(args.where.id);
        return { id: args.where.id };
      },
    },
    // 27/07 — `remove` solta o carimbo de origem das entregas antes de apagar o
    // modelo (FK Restrict). Sem estes dois mocks os testes de remove estouravam
    // "Cannot read properties of undefined (reading 'updateMany')" — falha de
    // FIXTURE, não de comportamento, que deixava a suíte vermelha desde então.
    entrega: { updateMany: async () => ({ count: 0 }) },
    $transaction: async (ops: any[]) => Promise.all(ops),
  };
  return { prisma, store };
}

test('create: grava nome/diaSemana/paradas e devolve o DTO', async () => {
  const { prisma } = buildPrisma();
  const svc = new LogisticaRotaModeloService(prisma);
  const dto = await svc.create(7, {
    nome: 'Segunda — Centro',
    diaSemana: 1,
    paradas: [{ customerProfileId: 'c1' }, { customerProfileId: 'c2', localId: 'l2' }],
  });

  assert.equal(dto.nome, 'Segunda — Centro');
  assert.equal(dto.diaSemana, 1);
  assert.deepEqual(dto.paradas, [{ customerProfileId: 'c1' }, { customerProfileId: 'c2', localId: 'l2' }]);
  assert.ok(dto.id);
});

test('create: nome vazio rejeita (400)', async () => {
  const { prisma } = buildPrisma();
  const svc = new LogisticaRotaModeloService(prisma);
  await assert.rejects(() => svc.create(7, { nome: '   ' }), /Nome é obrigatório/);
});

test('create: nome > 80 chars rejeita', async () => {
  const { prisma } = buildPrisma();
  const svc = new LogisticaRotaModeloService(prisma);
  await assert.rejects(() => svc.create(7, { nome: 'x'.repeat(81) }), /80 caracteres/);
});

test('create: diaSemana fora de 1..7 rejeita; omitido vira null', async () => {
  const { prisma } = buildPrisma();
  const svc = new LogisticaRotaModeloService(prisma);
  await assert.rejects(() => svc.create(7, { nome: 'X', diaSemana: 8 }), /1 \(segunda\) a 7/);
  await assert.rejects(() => svc.create(7, { nome: 'X', diaSemana: 0 }), /1 \(segunda\) a 7/);
  const dto = await svc.create(7, { nome: 'Sem dia' });
  assert.equal(dto.diaSemana, null);
  assert.deepEqual(dto.paradas, []);
});

test('create: mais de 500 paradas rejeita', async () => {
  const { prisma } = buildPrisma();
  const svc = new LogisticaRotaModeloService(prisma);
  const paradas = Array.from({ length: 501 }, (_, i) => ({ customerProfileId: `c${i}` }));
  await assert.rejects(() => svc.create(7, { nome: 'X', paradas }), /500 paradas/);
});

test('create: parada sem customerProfileId rejeita', async () => {
  const { prisma } = buildPrisma();
  const svc = new LogisticaRotaModeloService(prisma);
  await assert.rejects(() => svc.create(7, { nome: 'X', paradas: [{ customerProfileId: '' } as any] }), /customerProfileId é obrigatório/);
});

test('list: só lista os modelos da PRÓPRIA empresa', async () => {
  const { prisma } = buildPrisma([
    { id: 'm1', companyId: 7, nome: 'A', diaSemana: null, paradasJson: [] },
    { id: 'm2', companyId: 8, nome: 'B', diaSemana: null, paradasJson: [] },
  ]);
  const svc = new LogisticaRotaModeloService(prisma);
  const list = await svc.list(7);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'm1');
});

test('update: edita nome/diaSemana/paradas (PATCH parcial); campos omitidos não mudam', async () => {
  const { prisma } = buildPrisma([
    { id: 'm1', companyId: 7, nome: 'Original', diaSemana: 1, paradasJson: [{ customerProfileId: 'c1' }] },
  ]);
  const svc = new LogisticaRotaModeloService(prisma);
  const dto = await svc.update(7, 'm1', { nome: 'Renomeado' });
  assert.equal(dto!.nome, 'Renomeado');
  assert.equal(dto!.diaSemana, 1, 'diaSemana omitido não muda');
  assert.deepEqual(dto!.paradas, [{ customerProfileId: 'c1' }], 'paradas omitidas não mudam');
});

test('update: id de OUTRA empresa → null (404 no controller), nada é escrito', async () => {
  const { prisma, store } = buildPrisma([{ id: 'm1', companyId: 7, nome: 'A', diaSemana: null, paradasJson: [] }]);
  const svc = new LogisticaRotaModeloService(prisma);
  const res = await svc.update(999, 'm1', { nome: 'Hackeado' });
  assert.equal(res, null);
  assert.equal(store.get('m1')!.nome, 'A', 'nome original intocado');
});

test('remove: apaga o modelo da própria empresa e devolve true', async () => {
  const { prisma, store } = buildPrisma([{ id: 'm1', companyId: 7, nome: 'A', diaSemana: null, paradasJson: [] }]);
  const svc = new LogisticaRotaModeloService(prisma);
  const ok = await svc.remove(7, 'm1');
  assert.equal(ok, true);
  assert.equal(store.has('m1'), false);
});

test('remove: id de OUTRA empresa → false, não apaga', async () => {
  const { prisma, store } = buildPrisma([{ id: 'm1', companyId: 7, nome: 'A', diaSemana: null, paradasJson: [] }]);
  const svc = new LogisticaRotaModeloService(prisma);
  const ok = await svc.remove(999, 'm1');
  assert.equal(ok, false);
  assert.equal(store.has('m1'), true);
});

test('remove: id inexistente → false', async () => {
  const { prisma } = buildPrisma([]);
  const svc = new LogisticaRotaModeloService(prisma);
  assert.equal(await svc.remove(7, 'nao-existe'), false);
});

// PR20072026 W1 — nome único por empresa (case-insensitive/trim), 409 ROTA_NOME_DUPLICADO.

test('create: nome duplicado (case-insensitive) na MESMA empresa → 409 ROTA_NOME_DUPLICADO', async () => {
  const { prisma } = buildPrisma([{ id: 'm1', companyId: 7, nome: 'Segunda — Centro', diaSemana: 1, paradasJson: [] }]);
  const svc = new LogisticaRotaModeloService(prisma);
  await assert.rejects(
    () => svc.create(7, { nome: '  segunda — centro  ' }),
    (err: any) => {
      assert.equal(err.status, 409);
      assert.equal(err.getResponse().code, 'ROTA_NOME_DUPLICADO');
      return true;
    },
  );
});

test('create: mesmo nome em OUTRA empresa não conflita', async () => {
  const { prisma } = buildPrisma([{ id: 'm1', companyId: 7, nome: 'Segunda', diaSemana: 1, paradasJson: [] }]);
  const svc = new LogisticaRotaModeloService(prisma);
  const dto = await svc.create(8, { nome: 'Segunda' });
  assert.equal(dto.nome, 'Segunda');
});

test('update: renomear para um nome já usado por OUTRO modelo → 409 ROTA_NOME_DUPLICADO', async () => {
  const { prisma } = buildPrisma([
    { id: 'm1', companyId: 7, nome: 'Segunda', diaSemana: 1, paradasJson: [] },
    { id: 'm2', companyId: 7, nome: 'Terça', diaSemana: 2, paradasJson: [] },
  ]);
  const svc = new LogisticaRotaModeloService(prisma);
  await assert.rejects(
    () => svc.update(7, 'm2', { nome: 'SEGUNDA' }),
    (err: any) => {
      assert.equal(err.status, 409);
      assert.equal(err.getResponse().code, 'ROTA_NOME_DUPLICADO');
      return true;
    },
  );
});

test('update: renomear pro MESMO nome do próprio modelo não conflita', async () => {
  const { prisma } = buildPrisma([{ id: 'm1', companyId: 7, nome: 'Segunda', diaSemana: 1, paradasJson: [] }]);
  const svc = new LogisticaRotaModeloService(prisma);
  const dto = await svc.update(7, 'm1', { nome: 'Segunda' });
  assert.equal(dto!.nome, 'Segunda');
});

// ── PR20072026-ROTA-SALVA F2 — POST /rota-modelos/:id/gerar (lista EXATA) ────

const COMPANY = 7;
const GERAR_DATE = '2026-07-20';
const USER = 1;

function buildGerarPrisma(
  seed: {
    modelos?: any[];
    customerProfiles?: any[];
    locais?: any[];
    clienteProdutos?: any[];
    produtos?: any[];
    entregas?: any[];
    contatos?: any[];
    planos?: any[];
    users?: any[];
    rotas?: any[];
    indicacoes?: any[];
  } = {},
) {
  const modelos = new Map<string, any>((seed.modelos ?? []).map((r) => [r.id, { ...r }]));
  const customerProfiles = new Map<string, any>((seed.customerProfiles ?? []).map((r) => [r.id, { ...r }]));
  const locais = new Map<string, any>((seed.locais ?? []).map((r) => [r.id, { ...r }]));
  const clienteProdutos = new Map<string, any>((seed.clienteProdutos ?? []).map((r) => [r.id, { ...r }]));
  const produtos = new Map<number, any>((seed.produtos ?? []).map((r) => [r.id, { ...r }]));
  const entregas = new Map<string, any>((seed.entregas ?? []).map((r) => [r.id, { ...r }]));
  const contatos = new Map<string, any>((seed.contatos ?? []).map((r) => [r.id, { ...r }]));
  let entregaSeq = 0;

  const prisma: any = {
    logisticaRotaModelo: {
      findFirst: async ({ where }: any) => {
        const row = Array.from(modelos.values()).find((r) => r.id === where.id && r.companyId === where.companyId);
        return row ? { id: row.id, paradasJson: row.paradasJson } : null;
      },
      findMany: async ({ where }: any) => Array.from(modelos.values())
        .filter((r) => r.companyId === where.companyId)
        .map((r) => ({ id: r.id, paradasJson: r.paradasJson })),
    },
    customerProfile: {
      findFirst: async ({ where }: any) => {
        const row = Array.from(customerProfiles.values()).find(
          (r) => r.id === where.id && r.companyId === where.companyId,
        );
        // 27/07 — o gerar passou a exigir CLIENTE VIVO. Seeds antigos não dizem
        // status/isCliente: o default aqui é "vivo", que era o mundo que eles
        // descreviam. Quem quer testar o fantasma semeia status:'deleted'.
        return row
          ? { id: row.id, name: row.name, status: row.status ?? 'active', isCliente: row.isCliente ?? true }
          : null;
      },
    },
    // AGENDA-SEMANAL — 2º degrau da cascata de itens do gerar (o 1º é o snapshot
    // da parada, o 3º é o vínculo legado). Sem seed = empresa sem plano.
    logisticaPlanoEntrega: {
      findFirst: async ({ where }: any) => {
        const row = (seed.planos ?? []).find((r: any) => (
          r.companyId === where.companyId
          && r.customerProfileId === where.customerProfileId
          && (where.localId === undefined || (r.localId ?? null) === where.localId)
          && r.ativo === where.ativo
        ));
        return row ? { itens: row.itens ?? [] } : null;
      },
    },
    localEntrega: {
      findFirst: async ({ where }: any) => {
        const row = Array.from(locais.values()).find(
          (r) =>
            r.id === where.id && r.companyId === where.companyId && r.customerProfileId === where.customerProfileId,
        );
        return row ? { id: row.id } : null;
      },
    },
    clienteProduto: {
      findMany: async ({ where }: any) => {
        return Array.from(clienteProdutos.values())
          .filter(
            (r) =>
              r.companyId === where.companyId &&
              r.customerProfileId === where.customerProfileId &&
              r.ativo === where.ativo,
          )
          .map((r) => {
            const produto = produtos.get(r.productId);
            return {
              productId: r.productId,
              qtdPadrao: r.qtdPadrao,
              precoAcordado: r.precoAcordado ?? null,
              product: produto ? { price: produto.price ?? null, priceCents: produto.priceCents ?? null } : null,
            };
          });
      },
    },
    entrega: {
      findFirst: async ({ where }: any) => {
        const row = Array.from(entregas.values()).find((r) => {
          if (r.companyId !== where.companyId) return false;
          if (r.customerProfileId !== where.customerProfileId) return false;
          if (r.localId !== where.localId) return false;
          // 27/07 — o gerar procura a ABERTA primeiro (o dia acumula cancelada
          // de montagem abandonada) e só depois qualquer uma.
          if (where.status?.in && !where.status.in.includes(r.status ?? 'agendada')) return false;
          const t = new Date(r.scheduledAt).getTime();
          return t >= where.scheduledAt.gte.getTime() && t <= where.scheduledAt.lte.getTime();
        });
        return row ? { id: row.id, entregadorId: row.entregadorId ?? null, status: row.status ?? 'agendada' } : null;
      },
      findMany: async ({ where }: any) => Array.from(entregas.values()).filter((r) => {
        if (r.companyId !== where.companyId) return false;
        if (where.customerProfileId?.in && !where.customerProfileId.in.includes(r.customerProfileId)) return false;
        if (where.scheduledAt) {
          const t = new Date(r.scheduledAt).getTime();
          if (t < where.scheduledAt.gte.getTime() || t > where.scheduledAt.lte.getTime()) return false;
        }
        return true;
      }).map((r) => ({
        customerProfileId: r.customerProfileId,
        status: r.status ?? 'agendada',
        entregadorId: r.entregadorId ?? null,
      })),
      create: async ({ data }: any) => {
        const id = `entrega-${++entregaSeq}`;
        entregas.set(id, { id, ...data });
        return { id };
      },
      update: async ({ where, data }: any) => {
        const row = entregas.get(where.id);
        if (!row) throw new Error('entrega inexistente');
        entregas.set(where.id, { ...row, ...data });
        return { id: where.id };
      },
      updateMany: async ({ where, data }: any) => {
        const row = entregas.get(where.id);
        if (!row) return { count: 0 };
        if (where.entregadorId === null && row.entregadorId != null) return { count: 0 };
        entregas.set(where.id, { ...row, ...data });
        return { count: 1 };
      },
    },
    contato: {
      findFirst: async ({ where }: any) => {
        let rows = Array.from(contatos.values()).filter(
          (r) => r.companyId === where.companyId && r.customerProfileId === where.customerProfileId,
        );
        if (where.isPrincipal !== undefined) rows = rows.filter((r) => r.isPrincipal === where.isPrincipal);
        rows = rows.slice().sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime());
        return rows[0] ?? null;
      },
    },
    // 31/07 — o 409 passou a contar QUEM está com a parada e desde quando
    // (explicarDono), e o painel lê o estado do dia (estadoDoDia).
    user: {
      findFirst: async ({ where }: any) => (seed.users ?? []).find(
        (r: any) => r.id === where.id && r.companyId === where.companyId,
      ) ?? null,
      findMany: async ({ where }: any) => (seed.users ?? []).filter(
        (r: any) => r.companyId === where.companyId && (where.id?.in ?? []).includes(r.id),
      ),
    },
    logisticaRoute: {
      findFirst: async ({ where }: any) => (seed.rotas ?? []).find(
        (r: any) => r.companyId === where.companyId && r.entregadorId === where.entregadorId && r.routeDate === where.routeDate,
      ) ?? null,
      findMany: async ({ where }: any) => (seed.rotas ?? []).filter((r: any) => (
        r.companyId === where.companyId
        && r.routeDate === where.routeDate
        && (where.status?.in ?? []).includes(r.status)
        && (where.operationalEndedAt === null ? r.operationalEndedAt == null : true)
      )),
    },
    logisticaRotaIndicada: {
      findMany: async ({ where }: any) => (seed.indicacoes ?? []).filter(
        (r: any) => r.companyId === where.companyId && (where.rotaModeloId?.in ?? []).includes(r.rotaModeloId),
      ),
    },
  };
  return { prisma, modelos, entregas, clienteProdutos };
}

test('gerar: modelo de OUTRA empresa → 404', async () => {
  const { prisma } = buildGerarPrisma({
    modelos: [{ id: 'm1', companyId: 999, paradasJson: [] }],
  });
  const svc = new LogisticaRotaModeloService(prisma);
  await assert.rejects(() => svc.gerar(COMPANY, 'm1', GERAR_DATE, USER), /não encontrado/);
});

test('gerar: cliente COM vínculo ativo → Entrega criada com itens "de sempre" (ignora dia/vencimento)', async () => {
  const { prisma, entregas } = buildGerarPrisma({
    modelos: [{ id: 'm1', companyId: COMPANY, paradasJson: [{ customerProfileId: 'c1' }] }],
    customerProfiles: [{ id: 'c1', companyId: COMPANY, name: 'Josefina' }],
    produtos: [{ id: 1, price: 7, priceCents: null }],
    clienteProdutos: [
      {
        id: 'cp1',
        companyId: COMPANY,
        customerProfileId: 'c1',
        productId: 1,
        qtdPadrao: 2,
        precoAcordado: null,
        ativo: true,
        // vencimento no futuro/nenhum — gerar() ignora isso de propósito.
        diasSemana: null,
        proximaData: null,
      },
    ],
  });
  const svc = new LogisticaRotaModeloService(prisma);
  const res = await svc.gerar(COMPANY, 'm1', GERAR_DATE, USER);

  assert.equal(res.deliveryIds.length, 1);
  assert.deepEqual(res.avisos, []);
  const entrega = entregas.get(res.deliveryIds[0])!;
  assert.equal(entrega.customerProfileId, 'c1');
  assert.equal(entrega.origem, 'avulsa');
  assert.equal(entrega.status, 'agendada');
  assert.equal(entrega.cobrancaStatus, 'pendente');
  assert.equal(entrega.quantidade, 2);
  assert.equal(entrega.valor, 14);
  assert.equal(entrega.itens.create.length, 1);
  assert.equal(entrega.itens.create[0].productId, 1);
  assert.equal(entrega.itens.create[0].qtdPrevista, 2);
  assert.equal(entrega.itens.create[0].valorUnit, 7);
});

// FIX 21/07 — o dono limpava o dia (tudo vira 'cancelada') e a rota salva parava
// de montar: gerar devolvia o id da cancelada e o planejar descartava. Sem erro na
// tela, rota vazia. Cancelada agora REABRE a mesma linha (não duplica, não cobra 2x).
test('gerar: entrega CANCELADA do dia → reabre a MESMA linha em vez de devolver rota vazia', async () => {
  const { prisma, entregas } = buildGerarPrisma({
    modelos: [{ id: 'm1', companyId: COMPANY, paradasJson: [{ customerProfileId: 'c1' }] }],
    customerProfiles: [{ id: 'c1', companyId: COMPANY, name: 'Josefina' }],
    produtos: [{ id: 1, price: 7, priceCents: null }],
    clienteProdutos: [
      { id: 'cp1', companyId: COMPANY, customerProfileId: 'c1', productId: 1, qtdPadrao: 2, precoAcordado: null, ativo: true, diasSemana: null, proximaData: null },
    ],
    entregas: [
      {
        id: 'e-cancelada',
        companyId: COMPANY,
        customerProfileId: 'c1',
        localId: null,
        scheduledAt: new Date(2026, 6, 20, 0, 0, 0, 0),
        status: 'cancelada',
        entregadorId: USER,
        rotaOrdem: 3,
      },
    ],
  });
  const svc = new LogisticaRotaModeloService(prisma);
  const res = await svc.gerar(COMPANY, 'm1', GERAR_DATE, USER);

  assert.deepEqual(res.deliveryIds, ['e-cancelada']);
  assert.equal(entregas.size, 1, 'não cria entrega nova — reaproveita a cancelada');
  const entrega = entregas.get('e-cancelada')!;
  assert.equal(entrega.status, 'agendada');
  assert.equal(entrega.rotaOrdem, null, 'não sobra rastro da rota antiga');
  assert.equal(entrega.entregadorId, USER);
  assert.equal(entrega.quantidade, 2);
  assert.equal(entrega.valor, 14);
});

test('gerar: entrega JÁ ENTREGUE do dia → aviso e parada ignorada (não vira rota fantasma)', async () => {
  const { prisma } = buildGerarPrisma({
    modelos: [{ id: 'm1', companyId: COMPANY, paradasJson: [{ customerProfileId: 'c1' }] }],
    customerProfiles: [{ id: 'c1', companyId: COMPANY, name: 'Josefina' }],
    entregas: [
      { id: 'e-entregue', companyId: COMPANY, customerProfileId: 'c1', localId: null, scheduledAt: new Date(2026, 6, 20, 0, 0, 0, 0), status: 'entregue', entregadorId: USER },
    ],
  });
  const svc = new LogisticaRotaModeloService(prisma);
  const res = await svc.gerar(COMPANY, 'm1', GERAR_DATE, USER);

  assert.deepEqual(res.deliveryIds, []);
  assert.equal(res.avisos.length, 1);
  assert.match(res.avisos[0], /já foi entregue hoje/);
});

// CONTRATO MUDOU (27/07): parada sem NENHUMA fonte de item não vira mais uma
// entrega vazia (parada de R$0, sem produto, que só suja a rota) — vira aviso.
test('gerar: sem snapshot, sem plano e sem vínculo → aviso, NÃO cria entrega vazia', async () => {
  const { prisma, entregas } = buildGerarPrisma({
    modelos: [{ id: 'm1', companyId: COMPANY, paradasJson: [{ customerProfileId: 'c1' }] }],
    customerProfiles: [{ id: 'c1', companyId: COMPANY, name: 'Josefina' }],
  });
  const svc = new LogisticaRotaModeloService(prisma);
  const res = await svc.gerar(COMPANY, 'm1', GERAR_DATE, USER);

  assert.deepEqual(res.deliveryIds, []);
  assert.equal(entregas.size, 0);
  assert.match(res.avisos[0], /sem itens na Agenda/);
});

// 🔴 O ERRO QUE O DONO VIU (27/07, rota "Quarta"): o "Salvar rota" da montagem
// grava a parada SÓ com cliente+local (quem manda no que ele recebe é a Agenda).
// O gerar exigia snapshot e devolvia rota vazia com um aviso por parada.
test('gerar: parada SEM snapshot cai no PLANO da Agenda e materializa', async () => {
  const { prisma, entregas } = buildGerarPrisma({
    modelos: [{ id: 'm1', companyId: COMPANY, paradasJson: [{ customerProfileId: 'c1' }] }],
    customerProfiles: [{ id: 'c1', companyId: COMPANY, name: 'Josefina' }],
    produtos: [{ id: 9, price: 11, priceCents: null }],
    planos: [{
      companyId: COMPANY,
      customerProfileId: 'c1',
      localId: null,
      ativo: true,
      itens: [{ productId: 9, qtd: 3, valorUnit: 11 }],
    }],
  });
  const svc = new LogisticaRotaModeloService(prisma);
  const res = await svc.gerar(COMPANY, 'm1', GERAR_DATE, USER);

  assert.equal(res.deliveryIds.length, 1, 'a rota salva pela montagem GERA');
  assert.deepEqual(res.avisos, []);
  const entrega = entregas.get(res.deliveryIds[0])!;
  assert.equal(entrega.quantidade, 3);
  assert.equal(entrega.valor, 33);
  assert.equal(entrega.itens.create[0].productId, 9);
});

// 🔴 "Quem é Elaine?" (27/07): 23 perfis nasceram deleted na importação e os
// planos deles ficaram ativos — a rota mostrava nome que o cadastro não tem.
test('gerar: cliente fora do cadastro (deleted) → aviso COM O NOME, parada ignorada', async () => {
  const { prisma, entregas } = buildGerarPrisma({
    modelos: [{ id: 'm1', companyId: COMPANY, paradasJson: [{ customerProfileId: 'c1' }] }],
    customerProfiles: [{ id: 'c1', companyId: COMPANY, name: 'Elaine', status: 'deleted', isCliente: false }],
    produtos: [{ id: 1, price: 7, priceCents: null }],
    clienteProdutos: [
      { id: 'cp1', companyId: COMPANY, customerProfileId: 'c1', productId: 1, qtdPadrao: 2, precoAcordado: null, ativo: true, diasSemana: null, proximaData: null },
    ],
  });
  const svc = new LogisticaRotaModeloService(prisma);
  const res = await svc.gerar(COMPANY, 'm1', GERAR_DATE, USER);

  assert.deepEqual(res.deliveryIds, []);
  assert.equal(entregas.size, 0);
  assert.match(res.avisos[0], /Elaine não está mais no cadastro/);
});

// O dia acumula cancelada de cada montagem abandonada (560 para 156 clientes num
// dia só, medido em prod). A ABERTA tem que ganhar — senão a parada morre em
// "foi retirado de hoje" com a entrega viva do lado.
test('gerar: com cancelada E aberta no mesmo dia → usa a ABERTA', async () => {
  const { prisma } = buildGerarPrisma({
    modelos: [{ id: 'm1', companyId: COMPANY, paradasJson: [{ customerProfileId: 'c1' }] }],
    customerProfiles: [{ id: 'c1', companyId: COMPANY, name: 'Josefina' }],
    entregas: [
      { id: 'e-cancelada', companyId: COMPANY, customerProfileId: 'c1', localId: null, scheduledAt: new Date(2026, 6, 20, 8, 0, 0, 0), status: 'cancelada', entregadorId: USER },
      { id: 'e-aberta', companyId: COMPANY, customerProfileId: 'c1', localId: null, scheduledAt: new Date(2026, 6, 20, 9, 0, 0, 0), status: 'agendada', entregadorId: USER },
    ],
  });
  const svc = new LogisticaRotaModeloService(prisma);
  const res = await svc.gerar(COMPANY, 'm1', GERAR_DATE, USER);

  assert.deepEqual(res.deliveryIds, ['e-aberta']);
  assert.deepEqual(res.avisos, []);
});

test('gerar: cliente já agendado HOJE (mesmo local) → REUSA o id, não duplica', async () => {
  const { prisma, entregas } = buildGerarPrisma({
    modelos: [{ id: 'm1', companyId: COMPANY, paradasJson: [{ customerProfileId: 'c1' }] }],
    customerProfiles: [{ id: 'c1', companyId: COMPANY, name: 'Josefina' }],
    entregas: [
      {
        id: 'entrega-ja-existe',
        companyId: COMPANY,
        customerProfileId: 'c1',
        localId: null,
        scheduledAt: new Date(2026, 6, 20, 0, 0, 0, 0),
      },
    ],
  });
  const svc = new LogisticaRotaModeloService(prisma);
  const res = await svc.gerar(COMPANY, 'm1', GERAR_DATE, USER);

  assert.deepEqual(res.deliveryIds, ['entrega-ja-existe']);
  assert.equal(entregas.size, 1, 'não criou uma 2ª entrega');
});

test('gerar: rodar 2× no MESMO dia é idempotente', async () => {
  const { prisma, entregas } = buildGerarPrisma({
    modelos: [{ id: 'm1', companyId: COMPANY, paradasJson: [{ customerProfileId: 'c1' }] }],
    customerProfiles: [{ id: 'c1', companyId: COMPANY, name: 'Josefina' }],
    produtos: [{ id: 1, price: 7, priceCents: null }],
    clienteProdutos: [
      { id: 'cp1', companyId: COMPANY, customerProfileId: 'c1', productId: 1, qtdPadrao: 1, precoAcordado: null, ativo: true, diasSemana: null, proximaData: null },
    ],
  });
  const svc = new LogisticaRotaModeloService(prisma);
  const primeira = await svc.gerar(COMPANY, 'm1', GERAR_DATE, USER);
  const segunda = await svc.gerar(COMPANY, 'm1', GERAR_DATE, USER);

  assert.deepEqual(segunda.deliveryIds, primeira.deliveryIds);
  assert.equal(entregas.size, 1, '2ª chamada não duplica a entrega');
});

test('gerar: NÃO avança proximaData de nenhum vínculo (só a recorrência automática mexe nisso)', async () => {
  const { prisma, clienteProdutos } = buildGerarPrisma({
    modelos: [{ id: 'm1', companyId: COMPANY, paradasJson: [{ customerProfileId: 'c1' }] }],
    customerProfiles: [{ id: 'c1', companyId: COMPANY, name: 'Josefina' }],
    produtos: [{ id: 1, price: 5, priceCents: null }],
    clienteProdutos: [
      {
        id: 'cp1',
        companyId: COMPANY,
        customerProfileId: 'c1',
        productId: 1,
        qtdPadrao: 1,
        precoAcordado: null,
        ativo: true,
        diasSemana: '1,2,3',
        proximaData: new Date(2026, 6, 15),
      },
    ],
  });
  const svc = new LogisticaRotaModeloService(prisma);
  await svc.gerar(COMPANY, 'm1', GERAR_DATE, USER);

  const cp = clienteProdutos.get('cp1')!;
  assert.deepEqual(cp.proximaData, new Date(2026, 6, 15), 'proximaData intocada');
});

test('gerar: cliente de OUTRA empresa / excluído → pula com aviso; preserva ORDEM dos demais', async () => {
  const { prisma, entregas } = buildGerarPrisma({
    modelos: [
      {
        id: 'm1',
        companyId: COMPANY,
        paradasJson: [
          { customerProfileId: 'c-fantasma' },
          { customerProfileId: 'c1' },
          { customerProfileId: 'c2' },
        ],
      },
    ],
    customerProfiles: [
      { id: 'c1', companyId: COMPANY, name: 'A' },
      { id: 'c2', companyId: COMPANY, name: 'B' },
    ],
    produtos: [{ id: 1, price: 7, priceCents: null }],
    clienteProdutos: [
      { id: 'cp1', companyId: COMPANY, customerProfileId: 'c1', productId: 1, qtdPadrao: 1, precoAcordado: null, ativo: true, diasSemana: null, proximaData: null },
      { id: 'cp2', companyId: COMPANY, customerProfileId: 'c2', productId: 1, qtdPadrao: 1, precoAcordado: null, ativo: true, diasSemana: null, proximaData: null },
    ],
  });
  const svc = new LogisticaRotaModeloService(prisma);
  const res = await svc.gerar(COMPANY, 'm1', GERAR_DATE, USER);

  assert.equal(res.avisos.length, 1);
  assert.equal(res.deliveryIds.length, 2);
  assert.equal(entregas.get(res.deliveryIds[0])!.customerProfileId, 'c1');
  assert.equal(entregas.get(res.deliveryIds[1])!.customerProfileId, 'c2');
});

// ══════════════════════════════════════════════════════════════════════════════
// 🔴 VACINA 31/07 — O 409 DO PRINT DO DONO. Ele montou a rota no desktop e
// mandou pro motorista; o motorista INICIOU e CANCELOU no aparelho. O descarte
// mata a entrega ('cancelada') e deixa o `entregadorId` colado nela — rastro de
// quem devolveu. O `gerar` lia esse rastro como POSSE e trancava a parada morta
// no nome dele até a meia-noite: "A entrega de Márcia já está atribuída a outro
// motorista", com ninguém na rua e ninguém que pudesse pegar.
// ══════════════════════════════════════════════════════════════════════════════
test('gerar: CANCELADA de outro motorista NÃO trava mais — a rota salva assume a parada', async () => {
  const OUTRO = 42;
  const { prisma, entregas } = buildGerarPrisma({
    modelos: [{ id: 'm1', companyId: COMPANY, paradasJson: [{ customerProfileId: 'c1' }] }],
    customerProfiles: [{ id: 'c1', companyId: COMPANY, name: 'Márcia' }],
    produtos: [{ id: 1, price: 7, priceCents: null }],
    clienteProdutos: [
      { id: 'cp1', companyId: COMPANY, customerProfileId: 'c1', productId: 1, qtdPadrao: 2, precoAcordado: null, ativo: true, diasSemana: null, proximaData: null },
    ],
    entregas: [
      {
        id: 'e-devolvida',
        companyId: COMPANY,
        customerProfileId: 'c1',
        localId: null,
        scheduledAt: new Date(2026, 6, 20, 0, 0, 0, 0),
        status: 'cancelada',
        entregadorId: OUTRO,
      },
    ],
  });
  const svc = new LogisticaRotaModeloService(prisma);
  const res = await svc.gerar(COMPANY, 'm1', GERAR_DATE, USER);

  assert.deepEqual(res.deliveryIds, ['e-devolvida'], 'a parada morta volta pra quem pediu a rota');
  assert.equal(entregas.get('e-devolvida')!.entregadorId, USER, 'reabrir reatribui pra quem montou');
  assert.equal(entregas.get('e-devolvida')!.status, 'agendada');
});

test('gerar: entrega ABERTA de outro motorista continua barrada — e agora a mensagem diz QUEM e desde quando', async () => {
  const OUTRO = 42;
  const { prisma } = buildGerarPrisma({
    modelos: [{ id: 'm1', companyId: COMPANY, paradasJson: [{ customerProfileId: 'c1' }] }],
    customerProfiles: [{ id: 'c1', companyId: COMPANY, name: 'Márcia' }],
    entregas: [
      {
        id: 'e-viva',
        companyId: COMPANY,
        customerProfileId: 'c1',
        localId: null,
        scheduledAt: new Date(2026, 6, 20, 0, 0, 0, 0),
        status: 'em_rota',
        entregadorId: OUTRO,
      },
    ],
    users: [{ id: OUTRO, companyId: COMPANY, name: 'João', username: 'joao' }],
    rotas: [
      {
        companyId: COMPANY,
        entregadorId: OUTRO,
        routeDate: GERAR_DATE,
        status: 'ACTIVE',
        // 11:02 em São Paulo (-03) — o texto TEM que sair 11:02, não 14:02:
        // container roda em UTC (ver teste-verde-no-meu-fuso-nao-vale).
        startedAt: new Date(Date.UTC(2026, 6, 20, 14, 2, 0)),
        operationalEndedAt: null,
      },
    ],
  });
  const svc = new LogisticaRotaModeloService(prisma);
  await assert.rejects(
    () => svc.gerar(COMPANY, 'm1', GERAR_DATE, USER),
    (erro: any) => {
      const msg = String(erro?.response?.message ?? erro?.message ?? '');
      assert.match(msg, /Márcia/);
      assert.match(msg, /João/);
      assert.match(msg, /na rua desde 11:02/);
      return true;
    },
  );
});

// ══════════════════════════════════════════════════════════════════════════════
// 31/07 — ESTADO DAS ROTAS SALVAS (o painel deixa de esconder o que está
// acontecendo). `podeMontar` é a MESMA régua do gerar: vitrine e caixa não
// podem ter porteiros diferentes.
// ══════════════════════════════════════════════════════════════════════════════
test('estadoDoDia: rota com paradas de OUTRO motorista na rua → na_rua, com nome, e podeMontar=false', async () => {
  const OUTRO = 42;
  const { prisma } = buildGerarPrisma({
    modelos: [{ id: 'm1', companyId: COMPANY, paradasJson: [{ customerProfileId: 'c1' }, { customerProfileId: 'c2' }] }],
    entregas: [
      { id: 'e1', companyId: COMPANY, customerProfileId: 'c1', localId: null, scheduledAt: new Date(2026, 6, 20, 9), status: 'entregue', entregadorId: OUTRO },
      { id: 'e2', companyId: COMPANY, customerProfileId: 'c2', localId: null, scheduledAt: new Date(2026, 6, 20, 9), status: 'em_rota', entregadorId: OUTRO },
    ],
    users: [{ id: OUTRO, companyId: COMPANY, name: 'João', username: 'joao' }],
    rotas: [{ companyId: COMPANY, entregadorId: OUTRO, routeDate: GERAR_DATE, status: 'ACTIVE', startedAt: new Date(), operationalEndedAt: null }],
  });
  const svc = new LogisticaRotaModeloService(prisma);
  const [estado] = await svc.estadoDoDia(COMPANY, GERAR_DATE, USER);

  assert.equal(estado.estado, 'na_rua');
  assert.equal(estado.pessoaNome, 'João');
  assert.equal(estado.pessoaEhVoce, false);
  assert.equal(estado.entregues, 1);
  assert.equal(estado.comEle, 1);
  assert.equal(estado.total, 2);
  assert.equal(estado.podeMontar, false, 'o painel bloqueia ANTES do 409');
});

test('estadoDoDia: só cancelada no dia → livre e podeMontar=true (cancelada não é posse)', async () => {
  const OUTRO = 42;
  const { prisma } = buildGerarPrisma({
    modelos: [{ id: 'm1', companyId: COMPANY, paradasJson: [{ customerProfileId: 'c1' }] }],
    entregas: [
      { id: 'e1', companyId: COMPANY, customerProfileId: 'c1', localId: null, scheduledAt: new Date(2026, 6, 20, 9), status: 'cancelada', entregadorId: OUTRO },
    ],
    users: [{ id: OUTRO, companyId: COMPANY, name: 'João', username: 'joao' }],
  });
  const svc = new LogisticaRotaModeloService(prisma);
  const [estado] = await svc.estadoDoDia(COMPANY, GERAR_DATE, USER);

  assert.equal(estado.estado, 'livre');
  assert.equal(estado.podeMontar, true);
});

test('estadoDoDia: aceitou e devolveu hoje → devolvida, com quem e quantas atendeu', async () => {
  const OUTRO = 42;
  const { prisma } = buildGerarPrisma({
    modelos: [{ id: 'm1', companyId: COMPANY, paradasJson: [{ customerProfileId: 'c1' }, { customerProfileId: 'c2' }] }],
    users: [{ id: OUTRO, companyId: COMPANY, name: 'João', username: 'joao' }],
    indicacoes: [
      {
        companyId: COMPANY,
        rotaModeloId: 'm1',
        paraUserId: OUTRO,
        status: 'desfeita',
        respondidaEm: new Date(2026, 6, 20, 14, 31),
      },
    ],
  });
  const svc = new LogisticaRotaModeloService(prisma);
  const [estado] = await svc.estadoDoDia(COMPANY, GERAR_DATE, USER);

  assert.equal(estado.estado, 'devolvida');
  assert.equal(estado.pessoaNome, 'João');
  assert.equal(estado.entregues, 0, '0 de 2 atendidas — é o recado que faltava');
  assert.equal(estado.total, 2);
  assert.equal(estado.podeMontar, true, 'devolvida NÃO tranca: a rota está livre pra outra pessoa');
});

test('estadoDoDia: multi-tenant — modelo/entrega de outra empresa não vaza', async () => {
  const { prisma } = buildGerarPrisma({
    modelos: [{ id: 'm-alheio', companyId: 999, paradasJson: [{ customerProfileId: 'c1' }] }],
  });
  const svc = new LogisticaRotaModeloService(prisma);
  assert.deepEqual(await svc.estadoDoDia(COMPANY, GERAR_DATE, USER), []);
});
