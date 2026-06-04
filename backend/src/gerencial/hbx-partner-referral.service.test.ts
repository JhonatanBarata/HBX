import test from 'node:test';
import assert from 'node:assert/strict';

import { UsersController } from '../users/users.controller';
import { HbxPartnerReferralService } from './hbx-partner-referral.service';

const hbxCompany = { slug: 'hbx-master-whatsapp-engine' };

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

test('/users/company/create com referralCandidateId cria User com referredByUserId certo', async () => {
  let createdData: any = null;
  let convertedInput: any = null;
  const controller = buildUsersController({
    usersService: {
      create: async (data: any) => {
        createdData = data;
        return { id: 200, email: data.email, username: data.username, role: data.role, isSystemMaster: false, isActive: data.isActive, ...data };
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
  assert.equal(result.user.referredByUserId, 88);
  assert.equal(convertedInput.candidateId, 'cand_1');
  assert.equal(convertedInput.convertedUserId, 200);
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
