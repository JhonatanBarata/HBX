import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { WebwhatsBridgeService, WebwhatsProviderError } from './webwhats-bridge.service';

const TEST_SESSION = {
  id: 'session-47',
  tenantKey: 'company-47',
  phoneNormalized: '5511999998888',
  displayPhone: '+5511999998888',
};

const TEST_SESSION_COMPANY_7 = {
  id: 'session-7',
  tenantKey: 'company-7',
  phoneNormalized: '5511999998888',
  displayPhone: '+5511999998888',
};

function makeConversation(overrides?: Record<string, unknown>) {
  return {
    id: 70,
    contact: '+5511943171224',
    whatsappConnectionSessionId: 'session-47',
    sourcePhoneNormalized: '5511999998888',
    sourceTenantKey: 'company-47',
    metadata: JSON.stringify({
      whatsappRemoteJid: '230498781634702@lid',
      whatsappRemoteJidAlt: '5511943171224@s.whatsapp.net',
    }),
    currentFlow: null,
    currentStep: null,
    flowResult: null,
    botActive: true,
    humanAssigned: false,
    assignedUserId: null,
    lastMessageAt: new Date('2026-04-15T12:00:00.000Z'),
    lastInteractionAt: new Date('2026-04-15T12:00:00.000Z'),
    createdAt: new Date('2026-04-15T12:00:00.000Z'),
    updatedAt: new Date('2026-04-15T12:00:00.000Z'),
    ...(overrides || {}),
  };
}

function createBareWebwhatsBridgeService() {
  return Object.create(WebwhatsBridgeService.prototype) as any;
}

test('resolveCurrentWebwhatsSession é READ-ONLY: sem sessão ativa retorna null (não cria, não escreve)', async () => {
  const previousUrl = process.env.WHATSAPP_MODAL_INTERNAL_URL;
  const previousKey = process.env.WHATSAPP_MODAL_API_KEY;
  process.env.WHATSAPP_MODAL_INTERNAL_URL = 'http://webwhats.test';
  process.env.WHATSAPP_MODAL_API_KEY = 'test-key';

  // O ciclo de vida da sessão é do connect (whatsapp-modal.service). O bridge só LÊ —
  // jamais cria/relabela (era a cópia do bug que vazava chat entre chips).
  const sessions: any[] = [];
  const companyUpdates: any[] = [];
  const prisma = {
    company: {
      findUnique: async () => ({
        id: 66,
        whatsappModalStatus: 'CONNECTED',
        whatsappModalPhone: null,
        whatsappModalConnectedAt: new Date('2026-05-09T12:00:00.000Z'),
        currentWhatsappConnectionSessionId: null,
        currentWhatsappConnectionSession: null,
      }),
      update: async ({ data }: any) => {
        companyUpdates.push(data);
        return { id: 66, ...data };
      },
    },
    whatsAppConnectionSession: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        const session = { id: 'session-should-not-be-created', ...data };
        sessions.push(session);
        return session;
      },
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      updateMany: async () => ({ count: 0 }),
    },
  };
  const service = new WebwhatsBridgeService(prisma as any) as any;

  try {
    const session = await service.resolveCurrentWebwhatsSession(66);

    assert.equal(session, null);
    assert.equal(sessions.length, 0);
    assert.equal(companyUpdates.length, 0);
  } finally {
    if (previousUrl === undefined) delete process.env.WHATSAPP_MODAL_INTERNAL_URL;
    else process.env.WHATSAPP_MODAL_INTERNAL_URL = previousUrl;
    if (previousKey === undefined) delete process.env.WHATSAPP_MODAL_API_KEY;
    else process.env.WHATSAPP_MODAL_API_KEY = previousKey;
  }
});

test('resolveCurrentWebwhatsSession retorna a sessão atual sem reescrever (read-only)', async () => {
  const previousUrl = process.env.WHATSAPP_MODAL_INTERNAL_URL;
  const previousKey = process.env.WHATSAPP_MODAL_API_KEY;
  process.env.WHATSAPP_MODAL_INTERNAL_URL = 'http://webwhats.test';
  process.env.WHATSAPP_MODAL_API_KEY = 'test-key';

  const sessions: any[] = [];
  const companyUpdates: any[] = [];
  const prisma = {
    company: {
      findUnique: async () => ({
        id: 66,
        whatsappModalStatus: 'CONNECTED',
        whatsappModalPhone: '+5511999998888',
        whatsappModalConnectedAt: new Date('2026-05-09T12:00:00.000Z'),
        currentWhatsappConnectionSessionId: 'session-66',
        currentWhatsappConnectionSession: {
          id: 'session-66',
          provider: 'webwhats',
          tenantKey: 'company-66',
          phoneNormalized: '5511999998888',
          displayPhone: '+5511999998888',
          metadataJson: null,
          status: 'active',
        },
      }),
      update: async ({ data }: any) => {
        companyUpdates.push(data);
        return { id: 66, ...data };
      },
    },
    whatsAppConnectionSession: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        const session = { id: 'session-should-not-be-created', ...data };
        sessions.push(session);
        return session;
      },
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      updateMany: async () => ({ count: 0 }),
    },
  };
  const service = new WebwhatsBridgeService(prisma as any) as any;

  try {
    const session = await service.resolveCurrentWebwhatsSession(66);

    assert.equal(session.id, 'session-66');
    assert.equal(session.tenantKey, 'company-66');
    assert.equal(session.phoneNormalized, '5511999998888');
    assert.equal(sessions.length, 0);
    assert.equal(companyUpdates.length, 0);
  } finally {
    if (previousUrl === undefined) delete process.env.WHATSAPP_MODAL_INTERNAL_URL;
    else process.env.WHATSAPP_MODAL_INTERNAL_URL = previousUrl;
    if (previousKey === undefined) delete process.env.WHATSAPP_MODAL_API_KEY;
    else process.env.WHATSAPP_MODAL_API_KEY = previousKey;
  }
});

// POR USUÁRIO (18/06): a verdade da sessão é a LINHA WhatsAppConnectionSession (userId/tenantKey/
// active), NÃO `company.whatsappModalStatus`. O connect per-user de propósito não seta o status da
// empresa; mesmo assim o envio/recebimento têm que achar a sessão do user.
function setPerUserModalEnv() {
  const prev = {
    enabled: process.env.WHATSAPP_MODAL_ENABLED,
    url: process.env.WHATSAPP_MODAL_INTERNAL_URL,
    key: process.env.WHATSAPP_MODAL_API_KEY,
  };
  process.env.WHATSAPP_MODAL_ENABLED = 'true';
  process.env.WHATSAPP_MODAL_INTERNAL_URL = 'http://webwhats.test';
  process.env.WHATSAPP_MODAL_API_KEY = 'test-key';
  return prev;
}
function restorePerUserModalEnv(prev: { enabled?: string; url?: string; key?: string }) {
  const set = (k: string, v?: string) => (v === undefined ? delete (process.env as any)[k] : (process.env[k] = v));
  set('WHATSAPP_MODAL_ENABLED', prev.enabled);
  set('WHATSAPP_MODAL_INTERNAL_URL', prev.url);
  set('WHATSAPP_MODAL_API_KEY', prev.key);
}

