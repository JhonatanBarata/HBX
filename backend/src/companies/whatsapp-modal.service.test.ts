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
    currentWhatsappConnectionSessionId: null,
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

function createPrisma(
  company = createCompany(),
  activity: {
    inboundAt?: Date | null;
    outboundAt?: Date | null;
    legacyInboundAt?: Date | null;
  } = {},
) {
  const sessions: any[] = [];
  const inboundCompanyMessage = activity.inboundAt
    ? { timestamp: activity.inboundAt, createdAt: activity.inboundAt }
    : null;
  const outboundCompanyMessage = activity.outboundAt
    ? { timestamp: activity.outboundAt, createdAt: activity.outboundAt }
    : null;

  return {
    company: {
      findUnique: async ({ where }: any) => Number(where.id) === Number(company.id) ? company : null,
      update: async ({ data }: any) => ({ ...company, ...data }),
    },
    companyMessage: {
      findFirst: async ({ where }: any) => {
        const directions = Array.isArray(where?.direction?.in) ? where.direction.in : [];
        if (directions.includes('INBOUND') || directions.includes('inbound')) return inboundCompanyMessage;
        if (directions.includes('OUTBOUND') || directions.includes('outbound')) return outboundCompanyMessage;
        return null;
      },
    },
    inboundMessage: {
      findFirst: async () => activity.legacyInboundAt ? { receivedAt: activity.legacyInboundAt } : null,
    },
    outboundMessage: {
      findFirst: async () => activity.outboundAt ? { sentAt: activity.outboundAt, createdAt: activity.outboundAt } : null,
    },
    trialPhoneUsage: {
      findUnique: async () => null,
      create: async () => null,
      update: async () => null,
    },
    whatsAppConnectionSession: {
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const session of sessions) {
          if (where?.companyId !== undefined && Number(session.companyId) !== Number(where.companyId)) continue;
          if (where?.provider !== undefined && session.provider !== where.provider) continue;
          if (where?.tenantKey !== undefined && session.tenantKey !== where.tenantKey) continue;
          if (where?.status !== undefined && session.status !== where.status) continue;
          if (where?.NOT?.id !== undefined && String(session.id) === String(where.NOT.id)) continue;
          if (where?.NOT?.phoneNormalized !== undefined && String(session.phoneNormalized || '') === String(where.NOT.phoneNormalized)) continue;
          Object.assign(session, data);
          count += 1;
        }
        return { count };
      },
      findFirst: async ({ where }: any) => sessions.find((session) => {
        if (where?.companyId !== undefined && Number(session.companyId) !== Number(where.companyId)) return false;
        if (where?.provider !== undefined && session.provider !== where.provider) return false;
        if (where?.tenantKey !== undefined && session.tenantKey !== where.tenantKey) return false;
        if (where?.status !== undefined && session.status !== where.status) return false;
        if (where?.phoneNormalized !== undefined && session.phoneNormalized !== where.phoneNormalized) return false;
        return true;
      }) || null,
      create: async ({ data }: any) => {
        const session = { id: `session-${sessions.length + 1}`, ...data };
        sessions.push(session);
        return session;
      },
      update: async ({ where, data }: any) => {
        const session = sessions.find((item) => String(item.id) === String(where.id));
        if (!session) return null;
        Object.assign(session, data);
        return session;
      },
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

function createSessionPrisma(company = createCompany(), initialSessions: any[] = []) {
  const sessions = initialSessions.map((session) => ({ ...session }));
  const companyUpdates: any[] = [];
  const prisma = createPrisma(company);
  prisma.company.update = async ({ data }: any) => {
    companyUpdates.push(data);
    Object.assign(company, data);
    return { ...company };
  };
  prisma.whatsAppConnectionSession.findFirst = async ({ where }: any) => sessions.find((session) => {
    if (where?.companyId !== undefined && Number(session.companyId) !== Number(where.companyId)) return false;
    if (where?.provider !== undefined && session.provider !== where.provider) return false;
    if (where?.tenantKey !== undefined && session.tenantKey !== where.tenantKey) return false;
    if (where?.status !== undefined && session.status !== where.status) return false;
    if (where?.phoneNormalized !== undefined && session.phoneNormalized !== where.phoneNormalized) return false;
    return true;
  }) || null;
  prisma.whatsAppConnectionSession.create = async ({ data }: any) => {
    const session = { id: `session-${sessions.length + 1}`, ...data };
    sessions.push(session);
    return { id: session.id };
  };
  prisma.whatsAppConnectionSession.update = async ({ where, data }: any) => {
    const session = sessions.find((item) => String(item.id) === String(where.id));
    if (!session) return null;
    Object.assign(session, data);
    return { id: session.id };
  };
  prisma.whatsAppConnectionSession.updateMany = async ({ where, data }: any) => {
    let count = 0;
    for (const session of sessions) {
      if (where?.companyId !== undefined && Number(session.companyId) !== Number(where.companyId)) continue;
      if (where?.provider !== undefined && session.provider !== where.provider) continue;
      if (where?.tenantKey !== undefined && session.tenantKey !== where.tenantKey) continue;
      if (where?.status !== undefined && session.status !== where.status) continue;
      if (where?.NOT?.id !== undefined && String(session.id) === String(where.NOT.id)) continue;
      Object.assign(session, data);
      count += 1;
    }
    return { count };
  };
  return { prisma, sessions, companyUpdates, company };
}

function createSnapshot(overrides: Record<string, any> = {}) {
  return {
    status: 'connected',
    phone: '+5519999999999',
    connectedAt: new Date('2026-05-09T12:00:00.000Z'),
    lastError: null,
    updatedAt: new Date('2026-05-09T12:00:01.000Z'),
    provider: 'external_modal',
    qrCodeDataUrl: null,
    rawStatus: 'CONNECTED',
    ...overrides,
  };
}

test('pairing-code rejeita telefone invalido', async () => {
  const service = createService();

  await assert.rejects(
    () => service.requestPairingCode(7, 'company-7', 'abc'),
    BadRequestException,
  );
});

test('snapshot connected cria WhatsAppConnectionSession e aponta Company.currentWhatsappConnectionSessionId', async () => {
  const company = createCompany({ whatsappModalStatus: 'DISCONNECTED' });
  const { prisma, sessions, companyUpdates } = createSessionPrisma(company);
  const service = new WhatsAppModalService(prisma) as any;

  await service.persistSnapshot(company, createSnapshot(), 'test_connected');

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].provider, 'webwhats');
  assert.equal(sessions[0].tenantKey, 'company-7');
  assert.equal(sessions[0].status, 'active');
  assert.equal(sessions[0].phoneNormalized, '5519999999999');
  assert.equal(companyUpdates.at(-1).currentWhatsappConnectionSessionId, sessions[0].id);
});

