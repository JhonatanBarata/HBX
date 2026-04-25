import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { WebwhatsBridgeService } from './webwhats-bridge.service';

function makeConversation(overrides?: Record<string, unknown>) {
  return {
    id: 70,
    contact: '+5511943171224',
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
