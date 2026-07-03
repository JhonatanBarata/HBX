import test from 'node:test';
import assert from 'node:assert/strict';
import { HbxRecoveryService } from './hbx-recovery.service';

function createService() {
  return new HbxRecoveryService({} as any, {} as any, {} as any, {} as any) as any;
}

test('sync with header NONE removes stale local media', () => {
  const service = createService();

  const template = service.createMetaTemplateRecord({
    id: 'tpl-1',
    name: 'colsani_semlogo',
    language: 'pt_BR',
    category: 'UTILITY',
    status: 'APPROVED',
    qualityScore: 'GREEN',
    rejectedReason: 'NONE',
    components: [
      {
        type: 'BODY',
        text: 'Ola {{1}}, vencimento {{2}}',
        example: { body_text: [['Maria', '12/03/2026']] },
      },
    ],
    hbxActive: true,
    lastMetaSyncAt: '2026-03-18T10:00:00.000Z',
    localMedia: {
      headerMediaUrl: 'https://cdn.example.com/stale.jpg',
      headerMediaFileName: 'stale.jpg',
      headerMediaContentType: 'image/jpeg',
      headerMediaBase64: 'abc123',
    },
  });

  assert.equal(template.headerFormat, 'NONE');
  assert.equal(template.headerMediaUrl, null);
  assert.equal(template.headerMediaFileName, null);
  assert.equal(template.headerMediaBase64, null);
  assert.equal(template.normalized.header.format, 'NONE');
});

test('sync stores exact BODY variables and examples returned by Meta', () => {
  const service = createService();

  const template = service.createMetaTemplateRecord({
    id: 'tpl-2',
    name: 'colsani_semlogo',
    language: 'pt_BR',
    category: 'UTILITY',
    status: 'APPROVED',
    qualityScore: 'GREEN',
    rejectedReason: null,
    components: [
      {
        type: 'BODY',
        text: 'Empresa {{1}} | Operador {{2}} | Cliente {{3}} | Data {{4}}',
        example: { body_text: [['Colsani', 'Brenda', 'Carlos', '12/03/2026']] },
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'QUICK_REPLY', text: 'Sim' },
          { type: 'QUICK_REPLY', text: 'Nao' },
        ],
      },
    ],
    hbxActive: true,
    lastMetaSyncAt: '2026-03-18T10:00:00.000Z',
  });

  assert.deepEqual(template.variableKeys, ['1', '2', '3', '4']);
  assert.deepEqual(template.normalized.body.variableOrder, ['1', '2', '3', '4']);
  assert.deepEqual(template.normalized.body.variableExamples, {
    '1': 'Colsani',
    '2': 'Brenda',
    '3': 'Carlos',
    '4': '12/03/2026',
  });
  assert.equal(template.bodyText, 'Empresa {{1}} | Operador {{2}} | Cliente {{3}} | Data {{4}}');
});

test('sync update overwrites stale header instead of keeping previous one', () => {
  const service = createService();

  const updated = service.rebuildMetaTemplateRecord({
    id: 'tpl-3',
    name: 'colsani_semlogo',
    language: 'pt_BR',
    category: 'UTILITY',
    status: 'APPROVED',
    qualityScore: 'GREEN',
    rejectedReason: null,
    headerFormat: 'IMAGE',
    headerMediaUrl: 'https://cdn.example.com/old.jpg',
    headerMediaFileName: 'old.jpg',
    headerMediaContentType: 'image/jpeg',
    headerMediaBase64: 'old-base64',
    components: [
      {
        type: 'BODY',
        text: 'Mensagem {{1}}',
        example: { body_text: [['Teste']] },
      },
    ],
    hbxActive: true,
    lastMetaSyncAt: '2026-03-18T10:00:00.000Z',
  });

  assert.equal(updated.headerFormat, 'NONE');
  assert.equal(updated.headerMediaUrl, null);
  assert.equal(updated.normalized.header.mediaUrl, null);
});

