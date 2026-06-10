import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMERCIAL_ENTITLEMENT_KEYS,
  COMMERCIAL_PLAN_ENTITLEMENT_KEYS,
  COMMERCIAL_PLAN_KEYS,
  getCommercialPlanTitle,
} from '../commercial-plans/commercial-plan-catalog';
import { COMPANY_KIND_PLATFORM_INFRA, COMPANY_KIND_TENANT } from '../common/company-kind';
import { ModulesService } from './modules.service';
import { presentModuleBlockForRole, resolveCompanyModuleAccessPolicy } from './module-access-policy';

const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

test('pending_checkout/PENDING blocks operational modules', () => {
  const policy = resolveCompanyModuleAccessPolicy({
    isActive: false,
    onboardingStatus: 'pending_checkout',
    paymentStatus: 'PENDING',
    subscriptionStatus: 'pending_checkout',
    selectedPlanKey: COMMERCIAL_PLAN_KEYS.PADRAO,
  });

  assert.equal(policy.active, false);
  assert.equal(policy.pendingCheckout, true);
  assert.equal(policy.blockedCode, 'pending_checkout');
  assert.deepEqual([...policy.moduleKeys], []);
});

test('active_trial/TRIAL/trialing releases padrao commercial modules', () => {
  const policy = resolveCompanyModuleAccessPolicy({
    isActive: true,
    onboardingStatus: 'active_trial',
    paymentStatus: 'TRIAL',
    subscriptionStatus: 'trialing',
    selectedPlanKey: COMMERCIAL_PLAN_KEYS.LITE,
    trialEndsAt: future,
  });

  assert.equal(policy.accessState, 'trial');
  assert.equal(policy.planKey, COMMERCIAL_PLAN_KEYS.PADRAO);
  assert.equal(policy.moduleKeys.has('vendas'), true);
  assert.equal(policy.moduleKeys.has('atendimento'), true);
  assert.equal(policy.moduleKeys.has('webscraping'), true);
  assert.equal(policy.moduleKeys.has('gerencial'), true);
});

test('active/PAID releases modules by selected plan', () => {
  const lite = resolveCompanyModuleAccessPolicy({
    isActive: true,
    paymentStatus: 'PAID',
    subscriptionStatus: 'active',
    selectedPlanKey: COMMERCIAL_PLAN_KEYS.LITE,
  });
  assert.equal(lite.moduleKeys.has('vendas'), true);
  assert.equal(lite.moduleKeys.has('webscraping'), true);
  assert.equal(lite.moduleKeys.has('atendimento'), false);
  assert.equal(lite.moduleKeys.has('gerencial'), false);
  assert.equal(lite.moduleKeys.has('cadastro'), false);

  const melhor = resolveCompanyModuleAccessPolicy({
    isActive: true,
    paymentStatus: 'PAID',
    subscriptionStatus: 'active',
    selectedPlanKey: COMMERCIAL_PLAN_KEYS.MELHOR,
  });
  assert.equal(melhor.moduleKeys.has('atendimento'), true);
  assert.equal(melhor.moduleKeys.has('vendas'), true);
  assert.equal(melhor.moduleKeys.has('webscraping'), true);
  assert.equal(melhor.moduleKeys.has('gerencial'), true);
  assert.equal(melhor.moduleKeys.has('cadastro'), true);
  assert.equal(melhor.moduleKeys.has('bot_ia'), true);
});

