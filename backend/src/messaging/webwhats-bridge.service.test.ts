import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { WebwhatsBridgeService } from './webwhats-bridge.service';

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

test('resolveCurrentWebwhatsSession repara Company CONNECTED sem sessao operacional', async () => {
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
      findFirst: async ({ where }: any) => sessions.find((session) => {
        if (where?.companyId !== undefined && Number(session.companyId) !== Number(where.companyId)) return false;
        if (where?.provider !== undefined && session.provider !== where.provider) return false;
        if (where?.tenantKey !== undefined && session.tenantKey !== where.tenantKey) return false;
        if (where?.status !== undefined && session.status !== where.status) return false;
        return true;
      }) || null,
      create: async ({ data }: any) => {
        const session = { id: 'session-repaired', ...data };
        sessions.push(session);
        return session;
      },
      update: async ({ where, data }: any) => {
        const session = sessions.find((item) => String(item.id) === String(where.id));
        Object.assign(session, data);
        return session;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const session of sessions) {
          if (where?.NOT?.id !== undefined && String(session.id) === String(where.NOT.id)) continue;
          Object.assign(session, data);
          count += 1;
        }
        return { count };
      },
    },
  };
  const service = new WebwhatsBridgeService(prisma as any) as any;

  try {
    const session = await service.resolveCurrentWebwhatsSession(66);

    assert.equal(session.id, 'session-repaired');
    assert.equal(session.tenantKey, 'company-66');
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].provider, 'webwhats');
    assert.equal(sessions[0].status, 'active');
    assert.equal(sessions[0].phoneNormalized, null);
    assert.equal(companyUpdates.at(-1).currentWhatsappConnectionSessionId, 'session-repaired');
  } finally {
    if (previousUrl === undefined) delete process.env.WHATSAPP_MODAL_INTERNAL_URL;
    else process.env.WHATSAPP_MODAL_INTERNAL_URL = previousUrl;
    if (previousKey === undefined) delete process.env.WHATSAPP_MODAL_API_KEY;
    else process.env.WHATSAPP_MODAL_API_KEY = previousKey;
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

test('syncRecentChats mirrors individual and group chats into conversations', async () => {
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

  assert.equal(synced, 2);
  assert.deepEqual(createdContacts, [
    '+5511999998888',
    '120363401234567890@g.us',
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
