import test from 'node:test';
import assert from 'node:assert/strict';
import { WebscrapingService } from './webscraping.service';

test('Owner apply-contacts rejeita lead não comprado antes de consultar motor ou gravar contato', async () => {
  const updates: Array<{ id: string; data: Record<string, any> }> = [];
  const writtenLeadIds: string[] = [];
  const whatsappBatches: string[][] = [];
  const snapshotUpdates: any[] = [];
  const contactRows: any[] = [
    { kind: 'phone', value: '11999990001', valueNormalized: '11999990001', source: 'rfb_primary', rank: 1, confidence: 100 },
    { kind: 'phone', value: '1133334444', valueNormalized: '1133334444', source: 'rfb_secondary', rank: 2, confidence: 95 },
    { kind: 'email', value: 'fiscal@empresa.test', valueNormalized: 'fiscal@empresa.test', source: 'rfb_email', rank: 1, confidence: 100 },
    { kind: 'email', value: 'financeiro@empresa.test', valueNormalized: 'financeiro@empresa.test', source: 'rfb_secondary', rank: 2, confidence: 95 },
  ];
  const rows: Record<string, any> = {
    owned: {
      id: 'owned',
      ownerCompanyId: 7,
      email: null,
      phone: null,
      instagramUrl: null,
      facebookUrl: null,
      metadataJson: '{}',
    },
    free: {
      id: 'free',
      ownerCompanyId: null,
      email: null,
      phone: null,
      instagramUrl: null,
      facebookUrl: null,
      metadataJson: '{}',
    },
  };
  const prisma = {
    radarLeadPool: {
      findMany: async () => [{ id: 'owned', ownerCompanyId: 7 }],
      findUnique: async ({ where }: any) => rows[where.id] || null,
      update: async ({ where, data }: any) => {
        updates.push({ id: where.id, data });
        Object.assign(rows[where.id], data);
        return rows[where.id];
      },
    },
    radarLeadCompanyState: {
      findMany: async () => [{
        radarLeadId: 'owned',
        companyId: 7,
        paidClaimOperationId: 'op-paid-1',
        claimUsageKey: 'radar:owned:claim:op-paid-1',
        acquiredAt: new Date(),
      }],
      findUnique: async () => ({
        paidClaimOperationId: 'op-paid-1',
        claimUsageKey: 'radar:owned:claim:op-paid-1',
        acquiredAt: new Date(),
      }),
    },
    creditLedgerEntry: {
      findMany: async () => [{
        companyId: 7,
        kind: 'debit',
        usageKey: 'enforce:lead_delivery:radar:owned:claim:op-paid-1',
      }],
      findFirst: async ({ where }: any) => where.kind === 'debit' ? { id: 'debit-1' } : null,
    },
    radarLeadProcessRun: {
      findMany: async () => [{
        id: 'op-paid-1', companyId: 7, radarLeadId: 'owned', mode: 'claim', status: 'completed',
      }],
      findUnique: async () => ({
        id: 'op-paid-1', companyId: 7, radarLeadId: 'owned', mode: 'claim', status: 'completed',
      }),
    },
    vendasLead: {
      findUnique: async () => ({ id: 'vendas-paid-1', companyId: 7 }),
      updateMany: async ({ data }: any) => {
        snapshotUpdates.push(data);
        return { count: 1 };
      },
    },
    leadContact: {
      findMany: async () => contactRows,
    },
    $transaction: async (work: any) => work(prisma),
  } as any;
  const service = new WebscrapingService(prisma) as any;
  service.radarCheckWhatsappNumbers = async (numbers: string[]) => {
    whatsappBatches.push(numbers);
    return numbers.map((number) => ({ input: number, normalizedNumber: number, exists: true }));
  };
  service._leadContactWrite = {
    writeContacts: async (_prisma: any, radarLeadId: string, candidates: any[]) => {
      writtenLeadIds.push(radarLeadId);
      for (const candidate of candidates) {
        contactRows.push({
          ...candidate,
          valueNormalized: candidate.value,
        });
      }
      return { written: candidates.length };
    },
  };

  const result = await service.applyDiscoveredContactsForMaster([
    { id: 'owned', email: 'comprado@empresa.test', phones: ['19999990001'] },
    { id: 'free', email: 'vazamento@empresa.test', phones: ['19888880002'] },
  ]);

  assert.equal(result.requested, 2);
  assert.equal(result.eligible, 1);
  assert.equal(result.rejectedUnowned, 1);
  assert.deepEqual(whatsappBatches, [['19999990001']]);
  assert.deepEqual(updates.map((entry) => entry.id), ['owned']);
  assert.deepEqual(writtenLeadIds, ['owned']);
  assert.equal(snapshotUpdates.length, 1);
  const snapshot = JSON.parse(snapshotUpdates[0].contactSnapshotJson);
  assert.deepEqual(snapshot.phones.map((contact: any) => contact.source), [
    'rfb_primary',
    'rfb_secondary',
    'website_crawl',
  ]);
  assert.deepEqual(snapshot.emails.map((contact: any) => contact.source), [
    'rfb_email',
    'rfb_secondary',
    'website_crawl',
  ]);
  assert.equal(JSON.stringify(updates).includes('vazamento@empresa.test'), false);
  assert.equal(JSON.stringify(updates).includes('19888880002'), false);
});