test('rebuildMetaTemplateRecord applies top-level media overrides over stale normalized snapshot', () => {
  const service = createService();

  const current = service.createMetaTemplateRecord({
    id: 'tpl-3b',
    name: 'colsani_log4',
    language: 'pt_BR',
    category: 'UTILITY',
    status: 'APPROVED',
    qualityScore: 'GREEN',
    rejectedReason: null,
    components: [
      {
        type: 'HEADER',
        format: 'IMAGE',
        example: { header_handle: ['4::old-handle'] },
      },
      {
        type: 'BODY',
        text: 'Mensagem {{1}}',
        example: { body_text: [['Teste']] },
      },
    ],
    hbxActive: true,
    lastMetaSyncAt: '2026-03-18T10:00:00.000Z',
    localMedia: {
      headerMediaUrl: 'https://cdn.example.com/old.jpg',
      headerMediaFileName: 'old.jpg',
      headerMediaContentType: 'image/jpeg',
      headerMediaBase64: 'old-base64',
    },
  });

  const updated = service.rebuildMetaTemplateRecord({
    ...current,
    headerMediaUrl: 'https://api.hbxsystem.com.br/hbx-recovery/public/meta-template-media/7/colsani_log4?language=pt_BR',
    headerMediaFileName: 'colsani_log4.jpg',
    headerMediaContentType: 'image/jpeg',
    headerMediaBase64: 'new-base64',
  });

  assert.equal(
    updated.headerMediaUrl,
    'https://api.hbxsystem.com.br/hbx-recovery/public/meta-template-media/7/colsani_log4?language=pt_BR',
  );
  assert.equal(updated.headerMediaFileName, 'colsani_log4.jpg');
  assert.equal(updated.headerMediaBase64, 'new-base64');
  assert.equal(
    updated.normalized.header.mediaUrl,
    'https://api.hbxsystem.com.br/hbx-recovery/public/meta-template-media/7/colsani_log4?language=pt_BR',
  );
});

test('resolveTemplateHeaderMediaUrl adds deterministic version token for managed media', () => {
  const service = createService();
  const previousPublicBase = process.env.PUBLIC_API_BASE_URL;
  process.env.PUBLIC_API_BASE_URL = 'https://api.hbxsystem.com.br';

  try {
    const template = service.createMetaTemplateRecord({
      id: 'tpl-3c',
      name: 'colsani_log4',
      language: 'pt_BR',
      category: 'UTILITY',
      status: 'APPROVED',
      qualityScore: 'GREEN',
      rejectedReason: null,
      components: [
        {
          type: 'HEADER',
          format: 'IMAGE',
          example: { header_handle: ['4::current-handle'] },
        },
        {
          type: 'BODY',
          text: 'Mensagem {{1}}',
          example: { body_text: [['Teste']] },
        },
      ],
      hbxActive: true,
      lastMetaSyncAt: '2026-03-18T10:00:00.000Z',
      localMedia: {
        headerMediaUrl: 'https://api.hbxsystem.com.br/hbx-recovery/public/meta-template-media/7/colsani_log4?language=pt_BR',
        headerMediaFileName: 'colsani_log4.jpg',
        headerMediaContentType: 'image/jpeg',
        headerMediaBase64: 'base64-image-a',
      },
    });

    const resolvedUrl = service.resolveTemplateHeaderMediaUrl(template, 7, 'hbx_recovery');

    assert.match(
      String(resolvedUrl || ''),
      /^https:\/\/api\.hbxsystem\.com\.br\/hbx-recovery\/public\/meta-template-media\/7\/colsani_log4\?language=pt_BR&v=[a-f0-9]{12}$/,
    );
  } finally {
    if (previousPublicBase === undefined) {
      delete process.env.PUBLIC_API_BASE_URL;
    } else {
      process.env.PUBLIC_API_BASE_URL = previousPublicBase;
    }
  }
});

