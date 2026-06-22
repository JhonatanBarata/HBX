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
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
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
    companyConversation: { deleteMany: async () => ({ count: 0 }) },
    $transaction: async (fn: (tx: any) => Promise<void>) => fn({
      companyMessage: { deleteMany: async () => ({ count: 0 }) },
      companyConversation: { deleteMany: async () => ({ count: 0 }) },
      whatsAppConnectionSession: { deleteMany: async () => ({ count: 0 }) },
    }),
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

function sessionMatchesWhere(session: any, where: any): boolean {
  if (where?.companyId !== undefined && Number(session.companyId) !== Number(where.companyId)) return false;
  if (where?.provider !== undefined && session.provider !== where.provider) return false;
  if (where?.tenantKey !== undefined && session.tenantKey !== where.tenantKey) return false;
  if (where?.status !== undefined && session.status !== where.status) return false;
  if (where?.phoneNormalized !== undefined && session.phoneNormalized !== where.phoneNormalized) return false;
  if (where?.NOT?.tenantKey !== undefined && session.tenantKey === where.NOT.tenantKey) return false;
  if (where?.NOT?.id !== undefined && String(session.id) === String(where.NOT.id)) return false;
  if (where?.id?.in !== undefined && !where.id.in.includes(String(session.id))) return false;
  return true;
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
  prisma.whatsAppConnectionSession.findFirst = async ({ where }: any) =>
    sessions.find((s) => sessionMatchesWhere(s, where)) || null;
  prisma.whatsAppConnectionSession.findMany = async ({ where }: any) =>
    sessions.filter((s) => sessionMatchesWhere(s, where));
  prisma.whatsAppConnectionSession.deleteMany = async ({ where }: any) => {
    const toRemove = sessions.filter((s) => sessionMatchesWhere(s, where));
    for (const s of toRemove) sessions.splice(sessions.indexOf(s), 1);
    return { count: toRemove.length };
  };
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
      if (!sessionMatchesWhere(session, where)) continue;
      Object.assign(session, data);
      count += 1;
    }
    return { count };
  };
  // companyConversation/companyMessage stubs (needed by purgeForeignNumberGhosts)
  (prisma as any).companyConversation = { deleteMany: async () => ({ count: 0 }) };
  (prisma as any).companyMessage = { ...(prisma as any).companyMessage, deleteMany: async () => ({ count: 0 }) };
  // $transaction: executa o callback passando o mesmo prisma como tx (testes locais)
  (prisma as any).$transaction = async (fn: (tx: any) => Promise<void>) => fn(prisma);
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

