import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaOccurrenceService, occurrenceItemId } from './logistica-occurrence.service';
import { LogisticaService } from './logistica.service';

/**
 * PR18072026 W1 (item 9) — teste END-TO-END provando o FIO INTEIRO:
 *   ClienteProduto.precoAcordado → gerarDia (motor de PRODUÇÃO,
 *   LogisticaOccurrenceService.materialize — é o que o controller realmente
 *   chama; ver logistica-recorrencia-occurrence.service.ts override de
 *   gerarDia) → EntregaItem.valorUnit usa o preço acordado → confirmarEntrega
 *   → FinanceiroCharge.amount com o valor CERTO.
 *
 * Furo investigado e NÃO encontrado: resolveUnitValue (logistica-occurrence.
 * service.ts) já prioriza precoAcordado > catálogo > precoPadrao > 0 (mesma
 * regra de resolveValorUnit em logistica-recorrencia.service.ts, já coberta
 * por teste unitário); confirmarEntrega usa `entrega.valor` como
 * `valorCobranca` quando o payload não toca o stepper (F1: "sem stepper, o
 * valor previsto vale"); lancarCobranca cria o charge com esse MESMO valor.
 * Cada elo já tinha teste unitário próprio — o que faltava era 1 teste
 * atravessando os DOIS serviços com o MESMO dado, provado aqui.
 */

test('precoAcordado → materialize (gerarDia real) → EntregaItem.valorUnit → confirmarEntrega → charge com o valor certo', async () => {
  const companyId = 7;
  const sourceDate = '2026-07-20';
  const occurrenceId = occurrenceItemId('recorrencia-galao', sourceDate);

  // ── Passo 1: materialize (o gerarDia de PRODUÇÃO) ──────────────────────────
  const recurrenceRow = {
    id: 'recorrencia-galao',
    companyId,
    customerProfileId: 'customer-1',
    productId: 10,
    localId: null,
    qtdPadrao: 2,
    // precoAcordado (R$12) VENCE o catálogo (R$20) e o precoPadrao do cliente (R$30).
    precoAcordado: 12,
    frequenciaDias: null,
    diasSemana: '1',
    proximaData: new Date('2026-07-20T03:00:00.000Z'),
    product: { id: 10, name: 'Galão 20L', price: 20, priceCents: null },
    customerProfile: {
      id: 'customer-1',
      name: 'Cliente Um',
      precoPadrao: 30,
      lat: -23.5,
      lng: -46.6,
      geoFonte: 'gps_cadastro',
    },
    local: null,
  };

  let createdData: any = null;
  const tx: any = {
    $executeRawUnsafe: async () => 0,
    contato: { findFirst: async () => null },
    entregaItem: {
      findMany: async () => [],
      createMany: async () => ({ count: 0 }),
    },
    entrega: {
      findMany: async () => [],
      findFirst: async () => null,
      create: async ({ data }: any) => {
        createdData = data;
        return { id: 'delivery-1', notes: data.notes, entregadorId: data.entregadorId };
      },
      update: async () => ({ id: 'delivery-1' }),
    },
    clienteProduto: { updateMany: async () => ({ count: 1 }) },
  };
  const materializePrisma: any = {
    clienteProduto: { findMany: async () => [recurrenceRow] },
    $transaction: async (callback: any) => callback(tx),
  };

  const occurrences = new LogisticaOccurrenceService(materializePrisma);
  const gerado = await occurrences.materialize(companyId, {
    operationalDate: sourceDate,
    sourceDates: [sourceDate],
  });

  assert.equal(gerado.criadas, 1);
  assert.equal(createdData.itens.create[0].id, occurrenceId);
  assert.equal(createdData.itens.create[0].valorUnit, 12, 'EntregaItem.valorUnit usa o precoAcordado (12), não o catálogo (20) nem o precoPadrao (30)');
  assert.equal(createdData.quantidade, 2);
  assert.equal(createdData.valor, 24, 'Entrega.valor = Σ qtdPrevista×valorUnit = 2×12');

  // ── Passo 2: confirmarEntrega (usa o MESMO dado que o passo 1 gerou) ───────
  const entregaGerada = {
    id: 'delivery-1',
    status: 'em_rota',
    customerProfileId: 'customer-1',
    contatoId: null,
    valor: createdData.valor, // 24 — exatamente o que materialize gravou
    cobrancaStatus: 'pendente',
  };
  const entregaItensGerados = [
    { id: occurrenceId, qtdPrevista: 2, qtdEntregue: null, valorUnit: createdData.itens.create[0].valorUnit }, // 12
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
      updateMany: async () => ({ count: 0 }),
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
    assert.equal(chargesCreated.length, 1, '1 charge criado a partir da entrega gerada por materialize');
    assert.equal(
      chargesCreated[0].amount,
      24,
      'charge.amount = 24 = precoAcordado(12) × qtd(2) — o MESMO valor que materialize gravou em Entrega.valor',
    );
  } finally {
    if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
    else process.env.HBX_LOGISTICA_ENABLED = prev;
  }
});
