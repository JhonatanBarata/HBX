import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allowsAdminMultiSession,
  MAX_ADMIN_WEB_SESSIONS,
  MAX_MOBILE_DEVICES_PER_USER,
} from './session-policy';

test('politica libera dez sessoes web e quatro aparelhos', () => {
  assert.equal(MAX_ADMIN_WEB_SESSIONS, 10);
  assert.equal(MAX_MOBILE_DEVICES_PER_USER, 4);
});

test('multissessao web fica restrita a perfis administrativos', () => {
  assert.equal(allowsAdminMultiSession({ role: 'ADMIN' }), true);
  assert.equal(allowsAdminMultiSession({ role: 'USERMASTER' }), true);
  assert.equal(allowsAdminMultiSession({ role: 'USER', isSystemMaster: true }), true);
  assert.equal(allowsAdminMultiSession({ role: 'USER' }), false);
});
