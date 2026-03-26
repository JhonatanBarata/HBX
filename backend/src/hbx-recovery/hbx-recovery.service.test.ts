import test from 'node:test';
import assert from 'node:assert/strict';
import { HbxRecoveryService } from './hbx-recovery.service';

function createService() {
  return new HbxRecoveryService({} as any, {} as any, {} as any) as any;
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
      findUnique: async () => ({ name: 'Colsani' }),
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
        'Ola, tudo bem? Aqui e da {{empresa}}.\nFalo com {{cliente}}?\nTemos um assunto referente ao servico prestado no dia {{data_servico}}, posso continuar?',
      footerText: 'Recovery Colsani',
      buttons: ['Sim.', 'Nao, obrigado.', 'Falar com atendente.'],
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
    customer: { id: 'cust-1', whatsappNumber: '+5519997024884' },
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
            whatsappNumber: '+5519997024884',
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