test('snapshot connected reutiliza sessao existente em vez de duplicar', async () => {
  const connectedAt = new Date('2026-05-09T10:00:00.000Z');
  const company = createCompany({ whatsappModalStatus: 'DISCONNECTED' });
  const { prisma, sessions, companyUpdates } = createSessionPrisma(company, [
    {
      id: 'session-existing',
      companyId: 7,
      provider: 'webwhats',
      tenantKey: 'company-7',
      phoneNormalized: null,
      displayPhone: null,
      status: 'active',
      connectedAt,
      createdAt: connectedAt,
    },
  ]);
  const service = new WhatsAppModalService(prisma) as any;

  await service.persistSnapshot(company, createSnapshot(), 'test_reuse');

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, 'session-existing');
  assert.equal(sessions[0].phoneNormalized, '5519999999999');
  assert.equal(companyUpdates.at(-1).currentWhatsappConnectionSessionId, 'session-existing');
});

test('snapshot connected cria sessao mesmo sem whatsappModalPhone', async () => {
  const company = createCompany({ whatsappModalStatus: 'DISCONNECTED', whatsappModalPhone: null });
  const { prisma, sessions, companyUpdates } = createSessionPrisma(company);
  const service = new WhatsAppModalService(prisma) as any;

  await service.persistSnapshot(company, createSnapshot({ phone: null }), 'test_connected_without_phone');

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].tenantKey, 'company-7');
  assert.equal(sessions[0].phoneNormalized, null);
  assert.equal(sessions[0].displayPhone, null);
  assert.equal(companyUpdates.at(-1).currentWhatsappConnectionSessionId, sessions[0].id);
});