test('POR USUÁRIO: resolveCurrentWebwhatsSession({userId}) acha a sessão do user mesmo com empresa != CONNECTED', async () => {
  const prev = setPerUserModalEnv();
  const prisma = {
    company: {
      findUnique: async () => {
        throw new Error('company.findUnique NÃO deve ser chamado no caminho per-user (independe do status/ponteiro da empresa)');
      },
    },
    whatsAppConnectionSession: {
      findFirst: async ({ where }: any) => {
        if (where.userId === 6 && where.status === 'active' && where.provider === 'webwhats' && where.companyId === 5) {
          return {
            id: 'session-c5-u6',
            tenantKey: 'company-5-user-6',
            phoneNormalized: '5519920121720',
            displayPhone: '+5519920121720',
            metadataJson: null,
            wipedAt: null,
          };
        }
        return null;
      },
    },
  };
  const service = new WebwhatsBridgeService(prisma as any) as any;
  try {
    const session = await service.resolveCurrentWebwhatsSession(5, { userId: 6 });
    assert.equal(session?.id, 'session-c5-u6');
    assert.equal(session?.tenantKey, 'company-5-user-6');
  } finally {
    restorePerUserModalEnv(prev);
  }
});

test('POR USUÁRIO: resolveCurrentWebwhatsSession({tenantKey}) mira a instância do webhook (company-{id}-user-{n})', async () => {
  const prev = setPerUserModalEnv();
  const prisma = {
    whatsAppConnectionSession: {
      findFirst: async ({ where }: any) => {
        if (where.tenantKey === 'company-5-user-6' && where.status === 'active') {
          return {
            id: 'session-c5-u6',
            tenantKey: 'company-5-user-6',
            phoneNormalized: '5519920121720',
            displayPhone: '+5519920121720',
            metadataJson: null,
            wipedAt: null,
          };
        }
        return null;
      },
    },
  };
  const service = new WebwhatsBridgeService(prisma as any) as any;
  try {
    const session = await service.resolveCurrentWebwhatsSession(5, { tenantKey: 'company-5-user-6' });
    assert.equal(session?.id, 'session-c5-u6');
    assert.equal(session?.tenantKey, 'company-5-user-6');
  } finally {
    restorePerUserModalEnv(prev);
  }
});

test('POR USUÁRIO: sendText com selector {sessionId} envia pela instância da sessão (per-user)', async () => {
  const prev = setPerUserModalEnv();
  const calls = { path: null as string | null, data: null as Record<string, unknown> | null };
  const prisma = {
    whatsAppConnectionSession: {
      findFirst: async ({ where }: any) =>
        where.id === 'session-c5-u6' && where.status === 'active'
          ? {
              id: 'session-c5-u6',
              tenantKey: 'company-5-user-6',
              phoneNormalized: '5519920121720',
              displayPhone: '+5519920121720',
              metadataJson: null,
              wipedAt: null,
            }
          : null,
    },
    companyConversation: { findFirst: async () => null },
  };
  const service = new WebwhatsBridgeService(prisma as any) as any;
  (service as any).requestRead = async (input: any) => {
    calls.path = input.path;
    calls.data = input.data;
    return { key: { id: 'MSG-7' } };
  };
  try {
    const result = await service.sendText(5, { to: '+5511999990000', text: 'Oi' }, { sessionId: 'session-c5-u6' });
    assert.equal(calls.path, '/message/sendText/company-5-user-6');
    assert.equal(result.providerMessageId, 'webwhats:company-5-user-6:MSG-7');
  } finally {
    restorePerUserModalEnv(prev);
  }
});

test('sendWhatsAppAudio posts Evolution voice note payload', async () => {
  const previousUrl = process.env.WHATSAPP_MODAL_INTERNAL_URL;
  const previousKey = process.env.WHATSAPP_MODAL_API_KEY;
  process.env.WHATSAPP_MODAL_INTERNAL_URL = 'http://webwhats.test';
  process.env.WHATSAPP_MODAL_API_KEY = 'test-key';

  const calls = {
    path: null as string | null,
    data: null as Record<string, unknown> | null,
  };
  const prisma = {
    company: {
      findUnique: async () => ({
        id: 47,
        whatsappModalStatus: 'connected',
        whatsappModalPhone: '+5511999998888',
        currentWhatsappConnectionSessionId: TEST_SESSION.id,
        currentWhatsappConnectionSession: {
          ...TEST_SESSION,
          provider: 'webwhats',
          status: 'active',
        },
      }),
    },
    companyConversation: {
      findFirst: async () => ({
        contact: '+5511999998888',
        metadata: JSON.stringify({
          whatsappRemoteJid: '5511999998888@s.whatsapp.net',
        }),
      }),
    },
  };
  const service = new WebwhatsBridgeService(prisma as any);

  (service as any).requestRead = async (input: any) => {
    calls.path = input.path;
    calls.data = input.data;
    return { key: { id: 'AUDIO-1' } };
  };

  try {
    const result = await service.sendWhatsAppAudio(47, {
      to: '+5511999998888',
      conversationId: 115,
      audio: 'https://cdn.example.test/audio.webm',
    });

    assert.equal(calls.path, '/message/sendWhatsAppAudio/company-47');
    assert.deepEqual(calls.data, {
      number: '5511999998888@s.whatsapp.net',
      audio: 'https://cdn.example.test/audio.webm',
    });
    assert.equal(result.providerMessageId, 'webwhats:company-47:AUDIO-1');
  } finally {
    if (previousUrl === undefined) delete process.env.WHATSAPP_MODAL_INTERNAL_URL;
    else process.env.WHATSAPP_MODAL_INTERNAL_URL = previousUrl;
    if (previousKey === undefined) delete process.env.WHATSAPP_MODAL_API_KEY;
    else process.env.WHATSAPP_MODAL_API_KEY = previousKey;
  }
});