test('start-template builds BODY parameters for four Meta variables and no header', () => {
  const service = createService();
  const template = service.createMetaTemplateRecord({
    id: 'tpl-4',
    name: 'colsani_semlogo',
    language: 'pt_BR',
    category: 'UTILITY',
    status: 'APPROVED',
    qualityScore: 'GREEN',
    rejectedReason: null,
    components: [
      {
        type: 'BODY',
        text: 'Empresa {{1}} | Operador {{2}} | Cliente {{3}} | Data {{4}}',
        example: { body_text: [['Colsani', 'Brenda', 'Carlos', '12/03/2026']] },
      },
      {
        type: 'BUTTONS',
        buttons: [{ type: 'QUICK_REPLY', text: 'Sim' }],
      },
    ],
    hbxActive: true,
    lastMetaSyncAt: '2026-03-18T10:00:00.000Z',
  });

  const components = service.buildRecoveryInitialTemplateComponents(
    'Colsani',
    { name: 'Carlos', clientName: 'Carlos', createdAt: new Date('2026-03-12T12:00:00Z') },
    template,
    'Brenda',
  );

  assert.equal(components.length, 1);
  assert.equal(components[0].type, 'body');
  assert.equal(Array.isArray(components[0].parameters), true);
  assert.equal(components[0].parameters.length, 4);
  assert.deepEqual(
    components[0].parameters.map((item: { text: string }) => item.text),
    ['Colsani', 'Brenda', 'Carlos', '12/03/2026'],
  );
});

test('start-template fails with clear error when template requires unsupported variable count', () => {
  const service = createService();
  const template = service.createMetaTemplateRecord({
    id: 'tpl-5',
    name: 'template_com_muitas_variaveis',
    language: 'pt_BR',
    category: 'UTILITY',
    status: 'APPROVED',
    qualityScore: 'GREEN',
    rejectedReason: null,
    components: [
      {
        type: 'BODY',
        text: '1 {{1}} 2 {{2}} 3 {{3}} 4 {{4}} 5 {{5}} 6 {{6}} 7 {{7}} 8 {{8}} 9 {{9}} 10 {{10}}',
        example: { body_text: [['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']] },
      },
      {
        type: 'BUTTONS',
        buttons: [{ type: 'QUICK_REPLY', text: 'Sim' }],
      },
    ],
    hbxActive: true,
    lastMetaSyncAt: '2026-03-18T10:00:00.000Z',
  });

  assert.throws(
    () =>
      service.buildRecoveryInitialTemplateComponents(
        'Colsani',
        { name: 'Carlos', clientName: 'Carlos', createdAt: new Date('2026-03-12T12:00:00Z') },
        template,
        'Brenda',
      ),
    /exige 10 variaveis no BODY/i,
  );
});

