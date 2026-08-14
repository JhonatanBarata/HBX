import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaAgendaService } from './logistica-agenda.service';
import { LogisticaService } from './logistica.service';

/**
 * PR18072026 W1 (item 9) — teste END-TO-END provando o FIO INTEIRO do preço:
 *   preço combinado no plano da Agenda → generateDay (o gerador de PRODUÇÃO) →
 *   EntregaItem.valorUnit → Entrega.valor → confirmarEntrega →
 *   FinanceiroCharge.amount com o valor CERTO.
 *
 * 🔴 F1 (09/08) — ESTE TESTE TROCOU DE MOTOR, NÃO DE ASSUNTO. Ele nasceu
 * apontando pra `LogisticaOccurrenceService.materialize`, que era "o gerarDia de
 * produção" em 18/07. Não é mais: o motor de ocorrências foi apagado e quem
 * materializa o dia é `LogisticaAgendaService.generateDay`, lendo o preço do
 * item do PLANO. O fio que o teste guarda (preço combinado → item da entrega →
 * charge) é o mesmo; apenas o primeiro elo mudou de casa. Teste de e2e que
 * continua exercitando um motor morto passa verde enquanto o dinheiro erra.
 */

test('preço do plano → generateDay (gerador real) → EntregaItem.valorUnit → confirmarEntrega → charge com o valor certo', async () => {
  const companyId = 7;
  const sexta = '2026-07-31';
  const planoId = 'plano-galao';

  // ── Passo 1: generateDay (o gerador de PRODUÇÃO) ───────────────────────────
  // O preço COMBINADO com o cliente (R$12) mora no item do plano — é ele que
  // tem que chegar no EntregaItem, nunca o preço de catálogo.
  const plano = {
    id: planoId,
    companyId,
    customerProfileId: 'customer-1',
    localId: null,
    diaSemana: 5, // sexta
    ativo: true,
    proximaData: null,
    frequencia: 'SEMANAL',
    intervaloDias: null,
    revisao: 1,
    janelaInicio: null,
    janelaFim: null,
    janelaTipo: null,
    tempoParadaMin: null,
    instrucoes: null,
    acessoTipo: null,
    acessoAndares: null,
    acessoTemElevador: null,
    acessoObservacao: null,
    adicionalTipo: null,
    adicionalValor: null,
    adicionalMotivo: null,
    customerProfile: {
      id: 'customer-1',
      name: 'Cliente Um',
      endereco: null,
      numero: null,
      bairro: null,
      cidade: null,
      uf: null,
      cep: null,
      lat: -23.5,
      lng: -46.6,
    },
    local: null,
    itens: [
      {
        id: 'item-1',
        productId: 10,
        qtd: 2,
        valorUnit: 12,
        product: { id: 10, name: 'Galão 20L', unidade: 'UN' },
      },
    ],
  };

  let createdData: any = null;
  const agendaPrisma: any = {
    logisticaPlanoEntrega: {
      findMany: async ({ where }: any) =>
        where.companyId === companyId && where.diaSemana === 5 ? [plano] : [],
    },
    logisticaRotaModelo: { findFirst: async () => null },
    contato: { findFirst: async () => null },
    entrega: {
      findFirst: async () => null, // nenhuma ocorrência anterior, nada pendurado
      create: async ({ data }: any) => {
        createdData = data;
        return { id: 'delivery-1' };
      },
    },
    logisticaAgendaEvento: { create: async () => ({ id: 'evt-1' }) },
  };

  const agenda = new LogisticaAgendaService(agendaPrisma);
  const gerado = await agenda.generateDay(companyId, sexta);

  assert.equal(gerado.criadas, 1);
  assert.deepEqual(gerado.deliveryIds, ['delivery-1']);
  assert.equal(
    createdData.itens.create[0].valorUnit,
    12,
    'EntregaItem.valorUnit usa o preço combinado do item do plano',
  );
  assert.equal(createdData.quantidade, 2);
  assert.equal(createdData.valor, 24, 'Entrega.valor = Σ qtdPrevista×valorUnit = 2×12');

  // ── Passo 2: confirmarEntrega (usa o MESMO dado que o passo 1 gerou) ───────
  const entregaGerada = {
    id: 'delivery-1',
    status: 'em_rota',
    customerProfileId: 'customer-1',
    contatoId: null,
    valor: createdData.valor, // 24 — exatamente o que generateDay gravou
    cobrancaStatus: 'pendente',
  };
  const entregaItensGerados = [
    { id: 'item-entrega-1', qtdPrevista: 2, qtdEntregue: null, valorUnit: createdData.itens.create[0].valorUnit }, // 12
  ];
  const conta = {
    id: 'customer-1',
    name: 'Cliente Um',
    formaPagamento: 'avulso',
    contabilizar: true,
    avisarEntrega: true,
  };

  const chargesCreated: any[] = [];
  const confirmPrisma: any = {
    entrega: {
      findFirst: async () => entregaGerada,
      update: async (args: any) => {
        if (args.data?.status) entregaGerada.status = args.data.status;
        if (args.data?.cobrancaStatus) entregaGerada.cobrancaStatus = args.data.cobrancaStatus;
        return { id: entregaGerada.id, ...args.data };
      },
      updateMany: async ({ where, data }: any) => {
        if (data?.status === 'entregue' && where?.status?.in?.includes(entregaGerada.status)) {
          Object.assign(entregaGerada, data);
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
    entregaItem: {
      updateMany: async () => ({ count: 0 }),
      findMany: async () => entregaItensGerados,
      count: async () => entregaItensGerados.length,
      create: async () => { throw new Error('não deveria criar item novo — payload não trouxe novosItens'); },
    },
    customerProfile: {
      findFirst: async () => conta,
      update: async () => ({ id: conta.id }),
    },
    contato: { findFirst: async () => null },
    financeiroCharge: {
      findFirst: async () => null, // 1ª confirmação — sem charge prévio (idempotência)
      create: async (args: any) => {
        chargesCreated.push(args.data);
        return { id: 'charge-1', ...args.data };
      },
    },
    masterEvent: { findFirst: async () => null, create: async () => ({ id: 'me-1' }) },
    $transaction: async (fn: any) => fn(confirmPrisma),
  };
  const rotaStub: any = { recalcularEtaRestantes: async () => ({ recalculadas: 0 }) };
  const configStub: any = {
    resolverAviso: async () => ({ habilitado: true, template: null }),
    resolverAvisoChegando: async () => ({ habilitado: false, template: null }),
  };
  const conversationsStub: any = { queueOutboundForCompany: async () => ({ queued: true }) };

  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';
  try {
    const service = new LogisticaService(confirmPrisma, conversationsStub, rotaStub, configStub);
    const res = await service.confirmarEntrega(companyId, 'delivery-1', { lat: -23.5, lng: -46.6 });

    assert.equal(res?.status, 'entregue');
    assert.equal(res?.cobrancaLancada, true);
    assert.equal(chargesCreated.length, 1, '1 charge criado a partir da entrega gerada pela Agenda');
    assert.equal(
      chargesCreated[0].amount,
      24,
      'charge.amount = 24 = preço combinado(12) × qtd(2) — o MESMO valor que generateDay gravou em Entrega.valor',
    );
  } finally {
    if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
    else process.env.HBX_LOGISTICA_ENABLED = prev;
  }
});
