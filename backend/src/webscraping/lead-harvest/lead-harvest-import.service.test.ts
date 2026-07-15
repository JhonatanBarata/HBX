import test from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { LeadHarvestImportService } from './lead-harvest-import.service';
import { LeadHarvestNormalizerService } from './lead-harvest-normalizer.service';

function adminUser() {
  return {
    id: 9,
    companyId: 7,
    role: 'ADMIN',
    isSystemMaster: false,
    masterContext: { active: false },
  };
}

function createPrismaMock() {
  const batches: any[] = [];
  const items: any[] = [];
  const radarRows: any[] = [];
  const optOutRows: any[] = [];

  const matchesWhere = (row: any, where: any) => {
    if (!where) return true;
    if (where.batchId && row.batchId !== where.batchId) return false;
    if (where.id && row.id !== where.id) return false;
    if (where.companyId && row.companyId !== where.companyId) return false;
    if (where.status?.in && !where.status.in.includes(row.status)) return false;
    if (where.status?.notIn && where.status.notIn.includes(row.status)) return false;
    if (where.recipientEmail && row.recipientEmail !== where.recipientEmail) return false;
    if (where.OR) {
      return where.OR.some((condition: any) => Object.entries(condition).every(([key, value]) => row[key] === value));
    }
    return Object.entries(where).every(([key, value]) => {
      if (key === 'status') return true;
      return row[key] === value;
    });
  };

  const prisma = {
    batches,
    items,
    radarRows,
    optOutRows,
    hasTable: async () => true,
    harvestImportBatch: {
      findUnique: async ({ where }: any) => batches.find((batch) => batch.batchId === where.batchId) || null,
      create: async ({ data }: any) => {
        const row = {
          id: `harvest-batch-${batches.length + 1}`,
          ...data,
          createdAt: new Date('2026-06-08T12:00:00.000Z'),
          updatedAt: new Date('2026-06-08T12:00:00.000Z'),
        };
        batches.push(row);
        return row;
      },
      findFirst: async ({ where, include }: any) => {
        const row = batches.find((batch) => {
          const identityMatch = where?.OR?.some((condition: any) => (
            (condition.id && condition.id === batch.id) ||
            (condition.batchId && condition.batchId === batch.batchId)
          ));
          const companyMatch = where?.companyId ? batch.companyId === where.companyId : true;
          return identityMatch && companyMatch;
        });
        if (!row) return null;
        return include?.items
          ? { ...row, items: [...items].filter((item) => item.importBatchId === row.id) }
          : row;
      },
    },
    harvestImportItem: {
      findFirst: async ({ where }: any) => items.find((item) => matchesWhere(item, where)) || null,
      create: async ({ data }: any) => {
        const row = {
          id: `harvest-item-${items.length + 1}`,
          ...data,
          createdAt: new Date('2026-06-08T12:00:00.000Z'),
        };
        items.push(row);
        return row;
      },
    },
    radarLeadPool: {
      findFirst: async ({ where }: any) => radarRows.find((row) => matchesWhere(row, where)) || null,
      create: async ({ data }: any) => {
        const row = {
          id: `radar-import-${radarRows.length + 1}`,
          ...data,
          createdAt: new Date('2026-06-08T12:00:00.000Z'),
          updatedAt: new Date('2026-06-08T12:00:00.000Z'),
        };
        radarRows.push(row);
        return row;
      },
    },
    commercialEmailMessageLog: {
      findFirst: async ({ where }: any) => optOutRows.find((row) => matchesWhere(row, where)) || null,
    },
  };
  return prisma as any;
}