test('createMetaTemplate omits deprecated allow_category_change and reuses pending image handle', async () => {
  const service = createService();
  let capturedPayload: Record<string, unknown> | null = null;

  service.prisma = {
    company: {
      findUnique: async () => ({ name: 'Colsani', whatsappConnectionMode: 'OFFICIAL' }),
    },
  };
  service.getMetaTemplateRegistry = async () => ({
    phoneNumberId: '123',
    wabaId: '456',
    lastSyncAt: null,
    templates: [],
    history: [],
    pendingMedia: [
      {
        templateKey: 'colsani_clog3::pt_br',
        name: 'colsani_clog3',
        language: 'pt_BR',
        headerHandle: '4::abc123',
        headerMediaFileName: 'colsani_clog3_pt_br.jpg',
        headerMediaContentType: 'image/jpeg',
        headerMediaBase64: 'base64',
        updatedAt: '2026-03-26T12:00:00.000Z',
      },
    ],
  });
  service.getRecoveryOperatorName = async () => 'Brenda';
  service.resolveMetaTemplateContext = async () => ({
    accessToken: 'token',
    templateNodeIds: ['waba-1'],
  });
  service.createMetaTemplateOnProvider = async (_templateNodeIds: string[], _accessToken: string, payload: any) => {
    capturedPayload = payload;
    return { response: { data: { id: 'tpl-123' } }, usedNodeId: 'waba-1' };
  };
  service.syncMetaTemplatesByCompanyId = async () => ({
    phoneNumberId: '123',
    wabaId: '456',
    lastSyncAt: null,
    templates: [],
    history: [],
    pendingMedia: [
      {
        templateKey: 'colsani_clog3::pt_br',
        name: 'colsani_clog3',
        language: 'pt_BR',
        headerHandle: '4::abc123',
        headerMediaFileName: 'colsani_clog3_pt_br.jpg',
        headerMediaContentType: 'image/jpeg',
        headerMediaBase64: 'base64',
        updatedAt: '2026-03-26T12:00:00.000Z',
      },
    ],
  });
  service.saveMetaTemplateRegistry = async (_companyId: number, registry: any) => registry;
  service.buildMetaTemplatesResponse = () => ({
    phoneNumberId: '123',
    wabaId: '456',
    lastSyncAt: null,
    templates: [],
    history: [],
    counters: { total: 0, approved: 0, pending: 0, hbxActive: 0, eligible: 0 },
  });

  const response = await service.createMetaTemplate(
    { companyId: 7, id: 99 },
    {
      name: 'colsani_clog3',
      category: 'MARKETING',
      language: 'pt_BR',
      headerFormat: 'IMAGE',
      headerHandle: '',
      headerMediaUrl: '',
      bodyText:
        'Olá, tudo bem? Aqui é da {{empresa}}.\nFalo com {{cliente}}?\nTemos um assunto referente ao serviço prestado no dia {{data_servico}}, posso continuar?',
      footerText: 'Recovery Colsani',
      buttons: ['Sim.', 'Não, obrigado.', 'Falar com atendente.'],
      activateInHbx: true,
      variableExamples: {
        empresa: 'Colsani',
        cliente: 'Maria Oliveira',
        data_servico: '12/03/2026',
      },
    },
    { moduleKey: 'hbx_recovery' },
  );

  assert.equal(response.ok, true);
  assert.equal(Boolean(capturedPayload), true);
  assert.equal(Object.prototype.hasOwnProperty.call(capturedPayload || {}, 'allow_category_change'), false);
  assert.deepEqual((capturedPayload?.components as any[])[0], {
    type: 'HEADER',
    format: 'IMAGE',
    example: {
      header_handle: ['4::abc123'],
    },
  });
});

test('human interaction reply uses live conversation contact instead of stale customer phone', async () => {
  const service = createService();
  let queuedPayload: Record<string, unknown> | null = null;

  service.getInteractionContext = async () => ({
    conversation: { id: 3, contact: '+5516993903340' },
    customer: { id: 'cust-1', whatsappNumber: '++5519997024884' },
  });
  service.conversations = {
    queueOutboundForCompany: async (_companyId: number, payload: Record<string, unknown>) => {
      queuedPayload = payload;
      return { ok: true };
    },
  };

  const result = await service.sendInteractionHumanMessage(
    { companyId: 7, id: 99 },
    3,
    'Olá, recebi sua mensagem agora.',
  );

  assert.equal(result.ok, true);
  assert.deepEqual(queuedPayload, {
    conversationId: 3,
    to: '+5516993903340',
    contactId: 'cust-1',
    body: 'Olá, recebi sua mensagem agora.',
    messageType: 'text',
    sourceModule: 'hbx_recovery_human',
    senderType: 'human',
    flowState: {
      currentFlow: 'cobranca_recovery_whatsapp_hibrido',
      currentStep: 'atendimento_humano',
      botActive: false,
      humanAssigned: true,
      assignedUserId: 99,
    },
  });
});

test('resolveOpenDebtCaseIdForCustomer reuses existing open debt case for recovery profile', async () => {
  const service = createService();
  let createCalled = false;

  service.prisma = {
    debtCase: {
      findFirst: async () => ({ id: 'debt-existing' }),
      create: async () => {
        createCalled = true;
        return { id: 'debt-created' };
      },
    },
  };

  const debtCaseId = await service.resolveOpenDebtCaseIdForCustomer(7, {
    id: 'rec-1',
    customerProfileId: 'profile-1',
    openAmount: 321,
    createdAt: new Date('2026-03-28T10:00:00.000Z'),
  });

  assert.equal(debtCaseId, 'debt-existing');
  assert.equal(createCalled, false);
});

