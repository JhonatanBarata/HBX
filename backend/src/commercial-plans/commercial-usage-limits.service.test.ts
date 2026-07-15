import test from 'node:test';
import assert from 'node:assert/strict';
import { ConflictException } from '@nestjs/common';
import { CommercialUsageLimitsService } from './commercial-usage-limits.service';

// A aquisição de lead possui uma única fronteira: débito confirmado de um crédito.
function buildCreditDebitPrismaMock() {
  const logs: Array<Record<string, any>> = [];
  const prisma = {
    company: {
      findUnique: async () => ({ selectedPlanKey: 'hbx_lite', timezone: 'America/Sao_Paulo', companyKind: 'tenant' }),
    },
    user: {
      findUnique: async () => ({ isSystemMaster: false, role: 'USER' }),
      count: async () => 1,
    },
    userTeamPolicy: { findUnique: async () => null },
    authSession: { findFirst: async () => null },
    $queryRawUnsafe: async () => [],
    companyCommercialUsageLog: {
      create: async ({ data }: any) => { logs.push(data); return { id: `log-${logs.length}`, ...data }; },
      findFirst: async ({ where }: any) => logs.find((row) =>
        row.eventType === where?.eventType
        && String(row.metadataJson || '').includes(String(where?.metadataJson?.contains || '')),
      ) || null,
      count: async () => 0,
    },
  };
  return { prisma, logs };
}

test('primeiro uso comercial é somente telemetria e nunca chama débito', async () => {
  const { prisma, logs } = buildCreditDebitPrismaMock();
  const debitCalls: Array<Record<string, any>> = [];
  const credits = {
    assertAndDebitLeadDelivery: async (companyId: number, userId: number | null, i: any) => {
      debitCalls.push({ companyId, userId, ...i });
      return { applied: true, debited: 1 };
    },
    refundLeadDelivery: async () => ({ refunded: 0 }),
  } as any;
  const service = new CommercialUsageLimitsService(prisma as any, credits);

  const result = await service.recordCardCommercialUseOnce(1, 7, {
    source: 'radar_contact_click', usageKey: 'radar:ct-1', radarLeadId: 'ct-1',
  });

  assert.deepEqual(result, { debited: false, alreadyDebited: false });
  assert.equal(debitCalls.length, 0);
  assert.equal(logs.some((l) => l.eventType === 'card_import_attempt'), false);
  assert.equal(logs.some((l) => l.eventType === 'card_commercial_used'), true);
});

test('claim, contato Radar e contato Vendas resultam em exatamente um débito', async () => {
  const debitCalls: Array<Record<string, any>> = [];
  const { prisma, logs } = buildCreditDebitPrismaMock();
  const credits = {
    assertAndDebitLeadDelivery: async (companyId: number, userId: number | null, input: any) => {
      debitCalls.push({ companyId, userId, ...input });
      return { applied: true, debited: 1 };
    },
  } as any;
  const service = new CommercialUsageLimitsService(prisma as any, credits);

  const purchase = await service.reserveLeadDeliveryCredit(1, 7, {
    usageKey: 'radar:lead-paid:claim:operation-1',
  });
  const radarContact = await service.recordCardCommercialUseOnce(1, 7, {
    source: 'radar_contact_click',
    usageKey: 'radar:lead-paid',
    radarLeadId: 'lead-paid',
  });
  const vendasContact = await service.recordCardCommercialUseOnce(1, 7, {
    source: 'vendas_first_contact',
    usageKey: 'radar:lead-paid',
    radarLeadId: 'lead-paid',
  });

  assert.deepEqual(purchase, { applied: true, debited: 1 });
  assert.deepEqual(radarContact, { debited: false, alreadyDebited: false });
  assert.deepEqual(vendasContact, { debited: false, alreadyDebited: true });
  assert.equal(debitCalls.length, 1);
  assert.equal(debitCalls[0].leadId, 'radar:lead-paid:claim:operation-1');
  assert.equal(logs.filter((row) => row.eventType === 'card_commercial_used').length, 1);
});

