import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildModuleCapabilityKey,
  isHbxOperationCompany,
  resolveAccessGovernor,
  resolveEffectiveCapability,
} from './seller-access-governance';
import { MASTER_WHATSAPP_ENGINE_COMPANY_SLUG } from '../companies/master-whatsapp-company.constants';

test('resolveAccessGovernor delegates HBX operation sellers to Master HBX', () => {
  assert.equal(resolveAccessGovernor({ id: 1, companyId: 10 }, { id: 10, slug: MASTER_WHATSAPP_ENGINE_COMPANY_SLUG }), 'HBX_MASTER');
  assert.equal(resolveAccessGovernor({ id: 2, company: { slug: 'hbx' } }), 'HBX_MASTER');
  assert.equal(resolveAccessGovernor({ id: 3, company: { isHbxOperation: true } }), 'HBX_MASTER');
});

test('resolveAccessGovernor delegates client company sellers to their company admin', () => {
  assert.equal(resolveAccessGovernor({ id: 1, companyId: 20 }, { id: 20, slug: 'cliente-a' }), 'COMPANY_ADMIN');
  assert.equal(resolveAccessGovernor({ id: 2, company: null }), 'COMPANY_ADMIN');
});

test('resolveEffectiveCapability requires plan, user config and safety gate to allow', () => {
  assert.equal(resolveEffectiveCapability({
    capability: 'canAccessRadar',
    companyEntitlements: { canAccessRadar: true },
    configuredUserCaps: { canAccessRadar: true },
  }), true);

  assert.equal(resolveEffectiveCapability({
    capability: 'canAccessRadar',
    companyEntitlements: { canAccessRadar: false },
    configuredUserCaps: { canAccessRadar: true },
  }), false);

  assert.equal(resolveEffectiveCapability({
    capability: 'canAccessRadar',
    companyEntitlements: { canAccessRadar: true },
    configuredUserCaps: { canAccessRadar: false },
  }), false);

  assert.equal(resolveEffectiveCapability({
    capability: 'canAccessRadar',
    companyEntitlements: { canAccessRadar: true },
    configuredUserCaps: { canAccessRadar: true },
    safetyCaps: { canAccessRadar: false },
  }), false);
});

test('buildModuleCapabilityKey maps operational modules to business capabilities', () => {
  assert.equal(isHbxOperationCompany({ slug: MASTER_WHATSAPP_ENGINE_COMPANY_SLUG }), true);
  assert.equal(buildModuleCapabilityKey('webscraping'), 'canAccessRadar');
  assert.equal(buildModuleCapabilityKey('webscraping', 'run'), 'canRunRadarSearch');
  assert.equal(buildModuleCapabilityKey('vendas'), 'canAccessVendas');
  assert.equal(buildModuleCapabilityKey('gerencial', 'manage'), 'canManageUsers');
});
