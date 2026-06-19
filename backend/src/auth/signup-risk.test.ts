import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSignupRisk, isDisposableEmailDomain } from './signup-risk';

test('gancho desligado (default): nunca desafia, mesmo com e-mail descartável', () => {
  delete process.env.SIGNUP_RISK_CHALLENGE_ENABLED;
  const d = evaluateSignupRisk({ email: 'abuso@mailinator.com' });
  assert.equal(d.requiresPhoneChallenge, false);
  assert.deepEqual(d.reasons, []);
});

test('detecção de domínio descartável é independente da flag', () => {
  assert.equal(isDisposableEmailDomain('x@mailinator.com'), true);
  assert.equal(isDisposableEmailDomain('dono@empresa.com.br'), false);
});

test('gancho ligado: e-mail descartável → desafia por telefone', () => {
  const prev = process.env.SIGNUP_RISK_CHALLENGE_ENABLED;
  process.env.SIGNUP_RISK_CHALLENGE_ENABLED = 'true';
  try {
    const d = evaluateSignupRisk({ email: 'abuso@mailinator.com' });
    assert.equal(d.requiresPhoneChallenge, true);
    assert.ok(d.reasons.includes('disposable_email'));
  } finally {
    if (prev === undefined) delete process.env.SIGNUP_RISK_CHALLENGE_ENABLED;
    else process.env.SIGNUP_RISK_CHALLENGE_ENABLED = prev;
  }
});

test('gancho ligado: e-mail normal → sem desafio (e-mail basta)', () => {
  const prev = process.env.SIGNUP_RISK_CHALLENGE_ENABLED;
  process.env.SIGNUP_RISK_CHALLENGE_ENABLED = 'true';
  try {
    const d = evaluateSignupRisk({ email: 'dono@empresa.com.br' });
    assert.equal(d.requiresPhoneChallenge, false);
  } finally {
    if (prev === undefined) delete process.env.SIGNUP_RISK_CHALLENGE_ENABLED;
    else process.env.SIGNUP_RISK_CHALLENGE_ENABLED = prev;
  }
});
