import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaAgendaService } from './logistica-agenda.service';
import { LogisticaRecorrenciaService } from './logistica-recorrencia.service';

/**
 * 🔴 F2 (09/08) — A MÃO FOI INVERTIDA: O CADASTRO ESCREVE O PLANO.
 *
 * Até aqui "definir o dia do cliente" gravava `ClienteProduto.diasSemana` e um
 * ESPELHO (`logistica-agenda-espelho.util.ts`) copiava aquilo pros planos
 * depois. Eram DUAS agendas pra mesma pergunta, e o `generateDay` só lia a
 * segunda: toda falha do espelho virava "o dia está gravado na tela do cadastro
 * e o cliente não aparece na rota" — o sintoma que apareceu no g15 (28/07) e
 * voltou em 05/08 com legenda e filtro discordando na tela Clientes.
 *
 * O que estes testes travam:
 *   1. `definirDiasDoCliente` NÃO escreve dia nenhum no vínculo — ele delega
 *      pra Agenda, que grava `LogisticaPlanoEntrega`.
 *   2. Dia PEDIDO sem plano → plano NASCE, com os itens vindos dos vínculos
 *      (é o teste de aceite do dono: cliente novo com dia entra na rota).
 *   3. Dia que SAIU → plano é PAUSADO, nunca apagado (histórico e ordem da rota
 *      continuam de pé).
 *   4. Multilocal: cada local do cliente ganha o plano do dia com os itens DELE
 *      — nada atravessa local, nada atravessa empresa.
 *   5. Sincronizar o item de um vínculo NÃO ressuscita dia pausado.
 */

const EMPRESA = 7;
const CLIENTE = 'cli-1';

type PlanoFake = {
  id: string;
  localId: string | null;
  diaSemana: number;
  ativo: boolean;
  itens?: Array<{ productId: number; qtd: number; valorUnit: number }>;
};

/**
 * Agenda com `createPlan`/`updatePlan` espionados. A F2 é sobre QUAIS planos são
 * criados/pausados — a transação que grava o plano e a parada já é provada em
 * `logistica-agenda-generateday.service.test.ts` e não se remonta aqui.
 */
function agendaEspia(planos: PlanoFake[], vinculos: any[]) {
  const chamadas: any[] = [];
  const prisma: any = {
    logisticaPlanoEntrega: {
      findMany: async (args: any) => {
        const w = args?.where ?? {};
        return planos.filter((p) => (
          (w.customerProfileId === undefined || w.customerProfileId === CLIENTE)
          && (w.ativo === undefined || p.ativo === w.ativo)
          && (w.localId === undefined || (p.localId ?? null) === (w.localId ?? null))
        )).map((p) => ({ ...p, itens: p.itens ?? [] }));
      },
    },
    clienteProduto: {
      findMany: async () => vinculos,
    },
  };
  const agenda = new LogisticaAgendaService(prisma);
  (agenda as any).createPlan = async (_c: number, input: any) => {
    chamadas.push(['criar', input.localId ?? null, input.diaSemana, input.itens]);
    return {};
  };
  (agenda as any).updatePlan = async (_c: number, id: string, input: any) => {
    chamadas.push(['atualizar', id, input]);
    return {};
  };
  return { agenda, chamadas, prisma };
}

const VINCULO_GALAO = {
  localId: null,
  productId: 10,
  qtdPadrao: 2,
  precoAcordado: 7.5,
  product: { price: 9, priceCents: 900 },
  customerProfile: { precoPadrao: null },
};

test('definirDiasDoCliente: escreve PLANO e NÃO toca em dia do vínculo', async () => {
  const { agenda, chamadas, prisma } = agendaEspia([], [VINCULO_GALAO]);
  let vinculoUpdates = 0;
  prisma.customerProfile = { findFirst: async () => ({ id: CLIENTE }) };
  prisma.clienteProduto.update = async () => { vinculoUpdates += 1; return {}; };

  const svc = new LogisticaRecorrenciaService(prisma, agenda);
  const res = await svc.definirDiasDoCliente(EMPRESA, CLIENTE, [3, 1, 1]);

  assert.equal(vinculoUpdates, 0, 'o vínculo NÃO guarda mais dia — nenhuma escrita nele');
  assert.equal(res.diasSemana, '1,3', 'dias normalizados: sem repetido, em ordem');
  assert.deepEqual(
    chamadas.map((c) => [c[0], c[2]]),
    [['criar', 1], ['criar', 3]],
    'um plano por dia pedido',
  );
  assert.deepEqual(
    chamadas[0][3],
    [{ productId: 10, qtd: 2, valorUnit: 7.5 }],
    'o item da visita vem do vínculo (preço acordado vence o catálogo)',
  );
});

