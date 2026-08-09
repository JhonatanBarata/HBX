import test from 'node:test';
import assert from 'node:assert/strict';

import { NucleoCadastroService, exigirEnderecoFechado } from './nucleo-cadastro.service';

/**
 * REGRA DE ENTRADA (06/08, ordem do dono): "cliente não serão mais aceitos cadastros
 * sem CEP e número. se tiver só CEP até ok, aceite SN".
 */

function passa(cadastro: any, isCliente = true) {
  exigirEnderecoFechado(cadastro, isCliente);
  return true;
}
function barra(cadastro: any, isCliente = true) {
  assert.throws(() => exigirEnderecoFechado(cadastro, isCliente));
  return true;
}

test('cliente com CEP + número entra', () => {
  assert.ok(passa({ cep: '13504-726', numero: '197', endereco: 'Avenida 74' }));
});

test('número dentro do texto composto (legado) conta como número', () => {
  assert.ok(passa({ cep: '13504726', numero: null, endereco: 'Rua 17, 135 - Jd. Santa Maria' }));
});

test('SN é resposta VÁLIDA — casa sem número existe', () => {
  assert.ok(passa({ cep: '13505-540', numero: 'SN', endereco: 'Av. M47' }));
  assert.ok(passa({ cep: '13505-540', numero: 's/n', endereco: 'Av. M47' }));
  // O jeito que o dono já escreve à mão na base dele:
  assert.ok(passa({ cep: '13504-712', numero: null, endereco: 'Jd. Santa Maria, Rua 16 — sem número' }));
});

test('sem CEP não entra, por mais completo que esteja o resto', () => {
  assert.ok(barra({ cep: null, numero: '1280', endereco: 'Jacutinga, 1280 - Parque universitário' }));
  assert.ok(barra({ cep: '1350', numero: '1280', endereco: 'Jacutinga' }));
});

test('CEP sem número e sem SO declarado não entra — campo em branco não diz nada', () => {
  assert.ok(barra({ cep: '13504-689', numero: null, endereco: 'Avenida 96 BV' }));
  assert.ok(barra({ cep: '13504-689', numero: '   ', endereco: 'Avenida 96 BV' }));
});

test('a regra é da LOGÍSTICA: lead/fornecedor (isCliente=false) segue entrando sem endereço', () => {
  assert.ok(passa({ cep: null, numero: null, endereco: null }, false));
});

// ── AS QUATRO PORTAS (09/08, ordem do dono: "faça o cadastro recusar sem CEP/número")
//
// A regra existia desde 06/08 e valia numa porta só (`createConta`) — e a base seguiu
// ganhando buraco por três frestas: dava pra APAGAR o CEP no PATCH seguinte, dava pra
// ligar `isCliente` numa conta que entrou como lead pelado, e o LOCAL (que é quem
// vence no multilocal) não tinha guarda nenhuma. Medido na 41: 91 de 225 sem CEP.

function servico(prisma: any) {
  return new NucleoCadastroService(prisma);
}

/** Banco de mentira: conta e local com os campos que as duas regras leem. */
function mockConta(conta: any, local?: any) {
  const escrito: any[] = [];
  const prisma: any = {
    customerProfile: {
      findFirst: async () => conta,
      update: async (a: any) => { escrito.push(a.data); return { id: conta?.id ?? 'c1' }; },
    },
    localEntrega: {
      count: async () => 1,
      findFirst: async () => local ?? null,
      findMany: async () => [],
      create: async (a: any) => { escrito.push(a.data); return { id: 'l-novo' }; },
      update: async (a: any) => { escrito.push(a.data); return { id: a.where.id }; },
      updateMany: async () => ({ count: 0 }),
    },
    $transaction: async (fn: any) => fn(prisma),
  };
  return { prisma, escrito };
}

const CLIENTE_OK = {
  id: 'c1', isCliente: true, cep: '13504726', numero: '197', endereco: 'Avenida 74',
  lat: null, lng: null, geoFonte: null, bairro: null, cidade: 'Rio Claro', uf: 'SP',
};

