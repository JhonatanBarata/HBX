import test from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { MasterProvisioningService } from './master-provisioning.service';

function buildService() {
  return new MasterProvisioningService({} as any);
}

test('buildProvisioningPlan creates tenant contract without platform infra privileges', () => {
  const service = buildService();

  const plan = service.buildProvisioningPlan({
    companyName: 'Cliente Exemplo',
    slug: 'hbx',
    planKey: 'hbx_melhor',
    manualAccess: true,
    billingCycle: 'ANNUAL',
    modules: ['vendas', 'webscraping', 'bot_ia'],
    limits: {
      commercialCardsMonthlyLimitOverride: 5000,
      commercialCardsDailyLimitOverride: 250,
      commissionDueBusinessDays: 5,
    },
    admin: {
      name: 'Dono',
      email: 'DONO@EXEMPLO.COM',
    },
    supportEmail: 'suporte@cliente.com',
    replyToEmail: 'responder@cliente.com',
    supportWhatsapp: '+55 11 99999-0000',
    products: [{ name: 'Produto inicial', description: 'Primeira oferta' }],
    assistedImplementation: {
      required: true,
      note: 'Implantacao guiada pelo Master.',
    },
  });

  assert.equal(plan.tenant.companyKind, 'tenant');
  assert.equal(plan.tenant.slug, 'hbx');
  assert.equal(plan.commercial.planKey, 'hbx_melhor');
  assert.equal(plan.commercial.manualAccess, true);
  assert.equal(plan.commercial.entitlementStatus, 'manual');
  assert.deepEqual(plan.modules.map((moduleItem) => moduleItem.key), ['vendas', 'webscraping', 'bot_ia']);
  assert.equal(plan.limits.commissionDueBusinessDays, 5);
  assert.equal(plan.admin?.email, 'dono@exemplo.com');
  assert.equal(plan.admin?.passwordProvided, false);
  assert.equal(plan.supportChannels.persistence, 'pending_schema');
  assert.equal(plan.supportChannels.replyToEmail, 'responder@cliente.com');
  assert.equal(plan.products[0].persistence, 'deferred');
  assert.equal(plan.assistedImplementation.status, 'pending');
  assert.equal(plan.steps.find((step) => step.key === 'configure_support_channels')?.status, 'pending_schema');
});

test('buildProvisioningPlan defaults modules from selected plan and validates admin email', () => {
  const service = buildService();

  const plan = service.buildProvisioningPlan({
    companyName: 'Cliente Dois',
    planKey: 'hbx_padrao',
    manualAccess: false,
  });

  assert.equal(plan.tenant.companyKind, 'tenant');
  assert.equal(plan.commercial.entitlementStatus, 'pending_configuration');
  assert.ok(plan.modules.some((moduleItem) => moduleItem.key === 'gerencial'));
  assert.equal(plan.admin, null);

  assert.throws(
    () => service.buildProvisioningPlan({ companyName: 'Cliente Tres', admin: { email: '' } }),
    BadRequestException,
  );
});
