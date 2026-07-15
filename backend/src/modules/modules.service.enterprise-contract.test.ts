import test from 'node:test';
import assert from 'node:assert/strict';
import { ModulesService } from './modules.service';
import { effectiveCompanyModuleEnabled } from './module-access-policy';

// MASTER-REFAB S8 (10/07) — "chavinha" contrato empresarial: POST /modules/master/company/:id/
// enterprise-contract junta em 1 gesto o tipo de conta (S6), a liberação full de módulos
// (teto W1), o valor fixo combinado (finance-settings) e o teto diário anti-scraper (S3).
// Mocks crus de Prisma/UsersService/MasterContextService — mesmo padrão de
// master-provisioning.service.test.ts (instancia o service real, injeta dependências fake).

type FakeCompanyRow = {
  id: number;
  companyKind?: string | null;
  accountType?: string | null;
  monthlyValueOverride?: number | null;
  dailyDeliveryCapOverride?: number | null;
};

type FakeModuleRow = { enabled: boolean; masterEnabled: boolean };

// 3 módulos companyAssignable de mentira (suficiente pra provar "libera FULL" sem arrastar o
// catálogo real de 14 módulos do structural-defaults.json).
function buildAssignableModules() {
  return [
    { id: 1, key: 'vendas' },
    { id: 2, key: 'webscraping' },
    { id: 3, key: 'bot' },
  ];
}

function buildService(companyRow: FakeCompanyRow) {
  const supportActions: any[] = [];
  const companyModuleRows = new Map<string, FakeModuleRow>();
  const companyModuleUpsertCalls: any[] = [];
  let company: FakeCompanyRow = { ...companyRow };

  const prisma: any = {
    company: {
      findUnique: async () => ({ ...company }),
      update: async ({ data }: any) => {
        company = { ...company, ...data };
        return { ...company };
      },
    },
    systemModule: {
      findMany: async () => buildAssignableModules(),
      // ensureDefaultSystemModules (chamado no início do método) faz upsert/updateMany do
      // catálogo default inteiro — noop aqui, não é o que este teste prova.
      upsert: async () => ({}),
      updateMany: async () => ({ count: 0 }),
    },
    companyModule: {
      upsert: async ({ where, update, create }: any) => {
        const key = `${where.companyId_moduleId.companyId}:${where.companyId_moduleId.moduleId}`;
        const existing = companyModuleRows.get(key);
        const row: FakeModuleRow = existing
          ? { enabled: Boolean(update.enabled), masterEnabled: Boolean(update.masterEnabled) }
          : { enabled: Boolean(create.enabled), masterEnabled: Boolean(create.masterEnabled) };
        companyModuleRows.set(key, row);
        companyModuleUpsertCalls.push({ where, update, create });
        return row;
      },
    },
    // ensureMasterBillingRuntimeSchema (cache por processo) roda $executeRawUnsafe em série na
    // 1ª chamada do processo de teste inteiro — precisa existir mesmo que nunca seja inspecionado.
    $executeRawUnsafe: async () => undefined,
  };

  const usersService: any = {
    findById: async (id: number) => ({ id, isSystemMaster: true, companyId: null }),
  };
  const masterContextService: any = {
    resolveRuntimeContext: async () => ({ effectiveCompanyId: null, masterContext: { active: false } }),
    registerSupportAction: async (input: any) => {
      supportActions.push(input);
    },
  };

  const service = new ModulesService(
    prisma,
    {} as any, // integrationConnectionsService — não usado neste caminho
    usersService,
    masterContextService,
    {} as any, // companyOperationalStatus
    {} as any, // commercialUsageLimits
    {} as any, // webwhatsBridge
    {} as any, // creditWallet
  );

  return { service, companyModuleRows, companyModuleUpsertCalls, supportActions, getCompany: () => company };
}

const MASTER_USER_ID = 1;
const COMPANY_ID = 501;

