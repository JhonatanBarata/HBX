import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaRotaService } from './logistica-rota.service';

/**
 * 🔴 09/08 — O HISTÓRICO NASCIA NA PORTA ERRADA.
 *
 * `historicoDeRotas(companyId, date)` é o que o app lê pra reencher o rascunho
 * de montagem ("reutilizar rota salva"). Ele lia SÓ o `customerProfile` e nem
 * selecionava o `local` da entrega — medido na empresa 41 (14 dias, 187 linhas
 * cliente-dia): 31 nasciam SEM pino e 22 com o pino de OUTRA porta (>50 m, pior
 * caso 5,8 km); na 48, 17 de 100 erradas. Reutilizar o dia mandava o motorista
 * pra porta errada, ou a tela gritava "não sei onde fica" pra cliente com porta
 * marcada.
 *
 * Estes testes trancam as 4 bordas da régua única (logistica-geo-fonte.util.ts):
 * a fonte é escolhida INTEIRA, a chave da linha é (cliente|porta), duas portas
 * do mesmo cliente no mesmo dia são duas paradas, e a LINHA de endereço sai
 * pronta do servidor (44 dos 225 clientes da 41 têm o número só na coluna
 * `numero` — o app mostrava "Rua M-7" onde o desktop mostrava "Rua M-7, 897").
 */

const COMPANY = 41;
const DIA = '2026-08-08';

/** Pinos bem separados: 'porta A' e 'porta B' distam ~1,2 km — nenhuma confusão. */
const PINO_LOCAL_A = { lat: -22.4102, lng: -47.5602 };
const PINO_LOCAL_B = { lat: -22.4210, lng: -47.5602 };
const PINO_PERFIL = { lat: -22.3800, lng: -47.5300 };

function perfil(over: any = {}) {
  return {
    name: 'Alfredo',
    endereco: 'Rua M-7',
    numero: '897',
    complemento: null,
    bairro: 'Jardim Cervezão',
    cidade: 'Rio Claro',
    uf: 'SP',
    cep: '13506-000',
    lat: null,
    lng: null,
    geoFonte: null,
    logisticaPlanosEntrega: [],
    ...over,
  };
}

function local(over: any = {}) {
  return {
    apelido: null,
    endereco: 'Avenida 29',
    numero: '1200',
    complemento: 'Fundos',
    bairro: 'Centro',
    cidade: 'Rio Claro',
    uf: 'SP',
    cep: '13500-100',
    lat: null,
    lng: null,
    geoFonte: null,
    ...over,
  };
}

function buildService(rows: any[]) {
  const chamadas: any[] = [];
  const prisma: any = {
    entrega: {
      findMany: async (args: any) => { chamadas.push(args); return rows; },
    },
  };
  return { chamadas, service: new LogisticaRotaService(prisma, {} as any) };
}

test('local COM pino e perfil SEM pino → a linha nasce na porta do LOCAL (endereço junto)', async () => {
  const { service } = buildService([
    {
      customerProfileId: 'c1',
      localId: 'l1',
      local: local(PINO_LOCAL_A),
      customerProfile: perfil(),
    },
  ]);

  const { clientes } = (await service.historicoDeRotas(COMPANY, DIA)) as any;
  assert.equal(clientes.length, 1);
  assert.equal(clientes[0].localId, 'l1');
  assert.equal(clientes[0].lat, PINO_LOCAL_A.lat);
  assert.equal(clientes[0].lng, PINO_LOCAL_A.lng);
  // Endereço vem da MESMA fonte que deu o pino — nunca a rua de um com o CEP do
  // outro (o "pino Frankenstein" em texto).
  assert.equal(clientes[0].endereco, 'Avenida 29');
  assert.equal(clientes[0].cep, '13500-100');
  assert.equal(clientes[0].complemento, 'Fundos');
  assert.equal(clientes[0].enderecoLinha, 'Avenida 29, 1200');
});

test('local SEM coordenada → cai pro PERFIL inteiro (pino bom que existe não se descarta)', async () => {
  const { service } = buildService([
    {
      customerProfileId: 'c1',
      localId: 'l1',
      local: local(), // existe, mas sem lat/lng — os ~824 do backfill de 25/07
      customerProfile: perfil(PINO_PERFIL),
    },
  ]);

  const { clientes } = (await service.historicoDeRotas(COMPANY, DIA)) as any;
  assert.equal(clientes[0].lat, PINO_PERFIL.lat);
  assert.equal(clientes[0].lng, PINO_PERFIL.lng);
  assert.equal(clientes[0].endereco, 'Rua M-7', 'endereço acompanha a fonte do pino');
  assert.equal(clientes[0].cep, '13506-000');
  assert.equal(clientes[0].enderecoLinha, 'Rua M-7, 897');
});

