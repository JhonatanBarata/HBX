import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SellerOnboardingService } from './seller-onboarding.service';
import { renderSellerContractTemplate } from './seller-contract-template';

function createBaseOnboarding(overrides?: Record<string, any>) {
  const attachments = [
    {
      id: 'att-photo',
      onboardingId: 'onb-1',
      kind: 'photo_id',
      originalFilename: 'documento.pdf',
      storedFilename: 'documento.pdf',
      storagePath: '',
      contentType: 'application/pdf',
      byteSize: 10,
      sha256: 'hash-photo',
      status: 'temporary',
    },
    {
      id: 'att-cv',
      onboardingId: 'onb-1',
      kind: 'curriculum',
      originalFilename: 'curriculo.pdf',
      storedFilename: 'curriculo.pdf',
      storagePath: '',
      contentType: 'application/pdf',
      byteSize: 10,
      sha256: 'hash-cv',
      status: 'temporary',
    },
  ];
  return {
    id: 'onb-1',
    companyId: 7,
    userId: 11,
    status: 'ready_to_send',
    legalName: 'Joao Teste',
    email: 'joao@example.com',
    phone: '11999990000',
    cpf: '12345678901',
    declaredAddress: 'Rua HBX, 100',
    commissionPercent: 20,
    commissionRecurring: true,
    commissionDueBusinessDays: 3,
    contractVersion: 'hbx_partner_v1',
    contractTextSnapshot: 'CONTRATO HBX',
    contractSha256: 'hash-contract',
    emailStatus: 'not_sent',
    archiveEmail: 'archive@example.com',
    attachments,
    user: {
      id: 11,
      companyId: 7,
      role: 'USER',
      name: 'Joao Teste',
      email: 'joao@example.com',
      username: 'joao@example.com',
      phone: '11999990000',
      commissionPercent: 20,
    },
    ...(overrides || {}),
  };
}

function createPrismaForOnboarding(onboarding: any, overrides?: Record<string, any>) {
  return {
    user: {
      findFirst: async () => ({
        ...onboarding.user,
        company: { id: 7, name: 'HBX', commissionDueBusinessDays: 3 },
      }),
      update: async ({ data }: any) => ({ id: onboarding.userId, ...data }),
    },
    sellerOnboarding: {
      findUnique: async ({ where }: any) => {
        if (where?.companyId_userId) return onboarding;
        return onboarding;
      },
      create: async () => onboarding,
      update: async ({ data }: any) => ({ ...onboarding, ...data }),
      findMany: async () => [],
    },
    sellerOnboardingAttachment: {
      create: async ({ data }: any) => ({ id: 'att-new', ...data }),
      updateMany: async ({ data }: any) => ({ count: 2, data }),
      findMany: async () => [],
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
    },
    ...(overrides || {}),
  } as any;
}

test('contrato de parceiro substitui variaveis principais', () => {
  const contract = renderSellerContractTemplate({
    sellerName: 'Joao Teste',
    sellerCpf: '12345678901',
    sellerEmail: 'joao@example.com',
    sellerPhone: '11999990000',
    sellerAddress: 'Rua HBX, 100',
    commissionPercent: '20',
    commissionDueBusinessDays: '3',
    contractDate: '03/06/2026',
  });

  assert.match(contract, /Nome: Joao Teste/);
  assert.match(contract, /CPF: 12345678901/);
  assert.match(contract, /comissão de 20%/);
  assert.match(contract, /até 3 dias úteis/);
  assert.doesNotMatch(contract, /\{\{sellerName\}\}/);
});

test('upload de onboarding rejeita extensao invalida', async () => {
  const onboarding = createBaseOnboarding();
  const service = new SellerOnboardingService(
    createPrismaForOnboarding(onboarding),
    { sendMail: async () => ({ ok: true }) } as any,
  );

  await assert.rejects(
    () =>
      service.uploadAttachment(
        { id: 1, companyId: 7, role: 'ADMIN' },
        11,
        'photo_id',
        {
          originalname: 'curriculo.exe',
          mimetype: 'application/octet-stream',
          size: 4,
          buffer: Buffer.from('x'),
        },
      ),
    /Anexo inválido/,
  );
});