test('commercial plan catalog keeps new HBX names and premium entitlements', () => {
  assert.equal(getCommercialPlanTitle(COMMERCIAL_PLAN_KEYS.LITE), 'HBX List');
  assert.equal(getCommercialPlanTitle(COMMERCIAL_PLAN_KEYS.PADRAO), 'HBX Lead Plus');
  assert.equal(getCommercialPlanTitle(COMMERCIAL_PLAN_KEYS.MELHOR), 'HBX Full — Bot e IA');

  assert.equal(COMMERCIAL_PLAN_ENTITLEMENT_KEYS[COMMERCIAL_PLAN_KEYS.LITE].includes(COMMERCIAL_ENTITLEMENT_KEYS.NIGHT_FACTORY), false);
  assert.equal(COMMERCIAL_PLAN_ENTITLEMENT_KEYS[COMMERCIAL_PLAN_KEYS.PADRAO].includes(COMMERCIAL_ENTITLEMENT_KEYS.NIGHT_FACTORY), true);
  assert.equal(COMMERCIAL_PLAN_ENTITLEMENT_KEYS[COMMERCIAL_PLAN_KEYS.MELHOR].includes(COMMERCIAL_ENTITLEMENT_KEYS.NIGHT_FACTORY), true);
  assert.equal(COMMERCIAL_PLAN_ENTITLEMENT_KEYS[COMMERCIAL_PLAN_KEYS.PADRAO].includes(COMMERCIAL_ENTITLEMENT_KEYS.BOT_IA), false);
  assert.equal(COMMERCIAL_PLAN_ENTITLEMENT_KEYS[COMMERCIAL_PLAN_KEYS.MELHOR].includes(COMMERCIAL_ENTITLEMENT_KEYS.BOT_IA), true);
});

test('MANUAL/premiumAccess releases selected plan or padrao fallback', () => {
  const manualLite = resolveCompanyModuleAccessPolicy({
    isActive: true,
    paymentStatus: 'MANUAL',
    subscriptionStatus: 'manual',
    selectedPlanKey: COMMERCIAL_PLAN_KEYS.LITE,
  });
  assert.equal(manualLite.accessState, 'manual');
  assert.equal(manualLite.moduleKeys.has('vendas'), true);
  assert.equal(manualLite.moduleKeys.has('webscraping'), true);
  assert.equal(manualLite.moduleKeys.has('atendimento'), false);

  const fallback = resolveCompanyModuleAccessPolicy({
    isActive: true,
    paymentStatus: 'PENDING',
    subscriptionStatus: 'past_due',
    premiumAccess: true,
    selectedPlanKey: null,
  });
  assert.equal(fallback.accessState, 'manual');
  assert.equal(fallback.planKey, COMMERCIAL_PLAN_KEYS.PADRAO);
  assert.equal(fallback.moduleKeys.has('atendimento'), true);
  assert.equal(fallback.moduleKeys.has('vendas'), true);
  assert.equal(fallback.moduleKeys.has('webscraping'), true);
  assert.equal(fallback.moduleKeys.has('gerencial'), true);
});

test('platform_infra company does not receive commercial modules', () => {
  const policy = resolveCompanyModuleAccessPolicy({
    companyKind: COMPANY_KIND_PLATFORM_INFRA,
    isActive: false,
    onboardingStatus: 'pending_checkout',
    paymentStatus: 'PENDING',
    subscriptionStatus: 'pending_checkout',
    selectedPlanKey: null,
  });

  assert.equal(policy.accessState, 'blocked');
  assert.equal(policy.active, false);
  assert.equal(policy.pendingCheckout, false);
  assert.equal(policy.moduleKeys.has('vendas'), false);
  assert.equal(policy.moduleKeys.has('webscraping'), false);
  assert.equal(policy.blockedCode, 'platform_infra_company');
});

test('HBX tenant follows normal manual/premium module policy without slug privilege', () => {
  const policy = resolveCompanyModuleAccessPolicy({
    companyKind: COMPANY_KIND_TENANT,
    slug: 'hbx',
    isActive: true,
    paymentStatus: 'MANUAL',
    subscriptionStatus: 'manual',
    premiumAccess: true,
    selectedPlanKey: COMMERCIAL_PLAN_KEYS.LITE,
  });

  assert.equal(policy.accessState, 'manual');
  assert.equal(policy.active, true);
  assert.equal(policy.planKey, COMMERCIAL_PLAN_KEYS.LITE);
  assert.equal(policy.moduleKeys.has('vendas'), true);
  assert.equal(policy.moduleKeys.has('webscraping'), true);
  assert.equal(policy.moduleKeys.has('atendimento'), false);
});