test('snapshot disconnected marca sessao ativa como disconnected e limpa currentWhatsappConnectionSessionId', async () => {
  const company = createCompany({
    whatsappModalStatus: 'CONNECTED',
    currentWhatsappConnectionSessionId: 'session-active',
  });
  const { prisma, sessions, companyUpdates } = createSessionPrisma(company, [
    {
      id: 'session-active',
      companyId: 7,
      provider: 'webwhats',
      tenantKey: 'company-7',
      phoneNormalized: '5519999999999',
      displayPhone: '+5519999999999',
      status: 'active',
      connectedAt: new Date('2026-05-09T10:00:00.000Z'),
      createdAt: new Date('2026-05-09T10:00:00.000Z'),
    },
  ]);
  const service = new WhatsAppModalService(prisma) as any;

  await service.persistSnapshot(company, createSnapshot({ status: 'disconnected', connectedAt: null }), 'test_disconnected');

  assert.equal(sessions[0].status, 'disconnected');
  assert.ok(sessions[0].disconnectedAt instanceof Date);
  assert.equal(companyUpdates.at(-1).currentWhatsappConnectionSessionId, null);
});

test('snapshot reconnecting nao limpa sessao ativa', async () => {
  const company = createCompany({
    whatsappModalStatus: 'CONNECTED',
    currentWhatsappConnectionSessionId: 'session-active',
  });
  const { prisma, sessions, companyUpdates } = createSessionPrisma(company, [
    {
      id: 'session-active',
      companyId: 7,
      provider: 'webwhats',
      tenantKey: 'company-7',
      phoneNormalized: '5519999999999',
      displayPhone: '+5519999999999',
      status: 'active',
      connectedAt: new Date('2026-05-09T10:00:00.000Z'),
      createdAt: new Date('2026-05-09T10:00:00.000Z'),
    },
  ]);
  const service = new WhatsAppModalService(prisma) as any;

  await service.persistSnapshot(company, createSnapshot({ status: 'reconnecting' }), 'test_reconnecting');

  assert.equal(sessions[0].status, 'active');
  assert.equal(companyUpdates.at(-1).currentWhatsappConnectionSessionId, 'session-active');
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

test('pairing-code limpa instancia antes de criar com number', async () => {
  const paths: string[] = [];
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
    paths.push(path);
    if (String(path).includes('connectionState')) return { state: 'DISCONNECTED' };
    if (String(purpose).includes('criacao')) {
      createPayloads.push(data);
      return { qrcode: { pairingCode: 'JKLM-9999' } };
    }
    if (String(path).includes('/instance/connect/')) {
      return { ok: true };
    }
    return { ok: true };
  };
  service.tryConfigureProviderWebhook = async () => null;

  const response = await service.requestPairingCode(7, 'company-7', '+5519999999999');

  assert.equal(response.success, true);
  assert.equal(response.code, 'JKLM-9999');
  assert.ok(paths.includes('/instance/delete/company-7'));
  assert.equal(createPayloads.length, 1);
  assert.equal(createPayloads[0].number, '5519999999999');
  assert.ok(paths.indexOf('/instance/delete/company-7') < paths.indexOf('/instance/create'));
  assert.equal(paths.includes('/instance/logout/company-7'), false);
});

test('pairing-code aguarda e recria se create responder instancia existente', async () => {
  const paths: string[] = [];
  let createAttempts = 0;
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
    if (String(purpose).includes('criacao')) {
      createAttempts += 1;
      if (createAttempts <= 2) {
        throw new Error('Forbidden: instance already in use');
      }
      return { response: { qrcode: { pairingCode: 'RSTU-2222' } } };
    }
    return { ok: true };
  };
  service.tryConfigureProviderWebhook = async () => null;

  const response = await service.requestPairingCode(7, 'company-7', '+5519999999999');

  assert.equal(response.success, true);
  assert.equal(response.code, 'RSTU-2222');
  assert.equal(createAttempts, 3);
  assert.equal(paths.filter((path) => path === '/instance/delete/company-7').length, 3);
  assert.equal(paths.includes('/instance/logout/company-7'), false);
});

