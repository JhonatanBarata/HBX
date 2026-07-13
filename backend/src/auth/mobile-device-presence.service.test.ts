import test from 'node:test';
import assert from 'node:assert/strict';
import { MobileDevicePresenceService } from './mobile-device-presence.service';

function userSnapshot(company: Record<string, unknown>) {
  return {
    id: 7,
    companyId: 3,
    isActive: true,
    isSystemMaster: false,
    role: 'USER',
    company,
  };
}

test('ponte móvel bloqueia empresa suspensa antes de autenticar ações', async () => {
  const prisma = {
    user: {
      findUnique: async () => userSnapshot({ accountType: 'credit', status: 'suspended', isActive: false }),
    },
  };
  const service = new MobileDevicePresenceService(prisma as never);
  await assert.rejects(service.assertUserCanUseBridge(7, 3), /acesso da empresa está pausado/i);
});

test('ponte móvel falha fechada quando Vendas não existe no catálogo de módulos', async () => {
  const prisma = {
    user: {
      findUnique: async () => userSnapshot({ accountType: 'credit', status: 'active', isActive: true }),
    },
    userTeamPolicy: {
      findUnique: async () => null,
    },
    systemModule: {
      findUnique: async () => null,
    },
  };
  const service = new MobileDevicePresenceService(prisma as never);
  await assert.rejects(service.assertUserCanUseBridge(7, 3), /módulo Vendas não está habilitado/i);
});