test('billingExempt company is released as exempt with plan modules and no billing block', () => {
  const policy = resolveCompanyModuleAccessPolicy({
    companyKind: COMPANY_KIND_TENANT,
    isActive: true,
    billingExempt: true,
    paymentStatus: 'PENDING',
    subscriptionStatus: 'pending_checkout',
    selectedPlanKey: COMMERCIAL_PLAN_KEYS.PADRAO,
  });

  assert.equal(policy.accessState, 'exempt');
  assert.equal(policy.active, true);
  assert.equal(policy.pendingCheckout, false);
  assert.equal(policy.blockedCode, null);
  assert.equal(policy.moduleKeys.has('vendas'), true);
  assert.equal(policy.moduleKeys.has('atendimento'), true);
});

test('expired/canceled blocks modules', () => {
  const expired = resolveCompanyModuleAccessPolicy({
    isActive: false,
    paymentStatus: 'EXPIRED',
    subscriptionStatus: 'expired',
    selectedPlanKey: COMMERCIAL_PLAN_KEYS.PADRAO,
  });

  assert.equal(expired.active, false);
  assert.equal(expired.pendingCheckout, false);
  assert.equal(expired.blockedCode, 'subscription_inactive');
  assert.deepEqual([...expired.moduleKeys], []);
});

test('billing block reason is visible for ADMIN and neutral for seller, keeping the block', () => {
  const billingBlock = {
    blockedReason: 'Plano inativo. Regularize o acesso para liberar este modulo.',
    blockedCode: 'subscription_inactive',
    criticalEngine: 'payment',
  };

  const adminView = presentModuleBlockForRole('ADMIN', billingBlock);
  assert.deepEqual(adminView, billingBlock);

  const sellerView = presentModuleBlockForRole('USER', billingBlock);
  assert.equal(sellerView.blockedCode, 'company_access_paused');
  assert.equal(sellerView.criticalEngine, null);
  assert.notEqual(sellerView.blockedReason, null);
  assert.equal(/plano|pagamento|regularize|cobranca|checkout/i.test(String(sellerView.blockedReason)), false);
});

test('pending_checkout and plan_required are neutralized for sellers', () => {
  const pendingView = presentModuleBlockForRole('USER', {
    blockedReason: 'Finalize a contratação para liberar os módulos comerciais.',
    blockedCode: 'pending_checkout',
    criticalEngine: 'payment',
  });
  assert.equal(pendingView.blockedCode, 'company_access_paused');
  assert.equal(pendingView.criticalEngine, null);

  const planRequiredView = presentModuleBlockForRole('USER', {
    blockedReason: 'Este modulo nao faz parte do plano atual.',
    blockedCode: 'plan_required',
    criticalEngine: 'payment',
  });
  assert.equal(planRequiredView.blockedCode, 'module_not_enabled');
  assert.equal(planRequiredView.criticalEngine, null);
  assert.equal(/plano|pagamento/i.test(String(planRequiredView.blockedReason)), false);
});

test('non-billing blocks pass through unchanged for sellers', () => {
  const userBlocked = {
    blockedReason: 'Usuario sem permissao para este modulo.',
    blockedCode: 'user_module_blocked',
    criticalEngine: null,
  };
  assert.deepEqual(presentModuleBlockForRole('USER', userBlocked), userBlocked);

  const whatsappBlocked = {
    blockedReason: 'Configure WhatsApp/Meta para liberar Atendimento.',
    blockedCode: 'whatsapp_missing',
    criticalEngine: 'whatsapp',
  };
  assert.deepEqual(presentModuleBlockForRole('USER', whatsappBlocked), whatsappBlocked);

  const unblocked = { blockedReason: null, blockedCode: null, criticalEngine: null };
  assert.deepEqual(presentModuleBlockForRole('USER', unblocked), unblocked);
});