test('pairing reset ignora logout 400 quando instancia nao esta conectada e continua delete', async () => {
  const paths: string[] = [];
  const service = createService() as any;
  service.requestProvider = async ({ purpose, path }: any) => {
    paths.push(path);
    if (String(purpose).includes('logout')) {
      throw service.buildProviderErrorFromResponse(
        {
          status: 400,
          data: {
            status: 400,
            error: 'Bad Request',
            response: { message: ['The "company-7" instance is not connected'] },
          },
          config: { url: 'http://provider.local/instance/logout/company-7' },
        },
        'logout da instancia',
        '/instance/logout/company-7',
      );
    }
    return { ok: true };
  };

  await service.resetProviderInstanceForPairing('company-7', 'connected');

  assert.deepEqual(paths, [
    '/instance/logout/company-7',
    '/instance/delete/company-7',
  ]);
});

test('pairing-code sem codigo nao ativa rate limit da proxima tentativa', async () => {
  const service = createService(createCompany(), { ok: true });

  const first = await service.requestPairingCode(7, 'company-7', '+5519999999999');
  const second = await service.requestPairingCode(7, 'company-7', '+5519999999999');

  assert.equal(first.success, false);
  assert.equal(second.success, false);
  assert.equal(second.errorCode, 'WHATSAPP_MODAL_PAIRING_CODE_EMPTY');
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

test('provider 403 de instancia existente nao vira erro de API key', () => {
  const service = createService() as any;

  const error = service.buildProviderErrorFromResponse(
    {
      status: 403,
      data: { message: 'Forbidden: instance already in use' },
      config: { url: 'http://provider.local/instance/create' },
    },
    'criacao da instancia',
    '/instance/create',
  );

  assert.equal(error.code, 'WHATSAPP_MODAL_HTTP_ERROR');
  assert.match(error.message, /já existe|em uso/i);
  assert.doesNotMatch(error.message, /WHATSAPP_MODAL_API_KEY/i);
  assert.equal(service.isExistingInstanceError(error), true);
});

test('provider 403 autentico ainda aponta API key', () => {
  const service = createService() as any;

  const error = service.buildProviderErrorFromResponse(
    {
      status: 403,
      data: { message: 'invalid apikey' },
      config: { url: 'http://provider.local/instance/create' },
    },
    'criacao da instancia',
    '/instance/create',
  );

  assert.equal(error.code, 'WHATSAPP_MODAL_NOT_CONFIGURED');
  assert.match(error.message, /WHATSAPP_MODAL_API_KEY/);
});

test('status preserva sessao conectada como reconectando em erro transitorio do Webwhats', async () => {
  const updates: any[] = [];
  const now = new Date();
  const company = createCompany({
    whatsappModalStatus: 'CONNECTED',
    whatsappModalPhone: '5519999999999',
    whatsappModalConnectedAt: now,
    whatsappModalUpdatedAt: now,
    currentWhatsappConnectionSessionId: 'session-1',
  });
  const prisma = createPrisma(company);
  prisma.company.update = async ({ data }: any) => {
    updates.push(data);
    return { ...company, ...data };
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
  service.requestProvider = async ({ path }: any) => {
    if (String(path).includes('connectionState')) {
      throw new Error('connect ECONNREFUSED 172.18.0.1:8080');
    }
    return { ok: true };
  };

  const response = await service.getCompanyStatus(7);

  assert.equal(response.success, true);
  assert.equal(response.status, 'reconnecting');
  assert.equal(response.data.phone, '5519999999999');
  const lastUpdate = updates[updates.length - 1];
  assert.equal(lastUpdate.whatsappModalStatus, 'RECONNECTING');
  assert.equal(lastUpdate.currentWhatsappConnectionSessionId, 'session-1');
});

test('live health fica healthy apenas com provider vivo e inbound recente', async () => {
  const now = new Date();
  const updates: any[] = [];
  const company = createCompany({
    whatsappModalStatus: 'CONNECTED',
    whatsappModalPhone: '5519999999999',
    whatsappModalConnectedAt: now,
    whatsappModalUpdatedAt: now,
    currentWhatsappConnectionSessionId: 'session-1',
  });
  const prisma = createPrisma(company, { inboundAt: now, outboundAt: now });
  prisma.company.update = async ({ data }: any) => {
    updates.push(data);
    return { ...company, ...data };
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
  service.requestProvider = async ({ path }: any) => {
    if (String(path).includes('connectionState')) {
      return { state: 'CONNECTED', number: '5519999999999' };
    }
    return { ok: true };
  };

  const response = await service.getCompanyLiveHealth(7, { forceRefresh: true });

  assert.equal(response.status, 'healthy');
  assert.equal(response.liveConfirmed, true);
  assert.equal(response.connected, true);
  assert.equal(response.providerReachable, true);
  assert.equal(response.recommendedAction, 'none');
  assert.equal(updates[updates.length - 1].whatsappModalStatus, 'CONNECTED');
});

test('live health retorna reconectando quando provider nao responde e status salvo era conectado', async () => {
  const now = new Date();
  const updates: any[] = [];
  const company = createCompany({
    whatsappModalStatus: 'CONNECTED',
    whatsappModalPhone: '5519999999999',
    whatsappModalConnectedAt: now,
    whatsappModalUpdatedAt: now,
    currentWhatsappConnectionSessionId: 'session-1',
  });
  const prisma = createPrisma(company, { inboundAt: now });
  prisma.company.update = async ({ data }: any) => {
    updates.push(data);
    return { ...company, ...data };
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
  service.requestProvider = async ({ path }: any) => {
    if (String(path).includes('connectionState')) {
      throw new Error('connect ECONNREFUSED 172.18.0.1:8080');
    }
    return { ok: true };
  };

  const response = await service.getCompanyLiveHealth(7, { forceRefresh: true });

  assert.equal(response.status, 'reconnecting');
  assert.equal(response.liveConfirmed, false);
  assert.equal(response.providerReachable, false);
  assert.equal(response.recommendedAction, 'refresh');
  assert.match(response.reason, /Status salvo dizia conectado/i);
  assert.equal(updates[updates.length - 1].whatsappModalStatus, 'RECONNECTING');
});

test('live health rebaixa status salvo quando provider confirma desconectado', async () => {
  const oldStatusDate = new Date(Date.now() - 10 * 60 * 1000);
  const updates: any[] = [];
  const company = createCompany({
    whatsappModalStatus: 'CONNECTED',
    whatsappModalPhone: '5519999999999',
    whatsappModalConnectedAt: oldStatusDate,
    whatsappModalUpdatedAt: oldStatusDate,
    currentWhatsappConnectionSessionId: 'session-1',
  });
  const prisma = createPrisma(company, { inboundAt: oldStatusDate });
  prisma.company.update = async ({ data }: any) => {
    updates.push(data);
    return { ...company, ...data };
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
  service.requestProvider = async ({ path }: any) => {
    if (String(path).includes('connectionState')) {
      return { state: 'DISCONNECTED' };
    }
    return { ok: true };
  };

  const response = await service.getCompanyLiveHealth(7, { forceRefresh: true });

  assert.equal(response.status, 'disconnected');
  assert.equal(response.liveConfirmed, false);
  assert.equal(response.connected, false);
  assert.equal(response.providerReachable, true);
  assert.equal(response.recommendedAction, 'open_qr');
  assert.equal(updates[updates.length - 1].whatsappModalStatus, 'DISCONNECTED');
});

test('live health nao preserva reconectando quando provider confirma desconectado dentro da janela de grace', async () => {
  const now = new Date();
  const updates: any[] = [];
  const company = createCompany({
    whatsappModalStatus: 'CONNECTED',
    whatsappModalPhone: '5519999999999',
    whatsappModalConnectedAt: now,
    whatsappModalUpdatedAt: now,
    currentWhatsappConnectionSessionId: 'session-1',
  });
  const prisma = createPrisma(company, { inboundAt: now });
  prisma.company.update = async ({ data }: any) => {
    updates.push(data);
    return { ...company, ...data };
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
  service.requestProvider = async ({ path }: any) => {
    if (String(path).includes('connectionState')) {
      return { state: 'DISCONNECTED' };
    }
    return { ok: true };
  };

  const response = await service.getCompanyLiveHealth(7, { forceRefresh: true });

  assert.equal(response.status, 'disconnected');
  assert.equal(response.connected, false);
  assert.equal(response.liveConfirmed, false);
  assert.equal(response.recommendedAction, 'open_qr');
  assert.equal(updates[updates.length - 1].whatsappModalStatus, 'DISCONNECTED');
  assert.equal(updates[updates.length - 1].currentWhatsappConnectionSessionId, null);
});
