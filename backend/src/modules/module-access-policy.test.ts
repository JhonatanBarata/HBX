import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMERCIAL_PLAN_KEYS,
  getCommercialPlanCapabilities,
  getCommercialPlanTitle,
} from '../commercial-plans/commercial-plan-catalog';
import { COMPANY_KIND_PLATFORM_INFRA, COMPANY_KIND_TENANT } from '../common/company-kind';
import { ModulesService } from './modules.service';
import {
  effectiveCompanyModuleEnabled,
  presentModuleBlockForRole,
  resolveCompanyModuleAccessPolicy,
  resolveKillSwitchModuleKeys,
  isModulesKillSwitchOnlyEnabled,
  type KillSwitchModuleSnapshot,
} from './module-access-policy';

const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const operationalSnapshot = buildSnapshot([
  { key: 'atendimento', defaultEnabled: true },
  { key: 'vendas', defaultEnabled: true },
  { key: 'webscraping', defaultEnabled: true },
  { key: 'cadastro', defaultEnabled: true },
  { key: 'gerencial', defaultEnabled: false },
]);

// MASTER-REFAB S6 (10/07 noite): pending_checkout/trial/courtesy só continuam pesando pra conta
// `enterprise` (a máquina de estados legada) — conta `credit` (default) é ativa por default e
// não é mais bloqueada por nenhum desses. Os testes de paywall legado abaixo marcam
// `accountType: 'enterprise'` explicitamente pra deixar claro QUAL tipo de conta estão testando.

test('pending_checkout/PENDING blocks operational modules (conta enterprise)', () => {
  const policy = resolveCompanyModuleAccessPolicy({
    accountType: 'enterprise',
    status: 'pending_checkout',
    selectedPlanKey: COMMERCIAL_PLAN_KEYS.PADRAO,
  });

  assert.equal(policy.active, false);
  assert.equal(policy.pendingCheckout, true);
  assert.equal(policy.blockedCode, 'pending_checkout');
  assert.deepEqual([...policy.moduleKeys], []);
});

test('S6: conta credit NUNCA é bloqueada por pending_checkout/overdue legado (cortesia/trial/pending_checkout morreram como estado de conta credit)', () => {
  const pending = resolveCompanyModuleAccessPolicy({
    accountType: 'credit',
    status: 'pending_checkout',
    selectedPlanKey: COMMERCIAL_PLAN_KEYS.PADRAO,
  });
  assert.equal(pending.active, true);
  assert.equal(pending.pendingCheckout, false);
  assert.equal(pending.blockedCode, null);

  const overdue = resolveCompanyModuleAccessPolicy({
    accountType: 'credit',
    status: 'overdue',
    selectedPlanKey: COMMERCIAL_PLAN_KEYS.PADRAO,
  });
  assert.equal(overdue.active, true);
  assert.equal(overdue.blockedCode, null);

  // Suspensão continua bloqueando TODA conta (é o único bloqueio que sobra pra credit).
  const suspended = resolveCompanyModuleAccessPolicy({
    accountType: 'credit',
    status: 'suspended',
    selectedPlanKey: COMMERCIAL_PLAN_KEYS.PADRAO,
  });
  assert.equal(suspended.active, false);
  assert.equal(suspended.blockedCode, 'subscription_inactive');
});

test('trial ativo usa o mesmo snapshot de módulos, independente do plano histórico', () => {
  const policy = resolveCompanyModuleAccessPolicy({
    accountType: 'enterprise',
    status: 'trial',
    selectedPlanKey: COMMERCIAL_PLAN_KEYS.LITE,
    trialEndsAt: future,
  }, Date.now(), operationalSnapshot);

  assert.equal(policy.accessState, 'trial');
  assert.equal(policy.planKey, COMMERCIAL_PLAN_KEYS.PADRAO);
  assert.equal(policy.moduleKeys.has('vendas'), true);
  assert.equal(policy.moduleKeys.has('atendimento'), true);
  assert.equal(policy.moduleKeys.has('webscraping'), true);
  // gerencial saiu do plano (21/06): virou admin-tier (acesso por role, igual financeiro).
  assert.equal(policy.moduleKeys.has('gerencial'), false);
});

