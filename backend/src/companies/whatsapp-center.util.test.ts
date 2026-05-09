import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWhatsAppCenterSnapshot } from './whatsapp-center.util';

test('QR salvo nao vira conexao viva sem health do provider', () => {
  const snapshot = buildWhatsAppCenterSnapshot({
    company: {
      whatsappConnectionMode: 'QR',
      whatsappTemporaryStatus: 'QR',
      whatsappTemporaryProvider: 'external_modal',
      whatsappTemporaryInstanceKey: 'company-7',
      whatsappTemporaryDisplayNumber: '5519999999999',
      whatsappTemporaryLastSyncAt: new Date(),
    },
    temporaryAvailability: {
      configured: true,
      provider: 'external_modal',
      missingConfigKeys: [],
      setupHint: null,
    },
  });

  assert.equal(snapshot.status, 'QR');
  assert.equal(snapshot.qrConnection.liveStatus, 'stale');
  assert.match(snapshot.qrConnection.note, /confirmação viva/i);
});
