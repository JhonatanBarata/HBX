import test from 'node:test';
import assert from 'node:assert/strict';

import { UsersController } from '../users/users.controller';
import { SellerOnboardingService } from './seller-onboarding.service';
import { HbxPartnerReferralService } from './hbx-partner-referral.service';

const hbxCompany = { slug: 'hbx-master-whatsapp-engine' };
const activePartner = { id: 10, companyId: 1, role: 'USER', isActive: true, deactivatedAt: null, isSystemMaster: false };

function buildUsersController(overrides: {
  usersService?: Record<string, any>;
  sellerOnboardingService?: Record<string, any>;
  hbxPartnerReferrals?: Record<string, any>;
} = {}) {
  const usersService = {
    findById: async () => ({ id: 10, companyId: 1, role: 'USER', isActive: true, deactivatedAt: null, isSystemMaster: false }),
    isHbxSellerNetworkCompany: async () => true,
    getCompanyTrialSeatUsage: async () => ({
      company: { id: 1, commissionDueBusinessDays: 3 },
      isTrial: false,
      activeAdmins: 0,
      maxAdmins: 1,
      activeSellers: 0,
      maxSellers: 2,
    }),
    findByEmail: async () => null,
    findByUsername: async () => null,
    getActiveSellerReferrer: async (companyId: number, userId: number) => ({
      id: userId,
      companyId,
      role: 'USER',
      isActive: true,
      deactivatedAt: null,
      isSystemMaster: false,
      commissionPercent: 17,
      sellerReferralCommissionPercent: 3,
    }),
    create: async (data: any) => ({ id: 200, email: data.email, username: data.username, role: data.role, isSystemMaster: false, isActive: data.isActive ?? true, ...data }),
    ...overrides.usersService,
  };

  const sellerOnboardingService = {
    getOrCreateForUser: async () => ({}),
    updateDraft: async () => ({}),
    ...overrides.sellerOnboardingService,
  };

  const hbxPartnerReferrals = {
    createCandidate: async () => ({}),
    getCandidateForConversion: async () => null,
    markCandidateConverted: async () => ({}),
    ...overrides.hbxPartnerReferrals,
  };

  return new UsersController(
    usersService as any,
    { registerSupportAction: async () => ({}) } as any,
    { getConfigurationSummary: () => ({ mode: 'log' }) } as any,
    {} as any,
    {} as any,
    sellerOnboardingService as any,
    hbxPartnerReferrals as any,
  );
}

test('/users/hbx/referred-seller cria candidate e nao cria User', async () => {
  let userCreateCalled = false;
  let createCandidateInput: any = null;
  const controller = buildUsersController({
    usersService: {
      create: async () => {
        userCreateCalled = true;
        throw new Error('user.create nao deveria ser chamado');
      },
    },
    hbxPartnerReferrals: {
      createCandidate: async (requester: any, dto: any) => {
        createCandidateInput = { requester, dto };
        return {
          id: 'cand_1',
          companyId: 1,
          referrerUserId: requester.id,
          candidateName: dto.candidateName,
          candidatePhone: dto.candidatePhone,
          status: 'pending',
        };
      },
    },
  });

  const result = await controller.createHbxReferredSeller(
    { user: { id: 10 } } as any,
    { name: 'Maria Indicada', phone: '(11) 99999-0000', note: 'tem carteira', preferredSegment: 'saude' } as any,
  );

  assert.equal(userCreateCalled, false);
  assert.equal(result.ok, true);
  assert.equal(result.message, 'Indicação enviada para aprovação do Master HBX.');
  assert.equal(result.candidate.status, 'pending');
  assert.equal(createCandidateInput.requester.id, 10);
  assert.equal(createCandidateInput.dto.candidateName, 'Maria Indicada');
  assert.equal(createCandidateInput.dto.candidatePhone, '(11) 99999-0000');
});

