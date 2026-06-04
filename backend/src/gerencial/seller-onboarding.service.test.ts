import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { SellerOnboardingService } from './seller-onboarding.service';

const hbxCompany = { slug: 'hbx-master-whatsapp-engine' };

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
}) {
  const state: Record<string, any> = {
    mailInput: null,
    onboardingUpdateData: null,
    attachmentUpdateMany: null,
    userUpdateData: null,
    partnerContractCreateData: null,
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
    attachments: input.attachments,
  };

  const prisma = {
    company: {
      findUnique: async () => hbxCompany,
    },
    user: {
      findFirst: async () => ({
        id: 200,
        companyId: 1,
        role: 'USER',
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

test('sendOnboardingEmail envia com arquivo, agenda limpeza e ativa parceiro', async () => {
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
    assert.equal(result.userActivated, true);
    assert.equal(result.messageId, 'msg_1');
    assert.deepEqual(result.missingRequiredAttachments, []);
    assert.equal(state.mailInput.to, 'parceiro@example.com');
    assert.equal(state.mailInput.cc, 'arquivo@example.com');
    assert.equal(state.mailInput.attachments.length, 3);
    assert.equal(state.userUpdateData.isActive, true);
    assert.equal(state.userUpdateData.deactivatedAt, null);
    assert.equal(state.onboardingUpdateData.emailStatus, 'sent');
    assert.equal(state.onboardingUpdateData.status, 'approved');
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