test('updateConta: APAGAR o CEP de um cliente é recusado (o buraco de 2 passos)', async () => {
  const { prisma } = mockConta(CLIENTE_OK);
  await assert.rejects(
    () => servico(prisma).updateConta(7, 'c1', { cep: '' }),
    /CEP/i,
  );
});

test('updateConta: o cadastro é julgado pelo RESULTADO — trocar só a rua, com o CEP já salvo, passa', async () => {
  const { prisma, escrito } = mockConta(CLIENTE_OK);
  const res = await servico(prisma).updateConta(7, 'c1', { endereco: 'Avenida 74, 197' });
  assert.ok(res);
  assert.equal(escrito[0].endereco, 'Avenida 74, 197');
});

test('updateConta: mexer no NOME de um cadastro legado incompleto continua passando', async () => {
  // Não é anistia: o que está barrado é criar buraco novo e fechar endereço pela
  // metade. Travar o nome/telefone deixaria 34 clientes da 41 impossíveis de editar.
  const { prisma } = mockConta({ ...CLIENTE_OK, cep: null, numero: null });
  assert.ok(await servico(prisma).updateConta(7, 'c1', { nome: 'Bete' }));
});

test('updateConta: marcar o PINO no mapa nunca é recusado — pino não é endereço', async () => {
  // É assim que o dono conserta endereço ruim na rua; cobrar CEP aqui barraria
  // justamente a ação que melhora o cadastro.
  const { prisma } = mockConta({ ...CLIENTE_OK, cep: null, numero: null });
  assert.ok(await servico(prisma).updateConta(7, 'c1', { lat: -22.38, lng: -47.55, geoFonte: 'gps_cadastro' }));
});

test('updateConta: LEAD virando CLIENTE tem que trazer o endereço fechado', async () => {
  const pelado = { ...CLIENTE_OK, isCliente: false, cep: null, numero: null, endereco: null };
  const { prisma } = mockConta(pelado);
  await assert.rejects(() => servico(prisma).updateConta(7, 'c1', { isCliente: true }), /CEP/i);
  // com endereço fechado no mesmo corpo, entra.
  const ok = mockConta(pelado);
  assert.ok(await servico(ok.prisma).updateConta(7, 'c1', { isCliente: true, cep: '13504726', numero: '197', endereco: 'Avenida 74' }));
});

test('updateConta: lead que segue lead entra sem endereço (a regra é da logística)', async () => {
  const { prisma } = mockConta({ ...CLIENTE_OK, isCliente: false, cep: null, numero: null });
  assert.ok(await servico(prisma).updateConta(7, 'c1', { endereco: 'Rua sem CEP' }));
});

test('createLocal: a 2ª casa do cliente também precisa de CEP e número', async () => {
  const { prisma } = mockConta({ id: 'c1', isCliente: true });
  await assert.rejects(
    () => servico(prisma).createLocal(7, 'c1', { endereco: 'Rua 8', apelido: 'Loja' }),
    /CEP/i,
  );
  const ok = mockConta({ id: 'c1', isCliente: true });
  assert.ok(await servico(ok.prisma).createLocal(7, 'c1', { endereco: 'Rua 8', numero: '396', cep: '13505450' }));
});

test('createLocal: local de conta que NÃO é cliente segue livre', async () => {
  const { prisma } = mockConta({ id: 'c1', isCliente: false });
  assert.ok(await servico(prisma).createLocal(7, 'c1', { endereco: 'Rua 8' }));
});

test('updateLocal: apagar o CEP do local é recusado; trocar só o apelido passa', async () => {
  const local = {
    id: 'l1', customerProfileId: 'c1', isPrincipal: true, lat: null, lng: null,
    cep: '13505450', numero: '396', endereco: 'Rua 8',
    customerProfile: { isCliente: true },
  };
  const { prisma } = mockConta({ id: 'c1', isCliente: true }, local);
  await assert.rejects(() => servico(prisma).updateLocal(7, 'l1', { cep: '' }), /CEP/i);

  const ok = mockConta({ id: 'c1', isCliente: true }, local);
  assert.ok(await servico(ok.prisma).updateLocal(7, 'l1', { apelido: 'Loja' }));
});