// POR USUÁRIO: o envio usa o tenantKey da SESSÃO ATIVA (per-user `company-{id}-user-{n}`),
// não o id da empresa — cada usuário fala com a SUA instância no motor.
test('sendText usa tenantKey da sessao ativa quando diferente do id da empresa', async () => {
  const previousUrl = process.env.WHATSAPP_MODAL_INTERNAL_URL;
  const previousKey = process.env.WHATSAPP_MODAL_API_KEY;
  process.env.WHATSAPP_MODAL_INTERNAL_URL = 'http://webwhats.test';
  process.env.WHATSAPP_MODAL_API_KEY = 'test-key';

  const calls = {
    path: null as string | null,
    data: null as Record<string, unknown> | null,
  };
  const prisma = {
    company: {
      findUnique: async () => ({
        id: 10,
        whatsappModalStatus: 'connected',
        whatsappModalPhone: '+55119997024884',
        currentWhatsappConnectionSessionId: 'session-handoff',
        currentWhatsappConnectionSession: {
          id: 'session-handoff',
          tenantKey: 'company-11',
          provider: 'webwhats',
          status: 'active',
          phoneNormalized: '55119997024884',
          displayPhone: '+55119997024884',
          metadataJson: null,
        },
      }),
    },
    companyConversation: {
      findFirst: async () => null,
    },
  };
  const service = new WebwhatsBridgeService(prisma as any);

  (service as any).requestRead = async (input: any) => {
    calls.path = input.path;
    calls.data = input.data;
    return { key: { id: 'MSG-1' } };
  };

  try {
    const result = await service.sendText(10, {
      to: '+5511999990000',
      text: 'Oi',
    });

    assert.equal(calls.path, '/message/sendText/company-11');
    assert.deepEqual(calls.data, {
      number: '+5511999990000',
      text: 'Oi',
    });
    assert.equal(result.providerMessageId, 'webwhats:company-11:MSG-1');
  } finally {
    if (previousUrl === undefined) delete process.env.WHATSAPP_MODAL_INTERNAL_URL;
    else process.env.WHATSAPP_MODAL_INTERNAL_URL = previousUrl;
    if (previousKey === undefined) delete process.env.WHATSAPP_MODAL_API_KEY;
    else process.env.WHATSAPP_MODAL_API_KEY = previousKey;
  }
});

test('sendMedia posts sticker payload through Webwhats', async () => {
  const previousUrl = process.env.WHATSAPP_MODAL_INTERNAL_URL;
  const previousKey = process.env.WHATSAPP_MODAL_API_KEY;
  process.env.WHATSAPP_MODAL_INTERNAL_URL = 'http://webwhats.test';
  process.env.WHATSAPP_MODAL_API_KEY = 'test-key';

  const calls = {
    path: null as string | null,
    data: null as Record<string, unknown> | null,
  };
  const prisma = {
    company: {
      findUnique: async () => ({
        id: 47,
        whatsappModalStatus: 'connected',
        whatsappModalPhone: '+5511999998888',
        currentWhatsappConnectionSessionId: TEST_SESSION.id,
        currentWhatsappConnectionSession: {
          ...TEST_SESSION,
          provider: 'webwhats',
          status: 'active',
        },
      }),
    },
    companyConversation: {
      findFirst: async () => ({
        contact: '+5511999998888',
        metadata: JSON.stringify({
          whatsappRemoteJid: '5511999998888@s.whatsapp.net',
        }),
      }),
    },
  };
  const service = new WebwhatsBridgeService(prisma as any);

  (service as any).requestRead = async (input: any) => {
    calls.path = input.path;
    calls.data = input.data;
    return { key: { id: 'STICKER-OUT-1' } };
  };

  try {
    const result = await service.sendMedia(47, {
      to: '+5511999998888',
      conversationId: 115,
      mediaType: 'sticker',
      media: 'https://cdn.example.test/sticker.webp',
      mimeType: 'image/webp',
    });

    assert.equal(calls.path, '/message/sendMedia/company-47');
    assert.deepEqual(calls.data, {
      number: '5511999998888@s.whatsapp.net',
      mediatype: 'sticker',
      media: 'https://cdn.example.test/sticker.webp',
      mimetype: 'image/webp',
    });
    assert.equal(result.providerMessageId, 'webwhats:company-47:STICKER-OUT-1');
  } finally {
    if (previousUrl === undefined) delete process.env.WHATSAPP_MODAL_INTERNAL_URL;
    else process.env.WHATSAPP_MODAL_INTERNAL_URL = previousUrl;
    if (previousKey === undefined) delete process.env.WHATSAPP_MODAL_API_KEY;
    else process.env.WHATSAPP_MODAL_API_KEY = previousKey;
  }
});

test('markMessagesAsRead posts WhatsApp read keys through Webwhats', async () => {
  const previousUrl = process.env.WHATSAPP_MODAL_INTERNAL_URL;
  const previousKey = process.env.WHATSAPP_MODAL_API_KEY;
  process.env.WHATSAPP_MODAL_INTERNAL_URL = 'http://webwhats.test';
  process.env.WHATSAPP_MODAL_API_KEY = 'test-key';

  const calls = {
    path: null as string | null,
    data: null as Record<string, unknown> | null,
  };
  const prisma = {
    company: {
      findUnique: async () => ({
        id: 47,
        whatsappModalStatus: 'connected',
        whatsappModalPhone: '+5511999998888',
        currentWhatsappConnectionSessionId: TEST_SESSION.id,
        currentWhatsappConnectionSession: {
          ...TEST_SESSION,
          provider: 'webwhats',
          status: 'active',
        },
      }),
    },
    companyConversation: {
      findFirst: async () => ({
        contact: '+5511999998888',
        metadata: JSON.stringify({
          whatsappRemoteJid: '5511999998888@s.whatsapp.net',
        }),
      }),
    },
  };
  const service = new WebwhatsBridgeService(prisma as any);

  (service as any).requestRead = async (input: any) => {
    calls.path = input.path;
    calls.data = input.data;
    return { success: true };
  };

  try {
    const result = await service.markMessagesAsRead(47, {
      conversationId: 115,
      messages: [
        {
          id: 'INBOUND-1',
          fromMe: false,
          remoteJid: '5511999998888@s.whatsapp.net',
        },
      ],
    });

    assert.deepEqual(result, { success: true });
    assert.equal(calls.path, '/chat/markMessageAsRead/company-47');
    assert.deepEqual(calls.data, {
      readMessages: [
        {
          id: 'INBOUND-1',
          remoteJid: '5511999998888@s.whatsapp.net',
          fromMe: false,
        },
      ],
    });
  } finally {
    if (previousUrl === undefined) delete process.env.WHATSAPP_MODAL_INTERNAL_URL;
    else process.env.WHATSAPP_MODAL_INTERNAL_URL = previousUrl;
    if (previousKey === undefined) delete process.env.WHATSAPP_MODAL_API_KEY;
    else process.env.WHATSAPP_MODAL_API_KEY = previousKey;
  }
});