test('mesmo cliente em DUAS portas no mesmo dia → DUAS linhas (a chave é cliente|porta)', async () => {
  const { service } = buildService([
    { customerProfileId: 'c1', localId: 'l1', local: local(PINO_LOCAL_A), customerProfile: perfil() },
    { customerProfileId: 'c1', localId: 'l2', local: local({ ...PINO_LOCAL_B, endereco: 'Rua 6', numero: '55' }), customerProfile: perfil() },
  ]);

  const { clientes } = (await service.historicoDeRotas(COMPANY, DIA)) as any;
  assert.equal(clientes.length, 2, 'duas portas são duas paradas legítimas');
  assert.deepEqual(clientes.map((c: any) => c.localId), ['l1', 'l2']);
  assert.equal(clientes[1].lat, PINO_LOCAL_B.lat);
  assert.equal(clientes[1].enderecoLinha, 'Rua 6, 55');
});

test('mesma porta DUAS vezes no dia → UMA linha (reutilizar duplicaria a porta)', async () => {
  const { service } = buildService([
    { customerProfileId: 'c1', localId: 'l1', local: local(PINO_LOCAL_A), customerProfile: perfil() },
    { customerProfileId: 'c1', localId: 'l1', local: local(PINO_LOCAL_A), customerProfile: perfil() },
  ]);

  const { clientes } = (await service.historicoDeRotas(COMPANY, DIA)) as any;
  assert.equal(clientes.length, 1);
});

test('cliente sem LOCAL 2x no dia (legado) → UMA linha, com o pino do perfil', async () => {
  const { service } = buildService([
    { customerProfileId: 'c1', localId: null, local: null, customerProfile: perfil(PINO_PERFIL) },
    { customerProfileId: 'c1', localId: null, local: null, customerProfile: perfil(PINO_PERFIL) },
  ]);

  const { clientes } = (await service.historicoDeRotas(COMPANY, DIA)) as any;
  assert.equal(clientes.length, 1);
  assert.equal(clientes[0].localId, null);
  assert.equal(clientes[0].lat, PINO_PERFIL.lat);
});

test('enderecoLinha traz o número quando ele mora SÓ na coluna `numero` — e não repete quando já está no texto', async () => {
  const { service } = buildService([
    {
      customerProfileId: 'c1', localId: null, local: null,
      customerProfile: perfil({ ...PINO_PERFIL, endereco: 'Rua M-7', numero: '897' }),
    },
    {
      customerProfileId: 'c2', localId: null, local: null,
      // legado: o texto composto já traz o número dentro ("Rua X, 123 - Centro")
      customerProfile: perfil({ ...PINO_PERFIL, name: 'Zeca', endereco: 'Rua 19, 880 - Centro', numero: '880' }),
    },
  ]);

  const { clientes } = (await service.historicoDeRotas(COMPANY, DIA)) as any;
  assert.equal(clientes[0].endereco, 'Rua M-7', 'o cru continua cru');
  assert.equal(clientes[0].numero, '897');
  assert.equal(clientes[0].enderecoLinha, 'Rua M-7, 897', 'quem monta a linha é o SERVIDOR');
  assert.equal(clientes[1].enderecoLinha, 'Rua 19, 880 - Centro', 'número já no texto não vira "880, 880"');
});

test('recorrente continua vindo do plano de entrega ATIVO do perfil', async () => {
  const { service } = buildService([
    {
      customerProfileId: 'c1', localId: 'l1', local: local(PINO_LOCAL_A),
      customerProfile: perfil({ logisticaPlanosEntrega: [{ id: 'p1' }] }),
    },
    { customerProfileId: 'c2', localId: null, local: null, customerProfile: perfil({ name: 'Zeca' }) },
  ]);

  const { clientes } = (await service.historicoDeRotas(COMPANY, DIA)) as any;
  assert.equal(clientes[0].recorrente, true);
  assert.equal(clientes[1].recorrente, false);
});

test('sem `date` a lista de DIAS não muda de contrato (agrupa por dia, conta paradas, mais novo primeiro)', async () => {
  const dia = (iso: string, hora: number) => {
    const [a, m, d] = iso.split('-').map(Number);
    return new Date(a, m - 1, d, hora, 0, 0, 0);
  };
  const { service } = buildService([
    { scheduledAt: dia('2026-08-06', 9), customerProfileId: 'c1', localId: 'l1' },
    { scheduledAt: dia('2026-08-06', 10), customerProfileId: 'c1', localId: 'l1' },
    { scheduledAt: dia('2026-08-06', 11), customerProfileId: 'c2', localId: null },
    { scheduledAt: dia('2026-08-07', 9), customerProfileId: 'c3', localId: null },
  ]);

  const resposta = (await service.historicoDeRotas(COMPANY)) as any;
  // O contrato ganhou o DESFECHO em 10/08 (F5) — sem nenhuma entregue, o dia é
  // 'cancelada' e diz quantas ficaram por fazer.
  assert.deepEqual(resposta.dias, [
    { data: '2026-08-07', paradas: 1, entregues: 0, naoCompletadas: 1, desfecho: 'cancelada' },
    { data: '2026-08-06', paradas: 2, entregues: 0, naoCompletadas: 2, desfecho: 'cancelada' },
  ]);
});