test('pairing-code no trial HBX Lead Plus exige o telefone informado na ativacao', async () => {
  // Pos-DROP: trial e o estado unico persistido (status='trial' + data).
  const service = createService(createCompany({
    status: 'trial',
    trialEndsAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    isActive: true,
    selectedPlanKey: 'hbx_padrao',
    contactPhone: '19997024884',
  }));

  await assert.rejects(
    () => service.requestPairingCode(7, 'company-7', '+5519999999999'),
    (error: any) => {
      assert.ok(error instanceof BadRequestException);
      const response = error.getResponse() as { code?: string };
      assert.equal(response.code, 'TRIAL_WHATSAPP_PHONE_LOCKED');
      return true;
    },
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

test('snapshot connected com número DIFERENTE cria sessão NOVA (não relabela a anterior)', async () => {
  // O CASO DO DONO: trocou de chip e carregava os chats do anterior. Agora número novo
  // = sessão nova; a anterior vira disconnected e MANTÉM o próprio número (sem relabel).
  const connectedAt = new Date('2026-05-09T10:00:00.000Z');
  const company = createCompany({ whatsappModalStatus: 'CONNECTED', currentWhatsappConnectionSessionId: 'session-old' });
  const { prisma, sessions, companyUpdates } = createSessionPrisma(company, [
    {
      id: 'session-old',
      companyId: 7,
      provider: 'webwhats',
      tenantKey: 'company-7',
      phoneNormalized: '5519998877766',
      displayPhone: '+5519998877766',
      status: 'active',
      connectedAt,
      createdAt: connectedAt,
    },
  ]);
  const service = new WhatsAppModalService(prisma) as any;

  await service.persistSnapshot(company, createSnapshot({ phone: '+5519920121720' }), 'test_new_number');

  assert.equal(sessions.length, 2);
  const old = sessions.find((s) => s.id === 'session-old');
  const fresh = sessions.find((s) => s.id !== 'session-old');
  assert.equal(old.phoneNormalized, '5519998877766');
  assert.equal(old.status, 'disconnected');
  assert.equal(fresh.phoneNormalized, '5519920121720');
  assert.equal(fresh.status, 'active');
  assert.equal(companyUpdates.at(-1).currentWhatsappConnectionSessionId, fresh.id);
});

test('snapshot connected do MESMO número reativa a sessão dele (preserva histórico no reconnect)', async () => {
  const connectedAt = new Date('2026-05-09T10:00:00.000Z');
  const company = createCompany({ whatsappModalStatus: 'DISCONNECTED', currentWhatsappConnectionSessionId: null });
  const { prisma, sessions, companyUpdates } = createSessionPrisma(company, [
    {
      id: 'session-mine',
      companyId: 7,
      provider: 'webwhats',
      tenantKey: 'company-7',
      phoneNormalized: '5519999999999',
      displayPhone: '+5519999999999',
      status: 'disconnected',
      connectedAt,
      createdAt: connectedAt,
    },
  ]);
  const service = new WhatsAppModalService(prisma) as any;

  await service.persistSnapshot(company, createSnapshot(), 'test_same_number_reconnect');

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, 'session-mine');
  assert.equal(sessions[0].status, 'active');
  assert.equal(companyUpdates.at(-1).currentWhatsappConnectionSessionId, 'session-mine');
});

test('persistSnapshot NÃO bloqueia número já ativo em outra empresa (regra 1 número = 1 empresa REMOVIDA)', async () => {
  // Decisão do dono 18/06: WhatsApp é POR USUÁRIO; a regra "1 número = 1 empresa/usuário"
  // foi removida de vez — ela fazia logout+DELETE da instância (wipe) que quebrava o envio
  // ("recebe mas não envia"). company-7 conecta um número já ativo na company 99 → NÃO
  // recusa, NÃO derruba o chip; cria a própria sessão normalmente.
  const company = createCompany({ whatsappModalStatus: 'DISCONNECTED' });
  const { prisma, sessions, companyUpdates } = createSessionPrisma(company, [
    {
      id: 'session-outra',
      companyId: 99,
      provider: 'webwhats',
      tenantKey: 'company-99',
      phoneNormalized: '5519999999999',
      displayPhone: '+5519999999999',
      status: 'active',
      connectedAt: new Date('2026-05-09T10:00:00.000Z'),
      createdAt: new Date('2026-05-09T10:00:00.000Z'),
    },
  ]);
  const service = new WhatsAppModalService(prisma) as any;
  const providerPaths: string[] = [];
  service.requestProvider = async ({ path }: any) => {
    providerPaths.push(path);
    return {};
  };

  // Não lança mais — a regra de bloqueio foi removida.
  await service.persistSnapshot(company, createSnapshot(), 'test_cross_company');

  // NÃO derrubou o chip da company-7 (sem logout/delete pós-bloqueio).
  assert.equal(providerPaths.includes('/instance/logout/company-7'), false);
  assert.equal(providerPaths.includes('/instance/delete/company-7'), false);
  // Criou a sessão da company-7 normalmente; status NÃO virou ERROR.
  assert.equal(sessions.some((s) => Number(s.companyId) === 7), true);
  assert.notEqual(companyUpdates.at(-1).whatsappModalStatus, 'ERROR');
  // A sessão da outra empresa permanece intacta.
  assert.equal(sessions.find((s) => s.id === 'session-outra').status, 'active');
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

test('pairing-code e por-vendedor: roteia pra company-{id}-user-{userId}, nao pra instancia da empresa', async () => {
  // Regressao do bug do Codigo (22/06): a empresa tem uma sessao company-level ATIVA (ex.: admin
  // conectado). Antes do fix, requestPairingCode resolvia ESSA chave operacional e o fetchLiveSnapshot
  // a via "connected" -> recusava com "WhatsApp ja esta conectado nesta sessao", mesmo o numero do
  // vendedor nunca tendo conectado (o QR ja era per-user; so o Codigo tinha ficado company-level).
  const company = createCompany({
    currentWhatsappConnectionSessionId: 'admin-session',
    currentWhatsappConnectionSession: {
      id: 'admin-session',
      provider: 'webwhats',
      tenantKey: 'company-7-user-1',
      status: 'active',
    },
  });
  const service = createService(company, { code: 'WXYZ-1234' });

  // userId=99 (vendedora). user master so pra pular o gate de conexao (gate tem teste proprio).
  const response = await service.requestPairingCode(7, 'company-7', '+5519999999999', 99, { isSystemMaster: true });

  assert.equal(response.success, true);
  assert.equal(response.code, 'WXYZ-1234');
  // sessionId = tenantKey usado no motor: tem que ser o do VENDEDOR, nao o da empresa/admin.
  assert.equal(response.sessionId, 'company-7-user-99');
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

// ─────────────────────────────────────────────────────────────────────────────
// STATUS HONESTO (Trilha 1 — Fundação de confiança)
// Prova: getCompanyStatus com userId NÃO retorna 'connected' quando a sessão
// do usuário está disconnected — mesmo que company.whatsappModalStatus ainda
// esteja CONNECTED (persistSnapshot com userId não atualiza esse campo).
// ─────────────────────────────────────────────────────────────────────────────

test('getCompanyStatus com userId retorna disconnected quando sessao esta disconnected (nao confia em whatsappModalStatus)', async () => {
  // Cenário real: persistSnapshot com userId não sobrescreve whatsappModalStatus.
  // O campo da empresa ainda diz CONNECTED, mas a sessão do user virou disconnected.
  // O motor nunca deve ser consultado — a sessão é a fonte de verdade.
  const motorCalls: string[] = [];
  const company = createCompany({
    whatsappModalStatus: 'CONNECTED',         // campo legado — ainda diz conectado
    whatsappModalPhone: '5519999999999',
    whatsappModalConnectedAt: new Date(),
    whatsappModalUpdatedAt: new Date(),
    currentWhatsappConnectionSessionId: null, // limpo pelo disconnect
  });
  const session = {
    id: 'session-user-36',
    companyId: 7,
    provider: 'webwhats',
    tenantKey: 'company-7-user-36',
    status: 'disconnected',                  // sessão do vendedor: já desconectada
    displayPhone: '+5519999999999',
    connectedAt: new Date(Date.now() - 60000),
    updatedAt: new Date(),
  };
  const prisma = createPrisma(company);
  prisma.whatsAppConnectionSession.findFirst = async ({ where }: any) => {
    if (where?.tenantKey === 'company-7-user-36') return session;
    return null;
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
    motorCalls.push(String(path));
    // Motor reporta instância ainda existe e conectada (delete falhou silenciosamente)
    return { instance: { state: 'open', number: '5519999999999' } };
  };

  const response = await service.getCompanyStatus(7, 36 /* userId */);

  assert.notEqual(response.status, 'connected', 'pill NAO pode dizer connected quando sessao esta disconnected');
  assert.ok(
    response.status === 'disconnected' || response.status === 'offline',
    `status deve ser disconnected ou offline, got: ${response.status}`,
  );
  assert.equal(motorCalls.length, 0, 'motor NAO deve ser consultado quando sessao esta disconnected');
});

test('getCompanyStatus com userId retorna offline quando nao ha sessao para o usuario', async () => {
  const motorCalls: string[] = [];
  const company = createCompany({
    whatsappModalStatus: 'CONNECTED', // estado da empresa ignorado para o user
    whatsappModalPhone: '5519999999999',
    whatsappModalConnectedAt: new Date(),
    whatsappModalUpdatedAt: new Date(),
    currentWhatsappConnectionSessionId: 'session-outro-user',
  });
  const prisma = createPrisma(company);
  // Nenhuma sessão para user-99
  prisma.whatsAppConnectionSession.findFirst = async () => null;
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
    motorCalls.push(String(path));
    return { instance: { state: 'open', number: '5519999999999' } };
  };

  const response = await service.getCompanyStatus(7, 99 /* userId sem sessão */);

  assert.notEqual(response.status, 'connected', 'sem sessao propria, usuario NAO e conectado');
  assert.ok(
    response.status === 'offline' || response.status === 'disconnected',
    `status deve ser offline, got: ${response.status}`,
  );
  assert.equal(motorCalls.length, 0, 'motor NAO consultado para usuario sem sessao');
});

test('getCompanyStatus com userId consulta o motor quando sessao esta active (nao retorna offline sem verificar)', async () => {
  // Caminho feliz: sessão ativa → motor DEVE ser consultado (ao contrário do
  // caso disconnected/offline, onde a consulta ao motor é suprimida).
  const motorCalls: string[] = [];
  const company = createCompany({
    whatsappModalStatus: 'CONNECTED',
    whatsappModalPhone: '5519999999999',
    whatsappModalConnectedAt: new Date(),
    whatsappModalUpdatedAt: new Date(),
    currentWhatsappConnectionSessionId: 'session-user-36',
  });
  const session = {
    id: 'session-user-36',
    companyId: 7,
    provider: 'webwhats',
    tenantKey: 'company-7-user-36',
    phoneNormalized: '5519999999999',
    displayPhone: '+5519999999999',
    status: 'active',
    connectedAt: new Date(),
    updatedAt: new Date(),
  };
  const { prisma } = createSessionPrisma(company, [session]);
  prisma.whatsAppConnectionSession.findFirst = async ({ where }: any) => {
    if (where?.tenantKey === 'company-7-user-36') return session;
    return null;
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
    motorCalls.push(String(path));
    if (String(path).includes('connectionState')) {
      return { instance: { state: 'open', number: '5519999999999' } };
    }
    return { ok: true };
  };

  const response = await service.getCompanyStatus(7, 36);

  // O motor deve ter sido consultado (sessão ativa = não pulamos a verificação live)
  assert.ok(motorCalls.some(p => p.includes('connectionState')), 'motor deve ser consultado quando sessao ativa');
  // O status retornado não pode ser o campo legado "CONNECTED" sem verificação —
  // pode ser connected (motor confirmou) ou reconnecting (motor inacessível), mas nunca
  // offline/disconnected sem justificativa real.
  assert.notEqual(response.status, 'offline', 'sessao active nao e offline sem razao');
  assert.notEqual(response.status, 'disconnected', 'sessao active nao e disconnected sem razao');
});

// FIX: sessão com wipedAt setado → ao reconciliar connected com phone → wipedAt deve ser null.
// Causa: inbox vazio com sessão conectada. Prova ao vivo 18/06: limpando wipedAt na mão a
// conversa real apareceu (0→1). Repro: trocar de número reusa sessão com wipedAt de contexto
// anterior → bootstrap do syncRecentChats floorava TODOS os chats → inbox vazio.

test('reconcile connected limpa wipedAt da sessao do mesmo numero (reativacao nao herda wipe anterior)', async () => {
  const wipedAt = new Date('2026-06-01T10:00:00.000Z');
  const connectedAt = new Date('2026-06-18T10:00:00.000Z');
  const company = createCompany({ whatsappModalStatus: 'DISCONNECTED', currentWhatsappConnectionSessionId: null });
  const { prisma, sessions, companyUpdates } = createSessionPrisma(company, [
    {
      id: 'session-with-wipe',
      companyId: 7,
      provider: 'webwhats',
      tenantKey: 'company-7',
      phoneNormalized: '5519920121720',
      displayPhone: '+5519920121720',
      status: 'disconnected',
      connectedAt: new Date('2026-05-01T10:00:00.000Z'),
      createdAt: new Date('2026-05-01T10:00:00.000Z'),
      wipedAt,
    },
  ]);
  const service = new WhatsAppModalService(prisma) as any;

  await service.persistSnapshot(
    company,
    createSnapshot({ phone: '+5519920121720', connectedAt }),
    'test_wipedAt_cleared_on_reconnect',
  );

  // Deve reutilizar a sessão existente do mesmo número (não criar nova).
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, 'session-with-wipe');
  assert.equal(sessions[0].status, 'active');
  // wipedAt DEVE ser null — senão o syncRecentChats nasce floorado e o inbox fica vazio.
  assert.equal(sessions[0].wipedAt, null);
  assert.equal(companyUpdates.at(-1).currentWhatsappConnectionSessionId, 'session-with-wipe');
});

test('reconcile connected limpa wipedAt de placeholder sem numero (write-once com wipe antigo)', async () => {
  const wipedAt = new Date('2026-06-01T10:00:00.000Z');
  const company = createCompany({ whatsappModalStatus: 'DISCONNECTED', currentWhatsappConnectionSessionId: null });
  const { prisma, sessions, companyUpdates } = createSessionPrisma(company, [
    {
      id: 'session-placeholder',
      companyId: 7,
      provider: 'webwhats',
      tenantKey: 'company-7',
      phoneNormalized: null,
      displayPhone: null,
      status: 'active',
      connectedAt: new Date('2026-06-18T09:00:00.000Z'),
      createdAt: new Date('2026-06-18T09:00:00.000Z'),
      wipedAt,
    },
  ]);
  const service = new WhatsAppModalService(prisma) as any;

  // Snapshot com número novo chega depois do placeholder ser criado (write-once a partir de null).
  await service.persistSnapshot(
    company,
    createSnapshot({ phone: '+5519920121720' }),
    'test_wipedAt_cleared_on_placeholder_write_once',
  );

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, 'session-placeholder');
  assert.equal(sessions[0].phoneNormalized, '5519920121720');
  assert.equal(sessions[0].wipedAt, null);
  assert.equal(companyUpdates.at(-1).currentWhatsappConnectionSessionId, 'session-placeholder');
});

// ---------------------------------------------------------------------------
// TRAVA 1: purgeForeignNumberGhosts
// ---------------------------------------------------------------------------

test('trava1: conectar número N no tenant T apaga sessão-fantasma de N em outro tenant + suas conversas e mensagens', async () => {
  const company = createCompany({ whatsappModalStatus: 'DISCONNECTED' });
  const { prisma, sessions, companyUpdates } = createSessionPrisma(company, [
    // Sessão fantasma: mesmo número (5519920121720) mas tenantKey de OUTRO usuário
    {
      id: 'session-ghost',
      companyId: 7,
      provider: 'webwhats',
      tenantKey: 'company-7-user-22',
      phoneNormalized: '5519920121720',
      displayPhone: '+5519920121720',
      status: 'disconnected',
      connectedAt: new Date('2026-06-01T10:00:00.000Z'),
      createdAt: new Date('2026-06-01T10:00:00.000Z'),
    },
  ]);

  // Rastreia o que foi deletado
  const deletedMessageWhere: any[] = [];
  const deletedConversationWhere: any[] = [];
  const deletedSessionWhere: any[] = [];

  // Adiciona findMany e deleteMany ao whatsAppConnectionSession
  (prisma as any).whatsAppConnectionSession.findMany = async ({ where }: any) => {
    return sessions.filter((s) => {
      if (where?.companyId !== undefined && Number(s.companyId) !== Number(where.companyId)) return false;
      if (where?.phoneNormalized !== undefined && s.phoneNormalized !== where.phoneNormalized) return false;
      if (where?.NOT?.tenantKey !== undefined && s.tenantKey === where.NOT.tenantKey) return false;
      return true;
    });
  };
  (prisma as any).whatsAppConnectionSession.deleteMany = async ({ where }: any) => {
    deletedSessionWhere.push(where);
    const ids: string[] = where?.id?.in ?? [];
    const removed = sessions.filter((s) => ids.includes(s.id));
    for (const s of removed) sessions.splice(sessions.indexOf(s), 1);
    return { count: removed.length };
  };

  // companyConversation stub
  (prisma as any).companyConversation = {
    deleteMany: async ({ where }: any) => {
      deletedConversationWhere.push(where);
      return { count: 0 };
    },
  };

  // companyMessage stub
  (prisma as any).companyMessage = {
    ...(prisma as any).companyMessage,
    deleteMany: async ({ where }: any) => {
      deletedMessageWhere.push(where);
      return { count: 0 };
    },
  };

  // $transaction: executa o callback passando o mesmo prisma como tx
  (prisma as any).$transaction = async (fn: (tx: any) => Promise<void>) => fn(prisma);

  const service = new WhatsAppModalService(prisma) as any;

  await service.persistSnapshot(
    company,
    createSnapshot({ phone: '+5519920121720' }),
    'test_trava1_purge_ghost',
  );

  // A sessão fantasma (tenantKey diferente, mesmo número) deve ter sido apagada
  assert.equal(sessions.some((s) => s.id === 'session-ghost'), false, 'sessão-fantasma deve ser removida');

  // deleteMany foi chamado com o id da sessão fantasma
  const allDeletedSessionIds = deletedSessionWhere.flatMap((w) => w?.id?.in ?? []);
  assert.ok(allDeletedSessionIds.includes('session-ghost'), 'deleteMany de sessão deve incluir session-ghost');

  // deleteMany de mensagens e conversas foi chamado com o id da sessão fantasma
  const allDeletedMsgIds = deletedMessageWhere.flatMap((w) => w?.whatsappConnectionSessionId?.in ?? []);
  const allDeletedConvIds = deletedConversationWhere.flatMap((w) => w?.whatsappConnectionSessionId?.in ?? []);
  assert.ok(allDeletedMsgIds.includes('session-ghost'), 'deleteMany de mensagens deve incluir session-ghost');
  assert.ok(allDeletedConvIds.includes('session-ghost'), 'deleteMany de conversas deve incluir session-ghost');

  // Uma sessão NOVA foi criada para o tenant atual (company-7)
  const liveSession = sessions.find((s) => s.tenantKey === 'company-7');
  assert.ok(liveSession, 'sessão viva do tenant atual deve existir');
  assert.equal(liveSession.phoneNormalized, '5519920121720');
  assert.equal(liveSession.status, 'active');
  assert.equal(companyUpdates.at(-1).currentWhatsappConnectionSessionId, liveSession.id);
});

test('trava1: NÃO apaga sessão do mesmo tenantKey (mesmo número reconectando = reuso)', async () => {
  const company = createCompany({ whatsappModalStatus: 'DISCONNECTED' });
  const { prisma, sessions } = createSessionPrisma(company, [
    {
      id: 'session-own',
      companyId: 7,
      provider: 'webwhats',
      tenantKey: 'company-7',
      phoneNormalized: '5519999999999',
      displayPhone: '+5519999999999',
      status: 'disconnected',
      connectedAt: new Date('2026-06-01T10:00:00.000Z'),
      createdAt: new Date('2026-06-01T10:00:00.000Z'),
    },
  ]);

  const deletedSessionWhere: any[] = [];

  (prisma as any).whatsAppConnectionSession.findMany = async ({ where }: any) => {
    return sessions.filter((s) => {
      if (where?.companyId !== undefined && Number(s.companyId) !== Number(where.companyId)) return false;
      if (where?.phoneNormalized !== undefined && s.phoneNormalized !== where.phoneNormalized) return false;
      if (where?.NOT?.tenantKey !== undefined && s.tenantKey === where.NOT.tenantKey) return false;
      return true;
    });
  };
  (prisma as any).whatsAppConnectionSession.deleteMany = async ({ where }: any) => {
    deletedSessionWhere.push(where);
    return { count: 0 };
  };
  (prisma as any).companyConversation = { deleteMany: async () => ({ count: 0 }) };
  (prisma as any).companyMessage = { ...(prisma as any).companyMessage, deleteMany: async () => ({ count: 0 }) };
  (prisma as any).$transaction = async (fn: (tx: any) => Promise<void>) => fn(prisma);

  const service = new WhatsAppModalService(prisma) as any;

  await service.persistSnapshot(company, createSnapshot(), 'test_trava1_no_purge_same_tenant');

  // deleteMany de sessão NÃO deve ter sido chamado (sem fantasmas)
  assert.equal(deletedSessionWhere.length, 0, 'não deve apagar sessão do mesmo tenantKey');
  // A sessão própria foi reativada
  assert.equal(sessions[0].id, 'session-own');
  assert.equal(sessions[0].status, 'active');
});

test('trava1: NÃO apaga sessão de OUTRO número (número diferente, mesmo tenant)', async () => {
  const company = createCompany({ whatsappModalStatus: 'DISCONNECTED' });
  const { prisma, sessions } = createSessionPrisma(company, [
    // Sessão de outro número, mesmo tenantKey
    {
      id: 'session-other-number',
      companyId: 7,
      provider: 'webwhats',
      tenantKey: 'company-7-user-5',
      phoneNormalized: '5519888888888',
      displayPhone: '+5519888888888',
      status: 'active',
      connectedAt: new Date('2026-06-01T10:00:00.000Z'),
      createdAt: new Date('2026-06-01T10:00:00.000Z'),
    },
  ]);

  const deletedSessionWhere: any[] = [];

  (prisma as any).whatsAppConnectionSession.findMany = async ({ where }: any) => {
    return sessions.filter((s) => {
      if (where?.companyId !== undefined && Number(s.companyId) !== Number(where.companyId)) return false;
      if (where?.phoneNormalized !== undefined && s.phoneNormalized !== where.phoneNormalized) return false;
      if (where?.NOT?.tenantKey !== undefined && s.tenantKey === where.NOT.tenantKey) return false;
      return true;
    });
  };
  (prisma as any).whatsAppConnectionSession.deleteMany = async ({ where }: any) => {
    deletedSessionWhere.push(where);
    return { count: 0 };
  };
  (prisma as any).companyConversation = { deleteMany: async () => ({ count: 0 }) };
  (prisma as any).companyMessage = { ...(prisma as any).companyMessage, deleteMany: async () => ({ count: 0 }) };
  (prisma as any).$transaction = async (fn: (tx: any) => Promise<void>) => fn(prisma);

  const service = new WhatsAppModalService(prisma) as any;

  // Conecta com número DIFERENTE (5519999999999 != 5519888888888)
  await service.persistSnapshot(company, createSnapshot({ phone: '+5519999999999' }), 'test_trava1_no_purge_other_number');

  // A sessão do outro número (5519888888888) não deve ter sido apagada
  assert.ok(sessions.some((s) => s.id === 'session-other-number'), 'sessão de outro número deve permanecer');
  // deleteMany não foi chamado com session-other-number
  const allDeletedIds = deletedSessionWhere.flatMap((w) => w?.id?.in ?? []);
  assert.equal(allDeletedIds.includes('session-other-number'), false, 'não deve apagar sessão de outro número');
});
