import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getTenantCompanyId,
  getTenantScopeBypassReason,
  getTenantStore,
  isTenantScopeBypassed,
  runWithTenantContext,
  withoutTenantScope,
} from './tenant-context';

test('fora de qualquer contexto: store vazio', () => {
  assert.equal(getTenantStore(), undefined);
  assert.equal(getTenantCompanyId(), null);
  assert.equal(isTenantScopeBypassed(), false);
});

test('runWithTenantContext expõe companyId e isSystemMaster', () => {
  runWithTenantContext({ companyId: 42, isSystemMaster: true }, () => {
    assert.equal(getTenantCompanyId(), 42);
    assert.equal(getTenantStore()?.isSystemMaster, true);
  });
  // Saiu do escopo → vazio de novo.
  assert.equal(getTenantCompanyId(), null);
});

test('companyId inválido/zero vira null', () => {
  runWithTenantContext({ companyId: 0 }, () => {
    assert.equal(getTenantCompanyId(), null);
  });
  runWithTenantContext({ companyId: null }, () => {
    assert.equal(getTenantCompanyId(), null);
  });
});

test('withoutTenantScope marca o motivo e preserva o companyId', () => {
  runWithTenantContext({ companyId: 7 }, () => {
    assert.equal(isTenantScopeBypassed(), false);
    withoutTenantScope('relatorio-global-master', () => {
      assert.equal(isTenantScopeBypassed(), true);
      assert.equal(getTenantScopeBypassReason(), 'relatorio-global-master');
      // companyId preservado pra log mostrar de onde veio.
      assert.equal(getTenantCompanyId(), 7);
    });
    // Fora do bypass, volta ao normal.
    assert.equal(isTenantScopeBypassed(), false);
  });
});

test('withoutTenantScope sem motivo cai num rótulo padrão', () => {
  withoutTenantScope('', () => {
    assert.equal(getTenantScopeBypassReason(), 'sem-motivo-informado');
  });
});

test('contexto aninhado faz merge (não perde o companyId externo)', () => {
  runWithTenantContext({ companyId: 5, isSystemMaster: false }, () => {
    runWithTenantContext({ isSystemMaster: true }, () => {
      assert.equal(getTenantCompanyId(), 5);
      assert.equal(getTenantStore()?.isSystemMaster, true);
    });
  });
});

test('contexto sobrevive a await (AsyncLocalStorage)', async () => {
  await runWithTenantContext({ companyId: 99 }, async () => {
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(getTenantCompanyId(), 99);
  });
});