test('upsertConversationStateFromChat reuses phone conversation found by stored lid metadata', async () => {
  const existing = makeConversation();
  const calls = {
    create: 0,
    updateData: null as Record<string, unknown> | null,
    findManyWhere: null as Record<string, any> | null,
  };
  const prisma = {
    companyConversation: {
      findMany: async ({ where }: any) => {
        calls.findManyWhere = where;
        const hasLidMetadataLookup = Array.isArray(where?.OR)
          && where.OR.some((clause: any) => clause?.metadata?.contains === '230498781634702@lid');
        return hasLidMetadataLookup ? [existing] : [];
      },
      update: async ({ data }: any) => {
        calls.updateData = data;
        return { ...existing, ...data };
      },
      create: async () => {
        calls.create += 1;
        throw new Error('create should not be called for a known lid conversation');
      },
    },
  };
  const service = new WebwhatsBridgeService(prisma as any);

  const result = await (service as any).upsertConversationStateFromChat(
    1,
    TEST_SESSION,
    { remoteJid: '230498781634702@lid' },
    null,
    null,
  );
  const metadata = JSON.parse(String(result.metadata || '{}'));

  assert.equal(calls.create, 0);
  assert.equal(result.id, existing.id);
  assert.equal(result.contact, '+5511943171224');
  assert.equal(calls.updateData?.contact, '+5511943171224');
  assert.equal(metadata.whatsappRemoteJid, '230498781634702@lid');
  assert.equal(metadata.whatsappRemoteJidAlt, '5511943171224@s.whatsapp.net');
  assert.equal(metadata.whatsappUnreadCount, 0);
});

test('upsertConversationStateFromChat preserves group chats with group metadata', async () => {
  const calls = {
    createData: null as Record<string, unknown> | null,
  };
  const prisma = {
    companyConversation: {
      findMany: async () => [],
      create: async ({ data }: any) => {
        calls.createData = data;
        return makeConversation({
          id: 91,
          contact: data.contact,
          metadata: data.metadata,
        });
      },
    },
  };
  const service = new WebwhatsBridgeService(prisma as any);

  const result = await (service as any).upsertConversationStateFromChat(
    1,
    TEST_SESSION,
    {
      remoteJid: '120363401234567890@g.us',
      name: 'Grupo Comercial',
      unreadCount: 2,
    },
    null,
    null,
  );
  const metadata = JSON.parse(String(result.metadata || '{}'));

  assert.equal(result.contact, '120363401234567890@g.us');
  assert.equal(calls.createData?.contact, '120363401234567890@g.us');
  assert.equal(metadata.whatsappRemoteJid, '120363401234567890@g.us');
  assert.equal(metadata.whatsappIsGroup, true);
  assert.equal(metadata.whatsappContactName, 'Grupo Comercial');
  assert.equal(metadata.whatsappUnreadCount, 2);
});

// Inbox 1:1 só (ordem do dono 17/06): grupo (@g.us), transmissão/status (@broadcast)
// e canal (@newsletter) NUNCA entram no espelhamento. Só conversa pessoa-a-pessoa.
test('syncRecentChats espelha SÓ conversas 1:1 (ignora grupo e status@broadcast)', async () => {
  const createdContacts: string[] = [];
  const prisma = {
    company: {
      findUnique: async () => ({
        id: 7,
        whatsappModalStatus: 'connected',
        whatsappModalPhone: '+5511999998888',
        currentWhatsappConnectionSessionId: TEST_SESSION_COMPANY_7.id,
        currentWhatsappConnectionSession: {
          ...TEST_SESSION_COMPANY_7,
          provider: 'webwhats',
          status: 'active',
        },
      }),
    },
    companyConversation: {
      findMany: async () => [],
      create: async ({ data }: any) => {
        createdContacts.push(data.contact);
        return makeConversation({
          id: createdContacts.length,
          contact: data.contact,
          metadata: data.metadata,
        });
      },
    },
  };
  const service = new WebwhatsBridgeService(prisma as any);

  (service as any).requestRead = async (input: any) => {
    if (String(input.path).includes('/chat/findContacts/')) return [];
    if (String(input.path).includes('/chat/findChats/')) {
      return [
        { remoteJid: '5511999998888@s.whatsapp.net', name: 'Cliente' },
        { remoteJid: '120363401234567890@g.us', name: 'Grupo Comercial' },
        { remoteJid: 'status@broadcast', name: 'Status' },
      ];
    }
    return [];
  };

  const synced = await service.syncRecentChats(7, {
    force: true,
    limit: 10,
    failOnError: true,
  });

  assert.equal(synced, 1);
  assert.deepEqual(createdContacts, [
    '+5511999998888',
  ]);
});

test('consolidateDuplicateConversations keeps phone row canonical when preferred contact is lid only', async () => {
  const phoneRow = makeConversation({ id: 70, contact: '+5511943171224' });
  const lidRow = makeConversation({
    id: 1375,
    contact: '230498781634702@lid',
    metadata: JSON.stringify({ whatsappRemoteJid: '230498781634702@lid' }),
  });
  const calls = {
    movedMessageConversationIds: [] as number[],
    deletedConversationIds: [] as number[],
    updatedConversationId: 0,
    updateData: null as Record<string, unknown> | null,
  };
  const prisma = {
    $transaction: async (callback: (tx: any) => Promise<unknown>) =>
      callback({
        companyMessage: {
          updateMany: async ({ where, data }: any) => {
            calls.movedMessageConversationIds = where.conversationId.in;
            assert.equal(data.conversationId, 70);
          },
        },
        companyConversation: {
          deleteMany: async ({ where }: any) => {
            calls.deletedConversationIds = where.id.in;
          },
          update: async ({ where, data }: any) => {
            calls.updatedConversationId = where.id;
            calls.updateData = data;
            return { ...phoneRow, ...data };
          },
        },
      }),
  };
  const service = new WebwhatsBridgeService(prisma as any);

  const result = await (service as any).consolidateDuplicateConversations(
    1,
    [lidRow, phoneRow],
    '230498781634702@lid',
    '230498781634702@lid',
    null,
  );

  assert.equal(result.id, 70);
  assert.equal(calls.updatedConversationId, 70);
  assert.deepEqual(calls.movedMessageConversationIds, [1375]);
  assert.deepEqual(calls.deletedConversationIds, [1375]);
  assert.equal(calls.updateData?.contact, undefined);
});