test('telemetria de contato não consulta o serviço financeiro', async () => {
  const { prisma, logs } = buildCreditDebitPrismaMock();
  const credits = {
    assertAndDebitLeadDelivery: async () => {
      throw new Error('não deveria ser chamado');
    },
  } as any;
  const service = new CommercialUsageLimitsService(prisma as any, credits);

  const result = await service.recordCardCommercialUseOnce(1, 7, {
    source: 'radar_contact_click', usageKey: 'radar:ct-2', radarLeadId: 'ct-2',
  });
  assert.deepEqual(result, { debited: false, alreadyDebited: false });
  assert.equal(logs.some((l) => l.eventType === 'card_commercial_used'), true);
});

// ─── CRÉDITOS ATOMICIDADE: reserva ANTES de gravar + estorno (fix "entrega parcial + 409") ───────
// reserveLeadDeliveryCredit debita ANTES de qualquer gravação de card, com a MESMA chave canônica
// do choke real (idempotente), e propaga isBillingAudienceUser (mensagem do dono vs bloqueio
// neutro). Sem saldo LANÇA aqui — nenhum card órfão. releaseLeadDeliveryCredit estorna na falha.

test('reserveLeadDeliveryCredit: sem saldo LANÇA fail-closed (nada é gravado antes do débito)', async () => {
  const credits = {
    assertAndDebitLeadDelivery: async () => {
      throw new ConflictException({ ok: false, code: 'CREDIT_BALANCE_EXHAUSTED', message: 'Saldo de créditos esgotado.' });
    },
    refundLeadDelivery: async () => ({ refunded: 0 }),
  } as any;
  const service = new CommercialUsageLimitsService({} as any, credits);
  await assert.rejects(
    () => service.reserveLeadDeliveryCredit(1, 7, { usageKey: 'radar:ct-1', isBillingAudienceUser: true }),
    (error: any) => {
      assert.equal(error?.response?.code, 'CREDIT_BALANCE_EXHAUSTED');
      return true;
    },
  );
});

test('reserveLeadDeliveryCredit: com saldo devolve {applied,debited} e propaga leadId canônico + audiência', async () => {
  const calls: Array<Record<string, any>> = [];
  const credits = {
    assertAndDebitLeadDelivery: async (companyId: number, userId: number | null, i: any) => {
      calls.push({ companyId, userId, ...i });
      return { applied: true, debited: 1, balanceAfter: 4 };
    },
    refundLeadDelivery: async () => ({ refunded: 0 }),
  } as any;
  const service = new CommercialUsageLimitsService({} as any, credits);
  const result = await service.reserveLeadDeliveryCredit(1, 7, { usageKey: 'radar:ct-2', isBillingAudienceUser: true });
  assert.deepEqual(result, { applied: true, debited: 1 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].leadId, 'radar:ct-2'); // MESMA chave do débito downstream -> idempotente
  assert.equal(calls[0].actionKey, 'lead_delivery');
  assert.equal(calls[0].isBillingAudienceUser, true);
});

test('reserveLeadDeliveryCredit: sem CreditsService falha fechado e não libera o lead', async () => {
  const service = new CommercialUsageLimitsService({} as any); // sem 2º arg (opcional)
  await assert.rejects(
    () => service.reserveLeadDeliveryCredit(1, 7, { usageKey: 'radar:ct-3' }),
    (error: any) => {
      assert.equal(error?.response?.code, 'CREDIT_DEBIT_UNAVAILABLE');
      return true;
    },
  );
});

test('reserveLeadDeliveryCredit: resposta sem débito aplicado falha fechado', async () => {
  const credits = {
    assertAndDebitLeadDelivery: async () => ({ applied: false, debited: 0 }),
  } as any;
  const service = new CommercialUsageLimitsService({} as any, credits);
  await assert.rejects(
    () => service.reserveLeadDeliveryCredit(1, 7, { usageKey: 'radar:ct-noop' }),
    (error: any) => {
      assert.equal(error?.response?.code, 'CREDIT_DEBIT_UNAVAILABLE');
      return true;
    },
  );
});

