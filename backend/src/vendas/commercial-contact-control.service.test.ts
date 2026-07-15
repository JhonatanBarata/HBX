import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMMERCIAL_INBOUND_STOP_REASON,
  CommercialContactControlService,
} from './commercial-contact-control.service';

function valueMatches(actual: any, condition: any): boolean {
  if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
    if (Array.isArray(condition.in)) return condition.in.includes(actual);
  }
  return actual === condition;
}

function makeInterruptPrisma() {
  let transactionActive = false;
  const jobs = [
    { id: 'job-pending', companyId: 7, leadId: 'lead-1', status: 'scheduled', classification: null },
    { id: 'job-sending', companyId: 7, leadId: 'lead-1', status: 'sending', classification: null },
    { id: 'job-sent', companyId: 7, leadId: 'lead-1', status: 'sent', classification: null },
    { id: 'job-other', companyId: 7, leadId: 'lead-other', status: 'scheduled', classification: null },
  ];
  const cadencias = [
    { id: 'cad-active', companyId: 7, leadId: 'lead-1', status: 'ativa', lastError: null },
    { id: 'cad-paused', companyId: 7, leadId: 'lead-1', status: 'pausada', lastError: null },
    { id: 'cad-other', companyId: 7, leadId: 'lead-other', status: 'ativa', lastError: null },
  ];
  const outbound: any[] = [
    {
      id: 101,
      companyId: 7,
      status: 'PENDING',
      sourceModule: 'vendas_prospeccao_bot',
      createdAt: new Date('2026-07-13T12:00:00Z'),
      message: { conversationId: 10, senderType: 'bot', variablesJson: '{"leadId":"lead-1","jobId":"job-pending"}' },
    },
    {
      id: 102,
      companyId: 7,
      status: 'PENDING',
      sourceModule: 'vendas_prospeccao_bot',
      createdAt: new Date('2026-07-13T12:00:00Z'),
      message: { conversationId: 10, senderType: 'human', variablesJson: '{"leadId":"lead-1"}' },
    },
    {
      id: 103,
      companyId: 7,
      status: 'PENDING',
      sourceModule: 'hbx_recovery_reminder',
      createdAt: new Date('2026-07-13T12:00:00Z'),
      message: { conversationId: 10, senderType: 'bot', variablesJson: '{"leadId":"lead-1"}' },
    },
    {
      id: 104,
      companyId: 7,
      status: 'PENDING',
      sourceModule: 'logistica_entrega',
      createdAt: new Date('2026-07-13T12:00:00Z'),
      message: { conversationId: 10, senderType: 'bot', variablesJson: '{"leadId":"lead-1"}' },
    },
    {
      id: 105,
      companyId: 7,
      status: 'SENDING',
      sourceModule: 'vendas_prospeccao_bot',
      createdAt: new Date('2026-07-13T12:00:00Z'),
      message: { conversationId: 10, senderType: 'bot', variablesJson: '{"leadId":"lead-1","jobId":"job-sending"}' },
    },
    {
      id: 106,
      companyId: 7,
      status: 'PENDING',
      sourceModule: 'vendas_prospeccao_bot',
      createdAt: new Date('2026-07-13T12:00:00Z'),
      message: {
        conversationId: 10,
        senderType: 'bot',
        variablesJson: '{"leadId":"lead-1","jobId":"job-sent","purpose":"conversation_reply"}',
      },
    },
    {
      id: 107,
      companyId: 7,
      status: 'PENDING',
      sourceModule: 'vendas_prospeccao_bot',
      createdAt: new Date('2026-07-13T12:00:00Z'),
      message: { conversationId: 11, senderType: 'bot', variablesJson: '{"leadId":"lead-1","jobId":"job-pending"}' },
    },
  ];
  const auditRows: any[] = [];
  const companyMessageUpdates: any[] = [];

  const applyUpdate = (rows: any[], where: any, data: any) => {
    let count = 0;
    for (const row of rows) {
      if (where.id && !valueMatches(row.id, where.id)) continue;
      if (where.companyId !== undefined && row.companyId !== where.companyId) continue;
      if (where.leadId && !valueMatches(row.leadId, where.leadId)) continue;
      if (where.status && !valueMatches(row.status, where.status)) continue;
      Object.assign(row, data);
      count += 1;
    }
    return { count };
  };

  const prisma: any = {
    $transaction: async (callback: any) => {
      transactionActive = true;
      try {
        return await callback(prisma);
      } finally {
        transactionActive = false;
      }
    },
    $queryRawUnsafe: async () => [{ ok: true }],
    companyConversation: {
      findFirst: async () => ({
        id: 10,
        vendasLeadId: 'lead-1',
        contact: '5511999999999',
        metadata: '{"vendasAutomation":{"leadId":"lead-other"}}',
      }),
    },
    vendasLead: {
      findMany: async () => [{ id: 'lead-1' }, { id: 'lead-other' }],
    },
    vendasAutomationJob: {
      findMany: async ({ where }: any) => jobs.filter((row) => {
        if (where.companyId !== undefined && row.companyId !== where.companyId) return false;
        if (where.leadId && !valueMatches(row.leadId, where.leadId)) return false;
        if (where.status && !valueMatches(row.status, where.status)) return false;
        return true;
      }).map(({ id, leadId }) => ({ id, leadId })),
      updateMany: async ({ where, data }: any) => applyUpdate(jobs, where, data),
    },
    cadenciaInscricao: {
      updateMany: async ({ where, data }: any) => applyUpdate(cadencias, where, data),
    },
    outboundMessage: {
      findMany: async ({ where }: any) => outbound.filter((row) => {
        if (row.companyId !== where.companyId) return false;
        if (where.id && !valueMatches(row.id, where.id)) return false;
        if (where.sourceModule && !where.sourceModule.in.includes(row.sourceModule)) return false;
        if (where.status && !valueMatches(row.status, where.status)) return false;
        return true;
      }),
      updateMany: async ({ where, data }: any) => applyUpdate(outbound, where, data),
    },
    companyMessage: {
      findFirst: async ({ where }: any) => {
        const jobId = jobs.find((job) => String(where?.variablesJson?.contains || '').includes(job.id))?.id;
        if (jobId === 'job-sending') return { id: 205, outboundMessageId: 105 };
        return null;
      },
      updateMany: async (input: any) => {
        companyMessageUpdates.push(input);
        return { count: 1 };
      },
    },
    whatsAppAuditLog: {
      findFirst: async ({ where }: any) => auditRows.find((row) =>
        row.companyId === where.companyId &&
        row.event === where.event &&
        String(row.metadata).includes(String(where.metadata.contains)),
      ) || null,
      create: async ({ data }: any) => {
        const row = { id: auditRows.length + 1, ...data };
        auditRows.push(row);
        return row;
      },
    },
  };

  return {
    prisma,
    jobs,
    cadencias,
    outbound,
    auditRows,
    companyMessageUpdates,
    isTransactionActive: () => transactionActive,
  };
}