test('toPaymentItem exposes debtCaseId without breaking customer-based payload', () => {
  const service = createService();

  const item = service.toPaymentItem({
    id: 'pay-1',
    customerId: 'rec-1',
    debtCaseId: 'debt-1',
    customer: {
      name: 'HBX Cliente',
      whatsappNumber: '+5519998877766',
    },
    amount: 123.45,
    currency: 'BRL',
    description: 'Teste',
    status: 'pending',
  });

  assert.equal(item.customerId, 'rec-1');
  assert.equal(item.debtCaseId, 'debt-1');
  assert.equal(item.customerName, 'HBX Cliente');
  assert.equal(item.status, 'pending');
});

test('full payment closes linked debt case and saves paidAt', async () => {
  const service = createService();
  const debtUpdates: any[] = [];

  service.findCustomer = async () => ({
    id: 'rec-1',
    customerProfileId: 'profile-1',
    openAmount: 100,
    totalPaid: 0,
    recurringDelays: 2,
    paymentHistoryScore: 5,
    averageDelay: 10,
    paymentHistory: '[]',
    delayHistory: '[]',
    createdAt: new Date('2026-03-01T12:00:00.000Z'),
  });
  service.attachCustomerRegistry = async (_companyId: number, row: any) => row;
  service.prisma = {
    hbxRecoveryCustomer: {
      updateMany: async () => ({ count: 1 }),
    },
    debtCase: {
      findFirst: async ({ where }: any) => {
        if (where?.status === 'open') {
          return { id: 'debt-1', dueDate: new Date('2026-03-01T12:00:00.000Z'), rawPayloadJson: '{"x":1}' };
        }
        return { id: 'debt-1', dueDate: new Date('2026-03-01T12:00:00.000Z'), rawPayloadJson: '{"x":1}', paidAt: null };
      },
      update: async (input: any) => {
        debtUpdates.push(input);
        return { id: 'debt-1', ...input.data };
      },
    },
  };

  const when = new Date('2026-03-28T15:00:00.000Z');
  const result = await service.applyPayment(7, 'rec-1', 100, 'Quitacao total', when);

  assert.equal(result.changed, true);
  assert.equal(debtUpdates.length, 1);
  assert.equal(debtUpdates[0].data.status, 'paid');
  assert.equal(debtUpdates[0].data.amount, 0);
  assert.equal(new Date(debtUpdates[0].data.paidAt).toISOString(), when.toISOString());
});

test('partial payment keeps linked debt case open', async () => {
  const service = createService();
  const debtUpdates: any[] = [];

  service.findCustomer = async () => ({
    id: 'rec-1',
    customerProfileId: 'profile-1',
    openAmount: 100,
    totalPaid: 0,
    recurringDelays: 2,
    paymentHistoryScore: 5,
    averageDelay: 10,
    paymentHistory: '[]',
    delayHistory: '[]',
    createdAt: new Date('2026-03-01T12:00:00.000Z'),
  });
  service.attachCustomerRegistry = async (_companyId: number, row: any) => row;
  service.prisma = {
    hbxRecoveryCustomer: {
      updateMany: async () => ({ count: 1 }),
    },
    debtCase: {
      findFirst: async ({ where }: any) => {
        if (where?.status === 'open') {
          return { id: 'debt-1', dueDate: new Date('2026-03-01T12:00:00.000Z'), rawPayloadJson: '{"x":1}' };
        }
        return { id: 'debt-1', dueDate: new Date('2026-03-01T12:00:00.000Z'), rawPayloadJson: '{"x":1}', paidAt: null };
      },
      update: async (input: any) => {
        debtUpdates.push(input);
        return { id: 'debt-1', ...input.data };
      },
    },
  };

  const result = await service.applyPayment(7, 'rec-1', 40, 'Pagamento parcial');

  assert.equal(result.changed, true);
  assert.equal(debtUpdates.length, 1);
  assert.equal(debtUpdates[0].data.status, 'open');
  assert.equal(debtUpdates[0].data.amount, 60);
  assert.equal(debtUpdates[0].data.paidAt, null);
});