test('createCandidate grava candidate pending com telefone normalizado', async () => {
  let createdData: any = null;
  const service = new HbxPartnerReferralService({
    company: { findUnique: async () => hbxCompany },
    hbxPartnerReferralCandidate: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        createdData = data;
        return { id: 'cand_1', ...data };
      },
    },
  } as any);

  const candidate = await service.createCandidate(activePartner as any, {
    candidateName: '  Maria   Indicada  ',
    candidatePhone: '(11) 99999-0000',
    note: '  tem   carteira  ',
    preferredSegmentsJson: '["saude"]',
  });

  assert.equal(createdData.companyId, 1);
  assert.equal(createdData.referrerUserId, 10);
  assert.equal(createdData.candidateName, 'Maria Indicada');
  assert.equal(createdData.candidatePhone, '(11) 99999-0000');
  assert.equal(createdData.candidatePhoneNormalized, '11999990000');
  assert.equal(createdData.note, 'tem carteira');
  assert.equal(createdData.preferredSegmentsJson, '["saude"]');
  assert.equal(createdData.status, 'pending');
  assert.equal(candidate.status, 'pending');
});

test('createCandidate bloqueia duplicado pending ou approved por telefone normalizado', async () => {
  let lookupWhere: any = null;
  let createCalled = false;
  const service = new HbxPartnerReferralService({
    company: { findUnique: async () => hbxCompany },
    hbxPartnerReferralCandidate: {
      findFirst: async ({ where }: any) => {
        lookupWhere = where;
        return { id: 'cand_existing', status: 'approved' };
      },
      create: async () => {
        createCalled = true;
        return {};
      },
    },
  } as any);

  await assert.rejects(
    () => service.createCandidate(activePartner as any, { candidateName: 'Maria Indicada', candidatePhone: '(11) 99999-0000' }),
    /Já existe uma indicação pendente ou aprovada com este WhatsApp\./,
  );

  assert.equal(createCalled, false);
  assert.equal(lookupWhere.companyId, 1);
  assert.equal(lookupWhere.candidatePhoneNormalized, '11999990000');
  assert.deepEqual(lookupWhere.status, { in: ['pending', 'approved'] });
});

test('approveCandidate muda status para approved', async () => {
  const service = new HbxPartnerReferralService({
    company: { findUnique: async () => hbxCompany },
    user: { findFirst: async () => ({ id: 10 }) },
    hbxPartnerReferralCandidate: {
      findFirst: async () => ({ id: 'cand_1', companyId: 1, referrerUserId: 10, status: 'pending' }),
      update: async ({ data }: any) => ({ id: 'cand_1', status: data.status, reviewedByUserId: data.reviewedByUserId, reviewedAt: data.reviewedAt }),
    },
  } as any);

  const candidate = await service.approveCandidate({ id: 1, companyId: 1 } as any, 'cand_1');

  assert.equal(candidate.status, 'approved');
  assert.equal(candidate.reviewedByUserId, 1);
  assert.ok(candidate.reviewedAt instanceof Date);
});

test('getCandidateForConversion aceita indicacao pending ou approved da empresa', async () => {
  let lookupWhere: any = null;
  const service = new HbxPartnerReferralService({
    company: { findUnique: async () => hbxCompany },
    hbxPartnerReferralCandidate: {
      findFirst: async ({ where }: any) => {
        lookupWhere = where;
        return { id: where.id, companyId: where.companyId, status: 'pending', referrerUserId: 88 };
      },
    },
  } as any);

  const candidate = await service.getCandidateForConversion(1, 'cand_1');

  assert.equal(candidate?.id, 'cand_1');
  assert.equal(lookupWhere.companyId, 1);
  assert.deepEqual(lookupWhere.status, { in: ['pending', 'approved'] });
});

test('markCandidateConverted converte indicacao pending ou approved', async () => {
  let lookupWhere: any = null;
  let updateData: any = null;
  const service = new HbxPartnerReferralService({
    company: { findUnique: async () => hbxCompany },
    hbxPartnerReferralCandidate: {
      findFirst: async ({ where }: any) => {
        lookupWhere = where;
        return { id: 'cand_1', reviewedAt: null, reviewedByUserId: null };
      },
      update: async ({ data }: any) => {
        updateData = data;
        return { id: 'cand_1', ...data };
      },
    },
  } as any);

  const candidate = await service.markCandidateConverted({
    companyId: 1,
    candidateId: 'cand_1',
    convertedUserId: 200,
    reviewedByUserId: 1,
  });

  assert.deepEqual(lookupWhere.status, { in: ['pending', 'approved'] });
  assert.equal(updateData.status, 'converted');
  assert.equal(updateData.convertedUserId, 200);
  assert.equal(updateData.reviewedByUserId, 1);
  assert.ok(updateData.reviewedAt instanceof Date);
  assert.equal(candidate.status, 'converted');
});

