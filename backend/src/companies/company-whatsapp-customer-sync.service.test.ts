import test from 'node:test';
import assert from 'node:assert/strict';

import { CompanyWhatsAppCustomerSyncService } from './company-whatsapp-customer-sync.service';

function createService(overrides?: Partial<Record<string, any>>) {
  const prisma = {
    companyConversation: {
      findMany: async () => [],
    },
    ...(overrides?.prisma || {}),
  } as any;

  const cadastrosService = {
    normalizeCustomerPhone: (phone: string) => String(phone || '').replace(/\D/g, '').slice(-13),
    listRawCustomerRegistry: async () => [],
    upsertCustomerRegistry: async () => ({ id: 'registry-1' }),
    ...(overrides?.cadastrosService || {}),
  } as any;

  const operationalStatus = {
    getOperationalStatusForCompany: async () => ({ metaActive: false, webWhatsActive: false }),
    ...(overrides?.operationalStatus || {}),
  } as any;

  const webwhatsBridge = {
    syncRecentChats: async () => 0,
    listContacts: async () => [],
    ...(overrides?.webwhatsBridge || {}),
  } as any;

  const service = new CompanyWhatsAppCustomerSyncService(
    prisma,
    cadastrosService,
    operationalStatus,
    webwhatsBridge,
  );

  return { service, prisma, cadastrosService, operationalStatus, webwhatsBridge };
}

test('syncCompanyCustomers usa Meta e cadastra contatos sem nome com o telefone', async () => {
  const upsertCalls: Array<Record<string, unknown>> = [];
  const { service } = createService({
    operationalStatus: {
      getOperationalStatusForCompany: async () => ({ metaActive: true, webWhatsActive: false }),
    },
    prisma: {
      companyConversation: {
        findMany: async () => [
          {
            id: 11,
            contact: '+5511999988877',
            metadata: JSON.stringify({ whatsappContactName: 'Maria Silva' }),
            lastMessageAt: new Date('2026-04-10T10:00:00.000Z'),
          },
          {
            id: 12,
            contact: '+551188887777',
            metadata: JSON.stringify({ whatsappContactName: '' }),
            lastMessageAt: new Date('2026-04-10T09:00:00.000Z'),
          },
        ],
      },
    },
    cadastrosService: {
      upsertCustomerRegistry: async (input: Record<string, unknown>) => {
        upsertCalls.push(input);
        return { id: 'registry-meta' };
      },
    },
  });

  const result = await service.syncCompanyCustomers(7);

  assert.equal(result.engine, 'meta');
  assert.equal(result.sourceLabel, 'Meta');
  assert.equal(result.syncedContacts, 2);
  assert.equal(result.syncedWithoutName, 1);
  assert.equal(result.skippedWithoutName, 0);
  assert.equal(upsertCalls.length, 2);
  assert.equal(upsertCalls[0].phone, '+5511999988877');
  assert.equal(upsertCalls[0].name, 'Maria Silva');
  assert.equal(upsertCalls[0].registrationOrigin, 'meta_sync');
  assert.equal(upsertCalls[1].phone, '+551188887777');
  assert.equal(upsertCalls[1].name, null);
});

test('syncCompanyCustomers reaproveita nome da conversa ao sincronizar contatos do WebWhats', async () => {
  const upsertCalls: Array<Record<string, unknown>> = [];
  const { service, webwhatsBridge } = createService({
    operationalStatus: {
      getOperationalStatusForCompany: async () => ({ metaActive: false, webWhatsActive: true }),
    },
    prisma: {
      companyConversation: {
        findMany: async () => [
          {
            id: 41,
            contact: '+5511912345678',
            metadata: JSON.stringify({ whatsappName: 'Carlos do WhatsApp' }),
            lastMessageAt: new Date('2026-04-12T08:30:00.000Z'),
          },
        ],
      },
    },
    webwhatsBridge: {
      syncRecentChats: async () => 8,
      listContacts: async () => [
        { remoteJid: '5511912345678@s.whatsapp.net', pushName: '' },
        { remoteJid: '5511988877766@s.whatsapp.net', name: 'Novo Cliente' },
      ],
    },
    cadastrosService: {
      upsertCustomerRegistry: async (input: Record<string, unknown>) => {
        upsertCalls.push(input);
        return { id: 'registry-webwhats' };
      },
    },
  });

  const result = await service.syncCompanyCustomers(7);

  assert.equal(result.engine, 'webwhats');
  assert.equal(result.sourceLabel, 'WebWhats');
  assert.equal(result.syncedConversations, 8);
  assert.equal(result.syncedContacts, 2);
  assert.equal(upsertCalls.length, 2);
  assert.equal(upsertCalls[0].registrationOrigin, 'webwhats_sync');
  assert.equal(upsertCalls[0].name, 'Carlos do WhatsApp');
  assert.equal(upsertCalls[1].name, 'Novo Cliente');
  assert.equal(typeof webwhatsBridge.listContacts, 'function');
});

