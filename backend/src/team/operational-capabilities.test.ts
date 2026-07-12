import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeOperationalCapabilities,
  projectOperationalCapabilities,
  projectOperationalCapabilitiesFromStoredPolicy,
  setUserOperationalCapabilities,
} from './operational-capabilities';
import {
  ensureUserTeamPolicyForUser,
  parseTeamPolicyAccessMap,
  parseTeamPolicyModuleAccessMap,
  serializeTeamPolicyModuleAndAccessRows,
} from './team-policy-persistence';

test('USER legado continua vendedor e entregador exige concessao explicita', () => {
  assert.deepEqual(
    projectOperationalCapabilities({ role: 'USER', isSystemMaster: false }),
    {
      operationalCapabilities: ['SELLER'],
      defaultWorkspace: 'vendas',
      workspaceHome: '/vendas',
    },
  );

  const driver = projectOperationalCapabilitiesFromStoredPolicy(
    { role: 'USER', isSystemMaster: false },
    serializeTeamPolicyModuleAndAccessRows({
      access: {
        'workspace.vendas.access': false,
        'workspace.entregas.access': true,
      },
    }),
  );
  assert.deepEqual(driver.operationalCapabilities, ['DRIVER']);
  assert.equal(driver.workspaceHome, '/entrega');
});

test('ADMIN e USERMASTER recebem ambos por default sem confundir escolha visual com concessao', () => {
  assert.deepEqual(
    projectOperationalCapabilities({ role: 'ADMIN' }).operationalCapabilities,
    ['SELLER', 'DRIVER'],
  );
  assert.deepEqual(
    projectOperationalCapabilities({ role: 'USERMASTER' }).operationalCapabilities,
    ['SELLER', 'DRIVER'],
  );
});

test('normalizacao rejeita perfil vazio ou desconhecido', () => {
  assert.throws(() => normalizeOperationalCapabilities([]), /Escolha Vendedor/);
  assert.throws(() => normalizeOperationalCapabilities(['ROOT']), /Perfil operacional invalido/);
  assert.deepEqual(normalizeOperationalCapabilities(['DRIVER', 'SELLER', 'DRIVER']), ['SELLER', 'DRIVER']);
});

test('persistencia troca somente capacidades e preserva modulo/acesso granular existente', async () => {
  const originalModulesJson = serializeTeamPolicyModuleAndAccessRows({
    modules: [{ key: 'vendas', allowed: true }],
    access: { 'team.users.edit': false },
  });
  let savedModulesJson = '';
  const prisma: any = {
    user: {
      findUnique: async () => ({
        id: 41,
        role: 'USER',
        companyId: 7,
        isActive: true,
        deactivatedAt: null,
        company: { id: 7, slug: 'empresa', commissionDueBusinessDays: 3 },
      }),
    },
    userTeamPolicy: {
      findUnique: async (args: any) => args?.select?.modulesJson
        ? { modulesJson: originalModulesJson }
        : { id: 'policy-41' },
      update: async (args: any) => {
        savedModulesJson = args.data.modulesJson;
        return { id: 'policy-41' };
      },
      upsert: async () => ({ id: 'policy-41' }),
    },
  };

  const result = await setUserOperationalCapabilities(prisma, 41, ['DRIVER']);
  assert.deepEqual(result.operationalCapabilities, ['DRIVER']);
  assert.equal(parseTeamPolicyModuleAccessMap(savedModulesJson).get('vendas'), true);
  const access = parseTeamPolicyAccessMap(savedModulesJson);
  assert.equal(access.get('team.users.edit'), false);
  assert.equal(access.get('workspace.vendas.access'), false);
  assert.equal(access.get('workspace.entregas.access'), true);
});

test('sincronizar dados do User nao apaga modulesJson de uma policy existente', async () => {
  let upsertArgs: any = null;
  const prisma: any = {
    user: {
      findUnique: async () => ({
        id: 9,
        role: 'USER',
        companyId: 3,
        isActive: true,
        deactivatedAt: null,
        company: { id: 3, slug: 'tenant', commissionDueBusinessDays: 3 },
      }),
    },
    userTeamPolicy: {
      findUnique: async () => ({ id: 'policy-9' }),
      upsert: async (args: any) => {
        upsertArgs = args;
        return { id: 'policy-9' };
      },
    },
  };

  await ensureUserTeamPolicyForUser(prisma, 9, { source: 'user_update' });
  assert.equal(Object.prototype.hasOwnProperty.call(upsertArgs.update, 'modulesJson'), false);
  assert.equal(upsertArgs.update.source, 'user_update');
});