test('/users/company/create com referralCandidateId cria User com referredByUserId certo', async () => {
  let createdData: any = null;
  let convertedInput: any = null;
  let onboardingDraft: any = null;
  const controller = buildUsersController({
    usersService: {
      create: async (data: any) => {
        createdData = data;
        return { id: 200, email: data.email, username: data.username, role: data.role, isSystemMaster: false, isActive: data.isActive, ...data };
      },
    },
    sellerOnboardingService: {
      getOrCreateForUser: async () => ({}),
      updateDraft: async (_companyId: number, _userId: number, dto: any) => {
        onboardingDraft = dto;
        return {};
      },
    },
    hbxPartnerReferrals: {
      getCandidateForConversion: async () => ({
        id: 'cand_1',
        companyId: 1,
        referrerUserId: 88,
        candidateName: 'Joao Convertido',
        candidatePhone: '(11) 98888-7777',
        status: 'approved',
      }),
      markCandidateConverted: async (input: any) => {
        convertedInput = input;
        return { id: input.candidateId, status: 'converted' };
      },
    },
  });

  const result = await controller.createCompanyUser(
    { user: { id: 1, companyId: 1 } } as any,
    {
      email: 'convertido@example.com',
      role: 'USER',
      referralCandidateId: 'cand_1',
      password: 'Tmp@abcde1',
    } as any,
  );

  assert.equal(createdData.referredByUserId, 88);
  assert.equal(createdData.name, 'Joao Convertido');
  assert.equal(createdData.phone, '(11) 98888-7777');
  assert.equal(createdData.commissionPercent, 17);
  assert.equal(createdData.sellerReferralCommissionPercent, 3);
  assert.equal(createdData.referredByCommissionPercentSnapshot, 3);
  assert.equal(result.user.referredByUserId, 88);
  assert.equal(onboardingDraft.referredByUserId, 88);
  assert.equal(onboardingDraft.referredByCommissionPercentSnapshot, 3);
  assert.equal(convertedInput.candidateId, 'cand_1');
  assert.equal(convertedInput.convertedUserId, 200);
});

test('SellerOnboarding salva herdeiro com indicador e snapshot', async () => {
  let updateData: any = null;
  const service = new SellerOnboardingService({
    company: { findUnique: async () => hbxCompany },
    sellerOnboarding: {
      findUnique: async () => ({
        id: 'onb_1',
        referredByUserId: null,
        partnerType: 'hbx_partner',
        legalName: null,
        email: null,
        phone: null,
        cpf: null,
        declaredAddress: null,
        commissionPercent: 0,
        commissionRecurring: true,
        commissionDueBusinessDays: 3,
        canRegisterHbxSellers: false,
        sellerReferralCommissionPercent: 0,
        referredByCommissionPercentSnapshot: 0,
        archiveEmail: null,
        metadataJson: null,
      }),
      update: async ({ data }: any) => {
        updateData = data;
        return { id: 'onb_1', ...data };
      },
    },
    user: {
      findFirst: async ({ where }: any) => {
        if (Number(where?.id || 0) === 88) return { name: 'Indicador Ativo' };
        return { id: 200, companyId: 1, role: 'USER', company: { id: 1, commissionDueBusinessDays: 3 } };
      },
    },
  } as any, {} as any, {} as any);

  await service.updateDraft(1, 200, {
    referredByUserId: 88,
    referredByCommissionPercentSnapshot: 3,
  });

  assert.equal(updateData.partnerType, 'hbx_heir');
  assert.equal(updateData.referredByUserId, 88);
  assert.equal(updateData.referredByNameSnapshot, 'Indicador Ativo');
  assert.equal(updateData.referredByCommissionPercentSnapshot, 3);
});

test('lookup-phone encontra indicacao por telefone normalizado', async () => {
  let lookupWhere: any = null;
  const service = new HbxPartnerReferralService({
    company: { findUnique: async () => hbxCompany },
    hbxPartnerReferralCandidate: {
      findFirst: async ({ where }: any) => {
        lookupWhere = where;
        return { id: 'cand_1', candidatePhoneNormalized: where.candidatePhoneNormalized, status: 'pending' };
      },
    },
  } as any);

  const candidate = await service.findCandidateByPhone(1, '(11) 99999-0000');

  assert.equal(lookupWhere.companyId, 1);
  assert.equal(lookupWhere.candidatePhoneNormalized, '11999990000');
  assert.equal(candidate?.id, 'cand_1');
});
