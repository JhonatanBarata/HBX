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