test('findConversation consolidates lid row matched by message contactId with phone row', async () => {
  const phoneRow = makeConversation({
    id: 842,
    contact: '+5519997024884',
    whatsappConnectionSessionId: TEST_SESSION.id,
    metadata: JSON.stringify({
      whatsappRemoteJid: '5519997024884@s.whatsapp.net',
      whatsappContactName: 'Jhonatan',
    }),
  });
  const lidRow = makeConversation({
    id: 839,
    contact: '75471266001032@lid',
    whatsappConnectionSessionId: TEST_SESSION.id,
    metadata: JSON.stringify({
      whatsappRemoteJid: '75471266001032@lid',
      whatsappIsGroup: false,
    }),
  });
  const calls = {
    queryWhere: null as Record<string, any> | null,
    movedMessageConversationIds: [] as number[],
    deletedConversationIds: [] as number[],
    updatedConversationId: 0,
  };
  const prisma = {
    companyConversation: {
      findMany: async ({ where }: any) => {
        calls.queryWhere = where;
        return [lidRow, phoneRow];
      },
    },
    $transaction: async (callback: (tx: any) => Promise<unknown>) =>
      callback({
        companyMessage: {
          updateMany: async ({ where, data }: any) => {
            calls.movedMessageConversationIds = where.conversationId.in;
            assert.equal(data.conversationId, 842);
          },
        },
        companyConversation: {
          deleteMany: async ({ where }: any) => {
            calls.deletedConversationIds = where.id.in;
          },
          update: async ({ where, data }: any) => {
            calls.updatedConversationId = where.id;
            return { ...phoneRow, ...data };
          },
        },
      }),
  };
  const service = new WebwhatsBridgeService(prisma as any);

  const result = await (service as any).findConversation(
    47,
    TEST_SESSION.id,
    '5519997024884@s.whatsapp.net',
    null,
    '+5519997024884',
  );

  const whereJson = JSON.stringify(calls.queryWhere);
  assert.equal(result.id, 842);
  assert.equal(calls.updatedConversationId, 842);
  assert.deepEqual(calls.movedMessageConversationIds, [839]);
  assert.deepEqual(calls.deletedConversationIds, [839]);
  assert.match(whereJson, /"messages"/);
  assert.match(whereJson, /"contactId":"\+5519997024884"/);
  assert.match(whereJson, /"contact":\{"contains":"@g\.us"\}/);
  assert.match(whereJson, /"metadata":\{"contains":"\\"whatsappIsGroup\\":true"\}/);
});

test('upsertConversationMessage does not relay inbound when concurrent create already won', async () => {
  const calls = {
    relays: 0,
    updates: 0,
  };
  const uniqueError: any = new Error('Unique constraint failed');
  uniqueError.code = 'P2002';
  const prisma = {
    companyMessage: {
      findUnique: async () => null,
      findFirst: async () => null,
      create: async () => {
        throw uniqueError;
      },
      update: async ({ where }: any) => {
        calls.updates += 1;
        assert.equal(where.providerMessageId, 'webwhats:company-47:MSG-1');
        return { id: 501 };
      },
    },
    companyConversation: {
      updateMany: async ({ where }: any) => {
        assert.equal(where.id, 70);
        assert.equal(where.companyId, 47);
        return { count: 1 };
      },
    },
  };
  const service = new WebwhatsBridgeService(prisma as any);
  service.setInboundRelay(async () => {
    calls.relays += 1;
  });

  const result = await (service as any).upsertConversationMessage(
    47,
    TEST_SESSION,
    70,
    '5511999990000@s.whatsapp.net',
    {
      key: { id: 'MSG-1', fromMe: false, remoteJid: '5511999990000@s.whatsapp.net' },
      messageTimestamp: 1770000000,
      messageType: 'conversation',
      message: { conversation: 'Oi' },
    },
    null,
  );

  assert.equal(result, 501);
  assert.equal(calls.updates, 1);
  assert.equal(calls.relays, 0);
});

test('upsertConversationMessage relays inbound only for a newly created message', async () => {
  const calls = {
    relays: 0,
  };
  const prisma = {
    companyMessage: {
      findUnique: async () => null,
      findFirst: async () => null,
      create: async ({ data }: any) => {
        assert.equal(data.providerMessageId, 'webwhats:company-47:MSG-2');
        return { id: 502 };
      },
    },
    companyConversation: {
      updateMany: async ({ where }: any) => {
        assert.equal(where.id, 70);
        assert.equal(where.companyId, 47);
        return { count: 1 };
      },
    },
  };
  const service = new WebwhatsBridgeService(prisma as any);
  service.setInboundRelay(async (input) => {
    calls.relays += 1;
    assert.equal(input.companyMessageId, 502);
    assert.equal(input.externalMessageId, 'webwhats:company-47:MSG-2');
  });

  const result = await (service as any).upsertConversationMessage(
    47,
    TEST_SESSION,
    70,
    '5511999990000@s.whatsapp.net',
    {
      key: { id: 'MSG-2', fromMe: false, remoteJid: '5511999990000@s.whatsapp.net' },
      messageTimestamp: 1770000000,
      messageType: 'conversation',
      message: { conversation: 'Oi' },
    },
    null,
  );

  assert.equal(result, 502);
  assert.equal(calls.relays, 1);
});

test('upsertConversationMessage reuses legacy session-scoped provider ids', async () => {
  const calls = {
    relays: 0,
    legacySearchWhere: null as Record<string, any> | null,
    updateData: null as Record<string, any> | null,
  };
  const prisma = {
    companyMessage: {
      findUnique: async () => null,
      findFirst: async ({ where }: any) => {
        if (where?.providerMessageId?.endsWith) {
          calls.legacySearchWhere = where;
        }
        return {
          id: 503,
          providerMessageId: 'webwhats:company-47:old-session:MSG-LEGACY',
          variablesJson: null,
        };
      },
      update: async ({ where, data }: any) => {
        assert.equal(where.id, 503);
        calls.updateData = data;
        return { id: 503 };
      },
    },
    companyConversation: {
      updateMany: async ({ where }: any) => {
        assert.equal(where.id, 70);
        assert.equal(where.companyId, 47);
        return { count: 1 };
      },
    },
  };
  const service = new WebwhatsBridgeService(prisma as any);
  service.setInboundRelay(async () => {
    calls.relays += 1;
  });

  const result = await (service as any).upsertConversationMessage(
    47,
    TEST_SESSION,
    70,
    '5511999990000@s.whatsapp.net',
    {
      key: { id: 'MSG-LEGACY', fromMe: false, remoteJid: '5511999990000@s.whatsapp.net' },
      messageTimestamp: 1770000000,
      messageType: 'conversation',
      message: { conversation: 'Oi' },
    },
    null,
  );

  assert.equal(result, 503);
  assert.equal(calls.relays, 0);
  assert.equal(calls.legacySearchWhere?.providerMessageId?.endsWith, ':MSG-LEGACY');
  assert.equal(calls.updateData?.providerMessageId, 'webwhats:company-47:MSG-LEGACY');
});