test('Owner apply-contacts falha fechado se o estorno aparece entre a pré-validação e a transação', async () => {
  const poolUpdates: any[] = [];
  const snapshotUpdates: any[] = [];
  const row = {
    id: 'owned',
    ownerCompanyId: 7,
    email: null,
    phone: null,
    instagramUrl: null,
    facebookUrl: null,
    metadataJson: '{}',
  };
  const prisma: any = {
    radarLeadPool: {
      findMany: async () => [{ id: 'owned', ownerCompanyId: 7 }],
      findUnique: async () => row,
      update: async (input: any) => {
        poolUpdates.push(input);
        return row;
      },
    },
    radarLeadCompanyState: {
      findMany: async () => [{
        radarLeadId: 'owned', companyId: 7, paidClaimOperationId: 'op-paid-1',
        claimUsageKey: 'radar:owned:claim:op-paid-1', acquiredAt: new Date(),
      }],
      findUnique: async () => ({
        paidClaimOperationId: 'op-paid-1',
        claimUsageKey: 'radar:owned:claim:op-paid-1',
        acquiredAt: new Date(),
      }),
    },
    creditLedgerEntry: {
      // A leitura externa ainda vê o débito ativo.
      findMany: async () => [{
        companyId: 7,
        kind: 'debit',
        usageKey: 'enforce:lead_delivery:radar:owned:claim:op-paid-1',
      }],
      // Dentro da transação o refund já existe: nenhum contato pode ser salvo.
      findFirst: async ({ where }: any) => where.kind === 'debit' ? { id: 'debit-1' } : { id: 'refund-1' },
    },
    radarLeadProcessRun: {
      findMany: async () => [{
        id: 'op-paid-1', companyId: 7, radarLeadId: 'owned', mode: 'claim', status: 'completed',
      }],
      findUnique: async () => ({
        id: 'op-paid-1', companyId: 7, radarLeadId: 'owned', mode: 'claim', status: 'completed',
      }),
    },
    vendasLead: {
      findUnique: async () => ({ id: 'vendas-paid-1', companyId: 7 }),
      updateMany: async (input: any) => {
        snapshotUpdates.push(input);
        return { count: 1 };
      },
    },
  };
  prisma.$transaction = async (work: any) => work(prisma);
  const service = new WebscrapingService(prisma) as any;
  let contactWrites = 0;
  service.radarCheckWhatsappNumbers = async () => [];
  service._leadContactWrite = {
    writeContacts: async () => {
      contactWrites += 1;
      return { written: 1 };
    },
  };

  const result = await service.applyDiscoveredContactsForMaster([
    { id: 'owned', email: 'nao-pode-vazar@empresa.test', phones: ['19999990001'] },
  ]);

  assert.equal(result.eligible, 1);
  assert.equal(result.updated, 0);
  assert.equal(result.errors, 1);
  assert.equal(contactWrites, 0);
  assert.equal(poolUpdates.length, 0);
  assert.equal(snapshotUpdates.length, 0);
});

test('Owner apply-contacts recusa run ainda pré-posse mesmo com state e débito', async () => {
  let transactions = 0;
  const prisma: any = {
    radarLeadPool: {
      findMany: async () => [{ id: 'owned', ownerCompanyId: 7 }],
    },
    radarLeadCompanyState: {
      findMany: async () => [{
        radarLeadId: 'owned', companyId: 7, paidClaimOperationId: 'op-paid-1',
        claimUsageKey: 'radar:owned:claim:op-paid-1', acquiredAt: new Date(),
      }],
    },
    creditLedgerEntry: {
      findMany: async () => [{
        companyId: 7, kind: 'debit', usageKey: 'enforce:lead_delivery:radar:owned:claim:op-paid-1',
      }],
    },
    radarLeadProcessRun: {
      findMany: async () => [{
        id: 'op-paid-1', companyId: 7, radarLeadId: 'owned', mode: 'claim', status: 'credit_debited',
      }],
    },
    $transaction: async () => {
      transactions += 1;
      throw new Error('não deveria abrir transação');
    },
  };
  const service = new WebscrapingService(prisma) as any;
  service.radarCheckWhatsappNumbers = async () => {
    throw new Error('não deveria verificar WhatsApp');
  };

  const result = await service.applyDiscoveredContactsForMaster([
    { id: 'owned', email: 'bloqueado@empresa.test', phones: ['19999990001'] },
  ]);

  assert.equal(result.eligible, 0);
  assert.equal(result.rejectedUnowned, 1);
  assert.equal(result.updated, 0);
  assert.equal(transactions, 0);
});