test('inbound usa vinculo canonico, preserva outros fluxos e e idempotente quando duplicado', async () => {
  const state = makeInterruptPrisma();
  const projectionCalls: any[] = [];
  const service = new CommercialContactControlService(state.prisma, {
    dispatchVendasCockpitProjection: async (projection) => {
      assert.equal(state.isTransactionActive(), false, 'projecao deve ocorrer somente apos o commit');
      projectionCalls.push(projection);
    },
  });
  const input = {
    companyId: 7,
    conversationId: 10,
    inboundMessageId: 9001,
    from: '5511999999999',
    timestamp: new Date('2026-07-13T12:01:00Z'),
  };

  const first = await service.interruptForInbound(input);
  const second = await service.interruptForInbound(input);

  assert.equal(first.canceledJobs, 1);
  assert.equal(first.canceledSendingJobs, 0);
  assert.equal(first.canceledCadencias, 2);
  assert.equal(first.canceledOutbox, 2);
  assert.equal(first.inFlightOutbox, 1);
  assert.equal(second.canceledJobs, 0);
  assert.equal(second.canceledCadencias, 0);
  assert.equal(second.canceledOutbox, 0);

  assert.equal(state.jobs.find((row) => row.id === 'job-pending')?.status, 'canceled');
  assert.equal(state.jobs.find((row) => row.id === 'job-sending')?.status, 'sending');
  assert.equal(state.jobs.find((row) => row.id === 'job-sending')?.classification, COMMERCIAL_INBOUND_STOP_REASON);
  assert.equal(state.jobs.find((row) => row.id === 'job-sent')?.classification, COMMERCIAL_INBOUND_STOP_REASON);
  assert.equal(state.jobs.find((row) => row.id === 'job-other')?.status, 'scheduled', 'metadata/telefone nao vencem o vinculo canonico');
  assert.equal(state.cadencias.find((row) => row.id === 'cad-active')?.status, 'cancelada');
  assert.equal(state.cadencias.find((row) => row.id === 'cad-paused')?.status, 'cancelada');
  assert.equal(state.cadencias.find((row) => row.id === 'cad-other')?.status, 'ativa');

  assert.equal(state.outbound.find((row) => row.id === 101)?.status, 'CANCELED');
  assert.equal(state.outbound.find((row) => row.id === 101)?.deliveryStatus, 'canceled');
  assert.equal(state.outbound.find((row) => row.id === 101)?.failedAt, null);
  assert.equal(state.outbound.find((row) => row.id === 102)?.status, 'PENDING', 'envio humano deve permanecer');
  assert.equal(state.outbound.find((row) => row.id === 103)?.status, 'PENDING', 'Recovery deve permanecer');
  assert.equal(state.outbound.find((row) => row.id === 104)?.status, 'PENDING', 'transacional deve permanecer');
  assert.equal(state.outbound.find((row) => row.id === 105)?.status, 'SENDING', 'envio ja em voo e apenas auditado');
  assert.equal(state.outbound.find((row) => row.id === 106)?.status, 'PENDING', 'resposta da conversa nao e proximo contato');
  assert.equal(state.outbound.find((row) => row.id === 107)?.status, 'CANCELED');
  assert.deepEqual(projectionCalls, [
    { companyId: 7, conversationId: 10, event: 'canceled' },
    { companyId: 7, conversationId: 11, event: 'canceled' },
  ]);
  assert.equal(state.auditRows.filter((row) => row.event === 'commercial_contact_interrupted').length, 1);
  assert.equal(state.auditRows.filter((row) => row.event === 'commercial_inbound_dispatch_race').length, 1);
  assert.equal(state.companyMessageUpdates.length, 1);
});