test('resolveInboundMediaAttachment sends the full fetched message envelope to media download', async () => {
  const prisma = {};
  const service = new WebwhatsBridgeService(prisma as any);
  let capturedData: Record<string, any> | null = null;

  (service as any).requestRead = async (input: any) => {
    capturedData = input.data;
    return null;
  };

  const result = await (service as any).resolveInboundMediaAttachment(
    47,
    115,
    {
      id: 'MSG-MEDIA-1',
      pushName: 'Andrea',
      messageType: 'audio',
      messageTimestamp: 1770000000,
      key: {
        id: 'MSG-MEDIA-1',
        fromMe: false,
        remoteJid: '5519998676859@s.whatsapp.net',
        remoteJidAlt: '22819312251123@lid',
      },
      message: {
        audioMessage: {
          mimetype: 'audio/ogg; codecs=opus',
          seconds: 11,
          ptt: true,
        },
      },
    },
    'audio',
    {},
  );

  assert.equal(result, null);
  assert.ok(capturedData);
  assert.equal(capturedData?.convertToMp4, false);
  assert.equal(capturedData?.message?.id, 'MSG-MEDIA-1');
  assert.equal(capturedData?.message?.pushName, 'Andrea');
  assert.equal(capturedData?.message?.messageTimestamp, 1770000000);
  assert.equal(capturedData?.message?.key?.remoteJid, '5519998676859@s.whatsapp.net');
  assert.equal(capturedData?.message?.key?.remoteJidAlt, '22819312251123@lid');
  assert.deepEqual(capturedData?.message?.message, {
    audioMessage: {
      mimetype: 'audio/ogg; codecs=opus',
      seconds: 11,
      ptt: true,
    },
  });
});