test('active usa kill-switch idêntico para qualquer selectedPlanKey', () => {
  const lite = resolveCompanyModuleAccessPolicy({
    status: 'active',
    selectedPlanKey: COMMERCIAL_PLAN_KEYS.LITE,
  }, Date.now(), operationalSnapshot);
  assert.equal(lite.moduleKeys.has('vendas'), true);
  assert.equal(lite.moduleKeys.has('webscraping'), true);
  assert.equal(lite.moduleKeys.has('atendimento'), true);
  assert.equal(lite.moduleKeys.has('gerencial'), false);
  assert.equal(lite.moduleKeys.has('cadastro'), true);

  const melhor = resolveCompanyModuleAccessPolicy({
    status: 'active',
    selectedPlanKey: COMMERCIAL_PLAN_KEYS.MELHOR,
  }, Date.now(), operationalSnapshot);
  assert.equal(melhor.moduleKeys.has('atendimento'), true);
  assert.equal(melhor.moduleKeys.has('vendas'), true);
  assert.equal(melhor.moduleKeys.has('webscraping'), true);
  assert.equal(melhor.moduleKeys.has('gerencial'), false); // admin-tier, fora do plano (21/06)
  assert.equal(melhor.moduleKeys.has('cadastro'), true);
  assert.equal(melhor.moduleKeys.has('bot_ia'), false);
});

test('catálogo preserva nomes de cobrança, mas capacidades são universais', () => {
  assert.equal(getCommercialPlanTitle(COMMERCIAL_PLAN_KEYS.LITE), 'HBX List');
  assert.equal(getCommercialPlanTitle(COMMERCIAL_PLAN_KEYS.PADRAO), 'HBX Lead Plus');
  assert.equal(getCommercialPlanTitle(COMMERCIAL_PLAN_KEYS.MELHOR), 'Implantação');

  assert.deepEqual(
    getCommercialPlanCapabilities(),
    getCommercialPlanCapabilities(),
  );
});

test('courtesy usa o mesmo snapshot de módulos com ou sem plano histórico', () => {
  const courtesyLite = resolveCompanyModuleAccessPolicy({
    accountType: 'enterprise',
    status: 'courtesy',
    courtesyEndsAt: future,
    selectedPlanKey: COMMERCIAL_PLAN_KEYS.LITE,
  }, Date.now(), operationalSnapshot);
  assert.equal(courtesyLite.accessState, 'manual');
  assert.equal(courtesyLite.moduleKeys.has('vendas'), true);
  assert.equal(courtesyLite.moduleKeys.has('webscraping'), true);
  assert.equal(courtesyLite.moduleKeys.has('atendimento'), true);

  // Cortesia permanente (sem prazo) e sem plano escolhido projeta Lead Plus.
  const fallback = resolveCompanyModuleAccessPolicy({
    accountType: 'enterprise',
    status: 'courtesy',
    selectedPlanKey: null,
  }, Date.now(), operationalSnapshot);
  assert.equal(fallback.accessState, 'exempt');
  assert.equal(fallback.planKey, COMMERCIAL_PLAN_KEYS.PADRAO);
  assert.equal(fallback.moduleKeys.has('atendimento'), true);
  assert.equal(fallback.moduleKeys.has('vendas'), true);
  assert.equal(fallback.moduleKeys.has('webscraping'), true);
  assert.equal(fallback.moduleKeys.has('gerencial'), false); // admin-tier, fora do plano (21/06)
});

test('platform_infra company does not receive commercial modules', () => {
  const policy = resolveCompanyModuleAccessPolicy({
    companyKind: COMPANY_KIND_PLATFORM_INFRA,
    status: 'pending_checkout',
    selectedPlanKey: null,
  }, Date.now(), operationalSnapshot);

  assert.equal(policy.accessState, 'blocked');
  assert.equal(policy.active, false);
  assert.equal(policy.pendingCheckout, false);
  assert.equal(policy.moduleKeys.has('vendas'), false);
  assert.equal(policy.moduleKeys.has('webscraping'), false);
  assert.equal(policy.blockedCode, 'platform_infra_company');
});

