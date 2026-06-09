import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMPANY_KIND_PLATFORM_INFRA,
  COMPANY_KIND_TENANT,
  isPlatformInfraCompany,
  isTenantCompany,
  resolveCompanyKind,
} from './company-kind';

test('resolveCompanyKind resolves tenant companies explicitly', () => {
  const company = { companyKind: 'tenant', slug: 'legacy-engine-slug' };

  assert.equal(resolveCompanyKind(company), COMPANY_KIND_TENANT);
  assert.equal(isTenantCompany(company), true);
  assert.equal(isPlatformInfraCompany(company), false);
});

test('resolveCompanyKind resolves platform infrastructure explicitly', () => {
  const company = { companyKind: 'platform_infra', slug: 'cliente-a' };

  assert.equal(resolveCompanyKind(company), COMPANY_KIND_PLATFORM_INFRA);
  assert.equal(isTenantCompany(company), false);
  assert.equal(isPlatformInfraCompany(company), true);
});

test('resolveCompanyKind ignores legacy slug and flags', () => {
  const legacySlugOnly = { slug: 'legacy-engine-slug' };
  const legacyFlagsOnly = { isHbxOperation: true };
  const hbxTenant = { companyKind: 'tenant', slug: 'hbx' };

  assert.equal(resolveCompanyKind(legacySlugOnly), COMPANY_KIND_TENANT);
  assert.equal(resolveCompanyKind(legacyFlagsOnly), COMPANY_KIND_TENANT);
  assert.equal(resolveCompanyKind(hbxTenant), COMPANY_KIND_TENANT);
});

test('resolveCompanyKind falls back to tenant for empty or invalid values', () => {
  assert.equal(resolveCompanyKind(null), COMPANY_KIND_TENANT);
  assert.equal(resolveCompanyKind({ companyKind: null }), COMPANY_KIND_TENANT);
  assert.equal(resolveCompanyKind({ companyKind: 'unknown' }), COMPANY_KIND_TENANT);
});