test('releaseLeadDeliveryCredit: confirma estorno pela mesma usageKey e falha fechado sem serviço', async () => {
  const refunds: Array<Record<string, any>> = [];
  const credits = {
    assertAndDebitLeadDelivery: async () => ({ applied: true, debited: 1 }),
    refundLeadDelivery: async (companyId: number, userId: number | null, i: any) => {
      refunds.push({ companyId, userId, ...i });
      return { refunded: 1, alreadyRefunded: false };
    },
  } as any;
  const service = new CommercialUsageLimitsService({} as any, credits);
  const result = await service.releaseLeadDeliveryCredit(1, 7, { usageKey: 'radar:ct-2' });
  assert.deepEqual(result, { refunded: 1, alreadyRefunded: false });
  assert.equal(refunds.length, 1);
  assert.equal(refunds[0].leadId, 'radar:ct-2');
  assert.equal(refunds[0].actionKey, 'lead_delivery');

  const bare = new CommercialUsageLimitsService({} as any);
  await assert.rejects(
    () => bare.releaseLeadDeliveryCredit(1, 7, { usageKey: 'radar:ct-9' }),
    (error: any) => error?.response?.code === 'CREDIT_REFUND_UNAVAILABLE',
  );
});

test('releaseLeadDeliveryCredit: retry preserva o valor histórico confirmado sem creditar novamente', async () => {
  let calls = 0;
  const credits = {
    refundLeadDelivery: async () => {
      calls += 1;
      return { refunded: 2, alreadyRefunded: true };
    },
  } as any;
  const service = new CommercialUsageLimitsService({} as any, credits);

  const result = await service.releaseLeadDeliveryCredit(1, 7, { usageKey: 'radar:retry-confirmado' });

  assert.deepEqual(result, { refunded: 2, alreadyRefunded: true });
  assert.equal(calls, 1);
});

test('recordCardRefund só grava refunded após confirmar o crédito devolvido', async () => {
  const logs: Array<Record<string, any>> = [];
  const refunds: Array<Record<string, any>> = [];
  const prisma = {
    company: { findUnique: async () => ({ companyKind: 'tenant', selectedPlanKey: 'hbx_padrao' }) },
    radarLeadProcessRun: { findFirst: async () => ({ id: 'claim-op-1' }) },
    companyCommercialUsageLog: {
      create: async ({ data }: any) => { logs.push(data); return data; },
    },
  } as any;
  const credits = {
    refundLeadDelivery: async (companyId: number, userId: number | null, input: any) => {
      refunds.push({ companyId, userId, ...input });
      return { refunded: 1 };
    },
  } as any;
  const service = new CommercialUsageLimitsService(prisma, credits);

  await service.recordCardRefund(1, 7, { radarLeadId: 'lead-1', complaintId: 'complaint-1' });

  assert.equal(refunds[0].leadId, 'radar:lead-1:claim:claim-op-1');
  assert.deepEqual(logs.map((row) => row.eventType), ['vendas_card_refunded']);
});

test('recordCardRefund grava pending e falha quando o estorno não é confirmado', async () => {
  const logs: Array<Record<string, any>> = [];
  const prisma = {
    company: { findUnique: async () => ({ companyKind: 'tenant', selectedPlanKey: 'hbx_padrao' }) },
    radarLeadProcessRun: { findFirst: async () => ({ id: 'claim-op-2' }) },
    companyCommercialUsageLog: {
      create: async ({ data }: any) => { logs.push(data); return data; },
    },
  } as any;
  const credits = { refundLeadDelivery: async () => ({ refunded: 0 }) } as any;
  const service = new CommercialUsageLimitsService(prisma, credits);

  await assert.rejects(
    () => service.recordCardRefund(1, 7, { radarLeadId: 'lead-2', complaintId: 'complaint-2' }),
    (error: any) => error?.response?.code === 'CREDIT_REFUND_UNCONFIRMED',
  );
  assert.deepEqual(logs.map((row) => row.eventType), ['vendas_card_refund_pending']);
});
