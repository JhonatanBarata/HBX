import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  isLocalRole,
  paidSourcesAllowed,
  canUsePaidSource,
  assertPaidSourceAllowed,
  PaidSourceBlockedByRoleError,
  currentRole,
} from './role-guard';

// Todos os testes PINAM o env (worktree não tem .env; nunca herdar do processo).

test('HBX_ROLE ausente = local (fail-safe: na dúvida, não gasta)', () => {
  const env = {} as NodeJS.ProcessEnv;
  assert.equal(isLocalRole(env), true);
  assert.equal(paidSourcesAllowed(env), false);
  assert.equal(canUsePaidSource('brave', env), false);
});

test('HBX_ROLE=local recusa TODAS as fontes pagas', () => {
  const env = { HBX_ROLE: 'local' } as unknown as NodeJS.ProcessEnv;
  for (const source of ['brave', 'google_places'] as const) {
    assert.equal(canUsePaidSource(source, env), false, `${source} deveria estar bloqueada`);
    assert.throws(() => assertPaidSourceAllowed(source, env), PaidSourceBlockedByRoleError);
  }
});

test('valor desconhecido de HBX_ROLE = local (não é whitelist de VPS)', () => {
  const env = { HBX_ROLE: 'staging-qualquer-coisa' } as unknown as NodeJS.ProcessEnv;
  assert.equal(isLocalRole(env), true);
  assert.equal(paidSourcesAllowed(env), false);
});

test('HBX_ROLE=vps LIBERA fonte paga (reforço só no VPS)', () => {
  const env = { HBX_ROLE: 'vps' } as unknown as NodeJS.ProcessEnv;
  assert.equal(isLocalRole(env), false);
  assert.equal(paidSourcesAllowed(env), true);
  assert.equal(canUsePaidSource('brave', env), true);
  assert.doesNotThrow(() => assertPaidSourceAllowed('brave', env));
});

test('aliases de VPS (production/prod/server) também liberam', () => {
  for (const role of ['production', 'prod', 'server', 'VPS', ' Production ']) {
    const env = { HBX_ROLE: role } as unknown as NodeJS.ProcessEnv;
    assert.equal(paidSourcesAllowed(env), true, `${role} deveria liberar`);
  }
});

test('erro da trava carrega a fonte e o papel (auditoria/telemetria)', () => {
  const env = { HBX_ROLE: 'local' } as unknown as NodeJS.ProcessEnv;
  try {
    assertPaidSourceAllowed('google_places', env);
    assert.fail('deveria ter lançado');
  } catch (error) {
    assert.ok(error instanceof PaidSourceBlockedByRoleError);
    assert.equal((error as PaidSourceBlockedByRoleError).paidSource, 'google_places');
    assert.equal((error as PaidSourceBlockedByRoleError).role, 'local');
    assert.match(String((error as Error).message), /Zero tentativa paga/);
  }
});

test('currentRole normaliza (trim + minúsculo)', () => {
  assert.equal(currentRole({ HBX_ROLE: '  VPS  ' } as unknown as NodeJS.ProcessEnv), 'vps');
  assert.equal(currentRole({} as NodeJS.ProcessEnv), '');
});
