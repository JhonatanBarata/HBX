import test from 'node:test';
import assert from 'node:assert/strict';

import { WhatsappConsentLedgerService, normalizeWhatsappConsentPhone } from './whatsapp-consent-ledger.service';

function createPrismaStub() {
  const rows: any[] = [];
  return {
    rows,
    whatsappConsentLedger: {
      create: async ({ data }: any) => {
        const row = {
          id: `consent_${rows.length + 1}`,
          createdAt: new Date('2026-06-04T00:00:00.000Z'),
          updatedAt: new Date('2026-06-04T00:00:00.000Z'),
          ...data,
        };
        rows.push(row);
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const row of rows) {
          const matchesPurpose = where.purpose === undefined || row.purpose === where.purpose;
          if (
            row.companyId === where.companyId
            && row.phoneNormalized === where.phoneNormalized
            && row.status === where.status
            && row.revokedAt === where.revokedAt
            && matchesPurpose
          ) {
            Object.assign(row, data, { updatedAt: new Date('2026-06-04T00:01:00.000Z') });
            count += 1;
          }
        }
        return { count };
      },
      findFirst: async ({ where }: any) => rows.find((row) => (
        row.companyId === where.companyId
        && row.phoneNormalized === where.phoneNormalized
        && row.purpose === where.purpose
        && row.status === where.status
        && row.revokedAt === where.revokedAt
      )) || null,
    },
  };
}

test('normalizeWhatsappConsentPhone keeps digits only', () => {
  assert.equal(normalizeWhatsappConsentPhone('+55 (11) 98888-7777'), '5511988887777');
  assert.equal(normalizeWhatsappConsentPhone(''), null);
});

test('grantConsent creates active consent and hasActiveConsent returns true', async () => {
  const prisma = createPrismaStub();
  const service = new WhatsappConsentLedgerService(prisma as any);

  const granted = await service.grantConsent({
    companyId: 7,
    phone: '+55 (11) 98888-7777',
    source: 'landing_page',
    purpose: 'collection_followup',
    metadataJson: { form: 'demo' },
  });
  const active = await service.hasActiveConsent(7, '5511988887777', 'collection_followup');

  assert.equal(granted.ok, true);
  assert.equal(granted.active, true);
  assert.equal(granted.consent.phoneNormalized, '5511988887777');
  assert.equal(granted.consent.status, 'active');
  assert.equal(granted.consent.source, 'landing_page');
  assert.equal(granted.consent.metadataJson, '{"form":"demo"}');
  assert.equal(active, true);
});

test('revokeConsent revokes active consent and hasActiveConsent returns false', async () => {
  const prisma = createPrismaStub();
  const service = new WhatsappConsentLedgerService(prisma as any);
  await service.grantConsent({
    companyId: 7,
    phone: '5511988887777',
    source: 'manual',
    purpose: 'collection_followup',
  });

  const revoked = await service.revokeConsent({
    companyId: 7,
    phone: '5511988887777',
    purpose: 'collection_followup',
  });
  const active = await service.hasActiveConsent(7, '5511988887777', 'collection_followup');

  assert.equal(revoked.ok, true);
  assert.equal(revoked.active, false);
  assert.equal(revoked.revokedCount, 1);
  assert.equal(active, false);
  assert.equal(prisma.rows[0].status, 'revoked');
  assert.ok(prisma.rows[0].revokedAt instanceof Date);
});

test('assertCanSendProactiveMessage returns warning without blocking globally', async () => {
  const service = new WhatsappConsentLedgerService(createPrismaStub() as any);

  const result = await service.assertCanSendProactiveMessage(7, '5511988887777', 'collection_followup');

  assert.equal(result.allowed, false);
  assert.equal(result.ok, false);
  assert.equal(result.warning, 'Sem opt-in ativo registrado para mensagem proativa de WhatsApp.');
});