test('resolveInboundMediaAttachment accepts provider data uri responses for received audio', async () => {
  const previousCwd = process.cwd();
  const tempDir = mkdtempSync(join(tmpdir(), 'webwhats-media-'));
  const prisma = {};
  const service = new WebwhatsBridgeService(prisma as any);
  const audioBytes = Buffer.from('received audio bytes');

  (service as any).requestRead = async () => ({
    data: `data:audio/ogg; codecs=opus;base64,${audioBytes.toString('base64')}`,
  });

  try {
    process.chdir(tempDir);
    const result = await (service as any).resolveInboundMediaAttachment(
      47,
      115,
      {
        id: 'MSG-MEDIA-2',
        messageType: 'audio',
        key: {
          id: 'MSG-MEDIA-2',
          fromMe: false,
          remoteJid: '5519998676859@s.whatsapp.net',
        },
        message: {
          audioMessage: {
            seconds: 9,
            ptt: true,
          },
        },
      },
      'audio',
      {},
    );

    const storedPath = join(tempDir, 'public', 'uploads', 'inbox', '47_115_MSG-MEDIA-2.ogg');
    assert.equal(result?.kind, 'audio');
    assert.equal(result?.url, '/uploads/inbox/47_115_MSG-MEDIA-2.ogg');
    assert.equal(result?.previewUrl, '/uploads/inbox/47_115_MSG-MEDIA-2.ogg');
    assert.equal(result?.mimeType, 'audio/ogg; codecs=opus');
    assert.equal(result?.fileSize, audioBytes.length);
    assert.equal(result?.durationSeconds, 9);
    assert.equal(result?.isVoiceNote, true);
    assert.equal(existsSync(storedPath), true);
    assert.deepEqual(readFileSync(storedPath), audioBytes);
  } finally {
    process.chdir(previousCwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('resolveInboundMediaAttachment stores received sticker media', async () => {
  const previousCwd = process.cwd();
  const tempDir = mkdtempSync(join(tmpdir(), 'webwhats-sticker-'));
  const service = new WebwhatsBridgeService({} as any);
  const stickerBytes = Buffer.from('received sticker bytes');

  (service as any).requestRead = async () => ({
    data: `data:image/webp;base64,${stickerBytes.toString('base64')}`,
  });

  try {
    process.chdir(tempDir);
    const result = await (service as any).resolveInboundMediaAttachment(
      47,
      115,
      {
        id: 'MSG-STICKER-1',
        messageType: 'sticker',
        key: {
          id: 'MSG-STICKER-1',
          fromMe: false,
          remoteJid: '5519998676859@s.whatsapp.net',
        },
        message: {
          stickerMessage: {
            mimetype: 'image/webp',
            fileLength: stickerBytes.length,
          },
        },
      },
      'sticker',
      {},
    );

    const storedPath = join(tempDir, 'public', 'uploads', 'inbox', '47_115_MSG-STICKER-1.webp');
    assert.equal(result?.kind, 'sticker');
    assert.equal(result?.url, '/uploads/inbox/47_115_MSG-STICKER-1.webp');
    assert.equal(result?.mimeType, 'image/webp');
    assert.equal(result?.fileSize, stickerBytes.length);
    assert.equal(existsSync(storedPath), true);
    assert.deepEqual(readFileSync(storedPath), stickerBytes);
  } finally {
    process.chdir(previousCwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('resolveInboundMediaAttachment unwraps ephemeral received audio before download', async () => {
  const prisma = {};
  const service = new WebwhatsBridgeService(prisma as any);
  let capturedData: Record<string, any> | null = null;

  (service as any).requestRead = async (input: any) => {
    capturedData = input.data;
    return null;
  };

  const result = await (service as any).resolveInboundMediaAttachment(
    47,
    115,
    {
      id: 'MSG-MEDIA-3',
      messageType: 'audio',
      key: {
        id: 'MSG-MEDIA-3',
        fromMe: false,
        remoteJid: '5519998676859@s.whatsapp.net',
      },
      message: {
        ephemeralMessage: {
          message: {
            audioMessage: {
              mimetype: 'audio/ogg; codecs=opus',
              seconds: 7,
              ptt: true,
            },
          },
        },
      },
    },
    'audio',
    {},
  );

  assert.equal(result, null);
  assert.ok(capturedData);
  assert.deepEqual(capturedData?.message?.message, {
    ephemeralMessage: {
      message: {
        audioMessage: {
          mimetype: 'audio/ogg; codecs=opus',
          seconds: 7,
          ptt: true,
        },
      },
    },
  });
});

function normalizeIncomingFixture(message: Record<string, any>) {
  const service = new WebwhatsBridgeService({} as any);
  return (service as any).normalizeIncomingWhatsAppMessage(message);
}

test('normalizeIncomingWhatsAppMessage extracts buttonsMessage text and options', () => {
  const normalized = normalizeIncomingFixture({
    messageType: 'buttonsMessage',
    message: {
      buttonsMessage: {
        contentText: 'Escolha uma opcao',
        footerText: 'HBX',
        buttons: [
          { buttonText: { displayText: 'Pagar agora' } },
          { buttonText: { displayText: 'Falar com atendente' } },
        ],
      },
    },
  });

  assert.equal(normalized.kind, 'interactive_received');
  assert.equal(normalized.metadata.normalizedMessageType, 'interactive');
  assert.match(normalized.text, /Mensagem interativa recebida:/);
  assert.match(normalized.text, /Escolha uma opcao/);
  assert.match(normalized.text, /Pagar agora/);
  assert.match(normalized.text, /Falar com atendente/);
});

test('normalizeIncomingWhatsAppMessage extracts listMessage sections', () => {
  const normalized = normalizeIncomingFixture({
    messageType: 'listMessage',
    message: {
      listMessage: {
        title: 'Atendimento',
        description: 'Selecione o assunto',
        footerText: 'Equipe HBX',
        sections: [
          {
            title: 'Menu',
            rows: [
              { title: 'Segunda via' },
              { title: 'Renegociar' },
            ],
          },
        ],
      },
    },
  });

  assert.equal(normalized.kind, 'interactive_received');
  assert.match(normalized.text, /Atendimento/);
  assert.match(normalized.text, /Selecione o assunto/);
  assert.match(normalized.text, /Segunda via/);
  assert.match(normalized.text, /Renegociar/);
});

test('normalizeIncomingWhatsAppMessage extracts hydrated template buttons', () => {
  const normalized = normalizeIncomingFixture({
    messageType: 'templateMessage',
    message: {
      templateMessage: {
        hydratedTemplate: {
          hydratedContentText: 'Sua fatura esta disponivel',
          hydratedFooterText: 'Vencimento hoje',
          hydratedButtons: [
            { quickReplyButton: { displayText: 'Ja paguei' } },
            { urlButton: { displayText: 'Abrir boleto' } },
          ],
        },
      },
    },
  });

  assert.equal(normalized.kind, 'interactive_received');
  assert.match(normalized.text, /Sua fatura esta disponivel/);
  assert.match(normalized.text, /Vencimento hoje/);
  assert.match(normalized.text, /Ja paguei/);
  assert.match(normalized.text, /Abrir boleto/);
});

test('normalizeIncomingWhatsAppMessage extracts nativeFlowMessage button params', () => {
  const normalized = normalizeIncomingFixture({
    messageType: 'interactiveMessage',
    message: {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            body: { text: 'Confirme os dados' },
            footer: { text: 'HBX' },
            nativeFlowMessage: {
              buttons: [
                {
                  name: 'quick_reply',
                  buttonParamsJson: JSON.stringify({ display_text: 'Confirmar' }),
                },
              ],
            },
          },
        },
      },
    },
  });

  assert.equal(normalized.kind, 'interactive_received');
  assert.match(normalized.text, /Confirme os dados/);
  assert.match(normalized.text, /Confirmar/);
  assert.equal(normalized.metadata.interactivePayloadKind, 'interactiveMessage');
});

test('normalizeIncomingWhatsAppMessage keeps fallback for unknown interactive payload', () => {
  const normalized = normalizeIncomingFixture({
    messageType: 'interactiveMessage',
    message: {
      interactiveMessage: {
        messageContextInfo: {
          deviceListMetadataVersion: 2,
        },
      },
    },
  });

  assert.equal(normalized.kind, 'interactive_received');
  assert.equal(normalized.text, '[interacao recebida]');
  assert.equal(normalized.metadata.extracted.hasText, false);
  assert.ok(normalized.metadata.rawPayloadSanitized);
});

test('WebwhatsBridgeService rejects invalid WhatsApp phone JIDs', () => {
  const service = createBareWebwhatsBridgeService();

  assert.equal(service.isSyncableChat('0@s.whatsapp.net'), false);
  assert.equal(service.isSyncableChat('0000000000@s.whatsapp.net'), false);
  assert.equal(service.isSyncableChat('5519996197927@s.whatsapp.net'), true);
});

test('WebwhatsBridgeService keeps the inbox 1:1 only (no groups/broadcast/newsletter)', () => {
  const service = createBareWebwhatsBridgeService();

  // Grupo, transmissão/status e canal nunca são espelhados (ordem do dono 17/06/2026).
  assert.equal(service.isSyncableChat('120363025343298765@g.us'), false);
  assert.equal(service.isSyncableChat('status@broadcast'), false);
  assert.equal(service.isSyncableChat('123456@broadcast'), false);
  assert.equal(service.isSyncableChat('0123456789@newsletter'), false);
  // 1:1 continua passando.
  assert.equal(service.isSyncableChat('5519996197927@s.whatsapp.net'), true);
});

test('WebwhatsBridgeService treats proxy timeout statuses as transient read errors', () => {
  const service = createBareWebwhatsBridgeService();

  for (const statusCode of [520, 521, 522, 523, 524, 598, 599]) {
    assert.equal(
      service.isTransientReadError(
        new WebwhatsProviderError(
          'WEBWHATS_HTTP_ERROR',
          `HTTP ${statusCode}`,
          statusCode,
        ),
      ),
      true,
      `status ${statusCode} should be transient`,
    );
  }

  assert.equal(
    service.isTransientReadError(
      new WebwhatsProviderError('WEBWHATS_HTTP_ERROR', 'bad request', 400),
    ),
    false,
  );
});

test('WebwhatsBridgeService ignores conflicting chat remoteJidAlt for phone chats', () => {
  const service = createBareWebwhatsBridgeService();

  assert.equal(
    service.getChatRemoteJidAlt({
      remoteJid: '5519996197927@s.whatsapp.net',
      lastMessage: { key: { remoteJidAlt: '5519997493700@s.whatsapp.net' } },
    }),
    null,
  );
  assert.equal(
    service.getChatRemoteJidAlt({
      remoteJid: '123456789012345@lid',
      lastMessage: { key: { remoteJidAlt: '5519997493700@s.whatsapp.net' } },
    }),
    '5519997493700@s.whatsapp.net',
  );
});

test('WebwhatsBridgeService keeps existing phone contact before incoming alternate JID', () => {
  const service = createBareWebwhatsBridgeService();

  assert.equal(
    service.resolveStateContact(
      '+5519997493700',
      '+5519996197927',
      '0@s.whatsapp.net',
      '5519997493700@s.whatsapp.net',
    ),
    '+5519996197927',
  );
});

test('WebwhatsBridgeService reuses prospection stub without session before creating duplicate chat', async () => {
  const prospectionStub = {
    id: 2855,
    contact: '+551935240328',
    whatsappConnectionSessionId: null,
    sourcePhoneNormalized: null,
    sourceTenantKey: null,
    metadata: JSON.stringify({
      queueTarget: 'prospeccao',
      routeTarget: 'prospeccao',
      vendasAgendaQueue: {
        active: true,
        queueTarget: 'prospeccao',
        routeTarget: 'prospeccao',
      },
    }),
    currentFlow: 'cobranca_recovery',
    currentStep: 'novo',
    flowResult: null,
    botActive: true,
    humanAssigned: false,
    assignedUserId: null,
    lastMessageAt: new Date('2026-05-28T11:41:46.000Z'),
    lastInteractionAt: new Date('2026-05-28T11:41:46.000Z'),
    createdAt: new Date('2026-05-28T11:40:00.000Z'),
    updatedAt: new Date('2026-05-28T11:41:46.000Z'),
  };
  const findManyCalls: any[] = [];
  const prisma = {
    companyConversation: {
      findMany: async (input: any) => {
        findManyCalls.push(input);
        return findManyCalls.length === 1 ? [] : [prospectionStub];
      },
    },
  };
  const service = new WebwhatsBridgeService(prisma as any) as any;
  service.consolidateDuplicateConversations = async () => null;

  const found = await service.findConversation(
    73,
    'session-current',
    '551935240328@s.whatsapp.net',
    null,
    '+551935240328',
  );

  assert.equal(found?.id, 2855);
  assert.equal(findManyCalls.length, 2);
  assert.deepEqual(findManyCalls[0].where.whatsappConnectionSessionId, 'session-current');
  assert.equal(findManyCalls[1].where.whatsappConnectionSessionId, undefined);
  assert.ok(
    findManyCalls[1].where.AND.some((item: any) =>
      item.OR?.some((condition: any) => condition.metadata?.contains === '"vendasAgendaQueue"'),
    ),
  );
});

// isLocallyDeletedChatSuppressed foi removida (store-on-arrival — sem supressão).
// Os 4 testes abaixo foram excluídos junto com o método privado.

/*
test('isLocallyDeletedChatSuppressed NÃO suprime quando sourcePhoneNormalized do log é diferente do número da sessão atual', async () => {
  // Cenário: log gravado pelo nº A (5519997024884), sessão atual é nº B (5519920121720).
  // O cliente +5511943171224 foi suprimido pelo nº A — mas o nº B pode reimportá-lo.
  const logEntry = {
    createdAt: new Date('2026-06-18T10:00:00.000Z'),
    metadata: JSON.stringify({
      reason: 'old_session_discard',
      currentSessionId: 'session-b',
      sourcePhoneNormalized: '5519997024884',  // número A (o que fez o discard)
      contact: '5511943171224@s.whatsapp.net',
      remoteJid: '5511943171224@s.whatsapp.net',
      phoneDigits: '5511943171224',
    }),
  };
  const prisma = {
    whatsAppAuditLog: {
      findFirst: async () => logEntry,
    },
  };
  const service = new WebwhatsBridgeService(prisma as any);

  // lastMessageAt ANTES do log — sem a correção, seria suprimido (log >= lastMessage).
  const lastMessageAt = new Date('2026-06-17T08:00:00.000Z');
  const sessionPhoneNormalizedB = '5519920121720';

  const suppressed = await (service as any).isLocallyDeletedChatSuppressed(
    2,
    '5511943171224@s.whatsapp.net',
    null,
    '+5511943171224',
    lastMessageAt,
    sessionPhoneNormalizedB,  // número B: diferente do sourcePhone do log
  );

  assert.equal(suppressed, false, 'Supressão do nº A não deve bloquear sync do nº B');
});

test('isLocallyDeletedChatSuppressed SUPRIME quando sourcePhoneNormalized do log bate com a sessão atual', async () => {
  // Cenário: o nº B (5519920121720) fez discard de um cliente e quer que ele não volte.
  const logEntry = {
    createdAt: new Date('2026-06-18T10:00:00.000Z'),
    metadata: JSON.stringify({
      reason: 'old_session_discard',
      currentSessionId: 'session-b',
      sourcePhoneNormalized: '5519920121720',  // número B (o que fez o discard)
      contact: '5511943171224@s.whatsapp.net',
      remoteJid: '5511943171224@s.whatsapp.net',
      phoneDigits: '5511943171224',
    }),
  };
  const prisma = {
    whatsAppAuditLog: {
      findFirst: async () => logEntry,
    },
  };
  const service = new WebwhatsBridgeService(prisma as any);

  // lastMessageAt ANTES do log → supressão deve bloquear (mesmo número).
  const lastMessageAt = new Date('2026-06-17T08:00:00.000Z');
  const sessionPhoneNormalizedB = '5519920121720';

  const suppressed = await (service as any).isLocallyDeletedChatSuppressed(
    2,
    '5511943171224@s.whatsapp.net',
    null,
    '+5511943171224',
    lastMessageAt,
    sessionPhoneNormalizedB,
  );

  assert.equal(suppressed, true, 'Supressão do mesmo número deve bloquear reimporte');
});

test('isLocallyDeletedChatSuppressed NÃO suprime quando NÃO há log de supressão', async () => {
  const prisma = {
    whatsAppAuditLog: {
      findFirst: async () => null,
    },
  };
  const service = new WebwhatsBridgeService(prisma as any);

  const suppressed = await (service as any).isLocallyDeletedChatSuppressed(
    2,
    '5511943171224@s.whatsapp.net',
    null,
    '+5511943171224',
    new Date('2026-06-17T08:00:00.000Z'),
    '5519920121720',
  );

  assert.equal(suppressed, false, 'Sem log de supressão: importação deve prosseguir');
});

test('isLocallyDeletedChatSuppressed: log sem sourcePhoneNormalized mantém comportamento legado (data-driven)', async () => {
  // Log antigo (antes da correção) não tem sourcePhoneNormalized — mantém o
  // comportamento original (suprime por data), não "abre" a supressão.
  const logEntry = {
    createdAt: new Date('2026-06-18T10:00:00.000Z'),
    metadata: JSON.stringify({
      reason: 'old_session_discard',
      currentSessionId: 'session-old',
      contact: '5511943171224@s.whatsapp.net',
      // sem sourcePhoneNormalized
    }),
  };
  const prisma = {
    whatsAppAuditLog: {
      findFirst: async () => logEntry,
    },
  };
  const service = new WebwhatsBridgeService(prisma as any);

  // lastMessageAt antes do log → deve suprimir (legado sem sourcePhone)
  const lastMessageBefore = new Date('2026-06-17T08:00:00.000Z');
  const suppressedBefore = await (service as any).isLocallyDeletedChatSuppressed(
    2, '5511943171224@s.whatsapp.net', null, '+5511943171224',
    lastMessageBefore, '5519920121720',
  );
  assert.equal(suppressedBefore, true, 'Log legado sem sourcePhone: suprime quando data-driven');

  // lastMessageAt depois do log → NÃO suprime (mensagem nova após discard)
  const lastMessageAfter = new Date('2026-06-18T12:00:00.000Z');
  const suppressedAfter = await (service as any).isLocallyDeletedChatSuppressed(
    2, '5511943171224@s.whatsapp.net', null, '+5511943171224',
    lastMessageAfter, '5519920121720',
  );
  assert.equal(suppressedAfter, false, 'Log legado sem sourcePhone: não suprime quando msg nova');
});
*/