test('dispatcher libera humano e Recovery, mas barra comercial com inbound posterior', async () => {
  const service = new CommercialContactControlService({
    vendasLeadTimelineEvent: {
      findFirst: async () => ({ id: 88 }),
    },
  } as any);

  assert.deepEqual(await service.validateBeforeCommercialDispatch({
    companyId: 7,
    conversationId: 10,
    sourceModule: 'vendas_prospeccao_bot',
    senderType: 'human',
    outboundCreatedAt: new Date('2026-07-13T12:00:00Z'),
  }), { allowed: true });
  assert.deepEqual(await service.validateBeforeCommercialDispatch({
    companyId: 7,
    conversationId: 10,
    sourceModule: 'hbx_recovery_reminder',
    senderType: 'bot',
    outboundCreatedAt: new Date('2026-07-13T12:00:00Z'),
  }), { allowed: true });
  assert.deepEqual(await service.validateBeforeCommercialDispatch({
    companyId: 7,
    conversationId: 10,
    sourceModule: 'vendas_prospeccao_bot',
    senderType: 'bot',
    variablesJson: '{"leadId":"lead-1"}',
    outboundCreatedAt: new Date('2026-07-13T12:00:00Z'),
  }), { allowed: false, reason: COMMERCIAL_INBOUND_STOP_REASON });
  assert.deepEqual(await service.validateBeforeCommercialDispatch({
    companyId: 7,
    conversationId: 10,
    sourceModule: 'vendas_prospeccao_bot',
    senderType: 'bot',
    variablesJson: '{"leadId":"lead-1","jobId":"job-encerrado","purpose":"conversation_reply"}',
    outboundCreatedAt: new Date('2026-07-13T12:00:00Z'),
  }), { allowed: true });
});

test('dispatcher ignora inbound cru sem marcador humano validado', async () => {
  const service = new CommercialContactControlService({
    companyMessage: { findFirst: async () => ({ id: 99, direction: 'INBOUND' }) },
    vendasLeadTimelineEvent: { findFirst: async () => null },
  } as any);

  assert.deepEqual(await service.validateBeforeCommercialDispatch({
    companyId: 7,
    conversationId: 10,
    sourceModule: 'vendas_prospeccao_bot',
    senderType: 'bot',
    variablesJson: '{"leadId":"lead-1"}',
    outboundCreatedAt: new Date('2026-07-13T12:00:00Z'),
  }), { allowed: true });
});

test('fallback por telefone nao cancela quando o numero aponta para mais de um lead', async () => {
  const auditRows: any[] = [];
  const prisma: any = {
    $transaction: async (callback: any) => callback(prisma),
    companyConversation: {
      findFirst: async () => ({ id: 10, vendasLeadId: null, contact: '5511999999999', metadata: null }),
    },
    vendasAutomationJob: {
      findMany: async () => [],
      updateMany: async () => ({ count: 0 }),
    },
    vendasLead: {
      findMany: async () => [{ id: 'lead-1' }, { id: 'lead-2' }],
    },
    cadenciaInscricao: {
      updateMany: async () => ({ count: 0 }),
    },
    outboundMessage: {
      findMany: async () => [],
    },
    whatsAppAuditLog: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        auditRows.push(data);
        return data;
      },
    },
  };
  const service = new CommercialContactControlService(prisma);
  const result = await service.interruptForInbound({
    companyId: 7,
    conversationId: 10,
    inboundMessageId: 9002,
    from: '5511999999999',
    timestamp: new Date('2026-07-13T12:02:00Z'),
  });

  assert.deepEqual(result.leadIds, []);
  assert.equal(result.canceledJobs, 0);
  assert.equal(result.canceledCadencias, 0);
  assert.equal(result.canceledOutbox, 0);
  assert.equal(auditRows.length, 1);
});

