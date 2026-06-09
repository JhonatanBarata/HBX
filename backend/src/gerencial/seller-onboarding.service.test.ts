import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { basename, join, sep } from 'path';

import { SellerOnboardingService } from './seller-onboarding.service';

const tenantCompany = { companyKind: 'tenant' };

async function createTempAttachment(dir: string, kind: string) {
  const filename = `${kind}.pdf`;
  const storagePath = join(dir, filename);
  await writeFile(storagePath, Buffer.from(`arquivo-${kind}`));
  return {
    id: `${kind}_1`,
    onboardingId: 'onb_1',
    kind,
    originalFilename: filename,
    storedFilename: filename,
    storagePath,
    contentType: 'application/pdf',
    byteSize: 32,
    sha256: `sha-${kind}`,
    required: false,
    status: 'temporary',
    deleteAfter: null,
    deletedAt: null,
    createdAt: new Date(),
  };
}

function buildOnboardingService(input: {
  attachments: any[];
  metadataJson?: string | null;
  archiveEmail?: string | null;
  mailResult?: any;
  emailConfirmedAt?: Date | null;
}) {
  const state: Record<string, any> = {
    mailInput: null,
    onboardingUpdateData: null,
    attachmentUpdateMany: null,
    attachmentUpdate: null,
    userUpdateData: null,
    partnerContractCreateData: null,
    partnerContractUpsertData: null,
  };
  const onboarding = {
    id: 'onb_1',
    companyId: 1,
    userId: 200,
    status: 'ready_to_send',
    partnerType: 'hbx_partner',
    legalName: 'Parceiro Teste',
    email: 'parceiro@example.com',
    phone: null,
    cpf: null,
    declaredAddress: null,
    commissionPercent: 20,
    commissionRecurring: true,
    commissionDueBusinessDays: 3,
    canRegisterHbxSellers: false,
    sellerReferralCommissionPercent: 0,
    referredByUserId: null,
    referredByNameSnapshot: null,
    referredByCommissionPercentSnapshot: 0,
    contractVersion: 'hbx_partner_v1',
    contractTextSnapshot: 'CONTRATO TESTE\nHBX SYSTEM\nParceiro Teste',
    contractSha256: 'sha-contract',
    emailStatus: 'not_sent',
    emailMessageId: null,
    emailSentAt: null,
    archiveEmail: input.archiveEmail ?? null,
    attachmentsDeleteAfter: null,
    attachmentsDeletedAt: null,
    createdByUserId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    metadataJson: input.metadataJson ?? JSON.stringify({
      documentRequirements: {
        photo_id: true,
        contract_pdf: true,
        curriculum: false,
      },
    }),
    user: { emailConfirmedAt: input.emailConfirmedAt ?? null },
    attachments: input.attachments,
  };

  const prisma = {
    company: {
      findUnique: async () => tenantCompany,
    },
    user: {
      findFirst: async () => ({
        id: 200,
        companyId: 1,
        role: 'USER',
        emailConfirmedAt: input.emailConfirmedAt ?? null,
        company: { id: 1, commissionDueBusinessDays: 3 },
      }),
      update: async ({ data }: any) => {
        state.userUpdateData = data;
        return { id: 200, ...data };
      },
    },
    sellerOnboarding: {
      findUnique: async () => onboarding,
      update: async ({ data }: any) => {
        state.onboardingUpdateData = data;
        return { ...onboarding, ...data, attachments: input.attachments };
      },
    },
    sellerOnboardingAttachment: {
      update: async (args: any) => {
        state.attachmentUpdate = args;
        return { id: args.where.id, ...args.data };
      },
      updateMany: async (args: any) => {
        state.attachmentUpdateMany = args;
        return { count: input.attachments.length };
      },
    },
    partnerContract: {
      findUnique: async () => null,
      create: async ({ data }: any) => {
        state.partnerContractCreateData = data;
        return { id: 'contract_1', ...data };
      },
      update: async ({ data }: any) => ({ id: 'contract_1', ...data }),
      upsert: async ({ create, update }: any) => {
        state.partnerContractUpsertData = { create, update };
        return { id: 'contract_1', ...create, ...update };
      },
    },
  };
  const mailService = {
    sendMail: async (mailInput: any) => {
      state.mailInput = mailInput;
      return input.mailResult ?? {
        ok: true,
        queued: true,
        transport: 'smtp',
        previewUrl: null,
        messageId: 'msg_1',
        accepted: [mailInput.to],
        rejected: [],
        from: 'hbx@example.com',
        replyTo: null,
        errorCode: null,
        errorMessage: null,
      };
    },
  };
  const emailTemplates = {
    getTemplateSafe: async () => ({}),
    renderTemplate: () => ({
      subject: 'Onboarding HBX',
      text: 'Envio de documentos HBX',
      html: '<p>Envio de documentos HBX</p>',
    }),
  };

  return {
    service: new SellerOnboardingService(prisma as any, mailService as any, emailTemplates as any),
    state,
  };
}