test('definirDiasDaVisita: dia que SAIU é PAUSADO, nunca apagado', async () => {
  const { agenda, chamadas } = agendaEspia(
    [
      { id: 'p-seg', localId: null, diaSemana: 1, ativo: true },
      { id: 'p-qui', localId: null, diaSemana: 4, ativo: true },
    ],
    [VINCULO_GALAO],
  );

  await agenda.definirDiasDaVisita(EMPRESA, CLIENTE, [1]);

  const pausados = chamadas.filter((c) => c[0] === 'atualizar' && c[2]?.ativo === false);
  assert.deepEqual(pausados.map((c) => c[1]), ['p-qui'], 'só a quinta sai — e sai pausada');
  assert.equal(
    chamadas.some((c) => c[0] === 'criar'),
    false,
    'a segunda já tinha plano: reaproveita, não duplica',
  );
});

test('definirDiasDaVisita: reaproveitar visita MESCLA — item só da Agenda não some calado', async () => {
  const { agenda, chamadas } = agendaEspia(
    [{
      id: 'p-seg',
      localId: null,
      diaSemana: 1,
      ativo: true,
      // 'brinde' (99) só existe na visita: foi posto pela tela da Agenda, não
      // tem vínculo. Remarcar o dia NÃO pode apagá-lo.
      itens: [{ productId: 99, qtd: 1, valorUnit: 0 }, { productId: 10, qtd: 1, valorUnit: 9 }],
    }],
    [VINCULO_GALAO],
  );

  await agenda.definirDiasDaVisita(EMPRESA, CLIENTE, [1]);

  assert.deepEqual(chamadas, [[
    'atualizar',
    'p-seg',
    {
      ativo: true,
      itens: [
        { productId: 99, qtd: 1, valorUnit: 0 },
        { productId: 10, qtd: 2, valorUnit: 7.5 },
      ],
    },
  ]], 'o cadastro manda no item DELE (10); o resto da visita sobrevive');
});

test('definirDiasDaVisita: lista vazia = cliente sem dia fixo (tudo pausado)', async () => {
  const { agenda, chamadas } = agendaEspia(
    [{ id: 'p-seg', localId: null, diaSemana: 1, ativo: true }],
    [VINCULO_GALAO],
  );

  const res = await agenda.definirDiasDaVisita(EMPRESA, CLIENTE, []);

  assert.equal(res.diasSemana, null);
  assert.deepEqual(chamadas, [['atualizar', 'p-seg', { ativo: false }]]);
});

test('definirDiasDaVisita: multilocal — cada local ganha o plano do dia com os itens DELE', async () => {
  const { agenda, chamadas } = agendaEspia([], [
    { ...VINCULO_GALAO, localId: 'loc-a', productId: 10 },
    { ...VINCULO_GALAO, localId: 'loc-b', productId: 11, precoAcordado: null },
  ]);

  await agenda.definirDiasDaVisita(EMPRESA, CLIENTE, [2]);

  const criados = chamadas.filter((c) => c[0] === 'criar');
  assert.equal(criados.length, 2, 'dois locais = duas visitas na terça');
  const porLocal = new Map(criados.map((c) => [c[1], c[3]]));
  assert.deepEqual(porLocal.get('loc-a'), [{ productId: 10, qtd: 2, valorUnit: 7.5 }]);
  assert.deepEqual(
    porLocal.get('loc-b'),
    [{ productId: 11, qtd: 2, valorUnit: 9 }],
    'sem preço acordado cai no catálogo — e o item NÃO atravessa pro outro local',
  );
});

test('definirDiasDaVisita: cliente sem produto nenhum não ganha visita — e avisa', async () => {
  const { agenda, chamadas } = agendaEspia([], []);

  const res = await agenda.definirDiasDaVisita(EMPRESA, CLIENTE, [5]);

  assert.deepEqual(chamadas, [], 'visita sem item não existe: nada é criado');
  assert.equal(res.avisos.length, 1, 'e o vazio não é calado');
  assert.match(res.avisos[0], /produto/i);
});