test('guarda recusa Cadencia quando ja existe job comercial ativo', async () => {
  let createCalled = false;
  const prisma: any = {
    $transaction: async (callback: any) => callback(prisma),
    $queryRawUnsafe: async () => [],
    vendasAutomationJob: {
      findMany: async () => [{ id: 'job-active', status: 'scheduled', classification: null }],
    },
    cadenciaInscricao: {
      findFirst: async () => null,
      create: async () => {
        createCalled = true;
        return { id: 'unexpected' };
      },
    },
  };
  const service = new CommercialContactControlService(prisma);
  const result = await service.createCadenciaInscricao({
    companyId: 7,
    leadId: 'lead-1',
    data: { companyId: 7, leadId: 'lead-1', cadenciaId: 'cad-1' },
  });

  assert.equal(result.created, false);
  assert.equal(result.conflict?.source, 'bot');
  assert.equal(createCalled, false);
});

test('reaplicar a mesma Cadencia no lead e idempotente, nao conflito de automacao', async () => {
  let createCalled = false;
  const prisma: any = {
    $transaction: async (callback: any) => callback(prisma),
    $queryRawUnsafe: async () => [],
    vendasAutomationJob: { findMany: async () => [] },
    cadenciaInscricao: {
      findFirst: async ({ where }: any) => where.cadenciaId
        ? { id: 'cad-enrollment-existing', status: 'ativa' }
        : null,
      create: async () => {
        createCalled = true;
        return { id: 'unexpected' };
      },
    },
  };
  const service = new CommercialContactControlService(prisma);
  const result = await service.createCadenciaInscricao({
    companyId: 7,
    leadId: 'lead-1',
    data: { companyId: 7, leadId: 'lead-1', cadenciaId: 'cad-1' },
  });

  assert.deepEqual(result, { created: false, alreadyEnrolled: true });
  assert.equal(createCalled, false);
});

test('guarda recusa Bot quando ja existe Cadencia ativa', async () => {
  let createCalled = false;
  const prisma: any = {
    $transaction: async (callback: any) => callback(prisma),
    $queryRawUnsafe: async () => [],
    vendasAutomationJob: {
      findFirst: async () => null,
      findMany: async () => [],
      create: async () => {
        createCalled = true;
        return { id: 'unexpected' };
      },
    },
    cadenciaInscricao: {
      findFirst: async () => ({ id: 'cad-active', status: 'ativa' }),
    },
  };
  const service = new CommercialContactControlService(prisma);
  const result = await service.createVendasAutomationJob({
    companyId: 7,
    leadId: 'lead-1',
    campaignId: 'campaign-1',
    data: { companyId: 7, leadId: 'lead-1', campaignId: 'campaign-1' },
  });

  assert.equal(result.created, false);
  assert.equal(result.conflict?.source, 'cadencia');
  assert.equal(createCalled, false);
});

test('lock comercial projeta tipo suportado pelo Prisma antes de criar o job', async () => {
  let lockSql = '';
  const prisma: any = {
    $transaction: async (callback: any) => callback(prisma),
    $queryRawUnsafe: async (sql: string) => {
      lockSql = sql;
      return [{ locked: 1 }];
    },
    vendasAutomationJob: {
      findFirst: async () => null,
      findMany: async () => [],
      create: async ({ data }: any) => ({ id: 'job-created', ...data }),
    },
    cadenciaInscricao: { findFirst: async () => null },
  };
  const service = new CommercialContactControlService(prisma);

  const result = await service.createVendasAutomationJob({
    companyId: 7,
    leadId: 'lead-1',
    campaignId: 'campaign-1',
    data: { companyId: 7, leadId: 'lead-1', campaignId: 'campaign-1', status: 'scheduled' },
  });

  assert.equal(result.created, true);
  assert.match(lockSql, /WITH advisory_lock AS/);
  assert.match(lockSql, /SELECT 1::integer AS locked FROM advisory_lock/);
});
