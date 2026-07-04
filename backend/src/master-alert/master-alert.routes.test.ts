import test from 'node:test';
import assert from 'node:assert/strict';

import { MASTER_ALERT_MAX_WHATSAPP_PER_DAY, resolveMasterAlertRoute } from './master-alert.routes';

// Cobre a tabela de rotas em si: cada rota do contrato do sprint bate com o
// que foi combinado no .md (canais/throttle/digest), e tipo desconhecido cai
// no default seguro (nunca "sem rota" = "sem aviso nenhum").

test('resolveMasterAlertRoute: rotas legadas (Sprint 1) = email+zap+sino, throttle 0 (imediato)', () => {
  for (const type of ['fullplan.requested', 'implantacao.sold', 'bot.config_missing']) {
    const route = resolveMasterAlertRoute(type);
    assert.deepEqual(route.channels.slice().sort(), ['email', 'sino', 'whatsapp']);
    assert.equal(route.throttleMinutes, 0);
    assert.equal(route.digest, false);
  }
});

test('resolveMasterAlertRoute: chip.dropped = email+zap+sino, throttle 60min', () => {
  const route = resolveMasterAlertRoute('chip.dropped');
  assert.deepEqual(route.channels.slice().sort(), ['email', 'sino', 'whatsapp']);
  assert.equal(route.throttleMinutes, 60);
  assert.equal(route.digest, false);
});

test('resolveMasterAlertRoute: billing.webhook_stale = email+zap, throttle 24h', () => {
  const route = resolveMasterAlertRoute('billing.webhook_stale');
  assert.deepEqual(route.channels.slice().sort(), ['email', 'whatsapp']);
  assert.equal(route.throttleMinutes, 24 * 60);
  assert.equal(route.digest, false);
});

test('resolveMasterAlertRoute: company.state_changed = email+sino, digest (sem zap na hora)', () => {
  const route = resolveMasterAlertRoute('company.state_changed');
  assert.deepEqual(route.channels.slice().sort(), ['email', 'sino']);
  assert.ok(!route.channels.includes('whatsapp'));
  assert.equal(route.digest, true);
});

test('resolveMasterAlertRoute: factory.stalled = email, digest', () => {
  const route = resolveMasterAlertRoute('factory.stalled');
  assert.deepEqual(route.channels, ['email']);
  assert.equal(route.digest, true);
});

test('resolveMasterAlertRoute: tipo desconhecido cai no default (email+sino, throttle 60min)', () => {
  const route = resolveMasterAlertRoute('tipo.inventado.xyz');
  assert.deepEqual(route.channels.slice().sort(), ['email', 'sino']);
  assert.equal(route.throttleMinutes, 60);
  assert.equal(route.digest, false);
});

test('MASTER_ALERT_MAX_WHATSAPP_PER_DAY: teto duro é 10 (Guardrails do sprint)', () => {
  assert.equal(MASTER_ALERT_MAX_WHATSAPP_PER_DAY, 10);
});