test('espelharVinculoCadastro: produto novo entra nas visitas ATIVAS, sem ressuscitar dia pausado', async () => {
  const { agenda, chamadas, prisma } = agendaEspia(
    [
      { id: 'p-seg', localId: null, diaSemana: 1, ativo: true, itens: [{ productId: 11, qtd: 1, valorUnit: 4 }] },
      { id: 'p-sex', localId: null, diaSemana: 5, ativo: false, itens: [] },
    ],
    [VINCULO_GALAO],
  );
  prisma.clienteProduto.findFirst = async () => ({
    id: 'cp-1',
    customerProfileId: CLIENTE,
    localId: null,
    productId: 10,
    qtdPadrao: 2,
    ativo: true,
    precoAcordado: 7.5,
    product: { price: 9, priceCents: 900 },
    customerProfile: { precoPadrao: null },
  });

  const res = await agenda.espelharVinculoCadastro(EMPRESA, 'cp-1', null);

  assert.deepEqual(res.avisos, []);
  assert.deepEqual(chamadas, [[
    'atualizar',
    'p-seg',
    { itens: [{ productId: 11, qtd: 1, valorUnit: 4 }, { productId: 10, qtd: 2, valorUnit: 7.5 }] },
  ]], 'só a visita ATIVA é tocada — a sexta pausada continua pausada');
});

test('espelharVinculoCadastro: apagar o vínculo tira o item; visita que esvazia é PAUSADA', async () => {
  const { agenda, chamadas } = agendaEspia(
    [
      { id: 'p-seg', localId: null, diaSemana: 1, ativo: true, itens: [{ productId: 10, qtd: 2, valorUnit: 7.5 }] },
      { id: 'p-qua', localId: null, diaSemana: 3, ativo: true, itens: [{ productId: 10, qtd: 2, valorUnit: 7.5 }, { productId: 11, qtd: 1, valorUnit: 4 }] },
    ],
    [],
  );

  // vinculoId null = hard delete; só o snapshot ANTERIOR sobrevive.
  const res = await agenda.espelharVinculoCadastro(EMPRESA, null, {
    id: 'cp-1',
    customerProfileId: CLIENTE,
    localId: null,
    productId: 10,
    qtdPadrao: 2,
    ativo: true,
    valorUnit: 7.5,
  });

  assert.deepEqual(res.avisos, []);
  assert.deepEqual(chamadas, [
    ['atualizar', 'p-seg', { ativo: false }],
    ['atualizar', 'p-qua', { itens: [{ productId: 11, qtd: 1, valorUnit: 4 }] }],
  ]);
});

test('espelharVinculoCadastro: trocar de LOCAL move o item — nunca duplica', async () => {
  const { agenda, chamadas, prisma } = agendaEspia(
    [
      { id: 'p-a', localId: 'loc-a', diaSemana: 1, ativo: true, itens: [{ productId: 10, qtd: 2, valorUnit: 7.5 }] },
      { id: 'p-b', localId: 'loc-b', diaSemana: 1, ativo: true, itens: [{ productId: 11, qtd: 1, valorUnit: 4 }] },
    ],
    [],
  );
  prisma.clienteProduto.findFirst = async () => ({
    id: 'cp-1',
    customerProfileId: CLIENTE,
    localId: 'loc-b',
    productId: 10,
    qtdPadrao: 2,
    ativo: true,
    precoAcordado: 7.5,
    product: null,
    customerProfile: null,
  });

  await agenda.espelharVinculoCadastro(EMPRESA, 'cp-1', {
    id: 'cp-1',
    customerProfileId: CLIENTE,
    localId: 'loc-a',
    productId: 10,
    qtdPadrao: 2,
    ativo: true,
    valorUnit: 7.5,
  });

  assert.deepEqual(chamadas, [
    ['atualizar', 'p-a', { ativo: false }],
    ['atualizar', 'p-b', { itens: [{ productId: 11, qtd: 1, valorUnit: 4 }, { productId: 10, qtd: 2, valorUnit: 7.5 }] }],
  ]);
});
