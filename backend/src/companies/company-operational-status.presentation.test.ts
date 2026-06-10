import test from 'node:test';
import assert from 'node:assert/strict';
import {
  presentOperationalStatusForRole,
  type CompanyOperationalStatus,
  type OperationalStatusChip,
} from './company-operational-status.service';

function chip(partial: Partial<OperationalStatusChip> & { key: OperationalStatusChip['key'] }): OperationalStatusChip {
  return {
    label: partial.key,
    shortLabel: partial.key,
    tone: 'green',
    value: 'Ativo',
    detail: 'detalhe',
    hint: 'hint',
    href: '/dashboard/whatsapp',
    quality: 'real',
    source: [],
    updatedAt: null,
    active: true,
    ...partial,
  } as OperationalStatusChip;
}

function buildStatus(overrides: Partial<CompanyOperationalStatus> = {}): CompanyOperationalStatus {
  return {
    companyId: 77,
    companyName: 'Cliente A',
    statuses: [
      chip({ key: 'token' }),
      chip({ key: 'meta' }),
      chip({ key: 'webwhats', active: false, tone: 'red', value: 'Off' }),
      chip({
        key: 'payment',
        tone: 'red',
        value: 'Falha',
        detail: 'Falha ao validar o token de pagamento.',
        hint: 'Pagamento com falha.',
        href: '/dashboard/financeiro?focus=preferences',
        active: false,
      }),
      chip({
        key: 'access',
        tone: 'yellow',
        value: 'Trial 3d',
        detail: 'Free trial ativo com 3 dia(s) restante(s).',
        hint: 'Trial com 3 dia(s).',
        href: '/dashboard/financeiro?focus=access',
      }),
    ],
    tokenActive: true,
    metaActive: true,
    webWhatsActive: false,
    paymentActive: false,
    accessActive: true,
    accessReason: 'Free trial ativo com 3 dia(s) restante(s).',
    accessSource: 'trial',
    overallHealth: 'red',
    overallHint: 'Pagamento com falha.',
    overallLabel: 'Erro',
    lastCheckedAt: null,
    ...overrides,
  };
}

test('admin e master recebem o payload operacional completo', () => {
  const status = buildStatus();
  assert.equal(presentOperationalStatusForRole('ADMIN', status), status);
  assert.equal(presentOperationalStatusForRole('USERMASTER', status), status);
});

test('vendedor nao recebe chip de pagamento nem motivo financeiro no acesso', () => {
  const status = buildStatus();
  const presented = presentOperationalStatusForRole('USER', status);

  assert.ok(presented);
  const keys = presented!.statuses.map((item) => item.key);
  assert.equal(keys.includes('payment'), false, 'chip de pagamento nao sai para vendedor');

  const access = presented!.statuses.find((item) => item.key === 'access');
  assert.ok(access);
  assert.equal(access!.value, 'Liberado');
  assert.equal(access!.detail.includes('trial'), false);
  assert.equal(access!.href.includes('financeiro'), false);
  assert.equal(presented!.accessSource, 'released');
  assert.equal(presented!.accessReason!.toLowerCase().includes('trial'), false);
  assert.equal(presented!.overallHint.toLowerCase().includes('pagamento'), false);
});

test('vendedor com empresa bloqueada ve pausa neutra, sem texto de cobranca', () => {
  const status = buildStatus({
    accessActive: false,
    accessSource: 'blocked',
    statuses: [
      chip({ key: 'token' }),
      chip({ key: 'meta' }),
      chip({ key: 'webwhats' }),
      chip({
        key: 'payment',
        tone: 'red',
        value: 'Falha',
        detail: 'Falha no motor de pagamento.',
        hint: 'Pagamento com falha.',
        active: false,
      }),
      chip({
        key: 'access',
        tone: 'red',
        value: 'Atraso',
        detail: 'A cobrança está em atraso, então o acesso comercial está bloqueado.',
        hint: 'Acesso bloqueado por atraso.',
        href: '/dashboard/financeiro?focus=payment',
        active: false,
      }),
    ],
    overallHealth: 'red',
    overallLabel: 'Bloqueado',
    overallHint: 'Acesso bloqueado por atraso.',
  });

  const presented = presentOperationalStatusForRole('USER', status);
  assert.ok(presented);
  const access = presented!.statuses.find((item) => item.key === 'access');
  assert.ok(access);
  assert.equal(access!.value, 'Pausado');
  assert.equal(access!.detail, 'Acesso pausado pela administracao da conta.');
  assert.equal(presented!.overallLabel, 'Bloqueado');
  assert.equal(presented!.overallHint.toLowerCase().includes('atraso'), false);
  assert.equal(presented!.overallHint.toLowerCase().includes('cobran'), false);
  assert.equal(presented!.accessSource, 'blocked');
});

test('payload nulo e papeis de gestao passam intactos', () => {
  assert.equal(presentOperationalStatusForRole('USER', null), null);
  const status = buildStatus();
  const adminPresented = presentOperationalStatusForRole('admin', status);
  assert.equal(adminPresented, status);
});
