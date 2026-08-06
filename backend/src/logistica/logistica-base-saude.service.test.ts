import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaBaseSaudeService } from './logistica-base-saude.service';

/**
 * S7 (25/07, PR25072026-ROTA-CONFERIDA) — prova o AGREGADO (mock de Prisma, zero
 * rede/banco real) e o invariante READ-ONLY: nenhuma query de escrita em NENHUMA
 * tabela tocada pelo serviço.
 *
 * Fixture (8 clientes, estilo empresa 41):
 *   cli-1/cli-2 (Ana/Bruno): MESMO lat/lng (perfil) → pino_compartilhado nos dois.
 *   cli-3 (Carla): sem coordenada, MAS tem recorrência ATIVA → resolve sozinho.
 *   cli-4 (Duda):  sem coordenada, sem recorrência/entrega aberta → NÃO resolve sozinho.
 *   cli-5 (Elis):  coordenada válida a centenas de km do cluster (RR longe de SP) —
 *                  prova que fora_do_casulo NÃO se aplica base-a-base (teto de 15km
 *                  da S3 aplicaria a ela em cheio se este serviço não neutralizasse).
 *   cli-6 (Fabio): coordenada válida, geoFonte 'geocode' → amarelo (geocode_nao_provado_em_campo).
 *   cli-7 (Gustavo): SEM coordenada no perfil, mas com LocalEntrega ativo/principal
 *                  válido (`gps_entrega`) → prova que o local vence e localId/localApelido
 *                  saem preenchidos na resposta.
 *   cli-8 (Helo):  sem coordenada, sem recorrência, MAS com entrega ABERTA (agendada)
 *                  → resolve sozinho pelo outro caminho (entrega no pipeline).
 */

const CLIENTES = [
  { id: 'cli-1', name: 'Ana', lat: -22.4, lng: -47.55, geoFonte: 'gps_entrega' },
  { id: 'cli-2', name: 'Bruno', lat: -22.4, lng: -47.55, geoFonte: 'gps_entrega' },
  { id: 'cli-3', name: 'Carla', lat: null, lng: null, geoFonte: null },
  { id: 'cli-4', name: 'Duda', lat: null, lng: null, geoFonte: null },
  { id: 'cli-5', name: 'Elis', lat: 2.8, lng: -60.7, geoFonte: 'gps_cadastro' },
  { id: 'cli-6', name: 'Fabio', lat: -22.41, lng: -47.56, geoFonte: 'geocode' },
  { id: 'cli-7', name: 'Gustavo', lat: null, lng: null, geoFonte: null },
  { id: 'cli-8', name: 'Helo', lat: null, lng: null, geoFonte: null },
];

const LOCAIS = [
  {
    id: 'local-gustavo',
    apelido: 'Casa',
    lat: -10.0,
    lng: -60.0,
    geoFonte: 'gps_entrega',
    customerProfileId: 'cli-7',
    isPrincipal: true,
  },
];

// entregas 'entregue': cli-1,2,5,6,7 já receberam alguma vez (cli-3/4/8 nunca).
const ENTREGUES = ['cli-1', 'cli-2', 'cli-5', 'cli-6', 'cli-7'];
// entrega ABERTA (agendada/em_rota) já no pipeline: só cli-8.
const ABERTAS = ['cli-8'];
// recorrência ATIVA (LogisticaPlanoEntrega): só cli-3.
const PLANOS_ATIVOS = ['cli-3'];