/* 🔴 F5 (10/08, dono: "tem q ficar registrado rotas que eu criei e cancelei…
   ambas ficam VERMELHAS, não foram completadas — em ambos os casos fica
   registrado o que NÃO foi completado"). O desfecho é do SERVIDOR: se cada tela
   contar por conta própria, elas discordam sobre o que é "completa". */
test('F5: dia com TUDO entregue é completa (sem vermelho, sem "não feitas")', async () => {
  const quando = new Date(2026, 7, 6, 9, 0, 0, 0);
  const { service } = buildService([
    { scheduledAt: quando, customerProfileId: 'c1', localId: null, status: 'entregue', deliveredAt: quando },
    { scheduledAt: quando, customerProfileId: 'c2', localId: null, status: 'entregue', deliveredAt: quando },
  ]);
  const { dias } = (await service.historicoDeRotas(COMPANY)) as any;
  assert.deepEqual(dias, [{ data: '2026-08-06', paradas: 2, entregues: 2, naoCompletadas: 0, desfecho: 'completa' }]);
});

test('F5: dia com trabalho de verdade e parada sobrando é INCOMPLETA (caso 2b — fica 14 dias)', async () => {
  const quando = new Date(2026, 7, 6, 9, 0, 0, 0);
  const { service } = buildService([
    { scheduledAt: quando, customerProfileId: 'c1', localId: null, status: 'entregue', deliveredAt: quando },
    { scheduledAt: quando, customerProfileId: 'c2', localId: null, status: 'cancelada' },
    { scheduledAt: quando, customerProfileId: 'c3', localId: null, status: 'cancelada' },
  ]);
  const { dias } = (await service.historicoDeRotas(COMPANY)) as any;
  assert.deepEqual(dias, [{ data: '2026-08-06', paradas: 3, entregues: 1, naoCompletadas: 2, desfecho: 'incompleta' }]);
});

test('F5: entregue REABERTA depois continua contando como trabalho feito', async () => {
  // O status virou outra coisa, mas `deliveredAt` prova que a visita aconteceu —
  // trabalho feito não deixa de ter sido feito porque alguém reabriu a entrega.
  const quando = new Date(2026, 7, 6, 9, 0, 0, 0);
  const { service } = buildService([
    { scheduledAt: quando, customerProfileId: 'c1', localId: null, status: 'cancelada', deliveredAt: quando },
    { scheduledAt: quando, customerProfileId: 'c2', localId: null, status: 'cancelada' },
  ]);
  const { dias } = (await service.historicoDeRotas(COMPANY)) as any;
  assert.equal(dias[0].desfecho, 'incompleta');
  assert.equal(dias[0].naoCompletadas, 1);
});

test('F5: a CANCELADA entra na lista de dias (era ela que sumia da tela)', async () => {
  // `limparDia` zera `rotaOrdem` ao cancelar, e a consulta antiga só via parada
  // (rotaOrdem OU entregue): o dia inteiro criado e cancelado desaparecia como se
  // nunca tivesse existido — exatamente a queixa do dono.
  const { chamadas, service } = buildService([]);
  await service.historicoDeRotas(COMPANY);
  const where = chamadas[0].where;
  assert.ok(
    where.OR.some((o: any) => o.status === 'cancelada'),
    'a cancelada precisa entrar no OR da lista de dias',
  );
});

test('a CONTA do dia usa a mesma chave (cliente|porta) das linhas — chip e rascunho não discordam', async () => {
  const quando = new Date(2026, 7, 6, 9, 0, 0, 0);
  const { service } = buildService([
    { scheduledAt: quando, customerProfileId: 'c1', localId: 'l1' },
    { scheduledAt: quando, customerProfileId: 'c1', localId: 'l2' },
    { scheduledAt: quando, customerProfileId: 'c1', localId: 'l2' },
  ]);

  const resposta = (await service.historicoDeRotas(COMPANY)) as any;
  assert.equal(resposta.dias.length, 1);
  assert.equal(resposta.dias[0].data, '2026-08-06');
  assert.equal(resposta.dias[0].paradas, 2, 'duas portas, duas paradas');
});