test('envio de onboarding marca sent somente quando MailService retorna ok true', async () => {
  const onboarding = createBaseOnboarding();
  const sentUpdates: any[] = [];
  const userUpdates: any[] = [];
  const prisma = createPrismaForOnboarding(onboarding, {
    user: {
      findFirst: async () => ({
        ...onboarding.user,
        company: { id: 7, name: 'HBX', commissionDueBusinessDays: 3 },
      }),
      update: async ({ data }: any) => {
        userUpdates.push(data);
        return { id: onboarding.userId, ...data };
      },
    },
    sellerOnboarding: {
      findUnique: async () => onboarding,
      update: async ({ data }: any) => {
        sentUpdates.push(data);
        return { ...onboarding, ...data };
      },
      findMany: async () => [],
    },
  });
  const service = new SellerOnboardingService(
    prisma,
    { sendMail: async () => ({ ok: true, messageId: 'msg-ok' }) } as any,
  );

  const result = await service.sendOnboardingEmail({ id: 1, companyId: 7, role: 'ADMIN' }, 11);

  assert.equal(result.ok, true);
  assert.equal(sentUpdates[sentUpdates.length - 1]?.emailStatus, 'sent');
  assert.equal(sentUpdates[sentUpdates.length - 1]?.status, 'sent');
  assert.equal(userUpdates[userUpdates.length - 1]?.isActive, true);

  const failedUpdates: any[] = [];
  const failedUserUpdates: any[] = [];
  const failedService = new SellerOnboardingService(
    createPrismaForOnboarding(onboarding, {
      user: {
        findFirst: async () => ({
          ...onboarding.user,
          company: { id: 7, name: 'HBX', commissionDueBusinessDays: 3 },
        }),
        update: async ({ data }: any) => {
          failedUserUpdates.push(data);
          return { id: onboarding.userId, ...data };
        },
      },
      sellerOnboarding: {
        findUnique: async () => onboarding,
        update: async ({ data }: any) => {
          failedUpdates.push(data);
          return { ...onboarding, ...data };
        },
        findMany: async () => [],
      },
    }),
    { sendMail: async () => ({ ok: false, error: 'smtp down' }) } as any,
  );

  const failed = await failedService.sendOnboardingEmail({ id: 1, companyId: 7, role: 'ADMIN' }, 11);

  assert.equal(failed.ok, false);
  assert.equal(failedUpdates[failedUpdates.length - 1]?.emailStatus, 'email_failed');
  assert.equal(failedUpdates[failedUpdates.length - 1]?.status, 'email_failed');
  assert.equal(failedUserUpdates.length, 0);
});

test('purgeExpiredAttachments remove arquivo e marca anexo como deleted', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hbx-onboarding-'));
  const storagePath = join(dir, 'att.pdf');
  await writeFile(storagePath, Buffer.from('pdf'));
  const updates: any[] = [];
  const service = new SellerOnboardingService(
    {
      sellerOnboardingAttachment: {
        findMany: async () => [
          {
            id: 'att-expired',
            storagePath,
            status: 'temporary',
            deleteAfter: new Date(Date.now() - 1000),
          },
        ],
        update: async ({ where, data }: any) => {
          updates.push({ where, data });
          return { id: where.id, ...data };
        },
      },
      sellerOnboarding: {
        findMany: async () => [],
        update: async () => null,
      },
    } as any,
    { sendMail: async () => ({ ok: true }) } as any,
  );

  const result = await service.purgeExpiredAttachments();

  assert.equal(result.deleted, 1);
  assert.equal(updates[0].data.status, 'deleted');
  await assert.rejects(() => access(storagePath));
});