function buildPrismaMock() {
  const escritaProibida = (tabela: string, metodo: string) => async () => {
    throw new Error(`READ-ONLY VIOLADO: base-saude chamou ${tabela}.${metodo}`);
  };
  return {
    customerProfile: {
      findMany: async (args: any) => {
        assert.equal(args.where.isCliente, true);
        assert.equal(args.where.status, 'active');
        return CLIENTES;
      },
      update: escritaProibida('customerProfile', 'update'),
      updateMany: escritaProibida('customerProfile', 'updateMany'),
      create: escritaProibida('customerProfile', 'create'),
      delete: escritaProibida('customerProfile', 'delete'),
    },
    localEntrega: {
      findMany: async () => LOCAIS,
      update: escritaProibida('localEntrega', 'update'),
      updateMany: escritaProibida('localEntrega', 'updateMany'),
      create: escritaProibida('localEntrega', 'create'),
      delete: escritaProibida('localEntrega', 'delete'),
    },
    entrega: {
      groupBy: async (args: any) => {
        const status = args?.where?.status;
        if (status === 'entregue') {
          return ENTREGUES.map((id) => ({ customerProfileId: id, _count: { _all: 1 } }));
        }
        if (status && typeof status === 'object' && Array.isArray(status.in)) {
          return ABERTAS.map((id) => ({ customerProfileId: id, _count: { _all: 1 } }));
        }
        throw new Error(`entrega.groupBy chamado com where.status inesperado: ${JSON.stringify(status)}`);
      },
      update: escritaProibida('entrega', 'update'),
      updateMany: escritaProibida('entrega', 'updateMany'),
      create: escritaProibida('entrega', 'create'),
      delete: escritaProibida('entrega', 'delete'),
    },
    logisticaPlanoEntrega: {
      groupBy: async () => PLANOS_ATIVOS.map((id) => ({ customerProfileId: id, _count: { _all: 1 } })),
      update: escritaProibida('logisticaPlanoEntrega', 'update'),
      updateMany: escritaProibida('logisticaPlanoEntrega', 'updateMany'),
      create: escritaProibida('logisticaPlanoEntrega', 'create'),
      delete: escritaProibida('logisticaPlanoEntrega', 'delete'),
    },
  };
}

test('agregado: totais batem, percentVerde arredonda a 1 casa, resolvemSozinhos conta os 2 caminhos', async () => {
  const service = new LogisticaBaseSaudeService(buildPrismaMock() as any);
  const resultado = await service.getBaseSaude(41);

  assert.equal(resultado.totalClientes, 8);
  assert.equal(resultado.verdes + resultado.amarelos + resultado.vermelhos, resultado.totalClientes);
  // verdes: cli-5 (longe, mas coordenada provada) + cli-7 (local válido) = 2/8 = 25%.
  assert.equal(resultado.verdes, 2);
  assert.equal(resultado.amarelos, 1);
  assert.equal(resultado.vermelhos, 5);
  assert.equal(resultado.percentVerde, 25);
  // cli-3 (recorrência) + cli-8 (entrega aberta) — cli-4 fica de fora (nenhum dos dois).
  assert.equal(resultado.resolvemSozinhos, 2);
});

test('pino_compartilhado: cli-1/cli-2 no MESMO lat/lng viram vermelho os dois, motivo único', async () => {
  const service = new LogisticaBaseSaudeService(buildPrismaMock() as any);
  const resultado = await service.getBaseSaude(41);

  const cli1 = resultado.clientes.find((c) => c.id === 'cli-1')!;
  const cli2 = resultado.clientes.find((c) => c.id === 'cli-2')!;
  assert.deepEqual(cli1.motivos, ['pino_compartilhado']);
  assert.deepEqual(cli2.motivos, ['pino_compartilhado']);
  assert.equal(cli1.semaforo, 'vermelho');
  assert.equal(cli2.semaforo, 'vermelho');
});

test('mesmo ponto diz COM QUEM: cada um recebe o NOME do outro, e quem não divide vem vazio', async () => {
  const service = new LogisticaBaseSaudeService(buildPrismaMock() as any);
  const resultado = await service.getBaseSaude(41);

  const cli1 = resultado.clientes.find((c) => c.id === 'cli-1')!;
  const cli2 = resultado.clientes.find((c) => c.id === 'cli-2')!;
  assert.deepEqual(cli1.compartilhaCom, ['Bruno']);
  assert.equal(cli1.compartilhaComTotal, 1);
  assert.deepEqual(cli2.compartilhaCom, ['Ana']);
  assert.equal(cli2.compartilhaComTotal, 1);

  // Sem o motivo, nenhum nome viaja — nome na tela é sempre acusação com prova.
  for (const cliente of resultado.clientes) {
    if (cliente.motivos.includes('pino_compartilhado')) continue;
    assert.deepEqual(cliente.compartilhaCom, []);
    assert.equal(cliente.compartilhaComTotal, 0);
  }
});