test('syncCompanyCustomers corrige nome ruim salvo quando o WhatsApp traz um nome melhor', async () => {
  const upsertCalls: Array<Record<string, unknown>> = [];
  const { service } = createService({
    operationalStatus: {
      getOperationalStatusForCompany: async () => ({ metaActive: false, webWhatsActive: true }),
    },
    prisma: {
      companyConversation: {
        findMany: async () => [],
      },
    },
    webwhatsBridge: {
      syncRecentChats: async () => 2,
      listContacts: async () => [
        { remoteJid: '5519996015804@s.whatsapp.net', fullName: 'Glauco' },
      ],
    },
    cadastrosService: {
      listRawCustomerRegistry: async () => [
        {
          phoneNormalized: '5519996015804',
          registrationOrigin: 'webwhats_sync',
          registrationStatus: 'confirmed',
          lastMessageAt: null,
          conversationId: null,
          name: '+5519996015804',
        },
      ],
      upsertCustomerRegistry: async (input: Record<string, unknown>) => {
        upsertCalls.push(input);
        return { id: 'registry-fix-name' };
      },
    },
  });

  const result = await service.syncCompanyCustomers(7);

  assert.equal(result.syncedContacts, 1);
  assert.equal(upsertCalls.length, 1);
  assert.equal(upsertCalls[0].name, 'Glauco');
});

test('syncCompanyCustomers falha quando nenhum motor WhatsApp esta ativo', async () => {
  const { service } = createService({
    operationalStatus: {
      getOperationalStatusForCompany: async () => ({ metaActive: false, webWhatsActive: false }),
    },
  });

  await assert.rejects(
    () => service.syncCompanyCustomers(7),
    /Nenhum motor WhatsApp ativo/,
  );
});

test('syncCompanyCustomers preserva origem manual ao atualizar um cadastro ja existente', async () => {
  const upsertCalls: Array<Record<string, unknown>> = [];
  const { service } = createService({
    operationalStatus: {
      getOperationalStatusForCompany: async () => ({ metaActive: true, webWhatsActive: false }),
    },
    prisma: {
      companyConversation: {
        findMany: async () => [
          {
            id: 51,
            contact: '+5511991112222',
            metadata: JSON.stringify({ whatsappContactName: 'Cliente Manual' }),
            lastMessageAt: new Date('2026-04-13T09:15:00.000Z'),
          },
        ],
      },
    },
    cadastrosService: {
      listRawCustomerRegistry: async () => [
        {
          phoneNormalized: '5511991112222',
          registrationOrigin: 'manual',
          registrationStatus: 'manual',
          lastMessageAt: null,
          conversationId: null,
          name: 'Cliente Manual',
        },
      ],
      upsertCustomerRegistry: async (input: Record<string, unknown>) => {
        upsertCalls.push(input);
        return { id: 'registry-manual' };
      },
    },
  });

  const result = await service.syncCompanyCustomers(7);

  assert.equal(result.syncedContacts, 1);
  assert.equal(upsertCalls.length, 1);
  assert.equal(upsertCalls[0].registrationOrigin, 'manual');
  assert.equal(upsertCalls[0].registrationStatus, 'manual');
});
