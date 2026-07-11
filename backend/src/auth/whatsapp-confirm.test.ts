import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthService } from './auth.service';

// JWT fake: sign = base64(JSON), verify = JSON.parse. Suficiente pra exercitar o
// round-trip do pollToken (email_confirmation_poll) e do challenge (whatsapp_confirm).
function fakeJwt() {
  return {
    sign: (payload: any) => 'jwt.' + Buffer.from(JSON.stringify(payload)).toString('base64'),
    verify: (token: string) => JSON.parse(Buffer.from(String(token).replace(/^jwt\./, ''), 'base64').toString('utf8')),
  };
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

test('F6 confirm: código ERRADO → WHATSAPP_CONFIRM_CODE_INVALID (fluxo real start→confirm)', async () => {
  // Fluxo REAL: o desafio vive no store server-side (por-instância). Precisamos
  // dar o start (que grava o desafio) e o confirm na MESMA instância de service.
  const { service, jwt } = buildService({ id: 9, email: 'novo@cliente.test', emailConfirmedAt: null, companyId: 77 });
  const pollToken = jwt.sign({ sub: 9, purpose: 'email_confirmation_poll' });
  const start: any = await service.startWhatsappConfirmation(pollToken, '19999990000');

  await assert.rejects(
    () => service.confirmWhatsappCode(start.challengeToken, '000000'),
    (err: any) => { assert.equal(err.getResponse().code, 'WHATSAPP_CONFIRM_CODE_INVALID'); return true; },
  );
});

test('F6 confirm: 6 tentativas erradas → bloqueio (desafio apagado vira EXPIRED)', async () => {
  const { service, jwt } = buildService({ id: 9, email: 'novo@cliente.test', emailConfirmedAt: null, companyId: 77 });
  const pollToken = jwt.sign({ sub: 9, purpose: 'email_confirmation_poll' });
  const start: any = await service.startWhatsappConfirmation(pollToken, '19999990000');
  const wrong = start.previewCode === '000000' ? '111111' : '000000'; // garante código errado

  // 5 primeiras erradas incrementam attempts; a 6ª bate na trava anti-brute e
  // apaga o desafio — todas ainda respondem CODE_INVALID.
  for (let i = 0; i < 6; i++) {
    await assert.rejects(
      () => service.confirmWhatsappCode(start.challengeToken, wrong),
      (err: any) => { assert.equal(err.getResponse().code, 'WHATSAPP_CONFIRM_CODE_INVALID'); return true; },
    );
  }
  // Como o desafio foi apagado no bloqueio, a próxima tentativa (mesmo com o
  // código certo) já não acha o desafio → EXPIRED (pedir código novo).
  await assert.rejects(
    () => service.confirmWhatsappCode(start.challengeToken, start.previewCode),
    (err: any) => { assert.equal(err.getResponse().code, 'WHATSAPP_CONFIRM_EXPIRED'); return true; },
  );
});

test('F6 confirm: challenge malformado → WHATSAPP_CONFIRM_EXPIRED', async () => {
  const { service } = buildService({ id: 9, email: 'novo@cliente.test', emailConfirmedAt: null, companyId: 77 });
  await assert.rejects(
    () => service.confirmWhatsappCode('lixo-token', '123456'),
    (err: any) => { assert.equal(err.getResponse().code, 'WHATSAPP_CONFIRM_EXPIRED'); return true; },
  );
});

// ── F1 (CONFIRMACAO-TELEFONE) — envio LIVE atrás de LIVE_WHATSAPP_CONFIRM ──────────
// Service com um webwhats FAKE (registra os sendText) — o chip do Master só ENVIA,
// nunca conecta. NENHUM envio real acontece aqui: o mock só conta chamadas.
function buildLiveService(opts?: { sendText?: (companyId: number, input: any) => Promise<any> }) {
  const jwt = fakeJwt();
  const sends: Array<{ companyId: number; input: any }> = [];
  const prisma = {
    user: { findUnique: async () => ({ id: 9, email: 'novo@cliente.test', emailConfirmedAt: null, companyId: 77 }) },
    trialPhoneUsage: { findUnique: async () => null, findFirst: async () => null },
    company: { findUnique: async () => ({ id: 77 }) },
  };
  const webwhats = {
    sendText: async (companyId: number, input: any) => {
      sends.push({ companyId, input });
      if (opts?.sendText) return opts.sendText(companyId, input);
      return { target: input.to, providerMessageId: 'fake' };
    },
  };
  const service = new AuthService({} as any, jwt as any, prisma as any, {} as any, {} as any, {} as any, {} as any, webwhats as any);
  return { service, jwt, sends };
}

function withLiveEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const keys = ['NODE_ENV', 'LIVE_WHATSAPP_CONFIRM', 'WHATSAPP_CONFIRM_WA_COMPANY_ID', 'MASTER_ALERT_WA_COMPANY_ID', 'HBX_CREDITS_ENABLED', 'HBX_CREDITS_REQUIRE_VERIFIED_PHONE'];
  const prev: Record<string, string | undefined> = {};
  for (const k of keys) prev[k] = process.env[k];
  return (async () => {
    try {
      for (const k of keys) { if (k in vars) { const v = vars[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
      await fn();
    } finally {
      for (const k of keys) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; }
    }
  })();
}

test('F1 live ON: envia pelo app routine (sendText 1x), sentVia whatsapp, sem previewCode', async () => {
  await withLiveEnv({ NODE_ENV: 'production', LIVE_WHATSAPP_CONFIRM: 'true', MASTER_ALERT_WA_COMPANY_ID: '1', WHATSAPP_CONFIRM_WA_COMPANY_ID: undefined }, async () => {
    const { service, jwt, sends } = buildLiveService();
    const pollToken = jwt.sign({ sub: 9, purpose: 'email_confirmation_poll' });
    const r: any = await service.startWhatsappConfirmation(pollToken, '(19) 99999-0000');
    assert.equal(r.sentVia, 'whatsapp');
    assert.equal(r.liveDispatch, null);
    assert.equal(r.previewCode, null);
    assert.ok(r.challengeToken);
    assert.equal(sends.length, 1);
    assert.equal(sends[0].companyId, 1); // empresa que envia (chip do Master)
    assert.match(String(sends[0].input.text), /\d{6}/); // o código de 6 dígitos vai no texto
  });
});

test('F1 cooldown: reenvio imediato do mesmo telefone → RATE_LIMITED, sem 2º envio', async () => {
  await withLiveEnv({ NODE_ENV: 'production', LIVE_WHATSAPP_CONFIRM: 'true', MASTER_ALERT_WA_COMPANY_ID: '1' }, async () => {
    const { service, jwt, sends } = buildLiveService();
    const pollToken = jwt.sign({ sub: 9, purpose: 'email_confirmation_poll' });
    await service.startWhatsappConfirmation(pollToken, '19999990000');
    await assert.rejects(
      () => service.startWhatsappConfirmation(pollToken, '19999990000'),
      (err: any) => { assert.equal(err.getResponse().code, 'WHATSAPP_CONFIRM_RATE_LIMITED'); return true; },
    );
    assert.equal(sends.length, 1); // não martelou o chip
  });
});

test('F1 disjuntor: 3 falhas ABREM o canal; 4º é cortado sem tentar (sem loop de retry)', async () => {
  await withLiveEnv({ NODE_ENV: 'production', LIVE_WHATSAPP_CONFIRM: 'true', MASTER_ALERT_WA_COMPANY_ID: '1' }, async () => {
    const { service, jwt, sends } = buildLiveService({ sendText: async () => { throw new Error('motor down'); } });
    const pollToken = jwt.sign({ sub: 9, purpose: 'email_confirmation_poll' });
    for (const p of ['19999990001', '19999990002', '19999990003']) {
      await assert.rejects(
        () => service.startWhatsappConfirmation(pollToken, p),
        (err: any) => { assert.equal(err.getResponse().code, 'WHATSAPP_CONFIRM_SEND_FAILED'); return true; },
      );
    }
    // 4º número: disjuntor aberto → cortado ANTES de tentar enviar.
    await assert.rejects(
      () => service.startWhatsappConfirmation(pollToken, '19999990004'),
      (err: any) => { assert.equal(err.getResponse().code, 'WHATSAPP_CONFIRM_RATE_LIMITED'); return true; },
    );
    assert.equal(sends.length, 3); // UMA tentativa por número; nada de retry
  });
});

test('F1 OFF (default): produção NÃO dispara nada live (gated-TODO), webwhats intocado', async () => {
  await withLiveEnv({ NODE_ENV: 'production', LIVE_WHATSAPP_CONFIRM: undefined, MASTER_ALERT_WA_COMPANY_ID: '1' }, async () => {
    const { service, jwt, sends } = buildLiveService();
    const pollToken = jwt.sign({ sub: 9, purpose: 'email_confirmation_poll' });
    const r: any = await service.startWhatsappConfirmation(pollToken, '19999990000');
    assert.equal(r.liveDispatch, 'LIVE_WHATSAPP_CONFIRM_TODO');
    assert.equal(r.previewCode, null);
    assert.equal(sends.length, 0); // flag OFF = zero envio live
  });
});

// ── F2 (CONFIRMACAO-TELEFONE) — brinde amarrado ao telefone VERIFICADO ────────────
function buildGateService(company: any, onFindFirst?: (args: any) => any) {
  const jwt = fakeJwt();
  const grants: number[] = [];
  const prisma = {
    company: {
      findUnique: async () => company,
      findFirst: async (args: any) => (onFindFirst ? onFindFirst(args) : null),
    },
  };
  const credits = { grantWelcomeBatch: async (id: number) => { grants.push(id); } };
  const service = new AuthService({} as any, jwt as any, prisma as any, {} as any, {} as any, {} as any, credits as any);
  return { service, grants };
}
const CREDIT_COMPANY = (over: any = {}) => ({ status: 'active', accountType: 'credit', contactPhone: '11999990000', contactPhoneVerifiedAt: null, taxDocument: null, ...over });

test('F2 gate OFF (default): brinde sai com identidade confirmada, telefone não verificado (atual)', async () => {
  await withLiveEnv({ HBX_CREDITS_ENABLED: 'true', HBX_CREDITS_REQUIRE_VERIFIED_PHONE: undefined }, async () => {
    const { service, grants } = buildGateService(CREDIT_COMPANY());
    await (service as any).maybeGrantWelcomeAfterConfirm(77);
    assert.deepEqual(grants, [77]);
  });
});

test('F2 gate ON + telefone NÃO verificado → brinde NÃO sai', async () => {
  await withLiveEnv({ HBX_CREDITS_ENABLED: 'true', HBX_CREDITS_REQUIRE_VERIFIED_PHONE: 'true' }, async () => {
    const { service, grants } = buildGateService(CREDIT_COMPANY({ contactPhoneVerifiedAt: null }));
    await (service as any).maybeGrantWelcomeAfterConfirm(77);
    assert.deepEqual(grants, []);
  });
});

test('F2 gate ON + telefone VERIFICADO + sem colisão → brinde sai', async () => {
  await withLiveEnv({ HBX_CREDITS_ENABLED: 'true', HBX_CREDITS_REQUIRE_VERIFIED_PHONE: 'true' }, async () => {
    const { service, grants } = buildGateService(CREDIT_COMPANY({ contactPhoneVerifiedAt: new Date() }));
    await (service as any).maybeGrantWelcomeAfterConfirm(77);
    assert.deepEqual(grants, [77]);
  });
});

test('F2 gate ON: dedup compara telefone VERIFICADO (clause carrega contactPhoneVerifiedAt not null)', async () => {
  await withLiveEnv({ HBX_CREDITS_ENABLED: 'true', HBX_CREDITS_REQUIRE_VERIFIED_PHONE: 'true' }, async () => {
    let captured: any = null;
    const { service, grants } = buildGateService(CREDIT_COMPANY({ contactPhoneVerifiedAt: new Date() }), (args) => { captured = args; return null; });
    await (service as any).maybeGrantWelcomeAfterConfirm(77);
    // A cláusula de telefone precisa exigir telefone verificado na OUTRA empresa.
    const phoneClause = (captured?.where?.OR || []).find((c: any) => c && 'contactPhone' in c);
    assert.ok(phoneClause, 'esperava cláusula de telefone no dedup');
    assert.deepEqual(phoneClause.contactPhoneVerifiedAt, { not: null });
    assert.deepEqual(grants, [77]); // sem clash (a outra conta não tinha verificado) → brinde sai
  });
});

test('F2 gate ON: colisão com telefone verificado em outra empresa → brinde NÃO sai', async () => {
  await withLiveEnv({ HBX_CREDITS_ENABLED: 'true', HBX_CREDITS_REQUIRE_VERIFIED_PHONE: 'true' }, async () => {
    const { service, grants } = buildGateService(CREDIT_COMPANY({ contactPhoneVerifiedAt: new Date() }), () => ({ id: 88 }));
    await (service as any).maybeGrantWelcomeAfterConfirm(77);
    assert.deepEqual(grants, []);
  });
});