test('manual Recovery creation reuses existing CustomerProfile and links customerProfileId', async () => {
  const service = createService();
  const createCalls: any[] = [];

  service.cadastrosService = {
    getCustomerRegistryByPhone: async () => null,
    syncCustomerRegistryFromRecovery: async (_companyId: number, row: any) => ({ ...row, phone: row.whatsappNumber }),
  };
  service.prisma = {
    $transaction: async (callback: (tx: any) => Promise<unknown>) =>
      callback({
        customerProfile: {
          findFirst: async () => ({
            id: 'profile-existing',
            companyId: 7,
            phone: '+551199998888',
            phoneNormalized: '551199998888',
            name: 'Cliente Central',
            status: 'active',
          }),
          update: async ({ where, data }: any) => ({ id: where.id, ...data }),
        },
        hbxRecoveryCustomer: {
          create: async ({ data }: any) => {
            createCalls.push(data);
            return { id: 'rec-created', ...data };
          },
        },
        debtCase: {
          findFirst: async () => null,
          create: async ({ data }: any) => ({ id: 'debt-created', ...data }),
        },
      }),
  };

  const created = await service.createCustomer(
    { companyId: 7 },
    {
      name: 'Empresa Teste',
      clientName: 'Cliente Central',
      whatsappNumber: '+55 11 9999-8888',
      openAmount: 0,
    },
  );

  assert.equal(created.id, 'rec-created');
  assert.equal(createCalls.length, 1);
  assert.equal(createCalls[0].customerProfileId, 'profile-existing');
});

test('manual Recovery creation creates CustomerProfile and DebtCase when open amount exists', async () => {
  const service = createService();
  const profileCreates: any[] = [];
  const debtCreates: any[] = [];

  service.cadastrosService = {
    getCustomerRegistryByPhone: async () => null,
    syncCustomerRegistryFromRecovery: async (_companyId: number, row: any) => ({ ...row, phone: row.whatsappNumber }),
  };
  service.prisma = {
    $transaction: async (callback: (tx: any) => Promise<unknown>) =>
      callback({
        customerProfile: {
          findFirst: async () => null,
          create: async ({ data }: any) => {
            profileCreates.push(data);
            return { id: 'profile-new', ...data };
          },
        },
        hbxRecoveryCustomer: {
          create: async ({ data }: any) => ({ id: 'rec-created', ...data }),
        },
        debtCase: {
          findFirst: async () => null,
          create: async ({ data }: any) => {
            debtCreates.push(data);
            return { id: 'debt-created', ...data };
          },
        },
      }),
  };

  const created = await service.createCustomer(
    { companyId: 7 },
    {
      name: 'Empresa Teste',
      clientName: 'Cliente Final',
      whatsappNumber: '+55 11 98888-7777',
      openAmount: 250.5,
      registrationDate: '2026-03-20',
    },
  );

  assert.equal(created.id, 'rec-created');
  assert.equal(profileCreates.length, 1);
  assert.equal(profileCreates[0].phoneNormalized, '5511988887777');
  assert.equal(debtCreates.length, 1);
  assert.equal(debtCreates[0].customerProfileId, 'profile-new');
  assert.equal(debtCreates[0].status, 'open');
  assert.equal(Number(debtCreates[0].amount), 250.5);
});