test('seller has ONE rule on any surface: Vendas+Radar default, Atendimento grantable, admin areas blocked', () => {
  const service = new ModulesService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any) as any;
  const seller = { role: 'USER', isSystemMaster: false };

  // default ligado em qualquer superficie (desktop = mobile)
  assert.equal(service.defaultUserModuleAllowed(seller, 'vendas', {}), true);
  assert.equal(service.defaultUserModuleAllowed(seller, 'webscraping', {}), true);
  assert.equal(service.defaultUserModuleAllowed(seller, 'webscraping', { mobileRoute: true }), true);

  // atendimento e elegivel (gerencial pode ligar), mas nao vem por padrao
  assert.equal(service.canUseAdminOnlyModule(seller, 'atendimento', {}), true);
  assert.equal(service.defaultUserModuleAllowed(seller, 'atendimento', {}), false);

  // areas do contratante seguem bloqueadas para vendedor
  assert.equal(service.canUseAdminOnlyModule(seller, 'gerencial', { mobileRoute: true }), false);
  assert.equal(service.canUseAdminOnlyModule(seller, 'financeiro', { mobileRoute: true }), false);
  assert.equal(service.canUseAdminOnlyModule(seller, 'cadastro', { mobileRoute: true }), false);
});

test('HBX tenant seller uses the same defaults as a client seller', () => {
  const service = new ModulesService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any) as any;
  const seller = { role: 'USER', isSystemMaster: false };
  const company = { companyKind: COMPANY_KIND_TENANT, slug: 'hbx' };

  assert.equal(service.resolveAccessGovernor(seller, company), COMPANY_KIND_TENANT);
  assert.equal(service.defaultUserModuleAllowed(seller, 'vendas', {}, company), true);
  assert.equal(service.defaultUserModuleAllowed(seller, 'webscraping', {}, company), true);
  assert.equal(service.defaultUserModuleAllowed(seller, 'webscraping', { mobileRoute: true }, company), true);
});

test('seller access governance blocks platform_infra and keeps tenant admin boundary', () => {
  const service = new ModulesService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any) as any;

  assert.doesNotThrow(() => service.assertCanGovernSellerAccess({
    actor: { role: 'ADMIN', companyId: 10 },
    actorCompanyId: 10,
    isSystemMaster: false,
    targetUser: { id: 2, companyId: 10, role: 'USER' },
    targetCompany: { id: 10, companyKind: COMPANY_KIND_TENANT, slug: 'cliente-a' },
  }));

  assert.throws(() => service.assertCanGovernSellerAccess({
    actor: { role: 'ADMIN', companyId: 10 },
    actorCompanyId: 10,
    isSystemMaster: false,
    targetUser: { id: 3, companyId: 20, role: 'USER' },
    targetCompany: { id: 20, companyKind: COMPANY_KIND_TENANT, slug: 'cliente-b' },
  }));

  assert.throws(() => service.assertCanGovernSellerAccess({
    actor: { role: 'USERMASTER', isSystemMaster: true },
    actorCompanyId: null,
    isSystemMaster: true,
    targetUser: { id: 3, companyId: 20, role: 'USER' },
    targetCompany: { id: 20, companyKind: COMPANY_KIND_PLATFORM_INFRA, slug: 'platform-engine' },
  }));

  assert.doesNotThrow(() => service.assertCanGovernSellerAccess({
    actor: { role: 'USERMASTER', isSystemMaster: true },
    actorCompanyId: null,
    isSystemMaster: true,
    targetUser: { id: 4, companyId: 30, role: 'USER' },
    targetCompany: { id: 30, companyKind: COMPANY_KIND_TENANT, slug: 'hbx' },
  }));
});
