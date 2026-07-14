import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildModuleCapabilityKey,
  resolveAccessGovernor,
  resolveEffectiveCapability,
} from './seller-access-governance';
import { COMPANY_KIND_PLATFORM_INFRA, COMPANY_KIND_TENANT } from '../common/company-kind';

test('resolveAccessGovernor uses companyKind instead of legacy slug or flags', () => {
  assert.equal(resolveAccessGovernor({ id: 1, companyId: 10 }, { id: 10, companyKind: 'platform_infra' }), COMPANY_KIND_PLATFORM_INFRA);
  assert.equal(resolveAccessGovernor({ id: 2, company: { companyKind: 'tenant', slug: 'hbx' } }), COMPANY_KIND_TENANT);
  assert.equal(resolveAccessGovernor({ id: 3, company: { slug: 'hbx' } }), COMPANY_KIND_TENANT);
});

test('resolveAccessGovernor defaults missing companyKind to tenant', () => {
  assert.equal(resolveAccessGovernor({ id: 1, companyId: 20 }, { id: 20, slug: 'cliente-a' }), COMPANY_KIND_TENANT);
  assert.equal(resolveAccessGovernor({ id: 2, company: null }), COMPANY_KIND_TENANT);
});

test('resolveEffectiveCapability requires company kill-switch, user config and safety gate to allow', () => {
  assert.equal(resolveEffectiveCapability({
    capability: 'canAccessRadar',
    companyCapabilities: { canAccessRadar: true },
    configuredUserCaps: { canAccessRadar: true },
  }), true);

  assert.equal(resolveEffectiveCapability({
    capability: 'canAccessRadar',
    companyCapabilities: { canAccessRadar: false },
    configuredUserCaps: { canAccessRadar: true },
  }), false);

  assert.equal(resolveEffectiveCapability({
    capability: 'canAccessRadar',
    companyCapabilities: { canAccessRadar: true },
    configuredUserCaps: { canAccessRadar: false },
  }), false);

  assert.equal(resolveEffectiveCapability({
    capability: 'canAccessRadar',
    companyCapabilities: { canAccessRadar: true },
    configuredUserCaps: { canAccessRadar: true },
    safetyCaps: { canAccessRadar: false },
  }), false);
});

test('buildModuleCapabilityKey maps operational modules to business capabilities', () => {
  assert.equal(buildModuleCapabilityKey('webscraping'), 'canAccessRadar');
  assert.equal(buildModuleCapabilityKey('webscraping', 'run'), 'canRunRadarSearch');
  assert.equal(buildModuleCapabilityKey('vendas'), 'canAccessVendas');
  assert.equal(buildModuleCapabilityKey('gerencial', 'manage'), 'canManageUsers');
});
