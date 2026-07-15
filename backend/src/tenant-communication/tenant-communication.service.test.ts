import test from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenException } from '@nestjs/common';
import { TenantCommunicationService } from './tenant-communication.service';
import { serializeTeamPolicyModuleAndAccessRows } from '../team/team-policy-persistence';

function buildPolicy(access: Record<string, boolean> = {}, userId = 7) {
  return {
    id: `policy-${userId}`,
    userId,
    companyId: 1,
    status: 'active',
    subjectKind: null,
    modulesJson: serializeTeamPolicyModuleAndAccessRows({
      modules: [],
      access,
    }),
    allowedSegmentsJson: '[]',
    blockedSegmentsJson: '[]',
    allowedCitiesJson: '[]',
    allowedStatesJson: '[]',
    requiresLocation: null,
    requiredChannelsJson: '{}',
    visibilityJson: null,
  };
}

function buildUser(input: Record<string, any> = {}) {
  const company = input.company || {
    id: input.companyId || 1,
    name: 'Cliente A',
    companyKind: input.companyKind || 'tenant',
  };
  return {
    id: input.id || 7,
    companyId: company.id,
    role: input.role || 'USER',
    isSystemMaster: Boolean(input.isSystemMaster),
    company,
    ...input,
  };
}

function buildHarness(input: {
  access?: Record<string, boolean>;
  user?: any;
  company?: any;
  policy?: any;
} = {}) {
  const user = input.user || buildUser();
  let company = input.company || {
    id: user.companyId || 1,
    companyKind: 'tenant',
    supportEmail: 'suporte@cliente.com',
    replyToEmail: 'responder@cliente.com',
    supportWhatsapp: '+55 11 99999-0000',
    communicationSettingsJson: '{"note":"atendimento comercial"}',
  };
  let updateData: Record<string, unknown> | null = null;
  const prisma = {
    user: {
      findUnique: async () => user,
    },
    userTeamPolicy: {
      findUnique: async () => input.policy === undefined
        ? buildPolicy(input.access || {}, Number(user.id || 7))
        : input.policy,
    },
    userModuleAccess: {
      findMany: async () => [],
    },
    company: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.id, user.companyId);
        return company;
      },
      update: async ({ where, data }: any) => {
        assert.equal(where.id, company.id);
        updateData = data;
        company = { ...company, ...data };
        return company;
      },
    },
  };
  return {
    service: new TenantCommunicationService(prisma as any),
    user,
    getUpdateData: () => updateData,
  };
}

test('getSettingsForUser blocks platform_infra company', async () => {
  const user = buildUser({ companyKind: 'platform_infra' });
  const { service } = buildHarness({
    user,
    company: { id: user.companyId, companyKind: 'platform_infra' },
  });

  await assert.rejects(
    () => service.getSettingsForUser(user),
    ForbiddenException,
  );
});

test('getSettingsForUser blocks USER without support channel access', async () => {
  const { service, user } = buildHarness({
    access: { 'communication.support.viewCompanySupportChannels': false },
  });

  await assert.rejects(
    () => service.getSettingsForUser(user),
    /ver canais de suporte bloqueado/i,
  );
});

test('getSettingsForUser allows USER with support channel access', async () => {
  const { service, user } = buildHarness({
    access: { 'communication.support.viewCompanySupportChannels': true },
  });

  const result = await service.getSettingsForUser(user);

  assert.equal(result.supportEmail, 'suporte@cliente.com');
  assert.equal(result.replyToEmail, 'responder@cliente.com');
  assert.equal(result.supportWhatsapp, '+55 11 99999-0000');
  assert.equal(result.communicationSettingsJson, '{"note":"atendimento comercial"}');
});

test('getSettingsForUser allows ADMIN by default and explicit false blocks', async () => {
  const admin = buildUser({ role: 'ADMIN' });
  const allowed = buildHarness({ user: admin, access: {} });

  const result = await allowed.service.getSettingsForUser(admin);
  assert.equal(result.supportEmail, 'suporte@cliente.com');

  const blocked = buildHarness({
    user: admin,
    access: { 'communication.support.viewCompanySupportChannels': false },
  });
  await assert.rejects(
    () => blocked.service.getSettingsForUser(admin),
    /ver canais de suporte bloqueado/i,
  );
});

test('updateSettingsForUser requires team access manage', async () => {
  const { service, user } = buildHarness({
    access: { 'team.access.manage': false },
  });

  await assert.rejects(
    () => service.updateSettingsForUser(user, { supportEmail: 'novo@cliente.com' }),
    /configurar comunicacao bloqueado/i,
  );
});

test('updateSettingsForUser persists support channels', async () => {
  const admin = buildUser({ role: 'ADMIN' });
  const { service, getUpdateData } = buildHarness({
    user: admin,
    access: { 'team.access.manage': true },
  });

  const result = await service.updateSettingsForUser(admin, {
    supportEmail: 'SUPORTE@NOVO.COM',
    replyToEmail: 'RESPONDER@NOVO.COM',
    supportWhatsapp: '  +55 11 98888-7777  ',
    communicationSettingsJson: { escalation: 'dono' },
  });

  assert.deepEqual(getUpdateData(), {
    supportEmail: 'suporte@novo.com',
    replyToEmail: 'responder@novo.com',
    supportWhatsapp: '+55 11 98888-7777',
    communicationSettingsJson: '{"escalation":"dono"}',
  });
  assert.equal(result.supportEmail, 'suporte@novo.com');
  assert.equal(result.replyToEmail, 'responder@novo.com');
  assert.equal(result.supportWhatsapp, '+55 11 98888-7777');
  assert.equal(result.communicationSettingsJson, '{"escalation":"dono"}');
});