test('fora_do_casulo NUNCA aparece base-a-base — cli-5 mora a centenas de km e ainda assim é verde', async () => {
  const service = new LogisticaBaseSaudeService(buildPrismaMock() as any);
  const resultado = await service.getBaseSaude(41);

  const cli5 = resultado.clientes.find((c) => c.id === 'cli-5')!;
  assert.deepEqual(cli5.motivos, []);
  assert.equal(cli5.semaforo, 'verde');
  // invariante duro: NENHUM cliente de NENHUM teste pode carregar motivo de rota.
  for (const c of resultado.clientes) {
    assert.ok(!c.motivos.includes('fora_do_casulo'), `${c.id} vazou fora_do_casulo`);
    assert.ok(!c.motivos.includes('perna_outlier'), `${c.id} vazou perna_outlier`);
    assert.ok(!c.motivos.includes('rota_degradada'), `${c.id} vazou rota_degradada`);
  }
});

test('sem_pino + recorrência/entrega aberta → resolveSozinho; sem nenhum dos dois → não resolve', async () => {
  const service = new LogisticaBaseSaudeService(buildPrismaMock() as any);
  const resultado = await service.getBaseSaude(41);

  const carla = resultado.clientes.find((c) => c.id === 'cli-3')!;
  const duda = resultado.clientes.find((c) => c.id === 'cli-4')!;
  const helo = resultado.clientes.find((c) => c.id === 'cli-8')!;

  assert.deepEqual(carla.motivos, ['sem_pino']);
  assert.equal(carla.semaforo, 'vermelho');
  assert.equal(carla.resolveSozinho, true, 'cli-3 tem recorrência ativa');

  assert.deepEqual(duda.motivos, ['sem_pino']);
  assert.equal(duda.resolveSozinho, false, 'cli-4 não tem recorrência nem entrega aberta');

  assert.deepEqual(helo.motivos, ['sem_pino']);
  assert.equal(helo.resolveSozinho, true, 'cli-8 tem entrega aberta no pipeline');
});

test('geocode_nao_provado_em_campo vira amarelo (não vermelho) quando é o único motivo', async () => {
  const service = new LogisticaBaseSaudeService(buildPrismaMock() as any);
  const resultado = await service.getBaseSaude(41);

  const fabio = resultado.clientes.find((c) => c.id === 'cli-6')!;
  assert.deepEqual(fabio.motivos, ['geocode_nao_provado_em_campo']);
  assert.equal(fabio.semaforo, 'amarelo');
});

test('LocalEntrega vence o perfil: cli-7 sem coordenada no perfil mas com local válido sai verde com localId/localApelido', async () => {
  const service = new LogisticaBaseSaudeService(buildPrismaMock() as any);
  const resultado = await service.getBaseSaude(41);

  const gustavo = resultado.clientes.find((c) => c.id === 'cli-7')!;
  assert.deepEqual(gustavo.motivos, []);
  assert.equal(gustavo.semaforo, 'verde');
  assert.equal(gustavo.localId, 'local-gustavo');
  assert.equal(gustavo.localApelido, 'Casa');
});

test('tenant vazio: zero clientes não quebra (percentVerde 0, nenhuma divisão por zero)', async () => {
  const prisma = buildPrismaMock();
  prisma.customerProfile.findMany = async () => [];
  const service = new LogisticaBaseSaudeService(prisma as any);
  const resultado = await service.getBaseSaude(41);

  assert.deepEqual(resultado, {
    totalClientes: 0,
    verdes: 0,
    amarelos: 0,
    vermelhos: 0,
    resolvemSozinhos: 0,
    percentVerde: 0,
    clientes: [],
  });
});

test('read-only: se qualquer write acontecer, o guard-spy do mock já derruba o teste', async () => {
  // Este teste só documenta a garantia — as chamadas de escrita nunca são feitas
  // pelo caminho normal (os outros testes já provam isso implicitamente: se
  // getBaseSaude chamasse update/create/delete, TODOS os testes acima já teriam
  // rejeitado com "READ-ONLY VIOLADO").
  const service = new LogisticaBaseSaudeService(buildPrismaMock() as any);
  await assert.doesNotReject(() => service.getBaseSaude(41));
});
