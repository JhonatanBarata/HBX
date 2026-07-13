import test from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { MobileActionService } from './mobile-action.service';

const testDatabaseUrl = String(process.env.MOBILE_ACTION_TEST_DATABASE_URL || '').trim();

test('ponte móvel preserva idempotência, leasing, tenant e histórico no PostgreSQL', {
  skip: !testDatabaseUrl,
}, async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  const suffix = crypto.randomUUID().slice(0, 8);
  const company = (await prisma.$queryRaw<Array<{ id: number }>>`
    INSERT INTO "Company" ("name") VALUES (${`Mobile Bridge ${suffix}`}) RETURNING "id"
  `)[0];
  const otherCompany = (await prisma.$queryRaw<Array<{ id: number }>>`
    INSERT INTO "Company" ("name") VALUES (${`Mobile Bridge Other ${suffix}`}) RETURNING "id"
  `)[0];
  const user = (await prisma.$queryRaw<Array<{ id: number }>>`
    INSERT INTO "User" ("companyId", "email", "password", "isActive")
    VALUES (${company.id}, ${`mobile-${suffix}@example.test`}, 'test-only', TRUE)
    RETURNING "id"
  `)[0];
  const otherUser = (await prisma.$queryRaw<Array<{ id: number }>>`
    INSERT INTO "User" ("companyId", "email", "password", "isActive")
    VALUES (${otherCompany.id}, ${`mobile-other-${suffix}@example.test`}, 'test-only', TRUE)
    RETURNING "id"
  `)[0];
  const deviceId = crypto.randomUUID();
  const otherDeviceId = crypto.randomUUID();
  const installationId = `installation-${crypto.randomUUID()}`;
  const otherInstallationId = `installation-${crypto.randomUUID()}`;
  await prisma.mobileDevice.createMany({
    data: [
      {
        id: deviceId,
        userId: user.id,
        companyId: company.id,
        installationId,
        tokenHash: crypto.randomUUID(),
        lastUsedAt: new Date(),
      },
      {
        id: otherDeviceId,
        userId: otherUser.id,
        companyId: otherCompany.id,
        installationId: otherInstallationId,
        tokenHash: crypto.randomUUID(),
        lastUsedAt: new Date(),
      },
    ],
  });

  const devices = {
    assertUserCanUseBridge: async () => undefined,
    authenticateDevice: async (dto: { deviceToken: string }) => dto.deviceToken.startsWith('other-token')
      ? { id: otherDeviceId, userId: otherUser.id, companyId: otherCompany.id }
      : { id: deviceId, userId: user.id, companyId: company.id },
  };
  const service = new MobileActionService(prisma as never, devices as never);
  (service as any).resolveWebOwner = async () => ({ userId: user.id, companyId: company.id });
  const credential = { deviceToken: 'main-token'.padEnd(32, 'x'), installationId };
  const otherCredential = { deviceToken: 'other-token'.padEnd(32, 'x'), installationId: otherInstallationId };

  try {
    const requestId = crypto.randomUUID();
    const created = await service.create(user.id, {
      requestId,
      kind: 'call',
      phone: '11999998888',
      contactName: 'Lead Teste',
    });
    const retried = await service.create(user.id, {
      requestId,
      kind: 'call',
      phone: '11999998888',
      contactName: 'Lead Teste',
    });
    assert.equal(retried.action.id, created.action.id);
    assert.equal(await prisma.mobileAction.count({ where: { companyId: company.id } }), 1);

    const [firstPull, concurrentPull] = await Promise.all([
      service.pull({ ...credential, take: 10 }),
      service.pull({ ...credential, take: 10 }),
    ]);
    assert.equal(firstPull.actions.length + concurrentPull.actions.length, 1);
    assert.equal((await service.pull({ ...otherCredential, take: 10 })).actions.length, 0);

    await prisma.mobileAction.update({
      where: { id: created.action.id },
      data: { deliveryAttemptedAt: new Date(Date.now() - 3 * 60_000) },
    });
    const redelivered = await service.pull({ ...credential, take: 10 });
    assert.deepEqual(redelivered.actions.map((item) => item.id), [created.action.id]);

    const deliveredEventId = crypto.randomUUID();
    await service.recordEvent(created.action.id, { ...credential, eventId: deliveredEventId, event: 'delivered' });
    await service.recordEvent(created.action.id, { ...credential, eventId: deliveredEventId, event: 'delivered' });
    assert.equal(await prisma.mobileActionEvent.count({ where: { id: deliveredEventId } }), 1);
    await service.recordEvent(created.action.id, { ...credential, eventId: crypto.randomUUID(), event: 'opened' });
    await service.recordEvent(created.action.id, { ...credential, eventId: crypto.randomUUID(), event: 'external_started' });
    await service.recordEvent(created.action.id, {
      ...credential,
      eventId: crypto.randomUUID(),
      event: 'returned',
      elapsedSeconds: 7,
    });
    await assert.rejects(
      service.recordEvent(created.action.id, {
        ...credential,
        eventId: crypto.randomUUID(),
        event: 'completed',
        result: 'mensagem_enviada',
      }),
      /Resultado inválido/,
    );
    await service.recordEvent(created.action.id, {
      ...credential,
      eventId: crypto.randomUUID(),
      event: 'completed',
      elapsedSeconds: 7,
      result: 'atendeu',
    });
    await assert.rejects(
      service.recordEvent(created.action.id, {
        ...credential,
        eventId: crypto.randomUUID(),
        event: 'opened',
      }),
      /não pode ser aplicado/,
    );
    await assert.rejects(
      service.recordEvent(created.action.id, {
        ...otherCredential,
        eventId: crypto.randomUUID(),
        event: 'opened',
      }),
      /não encontrada/,
    );

    const expiring = await service.create(user.id, {
      requestId: crypto.randomUUID(),
      kind: 'whatsapp',
      phone: '11977776666',
      contactName: 'Lead Expiração',
      message: 'Olá',
    });
    await prisma.mobileAction.update({
      where: { id: expiring.action.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    const history = await service.history(user.id, { take: 10 });
    assert.equal(history.actions.find((item) => item.id === expiring.action.id)?.status, 'expired');
    assert.equal(
      await prisma.mobileActionEvent.count({ where: { actionId: expiring.action.id, event: 'expired' } }),
      1,
    );

    await prisma.$executeRaw`DELETE FROM "User" WHERE "id" = ${user.id} AND "companyId" = ${company.id}`;
    const preserved = await prisma.mobileAction.findUnique({ where: { id: created.action.id } });
    assert.ok(preserved);
    assert.equal(preserved?.userId, null);
    assert.equal(preserved?.deviceId, null);
  } finally {
    await prisma.company.deleteMany({ where: { id: { in: [company.id, otherCompany.id] } } });
    await prisma.$disconnect();
  }
});
