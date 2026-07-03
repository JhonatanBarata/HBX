import test from 'node:test';
import assert from 'node:assert/strict';

import { ExternalWebhookLedgerService } from '../integrations/external-webhook-ledger.service';
import { MetaLeadAdsWorker } from './meta-lead-ads.worker';

// ARQ11 S1 — aceite do WORKER: retry→sucesso, dead-letter após 8, duplicata sem card dobrado,
// reconciliação injeta evento na fila. A Graph e o intake do CRM são mockados via o service fake
// (nada de rede). O ledger é REAL sobre um stub de Prisma em memória (mesmo padrão do ledger.test).

process.env.HBX_META_LEADADS_WORKER_ENABLED = '1';

function createPrismaStub() {
  const rows: any[] = [];
  const keyOf = (where: any) => where?.provider_eventId || {};
  const findByUnique = (where: any) => {
    const k = keyOf(where);
    return rows.find((r) => r.provider === k.provider && r.eventId === k.eventId) || null;
  };
  function matches(row: any, where: any): boolean {
    for (const [k, v] of Object.entries(where || {})) {
      if (k === 'OR') {
        if (!(v as any[]).some((c) => matches(row, c))) return false;
        continue;
      }
      const cur = row[k];
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        if ('in' in (v as any) && !(v as any).in.includes(cur)) return false;
        if ('lte' in (v as any) && !(cur != null && cur <= (v as any).lte)) return false;
      } else if (cur !== v) return false;
    }
    return true;
  }
  let seq = 0;
  return {
    rows,
    externalWebhookEvent: {
      findUnique: async ({ where }: any) => findByUnique(where),
      findMany: async ({ where, take, orderBy }: any) => {
        let out = rows.filter((r) => matches(r, where));
        if (orderBy?.createdAt === 'asc') out = out.slice().sort((a, b) => a.createdAt - b.createdAt);
        if (typeof take === 'number') out = out.slice(0, take);
        return out.map((r) => ({ ...r }));
      },
      updateMany: async ({ where, data }: any) => {
        const aff = rows.filter((r) => matches(r, where));
        for (const r of aff) Object.assign(r, data);
        return { count: aff.length };
      },
      create: async ({ data }: any) => {
        if (rows.find((r) => r.provider === data.provider && r.eventId === data.eventId)) {
          const e: any = new Error('unique'); e.code = 'P2002'; throw e;
        }
        const row = { id: `evt_${++seq}`, attempts: 0, nextRetryAt: null, lastError: null, payload: null, processedAt: null, createdAt: new Date(Date.UTC(2026, 6, 3, 0, 0, seq)), updatedAt: new Date(), ...data };
        rows.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = findByUnique(where);
        if (!row) throw new Error('not found');
        Object.assign(row, data);
        return row;
      },
    },
  } as any;
}

// Service fake: só o que o worker chama. `outcomes` é uma fila de desfechos por leadgenId.
function makeServiceFake(opts: {
  outcomes?: Record<string, string[]>;
  connections?: any[];
  forms?: Record<string, Array<{ id: string; name: string | null }>>;
  leads?: Record<string, Array<{ id: string; createdTime: string | null }>>;
} = {}) {
  const intakeCalls: any[] = [];
  const connErrors: any[] = [];
  return {
    intakeCalls,
    connErrors,
    async processLeadgenEvent(change: any) {
      const q = opts.outcomes?.[change.leadgenId];
      const outcome = q && q.length ? q.shift()! : 'created';
      if (outcome === 'created') intakeCalls.push(change.leadgenId);
      return outcome;
    },
    async listActiveConnectionsForReconciliation() {
      return opts.connections || [];
    },
    async listFormsForPage(pageId: string) {
      return opts.forms?.[pageId] || [];
    },
    async listLeadsForForm(formId: string) {
      return opts.leads?.[formId] || [];
    },
    async markConnectionError(pageId: string | null, message: string) {
      connErrors.push({ pageId, message });
    },
  } as any;
}

async function seedReceived(ledger: ExternalWebhookLedgerService, leadgenId: string, pageId = 'page-1') {
  await ledger.recordReceived('meta_lead_ads', leadgenId, { leadgenId, pageId, formId: 'form-1', createdTime: null }, { eventType: 'leadgen' });
}

test('retry→sucesso: 1ª tentativa transitória vira retry, 2ª cria o card', async () => {
  const prisma = createPrismaStub();
  const ledger = new ExternalWebhookLedgerService(prisma);
  const service = makeServiceFake({ outcomes: { 'lead-1': ['transient_error', 'created'] } });
  const worker = new MetaLeadAdsWorker(service, ledger);

  await seedReceived(ledger, 'lead-1');

  const now = new Date('2026-07-03T10:00:00.000Z');
  const t1 = await worker.processTick(now);
  assert.equal(t1.retried, 1);
  assert.equal(t1.created, 0);
  assert.equal(service.intakeCalls.length, 0);

  // Passado o backoff (1min), o evento fica reclamável de novo → cria o card.
  const later = new Date(now.getTime() + 2 * 60_000);
  const t2 = await worker.processTick(later);
  assert.equal(t2.created, 1);
  assert.equal(service.intakeCalls.length, 1);
  const row = prisma.rows.find((r: any) => r.eventId === 'lead-1');
  assert.equal(row.status, 'processed');
});