test('LeadHarvestImport importa batch oficial com aceitos, duplicados e rejeitados', async () => {
  const prisma = createPrismaMock();
  const service = new LeadHarvestImportService(prisma, new LeadHarvestNormalizerService());

  const response = await service.importBatchForUser(adminUser(), {
    batchId: 'batch-vps-1',
    sourceMode: 'local_lab',
    sourceName: 'Local Email Lab',
    createdAt: '2026-06-08T12:00:00.000Z',
    providers: ['local_lab_probe'],
    leads: [
      {
        externalId: 'lead-1',
        name: 'Clinica Alfa',
        city: 'Rio Claro',
        state: 'SP',
        segment: 'clinicas',
        phone: '(19) 99999-0001',
        website: 'https://clinicaalfa.com.br',
        email: 'contato@clinicaalfa.com.br',
        sourceUrl: 'https://clinicaalfa.com.br/contato',
        sourceProvider: 'local_lab_probe',
        evidence: { source: 'pagina contato' },
      },
      {
        externalId: 'lead-duplicado',
        name: 'Clinica Alfa',
        city: 'Rio Claro',
        state: 'SP',
        segment: 'clinicas',
        phone: '(19) 99999-0001',
        website: 'https://clinicaalfa.com.br',
        sourceUrl: 'https://clinicaalfa.com.br/contato',
        sourceProvider: 'local_lab_probe',
        evidence: { source: 'pagina contato' },
      },
    ],
    emails: [
      {
        externalId: 'email-1',
        email: 'agenda@clinicabeta.com.br',
        companyName: 'Clinica Beta',
        sourceUrl: 'https://clinicabeta.com.br/contato',
        provider: 'local_lab_probe',
        confidence: 86,
        status: 'public_found',
        evidence: { mailto: 'mailto:agenda@clinicabeta.com.br' },
      },
      {
        externalId: 'email-invalido',
        email: 'nao-e-email',
        sourceUrl: 'https://empresa.com.br',
        provider: 'local_lab_probe',
        confidence: 50,
        evidence: { text: 'Contato' },
      },
    ],
  });

  assert.equal(response.batchId, 'batch-vps-1');
  assert.equal(response.status, 'partial');
  assert.deepEqual(response.counts, {
    received: 4,
    accepted: 2,
    rejected: 1,
    duplicates: 1,
    negatives: 0,
    optOuts: 0,
  });
  assert.equal(prisma.batches[0].sourceMode, 'imported_lab');
  assert.equal(prisma.items.length, 4);
  assert.equal(prisma.items.filter((item: any) => item.status === 'accepted').length, 2);
  assert.equal(prisma.items.some((item: any) => item.status === 'duplicate' && item.externalId === 'lead-duplicado'), true);
  assert.equal(prisma.items.some((item: any) => item.status === 'rejected' && item.externalId === 'email-invalido'), true);
  assert.equal(response.result.importedLeadIds.length, 2);
  assert.equal(prisma.radarRows.filter((row: any) => row.sourceEngine === 'imported_local_lab').length, 2);
  assert.equal(prisma.items.filter((item: any) => item.importedRadarLeadId).length, 2);
  assert.equal(prisma.items.find((item: any) => item.externalId === 'lead-duplicado').rejectReason, 'duplicate_phone');
  assert.equal(prisma.items.find((item: any) => item.externalId === 'email-invalido').rejectReason, 'invalid_email');
});

test('LeadHarvestImport rejeita dominio bloqueado sem aceitar item', async () => {
  const prisma = createPrismaMock();
  const service = new LeadHarvestImportService(prisma, new LeadHarvestNormalizerService());

  const response = await service.importBatchForUser(adminUser(), {
    batchId: 'batch-blocked',
    sourceMode: 'production',
    sourceName: 'VPS Production',
    createdAt: '2026-06-08T12:00:00.000Z',
    emails: [{
      externalId: 'email-blocked',
      email: 'loja@instagram.com',
      sourceUrl: 'https://instagram.com/loja',
      provider: 'official_probe',
      confidence: 80,
      evidence: { source: 'profile' },
    }],
  });

  assert.equal(response.counts.accepted, 0);
  assert.equal(response.counts.rejected, 1);
  assert.equal(response.status, 'rejected');
  assert.equal(prisma.items[0].status, 'rejected');
  assert.equal(prisma.items[0].rejectReason, 'blocked_email_domain');
  assert.equal(prisma.radarRows.length, 0);
});