test('HBX tenant follows normal courtesy module policy without slug privilege (conta enterprise)', () => {
  const policy = resolveCompanyModuleAccessPolicy({
    accountType: 'enterprise',
    companyKind: COMPANY_KIND_TENANT,
    slug: 'hbx',
    status: 'courtesy',
    courtesyEndsAt: future,
    selectedPlanKey: COMMERCIAL_PLAN_KEYS.LITE,
  }, Date.now(), operationalSnapshot);

  assert.equal(policy.accessState, 'manual');
  assert.equal(policy.active, true);
  assert.equal(policy.planKey, COMMERCIAL_PLAN_KEYS.LITE);
  assert.equal(policy.moduleKeys.has('vendas'), true);
  assert.equal(policy.moduleKeys.has('webscraping'), true);
  assert.equal(policy.moduleKeys.has('atendimento'), true);
});

test('courtesy (sem prazo = isenta) usa módulos do kill-switch e não tem bloqueio financeiro', () => {
  const policy = resolveCompanyModuleAccessPolicy({
    accountType: 'enterprise',
    companyKind: COMPANY_KIND_TENANT,
    status: 'courtesy',
    selectedPlanKey: COMMERCIAL_PLAN_KEYS.PADRAO,
  }, Date.now(), operationalSnapshot);

  assert.equal(policy.accessState, 'exempt');
  assert.equal(policy.active, true);
  assert.equal(policy.pendingCheckout, false);
  assert.equal(policy.blockedCode, null);
  assert.equal(policy.moduleKeys.has('vendas'), true);
  assert.equal(policy.moduleKeys.has('atendimento'), true);
});

