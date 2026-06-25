import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveDisposition,
  resolveDispositionReason,
  isGlobalBlockStatus,
  isOwnHideStatus,
  resolvePoolBlockStatus,
  BLOCK_GLOBAL_REASONS,
  HIDE_OWN_REASONS,
  RELEASE_OWN_REASONS,
  CARD_DISPOSITION_RULES,
} from './radar-disposition-rules';

test('matriz: só excluir volta pra TODOS os eixos (visível até pra própria empresa)', () => {
  const rule = resolveDisposition('excluir');
  assert.equal(rule.pool, 'clean');
  assert.equal(rule.ownCompany, 'release');
  assert.equal(rule.others, 'release');
});

test('MUDANÇA-CHAVE: não atendeu (no_answer) NÃO bloqueia global — vira leve', () => {
  const rule = resolveDisposition('no_answer');
  assert.equal(rule.others, 'release', 'no_answer deve VOLTAR pros outros');
  assert.equal(rule.ownCompany, 'hide', 'no_answer some só pra sua empresa');
  assert.equal(isGlobalBlockStatus('no_answer'), false, 'no_answer NÃO bloqueia global');
});

test('MUDANÇA-CHAVE: caixa postal (voicemail) BLOQUEIA global — único kill de ligação', () => {
  const rule = resolveDisposition('voicemail');
  assert.equal(rule.pool, 'blocked');
  assert.equal(rule.others, 'block');
  assert.equal(isGlobalBlockStatus('voicemail'), true, 'voicemail bloqueia global');
  assert.equal(resolvePoolBlockStatus('voicemail'), 'voicemail');
});

test('automáticos do bot continuam bloqueando global', () => {
  for (const reason of ['no_whatsapp', 'invalid_whatsapp', 'invalid_phone', 'opt_out', 'do_not_contact', 'complaint', 'blocked']) {
    assert.equal(isGlobalBlockStatus(reason), true, `${reason} deve bloquear global`);
    assert.equal(resolveDisposition(reason).others, 'block', `${reason} others=block`);
  }
});

test('motivos leves (some só pra você, volta pros outros)', () => {
  for (const reason of ['unsatisfactory', 'no_answer', 'not_interested']) {
    const rule = resolveDisposition(reason);
    assert.equal(rule.ownCompany, 'hide', `${reason} ownCompany=hide`);
    assert.equal(rule.others, 'release', `${reason} others=release`);
    assert.equal(rule.pool, 'clean', `${reason} pool=clean`);
    assert.equal(isGlobalBlockStatus(reason), false, `${reason} NÃO bloqueia global`);
    assert.equal(isOwnHideStatus(reason), true, `${reason} esconde da própria empresa`);
  }
});

test('fechou venda (won): vira cliente da empresa, outros ainda prospectam, cadastro obrigatório', () => {
  const rule = resolveDisposition('won');
  assert.equal(rule.ownCompany, 'customer');
  assert.equal(rule.pool, 'clean');
  assert.equal(rule.others, 'release');
  assert.equal(rule.requiresRegistration, true);
});

test('aliases PT e variantes resolvem pro motivo canônico', () => {
  assert.equal(resolveDispositionReason('Caixa Postal'), 'voicemail');
  assert.equal(resolveDispositionReason('não atendeu'), 'no_answer');
  assert.equal(resolveDispositionReason('descartado'), 'unsatisfactory');
  assert.equal(resolveDispositionReason('não quer produto'), 'not_interested');
  assert.equal(resolveDispositionReason('fechou venda'), 'won');
  assert.equal(resolveDispositionReason('optout'), 'opt_out');
});

test('default conservador: motivo desconhecido cai em unsatisfactory (NUNCA bloqueia global por engano)', () => {
  assert.equal(resolveDispositionReason('xpto_qualquer'), 'unsatisfactory');
  assert.equal(isGlobalBlockStatus('xpto_qualquer'), false);
});

test('listas derivadas batem com o mapa (coerência da fonte única)', () => {
  // BLOCK_GLOBAL = exatamente os motivos com others=block
  for (const reason of BLOCK_GLOBAL_REASONS) {
    assert.equal(CARD_DISPOSITION_RULES[reason].others, 'block');
  }
  // voicemail entra, no_answer NÃO entra
  assert.ok(BLOCK_GLOBAL_REASONS.includes('voicemail'));
  assert.ok(!BLOCK_GLOBAL_REASONS.includes('no_answer'));
  // HIDE_OWN inclui no_answer e voicemail; RELEASE_OWN só excluir
  assert.ok(HIDE_OWN_REASONS.includes('no_answer'));
  assert.ok(HIDE_OWN_REASONS.includes('voicemail'));
  assert.deepEqual(RELEASE_OWN_REASONS, ['excluir']);
});