test('liga accountType enterprise, libera módulos full (effective=true) e grava valor+teto informados', async () => {
  const { service, companyModuleRows, getCompany } = buildService({
    id: COMPANY_ID,
    companyKind: 'tenant',
    accountType: 'credit',
    monthlyValueOverride: null,
    dailyDeliveryCapOverride: null,
  });

  const result = await service.setCompanyEnterpriseContractByMaster(MASTER_USER_ID, COMPANY_ID, {
    monthlyValue: 1500,
    dailyDeliveryCap: 300,
  });

  assert.equal(result.accountType, 'enterprise');
  assert.equal(result.modulesOn, 3);
  assert.equal(result.monthlyValueOverride, 1500);
  assert.equal(result.dailyDeliveryCap, 300);

  assert.equal(getCompany().accountType, 'enterprise');
  assert.equal(getCompany().monthlyValueOverride, 1500);
  assert.equal(getCompany().dailyDeliveryCapOverride, 300);

  assert.equal(companyModuleRows.size, 3);
  for (const row of companyModuleRows.values()) {
    assert.equal(effectiveCompanyModuleEnabled(row), true);
  }
});

test('caps/valor ausentes NÃO mexem no que já estava gravado (só liga módulos+tipo)', async () => {
  const { service, getCompany } = buildService({
    id: COMPANY_ID,
    companyKind: 'tenant',
    accountType: 'credit',
    monthlyValueOverride: 777,
    dailyDeliveryCapOverride: 250,
  });

  const result = await service.setCompanyEnterpriseContractByMaster(MASTER_USER_ID, COMPANY_ID, {});

  assert.equal(result.accountType, 'enterprise');
  assert.equal(result.monthlyValueOverride, 777);
  assert.equal(result.dailyDeliveryCap, 250);
  assert.equal(getCompany().monthlyValueOverride, 777);
  assert.equal(getCompany().dailyDeliveryCapOverride, 250);
});

test('dailyDeliveryCap=0 explícito zera o teto (sem teto só nesta empresa) — 0 != ausente', async () => {
  const { service, getCompany } = buildService({
    id: COMPANY_ID,
    companyKind: 'tenant',
    accountType: 'credit',
    monthlyValueOverride: null,
    dailyDeliveryCapOverride: null,
  });

  const result = await service.setCompanyEnterpriseContractByMaster(MASTER_USER_ID, COMPANY_ID, {
    dailyDeliveryCap: 0,
  });

  assert.equal(result.dailyDeliveryCap, 0);
  assert.equal(getCompany().dailyDeliveryCapOverride, 0);
});

test('idempotente — 2ª chamada não duplica CompanyModule nem regrava account-type', async () => {
  const { service, companyModuleRows, companyModuleUpsertCalls, supportActions, getCompany } = buildService({
    id: COMPANY_ID,
    companyKind: 'tenant',
    accountType: 'credit',
    monthlyValueOverride: null,
    dailyDeliveryCapOverride: null,
  });

  const first = await service.setCompanyEnterpriseContractByMaster(MASTER_USER_ID, COMPANY_ID, {
    monthlyValue: 999,
    dailyDeliveryCap: 400,
  });
  const second = await service.setCompanyEnterpriseContractByMaster(MASTER_USER_ID, COMPANY_ID, {
    monthlyValue: 999,
    dailyDeliveryCap: 400,
  });

  assert.deepEqual(first, second);
  assert.equal(companyModuleRows.size, 3, 'upsert é idempotente — 3 módulos continuam 3 linhas, não 6');
  assert.equal(companyModuleUpsertCalls.length, 6, '3 módulos x 2 chamadas ao endpoint = 6 upserts emitidos');
  assert.equal(getCompany().accountType, 'enterprise');

  // setCompanyAccountTypeByMaster só audita quando o valor MUDA — a 2ª chamada já era
  // enterprise e retorna cedo sem novo log; o log do próprio contrato roda 1x por chamada.
  const accountTypeLogs = supportActions.filter((entry) => entry.action === 'COMPANY_ACCOUNT_TYPE_SET');
  const contractLogs = supportActions.filter((entry) => entry.action === 'COMPANY_ENTERPRISE_CONTRACT_ACTIVATED');
  assert.equal(accountTypeLogs.length, 1);
  assert.equal(contractLogs.length, 2);
});

test('empresa de infraestrutura não recebe contrato empresarial (mesmo guard do account-type)', async () => {
  const { service } = buildService({
    id: COMPANY_ID,
    companyKind: 'platform_infra',
    accountType: 'credit',
  });

  await assert.rejects(
    () => service.setCompanyEnterpriseContractByMaster(MASTER_USER_ID, COMPANY_ID, {}),
    /infraestrutura/,
  );
});