test('LeadHarvestImport rejeita opt-out e historico negativo sem criar Radar novo', async () => {
  const prisma = createPrismaMock();
  prisma.optOutRows.push({ id: 'opt-1', recipientEmail: 'contato@optout.com.br', status: 'opted_out' });
  prisma.radarRows.push({ id: 'radar-negativo', email: 'contato@negativa.com.br', status: 'negative' });
  const service = new LeadHarvestImportService(prisma, new LeadHarvestNormalizerService());

  const response = await service.importBatchForUser(adminUser(), {
    batchId: 'batch-safety',
    sourceMode: 'local_lab',
    sourceName: 'Local Email Lab',
    createdAt: '2026-06-08T12:00:00.000Z',
    emails: [
      {
        externalId: 'email-optout',
        email: 'contato@optout.com.br',
        companyName: 'Empresa Optout',
        sourceUrl: 'https://optout.com.br/contato',
        provider: 'site_crawl',
        confidence: 88,
        evidence: { mailto: true },
      },
      {
        externalId: 'email-negativo',
        email: 'contato@negativa.com.br',
        companyName: 'Empresa Negativa',
        sourceUrl: 'https://negativa.com.br/contato',
        provider: 'site_crawl',
        confidence: 90,
        evidence: { mailto: true },
      },
    ],
  });

  assert.equal(response.status, 'rejected');
  assert.deepEqual(response.counts, {
    received: 2,
    accepted: 0,
    rejected: 0,
    duplicates: 0,
    negatives: 1,
    optOuts: 1,
  });
  assert.equal(prisma.items.find((item: any) => item.externalId === 'email-optout').rejectReason, 'opt_out');
  assert.equal(prisma.items.find((item: any) => item.externalId === 'email-negativo').rejectReason, 'negative_history');
  assert.equal(prisma.radarRows.length, 1);
});

test('LeadHarvestImport rejeita duplicado existente no Radar por e-mail', async () => {
  const prisma = createPrismaMock();
  prisma.radarRows.push({ id: 'radar-existente', email: 'contato@duplicada.com.br', status: 'clean' });
  const service = new LeadHarvestImportService(prisma, new LeadHarvestNormalizerService());

  const response = await service.importBatchForUser(adminUser(), {
    batchId: 'batch-duplicate-radar',
    sourceMode: 'local_lab',
    sourceName: 'Local Email Lab',
    createdAt: '2026-06-08T12:00:00.000Z',
    emails: [{
      externalId: 'email-duplicado',
      email: 'contato@duplicada.com.br',
      companyName: 'Empresa Duplicada',
      sourceUrl: 'https://duplicada.com.br/contato',
      provider: 'site_crawl',
      confidence: 88,
      evidence: { mailto: true },
    }],
  });

  assert.equal(response.counts.accepted, 0);
  assert.equal(response.counts.duplicates, 1);
  assert.equal(prisma.items[0].status, 'duplicate');
  assert.equal(prisma.items[0].rejectReason, 'duplicate_email');
  assert.equal(prisma.radarRows.length, 1);
});

test('LeadHarvestImport recusa payload com segredo', async () => {
  const service = new LeadHarvestImportService(createPrismaMock(), new LeadHarvestNormalizerService());

  await assert.rejects(
    () => service.importBatchForUser(adminUser(), {
      batchId: 'batch-secret',
      sourceMode: 'production',
      sourceName: 'VPS Production',
      emails: [{
        externalId: 'email-1',
        email: 'contato@empresa.com.br',
        sourceUrl: 'https://empresa.com.br',
        provider: 'official_probe',
        evidence: { apiToken: 'segredo' },
      }],
    }),
    BadRequestException,
  );
});

test('LeadHarvestImport exige ADMIN ou MASTER', async () => {
  const service = new LeadHarvestImportService(createPrismaMock(), new LeadHarvestNormalizerService());

  await assert.rejects(
    () => service.importBatchForUser({ id: 10, companyId: 7, role: 'USER' }, {
      batchId: 'batch-user',
      sourceMode: 'production',
      sourceName: 'VPS Production',
    }),
    ForbiddenException,
  );
});
