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

test('heartbeat compartilhado aceita DRIVER da Logística quando ele não possui Vendas', async () => {
  const service: any = new MobileDevicePresenceService({} as never);
  let touched = 0;
  let logisticsChecks = 0;
  service.authenticateDeviceCredential = async () => ({
    id: 'device-driver', userId: 7, companyId: 3, name: null, platform: 'android',
  });
  service.assertUserCanUseBridge = async () => {
    throw new Error('sem Vendas');
  };
  service.assertUserCanUseLogistica = async () => { logisticsChecks++; };
  service.touchAuthenticatedDevice = async () => { touched++; };

  const result = await service.heartbeat({ deviceToken: 'x'.repeat(40), installationId: 'installation-1234' });
  assert.equal(result.ok, true);
  assert.equal(result.deviceId, 'device-driver');
  assert.equal(logisticsChecks, 1);
  assert.equal(touched, 1);
});

test('heartbeat de SELLER preserva o gate da ponte e não exige DRIVER', async () => {
  const service: any = new MobileDevicePresenceService({} as never);
  let bridgeChecks = 0;
  let logisticsChecks = 0;
  service.authenticateDeviceCredential = async () => ({
    id: 'device-seller', userId: 8, companyId: 3, name: null, platform: 'android',
  });
  service.assertUserCanUseBridge = async () => { bridgeChecks++; };
  service.assertUserCanUseLogistica = async () => { logisticsChecks++; };
  service.touchAuthenticatedDevice = async () => undefined;

  const result = await service.heartbeat({ deviceToken: 'x'.repeat(40), installationId: 'installation-1234' });
  assert.equal(result.ok, true);
  assert.equal(bridgeChecks, 1);
  assert.equal(logisticsChecks, 0);
});
