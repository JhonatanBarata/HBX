import assert from 'node:assert/strict';

import { ChatController } from '../src/api/controllers/chat.controller';
import { normalizePagination } from '../src/api/repository/repository.service';
import {
  buildPresenceSnapshot,
  normalizeChatPreviewText,
  PresenceStoreEntry,
} from '../src/api/services/channel-lightweight.util';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const tests: TestCase[] = [
  {
    name: 'normalizePagination clamps modern pagination input',
    run: () => {
      const pagination = normalizePagination(
        {
          take: 250,
          skip: 6000,
          cursor: ' 123:5511999999999@s.whatsapp.net ',
          search: ' Maria ',
        },
        {
          take: 40,
          maxTake: 100,
          maxSkip: 5000,
        },
      );

      assert.equal(pagination.take, 100);
      assert.equal(pagination.limit, 100);
      assert.equal(pagination.skip, 5000);
      assert.equal(pagination.cursor, '123:5511999999999@s.whatsapp.net');
      assert.equal(pagination.search, 'Maria');
    },
  },
  {
    name: 'normalizePagination preserves legacy page and offset semantics',
    run: () => {
      const pagination = normalizePagination(
        {
          page: 3,
          offset: 25,
        },
        {
          take: 50,
          maxTake: 100,
          maxSkip: 5000,
        },
      );

      assert.equal(pagination.take, 25);
      assert.equal(pagination.limit, 25);
      assert.equal(pagination.skip, 50);
      assert.equal(pagination.page, 3);
      assert.equal(pagination.offset, 25);
    },
  },
  {
    name: 'chat list preview replaces inline base64 with media placeholder',
    run: () => {
      const preview = normalizeChatPreviewText(
        `data:image/png;base64,${'a'.repeat(800)}`,
        'imageMessage',
      );

      assert.equal(preview, '[image]');
    },
  },
  {
    name: 'presence store TTL returns unknown for expired records',
    run: () => {
      const remoteJid = '5511999999999@s.whatsapp.net';
      const record: PresenceStoreEntry = {
        remoteJid,
        presence: 'online',
        lastSeenAt: null,
        updatedAt: new Date(Date.now() - 61 * 1000),
      };

      const snapshot = buildPresenceSnapshot(remoteJid, record, 60 * 1000);

      assert.equal(snapshot.remoteJid, remoteJid);
      assert.equal(snapshot.presence, 'unknown');
      assert.equal(snapshot.online, false);
      assert.equal(snapshot.typing, false);
      assert.equal(snapshot.recording, false);
    },
  },
  {
    name: 'presence controller returns unknown without failing when store is empty',
    run: async () => {
      const remoteJid = '5511888888888@s.whatsapp.net';
      const controller = new ChatController({
        waInstances: {
          demo: {
            fetchPresence: (input: { remoteJid?: string }) =>
              buildPresenceSnapshot(input.remoteJid || '', null, 60 * 1000),
          },
        },
      } as any);

      const snapshot = await controller.fetchPresence({ instanceName: 'demo' } as any, remoteJid);

      assert.equal(snapshot.remoteJid, remoteJid);
      assert.equal(snapshot.presence, 'unknown');
      assert.equal(snapshot.online, false);
    },
  },
];

async function main() {
  for (const test of tests) {
    await test.run();
    console.log(`ok - ${test.name}`);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