test('recovery customer resolution falls back to recovery message contactId when phone changed', async () => {
  const service = createService();
  service.prisma = {
    hbxRecoveryCustomer: {
      findFirst: async ({ where }: { where: Record<string, any> }) => {
        if (where?.id === 'cust-77') {
          return {
            id: 'cust-77',
            name: 'Jhonatan',
            clientName: 'Jhonatan',
            whatsappNumber: '++5519997024884',
            openAmount: 120,
            status: 'OVERDUE',
          };
        }
        return null;
      },
    },
    hbxRecoveryPayment: {
      findFirst: async () => null,
    },
    companyMessage: {
      findFirst: async () => ({ contactId: 'cust-77' }),
    },
  };

  const resolved = await service.resolveRecoveryCustomerForConversation(
    { id: 3, contact: '+5516993903340', metadata: '{}' },
    7,
  );

  assert.equal(resolved?.id, 'cust-77');
});

test('listInteractions uses a Prisma-safe Recovery conversation filter', async () => {
  const service = createService();
  let conversationFindManyArgs = null;

  service.prisma = {
    companyConversation: {
      findMany: async (args: any) => {
        conversationFindManyArgs = args;
        return [];
      },
    },
  };

  const result = await service.listInteractions({ companyId: 7 }, 'all');

  assert.equal(result.queue, 'all');
  assert.equal(result.pendingHumanCount, 0);
  assert.deepEqual(result.conversations, []);
  assert.deepEqual(conversationFindManyArgs?.where?.OR, [
    { currentFlow: 'cobranca_recovery_whatsapp_hibrido' },
    { currentFlow: 'cobranca_recovery' },
    { currentStep: { notIn: ['', 'novo'] } },
    { messages: { some: { sourceModule: { startsWith: 'hbx_recovery' } } } },
  ]);
});

test('applyPayment relê e reaplica sobre saldo novo quando perde a corrida (optimistic lock)', async () => {
  const service = createService();
  // Estado compartilhado; um "writer concorrente" abaixou o saldo de 100 p/ 70 e mudou
  // o updatedAt ANTES do nosso primeiro updateMany fechar → 1ª tentativa casa 0 linhas.
  const store: any = {
    id: 'c1', companyId: 1, openAmount: 100, totalPaid: 0, recurringDelays: 2,
    paymentHistoryScore: 5, averageDelay: 10, paymentHistory: '[]', delayHistory: '[]',
    status: 'OVERDUE', updatedAt: new Date(1000),
  };
  let updateCalls = 0;
  service.prisma = {
    hbxRecoveryCustomer: {
      findFirst: async () => ({ ...store }),
      updateMany: async ({ where, data }: any) => {
        updateCalls += 1;
        if (updateCalls === 1) {
          store.openAmount = 70;
          store.updatedAt = new Date(2000);
          return { count: 0 };
        }
        if (where.updatedAt.getTime() !== store.updatedAt.getTime()) return { count: 0 };
        Object.assign(store, data, { updatedAt: new Date(store.updatedAt.getTime() + 1) });
        return { count: 1 };
      },
    },
  };
  service.attachCustomerRegistry = async (_c: number, r: any) => r;
  service.syncRecoveryDebtCaseBalance = async () => {};

  const res = await service.applyPayment(1, 'c1', 30, 'pagamento');

  assert.equal(updateCalls, 2);
  assert.equal(res.amount, 30);
  assert.equal(store.openAmount, 40);
});

test('applyPayment aborta com erro claro sob contenção patológica (sem loop infinito)', async () => {
  const service = createService();
  const store: any = {
    id: 'c1', companyId: 1, openAmount: 100, totalPaid: 0, recurringDelays: 0,
    paymentHistoryScore: 5, averageDelay: 0, paymentHistory: '[]', delayHistory: '[]',
    status: 'OVERDUE', updatedAt: new Date(1000),
  };
  let updateCalls = 0;
  service.prisma = {
    hbxRecoveryCustomer: {
      findFirst: async () => ({ ...store }),
      updateMany: async () => {
        updateCalls += 1;
        return { count: 0 };
      },
    },
  };
  service.attachCustomerRegistry = async (_c: number, r: any) => r;
  service.syncRecoveryDebtCaseBalance = async () => {};

  await assert.rejects(() => service.applyPayment(1, 'c1', 30, 'pagamento'), /Concorr/);
  assert.equal(updateCalls, 5);
});
