import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canApplyMobileActionEvent,
  isValidMobileActionResult,
  mobileActionStatusForEvent,
} from './mobile-action-state';

test('ponte móvel aceita somente a sequência comercial esperada', () => {
  assert.equal(canApplyMobileActionEvent('delivering', 'delivered'), true);
  assert.equal(canApplyMobileActionEvent('delivered', 'opened'), true);
  assert.equal(canApplyMobileActionEvent('opened', 'external_started'), true);
  assert.equal(canApplyMobileActionEvent('started', 'returned'), true);
  assert.equal(canApplyMobileActionEvent('returned', 'completed'), true);

  assert.equal(canApplyMobileActionEvent('completed', 'opened'), false);
  assert.equal(canApplyMobileActionEvent('canceled', 'external_started'), false);
  assert.equal(canApplyMobileActionEvent('failed', 'completed'), false);
  assert.equal(canApplyMobileActionEvent('delivered', 'completed'), false);
});

test('repetição intermediária não regride e estado terminal não pode ser reescrito', () => {
  assert.equal(canApplyMobileActionEvent('delivered', 'delivered'), true);
  assert.equal(canApplyMobileActionEvent('opened', 'opened'), true);
  assert.equal(canApplyMobileActionEvent('completed', 'completed'), false);
  assert.equal(canApplyMobileActionEvent('canceled', 'canceled'), false);
  assert.equal(canApplyMobileActionEvent('failed', 'failed'), false);
});

test('resultado concluído é validado por tipo da ação', () => {
  assert.equal(isValidMobileActionResult('call', 'completed', 'atendeu'), true);
  assert.equal(isValidMobileActionResult('call', 'completed', 'sem_interesse'), true);
  assert.equal(isValidMobileActionResult('call', 'completed', 'mensagem_enviada'), false);
  assert.equal(isValidMobileActionResult('whatsapp', 'completed', 'mensagem_enviada'), true);
  assert.equal(isValidMobileActionResult('whatsapp', 'completed', 'nao_enviada'), true);
  assert.equal(isValidMobileActionResult('whatsapp', 'completed', 'atendeu'), false);
  assert.equal(isValidMobileActionResult('call', 'completed', null), false);
  assert.equal(isValidMobileActionResult('call', 'returned', 'atendeu'), false);
  assert.equal(isValidMobileActionResult('call', 'returned', null), true);
});

test('eventos são projetados para os estados persistidos', () => {
  assert.equal(mobileActionStatusForEvent('external_started'), 'started');
  assert.equal(mobileActionStatusForEvent('completed'), 'completed');
});
