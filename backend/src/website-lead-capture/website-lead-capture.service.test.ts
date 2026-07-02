import test from 'node:test';
import assert from 'node:assert/strict';
import { WebsiteLeadCaptureService } from './website-lead-capture.service';

const SITE_TOKEN = 'abc123deadbeef';
const COMPANY_ID = 42;
const ADMIN_USER_ID = 7;

function buildService(overrides?: {
  companyIdByToken?: number | null;
  adminUser?: { id: number } | null;
  wasProcessed?: boolean;
  intakeCalls?: any[];
  recordReceivedCalls?: any[];
}) {
  const intakeCalls = overrides?.intakeCalls ?? [];
  const recordReceivedCalls = overrides?.recordReceivedCalls ?? [];
  const markProcessedCalls: any[] = [];

  const prisma: any = {
    $queryRaw: async (strings: any, ...values: any[]) => {
      // Simula getCompanyIdByCaptureToken (SELECT "companyId" ... WHERE "websiteCaptureToken" = token).
      const companyId = overrides?.companyIdByToken;
      if (companyId === null || companyId === undefined) return [];
      return [{ companyId }];
    },
    $executeRawUnsafe: async () => undefined,
    user: {
      findFirst: async () => (overrides?.adminUser === undefined ? { id: ADMIN_USER_ID } : overrides.adminUser),
    },
  };

  const webhookLedger: any = {
    wasProcessed: async () => Boolean(overrides?.wasProcessed),
    recordReceived: async (...args: any[]) => {
      recordReceivedCalls.push(args);
      return null;
    },
    markProcessed: async (...args: any[]) => {
      markProcessedCalls.push(args);
      return null;
    },
  };

  const vendas: any = {
    intakeAdvertisingLead: async (input: any) => {
      intakeCalls.push(input);
      return { leadId: 'lead-1', action: 'created', reusedExisting: false };
    },
  };

  const webwhatsBridge: any = {
    hasOperationalSession: async () => false,
  };

  const service = new WebsiteLeadCaptureService(prisma, webhookLedger, vendas, webwhatsBridge);
  return { service, intakeCalls, recordReceivedCalls, markProcessedCalls };
}

test('captureLead descarta silenciosamente quando o honeypot vem preenchido', async () => {
  const { service, intakeCalls } = buildService({ companyIdByToken: COMPANY_ID });
  const result = await service.captureLead(
    { siteToken: SITE_TOKEN, name: 'Bot', phone: '11999998888', _hp: 'preenchido-por-bot' },
    '1.2.3.4',
  );
  assert.equal(result.ok, true);
  assert.equal(intakeCalls.length, 0);
});

test('captureLead nao cria lead quando o siteToken nao resolve empresa', async () => {
  const { service, intakeCalls } = buildService({ companyIdByToken: null });
  const result = await service.captureLead(
    { siteToken: 'token-invalido', phone: '11999998888' },
    '1.2.3.4',
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not_found');
  assert.equal(intakeCalls.length, 0);
});

test('captureLead rejeita quando nao ha phone nem email', async () => {
  const { service, intakeCalls } = buildService({ companyIdByToken: COMPANY_ID });
  const result = await service.captureLead(
    { siteToken: SITE_TOKEN, name: 'Fulano', message: 'Quero orcamento' },
    '1.2.3.4',
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'nothing_to_contact');
  assert.equal(intakeCalls.length, 0);
});

test('captureLead caminho feliz chama intakeAdvertisingLead com source site_form e temperatura quente', async () => {
  const { service, intakeCalls, recordReceivedCalls } = buildService({ companyIdByToken: COMPANY_ID });
  const result = await service.captureLead(
    {
      siteToken: SITE_TOKEN,
      name: 'Maria Cliente',
      phone: '(11) 99999-8888',
      email: 'maria@exemplo.com',
      message: 'Preciso de um orcamento urgente',
    },
    '1.2.3.4',
  );

  assert.equal(result.ok, true);
  assert.equal(intakeCalls.length, 1);
  const call = intakeCalls[0];
  assert.equal(call.companyId, COMPANY_ID);
  assert.equal(call.assignedUserId, ADMIN_USER_ID);
  assert.equal(call.name, 'Maria Cliente');
  assert.equal(call.phone, '11999998888');
  assert.equal(call.email, 'maria@exemplo.com');
  assert.equal(call.source, 'website_form');
  assert.equal(call.temperature, 'quente');
  assert.match(call.shortNote, /Lead do site/);
  assert.match(call.shortNote, /Preciso de um orcamento urgente/);
  assert.equal(recordReceivedCalls.length, 1);
});

test('captureLead dedup: segundo POST identico nao cria um segundo lead', async () => {
  const { service, intakeCalls } = buildService({ companyIdByToken: COMPANY_ID, wasProcessed: true });
  const result = await service.captureLead(
    { siteToken: SITE_TOKEN, phone: '11999998888', email: 'maria@exemplo.com' },
    '1.2.3.4',
  );
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'duplicate');
  assert.equal(intakeCalls.length, 0);
});

test('captureLead sem ADMIN ativo na empresa nao cria lead (sem responsavel)', async () => {
  const { service, intakeCalls } = buildService({ companyIdByToken: COMPANY_ID, adminUser: null });
  const result = await service.captureLead(
    { siteToken: SITE_TOKEN, phone: '11999998888' },
    '1.2.3.4',
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no_assignee');
  assert.equal(intakeCalls.length, 0);
});