test('dead-letter após 8 falhas transitórias, conexão marcada com erro', async () => {
  const prisma = createPrismaStub();
  const ledger = new ExternalWebhookLedgerService(prisma);
  const service = makeServiceFake({ outcomes: { 'lead-x': Array(20).fill('transient_error') } });
  const worker = new MetaLeadAdsWorker(service, ledger);

  await seedReceived(ledger, 'lead-x');

  // Roda ticks avançando o relógio bem além do backoff a cada volta.
  let dead = false;
  for (let i = 0; i < 10 && !dead; i++) {
    const t = await worker.processTick(new Date(Date.UTC(2026, 6, 3 + i, 0, 0, 0)));
    if (t.dead > 0) dead = true;
  }
  const row = prisma.rows.find((r: any) => r.eventId === 'lead-x');
  assert.equal(row.status, 'dead_letter');
  assert.equal(row.attempts, 8);
  assert.equal(service.intakeCalls.length, 0, 'nunca cria card de um lead que sempre falha');
  assert.ok(service.connErrors.some((e: any) => e.pageId === 'page-1'), 'conexão marcada com erro no dead-letter');
});

test('duplicata: evento já processado não cria segundo card', async () => {
  const prisma = createPrismaStub();
  const ledger = new ExternalWebhookLedgerService(prisma);
  const service = makeServiceFake({ outcomes: { 'lead-d': ['duplicate'] } });
  const worker = new MetaLeadAdsWorker(service, ledger);

  await seedReceived(ledger, 'lead-d');
  const t = await worker.processTick(new Date('2026-07-03T10:00:00.000Z'));
  assert.equal(t.duplicated, 1);
  assert.equal(t.created, 0);
  assert.equal(service.intakeCalls.length, 0);
  const row = prisma.rows.find((r: any) => r.eventId === 'lead-d');
  assert.equal(row.status, 'processed', 'duplicata fecha a linha como processada, sem card novo');
});

test('lead sem contato (skipped) vai direto para dead_letter sem gastar tentativas', async () => {
  const prisma = createPrismaStub();
  const ledger = new ExternalWebhookLedgerService(prisma);
  const service = makeServiceFake({ outcomes: { 'lead-s': ['skipped'] } });
  const worker = new MetaLeadAdsWorker(service, ledger);

  await seedReceived(ledger, 'lead-s');
  const t = await worker.processTick(new Date('2026-07-03T10:00:00.000Z'));
  assert.equal(t.dead, 1);
  const row = prisma.rows.find((r: any) => r.eventId === 'lead-s');
  assert.equal(row.status, 'dead_letter');
  assert.equal(row.attempts, 0);
});

test('reconciliação injeta na fila lead que nunca chegou por webhook (e não duplica o que já processou)', async () => {
  const prisma = createPrismaStub();
  const ledger = new ExternalWebhookLedgerService(prisma);
  const service = makeServiceFake({
    connections: [{ id: 'c1', companyId: 7, pageId: 'page-1', accessToken: 'tok' }],
    forms: { 'page-1': [{ id: 'form-1', name: 'F' }] },
    leads: { 'form-1': [{ id: 'novo-1', createdTime: null }, { id: 'ja-proc', createdTime: null }] },
  });
  const worker = new MetaLeadAdsWorker(service, ledger);

  // 'ja-proc' já está processado no ledger:
  await ledger.recordReceived('meta_lead_ads', 'ja-proc', { leadgenId: 'ja-proc' });
  await ledger.markProcessed('meta_lead_ads', 'ja-proc');

  const t = await worker.reconcileTick(new Date('2026-07-03T10:00:00.000Z'));
  assert.equal(t.injected, 1, 'só o lead novo entra');
  const novo = prisma.rows.find((r: any) => r.eventId === 'novo-1');
  assert.ok(novo, 'lead novo virou evento no ledger');
  assert.equal(novo.eventType, 'reconciliation');
  assert.equal(novo.status, 'received');
});

test('flag OFF: worker não drena a fila', async () => {
  process.env.HBX_META_LEADADS_WORKER_ENABLED = '0';
  const prisma = createPrismaStub();
  const ledger = new ExternalWebhookLedgerService(prisma);
  const service = makeServiceFake({ outcomes: { 'lead-off': ['created'] } });
  const worker = new MetaLeadAdsWorker(service, ledger);
  await seedReceived(ledger, 'lead-off');
  const t = await worker.processTick(new Date('2026-07-03T10:00:00.000Z'));
  assert.equal(t.claimed, 0);
  assert.equal(service.intakeCalls.length, 0);
  process.env.HBX_META_LEADADS_WORKER_ENABLED = '1';
});
