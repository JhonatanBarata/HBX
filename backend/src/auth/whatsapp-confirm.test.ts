import test from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'crypto';
import { AuthService } from './auth.service';

// JWT fake: sign = base64(JSON), verify = JSON.parse. Suficiente pra exercitar o
// round-trip do pollToken (email_confirmation_poll) e do challenge (whatsapp_confirm).
function fakeJwt() {
  return {
    sign: (payload: any) => 'jwt.' + Buffer.from(JSON.stringify(payload)).toString('base64'),
    verify: (token: string) => JSON.parse(Buffer.from(String(token).replace(/^jwt\./, ''), 'base64').toString('utf8')),
  };
}

function sha256(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function buildService(userSnapshot: any) {
  const jwt = fakeJwt();
  const prisma = {
    user: { findUnique: async () => userSnapshot },
    trialPhoneUsage: { findUnique: async () => null, findFirst: async () => null },
    company: { findUnique: async () => ({ id: 77 }) },
  };
  const service = new AuthService({} as any, jwt as any, prisma as any, {} as any, {} as any, {} as any, {} as any);
  return { service, jwt };
}

test('F6 start (dev/mock): gera código de 6 dígitos no preview + challengeToken', async () => {
  const { service, jwt } = buildService({ id: 9, email: 'novo@cliente.test', emailConfirmedAt: null, companyId: 77 });
  const pollToken = jwt.sign({ sub: 9, purpose: 'email_confirmation_poll' });

  const r: any = await service.startWhatsappConfirmation(pollToken, '(19) 99999-0000');

  assert.ok(r.challengeToken);
  assert.match(String(r.previewCode), /^\d{6}$/);
  assert.equal(r.sentVia, 'mock');
  assert.equal(r.liveDispatch, null);
});

test('F6 start (produção): NÃO dispara — gated LIVE_WHATSAPP_CONFIRM_TODO, sem previewCode', async () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const { service, jwt } = buildService({ id: 9, email: 'novo@cliente.test', emailConfirmedAt: null, companyId: 77 });
    const pollToken = jwt.sign({ sub: 9, purpose: 'email_confirmation_poll' });
    const r: any = await service.startWhatsappConfirmation(pollToken, '19999990000');
    assert.equal(r.previewCode, null);
    assert.equal(r.liveDispatch, 'LIVE_WHATSAPP_CONFIRM_TODO');
    assert.equal(r.sentVia, 'whatsapp');
  } finally {
    if (prev === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prev;
  }
});

test('F6 start: já confirmado → não gera código (alreadyConfirmed)', async () => {
  const { service, jwt } = buildService({ id: 9, email: 'novo@cliente.test', emailConfirmedAt: new Date(), companyId: 77 });
  const pollToken = jwt.sign({ sub: 9, purpose: 'email_confirmation_poll' });
  const r: any = await service.startWhatsappConfirmation(pollToken, '19999990000');
  assert.equal(r.alreadyConfirmed, true);
  assert.equal(r.challengeToken, undefined);
});

test('F6 confirm: código ERRADO → 409/400 WHATSAPP_CONFIRM_CODE_INVALID', async () => {
  const { service, jwt } = buildService({ id: 9, email: 'novo@cliente.test', emailConfirmedAt: null, companyId: 77 });
  const challengeToken = jwt.sign({ sub: 9, phone: '19999990000', ch: sha256('123456'), purpose: 'whatsapp_confirm' });

  await assert.rejects(
    () => service.confirmWhatsappCode(challengeToken, '000000'),
    (err: any) => { assert.equal(err.getResponse().code, 'WHATSAPP_CONFIRM_CODE_INVALID'); return true; },
  );
});

test('F6 confirm: challenge malformado → WHATSAPP_CONFIRM_EXPIRED', async () => {
  const { service } = buildService({ id: 9, email: 'novo@cliente.test', emailConfirmedAt: null, companyId: 77 });
  await assert.rejects(
    () => service.confirmWhatsappCode('lixo-token', '123456'),
    (err: any) => { assert.equal(err.getResponse().code, 'WHATSAPP_CONFIRM_EXPIRED'); return true; },
  );
});