test('updateDraft salva texto editado e invalida PDF gerado anterior', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hbx-onboarding-'));
  try {
    const attachments = [
      await createTempAttachment(dir, 'photo_id'),
      await createTempAttachment(dir, 'generated_contract'),
    ];
    const { service, state } = buildOnboardingService({ attachments });

    const updated = await service.updateDraft(1, 200, {
      contractTextSnapshot: 'CONTRATO EDITADO\n\nCláusula nova\n\nHBX SYSTEM\nParceiro Teste',
    });

    assert.equal((updated as any).contractTextSnapshot, 'CONTRATO EDITADO\n\nCláusula nova\n\nHBX SYSTEM\nParceiro Teste');
    assert.equal((updated as any).contractTextDraft, (updated as any).contractTextSnapshot);
    assert.equal(state.onboardingUpdateData.status, 'ready_to_send');
    assert.equal(state.attachmentUpdate.where.id, 'generated_contract_1');
    assert.equal(state.attachmentUpdate.data.status, 'deleted');
    assert.ok(state.attachmentUpdate.data.deletedAt instanceof Date);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('sendOnboardingEmail envia com arquivo, agenda limpeza e nao ativa parceiro', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hbx-onboarding-'));
  try {
    const attachments = [
      await createTempAttachment(dir, 'photo_id'),
      await createTempAttachment(dir, 'contract_pdf'),
      await createTempAttachment(dir, 'generated_contract'),
    ];
    const { service, state } = buildOnboardingService({
      attachments,
      archiveEmail: 'arquivo@example.com',
    });

    const result = await service.sendOnboardingEmail(1, 200, 1);

    assert.equal(result.ok, true);
    assert.equal(result.emailStatus, 'sent');
    assert.equal(result.userActivated, false);
    assert.equal(result.messageId, 'msg_1');
    assert.deepEqual(result.missingRequiredAttachments, []);
    assert.equal(state.mailInput.to, 'parceiro@example.com');
    assert.equal(state.mailInput.cc, 'arquivo@example.com');
    assert.equal(state.mailInput.attachments.length, 3);
    assert.equal(state.userUpdateData, null);
    assert.equal(state.onboardingUpdateData.emailStatus, 'sent');
    assert.equal(state.onboardingUpdateData.status, 'sent');
    assert.ok(state.onboardingUpdateData.emailSentAt instanceof Date);
    assert.ok(state.onboardingUpdateData.attachmentsDeleteAfter instanceof Date);
    assert.equal(state.attachmentUpdateMany.where.onboardingId, 'onb_1');
    assert.deepEqual(state.attachmentUpdateMany.where.status, { not: 'deleted' });
    assert.ok(state.attachmentUpdateMany.data.deleteAfter instanceof Date);
    assert.equal(state.partnerContractCreateData.status, 'sent');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('sendOnboardingEmail respeita contrato assinado opcional', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hbx-onboarding-'));
  try {
    const attachments = [
      await createTempAttachment(dir, 'photo_id'),
      await createTempAttachment(dir, 'generated_contract'),
    ];
    const { service, state } = buildOnboardingService({
      attachments,
      metadataJson: JSON.stringify({
        documentRequirements: {
          photo_id: true,
          contract_pdf: false,
          curriculum: false,
        },
      }),
    });

    const result = await service.sendOnboardingEmail(1, 200, 1);

    assert.equal(result.ok, true);
    assert.deepEqual(result.missingRequiredAttachments, []);
    assert.equal(state.mailInput.to, 'parceiro@example.com');
    assert.equal(state.userUpdateData, null);
    assert.equal(state.onboardingUpdateData.status, 'sent');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('sendOnboardingEmail com MailService ok false nao ativa nem agenda limpeza', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hbx-onboarding-'));
  try {
    const attachments = [
      await createTempAttachment(dir, 'photo_id'),
      await createTempAttachment(dir, 'contract_pdf'),
      await createTempAttachment(dir, 'generated_contract'),
    ];
    const { service, state } = buildOnboardingService({
      attachments,
      mailResult: {
        ok: false,
        queued: false,
        transport: 'log',
        previewUrl: null,
        messageId: null,
        accepted: [],
        rejected: [],
        from: null,
        replyTo: null,
        errorCode: 'MAIL_DISABLED_LOCALLY',
        errorMessage: 'Email logged locally.',
      },
    });

    const result = await service.sendOnboardingEmail(1, 200, 1);

    assert.equal(result.ok, false);
    assert.equal(result.emailStatus, 'email_failed');
    assert.equal(result.userActivated, false);
    assert.equal(state.userUpdateData, null);
    assert.equal(state.attachmentUpdateMany, null);
    assert.equal(state.partnerContractCreateData, null);
    assert.equal(state.onboardingUpdateData.emailStatus, 'email_failed');
    assert.equal(state.onboardingUpdateData.emailSentAt, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('sendOnboardingEmail bloqueia documento obrigatorio faltando', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hbx-onboarding-'));
  try {
    const attachments = [
      await createTempAttachment(dir, 'contract_pdf'),
      await createTempAttachment(dir, 'generated_contract'),
    ];
    const { service, state } = buildOnboardingService({ attachments });

    await assert.rejects(
      () => service.sendOnboardingEmail(1, 200, 1),
      (error: any) => {
        const response = error.getResponse();
        assert.equal(response.missingRequiredAttachments[0].kind, 'photo_id');
        return true;
      },
    );
    assert.equal(state.mailInput, null);
    assert.equal(state.userUpdateData, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('sendOnboardingEmail respeita curriculum obrigatorio configurado', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hbx-onboarding-'));
  try {
    const attachments = [
      await createTempAttachment(dir, 'photo_id'),
      await createTempAttachment(dir, 'contract_pdf'),
      await createTempAttachment(dir, 'generated_contract'),
    ];
    const { service, state } = buildOnboardingService({
      attachments,
      metadataJson: JSON.stringify({
        documentRequirements: {
          photo_id: true,
          contract_pdf: true,
          curriculum: true,
        },
      }),
    });

    await assert.rejects(
      () => service.sendOnboardingEmail(1, 200, 1),
      (error: any) => {
        const response = error.getResponse();
        assert.equal(response.missingRequiredAttachments[0].kind, 'curriculum');
        return true;
      },
    );
    assert.equal(state.mailInput, null);
    assert.equal(state.userUpdateData, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('assertCanActivatePartner bloqueia vendedor com email ainda nao confirmado', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hbx-onboarding-'));
  try {
    const attachments = [
      await createTempAttachment(dir, 'photo_id'),
      await createTempAttachment(dir, 'contract_pdf'),
      await createTempAttachment(dir, 'generated_contract'),
    ];
    const { service, state } = buildOnboardingService({ attachments, emailConfirmedAt: null });

    await assert.rejects(
      () => service.assertCanActivatePartner(1, 200, 1),
      (error: any) => {
        const response = error.getResponse();
        assert.equal(response.code, 'HBX_PARTNER_EMAIL_CONFIRMATION_PENDING');
        assert.match(response.message, /e-mail/i);
        return true;
      },
    );
    assert.equal(state.partnerContractUpsertData, null);
    assert.equal(state.onboardingUpdateData, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('assertCanActivatePartner aprova vendedor com email confirmado e documentos completos', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hbx-onboarding-'));
  try {
    const attachments = [
      await createTempAttachment(dir, 'photo_id'),
      await createTempAttachment(dir, 'contract_pdf'),
      await createTempAttachment(dir, 'generated_contract'),
    ];
    const { service, state } = buildOnboardingService({ attachments, emailConfirmedAt: new Date() });

    const readiness = await service.assertCanActivatePartner(1, 200, 1);

    assert.equal(readiness.complete, true);
    assert.equal(state.partnerContractUpsertData.create.status, 'approved');
    assert.equal(state.partnerContractUpsertData.update.status, 'approved');
    assert.equal(state.onboardingUpdateData.status, 'approved');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function buildPurgeService(input: { attachments: any[] }) {
  const state: Record<string, any> = {
    updates: [],
  };
  const prisma = {
    sellerOnboardingAttachment: {
      findMany: async ({ where }: any) => {
        state.findWhere = where;
        return input.attachments;
      },
      update: async ({ where, data }: any) => {
        state.updates.push({ where, data });
        return { id: where.id, ...data };
      },
    },
  };
  return {
    service: new SellerOnboardingService(prisma as any, {} as any, {} as any),
    state,
  };
}

test('purgeExpiredAttachments remove arquivo vencido e preserva metadata', async () => {
  const previousUploadDir = process.env.SELLER_ONBOARDING_UPLOAD_DIR;
  const dir = await mkdtemp(join(tmpdir(), 'hbx-onboarding-purge-'));
  process.env.SELLER_ONBOARDING_UPLOAD_DIR = dir;
  try {
    const storagePath = join(dir, 'expired.pdf');
    await writeFile(storagePath, Buffer.from('expirado'));
    const { service, state } = buildPurgeService({
      attachments: [{
        id: 'att_1',
        storagePath,
        originalFilename: 'documento.pdf',
        sha256: 'sha-original',
        byteSize: 8,
        status: 'temporary',
      }],
    });

    const result = await service.purgeExpiredAttachments(1);

    assert.equal(result.scannedCount, 1);
    assert.equal(result.deletedCount, 1);
    assert.equal(result.missingFileCount, 0);
    await assert.rejects(() => readFile(storagePath), /ENOENT/);
    assert.deepEqual(Object.keys(state.updates[0].data).sort(), ['deletedAt', 'status']);
    assert.equal(state.updates[0].data.status, 'deleted');
    assert.ok(state.updates[0].data.deletedAt instanceof Date);
    assert.deepEqual(state.findWhere.status, { not: 'deleted' });
    assert.deepEqual(state.findWhere.deleteAfter, { lte: state.updates[0].data.deletedAt });
    assert.deepEqual(state.findWhere.onboarding, { companyId: 1 });
  } finally {
    if (previousUploadDir === undefined) delete process.env.SELLER_ONBOARDING_UPLOAD_DIR;
    else process.env.SELLER_ONBOARDING_UPLOAD_DIR = previousUploadDir;
    await rm(dir, { recursive: true, force: true });
  }
});

test('purgeExpiredAttachments marca deleted quando arquivo ja nao existe', async () => {
  const previousUploadDir = process.env.SELLER_ONBOARDING_UPLOAD_DIR;
  const dir = await mkdtemp(join(tmpdir(), 'hbx-onboarding-purge-'));
  process.env.SELLER_ONBOARDING_UPLOAD_DIR = dir;
  try {
    const { service, state } = buildPurgeService({
      attachments: [{
        id: 'att_missing',
        storagePath: join(dir, 'missing.pdf'),
        originalFilename: 'missing.pdf',
        sha256: 'sha-missing',
        byteSize: 0,
        status: 'temporary',
      }],
    });

    const result = await service.purgeExpiredAttachments(1);

    assert.equal(result.deletedCount, 1);
    assert.equal(result.missingFileCount, 1);
    assert.equal(state.updates.length, 1);
    assert.equal(state.updates[0].data.status, 'deleted');
  } finally {
    if (previousUploadDir === undefined) delete process.env.SELLER_ONBOARDING_UPLOAD_DIR;
    else process.env.SELLER_ONBOARDING_UPLOAD_DIR = previousUploadDir;
    await rm(dir, { recursive: true, force: true });
  }
});

test('purgeExpiredAttachments bloqueia path fora do diretorio permitido', async () => {
  const previousUploadDir = process.env.SELLER_ONBOARDING_UPLOAD_DIR;
  const allowedDir = await mkdtemp(join(tmpdir(), 'hbx-onboarding-allowed-'));
  const outsideDir = await mkdtemp(join(tmpdir(), 'hbx-onboarding-outside-'));
  process.env.SELLER_ONBOARDING_UPLOAD_DIR = allowedDir;
  try {
    const outsidePath = join(outsideDir, 'outside.pdf');
    const traversalPath = `${allowedDir}${sep}..${sep}${basename(outsideDir)}${sep}outside.pdf`;
    await writeFile(outsidePath, Buffer.from('fora'));
    const { service, state } = buildPurgeService({
      attachments: [
        {
          id: 'att_outside',
          storagePath: outsidePath,
          originalFilename: 'outside.pdf',
          sha256: 'sha-outside',
          byteSize: 4,
          status: 'temporary',
        },
        {
          id: 'att_traversal',
          storagePath: traversalPath,
          originalFilename: 'traversal.pdf',
          sha256: 'sha-traversal',
          byteSize: 4,
          status: 'temporary',
        },
      ],
    });

    const result = await service.purgeExpiredAttachments(1);

    assert.equal(result.deletedCount, 0);
    assert.equal(result.skippedUnsafePathCount, 2);
    assert.equal(state.updates.length, 0);
    assert.equal((await readFile(outsidePath)).toString(), 'fora');
  } finally {
    if (previousUploadDir === undefined) delete process.env.SELLER_ONBOARDING_UPLOAD_DIR;
    else process.env.SELLER_ONBOARDING_UPLOAD_DIR = previousUploadDir;
    await rm(allowedDir, { recursive: true, force: true });
    await rm(outsideDir, { recursive: true, force: true });
  }
});