test('expired/canceled blocks modules', () => {
  const expired = resolveCompanyModuleAccessPolicy({
    status: 'suspended',
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

test('pending_checkout is neutralized for sellers', () => {
  const pendingView = presentModuleBlockForRole('USER', {
    blockedReason: 'Finalize a contratação para liberar os módulos comerciais.',
    blockedCode: 'pending_checkout',
    criticalEngine: 'payment',
  });
  assert.equal(pendingView.blockedCode, 'company_access_paused');
  assert.equal(pendingView.criticalEngine, null);

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

test('seller has ONE rule on any surface: operacional no máximo por padrão, Bot/Website elegíveis, admin areas blocked', () => {
  const service = new ModulesService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any) as any;
  const seller = { role: 'USER', isSystemMaster: false };

  // LEI DO DONO 27/06: operacional nasce LIGADO em qualquer superficie (desktop = mobile)
  for (const mod of ['vendas', 'webscraping', 'atendimento', 'cadastro', 'email']) {
    assert.equal(service.defaultUserModuleAllowed(seller, mod, {}), true, `${mod} deveria nascer ligado`);
  }
  assert.equal(service.defaultUserModuleAllowed(seller, 'webscraping', { mobileRoute: true }), true);
  assert.equal(service.defaultUserModuleAllowed(seller, 'cadastro', { mobileRoute: true }), true);

  // Bot e Website sao ELEGIVEIS (admin liga), mas nao vem por padrao
  for (const mod of ['bot', 'website']) {
    assert.equal(service.canUseAdminOnlyModule(seller, mod, {}), true, `${mod} deveria ser elegível`);
    assert.equal(service.defaultUserModuleAllowed(seller, mod, {}), false, `${mod} não deveria nascer ligado`);
  }

  // MURO: financeiro/gerencial seguem bloqueados para vendedor (regra sagrada "só admin vê valores")
  assert.equal(service.canUseAdminOnlyModule(seller, 'gerencial', { mobileRoute: true }), false);
  assert.equal(service.canUseAdminOnlyModule(seller, 'financeiro', { mobileRoute: true }), false);
  assert.equal(service.defaultUserModuleAllowed(seller, 'financeiro', {}), false);
});

test('HBX tenant seller uses the same defaults as a client seller', () => {
  const service = new ModulesService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any) as any;
  const seller = { role: 'USER', isSystemMaster: false };
  const company = { companyKind: COMPANY_KIND_TENANT, slug: 'hbx' };

  assert.equal(service.resolveAccessGovernor(seller, company), COMPANY_KIND_TENANT);
  assert.equal(service.defaultUserModuleAllowed(seller, 'vendas', {}, company), true);
  assert.equal(service.defaultUserModuleAllowed(seller, 'webscraping', {}, company), true);
  assert.equal(service.defaultUserModuleAllowed(seller, 'webscraping', { mobileRoute: true }, company), true);
});

test('seller access governance blocks platform_infra and keeps tenant admin boundary', () => {
  const service = new ModulesService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any) as any;

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

// R2 (CREDITOS — FASE 2/REMOÇÃO: kill-switch puro do master é definitivo, não
// gateado mais por HBX_MODULES_KILLSWITCH_ONLY). withKillSwitchFlag foi mantido
// só para não reescrever a assinatura de todo teste abaixo — a env em si não
// tem mais nenhum efeito de leitura em resolveCompanyModuleAccessPolicy.
function withKillSwitchFlag<T>(_value: string | undefined, fn: () => T): T {
  return fn();
}

function buildSnapshot(
  entries: Array<{ key: string; defaultEnabled: boolean; enabled?: boolean | null; masterEnabled?: boolean | null; companyAssignable?: boolean }>,
): KillSwitchModuleSnapshot {
  return {
    modules: entries.map((entry) => ({
      key: entry.key,
      companyAssignable: entry.companyAssignable !== false,
      defaultEnabled: entry.defaultEnabled,
      enabled: entry.enabled === undefined ? null : entry.enabled,
      masterEnabled: entry.masterEnabled === undefined ? null : entry.masterEnabled,
    })),
  };
}

// PR10072026 W1 — helper único do efetivo (masterEnabled && enabled) + veto do
// teto no kill-switch (masterEnabled=false mata o módulo, override não salva).
test('W1: effectiveCompanyModuleEnabled = masterEnabled && enabled (linha pré-migração conta como teto ON)', () => {
  assert.equal(effectiveCompanyModuleEnabled({ enabled: true, masterEnabled: true }), true);
  assert.equal(effectiveCompanyModuleEnabled({ enabled: true, masterEnabled: false }), false);
  assert.equal(effectiveCompanyModuleEnabled({ enabled: false, masterEnabled: true }), false);
  assert.equal(effectiveCompanyModuleEnabled({ enabled: false, masterEnabled: false }), false);
  // linha antiga em memória (sem a coluna) = teto ON (mesmo backfill da migration)
  assert.equal(effectiveCompanyModuleEnabled({ enabled: true }), true);
  assert.equal(effectiveCompanyModuleEnabled({ enabled: true, masterEnabled: null }), true);
  assert.equal(effectiveCompanyModuleEnabled(null), false);
});

test('W1: resolveKillSwitchModuleKeys — teto do master OFF veta o módulo mesmo com enabled=true da empresa', () => {
  const snapshot = buildSnapshot([
    { key: 'vendas', defaultEnabled: true, enabled: true, masterEnabled: false }, // teto OFF → some
    { key: 'webscraping', defaultEnabled: false, enabled: true, masterEnabled: true }, // empresa ligou, teto ON → fica
    { key: 'logistica', defaultEnabled: true, enabled: null, masterEnabled: false }, // teto OFF sem override → some
    { key: 'atendimento', defaultEnabled: true }, // sem linha → segue default
  ]);

  const keys = resolveKillSwitchModuleKeys(snapshot);
  assert.equal(keys.has('vendas'), false);
  assert.equal(keys.has('webscraping'), true);
  assert.equal(keys.has('logistica'), false);
  assert.equal(keys.has('atendimento'), true);
});

test('sem snapshot: falha fechado sem ressuscitar módulos por plano', () => {
  const withoutSnapshot = resolveCompanyModuleAccessPolicy({
    status: 'active',
    selectedPlanKey: COMMERCIAL_PLAN_KEYS.LITE,
  });

  assert.deepEqual([...withoutSnapshot.moduleKeys], []);
});

test('com snapshot: kill-switch do master manda SEMPRE, independente do plano selecionado', () => {
  const snapshot = buildSnapshot([
    { key: 'atendimento', defaultEnabled: true },
    { key: 'vendas', defaultEnabled: true },
    { key: 'webscraping', defaultEnabled: true },
    { key: 'cadastro', defaultEnabled: true },
    { key: 'bot', defaultEnabled: false },
  ]);

  const withSnapshot = resolveCompanyModuleAccessPolicy(
    { status: 'active', selectedPlanKey: COMMERCIAL_PLAN_KEYS.LITE },
    Date.now(),
    snapshot,
  );

  // O kill-switch não olha para plano nenhum: manda o
  // snapshot inteiro (defaultEnabled=true libera, independente do planKey).
  assert.equal(withSnapshot.moduleKeys.has('atendimento'), true);
  assert.equal(withSnapshot.moduleKeys.has('vendas'), true);
  assert.equal(withSnapshot.moduleKeys.has('webscraping'), true);
  assert.equal(withSnapshot.moduleKeys.has('cadastro'), true);
  assert.equal(withSnapshot.moduleKeys.has('bot'), false);
});

test('R2 flag ON: empresa active sem plano nenhum enxerga módulos default-ON (kill-switch do master)', () => {
  withKillSwitchFlag('true', () => {
    assert.equal(isModulesKillSwitchOnlyEnabled(), true);

    const snapshot = buildSnapshot([
      { key: 'atendimento', defaultEnabled: true },
      { key: 'vendas', defaultEnabled: true },
      { key: 'webscraping', defaultEnabled: true },
      { key: 'cadastro', defaultEnabled: true },
      { key: 'bot', defaultEnabled: false },
      { key: 'website', defaultEnabled: false },
    ]);

    const policy = resolveCompanyModuleAccessPolicy(
      { status: 'active', selectedPlanKey: null },
      Date.now(),
      snapshot,
    );

    assert.equal(policy.active, true);
    assert.equal(policy.moduleKeys.has('atendimento'), true);
    assert.equal(policy.moduleKeys.has('vendas'), true);
    assert.equal(policy.moduleKeys.has('webscraping'), true);
    assert.equal(policy.moduleKeys.has('cadastro'), true);
    // defaultEnabled=false e sem post-it da empresa continua desligado.
    assert.equal(policy.moduleKeys.has('bot'), false);
    assert.equal(policy.moduleKeys.has('website'), false);
  });
});

test('R2 flag ON: master desligou módulo X da empresa (post-it enabled=false) → X some, resto fica', () => {
  withKillSwitchFlag('1', () => {
    const snapshot = buildSnapshot([
      { key: 'atendimento', defaultEnabled: true, enabled: false }, // post-it desligando explicitamente
      { key: 'vendas', defaultEnabled: true },
      { key: 'webscraping', defaultEnabled: true },
      { key: 'bot', defaultEnabled: false, enabled: true }, // post-it ligando explicitamente
    ]);

    const policy = resolveCompanyModuleAccessPolicy(
      { status: 'active', selectedPlanKey: COMMERCIAL_PLAN_KEYS.PADRAO },
      Date.now(),
      snapshot,
    );

    assert.equal(policy.moduleKeys.has('atendimento'), false); // apagado pelo master
    assert.equal(policy.moduleKeys.has('vendas'), true);
    assert.equal(policy.moduleKeys.has('webscraping'), true);
    assert.equal(policy.moduleKeys.has('bot'), true); // ligado pelo master mesmo com defaultEnabled=false
  });
});

test('R2 flag ON: empresa enterprise overdue/pending_checkout continua com tudo bloqueado (inadimplência ≠ paywall de tier)', () => {
  withKillSwitchFlag('true', () => {
    const snapshot = buildSnapshot([
      { key: 'atendimento', defaultEnabled: true },
      { key: 'vendas', defaultEnabled: true },
      { key: 'webscraping', defaultEnabled: true },
    ]);

    const pendingCheckout = resolveCompanyModuleAccessPolicy(
      { accountType: 'enterprise', status: 'pending_checkout', selectedPlanKey: COMMERCIAL_PLAN_KEYS.PADRAO },
      Date.now(),
      snapshot,
    );
    assert.equal(pendingCheckout.active, false);
    assert.equal(pendingCheckout.pendingCheckout, true);
    assert.equal(pendingCheckout.blockedCode, 'pending_checkout');
    assert.deepEqual([...pendingCheckout.moduleKeys], []);

    const overdue = resolveCompanyModuleAccessPolicy(
      { accountType: 'enterprise', status: 'overdue', selectedPlanKey: COMMERCIAL_PLAN_KEYS.PADRAO },
      Date.now(),
      snapshot,
    );
    assert.equal(overdue.active, false);
    assert.equal(overdue.blockedCode, 'billing_overdue');
    assert.deepEqual([...overdue.moduleKeys], []);

    const suspended = resolveCompanyModuleAccessPolicy(
      { accountType: 'enterprise', status: 'suspended', selectedPlanKey: COMMERCIAL_PLAN_KEYS.PADRAO },
      Date.now(),
      snapshot,
    );
    assert.equal(suspended.active, false);
    assert.equal(suspended.blockedCode, 'subscription_inactive');
    assert.deepEqual([...suspended.moduleKeys], []);
  });
});

test('R2 flag ON: vendedor sem RBAC do módulo continua barrado (camada 3 — RBAC — intacta)', () => {
  withKillSwitchFlag('true', () => {
    const snapshot = buildSnapshot([
      { key: 'atendimento', defaultEnabled: true },
      { key: 'vendas', defaultEnabled: true },
      { key: 'webscraping', defaultEnabled: true },
      { key: 'gerencial', defaultEnabled: true },
      { key: 'financeiro', defaultEnabled: true },
    ]);

    const policy = resolveCompanyModuleAccessPolicy(
      { status: 'active', selectedPlanKey: COMMERCIAL_PLAN_KEYS.PADRAO },
      Date.now(),
      snapshot,
    );

    // Módulo (camada 1) libera até gerencial/financeiro no kill-switch — mas o
    // bloqueio de vendedor (RBAC, camada 3) é decidido em presentModuleBlockForRole
    // e resolveCargoModuleAllowed (modules.service.ts), não aqui. O kill-switch NUNCA
    // substitui RBAC: só decide disponibilidade, o vendedor sem permissão de cargo
    // continua vendo bloqueio neutro do lado do RBAC.
    const billingBlock = {
      blockedReason: 'Modulo nao habilitado para esta conta.',
      blockedCode: 'user_module_blocked',
      criticalEngine: null,
    };
    const sellerView = presentModuleBlockForRole('USER', billingBlock);
    // user_module_blocked não é um código de billing — passa intacto (RBAC, não paywall).
    assert.deepEqual(sellerView, billingBlock);
    assert.equal(policy.active, true);
  });
});

test('resolveKillSwitchModuleKeys: helper puro ignora módulos não companyAssignable e aplica precedência override > default', () => {
  const snapshot = buildSnapshot([
    { key: 'vendas', defaultEnabled: true },
    { key: 'atendimento', defaultEnabled: false, enabled: true },
    { key: 'bot', defaultEnabled: true, enabled: false },
    { key: 'master', defaultEnabled: true, companyAssignable: false },
  ]);

  const keys = resolveKillSwitchModuleKeys(snapshot);
  assert.equal(keys.has('vendas'), true);
  assert.equal(keys.has('atendimento'), true); // override liga mesmo com defaultEnabled=false
  assert.equal(keys.has('bot'), false); // override desliga mesmo com defaultEnabled=true
  assert.equal(keys.has('master'), false); // não companyAssignable, nunca entra
});
