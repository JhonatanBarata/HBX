import test from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WhatsAppModalService } from './whatsapp-modal.service';

function createCompany(overrides: Record<string, any> = {}) {
  return {
    id: 7,
    name: 'Empresa Teste',
    slug: 'empresa-teste',
    whatsappModalStatus: 'DISCONNECTED',
    whatsappModalProvider: 'external_modal',
    whatsappModalPhone: null,
    whatsappModalConnectedAt: null,
    whatsappModalLastError: null,
    whatsappModalUpdatedAt: null,
    paymentStatus: 'PAID',
    subscriptionStatus: 'active',
    onboardingStatus: 'active_paid',
    premiumAccess: true,
    isActive: true,
    trialStartsAt: null,
    trialEndsAt: null,
    ...overrides,
  };
}

function createPrisma(company = createCompany()) {
  return {
    company: {
      findUnique: async ({ where }: any) => Number(where.id) === Number(company.id) ? company : null,
      update: async ({ data }: any) => ({ ...company, ...data }),
    },
    trialPhoneUsage: {
      findUnique: async () => null,
      create: async () => null,
      update: async () => null,
    },
    $queryRawUnsafe: async () => [],
    $executeRawUnsafe: async () => 0,
  } as any;
}

function createService(company = createCompany(), providerResponse: any = { pairingCode: 'ABCD-EFGH' }) {
  const service = new WhatsAppModalService(createPrisma(company)) as any;
  service.readConfig = () => ({
    enabled: true,
    configured: true,
    available: true,
    internalUrl: 'http://provider.local',
    apiKey: 'secret',
    timeoutMs: 1000,
    missingConfigKeys: [],
    setupHint: null,
  });
  service.requestProvider = async ({ path, purpose }: any) => {
    if (String(purpose).includes('criacao')) return { ok: true };
    if (String(path).includes('connectionState')) {
      return { state: company.whatsappModalStatus || 'DISCONNECTED' };
    }
    return providerResponse;
  };
  service.tryConfigureProviderWebhook = async () => null;
  return service as WhatsAppModalService;
}

test('pairing-code rejeita telefone invalido', async () => {
  const service = createService();

  await assert.rejects(
    () => service.requestPairingCode(7, 'company-7', 'abc'),
    BadRequestException,
  );
});

test('pairing-code rejeita sessao inexistente ou de outra empresa', async () => {
  const service = createService();

  await assert.rejects(
    () => service.requestPairingCode(7, 'company-8', '+5519999999999'),
    NotFoundException,
  );
});

test('pairing-code retorna erro claro quando provider nao devolve codigo', async () => {
  const service = createService(createCompany(), { ok: true });

  const response = await service.requestPairingCode(7, 'company-7', '+5519999999999');

  assert.equal(response.success, false);
  assert.equal(response.errorCode, 'WHATSAPP_MODAL_PAIRING_CODE_EMPTY');
  assert.equal(response.providerSupported, true);
  assert.equal(
    response.message,
    'O Webwhats respondeu sem pairingCode. A instância provavelmente foi criada sem number ou já estava presa em modo QR.',
  );
});

test('pairing-code gera codigo com sucesso sem persistir o codigo', async () => {
  const updates: any[] = [];
  const prisma = createPrisma(createCompany());
  prisma.company.update = async ({ data }: any) => {
    updates.push(data);
    return data;
  };
  const service = new WhatsAppModalService(prisma) as any;
  service.readConfig = () => ({
    enabled: true,
    configured: true,
    available: true,
    internalUrl: 'http://provider.local',
    apiKey: 'secret',
    timeoutMs: 1000,
    missingConfigKeys: [],
    setupHint: null,
  });
  service.requestProvider = async ({ purpose, path }: any) => {
    if (String(purpose).includes('criacao')) return { ok: true };
    if (String(path).includes('connectionState')) return { state: 'DISCONNECTED' };
    return { code: 'WXYZ-1234' };
  };
  service.tryConfigureProviderWebhook = async () => null;

  const response = await service.requestPairingCode(7, 'company-7', '+5519999999999');

  assert.equal(response.success, true);
  assert.equal(response.code, 'WXYZ-1234');
  assert.equal(JSON.stringify(updates).includes('WXYZ-1234'), false);
});

test('pairing-code cria instancia com number normalizado antes de conectar', async () => {
  const createPayloads: any[] = [];
  const service = new WhatsAppModalService(createPrisma(createCompany())) as any;
  service.readConfig = () => ({
    enabled: true,
    configured: true,
    available: true,
    internalUrl: 'http://provider.local',
    apiKey: 'secret',
    timeoutMs: 1000,
    missingConfigKeys: [],
    setupHint: null,
  });
  service.requestProvider = async ({ purpose, path, data }: any) => {
    if (String(path).includes('connectionState')) return { state: 'DISCONNECTED' };
    if (String(purpose).includes('criacao')) {
      createPayloads.push(data);
      return { ok: true };
    }
    if (String(path).includes('/instance/connect/')) {
      return { qrcode: { pairingCode: 'ABCD-EFGH' } };
    }
    return { ok: true };
  };
  service.tryConfigureProviderWebhook = async () => null;

  const response = await service.requestPairingCode(7, 'company-7', '+55 (19) 99702-4884');

  assert.equal(response.success, true);
  assert.equal(response.code, 'ABCD-EFGH');
  assert.equal(createPayloads.length, 1);
  assert.equal(createPayloads[0].instanceName, 'company-7');
  assert.equal(createPayloads[0].integration, 'WHATSAPP-BAILEYS');
  assert.equal(createPayloads[0].qrcode, true);
  assert.equal(createPayloads[0].number, '5519997024884');
});

test('pairing-code recria instancia existente em QR quando nao recebe codigo', async () => {
  const paths: string[] = [];
  let connectAttempts = 0;
  const service = new WhatsAppModalService(createPrisma(createCompany())) as any;
  service.readConfig = () => ({
    enabled: true,
    configured: true,
    available: true,
    internalUrl: 'http://provider.local',
    apiKey: 'secret',
    timeoutMs: 1000,
    missingConfigKeys: [],
    setupHint: null,
  });
  service.requestProvider = async ({ purpose, path }: any) => {
    paths.push(path);
    if (String(path).includes('connectionState')) return { state: 'DISCONNECTED' };
    if (String(purpose).includes('criacao')) return { ok: true };
    if (String(path).includes('/instance/connect/')) {
      connectAttempts += 1;
      return connectAttempts === 1
        ? { qrcode: { base64: 'qr-mode' } }
        : { instance: { qrcode: { pairingCode: 'JKLM-9999' } } };
    }
    return { ok: true };
  };
  service.tryConfigureProviderWebhook = async () => null;

  const response = await service.requestPairingCode(7, 'company-7', '+5519999999999');

  assert.equal(response.success, true);
  assert.equal(response.code, 'JKLM-9999');
  assert.equal(connectAttempts, 2);
  assert.ok(paths.includes('/instance/logout/company-7'));
  assert.ok(paths.includes('/instance/restart/company-7'));
  assert.ok(paths.includes('/instance/delete/company-7'));
});

test('pairing-code nao gera se sessao ja esta conectada', async () => {
  const service = createService(createCompany({
    whatsappModalStatus: 'CONNECTED',
    whatsappModalPhone: '5519999999999',
    whatsappModalConnectedAt: new Date(),
  }));

  const response = await service.requestPairingCode(7, 'company-7', '+5519999999999');

  assert.equal(response.success, false);
  assert.equal(response.status, 'connected');
  assert.equal(response.errorCode, 'WHATSAPP_MODAL_ALREADY_CONNECTED');
});
